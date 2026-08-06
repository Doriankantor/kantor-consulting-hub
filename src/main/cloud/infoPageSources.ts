import { randomUUID } from 'crypto'
import { cloud } from './client'
import { isOnline } from './connection'
import { getDatabase } from '../db'
import { analyzeWithClaude } from '../ai/analyze'

// ── info_page_sources: cloud-authoritative with a local offline MIRROR (Phase B2) ──
// Second info-page tier migrated to cloud (after info_page_owners in B1). Cloud
// `info_page_sources` + `info_page_changes` are the source of truth; the local
// SQLite tables are OFFLINE MIRRORs, refreshed ONLY via resyncSourceRow after a
// successful cloud write — never written directly by the pipeline writers. Follows
// the intelligence_sources template (cloud/intel.ts): cloud write → re-sync that
// row into the mirror; on cloud error, return the failure and do NOT touch local.
//
// IDENTITY: the natural key is the composite (article_id, info_page) — the cloud
// PK. The local table keeps an INTEGER autoincrement `id` surrogate, but it is NOT
// portable to cloud (cloud has no such column), so all keying is on the composite
// pair and the surrogate is left out of the mirror upsert (SQLite re-assigns it).
//
// B2b-1 SCOPE: only the two writers below (routeToNew + removeToIntel) are
// cloud-first so far. The other stage-transition writers (sendToReview /
// backSourceToNew / commitSources / saveReviewNotes) and EVERY reader still hit
// the LOCAL mirror — that is B2b-2 / B2b-3. The mirror therefore stays mandatory.

const nowIso = (): string => new Date().toISOString()

// Mirror columns for info_page_sources (cloud shape). The local `id` autoincrement
// is intentionally omitted so SQLite assigns it on INSERT OR REPLACE — nothing
// cross-tier depends on the surrogate; identity is (article_id, info_page).
const SRC_COLS = ['article_id', 'info_page', 'stage', 'design_notes', 'added_at', 'committed_at', 'source_type', 'section', 'geography', 'proposal_json'] as const
const MIRROR_UPSERT_SQL =
  `INSERT OR REPLACE INTO info_page_sources (${SRC_COLS.join(',')}) VALUES (${SRC_COLS.map(c => '@' + c).join(',')})`

// ── mirror helpers (best-effort — a mirror write never fails/propagates) ──────
function mirrorUpsertSource(row: Record<string, unknown> | null | undefined): void {
  if (!row) return
  const out: Record<string, unknown> = {}
  for (const c of SRC_COLS) {
    const v = row[c]
    // proposal_json arrives from cloud (jsonb) as a parsed JS object — better-sqlite3
    // can only bind scalars, so serialize any object/array to a JSON string for the
    // TEXT mirror column. All other columns are already scalar and pass through.
    out[c] = v === undefined || v === null ? null : (typeof v === 'object' ? JSON.stringify(v) : v)
  }
  try { getDatabase().prepare(MIRROR_UPSERT_SQL).run(out) }
  catch (e) { console.warn('[infoPageSources] mirror upsert failed (cloud write succeeded):', (e as Error)?.message) }
}
function mirrorDeleteSource(articleId: string, infoPage: string): void {
  try { getDatabase().prepare('DELETE FROM info_page_sources WHERE article_id=? AND info_page=?').run(articleId, infoPage) }
  catch (e) { console.warn('[infoPageSources] mirror delete failed (cloud delete succeeded):', (e as Error)?.message) }
}

// Re-fetch ALL cloud info_page_sources rows for a (article_id, info_page) pair and
// reconcile the mirror as a SET. NS-2: one article can now have N placement rows
// (one per section), so the old .maybeSingle() would throw on the 2nd row. We fetch
// the whole pair (no maybeSingle), clear the pair's mirror rows, then re-insert the
// cloud set. When the cloud has zero rows for the pair (e.g. removeToIntel), the
// delete alone drops the mirror — same effect as the old else-branch. Best-effort.
export async function resyncSourceRow(articleId: string, infoPage: string): Promise<void> {
  const { data, error } = await cloud.from('info_page_sources').select('*')
    .eq('article_id', articleId).eq('info_page', infoPage)
  if (error) { console.warn('[infoPageSources] cloud re-fetch for mirror failed:', error.message); return }
  const rows = Array.isArray(data) ? data : []
  // Pair-scoped rewrite: mirrorDeleteSource clears ALL local rows for the pair, then
  // each cloud row is re-inserted (filtered through SRC_COLS, incl. section+geography).
  mirrorDeleteSource(articleId, infoPage)
  for (const r of rows) mirrorUpsertSource(r as Record<string, unknown>)
}

