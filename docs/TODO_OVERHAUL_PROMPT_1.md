# To-Do tab overhaul — aggregation layer, Step Rail, per-board assign permission

## Read this first: timing

This can be **saved for later** — nothing here blocks other work. But it is probably a
**good moment to do it now, because we're cloud-migrating anyway.** The central question
of this overhaul ("what lives where") is the *same* question the migration is already
answering, and the todo tab is the one surface that reads from nearly every domain at once
(boards, assignments, intel, calendar, personal). Deciding its data placement during the
migration is one decision; deciding it afterwards means re-opening tables we just moved.

Specifically: **`personal_todos` is local-only today** (explicitly out of scope in the
v2.0.0 cloud migration). Everything *else* this tab needs is already cloud. So the tab is
currently the last thing pinning a local-only table in place. If personal to-dos are
migrating as part of the current work, do this overhaul with them.

**Before building anything: diagnose read-only first.** Report what exists, what the real
table/handler names are, and where the assumptions below are wrong. Do not write code
until we've agreed on the "what lives where" table.

---

## What this is

Replace the current `/todo` page (personal to-dos + calendar-derived items) with a
**unified aggregation layer**: one "what do I owe" surface reading from boards,
assignments, intel, calendar, and personal items — all member-gated through the existing
access model.

Precedent: this is the **same pattern as the unified Trash view**, which loads three
sources simultaneously and normalizes them to a single `UnifiedItem` shape. Do that here:
one normalized `TodoItem` with a `source` discriminator, assembled **in the main process**
where membership and roles are already enforced (`resolveActor` / `isRoot` / `can()`,
service-role key bypassing RLS), then filtered into tabs in the renderer.

**Reference prototype: `TodoStepRail.jsx`** (design reference, not production code — it uses
local `useState` and seeded data). Port its *behavior*: `StepRail`, the urgency engine,
tab logic, promotion strips, completed section, assign dialog. Do **not** port its
hardcoded colors or its data layer.

---

## Part A — What lives where (agree this before coding)

| Source | `TodoItem.source` | Data today | Proposed home |
|---|---|---|---|
| Personal to-dos | `personal` | **local SQLite** (`personal_todos`) | **→ cloud**, owner-scoped, if migrating now |
| Board tasks assigned to me | `assigned` | cloud `workspace_tasks` | stays cloud |
| Board deliverables w/ due date | `kc-deadline` | cloud `workspace_tasks` | stays cloud |
| KC calendar meetings | `kc-meeting` | `calendar_events` (Google sync) | stays as-is, read-only |
| Intel culling assignments | `kc-intel` | **does not exist yet** | new cloud table |
| Sub-steps (KC/assigned) | — | existing `task_checklists` / items | stays cloud |
| Sub-steps (personal) | — | **does not exist yet** | new, follows `personal_todos` |

Key consequences to confirm:

- **The Step Rail does not need one new steps table — it needs a common shape.** Board
  tasks already have `task_checklists` / `task_checklist_items` with done flags. The rail
  is a *visualization over whatever sub-item collection the source already has*: checklist
  items for KC/assigned, a new steps table for personal. Same component, two feeds.
- If `personal_todos` moves to cloud, personal steps must move with it (same owner scope,
  same realtime registration). If it stays local, the tab is a **mixed** local+cloud read —
  workable, but then say so explicitly and keep the personal path local end-to-end.
- Aggregation itself needs **no new realtime plumbing** for board/intel/calendar — those
  sources are already registered with `realtimeManager`. Only the new tables do.

---

## Part B — Behavior spec (design is locked; this was iterated with the user)

### Tabs — KC is a SUPERSET
Order: **KC tasks · Assigned to me · Personal · All tasks**.
- **KC tasks** = firm work **including** what's assigned to me (meetings + intel + deadlines + assigned).
- **Assigned to me** = the subset explicitly assigned to me.
- **Personal** = private, per user. **The tab opens here** — it's each member's anchor.
- **All tasks** = union. Overlap between tabs is intentional; they're filtered views.
- Consider persisting last-used tab (nice-to-have, not required).

### Urgency engine (single source of truth)
Computed off due date: `pastdue · today · tomorrow · d2 (2 days to go) · d3 (3 days to go) · later · none`.
Drives **promotion**, band grouping, chip color, and calendar chip color. See `urgency()`
in the prototype.

