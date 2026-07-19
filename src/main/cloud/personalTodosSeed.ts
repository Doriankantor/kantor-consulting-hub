import { cloud } from './client'
import { isOnline } from './connection'
import { resolveIdentity } from './boards'
import { getDatabase } from '../db'

// ── One-time translate-backfill: local personal to-do rows → cloud (slice 1a) ──
// Mirrors seedBoardsToCloud / seedContactsToCloud, with one structural difference:
// this is NOT admin-gated and NOT "founding dataset" gated. Personal to-dos are
// owner-scoped, so EVERY user's machine must upload ITS OWN rows — an emptiness
// check on the cloud table would make the second user's device a no-op and silently
// strand their data.
//
// THE TRANSLATION IS THE POINT. Local rows are keyed by local_users.id, which is
// minted per-device with crypto.randomUUID() and therefore means nothing on another
// machine. resolveIdentity() (boards.ts) is the ONE existing implementation of the
// id/email/'local-admin' three-shape resolution — reused here rather than restated.
//
// Rows whose user_id does not resolve are SKIPPED AND LOGGED, never dropped and
// never reassigned to the admin: an unattributable to-do handed to the wrong owner
// is worse than one left behind, and the local row remains the record of it.
//
// Local rows are NEVER modified or deleted by this function.

const FLAG = 'personal_todos_cloud_backfill_v1'

function getFlag(): boolean {
  try {
    const row = getDatabase().prepare('SELECT value FROM settings WHERE key=?').get(FLAG) as { value?: string } | undefined
    return row?.value === 'done'
  } catch { return false }
}

function setFlag(): void {
  try {
    getDatabase().prepare(
      "INSERT INTO settings (key,value,updated_at) VALUES (?,'done',CURRENT_TIMESTAMP) " +
      'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP'
    ).run(FLAG)
  } catch (e) {
    console.warn('[personalTodos] could not persist backfill flag:', (e as Error)?.message)
  }
}

async function upsertBatch(table: string, rows: Record<string, unknown>[], conflictCol: string): Promise<number> {
  if (!rows.length) return 0
  const BATCH = 200
  let uploaded = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    // ignoreDuplicates:false — a re-run should refresh the cloud row rather than skip
    // it, which is what makes this safe to retry after a partial failure.
    const { error } = await cloud.from(table).upsert(chunk, { onConflict: conflictCol, ignoreDuplicates: false })
    if (error) throw new Error(`backfill ${table} failed: ${error.message}`)
    uploaded += chunk.length
  }
  return uploaded
}

export async function backfillPersonalTodosToCloud(): Promise<{
  ok: boolean
  todos?: number
  dismissed?: number
  skipped?: number
  reason?: string
}> {
  if (getFlag()) return { ok: true, reason: 'already backfilled' }
  if (!isOnline()) return { ok: false, reason: 'offline — will retry next launch' }

  const db = getDatabase()

  // Cache id → email. resolveIdentity hits SQLite per call; the row count here is
  // small, but the map also lets us count DISTINCT unresolvable owners for the log.
  const emailFor = new Map<string, string>()
  const resolve = (userId: string): string => {
    const hit = emailFor.get(userId)
    if (hit !== undefined) return hit
    const email = (resolveIdentity(userId).email ?? '').toLowerCase()
    emailFor.set(userId, email)
    return email
  }

  let skipped = 0

  const todoRows = db.prepare(
    'SELECT id, user_id, title, due_date, due_time, completed, completed_at, position, created_at, updated_at FROM personal_todos'
  ).all() as Record<string, unknown>[]

  const todos: Record<string, unknown>[] = []
  for (const r of todoRows) {
    const email = resolve(r.user_id as string)
    if (!email) {
      skipped++
      console.warn(`[personalTodos] SKIP todo ${r.id} — user_id "${r.user_id}" does not resolve to an email. Title: ${JSON.stringify(r.title)}`)
      continue
    }
    todos.push({
      id: r.id,
      user_email: email,
      title: r.title,
      due_date: r.due_date ?? null,
      due_time: r.due_time ?? null,
      completed: r.completed ?? 0,
      completed_at: r.completed_at ?? null,
      position: r.position ?? null,
      created_at: r.created_at ?? new Date().toISOString(),
      updated_at: r.updated_at ?? r.created_at ?? new Date().toISOString(),
    })
  }

  const dismissedRows = db.prepare('SELECT user_id, task_id, dismissed_at FROM todo_dismissed').all() as Record<string, unknown>[]
  const dismissed: Record<string, unknown>[] = []
  for (const r of dismissedRows) {
    const email = resolve(r.user_id as string)
    if (!email) {
      skipped++
      console.warn(`[personalTodos] SKIP dismissal task_id=${r.task_id} — user_id "${r.user_id}" does not resolve to an email.`)
      continue
    }
    dismissed.push({ user_email: email, task_id: r.task_id, dismissed_at: r.dismissed_at ?? new Date().toISOString() })
  }

  // personal_todo_steps has no pre-existing local rows — nothing to translate.

  const nTodos = await upsertBatch('personal_todos', todos, 'id')
  const nDismissed = await upsertBatch('todo_dismissed', dismissed, 'user_email,task_id')

  // Flag set ONLY after both upserts succeed. A throw above leaves it unset so the
  // next launch retries; the upserts are idempotent, so a partial run costs nothing.
  setFlag()
  return { ok: true, todos: nTodos, dismissed: nDismissed, skipped }
}

// Launch entry point. NEVER throws — a migration must not be able to break startup.
export function runPersonalTodosBackfill(): void {
  backfillPersonalTodosToCloud()
    .then(r => {
      if (r.reason === 'already backfilled') return
      if (!r.ok) { console.log(`[personalTodos] backfill deferred: ${r.reason}`); return }
      console.log(`[personalTodos] backfill complete — ${r.todos} to-do(s), ${r.dismissed} dismissal(s) uploaded, ${r.skipped} skipped`)
    })
    .catch(e => console.warn('[personalTodos] backfill failed, will retry next launch:', (e as Error)?.message))
}