// WRITER 1 — approval-path route into a project's "New sources" (stage='new').
// NS-2 Step 4b-i: SEED N PLACEMENT ROWS — one per AI-proposed section (from
// analysis_json.routing.proposed_sections, passed in by the caller), each at the
// 'REGIONAL' geography sentinel. If NO sections were proposed (the common case for
// pre-A1 sources), seed ONE presence row at the section='' sentinel so the source
// still surfaces in New Sources; 4b-ii (syncPlacements) will later reconcile these
// AI seeds to the researcher's routing.confirmed set.
// Cloud-first + idempotent: upsert with ON CONFLICT (article_id, info_page, section,
// geography) DO NOTHING (ignoreDuplicates), so re-approving an already-routed source
// is a no-op per placement. The companion info_page_changes row is logged ONCE when
// ANY new placement was inserted (the change log has no section column — one entry
// per pair, not per section). Errors propagate; local is touched only by the resync.
export async function routeToNew(
  articleId: string, infoPage: string, sourceType: string | null, sections: string[],
): Promise<{ ok: boolean; inserted?: boolean; count?: number; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot route sources while offline' }
  const now = nowIso()
  // Dedupe + drop blanks; empty proposal → single sentinel presence row (section='').
  const keys = Array.from(new Set((sections ?? []).filter(s => typeof s === 'string' && s.length > 0)))
  const seedSections = keys.length ? keys : ['']
  const rows = seedSections.map(section => ({
    article_id: articleId, info_page: infoPage, stage: 'new',
    source_type: sourceType ?? null, section, geography: 'REGIONAL', added_at: now,
  }))
  const { data, error } = await cloud.from('info_page_sources')
    .upsert(rows, { onConflict: 'article_id,info_page,section,geography', ignoreDuplicates: true })
    .select()
  if (error) return { ok: false, error: `route cloud upsert failed: ${error.message}` }
  const inserted = Array.isArray(data) && data.length > 0
  if (inserted) {
    const { error: cErr } = await cloud.from('info_page_changes')
      .insert({ article_id: articleId, info_page: infoPage, from_stage: null, to_stage: 'new', created_at: now })
    if (cErr) return { ok: false, error: `route change-log insert failed: ${cErr.message}` }
  }
  await resyncSourceRow(articleId, infoPage)
  return { ok: true, inserted, count: Array.isArray(data) ? data.length : 0 }
}