- **Promotion:** `pastdue` and `today` items **jump to a pinned strip at the top of every
  tab, regardless of source**, with their own color (red / amber) and a colored left border.
  A past-due *personal* item and a due-today *assigned* item sit side by side up there.
  Promoted items are **not** duplicated in the bands below.
- **Bands:** the rest group by urgency (tomorrow → 2 days → 3 days → later → no date).
- Completed items show **no urgency chip** (a finished task isn't past due).

### Intel culling directive (pinned above everything)
Admin-assigned (`isRoot` only — **not** the board.assign permission). One write produces three things:
1. A **pinned action card** at the very top — styled as a directive, not a checkbox row —
   showing who assigned it and the due date.
2. A **notification** (reuse existing `notifications` + inbox bell).
3. A **deep link**: click → navigate to `/intelligence`, land on the News tab (reuse the
   existing notification→jump-with-flash pattern).

The member then runs the flow on **existing intel machinery**: Refresh → approve / decline /
open content if unsure → check all → Push (publish queue → Info Pages). **Push-complete
closes the culling assignment and auto-checks the directive.** That write-back hook is the
only new wiring; everything upstream exists.

> The intelligence/publishing tabs are actively being worked on. If the current build
> differs from the above, **implement the todo-side contract only** (assignment entity +
> pinned card + deep link + a `completeCullingAssignment(id)` hook the intel push path can
> call) and leave the intel internals alone.

### Step Rail
Port from `TodoStepRail.jsx`:
- Done steps collect **left** (contiguous fill), pending follow; each group keeps original
  order. Completing out of order is allowed — the rest shift to the end.
- **Reflow is a render concern.** Never reorder rows in the DB on toggle. Only explicit
  drag-reorder rewrites `position` as a dense `0..n-1`.
- **FLIP animation** on reorder + animated fill. **Respect `prefers-reduced-motion`** (skip
  both, apply instantly).
- **Labels:** card with ≤4 steps → full labels; >4 → all labels with a **2-line clamp** +
  `title` tooltip. Detail panel → **label-less meter** (dots + fill + "x of y") above the
  editable step list.
- The `≤4` threshold and label widths are **tunable constants** — they were tuned in a narrow
  prototype; dial them against the real (wider) column. No magic numbers in JSX.

### Calendar toggle — bidirectional with due dates
List / Calendar toggle stays (top-right).
- A todo item with a delivery date appears on the **assignee's** (or self-assigner's) calendar.
- A deliverable/due date set on a board **auto-generates the todo item**.
- **These are the same underlying record surfaced twice**, not two records kept in sync —
  setting the date on either side sets it on the one record. This is what prevents date drift.
- Unassigned dated board deliverable → shows on the **board creator's** calendar until assigned.
- Chips colored by urgency; click opens the task.

