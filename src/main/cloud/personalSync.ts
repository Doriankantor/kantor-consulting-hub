import { cloud } from './client'
import { isOnline } from './connection'
import { resolveIdentity } from './boards'
import { getDatabase } from '../db'

// ── Local-first dual-write + durable sync queue: PERSONAL source only ─────────
// SCOPE IS THE CONTRACT. This file may only ever touch personal_todos,
// personal_todo_steps and todo_dismissed — single-owner tables with no permission
// checks, which is precisely why they are safe to write offline. Board/shared
// sources (workspace_tasks, task_checklists, …) are cloud-authoritative and
// offline-LOCKED; queueing a board write would let two members diverge with no
// merge story. If a future change adds a board table to TABLES below, that is a
// scope violation, not a feature.
//
// MODEL: local write happens FIRST and is the source of truth for reads. The cloud
// write is then attempted in the background; on failure (or offline) the op lands in
// personal_sync_queue and is replayed on reconnect / next launch. Handlers therefore
// never block on the network and never fail because of it.
//
// LWW: every cloud write stamps updated_at = now(), and the local writes stamp it
// too, so the two sides are comparable. Single owner ⇒ last-write-wins needs no
// merge logic; the queue replays in insertion order so a later edit cannot be
// overwritten by an earlier queued one.
//
// OWNER KEY IS ALWAYS user_email, resolved through resolveIdentity — never the
// device-local user_id. This is what stops the historic dk@/doriankantor@ split from
// recurring: one session resolves to exactly one email.

export type SyncOp = 'insert' | 'update' | 'delete'
export type SyncTable = 'personal_todos' | 'personal_todo_steps' | 'todo_dismissed'

// Conflict target per table — mirrors the cloud PKs declared in
// sql/2026-07-19_personal_todos_cloud.sql.
const CONFLICT: Record<SyncTable, string> = {
  personal_todos: 'id',
  personal_todo_steps: 'id',
  todo_dismissed: 'user_email,task_id',
}

export const nowIso = (): string => new Date().toISOString()

/** Device user_id → stable email. Empty string means unresolvable. */
export function ownerEmail(userId: string | null | undefined): string {
  if (!userId) return ''
  try { return (resolveIdentity(userId).email ?? '').toLowerCase() } catch { return '' }
}

/**
 * Build the cloud upsert payload for a personal_todos row, or null if the row is
 * gone / has no resolvable owner. THE CANONICAL BUILDER — the ipc `cloudRowFor`
 * delegates here, and the missed-occurrence evaluator (C-recurring-3) calls it too,
 * so there is exactly ONE column list.
 *
 * ⚠ THIS COLUMN LIST MUST STAY COMPLETE. syncPersonalWrite upserts the WHOLE row,
 * so a column missing here is sent as absent and BLANKED in cloud on the next
 * unrelated write — silent data loss, not a display bug.
 */
export function personalCloudRow(id: string): Record<string, unknown> | null {
  const r = getDatabase().prepare(
    'SELECT id, user_id, title, due_date, due_time, completed, completed_at, position, color, starred, notes, recurrence, recurrence_anchor, series_id, spawned_successor, missed_dates, created_at, updated_at FROM personal_todos WHERE id=?'
  ).get(id) as Record<string, unknown> | undefined
  if (!r) return null
  const email = ownerEmail(r.user_id as string)
  // Unresolvable owner ⇒ no safe cloud identity. Skip rather than guess: the local
  // row still exists and is authoritative for this device's reads.
  if (!email) {
    console.warn(`[personalSync] SKIP cloud write for todo ${id} — user_id "${r.user_id}" does not resolve to an email.`)
    return null
  }
  return {
    id: r.id, user_email: email, title: r.title,
    due_date: r.due_date ?? null, due_time: r.due_time ?? null,
    completed: r.completed ?? 0, completed_at: r.completed_at ?? null,
    position: r.position ?? null,
    color: r.color ?? null, starred: r.starred ?? 0,
    notes: r.notes ?? null,
    recurrence: r.recurrence ?? null, recurrence_anchor: r.recurrence_anchor ?? null,
    series_id: r.series_id ?? null, spawned_successor: r.spawned_successor ?? 0,
    missed_dates: r.missed_dates ?? null,
    created_at: r.created_at ?? nowIso(), updated_at: r.updated_at ?? nowIso(),
  }
}

