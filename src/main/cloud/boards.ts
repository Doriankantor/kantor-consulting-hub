import { randomUUID } from 'crypto'
import { cloud, CLOUD_ADMIN_EMAIL } from './client'
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
export interface Actor { email: string; isAdmin: boolean }

// Resolve the acting user → stable email + admin flag. Accepts a local_users.id,
// the 'local-admin' literal, OR an email (the renderer may pass either). When no
// explicit value is given, falls back to the ambient acting user. Admin detection
// logic is unchanged: 'local-admin' literal, OR email === CLOUD_ADMIN_EMAIL
// (case-normalized), OR local_users.role === 'admin'.
export function resolveActor(actingUserOrId?: string | null): Actor {
  const value = actingUserOrId ?? ambientActingUserId
  if (!value) return { email: '', isAdmin: false }
  if (value === 'local-admin') return { email: CLOUD_ADMIN_EMAIL, isAdmin: true }
  // Explicit email passed directly (renderer may stamp email instead of id).
  if (value.includes('@')) {
    const email = value.toLowerCase()
    if (email === CLOUD_ADMIN_EMAIL) return { email, isAdmin: true }
    try {
      const row = getDatabase().prepare('SELECT role FROM local_users WHERE LOWER(email)=?').get(email) as { role?: string } | undefined
      return { email, isAdmin: row?.role === 'admin' }
    } catch { return { email, isAdmin: false } }
  }
  try {
    const row = getDatabase()
      .prepare('SELECT email, role FROM local_users WHERE id=?')
      .get(value) as { email?: string; role?: string } | undefined
    const email = (row?.email ?? '').toLowerCase()
    const isAdmin = email === CLOUD_ADMIN_EMAIL || row?.role === 'admin'
    return { email, isAdmin }
  } catch {
    return { email: '', isAdmin: false }
  }
}

// Board ids the actor may see. Admin → all (non-deleted). Else → membership by email.
async function visibleBoardIds(actor: Actor): Promise<Set<string>> {
  if (actor.isAdmin) {
    const { data, error } = await cloud.from('workspace_boards').select('id').eq('deleted', 0)
    if (error) throw new Error(`boards visibility failed: ${error.message}`)
    return new Set((data ?? []).map((r: { id: string }) => r.id))
  }
  if (!actor.email) return new Set()
  const { data, error } = await cloud
    .from('board_members').select('board_id').eq('user_email', actor.email)
  if (error) throw new Error(`membership lookup failed: ${error.message}`)
  return new Set((data ?? []).map((r: { board_id: string }) => r.board_id))
}

async function actorCanAccessBoard(actor: Actor, boardId: string): Promise<boolean> {
  if (actor.isAdmin) return true
  return (await visibleBoardIds(actor)).has(boardId)
}

export async function boardIdOfTask(taskId: string): Promise<string | null> {
  const { data, error } = await cloud.from('workspace_tasks').select('board_id').eq('id', taskId).single()
  if (error && error.code !== 'PGRST116') throw new Error(`task lookup failed: ${error.message}`)
  return (data?.board_id as string | undefined) ?? null
}

async function actorCanAccessTask(actor: Actor, taskId: string): Promise<boolean> {
  if (actor.isAdmin) return true
  const boardId = await boardIdOfTask(taskId)
  return boardId ? (await visibleBoardIds(actor)).has(boardId) : false
}

// ── Reuse helpers for the Realtime manager (NEW — wrap existing logic only) ───
// Whether the acting user may see a given board (admin → all; else membership).
// Reuses resolveActor + visibleBoardIds unchanged.
export async function isBoardVisible(actingUserId: string | undefined, boardId: string | null): Promise<boolean> {
  if (!boardId) return false
  const actor = resolveActor(actingUserId)
  if (actor.isAdmin) return true
  return (await visibleBoardIds(actor)).has(boardId)
}

// Relevance for a board_members row change: push if it touches the acting user's
// own email (grant/revoke for them) OR a board they can already see.
export async function boardMembersRelevant(actingUserId: string | undefined, row: Record<string, unknown>): Promise<boolean> {
  const actor = resolveActor(actingUserId)
  if (actor.isAdmin) return true
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
  const actor = resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  let q = cloud.from('workspace_boards').select('*').eq('deleted', 0)
  if (!includeArchived) q = q.eq('archived', 0)
  const { data, error } = await q.order('position', { ascending: true }).order('created_at', { ascending: true })
  if (error) throw new Error(`boards list failed: ${error.message}`)
  return (data ?? []).filter((b: { id: string }) => actor.isAdmin || visible.has(b.id)) as Record<string, unknown>[]
}

