# Handoff — Kantor Consulting Hub

_Last updated: 2026-07-17 · **v2.2.0 RELEASED** (published 2026-07-16, tag `v2.2.0`). **Last code HEAD `a5d4b20` after today's (2026-07-17) work (this docs commit sits on top) — the intel access gate's READ TIER IS CLOSED: 0a-1 (`8eae348`, compose stamps a project), 0a-1b (`2e22178`, pipeline writer stamps a project), and 0a-2 (`a5d4b20`, the gate query itself — `getSources` + the five counts are membership-scoped, cloud + mirror, root sees all, empty-set short-circuits) are all DONE. The immediate next slice is 0a-3 (the `info_page_*` pageId-visibility read tier). Also today: a pipeline NULL-writer bug found+fixed (part of `2e22178`), and the aba6b91 scroll-jump regression fixed (`923f334`).** `origin/main` up to date, tree clean. `a5d4b20` joins `8eae348`/`2e22178`/`923f334` as **UNRELEASED on main** (installed app is 2.2.0). **8 assets on GitHub Releases** — mac universal DMG/zip, win NSIS x64 exe, blockmaps, and BOTH auto-update manifests (`latest-mac.yml`/`latest.yml`), so installed builds self-update. v2.2.0 ships the whole post-v2.1.0 batch: the **cosmetic sweep** (`7f36605`/`ff2bd9a`/`0425f19`), the **`known_tags` cloud migration** (`0865948`, the template), the **OFFLINE ARC** (`504bf1f` mirror + `23de14d` connection state/banner/lockout/reconnect), the **`intelligence_sources` cloud migration** (`cfdd4b1` — the big one, 242 rows byte-verified), and **realtime on `intelligence_sources` + resubscribe-on-reconnect** (`aba6b91`). **Same-day cross-device test + follow-up diagnostics surfaced an ACCESS-CONTROL GAP in the intel reads (+4 more findings) — finding 1 is now PARTIALLY CLOSED (intel read tier gated by 0a-2; `info_page_*` reads + realtime health remain open) — see the ⛔ block below; the gate remains top priority, ahead of `info_page_sources`.** **Milestone (locked): complete intel process by end of July; publishing moves to August.**_

## ▶ Start here — resume point for the next session

**Where we are: v2.2.0 RELEASED** (published 2026-07-16; version-bump commit `3dc945a`,
tag `v2.2.0` pushed BEFORE the release build — no tag race). HEAD = `3dc945a`,
`origin/main` up to date, working tree clean apart from these two docs. 8 assets live on
GitHub Releases including both auto-update manifests, so every installed build (incl. the
Mac mini) self-updates to 2.2.0 — which is what unlocks the pending cross-device
verification. v2.2.0 shipped the 8 commits since v2.1.0. What they are, and **why they
took the shape they did**:

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

1. **ACCESS-CONTROL GAP — intel reads had NO membership gate. → PARTIALLY CLOSED
   (2026-07-17): the intel READ TIER is gated (0a-2, `a5d4b20`); the `info_page_*`
   read tier (0a-3) and realtime health (0b) remain open.** See the **RESOLUTION**
   subsection at the end of this finding.
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
   ***STILL OPEN under this finding:*** the `info_page_*` read tier (0a-3) and realtime
   health (0b). See NEXT UP.

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

**F. NEW OPEN QUESTION — the picker DOES filter, client-side (for 0a-3).** The 0a-2
diagnosis stated "the picker isn't even a filter — no tab threads the selected project into
`getSources`." Observed during testing: root sees **2** socials with a project selected and
**3** with "all projects" — so something filters the tab AFTER the fetch. `SocialTab.tsx:121`
calls `getSources({type:'social'})` with no project param, so it's NOT in the query; the
client-side filters are `SocialTab.tsx:344` and `NewsTab.tsx:549` (see finding 1's
correction). **Why it matters:** a client-side project filter and a server-side gate can
produce the SAME number for DIFFERENT reasons — this nearly invalidated 0a-2's test. Correct
the "picker is not a filter" claim wherever it's asserted, as part of 0a-3.