### Completed list
Collapsible **Completed (n)** section at the bottom of **each tab**, **collapsed by default**,
sorted most-recent-first (`completed_at`). Re-ticking restores the item to its band — this is
the undo path, currently missing entirely.
- **Completion is cross-cutting and writes back:** ticking a KC/assigned board task here
  marks it done **on the board** (it's a view onto that record) and must respect whatever
  board permission already governs completing a card. Personal items are self-owned. Make
  this explicit; don't let a tick in Todo silently violate board rules.
- **Retention:** default to showing **completed in the last 30 days**; older items age out of
  the view (not deleted — existing Archive/Trash machinery owns the long tail). Flag if this
  conflicts with anything.

### Removed
- **No "Add to My Day."** The urgency strips do that job automatically; a manual daily-pick
  list would be a redundant, worse version of it. Don't add it.

---

## Part C — Permissions

### New: per-board assign capability
Add a capability — call it **`board.assign`** — granting, **on a specific board**: assign a
card/deliverable to another member, **unassign**, and **delete the assigned todo item**.

- **Per board, not global.** The existing `member_permissions` / `can()` table is email-keyed
  **globally**; this needs per-board scope. `board_members` is already the per-board,
  email-keyed identity → the natural home is a **flag on the `board_members` row** (e.g.
  `can_assign`). Gate reads: *is actor root, OR does their `board_members` row for **this**
  board carry `can_assign`?*
- **Enforce in the main process** (service-role key bypasses RLS), same pattern as
  `cloud/boards.ts`. UI gating alone is not enforcement — see the permissions cleanup that
  already distinguished genuinely-enforced vs UI-only capabilities. This one must be
  genuinely enforced.
- **Root has it implicitly**, everywhere.
- **Self-assignment needs no grant** — any board member can pick up their own work.
  `board.assign` gates assigning to **others**.
- Toggle lives in the **per-board members UI**, not the global per-member panel.
- **Intel culling assignment is separate and stays `isRoot`-only.**

### UI: "+ Assign to others"
Button in the top actions (next to "Add personal", styled secondary so "Add personal" stays
primary). **Renders only if the actor holds `board.assign` on at least one board** (or is
root); a member with no assign rights never sees it. Opens a dialog: board (**scoped to
boards where they actually hold it**) → assignee (members of that board) → title → optional
due date. On save: create the assignment → appears in that member's "Assigned to me" → fire
their notification → if dated, lands on their calendar and urgency bands.

---

## Part D — Implementation notes

- **Aggregation in main**, not the renderer. One `listTodos(actingUserId)` that assembles
  and normalizes all sources with membership already applied. The renderer filters into
  tabs; it must never see items the actor isn't entitled to.
- **Styling:** drive all color from existing **Tailwind theme tokens / `ThemeContext`**
  (accent, muted, border, foreground). The prototype's indigo is hardcoded — do not copy it.
  Must read correctly in **light and dark mode** (the prototype is light-only). Urgency
  red/amber need dark-mode-safe token equivalents.
- **Optimistic UI:** mirror the existing optimistic-insert pattern (e.g. card-revive's
  `setTasks` before the await, deduped by id) rather than blocking on round-trips. Add
  in-flight guards where a double-fire would double-write.
- **Quality floor:** dots are buttons → visible keyboard focus; sensible hover; reduced-motion honored.
- Preload (`window.api.*`) + types in `env.d.ts` for every new channel.

### Edge cases
- 0 steps → no rail. 1 step → single dot, 0% or 100%.
- Rapid toggle/delete mid-animation → no crash, no orphaned FLIP.
- Deleting the current "next" step → recompute cleanly.
- Archived/deleted boards must not leak tasks into the todo feed (`getTasks` already excludes them — verify).
- A task assigned to someone then unassigned → leaves their tab and their calendar.

---

## Definition of done

- [ ] "What lives where" table agreed; personal to-dos' home (cloud vs local) explicitly decided.
- [ ] Migrations clean on existing DBs; if cloud: RLS + main-process enforcement + realtime
      registration + one-time SQL saved to `/sql` (publication + `REPLICA IDENTITY FULL`).
- [ ] Unified `TodoItem` assembled in main, member-gated; renderer only filters.
- [ ] Tabs KC(superset) / Assigned / Personal / All; opens on Personal; counts correct.
- [ ] Urgency engine: promotion strips (pastdue red, today amber) across all sources; bands below.
- [ ] Step Rail: reflow + FLIP + fill; ≤4 full labels, >4 two-line clamp + tooltip; label-less
      meter in detail panel; reduced-motion honored.
- [ ] Calendar toggle bidirectional; one record, two views; no date drift.
- [ ] Completed section per tab, collapsed, restorable; board write-back respects board perms.
- [ ] `board.assign` per-board, enforced in **main**; "+ Assign to others" gated and board-scoped.
- [ ] Intel directive: pinned + notification + deep link + `completeCullingAssignment` hook.
- [ ] No "Add to My Day".
- [ ] Theme tokens; correct in light **and** dark.
- [ ] Workspace board's `TaskDetailPanel` / Kanban untouched.
- [ ] `npx tsc --noEmit -p tsconfig.web.json` adds **no new** errors (~55 pre-existing; esbuild
      does not typecheck — check manually).
- [ ] **Two-machine verification** (laptop root / Mac mini member) before done — required if
      anything here touches cloud.
- [ ] `PROJECT_SUMMARY.txt` header + changelog updated per working agreements.

## Gotchas (from the handoff)

- **Main-process / IPC changes need a full `npm run dev` restart** — HMR only refreshes the renderer.
- **Universal builds clobber `better-sqlite3`** — run `npm run rebuild` before the next
  `npm run dev`. **Never run `npm run dev` while a release is packaging.**
- **No typecheck script** — esbuild strips types without checking.
- Realtime SQL changes require an **app restart on both machines**.
- Canonical working copy is `~/newsroom-pm`. The old iCloud copy is stale — don't work from it.
- Don't `npm version` / publish as part of this task unless explicitly asked.
