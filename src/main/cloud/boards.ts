import { randomUUID } from 'crypto'
import { cloud, CLOUD_ADMIN_EMAIL } from './client'
import { isOnline, reportCloudResult } from './connection'
import { getDatabase } from '../db'
// Lazy import to avoid a circular dependency (attachmentsCloud imports boards).
async function getBlobHelpers() {
  const m = await import('./attachmentsCloud')
  return { storagePathsForTask: m.storagePathsForTask, storagePathsForBoard: m.storagePathsForBoard, deleteStorageBlobs: m.deleteStorageBlobs }
}

// ── Workspace boards: cloud-sourced (Stage 2, category 3 — DATA ONLY) ────────
// Mirrors the chat/contacts pattern: cloud is the single source of truth for
// workspace_boards, workspace_columns, workspace_tasks, board_members,
// task_comments, task_checklists(+items), task_labels, labels, task_activity,
// task_templates, areas, projects.
//
// task_attachments is OUT OF SCOPE — it stays local and is never read/written here.
//
// MEMBERSHIP-SCOPED VISIBILITY (enforced HERE, in the main process, because the
// service-role key bypasses RLS; the RLS membership policies are a backstop):
//   • admin (CLOUD_ADMIN_EMAIL) sees ALL boards/content, with NO board_members row.
//   • every other user sees only boards they have a board_members row for (keyed
//     by EMAIL, the only identity stable across devices — local_users.id is
//     device-specific), and all content of those boards.
// Writes are attributed to the acting user. Local rows are never deleted by the
// seed; trash (delete) still writes to LOCAL trash (trash not migrated).

const now = () => new Date().toISOString()

// ── Ambient acting user (fallback only) ──────────────────────────────────────
// The board READ path now passes the acting user explicitly (see the IPC layer),
// so visibility never depends on effect ordering. This ambient value is a
// fallback for callers that don't pass an actor (writes attributed elsewhere).
let ambientActingUserId: string | undefined
export function setAmbientActingUser(userId: string | null | undefined): void {
  ambientActingUserId = userId ?? undefined
}

// ── Actor identity ──────────────────────────────────────────────────────────
export interface Actor { email: string; isRoot: boolean; can: (key: string) => boolean }

// Sync identity-only helper: resolves email + root flag without touching Supabase.
// isRoot = (email === CLOUD_ADMIN_EMAIL) — always a hardcoded comparison, never cloud.
// Used for display-name resolution (actorName) and as the inner step of resolveActor.
export function resolveIdentity(actingUserOrId?: string | null): { email: string; isRoot: boolean } {
  const value = actingUserOrId ?? ambientActingUserId
  if (!value) return { email: '', isRoot: false }
  if (value === 'local-admin') return { email: CLOUD_ADMIN_EMAIL, isRoot: true }
  if (value.includes('@')) {
    const email = value.toLowerCase()
    return { email, isRoot: email === CLOUD_ADMIN_EMAIL }
  }
  try {
    const row = getDatabase()
      .prepare('SELECT email FROM local_users WHERE id=?')
      .get(value) as { email?: string } | undefined
    const email = (row?.email ?? '').toLowerCase()
    return { email, isRoot: email === CLOUD_ADMIN_EMAIL }
  } catch {
    return { email: '', isRoot: false }
  }
}

// Resolve the acting user → stable email + root flag + permission-checker.
// isRoot = (email === CLOUD_ADMIN_EMAIL) — hardcoded, never read from cloud.
// can(key): true if isRoot; else true iff a member_permissions row exists for
// (this email, key). Permissions fetched ONCE per resolveActor call and cached
// in the returned closure; multiple can() calls on the same Actor are O(1).
export async function resolveActor(actingUserOrId?: string | null): Promise<Actor> {
  const { email, isRoot } = resolveIdentity(actingUserOrId)
  let permKeys: Set<string> = new Set()
  // Skip the permissions lookup when offline (deny-all) rather than waiting out
  // postgrest's retries on every actor resolution.
  if (!isRoot && email && isOnline()) {
    try {
      const { data } = await cloud
        .from('member_permissions')
        .select('permission_key')
        .eq('user_email', email)
      permKeys = new Set(((data ?? []) as { permission_key: string }[]).map(r => r.permission_key))
    } catch { /* best-effort: deny all on lookup failure */ }
  }
  return { email, isRoot, can: (key: string) => isRoot || permKeys.has(key) }
}

// Board ids the actor may see. Root → all (non-deleted). Else → membership by email.
// OFFLINE (cloud error): do NOT throw — this is the single funnel all three readers
// call first, so a throw here is what breaks offline reads. Root falls back to the
// local board mirror (all non-deleted local boards); non-root falls back to the
// email-keyed board_members_mirror, refreshed on each successful online read.
async function visibleBoardIds(actor: Actor): Promise<Set<string>> {
  if (actor.isRoot) {
    if (!isOnline()) return localBoardIds()                     // offline: skip cloud
    const { data, error } = await cloud.from('workspace_boards').select('id').eq('deleted', 0)
    if (error) {
      console.warn('[boards] cloud visibleBoardIds(root) failed, serving local mirror:', error.message)
      return localBoardIds()
    }
    return new Set((data ?? []).map((r: { id: string }) => r.id))
  }
  if (!actor.email) return new Set()
  if (!isOnline()) return readMembersMirror(actor.email)        // offline: skip cloud
  const { data, error } = await cloud
    .from('board_members').select('board_id').eq('user_email', actor.email)
  if (error) {
    // OFFLINE, non-root: serve the email-keyed local mirror (synced on the last
    // successful online read). Empty if this user has never been read online.
    console.warn('[boards] cloud membership lookup failed offline, serving local members mirror:', error.message)
    return readMembersMirror(actor.email)
  }
  const ids = new Set((data ?? []).map((r: { board_id: string }) => r.board_id))
  syncMembersMirror(actor.email, [...ids])
  return ids
}

// ── LOCAL MIRROR of cloud boards/columns/tasks (offline reads) ───────────────
// Same shape as cloud/tags.ts: on a successful cloud read we refresh the local
// SQLite mirror (SCOPED delete-then-insert in ONE transaction); on a cloud error
// we serve the mirror. Best-effort — a mirror write never fails the read. The
// local tables are a SUPERSET of the cloud columns (verified against db.ts), so
// every cloud row inserts cleanly; we whitelist local columns (below) so an
// unknown cloud column can never break the insert. Local-only rows cloud does NOT
// own (info-page boards, archived tasks) are preserved by SCOPING each delete.
const BOARD_COLS = ['id','name','position','archived','archived_at','archived_by','created_at','updated_at','deleted','board_type','board_config'] as const
const COLUMN_COLS = ['id','name','position','color','board_id'] as const
const TASK_COLS = ['id','board_id','column_id','title','content_type','client','client_id','client_org','area_of_analysis','assignees_json','due_date','start_date','priority','description','notes','sources_json','position','recurrence_json','archived','published_at','deletion_scheduled_at','pre_deletion_archived','created_at','updated_at'] as const

function rowFor(cols: readonly string[], src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of cols) out[c] = src[c] === undefined ? null : src[c]
  return out
}
function insertSql(table: string, cols: readonly string[]): string {
  return `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`
}

// All non-deleted local board ids (root offline fallback for visibleBoardIds).
function localBoardIds(): Set<string> {
  try {
    const rows = getDatabase().prepare('SELECT id FROM workspace_boards WHERE COALESCE(deleted,0)=0').all() as { id: string }[]
    return new Set(rows.map(r => r.id))
  } catch (e) { console.warn('[boards] local board id read failed:', (e as Error)?.message); return new Set() }
}

// Non-deleted, non-archived local board ids (offline fallback for listForUser —
// mirrors its cloud query `deleted=0 AND archived=0`).
function localActiveBoardIds(): Set<string> {
  try {
    const rows = getDatabase()
      .prepare('SELECT id FROM workspace_boards WHERE COALESCE(deleted,0)=0 AND COALESCE(archived,0)=0')
      .all() as { id: string }[]
    return new Set(rows.map(r => r.id))
  } catch (e) { console.warn('[boards] local active board id read failed:', (e as Error)?.message); return new Set() }
}

