import { randomUUID } from 'crypto'
import { cloud } from './client'
import { isOnline, reportCloudResult } from './connection'
import { getDatabase } from '../db'

// ── Sub-steps for off-card ASSIGNMENTS (To-Do 2.5d) ──────────────────────────
// Mirrors personal_todo_steps STRUCTURALLY but is a SEPARATE, MULTI-USER table.
// Cloud (Supabase, service-role `cloud` client) is the SOURCE OF TRUTH; the local
// `assignment_steps` table is the OFFLINE MIRROR. Follows cloud/assignments.ts /
// boards.ts (cloud-first writes, read-side mirror upsert), NEVER personalSync —
// personalSync's scope contract forbids anything but the three single-owner tables,
// and these steps are shared across the assignee + the board head.
//
// completed_at is the done model (NULL = open), matching assignments itself — no
// `checked` int. Timestamps normalized to the local second-precision shape on the
// way into the mirror so ordering stays consistent with cloud reads.

export interface AssignmentStepRow {
  id: string
  assignment_id: string
  text: string
  completed_at: string | null
  position: number
  created_at: string
  updated_at: string
}

const SELECT_COLS = 'id, assignment_id, text, completed_at, position, created_at, updated_at'

function toLocalTs(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const s = String(value)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s.slice(0, 19).replace('T', ' ')
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function fromCloud(r: Record<string, unknown>): AssignmentStepRow {
  return {
    id: String(r.id),
    assignment_id: String(r.assignment_id ?? ''),
    text: String(r.text ?? ''),
    completed_at: toLocalTs(r.completed_at),
    position: r.position === null || r.position === undefined ? 0 : Number(r.position),
    created_at: toLocalTs(r.created_at) ?? '',
    updated_at: toLocalTs(r.updated_at) ?? '',
  }
}

// UPSERT BY ID — never delete-then-insert (same rule as the assignments mirror).
function mirrorUpsert(rows: AssignmentStepRow[]): void {
  if (!rows.length) return
  try {
    const db = getDatabase()
    const ins = db.prepare(`
      INSERT INTO assignment_steps (id, assignment_id, text, completed_at, position, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        text         = excluded.text,
        completed_at = excluded.completed_at,
        position     = excluded.position,
        updated_at   = excluded.updated_at`)
    const tx = db.transaction((list: AssignmentStepRow[]) => {
      for (const r of list) ins.run(r.id, r.assignment_id, r.text, r.completed_at, r.position, r.created_at, r.updated_at)
    })
    tx(rows)
  } catch (e) {
    console.warn('[assignmentSteps] mirror upsert failed (cloud read still served):', (e as Error)?.message)
  }
}

function mirrorDelete(id: string): void {
  try { getDatabase().prepare('DELETE FROM assignment_steps WHERE id=?').run(id) }
  catch (e) { console.warn('[assignmentSteps] mirror delete failed:', (e as Error)?.message) }
}

function readStepsMirror(assignmentIds: string[]): AssignmentStepRow[] {
  if (!assignmentIds.length) return []
  try {
    const ph = assignmentIds.map(() => '?').join(',')
    return getDatabase()
      .prepare(`SELECT ${SELECT_COLS} FROM assignment_steps WHERE assignment_id IN (${ph}) ORDER BY position ASC, created_at ASC`)
      .all(...assignmentIds) as AssignmentStepRow[]
  } catch (e) {
    console.warn('[assignmentSteps] mirror read failed:', (e as Error)?.message)
    return []
  }
}

// Batch-fetch steps for the visible assignments (the aggregator's per-refetch read).
// Cloud-first → refresh mirror → return; offline or error falls back to the mirror.
// reportCloudResult: this is a READ, so a failure legitimately informs the verdict.
export async function listStepsFor(assignmentIds: string[]): Promise<AssignmentStepRow[]> {
  const ids = [...new Set(assignmentIds.filter(Boolean))]
  if (ids.length === 0) return []
  if (!isOnline()) return readStepsMirror(ids)
  try {
    const { data, error } = await cloud
      .from('assignment_steps')
      .select(SELECT_COLS)
      .in('assignment_id', ids)
      .order('position', { ascending: true })
    reportCloudResult(!error)
    if (error) {
      console.warn('[assignmentSteps] cloud read failed, serving mirror:', error.message)
      return readStepsMirror(ids)
    }
    const rows = ((data ?? []) as Record<string, unknown>[]).map(fromCloud)
    mirrorUpsert(rows)
    return rows
  } catch (e) {
    console.warn('[assignmentSteps] cloud read threw, serving mirror:', (e as Error)?.message)
    return readStepsMirror(ids)
  }
}

// ── Writes: cloud-first + mirror. Online-required. NOT reportCloudResult'd (writes
// must not move the connection verdict — the createAssignment rule). ─────────────

export async function createStep(assignmentId: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline' }
  const body = (text ?? '').trim()
  if (!assignmentId || !body) return { ok: false, error: 'assignment and text required' }
  const stamp = new Date().toISOString()
  try {
    // Append at the end: next position after the current max for this parent.
    const { data: last } = await cloud.from('assignment_steps')
      .select('position').eq('assignment_id', assignmentId)
      .order('position', { ascending: false }).limit(1).maybeSingle()
    const pos = (last?.position ?? -1) + 1
    const id = randomUUID()
    const { error } = await cloud.from('assignment_steps').insert({
      id, assignment_id: assignmentId, text: body, completed_at: null,
      position: pos, created_at: stamp, updated_at: stamp,
    })
    if (error) return { ok: false, error: error.message }
    mirrorUpsert([fromCloud({ id, assignment_id: assignmentId, text: body, completed_at: null, position: pos, created_at: stamp, updated_at: stamp })])
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'create failed' }
  }
}

