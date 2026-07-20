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

/** One Step Rail dot. PERSONAL items only — see the `steps` field below. */
export interface TodoStep {
  id: string
  text: string
  /** 0/1 in SQLite; normalized to a real boolean here so the rail never coerces. */
  checked: boolean
  position: number
}

export interface TodoItem {
  /**
   * Source-prefixed so ids never collide across sources: `personal-<uuid>` / `task-<id>`.
   *
   * ⚠ THIS IS A DISPLAY ID, NOT A WRITE KEY. `personal_todos.id` is the BARE uuid.
   * Every write handler takes the bare id — see `raw_id` below, which exists so the
   * renderer never has to re-derive it by string-slicing.
   */
  id: string
  /**
   * The UNPREFIXED row id, for writes. Personal only (kc-deadline already exposes
   * `linked_task_id`). Added in 3b: step handlers key on `todo_id`, and passing the
   * prefixed id would insert steps pointing at a to-do that does not exist —
   * a SILENT orphan, since no FK exists locally OR in cloud to reject it.
   */
  raw_id: string
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
  /** Board sources only — drives the completion rule and the To-Do area colour dot. */
  column_id: string | null
  area_of_analysis: string | null
  /**
   * A REFERENCE, never embedded — the rail fetches steps on expand.
   *
   * ⚠ NOT TRUSTWORTHY YET. This reads LOCAL `task_checklist_items`, but every
   * checklist WRITE handler goes to cloud and there is NO cloud→local mirror for
   * checklists (verified: no CHECKLIST_COLS, no sync). The local table is a frozen
   * pre-migration snapshot, so this reports both false negatives (item added since)
   * and false positives (checklist deleted in cloud). NOTHING CONSUMES IT YET —
   * the Step Rail is slice 3b, which must fix the mirror first.
   *
   * ⚠ SCOPE NOTE (3b): the PERSONAL half of this is now real — `readPersonal`
   * derives it from `steps.length`. Only the kc-deadline half remains untrustworthy.
   */
  has_steps: boolean
  /**
   * The Step Rail's data. PERSONAL ITEMS ONLY — `undefined` for kc-deadline, whose
   * steps are card checklists (slice 4, gated by the EDIT tier) and are deliberately
   * NOT surfaced here.
   */
  steps?: TodoStep[]
  /**
   * PERSONAL ONLY (slice A-1) — deliberately absent on kc-deadline. A board card
   * has no per-user row to carry a star, and its colour comes from its board/column,
   * so these are structurally inapplicable rather than merely unimplemented.
   *
   * `color` is a PALETTE KEY ('indigo', …) resolved by the renderer's
   * utils/todoColors.ts, NOT a hex — see that module for why.
   */
  color?: string | null
  starred?: boolean
  /** Slice B. Free-text notes (plain text). NULL/absent = no notes. */
  notes?: string | null
  /**
   * Slice C-recurring (personal only). `recurrence` NULL = non-recurring; else
   * daily|weekly|weekdays|monthly|yearly. `series_id` links every instance of one
   * recurring to-do. `spawned_successor` = 1 once completing this instance has
   * generated the next (idempotency guard against double-spawn on re-complete).
   */
  recurrence?: string | null
  recurrence_anchor?: string | null
  series_id?: string | null
  spawned_successor?: number
}

// ── Source a — personal ──────────────────────────────────────────────────────
// LOCAL `personal_todos`, `user_id`-keyed. Slice 1a deliberately kept the local
// table id-keyed and translates to email only at the cloud boundary, so this must
// NOT be email-keyed — doing so would match zero rows.
function readPersonal(userId: string): TodoItem[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT id, title, due_date, due_time, completed, completed_at, position,
           color, starred, notes, recurrence, recurrence_anchor, series_id,
           spawned_successor, created_at
    FROM personal_todos
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as Record<string, unknown>[]

  // ── Steps, in ONE query for the whole list (3b) ────────────────────────────
  // Not per-item: personal scale is tiny, but an N+1 here would be N prepared
  // statements per To-Do refetch, and refetches fire on every realtime push.
  // Keyed by the BARE todo id, which is what `personal_todo_steps.todo_id` holds.
  const stepsByTodo = new Map<string, TodoStep[]>()
  if (rows.length) {
    try {
      const ph = rows.map(() => '?').join(',')
      const stepRows = db.prepare(`
        SELECT id, todo_id, text, checked, position
        FROM personal_todo_steps
        WHERE todo_id IN (${ph})
        ORDER BY position ASC, created_at ASC
      `).all(...rows.map(r => String(r.id))) as Record<string, unknown>[]
      for (const s of stepRows) {
        const key = String(s.todo_id)
        const list = stepsByTodo.get(key) ?? []
        list.push({
          id: String(s.id),
          text: String(s.text ?? ''),
          checked: !!s.checked,
          // NULLable with no default (unlike personal_todos.position, which 1a
          // backfilled). Coerce so the renderer never sorts on undefined.
          position: s.position === null || s.position === undefined ? 0 : Number(s.position),
        })
        stepsByTodo.set(key, list)
      }
    } catch (e) {
      // Steps are an ENHANCEMENT — a failure here must not cost the user their
      // to-do list. Degrade to no rails, same spirit as the per-source isolation.
      console.warn('[todos] personal steps read failed — serving items without rails:', (e as Error)?.message)
    }
  }

  return rows.map(r => {
    const steps = stepsByTodo.get(String(r.id)) ?? []
    return {
    id: `personal-${r.id}`,
    raw_id: String(r.id),
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
    column_id: null,
    area_of_analysis: null,
    // REAL as of 3b — was hardcoded false while nothing could write a step.
    has_steps: steps.length > 0,
    steps,
    // A-1. Coerced 0/1 → boolean here so no consumer ever has to remember that
    // SQLite has no bool; `color` passes through as the stored PALETTE KEY.
    color: (r.color as string) ?? null,
    starred: !!r.starred,
    notes: (r.notes as string) ?? null,
    recurrence: (r.recurrence as string) ?? null,
    recurrence_anchor: (r.recurrence_anchor as string) ?? null,
    series_id: (r.series_id as string) ?? null,
    spawned_successor: r.spawned_successor === null || r.spawned_successor === undefined ? 0 : Number(r.spawned_successor),
  }})
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
    SELECT t.id, t.title, t.due_date, t.completed_at, t.board_id, t.column_id,
           t.area_of_analysis, b.name AS board_name,
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
      // Board cards write through `linked_task_id`; `raw_id` is carried for shape
      // parity so the renderer never has to branch on source to find a write key.
      raw_id: String(r.id),
      source: 'kc-deadline' as const,
      title: String(r.title ?? ''),
      due_date: (r.due_date as string) ?? null,
      due_time: null,
      // PUBLISHED IS DONE. A card in `col-published` shipped — no deadline applies
      // to it any more, so it must not sit in the list as an active item. This also
      // preserves existing behavior: Todo.tsx:163 already treated col-published as
      // done, and deriving `completed` from completed_at alone would have silently
      // resurrected every published card as an active deadline.
      completed: !!r.completed_at || r.column_id === 'col-published',
      completed_at: (r.completed_at as string) ?? null,
      position: null,
      board_id: (r.board_id as string) ?? null,
      board_name: (r.board_name as string) ?? null,
      linked_task_id: String(r.id),
      column_id: (r.column_id as string) ?? null,
      area_of_analysis: (r.area_of_analysis as string) ?? null,
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