export async function listArchivedBoards(actingUserId?: string): Promise<Record<string, unknown>[]> {
  const actor = resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  const { data, error } = await cloud
    .from('workspace_boards').select('*').eq('deleted', 0).eq('archived', 1)
    .order('archived_at', { ascending: false })
  if (error) throw new Error(`boards listArchived failed: ${error.message}`)
  return (data ?? []).filter((b: { id: string }) => actor.isAdmin || visible.has(b.id)) as Record<string, unknown>[]
}

export async function createBoard(actingUserId: string | undefined, name: string): Promise<{ ok: boolean; id: string }> {
  const actor = resolveActor(actingUserId)
  const id = randomUUID()
  const { data: maxRow } = await cloud.from('workspace_boards').select('position').eq('deleted', 0).order('position', { ascending: false }).limit(1).maybeSingle()
  const pos = ((maxRow?.position as number | undefined) ?? -1) + 1
  const { error } = await cloud.from('workspace_boards').insert({ id, name, position: pos, created_at: now(), updated_at: now() })
  if (error) throw new Error(`boards create failed: ${error.message}`)
  // Non-admin creators are added as a member so they can see their new board.
  // Admin never gets a board_members row (per the no-admin-as-member rule).
  if (!actor.isAdmin && actor.email) {
    await cloud.from('board_members').upsert(
      { board_id: id, user_email: actor.email, added_by_email: actor.email, added_at: now() },
      { onConflict: 'board_id,user_email', ignoreDuplicates: true }
    )
  }
  return { ok: true, id }
}

