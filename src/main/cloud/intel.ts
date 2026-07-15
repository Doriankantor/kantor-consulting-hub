import { cloud } from './client'
import { isOnline, reportCloudResult } from './connection'
import { getDatabase } from '../db'
import { resolveActor } from './boards'
import { normalizeTag } from './tags'

// ── intelligence_sources: cloud-sourced with a local offline MIRROR (Stage 2) ──
// Third intel-side migration after known_tags (cloud/tags.ts) and workspace_boards
// (cloud/boards.ts); follows those templates EXACTLY. Cloud `intelligence_sources`
// is the single source of truth; the local SQLite `intelligence_sources` table is
// kept as an OFFLINE MIRROR (not legacy). All access is renderer → IPC → main →
// here; the renderer never touches Supabase. Service-role bypasses RLS (main is
// the trusted tier); table RLS is the backstop against the anon key.
//
// TWO TIERS OF HANDLER, treated differently:
//
// (A) PURE READS — cloud-first, mirror-fallback, sync-on-read:
//     offline → serve the mirror (no cloud attempt); else cloud read →
//     reportCloudResult(!error) → on success refresh the mirror (best-effort,
//     never fails the read) → on error serve the mirror. Never throws.
//
// (B) READ-MODIFY-WRITE — CLOUD ONLY, never the mirror. These SELECT-then-UPDATE
//     (approve path + the three analysis_json sub-object mergers + confirmImported
//     + the gate/rescore scorers). They read CLOUD, write CLOUD, then re-sync that
//     ONE row into the mirror. They must NEVER read the mirror: a stale read + a
//     cloud write silently clobbers a sibling analysis_json sub-object. Offline →
//     { ok:false, error:'Unavailable while offline' } — no local fallback. The
//     commit-2 UI lockout already disables these controls; this is the backstop.
//
// PURE WRITES — cloud write → re-sync that row into the mirror → { ok, error }.
// On cloud error: return the failure and do NOT touch the mirror.
//
// The 5 info-page JOINs (getSourcePipeline / getAnalysisSources / getSourceItems /
// getSourceChanges / addMatchingSources) still read this LOCAL mirror unchanged —
// that is why the mirror is mandatory, not optional. The URL-keyed verdict
// write-back to cs_articles (pushVerdictToSupabase, ipc) is untouched by this file.

const OFFLINE = { ok: false as const, error: 'Unavailable while offline' }
const nowIso = () => new Date().toISOString()

// The 48 local columns, in schema order — the mirror whitelist. A cloud row is a
// superset-safe match (cloud table is exactly these 48), so every cloud row maps
// cleanly; whitelisting guards against an unexpected column breaking the insert.
const INTEL_COLS = [
  'id','type','title','content','url','source_name','published_at','added_at','added_by_id',
  'added_by_name','status','confidence','confidence_override','categories_json','snippet','image_url',
  'platform','handle','location_mentioned','actors_mentioned','file_name','local_path','drive_url',
  'analysis_json','reviewed_by_id','reviewed_by_name','reviewed_at','review_notes','queue_section',
  'queued_at','queued_by_id','queued_by_name','relevance_score','region','geography','geography_confirmed',
  'gate_processed','gate_reasoning','relevance_type','disposition_tags','thematic_tags','language',
  'used_in_page','used_in_page_at','intel_notes','reconciled_notes','project_board_id','duplicate_of',
] as const

function rowForMirror(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of INTEL_COLS) out[c] = src[c] === undefined ? null : src[c]
  return out
}
const MIRROR_INSERT_SQL =
  `INSERT OR REPLACE INTO intelligence_sources (${INTEL_COLS.join(',')}) VALUES (${INTEL_COLS.map(c => '@' + c).join(',')})`

// ── mirror helpers (best-effort — a mirror write never fails/propagates) ──────

