import { cloud } from './client'
import { isOnline, reportCloudResult } from './connection'
import { getDatabase } from '../db'

// ── Off-card ASSIGNMENTS: cloud-sourced with a local offline MIRROR (To-Do 2.5) ─
// Follows the notificationsCloud.ts two-tier convention: cloud (Supabase, via the
// service-role `cloud` client) is the SOURCE OF TRUTH, the local SQLite
// `assignments` table is an OFFLINE MIRROR, every function returns { ok, error? }
// or an array instead of throwing, and reads short-circuit to the mirror when
// offline. Renderer → IPC → main → here; the renderer never touches Supabase.
//
// ⚠ THIS IS NOT A personalSync TABLE. Assignments are multi-user and
// permission-bearing — personalSync's contract is single-owner only. This module
// deliberately mirrors boards.ts (workspace_tasks), NOT cloud/personalSync.ts:
// cloud-first writes, a read-side mirror upsert, no personal_sync_queue.
//
// SHAPE (locked, 2.5 design diagnosis):
//   • ONE ROW PER (assignment × assignee) — assignee_email is a SCALAR column.
//   • assigner_email IS `assigned_by`.
//   • source_type/source_id are RESERVED for slice 5 (intel directives) and are
//     NEVER read or written by 2.5 code — they pass through as NULL.
//
// 2.5a is READ-ONLY from the UI: listAssignedTo/listAssignedBy feed the two tabs.
// createAssignment exists so the module is complete for 2.5b/2.5c but nothing in
// 2.5a calls it.

export interface AssignmentRow {
  id: string
  // 2.5a-fix: the board this assignment is scoped to. NOT NULL in both stores —
  // every off-card assignment belongs to exactly one board (the head-gate anchor).
  board_id: string
  assigner_email: string
  assignee_email: string
  title: string
  body: string | null
  due_date: string | null
  due_time: string | null
  completed_at: string | null
  source_type: string | null
  source_id: string | null
  created_at: string
  updated_at: string
}

const SELECT_COLS =
  'id, board_id, assigner_email, assignee_email, title, body, due_date, due_time, completed_at, source_type, source_id, created_at, updated_at'
const PAGE_LIMIT = 200

