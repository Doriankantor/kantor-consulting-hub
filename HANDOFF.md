# Handoff — Kantor Consulting Hub

_Last updated: 2026-07-21 · **v2.3.0 RELEASED** (published 2026-07-17, tag `v2.3.0`, version-bump commit `a4b161e`). **Code HEAD `f918e42`, `origin/main` up to date; working tree carries the uncommitted DATE-PICKER slice (built, TESTING). UNRELEASED since v2.3.0: TWENTY-SEVEN code commits — `2d76b9a`, `b211638`, the compose cluster (`c60c9c2`, `ae067da`, `7782116`, `bd8f07c`, `edd7bd0`), `cc6aedf`, and the To-Do/team arc: `a46345b` (1a), `4001652` (1b), `4b9c0b3` (1c-1 — cloud team roster), `fa5c9cd` (@mention dropdown fix), `d16b071` (1c-2a — reversible half), `74150c7` (1c-2b-① — cloud rewrite, commit-once), `863e5be` (1c-2b-② — the finale), `065f6ce` (slice 2 — the `listTodos` aggregation layer), `d43445d` (slice 3a — the visible To-Do tab), `4c240bd` (slice 3b — the personal Step Rail), `7d5a38a` (slice A-1 — detail-panel color/starred columns + setters), `f1fb6df` (slice A-2 — the personal detail panel UI), `9c049e3` (slice A-3 — drag-to-reorder personal steps), `4bc236d` (slice B — personal-to-do notes), `1795418` (slice C-recurring-1 — completion-anchored recurrence backend), `76bafb0` (slice C-recurring-2 — recurrence picker UI + row chip), `a6f82d7` (slice C-recurring-3 — missed-occurrence tracking), `9376ba7` (chore — remove orphaned personalTodo:list channel) and `f918e42` (OFF-WORK / leave-window — per-member future-only leave window in a new cloud `off_work` table + local mirror; the missed-evaluator reads the acting user's window and skips stamping misses for boundaries inside it; Team page "on leave" pill + self-service picker + "End leave"; notification-drop DEFERRED). The installed app is 2.3.0 and contains NONE of them.** ★ **DATE-PICKER SLICE — BUILT, TESTING (uncommitted in the working tree).** Three bundled fixes: native `<input type=date/time>` now open on clicking the field body via `onClick→showPicker()` + `[color-scheme:dark]` for glyph visibility (root cause was Chromium only opening the picker from the tiny edge glyph, a behavior quirk not a bug), on 4 inputs (off-work start/end, new-todo date/time); native OS positioning auto-flips so the off-work-at-bottom picker never clips (custom popovers would have — native chosen deliberately); and RECURRENCE is now GATED ON A DUE DATE (the panel `RecurrencePopover` is disabled+greyed with a "set a due date first" hint when the to-do has no `due_date`), preventing the recurrence-without-due zombie state at the source (the one entry point — the quick-add row has no recurrence control). ★ **SLICE 1c IS COMPLETE — CROSS-DEVICE ASSIGNMENT WORKS FOR THE FIRST TIME (2026-07-20).** `assignees_json` held device-local `local_users.id` UUIDs that resolved on exactly one machine; it now holds stable work emails, and every read, write and notification site matches on email. See the **1c-2 ARC** entry under the To-Do overhaul for the four commits and the five hard-won findings. ★ **IDENTITY MODEL CORRECTED THIS SESSION — `dk@kantor-consulting.com` is a TEAM MEMBER, NOT root; ROOT is `doriankantor@gmail.com`/`local-admin`. Older entries below that call dk@ "full-admin" predate this and are superseded — see the IDENTITY MODEL block under Known issues.** (Historical — **code HEAD was `2d76b9a` on 2026-07-18 — the `visibleBoardIds` NON-ROOT NO-JOIN is now FIXED (2026-07-18), closing the FOUNDATION the whole access-control tier rests on: the non-root path read `board_members` by email with no join to `workspace_boards`, and `board_members` rows SURVIVE a soft-delete, so a since-deleted board's id stayed visible forever and the 0a-2/0a-3/0a-4 gates (which trust that set DIRECTLY) kept serving and mutating its content. `2d76b9a` is UNRELEASED — the first commit of the next release; the installed app is 2.3.0 and does NOT contain it.**) ★ **METHODOLOGY LESSON OF THE SESSION — THE PHANTOM TEST: the first attempt to verify this fix produced a false PASS that everyone believed, over-determined by THREE stacked silent failures (the document never persisted, the soft-delete never landed, and the fix was already compiled into the running build). For a SECURITY test, confirm EVERY precondition in the authoritative store BEFORE trusting the observed result — a result that matches expectation proves nothing if the preconditions were never verified. See the dedicated lesson section.** **The ENTIRE ACCESS-CONTROL GAP (finding 1) IS CLOSED END-TO-END AND SHIPPED: 0a-1 (`8eae348`, compose stamps a project), 0a-1b (`2e22178`, pipeline writer stamps a project), 0a-2 (`a5d4b20`, the intel READ gate), 0a-3 (`46be18e`, the `info_page_*` READ tier), and 0a-4 (`26ee18c`, the `info_page_*` WRITE surface — ~20 mutation handlers gated across three axes: M=membership, A=canApprove, R=root) are all DONE. Reads AND writes are now membership-scoped. v2.3.0 IS NOW RELEASED — the whole tier ships to researchers (they self-update off the ungated 2.2.0); the next step is 0b (realtime health). Also shipped: a pipeline NULL-writer bug fix (part of `2e22178`), the aba6b91 scroll-jump regression fix (`923f334`), and the `infoPages:list` `deleted=0` bug fix (part of `46be18e`).** `origin/main` up to date, tree clean. **The unreleased-since-v2.2.0 list is now EMPTY** — `8eae348`/`2e22178`/`923f334`/`a5d4b20`/`8662b68`/`46be18e`/`f80b17d`/`26ee18c`/`49b44fd` all SHIPPED in v2.3.0 (installed builds self-update from 2.2.0). **UNRELEASED since v2.3.0: TWENTY-SEVEN code commits** (listed at the top of this block), plus the uncommitted date-picker slice in the working tree — installed app is 2.3.0 and does NOT contain any of it. **8 assets on GitHub Releases** — mac universal DMG/zip, win NSIS x64 exe, blockmaps, and BOTH auto-update manifests (`latest-mac.yml`/`latest.yml`), so installed builds self-update. (v2.2.0 was published 2026-07-16, tag `v2.2.0`.) v2.2.0 ships the whole post-v2.1.0 batch: the **cosmetic sweep** (`7f36605`/`ff2bd9a`/`0425f19`), the **`known_tags` cloud migration** (`0865948`, the template), the **OFFLINE ARC** (`504bf1f` mirror + `23de14d` connection state/banner/lockout/reconnect), the **`intelligence_sources` cloud migration** (`cfdd4b1` — the big one, 242 rows byte-verified), and **realtime on `intelligence_sources` + resubscribe-on-reconnect** (`aba6b91`). **Same-day cross-device test + follow-up diagnostics surfaced an ACCESS-CONTROL GAP in the intel reads (+4 more findings) — finding 1 is now CLOSED end-to-end (reads via 0a-2/0a-3, writes via 0a-4); still open from the original five: finding 3 = 0b (realtime health), finding 4 (downstream of 3), finding 5 (updater unconditional-success print) — see the ⛔ block below.** **Milestone (locked): complete intel process by end of July; publishing moves to August.**_

## ▶ Start here — resume point for the next session

**LATEST (2026-07-21) — HEAD `f918e42` (off-work SHIPPED); the DATE-PICKER slice is BUILT
and TESTING in the working tree (uncommitted). ★ THE LAST TWO To-Do FEATURES BEFORE THE
TEAM THREAD ARE DONE — off-work leave windows + the date-picker fixes.**

**OFF-WORK / LEAVE-WINDOW — SHIPPED (`f918e42`).** A per-member self-set future-only leave
window (start→end) lives in a new cloud **`off_work`** table (PK `user_email`, RLS enabled) +
a local mirror the offline missed-evaluator can read. The evaluator reads the acting user's
window and **skips stamping misses** for boundaries inside it (the `due_date` still rolls
forward — suppression only gates the STAMP). Team page: an **"on leave" pill** on members
within a window, a **self-service leave picker**, an **"End leave"** action (deletes the row =
you're back; forward-only, so nothing already suppressed is retroactively un-suppressed) and an
**Update** path. **Notification-drop is DEFERRED** (blocked on notifications→cloud) with a
documented stub. IPC: `offWork` get/set/list/clear. Cloud DDL: `sql/2026-07-21_off_work.sql`.
Suppression was verified both directions via a local-seed test.

**DATE-PICKER SLICE — BUILT, TESTING (uncommitted).** Three bundled fixes: **(a)** the native
`<input type=date/time>` pickers now open on clicking the field **body** via
`onClick→showPicker()` + `[color-scheme:dark]` for glyph visibility — the root cause was
Chromium only opening the picker from the tiny edge glyph (a behavior quirk, not a bug), on 4
inputs (off-work start/end in `Team.tsx`, new-todo date/time in `Todo.tsx`); **(b)**
upward-opening was **MOOT** — native OS positioning auto-flips so the off-work-at-bottom picker
never clips (custom popovers WOULD have clipped; native was chosen deliberately, no flip logic
added); **(c)** RECURRENCE is now **GATED ON A DUE DATE** (Option A / block) — the panel
`RecurrencePopover` is disabled + greyed with a "set a due date first" hint when the to-do has
no `due_date`, preventing the recurrence-without-due-date zombie state at the source (this is
what caused the "call mom" mess). Only **ONE** recurrence entry point (the panel), so one gate
covers all — the new-todo quick-add row has no recurrence control.

**"call mom" STUCK ITEM — RESOLVED.** Not a bug; a stray daily recurrence respawning on
completion. Its recurrence was cleared. **NOTE:** 15 completed "call mom" spawn-chain rows
remain in `personal_todos` (local + cloud), all `completed=1`, `recurrence=daily`, no
`due_date` — benign/invisible; cleanup deferred as optional.

**★ NEXT IS A DELIBERATE FORK — Dorian must decide:**
- **(A) The To-Do team/collaboration thread.** Slice **2.5** (the off-card assignment entity —
  unblocks the empty Assigned-to-me / Assigned-by-me tabs), then **2.6 / 4 / 5** (invited
  collaboration, head roles + card-permission tiers, the intel-directive assignment loop), with
  **`notifications`→cloud as a shared prerequisite** that ALSO unblocks the deferred off-work
  notification-drop.
- **(B) JUMP to the Intelligence + Info Pages restructure** — the PRIMARY goal, with a HARD
  deadline (complete the intel process by end of July / publish in August). This is the same
  "Path 2" reprioritization Dorian made once before. **The August deadline argues for starting
  the intel restructure's design-first phase soon** — flagged here so the fork is made
  consciously, not by default-continuing the To-Do thread.

---

**(Historical — 2026-07-21) — HEAD `9376ba7`, tree clean. ★ THE FULL RECURRENCE FEATURE
(C-recurring-1/2/3) IS COMPLETE — MISSED-OCCURRENCE TRACKING SHIPPED.** **C-recurring-3
(`a6f82d7`)** adds a time-driven **missed-occurrence evaluator** (runs at login + on a
CET-midnight timer) that rolls a stale `due_date` forward one boundary at a time, stamping each
passed boundary into a `missed_dates` array; **completion is GATED** until the misses are cleared
(`{ok:false, reason:'missed'}`), surfaced as an amber card ring + "missed: MM-DD" chips + a
**"Missed repeats"** panel section (each row Mark-done clears one — bookkeeping-only, never spawns).
The evaluator's **`skipRanges` seam is already wired** for the Off-work setting. A same-session
**prefix-hardening** made `personalTodo:complete`/`uncomplete` strip the `personal-` display prefix
(they were the only mutating handlers that didn't — a display id silently no-op'd with `ok:true`),
and the clobber-critical cloud column list was hoisted to a canonical **`personalCloudRow`** shared
by the ipc handlers and the evaluator. A follow-up cleanup (`9376ba7`) **deleted the orphaned
`personalTodo:list` `SELECT *` channel** — the sole shaped read path is now `todos:list` →
`readPersonal` (parseMissed applied). Needs the hand-run cloud DDL
`sql/2026-07-21_personal_todos_missed.sql`. (The earlier arc — **C-recurring-1 `1795418`**
spawn-on-complete backend, **C-recurring-2 `76bafb0`** picker UI — is detailed in the **SLICE
C-recurring-1/2/3** entries under the To-Do overhaul.)

**C-files is PARKED** — deferred, non-essential; personal to-dos have no attachment precedent, so
picking it up later is its own diagnose-first project, not the next step.

**(Historical — 2026-07-21) NEXT WAS the "Off work" leave-window setting — NOW SHIPPED
(`f918e42`).** It hooked the **`skipRanges` seam** that was pre-wired into
`runMissedOccurrenceEvaluator` (a `SkipRange[]` param + `dateFallsInAnyRange`), stored per-user
IN CLOUD (`off_work`) with a local mirror. See the SHIPPED description at the top of Start-here.
With off-work + the date-picker slice done, the **team/collaboration thread (2.5 / 2.6 / 4 / 5)**
is no longer force-sequenced behind more To-Do work — the NEXT decision is the **A/B FORK above**
(collaboration thread vs. the intel restructure with its August deadline). **Twenty-seven code
commits are unreleased** plus the uncommitted date-picker slice; the installed app is 2.3.0 and
contains none of it.

**(Historical — 2026-07-21) — GROUP A WAS NEARLY CLOSED — A-3 AND B SHIPPED.** Drag-to-reorder
steps (**A-3, `9c049e3`**) and a free-text notes field (**B, `4bc236d`**, save model: onBlur +
save-if-changed + unmount-cleanup flush, `key={item.id}`; cloud DDL
`sql/2026-07-21_personal_todos_notes.sql` already run). Detail: the **SLICE A-3** and **SLICE B**
entries under the To-Do overhaul.

**(Historical — 2026-07-20) — HEAD `d43445d`, tree clean. THE To-Do TAB IS VISIBLE AND LIVE.** Slices
2 (`065f6ce`) and 3a (`d43445d`) both shipped this session: the aggregation layer in MAIN, then
the renderer migrated onto it. **The To-Do tab now renders from `todos:list`** — five tabs, CET
urgency, a pinned past-due/today strip, and refresh-on-change. Detail: the **SLICE 2** and
**SLICE 3a** entries under the To-Do overhaul.

**SLICE 3b IS DONE (`4c240bd`) — the personal Step Rail ships.** Handlers on the 1b local-first
+ sync-queue pattern (offline-capable), steps inline on `todos:list`, and a reusable `StepRail`
component with FLIP slide + fill transition. `has_steps` is now real **for personal**; it stays
wrong for board cards until the checklist work. **Eighteen code commits are unreleased**; the
installed app is 2.3.0 and contains none of them.

**★ READ THE REMOUNT-TRAP LESSON BEFORE TOUCHING `Todo.tsx`** — "NEVER DEFINE A COMPONENT INSIDE
ANOTHER COMPONENT'S BODY". It cost the focus bug plus **three** failed animation fixes, two of
them chasing `React.memo`, which cannot work. `Row` is still inside `Todo()`; only the personal
branch was moved above the unmount boundary. **The full `Row` hoist is logged tech debt.**

**NEXT:** slice 4 (the head role + card permission tiers) or slice 2.5 (the off-card assignment
entity) — 2.5 unblocks both empty assigned tabs and is the prerequisite 5 also needs.

**★ THE COLLABORATION / PERMISSION MODEL WAS DECIDED (2026-07-20) — read it before slice 4 or
2.5.** Four things: the **UNIFIED HEAD ROLE** (one elevated role per board, replacing the
separate `can_assign` flag — under Known issues); **CARD PERMISSION TIERS** (SEE all / ASSIGN
heads-only / EDIT assignees+heads — slice 4, and EDIT is net-new gating across *every* card
mutation); **SELF- AND MULTI-ASSIGNMENT** (an assignment targets one or many, and may include
the assigner); and **THREE DISTINCT COLLABORATION CONCEPTS** — assigned (2.5), the new
**invited-collaboration (SLICE 2.6)**, and personal — which must not be conflated. All in the
sequencing block under the To-Do overhaul.

**⚠ CHECKLISTS ARE CLOUD-BACKED AND WORK CROSS-DEVICE — the "local-only, never synced" framing
is WRONG** (verified 2026-07-20). What's missing is the local MIRROR, and two silent failures
live there (**instances nine and ten**). See the CHECKLIST STATE entry.

**★ EARLIER DESIGN DECISIONS (2026-07-20)** — the **"+ Add" dropdown** (Personal / Assign to
other, no board option), the **top-bar action cluster** (fixed, NOT draggable), and **three
additions to slice 2.5** (assigner visibility, assignment chat, off-card-only scope). All in the
**on-the-horizon** block under the To-Do overhaul.

(Historical — **HEAD `863e5be`, SLICE 1c IS DONE.**) The whole
identity foundation of the To-Do overhaul is in, across four commits: the cloud roster
(`4b9c0b3`), the reversible local migration (`d16b071`), the commit-once cloud rewrite
(`74150c7`) and the full read/write repoint (`863e5be`). **Cross-device assignment works for
the first time** — `assignees_json` holds work emails, not device ids, and the assignee picker
is fully clickable on every machine. Detail + the five findings: the **1c-2 ARC** entry under
the To-Do overhaul.

(Historical — **NEXT WAS SLICE 2 — the `listTodos` aggregation layer in MAIN.** SHIPPED as
`065f6ce`. It was blocked behind 1c-2 and was UNBLOCKED by it. The **SPEC vs REALITY**
corrections still apply to everything downstream: slice 2 is
**net-new architecture, NOT a port of the unified-Trash normalizer** (that one normalizes in
the renderer with weak gating). **Also read the IDENTITY MODEL block under Known issues before
touching anything identity-shaped** — `dk@` is a fully-permissioned team member, not root, and
several older entries in this file still say otherwise.)

(Historical — **★ SLICE 2 SCOPE WAS DECIDED (2026-07-20) — it built only the TWO sources that
EXIST: personal + kc-deadline.** The slice-2 diagnosis found that "assigned to me" as spec'd
needs an **off-card assignment entity that is not in the schema at all**, so it was split out as
the new **SLICE 2.5** — which is the SAME mechanism slice 5's intel directive needs, and must be
built ONCE. Full scope and the deferred design items are in the **sequencing** block under the
To-Do overhaul. **Note the tab count grew from four to five in 3a** — "Assigned by me" was added
as its own tab.)

(Historical — **v2.3.0 RELEASED** (published 2026-07-17; version-bump commit `a4b161e`,
tag `v2.3.0` pushed BEFORE the release build — no tag race). HEAD = `a4b161e`,
`origin/main` up to date, working tree clean apart from these two docs. **8 assets live on
GitHub Releases** — mac universal DMG + zip, win NSIS x64 exe, blockmaps, and BOTH
auto-update manifests (`latest-mac.yml` + `latest.yml`) — so every installed build (incl.
the Mac mini) self-updates off the ungated 2.2.0. **v2.3.0 ships the COMPLETE
access-control tier (0a-1 / 0a-1b / 0a-2 / 0a-3 / 0a-4), closing finding 1 end-to-end,
plus the `infoPages:list` `deleted=0` bug fix and the scroll-jump fix.** The
unreleased-since-v2.2.0 list is now EMPTY. Next is 0b (realtime health), whose field
verification this release unblocks (researchers now self-update onto the gated build).)

(Historical — **v2.2.0 RELEASED** (published 2026-07-16; version-bump commit `3dc945a`,
tag `v2.2.0`) shipped the 8 commits since v2.1.0. What they are, and **why they
took the shape they did**:)

1. **Cosmetic sweep** (3 commits): removed the dead `'summarize'` analyze task (`7f36605`),
   removed the sidebar Archive expander (`ff2bd9a`), fixed the Info-Pages list badge that
   counted the legacy table and was refilled by a zombie `syncSources` poll (`0425f19`).
2. **`known_tags` cloud migration** (`0865948`) — the FIRST of the three intel cloud
   migrations and the **reusable template**: cloud is the source of truth, a local
   `known_tags` table is kept as an OFFLINE MIRROR (sync-on-read in a transaction, fall
   back to mirror on cloud error, never throw), skip-cloud-when-offline, realtime
   invalidation via `intel:tagsInvalidate`. **Deliberate cloud/local schema divergence:**
   the cloud table OMITS the global `(name,type)` unique index so per-project uniqueness
   works as T1 intended — but `db.ts` RECREATES that index locally on every startup.
   **LOCAL BUG STILL OPEN:** the resurrected index means the local mirror cannot hold the
   same tag name under two different projects — **fix `db.ts:770` BEFORE Phase 2 lights up
   a second project's tags**, or the mirror sync will silently skip them.
3. **OFFLINE ARC — Commit 1 (`504bf1f`): live cloud mirror for boards/columns/tasks.**
   `cloud/boards.ts` `listBoards`/`listArchivedBoards`/`getColumns`/`getTasks`/`listForUser`
   sync a scoped local mirror on cloud success and serve it on cloud error. Scoped
   deletes protect rows cloud doesn't own (info-page boards are LOCAL-ONLY via
   `infoPages:create`; archived boards/tasks; other-board tasks). New email-keyed
   `board_members_mirror` gives non-root users correct offline visibility. Also fixed
   To-Do⇄Kanban disagreement (local `workspace_tasks` was frozen pre-migration seed data).
   **The lesson that cost real debugging time:** `listArchivedBoards` had NO fallback and
   sits in `loadBoards`' `Promise.all` NEXT TO `listBoards` — one unguarded throw
   **discarded BOTH results** and emptied the sidebar offline even though the mirror was
   correct and `listBoards` had succeeded. **Promise.all poisoning is a real bug class
   here**: every read that lands in a `Promise.all` needs its own fallback, or it poisons
   its siblings.
4. **OFFLINE ARC — Commit 2 (`23de14d`): connection state + banner + lockout + reconnect.**
   `cloud/connection.ts` derives an `online` flag from cloud call OUTCOMES (hysteresis: 2
   consecutive failures → offline, first success → online) with a ~10s recovery probe that
   runs ONLY while offline, pushed to the renderer over `connection:changed`. When offline,
   reads SKIP cloud entirely (instant offline load vs ~30s of postgrest retries).
   `ConnectionContext` → one app-wide `OfflineBanner` in `Layout`; reconnect refetch on the
   false→true flip; edit lockout (To-Do, Workspace Cmd-N, Rescore, per-card routing on all
   four Intelligence tabs). **The trap this fixed:** Commit 1's mirror fallback had
   SILENTLY KILLED the app's only offline signal — the reads stopped throwing, so the old
   `cloudError` banner became dead code and the app had no idea it was offline. **A
   fallback that swallows the error also swallows the diagnosis** — hence the dedicated
   outcome-derived connection state.
5. **`intelligence_sources` CLOUD MIGRATION (`cfdd4b1`) — the big one.** 242 rows
   backfilled and **byte-verified** (id/url set equality, status distribution, and
   byte-for-byte parity on all 21 irreplaceable `analysis_json` blobs + the 23.5KB content
   row). 48-column strict mirror; timestamps stay `text` so date-only `published_at`
   values survive. **The two-tier rule that governs every handler:**
   - **PURE READS** are cloud-first / mirror-fallback / skip-when-offline, and the read
     sync is **UPSERT-ONLY** — `getSources` is filtered AND paginated, so a scoped
     delete-then-insert would wipe mirror rows the current view didn't return, and the
     five info-page JOINs read that mirror (two of them INNER: wiped rows would silently
     vanish from New Sources).
   - **READ-MODIFY-WRITE** (updateStatus, the three `analysis_json` sub-object mergers,
     confirmImported, gate, rescore) is **CLOUD-AUTHORITATIVE and never reads the
     mirror** — three handlers merge sub-objects (`.ai`/`.human`/`.reconciled`) into the
     SAME `analysis_json` blob, so a stale mirror read + cloud write would silently
     clobber a sibling. Offline they return `{ok:false,'Unavailable while offline'}` (the
     commit-2 lockout already disables the controls; this is the backstop).
   Also proven during investigation: **the GDELT Action writes `cs_articles`, NOT
   `intelligence_sources`** — the pipeline is upstream of the app and needed NO change;
   only `syncFromContestedSkies`' insert moved to cloud (upsert-ignore-on-url) + mirror.
   Translation details that would otherwise drift: `ilike` not `like` (SQLite LIKE is
   case-insensitive), `nullsFirst:false` on both order keys (SQLite sorts NULLs last on
   DESC, Postgres first), and `, ( )` stripped from search terms (PostgREST logic tree).
6. **Realtime on `intelligence_sources` + resubscribe-on-reconnect (`aba6b91`).**
   Channels went CHANNEL_ERROR on any network drop and stayed dead until restart — all of
   them, silently (the subscribe callback only warned). **The subtle part: even if the
   library rejoins on its own, `postgres_changes` never replays the outage window**, so a
   silent rejoin leaves you stale with no refetch trigger. Hence: deterministic
   teardown+resubscribe (`rescope()`) on the offline→online edge via a new
   `onReconnect` registry in `connection.ts` (decoupled — wired in `main/index.ts`),
   PLUS a renderer refetch on the same edge (all four Intelligence tabs, `prevOnlineRef`
   guard). `intelligence_sources` is a second intel realtime source
   (`intel:sourcesInvalidate`, separate channel because the renderer contract differs
   from tags), and a new optional `applyToMirror` hook on `RealtimeSourceConfig` lets the
   intel source remove the mirror row on a cross-device DELETE — the one change the
   upsert-only read sync can never propagate. Verified live: reconnect fires
   teardown+resubscribe (18 channels / 6 sources) and a cloud UPDATE propagates to the
   open News tab with no interaction.

v2.1.0 itself shipped: **3e-1, Duplicate, T6a, tag-delete fix, T7, persist fix, Phase 1,
Path B (B1/B2/B3), the summary-key fix (`c0be06f`), reconcile-from-structure (`edaab46`),
and the PDF extraction fix (`283dc38`).**

**⛔ CROSS-DEVICE TEST FINDINGS (2026-07-16) — ACCESS-CONTROL GAP + 4 MORE. TOP PRIORITY, ALL UNFIXED.**

v2.2.0 was cross-device-tested the day of release: dk@kantor-consulting.com (**a TEAM MEMBER,
not root — the "full-admin" label used here originally is SUPERSEDED; see IDENTITY MODEL under
Known issues. ROOT is `doriankantor@gmail.com`/`local-admin`**) in a second macOS account with
its own local DB/mirror. The test surfaced five
findings, and a same-day READ-ONLY DIAGNOSTIC session traced each to its verified
mechanism — **nothing is fixed yet**. Each item records what was OBSERVED in the test and
what the DIAGNOSTIC then established. Several initial hypotheses were REFUTED — the
corrected mechanisms matter for the fixes, so both are kept.