// WRITER 1b — NS-2 Step 4b-ii: reconcile the placement rows for one (article_id,
// info_page) to the researcher's CONFIRMED section set, as a STAGE-SAFE diff. Runs
// right after setRoutingConfirmed (which writes routing.confirmed on the intel row);
// this brings the physical placement rows into line with that choice.
//
// STAGE-SAFE is the core invariant: rows already advanced to 'review'/'committed' are
// LOCKED — never deleted (don't destroy downstream work) and never re-added as a fresh
// 'new' duplicate. Only stage='new' rows are reconcilable.
//   toDelete = newSections − confirmed                  (unchecked 'new' rows, incl. a stale '' sentinel)
//   toAdd    = confirmed − newSections − lockedSections (confirmed sections not already present)
// EMPTY FLOOR: if the result would leave the pair with ZERO rows (confirmed empty AND
// no locked rows), re-seed one '' sentinel so the source never vanishes from New Sources
// (the interim safety until the 4b-iii ≥1-section gate). If locked rows exist, the source
// is still present via them — no sentinel needed.
//
// Cloud-authoritative READ (never the mirror). Never throws — setRoutingConfirmed has
// already persisted the confirmed set, so a placement-sync failure must not lose it.
export async function syncPlacements(
  articleId: string, infoPage: string, confirmedSections: string[],
): Promise<{ ok: boolean; added?: number; deleted?: number; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot sync placements while offline' }
  try {
    const confirmed = Array.from(new Set((confirmedSections ?? []).filter(s => typeof s === 'string' && s.length > 0)))
    // a. cloud-authoritative read of the pair's current placements (N rows, no maybeSingle)
    const { data, error } = await cloud.from('info_page_sources').select('section,stage')
      .eq('article_id', articleId).eq('info_page', infoPage)
    if (error) return { ok: false, error: `syncPlacements read failed: ${error.message}` }
    const cur = (Array.isArray(data) ? data : []) as { section: string; stage: string }[]
    // b. partition current sections by stage
    const newSections    = cur.filter(r => r.stage === 'new').map(r => r.section)
    const lockedSections = new Set(cur.filter(r => r.stage === 'review' || r.stage === 'committed').map(r => r.section))
    // c. stage-safe diff (locked sections invisible to delete AND skipped for add)
    const confirmedSet = new Set(confirmed)
    const newSet = new Set(newSections)
    const toDelete = newSections.filter(s => !confirmedSet.has(s))                       // unchecked 'new' rows (incl. '' sentinel)
    const toAdd    = confirmed.filter(s => !newSet.has(s) && !lockedSections.has(s))      // confirmed but not already present
    // d. empty floor: would the pair end with zero rows? (all 'new' deleted, nothing added, none locked)
    const remainingNew = newSections.length - toDelete.length + toAdd.length
    const needsSentinel = remainingNew === 0 && lockedSections.size === 0
    // e. apply — deletes first, then adds, then optional sentinel re-seed
    let deleted = 0
    for (const section of toDelete) {
      const { data: del, error: dErr } = await cloud.from('info_page_sources').delete()
        .eq('article_id', articleId).eq('info_page', infoPage).eq('section', section).eq('stage', 'new').select()
      if (dErr) return { ok: false, error: `syncPlacements delete failed: ${dErr.message}` }
      deleted += Array.isArray(del) ? del.length : 0
    }
    let added = 0
    const addRows = needsSentinel ? [''] : toAdd   // empty floor takes precedence over adds (toAdd is [] when confirmed is [])
    if (addRows.length) {
      const rows = addRows.map(section => ({
        article_id: articleId, info_page: infoPage, stage: 'new', section, geography: 'REGIONAL', added_at: nowIso(),
      }))
      const { data: ins, error: aErr } = await cloud.from('info_page_sources')
        .upsert(rows, { onConflict: 'article_id,info_page,section,geography', ignoreDuplicates: true }).select()
      if (aErr) return { ok: false, error: `syncPlacements add failed: ${aErr.message}` }
      added = Array.isArray(ins) ? ins.length : 0
    }
    // f. reconcile the mirror once (N-row capable)
    await resyncSourceRow(articleId, infoPage)
    return { ok: true, added, deleted }
  } catch (e) {
    return { ok: false, error: `syncPlacements failed: ${(e as Error)?.message ?? String(e)}` }
  }
}

// WRITER 2 — moveBackToIntel's info_page_sources removal (stage 'new' → gone).
// Cloud-first DELETE by composite key + companion info_page_changes row
// (to_stage='intel'), then reconcile the mirror (drops the local row). The intel
// status flip (revertToUnreviewed) is done by the CALLER FIRST, preserving the
// existing cloud-before-local ordering. Errors propagate; local is touched only
// by the post-success resync.
export async function removeToIntel(
  articleId: string, infoPage: string,
): Promise<{ ok: boolean; deleted?: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot move sources while offline' }
  const now = nowIso()
  const { data, error } = await cloud.from('info_page_sources').delete()
    .eq('article_id', articleId).eq('info_page', infoPage).select()
  if (error) return { ok: false, error: `moveBackToIntel cloud delete failed: ${error.message}` }
  const deleted = Array.isArray(data) && data.length > 0
  if (deleted) {
    const { error: cErr } = await cloud.from('info_page_changes')
      .insert({ article_id: articleId, info_page: infoPage, from_stage: 'new', to_stage: 'intel', created_at: now })
    if (cErr) return { ok: false, error: `moveBackToIntel change-log insert failed: ${cErr.message}` }
  }
  await resyncSourceRow(articleId, infoPage)
  return { ok: true, deleted }
}

// ── B2b-2: the four remaining stage-transition / notes writers ────────────────
// Same shape as B2b-1: offline-guarded, cloud write FIRST, companion change logged
// only when a row actually changed, then resyncSourceRow refreshes the mirror.
// `.select()` on the UPDATE returns the affected rows, giving the same "changes>0"
// signal the old local `run().changes` provided (0 rows when the stage guard misses).