// Cloud created_at/updated_at are TIMESTAMPTZ (ISO, 'T' + offset); the local
// columns are DATETIME written by CURRENT_TIMESTAMP as 'YYYY-MM-DD HH:MM:SS' (UTC,
// space). Normalize cloud → the LOCAL shape so the mirror stays internally
// consistent and string-ordered comparisons match SQLite. Same helper as
// notificationsCloud.toLocalTimestamp — kept local to avoid coupling the modules.
// NULL passes through as NULL (completed_at is nullable).
function toLocalTs(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const s = String(value)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s.slice(0, 19).replace('T', ' ')
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function fromCloud(r: Record<string, unknown>): AssignmentRow {
  return {
    id: String(r.id),
    board_id: String(r.board_id ?? ''),
    assigner_email: String(r.assigner_email ?? ''),
    assignee_email: String(r.assignee_email ?? ''),
    title: String(r.title ?? ''),
    body: (r.body as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    due_time: (r.due_time as string | null) ?? null,
    completed_at: toLocalTs(r.completed_at),
    source_type: (r.source_type as string | null) ?? null,
    source_id: (r.source_id as string | null) ?? null,
    created_at: toLocalTs(r.created_at) ?? '',
    updated_at: toLocalTs(r.updated_at) ?? '',
  }
}

// Refresh the mirror from a cloud read. UPSERT BY ID — NEVER delete-then-insert
// (same rule as notifications: the mirror is not a pure cache and this app has no
// assignment delete path). One transaction so a partial write cannot tear the set.
// Best-effort: the read is already satisfied from cloud, so a mirror failure must
// NOT fail it. No pending_sync guard is needed in 2.5a — nothing writes the mirror
// offline yet, so cloud is unconditionally the newer version on a conflict.
function syncMirror(rows: AssignmentRow[]): void {
  if (!rows.length) return
  try {
    const db = getDatabase()
    const ins = db.prepare(`
      INSERT INTO assignments
        (id, board_id, assigner_email, assignee_email, title, body, due_date, due_time,
         completed_at, source_type, source_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        title        = excluded.title,
        body         = excluded.body,
        due_date     = excluded.due_date,
        due_time     = excluded.due_time,
        completed_at = excluded.completed_at,
        updated_at   = excluded.updated_at`)
    const tx = db.transaction((list: AssignmentRow[]) => {
      for (const r of list) {
        ins.run(
          r.id, r.board_id, r.assigner_email, r.assignee_email, r.title, r.body, r.due_date,
          r.due_time, r.completed_at, r.source_type, r.source_id, r.created_at, r.updated_at,
        )
      }
    })
    tx(rows)
  } catch (e) {
    console.warn('[assignments] local mirror sync failed (read still served from cloud):', (e as Error)?.message)
  }
}

// Mirror reads for the two tabs (offline fallback + last-known cache). 2.5c: returns
// BOTH open and completed rows — same predicate as the cloud query, so offline and
// online return the same set. The renderer splits active vs done and strikes through
// completed items (matching personal + kc-deadline); vanishing on complete was the
// inconsistent behaviour we dropped.
function readAssignedToMirror(email: string): AssignmentRow[] {
  try {
    return getDatabase()
      .prepare(`SELECT ${SELECT_COLS} FROM assignments WHERE LOWER(assignee_email)=LOWER(?) ORDER BY created_at DESC LIMIT ${PAGE_LIMIT}`)
      .all(email) as AssignmentRow[]
  } catch (e) {
    console.warn('[assignments] mirror read (assigned-to) failed:', (e as Error)?.message)
    return []
  }
}

function readAssignedByMirror(email: string): AssignmentRow[] {
  try {
    return getDatabase()
      .prepare(`SELECT ${SELECT_COLS} FROM assignments WHERE LOWER(assigner_email)=LOWER(?) ORDER BY created_at DESC LIMIT ${PAGE_LIMIT}`)
      .all(email) as AssignmentRow[]
  } catch (e) {
    console.warn('[assignments] mirror read (assigned-by) failed:', (e as Error)?.message)
    return []
  }
}

// "Assigned to me". Cloud read → refresh mirror → return; offline or cloud error
// FALLS BACK to the mirror. reportCloudResult is correct here (this is a READ — a
// failure legitimately informs the connection verdict, unlike the write paths).
export async function listAssignedTo(email: string): Promise<AssignmentRow[]> {
  if (!email) return []
  if (!isOnline()) return readAssignedToMirror(email)
  try {
    const { data, error } = await cloud
      .from('assignments')
      .select(SELECT_COLS)
      // 2.5a-fix: EXACT match, not .ilike — emails are stored lowercased on write
      // (createAssignment), so a lowercased .eq removes the wildcard surface .ilike
      // carried (a '%' or '_' in an address could otherwise match unintended rows).
      .eq('assignee_email', email.toLowerCase())
      // 2.5c: no completed_at filter — completed assignments stay visible (struck
      // through in the done section), consistent with personal + kc-deadline.
      .order('created_at', { ascending: false })
      .limit(PAGE_LIMIT)
    reportCloudResult(!error)
    if (error) {
      console.warn('[assignments] cloud read (assigned-to) failed, serving mirror:', error.message)
      return readAssignedToMirror(email)
    }
    const rows = ((data ?? []) as Record<string, unknown>[]).map(fromCloud)
    syncMirror(rows)
    return rows
  } catch (e) {
    console.warn('[assignments] cloud read (assigned-to) threw, serving mirror:', (e as Error)?.message)
    return readAssignedToMirror(email)
  }
}

// "Assigned by me". Same shape, keyed on assigner_email.
export async function listAssignedBy(email: string): Promise<AssignmentRow[]> {
  if (!email) return []
  if (!isOnline()) return readAssignedByMirror(email)
  try {
    const { data, error } = await cloud
      .from('assignments')
      .select(SELECT_COLS)
      // 2.5a-fix: EXACT lowercased match — see listAssignedTo.
      .eq('assigner_email', email.toLowerCase())
      // 2.5c: no completed_at filter — see listAssignedTo.
      .order('created_at', { ascending: false })
      .limit(PAGE_LIMIT)
    reportCloudResult(!error)
    if (error) {
      console.warn('[assignments] cloud read (assigned-by) failed, serving mirror:', error.message)
      return readAssignedByMirror(email)
    }
    const rows = ((data ?? []) as Record<string, unknown>[]).map(fromCloud)
    syncMirror(rows)
    return rows
  } catch (e) {
    console.warn('[assignments] cloud read (assigned-by) threw, serving mirror:', (e as Error)?.message)
    return readAssignedByMirror(email)
  }
}

// Cloud-first insert + local mirror upsert (boards.ts createTask pattern).
// ⚠ NOT wired to any UI in 2.5a — the write path is 2.5b. Included so the module is
// complete. Online-required, like board-task writes. source_type/source_id default
// to NULL (slice 5 sets them, not 2.5).
//
// ⚠ Does NOT call reportCloudResult — writes must not move the connection verdict
// (same rule as createNotificationCloud).
export async function createAssignment(a: {
  id: string
  board_id: string
  assigner_email: string
  assignee_email: string
  title: string
  body?: string | null
  due_date?: string | null
  due_time?: string | null
  source_type?: string | null
  source_id?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline' }
  // board_id is NOT NULL in both stores — reject a boardless assignment here rather
  // than let the cloud/mirror insert fail obscurely.
  if (!a.board_id) return { ok: false, error: 'board_id required' }
  const stamp = new Date().toISOString()
  // Store emails lowercased so the .eq reads (which lowercase the query side) match
  // exactly — see listAssignedTo. The mirror reads already LOWER() both sides.
  const assigner = a.assigner_email.toLowerCase()
  const assignee = a.assignee_email.toLowerCase()
  try {
    const { error } = await cloud.from('assignments').insert({
      id: a.id,
      board_id: a.board_id,
      assigner_email: assigner,
      assignee_email: assignee,
      title: a.title,
      body: a.body ?? null,
      due_date: a.due_date ?? null,
      due_time: a.due_time ?? null,
      completed_at: null,
      source_type: a.source_type ?? null,
      source_id: a.source_id ?? null,
      created_at: stamp,
      updated_at: stamp,
    })
    if (error) return { ok: false, error: error.message }
    // Mirror the new row so the two tabs reflect it before the next cloud read.
    syncMirror([
      fromCloud({
        id: a.id,
        board_id: a.board_id,
        assigner_email: assigner,
        assignee_email: assignee,
        title: a.title,
        body: a.body ?? null,
        due_date: a.due_date ?? null,
        due_time: a.due_time ?? null,
        completed_at: null,
        source_type: a.source_type ?? null,
        source_id: a.source_id ?? null,
        created_at: stamp,
        updated_at: stamp,
      }),
    ])
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'insert failed' }
  }
}

// 2.5c: mark an assignment done (completedAt = ISO) or reopen it (completedAt = null).
// Cloud-first field-level update, then the SAME two fields into the mirror so the
// To-Do done section reflects it before the next read. Online-required, like
// createAssignment.
//
// NOT a full syncMirror upsert: this patches ONLY the two fields the action changes
// (the board todo:complete local-UPDATE pattern), so it can never clobber
// title/body/etc that a concurrent read would carry, and it needs no full-row
// reconstruction. completed_at is normalized through toLocalTs so the mirror's
// second-precision copy stays ordering-consistent with cloud (the done section sorts
// on completed_at). A mirror miss (row not yet mirrored) no-ops harmlessly — the next
// read re-syncs it.
export async function setAssignmentCompleted(id: string, completedAt: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline' }
  if (!id) return { ok: false, error: 'id required' }
  const stamp = new Date().toISOString()
  try {
    const { error } = await cloud.from('assignments')
      .update({ completed_at: completedAt, updated_at: stamp })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    try {
      getDatabase()
        .prepare('UPDATE assignments SET completed_at=?, updated_at=? WHERE id=?')
        .run(toLocalTs(completedAt), toLocalTs(stamp), id)
    } catch (e) {
      console.warn('[assignments] mirror completed-update failed (cloud write ok):', (e as Error)?.message)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'update failed' }
  }
}

// 2.5d: set an assignment's notes (the existing `body` column — no new column).
// Cloud-first field-level update + mirror, same shape as setAssignmentCompleted.
// Online-required. The IPC handler gates assignee-or-head before calling this.
export async function setAssignmentBody(id: string, body: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline' }
  if (!id) return { ok: false, error: 'id required' }
  const stamp = new Date().toISOString()
  try {
    const { error } = await cloud.from('assignments')
      .update({ body, updated_at: stamp })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    try {
      getDatabase().prepare('UPDATE assignments SET body=?, updated_at=? WHERE id=?')
        .run(body, toLocalTs(stamp), id)
    } catch (e) {
      console.warn('[assignments] mirror body-update failed (cloud write ok):', (e as Error)?.message)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'update failed' }
  }
}