// ── Queue ────────────────────────────────────────────────────────────────────

function enqueue(op: SyncOp, table: SyncTable, payload: Record<string, unknown>, err?: string): void {
  try {
    getDatabase().prepare(
      'INSERT INTO personal_sync_queue (op, table_name, payload_json, last_error) VALUES (?,?,?,?)'
    ).run(op, table, JSON.stringify(payload), err ?? null)
  } catch (e) {
    // A queue-insert failure is the one case we genuinely cannot recover from, but it
    // still must not break the handler — the local write already succeeded.
    console.warn('[personalSync] could not enqueue op:', (e as Error)?.message)
  }
}

/** Perform one cloud op. Throws on failure so callers can queue it. */
async function applyToCloud(op: SyncOp, table: SyncTable, payload: Record<string, unknown>): Promise<void> {
  if (op === 'delete') {
    const q = cloud.from(table).delete()
    const { error } = table === 'todo_dismissed'
      ? await q.match({ user_email: payload.user_email, task_id: payload.task_id })
      : await q.eq('id', payload.id as string)
    if (error) throw new Error(error.message)
    return
  }
  // insert and update are both upserts — idempotent, so a replayed op is harmless
  // and an update whose insert never landed still converges.
  const { error } = await cloud.from(table).upsert(payload, { onConflict: CONFLICT[table], ignoreDuplicates: false })
  if (error) throw new Error(error.message)
}

/**
 * Dual-write entry point. Call AFTER the local write has succeeded.
 * Never throws, never rejects — a cloud problem must not reach the renderer.
 */
export function syncPersonalWrite(op: SyncOp, table: SyncTable, payload: Record<string, unknown>): void {
  if (!isOnline()) { enqueue(op, table, payload, 'offline at write time'); return }
  applyToCloud(op, table, payload).catch(e => {
    const msg = (e as Error)?.message || 'cloud write failed'
    console.warn(`[personalSync] ${op} ${table} failed, queued for retry:`, msg)
    enqueue(op, table, payload, msg)
  })
}

// ── Drain ────────────────────────────────────────────────────────────────────

let draining = false

export async function drainPersonalSyncQueue(trigger = 'manual'): Promise<void> {
  // In-flight guard: launch-drain and reconnect-drain can otherwise overlap and
  // replay the same rows twice.
  if (draining) return
  if (!isOnline()) return
  draining = true
  try {
    const db = getDatabase()
    const rows = db.prepare(
      'SELECT id, op, table_name, payload_json FROM personal_sync_queue ORDER BY id ASC'
    ).all() as { id: number; op: SyncOp; table_name: SyncTable; payload_json: string }[]
    if (!rows.length) return

    let ok = 0
    let failed = 0
    for (const r of rows) {
      try {
        await applyToCloud(r.op, r.table_name, JSON.parse(r.payload_json))
        db.prepare('DELETE FROM personal_sync_queue WHERE id=?').run(r.id)
        ok++
      } catch (e) {
        failed++
        db.prepare('UPDATE personal_sync_queue SET attempts=attempts+1, last_error=? WHERE id=?')
          .run((e as Error)?.message || 'unknown error', r.id)
        // Left in place for the next drain — never dropped.
      }
    }
    const remaining = (db.prepare('SELECT COUNT(*) AS n FROM personal_sync_queue').get() as { n: number }).n
    console.log(`[personalSync] drained ${ok} ok, ${failed} failed, ${remaining} remaining (${trigger})`)
  } catch (e) {
    console.warn('[personalSync] drain aborted:', (e as Error)?.message)
  } finally {
    draining = false
  }
}

/** Launch entry point — never throws. */
export function runPersonalSyncDrain(trigger = 'launch'): void {
  drainPersonalSyncQueue(trigger).catch(e =>
    console.warn('[personalSync] drain failed:', (e as Error)?.message))
}