// BOARD_MEMBERS mirror (email-keyed) — non-root offline visibility. A SEPARATE
// table (board_members_mirror); the legacy user_id-keyed board_members table is
// left untouched. Synced on the visibleBoardIds success path for the acting user:
// replace exactly that email's rows with the fresh cloud set (delete-then-insert
// in one transaction). Best-effort — a mirror write never fails the read.
function syncMembersMirror(email: string, boardIds: string[]): void {
  if (!email) return
  try {
    const db = getDatabase()
    const tx = db.transaction((ids: string[]) => {
      db.prepare('DELETE FROM board_members_mirror WHERE user_email=?').run(email)
      const ins = db.prepare('INSERT OR IGNORE INTO board_members_mirror (board_id, user_email) VALUES (?, ?)')
      for (const id of ids) ins.run(id, email)
    })
    tx(boardIds)
  } catch (e) { console.warn('[boards] local members mirror sync failed (read served from cloud):', (e as Error)?.message) }
}
function readMembersMirror(email: string): Set<string> {
  if (!email) return new Set()
  try {
    const rows = getDatabase().prepare('SELECT board_id FROM board_members_mirror WHERE user_email=?').all(email) as { board_id: string }[]
    return new Set(rows.map(r => r.board_id))
  } catch (e) { console.warn('[boards] local members mirror read failed:', (e as Error)?.message); return new Set() }
}

// BOARDS mirror. Scope: cloud owns STANDARD boards. Info-page boards are created
// LOCAL-ONLY (ipc infoPages:create) and must never be wiped by a cloud sync, so the
// delete excludes board_type='info-page'. When the read excluded archived boards,
// the delete also keeps archived=0 so archived standard boards survive locally.
function syncBoardsMirror(rows: Record<string, unknown>[], includeArchived: boolean): void {
  try {
    const db = getDatabase()
    const tx = db.transaction((boards: Record<string, unknown>[]) => {
      const del = includeArchived
        ? "DELETE FROM workspace_boards WHERE COALESCE(board_type,'standard')<>'info-page'"
        : "DELETE FROM workspace_boards WHERE COALESCE(board_type,'standard')<>'info-page' AND COALESCE(archived,0)=0"
      db.prepare(del).run()
      const ins = db.prepare(insertSql('workspace_boards', BOARD_COLS))
      for (const b of boards) ins.run(rowFor(BOARD_COLS, b))
    })
    tx(rows)
  } catch (e) { console.warn('[boards] local boards mirror sync failed (read served from cloud):', (e as Error)?.message) }
}
function readBoardsMirror(actor: Actor, visible: Set<string>, includeArchived: boolean): Record<string, unknown>[] {
  try {
    // Mirror online listBoards EXACTLY: non-deleted, archive-filtered, visibility-
    // filtered — and NO board_type filter. Info-page boards must stay in the result
    // so the `boards` array feeds Intelligence's project picker + the Info Pages list
    // offline (Intelligence/index.tsx, InfoPages/index.tsx read them from here). The
    // sidebar excludes them via its own renderer filter (Sidebar.tsx). Note: the
    // DELETE guard in syncBoardsMirror still keeps board_type='info-page' — that's a
    // write-side protection for LOCAL-ONLY rows, unrelated to this read.
    let sql = 'SELECT * FROM workspace_boards WHERE COALESCE(deleted,0)=0'
    if (!includeArchived) sql += ' AND COALESCE(archived,0)=0'
    sql += ' ORDER BY position ASC, created_at ASC'
    const rows = getDatabase().prepare(sql).all() as Record<string, unknown>[]
    return rows.filter(b => actor.isRoot || visible.has(String(b.id)))
  } catch (e) { console.warn('[boards] local boards mirror read failed:', (e as Error)?.message); return [] }
}

// ARCHIVED-boards mirror. Separate from syncBoardsMirror because the scopes are
// COMPLEMENTARY: listBoards syncs archived=0 standard boards, this syncs archived=1
// standard boards. Reusing syncBoardsMirror(…, true) would delete BOTH and wipe the
// active boards. Delete guard still excludes info-page (local-only rows).
function syncArchivedBoardsMirror(rows: Record<string, unknown>[]): void {
  try {
    const db = getDatabase()
    const tx = db.transaction((boards: Record<string, unknown>[]) => {
      db.prepare("DELETE FROM workspace_boards WHERE COALESCE(board_type,'standard')<>'info-page' AND COALESCE(archived,0)=1").run()
      const ins = db.prepare(insertSql('workspace_boards', BOARD_COLS))
      for (const b of boards) ins.run(rowFor(BOARD_COLS, b))
    })
    tx(rows)
  } catch (e) { console.warn('[boards] local archived boards mirror sync failed (read served from cloud):', (e as Error)?.message) }
}
function readArchivedBoardsMirror(actor: Actor, visible: Set<string>): Record<string, unknown>[] {
  try {
    // Match online listArchivedBoards: non-deleted, archived=1, visibility-filtered,
    // no board_type filter (parity with readBoardsMirror).
    const rows = getDatabase()
      .prepare('SELECT * FROM workspace_boards WHERE COALESCE(deleted,0)=0 AND COALESCE(archived,0)=1 ORDER BY archived_at DESC')
      .all() as Record<string, unknown>[]
    return rows.filter(b => actor.isRoot || visible.has(String(b.id)))
  } catch (e) { console.warn('[boards] local archived boards mirror read failed:', (e as Error)?.message); return [] }
}

// COLUMNS mirror. Scope: the board_ids just read (a single board when boardId is
// passed, else every board in the result). Columns have no local-only writer.
function syncColumnsMirror(rows: Record<string, unknown>[], boardId?: string): void {
  try {
    const db = getDatabase()
    const boardIds = boardId ? [boardId] : [...new Set(rows.map(r => String(r.board_id)))]
    const tx = db.transaction((cols: Record<string, unknown>[]) => {
      if (boardIds.length) {
        const ph = boardIds.map(() => '?').join(',')
        db.prepare(`DELETE FROM workspace_columns WHERE board_id IN (${ph})`).run(...boardIds)
      }
      const ins = db.prepare(insertSql('workspace_columns', COLUMN_COLS))
      for (const c of cols) ins.run(rowFor(COLUMN_COLS, c))
    })
    tx(rows)
  } catch (e) { console.warn('[boards] local columns mirror sync failed (read served from cloud):', (e as Error)?.message) }
}
function readColumnsMirror(actor: Actor, visible: Set<string>, boardId?: string): Record<string, unknown>[] {
  try {
    let sql = 'SELECT * FROM workspace_columns'
    const params: string[] = []
    if (boardId) { sql += ' WHERE board_id=?'; params.push(boardId) }
    sql += ' ORDER BY position ASC'
    const rows = getDatabase().prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.filter(c => actor.isRoot || visible.has(String(c.board_id)))
  } catch (e) { console.warn('[boards] local columns mirror read failed:', (e as Error)?.message); return [] }
}

// TASKS mirror. Scope: ACTIVE (archived=0/NULL) tasks on the boards just read.
// Archived tasks, and tasks on boards not in this read, survive untouched.
// NOTE: this OVERWRITES local task rows from cloud — see COMMIT 1 report (To-Do):
// todo:complete/uncomplete write column_id/completed_at LOCAL-ONLY, so those local
// changes are reverted here on the next Workspace load until the To-Do write path
// is migrated to cloud.
function syncTasksMirror(rows: Record<string, unknown>[], activeBoardIds: string[]): void {
  try {
    const db = getDatabase()
    const tx = db.transaction((tasks: Record<string, unknown>[]) => {
      if (activeBoardIds.length) {
        const ph = activeBoardIds.map(() => '?').join(',')
        db.prepare(`DELETE FROM workspace_tasks WHERE board_id IN (${ph}) AND COALESCE(archived,0)=0`).run(...activeBoardIds)
      }
      const ins = db.prepare(insertSql('workspace_tasks', TASK_COLS))
      for (const t of tasks) ins.run(rowFor(TASK_COLS, t))
    })
    tx(rows)
  } catch (e) { console.warn('[boards] local tasks mirror sync failed (read served from cloud):', (e as Error)?.message) }
}
function readTasksMirror(actor: Actor, visible: Set<string>): Record<string, unknown>[] {
  try {
    const rows = getDatabase().prepare(`
      SELECT t.* FROM workspace_tasks t
      JOIN workspace_boards b ON b.id = t.board_id
      WHERE COALESCE(b.deleted,0)=0 AND COALESCE(b.archived,0)=0 AND COALESCE(t.archived,0)=0
      ORDER BY t.position ASC
    `).all() as Record<string, unknown>[]
    return rows.filter(t => actor.isRoot || visible.has(String(t.board_id))).map(mapTask)
  } catch (e) { console.warn('[boards] local tasks mirror read failed:', (e as Error)?.message); return [] }
}

