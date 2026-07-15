import { cloud } from './client'
import { getDatabase } from '../db'
import { resolveActor } from './boards'

// ── Known tags: cloud-sourced with a local offline MIRROR (Stage 2, intel) ───
// First of the intel-side cloud migrations (template for intelligence_sources
// and info_page_sources). Cloud `known_tags` is the source of truth; the local
// SQLite `known_tags` table is kept as an OFFLINE MIRROR (not legacy) so reads
// still work with no network. All access is renderer → IPC → main → here; the
// renderer never touches Supabase. The service-role key bypasses RLS (main is
// the trusted tier); RLS on the table is the backstop against the anon key.
//
// Scope key is `project_board_id` (a real workspace_boards id). The 5 NULL-scoped
// disposition rows were intentionally NOT migrated (dead data — no tab reads them).

// Normalize a free-text tag: trim, lowercase, collapse whitespace → hyphens.
// This is the SINGLE source of tag normalization (ipc/index.ts imports it too).
export function normalizeTag(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, '-')
}

type TagType = 'thematic' | 'disposition'
const coerceType = (type: string): TagType => (type === 'disposition' ? 'disposition' : 'thematic')

// Overwrite the local mirror for one (type, boardId) scope from a fresh cloud
// read. Delete-then-insert runs in ONE transaction so a partial write can never
// leave the mirror emptied. Best-effort: a mirror failure must NOT fail the read.
function syncMirror(type: TagType, boardId: string, names: string[]): void {
  try {
    const db = getDatabase()
    const tx = db.transaction((rows: string[]) => {
      db.prepare('DELETE FROM known_tags WHERE type=? AND project_board_id=?').run(type, boardId)
      const ins = db.prepare('INSERT OR IGNORE INTO known_tags (name, type, project_board_id) VALUES (?, ?, ?)')
      for (const n of rows) ins.run(n, type, boardId)
    })
    tx(names)
  } catch (e) {
    console.warn('[tags] local mirror sync failed (read still served from cloud):', (e as Error)?.message)
  }
}

// Read the local mirror for a scope (offline fallback + last-known cache).
function readMirror(type: TagType, boardId: string): string[] {
  try {
    const rows = getDatabase()
      .prepare('SELECT name FROM known_tags WHERE type=? AND project_board_id=? ORDER BY name COLLATE NOCASE ASC')
      .all(type, boardId) as { name: string }[]
    return rows.map(r => r.name)
  } catch (e) {
    console.warn('[tags] local mirror read failed:', (e as Error)?.message)
    return []
  }
}

// Cloud read → refresh the local mirror → return names. On cloud error, FALL
// BACK to the mirror (offline reads must work). Never throws; always string[].
export async function getKnownTags(type: string, boardId: string): Promise<string[]> {
  const t = coerceType(type)
  if (!boardId) return []
  const { data, error } = await cloud
    .from('known_tags')
    .select('name')
    .eq('type', t)
    .eq('project_board_id', boardId)
    .order('name', { ascending: true })
  if (error) {
    console.warn('[tags] cloud getKnownTags failed, serving local mirror:', error.message)
    return readMirror(t, boardId)
  }
  const names = ((data ?? []) as { name: string }[]).map(r => r.name)
  syncMirror(t, boardId, names)
  return names
}

// Cloud upsert (idempotent) → mirror locally. created_by_email = the acting
// user's email. On cloud error: return the failure and do NOT touch the mirror.
export async function createTag(
  actingUserId: string | undefined,
  name: string,
  type: string,
  boardId: string,
): Promise<{ ok: boolean; name: string; error?: string }> {
  const t = coerceType(type)
  const norm = normalizeTag(name)
  if (!norm) return { ok: false, name: '' }
  if (!boardId) return { ok: false, name: '' }
  const actor = await resolveActor(actingUserId)
  const now = new Date().toISOString()
  const { error } = await cloud.from('known_tags').upsert(
    { name: norm, type: t, project_board_id: boardId, created_by_email: actor.email || null, created_at: now },
    { onConflict: 'name,type,project_board_id', ignoreDuplicates: true },
  )
  if (error) return { ok: false, name: '', error: `tag create failed: ${error.message}` }
  try {
    getDatabase()
      .prepare('INSERT OR IGNORE INTO known_tags (name, type, project_board_id, created_at) VALUES (?, ?, ?, ?)')
      .run(norm, t, boardId, now)
  } catch (e) {
    console.warn('[tags] local mirror insert failed (cloud write succeeded):', (e as Error)?.message)
  }
  return { ok: true, name: norm }
}

// Permission-gated cloud delete → mirror delete. On cloud error: return the
// failure and do NOT touch the mirror. Gate is unchanged from the old handler.
export async function deleteTag(
  actingUserId: string | undefined,
  name: string,
  type: string,
  boardId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot && !actor.can('delete_intel_tag')) {
    return { ok: false, error: 'You do not have permission to delete intelligence tags.' }
  }
  const t = coerceType(type)
  const { error } = await cloud
    .from('known_tags')
    .delete()
    .eq('name', name)
    .eq('type', t)
    .eq('project_board_id', boardId)
  if (error) return { ok: false, error: `tag delete failed: ${error.message}` }
  try {
    getDatabase().prepare('DELETE FROM known_tags WHERE name=? AND type=? AND project_board_id=?').run(name, t, boardId)
  } catch (e) {
    console.warn('[tags] local mirror delete failed (cloud delete succeeded):', (e as Error)?.message)
  }
  return { ok: true }
}