// Toggle open↔done. Read the current completed_at, flip to now|null. Independent of
// the parent assignment's completion (ticking all steps does NOT auto-complete it).
export async function toggleStep(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline' }
  if (!id) return { ok: false, error: 'id required' }
  const stamp = new Date().toISOString()
  try {
    const { data: row, error: rErr } = await cloud.from('assignment_steps')
      .select('completed_at').eq('id', id).maybeSingle()
    if (rErr) return { ok: false, error: rErr.message }
    if (!row) return { ok: false, error: 'no such step' }
    const next = row.completed_at ? null : stamp
    const { error } = await cloud.from('assignment_steps')
      .update({ completed_at: next, updated_at: stamp }).eq('id', id)
    if (error) return { ok: false, error: error.message }
    try {
      getDatabase().prepare('UPDATE assignment_steps SET completed_at=?, updated_at=? WHERE id=?')
        .run(toLocalTs(next), toLocalTs(stamp), id)
    } catch (e) { console.warn('[assignmentSteps] mirror toggle failed (cloud ok):', (e as Error)?.message) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'toggle failed' }
  }
}

export async function deleteStep(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline' }
  if (!id) return { ok: false, error: 'id required' }
  try {
    const { error } = await cloud.from('assignment_steps').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    mirrorDelete(id)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'delete failed' }
  }
}

// Dense-rewrite position = array index (self-heals gaps), like personalTodoStep:reorder.
export async function reorderSteps(assignmentId: string, orderedIds: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline' }
  const ids = Array.isArray(orderedIds) ? orderedIds : []
  if (!assignmentId || ids.length === 0) return { ok: true }
  const stamp = new Date().toISOString()
  try {
    for (let i = 0; i < ids.length; i++) {
      // Guard on assignment_id so a stray/foreign id can only no-op, never reposition
      // another assignment's step (there is no FK to catch that).
      const { error } = await cloud.from('assignment_steps')
        .update({ position: i, updated_at: stamp })
        .eq('id', ids[i]).eq('assignment_id', assignmentId)
      if (error) return { ok: false, error: error.message }
    }
    try {
      const db = getDatabase()
      const stmt = db.prepare('UPDATE assignment_steps SET position=?, updated_at=? WHERE id=? AND assignment_id=?')
      db.transaction((list: string[]) => { list.forEach((id, i) => stmt.run(i, toLocalTs(stamp), id, assignmentId)) })(ids)
    } catch (e) { console.warn('[assignmentSteps] mirror reorder failed (cloud ok):', (e as Error)?.message) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'reorder failed' }
  }
}

// Read one step's parent assignment_id (for the IPC gate — resolve the board/assignee
// from the parent). Local mirror is enough; the row was mirrored on create/list.
export function parentIdOfStep(stepId: string): string | null {
  try {
    const row = getDatabase().prepare('SELECT assignment_id FROM assignment_steps WHERE id=?').get(stepId) as { assignment_id?: string } | undefined
    return row?.assignment_id ?? null
  } catch { return null }
}
