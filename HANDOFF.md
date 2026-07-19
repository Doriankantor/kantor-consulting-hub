# Handoff — Kantor Consulting Hub

_Last updated: 2026-07-18 · **v2.3.0 RELEASED** (published 2026-07-17, tag `v2.3.0`, version-bump commit `a4b161e`). **Code HEAD `2d76b9a` — the `visibleBoardIds` NON-ROOT NO-JOIN is now FIXED (2026-07-18), closing the FOUNDATION the whole access-control tier rests on: the non-root path read `board_members` by email with no join to `workspace_boards`, and `board_members` rows SURVIVE a soft-delete, so a since-deleted board's id stayed visible forever and the 0a-2/0a-3/0a-4 gates (which trust that set DIRECTLY) kept serving and mutating its content. `2d76b9a` is UNRELEASED — the first commit of the next release; the installed app is 2.3.0 and does NOT contain it.** ★ **METHODOLOGY LESSON OF THE SESSION — THE PHANTOM TEST: the first attempt to verify this fix produced a false PASS that everyone believed, over-determined by THREE stacked silent failures (the document never persisted, the soft-delete never landed, and the fix was already compiled into the running build). For a SECURITY test, confirm EVERY precondition in the authoritative store BEFORE trusting the observed result — a result that matches expectation proves nothing if the preconditions were never verified. See the dedicated lesson section.** **The ENTIRE ACCESS-CONTROL GAP (finding 1) IS CLOSED END-TO-END AND SHIPPED: 0a-1 (`8eae348`, compose stamps a project), 0a-1b (`2e22178`, pipeline writer stamps a project), 0a-2 (`a5d4b20`, the intel READ gate), 0a-3 (`46be18e`, the `info_page_*` READ tier), and 0a-4 (`26ee18c`, the `info_page_*` WRITE surface — ~20 mutation handlers gated across three axes: M=membership, A=canApprove, R=root) are all DONE. Reads AND writes are now membership-scoped. v2.3.0 IS NOW RELEASED — the whole tier ships to researchers (they self-update off the ungated 2.2.0); the next step is 0b (realtime health). Also shipped: a pipeline NULL-writer bug fix (part of `2e22178`), the aba6b91 scroll-jump regression fix (`923f334`), and the `infoPages:list` `deleted=0` bug fix (part of `46be18e`).** `origin/main` up to date, tree clean. **The unreleased-since-v2.2.0 list is now EMPTY** — `8eae348`/`2e22178`/`923f334`/`a5d4b20`/`8662b68`/`46be18e`/`f80b17d`/`26ee18c`/`49b44fd` all SHIPPED in v2.3.0 (installed builds self-update from 2.2.0). **UNRELEASED since v2.3.0: `2d76b9a`** (the non-root no-join fix) — installed app is 2.3.0 and does NOT contain it. **8 assets on GitHub Releases** — mac universal DMG/zip, win NSIS x64 exe, blockmaps, and BOTH auto-update manifests (`latest-mac.yml`/`latest.yml`), so installed builds self-update. (v2.2.0 was published 2026-07-16, tag `v2.2.0`.) v2.2.0 ships the whole post-v2.1.0 batch: the **cosmetic sweep** (`7f36605`/`ff2bd9a`/`0425f19`), the **`known_tags` cloud migration** (`0865948`, the template), the **OFFLINE ARC** (`504bf1f` mirror + `23de14d` connection state/banner/lockout/reconnect), the **`intelligence_sources` cloud migration** (`cfdd4b1` — the big one, 242 rows byte-verified), and **realtime on `intelligence_sources` + resubscribe-on-reconnect** (`aba6b91`). **Same-day cross-device test + follow-up diagnostics surfaced an ACCESS-CONTROL GAP in the intel reads (+4 more findings) — finding 1 is now CLOSED end-to-end (reads via 0a-2/0a-3, writes via 0a-4); still open from the original five: finding 3 = 0b (realtime health), finding 4 (downstream of 3), finding 5 (updater unconditional-success print) — see the ⛔ block below.** **Milestone (locked): complete intel process by end of July; publishing moves to August.**_