// NS-2 Step 4b-iii — ≥1-section gate. Forward advancement (→review / →committed) is only
// allowed when the source has at least one REAL (non-sentinel) placement; the '' sentinel
// (the empty-floor presence row from syncPlacements) does NOT count. Cloud-authoritative
// COUNT over the pair (head:true → no rows fetched). FAIL-CLOSED: a read error blocks the
// advance, so a transient failure can never smuggle a sentinel-only source forward.
// Backward transitions (→new) never call this — de-escalation is always allowed.
async function countRealPlacements(
  articleId: string, infoPage: string,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const { count, error } = await cloud.from('info_page_sources')
    .select('*', { count: 'exact', head: true })
    .eq('article_id', articleId).eq('info_page', infoPage).neq('section', '')
  if (error) return { ok: false, error: `placement-gate read failed: ${error.message}` }
  return { ok: true, count: count ?? 0 }
}

// WRITER 3 — new -> review. Guarded on stage='new'; companion change ('new'->'review')
// only when a row moved. Returns whether it moved (the handler sums the batch).
// 4b-iii: gated — refuses to advance a source with no real (non-sentinel) placement.
export async function sendSourceToReview(
  articleId: string, infoPage: string,
): Promise<{ ok: boolean; moved?: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot update sources while offline' }
  // ≥1-section gate (forward transition). Block sentinel-only / zero-placement sources.
  const gate = await countRealPlacements(articleId, infoPage)
  if (!gate.ok) return { ok: false, error: gate.error }
  if ((gate.count ?? 0) < 1) return { ok: false, error: 'Confirm at least one section before sending to review.' }
  const now = nowIso()
  const { data, error } = await cloud.from('info_page_sources')
    .update({ stage: 'review' })
    .eq('article_id', articleId).eq('info_page', infoPage).eq('stage', 'new')
    .select()
  if (error) return { ok: false, error: `sendToReview cloud update failed: ${error.message}` }
  const moved = Array.isArray(data) && data.length > 0
  if (moved) {
    const { error: cErr } = await cloud.from('info_page_changes')
      .insert({ article_id: articleId, info_page: infoPage, from_stage: 'new', to_stage: 'review', created_at: now })
    if (cErr) return { ok: false, error: `sendToReview change-log insert failed: ${cErr.message}` }
  }
  await resyncSourceRow(articleId, infoPage)
  return { ok: true, moved }
}

// WRITER 4 — review -> new (back-out). Clears design_notes (as the local version did),
// guarded on stage='review'; companion change ('review'->'new') only when a row moved.
export async function backSourceToNew(
  articleId: string, infoPage: string,
): Promise<{ ok: boolean; moved?: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot update sources while offline' }
  const now = nowIso()
  // Clear proposal_json too: a source returning to New invalidates any proposals its
  // review-stage placements carried (they were reconciled against a state it's leaving).
  const { data, error } = await cloud.from('info_page_sources')
    .update({ stage: 'new', design_notes: null, proposal_json: null })
    .eq('article_id', articleId).eq('info_page', infoPage).eq('stage', 'review')
    .select()
  if (error) return { ok: false, error: `backSourceToNew cloud update failed: ${error.message}` }
  const moved = Array.isArray(data) && data.length > 0
  if (moved) {
    const { error: cErr } = await cloud.from('info_page_changes')
      .insert({ article_id: articleId, info_page: infoPage, from_stage: 'review', to_stage: 'new', created_at: now })
    if (cErr) return { ok: false, error: `backSourceToNew change-log insert failed: ${cErr.message}` }
    // Incidents Slice 1: a source returning to New invalidates any incident record it
    // generated (homed to a state it's now leaving) — delete by source_id (the real source
    // link) so a re-route regenerates cleanly, parallel to clearing proposal_json above.
    // Best-effort: an incidents cleanup failure must not fail the back-out (stage flip OK).
    const { error: incErr } = await cloud.from('incidents').delete().eq('source_id', articleId)
    if (incErr) console.warn('[incident] backSourceToNew incident cleanup failed:', incErr.message)
  }
  await resyncSourceRow(articleId, infoPage)
  return { ok: true, moved }
}

