// ─────────────────────────────────────────────────────────────────────────────
// THE To-Do AGGREGATION LAYER (slice 2)
//
// One normalized list, assembled in MAIN. The renderer only filters and presents
// — it does not know where an item came from beyond the `source` discriminator.
//
// NOT a port of the unified-Trash view: that one normalizes in the RENDERER with
// weak gating. This is net-new, and the gating is the point.
//
// SCOPE (locked, docs 12a1eeb): the TWO sources that EXIST today — `personal` and
// `kc-deadline`. `assigned` (off-card) needs the slice-2.5 assignment entity, and
// `kc-intel` needs slice 5; `kc-meeting` reads Google Calendar LIVE and is
// deliberately NOT here (it is the one source that cannot be assembled locally).
// The TodoItem shape below is built to GROW: those three land as new `source`
// values without reshaping anything.
//
// ORDERING IS DELIBERATELY DUMB. Urgency coding and past-due/today promotion are
// SLICE 3. This returns a stable, boring order and lets the renderer present it.
// ─────────────────────────────────────────────────────────────────────────────

import { getDatabase } from './db'
import { resolveIdentity, visibleBoardIdsFor } from './cloud/boards'
import { assignedToSql } from './assignees'

export type TodoSource = 'personal' | 'kc-deadline'

export interface TodoItem {
  /** Source-prefixed so ids never collide across sources: `personal-<uuid>` / `task-<id>`. */
  id: string
  source: TodoSource
  title: string
  due_date: string | null
  /** Personal only for now — board cards carry a date, not a time. */
  due_time: string | null
  completed: boolean
  completed_at: string | null
  /** Personal only (manual ordering). Board sources have no user-facing position here. */
  position: number | null
  board_id: string | null
  board_name: string | null
  /** Deep-link target: the task id for kc-deadline, null for personal. */
  linked_task_id: string | null
  /**
   * A REFERENCE, never embedded. The rail fetches steps on expand (slice 3), so
   * this list stays cheap regardless of how many steps exist.
   */
  has_steps: boolean
}

// ── Source a — personal ──────────────────────────────────────────────────────
// LOCAL `personal_todos`, `user_id`-keyed. Slice 1a deliberately kept the local
// table id-keyed and translates to email only at the cloud boundary, so this must
// NOT be email-keyed — doing so would match zero rows.
function readPersonal(userId: string): TodoItem[] {
  const rows = getDatabase().prepare(`
    SELECT id, title, due_date, due_time, completed, completed_at, position, created_at
    FROM personal_todos
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as Record<string, unknown>[]

  return rows.map(r => ({
    id: `personal-${r.id}`,
    source: 'personal' as const,
    title: String(r.title ?? ''),
    due_date: (r.due_date as string) ?? null,
    due_time: (r.due_time as string) ?? null,
    completed: !!r.completed,
    completed_at: (r.completed_at as string) ?? null,
    position: r.position === null || r.position === undefined ? null : Number(r.position),
    board_id: null,
    board_name: null,
    linked_task_id: null,
    // TODO(slice 3): read `personal_todo_steps` once the Step Rail writes it.
    // Hardcoded false is CORRECT today, not a stub: the table exists (1a) but has
    // ZERO rows and NO handlers — nothing can write a step yet, so a query would
    // cost a join per item to always return false.
    has_steps: false,
  }))
}

// ── Source b — kc-deadline ───────────────────────────────────────────────────
// Assigned board cards that carry a due date. DOUBLE-GATED — "both, not either":
//
//   BOARD axis: board_id ∈ visibleBoardIdsFor(actingUser)   (fails closed)
//   CARD  axis: the acting user's email ∈ assignees_json
//
// Lose either and the item disappears. Nothing needs to actively clear it because
// this recomputes from current state on every call — the item was never stored.
//
// The board join mirrors readTasksMirror (boards.ts:330) exactly, and it is where
// `deleted` is checked: `workspace_tasks` HAS NO `deleted` COLUMN (verified against
// the schema and TASK_COLS) — soft-delete lives on `workspace_boards`. The JOIN is
// deliberately INNER, so a task whose board_id dangles is excluded rather than
// surfaced ungated; `todo:getMyTasks` uses a LEFT JOIN and would keep it.
async function readKcDeadline(actingUser: string): Promise<TodoItem[]> {
  const { email } = resolveIdentity(actingUser)
  if (!email) return []

  const { isRoot, ids } = await visibleBoardIdsFor(actingUser)
  // Fails closed: a non-root user with an empty visible set sees NOTHING. Do not
  // "fix" this into failing open — see the visibleBoardIds comment in boards.ts.
  if (!isRoot && ids.size === 0) return []

  const rows = getDatabase().prepare(`
    SELECT t.id, t.title, t.due_date, t.completed_at, t.board_id, b.name AS board_name,
           EXISTS (SELECT 1 FROM task_checklist_items ci WHERE ci.task_id = t.id) AS has_steps
    FROM workspace_tasks t
    JOIN workspace_boards b ON b.id = t.board_id
    WHERE COALESCE(b.deleted, 0) = 0
      AND COALESCE(b.archived, 0) = 0
      AND COALESCE(t.archived, 0) = 0
      AND t.due_date IS NOT NULL
      AND ${assignedToSql('t.assignees_json')}
    ORDER BY t.created_at DESC
  `).all(email) as Record<string, unknown>[]

  return rows
    .filter(r => isRoot || ids.has(String(r.board_id)))
    .map(r => ({
      id: `task-${r.id}`,
      source: 'kc-deadline' as const,
      title: String(r.title ?? ''),
      due_date: (r.due_date as string) ?? null,
      due_time: null,
      completed: !!r.completed_at,
      completed_at: (r.completed_at as string) ?? null,
      position: null,
      board_id: (r.board_id as string) ?? null,
      board_name: (r.board_name as string) ?? null,
      linked_task_id: String(r.id),
      has_steps: !!r.has_steps,
    }))
}

/**
 * Assemble the full To-Do list for one user. ALL-LOCAL reads.
 *
 * PER-SOURCE ISOLATION: each source is independently try/caught and degrades to
 * an empty array on failure. One broken source must never empty the whole page —
 * that is the poisoned-Promise.all failure this codebase has already been bitten
 * by. Failures are LOGGED, never swallowed silently.
 */
export async function listTodos(actingUser: string): Promise<TodoItem[]> {
  let personal: TodoItem[] = []
  try {
    personal = readPersonal(actingUser)
  } catch (e) {
    console.warn('[todos] personal source failed — serving the rest:', (e as Error)?.message)
  }

  let deadlines: TodoItem[] = []
  try {
    deadlines = await readKcDeadline(actingUser)
  } catch (e) {
    console.warn('[todos] kc-deadline source failed — serving the rest:', (e as Error)?.message)
  }

  return [...personal, ...deadlines]
}