## ▶ Start here — resume point for the next session

**Where we are: v2.3.0 RELEASED** (published 2026-07-17; version-bump commit `a4b161e`,
tag `v2.3.0` pushed BEFORE the release build — no tag race). HEAD = `a4b161e`,
`origin/main` up to date, working tree clean apart from these two docs. **8 assets live on
GitHub Releases** — mac universal DMG + zip, win NSIS x64 exe, blockmaps, and BOTH
auto-update manifests (`latest-mac.yml` + `latest.yml`) — so every installed build (incl.
the Mac mini) self-updates off the ungated 2.2.0. **v2.3.0 ships the COMPLETE
access-control tier (0a-1 / 0a-1b / 0a-2 / 0a-3 / 0a-4), closing finding 1 end-to-end,
plus the `infoPages:list` `deleted=0` bug fix and the scroll-jump fix.** The
unreleased-since-v2.2.0 list is now EMPTY. Next is 0b (realtime health), whose field
verification this release unblocks (researchers now self-update onto the gated build).

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

v2.2.0 was cross-device-tested the day of release: dk@kantor-consulting.com (full-admin,
NOT root) in a second macOS account with its own local DB/mirror. The test surfaced five
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

**RULE: never write a bare `catch {}`. Bind the error and log it. A fallback must not
swallow the signal that something failed. A success message must be derived from the
outcome, never hardcoded after it. A placeholder that flows into the AI as content is
worse than a visible failure. And — instance seven — a SAVED badge must be derived from a
CONFIRMED WRITE, never from the local optimistic state.**

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
- **TO-DO TEAM BUILDOUT (ready to build — EXISTING design, not new scope).** This is the
  To-Do overhaul already designed in prior sessions; Dorian confirmed it is the same plan.
  Recorded here so it isn't lost in the backlog. **The point:** make To-Do a real
  cross-team assignment system so work can be assigned and tracked across the six
  researchers — Dorian's stated reason: *"materially increase the quality of work."*
  - **Scope (as previously designed):** `personal_todos` → cloud; a personal **steps**
    table; `board_members.can_assign` column; `assigned_by` field; **completion
    notification** firing to the assigner.
  - **FIRST SLICE (natural entry point — it's a LIVE bug): the To-Do write-through bug.**
    `todo:complete`/`uncomplete`/`dismiss` write `column_id`/`completed_at` to **LOCAL
    `workspace_tasks` only**, so a completion **REVERTS on the next successful `getTasks`**
    (the mirror overwrites it from cloud — see the TASKS-mirror note in `boards.ts`). Fix =
    route those writes through cloud (`updateTask`/archive). Small, and it **unblocks
    trusting To-Do at all.**
  - **STATUS:** ready to build (existing design, **no vision conversation needed**). Start
    with the write-through bug.
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
  2. **UPLOAD HANDLER LIES ON EMPTY RESULTS (code-confirmed).**
     `intelligence:uploadDocument` (`ipc:2997`) returns `{ ok: true, results }`
     **unconditionally** — even when every file failed and `results` is `[]`. Per-file
     failures `continue` after a **main-process** `console.warn` (invisible in DevTools).
     The renderer (`DocumentsTab` `handleUpload` ~122) branches on `result.ok` — a
     constant — and never inspects `results`. **Fix:** return
     `{ ok: results.length > 0, results, errors }` and have the renderer surface `errors`.
     **NOTE: this cannot cause the data-loss first feared**, because the file dialog gates
     the flow (see the investigation below) — but it is still a real lie.
  3. **NO `catch` IN `handleUpload`.** The `try` has only a `finally`, so a rejected invoke
     becomes an **unhandled promise rejection with no UI state** — another silent sink.
     (`setUploading(false)` still runs, so the button looks normal.)
     **⚠ CORRECTION TO THE ORIGINAL WRITE-UP:** this defect was first attributed to
     `handleUpload` ALONE. Diagnosis found **`SocialTab.handleSubmit` had it too** — so
     Social carried **BOTH** defects (unchecked return **and** no catch). Both of Social's
     are fixed in `c60c9c2`; **`handleUpload`'s is still open.**
  4. **SAVED BADGE / `updateStatus` ON A PHANTOM ROW (independent — SPLIT to its own tiny
     slice).** `handleStatus` flips the badge **unconditionally** without reading `res.ok`.
     And `updateStatus` returns `ok:true` for a row that **doesn't exist**: the read uses
     `.maybeSingle()` (returns `null`, **no error**) and **an UPDATE matching zero rows is
     not a PostgREST error** (`intel.ts` ~294 / ~314 — the UPDATE has no `.select()`). So
     "Save" on a phantom card reports success **twice over**. **Fix:** gate the badge on
     `res.ok`; make `updateStatus` treat a null row as an error and `.select()` to confirm
     rows affected.
     **⚠ THIS ONE GREW:** `handleStatus` is duplicated **VERBATIM in BOTH `SocialTab`
     (~255) and `DocumentsTab` (~144)** — fixing one tab **leaves the other live.** Both,
     or neither.
  - **REMAINING WORK (updated 2026-07-18 after slice 1):**
    - ✅ **#1 Social form-loss — DONE (`c60c9c2`).**
    - ⬜ **#2 + #3 — THE UPLOAD SLICE.** `uploadDocument` (`ipc` ~2997) still returns
      `{ok:true}` on empty results; `handleUpload` (`DocumentsTab` ~122) is still
      `try`/`finally` with no catch. **PAIR THIS WITH THE UPLOAD-CLICK 5-MIN DIAGNOSIS**
      (below) — same dev session, same neighborhood of code, and the click mystery is
      **still UNRESOLVED** (enabled button + valid project + working handler, click
      swallowed, cause unknown).
    - ⬜ **#4 SAVED-badge / `updateStatus` phantom row.** Separate slice, **different
      layer** (`intel.ts`, not the compose renderers) and a different test path. Now spans
      **two tabs** — see the correction above.
  - **THE UPLOAD-CLICK INVESTIGATION — cause UNRESOLVED, two theories RULED OUT.**
    Symptom: clicked **"Upload Documents"** with a real project selected and **nothing
    happened** — the dialog never opened. Investigated live 2026-07-18. The elimination
    trail is recorded so it is **not re-derived**:
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
    - **STILL UNKNOWN:** what swallowed the click between an **enabled button** and a
      **working handler**.
    - **NEXT SESSION START POINT (fast).** Put a `console.log` at the very top of
      `handleUpload` (`DocumentsTab` ~122), click the **real button**, and see whether it
      fires **at all**. If it does **not** fire, the `onClick` isn't wired to the click
      being made (overlay? a second element? event not reaching it). If it **does** fire
      but the invoke never resolves, trace from there. **Est. 5 min with fresh eyes.**
    - **HONEST NOTE FOR THE RECORD.** This took **four diagnostic passes** in one evening,
      and **two confident "confirmed causes" were each refuted by the next screenshot** — a
      tired-debugging artifact, same family as the phantom-test lesson. It is **newly
      found, non-critical, not a regression, and nothing in v2.3.0 depends on it.** It was
      **parked deliberately to resume with a clear head, not abandoned.**
  - **ALSO NOTED IN PASSING (not new work):**
    - **Upload button has NO "why am I disabled" feedback** — only `disabled:opacity-50`.
      The Rescore button (`Intelligence/index.tsx` ~154) has
      `title={online ? '' : 'Unavailable while offline'}`; Upload should get the same
      treatment (e.g. *"Select a project first"*). Small UX fix — **fold into the cluster
      slice.**
    - **`load()`'s bare `catch {}`** (`DocumentsTab` ~72) leaves a **stale list** on a
      failed refetch with no indication. Minor, same silent class.
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