**G. NEW BUG — `infoPages:list` ignores `deleted` (assign to 0a-3).** `ipc/index.ts:3039`
filters `archived=0` but NOT `deleted=0`, so **soft-deleted info pages still populate the
list and its pickers** (observed: a `deleted=1` board named "blahblah" came back).
`visibleBoardIds` does `.eq('deleted', 0)`; `infoPages:list` is the outlier. Sibling of
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

**I. STILL UNTESTED (fold into 0a-3 testing):**
- **The offline mirror gate** — `readMirrorSources`' own `IN (?,…)` never ran; every reading
  was online. Exercise it offline.
- **`getStatusCounts`' three-way `head:true` fan-out** — all articles are `board-info-latam`,
  so root and dk's News counts are identical either way. To exercise it, compose an article
  under a SECOND project (e.g. Immigration Undone) first.

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
0. **⛔ THE INTEL ACCESS GATE — IN PROGRESS (read tier CLOSED).** Split into 0a-1 / 0a-1b /
   0a-2 (all DONE) / 0a-3 / 0b:
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
   - **0a-3 — NEXT (the `info_page_*` pageId-visibility read tier):** gate the four pipeline
     reads (`getSourcePipeline`/`getAnalysisSources`/`getSourceItems`/`getSourceChanges`) +
     `infoPages:list` + `getSourceStats` + `getSourcePipelineCounts` + `addMatchingSources`
     on **pageId visibility** (the SAME question as the intel gate — the id namespace is
     unified, see ▲ block item E). ALSO in 0a-3: the **`infoPages:list` `deleted=0` bug**
     (▲ item G) and the **client-side-picker-filter question** (▲ item F). **⚠ 0a-2 does NOT
     retract the historical leak:** already-leaked rows sit in non-root LOCAL mirrors, and
     the four info-page JOINs read the mirror table with RAW SQL that never passes through
     the gated `readMirrorSources` — so leaked rows stay readable via Info Pages until 0a-3.
     The read sync is upsert-only and can never remove them, so **a mirror purge may need its
     own step.**
   - **0b — the membership-propagation fix (was finding 3):** now scoped as a REALTIME
     HEALTH-DETECTION gap (detect + recover from channel death independent of the HTTP
     online flag), NOT a schema fix — the publication + REPLICA IDENTITY FULL theories are
     both refuted (see finding 3).

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
4. **Pre-route editing** (locked decision — see the locked-decisions section below).
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

**FIVE instances now, same shape: a failure swallowed with no logging (or a fallback that
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

**RULE: never write a bare `catch {}`. Bind the error and log it. A fallback must not
swallow the signal that something failed. A success message must be derived from the
outcome, never hardcoded after it. A placeholder that flows into the AI as content is
worse than a visible failure.**

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
- **UNRELEASED on `main` since v2.2.0 (2026-07-17, all pushed):** `8eae348` (0a-1 —
  compose stamps `project_board_id`), `2e22178` (0a-1b — pipeline writer stamps it + the
  hand-run backfill record), `923f334` (scroll-jump fix — background refetch), `a5d4b20`
  (0a-2 — intel read-tier membership gate). All renderer/main code; **no new release cut
  yet** (the installed app is still 2.2.0). Next code slice is **0a-3 — the `info_page_*`
  pageId-visibility read tier** (see "Start here" / NEXT UP item 0).
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

## Working agreements

- `PROJECT_SUMMARY.txt` is the living, copy-paste-ready overview — keep the header
  (version / commit count / line count) and changelog current every session.
- The publish workflow lives in `CLAUDE.md`: update summary → commit → `npm version
  patch` → `npm run release` → `git push && git push --tags` (push before release).
- The canonical working copy is `~/newsroom-pm`. The old iCloud copy is
  stale/deprecated — don't work from it.