// Gate helper for the intel reads (slice 0a-2). Returns the acting user's root
// flag + visible board id set in ONE call. Uses resolveIdentity (LOCAL-ONLY: email
// + isRoot, no cloud) rather than resolveActor, which does a member_permissions
// cloud roundtrip per call — the gate needs only email + isRoot and is called 6× per
// tab load. visibleBoardIds reads ONLY .isRoot and .email off the Actor and never
// calls .can(), so the synthesized `can: () => isRoot` is safe — do NOT "fix" this to
// resolveActor; it would add six needless cloud roundtrips per tab load.
export async function visibleBoardIdsFor(
  actingUserOrId?: string | null,
): Promise<{ isRoot: boolean; ids: Set<string> }> {
  const { email, isRoot } = resolveIdentity(actingUserOrId)
  const ids = await visibleBoardIds({ email, isRoot, can: () => isRoot })
  return { isRoot, ids }
}

async function actorCanAccessBoard(actor: Actor, boardId: string): Promise<boolean> {
  if (actor.isRoot) return true
  return (await visibleBoardIds(actor)).has(boardId)
}

export async function boardIdOfTask(taskId: string): Promise<string | null> {
  const { data, error } = await cloud.from('workspace_tasks').select('board_id').eq('id', taskId).single()
  if (error && error.code !== 'PGRST116') throw new Error(`task lookup failed: ${error.message}`)
  return (data?.board_id as string | undefined) ?? null
}

async function actorCanAccessTask(actor: Actor, taskId: string): Promise<boolean> {
  if (actor.isRoot) return true
  const boardId = await boardIdOfTask(taskId)
  return boardId ? (await visibleBoardIds(actor)).has(boardId) : false
}

// ── Reuse helpers for the Realtime manager (NEW — wrap existing logic only) ───
// Whether the acting user may see a given board (admin → all; else membership).
// Reuses resolveActor + visibleBoardIds unchanged.
export async function isBoardVisible(actingUserId: string | undefined, boardId: string | null): Promise<boolean> {
  if (!boardId) return false
  const actor = await resolveActor(actingUserId)
  if (actor.isRoot) return true
  return (await visibleBoardIds(actor)).has(boardId)
}

// Relevance for a board_members row change: push if it touches the acting user's
// own email (grant/revoke for them) OR a board they can already see.
export async function boardMembersRelevant(actingUserId: string | undefined, row: Record<string, unknown>): Promise<boolean> {
  const actor = await resolveActor(actingUserId)
  if (actor.isRoot) return true
  const rowEmail = String(row?.user_email ?? '').toLowerCase()
  if (rowEmail && rowEmail === actor.email) return true
  const boardId = row?.board_id as string | undefined
  if (boardId && (await visibleBoardIds(actor)).has(boardId)) return true
  return false
}

// Resolve a target identifier (a local_users.id OR an email) to a stable email.
function resolveEmail(idOrEmail: string): string {
  if (!idOrEmail) return ''
  if (idOrEmail.includes('@')) return idOrEmail.toLowerCase()
  if (idOrEmail === 'local-admin') return CLOUD_ADMIN_EMAIL
  try {
    const row = getDatabase().prepare('SELECT email FROM local_users WHERE id=?').get(idOrEmail) as { email?: string } | undefined
    return (row?.email ?? '').toLowerCase()
  } catch { return '' }
}

// ─────────────────────────────────────────────────────────────────────────────
// BOARDS
// ─────────────────────────────────────────────────────────────────────────────

export async function listBoards(actingUserId: string | undefined, includeArchived = false): Promise<Record<string, unknown>[]> {
  const actor = await resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  if (!isOnline()) return readBoardsMirror(actor, visible, includeArchived)   // offline: serve mirror immediately
  let q = cloud.from('workspace_boards').select('*').eq('deleted', 0)
  if (!includeArchived) q = q.eq('archived', 0)
  const { data, error } = await q.order('position', { ascending: true }).order('created_at', { ascending: true })
  reportCloudResult(!error)
  if (error) {
    console.warn('[boards] cloud listBoards failed, serving local mirror:', error.message)
    return readBoardsMirror(actor, visible, includeArchived)
  }
  const rows = (data ?? []).filter((b: { id: string }) => actor.isRoot || visible.has(b.id)) as Record<string, unknown>[]
  syncBoardsMirror(rows, includeArchived)
  return rows
}

export async function listArchivedBoards(actingUserId?: string): Promise<Record<string, unknown>[]> {
  const actor = await resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  if (!isOnline()) return readArchivedBoardsMirror(actor, visible)            // offline: serve mirror immediately
  const { data, error } = await cloud
    .from('workspace_boards').select('*').eq('deleted', 0).eq('archived', 1)
    .order('archived_at', { ascending: false })
  reportCloudResult(!error)
  if (error) {
    console.warn('[boards] cloud listArchivedBoards failed, serving local mirror:', error.message)
    return readArchivedBoardsMirror(actor, visible)
  }
  const rows = (data ?? []).filter((b: { id: string }) => actor.isRoot || visible.has(b.id)) as Record<string, unknown>[]
  syncArchivedBoardsMirror(rows)
  return rows
}

export async function createBoard(
  actingUserId: string | undefined,
  name: string,
  boardType?: string,
  boardConfig?: string | null,
): Promise<{ ok: boolean; id: string; error?: string }> {
  const actor = await resolveActor(actingUserId)
  // Board creation is admin-only. Root sees all boards via isRoot and needs no
  // board_members row; non-root members cannot create boards.
  if (!actor.isRoot) return { ok: false, id: '', error: 'Only an admin can create boards.' }
  const id = randomUUID()
  const { data: maxRow } = await cloud.from('workspace_boards').select('position').eq('deleted', 0).order('position', { ascending: false }).limit(1).maybeSingle()
  const pos = ((maxRow?.position as number | undefined) ?? -1) + 1
  // board_type/board_config are optional: when omitted, a standard board is created
  // exactly as before (board_type 'standard', board_config null). Info-page boards
  // pass their type/config through (see B0.4/B0.6).
  const { error } = await cloud.from('workspace_boards').insert({
    id, name, position: pos,
    board_type: boardType ?? 'standard',
    board_config: boardConfig ?? null,
    created_at: now(), updated_at: now(),
  })
  if (error) throw new Error(`boards create failed: ${error.message}`)
  return { ok: true, id }
}

export async function renameBoard(id: string, name: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('workspace_boards').update({ name, updated_at: now() }).eq('id', id)
  if (error) throw new Error(`boards rename failed: ${error.message}`)
  return { ok: true }
}

// Admin-gated board_config update (used by the Info Pages edit form). Mirrors
// renameBoard; the only board_config WRITE path besides createBoard's insert.
export async function updateBoardConfig(actingUserId: string | undefined, id: string, boardConfig: string | null): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return { ok: false, error: 'Only an admin can edit board settings.' }
  const { error } = await cloud.from('workspace_boards').update({ board_config: boardConfig, updated_at: now() }).eq('id', id)
  if (error) return { ok: false, error: `board config update failed: ${error.message}` }
  return { ok: true }
}

// Mirrors reorderColumns: admin-only, writes dense 0..n-1 positions (also cleans
// up any legacy sparse/duplicate positions). Callers pass only the boards visible
// in the sidebar list, so Info Pages are never included here.
export async function reorderBoards(boardIds: string[], actingUserId?: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return { ok: false, error: 'Only an admin can reorder boards.' }
  await Promise.all(boardIds.map((id, index) =>
    cloud.from('workspace_boards').update({ position: index, updated_at: now() }).eq('id', id)))
  return { ok: true }
}

export async function archiveBoard(id: string, archivedBy: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('workspace_boards')
    .update({ archived: 1, archived_at: now(), archived_by: archivedBy, updated_at: now() }).eq('id', id)
  if (error) throw new Error(`boards archive failed: ${error.message}`)
  return { ok: true }
}