// WRITER 5 — review -> committed, ONE row (commitSources iterates its pre-read batch).
// Guarded on stage='review'; committed_at stamped; design_notes saved; companion
// change ('review'->'committed', note=designNotes) only when the row moved.
// ⚠ Cloud has NO cross-row transaction — the caller commits rows SEQUENTIALLY and
// surfaces the first failure (a partial batch can result; see the handler note).
export async function commitSourceRow(
  articleId: string, infoPage: string, designNotes: string | null, committedAt: string,
): Promise<{ ok: boolean; committed?: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot commit sources while offline' }
  // 4b-iii: ≥1-section gate (forward transition). Defense-in-depth — a source only reaches
  // 'review' past the send-to-review gate, but re-check so a sentinel-only source can never
  // be committed even if it slipped through before this step existed.
  const gate = await countRealPlacements(articleId, infoPage)
  if (!gate.ok) return { ok: false, error: gate.error }
  if ((gate.count ?? 0) < 1) return { ok: false, error: 'Confirm at least one section before committing this source.' }
  const { data, error } = await cloud.from('info_page_sources')
    .update({ stage: 'committed', committed_at: committedAt, design_notes: designNotes ?? null })
    .eq('article_id', articleId).eq('info_page', infoPage).eq('stage', 'review')
    .select()
  if (error) return { ok: false, error: `commitSources cloud update failed: ${error.message}` }
  const committed = Array.isArray(data) && data.length > 0
  if (committed) {
    const { error: cErr } = await cloud.from('info_page_changes')
      .insert({ article_id: articleId, info_page: infoPage, from_stage: 'review', to_stage: 'committed', note: designNotes ?? null, created_at: committedAt })
    if (cErr) return { ok: false, error: `commitSources change-log insert failed: ${cErr.message}` }
  }
  await resyncSourceRow(articleId, infoPage)
  return { ok: true, committed }
}

// WRITER 6 — save shared review notes onto EVERY 'review' row of a page. In-place,
// NOT a transition → NO companion info_page_changes row. Page-level (no article_id),
// matching the handler's existing semantics; re-syncs each affected row's mirror.
export async function saveReviewNotesForPage(
  infoPage: string, designNotes: string | null,
): Promise<{ ok: boolean; saved?: number; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot save review notes while offline' }
  const { data, error } = await cloud.from('info_page_sources')
    .update({ design_notes: designNotes ?? null })
    .eq('info_page', infoPage).eq('stage', 'review')
    .select('article_id')
  if (error) return { ok: false, error: `saveReviewNotes cloud update failed: ${error.message}` }
  const rows = (Array.isArray(data) ? data : []) as { article_id: string }[]
  for (const r of rows) await resyncSourceRow(r.article_id, infoPage)
  return { ok: true, saved: rows.length }
}

// ── Pre-Commit Review: fire-and-forget section-text proposal generation ───────
// Section TEXT only (cards/incidents are later arcs). Runs AFTER a source advances
// new->review, DECOUPLED from that transition: the stage flip has already succeeded
// and returned to the UI, so this is pure best-effort background work. It NEVER
// throws to its caller and one cell's failure never stops the others. NOT awaited.

// The full proposal_json shape — every field always present so future readers can
// rely on it. `overrides` fills status + whatever that step knows.
function proposalShape(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    status: 'pending',
    original_body: '',
    proposed_body: '',
    divergence: false,          // reserved contradiction flag (wired into UI later)
    divergence_reasoning: '',
    error: '',
    generated_at: nowIso(),
    ...overrides,
  }
}

// Write proposal_json onto ONE placement row (article_id, info_page, section, geography)
// and refresh that pair's mirror. Best-effort — a write miss (e.g. the row moved back to
// 'new' mid-generation) is logged, not thrown. proposal_json is jsonb: pass the OBJECT
// (supabase-js serializes); the mirror stringifies it (mirrorUpsertSource).
async function setProposal(
  articleId: string, infoPage: string, section: string, geography: string,
  overrides: Record<string, unknown>,
): Promise<void> {
  const { error } = await cloud.from('info_page_sources')
    .update({ proposal_json: proposalShape(overrides) })
    .eq('article_id', articleId).eq('info_page', infoPage).eq('section', section).eq('geography', geography)
  if (error) { console.warn('[precommit] setProposal write failed:', error.message); return }
  await resyncSourceRow(articleId, infoPage)
}