1. **ACCESS-CONTROL GAP — intel/info-page reads AND writes had NO membership gate. →
   CLOSED END-TO-END (2026-07-17): intel READ tier gated (0a-2, `a5d4b20`), `info_page_*`
   READ tier gated (0a-3, `46be18e`), and the `info_page_*` WRITE surface gated (0a-4,
   `26ee18c`, three axes M/A/R). Reads and writes are now membership-scoped on every
   surface.** ★ **THE HEADLINE LESSON: before 0a-4, ALL authorization for these writes
   lived in the RENDERER (`canApprove`/`isAdmin` gate the UI only) — nothing checked
   server-side. A UI-only permission is a SUGGESTION, not a gate.** See the two **RESOLUTION**
   subsections at the end of this finding (reads, then writes).
   *Observed:* dk@ had ZERO `board_members` rows (Board Access shows TOTAL MEMBERS 0 on
   every info-page project) yet saw **all articles across all projects**.
   *Diagnosed:* `getSources` filters ONLY on type/status/confidence/category/search — it
   never resolves an actor, never calls `visibleBoardIds`, never touches `board_members`.
   The picker does NOT thread the project into `getSources` (the read is unscoped —
   `Intelligence/index.tsx:29` says so deliberately). ⚠ **CORRECTION (2026-07-17): the
   earlier claim "the picker isn't even a filter" is WRONG.** The picker DOES filter —
   **client-side, after the fetch.** Both `NewsTab` (`NewsTab.tsx:549`, a `useMemo`) and
   `SocialTab` (`SocialTab.tsx:344`, `posts.filter(p => !projectScoped || p.project_board_id
   === project?.id)`) narrow the returned array by `project_board_id`; "All"/unset shows
   everything. So the SERVER read was the entire table for any signed-in user, but the
   RENDERED list was already project-scoped in JS. This matters — see the client-side-filter
   OPEN QUESTION under 0a-3 in NEXT UP; a client-side filter and a server-side gate can
   produce the SAME number for different reasons. The count reads
   (`getUnreviewedCount`/`getStatusCounts`/`getPipelineStats.pending`/`getUnscoredCount`/
   `getImportedCount`) are ALL ungated global counts. The Info-Pages pipeline reads
   (`getSourcePipeline`/`getAnalysisSources`/`getSourceItems`/`getSourceChanges`) are
   pageId-scoped with NO actor gate, and `infoPages:list` itself is an unfiltered LOCAL
   read. Boards/columns/tasks gate through `visibleBoardIds` (isRoot || board_members);
   intel never got that tier — it predates the per-project model, and `cfdd4b1`
   translated the query FAITHFULLY, which faithfully preserved the missing gate. Harmless
   when intel was local-per-machine; in cloud, every researcher reads every project's
   intel on login. The service-role key bypasses RLS — there is no backstop.
   *Fix shape:* `project_board_id IN (visibleBoardIds)`, root sees all — the boards
   pattern (needs `visibleBoardIds` exported from boards.ts + an actor arg threaded
   through the intel reads and ipc). **NULL fork — SETTLED (LOCKED, 2026-07-17): C1 /
   Option 1 — NO NULL `project_board_id` ROWS, EVER.** The rejected alternative was
   "creator+root sees NULL/unassigned-pool rows"; it was turned down so the gate needs
   **no NULL branch at all** — a plain `IN (…)` is correct and complete. This is why C1
   had to land BEFORE the gate: SQL `IN` never matches NULL, so any NULL-project row
   would be invisible to every non-root user (and, under Option 2, would have needed a
   messy OR-branch on both the cloud query and the mirror). **0a-1 DONE (`8eae348`):**
   compose (`addSocial`/`addInterview`/`addDocument`) now REQUIRES a project — the
   Add/Save/Upload buttons are disabled with an inline hint until one is selected, the
   row is stamped at INSERT (not a follow-up `setProject`), and the cloud fns refuse to
   insert without one (backstop). **0a-1b DONE (`2e22178`):** the pipeline writer stamps
   too (see the ▲ 2026-07-17 block below). Cloud is now **0 NULLs** and stays that way, so 0a-2 is a
   plain in-query gate. ⚠ **0a-2 caveat (see NOTE at the end of NEXT UP): the boards
   fetch-all-then-JS-filter precedent does NOT transfer** — `getSources` is paginated
   (`.range()`) and the counts can't be JS-filtered, so intel's gate must live IN THE
   QUERY (`.in()` cloud-side, `IN (?,…)` mirror-side).
   ***RESOLUTION — 0a-2 DONE (`a5d4b20`, 2026-07-17):*** the intel READ TIER is now
   membership-scoped. `getSources` + the five counts (`getUnreviewedCount`,
   `getPipelinePending`, `getStatusCounts`, `getUnscoredCount`, `getImportedCount`) each
   gate on BOTH the cloud path (`.in('project_board_id', ids)` chained before `.range()`,
   and on all three of `getStatusCounts`' `head:true` fan-out counts) AND the mirror/offline
   fallback (`AND project_board_id IN (?,…)`). **Root skips the filter entirely** (byte-
   identical to before). **Empty visible set short-circuits BEFORE any query** (`[]` / `0` /
   the zero-valued object) — SQLite `IN ()` is a syntax error and `.in(…, [])` is
   inconsistent cloud-side. **No preload/renderer change** — the actor is ambient via
   `currentActingUserId` (the `boards:list` pattern). A new exported `visibleBoardIdsFor()`
   wrapper in `boards.ts` funnels this; `visibleBoardIds` stays private.
   ⚠ **DON'T-"FIX"-THIS-LATER NOTE:** `visibleBoardIdsFor` uses **`resolveIdentity`
   (LOCAL-only), NOT `resolveActor`** — `resolveActor` does a `member_permissions` CLOUD
   roundtrip on every non-root call, and the gate runs **6× per tab load**. `visibleBoardIds`
   reads ONLY `.isRoot`/`.email` off the Actor and NEVER calls `.can()`, so the synthesized
   `{ email, isRoot, can: () => isRoot }` is safe. Swapping to `resolveActor` would add six
   needless cloud roundtrips per tab load — a comment in `boards.ts` says exactly this.
   ***TEST THAT PROVED IT:*** root sees **all 3 socials** (filter skipped); dk@ with **zero
   memberships** sees **nothing everywhere, no crash** (the empty-set half); dk@ **granted
   Contested Skies** sees **2 socials, NOT the `board-info-trump` one** (the allow half, and
   the cross-project exclusion). Picker on "all projects" throughout (so no client-side
   filter confound), and both builds share one DB whose mirror holds all three socials — so
   the exclusion is the GATE, not a stale mirror.
   ***RESOLUTION — 0a-3 DONE (`46be18e`, 2026-07-17):*** the `info_page_*` READ TIER is now
   membership-scoped too. **DIFFERENT MECHANISM from 0a-2 — the reusable insight: a gate's
   shape follows the table's keying.** The `info_page_*` tables have NO `project_board_id`
   column and are ALREADY pageId-scoped in their WHERE clauses, so the gate is an **ENTRY
   GUARD** (`if (!(await isBoardVisibleFor(actor, pageId))) return <empty>`) — "may this
   actor see this pageId at all?", **all-or-nothing per page**. It cannot drop rows inside a
   JOIN, so it is **structurally safer than 0a-2's per-row `.in()`** (no pagination/`head:true`
   corruption risk). 11 reads gated (`getConfig`, `getItems`, `getCommits`, `getPublished`,
   `getSourceItems`, `getSourceStats`, `getAnalysisSources`, `getChat`, `getSourcePipeline`,
   `getSourceChanges`, `getSourcePipelineCounts`), each returning its EXISTING empty shape on
   deny. `infoPages:list` (no pageId) got the `deleted=0` fix + a `visibleBoardIdsFor`
   intersection; `syncSources` got a target-page gate. **New primitive:** `isBoardVisibleFor`
   (`boards.ts`) — the pageId analog of `visibleBoardIdsFor`. ⚠ **SAME DON'T-"FIX"-THIS-LATER
   NOTE:** it does NOT use the existing `isBoardVisible`, which calls `resolveActor` (a
   `member_permissions` roundtrip) PLUS `visibleBoardIds` = TWO cloud calls per invocation, in
   handlers the Info Pages left panel polls. **Gate axis SETTLED:** membership (`board_members`)
   governs READ visibility; `info_page_owners` governs `canApprove` on the PUBLICATION side —
   the codebase already had this split right; 0a-3 did not invent it, only enforced reads.
   ***TEST THAT PROVED IT:*** root sees all 4 pages ("blahblah" gone — the `deleted` fix);
   dk@ (member of Contested Skies) sees ONLY Contested Skies and **every tab is identical to
   root's**; dk@ revoked sees an EMPTY list, no crash. **Method matters:** a misfiring entry
   guard renders as "empty page," NOT as an error — so only the tab-by-tab comparison of the
   member's page against root's discriminates a correct gate from a broken one.
   ***RESOLUTION — 0a-4 DONE (`26ee18c`, 2026-07-17): the WRITE surface is gated.*** ~20
   `infoPages:*` mutation handlers took a pageId and checked NOTHING; a non-member could
   mutate a page they cannot read. 0a-4 added the FIRST server-side check to each, across
   **three deliberately-distinct axes** (do not mix them up):
   - **M = membership (`isBoardVisibleFor`)** — content + pipeline writes: `addItem`,
     `updateItem`, `deleteItem`, `commitItems`, `sendSourcesToAnalysis`, `sendToReview`,
     `backSourceToNew`, `moveBackToIntel`, `commitSources`, `saveReviewNotes`, `clearChat`,
     `chat`, `getOwners` (the one READ 0a-3's sweep misfiled under the ownership axis), and
     `routeToNewSources` (the target-page write, shared by three `intelligence:*` callers).
   - **A = canApprove** — publication writes: `reviewCommit`, `adminReviewCommit`,
     `logPublished`, `publishToRepo`. **NOT membership** — that would deny a legitimate owner
     who isn't a board member (the `isOwner` trap 0a-3 avoided). ★ **KEY FINDING (Task-1
     verify-before-build paid for itself): `isOwner` ALREADY folds in root (`isRoot → true`),
     so `isOwner` IS `canApprove`** — no new primitive, `boards.ts` UNTOUCHED.
   - **R = root** — the four ORPHANED handlers: `create`, `delete`, `saveConfig`,
     `updateMeta`. ZERO renderer call sites (the UI routes through the root-gated cloud
     `boards:*` path, superseded at B0.6), so console-reachable only. ⚠ **`infoPages:delete`
     is a HARD delete** of `workspace_boards` + `info_page_items`/`_commits`/`_owners` while
     the cloud path it replaced does a root-gated SOFT delete — now root-gated, behavior
     unchanged. Deleting the four dead handlers is its own cleanup slice (see NEXT UP).
   ***THE FIVE NO-pageId RESOLVES (where a bug would have hidden):*** `updateItem`,
   `deleteItem`, `reviewCommit`, `adminReviewCommit`, `sendSourcesToAnalysis` key on an
   item/commit id — each resolves `page_id` first (`SELECT page_id FROM info_page_items
   WHERE id=?` / `… info_page_commits …`, both columns verified against db.ts) and **DENIES
   on a no-row resolve**. `sendSourcesToAnalysis` **fails closed on the WHOLE batch** — no
   filter-and-partial-apply. **Principle:** a wrong resolve either denies everything or gates
   nothing, and both look plausible in testing.
   ***DENY SHAPE — silent-failure class, INSTANCE SIX:*** deny returns `{ ok: false, error }`
   + a main-side `console.warn` (handler, actor, pageId). **NOT a throw** — most renderer call
   sites are fire-and-forget and ignore the return, so a denied write would no-op SILENTLY
   while the UI shows optimistic state until the next refetch. (Exceptions that DO check:
   `publishToRepo` reads `res.ok`; `addItem` captures the new id.) The `console.warn` is the
   audit trail. Logged as the SIXTH instance of the documented silent-failure class.
   ***TEST THAT PROVED IT (record the method):*** as dk@ (member of Contested Skies only).
   **ALLOW via UI:** approve→route (`routeToNewSources` — the riskiest change, shared by three
   intel callers), `sendToReview`, `saveReviewNotes`, `backSourceToNew`, `moveBackToIntel`
   (cross-tier: the intel row correctly reverted to `unreviewed`), `chat`. **DENY via devtools
   `window.api`:** `saveReviewNotes('board-info-trump',…)` → `{ok:false,'Not authorized'}` [M];
   `getOwners('board-info-trump')` → `[]` [M]; `saveConfig('board-info-latam',…)` →
   `{ok:false,'Only an admin can edit page settings.'}` [R]. ★ **The third is the sharp one:
   dk IS a member of latam, so the M gate would have ALLOWED it — blocked anyway means the R
   axis works INDEPENDENTLY of membership.** Testing pattern: to prove an axis, find the case
   where ONLY that axis can produce the result. **The deny half is CONSOLE-testable, not
   UI-testable** — a non-member has no UI path to a page they can't see; the one real UI
   trigger is the revoke-with-open-tab race (stale `selectedPageId`), same class as findings 3/4.
   ***CORRECTIONS to 0a-3's write inventory:*** `analyzeWithClaude` (`3412`) and
   `summarizeAnalysis` (`3541`) are **NOT writes** — no INSERT/UPDATE/DELETE; they read
   chat/prefs, call the Anthropic API, and return. They are **reads-with-API-cost** (a page
   you can't see could still burn the API key) — left ungated; flag as an OPTIONAL
   cost-protection item, not a state-integrity gap. `generatePrompt` (`3581`) is pure compute.
   ***STILL OPEN under this finding:*** none — finding 1 is CLOSED. (Remaining from the
   original five: finding 3 = 0b realtime health, finding 4 downstream of 3, finding 5 updater.)
   See NEXT UP.

2. **PICKER OFFERED A PHANTOM PROJECT — approve routed under a stale seed name.**
   *Observed:* with no visible info-page project, dk@'s per-card picker offered a
   LATAM-drone-named option and an approve routed there; read at the time as "LATAM
   drone monitor" (`3c4671de`), archived + local-only.
   *Diagnosed (initial attribution REFUTED):* `3c4671de` exists in CLOUD
   (`board_type='standard'`, archived=1 — it's dk's archived Workspace board, dk IS a
   member) and ZERO `intelligence_sources` rows point at it; every archive filter
   (`listBoards` `.eq(archived,0)`, `readBoardsMirror` `COALESCE(archived,0)=0`,
   `infoPages:list` `archived=0`) verifies correct. The REAL mechanism: `infoPages:list`
   is a LOCAL, visibility-unfiltered read; on a fresh non-root machine `db.ts:977-978`
   seeds `board-info-latam` under its STALE PRE-RENAME NAME **"LATAM Drone Threat"**
   (+ `board-info-trump` "Trump Immigration"); the cloud rows never overwrite them
   (`listBoards` is visibility-filtered and dk isn't a member) and `syncBoardsMirror`'s
   DELETE deliberately excludes info-page rows — so the stale seeds survive forever and
   feed the picker. The routed target was `board-info-latam` — the right project wearing
   a 2025 name, selectable by a user the top picker says can't see it.
   *Also real:* `routeToNewSources` never validates the target is an info-page (its board
   lookup is display-name only), and the per-card picker has three first-item defaults:
   the Approve gate passes on `projects[0].name` with nothing chosen; a set-but-unlisted
   `project_board_id` makes the `<select>` silently DISPLAY the first option; and Approve
   AUTO-COMMITS the displayed value via `handleProjectSelect` when the source had no
   project.

3. **MEMBERSHIP CHANGES DON'T PROPAGATE until restart.**
   *Observed:* root granting dk@ board access didn't reach the dk@ session until a full
   app restart. Initial hypothesis: "the event granting access is filtered out by the
   access check it grants" (isRelevant → isBoardVisible fails pre-membership).
   *Diagnosed — THREE hypotheses now REFUTED (2026-07-17 verification):*
   **(1) own-email-filtered grant — REFUTED (recorded earlier):** `board_members` events
   do NOT use `isBoardVisible`; they route to `boardMembersRelevant`, which passes on
   **own-email FIRST** (`rowEmail === actor.email`) before any visibility check, so a
   grant to your own email is relevant by design.
   **(2) `board_members` missing from the publication — REFUTED:** verified in the SQL
   editor — `board_members` **IS in `supabase_realtime`**, all 4 columns, rowfilter null.
   **(3) thin-DELETE-payload revoke gap — DEAD:** verified `board_members` **IS REPLICA
   IDENTITY FULL** (`relreplident='f'`), so DELETE old-rows carry the full row incl.
   `user_email`. The docs that listed only tasks/columns/comments/activity/checklists/
   items in the FULL set are **STALE**. So the revoke DELETE is NOT thin, and the
   "revoked user keeps seeing the board because the payload is empty" theory is wrong —
   **the revoke gap is not what we thought.**
   *Sole remaining suspect (now the whole of finding 3):* **realtime channel death while
   HTTP stays healthy.** The `aba6b91` resubscribe fires ONLY on the HTTP-derived
   offline→online edge, so a socket-only failure (CHANNEL_ERROR while HTTP probes keep
   succeeding) never rescopes and never refetches — the grant/revoke event is simply
   never delivered to a dead channel. **This makes 0b a REALTIME HEALTH-DETECTION gap
   (detect + recover from channel death independent of the HTTP online flag), NOT a
   schema fix.** Finding 4 (truncated board view) remains a downstream symptom of this.
   *Correct gate (design, still holds):* judge membership events from the EVENT ROW, not
   current visibility — own-email always relevant (both INSERT and DELETE; the verified
   REPLICA IDENTITY FULL guarantees the DELETE carries the email), else visible-board,
   else FAIL OPEN on a thin payload. Renderer note: a membership invalidate is scope
   `'list'` → `loadBoards` only; tasks/columns need refetching too or finding 4 recurs.
   **★ DIRECT FIELD EVIDENCE (2026-07-18) — the first observation of the mechanism itself,
   recorded verbatim so 0b starts from evidence rather than a fourth hypothesis:** a dev run
   logged **every realtime channel going CHANNEL_ERROR (18 channels / 6 sources) WHILE HTTP
   STAYED HEALTHY** — `[Sync] cs_articles` succeeded in the SAME run. That is precisely the
   predicted shape: socket death with the HTTP-derived online flag never flipping, so
   `aba6b91`'s resubscribe (which fires ONLY on the offline→online edge) never runs and the
   grant/revoke event is never delivered. **Possibly-related lead from the same run:** 6×
   `started 18 channel(s)` plus a `MaxListenersExceededWarning` (11 listeners, limit 10) —
   **re-inits stacking within a single process**; a listener leak may be cause or co-symptom.

4. **TRUNCATED BOARD VIEW (member board, no columns/cards) until restart.**
   *Observed:* dk@ IS a member of Think Tank (green check in Board Access) but the board
   listed with NO columns and NO cards. Initial suspicion: fresh-account ordering —
   getColumns/getTasks running before `board_members_mirror` is populated.
   *Diagnosed (suspicion REFUTED):* the members mirror is ONLY the offline/cloud-error
   fallback; online, every read (`listBoards`/`getColumns`/`getTasks`) independently runs
   `resolveActor → visibleBoardIds` against CLOUD per call — identical gating, no cache,
   no mirror-ordering window (on cloud error a fresh account fails CLOSED by design).
   Real mechanism: dk's state was loaded BEFORE the grant; the grant invalidate never
   arrived (finding 3); whatever later re-ran `loadBoards` made the board row appear, but
   tasks refetch only on `'board'`-scope invalidates that never came — board visible,
   content frozen pre-grant. **A downstream symptom of finding 3, not a separate gate or
   ordering bug.**

5. **UPDATER REPORTS SUCCESS AFTER TOTAL FAILURE — SILENT FAILURE #5. (Bug still REAL;
   one observation CORRECTED.)**
   *Observed:* the Standard account's Terminal updater printed "✓ Update complete" after
   every `rm` failed Permission denied. ⚠ **CORRECTION (2026-07-17): the installed app is
   `2.2.0`, NOT `2.0.22` — the auto-update manifests worked.** The "stuck two releases
   stale" observation was wrong; only that observation is stale. **The unconditional-success
   bug itself is still real and unfixed** — the updater prints success regardless of outcome
   (see *Diagnosed* below), which is exactly why a working update and a failed one look
   identical from the message.
   *Diagnosed:* `updater:openTerminalUpdate` (src/main/index.ts:178-203) generates
   `$TMPDIR/kch-update.command`, which pipes `install.sh` (fetched from GitHub raw,
   `main`) into bash and then prints "✓ Update complete" **UNCONDITIONALLY** — no
   `set -e`, no exit-code check. `install.sh` itself HAS `set -e` and correctly aborts
   when `rm -rf /Applications/...` fails in a Standard account — and the wrapper ignores
   bash's exit status. Worse: if `curl` itself fails (offline/404), bash receives EMPTY
   input and exits 0 — success printed after doing literally nothing. Purest specimen of
   the class yet: the success message is hardcoded.
   *Asymmetry worth knowing:* `install.sh` is fetched from `main` at RUNTIME, so fixing
   that half ships instantly on push; the wrapper lives in `src/main/index.ts` and needs
   a release.

**▲ 2026-07-17 — INTEL ACCESS-GATE PREP (0a-1 + 0a-1b): a pipeline NULL-writer bug and
the sharpest lesson of the batch.**

**A. NEW BUG — the pipeline NULL writer (found + fixed today).** `syncFromContestedSkies`
built its candidate rows with **no `project_board_id`**, so every GDELT article inserted
since the `cfdd4b1` migration landed in cloud with `project_board_id=NULL`. The crucial
detail: **`cfdd4b1` backfilled the DATA (the 242 historical rows) but never fixed the
WRITER**, so each subsequent sync silently minted fresh NULL-project articles. 7 such rows
existed (inserted 2026-07-17 09:47:12Z); they were **hand-backfilled** via the SQL editor
and the run is recorded in `sql/2026-07-17_intel_project_board_backfill.sql`. Fixed by
stamping a named constant `CONTESTED_SKIES_BOARD_ID='board-info-latam'` onto the candidate
object (`insertPipelineArticles` still writes faithfully what it's handed; the caller owns
the mapping — `cs_articles` has NO project column, the pipeline is single-project by
design). The dormant NewsAPI writer got the same constant. **Verified live:** article
`79d326b3` synced 2026-07-17 11:53Z landed in cloud with `project_board_id='board-info-latam'`.

**B. ★ THE MASKING SEED — `db.ts:1036` (first-class lesson, the sharpest thing found this
batch).** At every startup this runs `UPDATE intelligence_sources SET
project_board_id='board-info-latam' WHERE type='article' AND project_board_id IS NULL` —
**LOCAL MIRROR ONLY, never cloud.** It **completely masked the broken writer**: the local
mirror always looked correct, so the NULL-writer bug survived the ENTIRE `cfdd4b1`
migration undetected — the app looked right on every machine. Worse: **it is where the 242
historical rows' `project_board_id` CAME FROM.** `cfdd4b1`'s backfill read the LOCAL mirror
and inherited a value the seed had laundered in — the value was **never computed from any
source of truth.** Generalize this: **A LOCAL FIXUP THAT PAPERS OVER A CLOUD WRITER HIDES
THE WRITER'S BUG AND LAUNDERS FAKE PROVENANCE.** It's the sibling of the SILENT-FAILURE
rule "a fallback that swallows the error also swallows the signal" — here a fixup that
swallows the *defect* also swallows the *provenance*. The seed is **still live and still
masking**; it becomes removable now that the cloud writer is verified stamping (its comment
now records all of this; behavior unchanged this slice).

**C. DISCIPLINE — commit backfill scripts/SQL.** `cfdd4b1`'s own backfill script was **never
committed** (a scratchpad file, since deleted), which is exactly why the 242 rows'
provenance had to be reverse-engineered today. New rule: **backfill scripts/SQL get a
committed, dated file under `sql/`** (hence `sql/2026-07-17_intel_project_board_backfill.sql`,
a RECORD — not auto-run).

**D. GOTCHA — how to actually test the pipeline sync.** It imports only `cs_articles` rows
with `imported_to_hub=false`, AND `insertPipelineArticles` upserts `onConflict:'url',
ignoreDuplicates:true`. So **un-importing an already-imported row proves NOTHING** — its
URL already exists in `intelligence_sources`, so the upsert silently skips it and no row is
written. To force a real test, find a `cs_articles` row whose `url` is **not yet** in
`intelligence_sources` (a not-exists query), then flip `imported_to_hub=false` on that one.

**▲ 2026-07-17 — INTEL READ GATE (0a-2, `a5d4b20`): a settled namespace correction, two
new bugs, and the testing gotchas that cost real time.** (The gate mechanics + the
resolveIdentity decision + the proving test all live under finding 1's RESOLUTION above.)

**E. ★ THE ID NAMESPACE IS UNIFIED (SETTLED — the 0a-2 diagnosis was WRONG).**
`project_board_id` values ARE info-page board ids. Verified: `board-info-latam` and
`board-info-trump` are BOTH `board_type='info-page'` rows in `workspace_boards`, and all
251 intel rows point at one of those two. The 0a-2 diagnosis claimed `project_board_id`
holds "standard project board ids, not info-page board ids" — **WRONG. `pageId` and
`project_board_id` are the SAME namespace.** Consequences worth recording: **membership on
the info-page board is what grants intel access** — this IS the designed model (Project
Members = per-project `board_members` = the intel side); and **0a-3's pageId-visibility
check asks the SAME question as the intel gate**, not a different one. Do NOT design 0a-3
around a namespace split.

**F. CLOSED (0a-3) — the client-side picker filter is a NON-BUG.** The 0a-2 diagnosis
stated "the picker isn't even a filter — no tab threads the selected project into
`getSources`." The 0a-3 diagnosis answered it fully: the client-side filter
(`NewsTab.tsx:540`, `SocialTab.tsx:340`, `InterviewsTab.tsx:240`, `DocumentsTab.tsx:252`)
compares `project_board_id` against the selected project, and it is **COMPLEMENTARY and SAFE,
not contradictory.** The picker's list comes from `boards.filter(b => b.board_type ===
'info-page')` over `useWorkspace().boards`, which is populated by `boards:list` — **ALREADY
GATED**. A non-root picker can only ever list boards the actor is a member of, so the filter
**narrows an already-gated set and can never widen visibility.** A stale localStorage id is
reset to `'all'` by the guard at `Intelligence/index.tsx:59-63`, and 0a-2 has already excluded
those rows anyway. **Nothing to fix.** The "picker is not a filter" claim was wrong — it IS a
filter, client-side, and that is fine.

**G. FIXED (0a-3, `46be18e`) — `infoPages:list` `deleted` bug.** `ipc/index.ts:3039` filtered
`archived=0` but NOT `deleted`, so **soft-deleted info pages still populated the list and its
pickers** (observed: a `deleted=1` board named "blahblah" came back). Now
`COALESCE(deleted,0)=0 AND COALESCE(archived,0)=0`, plus a `visibleBoardIdsFor` intersection
(small, unpaginated read → a JS filter is safe here, unlike `getSources`). Was the sibling of
finding 2 (the other unfiltered local `infoPages:list` read).

**H. TESTING GOTCHAS (new, cost real time this session):**
- **The installed app does NOT contain uncommitted work.** dk@ was first tested in a second
  macOS account running the **INSTALLED 2.2.0**, which has the UNGATED reads — it produced a
  correct-*looking* number (2) for the WRONG reason. Sibling of the stale-`out/main` false
  negative: **verify WHICH BUILD is running before trusting any reading.**
- **Switch acting-users via sign-out/sign-in in the DEV build, not a second macOS account.**
  There is no user picker (`AuthContext` stamps `setActingUser` from `localUser.id`;
  switching = real sign-out + sign-in; sign-out is in **Settings**). The dev build and
  installed app share ONE DB
  (`~/Library/Application Support/kantor-consulting-hub/db/kantor-hub.sqlite`), so signing in
  as dk@ locally gives dk's identity against the FULL mirror — which is BETTER for gate
  testing: the stale-mirror confound disappears, and an excluded row is excluded by the GATE,
  not by absence.
- **dk@ needs one ONLINE read** to populate `board_members_mirror`, or the gate shows nothing
  for reasons unrelated to membership — indistinguishable from a correct empty-set result.
- **A number that matches expectation is NOT evidence if it's over-determined.** dk's "2" had
  three candidate causes (gate / stale mirror / client-side picker filter) and was consistent
  with all three. **Design tests where only ONE mechanism can produce the observed number.**

**I. STILL UNTESTED (carry forward — 0a-3 did not exercise these):**
- **The offline mirror gate** — `readMirrorSources`' own `IN (?,…)` never ran; every reading
  was online. Exercise it offline. **`isBoardVisibleFor` inherits the SAME offline path** via
  `visibleBoardIdsFor` → `board_members_mirror`, so 0a-3's gate is equally unexercised offline.
- **`getStatusCounts`' three-way `head:true` fan-out** — all articles are `board-info-latam`,
  so root and dk's News counts are identical either way. To exercise it, compose an article
  under a SECOND project (e.g. Immigration Undone) first.

**▲ 2026-07-17 — INFO_PAGE READ GATE (0a-3, `46be18e`): a gate whose shape follows the
table's keying, and a new primitive.** (Full mechanics + the proving test also live under
finding 1's second RESOLUTION above.)

**J. ★ THE REUSABLE INSIGHT — a gate's SHAPE follows the TABLE's KEYING.** 0a-2 gated intel
with a per-row `.in('project_board_id', ids)` because `intelligence_sources` HAS a
`project_board_id` column and its reads are paginated/`head:true` (JS-filtering impossible).
0a-3 could NOT reuse that: the `info_page_*` tables have **NO `project_board_id` column** and
are **ALREADY pageId-scoped in their WHERE clauses**. So the gate is an **ENTRY GUARD** —
`if (!(await isBoardVisibleFor(actor, pageId))) return <empty>` — "may this actor see this
pageId at all?", **all-or-nothing per page.** It cannot drop rows inside a JOIN, so it is
**structurally safer than 0a-2's per-row `.in()`** (no pagination/count corruption risk). Two
different mechanisms for the same invariant, each dictated by how its table is keyed.

**K. NEW PRIMITIVE — `isBoardVisibleFor` (`boards.ts`), the pageId analog of
`visibleBoardIdsFor`.** `if (!boardId) return false; const {isRoot, ids} = await
visibleBoardIdsFor(actor); return isRoot || ids.has(boardId)`. ⚠ **SAME DON'T-"FIX"-THIS-LATER
NOTE as 0a-2:** it does NOT use the existing `isBoardVisible` (`boards.ts:337`), which calls
`resolveActor` (a `member_permissions` cloud roundtrip) PLUS `visibleBoardIds` = **two cloud
calls per invocation**, in handlers the Info Pages left panel polls. `isBoardVisibleFor` rides
the LOCAL-only `resolveIdentity` path via `visibleBoardIdsFor`. Leave `isBoardVisible` for its
existing Realtime callers.

**L. GATE AXIS — SETTLED (the codebase already had it right).** MEMBERSHIP (`board_members`,
via `visibleBoardIds`) governs READ visibility; `info_page_owners` governs `canApprove` on the
PUBLICATION side. 0a-3 did not invent this split — it only ENFORCED the read half. `getOwners`
and `isOwner` were deliberately left on the ownership axis (see 0a-4 in NEXT UP for why
`isOwner` must stay ungated).

**M. WHAT GATED (11 reads) + the two specials.** Entry guard on `getConfig`, `getItems`,
`getCommits`, `getPublished`, `getSourceItems`, `getSourceStats`, `getAnalysisSources`,
`getChat`, `getSourcePipeline`, `getSourceChanges`, `getSourcePipelineCounts` — each returns
its EXISTING empty shape on deny (`[]`, `{}`, `{newAvailable:0,inAnalysis:0}`,
`{new:0,review:0,committed:0}`). `infoPages:list` (no pageId): `deleted=0` fix + a
`visibleBoardIdsFor` intersection. `syncSources`: target-page gate only. The Task-5 sweep found
NO main-process caller that would now receive a Promise (handlers are inline anonymous), and
tsc held at the 8-error baseline (zero new).

**KNOWN GAPS (tracked):**
- **Background refetch failures are silently swallowed** (2026-07-17) — the scroll-jump fix
  (`923f334`) made the realtime/reconnect refetch a `background` load that skips the spinner;
  its failure still hits the pre-existing `catch` that swallows the error and leaves the
  last-known data on screen. Pre-existing behavior, but now more consequential: a
  cross-device change that fails to land is **invisible** (no spinner, no error surface).
  Acceptable for now (fail-open, keeps stale-but-usable data), tracked for a later
  surfaced-error pass.
- **Stale mirror rows (244-vs-242, now 2 local-only articles)** — the upsert-only read sync
  can never remove a row, so mirror rows cloud no longer has (or never had) linger until
  touched. Keep tracking; cross-device DELETE via `applyToMirror` is the only removal path.
- **MIRROR PURGE — still open, now the last read-path residue.** 0a-3 closed the four
  info-page JOINs (the raw-SQL mirror reads that bypassed the gated `readMirrorSources`), so
  leaked intel rows are no longer REACHABLE through the pipeline. But they still sit on disk in
  non-root local mirrors, and the read sync is upsert-only so it can never remove them.
  Remaining UNSCOPED raw mirror reads (deliberately left): `syncSources`' cross-project source
  read (`ipc:3358`, commented in place as a known defense-in-depth gap) and the two dedup url
  reads (`ipc:113/114` — urls only, no content; flagged, not gated). A purge remains its own
  cleanup step, unscheduled.
- ~~**Realtime dead after reconnect**~~ — **CLOSED** (`aba6b91`): deterministic
  teardown+resubscribe on the online edge + renderer refetch.
- **Cross-device verification pending** — no second Mac for ~2 weeks; will test via a
  second macOS user account instead (it gets its own `userData` and therefore its own
  local DB/mirror, so it exercises the same two-device paths).
- **Cross-device DELETE relies on realtime's `applyToMirror`** — the read sync is
  upsert-only and never removes; if the DELETE event is missed (app closed during it),
  the stale mirror row lingers until the row is touched again.
- **To-Do write-through revert** — `todo:complete`/`uncomplete`/`dismiss` still write
  `column_id`/`completed_at` to LOCAL `workspace_tasks` only, so a To-Do completion
  REVERTS on the next successful `getTasks` (the mirror overwrites it from cloud). Fix =
  route those writes through cloud (`updateTask`/archive). Its own slice.
- **`info_page_sources` migration** — the LAST table; the pointer tier under the
  already-migrated `intelligence_sources`.
- **Local `known_tags` global-unique index** — `db.ts:770` recreates the `(name,type)`
  unique index the cloud schema deliberately dropped; the local mirror can't hold the
  same tag name under two projects. Fix BEFORE a second project's tags go live.
- **Group-B reads offline** — comments/checklists/task-labels/labels/areas/members/chat/feed
  return empty offline (no mirror); their views show empty. Each is mirrorable later.
- **Contested Skies renders BOTH source surfaces** — "New Sources" (pipeline,
  `info_page_sources`) AND the legacy manual "Sources" tab (`info_page_items`): two
  surfaces, different tables, UX confusion. Needs a consolidation decision.
- **`addApprovedSourceToInfoPages` is defined-but-uncalled dead code** (retired in 3c;
  still reads local `intelligence_sources`). Delete when convenient.

**NEW MILESTONE (Dorian, locked): END OF JULY = COMPLETE INTEL PROCESS. PUBLISHING MOVES
TO AUGUST.** Rationale: **intel is done by SIX people** and is currently
local-SQLite-per-machine (i.e. impossible as a team activity); **publishing is done by
DORIAN ALONE** and can stay local indefinitely. This **INVERTS the old Phase-B priority**
— the cloud migration is needed for **INTEL**, not for the info-page content tables.

**NEXT UP, in order:**
0. **⛔ THE INTEL ACCESS GATE — CLOSED END-TO-END (reads + writes) AND SHIPPED.** Split into
   0a-1 / 0a-1b / 0a-2 / 0a-3 / 0a-4 (ALL DONE). Finding 1 is closed. **RELEASED in v2.3.0
   (2026-07-17, tag `v2.3.0`, version-bump `a4b161e`)** — researchers self-update off the
   ungated 2.2.0. The next step is now 0b (realtime health):
   - **0a-1 — DONE (`8eae348`):** compose stamps a project at INSERT; NULL rows can no
     longer be created (the LOCKED C1/Option-1 decision — see finding 1).
   - **0a-1b — DONE (`2e22178`):** the pipeline writer stamps a project too; found+fixed a
     NULL-writer bug in the process (see the ▲ 2026-07-17 PREP block).
   - **0a-2 — DONE (`a5d4b20`):** the intel READ TIER gate. `getSources` + the five counts
     are membership-scoped on BOTH the cloud and mirror paths; root skips the filter; empty
     visible set short-circuits before any query; actor is ambient (`currentActingUserId`),
     no preload/renderer change. Full mechanics + the resolveIdentity-not-resolveActor
     decision + the proving test are in finding 1's RESOLUTION and the ▲ 2026-07-17 READ
     GATE block.
   - **0a-3 — DONE (`46be18e`):** the `info_page_*` READ tier gate. 11 reads got an ENTRY
     GUARD (all-or-nothing per page, structurally safer than 0a-2's per-row `.in()`);
     `infoPages:list` got the `deleted=0` fix + a visibility intersection; `syncSources` got a
     target-page gate. New primitive `isBoardVisibleFor` (NOT `isBoardVisible` — same roundtrip
     note as 0a-2). Full mechanics + the proving test are in finding 1's second RESOLUTION and
     the ▲ 2026-07-17 INFO_PAGE READ GATE block. (The historical-leak note is now resolved for
     the READ paths — see the MIRROR PURGE gap under KNOWN GAPS; the raw JOINs are gated, the
     on-disk rows remain until a purge.)
   - **0a-4 — DONE (`26ee18c`):** the `info_page_*` WRITE surface gate — the first
     server-side check on ~20 mutation handlers (before this, ALL authorization was
     renderer-side: a UI-only permission is a suggestion, not a gate). Three axes:
     **M**=membership (content/pipeline writes + `getOwners` + `routeToNewSources`),
     **A**=canApprove (`reviewCommit`/`adminReviewCommit`/`logPublished`/`publishToRepo` —
     `isOwner` IS canApprove because it folds in root, so NO new primitive and `boards.ts`
     untouched), **R**=root (the four orphaned `create`/`delete`/`saveConfig`/`updateMeta`).
     Five id-only handlers resolve `page_id` first and deny on a no-row resolve;
     `sendSourcesToAnalysis` fails closed on the whole batch. Deny = `{ok:false,error}` +
     `console.warn` (silent-failure class instance six). Full mechanics + the M/A/R map + the
     proving test are in finding 1's third RESOLUTION.
   - **RELEASE v2.3.0 — ✅ DONE (2026-07-17, tag `v2.3.0`, version-bump `a4b161e`):** the
     access-control tier (0a-1…0a-4 + the scroll-jump fix) shipped. 8 assets on GitHub
     Releases incl. both auto-update manifests; researchers self-update off the ungated 2.2.0.
     This UNBLOCKED 0b's verification (below).
   - **0b — NEXT (the membership-propagation fix, was finding 3):** now scoped as a REALTIME
     HEALTH-DETECTION gap (detect + recover from channel death independent of the HTTP online
     flag), NOT a schema fix — the publication + REPLICA IDENTITY FULL theories are both
     refuted (see finding 3). The last piece of finding 1's original five. ⚠ **Its verification
     is build → RELEASE → observe in the field** — it needs two concurrent sessions on separate
     DBs, and dk's macOS account has no dev build; so it can only be proven once shipped.
     - **★ 0b NOW HAS DIRECT FIELD EVIDENCE (2026-07-18) — start from this, NOT a fourth
       hypothesis.** A dev run logged **every realtime channel going CHANNEL_ERROR (18 channels
       / 6 sources) WHILE HTTP STAYED HEALTHY** — `[Sync] cs_articles` succeeded in the SAME
       run. **This is the first direct observation of the 0b mechanism**: channel death
       independent of the HTTP online flag, which `aba6b91`'s resubscribe can never catch
       because it fires only on the HTTP offline→online edge and that edge never flips.
     - **Possibly-related lead (same run):** 6× `started 18 channel(s)` plus a
       `MaxListenersExceededWarning` (11 listeners, limit 10) — **re-inits stacking within one
       process**. A listener leak may be a cause or a co-symptom; worth checking early.
   - **THE `visibleBoardIds` NON-ROOT NO-JOIN — ✅ DONE (`2d76b9a`, 2026-07-18).** The
     FOUNDATION under the whole tier. *The gap:* the non-root path read `board_members` by
     email with NO JOIN to `workspace_boards`, so it never filtered `deleted`. **`board_members`
     rows SURVIVE a soft-delete** — `deleteBoard` updates ONLY `workspace_boards` (verified,
     quoted in the commit) — so a since-deleted board's id stayed in the visible set FOREVER.
     The 0a-2/0a-3/0a-4 gates trust that set DIRECTLY (`.in('project_board_id', ids)` /
     `isBoardVisibleFor`), so a member of a since-deleted board kept SEEING and MUTATING its
     intel and info-page content — even though the board had vanished from `listBoards`, which
     re-intersects its own `deleted=0` query and was therefore MASKED. The intel and info_page
     gates were not masked. *Fix shape (Option B), non-root branch only, BOTH paths:* online
     intersects the member board_ids against a `workspace_boards deleted=0` lookup; **offline**
     against `localBoardIds()` — the BOARDS mirror carries `deleted`, but `board_members_mirror`
     is `(board_id, user_email)` only, **which is exactly why a PostgREST embedded join was not
     viable** (inexpressible offline). Fixed in the PRIMITIVE so all ~34 call sites heal at once.
     - **`deleted` only, NOT `archived`.** `localBoardIds` filters `COALESCE(deleted,0)=0` with
       no archived clause, so archived boards stay in the set — archived Workspace boards and
       `listArchivedBoards` keep working for non-root members. (Info-page boards are
       delete-only today, so no archived-info-page case exists regardless — see the backlog
       item on giving info-pages an archive option.)
     - **★ THE ROOT ASYMMETRY IS LOAD-BEARING, NOT A BUG.** `isBoardVisible`/
       `isBoardVisibleFor` short-circuit `isRoot → true` BEFORE consulting the set, so root
       reaches deleted boards. That is REQUIRED for Trash / `undeleteBoard` / `restoreBoard` /
       `permanentlyDeleteBoard`. **Do NOT "fix" it.** Root's branches were left byte-identical.
     - **Error path does not fail open:** on a board-lookup error it falls back to
       `memberIds ∩ localBoardIds()`, never the raw unfiltered set, so the leak cannot silently
       reappear. Fail-closed on an unsynced boards mirror (empty intersection) — same known
       limitation as 0a-2, commented in-code so nobody flips it to fail-open.
     - **Tested (the SECOND, verified attempt — see the phantom-test lesson):** a PERSISTED
       document row (confirmed in cloud, `project_board_id=blabla`) with blabla's `deleted`
       flag confirmed 1/0 in cloud AT EACH STEP. Root soft-deletes blabla → the document leaves
       dk's Documents tab AND blabla leaves dk's picker; root restores → both return. Round
       trip, same row, full sign-out between — visibility flipping purely on the board's
       `deleted` flag.
   - **[NEW BUG — its own slice] SILENT UPLOAD FAILURE (silent-failure class, INSTANCE SEVEN).**
     A document uploaded via the Documents tab showed a **SAVED badge and rendered in the tab**
     but **never persisted to the DB** — confirmed: ZERO `document`-type rows existed in cloud
     OR local until a second, verified upload. User-facing impact: a researcher uploads, sees
     success, and the row is simply gone. **Flag only — do NOT chase now.** When investigated:
     verify the upload's write path and whether a bare `catch` or an unawaited promise swallows
     the failure. (Found while diagnosing the phantom test — see that lesson.)
   - **[BACKLOG — feature, not parity] INFO-PAGES NEED AN ARCHIVE OPTION.** Info-page boards
     are **DELETE-ONLY** today: Workspace boards archive, info-pages don't. For a PUBLISHED
     project, delete is the wrong verb — you'd want to **shelve it while keeping the live site
     and its history**. A genuine feature. (Also why the no-join fix's "archived stays in the
     set" decision has no info-page case to worry about today.)
   - **[cleanup slice] delete the four orphaned handlers** (`infoPages:create`/`delete`/
     `saveConfig`/`updateMeta` — zero renderer call sites, now root-gated as a stopgap) and,
     optionally, add M cost-protection to `analyzeWithClaude`/`summarizeAnalysis` (reads that
     burn the API key on a page you can't see — not a state-integrity gap).
   - **[still worth checking] finding 2's stale seed** — `infoPages:list` is now gated +
     `deleted`-filtered, so the phantom-picker half is moot; but `db.ts:977-978` still seeds
     `board-info-latam`/`board-info-trump` under their STALE PRE-RENAME names on a fresh
     non-root machine. Confirm whether that's still worth fixing (low severity now that the
     list is gated, but the wrong name can still surface).

   **★ NOTE (kept for 0a-3's own reads) — the boards precedent does NOT transfer.** Boards
   fetch-ALL-then-filter-in-JS (`rows.filter(b => actor.isRoot || visible.has(b.id))`).
   `getSources` is **PAGINATED** (`.range(offset, offset+limit-1)`), so a JS filter would
   run AFTER the range and silently corrupt pagination (drop rows from an already-capped
   page); and the **count reads can't be JS-filtered at all** (they're `head:true`
   count-only). So intel's gate MUST live **IN THE QUERY**: `.in('project_board_id',
   visibleBoardIds)` cloud-side and `AND project_board_id IN (?,…)` mirror-side, plus the
   same `.in()` on every count. **C1 (0a-1/0a-1b) is what makes an unbranched `IN` safe.**
   *(This reasoning drove 0a-2, now DONE; kept because 0a-3's own reads face the same
   in-query-vs-JS-filter choice.)* **Testing note (0a-2, satisfied):** dk@ started with ZERO
   `board_members` rows (sees nothing — the blocking half); granting dk membership on
   Contested Skies exercised the allow half (dk then saw the 2 latam socials, not the trump
   one). Both halves are now proven.
   **Cloud state for reference (verified in the SQL editor 2026-07-17, incl. a NOT EXISTS
   orphan check): 251 rows, 0 NULLs, 0 orphans.** Per-type: `board-info-latam` 247 article
   + 2 social + 1 interview; `board-info-trump` 1 social. **ZERO document rows** — an empty
   Documents tab is EXPECTED, not breakage. (Corrects the earlier "253 rows / 252-breakdown
   / 1 document" figures — all three were wrong.)
1. **`info_page_sources` migration** — the LAST table (the pointer tier under the
   migrated `intelligence_sources`; same template).
2. **To-Do write-through** — route `todo:complete`/`uncomplete`/`dismiss` through cloud so
   To-Do completions stop reverting on the next `getTasks` (see KNOWN GAPS). Small slice.
3. **To-Do data half** — `personal_todos` → cloud, personal steps,
   `board_members.can_assign`, `assigned_by`, completion notification.
4. **Pre-route editing** (locked decision — full statement under **Known issues → Pre-route
   editing (locked, unbuilt)**; the numbered decisions are in **Locked design decisions
   (Intelligence + Info Pages restructure)**, both below).
5. **T6b + per-card tag scoping — COMBINED into one slice** (same prop threading; doing
   them separately means threading twice).
6. **Human-relevance feedback loop** into the Haiku gate (**PIPELINE repo**).
7. **Collection dedup + outlet targeting** (**PIPELINE repo**).
8. **Interview span annotation** (design-first; at risk of slipping to August).

Then: **narrow publish v1 in August.**

**The headline of the shipped work: Path B — structured identifier extraction is live
end-to-end.** The AI analysis no longer produces only prose; it now emits a **structured
catalogue** that survives routing and renders on both surfaces:
- **B1** (`dd37e40`) — `analyzeText` returns `article_type` + **`capabilities[]`**
  `{system, actor, actor_type, cost, category, relationship}` + **`key_facts[]`**
  `{label, value}` into `analysis_json.ai`, no-invention-governed, **verbatim** specifics.
- **B2** (`e379d2f`) — the News card renders it: article-type badge, color-coded
  **SYSTEMS** table, **KEY FACTS** list, graceful-degrade.
- **B3** (`51a9569`) — the same render ported to the **Info Pages New-sources cards**
  (`PipelineSourceCard`), via a shared `actorTypeClass` module. **No backend change** —
  `getSourcePipeline`'s live JOIN already returns `analysis_json`, so the structure
  travels (and stays live: re-analyzing the intel source updates the card).

Net state of the four source types (**News / Documents / Social / Interviews**):
- **Human-first capture** — researcher notes primary, on-demand AI (never auto-run),
  editable reconcile — on all four (News matched at 3e-1).
- **Send-to-pipeline** — each routes into a project's "New sources" via the shared,
  type-agnostic `routeToProject` → `routeToNewSources`; **move-back** is bidirectional.
- **Project-scoped topic tags** — shared `TagPicker` with a per-project vocabulary
  (`known_tags.project_board_id`) on all four; News AI-suggested chips are clickable (T6a);
  and the **AI now reuses the project's existing vocabulary** instead of coining
  near-duplicates (**T7**).
- **Reconcile narrates from structure** (`edaab46`) — reconcile now narrates *from* the
  already-extracted `capabilities[]`/`key_facts[]` instead of re-deriving from raw text.
- **Duplicate handling** — News-only **Duplicate** action (mark + optional link), no
  learning signal.

## ★ Key design insight — prose summarizes, structure catalogues

**Named specifics (systems, costs, actors) must live in structured `capabilities[]`, not
in prose. This was proven empirically, not assumed.**

We tried **twice** to make the prose summary hold verbatim specifics (system names,
dollar costs) by strengthening the prompt (Phase 1's enumerated, article-type-aware
guidance, then a follow-up specificity revision). **Both failed and were reverted** —
prose *structurally abstracts*: a summary's job is to generalize, so "a $100K SkyFend
jammer held by Sinaloa" reliably degrades into "commercially available counter-drone
equipment." You cannot prompt that tendency away.

The fix was to stop fighting it and **split the two jobs**: prose narrates (Phase 1's
guidance still shapes *what* the narrative is about), while a separate **structured
extraction** (B1) catalogues the named specifics verbatim. **Do not re-attempt
"make the summary more specific."**

**`actor_type` is the thesis-critical classifier.** Of all the structured fields, the
`actor_type` on each capability (**VNSA** / **state** / **commercial** / **unknown**) is
the one the whole thesis turns on: it answers **"who has what"** — VNSAs *already
operate* counter-UAS systems while states are *failing to acquire* them. That is why it
is color-coded on the cards (amber VNSA / blue state), and why the Level-2 aggregation
(below) is the real destination.

**AMENDMENT (2026-07-15) — the summary regression had a SECOND, simpler cause: a schema
bug.** The relevance prompt's JSON contract never requested a `summary` key at all. Phase
1's guidance said "write your analytical summary as usual" — pointing at a field the
contract didn't ask for — so the model complied by cramming the narrative into
`relevance_reasoning` (600–840 chars in a field asking for "one or two sentences", styled
as an italic footnote). Confirmed against the live DB: every B1-analyzed row had
`ai.summary = NULL`. There was NO AI narrative summary on the analyze path at all.

The insight above STILL HOLDS — prose structurally abstracts, and the two reverted
experiments correctly failed at making prose hold VERBATIM specifics. But those
experiments were also fighting a missing field: there was no narrative slot to be
specific *in*. The fix (`c0be06f`) was to give the narrative its own home and let each
field do its job:
- `summary` = the analytical narrative (paragraph, ~4–7 sentences soft cap). Narrates
  significance; REFERENCES the specifics rather than re-listing them —
  `capabilities[]`/`key_facts[]` do the cataloguing.
- `relevance_reasoning` = a 1–2 sentence relevance VERDICT only.

Still do NOT re-attempt "make the summary hold verbatim specifics."

## ⚠ Lesson — SILENT FAILURE IS THE RECURRING BUG CLASS

**SEVEN instances now, same shape: a failure swallowed with no logging (or a fallback that
hides it), wrong output accepted as real.**

- **(a) B1 — `max_tokens: 1024`** truncated the structured JSON → parse failure →
  `{ok:false}` with **NO console output** (only a tiny footer line). Raised to 4096 + a
  60s timeout + `console.warn` on every failure path.
- **(b) The PDF bug** — `pdf-parse` was bumped to **v2.4.5**, a pdfjs-dist rewrite that
  needs `process.getBuiltinModule` (Node ≥20.16) to load its DOM polyfills. **Electron
  31's bundled Node is BELOW that floor**, so `require('pdf-parse')` threw `DOMMatrix is
  not defined` **AT LOAD TIME — before any file was read** — and **EVERY PDF upload failed
  identically**. A bare `catch {}` swallowed it and wrote `'[PDF text extraction
  unavailable]'` into the content column, so uploads looked successful and the AI
  **dutifully analyzed the placeholder**. Fixed by pinning `pdf-parse` to **exactly
  1.1.1** (thin Node wrapper, no pdfjs/DOM dependency, API-compatible with the existing
  call site — no call-site change). Both the PDF and DOCX catches now bind `e` and
  `console.warn`.
  - **KEY TRAP: upgrading LOCAL Node would NOT have fixed this** — the app runs on
    **ELECTRON's bundled Node**, not the system one. The standalone `node -e` test is what
    proved the *lib itself* was broken rather than the bundling path.
