# Handoff — Kantor Consulting Hub

_Last updated: 2026-07-11 · v2.0.21_

## v2.0.21 — keyword matcher word-boundary fix

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

## Where things stand

v2.0.19 shipped to GitHub Releases on Jul 7. Four feature/fix commits landed
afterwards and were **not** in those binaries — v2.0.20 is the release that
carries them.

| Commit | Work |
|---|---|
| `16c053b` | Board reordering — admin-only sidebar drag-and-drop |
| `7cf8938` | Visualizer Block 2 — open archived cards read-only |
| `9e2f91c` | Fix: restoring a board never reloaded its cards |
| `d9b70d9` | Card-revive hardening — in-flight guard + optimistic insert |

## What each change did

### Board reordering (`16c053b`)
Mirrors the existing `reorderColumns` path 1:1 across four layers:
`reorderBoards(boardIds, actingUserId)` in `cloud/boards.ts` (admin-gated via
`resolveActor` → `isRoot`, writes dense `0..n-1` positions) → `boards:reorder`
IPC → `window.api.boards.reorder` → `WorkspaceContext.reorderBoards` (optimistic
`setBoards` reindex via a `byId` map, then persist).

`Sidebar.tsx` gained `SortableBoardItem` (dnd-kit, `verticalListSortingStrategy`,
`closestCenter`, 5px `PointerSensor` activation). Drag listeners live on a
separate hover-revealed grip handle so click-to-open still works. Admin-only —
members render the original plain list. Info Pages (`board_type='info-page'`)
never appear in `visibleBoards`, so they're structurally excluded from reorder.

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

- **One redundant refetch on revive.** A single explicit `refreshTasks()` is
  deliberately kept as the *guaranteed* reconcile, because the realtime
  `reloadOpenBoard` echo isn't guaranteed to fire (dev/offline). When connected,
  both run — harmless but redundant. Collapsing to one cleanly means guarding
  `reloadOpenBoard` against an in-flight explicit refresh in the context; that
  touches the realtime path, so it was left out.
- **"Restore all" doesn't restore cloud boards.** `window.api.trash.restoreAll()`
  is a local-SQLite bulk restore and never undeletes cloud boards, so trashed
  boards shown in the unified Trash aren't recovered by it. Pre-existing.
- **Read-only panel reads live context lists.** The archived-card panel's
  stage/area/label controls read `columns`/`areas`/`labels` from the *live*
  workspace context, not the archived board's overrides. They're disabled and
  display the stored value, but an archived board with a custom stage whose id
  isn't in the live columns shows a blank (disabled) stage dropdown.
- **Latent type errors.** `npx tsc --noEmit -p tsconfig.web.json` reports ~55
  pre-existing errors (33 in `TaskDetailPanel.tsx`, mostly `selectedTask is
  possibly null`; plus `seed.ts`, `WorkspaceContext.createTask`, etc.). There is
  **no typecheck script** — the build uses esbuild, which strips types without
  checking. None of the recent work added new errors.
- **Dead code:** `Intelligence/PublishQueue.tsx` and the
  `intelligence:pushToContestedSkies` IPC handler are preserved but unreachable
  since the Phase-7 pipeline change.

## Gotchas

- **Universal builds clobber `better-sqlite3`.** After `npm run release`
  (`electron-builder --mac --universal`), the native module is left in a state the
  dev Electron can't `dlopen` ("slice is not valid mach-o file"). Run
  `npm run rebuild` before the next `npm run dev`.
- **Never run `npm run dev` while a release is packaging** — both write to `out/`
  and you can corrupt the DMG mid-build.
- **Main-process changes need a dev restart.** HMR only refreshes the renderer, so
  new IPC handlers / cloud functions won't exist until you relaunch `npm run dev`.
- **Info Pages are `workspace_boards` rows** (`board_type='info-page'`), not a
  separate entity. Board archive/trash/delete machinery applies to them for free —
  and any board-schema change touches Info Pages too.

## Working agreements

- `PROJECT_SUMMARY.txt` is the living, copy-paste-ready overview — keep the header
  (version / commit count / line count) and changelog current every session.
- The publish workflow lives in `CLAUDE.md`: update summary → commit → `npm version
  patch` → `npm run release` → `git push && git push --tags`.
- The canonical working copy is `~/newsroom-pm`. The old iCloud copy is
  stale/deprecated — don't work from it.