// Refresh the mirror rows for a READ result. Unlike the boards mirror (which
// scope-deletes then inserts), getSources is a filtered/paginated query with no
// clean partition to delete, so we UPSERT the returned rows (INSERT OR REPLACE)
// in ONE transaction and never delete — the mirror stays a fresh superset. Row
// removal happens explicitly via deleteSource. Correctness for the info-page
// JOINs only needs the row to be present and current, which upsert guarantees.
function mirrorUpsertRows(rows: Record<string, unknown>[]): void {
  if (!rows.length) return
  try {
    const db = getDatabase()
    const ins = db.prepare(MIRROR_INSERT_SQL)
    const tx = db.transaction((rs: Record<string, unknown>[]) => { for (const r of rs) ins.run(rowForMirror(r)) })
    tx(rows)
  } catch (e) { console.warn('[intel] local mirror upsert failed (read served from cloud):', (e as Error)?.message) }
}
function mirrorUpsertOne(row: Record<string, unknown> | null | undefined): void {
  if (!row) return
  try { getDatabase().prepare(MIRROR_INSERT_SQL).run(rowForMirror(row)) }
  catch (e) { console.warn('[intel] local mirror row upsert failed (cloud write succeeded):', (e as Error)?.message) }
}
function mirrorDeleteOne(id: string): void {
  try { getDatabase().prepare('DELETE FROM intelligence_sources WHERE id=?').run(id) }
  catch (e) { console.warn('[intel] local mirror delete failed (cloud delete succeeded):', (e as Error)?.message) }
}

// Re-fetch ONE full cloud row and mirror it. Used after every RMW / pure write so
// the mirror row is byte-identical to cloud (no field drift from DB defaults).
async function resyncRow(id: string): Promise<void> {
  const { data, error } = await cloud.from('intelligence_sources').select('*').eq('id', id).maybeSingle()
  if (error) { console.warn('[intel] cloud re-fetch for mirror failed:', error.message); return }
  mirrorUpsertOne(data as Record<string, unknown> | null)
}

