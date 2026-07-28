import { cloud } from './client'
import { isOnline } from './connection'
import { getDatabase } from '../db'

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
const SRC_COLS = ['article_id', 'info_page', 'stage', 'design_notes', 'added_at', 'committed_at', 'source_type'] as const
const MIRROR_UPSERT_SQL =
  `INSERT OR REPLACE INTO info_page_sources (${SRC_COLS.join(',')}) VALUES (${SRC_COLS.map(c => '@' + c).join(',')})`

// ── mirror helpers (best-effort — a mirror write never fails/propagates) ──────
function mirrorUpsertSource(row: Record<string, unknown> | null | undefined): void {
  if (!row) return
  const out: Record<string, unknown> = {}
  for (const c of SRC_COLS) out[c] = row[c] === undefined ? null : row[c]
  try { getDatabase().prepare(MIRROR_UPSERT_SQL).run(out) }
  catch (e) { console.warn('[infoPageSources] mirror upsert failed (cloud write succeeded):', (e as Error)?.message) }
}
function mirrorDeleteSource(articleId: string, infoPage: string): void {
  try { getDatabase().prepare('DELETE FROM info_page_sources WHERE article_id=? AND info_page=?').run(articleId, infoPage) }
  catch (e) { console.warn('[infoPageSources] mirror delete failed (cloud delete succeeded):', (e as Error)?.message) }
}

// Re-fetch ONE cloud info_page_sources row by the composite key and reconcile the
// mirror: upsert it when present, DELETE the local row when the cloud row is gone
// (the delete path is how removeToIntel drops the mirror). Best-effort, never throws.
export async function resyncSourceRow(articleId: string, infoPage: string): Promise<void> {
  const { data, error } = await cloud.from('info_page_sources').select('*')
    .eq('article_id', articleId).eq('info_page', infoPage).maybeSingle()
  if (error) { console.warn('[infoPageSources] cloud re-fetch for mirror failed:', error.message); return }
  if (data) mirrorUpsertSource(data as Record<string, unknown>)
  else mirrorDeleteSource(articleId, infoPage)
}

// WRITER 1 — approval-path route into a project's "New sources" (stage='new').
// Cloud-first + idempotent: upsert with ON CONFLICT (article_id, info_page) DO
// NOTHING (ignoreDuplicates), so a re-approve of an already-routed source is a
// no-op — it neither errors nor duplicates. The companion info_page_changes row
// is logged ONLY when a NEW row was actually inserted (mirrors the old
// INSERT-OR-IGNORE + `changes > 0` guard). Errors propagate; local is touched only
// by the post-success resync.
export async function routeToNew(
  articleId: string, infoPage: string, sourceType: string | null,
): Promise<{ ok: boolean; inserted?: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot route sources while offline' }
  const now = nowIso()
  const { data, error } = await cloud.from('info_page_sources')
    .upsert(
      { article_id: articleId, info_page: infoPage, stage: 'new', source_type: sourceType ?? null, added_at: now },
      { onConflict: 'article_id,info_page', ignoreDuplicates: true },
    )
    .select()
  if (error) return { ok: false, error: `route cloud upsert failed: ${error.message}` }
  const inserted = Array.isArray(data) && data.length > 0
  if (inserted) {
    const { error: cErr } = await cloud.from('info_page_changes')
      .insert({ article_id: articleId, info_page: infoPage, from_stage: null, to_stage: 'new', created_at: now })
    if (cErr) return { ok: false, error: `route change-log insert failed: ${cErr.message}` }
  }
  await resyncSourceRow(articleId, infoPage)
  return { ok: true, inserted }
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

// WRITER 3 — new -> review. Guarded on stage='new'; companion change ('new'->'review')
// only when a row moved. Returns whether it moved (the handler sums the batch).
export async function sendSourceToReview(
  articleId: string, infoPage: string,
): Promise<{ ok: boolean; moved?: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot update sources while offline' }
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
  const { data, error } = await cloud.from('info_page_sources')
    .update({ stage: 'new', design_notes: null })
    .eq('article_id', articleId).eq('info_page', infoPage).eq('stage', 'review')
    .select()
  if (error) return { ok: false, error: `backSourceToNew cloud update failed: ${error.message}` }
  const moved = Array.isArray(data) && data.length > 0
  if (moved) {
    const { error: cErr } = await cloud.from('info_page_changes')
      .insert({ article_id: articleId, info_page: infoPage, from_stage: 'review', to_stage: 'new', created_at: now })
    if (cErr) return { ok: false, error: `backSourceToNew change-log insert failed: ${cErr.message}` }
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