export async function renameBoard(id: string, name: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('workspace_boards').update({ name, updated_at: now() }).eq('id', id)
  if (error) throw new Error(`boards rename failed: ${error.message}`)
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

// Board hard-delete: ADMIN ONLY (enforced here — service role bypasses RLS).
// Writes the board to LOCAL trash first (trash not migrated). Cloud FK CASCADE
// removes columns/tasks/comments/checklists/labels/activity for the board.
export async function deleteBoard(actingUserId: string | undefined, id: string, deletedById?: string, deletedByName?: string): Promise<{ ok: boolean; reason?: string }> {
  const actor = resolveActor(actingUserId)
  if (!actor.isAdmin) return { ok: false, reason: 'Only an admin can delete a board.' }
  const { data: board } = await cloud.from('workspace_boards').select('*').eq('id', id).maybeSingle()
  if (board) {
    try {
      getDatabase().prepare(`INSERT INTO trash (id,item_type,item_id,item_name,item_data_json,deleted_by_id,deleted_by_name,expires_at)
        VALUES (?,?,?,?,?,?,?,datetime('now','+30 days'))`)
        .run(randomUUID(), 'board', id, String((board as Record<string, unknown>).name ?? id), JSON.stringify(board), deletedById ?? null, deletedByName ?? null)
    } catch { /* trash insert must not block delete */ }
  }
  // Cascade blob cleanup: collect all attachment blobs for ALL tasks on this board
  // BEFORE the board row delete (cascade removes tasks+attachments rows; blobs don't self-delete).
  try {
    const { storagePathsForBoard, deleteStorageBlobs } = await getBlobHelpers()
    const paths = await storagePathsForBoard(id)
    await deleteStorageBlobs(paths)
  } catch (e) { console.warn('[boards] attachment blob cascade cleanup failed (board):', (e as Error)?.message) }

  const { error } = await cloud.from('workspace_boards').delete().eq('id', id)
  if (error) throw new Error(`boards delete failed: ${error.message}`)
  return { ok: true }
}

export async function duplicateBoard(actingUserId: string | undefined, _id: string, newName: string): Promise<{ ok: boolean; id: string }> {
  // Mirrors the local behavior: creates a new empty board (does not copy cards).
  return createBoard(actingUserId, newName)
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
  const actor = resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  let q = cloud.from('workspace_columns').select('*')
  if (boardId) q = q.eq('board_id', boardId)
  const { data, error } = await q.order('position', { ascending: true })
  if (error) throw new Error(`columns get failed: ${error.message}`)
  return (data ?? []).filter((c: { board_id: string }) => actor.isAdmin || visible.has(c.board_id)) as Record<string, unknown>[]
}

export async function addColumn(col: { id: string; name: string; position: number; color: string; board_id?: string }): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('workspace_columns').insert({
    id: col.id, name: col.name, position: col.position, color: col.color, board_id: col.board_id ?? 'board-main',
  })
  if (error) throw new Error(`column add failed: ${error.message}`)
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

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────

const mapTask = (r: Record<string, unknown>) => ({ ...r, assignee_ids: JSON.parse((r.assignees_json as string) || '[]') })

export async function getTasks(actingUserId?: string): Promise<Record<string, unknown>[]> {
  const actor = resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  if (!actor.isAdmin && visible.size === 0) return []
  // Active tasks on non-archived boards. Filter to visible boards in JS.
  const { data: boards, error: bErr } = await cloud.from('workspace_boards').select('id').eq('deleted', 0).eq('archived', 0)
  if (bErr) throw new Error(`tasks board filter failed: ${bErr.message}`)
  const activeBoardIds = (boards ?? []).map((b: { id: string }) => b.id)
    .filter((id: string) => actor.isAdmin || visible.has(id))
  if (activeBoardIds.length === 0) return []
  const { data, error } = await cloud.from('workspace_tasks').select('*')
    .in('board_id', activeBoardIds).or('archived.is.null,archived.eq.0')
    .order('position', { ascending: true })
  if (error) throw new Error(`tasks get failed: ${error.message}`)
  return (data ?? []).map(mapTask)
}

export async function getArchivedTasks(actingUserId?: string): Promise<Record<string, unknown>[]> {
  const actor = resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  const { data, error } = await cloud.from('workspace_tasks').select('*').eq('archived', 1)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`archived tasks get failed: ${error.message}`)
  return (data ?? []).filter((t: { board_id: string }) => actor.isAdmin || visible.has(t.board_id)).map(mapTask)
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
  const actor = resolveActor(actingUserId)
  if (!(await actorCanAccessBoard(actor, boardId))) {
    return { ok: false, error: 'Only an admin or an existing member of this board can add members.' }
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
  const actor = resolveActor(actingUserId)
  if (!(await actorCanAccessBoard(actor, boardId))) return { ok: false, error: 'Not allowed.' }
  const targetEmail = resolveEmail(targetUserId)
  if (!targetEmail) return { ok: false, error: 'Could not resolve the user.' }
  const { error } = await cloud.from('board_members').delete().eq('board_id', boardId).eq('user_email', targetEmail)
  if (error) return { ok: false, error: `member remove failed: ${error.message}` }
  return { ok: true }
}

export async function getBoardName(boardId: string): Promise<string> {
  const { data } = await cloud.from('workspace_boards').select('name').eq('id', boardId).maybeSingle()
  return (data?.name as string | undefined) ?? boardId
}

export async function checkAccess(actingUserId: string | undefined, boardId: string): Promise<{ hasAccess: boolean }> {
  const actor = resolveActor(actingUserId)
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
  const actor = resolveActor(actingUserId)
  const { data: boards, error } = await cloud.from('workspace_boards').select('id').eq('deleted', 0).eq('archived', 0)
  if (error) throw new Error(`listForUser failed: ${error.message}`)
  const activeIds = new Set((boards ?? []).map((b: { id: string }) => b.id))
  if (actor.isAdmin) return [...activeIds]
  const visible = await visibleBoardIds(actor)
  return [...visible].filter(id => activeIds.has(id))
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

export async function getComments(taskId: string): Promise<Record<string, unknown>[]> {
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

export async function deleteComment(id: string, deletedById?: string, deletedByName?: string): Promise<{ ok: boolean }> {
  const { data: comment } = await cloud.from('task_comments').select('*').eq('id', id).maybeSingle()
  if (comment) {
    try {
      getDatabase().prepare(`INSERT INTO trash (id,item_type,item_id,item_name,item_data_json,deleted_by_id,deleted_by_name,expires_at)
        VALUES (?,?,?,?,?,?,?,datetime('now','+30 days'))`)
        .run(randomUUID(), 'comment', id, String((comment as Record<string, unknown>).content ?? '').slice(0, 80), JSON.stringify(comment), deletedById ?? null, deletedByName ?? null)
    } catch { /* */ }
  }
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
  const actor = resolveActor(actingUserId)
  const visible = await visibleBoardIds(actor)
  // Resolve which task ids are visible (admin: all; else tasks on visible boards).
  let taskTitle = new Map<string, string>()
  let visibleTaskIds: Set<string> | null = null
  {
    let q = cloud.from('workspace_tasks').select('id,title,board_id')
    const { data, error } = await q
    if (error) throw new Error(`feed task scope failed: ${error.message}`)
    const rows = (data ?? []) as { id: string; title: string; board_id: string }[]
    taskTitle = new Map(rows.map(r => [r.id, r.title]))
    if (!actor.isAdmin) visibleTaskIds = new Set(rows.filter(r => visible.has(r.board_id)).map(r => r.id))
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