- **(c) `listArchivedBoards` throwing into a `Promise.all`** (offline arc) — it had no
  mirror fallback, and `loadBoards` awaits it in a `Promise.all` next to `listBoards`:
  one throw **discarded the sibling's perfectly good result** and blanked the sidebar
  offline. The failure wasn't even in the code being debugged. A read that can throw
  inside a `Promise.all` silently poisons everything joined with it.
- **(d) The mirror fallback killing `cloudError`** (offline arc) — Commit 1's fallback
  made the board reads stop throwing, which **silently killed the app's only offline
  signal**: the `cloudError` banner became dead code and nothing knew the app was
  offline. **A fallback that swallows the error also swallows the diagnosis** — fixed by
  the dedicated outcome-derived connection state (`reportCloudResult`).
- **(e) The Terminal updater's hardcoded success** (cross-device test, UNFIXED — see the
  ⛔ findings block) — the generated `kch-update.command` prints "✓ Update complete"
  unconditionally after `curl install.sh | bash`, with no exit-code check; a
  Permission-denied abort inside install.sh (or an empty curl) still prints success. The
  purest specimen yet: the success message isn't even derived from an outcome — it's a
  string literal after the pipeline.
- **(f) INSTANCE SIX — 0a-4's deny shape** (mitigated by design, not a live bug). The
  `info_page_*` write denials return `{ok:false,error}` rather than throwing, and MOST
  renderer call sites are fire-and-forget — so a denied write would **no-op silently while
  the UI showed optimistic state**. Mitigated with a main-side `console.warn` on every deny
  (handler, actor, pageId) so the audit trail exists even when the renderer ignores the
  result. See finding 1's third RESOLUTION.
- **(g) INSTANCE SEVEN — the SILENT UPLOAD FAILURE (NEW, 2026-07-18, UNFIXED).** A document
  uploaded via the Documents tab showed a **SAVED badge and rendered in the tab**, but **no
  row was ever written** — zero `document`-type rows existed in cloud OR local until a
  second, verified upload. The UI's success signal was derived from nothing durable. This is
  the failure that made the phantom test possible (below): the "present → deleted → gone"
  observation was UI state, because there was no persisted row to hide in the first place.
  Its own slice — see NEXT UP.
- **(h) INSTANCE EIGHT — the WRITE-ONLY ACTIVITY LOG (NEW, 2026-07-20, UNFIXED).** Found while
  verifying whether assignment logs card activity (it does not — see slice 4). `task_activity`
  has **two writers pointing at two different stores**: the comment event writes **CLOUD**
  (`TaskDetailPanel.tsx:654` → `addActivity`), the completion event writes **LOCAL**
  (`ipc/index.ts:1606`). But the only reader, `activity:get` → `getActivity`
  (`boards.ts:1120`), reads **CLOUD ONLY with no mirror fallback**. So every
  `"marked this task as complete"` entry written after the one-time `boardsSeed` upload is
  **written successfully, reports success, and is read by nothing.** A new variant of the
  class: not a swallowed error but a **durable write into a store nobody queries** — no error
  exists to swallow, which is why nothing caught it. Fix before slice 4 adds a third event
  type. **Related:** `addActivity` has no `isOnline()` guard and throws offline.
- **(i) INSTANCE NINE — the EMPTY STATE THAT ASSERTS ABSENCE IT CANNOT KNOW (NEW, 2026-07-20,
  UNFIXED).** Found during the 3b diagnosis. `getChecklists` (`boards.ts:1172`) opens with
  `if (!isOnline()) return []   // offline: no mirror for checklists`. Because checklists have
  **no local mirror** (unlike tasks/boards/columns/members/tags/roster, which all have a
  `syncXMirror`+`readXMirror` pair), the offline path returns empty — and the card renders
  **"No checklists yet."** (`TaskDetailPanel.tsx:1350`), while the Kanban checklist badge
  disappears (`WorkspaceContext.tsx:282` catches to `{total:0,done:0}`). **The read reports
  emptiness it has no way to establish.** Another new variant: not a swallowed error and not an
  unread write, but a **successful-looking read that answers "none" when the honest answer is
  "unknown".** The comment shows it was a conscious deferral — it has nonetheless been shipping
  a wrong answer. **A missing mirror is not a missing optimization; it is a correctness bug the
  moment any caller renders its result as fact.**
- **(j) INSTANCE TEN — THE CHECKBOX THAT SILENTLY REFUSES (NEW, 2026-07-20, UNFIXED).**
  `TaskDetailPanel.tsx` has **NO offline guard anywhere** — grepping `online` in that file
  returns **nothing**, in an app that has had a `ConnectionContext` and an edit lockout since
  `23de14d`. `handleToggleItem` (`:744`) awaits the cloud write **before** the optimistic state
  update and has **no `catch`**: offline the promise rejects, the `setChecklists` never runs,
  and the checkbox simply doesn't move — **no error, no toast, no log**. Same shape as the
  To-Do write-through bug `cc6aedf` and the `addActivity` defect queued for slice 4. **RULE
  RESTATED: an `await` on a network write placed BEFORE the optimistic update turns every
  failure into a no-op that looks like a misclick.**

**RULE: never write a bare `catch {}`. Bind the error and log it. A fallback must not
swallow the signal that something failed. A success message must be derived from the
outcome, never hardcoded after it. A placeholder that flows into the AI as content is
worse than a visible failure. Instance seven — a SAVED badge must be derived from a
CONFIRMED WRITE, never from the local optimistic state. And — instance eight — a WRITE
IS NOT DONE UNTIL SOMETHING READS IT BACK: check that the writer and the reader target
the SAME store, because a write to the wrong store raises no error at all.**

## ★ Lesson — THE PHANTOM TEST: VERIFY PRECONDITIONS BEFORE TRUSTING A SECURITY RESULT

**The most important methodology lesson of the 2026-07-18 session.** The FIRST attempt to
verify the non-root no-join fix (`2d76b9a`) produced a **false PASS that both Dorian and the
design side believed.** A read-only diagnostic later established it was **over-determined by
THREE stacked silent failures**, any one of which alone would have produced the same
"correct-looking" result:

1. **The uploaded document never persisted** — ZERO `document`-type rows in cloud OR local
   (silent-failure instance seven, above). The Documents tab fetches
   `getSources({type:'document'})`, so it rendered empty **for root too**, independent of any
   gate.
2. **The soft-delete never landed** — `blabla` was `deleted=0` in cloud (and in the local
   mirror). The test's core precondition was simply absent; dk was a member of a **live**
   board and *should* have seen its content.
3. **The fix was already compiled into the running build** — `out/main` had been rebuilt
   ~12h AFTER the source edit and the Electron main process had loaded it. So even a
   correctly-staged test could not have reproduced the pre-fix leak. *(A trap inside the
   trap: grepping the bundle for the fix's COMMENT returned 0 because **the build strips
   comments** — a false negative. Only grepping the fix's runtime STRING LITERALS, which
   survive compilation, proved it was live.)*

So the observed "document present → root deletes → document gone → root restores → document
back" was **UI/session state flipping, not the gate filtering persisted rows.**