export async function restoreBoard(id: string): Promise<{ ok: boolean }> {
  const { data: maxRow } = await cloud.from('workspace_boards').select('position').eq('deleted', 0).eq('archived', 0).order('position', { ascending: false }).limit(1).maybeSingle()
  const pos = ((maxRow?.position as number | undefined) ?? -1) + 1
  const { error } = await cloud.from('workspace_boards')
    .update({ archived: 0, archived_at: null, archived_by: null, position: pos, updated_at: now() }).eq('id', id)
  if (error) throw new Error(`boards restore failed: ${error.message}`)
  return { ok: true }
}

// Board soft-delete: ADMIN ONLY. Sets deleted=1 in cloud; board is recoverable.
// Blobs are NOT cleaned up here — they survive until permanent deletion.
export async function deleteBoard(actingUserId: string | undefined, id: string, _deletedById?: string, _deletedByName?: string): Promise<{ ok: boolean; reason?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return { ok: false, reason: 'Only root can delete a board.' }
  const { error } = await cloud.from('workspace_boards').update({ deleted: 1, updated_at: now() }).eq('id', id)
  if (error) throw new Error(`boards soft-delete failed: ${error.message}`)
  return { ok: true }
}

export async function listTrashedBoards(actingUserId: string | undefined): Promise<Record<string, unknown>[]> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return []
  const { data, error } = await cloud.from('workspace_boards').select('*').eq('deleted', 1).order('updated_at', { ascending: false })
  if (error) throw new Error(`boards listTrashed failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

// Permanent delete: hard-DELETE from cloud + clean up storage blobs. ADMIN ONLY.
export async function permanentlyDeleteBoard(actingUserId: string | undefined, id: string): Promise<{ ok: boolean; reason?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return { ok: false, reason: 'Only root can permanently delete a board.' }
  try {
    const { storagePathsForBoard, deleteStorageBlobs } = await getBlobHelpers()
    const paths = await storagePathsForBoard(id)
    await deleteStorageBlobs(paths)
  } catch (e) { console.warn('[boards] blob cleanup failed (permanent delete):', (e as Error)?.message) }
  const { error } = await cloud.from('workspace_boards').delete().eq('id', id)
  if (error) throw new Error(`boards permanent delete failed: ${error.message}`)
  return { ok: true }
}

export async function undeleteBoard(id: string): Promise<{ ok: boolean }> {
  const { data: maxRow } = await cloud.from('workspace_boards').select('position').eq('deleted', 0).eq('archived', 0).order('position', { ascending: false }).limit(1).maybeSingle()
  const pos = ((maxRow?.position as number | undefined) ?? -1) + 1
  const { error } = await cloud.from('workspace_boards').update({ deleted: 0, position: pos, updated_at: now() }).eq('id', id)
  if (error) throw new Error(`boards undelete failed: ${error.message}`)
  return { ok: true }
}

export async function duplicateBoard(actingUserId: string | undefined, id: string, newName: string): Promise<{ ok: boolean; id: string }> {
  // Mirrors the local behavior: creates a new empty board (does not copy cards).
  // Carry the source board's type/config so duplicating an info-page board keeps
  // its board_type/board_config (falls back to standard/null if the source is gone).
  const { data: src } = await cloud.from('workspace_boards')
    .select('board_type,board_config').eq('id', id).maybeSingle()
  return createBoard(
    actingUserId,
    newName,
    src?.board_type as string | undefined,
    src?.board_config as string | null | undefined,
  )
}

export async function boardTaskCount(id: string): Promise<number> {
  const { count, error } = await cloud.from('workspace_tasks').select('id', { count: 'exact', head: true }).eq('board_id', id)
  if (error) throw new Error(`boards taskCount failed: ${error.message}`)
  return count ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUMNS
// ─────────────────────────────────────────────────────────────────────────────

export async function getColumns(actingUserId: string | undefined, boardId?: string): Promise<Record<string, unknown>[]> {
  const actor = await resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  if (!isOnline()) return readColumnsMirror(actor, visible, boardId)          // offline: serve mirror immediately
  let q = cloud.from('workspace_columns').select('*')
  if (boardId) q = q.eq('board_id', boardId)
  const { data, error } = await q.order('position', { ascending: true })
  reportCloudResult(!error)
  if (error) {
    console.warn('[boards] cloud getColumns failed, serving local mirror:', error.message)
    return readColumnsMirror(actor, visible, boardId)
  }
  const rows = (data ?? []).filter((c: { board_id: string }) => actor.isRoot || visible.has(c.board_id)) as Record<string, unknown>[]
  syncColumnsMirror(rows, boardId)
  return rows
}

const SYSTEM_COLUMN_IDS = new Set([
  'col-scoping', 'col-research', 'col-drafting', 'col-review', 'col-delivery', 'col-published',
])

export async function addColumn(col: { id: string; name: string; position: number; color: string; board_id?: string }, actingUserId?: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return { ok: false, error: 'Only an admin can add stages.' }
  const { error } = await cloud.from('workspace_columns').insert({
    id: col.id, name: col.name, position: col.position, color: col.color, board_id: col.board_id ?? 'board-main',
  })
  if (error) throw new Error(`column add failed: ${error.message}`)
  return { ok: true }
}

export async function deleteColumn(colId: string, actingUserId?: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return { ok: false, error: 'Only an admin can delete stages.' }
  if (SYSTEM_COLUMN_IDS.has(colId)) return { ok: false, error: 'System stages cannot be deleted.' }
  const { count } = await cloud.from('workspace_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('column_id', colId).eq('archived', 0)
  if ((count ?? 0) > 0) return { ok: false, error: 'Stage is not empty. Move or archive its cards first.' }
  const { error } = await cloud.from('workspace_columns').delete().eq('id', colId)
  if (error) throw new Error(`column delete failed: ${error.message}`)
  return { ok: true }
}

export async function updateColumn(colId: string, partial: { name?: string; position?: number }): Promise<{ ok: boolean }> {
  const patch: Record<string, unknown> = {}
  if (partial.name !== undefined) patch.name = partial.name
  if (partial.position !== undefined) patch.position = partial.position
  if (Object.keys(patch).length) {
    const { error } = await cloud.from('workspace_columns').update(patch).eq('id', colId)
    if (error) throw new Error(`column update failed: ${error.message}`)
  }
  return { ok: true }
}

export async function reorderColumns(columnIds: string[]): Promise<void> {
  await Promise.all(columnIds.map((id, index) => updateColumn(id, { position: index })))
}

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────

const mapTask = (r: Record<string, unknown>) => ({ ...r, assignee_ids: JSON.parse((r.assignees_json as string) || '[]') })

export async function getTasks(actingUserId?: string): Promise<Record<string, unknown>[]> {
  const actor = await resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  if (!actor.isRoot && visible.size === 0) return []
  if (!isOnline()) return readTasksMirror(actor, visible)                     // offline: serve mirror immediately
  // Active tasks on non-archived boards. Filter to visible boards in JS.
  const { data: boards, error: bErr } = await cloud.from('workspace_boards').select('id').eq('deleted', 0).eq('archived', 0)
  reportCloudResult(!bErr)
  if (bErr) {
    console.warn('[boards] cloud getTasks board filter failed, serving local mirror:', bErr.message)
    return readTasksMirror(actor, visible)
  }
  const activeBoardIds = (boards ?? []).map((b: { id: string }) => b.id)
    .filter((id: string) => actor.isRoot || visible.has(id))
  if (activeBoardIds.length === 0) return []
  const { data, error } = await cloud.from('workspace_tasks').select('*')
    .in('board_id', activeBoardIds).or('archived.is.null,archived.eq.0')
    .order('position', { ascending: true })
  reportCloudResult(!error)
  if (error) {
    console.warn('[boards] cloud getTasks failed, serving local mirror:', error.message)
    return readTasksMirror(actor, visible)
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  syncTasksMirror(rows, activeBoardIds)
  return rows.map(mapTask)
}

export async function getBoardTasks(actingUserId: string | undefined, boardId: string): Promise<Record<string, unknown>[]> {
  // Unlike getTasks, this fetches a single board's tasks regardless of the
  // board's archived flag — used by the read-only Visualize view for archived
  // boards. Same visibility rules and same task-level archived filter.
  const actor = await resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  if (!actor.isRoot && !visible.has(boardId)) return []
  const { data, error } = await cloud.from('workspace_tasks').select('*')
    .eq('board_id', boardId).or('archived.is.null,archived.eq.0')
    .order('position', { ascending: true })
  if (error) throw new Error(`board tasks get failed: ${error.message}`)
  return (data ?? []).map(mapTask)
}

export async function getArchivedTasks(actingUserId?: string): Promise<Record<string, unknown>[]> {
  const actor = await resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  const { data, error } = await cloud.from('workspace_tasks').select('*').eq('archived', 1)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`archived tasks get failed: ${error.message}`)
  return (data ?? []).filter((t: { board_id: string }) => actor.isRoot || visible.has(t.board_id)).map(mapTask)
}

export async function archiveTask(taskId: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('workspace_tasks').update({ archived: 1, updated_at: now() }).eq('id', taskId)
  if (error) throw new Error(`task archive failed: ${error.message}`)
  return { ok: true }
}

export async function restoreTask(taskId: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('workspace_tasks').update({ archived: 0, updated_at: now() }).eq('id', taskId)
  if (error) throw new Error(`task restore failed: ${error.message}`)
  return { ok: true }
}

// ── Completed Projects: mark-for-deletion + completion data layer ─────────────

export async function markForDeletion(taskId: string): Promise<{ ok: boolean }> {
  // Snapshot current archived flag so undelete can return the task to the right place.
  const { data: existing } = await cloud.from('workspace_tasks').select('archived').eq('id', taskId).maybeSingle()
  const wasArchived = (existing as Record<string, unknown> | null)?.archived ?? 0
  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await cloud.from('workspace_tasks').update({
    deletion_scheduled_at: thirtyDaysOut,
    pre_deletion_archived: wasArchived,
    archived: 1,
    updated_at: now(),
  }).eq('id', taskId)
  if (error) throw new Error(`mark for deletion failed: ${error.message}`)
  return { ok: true }
}

export async function adminMarkForDeletion(taskId: string, actingUserId?: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return { ok: false, error: 'Only an admin can delete completed projects.' }
  return markForDeletion(taskId)
}

export async function undeleteTask(taskId: string): Promise<{ ok: boolean }> {
  // Restore archived state from the snapshot taken at mark time.
  const { data: existing } = await cloud.from('workspace_tasks').select('pre_deletion_archived').eq('id', taskId).maybeSingle()
  const restoreArchived = (existing as Record<string, unknown> | null)?.pre_deletion_archived ?? 0
  const { error } = await cloud.from('workspace_tasks').update({
    archived: restoreArchived,
    deletion_scheduled_at: null,
    pre_deletion_archived: null,
    updated_at: now(),
  }).eq('id', taskId)
  if (error) throw new Error(`undelete task failed: ${error.message}`)
  return { ok: true }
}

export async function markCompleteNow(taskId: string): Promise<{ ok: boolean }> {
  // Archive the task and stamp published_at if not already set (idempotent on published_at).
  const { data: existing } = await cloud.from('workspace_tasks').select('published_at').eq('id', taskId).maybeSingle()
  const alreadyPublished = (existing as Record<string, unknown> | null)?.published_at
  const patch: Record<string, unknown> = { archived: 1, updated_at: now() }
  if (!alreadyPublished) patch.published_at = now()
  const { error } = await cloud.from('workspace_tasks').update(patch).eq('id', taskId)
  if (error) throw new Error(`mark complete now failed: ${error.message}`)
  return { ok: true }
}

export async function getCompletedTasks(actingUserId?: string): Promise<Record<string, unknown>[]> {
  const actor = await resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  const { data, error } = await cloud.from('workspace_tasks').select('*')
    .eq('archived', 1)
    .is('deletion_scheduled_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`completed tasks get failed: ${error.message}`)
  return (data ?? []).filter((t: { board_id: string }) => actor.isRoot || visible.has(t.board_id)).map(mapTask)
}

export async function getMarkedForDeletionTasks(actingUserId?: string): Promise<Record<string, unknown>[]> {
  const actor = await resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  const { data, error } = await cloud.from('workspace_tasks').select('*')
    .not('deletion_scheduled_at', 'is', null)
    .order('deletion_scheduled_at', { ascending: true })
  if (error) throw new Error(`marked for deletion tasks get failed: ${error.message}`)
  return (data ?? []).filter((t: { board_id: string }) => actor.isRoot || visible.has(t.board_id)).map(mapTask)
}

export async function createTask(t: {
  id: string; board_id?: string; column_id: string; title: string; content_type: string;
  client: string | null; area_of_analysis: string | null; assignee_ids: string[];
  due_date: string | null; start_date: string | null; priority: string;
  description: string | null; notes: string | null; sources_json: string | null; position: number
}): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('workspace_tasks').insert({
    id: t.id, board_id: t.board_id ?? 'board-main', column_id: t.column_id, title: t.title,
    content_type: t.content_type, client: t.client, area_of_analysis: t.area_of_analysis,
    assignees_json: JSON.stringify(t.assignee_ids ?? []),
    due_date: t.due_date, start_date: t.start_date, priority: t.priority,
    description: t.description, notes: t.notes, sources_json: t.sources_json,
    position: t.position, created_at: now(), updated_at: now(),
  })
  if (error) throw new Error(`task create failed: ${error.message}`)
  return { ok: true }
}

export async function updateTask(taskId: string, partial: Record<string, unknown>): Promise<{ ok: boolean }> {
  const patch: Record<string, unknown> = { updated_at: now() }
  const fields = ['column_id','title','content_type','client','client_id','client_org','area_of_analysis',
    'due_date','start_date','priority','description','notes','sources_json','position','recurrence_json']
  for (const f of fields) { if (f in partial) patch[f] = partial[f] }
  if ('assignee_ids' in partial) patch.assignees_json = JSON.stringify(partial.assignee_ids)

  // Pre-fetch current column_id before the update so we can detect real transitions.
  // Only fetched when a column change is incoming — no overhead on other update types.
  let prevCol: string | undefined
  if ('column_id' in partial) {
    const { data: existing } = await cloud.from('workspace_tasks').select('column_id').eq('id', taskId).maybeSingle()
    prevCol = (existing as Record<string, unknown> | null)?.column_id as string | undefined
  }

  // Stamp published_at into the same patch (one atomic write, one realtime event).
  // Reorders within Published (prevCol === newCol === 'col-published') add nothing.
  if ('column_id' in partial) {
    const newCol = partial.column_id as string
    if (newCol === 'col-published' && prevCol !== 'col-published') {
      patch.published_at = now()
    } else if (newCol !== 'col-published' && prevCol === 'col-published') {
      patch.published_at = null
    }
  }

  const { error } = await cloud.from('workspace_tasks').update(patch).eq('id', taskId)
  if (error) throw new Error(`task update failed: ${error.message}`)

  // Recurring task auto-copy when moved to delivery/published (mirrors local)
  if ('column_id' in partial) {
    const newCol = partial.column_id as string

    if (newCol === 'col-delivery' || newCol === 'col-published') {
      const { data: task } = await cloud.from('workspace_tasks').select('*').eq('id', taskId).maybeSingle()
      const tk = task as Record<string, unknown> | null
      if (tk?.recurrence_json) {
        try {
          const rec = JSON.parse(tk.recurrence_json as string) as { type: string; value: string | number }
          let nextDue: Date | null = null
          if (tk.due_date) {
            const base = new Date(tk.due_date as string)
            if (rec.type === 'weekly')    { nextDue = new Date(base); nextDue.setDate(nextDue.getDate() + 7) }
            if (rec.type === 'monthly')   { nextDue = new Date(base); nextDue.setMonth(nextDue.getMonth() + 1) }
            if (rec.type === 'quarterly') { nextDue = new Date(base); nextDue.setMonth(nextDue.getMonth() + 3) }
            if (rec.type === 'custom')    { nextDue = new Date(base); nextDue.setDate(nextDue.getDate() + Number(rec.value)) }
          }
          const { count } = await cloud.from('workspace_tasks').select('id', { count: 'exact', head: true })
            .eq('board_id', (tk.board_id as string) ?? 'board-main').eq('column_id', 'col-scoping')
          await cloud.from('workspace_tasks').insert({
            id: randomUUID(), board_id: (tk.board_id as string) ?? 'board-main', column_id: 'col-scoping',
            title: tk.title, content_type: tk.content_type, client: tk.client ?? null, client_id: tk.client_id ?? null,
            area_of_analysis: tk.area_of_analysis ?? null, assignees_json: tk.assignees_json ?? '[]',
            due_date: nextDue ? nextDue.toISOString().slice(0, 10) : null,
            start_date: new Date().toISOString().slice(0, 10),
            priority: tk.priority, recurrence_json: tk.recurrence_json, position: count ?? 0,
            created_at: now(), updated_at: now(),
          })
        } catch { /* recurrence copy is best-effort */ }
      }
    }
  }
  return { ok: true }
}

export async function deleteTask(taskId: string, deletedById?: string, deletedByName?: string): Promise<{ ok: boolean }> {
  const { data: task } = await cloud.from('workspace_tasks').select('*').eq('id', taskId).maybeSingle()
  if (task) {
    try {
      getDatabase().prepare(`INSERT INTO trash (id,item_type,item_id,item_name,item_data_json,deleted_by_id,deleted_by_name,expires_at)
        VALUES (?,?,?,?,?,?,?,datetime('now','+30 days'))`)
        .run(randomUUID(), 'task', taskId, String((task as Record<string, unknown>).title ?? taskId), JSON.stringify(task), deletedById ?? null, deletedByName ?? null)
    } catch { /* non-fatal */ }
  }
  // Cascade blob cleanup: delete Storage blobs for this task's attachments BEFORE
  // the row delete (DB FK cascade removes task_attachments rows automatically; blobs need explicit removal).
  // the row delete (DB cascade removes task_attachments rows; blobs need explicit removal).
  try {
    const { storagePathsForTask, deleteStorageBlobs } = await getBlobHelpers()
    const paths = await storagePathsForTask(taskId)
    await deleteStorageBlobs(paths)
  } catch (e) { console.warn('[boards] attachment blob cascade cleanup failed (task):', (e as Error)?.message) }

  const { error } = await cloud.from('workspace_tasks').delete().eq('id', taskId)
  if (error) throw new Error(`task delete failed: ${error.message}`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// BOARD MEMBERS (email-keyed)
// ─────────────────────────────────────────────────────────────────────────────

// List members of a board, enriched with name/role from local_users by email.
export async function listMembers(boardId: string): Promise<{ user_id: string; user_email: string; full_name: string | null; email: string; role: string; added_at: string }[]> {
  if (!isOnline()) return []   // offline: member list unavailable
  const { data, error } = await cloud.from('board_members').select('*').eq('board_id', boardId).order('added_at', { ascending: true })
  if (error) throw new Error(`members list failed: ${error.message}`)
  return ((data ?? []) as { user_email: string; added_at: string }[]).map(m => {
    let full_name: string | null = null, role = 'member'
    try {
      const lu = getDatabase().prepare('SELECT full_name, role FROM local_users WHERE LOWER(email)=?').get(m.user_email.toLowerCase()) as { full_name?: string; role?: string } | undefined
      full_name = lu?.full_name ?? null; role = lu?.role ?? 'member'
    } catch { /* name resolution best-effort */ }
    // user_id carries the EMAIL (the cloud key) so the remove path round-trips.
    return { user_id: m.user_email, user_email: m.user_email, full_name, email: m.user_email, role, added_at: m.added_at }
  })
}

// Add a member. Allowed only if the requester is admin OR an existing member of
// the board (membership can spread member-to-member). targetUserId is a local id;
// it is resolved to the stable email here.
export async function addMember(actingUserId: string | undefined, boardId: string, targetUserId: string, addedByName: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  // Gate: root may add to ANY board. A non-root actor needs BOTH the
  // add_board_members capability AND a real board_members row for THIS board.
  // STRICT membership: query board_members directly. Root is handled above; for a
  // non-root actor only a real board_members row counts (we deliberately avoid
  // actorCanAccessBoard / visibleBoardIds, which short-circuit on isRoot).
  if (!actor.isRoot) {
    if (!actor.can('add_board_members')) {
      return { ok: false, error: 'You do not have permission to add members to boards.' }
    }
    const { data: membership, error: mErr } = await cloud
      .from('board_members').select('board_id')
      .eq('user_email', actor.email).eq('board_id', boardId).maybeSingle()
    if (mErr) return { ok: false, error: `membership check failed: ${mErr.message}` }
    if (!membership) {
      return { ok: false, error: 'You can only add members to boards you belong to.' }
    }
  }
  // Resolve target (local id OR email) → stable email
  const targetEmail = resolveEmail(targetUserId)
  if (!targetEmail) return { ok: false, error: 'Could not resolve the user to add.' }
  if (targetEmail === CLOUD_ADMIN_EMAIL) return { ok: true } // admin never gets a member row

  const { error } = await cloud.from('board_members').upsert(
    { board_id: boardId, user_email: targetEmail, added_by_email: actor.email || addedByName, added_at: now() },
    { onConflict: 'board_id,user_email', ignoreDuplicates: true }
  )
  if (error) return { ok: false, error: `member add failed: ${error.message}` }
  return { ok: true }
}

export async function removeMember(actingUserId: string | undefined, boardId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!(await actorCanAccessBoard(actor, boardId))) return { ok: false, error: 'Not allowed.' }
  const targetEmail = resolveEmail(targetUserId)
  if (!targetEmail) return { ok: false, error: 'Could not resolve the user.' }
  const { error } = await cloud.from('board_members').delete().eq('board_id', boardId).eq('user_email', targetEmail)
  if (error) return { ok: false, error: `member remove failed: ${error.message}` }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// INFO-PAGE OWNERS ("project heads") — email-keyed, mirrors board_members.
// Root-only assignment; isOwner gates the publication side (canApprove).
// ─────────────────────────────────────────────────────────────────────────────

export async function addOwner(actingUserId: string | undefined, pageId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return { ok: false, error: 'Only an admin can assign project heads.' }
  const email = resolveEmail(targetUserId)
  if (!email) return { ok: false, error: 'Could not resolve the user to assign.' }
  const { error } = await cloud.from('info_page_owners').upsert(
    { page_id: pageId, user_email: email, assigned_by_email: actor.email, assigned_at: now() },
    { onConflict: 'page_id,user_email', ignoreDuplicates: true }
  )
  if (error) return { ok: false, error: `owner add failed: ${error.message}` }
  return { ok: true }
}

export async function removeOwner(actingUserId: string | undefined, pageId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(actingUserId)
  if (!actor.isRoot) return { ok: false, error: 'Only an admin can change project heads.' }
  const email = resolveEmail(targetUserId)
  if (!email) return { ok: false, error: 'Could not resolve the user.' }
  const { error } = await cloud.from('info_page_owners').delete().eq('page_id', pageId).eq('user_email', email)
  if (error) return { ok: false, error: `owner remove failed: ${error.message}` }
  return { ok: true }
}

export async function isOwner(actingUserId: string | undefined, pageId: string): Promise<boolean> {
  const actor = await resolveActor(actingUserId)
  if (actor.isRoot) return true   // root approves everything anyway (canApprove = isRoot || isOwner)
  if (!actor.email) return false
  const { data } = await cloud.from('info_page_owners').select('page_id').eq('page_id', pageId).eq('user_email', actor.email).maybeSingle()
  return !!data
}

// List a page's heads, enriched with full_name from local_users by email (mirrors listMembers).
export async function getOwners(pageId: string): Promise<{ user_email: string; full_name: string | null; assigned_at: string }[]> {
  const { data, error } = await cloud.from('info_page_owners').select('*').eq('page_id', pageId).order('assigned_at', { ascending: true })
  if (error) throw new Error(`owners list failed: ${error.message}`)
  return ((data ?? []) as { user_email: string; assigned_at: string }[]).map(o => {
    let full_name: string | null = null
    try {
      const lu = getDatabase().prepare('SELECT full_name FROM local_users WHERE LOWER(email)=LOWER(?)').get(o.user_email) as { full_name?: string } | undefined
      full_name = lu?.full_name ?? null
    } catch { /* name resolution best-effort */ }
    return { user_email: o.user_email, full_name, assigned_at: o.assigned_at }
  })
}

export async function getBoardName(boardId: string): Promise<string> {
  const { data } = await cloud.from('workspace_boards').select('name').eq('id', boardId).maybeSingle()
  return (data?.name as string | undefined) ?? boardId
}

export async function checkAccess(actingUserId: string | undefined, boardId: string): Promise<{ hasAccess: boolean }> {
  const actor = await resolveActor(actingUserId)
  return { hasAccess: await actorCanAccessBoard(actor, boardId) }
}

export async function memberTaskCount(boardId: string, userId: string): Promise<number> {
  // Count tasks on the board assigned to this local user id (assignees store local ids).
  const { data, error } = await cloud.from('workspace_tasks').select('assignees_json').eq('board_id', boardId).or('archived.is.null,archived.eq.0')
  if (error) throw new Error(`member taskCount failed: ${error.message}`)
  let count = 0
  for (const r of (data ?? []) as { assignees_json: string }[]) {
    try { if ((JSON.parse(r.assignees_json || '[]') as string[]).includes(userId)) count++ } catch { /* */ }
  }
  return count
}

// Board ids visible to a user (admin: all non-archived; else their memberships on non-archived boards).
export async function listForUser(actingUserId?: string): Promise<string[]> {
  const actor = await resolveActor(actingUserId)
  // Offline: skip cloud, serve the local active-board mirror ∩ membership. This
  // feeds the Sidebar's memberBoardIds — a throw here empties a NON-root user's
  // sidebar even when the board mirror is fresh (root is unaffected: all boards).
  if (!isOnline()) {
    const localActive = localActiveBoardIds()
    if (actor.isRoot) return [...localActive]
    const visible = await visibleBoardIds(actor)   // → board_members_mirror offline
    return [...visible].filter(id => localActive.has(id))
  }
  const { data: boards, error } = await cloud.from('workspace_boards').select('id').eq('deleted', 0).eq('archived', 0)
  reportCloudResult(!error)
  let activeIds: Set<string>
  if (error) {
    console.warn('[boards] cloud listForUser failed, serving local mirror:', error.message)
    activeIds = localActiveBoardIds()
  } else {
    activeIds = new Set((boards ?? []).map((b: { id: string }) => b.id))
  }
  if (actor.isRoot) return [...activeIds]
  const visible = await visibleBoardIds(actor)
  return [...visible].filter(id => activeIds.has(id))
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

export async function getComments(taskId: string): Promise<Record<string, unknown>[]> {
  if (!isOnline()) return []   // offline: no mirror for comments — view shows "offline — unavailable"
  const { data, error } = await cloud.from('task_comments').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
  if (error) throw new Error(`comments get failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

export async function addComment(c: { task_id: string; author_id: string; author_name: string; content: string; task_title?: string; assignee_ids?: string[] }): Promise<Record<string, unknown>> {
  const entry = { id: randomUUID(), task_id: c.task_id, author_id: c.author_id, author_name: c.author_name, content: c.content, created_at: now() }
  const { error } = await cloud.from('task_comments').insert(entry)
  if (error) throw new Error(`comment add failed: ${error.message}`)
  return entry
}

export async function updateComment(id: string, content: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('task_comments').update({ content, updated_at: now() }).eq('id', id)
  if (error) throw new Error(`comment update failed: ${error.message}`)
  return { ok: true }
}

export async function deleteComment(actingUserId: string | undefined, id: string, deletedById?: string, deletedByName?: string): Promise<{ ok: boolean; error?: string }> {
  const { data: comment } = await cloud.from('task_comments').select('*').eq('id', id).maybeSingle()
  if (!comment) return { ok: true } // already gone
  // Gate: the comment's author, a permitted member, or root. Uses the AMBIENT
  // acting user (NOT the renderer-supplied deletedById, which is only for the
  // trash audit). NOTE: author_id is a per-device local id, so the author
  // override is reliable only on the device the comment was written on (known
  // limitation; a future author_email migration would make it cross-device).
  const actor = await resolveActor(actingUserId)
  const isAuthor = !!actingUserId && (comment as Record<string, unknown>).author_id === actingUserId
  if (!isAuthor && !actor.can('delete_comment') && !actor.isRoot) {
    return { ok: false, error: 'You do not have permission to delete this comment.' }
  }
  try {
    getDatabase().prepare(`INSERT INTO trash (id,item_type,item_id,item_name,item_data_json,deleted_by_id,deleted_by_name,expires_at)
      VALUES (?,?,?,?,?,?,?,datetime('now','+30 days'))`)
      .run(randomUUID(), 'comment', id, String((comment as Record<string, unknown>).content ?? '').slice(0, 80), JSON.stringify(comment), deletedById ?? null, deletedByName ?? null)
  } catch { /* */ }
  const { error } = await cloud.from('task_comments').delete().eq('id', id)
  if (error) throw new Error(`comment delete failed: ${error.message}`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY
// ─────────────────────────────────────────────────────────────────────────────

export async function getActivity(taskId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await cloud.from('task_activity').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(50)
  if (error) throw new Error(`activity get failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

export async function addActivity(e: { task_id: string; actor_name: string; action: string }): Promise<Record<string, unknown>> {
  const row = { id: randomUUID(), task_id: e.task_id, actor_name: e.actor_name, action: e.action, created_at: now() }
  const { error } = await cloud.from('task_activity').insert(row)
  if (error) throw new Error(`activity add failed: ${error.message}`)
  return row
}

// Global feed of recent activity + comments across the actor's visible boards.
export async function getFeed(actingUserId?: string): Promise<Record<string, unknown>[]> {
  if (!isOnline()) return []   // offline: activity feed unavailable
  const actor = await resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  // Resolve which task ids are visible (root: all; else tasks on visible boards).
  let taskTitle = new Map<string, string>()
  let visibleTaskIds: Set<string> | null = null
  {
    let q = cloud.from('workspace_tasks').select('id,title,board_id')
    const { data, error } = await q
    if (error) throw new Error(`feed task scope failed: ${error.message}`)
    const rows = (data ?? []) as { id: string; title: string; board_id: string }[]
    taskTitle = new Map(rows.map(r => [r.id, r.title]))
    if (!actor.isRoot) visibleTaskIds = new Set(rows.filter(r => visible.has(r.board_id)).map(r => r.id))
  }
  const [{ data: acts }, { data: cmts }] = await Promise.all([
    cloud.from('task_activity').select('*').order('created_at', { ascending: false }).limit(120),
    cloud.from('task_comments').select('*').order('created_at', { ascending: false }).limit(120),
  ])
  const merged: Record<string, unknown>[] = []
  for (const a of (acts ?? []) as Record<string, unknown>[]) {
    if (visibleTaskIds && !visibleTaskIds.has(a.task_id as string)) continue
    merged.push({ id: a.id, task_id: a.task_id, actor_name: a.actor_name, action: a.action, created_at: a.created_at, source: 'activity', task_title: taskTitle.get(a.task_id as string) ?? null })
  }
  for (const c of (cmts ?? []) as Record<string, unknown>[]) {
    if (visibleTaskIds && !visibleTaskIds.has(c.task_id as string)) continue
    const content = String(c.content ?? '')
    merged.push({ id: c.id, task_id: c.task_id, actor_name: c.author_name, action: content.length > 80 ? content.slice(0, 80) + '…' : content, created_at: c.created_at, source: 'comment', task_title: taskTitle.get(c.task_id as string) ?? null })
  }
  merged.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return merged.slice(0, 60)
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKLISTS
// ─────────────────────────────────────────────────────────────────────────────

export async function getChecklists(taskId: string): Promise<Record<string, unknown>[]> {
  if (!isOnline()) return []   // offline: no mirror for checklists
  const { data: lists, error } = await cloud.from('task_checklists').select('*').eq('task_id', taskId).order('position', { ascending: true })
  if (error) throw new Error(`checklists get failed: ${error.message}`)
  const out: Record<string, unknown>[] = []
  for (const list of (lists ?? []) as Record<string, unknown>[]) {
    const { data: items } = await cloud.from('task_checklist_items').select('*').eq('checklist_id', list.id as string).order('position', { ascending: true })
    out.push({ ...list, items: items ?? [] })
  }
  return out
}

export async function createChecklist(taskId: string, title: string): Promise<{ ok: boolean; id: string }> {
  const id = randomUUID()
  const { data: maxRow } = await cloud.from('task_checklists').select('position').eq('task_id', taskId).order('position', { ascending: false }).limit(1).maybeSingle()
  const pos = ((maxRow?.position as number | undefined) ?? 0) + 1
  const { error } = await cloud.from('task_checklists').insert({ id, task_id: taskId, title: title.trim(), position: pos })
  if (error) throw new Error(`checklist create failed: ${error.message}`)
  return { ok: true, id }
}

export async function deleteChecklist(checklistId: string): Promise<{ ok: boolean }> {
  // FK CASCADE removes items, but delete explicitly for clarity/parity.
  await cloud.from('task_checklist_items').delete().eq('checklist_id', checklistId)
  const { error } = await cloud.from('task_checklists').delete().eq('id', checklistId)
  if (error) throw new Error(`checklist delete failed: ${error.message}`)
  return { ok: true }
}

export async function addChecklistItem(checklistId: string, taskId: string, text: string): Promise<{ ok: boolean; id: string }> {
  const id = randomUUID()
  const { data: maxRow } = await cloud.from('task_checklist_items').select('position').eq('checklist_id', checklistId).order('position', { ascending: false }).limit(1).maybeSingle()
  const pos = ((maxRow?.position as number | undefined) ?? 0) + 1
  const { error } = await cloud.from('task_checklist_items').insert({ id, checklist_id: checklistId, task_id: taskId, text: text.trim(), checked: 0, position: pos })
  if (error) throw new Error(`checklist item add failed: ${error.message}`)
  return { ok: true, id }
}

export async function toggleChecklistItem(itemId: string, checked: boolean): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('task_checklist_items').update({ checked: checked ? 1 : 0 }).eq('id', itemId)
  if (error) throw new Error(`checklist item toggle failed: ${error.message}`)
  return { ok: true }
}

export async function deleteChecklistItem(itemId: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('task_checklist_items').delete().eq('id', itemId)
  if (error) throw new Error(`checklist item delete failed: ${error.message}`)
  return { ok: true }
}

export async function updateChecklistItem(itemId: string, text: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('task_checklist_items').update({ text: text.trim() }).eq('id', itemId)
  if (error) throw new Error(`checklist item update failed: ${error.message}`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// LABELS + TASK LABELS
// ─────────────────────────────────────────────────────────────────────────────

export async function listLabels(): Promise<Record<string, unknown>[]> {
  if (!isOnline()) return []   // offline: labels unavailable
  const { data, error } = await cloud.from('labels').select('*').order('position', { ascending: true })
  if (error) throw new Error(`labels list failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

export async function createLabel(name: string, color: string): Promise<{ ok: boolean; id: string }> {
  const id = 'label-' + Date.now().toString(36)
  const { data: maxRow } = await cloud.from('labels').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
  const pos = ((maxRow?.position as number | undefined) ?? 0) + 1
  const { error } = await cloud.from('labels').insert({ id, name: name.trim(), color, position: pos })
  if (error) throw new Error(`label create failed: ${error.message}`)
  return { ok: true, id }
}

export async function updateLabel(id: string, name: string, color: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('labels').update({ name: name.trim(), color }).eq('id', id)
  if (error) throw new Error(`label update failed: ${error.message}`)
  return { ok: true }
}

export async function deleteLabel(id: string): Promise<{ ok: boolean }> {
  await cloud.from('task_labels').delete().eq('label_id', id)
  const { error } = await cloud.from('labels').delete().eq('id', id)
  if (error) throw new Error(`label delete failed: ${error.message}`)
  return { ok: true }
}

export async function getTaskLabels(taskId: string): Promise<Record<string, unknown>[]> {
  if (!isOnline()) return []   // offline: no mirror for task labels
  const { data: links, error } = await cloud.from('task_labels').select('label_id').eq('task_id', taskId)
  if (error) throw new Error(`task labels get failed: ${error.message}`)
  const ids = (links ?? []).map((l: { label_id: string }) => l.label_id)
  if (ids.length === 0) return []
  const { data: labels, error: lErr } = await cloud.from('labels').select('*').in('id', ids).order('position', { ascending: true })
  if (lErr) throw new Error(`task labels resolve failed: ${lErr.message}`)
  return (labels ?? []) as Record<string, unknown>[]
}

export async function setTaskLabels(taskId: string, labelIds: string[]): Promise<{ ok: boolean }> {
  await cloud.from('task_labels').delete().eq('task_id', taskId)
  if (labelIds.length) {
    const rows = labelIds.map(label_id => ({ task_id: taskId, label_id }))
    const { error } = await cloud.from('task_labels').upsert(rows, { onConflict: 'task_id,label_id', ignoreDuplicates: true })
    if (error) throw new Error(`task labels set failed: ${error.message}`)
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// AREAS
// ─────────────────────────────────────────────────────────────────────────────

export async function listAreas(): Promise<Record<string, unknown>[]> {
  if (!isOnline()) return []   // offline: renderer falls back to the default areas (see loadAreas)
  const { data, error } = await cloud.from('areas').select('*').order('is_default', { ascending: false }).order('position', { ascending: true })
  if (error) throw new Error(`areas list failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

export async function createArea(name: string, color: string): Promise<{ ok: boolean; id: string }> {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
  const { data: maxRow } = await cloud.from('areas').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
  const pos = ((maxRow?.position as number | undefined) ?? 0) + 1
  const { error } = await cloud.from('areas').insert({ id, name: name.trim(), color, is_default: 0, position: pos })
  if (error) throw new Error(`area create failed: ${error.message}`)
  return { ok: true, id }
}

export async function updateArea(id: string, name: string, color: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('areas').update({ name: name.trim(), color }).eq('id', id)
  if (error) throw new Error(`area update failed: ${error.message}`)
  return { ok: true }
}

export async function deleteArea(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: area } = await cloud.from('areas').select('is_default').eq('id', id).maybeSingle()
  if (!area) return { error: 'Area not found.', ok: false }
  if ((area as { is_default: number }).is_default) return { error: 'Default areas cannot be deleted.', ok: false }
  const { error } = await cloud.from('areas').delete().eq('id', id)
  if (error) throw new Error(`area delete failed: ${error.message}`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllProjects(): Promise<Record<string, unknown>[]> {
  const { data, error } = await cloud.from('projects').select('*').order('updated_at', { ascending: false })
  if (error) throw new Error(`projects get failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

export async function upsertProject(p: Record<string, unknown>): Promise<boolean> {
  const row = {
    id: p.id, title: p.title, description: p.description ?? null, status: p.status ?? 'active',
    owner_id: p.owner_id, created_at: p.created_at ?? now(), updated_at: p.updated_at ?? now(),
  }
  const { error } = await cloud.from('projects').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(`project upsert failed: ${error.message}`)
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export async function listTemplates(boardId?: string): Promise<Record<string, unknown>[]> {
  let q = cloud.from('task_templates').select('*')
  if (boardId) q = q.or(`board_id.eq.${boardId},board_id.is.null`)
  const { data, error } = await q.order('is_builtin', { ascending: false }).order('name', { ascending: true })
  if (error) throw new Error(`templates list failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

export async function createTemplate(data: Record<string, unknown>): Promise<{ ok: boolean; id: string }> {
  const id = randomUUID()
  const { error } = await cloud.from('task_templates').insert({
    id, name: data.name, content_type: data.content_type ?? 'policy-brief',
    duration_days: data.duration_days ?? 7, checklist_json: data.checklist_json ?? '[]',
    is_builtin: 0, board_id: data.board_id ?? null, created_at: now(), updated_at: now(),
  })
  if (error) throw new Error(`template create failed: ${error.message}`)
  return { ok: true, id }
}

export async function updateTemplate(id: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
  const patch: Record<string, unknown> = { updated_at: now() }
  for (const f of ['name', 'content_type', 'duration_days', 'checklist_json']) { if (f in data) patch[f] = data[f] }
  // Only non-builtin templates are editable (mirrors local WHERE is_builtin=0).
  const { error } = await cloud.from('task_templates').update(patch).eq('id', id).eq('is_builtin', 0)
  if (error) throw new Error(`template update failed: ${error.message}`)
  return { ok: true }
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('task_templates').delete().eq('id', id).eq('is_builtin', 0)
  if (error) throw new Error(`template delete failed: ${error.message}`)
  return { ok: true }
}