// Generate + store the proposal for ONE (section, geography) cell. Marks 'generating',
// reads the cell's live section text, calls the integrate task, then writes 'ready' /
// 'nochange' / 'error'. Never throws.
async function generateOneProposal(
  articleId: string, infoPage: string, section: string, geography: string,
  sourceText: string, priorAi: Record<string, unknown> | null,
): Promise<void> {
  await setProposal(articleId, infoPage, section, geography, { status: 'generating' })
  try {
    // 1. the cell's current live section text (canonical live version, English).
    const { data: live, error: lErr } = await cloud.from('section_texts')
      .select('body').eq('geography', geography).eq('section_key', section).eq('lang', 'en')
      .is('superseded_by', null).maybeSingle()
    if (lErr) throw new Error(lErr.message)
    const originalBody = typeof live?.body === 'string' ? live.body : ''
    // 2. reconcile the new source into this section's text.
    const res = await analyzeWithClaude({
      task: 'integrate',
      text: sourceText,
      currentText: originalBody,
      cellIdentity: { geography, section_key: section },
      priorAi,
    })
    if (!res.ok) {
      await setProposal(articleId, infoPage, section, geography, { status: 'error', error: res.error, original_body: originalBody })
      return
    }
    const proposed = res.result.proposed_text ?? ''
    // 'nochange' is a first-class outcome: the model flagged it, OR the proposal is empty
    // or textually identical to the current body.
    const noChange = res.result.no_material_change === true || !proposed.trim() || proposed.trim() === originalBody.trim()
    await setProposal(articleId, infoPage, section, geography, {
      status: noChange ? 'nochange' : 'ready',
      original_body: originalBody,
      proposed_body: proposed,
      divergence: res.result.divergence === true,
      divergence_reasoning: res.result.divergence_reasoning ?? '',
    })
  } catch (e) {
    await setProposal(articleId, infoPage, section, geography, { status: 'error', error: (e as Error)?.message ?? String(e) })
  }
}

// ── Incidents Slice 1: fire-and-forget structured incident generation ─────────
// Runs ALONGSIDE the narrative proposal generation (not instead of it) for a source
// entering review. Gated on the INCIDENT article-type flag (analysis_json.ai.article_type,
// surfaced here as priorAi.article_type): a non-incident source does no incident work.
// An incident source generates ONE structured record homed to the EVENT's geography, and
// upserts it idempotently by dedup_key. Cloud-only (incidents is unmirrored). Never throws.

