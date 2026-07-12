# Handoff — Kantor Consulting Hub

_Last updated: 2026-07-11 · v2.0.21 released; Phase B B0 committed, B1 built + uncommitted_

## ▶ Start here — resume point for the next session

**Where we are:** Phase B (cloud bridge for Info Pages). B0 is done + committed
(HEAD = `a0a67b3`). **B1 + two follow-on fixes are BUILT but UNCOMMITTED** in the
working tree — do not assume they're in git yet. Both bugs found while testing B1 are
now FIXED (uncommitted). **Immediate next step: TEST in-app, then commit it all.**

**Uncommitted working-tree changes right now (B1 + 2 fixes + docs):**
- `src/main/cloud/boards.ts` — 4 new cloud owner fns (`addOwner`, `removeOwner`,
  `isOwner`, `getOwners`), email-keyed, mirror `board_members`, root-gated.
- `src/main/ipc/index.ts` — repointed `infoPages:getOwners/addOwner/removeOwner/isOwner`
  to the cloud fns (local table/handlers left in place, unused).
- `src/renderer/src/env.d.ts` — owner types updated (`getOwners` → `user_email` shape;
  `addOwner` `by?` optional; `isOwner` `userId?`).
- `src/renderer/src/pages/Settings.tsx` — three things stacked here:
  1. **B1** — Board Access matrix root-only **"Head"** toggle on info-page columns
     (writes cloud `info_page_owners`, refetches).
  2. **Member-checkmark fix (DONE)** — membership was keyed by `m.id` (UUID) against a
     Set of emails, so green checks vanished on reload. Now the member Set, render,
     single toggle, and grant/revoke-all ALL key on `member.email.toLowerCase()`
     (mirrors how heads are keyed). IPC still passes `m.id`.
  3. **"Head implies member" invariant (DONE)** — three cascade points:
     `toggleHead` ON auto-adds membership before `addOwner`; `toggleBoardAccess`
     removing membership also `removeOwner`s (info-page only); `revokeAllBoards` also
     removes heads. `grantAllBoards` deliberately does NOT auto-add heads (head is a
     deliberate assignment). Invariant: after any op, nobody is a head of a board
     they're not a member of.
- Builds clean (tsc: 0 new errors; node 8 / web 57 pre-existing baselines).

**Immediate next task — TEST, then commit.** Relaunch (`npm run rebuild && npm run
dev`; owner IPC is a main-process change → needs a real restart), then in Settings →
Board Access verify: (a) member checkmarks persist across navigate-away-and-back;
(b) turning a non-member into a Head adds the green member check too; (c) unchecking
membership clears the Head; (d) Revoke-all clears both. Then **commit B1 + both fixes
together**, and continue B2+ (migrate remaining `info_page_*` + `intelligence_sources`
content tables to cloud). See "Phase B → Next" below.

**Then, eventually:** cut a **v2.0.22** release so installed apps get everything
committed since the v2.0.21 tag (member-add hang fix + B0.3/B0.5/B0.6 + B1).

## Release status at a glance

- **v2.0.21 — RELEASED** to GitHub Releases. Contains the keyword-matcher
  word-boundary fix (and the earlier v2.0.20 stack: board reorder, read-only
  visualizer, board-restore + card-revive fixes, PublishQueue dead-code removal,
  Restore-all route-by-source fix).
- **Committed AFTER the v2.0.21 tag, NOT yet in any released build** (needs a
  **v2.0.22** release to reach installed apps): the board member-add UI hang fix
  (`81e9eea`), and Phase-B **B0.3** (`a1ca0d4`), **B0.5** (`f9a5db4`), **B0.6**
  (`a0a67b3`).
- **Uncommitted in the working tree:** **B1** (cloud info-page owners + Settings heads
  toggle) + the **member-checkmark render fix** + the **"head implies member"
  invariant** — all built, tested-pending, not committed. See "Start here" above.

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

### B1 — built, UNCOMMITTED (identity spine)

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
- **Two follow-on fixes stacked on B1 (also uncommitted):** the member-checkmark
  render fix (membership keyed by email) and the "head implies member" invariant
  (three cascade points in `toggleHead`/`toggleBoardAccess`/`revokeAllBoards`). See
  "Start here" for both.
- **Not committed** — pending your in-app test.

### Next

- **Do first** — TEST B1 + the two fixes in-app, then commit them together.
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
- **Never run `npm run dev` while a release is packaging** — both write to `out/`
  and you can corrupt the DMG mid-build.
- **Two apps share one local DB.** A running *installed* production app and a dev
  build both open the same SQLite file; an old installed app can undo cleanups /
  behave on old code. Quit the installed app when testing DB-level changes.
- **Main-process changes need a dev restart.** HMR only refreshes the renderer, so
  new IPC handlers / cloud functions won't exist until you relaunch `npm run dev`.
- **Release tag race:** push commits+tags *before* `npm run release` (electron-builder
  creates the GitHub release/tag). The v2.0.20 release hit this; v2.0.21 avoided it.

## Working agreements

- `PROJECT_SUMMARY.txt` is the living, copy-paste-ready overview — keep the header
  (version / commit count / line count) and changelog current every session.
- The publish workflow lives in `CLAUDE.md`: update summary → commit → `npm version
  patch` → `npm run release` → `git push && git push --tags` (push before release).
- The canonical working copy is `~/newsroom-pm`. The old iCloud copy is
  stale/deprecated — don't work from it.