**RULE: for a SECURITY test, confirm EVERY precondition in the AUTHORITATIVE STORE before
trusting the observed result — the persisted row, the flag value, and which build is actually
running. A result that MATCHES YOUR EXPECTATION proves nothing if the preconditions were never
verified.** This is the same **"looks right for the wrong reason"** class that recurred all
session (dk's 2, root's 2, HANDOFF's 253) — but here it nearly wrote an unverified test claim
into permanent git history. Verify build-liveness by CONTENT (string literals), not by
timestamp and not by comments.

## ⚠ Lesson — A CONTRACT IS ONLY AS GOOD AS ITS NARROWEST GATE

**The 1b dead-feature (shipped machinery, `4001652`; renderer fix in the same commit,
2026-07-19).** Slice 1b was scoped **"main-process only"** and delivered exactly that: personal
to-do writes went local-first, `syncPersonalWrite` queued the cloud push when offline, the drain
hooked `onReconnect`. Every main-side path honored the offline contract. Typecheck clean.

**And the feature was completely dead.** Three `if (!online) return` early-returns in
`Todo.tsx` — written long before 1b, when *every* to-do write really was cloud-authoritative —
short-circuited `handleAddPersonal` / `handlePersonalComplete` / `handlePersonalDelete`
**before `window.api` was ever called**. The local write was never reached, the queue never
received a row, and because the buttons were **not** disabled (no `online` in any `disabled=`
prop) the UI accepted the click and did nothing. Silent, and indistinguishable from a broken
queue. The natural next move — debugging `personalSync.ts` — would have been a hunt through
correct code.

**THE RULE: a per-source offline contract must be enforced at EVERY layer that can
short-circuit it. Verifying the main path is not enough.** When a slice changes *whether an
operation is allowed offline*, the audit is not "does my new code honor it" but **"what else
already decides this, and does it still agree?"** — renderer guards, disabled props, context
gates, and route locks all qualify.

**The generalization: this is the same shape as the compose silent-failure cluster** — the
write layer was faithful and the *caller* was wrong. Here the write layer was faithful and the
*caller never called*. When a correct-looking mechanism produces nothing, suspect the gate
upstream of it before the mechanism itself.

**Corollary on scope discipline:** "renderer-only" / "main-only" scoping is good for limiting
blast radius, but it is a statement about *where edits land*, **not** about where the behavior
lives. A behavioral contract crosses tiers even when the diff doesn't.

## ⚠ Lesson — A REFETCH MUST SWAP DATA UNDER STABLE KEYS, NEVER UNMOUNT THE LIST

**The scroll-jump regression (`aba6b91` → fixed `923f334`, 2026-07-17).** `aba6b91` added
`onSourcesInvalidate(() => load())` to all four Intelligence tabs so cross-device changes
refetch. But **Supabase `postgres_changes` is a WAL feed with NO origin concept** — there
is no "ignore my own writes" (the `self:false` option exists only for Broadcast, not
postgres_changes). So the app's OWN cloud writes — tag add, Analyze, approve, reject,
geography, confidence — echoed back to its OWN subscription ~250 ms later and called
`load()`. `load()` began with `setLoading(true)`, and every list renders as
`{!loading && visible.map(...)}`, so **the whole card list UNMOUNTED and remounted**,
resetting `scrollTop` to 0 a beat after every click.

**The defect was the REFETCH, not the echo** — an inversion of the standing rule "any
mutation that changes what should be visible must trigger a refetch." A legitimate
cross-device invalidate would have broken scroll **identically**; suppressing self-echo
would have masked one trigger while leaving the real bug (the unmount) in place.
**COROLLARY (record it): a refetch must swap data UNDER STABLE KEYS, never unmount the
list.** Keys were already stable ids, so React reconciles in place the moment the list
stops being torn down. Fixed with `load({ background: true })`: background refetches skip
the `setLoading` pair entirely (list stays mounted), while mount / filter-change /
user-triggered reloads keep the foreground spinner.

**Echo suppression was DELIBERATELY NOT built.** It would need hand-rolled write-tracking
(remember every id/column we just wrote, diff incoming events against it) and risks
DROPPING real invalidates — a dropped invalidate is an access/consistency failure, against
the fail-open discipline. Fixing the unmount is strictly better: it's correct for BOTH
self-echo and genuine cross-device events, with no state to keep.

**The arc (why):** make Source Intelligence human-first (researcher notes + on-demand
AI, never auto-run) and route items into a specific project's Info Pages "New sources"
via a **reliable board-id association** (`intelligence_sources.project_board_id`),
retiring the 93%-empty / stale-slug `disposition_tags` link and the keyword-match
fan-out.

**The 3c/3d commit pipeline (all committed + pushed, SQL-verified):**
- **3c-1** (`41d0acb`) — `routeToNewSources(id, boardId)` writes an `info_page_sources`
  pointer (`stage='new'`, `source_type`) keyed on `project_board_id`; idempotent via
  `UNIQUE(article_id,info_page)`+`INSERT OR IGNORE`. News Approve routes through it;
  the keyword fan-out (`addApprovedSourceToInfoPages` → `info_page_items`) is retired
  from both approve paths (`updateStatus` + `confirmImported`; fn left defined, uncalled).
- **3c-2a** (`8010183`) — full-item New-sources cards: `getSourcePipeline` SELECT +
  `InfoPageSourceRow` gain `type`/`analysis_json`/`intel_notes`; `PipelineSourceCard`
  shows a type badge, AI-analysis blocks (`.human`/`.ai`/`.reconciled`, only if present),
  and researcher notes — graceful-degrade.
- **3c-2b** (`588ac91`) — `infoPages:moveBackToIntel(pageId, articleId)`: DELETE the
  pointer (scoped `stage='new'`) + set intel `status='unreviewed'` + log `new→intel`.
  Per-card "↩ Move back to intel" via the card's `action` slot. Intel content/analysis/
  notes untouched.
- **3d-1** (`14d9386`) — dedicated `intelligence:routeToProject(id, boardId)` IPC
  (persists `project_board_id` → `routeToNewSources` → `status='routed'`; decoupled
  from approve/verdict). Wired the **DOCUMENTS** tab: projects-list project picker
  (defaults to selected project), "➤ Send to New sources" button (disabled until a
  project is chosen), optimistic removal + a load filter excluding `status='routed'`.
  Added `'routed'` to the `IntelligenceSource.status` union. Approve/Save/Reject untouched.
- **3d-2** (`9021518`) — applied the **exact 3d-1 Send pattern** to the **Social** and
  **Interviews** compose tabs: projects-list picker (defaults to the selected project),
  "➤ Send to New sources" button (disabled until a project is chosen) → `routeToProject`
  (**reuse — no backend change**), `handleProjectSelect`→`intelligence.setProject`,
  optimistic removal on send, and a `status !== 'routed'` load filter on each tab.
  Approve/Save/Reject and the action-row layout left **untouched** (cleanup is 3d-3).
  SQL-verified: Send from each tab creates an `info_page_sources` row `stage='new'` with
  `source_type` `social`/`interview` matching the intel `type`, and flips `status='routed'`.
- **3d-3** (`7f91ba7`) — compose action-row cleanup: dropped the now-vestigial
  **Approve / Reject** verdict buttons from Documents/Social/Interviews (superseded by
  Send-to-project). Action row is now **[project picker] · [Save] · [Send to New
  sources]**; removal is the header **Delete**. Save condition simplified to
  `status !== 'saved'`; `handleStatus` retained (Save uses it).

**Why this matters:** the routing engine (`routeToProject` → `routeToNewSources`) is now
proven **type-agnostic** — the same IPC drives article, document, social, and interview
Sends, and `source_type` is read from the intel row rather than hard-coded per tab.

**The tag/scoping series (T1–T5, all committed + pushed):** project-scoped topic tags on
all four source types, plus project-scoped compose views.
- **T1** (`af9a651`) — **project-scope thematic tags.** Idempotent `db.ts` startup
  migration adds `known_tags.project_board_id`, backfills all 34 existing thematic tags to
  Contested Skies (`board-info-latam`), and re-keys the uniqueness index to
  `(name, type, project_board_id)`; disposition tags left untouched. `boardId` threaded
  through `getKnownTags`/`createTag`/`deleteTag` (+ preload + `env.d.ts`). NewsTab loads
  the **selected project's** vocabulary and reloads on project change; creation open to
  members, deletion admin-gated (`can('delete_intel_tag') || isRoot`). Migration record
  committed at `sql/2026-07-13-known-tags-project-scope.sql`. SQL-verified end-to-end.
- **T2** (`c67b2b9`) — extracted the shared **`TagPicker`** component out of NewsTab into
  `src/renderer/src/pages/Intelligence/TagPicker.tsx` (exported `TagPickerProps`). Pure
  refactor; `normalizeTagClient` + `createPortal` moved with it.
- **T3** (`9a1a187`) — wired the shared `TagPicker` into **Documents/Social/Interviews**
  with per-project scoping (`getKnownTags('thematic', project?.id)`, reloads on project
  change), gated on a project being selected ("Select a project to tag" otherwise); admin
  trash gated the same way. Tags flow through to the New-sources cards.
- **T4** (`3787d87`) — `TagPicker` dropdown **flips upward** when it would clip the bottom
  edge: a `useLayoutEffect` measures the panel's real `offsetHeight` after mount and
  positions downward-in-situ / flips-up-snugly / caps+scrolls (loop-guarded on
  `[open, value.length, known.length]`).
- **T5** (`83a9180`) — **project-scope the compose tabs.** Mirror News's client-side
  filter (`visible = items where project_board_id === project?.id`; all when "All
  sources"); changing a card's project removes it from the current view (moves projects).
  Newly-created items **inherit** the selected project (`uploadDocument`/`addSocial`/
  `addInterview` → reuse `setProject` when `project?.id` set). Count badges + empty-state
  point at `visible`. This makes every visible compose card match the selected project,
  **resolving the cross-project tag-scoping bug** (a card's TagPicker vocabulary always
  matches its project).

**Post-v2.0.22 (committed + pushed, UNRELEASED → ships in v2.1.0):**
- **3e-0 (ABANDONED, never committed)** — a collapsible Intelligence header experiment
  (collapse subtitle + big counters + framework panel, keep title/project/tabs). Built,
  then **reverted** — it freed too little vertical space for the interaction cost.
  Recorded here as **considered-and-rejected** so it isn't re-attempted.
- **3e-1** (`73efd3a`) — **News rich human-first.** New `intelligence:updateContent` IPC
  (the feed only stores a snippet; researcher pastes the full article). News card footer
  gains an **article-text paste box** (autosaves to `content`), on-demand project-aware
  **Analyze with AI** (gated until substantial text is pasted; runs against the pasted
  draft, not the stale snippet), and an **editable Reconcile** block — mirroring
  DocumentCompose. Completes human-first capture across all four source types. Per-source
  keyed state; reuses `analyzeText`/`saveAiAnalysis`/`saveReconciled`/`updateReconciledNotes`.
- **Duplicate action** (`5702da5`) — News-only **Duplicate** button + modal, optionally
  links the article to the original it duplicates (`duplicate_of` column), sets
  `status='duplicate'`, drops it from the queue. Dedicated `intelligence:markDuplicate`
  IPC **bypasses `updateStatus`/`handleStatus` — NO `pushVerdictToSupabase`, NO
  `logDecision`** (a duplicate is relevant-but-redundant, not a relevance rejection).
  Linking feeds future puller-culler dedup. Verified end-to-end (linked + unlinked, 0
  learning rows).
- **T6a** (`650aeaa`) — **clickable AI suggested-tag chips on News.** Shared
  `SuggestedTagChip` (3-state: **purple** = not in the card's project library → create +
  attach · **green** = in library → attach · **muted ✓** = already on article; disabled
  when no project). Recolors live with the card's project. Compares + displays the
  **normalized** tag form (exported `normalizeTagClient`) so mixed-case suggestions like
  "Rio-de-Janeiro" correctly detect as added. Compose tabs deferred to **T6b**.
- **Tag-delete no-project fix** (`3153587`) — hide the TagPicker delete-trash when no
  project is selected (was a silent no-op in "All sources": `onDelete` was gated only on
  admin, so it passed a handler with an empty board id → `handleDeleteTag` early-returned).
  Now gated on a non-empty board id in all four tabs; the trash isn't offered without a project.
- **T7** (`d78fd36`) — **AI reuses existing project tags.** The project's `known_tags`
  vocabulary is threaded from the renderer into `analyzeText` (`existingTags: string[]`) and
  injected into the prompt as an "EXISTING PROJECT TAGS (reuse these where they fit)" block
  across all three task branches, so the AI **prefers an existing tag over coining a
  near-duplicate** (suggests `drone-attack` rather than a new `Drone-Strike`). Cuts the
  create-churn the T6a chips surface. *(The spec originally named `buildRelevancePrompt` /
  `projectConfig.projectBoardId` — neither exists; we stopped, surfaced the mismatch, and
  took the renderer-threads-`existingTags` option.)*
- **Persist Intelligence project selection** (`f4e107e`) — the selected project now persists
  to **localStorage** (lazy initializer + write-on-change, mirroring `WorkspaceContext`).
  It had been resetting to **"All sources"** on remount, which **silently broke T7 and tag
  coloring** — with no project, no vocabulary is loaded, so the AI got an empty
  `existingTags` and the chips rendered uncolored. A navigation-shaped bug with an
  AI-shaped symptom.
- **Phase 1** (`161a133`) — **article-type-aware identifier guidance in the analysis prose.**
  The prompt tells the model, in enumerated form, *which* identifiers matter per article
  type (incident vs procurement vs policy…). This shapes **what the narrative is about**;
  it does **not** make the prose hold verbatim specifics (see below).
- **Narrative-specificity experiment — TRIED AND REVERTED (do not re-attempt).** After
  Phase 1 we pushed further, asking the prose summary itself to retain verbatim specifics
  (system names, costs). **It failed twice and was discarded both times.** Prose
  structurally abstracts — see "Key design insight" above. **Conclusion: specifics belong
  in structured extraction, not prose.** This is why Path B exists.
- **Path B / B1** (`dd37e40`) — **STRUCTURED extraction.** `AnalyzeResult` gains
  `article_type`, **`capabilities[]`** `{system, actor, actor_type (VNSA/state/commercial/
  unknown), cost, category, relationship}` and **`key_facts[]`** `{label, value}`, written
  into `analysis_json.ai` (**no schema change** — `saveAiAnalysis` spreads the AI block, and
  `normalizeResult` allowlist-copies the new keys, `Array.isArray`-guarded, defaulting to
  `[]`). Governed by an explicit **no-invention** rule: extract **verbatim** or omit.
  - **Also fixed a silent-failure bug found here:** `max_tokens` was **1024**, far too small
    for the larger structured output → the JSON came back **truncated** → parse failure →
    `{ok:false}` with **no console output** (only a tiny footer line). Raised to **4096**,
    added a **60s timeout**, and `console.warn` on **every** failure path (API error + both
    JSON-parse returns). *(Note: the model has always been `claude-haiku-4-5`.)*
  - **Verified against raw JSON**, two article types: an **incident** piece yielded the
    SkyFend jammer (**$100K**, Sinaloa, **VNSA**), the QR-07S3 (**$20K**, CJNG, **VNSA**) and
    an MQ-9 Reaper (CIA, **state**); a **Colombian procurement** piece yielded an Australian
    system (Colombian Army, **state**, 80B pesos). Casualty figures absent from the text were
    **left unfabricated**.
- **Path B / B2** (`e379d2f`) — **render the structured block on the News card**:
  `article_type` badge, color-coded **SYSTEMS** table (amber **VNSA** / blue **state**),
  **KEY FACTS** list — all graceful-degrade (a source with no structured data renders
  exactly as before).
- **Path B / B3** (`51a9569`) — **port that render to the Info Pages New-sources cards**
  (`PipelineSourceCard`), so the intelligence travels end-to-end: extracted on News →
  shown on News → shown in the project pipeline. Extracted **`actorTypeClass`** to a shared
  module (`Intelligence/actorTypeClass.ts`) imported by both — one source of truth for the
  actor-type colors. **No backend change:** routing writes only a *pointer*, and
  `getSourcePipeline`'s live JOIN already returns `is2.analysis_json`, so
  `capabilities`/`key_facts`/`article_type` arrive automatically **and stay live**.
- **Narrative summary fix** (`c0be06f`) — added a `summary` key to the **RELEVANCE**
  prompt's JSON contract (first key), re-pointed the Phase 1 identifier guidance at it
  explicitly ("write your analytical narrative into the `summary` field, NOT into
  `relevance_reasoning`"), and tightened `relevance_reasoning` back to a 1–2 sentence
  verdict. Dropped `PipelineSourceCard`'s `&& !analysis.ai.summary` fallback guard so the
  New-sources card renders summary + reasoning together, matching the News card. **No
  schema / normalizeResult / IPC / DB change** — `normalizeResult` already copied
  `summary` (4000-char cap) and BOTH cards already had a `summary &&` render slot; the
  field was simply never requested. Verified in-app on `csa-rg-02` (5 capabilities):
  summary renders as a narrative paragraph, reasoning shrank to a verdict, SYSTEMS/KEY
  FACTS unchanged, both fields render on the New-sources card. Old rows keep the crammed
  reasoning until re-analyzed.
- **Reconcile narrates from prior structure** (`edaab46`) — `priorAi` added to
  `AnalyzeOpts`; a `priorStructureBlock` helper (empty-string-when-absent, mirrors
  `tagReuseBlock`) injects the already-extracted `article_type`/`capabilities[]`/
  `key_facts[]` into the **reconcile** prompt, so reconcile narrates *from* the catalogue
  instead of re-deriving from raw text. Threaded from all four reconcile call sites (News
  parses `analysis_json` in-handler; Documents/Social/Interviews pass the in-scope `ai`).
  Reconcile summary widened to a 4–7 sentence paragraph matching the relevance path.
  Reconcile does **NOT** return `capabilities`/`key_facts` — `analysis_json.ai` stays the
  single extraction of record. Verified in-app on all four tabs. Closed the loop opened by
  the reverted specificity experiment.
- **PDF extraction fix** (`283dc38`) — Documents capture was **silently broken for ALL
  PDFs in every installed build**. See the **silent-failure lesson** below for the full
  root cause; the one-line version: `pdf-parse` v2.4.5 threw `DOMMatrix is not defined` at
  load time on Electron 31's bundled Node, a bare `catch {}` swallowed it, and the
  placeholder flowed into the content column as if extraction had succeeded. Fixed by
  pinning `pdf-parse` to exactly **1.1.1** (no call-site change); both the PDF and DOCX
  catches now bind and `console.warn` the error.

**v2.1.0 shipped this whole batch** (published 2026-07-15). Next up is the intel-process
milestone in "Start here"; the Level-2 cross-source aggregation (design-first) remains on
the backlog.

## ⚠ Lesson — personal to-dos have TWO `TodoItem` type definitions (keep them in sync)

**Found while shipping slice B (2026-07-21).** There are **two** `TodoItem` interfaces: the
main-process one in `src/main/todos.ts` (the read shape) and a **separate** renderer one in
`src/renderer/src/env.d.ts` (what `DisplayItem extends Omit<TodoItem,'source'>` widens). They are
NOT shared — adding a personal-to-do field to only one drifts tsc and the field never hydrates in the
UI. B initially added `notes` to `todos.ts` alone and got **4 new web tsc errors** (`Property 'notes'
does not exist on type 'DisplayItem'`); adding it to the env.d.ts `TodoItem` too cleared them. **Any
new personal-to-do field must be added to BOTH `TodoItem` definitions** (plus the ipc `cloudRowFor`
SELECT+return, the `readPersonal` SELECT+return, preload, and the env.d.ts API type).

## ⚠ Lesson — TESTING HYGIENE for personal-to-do sync (found while testing C-recurring, 2026-07-21)

**(i) Raw-SQL edits to the live LOCAL DB do NOT sync — they bypass `syncPersonalWrite`.** Seeding or
resetting `personal_todos` with `sqlite3` (the only way to drive C-recurring tests before the picker
existed) writes locally but never reaches cloud, and a raw `DELETE` of a spawned row removes it
locally while leaving it in Supabase. So **any DevTools/sqlite spawn-or-sync test leaves CLOUD
RESIDUE that must be cleaned cloud-side separately** — delete the orphaned rows in the Supabase SQL
editor, not just locally. (C-recurring testing left 4 orphan spawns + a dirty base row in cloud;
they were cleaned with a `delete … where series_id=… and id!=base` + a reset `update`.) Because
`personal_todos` is on the realtime publication, uncleaned cloud orphans can even sync back DOWN.

**(ii) An empty `personal_sync_queue` means writes SUCCEEDED to cloud.** `syncPersonalWrite` applies
to cloud IMMEDIATELY when online and only enqueues on failure/offline (the queue holds *parked*
ops, deleting each on success). So an empty queue ⇒ every attempted write landed — a handy invariant
for reasoning about sync state, and it independently confirms whether a hand-run cloud DDL was
applied (if a column were missing, the upsert would 400 and park in the queue).

**(iii) TEST-DATA LOCATION — the app and the missed-evaluator read LOCAL sqlite, NOT cloud.** Hand-seed
test rows in the LOCAL DB under the **acting user's `user_id`** — NEVER cloud-first. A cloud-only INSERT
is invisible to the running session for TWO reasons: it's the wrong store (the app reads local; cloud
rows don't sync DOWN except via realtime the session may not receive), AND cloud `personal_todos` is keyed
by **`user_email`** while local is keyed by **`user_id`** — a cloud row won't even resolve to the session's
`user_id`. This cost real time in C-recurring-3 testing. (Complement of learning (i): (i) is "local seeds
don't go UP"; this is "cloud seeds don't come DOWN / wrong key".)

**(iv) READ CHANNEL — personal to-dos render via `window.api.todos.list`, NOT `personalTodo.list`.**
`todos:list` → `listTodos` → `readPersonal` applies `parseMissed` and coerces booleans, returning shaped
`TodoItem`s. The old `personalTodo:list` was an unshaped `SELECT *` (returned `missed_dates` as the raw
JSON string, booleans as ints) and is now **DELETED** (`9376ba7`). When hand-testing in DevTools, query
`await window.api.todos.list('<userId>')` and find the `personal-…` item — NOT `personalTodo.list`, which
no longer exists. A "type contract broken" scare this session was purely from reading the wrong (now-gone)
channel.

**(v) CONSOLE ARTIFACT — `JSON.stringify(value)` in a diagnostic read makes a clean array LOOK
double-encoded.** A `console.log(JSON.stringify(x))` (or an inspector that re-serializes) renders a plain
`["2026-06-30",…]` as `"[\"2026-06-30\",…]"` — escaped quotes that look like a double-encode. Read the TRUE
shape with `console.log(value)` + `typeof value` + `Array.isArray(value)`, not a stringified view. An entire
"double-encode" investigation this session chased this artifact; disk and display were single-encoded and
correct the whole time.

**(vi) TEST HYGIENE (reinforced).** Beyond (i): reusing ONE `series_id` across re-seeds **stacks spawn
chains** — use a fresh id per spawn test. **Verify a seed actually took** (`SELECT` it) BEFORE triggering,
because a `DELETE … WHERE series_id=…` can catch the base row via its own self-referencing `series_id` and
leave you testing a row that isn't there. Evaluator/app writes DO sync up (clean cloud residue separately);
raw-SQL seeds do not.

## ⚠ Lesson — NEVER DEFINE A COMPONENT INSIDE ANOTHER COMPONENT'S BODY

**The remount trap (found in 3b, 2026-07-20). It cost the add-step focus bug AND THREE failed
animation fixes before the real cause was isolated.** Two of those three failures were mine,
and the second failed for the exact reason I had just used to reject the first — which is why
this is written down at length rather than as a one-liner.

**THE MECHANISM.** `Row` is defined **inside** `Todo()` (`Todo.tsx`). React identifies
components by **FUNCTION IDENTITY**, so every render of `Todo` creates a new `Row` function
object, React sees a **different component type** in that slot, and it **UNMOUNTS + REMOUNTS
the entire subtree** instead of updating it. Remounting destroys DOM nodes — which silently
breaks everything that depends on node persistence:

1. **FOCUS** — the add-step input lost focus after exactly one character. Typing set state in
   `Todo` → `Todo` re-rendered → new `Row` → remount → the focused node was gone.
2. **FLIP ANIMATION** — no stable "before" node to measure, so `prevRects` was a fresh empty
   Map on every toggle and `.animate()` was never called. **It no-ops silently** — no error,
   no warning, just no motion.
3. **CSS WIDTH TRANSITION** — the fill element remounted already at its final width, so the
   browser had no from-state to interpolate. It jumps.

**⚠ WHAT DOES NOT FIX IT — ATTEMPTED TWICE, FAILED TWICE:**
- **`React.memo` on a child.** `memo` skips **re-rendering a component that stays MOUNTED**. It
  cannot survive a **parent unmount**, and its comparator is **never even reached** when the
  parent element's type changed.
- **`useCallback` / `useMemo` on the props.** Stable props help a component that persists; they
  cannot stop its parent from being replaced.
- **Hoisting the CHILD to module level while still rendering it from inside `Row`.** This was
  the second failed attempt and the instructive one: a stable child type is irrelevant when the
  teardown happens at the `Row` fiber **above** it. Everything below a fiber being torn down
  goes with it, stable type or not.
- **`useMemo`-ing `Row` itself** is a dead end too: its deps would include every handler and
  piece of state it closes over — all recreated per render — so it invalidates every time;
  empty deps would freeze it on first-render state.

**WHAT FIXES IT — move the affected card ABOVE the unmount boundary.** `PersonalCard` was
extracted to module level **AND** rendered **directly from `Todo`** via a `renderItem` factory,
bypassing `Row` entirely. `Row`'s personal branch was **deleted**, leaving exactly one path to
a personal card (leaving it as a fallback would have silently reinstated the bug for whoever
routed an item through it).

**★ THE DISTINCTION THAT GOVERNS ALL OF THIS:**
- **Changing PROP identity → a re-render.** Harmless — and FLIP actually *requires* it.
- **Changing COMPONENT TYPE → a remount.** Fatal to focus, animation and transitions.

**A factory is not a component.** `renderItem` is defined inside `Todo` and that is fine: it is
never used **as a JSX type**, so its unstable identity is irrelevant. React reconciles on the
element type it RETURNS (`PersonalCard`, module-level). **Only functions used AS JSX types need
stable identity.**

**RULE: never define a component inside another component's body if it will hold focus,
animation, or any DOM state. And when one of those breaks, target the UNMOUNT BOUNDARY — not
anything below it.** The instinct to reach for `memo` is exactly backwards here: it optimizes
the case that is already working and cannot touch the case that is broken.

**⚠ TECH DEBT — HOIST `Row` FULLY TO MODULE LEVEL. Its own cleanup slice.** The 3b bypass moved
only the **PERSONAL** branch above the boundary. **Board and meeting branches still live inside
`Row` and still remount on every render.** Harmless *today* — they hold no focus or animation
state — but **any future focusable or animated control added inside `Row` will hit this trap
again**, and the next person will not know why. The full hoist means threading `areas`,
`completing`, `expanded`, `openTask`, `navigate` and ~8 handlers through props.

## Release status at a glance

- **v2.3.0 — RELEASED** (published 2026-07-17; version-bump commit `a4b161e`, tag `v2.3.0`
  pushed before the build — no tag race). 8 assets: mac universal DMG/zip + blockmaps, win
  NSIS x64 exe + blockmap, and BOTH auto-update manifests (`latest-mac.yml`/`latest.yml`),
  so installed builds self-update. A **MINOR** bump shipping the whole access-control tier
  since v2.2.0: `8eae348` (0a-1), `2e22178` (0a-1b), `923f334` (scroll-jump fix), `a5d4b20`
  (0a-2), `46be18e` (0a-3), `26ee18c` (0a-4) + docs `8662b68`/`f80b17d`/`49b44fd`. Closes
  finding 1 end-to-end + the `infoPages:list` `deleted=0` fix.
- **v2.2.0 — RELEASED** (published 2026-07-16; version-bump `3dc945a`, tag `v2.2.0`
  pushed before the build — no tag race). 8 assets: mac universal DMG/zip + blockmaps,
  win NSIS x64 exe + blockmap, and both auto-update manifests (`latest-mac.yml`/
  `latest.yml`). A **MINOR** bump shipping the 8 post-v2.1.0 commits: cosmetic sweep
  (`7f36605`/`ff2bd9a`/`0425f19`), `known_tags` migration (`0865948`), offline arc
  (`504bf1f`/`23de14d`), **`intelligence_sources` cloud migration** (`cfdd4b1`), and
  **realtime + resubscribe-on-reconnect** (`aba6b91`). Docs commit for the intel arc
  (`8aae3fc`) sits between `23de14d` and `cfdd4b1`.
- **v2.0.22 — RELEASED** (`937e220`) to GitHub Releases (mac universal DMG/zip + win NSIS
  x64). Contains everything committed since the v2.0.21 tag: member-add hang fix
  (`81e9eea`); Phase-B **B0.3** (`a1ca0d4`), **B0.5** (`f9a5db4`), **B0.6** (`a0a67b3`),
  **B1** (`42ff4bf`); the **Intelligence restructure** Slices 1/2a/2b/Documents-delete/
  2c+Social-a/AI-relevance/Social-b/News-human-layer/**3a**/**3b**/**3c-1**/**3c-2a**/
  **3c-2b**/**3d-1**/**3d-2**/**3d-3**; and the **tag/scoping series T1–T5**.
- **v2.0.21 — RELEASED** (superseded). Keyword-matcher word-boundary fix + the v2.0.20
  stack (board reorder, read-only visualizer, board-restore + card-revive fixes,
  PublishQueue dead-code removal, Restore-all route-by-source fix).
- **v2.1.0 — RELEASED** (published 2026-07-15; version-bump commit `460a8b6`, tag `v2.1.0`
  on the remote) to GitHub Releases (mac universal DMG/zip + win NSIS x64, `latest-mac.yml`
  /`latest.yml` auto-update manifests live). A **MINOR** bump, not another patch — feature
  volume (Dorian's call). Shipped everything committed after v2.0.22: **3e-1** News rich
  capture (`73efd3a`), **Duplicate action** (`5702da5`), **T6a** clickable chips
  (`650aeaa`), the **tag-delete no-project fix** (`3153587`), **T7** AI tag reuse
  (`d78fd36`), the **persist-selection fix** (`f4e107e`), **Phase 1** identifier guidance
  (`161a133`), **Path B — B1** (`dd37e40`) / **B2** (`e379d2f`) / **B3** (`51a9569`), the
  **narrative-summary fix** (`c0be06f`), **reconcile-from-structure** (`edaab46`), and the
  **PDF extraction fix** (`283dc38`). (Docs commit `0b1572e` + `801ec27` and the
  version-bump `937e220` sit between T5 and 3e-1.)
- **UNRELEASED on `main` since v2.3.0: `2d76b9a`** (2026-07-18) — the `visibleBoardIds`
  NON-ROOT NO-JOIN fix: soft-deleted boards are now filtered out of non-root visibility
  (Option B intersection, both online and offline paths; `deleted` only, archived preserved;
  root untouched). Closes the FOUNDATION under the 0a-2/0a-3/0a-4 gates. **The installed app
  is 2.3.0 and does NOT contain this fix** — it is the first commit of the next release.
- **UNRELEASED on `main` since v2.2.0: NONE — all shipped in v2.3.0 (2026-07-17).**
  `8eae348` (0a-1 — compose stamps `project_board_id`), `2e22178` (0a-1b — pipeline writer
  stamps it), `923f334` (scroll-jump fix), `a5d4b20` (0a-2 — intel read-tier gate), `8662b68`
  (docs 0a-2), `46be18e` (0a-3 — `info_page_*` read-tier gate), `f80b17d` (docs 0a-3),
  `26ee18c` (0a-4 — `info_page_*` WRITE surface gate, M/A/R), `49b44fd` (docs 0a-4) all
  shipped in v2.3.0. **The whole access-control tier is now RELEASED**; researchers
  self-update off 2.2.0, which also unblocks 0b's field verification.
- **Working tree:** only these two docs (`HANDOFF.md`, `PROJECT_SUMMARY.txt`) are
  modified — no source changes pending.

## v2.0.21 — keyword matcher word-boundary fix (released)

`sourceMatchesKeywords` (`src/main/ipc/index.ts`) now matches info-page keywords on
word/phrase boundaries (regex `(?:^|[^a-z0-9])<escaped-kw>(?:[^a-z0-9]|$)`) instead
of naked substring. This stops short keywords like `ICE` from matching inside
`office`/`police`/`services`, which had been mis-routing LATAM drone articles onto
the **Immigration Undone** info page via the `syncSources` auto-collect poll.
Validated: Contested Skies 4→4 matches, Immigration Undone 5→0. Phrases and
hyphen/digit keywords (`anti-drone systems`, `h-1b`, `title 42`) still match whole.

**Why this needed a release:** the installed production app shares the local SQLite
DB. Until v2.0.21 is installed, an *old* production instance running the substring
matcher will keep re-polluting Immigration Undone even after a manual DB cleanup.

## Board member-add UI hang fix (committed `81e9eea`, unreleased)

Adding members after creating a board hung on **"Adding…"** forever. Root cause: the
`boardMembers:add` IPC handler `await`ed a notification email (`transporter.sendMail`)
with no timeout, so a stalled Gmail SMTP send left the IPC promise unsettled — the
member row was already written successfully *before* the email ran. Fix: the email is
now **fire-and-forget** (detached async IIFE, not awaited) with SMTP timeouts
(`connectionTimeout`/`greetingTimeout`/`socketTimeout`) as a backstop; the handler
returns `{ ok: true }` immediately after the member write + in-app notification.

## Phase B — Cloud bridge for Info Pages (in progress)

**Goal:** make the 4 info-page projects **real cloud boards** so membership/heads
work, then migrate the info-page **content tables** to cloud.

### Completed — B0 (board-row bridge)

- **B0.1** — added `board_type` + `board_config` columns to the **cloud**
  `workspace_boards` table (applied by hand in the Supabase SQL editor — the runtime
  cloud tables aren't in `supabase/migrations/`; see Gotchas).
- **B0.2** — renamed + un-archived the 2 seed boards to **"Contested Skies"**
  (`board-info-latam`) and **"Immigration Undone"** (`board-info-trump`); **archived
  the stray UUID duplicate** (`3c4671de…`, "LATAM drone monitor") and re-pointed its
  3 source stubs to `board-info-latam`. (Local SQLite data change; cloud side mirrored
  in B0.4.)
- **B0.3** (`a1ca0d4`) — cloud `createBoard` + `boardsSeed` now carry
  `board_type`/`board_config` (optional params; standard-board creation unchanged).
- **B0.4** — materialized **all 4 projects as cloud info-page rows** (positions 50–53):
  - Contested Skies (50), Immigration Undone (51),
    **Hollow Border** (52, repo `Doriankantor/hollow-border`),
    **The Stated Order** (53, repo `Doriankantor/statedorder`).
  - Archived the stray `3c4671de` **cloud-side** too.
  - Hollow Border + Stated Order are **grayed / Phase-2** (no source collection yet);
    only **Contested Skies** has the live news pull (`pipeline:true`).
- **B0.5** (`f9a5db4`) — Info Pages list now reads the **cloud** board list
  (`useWorkspace().boards` filtered to `board_type==='info-page'`) so **all 4 show**;
  the **Workspace sidebar excludes** `board_type==='info-page'` (they were leaking in
  after B0.4 made them active cloud rows). Added optional `board_type`/`board_config`
  to the renderer `Board` type.
- **B0.6** (`a0a67b3`) — info-page **create/edit/delete are cloud-authoritative**
  (reuse cloud `createBoard` + new `updateBoardConfig` + soft-delete `deleteBoard`;
  the old local `infoPages:create/updateMeta/delete` handlers stay in place, unused).
  The edit form is **hosting-fields-only** (name / repo / live_url / file);
  **keywords are reserved for Claude Code** and are **preserved on edit** via a
  config merge (`{...existing, ...hostingFields}`). Delete is a **recoverable
  soft-delete** (Trash), leaving local `info_page_*` content intact. Also fixed a
  pre-existing bug where the row's **hover-kebab** (Edit settings / Delete page) never
  appeared — the `group-hover:opacity-100` reveal had no `group` ancestor; added
  `group` to the row container.

### B1 — COMMITTED `42ff4bf` (identity spine)

`info_page_owners` ("project heads") is now **cloud + email-keyed** — the first content
table to cloud, aligned with the email-keyed `board_members` (= project members):

- **`cloud/boards.ts`** — 4 new fns mirroring `board_members`: `addOwner` /
  `removeOwner` (root-gated, `resolveEmail` id→email, upsert/delete on
  `info_page_owners` by `page_id,user_email`), `isOwner` (email-based; root short-
  circuits true), `getOwners` (enriches `full_name` from `local_users` by email).
- **`ipc/index.ts`** — `infoPages:getOwners/addOwner/removeOwner/isOwner` repointed to
  those cloud fns. The **local `info_page_owners` table + old handlers are left in
  place, unused** (not removed this slice). `isOwner` now uses the acting user; the
  renderer still passes `localUser.id`, which the cloud path ignores.
- **`Settings.tsx`** — Board Access matrix has a **root-only "Head" toggle** on
  info-page board columns (amber, below the green member checkbox). Loads heads via
  `getOwners` per info-page board (keyed by **email**), `toggleHead` writes/removes an
  `info_page_owners` row then **refetches** that board's heads.
- The cloud `public.info_page_owners` table already exists
  (`page_id, user_email, assigned_by_email, assigned_at`, PK `page_id+user_email`).
- **Two follow-on fixes stacked on B1 (also committed `42ff4bf`):** the member-checkmark
  render fix (membership keyed by email) and the "head implies member" invariant
  (three cascade points in `toggleHead`/`toggleBoardAccess`/`revokeAllBoards`).
- **Committed `42ff4bf`** (B1 + both follow-on fixes).

### Next

- **Active work is the Intelligence restructure** (see "Start here") — Phase B B2+ is
  paused behind it. Resume it after the restructure lands.
- **B2+** — migrate the remaining `info_page_*` tables + `intelligence_sources` to
  cloud, **additive-first per table**: create cloud table → dual-write → backfill →
  verify → cut reads over → add realtime. (Realtime for `info_page_owners` was
  deferred in B1 — owner changes reflect on the other user's next page open, not
  live; add it when convenient.)

### Key design (locked)

- The 4 projects **are** info-page boards.
- Project **MEMBERS** = cloud `board_members` (email-keyed) — the **intel /
  collection** side.
- Project **HEADS** = `info_page_owners` (to be re-keyed to email in B1) — the
  **publication / approval** side.
- The data-gathering **framework is read-only in-app** — edited via Claude Code
  (this is why the edit form drops keywords and other framework fields).
- Standardize on the **`info_page_sources` stage table** (`new → review → committed`)
  for the source pipeline.
- **Pre-route editing (locked, unbuilt).** Compose items (Social/Documents/Interviews)
  must be **EDITABLE UNTIL ROUTED** — same model as News, whose cards stay editable in the
  queue until Approve routes them. Once routed (`status='routed'`) the item belongs to the
  publication side and is **NOT editable in place**; to edit, **MOVE IT BACK TO INTEL**
  (reuse 3c-2b `moveBackToIntel`), edit, re-send. One uniform rule across all four types;
  resolves "who owns the content at which stage". Today compose items go read-only the
  moment they're saved because card fields bind to compose-time state and the tab load
  filter excludes `status='routed'`. **HYPOTHESIS (unverified — needs a diagnose):** the
  persistence plumbing already exists (`updateNotes`/`updateContent`/`setArticleTags`), so
  the gap is likely that saved cards stop **OFFERING** the edit affordances, not that they
  can't persist. May be small.

## Prior release detail (v2.0.20)

v2.0.19 shipped to GitHub Releases on Jul 7; the following four landed after it and
ship in **v2.0.20** (and forward into v2.0.21):

| Commit | Work |
|---|---|
| `16c053b` | Board reordering — admin-only sidebar drag-and-drop |
| `7cf8938` | Visualizer Block 2 — open archived cards read-only |
| `9e2f91c` | Fix: restoring a board never reloaded its cards |
| `d9b70d9` | Card-revive hardening — in-flight guard + optimistic insert |

### Board reordering (`16c053b`)
Mirrors the existing `reorderColumns` path 1:1 across four layers:
`reorderBoards(boardIds, actingUserId)` in `cloud/boards.ts` (admin-gated via
`resolveActor` → `isRoot`, writes dense `0..n-1` positions) → `boards:reorder`
IPC → `window.api.boards.reorder` → `WorkspaceContext.reorderBoards` (optimistic
`setBoards` reindex via a `byId` map, then persist).

`Sidebar.tsx` gained `SortableBoardItem` (dnd-kit, `verticalListSortingStrategy`,
`closestCenter`, 5px `PointerSensor` activation). Drag listeners live on a
separate hover-revealed grip handle so click-to-open still works. Admin-only —
members render the original plain list. Info-page boards are now filtered out of
`visibleBoards` (B0.5), so they're excluded from reorder.

### Visualizer Block 2 (`7cf8938`)
`TaskDetailPanel` takes a `readOnly` prop, defaulting to `false` — the live board
and Contacts panels are untouched and fully editable.

Gated at two levels:
- **Write level (the safety net):** every mutation path early-returns when
  `readOnly` — `set()`, `handleSave()`, `handleDelete()`, sources, the five inline
  direct-`updateTask` controls (stage — guarded *before* its assignee notification
  loop — priority, type, area, client), and all 13 sub-entity handlers.
- **Visual level:** inputs disabled/read-only, client rendered as static text (so
  the Add-Contact modal can't trigger), and every add/delete affordance hidden —
  including the Delete-engagement button and the whole comment composer.

`RichTextEditor` gained `readOnly` (TipTap `editable: !readOnly`, no-op
`onChange`/`onBlur`, `setEditable` sync effect, toolbar hidden). `KanbanView`
read-only cards can now be *clicked* to open (the panel enforces read-only);
drag and card corner buttons stay gated. `Archive.tsx` renders the panel in a
`z-[60]` stacking context above the `z-50` viewer, clears the shared global
`selectedTask` on close, and layers Esc (card panel first, then board viewer).

### Board-restore fix (`9e2f91c`)
**Root cause:** every restore path refreshed the board *list* (`loadBoards`) but
never re-ran `getTasks`. Since `getTasks` excludes archived/deleted boards — and
`deleteBoard` also purges their tasks from local state — a restored board showed
zero cards until a manual add or an app restart.

Fixed by making **every restore/undelete refresh tasks, not just the list**:
- `WorkspaceContext.restoreBoard` now awaits `refreshTasks()` after `loadBoards()`.
- New `WorkspaceContext.undeleteBoard` (Trash previously called
  `window.api.boards.undelete` directly, bypassing the context entirely).
- `Trash.tsx` routes cloud-board restores through `undeleteBoard`; `Archive.tsx`
  routes through `restoreBoard` instead of the bare API + local list filter, so
  the sidebar updates *and* the cards load.

### Card-revive hardening (`d9b70d9`)
- **In-flight guard:** `handleRevive` / `handleUndelete` / `handleDeleteNow` share
  a `reviving: Set<string>`; each early-returns if the id is in flight, adds on
  entry, removes in a `finally`. Their buttons are `disabled` while in flight —
  this kills the multi-fire that slow networks caused.
- **Optimistic insert:** the card is pushed into `tasks` *before* the await
  (`{...task, archived: 0, deletion_scheduled_at: null}`, deduped by id),
  mirroring the `markForDeletion`/`markCompleteNow` pattern inverted. The card
  appears instantly instead of waiting on a full `getTasks`.
- The source card is removed from the drawer *before* the await in all three
  paths (`handleRevive` previously removed it after, leaving it clickable
  mid-flight).
- `WorkspaceContext` exposes `setTasks` for this optimistic UI.

## Known issues / open threads

### On the horizon — deferred / next up (priority order)

- **0. PUBLICATION / INFO PAGES REDESIGN — BEGINS WITH AN INTERACTIVE MOCKUP.** When this
  starts, the **first artifact is a working interactive mockup**, not a spec — the same
  design-first approach that produced To-Do's `docs/TodoStepRail.html` prototype and that
  demonstrably paid off there (the prototype settled behavior questions before any code, and
  slice 0 could then check the spec against it). **Order: mockup → spec → Part-A "what lives
  where" → read-only diagnosis → slices.** Do NOT open with a spec document, and do not
  one-shot it. **The mockup covers the publication FLOW end to end: New sources → Analysis &
  design → Publish → update notes → Sources.** Only once that mockup has been iterated do we
  produce the spec, then Part-A, then the diagnosis, then the slices.
  **Publication remains the AUGUST milestone** per the locked plan, though it may start
  earlier; **slice 5 of the To-Do overhaul (the intel culling directive) is its on-ramp** —
  that directive drives the cull→approve→Push→Info Pages flow the redesign is about.
  **Shared prerequisite with slice 5: `notifications` → cloud** (local-only + `user_id`-keyed
  today, so a directive never reaches the assignee's machine).
- **TWO GAPS FOUND DURING To-Do 1b (2026-07-19) — logged, both out of scope so far:**
  - **Dismissals are PERMANENT — there is no un-dismiss path anywhere.** Verified: zero
    `DELETE FROM todo_dismissed`, zero undismiss handler, no UI affordance. `todo:dismiss`
    only ever INSERTs. An accidentally-dismissed to-do **cannot be recovered from the UI** at
    all. This is a real product gap, not a cosmetic one — a one-click irreversible hide.
    Natural fix alongside the slice-2 aggregation, where dismissal becomes a filter.
  - **The offline BANNER LAGS — you can be offline and not know it.** Online state is derived
    from **failed cloud call outcomes** (`connection.ts`, 2-failure hysteresis), and while
    offline the only network traffic is a **10s recovery probe**. **The To-Do tab makes no
    cloud calls**, so nothing reports a failure and the banner doesn't appear until some other
    surface (e.g. Intelligence) tries the network. **Pre-existing connection-module behavior,
    NOT a 1b regression** — 1b made it more visible by making To-Do work offline. Fixing it
    means **active probing while healthy**, which the module deliberately avoids ("we never
    probe while healthy"), so the blast radius is app-wide. **Deferred, logged.**
- **FOUR DEFERRED DESIGN ITEMS FROM THE SLICE-2 SCOPING (2026-07-20) — recorded so they are
  not rediscovered. None are in slice 2:**
  - **SHARED CALENDAR / CONNECTION MODEL — its own design item (decide, THEN build).** All app
    instances should connect to (or subscribe to) **`kantorconsulting.hub@gmail.com`** — record
    that as the **intended shared identity**. Today `kc-meeting` reads Google Calendar **live
    and online-only** (NOT local `calendar_events`), per-machine and per-account, filtered by a
    `cal-toggles-${userId}` localStorage set — so two people see two different To-Do pages.
    **Meetings stay a renderer-side Google concern for slice 2**; the shared-account model is
    decided separately before anything is built on it.
  - **OFFLINE-COMPLETE + RECONCILE (future slice, net-new).** Board-task completion is
    **online-required today** — `todo:complete` is cloud-first and **throws when offline**
    (deliberate: the write-through fix `cc6aedf`). Desired future behavior: **complete offline
    → sync on reconnect**, and if the assigner unassigned you meanwhile, reconcile with
    **HIGHER-ORDER-ACTION-WINS (unassign trumps complete)** and notify the assignee *"your
    assignment was removed."* That is a **net-new conflict-resolution system**; it **pairs with
    `notifications` → cloud**. Its own slice.
  - **CET-ANCHORED CLOCK (slice-3 note).** Urgency (past-due / today / tomorrow) must **NOT
    rely on the local machine clock** — use a constant time source **bound to CET** so a
    deadline means the same instant for everyone regardless of timezone or a wrong system
    clock. **Decide the mechanism when building the urgency engine (slice 3).**
  - **BOARD-COMPLETION PERMISSION GATE — deferred, NOT in slice 2.** `todo:complete` has **no
    `can()` / `resolveActor` check today** — anyone can complete any task by id. Pairs with the
    `board.assign` / permission work (slice 4).
  - **★ "+ ADD" BUTTON ON THE To-Do TAB — a dropdown with TWO options (decided 2026-07-20).**
    **Personal** and **Assign to other**. **NO board-task option** — board tasks are created
    **on the board**, and offering a third path here would fork card creation across two
    surfaces.
    - **It maps 1:1 onto the tabs:** Personal feeds the **Personal** tab; Assign-to-other feeds
      **"Assigned by me"**. That symmetry is the argument for the design — every option a user
      can pick has a visible destination.
    - **Personal is LIVE NOW** (1a/1b shipped its write path). **"Assign to other" creates an
      off-card assignment and therefore LIGHTS UP WHEN SLICE 2.5 LANDS** — until then it has no
      entity to write to.
  - **★ TOP-BAR ACTION CLUSTER — consolidate chat + "+" next to the notification button
    (decided 2026-07-20).** Top-right, to save space. **FIXED PLACEMENT — NOT draggable.** A
    movable-button system was considered and **rejected as disproportionate UI-chrome work**:
    the cost is a drag/persist/collision layer, the benefit is preference. **If a specific
    placement annoys, reposition that button — do not build a drag system.**

- **1. DONE (shipped in v2.1.0) — Narrative refinement.** Both halves landed: the summary
  half (`c0be06f`, own `summary` key) and the **reconcile half** (`edaab46`, reconcile
  narrates *from* the structured `capabilities[]`/`key_facts[]` via the `priorAi` opt).
  No longer a to-do — kept here only as the resolved anchor for "Key design insight".
- **2. Level 2 — cross-source aggregation (BIG, design-first).** Aggregate `capabilities[]`
  across an Info Page's **committed sources** into the **"who has what across VNSAs vs
  states"** reconstruction — the payoff the whole Path B arc was built for, and the natural
  destination of the Info Pages publication-stages work. **Design-first: start with a mockup
  conversation**, not code.
- **3. DONE — v2.1.0 released** (published 2026-07-15; shipped the whole batch — 3e-1,
  Duplicate, T6a, tag-delete fix, T7, persist fix, Phase 1, Path B B1/B2/B3, `c0be06f`,
  `edaab46`, `283dc38`). MINOR, not patch — feature volume (Dorian's call).
- **4. T6b + per-card tag scoping — COMBINE into ONE slice (next-up item 4).** Extend the
  T6a `SuggestedTagChip` (already shared) to Documents/Social/Interviews. **T6b confirmed
  live in testing** — suggested-tag chips are not clickable on Interviews (observed), same
  for Documents/Social. Blocker: those chips render **inside** the
  `DocumentCompose`/`SocialCompose`/`InterviewCompose` sub-components, which only receive
  `{ doc, project, onPatch, formatDate }` — so `knownThematic` + the
  `handleSetTags`/`handleCreateTag` handlers must be **threaded in as new props** (+ their
  call sites). `themaTags`/`projectBoardSel` are derivable locally from `doc`+`project`.
  (News was clean because it has no sub-component.) **Combine with per-card tag scoping
  (below)** — same prop threading; doing them separately means threading twice.
- **Per-card tag scoping.** Each card's picker + AI chips should load/check against **that
  card's OWN `project_board_id`** vocabulary, independent of the top project picker.
  Deferred at T5 (compose views keep visible cards aligned to the selected project, so it
  didn't bite); revisit when per-card tagging across mixed projects is the priority.
- **Info Pages publication stages (big design-first arc, unbuilt).** The downstream
  editorial lifecycle on the Info Pages side: **Analysis & design → Publish → Latest
  update notes → Sources** — push to the live site, auto-generate an update note, with a
  confirmation gate before publish. Scope it against the existing `getSourcePipeline`
  stages; the **Level-2 aggregation** (above) is what lands *in* it.
- **Article collection dedup + outlet targeting (pipeline layer).** The GDELT / Haiku
  fetch pulls many near-duplicate reposts/mirrors of the same story (e.g. one CNN piece
  syndicated across outlets) while sometimes *missing the original source*. Likely a
  two-part fix: better source targeting **upstream** (GDELT query / source config) +
  dedup **downstream**, plus **AI duplicate-detection on push**. The **Duplicate-link**
  (`duplicate_of`) and the **structured date/location/actors** from B1 are the natural
  **prefilter feed** for that detector. Not app-code; deferred to a pipeline session.
  **BLOCKED BY the cloud migration** — the Haiku gate runs in GitHub Actions and CANNOT
  read local SQLite, so today the loop isn't just inert, it's **unbuildable**. Both the
  feedback loop and dedup live in the **PIPELINE repo**, not the app — per the Social-b
  lesson, **VERIFY THE TARGET REPO before any git op there.**
- **Sidebar "N new" badge likely counts the wrong table.** The Info Pages sidebar badge
  appears to still count the legacy `info_page_items` table, not `info_page_sources`
  `stage='new'` (observed mismatch: the New-sources tab showed **4**, the sidebar badge
  showed **7**). Small, self-contained fix — its own slice.
- **Legacy `info_page_sources` rows have empty `source_type`.** The 3 pre-existing rows
  routed by the old disposition-based path (pre-3c-1) carry an empty `source_type`. The
  card still badges correctly via the JOIN on the intel `type`, so this is **cosmetic
  only** — no backfill needed unless a later query reads `source_type` directly.
- **Interview span annotation.** Tag/annotate specific text segments *within* an
  interview transcript with interpretations — per-character-range notes over the
  plain-text transcript (`content` is stored plain, not JSON-wrapped, precisely to
  anchor these offsets). Distinct from the whole-item topic tags shipped in T1–T5.
  Design-first, its own multi-slice feature — deferred.
- **T1 test-tag cleanup.** `alpha` / `beta` / `test-tag-alpha` were created in Contested
  Skies' thematic vocabulary (`known_tags`, `board-info-latam`) during T1 testing. Delete
  them via the **TagPicker admin trash** when convenient (leaves any article chips intact).
- **`created_at` is UTC — add the local offset before judging recency.** Both `known_tags`
  and `intelligence_sources` store `created_at` in **UTC** (`new Date().toISOString()`,
  `…Z`); local is **CEST = UTC+2**. A UTC-vs-local mismatch cost real debugging time during
  T1 testing (fresh writes looked ~2h stale). Convert (+2h) before concluding "nothing was
  written."
- **Watch: does `relevance_reasoning` stay short?** The 1–2 sentence verdict guidance
  (`c0be06f`) **held on the sources tested and shipped in v2.1.0** — the reasoning shrank
  to a verdict and the narrative moved to `summary`. **Keep checking as more rows are
  re-analyzed;** if it drifts long, **tune the prompt wording** (firmer split instruction)
  — do NOT accept it, and do NOT remove the summary.
- **The `'summarize'` task branch in `analyze.ts` is DEAD CODE** — grep found zero call
  sites (only the type union in `env.d.ts:774`). All four tabs use `'relevance'` and
  `'reconcile'`. Candidate for removal in a cleanup slice.
- **CROSS-SOURCE LINKING (design-first, multi-slice — feeds the analysis stage).**
  Let researchers link intel items to specific sources: an interview linked to the
  article/event it corroborates, a document to the video about the same incident.
  **The point is NOT tidiness — the links are CONTEXT FOR CLAUDE'S PUBLISHING DECISIONS**
  at the Info Pages analysis stage (locked decision #10). When Claude proposes placement,
  it should see that this interview supports a source already on the page, so it makes
  better structural calls.
  - **WHY TAGS AREN'T ENOUGH (settled).** Tags cluster by **THEME** — that stays as-is and
    is good — but they do NOT pin **SPECIFIC INCIDENTS** together. *"Both tagged
    drone-attack" is not "both about the same Catatumbo strike."* Linking is the
    **incident-level** layer tags structurally cannot provide.
  - **CREATE MECHANISM (settled).** **MANUAL is the primary path and the FIRST shippable
    slice:** a researcher explicitly links an item to one or more sources — either
    already-pushed sources OR sources about to be pushed in the same batch. Human judgment
    creates the link. Manual linking does **NOT** depend on the analytical frameworks (a
    human decides; no AI analysis needed), so it is **UNBLOCKED**.
    **AI-SUGGESTED, HUMAN-CONFIRMED is a LATER, ADDITIVE slice** (locked decision #2
    pattern): Claude proposes candidate links, they **never auto-apply**, the researcher
    accepts, and the accepted link flows into the **SAME manual mechanism**. That slice
    DOES lean on the frameworks (Claude needs a real notion of topic/event to suggest
    well), so it is **GATED behind the frameworks work** (see Standing issues). Clean
    split: ship manual first, add AI later **without redesign**.
  - **OPEN DESIGN QUESTIONS — for the vision conversation, BEFORE any diagnosis:**
    1. **THE TARGET MODEL — the core schema question.** Links must span TWO pipeline
       stages: **intel-row → intel-row** (two items still in the queue) AND **intel-row →
       routed source** (an `info_page_sources` pointer). Dorian's "existing source OR
       about-to-be-pushed" spans both, so the link table has to handle intel-to-intel and
       intel-to-routed. **Resolve this first.**
    2. **PRE-ROUTE CONNECTION.** Links can form BEFORE routing, between queue items, so the
       link must **TRAVEL WITH THE ITEM** through the pipeline. This collides with the
       **pre-route editing** backlog item (locked, unbuilt — above) — **design the two
       TOGETHER, not separately.**
    3. **Relationship to the existing News "Duplicate" action** (`5702da5` — mark +
       optional `duplicate_of` link, dedup-only, no learning signal): is linking a
       generalization of it, or a separate concept? **Duplicate is same-article WITHIN a
       type; linking is SUPPORTING across types.** Decide whether they share a table.
  - **STATUS:** design-first, multi-slice. **Needs a vision conversation** (per the HANDOFF
    convention for item-model changes — this touches locked decision #1, the unified item
    model). Manual slice unblocked; AI slice gated behind the analytical frameworks.
- **★ IDENTITY MODEL — READ THIS BEFORE ANY IDENTITY-SHAPED WORK (corrected 2026-07-19,
  FINAL RULING 2026-07-20).** Several older entries in this file are superseded by the
  following. When they conflict, **this block wins.**
  - **ROOT = `doriankantor@gmail.com` / `local-admin` (`CLOUD_ADMIN_EMAIL`) — and ONLY that.**
    The **infrastructure admin**: god-mode, **BYPASSES the permission system entirely** rather
    than holding permissions within it. **NOT a teammate.** Stripped from assignee lists, never
    a task assignee, not seeded into the roster, and **does NOT appear in the Team console**.
  - **`dk@kantor-consulting.com` is a FULLY-PERMISSIONED TEAM MEMBER — not a second admin.**
    It holds every membership, head role and assign right, but **through the NORMAL permission
    system** — grantable and revocable rows, exactly like anyone else's. **dk is what a member
    looks like with everything ticked**, which is precisely what makes it a useful test
    identity: a capability that works for dk@ works because a permission row says so, not
    because dk@ is privileged. ⚠ **Earlier entries describing dk@ as "full-admin" are
    SUPERSEDED** (see the cross-device findings block, which still uses the old framing).
  - **❓ OPEN — NOT YET DECIDED: who can reach the Team console?** Does managing the team
    require the gmail-root identity, or can a fully-permissioned member get there? The console
    is currently specced ROOT-ONLY, but if dk@ is a member rather than an admin, then either
    Dorian must switch to the gmail identity to administer the team, or "manage team" becomes
    a grantable permission like any other. **Decide this before the console is built** — it
    changes the console's gate, and retrofitting an auth model onto a built surface is how the
    0a-4 renderer-only-permission bug happened.
  - **`local_users` = ACCOUNTS. `team_members` = the ROSTER.** Two different things that were
    conflated until 1c-1 untangled them. Accounts are per-device and carry auth + lifecycle
    (password, status, heartbeat, invite codes) with **device-local ids**. The roster is
    cloud, **email-keyed**, and answers only *who is on the team and who can be assigned*.
    Never resolve one by the other's key.
  - **ASSIGNMENT WAS NEVER WORKING CROSS-DEVICE.** `assignees_json` holds device-local
    `local_users.id` values that **only resolve on the machine that minted them**. Cloud
    `board_members` is sparse (**only `dk@` and `mj_baez@` present**), so it is not a
    substitute roster. **The roster is now the authoritative team identity**; 1c-2 makes the
    assignment data agree with it.
- **★ UNIFIED "HEAD" ROLE — ONE elevated role per board (decided 2026-07-20). This REPLACES
  the separate `can_assign` flag.** `board.assign` and "board head" collapse into a single
  role called **head**; everyone else is a plain **MEMBER**. There are exactly TWO roles.
  - **A head carries ALL elevated powers, board-appropriate:** assign members to cards,
    assign off-card tasks, and — **on INTEL PROJECTS only** — run publication. On **WORK
    BOARDS** "head" simply means *the person who can assign*; there is no publication concept
    there. Same role, different surface area per board kind.
  - **The `head`-implies-member invariant STANDS**, and still must be enforced in MAIN.
  - **WHY:** it simplifies **slice 4** and the **Team console** at once — the console becomes
    ONE member↔head toggle per board instead of three orthogonal flags (member + can_assign +
    head) whose eight combinations were mostly meaningless or contradictory.
  - ⚠ **Entries below that describe `can_assign` as its own flag are SUPERSEDED** — the
    capability survives, the separate flag does not.
- **BOARD MODEL — TWO KINDS (drives the Team console).** The distinction is not cosmetic;
  the two carry different membership semantics and the console must model both:
  - **WORK BOARDS** (Think Tank, Drone Database, Subscription Model) — **members + heads**
    (head = can assign). *(Was "members + per-board can-assign" — superseded by the unified
    head role above.)*
  - **INTEL PROJECTS / info pages** (Contested Skies, Immigration Undone, Hollow Border, The
    Stated Order) — **members + heads** (head = can assign **and** run publication), with a
    **head-implies-member invariant**.
    ⚠ **Enforce the invariant in MAIN, not just the UI** — the 0a-4 headline lesson was that
    a UI-only permission is a suggestion, not a gate. A head who is silently not a member
    would fail every membership-scoped read gate while the console showed them as attached.
- **TEAM CONSOLE (design-first; specced and built AFTER 1c finishes).** The queued
  *"consolidate access management under the Team page"* item. **ROOT-ONLY.** Consolidates the
  roster + work-board membership + intel-project membership into one surface — **now ONE
  member↔head toggle per board** under the unified head role, not member + can-assign + head.
  - **An interactive mockup EXISTS (2 iterations, design-first).** ⚠ **It NEEDS revision for
    dk-not-root before it becomes a spec** — it was drawn under the old assumption. Revise
    the mockup → write the spec (a `TODO_OVERHAUL_PROMPT`-equivalent) → then build.
  - **BLOCKED-BY / BLOCKS:** build after 1c completes. It is also the **prerequisite for
    board-scoped mentions** below, since that filtering depends on membership actually being
    populated — which is what this console is for.
- **MENTION + PICKER CURRENTLY SHOW THE WHOLE FIRM, not board members — DEFERRED, not an
  oversight.** Board-membership filtering waits on the Team console (membership must be
  populated first; filtering against a sparse `board_members` today would hide real people).
  **Populate model already decided for when it lands:** @mention **capped at 5 pre-typing**,
  **RECENCY-ranked** (recently mentioned/assigned first), **type-to-filter past the cap**,
  **scoped to board members**.
- **CARD DATE PICKERS (future pass — reuses the A-2 date/time picker; lands WITH or AFTER
  slice 4).** Give board cards the same calendar-popover date picker + hour/minute time picker
  that A-2 added to the personal detail panel, on **both** the card's **start date** and **due
  date**, replacing the bare native `<input type="date">` in `TaskDetailPanel` (lines ~1027 and
  ~1042). A board/Workspace surface, distinct from the personal-to-do panel.
  - **⚠ THE BRIEF THAT SPAWNED THIS ITEM WAS FACTUALLY WRONG — recorded corrected so a future
    session does not do redundant, conflicting work.** The brief claimed *"start date does NOT
    exist on `workspace_tasks` today — it's a NEW field needing local schema + cloud ALTER +
    cloudRowFor + TASK_COLS plumbing."* **Every clause is false:**
    - `start_date` **already exists** on `workspace_tasks` — `db.ts:303` (CREATE TABLE), the
      insert projection at `db.ts:338`, and the `tasks`-table backfill `ALTER` at `db.ts:409`.
    - It is **already in `TASK_COLS`** (`cloud/boards.ts:166`) and the cloud upsert projection
      (`cloud/boards.ts:796/803/817`), so it **already syncs to and from cloud**. No ALTER.
    - `cloudRowFor` is the **PERSONAL-todo** cloud helper (`ipc/index.ts`); board cards do not
      use it at all — wrong subsystem. Board writes go through `boardsCloud.updateTask` +
      `TASK_COLS`.
    - **`TaskDetailPanel` already has a working start-date editor** (`TaskDetailPanel.tsx:1027`),
      a native date input writing `start_date` via `updateTask`.
    - **Net:** both `start_date` and `due_date` already exist, sync, and have editors. This item
      is a **UI-ONLY swap** — no schema, no cloud ALTER, no `TASK_COLS`/`cloudRowFor` work. Had
      the wrong version been recorded, a session would have added a `start_date` column that
      already exists, risking a duplicate/conflict against the live one.
  - **REAL prerequisite the brief omitted:** to "build the picker once and reuse it", the picker
    must first be **EXTRACTED**. `DatePopover` / `TimePopover` currently live **module-level
    inside `Todo.tsx`**, not in a shared component file — so step one of this pass is lifting them
    to e.g. `components/DateTimePopover.tsx`, then consuming from both surfaces.
  - **Permission gate (valid, keep):** card date editing must respect the **slice-4 card-edit
    tiers** (only card-assignees or heads can edit a card), which is why this lands **with or
    after slice 4**, never before.
  - **★ START-DATE RULE (Dorian, 2026-07-20):** a card's `start_date` **DEFAULTS to its creation
    date** (`created_at`), and **only BOARD HEADS may override it** via the picker. So the picker
    on start date is head-gated even beyond the general card-edit tier; due date follows the normal
    card-edit tier. (`start_date` already exists and syncs — see the corrected note above — so this
    is a UI + gating rule, not a schema change.)
- **TO-DO TEAM BUILDOUT (ready to build — EXISTING design, not new scope).** This is the
  To-Do overhaul already designed in prior sessions; Dorian confirmed it is the same plan.
  Recorded here so it isn't lost in the backlog. **The point:** make To-Do a real
  cross-team assignment system so work can be assigned and tracked across the six
  researchers — Dorian's stated reason: *"materially increase the quality of work."*
  - **Scope (as previously designed):** `personal_todos` → cloud; a personal **steps**
    table; `board_members.can_assign` column; `assigned_by` field; **completion
    notification** firing to the assigner.
  - **✅ FIRST SLICE DONE — the To-Do write-through bug (`cc6aedf`, 2026-07-18,
    UNRELEASED).** `todo:complete` / `todo:uncomplete` wrote `column_id`/`completed_at` to
    the **LOCAL `workspace_tasks` mirror only**, so completions **REVERTED** when
    `syncTasksMirror` re-synced from cloud (triggered by opening **Workspace/Kanban** or a
    **realtime tasks invalidation**). To-Do's own read never re-syncs, which is why it
    *looked* persistent until something else pulled tasks.
    - **FIX:** both handlers now `await boardsCloud.updateTask(taskId, {column_id,
      completed_at})` — **cloud, field-level** — **FIRST**, then keep the local write
      **after**, because `updateTask` does **NOT** sync the mirror and `getMyTasks` reads
      local directly.
    - **`boards.ts`:** `completed_at` added to **`updateTask`'s field allowlist** AND to
      **`TASK_COLS`**. Both were required — without the allowlist entry the field is
      silently dropped from the patch; without `TASK_COLS` the mirror **DESTROYS** it on
      every sync (`syncTasksMirror` DELETEs + re-INSERTs using exactly those columns).
    - **NO migration** — cloud `workspace_tasks` already had both columns.
    - **Scope was `complete` + `uncomplete` ONLY. UNTOUCHED:** `todo:dismiss` (inserts into
      **`todo_dismissed`** — a different table/handler), `personalTodo:delete`,
      `todo:getMyTasks`, `task_activity`, and the assigner-notification writes.
      **No offline gate** — matches the board task-write convention (`updateTask` throws;
      the `isOnline()` guards in `boards.ts` are on READS, not writes).
    - **Tested:** complete → open Workspace/Kanban → back to To-Do → **still completed**
      (the exact re-sync that previously wiped it); uncomplete round-trips; shows in Kanban.
  - **⚠ TWO FOLLOW-UPS THIS FIX LEAVES OPEN — fold into the overhaul:**
    1. **OFFLINE SURFACING GAP.** A cloud-backed (`workspace_tasks`) to-do write while
       offline fails — `updateTask` **throws** — but the To-Do UI shows **NO error**; the
       button simply doesn't respond. **Handled-but-not-shown, the same class as the compose
       silent-failure cluster.** A **renderer** surfacing gap, not a flaw in the fix. Folds
       into the overhaul's **UI pass (slices 2/3)**. *(`personal_todos` items remain
       completable offline — **correct by design**, they are local-only.)*
    2. **THE ASSIGNER NOTIFICATION IS BROKEN AND WAS LEFT THAT WAY.** `todo:complete`'s
       `task_activity` row + assigner notification are **LOCAL-only**, so they are **wiped
       by the same re-sync** — silently broken today, and broken *before* this slice too.
       **Left in place per scope; nothing was removed.** The overhaul must make it
       **cloud-backed** (slice 5).
  - **THE OVERHAUL IS SPEC'D AND QUEUED (design-first, multi-slice — DO NOT ONE-SHOT).**
    A full To-Do tab overhaul spec lives **IN THE REPO** at **`docs/TODO_OVERHAUL_PROMPT_1.md`**,
    with the **`docs/TodoStepRail.jsx`** prototype and its **`docs/TodoStepRail.html`**
    standalone render. **Read them directly — do not rely on the summary below.** Shape:
    - A **unified aggregation layer** — one **member-gated `listTodos`** in MAIN normalizing
      **personal / assigned / kc-deadline / kc-meeting / kc-intel** into a `TodoItem` with a
      **source discriminator** (same pattern as the unified **Trash** view).
    - A **Step Rail** visualization over existing sub-item collections — `task_checklists`
      for KC/assigned; a **NEW steps table** for personal.
    - An **urgency engine** with **promotion strips**.
    - **Bidirectional calendar ↔ due-date** (one record surfaced twice).
    - A per-board **`board.assign` capability** (a `can_assign` flag on `board_members`),
      **enforced in MAIN, not the UI**; root implicit; **self-assign needs no grant**.
    - An **intel culling directive** (isRoot-only): pinned card + notification + deep link +
      a `completeCullingAssignment` hook.
    - **27-item Definition of Done; two-machine verification required.**
  - **SEQUENCING — the spec MANDATES diagnose-first. Build in dependency order, ONE TESTED
    SLICE EACH. Do NOT build as one blob:**
    0. ✅ **DONE — READ-ONLY DIAGNOSIS of Part A "what lives where"** (2026-07-19). Grounded
       the spec against real code; corrections recorded under **SPEC vs REALITY** below.
    1. ✅ **DONE — `personal_todos` → cloud**, shipped as **1a (`a46345b`) + 1b (`4001652`)**.
       Detail in the two entries below.
    1c. ✅ **DONE — CLOUD TEAM IDENTITY. Inserted mid-sequence, not in the original spec.**
       Slice 2's diagnosis found that `assignees_json` held device-local ids, so cross-team
       assignment — the feature motivating the whole overhaul — could never have worked
       cross-device. Shipped as **1c-1 (`4b9c0b3`)** the roster, **1c-2a (`d16b071`)** the
       reversible half, **1c-2b-① (`74150c7`)** the commit-once cloud rewrite, and
       **1c-2b-② (`863e5be`)** the full read/write repoint. Detail in the **1c-2 ARC** entry.
    2. ✅ **DONE — Aggregation layer (`065f6ce`):** `listTodos(actingUserId)` in MAIN,
       member-gated; the renderer only **filters**. **UNBLOCKED as of `863e5be`** — it could not aggregate
       "assigned to me" while the stored ids resolved on one machine only. Now that assignees
       are emails, `resolveIdentity` gives the same key on every device.
       - **★ SCOPE DECIDED (2026-07-20) — slice 2 builds the TWO sources that EXIST:**
         **personal** (local `personal_todos`) and **kc-deadline** (assigned board cards WITH a
         `due_date`, from `workspace_tasks`). Items are **urgency-coded, with past-due/today
         promoted to the top**; the urgency engine itself is **slice 3** — slice 2 only needs
         the ordering to be correct.
       - **DOUBLE-GATED — removal auto-clears the item.** Losing board access OR being
         unassigned from the card removes it from the list: `visibleBoardIdsFor` (board axis)
         **AND** an assignee-email match (card axis). Both, not either. Note this is a genuine
         **tightening** — `todo:getMyTasks` has **no board gate at all** today, so a card on a
         board you were removed from still shows.
       - **NET-NEW ARCHITECTURE IN MAIN.** Trash is **not** a precedent (it normalizes in the
         renderer). **One `todos:list` handler**, **additive** — leave `todo:getMyTasks` intact
         until the renderer is migrated (the "ADD, don't repoint" pattern that paid off in
         1c-1). **All-local reads**, with a **per-source `.catch`** so one failing source can't
         empty the whole page.
       - **TABS: KC / Assigned to me / Personal / All** *(SUPERSEDED by 3a — there are now
         FIVE; "Assigned by me" was added)*. **KC is a SUPERSET** — it includes
         assigned + meetings + intel + deadlines (per the `inTab` logic in
         **`docs/TodoStepRail.html`** — ⚠ earlier entries cite `TodoStepRail_6.html`, which is
         **NOT in the repo**; the repo file is byte-identical to the `_6` download, so the
         pointer was wrong but the content was always right). **"Assigned to me" and the intel
         directive render EMPTY until their backing entity exists** (slice 2.5 and slice 5
         respectively). An empty tab here is correct behavior, not a bug.
    2.5. **NEW — THE OFF-CARD ASSIGNMENT ENTITY. Net-new; BUILD ONCE, serves TWO tabs.**
       - **"Assigned to me" is an OFF-CARD assignment:** a board head or info-page head (or
         root) assigns a team member something with **NO Kanban card behind it**. **This does
         not exist in the schema today** — which is why slice 2 ships that tab empty.
       - **⚠ IT IS THE SAME MECHANISM AS SLICE 5's intel culling directive** (off-card
         assignment + notification + mark-done). **Build ONE assignment entity** — table +
         handlers + head/root gating + notification — let **"Assigned to me" consume it**, and
         have **slice 5 EXTEND it** with a deep link into Intelligence. **Do NOT build the
         assignment mechanism twice.**
       - **Gating:** a board/info-page **HEAD or ROOT** can assign off-card. Ties into
         `board.assign` (slice 4) and the head model.
       - **⚠ PREREQUISITE OVERLAP — `notifications` → cloud.** 2.5's notification is subject to
         the **same prerequisite already recorded for slice 5**: notifications are local-only
         and `user_id`-keyed, so cross-device delivery does not work until they move to cloud.
       - **★ SCOPE GREW (2026-07-20) — 2.5 IS NO LONGER JUST "a record + a notification".**
         Three additions, decided after seeing 3a's two empty tabs in the app:
         - **ASSIGNER VISIBILITY — the assigner sees the assignee's progress, VIEW-ONLY.**
           This is what makes **"Assigned by me" worth having**: a tab that showed only a
           status string would not justify itself. Read-only is the point — the assigner
           watches the work, they do not edit it.
         - **ASSIGNMENT CHAT — a comment/notes thread on the assignment**, like the card
           thread: the assigner leaves notes, the assignee responds.
           **⚠ DO NOT BUILD THIS ON THE CARD COMMENT SYSTEM.** `task_activity` /
           `activity:add` is **cloud-only AND split-brain — silent-failure INSTANCE EIGHT**
           (`activity:get` reads cloud, the completion event writes local; `addActivity`
           throws offline with no guard and no local write). Build the assignment chat
           **cloud-aware and offline-correct from the start**, and treat slice 4's activity-log
           repair as the model — inheriting that foundation would propagate the defect.
         - **"Assigned by me" is OFF-CARD ONLY.** On-card assignment status lives **on the
           board**, not in To-Do. **Both** assigned tabs depend **solely** on 2.5 — nothing
           else can populate them.
    2.6. **NEW — INVITED COLLABORATION. A THIRD concept, NOT a variant of assignment.**
       Someone has a **PERSONAL** to-do and **INVITES** other member(s) onto it. It **stays
       personal** — it does not become an assignment and does not appear in "Assigned to me".
       - **The invitee gets a notification, ACCEPTS, and then they complete it TOGETHER**
         (shared ownership).
       - **★ THE THREE DIFFERENCES THAT MAKE IT ITS OWN SLICE — do NOT collapse it into 2.5:**
         it is **OFFERED, not imposed**; it **requires ACCEPTANCE** (so there is a pending
         state that assignment has no concept of); and it is **peer-to-peer** — **no head
         authority is involved, nobody is ordered**. Modelling it as an assignment with a flag
         would put an acceptance state machine inside an entity that has none, and would let
         peer invitations inherit head-only gating.
       - **Shares the `notifications` → cloud prerequisite** with 2.5 and 5.
    ★ **THE THREE To-Do COLLABORATION CONCEPTS — KEEP THEM SEPARATE (decided 2026-07-20).**
       Recorded because they are easy to conflate and expensive to un-conflate later:
       - **a. ASSIGNED (off-card)** — a **HEAD** assigns to one or multiple members (**incl.
         themselves**). Top-down, **imposed**, lands in "Assigned to me". **Slice 2.5**, now
         multi-assignee.
       - **b. INVITED-COLLABORATION** — peer-to-peer, **offered**, requires acceptance, stays
         **personal**. **Slice 2.6** (above).
       - **c. PERSONAL** — just yours. **Exists today** (1a/1b).
    3. **SPLIT (2026-07-20) into 3a and 3b.** The rail depends on step data that does not yet
       exist in a trustworthy form, so the visible tab shipped without it.
    ★ **STEP RAIL — ONE component, THREE data sources, arriving at DIFFERENT TIMES.** The rail
       (progress bar + ordered dots, `docs/TodoStepRail.html`) is **ONE reusable presentational
       component** — diagnosis confirmed it is pure over `{steps, labelMode, onToggle}` with no
       fetching. What differs is only where the steps come from, so **build the component once
       against the personal source and feed it the other two as they land**:
       - **PERSONAL steps → BUILDABLE NOW. This is SLICE 3b.** `personal_todo_steps` exists
         (1a) with **0 rows and NO handlers** — it needs a write path, and nothing blocks it.
       - **ASSIGNED / off-card steps → SLICE 2.5**, with the entity.
       - **CARD CHECKLISTS → AFTER SLICE 4**, because the rail's toggle is a card edit and must
         respect the **EDIT tier** (assignees + heads only). See the checklist-state entry
         below for what is and isn't true about that data today.
    3a. ✅ **DONE — the visible To-Do tab (`d43445d`).** Urgency + tabs + promotion +
       migration onto `todos:list`. **NO Step Rail.** Detail in the **SLICE 3a** entry below.
    3b. ✅ **DONE — the PERSONAL Step Rail (`4c240bd`, 2026-07-20, UNRELEASED).** Scope held:
       the **reusable rail component** and the **`personal_todo_steps` write path**, nothing
       else. Detail in the **SLICE 3b** entry below; the remount trap it uncovered has its own
       lesson section.
       - **⚠ RESCOPED — the card-checklist mirror is NO LONGER part of 3b.** It was originally
         3b's prerequisite; the card-checklist rail now waits for **slice 4**, because its
         toggle is a card edit and must respect the **EDIT tier**. Building the mirror now
         would deliver a rail nobody is yet permitted to use correctly.
       - **`has_steps` is now REAL for personal items** (`steps.length > 0`) and **stays wrong
         for board cards** until the checklist work happens. The kc-deadline expression is a
         separate one in a separate function, so 3b changed only the personal half.
    - **★ CHECKLIST STATE — WHAT IS ACTUALLY TRUE (verified 2026-07-20, and it is the OPPOSITE
      of "local-only, never synced").** Recorded precisely because the inverted version would
      send a future session on a pointless cloud migration:
      - **CHECKLISTS ARE CLOUD-BACKED AND DO WORK CROSS-DEVICE TODAY.** Every one of the seven
        handlers (`checklists:get/create/delete`, `checklistItems:add/toggle/delete/update`,
        `ipc/index.ts:883-889`) routes to `boardsCloud.*` → Supabase. There are **ZERO local
        INSERTs** into either table outside the one-time `boardsSeed` upload. **There is
        nothing to cloud-migrate — that work is already done.**
      - **What is missing is the LOCAL MIRROR** (the opposite direction). `workspace_tasks`,
        boards, columns, members, `known_tags` and the roster all have a `syncXMirror` +
        `readXMirror` pair; **checklists have neither**. The 7 local rows dated 2026-05-25/28
        are a **dead pre-migration snapshot** that nothing reads except slice 2's `has_steps`.
      - **⚠ TWO SILENT FAILURES LIVE HERE — INSTANCES NINE AND TEN.**
        - **NINE — an empty state that ASSERTS ABSENCE IT CANNOT KNOW.** `getChecklists`
          (`boards.ts:1172`) opens `if (!isOnline()) return []`, so **offline the card renders
          "No checklists yet."** and the Kanban checklist badge vanishes. Not stale — *wrong*.
        - **TEN — `TaskDetailPanel` has NO offline guard anywhere** (grep for `online` in that
          file returns nothing). `handleToggleItem` (`:744`) awaits the cloud write **before**
          the optimistic update, with no `catch`: offline the promise rejects, the state update
          never runs, **the checkbox silently refuses to move and nothing is shown**. Same
          shape as the To-Do write-through bug `cc6aedf` and the `addActivity` defect queued
          for slice 4.
      - **REALTIME IS ALREADY WIRED** — `task_checklists` and `task_checklist_items` are both
        registered (`boardsRealtime.ts:14,61`), already resolve `task_id → board_id`, already
        gate on `isBoardVisible`, and already push `workspace:remoteChange`. **Combined with
        3a's unconditional `todoDataVersion` bump, a checklist change on any visible board
        already reaches the To-Do tab.** The signal path is complete; only the local data is
        stale. **No realtime work is needed** whenever the checklist rail is built.
    3-DETAIL. **THE DETAIL PANEL — grouped A / B / C (design `docs/TodoDetailPanel_mockup.html`).**
       A right-side sliding panel on personal to-dos, split so each group is one tested slice.
       **PERSONAL to-dos only** throughout — board cards deep-link to Workspace as before.
       - A-1. ✅ **DONE — data foundation (`7d5a38a`, 2026-07-20, UNRELEASED).** `color` + `starred`
         columns on `personal_todos` (local guarded ALTER + a hand-run cloud SQL file), the three
         1b setters (`setColor`/`setStar`/`setDue`), the `todoColors.ts` palette (keys, not hex),
         and the `cloudRowFor` data-loss trap closed. Detail in the **SLICE A-1** entry below.
       - A-2. ✅ **DONE — the panel UI (`f1fb6df`, 2026-07-20, UNRELEASED).** Module-level panel
         outside the Row boundary; colour picker + card stripe, star + pinned Starred group,
         date/time popovers + urgency due pill, revive, the 3b step list; chevron removed (panel
         is the sole step editor). Detail in the **SLICE A-2** entry below.
       - A-3. ✅ **DONE — DRAG-TO-REORDER steps in the panel (`9c049e3`, 2026-07-21, UNRELEASED).**
         `personalTodoStep:reorder(todoId, orderedStepIds)` rewrites `position` **densely 0..n-1**
         in one transaction (`AND todo_id=?` guard), so it **self-heals 3b's SPARSE/GAPPY positions**
         (`COALESCE(MAX,-1)+1` never reused a deleted slot) on the first drag. One `syncPersonalWrite`
         per row, no isOnline guard. Frontend reuses the Kanban's dnd-kit (`SortableContext` +
         `verticalListSortingStrategy`, `PointerSensor` distance:5, grip-only listeners so toggle/
         delete keep their onClick); optimistic `arrayMove` commit-on-drop, no refetch-on-move.
       - B. ✅ **DONE — NOTES on personal to-dos (`4bc236d`, 2026-07-21, UNRELEASED).** `notes` TEXT
         column (local guarded ALTER + hand-run cloud DDL `sql/2026-07-21_personal_todos_notes.sql`,
         already run); `setNotes` setter mirroring `setColor` (empty→NULL, no isOnline guard) with
         `notes` added to the `cloudRowFor` SELECT+return (clobber guard). UI = a plain `<textarea>`
         (NO TipTap, NO debounce) in a module-level `NotesEditor`. **Save model: onBlur +
         save-if-changed + an unmount-cleanup flush, `key={item.id}`** — the blur covers chevron/
         backdrop/select-another, the unmount flush covers the Esc + tab-switch gaps a plain
         onBlur-only model drops, and the key both closes those gaps and prevents cross-item draft
         bleed (an old editor's flush is bound to the old item). Detail in the **SLICE B** entry below.
       - C-recurring-1. ✅ **DONE — completion-anchored recurrence BACKEND (`1795418`, 2026-07-21,
         UNRELEASED).** Completing a recurring personal to-do spawns its next occurrence in ONE
         transaction. Four columns (`recurrence` / `recurrence_anchor` / `series_id` /
         `spawned_successor`); `nextOccurrence` STRING date math (no `Date`); locked semantics:
         completion-anchored, exactly ONE active instance, `spawned_successor` idempotency guard
         (re-complete after revive never double-spawns), no-due-date → no roll. Detail in the
         **SLICE C-recurring-1** entry below.
       - C-recurring-2. ✅ **DONE — recurrence PICKER UI + row chip (`76bafb0`, 2026-07-21,
         UNRELEASED).** `setRecurrence` (verbatim `setColor` clone); a `RecurrencePopover` (reuses
         the DatePopover machinery) as a "Repeat" row after DUE; a repeat chip on the card; one
         `RECUR_LABELS` source of truth; inline repeat SVG (no icon dep). Detail in the **SLICE
         C-recurring-2** entry below.
       - C-recurring-3. ✅ **DONE — missed-occurrence tracking + roll-forward + completion gate
         (`a6f82d7`, 2026-07-21, UNRELEASED)**, plus a follow-up cleanup (`9376ba7`) removing the
         orphaned `personalTodo:list` channel. A time-driven evaluator (login + CET-midnight timer)
         rolls a stale `due_date` forward stamping `missed_dates`; completion is GATED until misses
         are cleared; amber card chips + a "Missed repeats" panel section clear them (bookkeeping-
         only, never spawns); the `skipRanges` seam is wired for Off-work. Detail in the **SLICE
         C-recurring-3** entry below.
       - **★ GROUP A IS CLOSED.** A-1/A-2/A-3/B/C-recurring all shipped. **C-files is PARKED** —
         deferred, non-essential; personal to-dos have no attachment precedent, so it's its own
         diagnose-first project if revisited, NOT the next step.
       - **★ DIRECTION (Dorian, 2026-07-20): FINISH TO-DO COMPLETELY — A-3 → B → C — BEFORE
         pivoting to the team/collaboration/publication work.** Group A is now done; the two QUEUED
         To-Do features below (C-recurring-3, Off-work) are also To-Do work and come BEFORE the
         team thread. This still pushes 2.5, 2.6, 4, 5, the Team console and the publication
         redesign LATER. Recorded so a future session does not "helpfully" jump to slice 4 next.
       - **★ QUEUED: C-recurring-3 + OFF-WORK (Dorian's next build targets, 2026-07-21 — DESIGN-FIRST,
         diagnose before building).** Two features, in this order (the second depends on the first):
         - **(a) C-recurring-3 — MISSED-OCCURRENCE TRACKING. ✅ SHIPPED (`a6f82d7`, 2026-07-21).**
           Built as spec'd below — see the **SLICE C-recurring-3** entry for what actually landed.
           Kept spawn-on-completion exactly as
           C-recurring-1 built it, but ADD a **time-driven evaluator** (runs at launch, maybe
           periodically) that stamps a **"missed: <date>"** chip when an interval boundary passes
           without the active instance being completed (room for SEVERAL chips beside the repeat
           chip). A **"Missed repeats" section** is added to the detail panel UNDER Notes — new panel
           order **Colour → Due → Recurrence → Steps → Notes → Missed repeats**; each missed entry is
           markable-done there, and clearing it removes the chip. **LOCKED SEMANTIC: marking a missed
           occurrence done = BOOKKEEPING ONLY, does NOT spawn** (the active instance already exists).
           Open questions to settle in the diagnosis: the launch-time evaluator is **NEW machinery**
           (completion-anchoring had deliberately let us avoid a time-driven scheduler); and where
           missed dates live (a `missed_dates` JSON array on the row vs a child table).
         - **(b) "OFF WORK" SETTING. ✅ SHIPPED (`f918e42`, 2026-07-21).** A per-member future-only
           leave window (start→end) in a new cloud **`off_work`** table (PK `user_email`, RLS enabled) +
           a local mirror the offline evaluator reads. The evaluator reads the acting user's window and
           **skips stamping misses** for boundaries inside it (the `due_date` still rolls forward —
           suppression only gates the STAMP, not the roll). It landed on the Team page (provisional
           placement) rather than Settings: an **"on leave" pill**, a **self-service picker**, an
           **"End leave"** action (deletes the row = you're back; forward-only) and an **Update** path.
           IPC `offWork` get/set/list/clear; cloud DDL `sql/2026-07-21_off_work.sql`. **Notification-drop
           DEFERRED** (blocked on notifications→cloud) with a documented stub. Verified both directions
           via a local-seed test.
       - **★ DATE-PICKER SLICE — BUILT, TESTING (uncommitted, 2026-07-21).** Not on the original queue;
         surfaced while using off-work. Three bundled fixes across `Team.tsx` + `Todo.tsx`: (a) native
         `<input type=date/time>` open on a body click via `onClick→showPicker()` + `[color-scheme:dark]`
         (root cause: Chromium only opens the picker from the tiny edge glyph — a quirk, not a bug); (b)
         upward-opening was MOOT (native OS auto-flips — no custom flip logic); (c) recurrence GATED ON A
         DUE DATE (the panel `RecurrencePopover` disabled+greyed with a "set a due date first" hint when
         `!item.due_date`) — kills the recurrence-without-due zombie state at the source. One recurrence
         entry point (the panel); the quick-add row has none. Full learnings under the SLICE entry below.
    4. **The HEAD role + CARD PERMISSION TIERS, enforced in MAIN.** *(Was "`board.assign`
       per-board permission" — the capability is now carried by the unified **head** role, not
       a standalone `can_assign` flag. See the UNIFIED HEAD ROLE entry under Known issues.)*
       - **★ CARD PERMISSION TIERS — board-level, THREE tiers (decided 2026-07-20):**
         - **SEE** — **all board members see all cards.** No per-card visibility.
         - **ASSIGN** — **only HEADS** assign members to cards.
         - **EDIT** — **only members ASSIGNED to a card (or heads) can edit that card.**
       - **⚠ EDIT IS NET-NEW GATING ACROSS EVERY CARD MUTATION, not just checklists.** Title,
         description, due date, labels, attachments, comments, checklists, column moves — all
         of it. Scope slice 4 with that in mind; it is materially larger than "add a flag".
         The 0a-4 lesson applies directly: **a UI-only gate is a suggestion, not a gate** —
         enforce in MAIN.
       - **★ SELF-ASSIGNMENT IS A CORE REQUIREMENT (slices 2.5 + 4).** Whoever holds assign
         authority **may include THEMSELVES** among the assignees. Assignment is **not**
         only top-down-to-others; a head assigning themselves is the normal case, not an edge
         case. (This supersedes the older spec note that "self-assign needs no grant" — under
         the head role there is no separate grant to need.)
       - **★ MULTI-ASSIGNEE (slice 2.5 + card assignment).** An assignment — **off-card OR
         on-card** — may target **ONE OR MULTIPLE** members, **including the assigner**.
         **Not single-assignee.** `assignees_json` is already a list, so cards carry this
         today; the slice-2.5 off-card entity must be modelled the same way from the start
         rather than as a single `assignee_email` that has to be widened later.
       - **CARD ACTIVITY ON ASSIGNMENT — VERIFIED ABSENT (2026-07-20), so BUILD IT HERE.**
         When a member with `board.assign` assigns another member to a board CARD, the card's
         activity log should record **"X assigned Y to this card."** `task_activity` exists
         (`db.ts:103`) but has exactly **two** writers — `"added a comment"`
         (`TaskDetailPanel.tsx:654` → cloud) and `"marked this task as complete"`
         (`ipc/index.ts:1606` → local). **`toggleAssignee` (`TaskDetailPanel.tsx:781`) writes
         the task update and a notification, but NO activity entry.** Net-new work.
       - **⚠ THIS IS CARD/BOARD BEHAVIOR, NOT To-Do AGGREGATION.** `assigned_by` does **NOT**
         go on kc-deadline `TodoItem`s — **their provenance lives in card activity.** Only the
         **off-card "Assigned to me" items carry `assigned_by`**, because the slice-2.5 entity
         has no card to hold the history.
       - **⚠ TWO PRE-EXISTING ACTIVITY-LOG DEFECTS to resolve BEFORE writing a third event
         type into this table (both found while verifying the above):**
         - **SPLIT-BRAIN, and one half is INVISIBLE (silent-failure class).** `activity:get`
           (`ipc:363` → `getActivity`, `boards.ts:1120`) reads **CLOUD ONLY** with no mirror
           fallback, but the completion event is written to **LOCAL SQLite**. Every
           `"marked this task as complete"` entry written since the one-time `boardsSeed`
           upload **is never read by anything** — it accumulates unreadably. Pick ONE store.
         - **`addActivity` is cloud-only and THROWS offline** — no `isOnline()` guard, no local
           write. Logging assignment through it means **assigning offline throws or silently
           drops the entry**, the same shape as the To-Do write-through bug `cc6aedf`. Decide
           this deliberately in slice 4 rather than inheriting it.
    5. **Intel culling directive + calendar bidirectionality + completion write-back**
       (respects board perms). **⚠ EXTENDS SLICE 2.5, does not re-implement it** — the
       directive is an off-card assignment with a deep link into Intelligence. If 2.5 is built
       first, slice 5 is the deep link plus the cull-specific UI, not a new mechanism.
       - **⚠ PREREQUISITE — `notifications` → cloud.** The directive is *pinned card +
         notification + deep link*, but `notifications` is **local-SQLite-only and
         `user_id`-keyed** (`db.ts:253`, zero cloud presence). A directive assigned from the
         laptop writes a row into the assigner's OWN local DB — **it never reaches the
         assignee's machine.** The deep-link machinery works; the delivery does not. The spec
         does not mention this. Migrate notifications before, or slice 5 ships broken.
  - **✅ SLICE 2 SHIPPED — the `listTodos` aggregation layer (`065f6ce`, 2026-07-20,
    UNRELEASED).** Two sources assembled in MAIN — **personal** (local `personal_todos`,
    `user_id`-keyed, because 1a deliberately kept the local table id-keyed and translates only
    at the cloud boundary) and **kc-deadline** (assigned `workspace_tasks` WITH a `due_date`).
    **Additive** — `todo:getMyTasks` was left intact for 3a to migrate off.
    - **DOUBLE-GATED, both axes verified in-app on a relaunched synced session:** unassign →
      the item disappears; reassign → it comes back; remove from the board → **all** its
      deadlines drop while personal stays. Nothing needs to actively clear an item because the
      list **recomputes from current state on every call** — it was never stored.
    - **`workspace_tasks` HAS NO `deleted` COLUMN.** The spec asked for `archived=0 AND
      deleted=0` on the task row; soft-delete lives on `workspace_boards`. Resolved by
      mirroring `readTasksMirror`'s **INNER** join, which also excludes a task whose `board_id`
      dangles rather than surfacing it ungated (`todo:getMyTasks`'s LEFT join keeps it).
    - **PER-SOURCE ISOLATION** — each source independently try/caught, so one failure can't
      empty the page (the `Promise.all`-poisoning lesson).
    - **⚠ DEFECT SHIPPED KNOWINGLY — `has_steps` reads a dead table.** See slice 3b. Nothing
      consumes it, and 3a kept it that way.
  - **✅ SLICE C-recurring-1 SHIPPED — completion-anchored recurrence BACKEND (`1795418`, 2026-07-21,
    UNRELEASED).** Completing a recurring personal to-do spawns its next occurrence. FOUR new columns
    (guarded local ALTER + hand-run cloud DDL `sql/2026-07-21_personal_todos_recurrence.sql`, already
    run): `recurrence` (NULL = non-recurring; else daily|weekly|weekdays|monthly|yearly),
    `recurrence_anchor` ('completion'; 'scheduled' reserved/unused), `series_id` (links every instance
    of one series), `spawned_successor` (0/1). All four added to `cloudRowFor` (clobber guard) and to
    `readPersonal` + BOTH `TodoItem` types. **Spawn lives in `personalTodo:complete`**, wrapped so the
    complete-UPDATE and spawn-INSERT are ONE `db.transaction`: it reads the row, and **iff
    `recurrence` set AND `spawned_successor=0`** it seeds `series_id = series_id ?? id`, computes
    `nextOccurrence(due_date, recurrence)` (NULL due → no roll), INSERTs a fresh row (copies title/
    due_time/recurrence/color/starred; NOT notes/steps — clean slate; `recurrence_anchor='completion'`,
    append `position`), and flips the completed row `spawned_successor=1`. Cloud writes fire AFTER the
    transaction (`update` for the parent, `insert` for the spawn), no isOnline guard. **`nextOccurrence`
    ([src/main/todos/nextOccurrence.ts]) is pure STRING math** — parses `'YYYY-MM-DD'` to integer y/m/d,
    never `new Date(str)` (which the To-Do CET engine avoids for the same tz reason). Edge cases,
    all verified in-app: **monthly month-end clamp** (Jan-31 → Feb-28 via `daysInMonth`), **yearly
    Feb-29 → Feb-28** in a non-leap target year, **weekdays** Fri→Mon (Zeller day-of-week, no Date).
    **Locked semantics: completion-anchored, exactly ONE active instance, and the `spawned_successor`
    guard means a re-complete after revive NEVER double-spawns.** Revive/uncomplete is unchanged (it
    does NOT reset `spawned_successor` — the noted backlog item). **All three date edge cases + carry-
    forward + clean-slate + series linking + idempotency were verified end-to-end through the running
    app** (seed via sqlite → complete via `window.api.personalTodo.complete` → read back).
  - **✅ SLICE C-recurring-2 SHIPPED — recurrence PICKER UI + row chip (`76bafb0`, 2026-07-21,
    UNRELEASED).** `personalTodo:setRecurrence(id, freq)` is a **verbatim `setColor` clone** (bareTodoId
    → UPDATE recurrence → `cloudRowFor` → `syncPersonalWrite`, no isOnline guard); `recurrence` was
    already in `cloudRowFor` (C-recurring-1) so no clobber work, and it deliberately does NOT touch
    `series_id`/`spawned_successor`. Renderer `handleSetRecurrence` mirrors `handleSetColor` (optimistic
    `patchItem`, revert on refusal, **no `queueLoad` on success**). UI: a **`RecurrencePopover`** reusing
    the DatePopover machinery (`usePopoverDismiss` + `PILL_CLASS` trigger + the shared dropdown
    container — no new primitive) as a **"Repeat" row placed after DUE, before STEPS**; six rows
    (Does-not-repeat → null, Daily, Weekly, Weekdays, Monthly, Yearly), active row highlighted. A
    **repeat chip on `PersonalCard`** beside the due pill. **One `RECUR_LABELS` source of truth** drives
    trigger + rows + chip so labels never drift; `isRecurKey` validates renderer-side (like
    `isTodoColorKey`); the repeat glyph is an **inline SVG** (mockup's path, no icon dependency).
  - **✅ SLICE C-recurring-3 SHIPPED — MISSED-OCCURRENCE TRACKING + ROLL-FORWARD + COMPLETION GATE
    (`a6f82d7`, 2026-07-21, UNRELEASED)**, plus a follow-up cleanup (`9376ba7`) removing the orphaned
    `personalTodo:list` channel. The one piece of **time-driven machinery** in the app — C-recurring-1
    deliberately avoided a scheduler; missed-tracking needs one because a boundary can pass with the
    app closed. **`missed_dates`** (one new column: guarded local ALTER + hand-run cloud DDL
    `sql/2026-07-21_personal_todos_missed.sql`) is a JSON array of 'YYYY-MM-DD' boundary dates.
    - **THE EVALUATOR** (`src/main/todos/missedEvaluator.ts`): for every recurring, incomplete row
      whose `due_date < cetToday()`, it loops `nextOccurrence`, stamping each passed boundary into
      `missed_dates` (unless it falls in a `skipRange`) and rolling `due_date` forward, in ONE pass
      (app closed 3 weeks / weekly ⇒ 3 misses + `due_date` on the next occurrence). A guard caps the
      loop at 10000 and bails if `nextDue <= due`. Writes go through the SAME 1b path (local UPDATE
      then un-awaited `syncPersonalWrite` via the canonical `personalCloudRow`), no isOnline guard.
    - **SCHEDULER**: a single module-level timer (`startMissedSchedule`/`stopMissedSchedule`) — runs
      the evaluator at login and re-arms for the next **CET midnight** (`msToNextCetMidnight`, +5s
      buffer; DST drift harmless — the evaluator is idempotent and reschedules daily). Torn down in
      the EXACT four places realtime is: **logout / user-switch** (ipc `app:setActingUser`, beside the
      realtime lifecycle) and **window-all-closed / before-quit** (`index.ts`). ⚠ The acting user is
      known only at login (`currentActingUserId` is set in `app:setActingUser`, not at `whenReady`) —
      that's why the login hook lives there.
    - **THE GATE**: `personalTodo:complete` returns **`{ok:false, reason:'missed'}`** (net-new failure
      shape, both sides) BEFORE any write when `missed_dates` is non-empty. Renderer opens the panel +
      flashes a 4s "Clear missed repeats first ↓" cue + an amber card ring; completion isn't optimistic
      so nothing reverts. **`personalTodo:clearMissed(id, date)`** is bookkeeping-only — a pure array
      edit (empty→NULL), never spawns / never touches `due_date`.
    - **CET AUTHORITY SPLIT**: a NEW **main-side `cetToday()`** (`src/main/todos/cetToday.ts`, Intl
      `en-CA` Europe/Berlin) — DUPLICATE-BY-DESIGN of the renderer's `urgency.ts` copy (no shared
      main/renderer module); both carry a "keep in sync" note.
    - **`personalCloudRow` HOIST**: the clobber-critical cloud column list moved to a canonical
      exported builder in `cloud/personalSync.ts`; ipc `cloudRowFor` now delegates, and the evaluator
      imports the same builder — ONE column list across three call sites (added `missed_dates` there).
    - **PREFIX-HARDENING (same session)**: `personalTodo:complete`/`uncomplete` were the ONLY mutating
      handlers that bound the RAW id instead of `bareTodoId(id)` — a `personal-<uuid>` display id
      matched zero rows and returned `ok:true` having done nothing (the setter zero-match landmine).
      Both now strip once at the top and use the bare `key` for every statement (incl. the
      `series_id ?? key` spawn seed). A DevTools "spawn returns null" scare traced to exactly this: the
      test called `complete('personal-…')` with the prefix.
    - **RENDER PATH**: `missed_dates` reaches the renderer as a real `string[]` via `todos:list` →
      `readPersonal` (`parseMissed`); the card/panel map it directly (no self-parse). The old
      `personalTodo:list` (`SELECT *`, unshaped, returned the raw string) was **deleted** in `9376ba7`
      — `todos:list` is now the single shaped read.
  - **✅ SLICE OFF-WORK SHIPPED — per-member leave windows (`f918e42`, 2026-07-21, UNRELEASED).**
    A future-only leave window (`start_date`→`end_date`) per member. New cloud **`off_work`** (PK
    `user_email`, RLS enabled; DDL `sql/2026-07-21_off_work.sql`) is the source of truth; a local
    `off_work` mirror lets the offline missed-evaluator read a window with no cloud roundtrip
    (`cloud/offWork.ts` mirrors the `teamRoster.ts` shape: cloud-first → upsert-only `syncMirror` →
    mirror fallback, never throws). The evaluator resolves the acting user's email
    (`ownerEmail(userId)`), reads `offWorkMirror(email)` synchronously, and passes it as a `skipRange`
    so boundaries inside the window are **not stamped** — the `due_date` STILL rolls forward
    (suppression gates only the STAMP). A scheduler-side `refreshLeaveThenRun` does one best-effort
    async cloud read to freshen the mirror (incl. cross-device) before each evaluator run. **"End
    leave" = DELETE the row, not truncate `end_date`** — suppression is forward-only, so removing the
    window just lets future boundaries stamp again; nothing already suppressed is un-suppressed.
    Team page (provisional placement): "on leave" pill, self-service picker, End-leave/Update. IPC
    `offWork` get/set/list/clear. **Notification-drop DEFERRED** (notifications are still
    local/per-device — `db.ts:253`; the drop half is blocked on notifications→cloud, left as a
    documented stub at `createNotification`).
  - **✅ SLICE DATE-PICKER — BUILT, TESTING (uncommitted, 2026-07-21).** Three bundled fixes in
    `Team.tsx` (off-work start/end) + `Todo.tsx` (new-todo date/time + panel recurrence). ★ **THREE
    REUSABLE LEARNINGS:**
    - **(a) Native date inputs only open the picker from the tiny edge glyph** — a body click does
      nothing. Wire `onClick={e => { try { e.currentTarget.showPicker() } catch {} }}` (the try/catch
      guards the already-open `InvalidStateError`; `showPicker()` is supported on Electron 31 /
      Chromium 126) so the whole field opens it, and add **`[color-scheme:dark]`** so the glyph is
      visible on the dark field. **The app-wide standard IS native inputs** — the custom `DatePopover`
      exists in only ONE place (the To-Do panel due-date); every other date field (Contacts,
      TeamCalendar, SocialTab, ManualInfoTab, TaskDetailPanel) is native. TaskDetailPanel's inputs
      already had `[color-scheme:dark]`; these four didn't.
    - **(b) Native OS picker positioning auto-flips** — the off-work block sits at the BOTTOM of the
      Team page, and the native picker opens upward on its own. **Prefer native over a custom popover
      for edge/bottom-of-screen date fields:** the existing `RecurrencePopover`/`DatePopover` use
      `absolute … top-full` (always DOWNWARD, no flip/overflow logic), so a custom picker there WOULD
      have clipped off-screen. No custom flip logic was needed or added.
    - **(c) Prevent bad states at the SOURCE, not downstream.** Recurrence is now GATED ON A DUE DATE:
      `RecurrencePopover` gained a `disabled` prop, passed `disabled={!item.due_date}`, greying the
      trigger + showing a "set a due date first" hint. This kills the recurrence-without-due-date
      zombie state (what produced the "call mom" mess) at creation — better than the old downstream
      tolerance (`nextOccurrence` returning "no roll" on a NULL `due_date`). One entry point (the
      panel) covers all paths; the quick-add row has no recurrence control. **Left for optional
      cleanup:** 15 completed `call mom` rows (local + cloud, all `completed=1`/`recurrence=daily`/no
      `due_date`) — benign, invisible, not deleted in this slice.
  - **✅ SLICE A-3 SHIPPED — DRAG-TO-REORDER personal steps (`9c049e3`, 2026-07-21, UNRELEASED).**
    `personalTodoStep:reorder(todoId, orderedStepIds)` dense-rewrites `position` 0..n-1 in one
    `db.transaction` (`AND todo_id=?` guard — no FK, so a foreign id no-ops instead of moving another
    to-do's step), then one un-awaited `syncPersonalWrite` per row via `stepCloudRow`, **no isOnline
    guard**. Because it rewrites ALL rows, it **self-heals 3b's sparse positions** (live data was 3–8)
    to 0..n-1 on the first drag. Frontend reuses the Kanban's dnd-kit exactly: module-level
    `SortableStepRow` (`useSortable`), `DndContext`+`SortableContext` `verticalListSortingStrategy`,
    `PointerSensor` `activationConstraint:{distance:5}`, and the grip handle owns the drag listeners
    so the toggle dot + delete keep their own onClick. `handleStepReorder` optimistically `arrayMove`s
    on drop only (no refetch-on-move — the 3b double-hitch lesson).
  - **✅ SLICE B SHIPPED — NOTES on personal to-dos (`4bc236d`, 2026-07-21, UNRELEASED).** A free-text
    `notes` field in the detail panel. Backend mirrors A-1: `notes` TEXT column (local guarded ALTER
    beside color/starred + hand-run cloud DDL `sql/2026-07-21_personal_todos_notes.sql`, already run),
    a `setNotes` setter (empty string → NULL, no isOnline guard), and `notes` added to the
    **`cloudRowFor` SELECT + return literal** — the mandatory clobber guard (a whole-row upsert would
    otherwise blank notes on the next unrelated write). Read path: `readPersonal` SELECT+return and
    **BOTH** `TodoItem` definitions gained `notes` (see the gotcha below). UI is a plain `<textarea>`
    styled to the mockup — **NO TipTap, NO debounce** — in a module-level `NotesEditor` (own draft, so
    typing never re-renders `Todo`). **Save model = onBlur + save-if-changed + an unmount-cleanup
    flush, rendered `key={item.id}`.** onBlur covers chevron/backdrop/select-another (all move focus);
    the `useEffect(() => () => flush(), [])` cleanup covers the Esc + tab-switch/route-change paths a
    plain onBlur-only model (and the intel RichTextEditor) drop; the key both forces that unmount
    flush on to-do switch AND binds each editor's flush to the correct item, preventing cross-item
    draft bleed. Refs (`draftRef`/`savedRef`) let the stale unmount closure compare latest values;
    the baseline advances before the async call so blur-then-unmount can't double-save.
  - **✅ SLICE A-2 SHIPPED — the personal to-do DETAIL PANEL (`f1fb6df`, 2026-07-20, UNRELEASED).**
    A right-side sliding panel that opens on clicking a **personal** card; KC/assigned cards still
    deep-link to Workspace (personal-only). Reads A-1's `color`/`starred`; writes via A-1's setters
    and the 3b step handlers — **all offline-capable**, no new backend for the panel itself.
    - **★ MODULE-LEVEL, RENDERED OUTSIDE THE ROW BOUNDARY — the remount-trap discipline.** The
      panel holds a date input, a time input and an add-step input; if its type changed each Todo
      render they would lose focus mid-keystroke (the 3b bug). It is defined at module level AND
      rendered directly from `Todo`'s JSX as a **sibling of the list** — module-level ALONE is not
      enough (that was 3b's failed second attempt); WHERE it renders is what saves it. It is
      absolutely positioned so it paints as an overlay, which changes where it paints, NOT where it
      sits in the tree.
    - **COLOUR** — a 7-swatch picker + a **"no colour"** option (a slashed circle, NOT an 8th
      swatch — grey IS a choice, the slate swatch). Stores a **palette KEY** via `todoColors.ts`;
      drives the card's 5px left stripe. No hardcoded hex. **There is NO custom/free colour
      picker** — 7 keys plus none, by design.
    - **STAR** — personal-only; a pinned **"Starred" group** at the top of Personal + All,
      **EXCLUDED from the promotion strip AND the urgency bands** (`isPinnedStar` filters both), so
      a starred past-due item appears ONCE. KC/assigned/meeting cards have no star affordance and
      structurally no `starred` field.
    - **DUE** — date + **hour/minute** popovers (`DatePopover`/`TimePopover`), **NEWLY BUILT**
      (nothing reusable existed — TaskDetailPanel uses bare native inputs; the month grids in
      TeamCalendar/CalendarView are full-page, not extractable). Timezone-safe: every stored string
      is built from Y/M/D parts, never `toISOString()`. The card shows an **urgency-coloured due
      PILL** keyed to the SAME `urgency()` buckets as promotion, so the pill can never disagree
      with the group its card sits in. Clearing the date clears the time (A-1 rule, mirrored in the
      renderer so the panel never shows a time the backend just dropped).
    - **⚠ TITLE IS READ-ONLY — and the commit message is WRONG about this.** The `f1fb6df` message
      says *"editable title"*; it is not. There is **no `personalTodo:setTitle` handler** (verified:
      absent from `ipc/index.ts` and preload), and the panel renders the title as a `<p>`
      (`Todo.tsx` — *"READ-ONLY. There is no personalTodo title-update handler"*). Left read-only
      deliberately per the A-2 brief (*"do NOT invent scope"*). Recorded here so a future session
      does not hunt for a handler that never existed, or trust the commit subject over the code.
      **If editable title is wanted, it is a NET-NEW A-2 follow-up** (a `setTitle` handler on the
      1b pattern — `cloudRowFor` already carries `title`, so only the handler + preload + panel
      input are missing).
    - **REVIVE** — completed personal items reopen in the panel with a Revive banner; unchecking
      reuses the existing `uncomplete` handler (reviving IS uncompleting — no new handler). The
      panel stays open; the item re-sorts out of Completed underneath it.
    - **CHEVRON + INLINE STEP EDITOR REMOVED from the card.** The panel is now the SOLE step
      editor; the card keeps ONLY the **read-only 3b horizontal rail**. Two editors for one list
      would also have put an `<input>` back below the Row boundary — the focus bug again. Close
      control is a **right-pointing chevron**, not an X (X reads as delete/dismiss).
    - **SLIDE IN/OUT** — `translateX` via a class flip, with a **retained `panelItem`** so the
      panel can animate OUT after `selectedId` clears (a conditional mount cannot — React removes
      the node first); `onTransitionEnd` (guarded on `transform` + `currentTarget`) drops the
      retained item. An **animated spacer** widens `0→378px` in step so the list is pushed rather
      than snapping (the panel is out of flow). Double-rAF commit-then-flip so the browser has a
      start frame. **`prefers-reduced-motion` honoured** via the shared `useReducedMotion` (now
      exported from `StepRail.tsx` — one listener, not two).
    - **★ DARK-MODE GRADIENT FIX.** The To-Do page had been painting an **opaque flat navy**
      (`dark:bg-hub-navy`) over the app's body gradient, reading as flat black. The app paints
      `linear-gradient(135deg, --g-from, --g-via, --g-to)` on `body` (`styles/index.css:44`, the
      theme-selectable navy→indigo→blue); **pages show it by being TRANSPARENT** (Dashboard's root
      is `p-6 h-full overflow-y-auto`, no bg). To-Do's root is now transparent too, matching every
      other page. Cards lifted to the standard `dark:bg-white/[0.04]` elevated surface; **all
      dashed borders replaced with solid**.
    - **SELECTED ITEM IS DERIVED, NOT STORED** — `selectedItem = all.find(id === selectedId)`, so
      an edit anywhere re-renders the panel with no fetch and no second copy to drift, and a
      deleted item self-heals (find → undefined → panel unmounts).
    - **OUT OF SCOPE, held:** drag-reorder (A-3), notes (B), recurring + files (C).
  - **✅ SLICE A-1 SHIPPED — detail-panel DATA FOUNDATION (`7d5a38a`, 2026-07-20, UNRELEASED).**
    Two NEW columns on `personal_todos` — `color TEXT` (a palette KEY, nullable) and
    `starred INTEGER NOT NULL DEFAULT 0`. **Both are net-new; neither ever existed** (`git log
    -S"starred" -- db.ts` returns nothing — the brief's "1a dropped starred" was wrong). `due_date`/
    `due_time` already existed, so A-1 added no schema for due.
    - **LOCAL = guarded ALTER** (the 1a `PRAGMA table_info` pattern); `NOT NULL DEFAULT 0` is legal
      in SQLite `ADD COLUMN`, so no backfill pass. **CLOUD = a hand-run SQL file**
      (`sql/2026-07-20_personal_todos_color_star.sql`) — per the standing rule, Claude writes the
      file and Dorian runs the DDL in Supabase. No RLS/realtime/replica-identity work (all three
      already apply to the table from 1a).
    - **⚠ `cloudRowFor` DATA-LOSS TRAP CLOSED.** `syncPersonalWrite` upserts the WHOLE row, so a
      column missing from `cloudRowFor`'s SELECT/return is sent absent and **BLANKED in cloud on
      the next unrelated write**. `color` + `starred` were added to both — without it, marking a
      to-do complete would wipe its colour and star in cloud. Column set now matches cloud exactly.
    - **THREE SETTERS on the 1b pattern** — `personalTodo:setColor/setStar/setDue`, local-first,
      un-awaited cloud, **no `isOnline` guard**, id run through `bareTodoId`. `setStar` coerces
      bool→0/1 at the boundary (better-sqlite3 rejects a raw JS bool); **`setDue` drops the time
      whenever the date is null** (a timeless-dateless "14:30" is unrankable by the CET banding).
    - **`todoColors.ts`** — `TODO_COLORS` (7, mockup order) as **theme-aware Tailwind class
      literals**, not hex; `resolveTodoColor` returns null for an unknown key (free-form TEXT
      column, so a future wider palette syncing down to an older build degrades to "no colour"
      rather than crashing). `readPersonal` returns `color` + `starred` (coerced to bool); **the
      kc-deadline mapper deliberately does NOT** — a board card has no per-user row for a star and
      its colour derives from its board/column, so the fields are structurally inapplicable, not
      merely unimplemented.
  - **✅ SLICE 3b SHIPPED — the personal Step Rail (`4c240bd`, 2026-07-20, UNRELEASED).**
    Three handlers on the **1b local-first + sync-queue pattern** —
    `personalTodoStep:create/toggle/delete`. Local write lands FIRST and alone decides
    `{ok:true}`; the cloud op is handed to `syncPersonalWrite` un-awaited and queues on failure
    or offline. **NO `isOnline()` guard anywhere in the path**, deliberately: personal is the
    offline-capable source, and the 1b lesson was that guarding a personal write blocks the one
    thing that works offline.
    - **`personal_todo_steps` was ALREADY in the `SyncTable` union and `CONFLICT` map** (1b
      wired it grow-ready, `personalSync.ts:30,36`), and `applyToCloud`/`drainPersonalSyncQueue`
      are table-agnostic — so **launch, reconnect and manual drains covered steps with ZERO new
      queue code**. Verified rather than assumed; cloud columns match local exactly.
    - **`todos:list` returns steps INLINE for personal items** — one `WHERE todo_id IN (…)`
      for the whole list, not per-item, because refetches fire on every realtime push. Wrapped
      in its own try/catch: a step-read failure degrades to no rails, never costs the list.
      **`has_steps` is now real for personal.** Board cards get `steps: undefined`.
    - **★ THE PREFIX LANDMINE — `raw_id` was added to `TodoItem`.** `todos:list` emits a
      DISPLAY id (`personal-<uuid>`) but `personal_todos.id` is the BARE uuid. Passing the
      prefixed id to a step handler would insert steps whose `todo_id` matches no row — and
      **there is no FK locally OR in cloud** (the cloud SQL omits it deliberately so the queue
      can upload a step before its parent), so **nothing would error**. The steps would simply
      never be read again. Three layers: `raw_id` on the item, a `bareTodoId()` strip at the
      handler boundary, and type comments on both fields.
    - **`personalTodo:delete` now CASCADES to steps.** Nothing else would — no FK anywhere — so
      deleting a to-do would strand its steps locally AND in cloud permanently. Each orphan is
      enqueued for cloud deletion individually.
    - **`stepOwnerEmail()` refuses loudly.** `personal_todo_steps.user_email` is `NOT NULL`,
      unlike `personal_todos` which is user_id-keyed locally — so `cloudRowFor`'s trick (skip
      the cloud write, keep the local row) is **unavailable**: the LOCAL insert would violate
      the constraint. Resolved via the parent to-do up front, returning
      `{ok:false, error:'unresolvable owner'}` rather than letting SQLite throw.
    - **`toggle` flips in SQL** (`CASE WHEN checked=1 THEN 0 ELSE 1 END`) rather than
      read-modify-write — two fast clicks would otherwise both read the same value and write
      the same result, silently eating one toggle.
    - **NEW `StepRail` COMPONENT** (`components/StepRail.tsx`) — pure presentational over
      `{steps, labelMode, onToggle}`, no fetching, no backend assumption. **ONE component,
      three future data sources**: personal (now), off-card assigned (2.5), card checklists
      (after 4). FLIP slide (done steps collect left) via `getBoundingClientRect` + WAAPI, CSS
      width transition on the fill, `prefers-reduced-motion` honored as a **live `matchMedia`
      listener** (the prototype evaluates it once at module load, which is wrong for a renderer
      that runs for days).
    - **VISIBILITY RULE:** 0 steps ⇒ **no rail at all** (a step-less to-do renders exactly as
      it did before 3b); ≥1 step ⇒ **bar + dots always visible on the COLLAPSED card**, no
      expand needed; expanded ⇒ adds **only** the editing affordances (add-step input, per-step
      delete). **Board and meeting cards are unaffected.**
    - **TWO ANIMATION BUGS FIXED IN THE SAME SLICE:** the **double-hitch** (dropped
      refetch-on-toggle — it landed mid-animation and re-settled the rail; persistence never
      depended on it, and a **revert on `{ok:false}`** replaced it so a refused toggle can't
      diverge silently), and the **phantom replay on blur/focus** (the layout effect has no dep
      array and re-ran on focus renders where a hidden window reports different geometry — now
      gated on an **order signature** of `id:checked`, plus **zero-size rects are never
      recorded** since storing `0×0` would produce a bogus `dx` on return).
    - **OUT OF SCOPE, held:** card checklists (slice 4) and assigned steps (2.5).
  - **✅ SLICE 3a SHIPPED — the visible To-Do tab (`d43445d`, 2026-07-20, UNRELEASED).**
    `Todo.tsx` migrated onto `todos:list`: **ONE call plus client-side tab filtering**,
    replacing the old `getMyTasks` + `personalTodo.list` pair. Google meetings stay a
    **separate live per-calendar fetch** (online-only — the one source that cannot be assembled
    locally); dismissed items filtered.
    - **FIVE TABS — KC (superset) / Assigned to me / Assigned by me / Personal / All**,
      selected tab persisted per user. **KC deliberately EXCLUDES `assigned-by-me`:** KC
      answers *"what is on my plate"*, and delegated work is on someone else's — folding it in
      would inflate the list with items you are not doing. ⚠ Note how narrowly this holds: the
      superset is `source.startsWith('kc') || source === 'assigned'`, so only the **explicit
      equality** lets `assigned` in. Rename the source to `kc-assigned-by-me`, or loosen that
      arm to `startsWith('assigned')`, and **KC silently re-absorbs it**.
    - **CET URGENCY ENGINE (`utils/urgency.ts`)** — `Intl.DateTimeFormat('en-CA',
      {timeZone:'Europe/Berlin'})`. **A deadline must mean the same instant for the whole
      team**; off the local clock, "due today" would flip at a different moment for every user
      and a machine with a wrong timezone would mis-sort the whole list. **DST-safe by
      deferring to ICU — NO hand-rolled +1/+2**, which would be wrong for weeks a year. `en-CA`
      formats as `YYYY-MM-DD`, directly comparable to the date-only `due_date`. Day-diffs parse
      **both sides as UTC midnight** so the subtraction is a pure day count. The device clock is
      still the `now` input — a badly-wrong clock still misleads; a merely-different **timezone**
      no longer does.
    - **PROMOTION STRIP** — `pastdue` + `today` lift into a pinned strip on **every** tab and
      are **not** duplicated in the bands below; the rest band `tomorrow → d2 → d3 → later →
      none`. Per-tab **Completed** section, re-tick restores.
    - **`col-published` COUNTS AS DONE — implemented in MAIN (`todos.ts`), not the renderer.** A
      published card shipped, so no deadline applies. This **preserves** the old renderer rule
      it replaced; deriving `completed` from `completed_at` alone would have **silently
      resurrected every published card as an active deadline**.
    - **`TodoItem` gained `column_id`** (drives that rule) **and `area_of_analysis`** (drives
      the area colour dot). Parity kept: colour dot, `board_name`/due chips, dashed personal
      cards, offline guards — board actions now **visibly disabled** rather than silently inert.
    - **★ REFRESH-ON-CHANGE — `todoDataVersion`, NOT a second subscription. THIS AVOIDED A
      LANDMINE.** The preload teardown is
      `ipcRenderer.removeAllListeners('workspace:remoteChange')`, which is **CHANNEL-GLOBAL**:
      a competing `onRemoteChange` in `Todo.tsx` would have been **silently unsubscribed**
      whenever `WorkspaceContext` re-ran cleanup, and the tab would have stopped updating
      **with no error** — textbook silent-failure class. Instead `WorkspaceContext` gained a
      **`todoDataVersion` counter**, consumed by `Todo.tsx` via `useEffect`. **The app still has
      exactly ONE `workspace:remoteChange` subscription.**
      - **Bumped UNCONDITIONALLY on every push, whatever its scope — deliberately unlike
        `boardContentVersion`,** which is scoped to the open board. To-Do aggregates across
        **all visible boards**, so a change on a board that isn't open (a card assigned to you
        elsewhere, a `board_members` revoke arriving as scope `'list'`) still changes what it
        must show.
      - Also refetches on **window focus** and after local mutations, serialized through a
        promise chain.
    - **NO Step Rail** (3b) and **calendar view deferred**. **Both assigned tabs render
      purposeful empty states with 0 counts** — off-card only, empty until 2.5.
  - **✅ SLICE 1a SHIPPED — personal to-do cloud tables + translate-migration (`a46345b`,
    2026-07-19, UNRELEASED).** Three cloud tables — **`personal_todos`,
    `personal_todo_steps`, `todo_dismissed`** — all **owner-keyed by `user_email`**.
    - **WHY EMAIL, not `user_id`:** `local_users.id` is minted per-device with
      `crypto.randomUUID()` at first sign-in, so the same person has a **different id on each
      machine**. Email is the only cross-device-stable identity, and it is already what
      `board_members` / `member_permissions` / RLS use. The codebase had already reached this
      conclusion (`boards.ts:22`).
    - **Local:** added **`updated_at` + `position`** to `personal_todos` (guarded ALTERs;
      SQLite can't add a `CURRENT_TIMESTAMP` default, so nullable-then-backfill, `position`
      0-based by `created_at` **within each `user_id`**); created local `personal_todo_steps`.
      **Local stays `user_id`-keyed by design** — translation happens at the cloud boundary.
    - **One-time translate-backfill** (`cloud/personalTodosSeed.ts`): resolves local `user_id`
      → email via the **existing `resolveIdentity`**, upserts to cloud, and **skip-and-LOGS**
      unresolvable rows — never dropped, never reassigned to the admin, local rows never
      modified. Guarded by a `settings` flag set **only** on full success, so a failed run
      retries next launch.
    - **NOT admin-gated**, unlike `seedBoardsToCloud` — personal to-dos are owner-scoped, so
      every user's machine must upload its own rows. A cloud-emptiness guard would make the
      second user's device a silent no-op and strand their data.
    - **Handlers + renderer UNCHANGED** in 1a. SQL: **`sql/2026-07-19_personal_todos_cloud.sql`**
      (run by hand in Supabase). **Verified:** backfill **2 uploaded / 0 skipped**; cloud
      counts matched local.
  - **⚠ IDENTITY NOTE (found during 1a) — Dorian's personal to-dos were split across his TWO
    identities:** `dk@kantor-consulting.com` and `doriankantor@gmail.com`. (**"TWO admin
    identities" as originally written is SUPERSEDED** — only the gmail account is root; `dk@`
    is a TEAM MEMBER. See IDENTITY MODEL under Known issues.) **Consolidated to `dk@`** (the session identity the app resolves to). **This split is DORIAN-ONLY** —
    each researcher has a single identity. Recorded because it is exactly what made the
    underlying bug **root-invisible**: keying on `user_id` looks fine on the admin's
    coincidentally-stable `'local-admin'` id while **stranding every researcher's to-dos
    cross-device**. A root-only test would have passed.
  - **✅ SLICE 1b SHIPPED — local-first dual-write + sync queue, PERSONAL source only
    (`4001652`, 2026-07-19, UNRELEASED).**
    - **Model:** writes land **LOCAL FIRST** and succeed **offline**; the cloud push is
      **fired, not awaited**, after the local write. On offline or failure the op is queued in
      **`personal_sync_queue`** (durable, so it survives a quit). Handlers keep their exact
      signatures — **no new IPC channels**, no preload/`env.d.ts` change, no UI wait on the
      network.
    - **Drain** on the **`onReconnect` false→true edge** (`connection.ts:30` — the existing
      event, reused; no second detector) **and once on launch**. Idempotent upserts, in-flight
      guard, oldest-first replay; failures increment `attempts` + record `last_error` and stay
      queued. **LWW via `updated_at`**, now stamped on **every live write** (1a had only added
      + backfilled the column — live writes were still frozen at migration time).
    - **PER-SOURCE CONTRACT:** board/shared sources (`workspace_tasks`, `task_checklists`, …)
      stay **cloud-authoritative and offline-LOCKED**. Queueing a board write would let two
      members diverge with no merge story. The `SyncTable` union is a **three-member
      allowlist** — adding a board table can't happen by accident.
    - **Renderer 1b-fix:** removed the offline early-return from the **THREE personal
      handlers only** (`handleAddPersonal`, `handlePersonalComplete`, `handlePersonalDelete`);
      the **two board guards** (`handleComplete` / `handleUncomplete`, `Todo.tsx:202/214`)
      **stay**. `handlePersonalDelete` keeps its optimistic removal but **reconciles on
      failure** via `loadPersonalTodos()` — matching the card-revive pattern, which likewise
      mutates first and lets a refetch settle the truth rather than manually undoing.
    - **NO realtime for the personal tables — deliberate deferral, not an oversight.** They
      are publishable (1a); launch-drain + reconnect-drain cover single-owner cross-device
      convergence. **Consequence:** two devices open *simultaneously* won't see each other's
      edits until one relaunches or reconnects.
    - **Verified end-to-end:** online sync; offline create/complete queued (no error, app
      responsive); **reconnect drain cloud 2→4**; **quit-while-queued durable — launch drain
      1 ok, cloud 4→5**.
  - **✅ SLICE 1c-1 SHIPPED — cloud team roster + read channel (`4b9c0b3`, 2026-07-19,
    UNRELEASED).** Cloud **`team_members`** (email PK on the **@kantor-consulting.com WORK
    email**, `display_name`, `assignable`) + a local mirror + a **NEW `team:roster` channel**
    (cloud read → **UPSERT-only** mirror → serve the mirror on error → skip cloud when offline
    → never throw; the `cloud/tags.ts` two-tier shape).
    - **THE PATTERN — "ADD, DON'T REPOINT".** The brief originally proposed repointing
      `team:list` to serve the roster with **email as the `id`**. The study step found that
      would have been silently destructive: **nine account handlers** resolve against
      `local_users.id` (`team:remove`, `markActive`, `heartbeat`, `markApiKeySet`,
      `savePreferences`, `edit`, `setInitialPassword`, plus `boardMembers.add` and
      `infoPages.addOwner/removeOwner`), and `UPDATE … WHERE id=<email>` **matches zero rows
      and reports no error**. It would also have started a SECOND id/email split in
      `TeamCalendar`'s `attendees_json`. So the roster was **added alongside**: `team:list` and
      all nine handlers are **UNCHANGED**; `assignees_json` and `attendees_json` **untouched**.
      ★ **This is the SILENT-FAILURE lesson applied prospectively for once** — caught at the
      design step instead of after shipping.
    - **Consumers:** the **assignee picker** (filtered on `assignable`) and **@mention
      autocomplete**, both **JOINED to local accounts by email** — matched rows behave exactly
      as before, unmatched render **greyed/disabled** pending 1c-2. `WorkspaceContext.members`
      was deliberately NOT repointed (Dashboard and KanbanView resolve avatars from it by
      `local_users.id`); the roster is the NAME source, `members` stays the ID source until
      1c-2 collapses the two.
    - **Seed:** **8 people**, keyed on work email, run BY HAND in Supabase per the standing
      rule. **`mj.baez` excluded** per Dorian; the **gmail root account is NOT seeded** — root
      is infra, never an assignee.
    - **Verified:** all 8 roster names show in the picker **online AND offline** (mirror),
      greyed as expected pre-migration.
  - **✅ @MENTION DROPDOWN FIX SHIPPED — CLOSED, not an open gap (`fa5c9cd`, 2026-07-19,
    UNRELEASED).** Logged as a known gap in the 1c-1 commit message; **now fixed.** The menu
    used `bottom-full` (hardcoded upward) on a textarea sitting at the TOP of the comment
    column, so it projected past the panel edge and was **clipped by the `overflow-hidden`
    ancestors** on the column row and panel shell — the list was invisible. Flipping direction
    would only have traded one clip for another, so it is now **`createPortal` to
    `document.body` + `position:fixed`** from the textarea's `getBoundingClientRect()`:
    prefers-below, flips above only when below genuinely can't fit, clamped horizontally.
    **Capture-phase** scroll/resize listeners reposition it (the panel's scroll containers are
    ancestors whose scroll events don't bubble to `window`), cleaned up on close/unmount.
    - **Latent bug it exposed:** the menu had **NO outside-click close at all** — it simply
      stayed mounted, unnoticed because it was never visible. Added a `pointerdown`-capture
      close outside menu+textarea, before `mousedown` so item selection still fires.
    - **Pre-existing since `6b0f37b`**, unrelated to 1c-1's data change: `mentionResults` is
      `.slice(0, 5)`-capped both before and after, so 1c-1 did not change the list's size.
      Verified by `git log -L` on the positioning line. Renderer-only; the second dropdown in
      the same file was left alone and no shared helper was extracted.
  - **SPEC FILES: SAVED AND TRACKED (`5c1e20b`, 2026-07-19).** Previously chat-only uploads
    and absent from the tree; now committed as
    **`docs/TODO_OVERHAUL_PROMPT_1.md`** (from `TODO_OVERHAUL_PROMPT_1.md`),
    **`docs/TodoStepRail.jsx`** (from `TodoStepRail_3.jsx`) and
    **`docs/TodoStepRail.html`** (from `TodoStepRail_5.html`) — byte-identical to source,
    md5-verified after copy. Each was the newest of its family in `~/Downloads` and identical
    to its immediate predecessor (re-downloads, not newer revisions), so nothing was left
    behind. They sit outside both tsconfig `include` globs (`src/**`), so the prototype
    `.jsx` is **not** in the compile graph.
  - **PROVENANCE — RESOLVED (slice 0, 2026-07-19).** The summary above was originally
    transcribed second-hand from Dorian's description; **slice 0 read all three files in full
    and grounded them against real code**, so it is no longer an unverified claim. What slice
    0 found is below.
  - **SPEC vs REALITY — corrections from slice 0. Do not treat the spec as settled:**
    - **`calendar_events` is LOCAL-only with full CRUD**, not "Google sync, read-only" as Part
      A says (`db.ts:537`; zero cloud presence). Google events are a *third* category, fetched
      live and prefixed `g-`.
    - **"One record surfaced twice" is already TRUE for reads** — task deadlines are ephemeral
      renderer-side projections (`TeamCalendar.tsx:942`, id `'deadline-' + t.id`), so there is
      no drift to fix. But the projection lives in the **renderer** (fighting Part D's
      "aggregate in MAIN"), and **there is no write-back path at all**.
    - **The unified-Trash precedent normalizes in the RENDERER, not main** (`Trash.tsx:9/85`),
      with weak gating (contacts trash has none). `listTodos` in MAIN is still right, but it is
      **net-new architecture, not a port** — budget slice 2 accordingly.
    - **Identity is split:** `assignees_json` holds **user IDs**; all cloud auth is **email**.
      `board.assign` and `listTodos` must bridge the two namespaces in MAIN.
    - **There are NO semantic theme tokens** — `tailwind.config.js` has five `hub-*` brand
      hexes and nothing else; no accent/muted/border/foreground, no dark-safe red/amber. Part
      D's "drive all color from existing tokens" **requires creating that layer first**.
    - **Sub-step done flag is `checked`, not `done`**; `isRoot` is a **boolean field, not a
      function**; personal to-dos have no `starred` column (the prototype's star needs schema).
    - **`todo_dismissed` and `notifications` were missing from Part A entirely** — both
      local-only. The To-Do surface depended on **four** local-only tables, not one, so the
      "last thing pinning a local-only table in place" framing was wrong (the timing argument
      still holds; it was just four times larger). Two are now migrated (1a).
    - **⚠ `kc-meeting` READS GOOGLE CALENDAR LIVE — NOT local `calendar_events`
      (slice-2 diagnosis, 2026-07-20).** Part A says local; the To-Do page actually calls
      `userGoogle.getStatus` → `getCalendars` → `getCalendarEvents` per enabled calendar, over
      a today→+14d window, with ids prefixed `gcal-`. Local `calendar_events` is a **different
      dataset** that feeds TeamCalendar. **This is the one source that CANNOT be assembled
      locally — it is online-only**, so meetings stay a **renderer-side Google concern for
      slice 2** rather than joining the main-process aggregate.
    - **⚠ THERE IS NO CREATOR COLUMN AND NO `assigned_by`** — re-verified in slice 2's
      diagnosis, absent **both** locally (`db.ts:295`) and in cloud (`TASK_COLS`,
      `boards.ts:165`). Any spec'd behavior that routes a card to whoever created or assigned
      it is **unimplementable without a schema migration**. This is why kc-deadline is scoped
      to *assigned* dated cards rather than creator-scoped ones.
    - **REFERENCE PROTOTYPE — `TodoStepRail_6.html`** (tabs KC / Assigned / Personal / All,
      the KC-superset rule, the pinned directive, urgency promotion). It is the **behavior
      source for slices 2 and 3**, and carries the **same status as the earlier TodoStepRail
      files: a design reference, NOT production code.**
  - **⚠ `docs/TodoStepRail.jsx:8` cites a nonexistent `STEP_RAIL_IMPLEMENTATION_PROMPT.md`** —
    almost certainly an earlier name for `TODO_OVERHAUL_PROMPT_1.md` (the spec points back at
    the prototype, so the pair is mutually referential with one filename wrong). **Left
    unedited to keep the saved file faithful to what Dorian produced.** Fix the pointer during
    slice 0 if desired.
  - **STATUS:** foundation bug fixed (`cc6aedf`); **slices 0, 1 and 1c ALL DONE.** Personal
    to-dos are cloud-backed, offline-capable and cross-device (`a46345b` + `4001652`); the team
    roster is cloud and email-keyed (`4b9c0b3`); and assignment itself is email-keyed end to end
    (`d16b071` + `74150c7` + `863e5be`). **NEXT IS SLICE 2 — the `listTodos` aggregation layer
    in MAIN, now UNBLOCKED.** Read the SPEC vs REALITY corrections above before starting; slice 2
    is net-new architecture, not a Trash port.
  - **✅ THE 1c-2 ARC — SHIPPED. `assignees_json` device-id → work email, end to end
    (2026-07-20, UNRELEASED).** Split into three commits deliberately, so the irreversible step
    sat alone between two verified ones. **CROSS-DEVICE ASSIGNMENT NOW WORKS FOR THE FIRST
    TIME.** Scale was small — 4 tasks, 4 distinct ids, zero orphans — so the risk was never
    volume, it was correctness of the identity mapping.
    - **1c-2a — the REVERSIBLE half (`d16b071`).** Backup + local rewrite + a rehearsed
      rollback, no cloud. Backups are **separate local TABLES** (`assignees_backup`,
      `local_users_email_backup`), never columns — see the TASK_COLS finding below. Rewrote
      `local_users.email` (3 rows) and local `assignees_json` (4 tasks) in ONE transaction, with
      `INSERT OR IGNORE` backups so a re-run can't overwrite a true original. Rollback is a real
      IPC channel, not a documented SQL block — **a restore procedure that has only ever been
      run as hand-typed SQL is an untested restore procedure.** Proven by an OFFLINE round-trip
      on real data: migrate → verify → rollback → verify → re-run.
    - **1c-2b-① — the CLOUD rewrite, COMMIT-ONCE (`74150c7`).** Cloud backup table
      (`sql/2026-07-20_assignees_cloud_backup.sql`, run by hand) is a **hard precondition** —
      the routine refuses to run and names the missing task ids rather than proceeding. It lives
      in cloud, not on one machine, so rollback doesn't depend on which laptop is available.
      **Last reversible point:** once a second device syncs emails down, restoring cloud alone no
      longer restores the system.
    - **1c-2b-② — the FINALE (`863e5be`).** 11 matchers + 4 notification sites + every writer
      repointed, shipped as ONE atomic slice because a repointed matcher against an unrepointed
      writer makes new assignments instantly invisible. Shared helpers: **`main/assignees.ts`**
      (`assignedToSql` via `json_each` whole-element match, `isAssignedTo`, `parseAssignees`) and
      **`renderer/src/utils/assignees.ts`** (`isAssignedTo`, `sameIdentity`). The completions
      JOIN moved from `local_users ON lu.id` to `team_members ON LOWER(tm.email)`. The roster was
      lifted into `WorkspaceContext` so the picker, Kanban cards and profile panel share ONE
      fetch (Analytics renders outside that provider and fetches its own). **`assignee_ids` →
      `assignee_emails` across ~20 sites** — a field named `_ids` holding emails is how the next
      identity bug gets written. **Verified in-app: Weber, who has no `local_users` row on this
      machine, is assignable — the case that was impossible before the migration.**
  - **★ THE FIVE HARD-WON FINDINGS FROM 1c-2 — expensive to rediscover, cheap to reread:**
    - **`local_users.email` was STALE for 3 of the 4 assignees** (`daniel_lozano@`,
      `jdcubillos@`, `leonardocs@` vs the roster's `daniel.lozano@`, `jd.cubillos@`,
      `leonardo.carreno@`). `resolveIdentity` returns `local_users.email`, so migrating
      `assignees_json` WITHOUT also migrating that column would have **passed on Dorian's
      machine and broken for every researcher** — dk@'s address never changed. Exactly the
      1a shape: root-invisible because the admin's identity is coincidentally stable.
    - **THE MIRROR-INVERSION MECHANIC.** Local `workspace_tasks` is a MIRROR, not a source:
      `getTasks` → `syncTasksMirror` (`boards.ts:682`) DELETEs and re-INSERTs every active-board
      row from cloud. So a **local-only rewrite is TRANSIENT** — any online read clobbers it back
      — which is why 1c-2a was verified OFFLINE. **After the cloud rewrite the mechanic inverts**
      and the mirror starts *reinforcing* the migration. That inversion was the acceptance test
      for 1c-2b-①, not an afterthought.
    - **THE `TASK_COLS` CONSTRAINT.** Any backup COLUMN on `workspace_tasks` is destroyed by
      `syncTasksMirror`'s DELETE + re-INSERT over exactly `TASK_COLS` (`boards.ts:165`). Backups
      of a mirrored table must be **separate tables**. This reversed the initial column-based
      plan mid-slice.
    - **TWO SILENT FAILURES CAUGHT BY GREP, NOT BY `tsc`.** (a) The `assignee_emails` rename
      broke the cloud migration's own `updateTask(id, { assignee_ids })` call — the key no longer
      matched `updateTask`'s `'assignee_emails' in partial` check, so it would have stamped
      `updated_at`, written NO assignees, and **reported success**. (b) A blanket
      `userId` → `userEmail` rename clobbered an unrelated `cal-toggles-${userId}` localStorage
      key in `TeamCalendar`. **Both typechecked clean.** After any rename this size, sweep with
      grep for the OLD name and for the behaviour, not just for compiler errors.
    - **NO UNANCHORED `%email%` LIKE SURVIVES.** The old `assignees_json LIKE '%<id>%'` was
      survivable with UUIDs and is a live false-positive generator with emails — one address
      that is a prefix of another would silently match the wrong person. Every SQL matcher is now
      `EXISTS (SELECT 1 FROM json_each(col) WHERE LOWER(json_each.value) = LOWER(?))`, whole
      element only, case-insensitive on both sides.
  - **⚠ CARRIED FORWARD from 1c-2, unchanged:**
    - **`attendees_json` is STILL id-keyed** (`TeamCalendar`, 2 events). Deliberately out of
      scope — different shape (`[{id}]` objects, not bare strings) and it has a Google Calendar
      round-trip. Its own later slice. The two formats coexist safely; nothing reads one as the
      other.
    - **`notifications.user_id` is now MIXED-FORMAT** — emails on the assignee-driven paths,
      device ids on older rows and the `local-admin` fallback. Acceptable here, and it
      **re-confirms `notifications` → cloud as a slice-5 prerequisite**: a directive notification
      still never leaves the assigner's machine.
- **COMPOSE-SURFACE WRITES AND FEEDBACK (silent-failure cluster).** Four related issues in
  the Intelligence compose surface, found 2026-07-18. **All four compose paths
  (News/Social/Documents/Interviews) write through the SAME `insertSource`
  (`intel.ts:590`), which reports `{ok, error}` FAITHFULLY. The bugs are in CALLER
  DISCIPLINE, not the write layer** — don't go looking for a fix in `insertSource`.
  Ordered by HARM:
  1. **✅ DONE — SOCIAL DESTROYED TYPED CONTENT (was the worst; fixed in `c60c9c2`,
     2026-07-18, UNRELEASED).** `SocialTab.handleSubmit` did not read the save return at
     all, then cleared the form (`setForm({ ...EMPTY_FORM })`) **regardless of success** —
     and was `try`/`finally` with **no catch**. A failed save silently wiped user-authored
     content. **Fixed by mirroring `InterviewsTab.handleAdd`** (the one compose path that
     already got this right): capture the `addSocial` return,
     `if (!res.ok) { setFormError(...); return }` **BEFORE any reset** so the form survives
     on failure, add the previously-missing `catch`, and render a form-level error banner.
     **The banner string is verbatim `Could not save the post.`** — grep for THAT; the
     commit message paraphrased it as *"cannot save this post"*, which appears nowhere in
     the code. **Tested:** success path unchanged (form clears, post lands); an offline
     save shows the banner **and** preserves the typed content.
  2. **✅ DONE — UPLOAD HANDLER LIED ON EMPTY RESULTS (fixed in `edd7bd0`).**
     `intelligence:uploadDocument` returned `{ ok: true, results }` **unconditionally** —
     even when every file failed and `results` was `[]`. Per-file failures `continue`d after
     a **main-process** `console.warn` (invisible in DevTools), and the renderer branched on
     `result.ok`, a constant. **Now returns `{ ok: results.length > 0, results, errors }`**,
     each per-file failure pushing `{file, error}`. The **canceled** path is unchanged —
     cancel is not a failure. The catch derives the file label from `basename(filePath)`
     because `fileName` is scoped inside the `try` and is undefined on an early throw.
  3. **✅ DONE — NO `catch` IN `handleUpload` (fixed in `edd7bd0`).** The `try` had only a
     `finally`, so a rejected invoke became an **unhandled promise rejection with no UI
     state** while `setUploading(false)` still ran and the button looked normal — *that is
     what "nothing happened" looked like.* Now has a `catch`, reads `errors`, and renders a
     red banner in the upload bar. Cancel stays a **silent no-op**.
     Also in `edd7bd0`: **the offline gap** — Upload now gates on `!online` (Save/Send
     already did) with a `title` giving the disabled reason. A real missing guard, **not**
     the cause of the intermittent click failure.
     **⚠ CORRECTION TO THE ORIGINAL WRITE-UP:** this defect was first attributed to
     `handleUpload` ALONE. Diagnosis found **`SocialTab.handleSubmit` had it too** — Social
     carried **BOTH** defects (unchecked return **and** no catch), both fixed in `c60c9c2`.
  4. **✅ DONE — SAVED BADGE / `updateStatus` ON A PHANTOM ROW (fixed across `ae067da` +
     `7782116` + `bd8f07c`).** `updateStatus` returned `ok:true` for a row that **doesn't
     exist**: the read uses `.maybeSingle()` (returns `null`, **no error**) and **an UPDATE
     matching zero rows is not a PostgREST error**. So "Save" on a phantom card reported
     success **twice over** — and because the IPC handler routes on `res.ok`, a phantom
     **could** route into `info_page_sources` and pollute the learning loop.
     - **`ae067da` (main side):** guard right after the read —
       `if (!meta) return {ok:false, error:'source no longer exists'}` — **before** the
       approve-branch section derivation and **before either UPDATE**. The real-row path is
       unchanged. `env.d.ts`'s return type was widened (it had omitted `error`).
     - **`7782116` (three tabs):** badge flip gated on `res.ok` in **Social / Interviews /
       Documents** — three structurally identical copies. New per-card `statusError` map in
       each; `onApprove` still fires on failure.
     - **`bd8f07c` (News, the fourth and most exposed):** News ran **FOUR** unconditional
       effects — `logDecision`, the badge, an optimistic `statusCounts` adjust, and **the
       FADE that removes the card from the queue.** Because **`logDecision` runs BEFORE
       `res` is inspected**, the gate wraps **all four** in the `res.ok` branch rather than
       just the flip. `onApprove` stays **outside** the branch (it refreshes
       stats/unscored counts — exactly what a stale card needs; the toast self-guards on
       `undefined addedToPages`). A **new per-card `statusError`**, deliberately NOT `aiErr`
       (analyze/reconcile blank `aiErr` on entry, and it renders in the compose panel, which
       is hidden on a collapsed card).
       **`intelligence_decisions` is currently INERT** — nothing reads it; the Haiku gate
       consumer runs in **GitHub Actions and cannot read local SQLite** — so the
       `logDecision` gate is **correctness hygiene, not an active-harm fix. The FADE was the
       active-harm effect.**
     **⚠ THE COPY COUNT WAS WRONG:** first recorded as **two** tabs (Social + Documents).
     It is **FOUR** — Interviews and News have `handleStatus` too. All four are now gated.
  - **✅ CLUSTER CLOSED 2026-07-18 — all four issues, five commits (all UNRELEASED):**
    - ✅ **#1 Social form-loss — `c60c9c2`.**
    - ✅ **#4 main side — `ae067da`** (`updateStatus` phantom-row guard).
    - ✅ **#4 renderer, three tabs — `7782116`** (Social / Interviews / Documents).
    - ✅ **#4 News — `bd8f07c`** (badge + fade + counts + `logDecision`).
    - ✅ **#2 + #3 upload path — `edd7bd0`** (honest return, catch, banner, offline guard).
  - **THE UPLOAD-CLICK INVESTIGATION — RESOLVED AS INTERMITTENT / UNREPRODUCIBLE.**
    **⚠ DO NOT RE-OPEN THIS WITHOUT A FRESH REPRODUCTION.**
    - **THE OUTCOME (the probe was RUN).** A temporary `console.log` was added at the top of
      `handleUpload`, the **real button** was clicked, and **`handleUpload` FIRED with
      correct state** — `{online: true, projectId: 'board-info-latam', uploading: false}` —
      **and the dialog OPENED.** The failure **did not reproduce.** The probe was then
      removed (it is **not** in the tree).
    - **CONCLUSION.** The click **reaches the handler**; there is **no reproducible fixed
      cause**; the original *"nothing happened"* was **intermittent / one-off**.
      **`edd7bd0` does NOT prevent it — it makes any recurrence VISIBLE (red banner)
      instead of silent.** If it recurs, **the banner is the diagnostic signal we never
      had.**
    - The elimination trail below is kept **only** so the ruled-out theories are not
      re-derived:
    - **PROVEN — the handler WORKS.** Calling
      `window.api.intelligence.uploadDocument({ projectBoardId: 'board-info-latam' })`
      directly from DevTools **opened the file dialog** and the promise fulfilled with no
      error. So **the click→handler path is the problem, not the handler.**
    - **PROVEN — the button was ENABLED at failure time.** `console.table` of all buttons
      showed row 54 "Upload Documents" `disabled: false`.
    - **PROVEN — the project was validly selected.** localStorage
      `intel-selected-project` = `board-info-latam` (a real live board), **not `'all'`**.
    - **RULED OUT BY EVIDENCE — DO NOT RE-PURSUE:**
      - *"Scope was on All sources → `!project?.id` → button disabled"* — **FALSE**,
        localStorage showed a real board.
      - *"Button was disabled"* — **FALSE**, `disabled: false` confirmed.
      - *"Offline gate"* — **FALSE**. There is **no online guard on Upload** (re-confirmed
        by code read: none in `handleUpload`, none in the IPC handler, none before
        `showOpenDialog`), **and the failure happened online.**
    - **HONEST NOTE FOR THE RECORD.** This took **four diagnostic passes** in one evening,
      and **two confident "confirmed causes" were each refuted by the next screenshot** — a
      tired-debugging artifact, same family as the phantom-test lesson. The resolution was
      **not** a found cause; it was **accepting that there wasn't a reproducible one** and
      making the failure visible instead.
  - **✅ THE FAILURE BANNER IS PROVEN LIVE (not "untested" — that earlier note was wrong).**
    During offline testing, an upload started **in the connection-hysteresis window**
    (internet down, the `online` flag not yet flipped — 2-failure hysteresis) surfaced a red
    banner: **`Upload failed — <file>: insert failed: TypeError: fetch failed`**. Before
    `edd7bd0` that was **silent**. **That is the failure path proven end-to-end.**
    - **KNOWN EDGE (polish, NOT a bug).** An upload in that hysteresis window shows the
      **RAW network error** (`insert failed: TypeError: fetch failed`) rather than a
      friendly *"you appear to be offline"*. It is **correct and visible** — **string
      normalization is a later polish item.**
  - **ALSO NOTED IN PASSING:**
    - ✅ **Upload's "why am I disabled" feedback — DONE in `edd7bd0`** (`title` gives
      *"Select a project first"* / *"Unavailable while offline"*, mirroring Rescore).
    - ⬜ **`load()`'s bare `catch {}`** (`DocumentsTab` ~72) leaves a **stale list** on a
      failed refetch with no indication. **Still open.** Minor, same silent class.
- **RECONCILE MUST REACH THE STRUCTURED ANALYSIS + HUMAN-CHANGE PROVENANCE (design-first,
  vision slice).** Found 2026-07-18.
  - **THE BUG.** When a researcher writes reconcile notes instructing a change (e.g. *"the
    year is 2026, not 2024"*), the reconciled output updates the **PROSE** but **NOT the
    itemized structured analysis** (`key_facts[]` / `capabilities[]` in `analysis_json.ai`).
    The human instruction is **half-applied** — and the structured half is **where the named
    specifics live.**
  - **ROOT CAUSE (from the code history).** The **B1 structured extraction**
    (`capabilities[]` / `key_facts[]`) is **RELEVANCE-PASS ONLY** — the reconcile branch of
    `analyze.ts` was explicitly left unchanged (*"B1 is relevance-only"*). A later slice
    threaded **`priorAi` INTO the reconcile prompt** so reconcile **NARRATES FROM** the
    catalogue (`edaab46`) — but **reconcile has NO path to REWRITE the catalogue.** It
    **reads** the structured fields; it **cannot re-emit** them. So a human correction lands
    in prose and the itemized list keeps the wrong value. This is the locked principle
    ***"prose summarizes / structure catalogues"*** biting **from the other side**: the
    **authoritative half (structure) is exactly the half human edits can't currently reach.**
  - **TWO LINKED REQUIREMENTS:**
    1. **RECONCILE MUST RE-EMIT THE STRUCTURED FIELDS, applying human instructions.** The
       reconcile branch must output **updated `key_facts[]` / `capabilities[]`**, not just
       prose, and the reconciled structure must **persist to `analysis_json`** (today
       reconcile writes only prose/notes). When the researcher says *"change the year,"*
       `key_facts[]` updates too.
    2. **HUMAN-DIRECTED CHANGES ARE RECORDED AND SHOWN AS PROVENANCE.** **Chosen model:
       OPTION B — a CHANGE-LOG, not a per-field flag.** Record the change **event** (AI
       proposed X → human corrected to Y, per researcher, timestamp) and render it as a
       **human-attributed diff / "per human update" marking.**
       **WHY B OVER A (decided, not open):** *the correction IS the information* —
       *"changed from 2024 to 2026, per researcher"* carries the human judgment that
       human-in-the-loop analysis exists to capture; a bare `source:'human'` flag **throws
       away what it replaced.** B also gives an **audit trail** (defensible for a
       political-risk / defense consultancy) and aligns with the existing
       `analysis_json.ai` vs `.human` separation. **A is simpler to build and render but
       expresses less; B was chosen deliberately** because this feature is **load-bearing to
       the human-update thesis.**
  - **WHY THIS MATTERS (Dorian's words).** Human updates are **"the whole point"** — a
    researcher exercising judgment over the AI **is the core value proposition.** If a
    corrected fact is **indistinguishable from an AI-generated one, the next reader can't
    tell what's been vetted.**
  - **OPEN DESIGN QUESTIONS — for the vision conversation. This is DESIGN-FIRST, NOT a quick
    fix:**
    1. **Where does the change-log live?** A new field in `analysis_json` (e.g.
       `analysis_json.human_changes[]`), or a **separate table**? (`analysis_json` keeps it
       with the row; a table gives cleaner history.)
    2. **What does a change record hold?** `{field, path, ai_value, human_value,
       instruction?, by, at}`? **How to key it to a specific `key_facts[]` /
       `capabilities[]` entry — which have NO stable id today?**
    3. **Does a change survive a later re-Analyze?** Re-running relevance would **regenerate
       the `ai` fields** — must human changes be **re-applied / preserved**, or **flagged as
       stale**? ***(This is the hard one.)***
    4. **Render.** Diff style over the itemized list; *"per human update"* marking. Does it
       show on the Info Pages **`PipelineSourceCard`** too, or **only the intel card**?
    5. **Prompt.** How does reconcile know **which structured entries the human instruction
       targets**, and emit **ONLY the intended change** rather than re-deriving the whole
       catalogue — **which could drift the specifics, the exact failure *"prose summarizes /
       structure catalogues"* was created to prevent?**
  - **STATUS:** design-first vision slice. Touches the **`analyze.ts` reconcile branch**
    (re-emit structure), the **data model** (change-log), **persistence**, and **render**.
    **Connects to the analytical-frameworks work** (both are about analysis quality) —
    **consider sequencing them together.**

### Standing issues

- **Analytical frameworks were NEVER authored.** `analytical_framework` in `board_config`
  does not exist yet — every "Analyze with AI" across all four types currently runs
  against **KEYWORDS + BOARD NAME** as an interim stand-in. This is a **QUALITY CEILING on
  the whole intel product**, not a missing feature. Deferred by Dorian until the intel
  process is complete (needs real design).
- **Only Contested Skies has news-pull architecture.** Hollow Border, Immigration Undone,
  The Stated Order remain grayed out (Phase 2 unbuilt). **"Everyone does intel" currently
  means Contested Skies only.**
- **Info-page CONTENT is still local + per-machine.** After B0 the board *rows* are
  cloud, but every `info_page_*` table (items, sources, commits, published, changes,
  chat, owners) and `intelligence_sources` are still **local SQLite** keyed by page
  id. Hollow Border / Stated Order (cloud-only, no local content) render empty by
  design. Phase B1/B2+ migrates these; until then, page content doesn't sync across
  machines.
- **`info_page_owners` is id-keyed and local** — cannot yet be compared/joined with
  the email-keyed cloud `board_members`. B1's re-key to email is the unblock for
  "project heads."
- **One redundant refetch on revive.** A single explicit `refreshTasks()` is
  deliberately kept as the *guaranteed* reconcile, because the realtime
  `reloadOpenBoard` echo isn't guaranteed to fire (dev/offline). When connected,
  both run — harmless but redundant.
- **"Restore all" doesn't restore cloud boards.** `window.api.trash.restoreAll()`
  is a local-SQLite bulk restore and never undeletes cloud boards, so trashed
  boards shown in the unified Trash aren't recovered by it. Pre-existing.
- **Read-only panel reads live context lists.** The archived-card panel's
  stage/area/label controls read `columns`/`areas`/`labels` from the *live*
  workspace context, not the archived board's overrides — an archived board with a
  custom stage whose id isn't in the live columns shows a blank (disabled) stage
  dropdown.
- **Latent type errors.** `tsc --noEmit` reports ~57 web + 8 node **pre-existing**
  errors (33 in `TaskDetailPanel.tsx`, mostly `selectedTask is possibly null`; plus
  `seed.ts`, `CommitReviewTab`, `WorkspaceContext.createTask`, an `ipc/index.ts:48`
  WebSocket type, etc.). There is **no typecheck script** — the build uses esbuild,
  which strips types without checking. None of the recent work added new errors.

## Locked design decisions (Intelligence + Info Pages restructure)

**These are LOCKED** — decided in prior design sessions and cited by number throughout this
doc and the backlog. Do not relitigate them in an implementation slice; if one needs to
change, that's a vision conversation, and this list is what gets amended.

1. **Unified item model.** Every collection method (News / Social / Documents / Interviews)
   produces the SAME kind of item: **content + AI analysis (a proposal) + optional
   researcher layer** (rich-text notes + tag/relevance overrides). **AI proposes; researcher
   input is always OPTIONAL.** Notes and overrides are nullable and **never
   validation-gated** — commit never requires a note.
2. **Human-first, AI-on-demand.** AI **never auto-runs on capture.** Human input FIRST →
   explicit **"Analyze with AI"** → AI appears in a **SEPARATE box** (suggestions, never
   overwrites) → optional **"Reconcile"** merges human + AI into an editable version.
   *(This is the pattern any "AI suggests" feature must follow — see the cross-source
   linking backlog entry, whose AI slice is explicitly built on decision #2.)*
3. **News UI.** Card list with an **elongating footer**: empty cards stay slim, click to
   grow into notes + overrides. The human relevance override is stored in
   **`analysis_json.human.relevance`**, **NOT `relevance_score`** — the gate/rescore pass
   would clobber the latter.
4. **Social.** Primary path = **paste link + AI summarize**. If the link is unreadable, the
   **hand-fill form opens automatically**. Hand-written entry is always available as an
   explicit option.
5. **Interviews.** **Per-highlight annotations** — each highlighted span gets its own
   interpretation + tags, reusing the news-article tag vocabulary. Deferred to its own slice
   (see "Interview span annotation" in the backlog).
6. **Documents "your notes".** A **full rich-text editor (TipTap)**, not a textarea. An
   explicit **"Reconcile with my notes"** triggers project-aware re-analysis.
7. **Data-gathering framework panel.** **READ-ONLY in-app** (collapsed summary / expandable
   full architecture). Edits only via **Claude Code by admin**. Live-bound to the actual
   query config.
8. **Commit/approve pipeline (Slice 3 model).** **Approve = route** (one action). Each card
   carries a **project picker defaulting to the top dropdown's selection**. Approve packages
   content + AI + notes into the target project's **`info_page_sources` (stage='new')**.
   Routed items **leave the intel queue but persist**; **move-back-to-intel = DELETE the
   pointer + flip intel `status='unreviewed'`**.
9. **Info Pages pipeline stage order.** **New sources → Analysis & design → Publish → Latest
   update notes → Sources.** The final *"here's exactly what will change"* is a **gate ON the
   Publish button, not a separate stage.** Publishing pushes to the site AND **auto-writes an
   update note.**
10. **Info Pages Claude-analysis stage.** **Claude SUGGESTS placement; the researcher
    CONFIRMS/overrides** via a feedback box. *(This is the stage the cross-source linking
    backlog entry feeds — links are context for these placement decisions.)*
11. **Permissions — two tiers, one invariant.** **Project Members** (`board_members`,
    per-project) = the **Intel side** (review / approve / add / commit). **Project Heads**
    (`info_page_owners`, an admin-selected subset) = the **publication side** (move to
    analysis, publish). **Head-implies-member invariant.** **Root only** assigns heads.
12. **Standardize on `info_page_sources`** (`new` → `review` → `committed`) as the per-page
    source model. Older `info_page_items` / `intelligence_source` rows are **legacy**.
13. **B0.6 form.** The in-app **"+Add/Edit Info Page"** edits **hosting fields only** (name,
    repo, live_url, file). **Keywords / collection config are reserved for
    admin-via-Claude-Code.**

**Also locked, documented separately (not one of the numbered thirteen):** **pre-route
editing** — compose items must be EDITABLE UNTIL ROUTED, and once routed you MOVE BACK TO
INTEL to edit. Full statement + the unverified plumbing hypothesis are under **Known issues
→ Pre-route editing (locked, unbuilt)**.

## Gotchas

- **Info-page boards are cloud `workspace_boards` rows** (`board_type='info-page'`)
  now, not local-only. The board archive/trash/delete/reorder machinery applies to
  them for free — but their **content tables are still local** (see Known issues).
  App-created projects get **UUID ids**; only the 4 seeds use readable
  `board-info-*` slugs (content keys on the id either way).
- **Cloud schema is applied by hand.** `supabase/migrations/` holds only the `cs_*`
  pipeline; the runtime cloud tables (`workspace_boards`, `board_members`, etc.) were
  created ad-hoc in the Supabase SQL editor (project ref `iatcafrpkpvyaekoxuao`).
  Forward discipline: run the SQL in the editor, then commit a dated file under
  `sql/`. There is no migration runner and no Supabase MCP wired in.
- **Universal builds clobber `better-sqlite3`.** After `npm run release`
  (`electron-builder --mac --universal`), the native module is left in a state the
  dev Electron can't `dlopen` ("slice is not valid mach-o file"). Run
  `npm run rebuild` before the next `npm run dev`.
- **MAIN-PROCESS CODE DOES NOT HOT-RELOAD.** HMR refreshes the RENDERER only. Any
  change under `src/main/**` needs a full `npm run dev` restart to rebuild
  `out/main`. **Testing a main change against a stale build produces a CONVINCING
  FALSE NEGATIVE**: the old handler runs, returns ok, the UI updates optimistically,
  nothing errors — the new code simply never executed. This cost an hour chasing a
  phantom during the tags migration. If a main-process change "isn't working",
  check `out/main`'s mtime before debugging the code.
- **Never run `npm run dev` while a release is packaging** — both write to `out/`
  and you can corrupt the DMG mid-build.
- **Two apps share one local DB.** A running *installed* production app and a dev
  build both open the same SQLite file; an old installed app can undo cleanups /
  behave on old code. Quit the installed app when testing DB-level changes.
- **Release tag race:** push commits+tags *before* `npm run release` (electron-builder
  creates the GitHub release/tag). The v2.0.20 release hit this; v2.0.21 avoided it.
- **THREE `GH_TOKEN` sources shadow each other — `npm run release` can silently publish
  with a STALE token.** The `release` script resolves `${GH_TOKEN:-<.env fallback>}`, so an
  already-exported `GH_TOKEN` **WINS over `.env`**. `~/.zshrc:4` AND `~/.zprofile:1` both
  actively `export` a stale token — so running `npm run release` from Dorian's own terminal
  would publish with the OLD token and **silently ignore any `.env` edit**. v2.3.0 only used
  the updated `.env` token because **Claude Code's Bash env has `GH_TOKEN` unset**, so the
  `.env` fallback fired (verified by fingerprint: `.env` `a71da25c` vs stale login
  `237aaad5`). The SAME variable is also read by the **app at runtime** for `publishToRepo`
  (`ipc:3118`, `ipc:3320-3321`) — same name, different execution context. **FIX (Dorian's
  own — dotfiles are out of scope for agents): delete the `export GH_TOKEN=` lines from
  `~/.zshrc:4` and `~/.zprofile:1` so `.env` is the single source.**

## Working agreements

- `PROJECT_SUMMARY.txt` is the living, copy-paste-ready overview — keep the header
  (version / commit count / line count) and changelog current every session.
- The publish workflow lives in `CLAUDE.md`: update summary → commit → `npm version
  patch` → `npm run release` → `git push && git push --tags` (push before release).
- The canonical working copy is `~/newsroom-pm`. The old iCloud copy is
  stale/deprecated — don't work from it.