// Parse a stated date string to a YYYY-MM-DD value for the NOT-NULL event_date column.
// Returns null when unparseable — the caller falls back so event_date is always present.
function toDateOnly(s: string): string | null {
  const m = s.match(/\d{4}-\d{2}-\d{2}/)
  if (m) return m[0]
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

async function generateIncident(
  articleId: string, sourceText: string, priorAi: Record<string, unknown> | null,
  actingUserId: string | undefined,
): Promise<void> {
  try {
    // Gate on the INCIDENT flag. It lives in analysis_json.ai.article_type (relevance
    // task output); priorAi IS that .ai block. Trust the flag per decision — if it ever
    // misses incidents, the lever is the relevance prompt's detection, not a fallback here.
    const articleType = typeof (priorAi as any)?.article_type === 'string'
      ? String((priorAi as any).article_type).trim().toLowerCase() : ''
    if (articleType !== 'incident') return          // not an incident source — skip
    if (!sourceText.trim()) return

    const res = await analyzeWithClaude({ task: 'incident', text: sourceText, priorAi })
    if (!res.ok) { console.warn('[incident] extraction failed:', res.error); return }
    const r = res.result

    // Container key: the event's normalized country. country is NOT NULL, so fall back to
    // REGIONAL (a valid multi-country container) when the model gives no country.
    const country = (r.incident_country ?? '').trim() || 'REGIONAL'
    const rawDate = (r.incident_event_date ?? '').trim()
    // dedup_key = source_id + country + stated date (stable across days, NOT the event_date
    // fallback), so re-generating the same source+event is idempotent whenever it re-runs.
    const dedupKey = `${articleId}|${country}|${rawDate || 'nodate'}`

    // Idempotency = on-conflict-do-nothing, done as an explicit check (PostgREST upsert
    // can't reliably infer a PARTIAL unique index). The partial unique index still backstops
    // a concurrent double-insert — the insert below would error and we swallow it.
    const { data: existing, error: exErr } = await cloud.from('incidents')
      .select('id').eq('dedup_key', dedupKey).maybeSingle()
    if (exErr) { console.warn('[incident] dedup check failed:', exErr.message); return }
    if (existing) return                              // already generated for this source+event

    // event_date is NOT NULL: stated date when parseable, else the generation date.
    const eventDate = toDateOnly(rawDate) || nowIso().slice(0, 10)

    // Every column below EXISTS on the real incidents table. source_id is the source link
    // (the table's existing column); verification is the checked enum (normalizer clamped it).
    const row = {
      id: randomUUID(),
      event_date: eventDate,
      country,
      verification: r.incident_verification || 'single-source',
      title: (r.incident_title ?? '').trim() || null,
      summary: (r.incident_summary ?? '').trim() || null,
      location: (r.incident_location ?? '').trim() || null,
      actor: (r.incident_actor ?? '').trim() || null,
      actor_type: (r.incident_actor_type ?? '').trim() || null,
      system: (r.incident_system ?? '').trim() || null,
      casualties: r.incident_casualties ?? null,      // total for THIS event, or null
      source_id: articleId,                            // the real source link
      created_by: actingUserId ?? null,
      dedup_key: dedupKey,
    }
    const { error: insErr } = await cloud.from('incidents').insert(row)
    if (insErr) { console.warn('[incident] insert failed:', insErr.message); return }
  } catch (e) {
    console.warn('[incident] generateIncident crashed (transition already succeeded):', (e as Error)?.message)
  }
}

// Entry point (fire-and-forget). For a source that just entered review, generate a
// text proposal for each REAL placement cell it touches. Reads the source's content +
// analysis once and reuses across its cells. Swallows all errors — the transition that
// triggered it has already committed.
export async function generateProposals(articleId: string, infoPage: string, actingUserId?: string): Promise<void> {
  try {
    if (!isOnline()) return
    // The cells this source touches now: its review-stage placements. The '' sentinel
    // (empty-floor presence row) has no cell to reconcile, so it's excluded.
    const { data: cells, error: cErr } = await cloud.from('info_page_sources')
      .select('section,geography')
      .eq('article_id', articleId).eq('info_page', infoPage).eq('stage', 'review').neq('section', '')
    if (cErr) { console.warn('[precommit] read touched cells failed:', cErr.message); return }
    const touched = (Array.isArray(cells) ? cells : []) as { section: string; geography: string }[]
    if (!touched.length) return

    // Source content + analysis — read ONCE, shared across the source's cells.
    const { data: src, error: sErr } = await cloud.from('intelligence_sources')
      .select('content,analysis_json').eq('id', articleId).maybeSingle()
    if (sErr) { console.warn('[precommit] read source failed:', sErr.message); return }
    const sourceText = typeof src?.content === 'string' ? src.content : ''
    let priorAi: Record<string, unknown> | null = null
    try {
      const aj = src?.analysis_json ? JSON.parse(src.analysis_json as string) : null
      priorAi = aj && typeof aj === 'object' && (aj as any).ai && typeof (aj as any).ai === 'object' ? (aj as any).ai : null
    } catch { priorAi = null }

    // The calls are INDEPENDENT — each narrative task writes ONLY its own cell's
    // proposal_json (distinct (article_id, info_page, section, geography) row), and the
    // incident task writes ONLY the incidents row. No shared object, so parallel writes
    // can't clobber each other (unlike the analysis_json RMW handlers). Run them all
    // CONCURRENTLY and collapse ~40-55s (sequential) to ~13s (slowest single call).
    //
    // Incidents Slice 1: ALONGSIDE the narrative proposals, if this source is flagged
    // INCIDENT, also generate its structured incident record. A source can produce BOTH
    // (narrative proposals AND an incident), just one, or neither — the gate lives inside
    // generateIncident (non-incident sources return immediately). Reuses the source
    // content + analysis already read above.
    //
    // allSettled (NOT all): each task already has its own try/catch and never throws, but
    // allSettled additionally guarantees one hung/rejected task can't abort the batch —
    // every task resolves independently. This is still fire-and-forget: the transition
    // does NOT await generateProposals, so nothing here blocks the new->review flip.
    const tasks: Promise<void>[] = touched.map(cell =>
      generateOneProposal(articleId, infoPage, cell.section, cell.geography, sourceText, priorAi),
    )
    tasks.push(generateIncident(articleId, sourceText, priorAi, actingUserId))
    await Promise.allSettled(tasks)
  } catch (e) {
    console.warn('[precommit] generateProposals crashed (transition already succeeded):', (e as Error)?.message)
  }
}