// ── local count helper (offline + on-error fallback for the count reads) ─────
function localScalar(sql: string, ...args: unknown[]): number {
  try { return (getDatabase().prepare(sql).get(...args) as { c: number }).c }
  catch (e) { console.warn('[intel] local count read failed:', (e as Error)?.message); return 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// (A) PURE READS
// ─────────────────────────────────────────────────────────────────────────────

export interface GetSourcesOpts {
  type?: string; status?: string; confidence?: string
  category?: string; search?: string; limit?: number; offset?: number
}

// Offline / on-error fallback: the EXACT dynamic WHERE from the old handler,
// run against the local mirror. Return shape is byte-identical to today's rows.
function readMirrorSources(opts: GetSourcesOpts): Record<string, unknown>[] {
  let sql = 'SELECT * FROM intelligence_sources WHERE 1=1'
  const args: unknown[] = []
  if (opts.type)       { sql += ' AND type=?';                 args.push(opts.type) }
  if (opts.status)     { sql += ' AND status=?';               args.push(opts.status) }
  if (opts.confidence) { sql += ' AND confidence=?';           args.push(opts.confidence) }
  if (opts.category)   { sql += ' AND categories_json LIKE ?'; args.push(`%${opts.category}%`) }
  if (opts.search)     {
    sql += ' AND (title LIKE ? OR snippet LIKE ? OR source_name LIKE ? OR content LIKE ?)'
    const s = `%${opts.search}%`
    args.push(s, s, s, s)
  }
  sql += ' ORDER BY added_at DESC, published_at DESC'
  sql += ` LIMIT ${opts.limit ?? 100} OFFSET ${opts.offset ?? 0}`
  try { return getDatabase().prepare(sql).all(...args) as Record<string, unknown>[] }
  catch (e) { console.warn('[intel] local mirror sources read failed:', (e as Error)?.message); return [] }
}

// Cloud-first main list. Translates the dynamic WHERE (ipc:2641) to postgrest:
//   type/status/confidence → .eq   (exact, same as SQLite =)
//   category  → .ilike '%cat%'      (SQLite LIKE is case-insensitive → ilike)
//   search    → .or(<col>.ilike…)   over title/snippet/source_name/content
//   order     → added_at DESC, published_at DESC, NULLs LAST (matches SQLite;
//               Postgres defaults NULLs FIRST in DESC, so nullsFirst:false)
//   limit/off → .range(offset, offset+limit-1)  (inclusive)
export async function getSources(opts: GetSourcesOpts = {}): Promise<Record<string, unknown>[]> {
  if (!isOnline()) return readMirrorSources(opts)
  let q = cloud.from('intelligence_sources').select('*')
  if (opts.type)       q = q.eq('type', opts.type)
  if (opts.status)     q = q.eq('status', opts.status)
  if (opts.confidence) q = q.eq('confidence', opts.confidence)
  if (opts.category)   q = q.ilike('categories_json', `%${opts.category}%`)
  if (opts.search) {
    // Sanitize PostgREST logic-tree separators so a search term with , ( ) can't
    // break the .or() filter string. These chars are near-nonexistent in searches;
    // stripping them only broadens a would-be-empty match, never errors.
    const s = String(opts.search).replace(/[,()]/g, ' ')
    q = q.or(`title.ilike.%${s}%,snippet.ilike.%${s}%,source_name.ilike.%${s}%,content.ilike.%${s}%`)
  }
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0
  const { data, error } = await q
    .order('added_at', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)
  reportCloudResult(!error)
  if (error) {
    console.warn('[intel] cloud getSources failed, serving local mirror:', error.message)
    return readMirrorSources(opts)
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  mirrorUpsertRows(rows)
  return rows
}

// Count reads: cloud-first (head+count), fall back to the mirror on offline/error.
// No mirror sync — the count is derived; row syncing is getSources' job.
export async function getUnreviewedCount(): Promise<number> {
  const localSql = "SELECT COUNT(*) as c FROM intelligence_sources WHERE status='unreviewed'"
  if (!isOnline()) return localScalar(localSql)
  const { count, error } = await cloud.from('intelligence_sources')
    .select('id', { count: 'exact', head: true }).eq('status', 'unreviewed')
  reportCloudResult(!error)
  if (error) { console.warn('[intel] cloud getUnreviewedCount failed, serving mirror:', error.message); return localScalar(localSql) }
  return count ?? 0
}

// intel portion of getPipelineStats.pending (status='unreviewed'). The other half
// (sentToPages, from info_page_items) stays LOCAL in the ipc handler.
export async function getPipelinePending(): Promise<number> {
  return getUnreviewedCount()
}

export async function getStatusCounts(): Promise<{ unreviewed: number; approved: number; rejected: number }> {
  const localRead = (): { unreviewed: number; approved: number; rejected: number } => {
    try {
      const rows = getDatabase().prepare(
        "SELECT status, COUNT(*) as c FROM intelligence_sources WHERE type='article' GROUP BY status"
      ).all() as { status: string; c: number }[]
      const m: Record<string, number> = {}
      for (const r of rows) m[r.status] = r.c
      return { unreviewed: m['unreviewed'] ?? 0, approved: m['approved'] ?? 0, rejected: m['rejected'] ?? 0 }
    } catch (e) { console.warn('[intel] local getStatusCounts failed:', (e as Error)?.message); return { unreviewed: 0, approved: 0, rejected: 0 } }
  }
  if (!isOnline()) return localRead()
  // postgrest has no GROUP BY; three head counts (matches the SQLite GROUP result).
  const q = (status: string) => cloud.from('intelligence_sources')
    .select('id', { count: 'exact', head: true }).eq('type', 'article').eq('status', status)
  const [u, a, r] = await Promise.all([q('unreviewed'), q('approved'), q('rejected')])
  const error = u.error || a.error || r.error
  reportCloudResult(!error)
  if (error) { console.warn('[intel] cloud getStatusCounts failed, serving mirror:', error.message); return localRead() }
  return { unreviewed: u.count ?? 0, approved: a.count ?? 0, rejected: r.count ?? 0 }
}

const UNSCORED_LOCAL_SQL =
  "SELECT COUNT(*) as c FROM intelligence_sources WHERE type='article' AND (gate_processed IS NULL OR gate_processed=0) AND COALESCE(added_by_name,'') != 'Kantor Framework'"

export async function getUnscoredCount(): Promise<number> {
  if (!isOnline()) return localScalar(UNSCORED_LOCAL_SQL)
  const { count, error } = await cloud.from('intelligence_sources')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'article')
    .or('gate_processed.is.null,gate_processed.eq.0')
    .neq('added_by_name', 'Kantor Framework')
  reportCloudResult(!error)
  if (error) { console.warn('[intel] cloud getUnscoredCount failed, serving mirror:', error.message); return localScalar(UNSCORED_LOCAL_SQL) }
  return count ?? 0
}

export async function getImportedCount(): Promise<number> {
  const localSql = "SELECT COUNT(*) as c FROM intelligence_sources WHERE status='imported'"
  if (!isOnline()) return localScalar(localSql)
  const { count, error } = await cloud.from('intelligence_sources')
    .select('id', { count: 'exact', head: true }).eq('status', 'imported')
  reportCloudResult(!error)
  if (error) { console.warn('[intel] cloud getImportedCount failed, serving mirror:', error.message); return localScalar(localSql) }
  return count ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
// (B) READ-MODIFY-WRITE — CLOUD ONLY (never the mirror). Offline → OFFLINE.
// ─────────────────────────────────────────────────────────────────────────────

// Approve/reject. On approve, derives queue_section from categories_json (read
// from CLOUD) and returns addedToPages via the caller's routeToNewSources (local
// info_page_sources). The cs_articles verdict write-back stays in the ipc handler.
export async function updateStatus(
  id: string, status: string, notes?: string,
  reviewedById?: string, reviewedByName?: string,
): Promise<{ ok: boolean; addedToPages?: string[]; projectBoardId?: string | null; url?: string | null; error?: string }> {
  if (!isOnline()) return OFFLINE
  const now = nowIso()
  // Read CLOUD (never the mirror) — url for the verdict write-back, plus the
  // approve-path inputs.
  const { data: meta, error: mErr } = await cloud.from('intelligence_sources')
    .select('url,categories_json,project_board_id').eq('id', id).maybeSingle()
  reportCloudResult(!mErr)
  if (mErr) return { ok: false, error: `status read failed: ${mErr.message}` }
  const url = (meta?.url as string | null) ?? null
  if (status === 'approved') {
    const cats: string[] = JSON.parse((meta?.categories_json as string) || '[]')
    let section = 'source-archive'
    if (cats.includes('Incident')) section = 'incident-feed'
    else if (cats.includes('Investment & Procurement')) section = 'investment-procurement'
    else if (cats.includes('Finance & Sanctions')) section = 'finance-nexus'
    else if (cats.includes('Innovation & Technology') || cats.includes('State Military Activity')) section = 'platforms'
    const { error } = await cloud.from('intelligence_sources').update({
      status, review_notes: notes ?? null, reviewed_by_id: reviewedById ?? null,
      reviewed_by_name: reviewedByName ?? null, reviewed_at: now, queue_section: section,
    }).eq('id', id)
    if (error) return { ok: false, error: `status update failed: ${error.message}` }
    await resyncRow(id)
    return { ok: true, projectBoardId: (meta?.project_board_id as string | null) ?? null, url }
  }
  const { error } = await cloud.from('intelligence_sources').update({
    status, review_notes: notes ?? null, reviewed_by_id: reviewedById ?? null,
    reviewed_by_name: reviewedByName ?? null, reviewed_at: now,
  }).eq('id', id)
  if (error) return { ok: false, error: `status update failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true, url }
}

// analysis_json sub-object mergers. Each reads analysis_json from CLOUD, merges ONE
// sub-key, writes CLOUD, re-syncs the mirror. Reading cloud (not the mirror) is
// what prevents a stale read from clobbering a sibling sub-object.
async function readCloudAnalysis(id: string): Promise<{ ok: boolean; analysis?: Record<string, unknown>; error?: string }> {
  const { data, error } = await cloud.from('intelligence_sources').select('analysis_json').eq('id', id).maybeSingle()
  reportCloudResult(!error)
  if (error) return { ok: false, error: `analysis read failed: ${error.message}` }
  if (!data) return { ok: false, error: 'Source not found.' }
  let analysis: Record<string, unknown> = {}
  try { analysis = data.analysis_json ? JSON.parse(data.analysis_json as string) : {} } catch { analysis = {} }
  return { ok: true, analysis }
}

export async function saveReconciled(id: string, reconciled: {
  relevance_score?: number; relevance_reasoning?: string; summary?: string; suggested_tags?: string[]
}): Promise<{ ok: boolean; reconciled?: unknown; error?: string }> {
  if (!isOnline()) return OFFLINE
  const r = await readCloudAnalysis(id)
  if (!r.ok) return { ok: false, error: r.error }
  const block = { ...reconciled, reconciled_at: nowIso() }
  r.analysis!.reconciled = block
  const { error } = await cloud.from('intelligence_sources').update({ analysis_json: JSON.stringify(r.analysis) }).eq('id', id)
  if (error) return { ok: false, error: `saveReconciled failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true, reconciled: block }
}

export async function setHumanRelevance(id: string, value: string | null): Promise<{ ok: boolean; human?: unknown; error?: string }> {
  if (!isOnline()) return OFFLINE
  const r = await readCloudAnalysis(id)
  if (!r.ok) return { ok: false, error: r.error }
  const analysis = r.analysis!
  const human = (analysis.human && typeof analysis.human === 'object') ? analysis.human as Record<string, unknown> : {}
  const v = (value ?? '').trim()
  if (!v) { delete human.relevance; delete human.overridden_at }
  else { human.relevance = v; human.overridden_at = nowIso() }
  if (Object.keys(human).length) analysis.human = human
  else delete analysis.human
  const { error } = await cloud.from('intelligence_sources').update({ analysis_json: JSON.stringify(analysis) }).eq('id', id)
  if (error) return { ok: false, error: `setHumanRelevance failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true, human: analysis.human ?? null }
}

export async function saveAiAnalysis(id: string, ai: {
  relevance_score?: number; relevance_reasoning?: string; summary?: string; suggested_tags?: string[]
}): Promise<{ ok: boolean; ai?: unknown; error?: string }> {
  if (!isOnline()) return OFFLINE
  const r = await readCloudAnalysis(id)
  if (!r.ok) return { ok: false, error: r.error }
  const block = { ...ai, analyzed_at: nowIso() }
  r.analysis!.ai = block
  const { error } = await cloud.from('intelligence_sources').update({ analysis_json: JSON.stringify(r.analysis) }).eq('id', id)
  if (error) return { ok: false, error: `saveAiAnalysis failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true, ai: block }
}

// Bulk-confirm all imported rows. Cloud SELECT → per-row cloud UPDATE + mirror
// re-sync. Returns the rows so the caller can route (local info_page_sources) and
// push verdicts to cs_articles — both stay in the ipc handler.
export async function confirmImported(params: { confidence?: string; reviewedById?: string; reviewedByName?: string }): Promise<
  { ok: true; rows: { id: string; url?: string | null; project_board_id?: string | null }[] } | { ok: false; error: string }
> {
  if (!isOnline()) return OFFLINE
  const conf = params.confidence || 'medium'
  const now = nowIso()
  const { data, error } = await cloud.from('intelligence_sources')
    .select('id,url,project_board_id').eq('status', 'imported')
  reportCloudResult(!error)
  if (error) return { ok: false, error: `confirmImported read failed: ${error.message}` }
  const rows = (data ?? []) as { id: string; url?: string | null; project_board_id?: string | null }[]
  for (const r of rows) {
    const { error: uErr } = await cloud.from('intelligence_sources').update({
      confidence: conf, confidence_override: 1, status: 'approved',
      reviewed_by_id: params.reviewedById || null, reviewed_by_name: params.reviewedByName || null,
      reviewed_at: now, queue_section: 'source-archive',
    }).eq('id', r.id)
    if (uErr) { console.warn('[intel] confirmImported row update failed:', r.id, uErr.message); continue }
    await resyncRow(r.id)
  }
  return { ok: true, rows }
}

// ── Gate / rescore RMW helpers (cloud-only). The AI loop stays in ipc; these are
// the cloud read + score-write it calls, replacing its local SELECT/UPDATEs. ──

export interface UnscoredRow { id: string; title: string | null; snippet: string | null; content: string | null; source_name: string | null }

// Cloud read of unscored article rows (RMW read side — cloud, never the mirror).
// Offline → [] (the gate needs cloud + the Anthropic API anyway).
export async function getUnscoredForGate(limit: number): Promise<UnscoredRow[]> {
  if (!isOnline()) return []
  const { data, error } = await cloud.from('intelligence_sources')
    .select('id,title,snippet,content,source_name')
    .eq('type', 'article')
    .or('gate_processed.is.null,gate_processed.eq.0')
    .neq('added_by_name', 'Kantor Framework')
    .order('added_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  reportCloudResult(!error)
  if (error) { console.warn('[intel] getUnscoredForGate failed:', error.message); return [] }
  return (data ?? []) as UnscoredRow[]
}

// Persist a gate score. The old UPDATE used a SQL CASE on the row's own
// geography_confirmed; postgrest can't reference the row in SET, so we read that
// one flag from CLOUD and branch in JS (still cloud-authoritative). Then re-sync.
export async function applyGateResult(id: string, result: {
  relevance_score: number; relevance_type: string | null
  reasoning: string | null; geography: string | null; region: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const { data, error: rErr } = await cloud.from('intelligence_sources')
    .select('geography_confirmed').eq('id', id).maybeSingle()
  if (rErr) return { ok: false, error: `gate read failed: ${rErr.message}` }
  const confirmed = Number((data as Record<string, unknown> | null)?.geography_confirmed ?? 0) === 1
  const patch: Record<string, unknown> = {
    relevance_score: result.relevance_score, relevance_type: result.relevance_type,
    gate_reasoning: result.reasoning, gate_processed: 1,
  }
  if (!confirmed) { patch.geography = result.geography; patch.region = result.region }  // keep human-confirmed geo
  const { error } = await cloud.from('intelligence_sources').update(patch).eq('id', id)
  if (error) return { ok: false, error: `gate score write failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

// Tombstone a permanently-failed gate row (gate_processed=1, reasoning, score NULL).
export async function tombstoneGate(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const { error } = await cloud.from('intelligence_sources')
    .update({ gate_processed: 1, gate_reasoning: reason }).eq('id', id)
  if (error) return { ok: false, error: `gate tombstone failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE WRITES — cloud write → re-sync the row into the mirror → { ok, error }.
// On cloud error: return the failure and do NOT touch the mirror.
// ─────────────────────────────────────────────────────────────────────────────

export async function markDuplicate(id: string, duplicateOf: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const { error } = await cloud.from('intelligence_sources')
    .update({ status: 'duplicate', duplicate_of: duplicateOf || null, reviewed_at: nowIso() }).eq('id', id)
  if (error) return { ok: false, error: `markDuplicate failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

export async function updateConfidence(id: string, confidence: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const { error } = await cloud.from('intelligence_sources')
    .update({ confidence, confidence_override: 1 }).eq('id', id)
  if (error) return { ok: false, error: `updateConfidence failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

export async function updateGeography(id: string, geography: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const geo = (geography ?? '').trim()
  const { error } = await cloud.from('intelligence_sources')
    .update({ geography: geo || null, geography_confirmed: 1 }).eq('id', id)
  if (error) return { ok: false, error: `updateGeography failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

export async function setProject(id: string, boardId: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const bid = (boardId ?? '').trim()
  const { error } = await cloud.from('intelligence_sources').update({ project_board_id: bid || null }).eq('id', id)
  if (error) return { ok: false, error: `setProject failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

// routeToProject piece: set project_board_id (the routeToNewSources info_page_sources
// write + the status='routed' flip stay/also-run in the ipc handler via markRouted).
export async function setProjectBoard(id: string, boardId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const { error } = await cloud.from('intelligence_sources').update({ project_board_id: boardId }).eq('id', id)
  if (error) return { ok: false, error: `setProjectBoard failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

export async function markRouted(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const { error } = await cloud.from('intelligence_sources').update({ status: 'routed' }).eq('id', id)
  if (error) return { ok: false, error: `markRouted failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

// moveBackToIntel piece: return the source to the pending queue (info_page_sources
// delete + info_page_changes log stay LOCAL in the ipc handler).
export async function revertToUnreviewed(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const { error } = await cloud.from('intelligence_sources').update({ status: 'unreviewed' }).eq('id', id)
  if (error) return { ok: false, error: `revertToUnreviewed failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

export async function updateNotes(id: string, notesHtml: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const html = (notesHtml ?? '').trim()
  const { error } = await cloud.from('intelligence_sources').update({ intel_notes: html || null }).eq('id', id)
  if (error) return { ok: false, error: `updateNotes failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

export async function updateContent(id: string, content: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const { error } = await cloud.from('intelligence_sources').update({ content: content ?? '' }).eq('id', id)
  if (error) return { ok: false, error: `updateContent failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

export async function updateReconciledNotes(id: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const h = (html ?? '').trim()
  const { error } = await cloud.from('intelligence_sources').update({ reconciled_notes: h || null }).eq('id', id)
  if (error) return { ok: false, error: `updateReconciledNotes failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true }
}

export async function setArticleTags(id: string, type: string, tags: string[]): Promise<{ ok: boolean; tags?: string[]; error?: string }> {
  if (!isOnline()) return OFFLINE
  const col = type === 'disposition' ? 'disposition_tags' : 'thematic_tags'
  const clean = Array.from(new Set((tags || []).map(normalizeTag).filter(Boolean)))
  const { error } = await cloud.from('intelligence_sources').update({ [col]: JSON.stringify(clean) }).eq('id', id)
  if (error) return { ok: false, error: `setArticleTags failed: ${error.message}` }
  await resyncRow(id)
  return { ok: true, tags: clean }
}

// Type-aware permission gate preserved from the old handler (resolveActor + can()).
export async function deleteSource(actingUserId: string | undefined, id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return OFFLINE
  const { data: row, error: rErr } = await cloud.from('intelligence_sources').select('type').eq('id', id).maybeSingle()
  reportCloudResult(!rErr)
  if (rErr) return { ok: false, error: `delete read failed: ${rErr.message}` }
  if (!row) { mirrorDeleteOne(id); return { ok: true } } // already gone
  const key = row.type === 'document' ? 'delete_intel_doc'
            : row.type === 'article'  ? 'delete_intel_news'
            : row.type === 'social'   ? 'delete_intel_social'
            : null
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot && (!key || !actor.can(key))) {
    return { ok: false, error: 'You do not have permission to delete this item.' }
  }
  const { error } = await cloud.from('intelligence_sources').delete().eq('id', id)
  if (error) return { ok: false, error: `deleteSource failed: ${error.message}` }
  mirrorDeleteOne(id)
  return { ok: true }
}

// Manual capture inserts (social / interview / document). Cloud insert with an
// explicit added_at (so cloud and mirror agree), then re-sync the row.
async function insertSource(row: Record<string, unknown>): Promise<{ ok: boolean; id: string; error?: string }> {
  if (!isOnline()) return { ...OFFLINE, id: '' }
  const withTs = { added_at: nowIso(), ...row }
  const { error } = await cloud.from('intelligence_sources').insert(withTs)
  if (error) return { ok: false, id: String(row.id ?? ''), error: `insert failed: ${error.message}` }
  await resyncRow(String(row.id))
  return { ok: true, id: String(row.id) }
}

export async function addSocial(post: {
  platform: string; handle: string; post_date: string; content: string;
  location_mentioned?: string; actors_mentioned?: string; url?: string;
  categories_json?: string; confidence?: string; added_by_id?: string; added_by_name?: string;
}, id: string, categoriesJson: string): Promise<{ ok: boolean; id: string; error?: string }> {
  return insertSource({
    id, type: 'social', platform: post.platform, handle: post.handle, published_at: post.post_date,
    content: post.content, url: post.url || null, location_mentioned: post.location_mentioned || null,
    actors_mentioned: post.actors_mentioned || null, categories_json: categoriesJson,
    confidence: post.confidence || 'low', added_by_id: post.added_by_id || null, added_by_name: post.added_by_name || null,
  })
}

export async function addInterview(iv: {
  title: string; transcript: string; date?: string; added_by_id?: string; added_by_name?: string;
}, id: string): Promise<{ ok: boolean; id: string; error?: string }> {
  return insertSource({
    id, type: 'interview', title: (iv.title || '').trim() || 'Untitled interview',
    content: iv.transcript || '', published_at: iv.date || null,
    added_by_id: iv.added_by_id || null, added_by_name: iv.added_by_name || null,
  })
}

// Document upload: the file dialog + text extraction stay in the ipc handler; this
// persists the finished row (cloud + mirror). Mirrors the old INSERT column set.
export async function addDocument(doc: {
  id: string; file_name: string; local_path: string; content: string;
  analysis_json: string | null; categories_json: string; confidence: string;
  added_by_id: string | null; added_by_name: string | null;
}): Promise<{ ok: boolean; id: string; error?: string }> {
  return insertSource({
    id: doc.id, type: 'document', title: doc.file_name, file_name: doc.file_name,
    local_path: doc.local_path, content: doc.content, analysis_json: doc.analysis_json,
    categories_json: doc.categories_json, confidence: doc.confidence,
    added_by_id: doc.added_by_id, added_by_name: doc.added_by_name,
  })
}

// Info-page publish feedback flag. Best-effort (like the old fire-once local write)
// — a failure must never break the publish flow, so it warns rather than throwing.
export async function markUsedInPage(id: string, pageName: string, at: string): Promise<void> {
  if (!isOnline()) { console.warn('[intel] markUsedInPage skipped (offline):', id); return }
  const { error } = await cloud.from('intelligence_sources')
    .update({ used_in_page: pageName, used_in_page_at: at }).eq('id', id)
  if (error) { console.warn('[intel] markUsedInPage cloud write failed:', error.message); return }
  await resyncRow(id)
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE ENTRY — cs_articles → intelligence_sources.
// The Contested Skies GDELT pipeline writes cloud cs_articles; the app pulls new
// rows (ipc syncFromContestedSkies, which still owns the cs_articles read/mark).
// This is the WRITE into intelligence_sources: cloud INSERT (ignore-on-url so it
// stays idempotent like the old INSERT OR IGNORE), then mirror the inserted rows.
// Cloud-authoritative: the pipeline row now lands in cloud first, mirror second.
// (This path is inherently online — it reads cs_articles from cloud.)
// ─────────────────────────────────────────────────────────────────────────────
export async function insertPipelineArticles(rows: Record<string, unknown>[]): Promise<{ inserted: Record<string, unknown>[]; error?: string }> {
  if (!rows.length) return { inserted: [] }
  const { data, error } = await cloud.from('intelligence_sources')
    .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
    .select('*')
  if (error) { console.warn('[intel] insertPipelineArticles failed:', error.message); return { inserted: [], error: error.message } }
  const inserted = (data ?? []) as Record<string, unknown>[]
  mirrorUpsertRows(inserted)
  return { inserted }
}
