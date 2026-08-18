# Handoff — Kantor Consulting Hub

_Last updated: 2026-08-16 · **v2.3.0 RELEASED** (published 2026-07-17, tag `v2.3.0`, version-bump commit `a4b161e`). **Code HEAD `1ea04a7`, `origin/main` up to date, tree clean. UNRELEASED since v2.3.0: TWENTY-EIGHT code commits — `2d76b9a`, `b211638`, the compose cluster (`c60c9c2`, `ae067da`, `7782116`, `bd8f07c`, `edd7bd0`), `cc6aedf`, and the To-Do/team arc: `a46345b` (1a), `4001652` (1b), `4b9c0b3` (1c-1 — cloud team roster), `fa5c9cd` (@mention dropdown fix), `d16b071` (1c-2a — reversible half), `74150c7` (1c-2b-① — cloud rewrite, commit-once), `863e5be` (1c-2b-② — the finale), `065f6ce` (slice 2 — the `listTodos` aggregation layer), `d43445d` (slice 3a — the visible To-Do tab), `4c240bd` (slice 3b — the personal Step Rail), `7d5a38a` (slice A-1 — detail-panel color/starred columns + setters), `f1fb6df` (slice A-2 — the personal detail panel UI), `9c049e3` (slice A-3 — drag-to-reorder personal steps), `4bc236d` (slice B — personal-to-do notes), `1795418` (slice C-recurring-1 — completion-anchored recurrence backend), `76bafb0` (slice C-recurring-2 — recurrence picker UI + row chip), `a6f82d7` (slice C-recurring-3 — missed-occurrence tracking), `9376ba7` (chore — remove orphaned personalTodo:list channel) and `f918e42` (OFF-WORK / leave-window — per-member future-only leave window in a new cloud `off_work` table + local mirror; the missed-evaluator reads the acting user's window and skips stamping misses for boundaries inside it; Team page "on leave" pill + self-service picker + "End leave"; notification-drop DEFERRED) and `1ea04a7` (DATE-PICKER — native picker fixes + native unification + recurrence-due-date gate). The installed app is 2.3.0 and contains NONE of them.** ★ **DATE-PICKER SLICE — SHIPPED (`1ea04a7`).** Three bundled fixes plus a unification: native `<input type=date/time>` now open on clicking the field body via `onClick→showPicker()` + `[color-scheme:dark]` for glyph visibility (root cause was Chromium only opening the picker from the tiny edge glyph, a behavior quirk not a bug); the To-Do panel's one-off custom `DatePopover` was REPLACED with a native `<input type=date>` so ALL date entry is native (its calendar-grid helpers deleted; `usePopoverDismiss`/`PILL_CLASS`/`TimePopover` kept — still used by the recurrence + time controls); native OS positioning auto-flips so the off-work-at-bottom picker never clips (no custom overflow logic); and RECURRENCE is now GATED ON A DUE DATE (the panel `RecurrencePopover` is disabled+greyed with a "set a due date first" hint when the to-do has no `due_date`), preventing the recurrence-without-due zombie state at the source (the one entry point — the quick-add row has no recurrence control). ★ **SLICE 1c IS COMPLETE — CROSS-DEVICE ASSIGNMENT WORKS FOR THE FIRST TIME (2026-07-20).** `assignees_json` held device-local `local_users.id` UUIDs that resolved on exactly one machine; it now holds stable work emails, and every read, write and notification site matches on email. See the **1c-2 ARC** entry under the To-Do overhaul for the four commits and the five hard-won findings. ★ **IDENTITY MODEL CORRECTED THIS SESSION — `dk@kantor-consulting.com` is a TEAM MEMBER, NOT root; ROOT is `doriankantor@gmail.com`/`local-admin`. Older entries below that call dk@ "full-admin" predate this and are superseded — see the IDENTITY MODEL block under Known issues.** (Historical — **code HEAD was `2d76b9a` on 2026-07-18 — the `visibleBoardIds` NON-ROOT NO-JOIN is now FIXED (2026-07-18), closing the FOUNDATION the whole access-control tier rests on: the non-root path read `board_members` by email with no join to `workspace_boards`, and `board_members` rows SURVIVE a soft-delete, so a since-deleted board's id stayed visible forever and the 0a-2/0a-3/0a-4 gates (which trust that set DIRECTLY) kept serving and mutating its content. `2d76b9a` is UNRELEASED — the first commit of the next release; the installed app is 2.3.0 and does NOT contain it.**) ★ **METHODOLOGY LESSON OF THE SESSION — THE PHANTOM TEST: the first attempt to verify this fix produced a false PASS that everyone believed, over-determined by THREE stacked silent failures (the document never persisted, the soft-delete never landed, and the fix was already compiled into the running build). For a SECURITY test, confirm EVERY precondition in the authoritative store BEFORE trusting the observed result — a result that matches expectation proves nothing if the preconditions were never verified. See the dedicated lesson section.** **The ENTIRE ACCESS-CONTROL GAP (finding 1) IS CLOSED END-TO-END AND SHIPPED: 0a-1 (`8eae348`, compose stamps a project), 0a-1b (`2e22178`, pipeline writer stamps a project), 0a-2 (`a5d4b20`, the intel READ gate), 0a-3 (`46be18e`, the `info_page_*` READ tier), and 0a-4 (`26ee18c`, the `info_page_*` WRITE surface — ~20 mutation handlers gated across three axes: M=membership, A=canApprove, R=root) are all DONE. Reads AND writes are now membership-scoped. v2.3.0 IS NOW RELEASED — the whole tier ships to researchers (they self-update off the ungated 2.2.0); the next step is 0b (realtime health). Also shipped: a pipeline NULL-writer bug fix (part of `2e22178`), the aba6b91 scroll-jump regression fix (`923f334`), and the `infoPages:list` `deleted=0` bug fix (part of `46be18e`).** `origin/main` up to date, tree clean. **The unreleased-since-v2.2.0 list is now EMPTY** — `8eae348`/`2e22178`/`923f334`/`a5d4b20`/`8662b68`/`46be18e`/`f80b17d`/`26ee18c`/`49b44fd` all SHIPPED in v2.3.0 (installed builds self-update from 2.2.0). **UNRELEASED since v2.3.0: TWENTY-EIGHT code commits** (listed at the top of this block) — installed app is 2.3.0 and does NOT contain them. **8 assets on GitHub Releases** — mac universal DMG/zip, win NSIS x64 exe, blockmaps, and BOTH auto-update manifests (`latest-mac.yml`/`latest.yml`), so installed builds self-update. (v2.2.0 was published 2026-07-16, tag `v2.2.0`.) v2.2.0 ships the whole post-v2.1.0 batch: the **cosmetic sweep** (`7f36605`/`ff2bd9a`/`0425f19`), the **`known_tags` cloud migration** (`0865948`, the template), the **OFFLINE ARC** (`504bf1f` mirror + `23de14d` connection state/banner/lockout/reconnect), the **`intelligence_sources` cloud migration** (`cfdd4b1` — the big one, 242 rows byte-verified), and **realtime on `intelligence_sources` + resubscribe-on-reconnect** (`aba6b91`). **Same-day cross-device test + follow-up diagnostics surfaced an ACCESS-CONTROL GAP in the intel reads (+4 more findings) — finding 1 is now CLOSED end-to-end (reads via 0a-2/0a-3, writes via 0a-4); still open from the original five: finding 3 = 0b (realtime health), finding 4 (downstream of 3), finding 5 (updater unconditional-success print) — see the ⛔ block below.** **Milestone (locked): complete intel process by end of July; publishing moves to August.** ★ **HEADER BROUGHT CURRENT 2026-07-23 (late) — this line's "v2.3.0 RELEASED / UNRELEASED since v2.3.0" framing above is SUPERSEDED: v2.4.0 IS RELEASED (published 2026-07-23, tag `v2.4.0`, version-bump `97846c3`) but is UNINSTALLABLE ON macOS — a fresh install is deleted on launch, `spctl` reports "notarization indicates this code has been revoked"; the build is unsigned by config (`notarize: false`, `hardenedRuntime: false`) and SIGNING IS DEFERRED TO LAUNCH (Apple Developer Program $99/yr + Developer ID cert). Windows deferred too but still RUNS (SmartScreen warning only). **UNRELEASED since v2.4.0: THIRTEEN commits** — `80032f4` (dead PUSH-TO-INFO-PAGE stat removed), `e05e8a2` (sidebar badge refresh), `9bf124c` (Relevance/Date sort toggle), `c2e7543` (Board Access relocated to Team), `782b779` (permission writes surface failures), **`720dbb8` (N-1 — notifications identity unified: email is now the canonical recipient key)**, **`607ef70` (attachmentsCloud `CLOUD_ADMIN_EMAIL` import fix — node tsc baseline 8 -> 5)**, **`2773ba2` (N-1 backfill log guard — predicate unchanged)**, plus docs `859b2cf`/`3d0acc3`/`4bb7ca1`/`72a82d7`/**`eda60e2`**. The installed app is 2.4.0 (where it installs at all) and contains NONE of them.** ==> 2026-08-07 (later): the DOWNSTREAM PUBLICATION ARC has advanced far past the v2.4.0 line above (P0 seed through P4a, including the full incidents arc + the P4a-2b accept flow + the Fix 1 event_date tuning + P4c-1 card-proposal generation). Code HEAD is now `6fe6f45`, tree clean (untracked scratchpads only: info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scripts/ai-bakeoff.mjs). Newest UNRELEASED commits since `d16d5fe` (the incidents Slice 4 docs commit): `d31d8b9` (P4a-2b-1 -- publication_changes cloud table), `6037998` (P4a-2b-2 -- accept flow: acceptProposal/keepProposal writer + Head-gated IPC + Accept/Keep UI), `de1234a` (docs -- P4a-2b complete), `a0404a4` (Fix 1 -- incident event_date resolves relative dates via publish-date anchor, publish-date fallback), `96740fb` (docs -- P4a-2b done / Fix 1 shipped / Fix 2 deferred / B-structured backlogged), and `6fe6f45` (P4c-1 -- card-proposal generation + store: new 'card' analyze task + proposed_cards[] slot) plus the P4c-1 docs commits. These are additional to the v2.4.0 backlog and remain UNRELEASED. ==> 2026-08-08: **P4c-1-redux + P4c-2a DONE (`d047475`).** Code HEAD is now `d047475`, tree clean (five untracked scratch items: info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). `d047475` (whole-source coordinated card generation -- one 'cards_whole' pass assigns each figure a home section + geography and fans out to the per-cell store, killing cross-section spray; REGIONAL always offered as a home; + P4c-2a read-only proposed-cards render in Pre-Commit Review + card-only cell rail flagging) is added to the UNRELEASED-since-v2.4.0 backlog; the P4c-1 docs commits `8243d04`/`ddc51fe` also landed. **Critical this session (see "Start here"): the geography rule (rule 6) is BUILT but INERT -- the routing layer collapses ALL geography to REGIONAL, so country cells are structurally impossible today; the corrected COUNTRY-FIRST geography model + the unified change-ledger spine are captured below and are the design north star for the next major arc.** ==> 2026-08-08 (later): **P4c-2b DONE (`b72be1a`) -- THE CARD ACCEPT ARC IS COMPLETE END TO END.** Built on the two 2b-i commits already in the tree (`350cd90` SQL card-cols -- nullable card_id/card_headline/card_detail on publication_changes; `ba26426` per-card UUID minted per (card x cell) in fanOutCards). `b72be1a` (2b-ii+iii) adds the acceptCard/dismissCard writers, setCardHandled per-card handled-state (never touches narrative status), getCellCards + a review-local eviction picker, and the Add/Dismiss UI with terminal states -- plus two bug fixes it carries: rail-jump-to-Systems via a per-source landedForRef guard on background reloads, and light-mode contrast on the Dismiss button + PROPOSED CARDS label. All three commits added to the UNRELEASED-since-v2.4.0 backlog; **Code HEAD now `b72be1a`**, tree clean (four untracked scratchpads only). Three new guardrails + the mirror-staleness / no-undo open items are captured below. NEXT: the GEOGRAPHY ARC (country-default model). See "Start here" for the arc detail and the current resume pointer. ==> 2026-08-15: Code HEAD now `06942ba` (PHASE A of the unified-SourceCard arc COMPLETE -- S5/S6/S7 cross-type mounts on Social/Documents/Interviews + the B1/B2 confidence-correctness slices; then SLICE 0 restored the lost unified-card DESIGN artifacts to version control -- the approved mockup + model spec re-homed under docs/, dangling outputs/ pointers repointed). `06942ba` is the latest EXISTING commit; the Slice-0 spec-trim + pointer-fix + this closing HANDOFF note are being committed on top of it. `origin/main` up to date, tree clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-16: Code HEAD now b52e66a (SLICE 1 of the unified-SourceCard redesign -- the boxed-zone re-skin: SourceCard restructured into title-surface + three tinted zones + collapsible Review & Annotate footer, pure read-only, verified in-app on all four intel tabs). origin/main up to date, tree clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-16 (later): Code HEAD now b74fee1 (SLICE 2a -- removed the ActorChips .slice(0,20) write-path truncation cap in dedupe(); cloud check confirmed MAX actors = 15, zero rows at/over 20, so the fix is purely preventive, no data ever clipped). SLICE 2b decisions are LOCKED and ready to build (data-driven actor grouping by the real `type` field, mentioned-only overflow, additive `editable` prop, TagPicker portal anchoring, usePopoverDismiss lifted to a shared hook). origin/main up to date, tree clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-16 (latest): Code HEAD now 07a1ee7 (SLICE 2b -- overflow "...+N" grouped popovers, 7 files: new shared usePopoverDismiss hook + OverflowPopover component + actorGroups helper; data-driven 5-group actor grouping, mentioned-only geo overflow, additive `editable` prop, TagPicker portal anchoring; verified in-app on News editable + read-only tabs). One accepted deviation: the add control sits beside the pill, not inside the popover (preserve-verbatim). NEXT = SLICE 3 (click-to-override conf/rel pills). origin/main up to date, tree clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-16 (Slice 3): Code HEAD now 0530dd6 (SLICE 3 -- click-to-override CONFIDENCE pill on SourceCard: new ConfidencePill component + additive onConfidenceChange? prop threaded to the existing handleConfidence -> updateConfidence writer; renderer-only, 3 files, no new writer/IPC/schema; interactivity gated purely on handler presence; verified in-app). Also learned this session what a 'Kantor Framework' source IS (reference/provenance anchors, filtered out of News, no live pill exposure). NEXT = SLICE 3b (relevance override pill -- FOLD model, provenance-preserving; writer setHumanRelevance already exists). origin/main up to date, tree clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-17 (Slice 3b): Code HEAD now 8e54b1b (SLICE 3b -- relevance override fold-pill with a POPOVER PICKER: new RelevancePill component folds the human High/Med/Low category in place of the AI REL n badge when core.humanRel is set, marked as a human override (indigo family + "H" marker + "Researcher override - AI scored REL n" tooltip); picker sets any level in one click and clears in one click (choose(null)) with no intermediate writes; reuses the Slice-2b popover infra; wires to the existing setHumanRelevance via handleHumanRelevance; NEVER writes relevance_score; renderer-only, 3 files, verified in-app). The unified-card visual rollout is now complete except Slice 4. NEXT = B (legacy footer cleanup -- retire both NewsTab footer selects), THEN Slice 4 (completeness meter). origin/main up to date, tree clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-17 (B + Routing rename): Code HEAD now 38203c4. B DONE (6090b2c -- retired the redundant legacy footer confidence + relevance selects in NewsTab; card pills own both edits; dropped the orphaned humanRel local; handlers retained; renderer-only, net -35 lines). ROUTING RENAME DONE (38203c4 -- the SourceCard Slice-1 footer shell relabeled "Review and annotate" -> "Routing" to end the label collision with NewsTab's human-layer footer, which keeps that name; pencil icon -> arrow). The card visual redesign now has only Slice 4 left. NEXT = SLICE 4 (completeness meter, GATED on a read-only approve-gate audit first). DECIDED SEQUENCE: Slice 4 -> footer-layout redesign (design-first) -> card redesign DONE -> pivot to the PUBLICATION PIPELINE (ARC II, geography/country-default). Separable arcs (S5b, A2, Phase B) stay deferred, after the pipeline. origin/main up to date, tree clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-17 (Slice 4 gate design + image feature banked): DOCS-ONLY. Code HEAD unchanged at 71f3ef2. The approve-gate audit ran (read-only) and Slice 4 was reframed: NEXT is now SLICE 4 - ROUTABILITY GATE + completeness meter (the real News approve gate is thin - project + topic client-side, cloud writer enforces nothing; DECISION: tighten into a real GATE 1 of six checks - content/AI/tags/confidence-confirmed/geography-confirmed/incident-confirmed - the meter mirrors it; sections are Gate 2 at New Sources, later). The crux for the Slice-4 diagnose: whether geography + incident already persist a human-confirm signal distinct from the value, or a tiny confirm-write sub-slice is needed first. Also banked on the horizon: IMAGE ATTACHMENTS (add-image on a source + clickable indicator on the Contested Skies monitor; ~3-5 slices; deferred to ARC II because the display half rides in content.json). origin/main up to date, tree clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-17 (Slice 4a DONE + 4b split): Code HEAD now 3b1fe17 (Slice 4a - geography_confirmed implicit-confirm wiring on the countries edit path + SourceCore surfacings hasContent/confidenceOverride; cloud-verified), origin/main up to date. Slice 4b (meter + gate) is split into 4b-1 (the 6-dot RoutabilityMeter + canRoute single-source-of-truth + content-dot fix [checks the REAL article body via notesText(content).length>40, NOT the GDELT snippet] + click flyout; FIVE checks live, incident dot DIM) and 4b-2 (INCIDENT Yes/No route-gate control - see NEW BACKLOG below the NEXT block). Two backlog items banked this session: 4b-2 and SNIPPET-NOT-UPDATED-BY-AI. The 4b-1 change is BUILT and under review in the working tree (RoutabilityMeter.tsx + canRoute.ts new; SourceCard.tsx + NewsTab.tsx + sourceCore.ts modified) - NOT yet committed; tree otherwise clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-17 (4b-1b diagnosed -> BLOCKED on S5b, docs-only): Code HEAD now 7a2f401. 4b-1 SHIPPED as b1238ba (routability meter on News: 5 dots live + incident dim + click flyout + type-aware content check) and banked as 7a2f401 - this supersedes the "NOT yet committed" status in the note above. 4b-1b (extend the meter to social/document/interview) is NOT a clean uniform build: the geography editor (GeographyChips/updateCountries) + the confidence pill exist ONLY on NewsTab, so geography_confirmed/confidence_override can never be set on social/document/interview (their cards render those zones DISPLAY-ONLY) - the geography + confidence dots would be permanently DIM, the meter un-completable and the gate unsatisfiable on 3 of 4 types. ROOT CAUSE: editable geo/actors/confidence on non-News types is the deferred S5b write-path arc (new write paths + freeform->structured migration + SourceCore change); the card VISUAL redesign is done but the EDITING was never built uniformly. DECISION (Dorian): PULL S5b FORWARD ahead of the publication pipeline - build editable geo/actors/confidence on ALL types, THEN finish 4b-1b's cross-type gating ("finishing the cards" now includes S5b). NEXT = S5b SCOPING DIAGNOSE (read-only; S5b carries a LIVE-DATA freeform->structured migration = highest-stakes class, diagnose exhaustively first, build fresh). The scroll-dismiss half of 4b-1b is independent of S5b and can still ship on its own. origin/main up to date, tree clean apart from the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs). ==> 2026-08-18 (docs-only HANDOFF refresh; RESUME HERE block consolidated): Code HEAD 2c3ca5c (last CODE commit b1238ba / Slice 4b-1). The tree now carries UNCOMMITTED S5b-1 edits across FIVE renderer files (src/renderer/src/components/source-card/ConfidencePill.tsx, src/renderer/src/components/source-card/SourceCard.tsx, src/renderer/src/pages/Intelligence/SocialTab.tsx, src/renderer/src/pages/Intelligence/DocumentsTab.tsx, src/renderer/src/pages/Intelligence/InterviewsTab.tsx) -- a build attempt that SKIPPED the STEP-0 review gate; edits are INTENTIONALLY NOT DISCARDED, left in the tree pending a read-only diagnosis next session (keep-and-finish vs discard-and-rebuild -- see the refreshed RESUME HERE block, item 1). Plus the five known untracked scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs)._

## ▶ Start here — resume point for the next session

--------------------------------------------------------------------------------
> RESUME HERE (CURRENT, 2026-08-18 -- consolidated card-arc + S5b state. The S5b-1 attempt is UNCOMMITTED in the tree, pending a read-only diagnosis. Read this whole block first.)

LAST SHIPPED: HEAD 2c3ca5c (docs). Last code: b1238ba (Slice 4b-1). Tree has UNCOMMITTED S5b-1 edits (pending diagnosis - see below) + known scratchpads (info-pages/, scratchpad_actors_col.mjs, scratchpad_find_rosario.mjs, scratchpad_s0_verify.mjs, scripts/ai-bakeoff.mjs).

--- CARD ARC: what shipped this session ---
The unified-card VISUAL redesign is complete and live on all four intel types (News/Social/Documents/Interviews):
- Slice 0: lost design spec restored to git (docs/unified-source-card-mockup.html + docs/unified-card-model-spec.md).
- Slice 1: flat card -> title surface + 3 tinted zones (cogwheel=assessment/routing, globe=geography, bust=engaged entities) + collapsible footer.
- Slice 2a: fixed ActorChips .slice(0,20) data-loss bug (was silently dropping actors #21+ on edit). Cloud-verified no data lost (max 15).
- Slice 2b: overflow "...+N" grouped popovers (data-driven actor groups by real type field; mentioned-only geo overflow; portal anchoring; shared usePopoverDismiss lifted).
- Slice 3: click-to-override CONFIDENCE pill (wires to existing updateConfidence, confidence_override=1).
- Slice 3b: relevance override FOLD-pill with picker (human.relevance over AI REL, provenance-marked, one-click clear; gate-safe - never writes relevance_score).
- B: retired redundant legacy footer confidence/relevance selects.
- Routing rename: card footer "Review and annotate" -> "Routing" (resolved a name collision with NewsTab's human-layer footer).
- Slice 4a: wired IMPLICIT geography confirmation (editing geography stamps geography_confirmed=1; AI-proposed-untouched stays 0). Cloud-verified. Surfaced hasContent + confidenceOverride on SourceCore.
- Slice 4b-1: 6-DOT ROUTABILITY METER on News (content/AI/tags/confidence/geography/incident). canRoute() is the single source of truth (meter + Approve button read it). Type-aware content check (news>=200c / social non-empty / interview>=10w / doc non-empty). Click flyout listing checks. Incident dot DIM (pending 4b-2). Interim gate on the 5 live checks.

--- KEY DEFERRED ITEMS (banked, do in order) ---
1. UNIFORM EDITING LAYER (S5b) = NEXT. The core purpose of unified cards: ALL controls editable on ALL types - CONFIDENCE (researcher-selected, NOT relevance), GEOGRAPHY, ACTORS, SUMMARY, STRUCTURED DATA, TAGS. Currently editable on News ONLY; the other 3 render them read-only. Repeatedly under-applied; now being built properly. NO migration needed (all types already store geo/actors in the SAME structured columns; writers are type-agnostic).
   TIERS (from the 6-control x 3-type matrix):
     - S5b-1 / READY = geography+actors+confidence (controls already in the shared card; the 3 tabs just don't pass the onChange handlers).
     - S5b-2 / LIFT = tags (and maybe summary) - the editable control lives IN NewsTab, must be LIFTED into the shared SourceCard so all tabs get it (per-tab reimplementation would recreate the non-uniformity).
     - S5b-3 / BUILD = structured data (+ parts of summary) - writer/column/mapping missing for non-News types.
   S5b-1 THREE SNAGS (must be reported + reviewed before commit):
     (a) INTERVIEW CONFIDENCE: B2 built interviews to SUPPRESS confidence (null->no pill, the fake-LOW fix). Dorian REVERSED that - interviews now get researcher-selected confidence. Remove ONLY the suppression blocking a HUMAN pill; do NOT resurrect the fake AI-default LOW.
     (b) HANDLER WRAPPERS: verify each tab has handleCountries/handleActors/handleConfidence or build them copying NewsTab's exact pattern.
     (c) GEOGRAPHY_CONFIRMED STAMP: geography edits on all 3 tabs MUST route through updateCountries so geography_confirmed=1 stamps (4a parity) - else the meter's geography dot stays permanently dim.
   *** S5b-1 ATTEMPT IS UNCOMMITTED IN THE TREE, PENDING DIAGNOSIS. A build attempt edited SourceCard + the 3 tabs but SKIPPED the STEP-0 review gate (never reported findings). Edits LEFT IN TREE, uncommitted. NEXT SESSION opens with a READ-ONLY diagnostic of exactly what it changed (full diff of SourceCard esp. the B2 removal + the 3 tabs; whether it wired the geography_confirmed stamp on all 3; whether interview confidence works without resurrecting fake-LOW). Then DECIDE from evidence: keep-and-finish or discard-and-rebuild. Do NOT build on or commit these edits until diagnosed. (Uncommitted work is fragile - diagnose EARLY; if not, git stash with a label.) ***

2. Slice 4b-2 = INCIDENT route-gate control. The gate does NOT pre-determine incident, so "AI proposes, human confirms" doesn't work. DECISION: an explicit "Incident? Yes/No" control the researcher answers; the incident dot lights when answered EITHER way. Then flip canRoute's incident check + the button gate from the interim 5-check to canRoute.all.

3. Slice 4b-1b = extend the routability meter to social/doc/interview + flyout scroll-dismiss. BLOCKED on S5b-1 (their geo/confidence dots can't complete until those controls are editable). Once S5b makes them editable, 4b-1b ships the cross-type gating. The 3 non-News tabs route uniformly via routeToProject + "Send to New sources" (gate that button).

4. FOOTER-LAYOUT REDESIGN (after 4b-1b, design-first): the News card footer is 3 stacked bands (Routing + orphaned topic/actions row + Review-and-annotate) = too tall. Deferred until after Slice 4 so the meter is present when redesigning. After this, the CARD ARC IS DONE.

5. SNIPPET/SUMMARY NOT UPDATED BY AI (separate, adjacent to ARC II): GDELT snippet is supposed to be replaced by a substantive AI summary post-analysis, but isn't (AI-replaces-snippet is unbuilt). Investigate saveAiAnalysis; wire snippet<-AI-summary.

6. AI-READ TUNING (separate arc, after the editing layer): AI analysis must PRE-POPULATE geography/actors/summary/structured for interviews and documents (does News today) so researchers confirm rather than author. SOCIAL stays more-manual for now (auto-population harder; revisit).

7. IMAGE ATTACHMENTS (future arc, design-first, rides with/after ARC II): attach an image to a source + clickable indicator on the published monitor. Needs Supabase Storage (bucket + upload) for dropped files; URLs already supported. ~3-5 slices.

--- AFTER THE CARD ARC ---
Pivot to ARC II = the PUBLICATION PIPELINE (geography/country-default model - "the next MAJOR priority"). Then the other separable arcs (A2 write-propagation, Phase B PipelineSourceCard convergence).

--- WORKING DISCIPLINE (non-negotiable) ---
Read-only diagnose before any build. One slice at a time. Verify writes in cloud SQL, not just UI/mirror. Commit + push immediately on green; verify with git log (this session, "done" repeatedly meant shown-not-committed - always check git log). Code and docs = separate commits. git add specific files only (never -A - scratchpads). ASCII single-quoted commit messages. Confirm ~/newsroom-pm before any git op. Multi-tab/shared-card slices: build -> show diff -> REVIEW before test (enforce the review gate).

=== NEXT SESSION FIRST STEP ===
Read this block, run git status + git log --oneline -5, confirm HEAD + the uncommitted S5b-1 files, then run the READ-ONLY diagnostic of what the S5b-1 attempt built (item 1 above) before any decision.

--- end resume block ---
--------------------------------------------------------------------------------
> RESUME HERE (CURRENT, 2026-08-11 latest -- AI-RETUNE slices 1+2 SHIPPED; slice 3 REFRAMED into the CONVERGENCE ARC. Next session = write the ONE slice plan for: unified SourceCard + structured-model port across all 4 intel types + categories_json retirement. Start fresh -- this is the central build arc.)

SHIPPED + COMMITTED THIS SESSION:
  - AI-RETUNE SLICE 1 (a1d7f69) -- constrained the relevance-GATE geography (gateClassifyArticle,
    ipc/index.ts ~:2808, the title+snippet triage writing the SCALAR geography/region). Prompt asks for
    a single canonical country OR REGIONAL/GLOBAL; snap-before-write via resolveRegion (src/main/geography.ts,
    already imported) enforces it; unmapped/blank -> REGIONAL fallback. Forward-only (existing junk rows
    clean on "Re-score unscored"). Tested incl. cloud-SQL. The junk factory was the GATE, NOT analyze.ts.
  - AI-RETUNE SLICE 2 (563b943) -- constrained analyze.ts geography (relevance task, the country LISTS).
    Added REGIONAL/GLOBAL sentinel instruction + a canonical snap in the normalizer via resolveRegion
    (same resolver). subject_countries accepts a sole-entry sentinel (mixed country+sentinel collapses to
    the sentinel alone, Model A); mentioned_countries = countries only; unmapped junk dropped; EMPTY STAYS
    EMPTY (no REGIONAL fallback -- deliberately unlike slice 1, so the needs-geography prompt + placement
    gate keep working). Verified on real re-analyses: multi-country -> clean canonical list; no-subject ->
    single GLOBAL sentinel sole-entry; mixed legacy row cleaned on re-analysis; no sentinel in mentioned.
    NOTE: subject_countries is written ONLY by the manual "Analyze with AI" button (analyzeSource ->
    analyzeText task relevance -> saveAiAnalysis); never auto-runs; requires stored article text; writes
    cloud-first then mirror. The GATE (auto-run) writes only the scalar, not the lists.

SLICE 3 REFRAMED -- it was never "drop a dead field." The drop-safety diagnose + Dorian's direction
  reframed it: the old per-type categories_json categorization is a PLACEHOLDER to be REPLACED by porting
  the full News structured model onto all 4 intel types, then retired as the trailing step. Key findings:
    - categories_json is NOT droppable as a column: co-owned by Social (live user-editable picker) + still
      rendered as pills on PipelineSourceCard (articles) + DocumentsTab (read-only badges). Retire the USAGE
      per type as each gets real axes; leave the physical column (drop later once nothing writes it).
    - queue_section (derived from categories_json on approve) is WRITE-ONLY, zero readers -- routing runs on
      routing.proposed_sections + subject_countries. Retiring it is inert (no filing impact).

THE CONVERGENCE ARC (the real work -- diagnosed, verified, NOT built):
  GOAL: the full structured apparatus (geography picker, section confirm, tags, relevance, confidence,
  structured analysis) currently lives ONLY in News. Bring Social/Documents/Interviews up to the SAME
  structured OUTCOME so all 4 types feed the publication grid and reach the website. Ingestion differs per
  type; the output must converge.

  DIAGNOSE VERDICT (per-type, file:line captured this session): it is ~5/6 a UI PORT, not a data project.
    - ALL THREE non-News tabs ALREADY run task:'relevance' + saveAiAnalysis -> the full structured payload
      (proposed_sections, subject_countries, mentioned_countries, actors, capabilities, key_facts,
      article_type) ALREADY lands in analysis_json for every type. Data exists.
    - ALL THREE already reach routeToNewSources and place by sections+geo, identical to News. Routing done.
    - GAPS to close (per type): GEOGRAPHY picker (add), SECTIONS confirm UI (add), full STRUCTURED render
      (expand) -- all UI-ONLY (data present). CONFIDENCE editor: Social has it, Documents/Interviews need it
      (UI-only). RELEVANCE override: all three missing -- the ONE true data-path gap (wire handleHumanRelevance
      -> setHumanRelevance -> analysis_json.human; the write path exists, just not called). TAGS: done on all.
    - categories_json UI to retire per type: Social = full picker (keep column), Documents = read-only badges,
      Interviews = none.

  ** THE UNIFICATION: this arc IS the card-unification arc from the data side. ** The unified SourceCard is
  the shared component that mounts these axes; mounting it on Social/Docs/Interviews IS the structured-model
  port. Do NOT port controls onto old tab layouts (that's 3x work then rip out). Build the unified card once,
  mount per type. => the earlier open decision (shared-shell-from-scratch vs morph-News-inline) is now
  DECIDED: SHARED-SHELL-FROM-SCRATCH -- the whole value is one component serving four types.

  ONE SLICE PLAN to write next session (covers card + convergence + retirement together):
    (1) shared SourceCard shell (title + 3 zones + overflow popovers + review/annotate + completeness meter),
        mount on News READ-ONLY first (parity render).
    (2) wire News editable axes into the shell (geography/actors/tags/confidence/relevance; sections read-
        only on News per the locked matrix).
    (3) overflow popovers; (4) incident lift onto News.
    (5-7) mount the shell on Social, Documents, Interviews -- each mount = that type's structured port; fold in
        the relevance-override wire (the one data gap) + confidence editor for Docs/Ints.
    (8) sections editable on New Sources (routing desk) per the matrix.
    (9) completeness meter + gate (needs an approve-gate logic diagnose first).
    (10) retire categories_json USAGE per type once its real axes exist (trailing cleanup; keep the column).
  Each slice independently testable; commit on green.

CARD DESIGN + DRONE PACKET (locked earlier this session, unchanged): unified-card mockup + model spec in
  outputs/ for the drone-DB project; editability matrix locked (geography/actors/tags/confidence/relevance
  edit on News-Intel; sections edit on New Sources only; incident on Intel[new]+New; All Sources read-only).
  Overflow "... +N" grouped popovers; click-to-override confidence/relevance pills; completeness gate =
  text+AI-run+geo+>=1 section+tags+incident (confidence/reliability NOT gates). Drone lifecycle doc
  (docs/contested-skies-lifecycle.md) still TO GENERATE via the Code-writes-it prompt drafted earlier.

PUBLISH PIPELINE SCOPED (unchanged from prior block): two disconnected systems; 5 critical-path slices
  (monitor-repo pivot[external diagnose], content.json generator, rewire publishToRepo to grid, atomic
  approve transaction, confirm deploy) + 2 for full design. Geography routing is NOT the blocker.

REMAINING WORK (order): (1) CONVERGENCE ARC -- write the unified slice plan above [NEXT, the central arc];
  (2) needs-geography list indicator (small, independent); (3) publish pipeline slices (after monitor-repo
  diagnose). Retune slice 3 subsumed into the convergence arc (step 10).

STILL DEFERRED (unchanged): A2 New Sources geo picker + syncPlacements re-run; review-stage REGIONAL
  backfill; two-level tab bar; REGIONAL->LATAM rename; per-cell divergence; supply-axis re-index;
  page-limited relevance/project filter bug; intake-SourcesTab article-move question.
--------------------------------------------------------------------------------
> RESUME HERE (CURRENT, 2026-08-11 latest -- AI-RETUNE slices 1+2 SHIPPED; retune slice 3 REFRAMED into the four-type CONVERGENCE arc, which is the SAME arc as the unified-card build. Next = the unified-card / convergence slice plan, fresh session.)

SHIPPED + COMMITTED THIS SESSION (retune):
  - RETUNE SLICE 1 (a1d7f69) -- relevance-GATE geography constrained. The scalar-geography junk factory is
    gateClassifyArticle in ipc/index.ts (~:2808), NOT analyze.ts. Prompt now asks for canonical country OR
    REGIONAL/GLOBAL; snap-before-write via resolveRegion (src/main/geography.ts, already imported). Junk-fallback
    REGIONAL. Forward-only (existing rows clean via Re-score). Verified incl. cloud SQL.
  - RETUNE SLICE 2 (committed) -- analyze.ts geography sentinels + normalizer snap. Relevance prompt gained the
    REGIONAL/GLOBAL sentinel instruction; normalizer snaps subject/mentioned via resolveRegion: canonical spelling,
    subject accepts REGIONAL/GLOBAL as SOLE-entry sentinel (collapses mixed country+sentinel to sentinel alone),
    mentioned = countries only, junk dropped, EMPTY STAYS EMPTY (no REGIONAL fallback -- preserves needs-geography
    prompt + placement gate). Verified on real analysis runs: multi-country -> clean list; no-subject -> single
    GLOBAL/REGIONAL; mixed legacy row cleaned to sole-entry on re-analyze; no sentinel in mentioned. subject_countries
    is written ONLY by the manual "Analyze with AI" button (analyzeSource -> analyzeText relevance -> saveAiAnalysis),
    requires stored article text, cloud-first then mirror. The gate (gate_processed=1) is a DIFFERENT pass and does
    NOT write subject_countries.

RETUNE SLICE 3 REFRAMED -- do NOT do it as a standalone categories_json drop. Drop-safety diagnose found:
  categories_json is NOT load-bearing for routing (queue_section derived from it is WRITE-ONLY, zero readers;
  filing runs on routing.proposed_sections + subject_countries). BUT the column is co-owned by SOCIAL (live
  user-editable picker) and still renders pills on PipelineSourceCard. Dorian's intent: the old per-type
  categories_json is a PLACEHOLDER to be REPLACED by the real structured axes, retired as those axes arrive --
  not removed in isolation. => folds into the convergence arc below.

THE BIG FINDING -- FOUR-TYPE CONVERGENCE = THE UNIFIED-CARD ARC (verified by diagnose):
  The full structured apparatus (geography picker, section picker, tags, relevance, confidence, structured
  analysis) currently lives fully only in NEWS. GOAL: all four intel types (news/social/documents/interviews)
  must converge on the SAME structured outcome so every type can feed the publication pipeline -> website.
  DIAGNOSE RESULT (critical): all three non-News tabs ALREADY run task:'relevance' + saveAiAnalysis, so the full
  structured payload (proposed_sections, subject_countries, actors, capabilities, key_facts) ALREADY EXISTS in
  analysis_json for every type. Routing is ALREADY converged -- all three Send handlers call routeToProject ->
  routeToNewSources, placing by proposed_sections + subject_countries (same as News). So convergence is ~5/6 a
  UI-ONLY PORT, not a re-analysis effort:
    Per-type gaps (Social / Documents / Interviews):
      - Geography picker (GeographyChips): MISSING all three -- UI-only (data in subject_countries)
      - Sections picker/confirm: MISSING all three -- UI-only (data in routing)
      - Full structured render (capabilities/key_facts/actors): PARTIAL all three -- UI-only (data in .ai)
      - Confidence editor: Social HAS; Documents/Interviews MISSING -- UI-only
      - Tags: all three HAVE (done)
      - Human RELEVANCE override: MISSING all three -- the ONE real data-path gap (no handleHumanRelevance ->
        setHumanRelevance -> analysis_json.human wired in these tabs; saveAiAnalysis writes .human the same way,
        so reachable, just not wired).
      - Old categories_json picker to retire: Social=full picker (co-owns column, keep column), Documents=read-only
        badges, Interviews=none.
  KEY STRATEGIC POINT: convergence and the unified-card redesign are ONE arc. The unified card IS the vehicle --
  build the shared SourceCard shell with editable zones, mount it across all four types, and the structured-axis
  port + categories_json retirement fall out of it. Porting controls tab-by-tab now, then rebuilding into the
  unified card later, would touch social/documents/interviews TWICE. Do it once, via the card.

NEXT (fresh session): write the UNIFIED-CARD / CONVERGENCE slice plan. It covers: (1) shared SourceCard shell
  (title surface + cogwheel/globe/bust zones + overflow popovers + review/completeness meter, per the approved
  mockup docs/unified-source-card-mockup.html), (2) editability config per surface AND per intel type, (3) the
  human-relevance data-path port (the one non-UI gap), (4) retire categories_json per type as its axes arrive
  (keep the physical column -- Social co-owns). Open decision still: shared-shell-from-scratch (recommended) vs
  morph-News-inline-first. Also pending: the drone-DB lifecycle doc (docs/contested-skies-lifecycle.md, Code-writes
  prompt drafted) + the drone handoff packet already in outputs.

Also still queued (unchanged): needs-geography list indicator (small, independent); publish pipeline 5-slice arc
  (S1 monitor-repo pivot diagnose, S2 content.json gen, S3 rewire publishToRepo, S4 atomic transaction, S5 deploy);
  Issue-3 DONE (32c1ef0).

STILL DEFERRED (unchanged): A2 New Sources geo picker + syncPlacements re-run; review-stage REGIONAL backfill;
  rule-6 cards_whole flip; two-level tab bar; REGIONAL->LATAM rename; per-cell divergence; supply-axis re-index;
  page-limited relevance/project filter bug; intake-SourcesTab article-move question.
--------------------------------------------------------------------------------
> RESUME HERE (CURRENT, 2026-08-11 late -- unified CARD DESIGN locked; PUBLISH scoped (5 slices); ISSUE-3 fixed (32c1ef0); AI-RETUNE slice 1 shipped (a1d7f69). Next = retune slice 2 OR the card-unification arc.)

SHIPPED + COMMITTED THIS SESSION:
  - ISSUE-3 fix -- stuck-open card. NewsTab.tsx:1413 footerOpen default changed `?? footerFilled` -> `?? false`
    (cards default closed; explicit toggle wins within session; footerFilled KEPT -- it still drives the
    notes indicator dot/pencil on the Review-and-annotate button). Renderer-only. Tested 5/5. Committed.
  - AI-RETUNE SLICE 1 (a1d7f69) -- constrain the RELEVANCE-GATE geography. KEY DIAGNOSE CORRECTION: the
    freeform geography junk ("Middle East (Iran/Hormuz)", "N/A", "unknown/global") does NOT come from
    analyze.ts -- analyze.ts already emits clean-ish bare country names + hard-validated 9 sections.
    The junk factory is gateClassifyArticle in ipc/index.ts (~:2808), the title+snippet triage gate that
    writes the SCALAR geography/region (region = geography) with only .slice(0,120). Fix: prompt now asks
    for a single canonical country OR REGIONAL/GLOBAL sentinel; and a SNAP-before-write via resolveRegion
    (already in src/main/geography.ts, already imported) enforces it -- canonical country -> normalized
    spelling, sentinels through, unmapped/blank -> REGIONAL (LATAM-focused default). Forward-only: existing
    junk rows clean up via the "Re-score unscored" button (a few cents of Haiku). Tested incl. cloud-SQL
    verify. Committed.

DESIGN LOCKED THIS SESSION (approved, NO code yet):
  - UNIFIED SOURCE CARD -- via interactive mockup (docs/unified-source-card-mockup.html). ONE shell,
    three surfaces; only per-surface difference is which axis is EDITABLE. Structure: prominent TITLE
    surface -> three tinted zones w/ corner icons [cogwheel = assessment/routing: status, confidence,
    relevance, language, incident, sections, tags | globe = geography | bust = engaged entities/actors]
    -> collapsible REVIEW & ANNOTATE w/ 3-state COMPLETENESS METER + gate checklist + Close btn ->
    per-surface ACTION bar. PATTERNS: (a) overflow "... +N" pill per zone -> zone-anchored popover grouped
    by sub-type; (b) confidence/relevance = click-to-override pills; (c) meter "ready" MUST equal the real
    approve gate.
    EDITABILITY MATRIX (FINAL): geography Intel EDIT / New READ / All READ; actors Intel EDIT / New READ
    [NEW: read-visible; today ABSENT] / All READ; sections Intel READ (AI-proposed) / New EDIT (the +section
    picker, unselected-only) / All READ [REVERSED TWICE -- FINAL = routing edits ONLY at New Sources];
    tags Intel EDIT / New READ / All READ; incident Intel EDIT [NEW -- lift IncidentChip onto Intel] / New
    EDIT / All READ; confidence + relevance Intel EDIT / New READ / All READ; actions Intel full / New
    confirm+moveback / All none.
    COMMIT-GATE INGREDIENTS: HARD = article text, AI run, geography (placements), >=1 section, tags,
    incident-determined. NOT gates = confidence, reliability (AI-predetermined, override-only).
  - CARD-UNIFICATION IS AN ARC. Intel card = inline JSX in NewsTab; New/All = PipelineSourceCard (which has
    NO editable branch for geo/actors/tags/confidence/relevance -- only sections+incident). Build = extract a
    shared SourceCard shell + editability config + add the missing editable branches. NEEDS A SEQUENCED SLICE
    PLAN before code. OPEN DECISION: shared-shell-from-scratch (recommended) vs morph-Intel-inline-first.
    Rough A-plan: (1) shell + Intel mount READ-ONLY, (2) wire Intel editable axes, (3) overflow popovers,
    (4) incident lift, (5) converge New Sources, (6) converge All Sources, (7) completeness meter+gate
    (needs an approve-gate logic diagnose first).
  - DRONE-DB HANDOFF PACKET (now docs/): unified-card-model-spec.md (shell + editability model + reuse map +
    the specs-zone open question) + the mockup. THIRD piece to generate: docs/contested-skies-lifecycle.md --
    a CODE-TRUE intel+publish lifecycle map (BUILT/PARTIAL/DESIGN per stage); Code-writes-it prompt drafted.

PUBLISH PIPELINE SCOPED (diagnose done). TWO CORRECTIONS to prior notes: (i) geography routing is NOT the
  blocker -- country placements already reach the DB. (ii) Real blocker = TWO DISCONNECTED PUBLISH SYSTEMS:
  live push publishToRepo (ipc:4246, GitHub Contents API, Head-gated) reads OLD info_page_commits + HTML-
  appends into a hand-shaped index.html; the grid work (publication_changes/cards) never reaches the page.
  5 critical-path slices: S1 monitor-repo pivot [UNKNOWN, external repo, own diagnose], S2 content.json
  generator, S3 rewire publishToRepo to the grid, S4 ATOMIC approve transaction (today = separate best-effort
  writes), S5 confirm deploy workflow [external]. +2 for full design: S6 AI change-summary/on-page note,
  S7 RECENT CHANGES view + diff + rollback. Next unknown-collapser: read-only diagnose of contested-skies-monitor.

RETUNE REMAINING (after slice 1):
  - Slice 2: analyze.ts geography -- add REGIONAL/GLOBAL sentinels to the relevance prompt + a canonical-snap
    in the subject_countries/mentioned_countries normalizer (currently NO dictionary validation). Token-neutral.
    Keep the .ai/.routing/.human boundaries and emit section key `legal` (NOT `regulatory`).
  - Slice 3: drop the dead ai_category/categories_json parallel taxonomy (keyword-derived, not AI, no longer
    displayed or filtered). PRECEDE with a drop-safety diagnose of the cloud queue_section derivation
    (ipc:3506 reads categories_json) before touching the column.

REMAINING WORK (order): (1) retune slice 2/3 OR (2) CARD-UNIFICATION arc [write slice plan first] --
  Dorian to choose; (3) needs-geography list indicator (small, independent).

STILL DEFERRED (unchanged): A2 New Sources geo picker + syncPlacements re-run; review-stage REGIONAL backfill;
  rule-6 cards_whole flip; two-level tab bar; REGIONAL->LATAM rename; per-cell divergence; supply-axis re-index;
  page-limited relevance/project filter bug; intake-SourcesTab article-move question.
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
> RESUME HERE (CURRENT, 2026-08-11 later -- unified CARD DESIGN locked (mockup approved); PUBLISH pipeline scoped (5 slices to reliable publish); next build = ISSUE-3 fix, then the CARD-UNIFICATION arc) 

DESIGN LOCKED THIS SESSION (no code yet -- these are approved designs + scoping, not builds):

1. UNIFIED SOURCE CARD -- approved via interactive mockup (unified-source-card-mockup.html in outputs).
   ONE shell, three surfaces (Intel / New Sources / All Sources); the only per-surface difference is
   which axis is EDITABLE. Structure: prominent TITLE surface (title + 1-line summary + status kicker)
   -> THREE tinted zones with corner icons [A cogwheel = assessment/routing: status, confidence,
   relevance, language, incident, sections, tags | B globe = geography: subject/mentioned/levels |
   C bust = engaged entities: actors] -> collapsible REVIEW & ANNOTATE with 3-state COMPLETENESS METER
   + gate checklist + Close btn -> per-surface ACTION bar.
   KEY PATTERNS: (a) OVERFLOW -- each zone caps ~5 chips inline, rest collapse behind a "... +N" pill
   in the zone accent colour; click opens a zone-anchored popover with the full set GROUPED by sub-type
   (actors -> VNSAs/State/Industry; geography -> subject/mentioned). (b) confidence/relevance are
   CLICK-TO-OVERRIDE pills (pill = the edit control, no separate dropdown). (c) completeness meter =
   No work / In progress / Ready to commit, and "ready" MUST equal the real approve gate (never lies).

   EDITABILITY MATRIX (FINAL):
     Geography   : Intel EDIT | New READ | All READ
     Actors      : Intel EDIT | New READ | All READ   [NEW: actors become READ-visible on New/All;
                                                        currently ABSENT in PipelineSourceCard]
     Sections    : Intel READ (AI-proposed only) | New EDIT (the + section picker, unselected-only) | All READ
                   ** REVERSED TWICE THIS SESSION -- FINAL = sections edit ONLY at New Sources (routing is
                      a New-Sources step); Intel shows AI-proposed sections read-only. **
     Tags        : Intel EDIT | New READ | All READ
     Incident    : Intel EDIT [NEW -- lift IncidentChip onto Intel] | New EDIT | All READ
     Confidence  : Intel EDIT (click-override) | New READ | All READ
     Relevance   : Intel EDIT (click-override) | New READ | All READ
     Status/acts : Intel full verbs | New confirm+move-back | All none

   COMMIT-GATE INGREDIENTS (for the completeness meter, agreed): HARD = article text, AI run, geography
   (real placements), >=1 section, tags, incident-determined. NOT gates = confidence, reliability
   (AI-predetermined, override-only, no unset state). Incident-determined joins the gate once the
   incident control is lifted onto the card.

2. CARD-UNIFICATION IS AN ARC, NOT ONE SLICE. Diagnose showed Intel card = inline JSX in NewsTab;
   New Sources/All Sources = PipelineSourceCard (share almost nothing today: PipelineSourceCard has NO
   editable branch for geography/actors/tags/confidence/relevance -- only sections + incident). Building
   the unified card = extract a shared SourceCard shell + editability config + add the missing editable
   branches. NEEDS A SEQUENCED SLICE PLAN (not a monolithic build) before any code. Open decision:
   shared-shell-from-scratch (recommended) vs morph-Intel-inline-first-then-converge.

3. DRONE-DB HANDOFF PACKET produced (in outputs, for the separate drone-database mockup project):
   unified-card-model-spec.md (shell + editability model + reuse mapping + the specs-zone open question)
   and the mockup html. THIRD piece pending: docs/contested-skies-lifecycle.md -- a CODE-TRUE intel+publish
   lifecycle map (BUILT/PARTIAL/DESIGN per stage) that Code writes from a diagnose (prompt already drafted).

4. PUBLISH PIPELINE SCOPED (diagnose done this session). TWO CORRECTIONS to prior HANDOFF notes:
   (i) geography routing is NOT the publish blocker -- routeToNewSources/resolvePlacementGeographies
   ALREADY emit country-level placements to the DB; the "collapses all to REGIONAL" note is STALE.
   (ii) The real blocker is TWO DISCONNECTED PUBLISH SYSTEMS: the live push (publishToRepo, ipc:4246,
   GitHub Contents API, Head-gated, GH_TOKEN) reads the OLD info_page_commits table and HTML-appends into
   a hand-shaped index.html; all recent grid work (publication_changes, cards, Pre-Commit) never reaches
   the page. FIVE critical-path slices to reliable grid-driven publish: (S1) monitor-repo pivot [UNKNOWN --
   external repo, needs its own diagnose: does the SPA fetch a content.json or hold content inline], (S2)
   content.json generator projecting the grid, (S3) rewire publishToRepo to read the grid + publication_changes,
   (S4) ATOMIC approve transaction (today accept-flow writes are separate best-effort calls -- the "one
   failure mode this pipeline exists to prevent"), (S5) confirm the deploy workflow [external]. TWO more to
   full design: (S6) AI change-summary + on-page update note, (S7) RECENT CHANGES view + diff + rollback.
   Next unknown-collapsing move: a read-only diagnose of the contested-skies-monitor repo.

REMAINING WORK (order):
  1. ISSUE-3 fix [NEXT, ready] -- stuck-open card. Root cause DIAGNOSED: footerOpen = openFooter[id] ?? footerFilled
     at NewsTab.tsx:1413 uses a CONTENT-derived default (has-notes => open) while openFooter is ephemeral +
     NewsTab unmounts on tab-nav, so any card with intel_notes re-opens on return and restart. FIX (agreed):
     change the fallback to `?? false` (default closed; restart-closed becomes true). Freeze-view-on-tab-nav is a
     SEPARATE later slice (keep NewsTab mounted -- has background-cost risk). Completeness badge PLACEMENT folds
     into the card redesign; its LOGIC needs an approve-gate diagnose.
  2. CARD-UNIFICATION arc -- write the sequenced slice plan first (see design #1/#2 above), then build.
  3. NEEDS-GEOGRAPHY LIST INDICATOR (small).
  4. AI-RETUNE analyze.ts (clean geography + canonical sections).

STILL DEFERRED (unchanged): A2 New Sources geography picker + syncPlacements re-run; review-stage REGIONAL
  backfill; rule-6 cards_whole flip; two-level dynamic tab bar; REGIONAL->LATAM rename; per-cell divergence;
  supply-axis re-index; the page-limited relevance/project filter bug; the intake-SourcesTab article-move question.
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
▶ RESUME HERE (CURRENT, 2026-08-11 -- Y2 SHIPPED; next = issue-3 [stuck-open card] -> needs-geo list indicator -> AI-retune) -> Y2 is DONE and COMMITTED (0c1878f). All seven test checks green in-app. The geography-arc filter work is complete on BOTH the Intelligence NewsTab (Y1) and the publication AllSourcesTab (Y2).

DONE + COMMITTED THIS SESSION (pushed to main):
  - Y2 FILTER-BAR PORT TO AllSourcesTab (0c1878f): the committed-source library ("All Sources"
    tab, id 'all-sources') now carries the Intelligence filter bar, minus reviewed/unreviewed and
    other intake-only controls. Decisions locked from the diagnose: COPY (not extract) the bar +
    predicates; load-all MOOT (AllSourcesTab already fetches every committed row once, no pagination).
    Four files:
      (a) classifyGeo EXTRACTED from NewsTab into geographyVocab.ts as an exported fn (one definition,
          shared by both region filters). NewsTab imports it; local copy removed. NewsTab region filter
          re-tested, no regression.
      (b) subject_countries added to the getSourcePipeline SELECT (ipc/index.ts) + to InfoPageSourceRow
          (env.d.ts). Column already mirrored via INTEL_COLS -- no new mirror column. MAIN-process change
          (needed a full npm run dev restart to test).
      (c) AllSourcesTab filter bar: search, category (confirmed-else-proposed, key-to-key, Incidents via
          resolveIncident, NEVER ai_category), confidence (exact match), relevance, region
          (classifyGeo(readTags(subject_countries))), sort. Pure client-side `visible` useMemo over the
          already-loaded committed set -> group by article. No reload, no remount on any filter/sort.
          Search + confidence reimplemented client-side (NewsTab pushes those server-side; AllSourcesTab
          has no server query) matching NewsTab semantics.
      (d) SORT: default 'committed' (newest-committed -- byte-identical first-paint order to pre-Y2),
          plus 'relevance' and 'date' options, persisted to localStorage 'allsources-sort' (try/catch
          lazy init, unknown value -> 'committed', cannot crash). load()'s committed_at DESC stays;
          `visible` re-sorts on top.
    Typecheck held at the 55 baseline, 0 in touched files.

TEST PASS (all seven green, verified in-app after npm run dev restart):
  1. NewsTab region filter unchanged (classifyGeo extract -- no regression). PASS (screenshot).
  2. AllSourcesTab region filter -- committed source flowed through + filtered correctly. PASS.
  3. Category filter (confirmed sections). PASS.
  4. Confidence / relevance / search. PASS.
  5. Sort: first paint newest-committed; relevance/date reorder; persists. PASS.
  6. No scroll reset / remount on any filter or sort change (pure useMemo). PASS.
  7. Committed row carries routing.confirmed. PASS -- read-only mirror diagnose: 1 of 1 committed rows
     on board-info-latam has non-empty routing.confirmed = ["vnsa"]; confirmed-first path is live on real
     data. NOTE: only 1 committed source exists board-wide today, so AllSourcesTab's proposed-fallback and
     Incidents branches have no live committed row to exercise yet -- both are copied verbatim from NewsTab
     (proven there) and will get live coverage as more sources are committed. Coverage-thin, not a defect.

REMAINING WORK (Dorian's order -- unchanged, Y2 removed from the top):
  1. ISSUE 3 [NEXT] -- STUCK-OPEN CARD. Fixture: "Iranian drone display in Coral Gables" (Cuba) stays
     EXPANDED across tab navigation and re-opens on return -- violates "views freeze where last used;
     default closed on restart". Read-only diagnose written (where card expand-state lives; is there a
     force-open effect on mount for cards with in-progress content). Run before fixing.
  2. NEEDS-GEOGRAPHY LIST INDICATOR. Per-card empty prompt is DONE (scalar retired). Remaining: a
     list-level indicator/filter to FIND all empty-geography sources (the 12 hedges + new empties) --
     pairs with the region filter (they already show only under "All"). Small.
  3. AI-RETUNE. The AI first-pass writes junk into geography (freeform "Middle East (Iran/Hormuz)",
     "N/A", "unknown/global") AND category (ai_category taxonomy that doesn't match the 9 canonical
     sections). Retune analyze.ts to emit clean country names/sentinels + canonical sections, so backfill
     never re-runs and ai_category's parallel taxonomy is resolved. Touches src/main/ai/analyze.ts;
     ties to token-efficient-AI rule.

STILL DEFERRED (unchanged): A2 (New Sources picker mount + dual-write subject_countries AND re-run
  syncPlacements); review-stage REGIONAL backfill; rule-6 cards_whole flip; two-level dynamic tab bar;
  REGIONAL->LATAM storage rename; per-cell (section x geography) Pre-Commit divergence; country-as-actor /
  actor-role (supply-axis re-index); the relevance/project page-limited filter bug (consistency pass);
  the Sources/Intelligence article-move question (raised this session, parked -- concerns the intake
  SourcesTab, not AllSourcesTab; touches the source-lifecycle "one durable record, never copied"
  invariant; needs its own read-only diagnose before any design).
--------------------------------------------------------------------------------

▶ RESUME HERE (CURRENT, 2026-08-10 pm -- Intel filters shipped; next = Y2 [Sources-tab filter port] then issue-3, needs-geo indicator, AI retune) -> Y1 filter bar + picker fixes DONE and committed. Y2 needs a diagnose re-read (its first diagnose came through blank twice -- RE-RUN it).

DONE + COMMITTED THIS SESSION (all pushed to main):
  - A1 GEOGRAPHY PICKER + SLICE X (bad4787 renderer, eb8817f main): scoped country typeahead
    (LATAM-default/extra-LATAM toggle, frequency-ranked via getCountryUsageCounts, pick-from-list only),
    scope-coloured chips (clay LATAM / blue extra-LATAM / accent sentinels / ghost mentioned), REGIONAL/
    GLOBAL level toggles (LATAM active, +region/+Global disabled), sub-areas preserved. Slice X: scope
    toggle DEFAULTS from chips (all-LATAM->LATAM, all-extra->extra, MIXED->BOTH lit, EMPTY->neutral w/
    disabled typeahead "Select LATAM or extra-LATAM first"). SCALAR FALLBACK RETIRED -- empty geography
    now shows the prompt, never a stale scalar pill; the ~12 hedge rows now show "needs geography".
    Renderer vocab mirror geographyVocab.ts (hand-synced from main geography.ts).
  - BUG D (committed earlier): handleCountries honors updateCountries result (no optimistic state on
    failed/offline write).
  - SCALAR->subject_countries BACKFILL (99221f8, scripts/geo-scalar-backfill.mjs): two-pass, dry-run-
    first, cloud-direct (mirror self-heals on next getSources read). Parser: strip parens, split on "/"
    only, whole-fragment resolve (hedge-safe), Global->GLOBAL, LATAM->REGIONAL, Gaza->Palestine. Pass 1
    (--latam-only): 184 LATAM. Pass 2: 100 extra-LATAM. 12 hedges + no-scalar left empty for the gate.
    Verified in-app both passes. Cloud is source of truth (had ~323 rows vs the mirror's smaller snapshot).
  - Y1 INTELLIGENCE FILTER BAR (dbd96f9): (a) REGION filter LATAM/extra-LATAM/both -- a source shows if
    any subject_countries value resolves to a selected region (REGIONAL=LATAM-side, GLOBAL=extra-side);
    mixed shows under whichever it touches; "Both" = only mixed; empty-geo shows only under "All".
    (b) CATEGORY dropdown now filters CANONICAL SECTIONS + Incidents via routing.confirmed (the LIT/
    SELECTED chips), FALLING BACK to proposed_sections when untouched -- NOT ai_category (that was the
    "shows under greyed Logistics" bug). Section option values are KEYS ('vnsa'), matched key-to-key.
    (c) LOAD-ALL WHEN FILTERING: region/section filters fetch the full in-scope set (~319) so the client
    filter sees all rows, not just the loaded 50-page -- that was why extra-LATAM showed 0. Verified:
    extra-LATAM (all statuses) = 102 of 319; VNSA filters selected sections; no remount. NOTE: relevance/
    project filters have the SAME page-limited latent bug (not fixed -- flagged for a later consistency pass).
  - ai_category PILL CLEANUP (6e8d3f0): removed the dead ai_category category pills from the Intel card
    (they no longer drive the filter). KEPT the Incident indicator (separate flag, not ai_category). Grep
    confirmed pills render only on the Intel card. ai_category FIELD left in the data model (revisit in retune).

KEY LEARNINGS THIS SESSION (add to the recurring-bug list):
  - subject_countries comes off a row as a JSON STRING -- parse before .some()/.includes() (same class as
    categories_json). A missing parse silently returns nothing.
  - Client-side filters over a PAGINATED list only see the loaded page -- a filter can show 0 while matching
    rows exist off-page. Fix: load-all-when-filtering (fine at ~319 scale) or server-side (bigger, Y2+).
  - "selected sections" live in routing.confirmed (the lit chips), NOT proposed_sections (the AI proposal /
    which chips exist). Filter/read confirmed-else-proposed.
  - UPLOADS TO CHAT AROUND HERE CAME THROUGH BLANK TWICE (the known empty-upload gotcha) -- when a diagnose
    or report must be shared with the assistant, PASTE AS TEXT, don't rely on file upload.
  - CLIENT-SIDE vs SERVER-SIDE FILTER PARITY: NewsTab pushes search + confidence to the server query;
    a tab with no server query (AllSourcesTab) must reimplement those as client predicates matching the
    server semantics (confidence = exact match; search = case-insensitive substring on title/snippet/
    source_name). Don't assume a "copy the predicates" port is pure -- check which filters were server-side.

REMAINING WORK (Dorian's order):
  1. Y2 [NEXT] -- port the Intelligence filter bar to the publication SOURCES tab, MINUS reviewed/unreviewed.
     Its read-only diagnose (Sources-tab current controls, data-shape match [subject_countries / routing.
     confirmed / incident flag], EXTRACT-shared-component vs COPY, and whether the Sources tab paginates
     [needs load-all] or loads-all-at-once [load-all moot]) was RUN but came through BLANK to the assistant --
     RE-RUN it and PASTE THE RESULT AS TEXT. Two decisions gate the build: (i) extract vs copy, (ii) does the
     Sources tab need load-all. Then spec + build.
  2. ISSUE 3 -- STUCK-OPEN CARD. Fixture: "Iranian drone display in Coral Gables" (Cuba) stays EXPANDED across
     tab navigation and re-opens on return -- violates "views freeze where last used; default closed on restart".
     Read-only diagnose written (where card expand-state lives; is there a force-open effect on mount for cards
     with in-progress content). Run before fixing.
  3. NEEDS-GEOGRAPHY LIST INDICATOR. Per-card empty prompt is DONE (scalar retired). Remaining: a list-level
     indicator/filter to FIND all empty-geography sources (the 12 hedges + new empties) -- pairs with the region
     filter (they already show only under "All"). Small.
  4. AI-RETUNE. The AI first-pass writes junk into geography (freeform "Middle East (Iran/Hormuz)", "N/A",
     "unknown/global") AND category (ai_category taxonomy that doesn't match the 9 canonical sections). Retune
     analyze.ts to emit clean country names/sentinels + canonical sections, so backfill never re-runs and
     ai_category's parallel taxonomy is resolved. Touches src/main/ai/analyze.ts; ties to token-efficient-AI rule.

STILL DEFERRED (unchanged): A2 (New Sources picker mount + dual-write subject_countries AND re-run
  syncPlacements); review-stage REGIONAL backfill; rule-6 cards_whole flip; two-level dynamic tab bar;
  REGIONAL->LATAM storage rename; per-cell (section x geography) Pre-Commit divergence; country-as-actor /
  actor-role (supply-axis re-index); the relevance/project page-limited filter bug (consistency pass).

▶ RESUME HERE (CURRENT, 2026-08-10 -- geography PICKER + BACKFILL shipped; next = Slice Y filters) -> A1 picker, scalar backfill, and the picker fixes are DONE and COMMITTED. The geography arc's data + capture layer is complete; remaining work is filters + a few fixes.

DONE + COMMITTED SINCE THE LAST BLOCK:
  - A1 GEOGRAPHY PICKER (committed bad4787 renderer + eb8817f main): GeographyChips upgraded into the
    real picker -- scoped country typeahead (LATAM-default / extra-LATAM toggle, frequency-ranked via
    getCountryUsageCounts), pick-from-list only (no free-text), country chips color-coded by scope
    (clay LATAM / blue extra-LATAM), REGIONAL/GLOBAL as level toggles (LATAM active [stores 'REGIONAL',
    displays "LATAM"], +region/+Global disabled/coming-soon), sub-areas preserved, mentioned = neutral
    ghost. Renderer vocab mirror geographyVocab.ts (synced-by-hand from main geography.ts). Main-side
    resolver recognizes REGIONAL/GLOBAL sentinels as valid (not unmapped). onChange contract unchanged
    (Intel NewsTab mount backward-compatible). NOTE: picker currently mounted ONLY on the Intel NewsTab
    card; the New Sources mount (A2 -- wire picker + dual-write subject_countries AND re-run syncPlacements)
    is NOT yet built.
  - BUG D (committed earlier): handleCountries honors updateCountries result -- no optimistic state on a
    failed/offline write.
  - SLICE X (part of bad4787): scope toggle DEFAULTS from the source's chips -- all-LATAM -> LATAM lit,
    all-extra -> extra lit, MIXED -> BOTH lit, EMPTY -> neutral (typeahead DISABLED with prompt "Select
    LATAM or extra-LATAM first"). Lazy-init-once so user clicks are never re-clobbered.
  - SCALAR FALLBACK RETIRED (part of bad4787): the old scalarFallback pill branch is GONE. Post-backfill,
    empty subject_countries now ALWAYS shows the Slice-X empty prompt, never a stale scalar pill. Fixes:
    (a) removing the last chip no longer resurrects the old scalar, (b) the ~12 hedge rows now show
    "needs geography" prompt instead of un-clickable scalar text. (The scalar `geography` DB column is
    left populated but never rendered.) This ALSO means every empty-geography card now VISIBLY prompts
    for one -- partially doing the needs-geography-indicator's job.
  - SCALAR->subject_countries BACKFILL (committed 99221f8, scripts/geo-scalar-backfill.mjs): two-pass,
    dry-run-first, cloud-direct (mirror self-heals on next getSources read). Parser: strip parens, split
    on "/" only, whole-fragment resolve (never substring -- hedge-safe), drop region-words/noise, Global
    ->GLOBAL sentinel, LATAM->REGIONAL sentinel, Gaza->Palestine. Pass 1 (--latam-only): 184 LATAM rows.
    Pass 2 (full): 100 extra-LATAM rows. 12 hedges + no-scalar rows correctly left empty (for the gate).
    Verified in-app both passes (clay LATAM chips, blue extra-LATAM chips). Cloud is source of truth; the
    23-vs-323 mirror/cloud row-count gap was real (cloud had far more than the mirror snapshot).

GEOGRAPHY GATE (from Piece B, live): countGeographyPlacements is checked in sendSourceToReview +
  commitSourceRow -- a source with ZERO geography placements cannot advance to the publication pipeline.
  Backstop works; the per-card empty PROMPT (above) now makes the "needs geography" state visible on the
  Intel card. Note the gate acts on info_page_sources PLACEMENTS; the picker edits subject_countries --
  they connect at route time, but editing subject_countries on an already-in-New-Sources source does NOT
  re-sync placements yet (that's A2's dual-write, unbuilt).

REMAINING GEOGRAPHY-ARC / RELATED WORK (Dorian's chosen order):
  1. SLICE Y -- THE FILTER WORK [NEXT]. Three parts, all client-side (filtering an already-loaded array),
     reuse geographyVocab region logic:
       (a) REGION FILTER on the Intelligence filter bar: LATAM / extra-LATAM / BOTH (three-state).
           A source shows if ANY of its subject_countries resolves to a selected region (REGIONAL=LATAM-side,
           GLOBAL=extra-side). Mixed sources show under whichever region(s) they touch (inclusive).
       (b) CATEGORY DROPDOWN CORRECTION: the "All categories" dropdown currently filters on the AI's
           freeform ai_category labels (Criminal & VNSA Activity / Extra-regional Supplier / etc.). Change
           it to filter on the canonical NINE CS SECTIONS + Incidents (via proposed_sections, the field
           routing uses). ai_category is LEFT ALONE for now (decision: revisit in AI-retune). Sections and
           ai_category are SEPARATE fields on the source.
       (c) PORT the Intelligence filter bar to the publication SOURCES tab, MINUS the reviewed/unreviewed
           control (committed sources -- that state doesn't apply). [Diagnose item 4 covered whether the bar
           is a shared component or NewsTab JSX -- follow that for reuse.]
     Needs its own read-only diagnose first (filter bar structure, category dropdown source+predicate,
     canonical sections field, Sources-tab current state) -- the diagnose was written; run it before build.
  2. ISSUE 3 -- STUCK-OPEN CARD BUG. A card (fixture: "Iranian drone display in Coral Gables", Cuba) stays
     EXPANDED across tab navigation and re-opens itself on return -- violates "views freeze where last used;
     cards default closed on restart". Hypothesis: a force-open effect on mount for cards with in-progress
     content, OR expand-state lost on remount. Read-only diagnose written; run before fixing.
  3. NEEDS-GEOGRAPHY LIST INDICATOR. Per-card prompt is DONE (scalar retired). Remaining: a list-level
     indicator/filter to FIND all empty-geography sources (the 12 hedges + any new empties) without opening
     each. Small; pairs naturally with Slice Y's region filter.
  4. AI-RETUNE (the upstream fix). The AI first-pass writes junk into BOTH geography (freeform "Middle East
     (Iran/Hormuz)", "N/A", "unknown/global") AND category (the ai_category taxonomy that doesn't match the
     canonical 9 sections). Retune analyze.ts to emit clean country names / sentinels for geography and the
     canonical sections -- so backfill never needs re-running and ai_category's parallel taxonomy is resolved.
     Touches src/main/ai/analyze.ts; connects to the token-efficient-AI standing rule.

STILL DEFERRED (unchanged): A2 (New Sources picker mount + dual-write); review-stage REGIONAL backfill;
  rule-6 cards_whole flip; two-level dynamic tab bar; REGIONAL->LATAM storage rename; per-cell (section x
  geography) geography divergence in Pre-Commit Review; country-as-actor / actor-role (supply-axis re-index).

▶ RESUME HERE (CURRENT, 2026-08-09 end -- geography backend COMPLETE; only Piece A/the picker remains) -> NEXT = PIECE A (the geography picker UI).

DONE + COMMITTED THIS SESSION (geography arc backend is now fully built and proven):
  - Slice 1 (committed): geography vocabulary module (src/main/geography.ts) -- resolver, unmapped surfacing.
  - Slice 2a (committed): route flip -- routeToNew/routeToNewSources consume subject_countries, emit
    country/region placements (cross product). PROVEN in cloud SQL.
  - Slice 2b PIECE B (committed 60e6117): geography-aware syncPlacements -- (section,geography)-keyed
    reconcile (cross product), per-geography delete narrowing, DECISION-B locked-collision BLOCK
    (review/committed pairs cannot be removed via a New Sources edit -> returns blocked:true, zero rows
    changed), the advance-to-review GEOGRAPHY GATE (countGeographyPlacements, called in sendSourceToReview
    + commitSourceRow), and REMOVED slice-1's [REGIONAL] empty-fallback (empty resolve -> [] -> gate blocks).
    ALL THREE self-test checks PASSED in the authoritative store (normal routing; per-geo delete keeps the
    sibling; locked row untouched). Verified via a throwaway in-app self-test harness, since removed.
  - COUNTRY->REGION TABLE (committed fe904b4): full 197-country map in geography.ts, 9 regions
    (LATAM / North America / Europe / MENA / Sub-Saharan Africa / Asia / Russia / Oceania / GLOBAL).
    Region type 'Middle East' renamed to 'MENA' (safe -- no external dependents). LATAM is flat (all Latin
    America + Caribbean, 33). getCountryUsageCounts (main-side, reads mirror) added + wired
    (ipc/preload/env.d.ts) for the picker's frequency ranking -- LIVE-TESTED via console, returns real
    per-country counts (Colombia 8, Mexico 4, ...). Two BOUNDARY CALLS flagged in-code as overridable:
    (a) Caucasus (Georgia/Armenia/Azerbaijan) -> MENA (could be Europe for Georgia/Armenia); (b) Sahel
    line (Sudan/Mauritania -> MENA/Arab-League; Chad/Mali/Niger -> Sub-Saharan). Alias map handles
    USA/UK/UAE/DRC/Ivory Coast/Burma/etc; normalizer-edge keys (Cote d'Ivoire, Guinea-Bissau, Timor-Leste,
    Bosnia and Herzegovina) verified to equal normalizeCountry() output exactly.

STANDING PRACTICE RULES ADDED THIS SESSION (committed 0b5221f): check existing UI/architecture before
  designing or building (a mockup of an existing screen is wasted work); no view remounts on actions
  (views freeze where last used -- background/optimistic updates only); token-efficient AI always (no
  redundant re-scans; cheapest model that does the job).

NEXT -- PIECE A (the geography picker UI; the FINAL geography-arc slice; DESIGN-FIRST / MOCKUP-FIRST):
  START by READING the ACTUAL current GeographyChips.tsx (src/renderer/src/pages/Intelligence/) before
  designing anything -- do not mock from memory (a mockup earlier this session reinvented a control that
  already existed; that mistake is why the "check existing UI first" rule exists).
  The picker (per decisions locked this session):
    - A two-part LATAM / extra-LATAM toggle (color-coded, e.g. orange LATAM / blue extra-LATAM; NOT mutually
      exclusive -- a source can carry both). Click a side, then the typeahead is scoped to that side's countries.
    - FREQUENCY-RANKED typeahead (3-4 suggestions drop down as you type), ranked via getCountryUsageCounts
      within the active scope. Region DERIVED from the pick (via COUNTRY_TO_REGION). NO popup -- inline
      anchored dropdown (dismisses on select/blur), matching the card's existing +country/+actor/+tag pattern.
    - REGIONAL and GLOBAL as separate selectable toggles (aggregation levels, not countries). REGIONAL = all-LATAM
      now; other region-level targets appear as populated. (Confirm: REGIONAL offers all-LATAM now, other regions
      as turned on.)
    - Built as an UPGRADE to the shared GeographyChips component, mounted in BOTH the Intel card AND the New
      Sources card (PipelineSourceCard) -- same picker both places. NOTE: REGIONAL/GLOBAL do NOT exist on the
      Intel side today (confirmed missing) -- introducing them into the Intel geography model is part of Piece A
      (decide where REGIONAL/GLOBAL store on the intel row -- likely as values in subject_countries, TBD).
    - WIRING (per the 2b diagnose): widen getSourcePipeline + the row type to carry subject_countries/mentioned/
      subGeo; add the parent handler in NewSourcesTab (mirrors onConfirmSections/onSetIncident prop pattern);
      an edit writes subject_countries (via existing updateCountries) AND re-runs the geography-aware
      syncPlacements (Option 1, locked -- both, so chips and placements stay coherent); keep it optimistic
      (no remount, per standing rule). Piece A also FOLDS IN the "re-read the whole article in New Sources"
      ask (chevron/expand to see full piece text, like Pre-Commit Review).
    - The GATE (from Piece B) means a source with zero geographies can't advance -- the picker is how the
      researcher satisfies it.

STILL DEFERRED (unchanged): review-stage REGIONAL backfill (pre-flip rows); rule-6 cards_whole flip (unblocked
  by 2a); two-level dynamic tab bar; REGIONAL->LATAM rename; country-as-actor as geography + actor-role
  classification (-> supply-axis re-index); Pre-Commit Review PER-CELL geography divergence (layer 3;
  New Sources stays source-level).

▶ RESUME HERE (CURRENT, 2026-08-09 late -- EXTENDS the slice-1+2a block below; locks the geography SELECTION model + reshapes the queue) -> NEXT BUILD = PIECE B (geography-aware syncPlacements + gate).

GEOGRAPHY SELECTION MODEL (locked with Dorian 2026-08-09, supersedes the "[REGIONAL] empty-fallback" framing):
  - GEOGRAPHY IS A HARD GATE, NOT A FALLBACK. No source advances from New Sources to Pre-Commit Review
    unless it carries >=1 geography -- exactly parallel to the existing section gate ("cannot leave New
    Sources without >=1 section"). Empty geography BLOCKS advance; it is NOT silently defaulted.
  - REMOVE slice-1's [REGIONAL] empty-fallback in resolvePlacementGeographies (src/main/geography.ts):
    empty resolve now stays EMPTY (-> blocked by the gate), never coerced to REGIONAL. Unmapped-only
    sources (e.g. Narnia) are BLOCKED -> researcher must select a real geography; the unmapped country
    surfaces (slice-1 already surfaces, does not swallow).
  - THE VOCABULARY / SELECTOR IS UNIFIED. One country typeahead searches the FULL world country list;
    region is DERIVED from the pick (Colombia->LATAM, China->Asia, Germany->Europe). There is NO
    LATAM-vs-extra-LATAM split in the UI -- picking Colombia is the same action as picking Germany.
    REGIONAL and GLOBAL are two special selectable toggles alongside the country typeahead (a chip you
    click, not a country you type). So a source's geography set = typed countries + optionally REGIONAL
    and/or GLOBAL, any combination (e.g. {Colombia, Venezuela, REGIONAL}).
  - REGIONAL and GLOBAL are AGGREGATION LEVELS, not sentinels:
      REGIONAL = all-LATAM. Driven (LATER) by region-level sources AND country-level analyses rolling up
        AND the change log (to see how the region trends). Selectable by researcher/AI as "the larger box
        that contains all boxes" -- a source can be {Colombia, REGIONAL} at once.
      GLOBAL = all extra-regional (and eventually all-regions rolled up). A periodic aggregate of all
        regions. Turned on LATER. When collection for other regions is on, regional-level meta-analyses
        get driven by their country-level analyses, same pattern as LATAM.
    NOTE: none of this roll-up/meta-analysis machinery is in Piece B -- for PLACEMENT purposes REGIONAL
    and GLOBAL are just geography VALUES like any country; the roll-up is the "turn on later" work.
  - FREQUENCY-RANKED TYPEAHEAD: typing "C" ranks matches by how often that country already appears in
    subject_countries across the corpus, so Contested Skies covers (Colombia/Chile/China) float above
    rare ones (Chad/Comoros). This is what lets ONE ~195-country list serve both the constant LATAM five
    and the occasional Germany without a mode switch. Pick-from-list also RETIRES the normalizeCountry
    hyphen/particle edge case for this path (Cote d'Ivoire is selected canonically, not typed-and-hoped).
  - THE FULL COUNTRY->REGION TABLE IS NOW MANDATORY (was "deferred, grow one line at a time"). Unifying
    LATAM + extra-LATAM selection through one typeahead requires the whole ~195-country list up front;
    a five-country autocomplete is pointless. Bounded static reference data; regions = LATAM / North
    America / Europe / Middle East (MENA) / Russia / Asia / (Africa) / GLOBAL. (Confirm the exact Tier-1
    region set when building -- Dorian named Europe, MENA, North America, Asia, Russia, LATAM, GLOBAL;
    Africa is implied by Chad/Cote d'Ivoire examples.)

RESHAPED GEOGRAPHY-ARC QUEUE (2a done; sequence locked):
  1. PIECE B [NEXT] -- geography-aware syncPlacements + the advance-to-review GEOGRAPHY GATE + remove the
     [REGIONAL] empty-fallback. Pure backend, indifferent to selector/vocabulary size. Signature becomes
     syncPlacements(articleId, infoPage, confirmedSections, confirmedGeographies): reconcile placements to
     the confirmedSections x confirmedGeographies CROSS PRODUCT (the edit-time twin of routeToNew's
     route-time cross product), STAGE-LOCKED per (section, geography) -- never delete/move review or
     committed rows. The section-only diff/delete/empty-floor all move from section-keyed to
     (section,geography)-keyed. Thread the new geographies arg through 4 declarations in lockstep (backend
     sig infoPageSources.ts:133, IPC handler ipc:4763 + pass-through 4768, preload index.ts:429, env.d.ts:929)
     + the renderer call site (NewSourcesTab handleConfirmSections:64). TEST SYNTHETICALLY AT SQL LEVEL
     (hand-set confirmed inputs, verify the right (section,geography) rows move, review/committed untouched)
     BEFORE any chip UI drives it.
  2. COUNTRY->REGION TABLE -- full ~195-country static reference + region mapping + the frequency-count
     query over subject_countries. Foundation for the unified selector. (Its own slice; does NOT block B.)
  3. PIECE A -- the chips + unified frequency-ranked country typeahead + REGIONAL/GLOBAL toggles, wired to
     handleConfirmSections and the gate. Reuse the EXISTING GeographyChips.tsx component (self-contained,
     props-in/onChange-out, liftable as-is per the 2b diagnose) -- do NOT build a new chip control. Also
     FOLD IN the "re-read the whole article in New Sources" UI ask (open the card to see full piece text).
     Wiring work: widen getSourcePipeline + the row type to carry subject_countries/mentioned/subGeo; add
     the parent handler in NewSourcesTab (mirrors existing onConfirmSections/onSetIncident prop pattern);
     edit writes subject_countries (via existing updateCountries) AND re-runs geography-aware syncPlacements
     (Option 1, locked) so chips and placements stay coherent; keep it optimistic (no remount, per standing rule).

KEY 2b DIAGNOSE FACTS (already gathered, still valid):
  - New Sources card = PipelineSourceCard.tsx (shared New Sources / Pre-Commit / All Sources); geography is
    a READ-ONLY pill "PIN {row.geography}" reading the legacy intelligence_sources.geography scalar -- NOT
    subject_countries, NOT the placement rows. SectionChips + IncidentChip on this card are already editable
    (gated on stage==='new'); geography has no such control.
  - GeographyChips.tsx (Intel) is reusable as-is; only parent plumbing is Intel-specific (data not fed in yet;
    onChange handler + optimistic state live in the parent; aiUnconfirmed/countriesTouched is NewsTab-local).
  - updateCountries (intel.ts:752) writes ONLY the three intel columns (subject/mentioned/sub_geographies),
    never placements. No existing writer turns a New Sources geography edit into placement rows -- that is
    exactly what Piece B's geography-aware syncPlacements provides.
  - handleConfirmSections (NewSourcesTab:64) currently does setRoutingConfirmed(sections) [a parallel
    section-only confirmed store on the intel row] + syncPlacements(sections) + optimistic setRows. Both
    section-keyed today. syncPlacements confirmed unchanged: reads select('section,stage'), section-keyed
    diff, geography-blind delete, geography:'REGIONAL' hardcoded add, stage-locks via toDelete-from-new-only
    + !lockedSections.has(s) (review+committed).

STILL DEFERRED (unchanged): review-stage REGIONAL backfill (pre-flip rows, e.g. fa96eea5 Argentina); rule-6
  cards_whole flip (now unblocked by 2a); two-level dynamic tab bar; REGIONAL->LATAM rename; country-as-actor
  as geography + actor-role classification (folded into supply-axis re-index); Pre-Commit Review PER-CELL
  (section x geography) geography divergence (the granular "layer 3" -- New Sources stays source-level per (i)).

▶ RESUME HERE (CURRENT, 2026-08-09 pm -- EXTENDS the geography-model block below; records slice progress) -> SLICE 1 + 2a DONE AND COMMITTED. Country routing is LIVE and proven in the authoritative store.

DONE THIS SESSION:
  - SLICE 1 (committed): src/main/geography.ts -- main-side geography vocabulary. COUNTRY_TO_REGION
    map (LATAM: Colombia/Mexico/Brazil/Argentina/Venezuela/Bolivia; Europe: Romania; other tier-1
    regions valid but unseeded), normalizeCountry (trim/collapse/title-case, match-normalization
    only -- NOT an alias map), COUNTRY_ALIASES (seeded EMPTY), resolveRegion, resolvePlacementGeographies.
    Decisions baked in: region derived not stored; placement stores COUNTRY NAME (decision A); REGIONAL
    is a deliberate selection, never an implied add; unmapped countries SURFACED not swallowed; empty-input
    fallback = [REGIONAL] ONLY when nothing resolves (unmapped-only stays empty geographies + surfaces the
    miss). KNOWN edge (decided leave-it): normalizeCountry title-cases on spaces only, so hyphen/particle
    countries (Guinea-Bissau, "and"/"of") need their COUNTRY_TO_REGION key written in exact normalized
    form or a COUNTRY_ALIASES entry -- documented, harmless with today's single-word vocab.
  - SLICE 2a (committed): the ROUTE FLIP. routeToNewSources (ipc/index.ts) now selects + parses
    subject_countries (categories_json try/catch idiom) and calls resolvePlacementGeographies; routeToNew
    (cloud/infoPageSources.ts) gained a geographies param (default ['REGIONAL']) and writes the
    seedSections x geographies CROSS PRODUCT instead of hardcoded 'REGIONAL'. Unmapped countries -> console.warn
    (interim "researcher made aware" hook; real UI surface comes with the New Sources chips, below). onConflict
    unchanged (geography already in PK). syncPlacements LEFT UNTOUCHED (still REGIONAL-hardcoded, section-keyed).

  PROVEN IN CLOUD SQL (authoritative store, all cases): single LATAM country -> country rows (Colombia, Brazil);
  TWO countries -> full cross product, both country rows per section (Mexico+Colombia Guardian piece); EXTRA-LATAM
  -> Romania rows (Ukraine in same source correctly dropped as unmapped); unmapped-only (Narnia) -> REGIONAL
  fallback. The code was never buggy: the early "REGIONAL" failures were STALE PRE-FLIP rows (added_at 2026-08-07)
  that ignoreDuplicates:true refused to overwrite -- fixed by move-back-to-intel + re-route (app-own writer).
  LESSON: onConflict ignoreDuplicates:true means re-routing an already-placed source will NOT rewrite its
  geography; to re-test routing on a source, back it out to intel (or clear its 'new' rows) first.

NEW OBSERVATIONS THIS SESSION (both queued, neither built):
  - NEW SOURCES GEOGRAPHY MUST BECOME EDITABLE CHIPS (feeds SLICE 2b). Today the New Sources card shows a
    SINGLE cosmetic "primary geography" pill that is NOT wired to the real placement rows. Locked spec: REPLACE
    that single pill with editable per-geography CHIPS that ARE the placement geographies -- add/remove rewrites
    info_page_sources. This is the geography-editing SEAM, and it is exactly the contract SLICE 2b's syncPlacements
    rewrite needs (its 'confirmed' input becomes (section, geography) pairs sourced from these chips). Display and
    truth become the same thing. Design-first / mockup-first (new UI surface).
  - BUG: MOVE-BACK-TO-INTEL SCROLL JUMP. Moving an article back to intel reloads the page and jumps to top.
    Almost certainly the documented success-path-reload failure mode (canvas/list unmounts on a full load()
    instead of load({background:true})). Small fix expected, but needs a READ-ONLY DIAGNOSE of the move-back
    handler's reload path first (is it load() without background? a remount? the removeAllListeners trap?).

QUEUE (recommended order):
  (a) [NEXT, quick] Move-back-to-intel scroll-jump fix. Diagnose-then-fix; known bug class.
  (b) SLICE 2b + New Sources editable geography chips (the big one; design-first/mockup-first): multi-geography
      syncPlacements (read + partition + toAdd/toDelete + delete filter + empty-floor all move from section-keyed
      to (section,geography)-keyed; 'confirmed' carries geography) WIRED to the chip UI above.
  (c) COUNTRY-AS-ACTOR modeling thread (Dorian-raised): actor chips list COUNTRIES (Russia, US, EU, NATO)
      distinct from subject_countries. Question: should a country-as-ACTOR (supplier/intervenor) influence
      routing or the EXTRA-LATAM tree, vs staying pure metadata? Feeds the deferred supply-axis re-index.
  DEFERRED (still): backfill of REVIEW-STAGE REGIONAL rows -- sources routed pre-flip, stuck at REGIONAL/review
      (e.g. fa96eea5 ["Argentina"], 354fbbfe/8e982771 ["Colombia"]); a later slice re-homes 'new'-safe rows to
      their country (must respect stage: never touch review/committed without a deliberate migration). Rule-6 flip
      (cards_whole COUNTRY-unless-cross-country) still inert-until-routing, now UNBLOCKED by 2a. Two-level dynamic
      tab bar (slice 4). REGIONAL -> LATAM rename (future normalization).

▶ RESUME HERE (CURRENT, 2026-08-09 -- EXTENDS the 2026-08-08 verdict below; supersedes only its three-slice arc SHAPE) -> GEOGRAPHY MODEL LOCKED. Design arc, not a string-flip.

WHAT STILL HOLDS from 2026-08-08 (unchanged): no import; the country content grid exists
(Colombia/Mexico/Brazil/Argentina/Venezuela + REGIONAL = 43 live cells); the real gap is ROUTING
(routeToNew/syncPlacements hardcode geography='REGIONAL'); seed is destructive, never re-run.
WHAT CHANGES: the FIX is no longer "flip a string" -- geography becomes a multi-region tree, and
the arc reorders. The "reshaped geography arc: routing flip -> rule-6 -> tabs" three-slice framing
in the block below is SUPERSEDED by the arc order at the bottom of THIS block.

THE GEOGRAPHY MODEL (locked with Dorian 2026-08-09):
  - Geography is a TWO-LEVEL TREE: REGION -> optional COUNTRY. A placement is region+optional-country.
    Examples: LATAM/Colombia (country-specific), LATAM (whole-region), Europe/Germany, Europe (whole-region).
  - EVERY REGION OWNS A SYNTHESIS CELL (a region-level "REGIONAL" cell), driven either by its countries'
    content rolling up OR by whole-region sources filed directly at region level -- same dual model LATAM
    has today. Each region also gets its OWN PAGE eventually (region-level description like LATAM's).
  - TIER-1 REGIONS: LATAM, North America, Europe, Middle East, Russia, Asia, + GLOBAL (GLOBAL reserved
    now, for a future country/region -> Global aggregator page). LATAM is the focus region; EVERYTHING
    ELSE IS EXTRA-LATAM. "EXTRA-LATAM" = defined by not-being-the-focus-region, NOT by section-04
    "extra-regional influence" (distinct concept).
  - REGION IS DERIVED FROM COUNTRY VIA A CODE-SIDE LOOKUP, not stored. Placement geography stays the
    country string (e.g. 'Germany'); a canonical countryToRegion map in code yields the region (Europe).
    NO region column (would be redundant + can desync; region is always a deterministic function of country).
    Adding a country later = one line in the map, no migration.
  - CANONICAL COUNTRY VOCABULARY is the foundation: subject_countries is currently UNENFORCED FREE TEXT
    (cleanCountryList only trims/dedupes/caps -- no alias map, no whitelist). The model needs a canonical
    country list with region baked in; anything unmatched must SURFACE as "unmapped", never silently vanish.
  - TAB BAR IS DYNAMIC / POPULATED-ONLY: tabs render only where placements exist (the tree is the POSSIBLE
    structure; tabs show the POPULATED structure). Page-content geography axis: EXTRA-LATAM selected ->
    shows populated sub-regions (North America/Europe/Middle East/Russia/Asia) -> click opens populated
    countries -> same NINE sections. ALL LATAM selected -> shows populated LATAM countries.
  - "NO GEOGRAPHY" DISSOLVES: almost everything is SOME geography once the world is in the tree (a global
    CUAS piece = GLOBAL/EXTRA-LATAM, not nowhere). Genuinely placeless reference (e.g. drone physics) stays
    the design-doc section-3 "relevant source, no page change, lands in archive" case -- NO null-geography
    value is introduced.
  - SECTIONS = NINE (Systems, VNSA, Industry, External, Supply, Investment, Regulatory, Civilian, Logistics).
    INCIDENTS stay a PARALLEL structured table (own country column, getIncidents publication.ts:123), NOT a
    tenth section. (Dorian's "10th = incident" is the parallel table, already modeled.)

GEOGRAPHY IS SET ON THE INTELLIGENCE SIDE, not in the publication pipeline (corrects earlier framing):
  - AI proposes geography at capture; researcher reviews/corrects on the item card (News has geo + sub-region
    selection today; Social/Documents/Interviews MUST get the same, uniform). By the time a source is ROUTED,
    geography is DECIDED. New Sources = last editable seam. Pre-Commit Review = geography LOCKED (tabs set,
    no geo editing there).
  - So the flip does NOT build a geo control in publication -- it (a) ensures AI proposes REGIONAL + EXTRA-LATAM
    candidates (AI likely does not check REGIONAL today), (b) unifies the geo+sub-region control across all four
    capture types, (c) routing consumes the already-set set.

ROUTING FACTS (from 2026-08-09 diagnose, still valid):
  - subject_countries = top-level JSON string[] column on intelligence_sources (NOT in analysis_json); mirrored;
    "only subject_countries generate placements; mentioned = metadata" (db.ts:987).
  - THREE edit sites, no shared helper: routeToNewSources (ipc:3301, currently selects only id/type/analysis_json
    -- must also select+parse subject_countries), routeToNew (infoPageSources.ts:92), syncPlacements (:159). The
    hardcode geography:'REGIONAL' is duplicated in the latter two.
  - SCHEMA ALREADY SUPPORTS multi-geography: info_page_sources UNIQUE(article_id,info_page,section,geography) --
    geography is IN the key, so vnsa|Colombia + vnsa|REGIONAL for one source are two legal rows. NO migration to
    write country/region placements. (Confirm cloud carries the same unique index -- SQL pending.)
  - NO derivation exists anywhere: REGIONAL is a directly-authored placement target; nothing rolls country changes
    up into it. The region-synthesis roll-up is design-doc spine, NOT in code -- a later slice.

RESOLVER RULE (locked): placements = confirmed-geography-set x sections. AI pre-proposes matched countries (+ their
regions via lookup) + REGIONAL/EXTRA-LATAM candidates; researcher edits (Intelligence side); each confirmed geography
is a normal toggle, never a silent fallback. A source may carry country geographies AND region-level geographies at
once (e.g. LATAM/Colombia + LATAM/Venezuela + LATAM regional).

REORDERED ARC (dependency order -- vocabulary is now the foundation, NOT the routing flip):
  1. GEOGRAPHY VOCABULARY + REGION TREE (code lookup: canonical country list, countryToRegion map, GLOBAL reserved,
     "unmapped" surfacing). Foundation, no UI. Seeded from the live distinct subject_countries set (SQL below).
  2. RESOLVER + ROUTING FLIP (three sites above; consumes the vocabulary; expands sections x confirmed-geographies).
     Country routing tested end-to-end in cloud SQL before commit.
  3. INTELLIGENCE CAPTURE-CARD GEOGRAPHY (design-first / mockup-first): unified geo+sub-region across News/Social/
     Documents/Interviews; AI proposes LATAM countries + EXTRA-LATAM regions/countries + REGIONAL.
  4. TWO-LEVEL DYNAMIC TAB BAR on page content (region tier -> populated countries; nine-section rail unchanged).
  5. TAIL: rule-6 flip (cards_whole COUNTRY-unless-cross-country, inert until routing lands); New Sources CARD-EXPAND
     (chevron to open full card + original piece text, same as Pre-Commit Review -- additive); then P4b/incidents/
     P5 publish/P6-P7 ledger per the unified spine.

KNOWN FUTURE NORMALIZATIONS (noted, NOT current tasks):
  - RENAME geography='REGIONAL' -> 'LATAM' (today's REGIONAL literally means LATAM-regional). Deferred: 43 cells +
    20 placements say REGIONAL; keep that meaning until there's reason to generalize. Dorian: "regional must be
    renamed to LATAM eventually."
  - Extra-regional sub-labels + the supply-axis (CN/IL/TR/US) re-index (design doc 7.4) get designed TOGETHER with
    the EXTRA-LATAM tree, same shape of problem.

FIRST CONCRETE STEP: run the two SQLs -- (i) confirm cloud UNIQUE constraint on info_page_sources; (ii) DISTINCT
subject_countries (doubles as the seed inventory for the canonical country vocabulary). Then slice 1 (vocabulary+tree).

▶ RESUME HERE (CURRENT, 2026-08-08 -- SUPERSEDES the import-first geography framing below) -> RECONCILIATION DIAGNOSE DONE. VERDICT: NO IMPORT.

WHAT THE DIAGNOSE SETTLED (six-part reconciliation + full JSON + live SQL, 2026-08-08):
  - The country content grid ALREADY EXISTS. Live section_texts by geography:
    Colombia 9 / Mexico 9 / Brazil 7 / Argentina 5 / Venezuela 4 / REGIONAL 9 = 43 live cells.
    Cards (73), outline (344), citations (189) all reconcile EXACTLY to contested-skies-cells-full.json.
    => P0 committed the FULL 55-cell country file, geography-preserved. It was NOT REGIONAL-only.
  - THE "P0 only imported REGIONAL / flattened" PREMISE (in the kickoff-findings + resume blocks
    below) IS WRONG and is CORRECTED here. Nothing was ever flattened at seed time. The seed
    (scripts/p0-seed-publication.mjs:86) carries cell.geography verbatim.
  - THE REAL GAP IS ROUTING, NOT CONTENT. routeToNew + syncPlacements (infoPageSources.ts:92,159)
    hardcode geography='REGIONAL' -- a leftover placeholder from before country cells existed, NOT a
    design choice. A NEW incoming source can never be PLACED into an existing country cell; every
    info_page_sources placement is section|REGIONAL (confirmed: zero non-REGIONAL placements). The
    country drawers exist; the mail sorter only knows the REGIONAL drawer. Content grid != placement layer.
  - SEED IS DESTRUCTIVE, NEVER RE-RUN IT: p0-seed's --commit path clearTable()s all four tables
    (:206-210) then re-inserts. Re-running it would WIPE the live store (P2/P3/P4c edits included).
    Moot now (no import) but recorded as a permanent guardrail.

CONSEQUENCES:
  - THE IMPORT SLICE IS DELETED. contested-skies-cells-full.json comes OFF the plan (kept as the
    seed's reference artifact only). Kickoff-findings items 2-5 and the resume-(1) import block below
    are SUPERSEDED by this verdict.
  - DECISION (b) [replace REGIONAL cards] DISSOLVED -- no import, so nothing to delete/replace.
    REGIONAL stays exactly as the app has edited it since P2 (the JSON's REGIONAL is now the STALER copy).
  - DECISION (a) [fold extra-regional into REGIONAL] still POLICY but DEFERRED and re-scoped: the
    extra-regional content in-store is outline rows (China/Israel/Ukraine/US/GLOBAL/CostaRica/Syria/
    Lebanon/Turkey) + 1 Panama/logistics card + 0 narratives + 0 citations. Folding = a RE-KEY of
    existing rows to REGIONAL, NOT an import. Belongs with the deferred supply-axis re-index (design
    doc 7.4), not this arc. Low priority (outline not edit-surfaced yet).
  - REGIONAL test-card cleanup: LEAVE AS-IS (decided B). 3 local-admin REGIONAL cards from P2/P3/P4c
    verification: vnsa pos4 "5->107->233->260 drone attacks in Mexico" (an ADDITION, +1 vs seed; a
    MEXICO figure that will RE-HOME to Mexico/vnsa in the arc, not be deleted), and legal pos8 "250 g"
    + systems pos3 "-22F to 122F" (in-place EDITS over seed cards -- restore-or-leave is a per-card
    editorial call, not a mechanical purge). Reconcile in-context when the review/CellGrid screen
    surfaces REGIONAL.

THE GEOGRAPHY ARC, RESHAPED (import gone; DESIGN-FIRST / MOCKUP-FIRST; needs its OWN routing-layer
diagnose of routeToNew/syncPlacements + the subject_countries field BEFORE any build):
  (1) ROUTING FLIP [FOUNDATION]: routeToNew/syncPlacements read the source's subject_countries and
      seed country placements (section|Colombia etc.) instead of hardcoded section|REGIONAL. Open
      design Qs for the diagnose+mockup: does a Colombia+Mexico source place into BOTH country cells?
      does it ALSO place into REGIONAL, or does REGIONAL DERIVE later per the synthesis-layer spine?
      what vocabulary does subject_countries use, and does it match the grid's country names?
  (2) RULE-6 FLIP: in cards_whole, "REGIONAL unless country-specific" -> "COUNTRY unless genuinely
      cross-country / aggregate". INERT until (1) lands.
  (3) REVIEW-SCREEN COUNTRY TABS: pre-commit review gains the geography axis so a Colombia source
      shows a Colombia tab. DEPENDS on (1).
  Then: per-card UNDO (backlogged), P4b (per-hunk narrative accept), INCIDENT acceptance, P5 (publish
  transaction), P6/P7 (Recent Changes + all-sources search -- the ledger derivations per the UNIFIED SPINE).

**★ ACTIVE: DOWNSTREAM PUBLICATION ARC — P0 (seed) mid-flight**

CONTEXT: NS-2 complete (New Sources sectioning works end-to-end). The intel→page pipeline is done;
now building the PUBLICATION side — turning committed placements into editable page content and
eventually a live publish. Design docs: PublicationProcess.md + contested-skies_publication-pipeline-design.md
(both in /mnt/project, written pre-restructure so partly stale — steps 1-2 of their build order are
already DONE by the restructure).

LOCKED DECISIONS (this session):
  - English-only v1 (section_texts.lang keeps ES/PT reachable). Diff editor must show full text (chevron
    to expand) with new=yellow highlight, deleted=red strikeout, changed-context=blue.
  - Publish target repo EXISTS: Doriankantor/contested-skies-monitor (Vite/React SPA, content currently
    FUSED into JSX markup — not a data object).
  - ARCHITECTURE = Option B (headless content): page content lives in DB (editable/versioned), the page
    becomes a RENDERER of that content, layout/design stays hand-built and is NEVER regenerated/risked by
    publish. Publish writes content data, not JSX. This is the SAFE model — publish can't degrade the design.
  - Single researcher; publish + cull gated to Board Heads (no concurrency/soft-lock needed v1).
  - Seed cells from the CURRENT page content (via the Cowork session that created the page — cleaner than
    scraping JSX).

CONTENT MODEL (4 types per cell, cell = geography × section):
  - narrative → section_texts (existing step-1 table; body/lang/version columns; section_KEY not section)
  - cards (key figures) → cards (existing step-1 table; headline/detail/confidence)
  - outline (structured named-item lists) → section_items (NEW table, created this session)
  - citations (section-level source refs) → section_citations (NEW table, created this session)

SCHEMA DONE THIS SESSION:
  - sql/2026-08-04-p0-outline-citations-tables.sql (committed 242b857): created section_items (hybrid —
    columns heading/label/detail/status/operator/origin/conf + attrs JSONB for section-specific extras
    supplier/channel/instrument/kind/figure/date + position/active) and section_citations (geography/
    section_key/what/where_ref/position; 'where'→'where_ref' because where is a SQL keyword). BOTH applied
    in cloud, verified. CLOUD-ONLY — the 4 publication tables (section_texts/cards/section_items/
    section_citations) are GREENFIELD: no mirror CREATEs, no read path anywhere in src yet. Mirror-vs-cloud
    read decision deferred to P1 (when the grid's read path is built).

✅ P0 — DONE. Publication tables seeded from the Cowork export, verified in the Supabase SQL editor (the
  authoritative store, NOT the script's self-report): section_texts=43, cards=73, section_items=344,
  section_citations=189, items-with-attrs=169. Script + seed JSON committed (caf803c). Path normalized
  "scripts/Data " → scripts/data/ (trailing-space Finder artifact; fallback now dead code, left as an
  inert safety net). Script hardened: tiered exit codes (counts → exit 1 hard; spot-checks → exit 2 soft,
  machine-distinguishable) and spot-check B retargeted from REGIONAL/systems (a false 0-attrs witness) to
  REGIONAL/external (14/14 attrs). LESSON: Claude Code's git session reported "tables empty" AFTER a
  successful --commit — a stale guess from a process with no cloud visibility; caught by direct count
  query. Same phantom-test class as the security false-PASS: verify in the authoritative store, never
  trust a process's self-narration about a store it can't see.

✅ P1 — DONE (read-only publication cell grid).
  - P1a (d56371b): READ PATH, cloud-direct. src/main/cloud/publication.ts getGrid() gated on
    board-info-latam membership via isBoardVisibleFor; four cloud selects via Promise.all, no mirror.
    IPC/preload/env.d.ts wiring. Verified in-app 43/73/344/189.
  - P1b (1f8719d): cell GRID in the app's design, mockup layout. New sectionColors.ts (9-key section→hex
    from AUTHORITATIVE P.CATS in info-pages/contested-skies/index.html — vnsa #f45f78, logistics #e889c4
    differ from the mockup fallback). CellGridTab: geography tab bar (LATAM + supplier-axis grouped/flagged
    pending re-index) / 9-section rail / four content boxes per cell (SectionText / Cards-as-tiles-with-
    left-accent-bar / Outline-grouped-by-heading-with-attr-chips / Citations-REGIONAL-only) as edit-ready
    sub-components, READ-ONLY. Card headline color moved to a left-accent bar (neon P.CATS palette failed
    contrast on light surfaces).
  - P1c (ff08032): full-width flow. Left InfoPagesList DEFAULTS COLLAPSED (localStorage
    infopages-list-collapsed, '0'=expanded) with a high-contrast toggle; right InfoPageStatus panel
    REMOVED, its content relocated to an inline header status strip (freshness dot / published date /
    pending pill / view-live ghost button). KNOWN DELIBERATE NON-FIX: both the toggle and strip live in the
    selectedPage-gated header, so a genuine no-page state has no list re-open control — unreachable in
    practice (auto-select picks the first page whenever any exists); left as-is for v1. CLEANUP DEFERRED:
    InfoPageStatus.tsx is now ORPHANED (only a stale doc comment in FrameworkPanel.tsx references it) —
    safe to delete in a later cleanup. TODO: freshness (getLastCommit) is now fetched in BOTH index.tsx and
    InfoPagesList — dedupe deferred to its own slice.
  - P1d (ba5017d): drag-resizable section rail. Ported the Workspace archived-drawer drag idiom horizontal
    + localStorage-persisted width (infopages-cellgrid-rail-width, clamp 56-280px, default 208). Below
    120px the label+count hide leaving dot+number centered, label recoverable as a hover tooltip;
    section-color dot is the narrow-state identifier.
  - DESIGN DECISIONS LOCKED (P1): aesthetic = app design (Tailwind indigo/gray), NOT the mockup's
    teal/serif — only per-section color carried as an accent. P1 grid is a read-only BROWSE of the whole
    seeded grid (all geos as tabs, all 9 sections), NOT the mockup's single-source review screen; the
    review/edit/AI-integrate/diff/approve machinery is P2-P5, layering onto these same boxes. The four
    publication tables remain CLOUD-ONLY (no mirror) — P1 reads cloud-direct; mirror-vs-cloud stays
    deferred until a concrete need (offline, or a mirror JOIN) forces it.

✅ P2 — DONE (versioned direct-edit of section_texts).
  - P2 (619671e): versioned direct-edit of section_texts — FIRST publication WRITE, turns the dormant
    versioning columns on. New writeSection cloud writer in publication.ts: reads live row (superseded_by
    IS NULL), refuses >1-live-row repair case, INSERTS new version first (version+1, updated_by=actor) then
    SUPERSEDES old (stamps prev.superseded_by=new.id) — insert-first so a failed write never orphans
    content. Head-gated: publication:writeSection IPC uses isOwner(board-info-latam) (canApprove tier, same
    as reviewCommit) — only Heads edit page text; read stays membership-tier. MANDATORY companion read-fix:
    getGrid/readTable now reads section_texts live-version-only (.is('superseded_by', null)) so multi-
    version cells don't double-render; other three tables unfiltered (cards get active/replaced_by in P3).
    SectionTextBox gained an Edit affordance (textarea/Save/Cancel, re-loads grid on ok, inline error on
    fail); edit-button gating = SERVER-ONLY (no cheap correct renderer Head signal existed — isRoot too
    narrow, isOwner an async fetch on wrong id; server gate + inline error is the sanctioned fallback). lang
    hardcoded 'en'; edit shown only where narrative already exists (empty-cell authoring is later). VERIFIED
    in authoritative store: version chain 44->87->88 across two sequential edits, each superseding the
    then-live row (not the seed), live_rows=1, updated_by stamped.
  - DECISION LOCKED (P2): page-text editing and publishing are the SAME permission tier — Heads only
    (isOwner). Members view (P1a read = membership), Heads edit (P2) and will publish (P5). Not
    members-edit/Heads-publish.
  - KNOWN, non-blocking (for P6): updated_by writes the acting-user id, which in the dev session is
    'local-admin' (root/infra admin string), NOT a board_members identity. The P6 change-history view will
    need to resolve updated_by to real member names for the audit trail. Flagged, not a P2 problem.

✅ P3 — DONE (editable cards, the 12-slot replace flow).
  - P3 (a801c86): SECOND publication WRITE slice — turns cards' active/replaced_by columns on (the cards
    analogue of section_texts' version/superseded_by). Four cloud writers in publication.ts, all Head-gated
    (isOwner(board-info-latam) via the factored denyIfNotHead helper, same gate as writeSection), insert-
    first/flip-second so a failed write never loses a card:
      - addCard: inserts at next dense position; HARD CEILING refuses at 12 active with {full:true}
        (signals the eviction picker, not a plain error).
      - editCard: in-place versioned edit — insert new active at same position, flip old active=false
        replaced_by=new.id.
      - replaceCard: the eviction op — insert new at the VICTIM's position, flip victim. Net active count
        unchanged (one in, one out).
      - deleteCard: soft (active=false, replaced_by stays null). Leaves a position GAP by design — no
        renumber (would be N un-atomic writes); CardsBox sorts by position so gaps don't break rendering.
    SLOT MODEL LOCKED: Option A (count-enforced). slot_kind stays null; 12-max by active count; position is
    a dense 1-based rank. Option B (typed slots) reachable later via the existing slot_kind column, no
    migration. Companion read-fix: getGrid/readTable reads cards active=true only (parallel to P2's
    section_texts superseded_by IS NULL). section_items/section_citations still unfiltered (P4+).
    CardsBox editable: sort-by-position, Add-card header action, per-tile Edit/two-step Delete on hover, and
    the EVICTION PICKER — when addCard returns {full:true} the typed draft is held in state (never re-typed)
    and the user picks which of 12 to replace. Edit gating = server-only (same as P2).
  - SCROLL-JUMP FIX (bundled): card/text saves previously called load() which set loading=true, hitting the
    spinner early-return that UNMOUNTED the canvas and reset scroll. Split load({background?}) — background
    reload skips setLoading, so the canvas stays mounted and scrollTop survives. The {background:true}
    pattern from the WAL-echo architecture note. Applied to BOTH CardsBox and SectionTextBox onSaved (also
    improves P2's text edit). Retry button rewrapped () => load() so the click event isn't read as opts.
  - VERIFIED in authoritative store: ceiling query (active>12) returns zero rows; edit chain 76->148->149
    at one position; eviction one-in-one-out; live cell clean after test-card cleanup. Inactive test rows
    left in table as harmless history (never render; soft-delete is the audit trail P6 will surface).

✅ P4a — IN PROGRESS (the pre-commit review screen: read-only proposal generation + diff view; accept
  flow = P4a-2b, NOT built). P4a is the reconciliation loop's read side — AI reconciles each touched cell
  and the screen shows a per-cell before/after diff. This session shipped the detour + P4a-1 + P4a-2 +
  prompt tuning, plus the whole INCIDENTS Slice 1 container. Records below.

  • ANALYZE IMPROVEMENT (detour, committed earlier this session): strip HTML before the analysis cap +
    raised cap 8000->18000, and fixed the duplicate-capability collision (composite system+actor keying,
    render-key fix). Surfaced by an AI bake-off (Haiku vs GPT-5.6 Luna) — Luna lost on structured
    extraction (empty capabilities, article_type "other"); Haiku stays the model. The bake-off also
    revealed long sources were read at 1/3 (23.5k CSIS article -> 8k cap, ~29% HTML waste). Post-fix:
    CSIS analysis went 2->7 capabilities, regulatory tail captured. Bake-off harness is
    scripts/ai-bakeoff.mjs (throwaway, untracked, not committed).

  • P4a-1 (committed earlier): pre-commit review proposal GENERATION. New analyze.ts 'integrate' task
    (current cell text + source -> reconciled section text, per-cell, divergence flag) + normalizeIntegrate;
    fire-and-forget generation on new->review writes proposal_json per touched cell (original+proposed body,
    status ready/nochange/error); backSourceToNew clears proposals.

  • P4a-2 (commit 3527a5d): pre-commit review SCREEN. Top article dropdown; left rail shows 9 sections with
    markers on those the source changes; per-cell before/after diff (diffWords on stripped prose, green add /
    red-strike delete); full-source expand shows AI analysis + raw article text. Box extracted to
    cellPrimitives (shared w/ CellGridTab). diff dep added. Read-only (accept/edit buttons = P4a-2b, not
    built).

  • PROMPT TUNING (commit 78ca6b8): integrate prompt made conservative/incremental. Narratives are
    analytical assessments not event logs: default no_material_change; events don't change narrative unless
    they reveal a new analytical fact; REGIONAL cells strongly default unchanged for local events; surgical
    edits only. Fixed wholesale-dump. KNOWN: a single incident's event-detail could still leak into the
    fuzziest narrative section because incidents had no route — RESOLVED by incidents Slice 1 (event now
    routes to the incident container).

  • INCIDENTS DESIGN (locked this session): incidents are the 10th CONTAINER, peer to the 9 sections,
    keyed by (event-)geography, source-linked. An incident-reporting source ALWAYS generates a structured
    incident record (where/what/platform/who), homed to the EVENT's own country (from extracted location,
    NOT the source's section-routing). INDEPENDENTLY, the source may change narrative containers via the
    integrate flow — but usually doesn't; populating the incident implies nothing about the others. Incident
    feed = structured queryable dataset (option C): typed columns for later aggregation/mapping. Incidents
    table is a STANDALONE cloud-only table (not the (geo,section_key) grid shape), columns: id, event_date,
    country, verification, title, summary, location, actor, actor_type, system, casualties (single int),
    source_id, dedup_key, created_by/at.

  • INCIDENTS SLICE 1 (commits d1de8fb sql, 44e1163 code, 72d80fc poll): the incident container — schema +
    AI generation. analyze.ts 'incident' task (source -> normalized country geography + fine-grained
    location + discrete-event casualty scope + actor/system/summary) + normalizeIncident; generation on
    new->review gated on the INCIDENT article-type flag, homed to event's own country, idempotent via
    dedup_key (source_id+country+date); runs ALONGSIDE narrative proposals. Also PARALLELIZED all generation
    (Promise.allSettled over per-cell narrative + incident calls, distinct row writes, ~50s->~13s) and added
    POLL-while-generating in PreCommitReviewTab (bounded 3s background-refetch, stops when resolved, caps
    out, cleans up) so the screen shows completion without a tab remount. VERIFIED in-DB: Catatumbo ->
    Colombia incident, casualties=1 (discrete Filogringo event, NOT the 39-attack/32-wounded campaign
    aggregate — scope integrity holds), fine location preserved, dedup=1 across re-routes.

  • INCIDENTS SLICE 2 (commit 2f06c40): researcher confirms the incident flag in New Sources. Three-state
    IncidentChip control (confirm / not an incident / mark as incident), mirroring the section-chip
    confirmation pattern, on PipelineSourceCard/NewSourcesTab. New setIncidentFlag (intel.ts) persists the
    decision as human.incident (boolean, + incident_at) under analysis_json.human — modeled on
    setHumanRelevance: cloud-authoritative read, sibling-preserving merge (survives an Analyze re-run that
    replaces analysis.ai wholesale), mirror resync. resolveAnalysis extended to merge the incident flag
    (human-over-AI). BUG FIXED: the incident generation gate was reading the RAW AI article_type instead of
    the resolved human-over-AI flag, so "Not an incident" was ignored and generation fired anyway. Gate now
    reads the resolved boolean (human wins if set, else AI). Gate ALSO deletes any existing incident row when
    resolved not-incident (so suppressing an already-generated incident REMOVES it, not just skips
    regeneration — backSourceToNew only covered the review->new path, not re-route-while-suppressed).
    VERIFIED in-DB: suppress->0 (no new generation), confirm->1 (generates), suppress-with-existing-row->0
    (row deleted). Three states all work: AI-incident+no-override generates; AI-incident+"not an incident"
    skips; AI-not-incident+"mark as incident" forces.

  • INCIDENTS SLICE 3 (commit 3372212): surface incidents in Page Content (READ-ONLY). New getIncidents cloud
    getter in publication.ts (cloud-direct, behind the SAME isBoardVisibleFor('board-info-latam') gate as
    getGrid; incidents is cloud-only/unmirrored). Geography filter: REGIONAL AGGREGATES all LATAM incidents
    (country NOT IN the supplier-axis set — United States, China, GLOBAL, Ukraine, Israel, Lebanon, Syria,
    Turkey, Costa Rica — so literal-REGIONAL + all LATAM-country incidents show under ALL LATAM); any other
    geography = exact country match; ordered event_date desc. Wired IPC publication:getIncidents -> preload ->
    env.d.ts like getGrid. Incidents rendered as a 10TH RAIL SENTINEL in CellGridTab (INCIDENTS_VIEW=
    '__incidents__', kept OUT of SECTION_ORDER; guarded in sectionNo/sectionColor/typeCount; EXCLUDED from the
    auto-jump-to-first-populated-section logic so it never auto-lands, only on explicit click; shown only for
    mainGeos+REGIONAL, never supplier-axis tabs). Canvas branches to an incident FEED panel (chronological,
    event_date desc) with cards showing date/title/location/actor+type/system/casualties/verification badge/
    summary, plus loading/empty/error states. VERIFIED in-app: Colombia shows the Catatumbo incident, REGIONAL
    aggregates it too, supplier tabs have no Incidents entry. Read-only — no edit/accept/delete; editing/
    routing is Slice 4.

  • DECISIONS LOCKED (Slice 3): (1) REGIONAL = aggregate-scoped-to-LATAM (not literal country='REGIONAL'
    only). (2) The incidents.country vs grid-geography match is a SOFT CONVENTION (both intend bare English
    country names / REGIONAL, but nothing enforces it — a country the model spells differently silently
    orphans); accepted for v1, HARDENING (whitelist the incident extraction to the grid vocab) is BACKLOGGED.
    (3) Incident feed renders only for mainGeos + REGIONAL, not supplier-axis geographies.

  • INCIDENTS SLICE 4 (commit 74ea9d9): render the source's proposed incident in Pre-Commit Review, alongside
    the narrative diffs (READ-ONLY; accept/edit is P4a-2b). New getIncidentBySource getter (by source_id,
    cloud-direct, board-gated — the review screen shows THIS source's proposed incident, vs Slice 3's
    getIncidents-by-geography committed feed). Extracted IncidentCard/VerificationBadge to shared
    incidentCard.tsx (CellGridTab + PreCommitReviewTab render the identical card). Incidents sentinel in the
    review rail (reimplemented for PreCommit's sectionState model, NOT imported from CellGridTab; shown ONLY
    when the source has an incident, mirroring how ! markers only appear on changed sections). Canvas renders
    the incident card read-only when the sentinel is selected. Incident refetch PIGGYBACKED on the existing
    generating-poll so a still-generating incident converges (sentinel appears) without a manual reselect.
    Auto-jump: if the source has an incident (resolveIncident sync flag) AND no ready narrative section, opens
    on the Incidents view (pure-incident sources open on their incident); else the existing section-first jump.
    VERIFIED in-app: Catatumbo source shows the Incidents sentinel + card in review alongside the narrative
    diffs; Page Content feed still renders after the extraction. Closes the three-way reconciliation loop
    (narrative / incident / nothing).

  *** INCIDENTS ARC COMPLETE *** All four slices done: Slice 1 generate (analyze.ts incident task,
    geography-homed to event country, discrete-event casualty scope, dedup, parallelized), Slice 2 researcher
    gate (IncidentChip 3-state, human.incident override, gate reads resolved flag + deletes existing row on
    suppress), Slice 3 Page Content feed (getIncidents by geography, REGIONAL aggregates LATAM, 10th rail
    sentinel), Slice 4 review-screen surface (this). The original systems-narrative leak that started this arc
    is resolved: the event lives as a structured, geography-homed, reviewable incident; narratives stay clean.

  • KNOWN — NARRATIVE LEAK (model variance, deferred): the integrate (narrative) task and the incident task
    both see the same source; the narrative task sometimes still pulls incident event-statistics into
    narrative prose despite the conservative tuning. Observed BOTH variants on the same Catatumbo source
    across runs: a GOOD analytical edit ("sustained operationalization rather than isolated incidents" — the
    right behavior) and a BAD statistics-dump ("39+ attacks... 7 deaths, 32 wounded..." — the leak). This is
    model run-to-run variance; tuning reduced frequency but can't eliminate it. TWO-PART FIX (not yet done):
    (a) one more integrate-prompt pass explicitly barring event-statistics/casualty-tallies from narrative
    now that incidents capture them; (b) rely on the P4a-2b accept/reject flow — human review is the robust
    catch for the residual bad variants. Not a hard bug; the review system is DESIGNED for the human to
    accept good edits and reject leaks.

  • KNOWN ITEMS (non-blocking):
    - event_date GENERATION-date default: RESOLVED by Fix 1 (a0404a4). Writer fallback is now
      stated-date -> publish-date -> today (today the rare NOT-NULL floor). See the TUNING THREAD --
      CLOSED block in the resume section.
    - The '[Gate] No Anthropic API key set' startup log is a FALSE ALARM (fires once at boot before a
      project loads; key IS loaded and works — all generation this session proves it). Cosmetic; worth
      suppressing the scary boot log later.
    - '[assigneesCloudMigration] REFUSING TO RUN — 5 tasks lack cloud backup' — PRE-EXISTING (dated
      2026-07-20), unrelated to publication/incidents. Separate To-Do loose end: re-run
      sql/2026-07-20_assignees_cloud_backup.sql or investigate the 5 tasks.
    - P2's updated_by writes 'local-admin' (dev acting-user), not a board_members identity — P6
      change-history will need to resolve to real names.

  • P4a-2b (accept flow) COMPLETE (commits d31d8b9 + 6037998). THE PRE-COMMIT REVIEW SCREEN NOW WRITES.
    Two new cloud functions in publication.ts: acceptProposal (writeSection versioned write -> publication_
    changes change-record insert -> setProposalStatus flip to 'accepted') and keepProposal (flip-only to
    'kept', no write, no record). Head-gated IPC (publication:acceptProposal / keepProposal via denyIfNotHead).
    New setProposalStatus helper in infoPageSources.ts (cloud-authoritative read, sibling-preserving merge of
    {status, status_at}, mirror resync -- modeled on setIncidentFlag). Proposal status union gained
    'accepted' | 'kept'.
    NEW cloud-only table publication_changes (sql/2026-08-07-p4a2b-publication-changes.sql, commit d31d8b9):
    the Layer-1 change-record corpus. 14 columns incl. before_body / after_body / divergence / section_text_id
    / accepted_by / accepted_at. No mirror (like the other four publication tables).
    UI (PreCommitReviewTab.tsx): [Keep original] / [Accept edited] buttons under the diff in the status='ready'
    box; terminal branches render '✓ Accepted -- page text updated' / 'Kept original -- no change' instead of
    the diff. article_id sourced from selected.article_id, info_page from pageId (NEITHER lives on Placement);
    busy/error keyed on pipeline_id.
    VERIFIED in the authoritative store: a Civilian/REGIONAL accept produced section_texts v1->v2 (old v1
    stamped superseded_by=90, new v2 live), publication_changes id=1 linking section_text_id=90 action=accept
    divergence=false, and the proposal status flipped to 'accepted'; a VNSA keep flipped to 'kept' with NO
    write. The first real editorial test also caught a BAD proposal (incident stats dumped into REGIONAL
    narrative) and correctly rejected it via Keep -- the review screen working exactly as designed.

  • P4a-2b v1 CAVEATS (non-blocking, deferred):
    - before_body is the proposal's SNAPSHOTTED original_body (what the human saw in the diff), not the true
      live body at write time. writeSection re-reads the live row for the supersede chain, so THE PAGE IS
      ALWAYS CORRECT; only the audit's before_body could theoretically be stale if the live text changed
      between generation and accept. Single-researcher + short-lived proposals make this near-impossible in v1.
      Harden to the true live body only if concurrency lands.
    - NO cross-step transaction: writeSection (crash-safe on its own) then best-effort change-record insert +
      status flip, both log-and-continue on failure (page stays correct, only the audit row / the flip could
      be missing). True atomicity is a P5-approve concern (stored procedure).
    - accepted_by / updated_by write 'local-admin' (dev acting-user); P6 Recent Changes will resolve to real
      member names. (Same note as P2's updated_by above.)

TUNING THREAD -- CLOSED (2026-08-07):
  - FIX 1 (event_date) SHIPPED at a0404a4. C-on-B: the incident prompt now gets the article's publish date
    (published_at, ISO on intelligence_sources) as an ANCHOR to resolve RELATIVE date references ("Monday",
    "yesterday") to absolute ISO; the writer fallback chain = model's stated date -> publish date -> today
    (today is now the rare NOT-NULL floor, not the routine default). Also fixes the collateral bug where a
    fuzzy period ("late July 2025") that new Date() cannot parse silently became today -- now falls back to
    the publish date. dedup_key UNCHANGED (built from the raw model date). VERIFIED on the Rosario source
    (fa96eea5-...): event_date=2026-08-04 (publish-date fallback, dedup |nodate) -- the source states no
    resolvable date, so the model correctly returned empty and the fallback supplied the publish date.
    Proves BOTH the anchor threading AND the writer fallback.
  - FIX 2 (narrative-leak prompt pass) DEFERRED -- deliberately. The robust answer is NOT more prompt tuning;
    it is the Layer-2/3 relevance judgment against publication_changes history (does this edit resemble past
    edits that mattered?), which needs accumulated change-record data first. The human accept/reject in
    Pre-Commit Review is the interim catch (demonstrated this session). Revisit once publication_changes has
    volume.

BACKLOG -- B-STRUCTURED (intel-stage event_date resolution), its own arc (~4-6 slices, design-first):
  DESIGN FINDING: there is NO structured event_date field anywhere in the intel analysis. The date lives as
  ONE free-form row in ai.key_facts[] with a MODEL-CHOSEN label, edited via the generic key_fact override
  (human.overrides.key_facts[label]). Consequences: (a) the intel relevance task never receives a publish-date
  anchor, so it captures the RAW word ("Monday") unresolved; (b) route-time generateIncident RE-EXTRACTS the
  date via a second (incident-task) model call and LOSES the "Monday" intel already had; (c) "route-time reads
  the intel-resolved date" is therefore NOT a clean field read today -- it would require label-guessing a row
  out of key_facts (REJECTED as another brittle soft-string-match, same class as the incidents country-vocab
  convention).
  THE DESIGNED ANSWER: add a real TYPED event_date to the relevance task (own prompt instruction WITH the
  publish-date anchor so "Monday" -> 2026-08-03 resolves AT intel extraction), own normalizer slot +
  ai.event_date JSON path, a DEDICATED intel-UI date field + override (not buried in key_facts), then
  route-time reads resolve(human.event_date, ai.event_date) -- a real human-over-AI field access, no label
  matching. RATIONALE for structured over heuristic: the researcher can SEE and CORRECT the resolved date at
  the intel stage (Dorian's decisive point), and it removes the lossy second extraction. BATCH with the other
  incidents-hardening items (country-vocab whitelist; the event_date-nullable question) -- one coherent
  hardening arc.
  NOTE: Fix 1's route-time ANCHOR becomes redundant once B-structured lands (resolution moves upstream, route
  just reads); Fix 1's WRITER FALLBACK STAYS (the defensible floor). B-structured will simplify the anchor out
  of the incident prompt at that time.

P4c-1 (card-proposal generation + store) DONE (code commit 6fe6f45; docs 8243d04 + this commit):
  - New 'card' analyze task (AnalyzeTask gains 'card'): a conservative card-worthiness contract --
    durable quantitative / named-specific figures only, sees the cell's EXISTING active cards (dedup)
    + section identity, DEFAULT propose-nothing, max 6 per cell. Rule 4 draws the DISCRETE-EVENT
    (barred -- one incident's casualties/arrests/seizures = incident detail) vs DURABLE-AGGREGATE
    (allowed -- a trend/rate/cumulative figure) line by SHAPE, not topic. Rule 5 bars model-added
    approximation (~ / "approximately") on figures the source states exactly.
  - proposalShape gains proposed_cards[] ({headline, detail, confidence}), default []; carried on ALL
    terminal write paths (ready / nochange / error) so a card-only proposal survives a nochange
    narrative. setProposalStatus PRESERVES it (status-only merge). New proposeCellCards -- a narrow
    inline read (cards headline+detail for the cell, active=true) that feeds the prompt; runs
    CONCURRENTLY with narrative per cell under the existing Promise.allSettled, INDEPENDENT of it.
  - VERIFIED in store (SQL-first, no UI): incident sources (Rosario, Catatumbo) correctly proposed
    ZERO cards; the CSIS source proposed sane durable figures across all six touched cells --
    SkyFend $100k, Dedrone $25M, DJI 70%, the SEDENA attack series (5->107->233->260), the ACLED
    death aggregate (11 in 5mo), border incursions (1,000+/mo), Mexico 250g registration threshold --
    across supply/systems/vnsa/external/legal. Real page-figures, no incident-detail leak, exact
    figures (no stray ~), aggregates reliably allowed by the tuned rule 4. Run-to-run COUNT varies
    (generative extraction) but quality/shape is stable.
  - KNOWN TUNING LEVER for P4c-2 (not a blocker): the model proposes strong aggregates BROADLY -- the
    same figure (SEDENA series, ACLED count, border incursions) lands in nearly every cell it could
    plausibly fit, giving ~5-6 cards/cell with heavy cross-cell repetition. This is Decision-A-consistent
    (a figure can legitimately live in multiple sections; the researcher decides per-cell) and bounded by
    the max-6 cap, but the volume/repetition may prove noisy once it is on screen. DEFERRED tuning: nudge
    the prompt toward "propose to the cell where MOST relevant, not every cell it could fit" -- but only
    AFTER P4c-2 shows whether repetition is actually annoying in the UI (tuning propose-breadth blind
    risks the invisible under-proposing failure, which is worse than over-proposing). P4c-2 could instead
    surface "also proposed to: [sibling cells]" rather than suppress. Decide with the review screen in
    front of us.
  - Cross-cell duplication (the same figure proposed to multiple sections) is BY DESIGN (Decision A):
    sections overlap, a figure can be a supply AND systems AND vnsa fact; the researcher decides
    per-cell at accept. Cross-cell dedup NOT built -- reachable later as hardening if it proves noisy.

P4c-1-redux + P4c-2a DONE (code commit d047475):
  - P4c-1 RE-ARCHITECTED: the per-cell card generation above (N isolated 'card' calls, each blind to
    the other sections -- so the same strong figure sprayed across every section that merely mentioned
    it, the KNOWN TUNING LEVER problem) is REPLACED by ONE whole-source coordinated pass (new
    'cards_whole' analyze task). It sees the WHOLE source + ALL touched sections + existing cards across
    cells AT ONCE, and assigns each figure a home section (rule 5) + home geography (rule 6). fanOutCards
    distributes the flat tagged list into the EXISTING per-cell proposed_cards[] store (keyed
    section|geography). The old per-cell 'card' task + normalizeCard are left intact-but-UNUSED (still
    routable, just not called). The B1 per-cell primary-home rule tried earlier was REVERTED -- a cell
    blind to the other 8 sections cannot judge "primarily belongs HERE"; the coordinated pass is the
    architecturally correct home for that judgment. Card-worthiness contract carried over verbatim
    (durable figures, discrete-vs-aggregate rule 4, exact-figures / no-added-approximation,
    propose-nothing default). Cap raised 6-per-cell -> 15-per-source. Also cheaper: the 18000-char body
    is sent ONCE, not N times.
  - VERIFIED in store: the CSIS source's cards now land in ONE section each (External 2, Systems 2,
    VNSA 6) instead of the same figure spraying across all 6 touched sections. THE SPRAY IS DEAD --
    section-homing was the goal and it works on real data. (Geography-homing NOT yet observable -- see
    the GEOGRAPHY GAP below; every card still homed to REGIONAL because country cells do not exist.)
  - P4c-2a (renderer-only, READ-ONLY -- no accept, no writers): proposed cards now RENDER in Pre-Commit
    Review as dashed tiles below the narrative diff ("PROPOSED CARDS (n)" + READ-ONLY badge, per-section
    color), rendered OUTSIDE the narrative status switch (renderNarrative() + renderProposedCards(), both
    always emitted) so a CARD-ONLY cell (cards but nochange narrative) still shows its cards. The review
    rail now flags a cell that has proposed cards even when its narrative status is 'nochange'
    (lit = touched && (ready || hasCards)); such card-only cells are also landable in the jump-to-first
    logic. No writers, no SQL -- accept is P4c-2b.
  - REGIONAL-always-offered 1-liner shipped in proposeWholeSourceCards (the geographies list now seeds
    'REGIONAL' deduped, so it is ALWAYS a valid home even for a future country-only source). NO-OP on
    current data (every touched geo is already REGIONAL) -- future-proofing, not a live behavior change.

GEOGRAPHY GAP + THE CORRECTED COUNTRY-FIRST MODEL (critical -- this REVERSES an assumption baked into
shipped code, and it is the design north star for the whole geography arc):
  - CURRENT STATE (the real gap found this session): the ROUTING LAYER collapses ALL geography to
    REGIONAL. routeToNew + syncPlacements BOTH hardcode geography='REGIONAL' (infoPageSources.ts ~92,
    ~159), unconditionally, regardless of the source's subject_countries. Confirmed: ZERO non-REGIONAL
    placements exist anywhere (SELECT DISTINCT geography across all pages = REGIONAL only). A
    Colombia-tagged source produces section|REGIONAL placements, NEVER section|Colombia -- country cells
    are structurally IMPOSSIBLE today. So rule 6 (home geography) in the cards_whole pass is BUILT but
    INERT: every card homes to REGIONAL regardless of the model's geo tag, because fanOutCards snaps a
    country tag back to REGIONAL when no country cell exists. Both the CSIS and the Colombia-source tests
    came back all-REGIONAL for exactly this reason. This gap affects NARRATIVE + INCIDENTS too, not just
    cards -- it is a general geography-granularity limitation of the current placement model.
  - THE CORRECTED MODEL (Dorian, this session -- REVERSES the current rule-6 default):
    * Analysis is COUNTRY-LEVEL BY DEFAULT; whole-region analysis is RARE and EMERGENT. Kantor does a lot
      of Colombia-specific work; the intake (news / social / interviews / incidents) is mostly
      country-specific. So the DEFAULT home is the COUNTRY, and REGIONAL is where something RISES TO when
      it is genuinely cross-country / aggregate. Rule 6 as shipped ("REGIONAL unless country-specific") is
      BACKWARDS for this reality and must FLIP to "COUNTRY unless genuinely cross-country / aggregate" when
      the geography arc lands. (It is inert now, so this is a rewrite-when-activated, not a live bug.)
    * Scope for the arc: REGIONAL + COUNTRY only for now. Sub-regional (Catatumbo / Cauca) is a LATER
      possible extension, NOT in the first geography arc.
  - THE UNIFIED ARCHITECTURAL SPINE (the through-line connecting geography, trends, and the change ledger
    -- ONE principle, not three; this is the design north star):
    * The page has a BASE LAYER of country-level, point-in-time records that GROWS as sources keep
      arriving. The imported Cowork content (43 section_texts / 73 cards / 344 items) is a REGIONAL
      SNAPSHOT at t=0 -- a seed, NOT the finished body. The value is the TRAJECTORY from there: sources
      keep landing, each a change record, and the body becomes a tracked, versioned, LIVING analysis.
    * publication_changes (the P4a-2b change-record corpus) is the CHANGE LEDGER -- the arc of how the
      base layer evolves over time.
    * HIGHER-ORDER FIGURES ARE DERIVED FROM THE LEDGER, not authored in parallel:
        - REGIONAL figures = roll-ups / synthesis ACROSS COUNTRIES (a geography derivation).
        - TRENDS = roll-ups ACROSS TIME (a temporal derivation -- the P6/P7 trends-from-history principle
          below).
      Same shape: a higher-order figure synthesized from the change history of lower-order country records.
      REGIONAL is a SYNTHESIS LAYER OVER COUNTRY, not a parallel sibling.
    * Country-level analyses will get MUCH RICHER as incidents + news accumulate (they are inherently
      country-specific); REGIONAL is already seeded and will be SHAPED / REFINED by new sources. This is
      WHY country-first routing is urgent -- the growth and richness land at the country level, and the
      REGIONAL-only collapse is actively flattening it.
    * Both derivations (regional roll-up, temporal trend) wait on the SAME thing: enough accumulated
      country-level change records in publication_changes to synthesize from. P5 / P6 / P7 and the
      geography arc all serve this ONE spine: a living, tracked, country-grounded analysis that grows.

PRINCIPLE -- TRENDS FROM HISTORY (Dorian's architectural call; affects P6/P7 + card design):
  The rule-4 "durable aggregate" cards (attack series, cumulative counts, rates) are proposed NOW by
  reading a SINGLE source -- the interim mechanism. But a trend is by definition a number that MOVES
  OVER TIME, and the authoritative record of how a number moved is publication_changes (the Recent
  Changes corpus, P6/P7). PRINCIPLE: once Recent Changes exists, trend/aggregate figures should become
  DERIVED-FROM-HISTORY, not frozen from one source -- the same recompute-and-update-the-note loop the
  design docs already specify for the hero figures (~667 attacks / ~238 casualties asterisked on the
  page). When a component figure is corrected, the trend recomputes; that loop IS the change history,
  not separate from it. So P6/P7 must not merely DISPLAY changes -- it must be the source trends are
  drawn FROM. Card-generation seeding a trend from one source is the BRIDGE until then. FLAG this at
  P6/P7 design time.

==============================================================================
P4c-2b DONE (b72be1a) -- THE CARD ACCEPT ARC IS COMPLETE END TO END (2026-08-08)
==============================================================================
Built on 2b-i (350cd90 SQL card-cols + ba26426 per-card-id). What shipped:
  - acceptCard / dismissCard writers (publication.ts): acceptCard = addCard (or replaceCard on
    eviction) -> publication_changes insert action='card' with STRUCTURED card columns
    (card_id / card_headline / card_detail -- NOT stuffed into body) -> setCardHandled('accepted').
    dismissCard = setCardHandled('dismissed'), flip-only. Both Head-gated.
  - setCardHandled (infoPageSources.ts): per-card handled-state stamped INSIDE the proposed_cards[]
    array entry (handled / handled_at / card_db_id), located by the per-card UUID, and NEVER touches the
    top-level narrative status. Mirrors setProposalStatus's cloud-authoritative read + preserve-siblings
    merge.
  - Per-card UUID minted per (card x cell) in fanOutCards (2b-i) so a DUAL-HOME card is independently
    acceptable in each cell. publication_changes gained nullable card_id / card_headline / card_detail
    (2b-i SQL, 350cd90).
  - getCellCards (READ-gated, membership-tier -- NOT Head) + a REVIEW-LOCAL eviction picker
    (reimplemented in PreCommitReviewTab, NOT imported from CardsBox) for the 12-slot-full case.
  - UI (PreCommitReviewTab): Add to page / Dismiss buttons on the proposed-card tiles, terminal states
    (emerald "Added to page" / muted "Dismissed"); id-less legacy cards stay read-only (no stable key).
  - VERIFIED IN THE AUTHORITATIVE STORE, BOTH DIRECTIONS (a real-looking PASS and a real-looking FAILURE
    both resolved by store-checking, not by trusting the surface): accept writes the card (active row,
    correct position), the change-record (action='card', card_id links to the real card), and flips
    handled='accepted' -- all while narrative_status stays 'ready' (untouched). dismiss flips only.

▶ RESUME HERE (CURRENT, 2026-08-08) -> P4c-2b DONE, THE CARD ARC IS COMPLETE.
  NEXT: the GEOGRAPHY ARC -- the next MAJOR priority (Dorian: country-specific work is core to Contested
  Skies; the REGIONAL-only collapse is actively FLATTENING it). DESIGN-FIRST / MOCKUP-FIRST, COUNTRY-DEFAULT
  per the CORRECTED COUNTRY-FIRST MODEL + the UNIFIED CHANGE-LEDGER SPINE above (country is the BASE layer;
  REGIONAL and TRENDS DERIVE from publication_changes; rule 6 must FLIP from "REGIONAL-unless-country" to
  "COUNTRY-unless-genuinely-cross-country / aggregate" when activated). Work: seed country placements from
  subject_countries in routeToNew / syncPlacements (both currently hardcode geography='REGIONAL'); handle
  the existing-REGIONAL-content MIGRATION question (editorial: does the seeded t=0 REGIONAL content stay
  REGIONAL or move to country cells). Scope: REGIONAL + COUNTRY only for now; sub-regional (Catatumbo /
  Cauca) is a LATER extension. THEN: per-card UNDO (backlogged below), P4b (granular per-hunk narrative
  accept), INCIDENT acceptance, P5 (publish transaction), P6/P7 (Recent Changes + all-sources search --
  where the ledger derivations, regional roll-up AND trends-from-history, close per the UNIFIED SPINE).

==============================================================================
GEOGRAPHY ARC -- KICKOFF FINDINGS (investigation 2026-08-08, before any build)
==============================================================================
(ENRICHES the resume pointer above -- the arc is still "geography next"; this records what we learned
scoping it. The FIRST concrete slice is now known: IMPORT the full country JSON, geography-preserved.)

1. WORLD B2 CONFIRMED (Dorian directly). The PUBLISHED Contested Skies page is COUNTRY-STRUCTURED: each
   country (Colombia, Mexico, etc.) has its OWN full 9-section page + country-specific incidents /
   investment / regulatory, selectable from the map (verified via a saved Colombia PDF: 313 incidents,
   215 casualties, ELN / FARC-EMC / Segunda Marquetalia, CIAC / CODALTEC / INDUMIL, COP 500bn, RAC 100).
   Dorian AUTHORED this via a COWORK session -- it NEVER passed through KC Hub's placement model. So the
   country content is PUBLISHED but NOT in the app's editable cells. The gap is NOT "add country structure
   to a regional page" -- the page already HAS it; the APP's routing (hardcoded geography='REGIONAL') is
   what cannot address it. THE APP MUST CATCH UP TO THE PAGE.

2. THE FULL COUNTRY CONTENT EXISTS AS A JSON (Dorian has it: contested-skies-cells-full.json, ~283KB, 55
   cells). Shape: array of { geography, section, narrative, cards[], citations, outline }. This maps
   DIRECTLY onto section_texts(narrative) + cards + section_citations + section_items(outline), keyed by
   the SAME (section, geography) as the placement PK. Geography coverage:
     REGIONAL:  all 9 sections (the cross-country SYNTHESIS view, ~2500-2900 chars each)
     Colombia:  all 9 sections (~600-940 chars);  Mexico: all 9
     Brazil:    7 sections;  Argentina: 5;  Venezuela: 4
     12 single-cell EXTRA-REGIONAL stubs (China, Israel, Ukraine, Turkey, Syria, Lebanon, US, GLOBAL,
       Costa Rica, Panama) -- mostly EMPTY narrative, supplier / actor mentions in supply / external / vnsa.
     73 cards total (REGIONAL 29, Colombia 16, Brazil 10, Mexico 10, Argentina 4, Venezuela 3, Panama 1).
   THE ARC OPENS WITH IMPORTING THIS JSON, geography-preserved -- a re-run of the P0 seed done RIGHT (P0
   only imported REGIONAL / flattened). NOT re-asking Cowork (this IS the full correct export), NOT
   disentangling flattened rows.

3. OPEN DECISIONS the import waits on (Dorian to decide in the new chat):
   (a) EXTRA-REGIONAL single-cells (China / Israel / Ukraine / etc): import as their OWN geography cells,
       or FOLD into REGIONAL / the relevant country's supply section? Claude's lean: FOLD IN -- these are
       suppliers / actors that appear IN the supply / external story (China=DJI, Israel=Elbit), not
       Contested Skies geographies you would publish a country page for. Import vocabulary likely =
       REGIONAL + the 5 LATAM countries.
   (b) REGIONAL-CARDS COLLISION: the JSON has 29 REGIONAL cards; the app's cards table has our P4c-TEST
       accepted cards in vnsa / REGIONAL (79 / 80 / 81 seed + 164 etc from testing). The import's REGIONAL
       cards must either REPLACE (JSON is authoritative seed) or SKIP (keep accepted). Likely REPLACE
       since P4c cards were test data -- but confirm, and CLEAN OUT the P4c test cards first.

4. THE SIX-PART RECONCILIATION DIAGNOSE WAS RUN but its output did not reach Claude (empty upload, twice).
   RE-RUN IT in the new chat. It must establish: (1) section_texts current inventory -- is narrative empty
   or does it have REGIONAL rows (determines clean-insert vs merge); (2) cards inventory -- which exist,
   seed vs P4c-test; (3) how the P0 seed assigned geography (hardcoded REGIONAL or aware); (4) citations +
   outline inventory by geography; (5) the INSERT PATH for a FRESH country cell -- writeSection does
   insert-then-supersede which assumes a prior version exists; a new country cell has none, so likely need
   a direct seed insert like the original P0 script, NOT the versioned writer; (6) clobber check -- does
   re-importing REGIONAL overwrite anything already edited.
   [NOTE for the re-run: this environment has NO cloud execution path, so items (1)/(2)/(4)/(6)-live must
   be run as SQL in Supabase by Dorian; the JSON side, the seed behavior, and the write-path code (3)/(5)
   are answerable from disk. The P0 seed is ALREADY geography-aware (carries cell.geography verbatim); its
   --commit path CLEARS all four tables then re-inserts, so re-running the SEED as-is would WIPE the live
   store -- the import must be an ADDITIVE, REGIONAL-SKIPPING variant, never clearTable.]

5. STILL DESIGN-FIRST after the import. Once country cells EXIST (imported), the ROUTING change (seed
   country placements from subject_countries in routeToNew / syncPlacements) + rule-6 FLIP (country-default)
   + the review-screen country-tab UI (mockup-first) follow. The import is the FIRST concrete slice; the
   routing / rule / UI changes come after, per the country-default model + change-ledger spine already in
   HANDOFF above.

OPEN ITEMS from the card arc (both BACKLOGGED, non-blocking to geography):
  - NO UNDO on the review screen (near-term): accept / dismiss (and narrative accept / keep) are TERMINAL
    in the UI -- no in-app reverse. Not a data trap (P3 CardsBox in the CellGrid can delete / replace an
    accepted card), so it is a UX gap, not stuck data. But the ONLY reset today is a full re-route (nukes
    ALL decisions on the source, not one card -- see guardrail iii). BUILD per-card undo (reverse the
    handled flag + soft-delete the created card + an audit record for the undo) BEFORE researchers use the
    review screen in anger -- a felt day-one gap, just not blocking the geography arc.
  - DIRECT-CLOUD-EDIT MIRROR STALENESS (by-design, KNOWN): see guardrail (iii) in the recurring-bug-class
    list. Manual-reset recipe: to make the app see a reset source, back it out to New Sources and RE-SEND to
    Review (regenerates through the app writer, which resyncs the mirror) -- a hand-SQL edit in the Supabase
    editor is invisible to the running app.

▶ (SUPERSEDED 2026-08-08 -- P4c-2b is now DONE and the card arc is COMPLETE; the CURRENT resume pointer +
  the P4c-2b DONE detail + the two open items are in the block immediately ABOVE. This block is kept for
  the geography-arc design detail in its (2) / (3).) RESUME HERE -> P4c-1-redux + P4c-2a done (d047475). Order LOCKED this session:
  (1) FIRST: P4c-2b (card-proposal ACCEPT flow) -- the near-done slice; finish it before opening
      geography (discipline: do not strand it). Per-card handled-state lives INSIDE proposed_cards[]
      entries (the single narrative status field cannot carry it); acceptCard writer -> the existing
      addCard / replaceCard + the 12-slot eviction picker; capture publication_changes with
      action='card'. REGIONAL-SAFE -- works on today's REGIONAL cells with NO country-placement
      dependency, so it ships cleanly BEFORE the geography arc. (WATCH card volume/repetition per the
      KNOWN TUNING LEVER note above -- but the whole-source redux already cut the spray; re-judge with
      the accept screen in front of us.)
  (2) THEN THE GEOGRAPHY ARC -- the next MAJOR priority (Dorian: country-specific work is core, the
      REGIONAL-only collapse is actively flattening it). DESIGN-FIRST / MOCKUP-FIRST. Country-default per
      the CORRECTED COUNTRY-FIRST MODEL above: seed country placements from subject_countries in
      routeToNew / syncPlacements so section|Colombia etc. EXIST; FLIP rule 6 to "COUNTRY unless genuinely
      cross-country / aggregate"; handle the existing-REGIONAL-content MIGRATION question (does the seeded
      t=0 REGIONAL content stay REGIONAL or move to country cells -- an EDITORIAL call). ONLY THEN is
      rule 6 observable/testable and country-homing verifiable. Its own diagnose + design (NS-2 territory).
  (3) THEN: P4b granular per-hunk accept; INCIDENT acceptance (extend accept to the incident card);
      P5 publish transaction (the last mile to live); P6/P7 (Recent Changes surface + all-sources search
      -- where the ledger derivations, both regional roll-up AND trends-from-history, close per the
      UNIFIED SPINE above).
  SEPARATELY backlogged: the incidents-hardening arc (B-structured event_date + country-vocab whitelist
  + event_date-nullable) can slot whenever -- design-first.
  The PUBLICATION ARC SLICE SEQUENCE block below stays the canonical P4-P7 map.

CONTENT DECISIONS (locked, for the import + later re-index):
  - Citations are SECTION-LEVEL (mostly REGIONAL), NOT per-cell, NOT duplicated. 189 citations, only 60/189
    name one country, 116 name none — do NOT infer per-cell attribution (would put unsourced claims on page).
  - Supplier-axis NON-LATAM geographies (US/China/Israel/Turkey/Ukraine/Syria/Lebanon/GLOBAL, 40 outline
    items in sections 04-external/05-supply) → OPTION C: import faithfully now, FLAG sections 04/05 for
    later re-indexing (this is the design doc's §7.4 "05 Supply is supplier-axis-inverted" problem, now
    concrete — section 05 has no LATAM-recipient cells).
  - conf added to cards (confidence column exists). Outline NOT flattened (rich fields → columns + attrs).

PUBLICATION ARC SLICE SEQUENCE (after P0):
  - P0 (DONE, caf803c): seeded section_texts/cards/section_items/section_citations from the Cowork JSON;
    cloud-verified 43/73/344/189 (169 attrs).
  - P1: read-only cell GRID (15 geo × 9 sections) — projects DB content into the grid. FIRST decision:
    grid reads mirror or cloud (determines if the 4 tables need mirror CREATEs + sync).
  - P2: direct-edit cells (versioned section_texts).
  - P3: cards (12-slot replace flow).
  - P4: AI-integrate + the yellow/red/blue diff + divergence warning.
  - P5: publish transaction — atomic DB write → regenerate content.json → GitHub-API push to
    contested-skies-monitor (Head-only credential, DB-first ordering, sync-pending/retry). This is where
    the page gets refactored to READ content.json (Option B). Riskiest write in the system.
  - P6/P7: change history + all-sources search.
  NOTE: the page-reads-from-content.json refactor is deferred to P5 (extract-first: seed DB now, page
  stays inline until publish needs it).

**★ NEXT: RESTRUCTURE step 2 — geography axis is the next build. Cull DONE; two axis slices + New Sources ahead.
✅ DONE & PUSHED this session (2026-07-30):
  • Tag→section ROUTING CONTRACT frozen (commit b42280a) — RESTRUCTURE_tag-section-priors.md,
    now in-repo. Three-axis discipline: section-prior tags vs geography-axis vs actor-axis;
    priors are SEEDS the mapping learns from researcher decisions.
  • A1 (commit 6b5b667): analyze.ts emits proposed_sections[{section,confidence}] + channel
    (state-procurement|commercial-retail|n/a) + routing_reasoning into a NEW
    analysis_json.routing SIBLING (never inside .ai). One RMW writes .ai + .routing atomically.
    Verified on the FARC/Popayán source: proposed vnsa·high, systems·high, legal·medium,
    channel n/a; .ai shape intact; no truncation at max_tokens 4096. NO info_page_sources contact.
  • A2 (commit 3c32cf6): read-only "CS SECTION" proposal badge on the News card — ghost/outlined
    chips (distinct from the indigo category pills AND green topic tags), confidence-by-weight
    (solid vs dashed border), legal→"Regulatory" relabel. New files sectionLabels.ts +
    SectionProposalBadge.tsx. projectAbbrev hardcoded "CS" with a TODO for multi-project.
    Renderer-only. Empty-safe for pre-A1 sources.
  • CULL (commits ca4ce98 cull-1/2 + c7503aa cull-2/2): VNSA-family fold — losers
    criminal-organizations / grupos-armados / grupo / colombia-grupos-armados ALL → canonical
    `violent-non-state-actor`; junk tag `inadequate` dropped. Cull-1/2 = TAG_SYNONYMS write-time
    guard in BOTH normalizeTag (cloud/tags.ts) + normalizeTagClient (TagPicker.tsx), byte-identical,
    so losers can never be re-entered. Cull-2/2 = one-time data fold via scripts/cull-vnsa-fold.mjs
    (dry-run/--commit, idempotent, name-guarded deletes) recorded in sql/2026-07-30-cull-vnsa-fold.sql:
    12 sources repointed (1 de-dupe), 2 inadequate strips, known_tags 18/30/31 deleted (30 was
    hand-deleted earlier), csa-co-01 geography preserved (Colombia already on the geography field).
    Verified by INVARIANTS not absolute count (winner landed at 17, not the stale hardcoded 16 —
    which is exactly why invariant-based verification was the right call).
  • NOTE: the cull that shipped is NARROWER than the priors-doc §2 originally imagined. The
    counter-uas→cuas and regulatory-response→regulation merges, the romania/drift folds, and the
    geography-tag removal were NOT done here — geography-tag and named-org-tag removal are
    deliberately deferred into their own AXIS slices (below), because those tags can't leave the
    vocab until their data has a new home.

⚑ KEY DESIGN SHIFT locked this session (drove the plan change): ROUTING IS NOT TAG-DRIVEN.
  AI reads full text + structured fields (article_type, capabilities, actor_types) and proposes
  sections holistically — better than the brittle tag→section lookup the priors doc first imagined
  (that lookup is what produced the 32-of-34-in-Systems failure). Tags' job SHIFTED to descriptive/
  retrieval + learning-loop signal, NOT routing. AND: SECTION CONFIRMATION HAPPENS AT NEW SOURCES,
  NOT AT INTEL — sections are per-project page structure, so confirming them belongs in the project's
  New-sources inbox (per-project, once), not on the intel card. Intel card shows a READ-ONLY proposal
  badge only. This is why the publication pipeline's first stage (New Sources) is essential, not
  redundant: AI analyzes once (intel), human confirms once (New Sources) — no repeated AI round.

REMAINING step-2 sub-slices (in order):
  1. ✅ GEOGRAPHY AXIS — DONE (3 sub-slices, analyze→UI→cull rhythm like A1/A2/cull):
     DECISION LOCKED: country + optional sub-geo are ONE coherent axis (not country-on-axis /
     sub-geo-as-tag). AI suggests countries into a LIST, researcher adds/removes/overrides.
     • ✅ Geo-1 DONE (099530c): analyze.ts extracts subject_countries + mentioned_countries (bare country
       names, subject=generates-placements / mentioned=metadata, mutual-exclusion) into step-1 columns via
       widened saveAiAnalysis. INTEL_COLS extended. No scalar sync. Verified on Caño Limón.
     • ✅ Geo-2 DONE (Part A b30efd8: sub_geographies column + updateCountries writer; Part B 54d0c3d: UI):
       nested ⊙ Colombia ▸ Cauca chips — subject=filled emerald, mentioned=ghost, sub-geo nested-in-subject,
       inline-add idiom, scalar as empty-list fallback, session AI-badge cleared on first edit. Scalar-edit
       path RETIRED (geography editing = lists only). Verified edit+persist-across-reload.
     • ✅ Geo-3 DONE — geography tags removed from vocab + sources. Step 1 (0734c50): analyze.ts
       stops suggesting geography as thematic tags. Step 2 (59137fd): pure-data axis backfill of
       3 at-risk sources (csa-rg-02→Mexico+[CO,VE,UA] mentioned; d1ef73a3→Colombia; 75706600→Romania+[UA,RU];
       5b1358a1 already done) — no AI, sub-regions deferred. Step 3 (26e26d8): stripped the 10 country-level
       tags (argentina/brazil/colombia/venezuela/europe/usa/china/russia/ukraine/latam) from 30 sources'
       thematic_tags; orphan-guard held on all 30; invariant-verified. Vocab known_tags rows were
       hand-deleted earlier. GEOGRAPHY AXIS COMPLETE (Geo-1 extraction + Geo-2 UI + Geo-3 cleanup).

       RESIDUALS (minor, deferred — not blocking):
         - SUB-GEO tags cauca/catatumbo/rio-de-janeiro deliberately KEPT on sources (4/3/3), no
           sub_geographies axis home yet. cauca's known_tags VOCAB row was accidentally swept in the earlier
           hand-deletion (its siblings preserved) — harmless (tag still on sources), recreate or migrate when
           the sub-geo pass runs.
         - `romania` survives as an orphaned geography-ish tag on 2 sources (3c63c57e, 75706600) — never was
           in the canonical vocab, so not in the strip list. Fold into geography axis when convenient.
         - Sub-region detail (Norte de Santander on d1ef73a3, "border region" on 75706600) survives in
           scalar/text, deferred to the sub-geo pass.
  2. ACTOR AXIS ◀ NEXT (geography now done — same 3-step shape):
     DECISION LOCKED: named orgs (FARC / ELN / CJNG / Sinaloa / cartels) get their OWN axis
     (actors_mentioned column) — a WHO, not a WHAT, so NOT thematic tags. `violent-non-state-actor`
     stays as the one actor-TYPE tag. AI extracts named orgs → researcher overrides → THEN cull the
     ~9 named-org tags from the vocab (only after the axis holds their data).
     NOTE (earlier-recorded): AI already populates capabilities[].actor + actor_type, but some actors
     are PROSE-ONLY (e.g. Grupo Marte) — consolidate from BOTH the structured capabilities array AND
     the narrative text; don't just copy capabilities[].actor.
  **3. NEW SOURCES sectioning — NS-1 DONE; NS-2 (placement + PK-widening) is the next build.**
    KEY DE-RISK (found in NS diagnose): info_page_sources has ZERO cloud rows. The PK widening is a
    schema change on an EMPTY table — NO backfill, NO data migration, NO legacy-row reconciliation. The
    scariest deferred piece is now the easiest. (Local mirror may hold stale test rows — the rebuild
    handles them; mirror is disposable.)
    VOCAB RESOLVED: info_page_sources.category will be RENAMED → `section` (it holds a section key; the
    nine sections replaced the old category taxonomy per the locked crosswalk; the name is stale). Free
    on an empty column. Rides NS-2.
    • ✅ NS-1 DONE (338888a): interactive SectionChips on the New Sources pipeline card (all nine sections,
      AI-proposed pre-selected, click to add/remove, indigo dot = AI-proposed vs researcher-added).
      Confirmed set → analysis_json.routing.confirmed via setRoutingConfirmed (cloud-authoritative RMW,
      sibling-merge preserves .ai + .routing.proposed_sections — verified on csa-co-08: confirmed written,
      proposed + ai.summary intact). Read-only static chips on Pre-Commit/All-Sources stages. NO
      info_page_sources contact. Confirmed set is the learning-loop signal AND what NS-2 reads to write
      placements.
    **NS-2 — FUNCTIONALLY COMPLETE. New Sources sectioning pipeline works end-to-end:
    route → grouped card → confirm/trim → placements reconcile → gate → review → commit, source-accurate
    counts throughout.**
      • ✅ Steps 0-2 (schema foundation): empty-table PK widen to (article_id,info_page,section,geography),
        category→section rename, sentinels section='' / geography='REGIONAL', mirror rebuilt to 4-col UNIQUE.
        (Step 0 clear; Step 1 = 8484fb5 cloud DDL; Step 2 = 8ef892d mirror rebuild.)
      • ✅ 4b-i (468a694): routeToNew seeds N placement rows from proposed_sections (one per section,
        geography=REGIONAL); empty-proposal → single '' sentinel presence row. resyncSourceRow widened to
        N rows (was maybeSingle, threw on row 2).
      • ✅ CRASH-FIX (9135f65): the Step-2 mirror migration had a bad idempotency guard — unconditional
        ADD COLUMN category resurrected the retired column every init → rebuild re-fired → COALESCE collapsed
        section→'' → 4-col UNIQUE violation → boot crash-loop. Fixed: re-keyed on section-PRESENCE (skip
        rebuild if section exists), guarded category-add inside the !section branch, one-time drop of stray
        category. Data safe throughout (rollback preserved it). Verified: boots clean, category dropped, rows intact.
      • ✅ 4b-ii (c28d9a7): syncPlacements — stage-safe DIFF reconciling placements to routing.confirmed on
        confirm/trim. Only reconciles stage='new' (review/committed PROTECTED — never deleted by a re-trim).
        Empty-confirmed re-seeds '' sentinel (source never vanishes). Diff preserves survivors' added_at.
        Verified: trim/add/stage-safe/empty-floor all pass.
      • ✅ 4b-iii (5774896): ≥1-section gate in setSourceStage — blocks →review/→committed unless ≥1
        non-sentinel placement; backward (→new) unblocked. Verified: sentinel-only blocked with toast,
        backward flows.
      • ✅ Step 5 (8fd1662): shared groupByArticle helper → one card per SOURCE across New Sources /
        Pre-Commit / All Sources (was N cards per placement). Badge counts fixed to COUNT(DISTINCT article_id)
        at the server (getSourcePipelineCounts + getSourceStats) — badges now count sources not rows.
        commitSources traced correct (pair-keyed commitSourceRow, no dup audit rows). Verified: Pre-Commit
        shows 1 for the 5-placement CSIS source, round-trip new↔review counts correct.

      ⚑ RESIDUALS (not blocking, for later):
        - LEFT-PANEL BADGE REFETCH-LAG: the sidebar "N new" per-page badge (getSourceStats path) doesn't
          refetch promptly on stage transitions — number is correct but lags. Top tab badges update promptly;
          only the sidebar path is stale. Small targeted refetch fix. (Known stale-view bug class.)
        - info_page_changes NOT MIRRORED LOCALLY (0 rows): the audit trail is cloud-only (getSourceChanges
          hits cloud). Fine today, but an offline history view would find nothing. Cloud audit log confirmed
          working (used it to prove a "lost source" was a clean move-back, not a bug).
        - STEP 3 mostly validated: move-back (removeToIntel/backSourceToNew) proven correct via audit log;
          commitSources + send-to-review deduped. Only saveReviewNotesForPage (page-wide notes) is
          untested-not-broken — low priority audit under N placements.

      NEXT after NS-2: the DOWNSTREAM PUBLICATION stages (Analysis & design → Publish → update notes →
      Sources) per PublicationProcess.md — a whole second arc (the cell editor + publish transaction).
      Also queued: the corpus re-analysis backfill (most sources predate the axes), and the geo/actor
      axis-tag culls' remaining bits.
  4. Downstream publication stages (Analysis & design → Publish → update notes → Sources) per
     PublicationProcess.md — later.

✅ STEP 1 (additive schema) — done & verified earlier this session (see below).**

## RESTRUCTURE MODEL — LOCKED (2026-07-30)

The Intel + Info Pages restructure data model is LOCKED. Full spec:
`RESTRUCTURE_locked-data-model.md` (companion: `RESTRUCTURE_reconciliation_agenda.md`).
Built on a fresh read-only diagnose of the live app (HEAD `79c150d`), which CORRECTED
several assumptions — trust the diagnose over older entries.

**FIVE LOCKED DECISIONS:**
1. **Placement key = (article_id, info_page, category, geography).** A source produces
   one placement row per (category × subject-country). Widens the B2-migrated
   `info_page_sources` key (+category, +geography) and its onConflict clause;
   additive.
2. **Geography = subject-countries + mentioned-countries lists on `intelligence_sources`**
   (scalar `geography`/`location_mentioned` superseded). Only SUBJECT countries generate
   placements; mentioned = metadata. Cards keep their own multi-country list.
   Extra-regional = subject entry for BOTH supplier and recipient.
3. **Incidents are their OWN record type** (own table, keyed by event+date+country+
   verification), NOT the placement schema. An incident may emit a placement pointer
   but is separately keyed.
4. **Routing = AI-PROPOSED, one-to-many, evidence-based** (replaces categories_json →
   queue_section). AI reads tags+summary+structure (capabilities/actor_type/
   key_facts/article_type) and proposes a SET of the nine categories + geography
   fan-out, researcher disposes; ≥1-section exit gate. Requires: reconcile the live
   approval category set to the nine (drop finance-nexus, apply actor split, retire
   platforms lump); ADD a `channel` field to analyze.ts (state-procurement vs
   commercial-retail — separates cat 04 from 05); author tag→section priors against
   the REAL known_tags vocab (read-only pull first). actor_type is routing EVIDENCE,
   not a category/key.

   **TAG MODEL (locked 2026-07-30):** Tags are DESCRIPTIVE and CATEGORY-FREE in identity —
   they do NOT nest under the nine categories. Vocabulary is CURATED (controlled + reused
   via known_tags, not open free-text). Each tag carries a PRIOR: a lean toward one or more
   of the nine categories, which AI combines with summary + structure to propose placement.
   A tag POINTS AT categories (often several), it does not SIT IN one — the descriptive axis
   and the routing axis stay orthogonal. This is what preserves multi-category (41% of
   sources), captures nuance below the 9 buckets, and leaves the priors something to LEARN
   from researcher add/remove decisions. Rejected: category-nested tags (collapses evidence
   into output, re-creates the 32-of-34-in-Systems failure, kills the learning loop) and
   pure free-text (synonym sprawl breaks prior maintainability + reuse). GUARDRAIL: tags
   must NOT duplicate what structured fields already carry (article_type / actor_type /
   capabilities[]) — they capture the emergent, source-specific texture those enums can't
   anticipate. The step-2 known_tags read-only pull is where existing descriptive vocab is
   surveyed and priors first assigned.
5. **Content tier = `section_texts`** (versioned narrative, maps from mockup CNARR+I18N) +
   **`cards`** (12-slot, replaced_by, advisory slot_kind for v1, seeded partial/derived
   from SLOTS). Publication = generate-from-data (option A). MIGRATION TAX REMOVED by
   a MANUAL page swap: Dorian replaces the live page with the P-shaped mockup by
   hand, then seed section_texts (full) + cards (partial) from P. Legacy publish tier
   (`info_page_items`/`commits`/`published` + inject-block `publishToRepo`) RETIRED at
   cutover. Generated-publish path (GitHub-API commit/push from main process,
   DB-first/page-as-projection/sync-pending) built LAST.

**BUILD ORDER:** 1 schema+versioning → 2 routing/intake (known_tags priors first) →
3 Analysis&design grid → 4 manual page cutover+seed → 5 generated-publish path
(retire legacy) → 6 history/rollback/sources. Steps 1-3 are a working editorial
tool with AI OFF — the correct failure mode.

**⚠ SEED CARE NOTE:** the seed-from-P step (build 4) is a data migration into new tables
and is the highest-stakes single op — treat with B2/recovery care class: byte-verify
seeded rows against P before trusting, snapshot before retiring the legacy tier.
Safeguard already in model: generated page keeps rendering from existing P structures
for any cell whose cards aren't authored yet (no blanking).

**★ B2 STATUS — ✅ B2b DONE (write path cloud-first).** B2b-1 (routeToNewSources +
moveBackToIntel, commit `17ccba3`) fully tested. B2b-2 (sendToReview, backSourceToNew,
commitSources, saveReviewNotes, commit `0321259`) PARTIALLY tested — review<->new
walked and passing; commit/save-notes NOT walked (would strand articles in the
bridgeless committed stage). ACCEPTED: commitSources sequential/non-atomic
(idempotent on retry). REWORK EXPECTED: these 4 are publication-stage writers,
provisional pending the August publication redesign. STILL OPEN: B2c (reads
cloud-first) closes out B2 — but note review/committed reads are also
publication-redesign-adjacent.

**★ COLLECTION REDESIGN (locked this session, 2026-07-28).**

**✅ COLLECTION PHASE — CLOSED.** The collection-durability + instrumentation arc is
complete: routing is cloud-durable (B2), sub-threshold articles are retained not
discarded (Slice 1), each article/cull is stream-tagged (Slice 2), and the category
map is reconciled with a live bug fixed (3a). What REMAINS of 'collection' is
deliberately handed off: the two new-display-label categories go to the August
restructure; the per-category keyword widening (step 4) is its own later
pipeline-tuning session. Nothing here blocks the restructure — it can open clean.
★ The app-side work Dorian raised (tags organized along the 9 categories,
multi-geography selection, AI-analysis dovetail) is RESTRUCTURE scope, design-first
/mockup-first — NOT collection slices. Geography-as-list is a known schema gap
(intelligence_sources.geography is scalar; needs subject-vs-mentioned-country
distinction). The tag vocabulary IS the routing key. These are interdependent and
must be designed together, not built piecemeal.
⚠ RECONCILIATION the restructure must handle: the category/tag routing model
proposes changing info_page_sources UNIQUE(article_id, info_page) ->
UNIQUE(article_id, info_page, category) + a category column — which touches the
table B2 just cloud-migrated (B2b writers use onConflict 'article_id,info_page').
Additive, but needs a hand-applied ALTER + the B2b conflict clauses updated. Flag,
not blocker.

Scope: widen collection to cover all Contested Skies categories; the gate + keyword
net are the two stacked filters (diagnose confirmed both narrow, keywords deeper).
- **CATEGORIES: NINE, not ten.** Laundering/finance strand DROPPED (out of scope).
  09 = Illicit logistics ONLY (prison drops, ground routes, contraband delivery);
  the crypto/laundering 'Illicit Finance Nexus' is RETIRED, removed from the mockup.
- **PULL ARCHITECTURE (locked): ONE pipeline, ONE table (cs_articles), ONE global
  URL dedup, ONE universal hard gate** (drone? + LATAM? + topical?) — with MANY
  per-category query GROUPS, NOT parallel pipelines. Rationale: 41% of articles are
  multi-category; separate pipelines would double-pull/double-store and fracture the
  many-to-many routing model. Multiplicity lives at the QUERY layer, unity at STORAGE.
- **source_stream TAG:** stamp each stored article (and each retained discard) with which
  query group(s) found it -> enables per-stream threshold/calibration tuning on
  shared infrastructure. GDELT maxrecords=250 is PER query, so per-category groups
  also buy independent record budget (incidents don't crowd out regulatory).
- **BUILD ORDER:**
  (1) ✅ **retain-first — SHIPPED.** Sub-threshold articles (score < 5) now retained
  as cs_articles status='culled' instead of silently discarded. Two leak-guards
  (bridge select + cleanup-irrelevant.js both .neq('status','culled')); queueable
  counters kept culled-free by a separate insert bucket. learning.js untouched
  (still status IN ('approved','rejected') — culls do NOT feed calibration yet;
  wiring recall-side training from culled rows is a deliberate FUTURE step, not
  automatic). Tested on a real fetch: 152 genuine culls retained, guards verified.
  (2) ✅ **source_stream — SHIPPED.** 2a: cloud ALTER cs_articles ADD COLUMN
  source_stream text[] (nullable, additive; commit `977b384`; sql/2026-07-28-slice2a).
  2b: within-run dedup now ACCUMULATES query-group labels (merges all matching
  streams into a deduped set per URL instead of first-wins-dropping) and buildRow
  stamps source_stream; empty->null; applies to queueable AND culled rows. Merge
  proven by deterministic unit test (5 cases/13 assertions, loop body verified
  byte-identical to the real inline loop). Commit `6733c52`.
  ⚠ NOTE — multi-label rows populate ORGANICALLY: early cloud rows may all be
  single-label because a URL only shows multiple streams when it matches >1 query
  group AND survives dedup (already-stored URLs are dropped by filterNewUrls before
  insert) AND isn't throttled out. This is a fetch artifact, NOT a bug — the merge
  is unit-proven. Real multi-label rows accrue as fetches accumulate overlapping
  fresh URLs. Do not mistake all-single-label early data for a broken merge.
  (3) widen gate categories — **3a SHIPPED (commit `ee9e00a`).** Fixed a LIVE bug:
  gate emitted regulatory/diplomatic but the bridge map had no keys for them (dead
  keys policy_regulation/extra_regional instead) -> unmapped -> null -> mis-filed to
  Source Archive on approval; 14 regulatory + 15 diplomatic cloud rows affected. Now
  mapped to 'Policy & Regulation' / 'Extra-regional Supplier' (confirmed real
  labels). 4 dead keys removed. Added supply_chain_export to the gate end-to-end,
  mapped to 'Extra-regional Supplier' (interim home).
  ⚠ HISTORICAL CAVEAT: the fix applies to FUTURE bridge runs. Any of the 29
  affected rows already APPROVED-into-Source-Archive are NOT retroactively re-filed
  (most are likely still unreviewed and will map correctly on approval). If
  regulatory/diplomatic articles are later found sitting in Source Archive, they
  need a one-off re-derive — not chased for now.
  >> DEFERRED TO RESTRUCTURE (need NEW display labels -> app UI): civilian_commercial
  (needs a 'Civilian & Commercial' label) and the criminal_vnsa actor-vs-logistics
  split (needs an 'Illicit Logistics' label). These CANNOT be done collection-only
  without recreating the mis-filing bug, so they wait for the app-side label work.
  (4) per-category query groups — the keyword-widening; DEFERRED, its own pipeline
  session (tune iteratively, watch queue volume; source_stream now tags which stream
  found each row, incl. culls, so noisy streams are identifiable).
  (5) horizon: second source for non-event categories.
  Design intent (retained): the loop tunes the GATE, not the keywords — queries fix
  coverage, the loop fixes judgment on what was pulled. Both needed. (Horizon
  second-source: investment/legal are structurally weak in GDELT; a widened query
  gets the news fraction only.)
- **Current pipeline facts (diagnose 2026-07-28):** GitHub Action daily 06:00 UTC
  (.github/workflows/daily-intelligence.yml) -> scripts/fetch-intelligence.js;
  8 queries/run (4 country batches + 4 theme: iranian-supplier/guerrilla/cartel/
  manufacturers), all threat-shaped, hardcoded in gdelt-fetch.js; threshold=5;
  in-app bridge syncFromContestedSkies every 6h. cs_articles: 201 rows (~3.5/day).
  The routing tree / channel field / geography-as-list (Cowork's routing-design.md)
  are ROUTING-layer, downstream, part of the August restructure — NOT collection.
- **⚠ WATCH — culled-insert failures are SILENT.** A failed cull-archive insert warns
  + backs up locally but does NOT flag the run as errored (deliberate: archive tier
  is non-critical). Consequence: if the cull write fails for a stretch, runs stay
  green while NO recall-side substrate accumulates. If you later rely on culled
  rows for training, periodically check status='culled' row count is still growing
  (currently 152, dated 2026-07-28). Not a bug — a silent-failure mode to monitor.
- **⚠ QUERY-NOISE FINDING (concrete input for the query-widening step)** — the first
  retain-enabled fetch culled 152/152 (0% pass), ALL at score 0 (hard-gate fails,
  not borderline). Samples were pure world-news noise ('Sudan health collapse', a
  'Face the Nation' transcript, an Iran/Ukraine/Caspian piece) dragged in by the
  'manufacturers' and 'guerrilla-actors' theme queries whose keywords (Bayraktar,
  guerrilla, Revolutionary Armed Forces) match non-LATAM-drone stories. When tuning
  the query net, the retained culled rows are now the study material: identify which
  query streams produce only 0-score noise and tighten/drop them. This is exactly
  why source_stream (step 2) matters — it tags WHICH stream produced each row.

**✅ DONE 2026-07-27: the 28 Contested Skies un-approve.** All 28 `board-info-latam`
`intelligence_sources` rows flipped `approved`→`unreviewed` in cloud + local mirror
(verified in-app: pending count rose by 28, articles back in review queue; Info Pages
New Sources still empty as expected — routing intentionally NOT restored). Live-derived
id set, guarded so the 4 stale `csa-fw` rows were untouchable. Attribution record:
`recovery/cs28-snapshot-20260727-2158.json` (all columns verbatim — the ONLY surviving
trace of original `reviewed_by_*`/`reviewed_at`, since `intelligence_sources` has no audit
table; inverse-apply from it restores the prior approved state). RESIDUALS (accepted, not
forgotten): (a) `cs_articles` still `status='approved'` for these 28 URLs — GDELT learning
gate still sees them approved; no reset path exists, correct value unconfirmed; revisit
deliberately. (b) `queue_section` retained on the now-unreviewed rows — harmless, re-derived
on re-approve. _(Committed `320d2a9`: `scripts/recovery/unapprove-cs28.mjs` + the snapshot.)_
_(This SUPERSEDES the prior "re-route" plan — Dorian changed the decision to un-approve.)_

**LATEST (2026-07-26/27, session close) — DESIGN SESSION + RECOVERY PLAN.** No code shipped
after To-Do 2.5d; this is design capture + a diagnosed recovery task. _(This entry's ROADMAP
and NEXT are authoritative and SUPERSEDE the roadmap/plan in every entry below — the
recovery decision changed from re-route to UN-APPROVE.)_

**★ RECOVERY TASK — ✅ DONE 2026-07-27 (see resume-point NEXT above; commit `320d2a9`) —
28 Contested Skies approvals, wiped routing pointers.** 28 articles approved in Intelligence (cloud `intelligence_sources`, SAFE) do not
appear in Info Pages "New Sources." Diagnosed: approval writes an `info_page_sources` row at
`stage='new'`, but `info_page_sources` is **LOCAL-ONLY** (Phase B2 migration paused). [SUPERSEDED 2026-07-30: B2 SHIPPED — info_page_sources + info_page_changes are CLOUD (schema `3a1dc06`; writers B2b-1 + B2b-2 `0321259`). This line reflects the pre-B2 state.] The
machine reset wiped the local DB → routing pointers lost, approvals (cloud) survived.
**DORIAN'S DECISION: truly UN-APPROVE all 28** (flip back to unreviewed, re-review fresh) —
**NOT** restore routing.
- A read-only diagnose was RUN this session. Findings: the flip primitive already exists —
  `intelCloud.revertToUnreviewed(id)` / IPC `intelligence:revertToUnreviewed` (writes CLOUD,
  re-syncs mirror). The exact 28 = **cloud** `intelligence_sources WHERE
  project_board_id='board-info-latam' AND status='approved'` (exactly 28, all with
  `reviewed_at`). ⚠ The **local mirror shows 32** — the extra 4 are seeded framework rows
  `csa-fw-01..04` (cloud `status='pushed'`, not approved); exclude with `reviewed_at IS NOT
  NULL` if ever touching local. The review tab reads **cloud-first**, so the flip must (and
  does) target cloud.
- ★ **NOT fully reversible:** the flip NULLs `reviewed_by_id/name` + `reviewed_at`
  (attribution/timestamp unrecoverable from the row); `status` + `queue_section` are
  restorable (queue_section is re-derived on re-approve). **SNAPSHOT the 28 rows (all columns)
  BEFORE flipping.**
- **Side effects:** no `info_page_sources` pointer to clear (already wiped, 0 rows); badge/
  pending counts self-correct (cloud-first, live from status); leave `project_board_id`
  intact. **One open item:** approve also pushed `cs_articles.status='approved'` by URL; the
  flip does NOT un-push it, so the GDELT learning gate still sees those 28 URLs as approved
  (the documented "un-reject doesn't un-push" gap — correct reset value unconfirmed). Accept
  for now (the un-approve still returns them to the queue) or reset `cs_articles` separately.
- **ALSO decided but DEFERRED: finish B2** — migrate `info_page_sources` to cloud so routing
  survives future resets. Its own careful **live-table migration (N-2a care class:
  byte-verify, upsert-by-id mirror, no delete)**, NOT rushed.

**★ CONTESTED SKIES — DESIGN SESSION OUTPUT (proposed model — MUST be reconciled with the
LIVE PAGE before building).**
⚠ **CRITICAL:** this session specified a NEW model through conversation, but the LIVE PAGE
(`index.html`, a 121 KB standalone HTML page) has a DIFFERENT, already-built structure. They
do NOT fully match. **Reconciling them is the FIRST design task, not a settled fact.**

**THE LIVE PAGE (`index.html`) — what actually exists today:**
- Framing: "Contested Skies Monitor — Latin America Drone Threat Tracker", "criminal and
  paramilitary drone use" — a **SECURITY/THREAT lens, VNSA-heavy, incident-forward.**
- **7 sections:** (01) Regional Threat Map [**A MAP ALREADY EXISTS**], (02) Incident Feed
  [+Top Sources, Most Cited VNSAs, Incident Composition], (03) Weaponized Platforms [systems
  catalog **ALREADY EXISTS**: DJI Mavic 3, Shahed-136 deriv, Mohajer-6…], (04) Capabilities &
  Investment Tracker [domestic manufacturers + procurement, **ALREADY country-organized**:
  Colombia/Brazil/Argentina/Mexico/Venezuela], (05) Illicit Finance Nexus [cartel laundering,
  crypto — **NOT in the proposed model**], (06) Regulatory Comparison, (07) Source Archive.
- Design: dark navy palette, Playfair Display + JetBrains Mono + Inter Tight, grain overlay.
  (`index.html` is in `/mnt/user-data/uploads` and the repo `Doriankantor/contested-skies-monitor` — locate it.)

**THE PROPOSED MODEL (from this session's design conversation):**
- Map-navigated; **REGION (all-LATAM) view + per-COUNTRY summaries** (countries active when
  they have content).
- Each summary (region + country) = **SIX dimensions + an "Our Analysis" synthesis block:**
  1. **SYSTEMS** — reference CATALOG (master + presence: one region-wide master list, each
     platform defined once w/ specs/origin/civilian-military-**DUAL-USE** status; country views
     show which systems are PRESENT, as links not re-descriptions; presence is many-to-many,
     fed by the pipeline's `capabilities[]` extraction).
  2. **OPERATORS & DEPLOYMENT** — who fields what (govts + VNSAs) and how.
  3. **INVESTMENT DECISIONS.** 4. **LOCAL DRONE & C-UAS INDUSTRY.** 5. **EXTRA-REGIONAL
     ACTORS.** 6. **LEGAL FRAMEWORKS.** (dims 3-5 reference the catalog.)
- **ROUTING = many-to-many tag-driven fan-out:** per-article GEO-tags (countries/region) +
  KNOWLEDGE-AREA tags (dimensions) + SYSTEM references (via `capabilities[]`), all set in the
  app during review. Item lands in every matching (geo × dimension) cell; system refs
  establish catalog presence per country. REGION view = region-tagged ∪ aggregated country
  content + own Our Analysis. **Data shape = association/join tables, NOT single
  board_id/section fields.** Tag vocabulary IS both the taxonomy AND the routing key (same
  vocab as article/interview markup).
- **SOURCING GAP:** GDELT pull is EVENT-shaped → feeds Systems/Operators/Incidents well,
  **STARVES Investment/Industry/Legal** (structural). DECISION: **widen the GDELT query**
  (accept low signal, human synthesizes in Our Analysis) — a SEPARATE careful pipeline task
  (tune iteratively, affects review-queue volume), NOT part of the page redesign.

★ **THE RECONCILIATION QUESTIONS the redesign must answer FIRST (do not skip):**
- Live page is a VNSA/threat tracker; proposed model is a broader 6-dimension ecosystem
  (operators incl. **GOVERNMENTS**, investment as a dimension). **Which framing wins, or how
  do they merge?**
- Live page has "Illicit Finance Nexus" (cartel laundering/crypto) — **NOT in the 6-dim
  model.** Keep it (7th dimension?), fold it, or drop it?
- The live map, platforms catalog, and country-organized investment tracker **ALREADY EXIST**
  in `index.html` — the redesign **EXTENDS/RESTRUCTURES** these, it is **NOT greenfield.**
- Is `index.html` **hand-authored static HTML, or generated from the app's data?** (Determines
  whether the redesign is "restructure the page" vs "build the app→page generation.")

**REDESIGN = COWORK session, mockup-first.** It must START by reading `index.html` + the app's
info-page rendering, reconcile live-vs-proposed, THEN design. `world-atlas` is installed (a map
already exists in `index.html` — reconcile with the world-atlas approach).

**★ ROADMAP (resequenced this session — authoritative):**
1. **RECOVERY:** un-approve the 28 (Dorian's call), then B2 migration. ← **first.**
   - **1b. ★ INFO-PAGE BOARD STATES slice** (small; do AFTER recovery, as ONE slice). Set
     visibility/activity across the 4 info-page boards. **Decided:** Contested Skies
     (`board-info-latam`) = **ACTIVE**; The Stated Order (`board-info-statedorder`) + Hollow
     Border (`board-info-hollowborder`) = **DORMANT** (grayed/idle, collection paused — **this
     state ALREADY EXISTS**: they're `pipeline:false` + empty keywords today, so the 2 dormant
     "flips" are effectively confirming/labeling, not new machinery); Immigration Undone
     (`board-info-trump`) = **HIDDEN** (fully OUT of the active list — a **NEW state**, does not
     exist yet). **NOTHING DELETED — all reversible; all board data preserved.** Do the 2
     dormant + the new hidden state **together as ONE slice.**
     - **BUILD:** the visibility filter already exists (`infoPages:list` filters
       `board_type='info-page' AND deleted=0 AND archived=0`, then intersects visible board
       ids — per diagnose). "Hidden" reuses the **existing `archived=1`** path
       (`boards:archive`/`boards:restore`, reversible, data kept) — a new VALUE on an existing
       filter, **not new machinery.** Small. (Optional cosmetic: a labeled ACTIVE/DORMANT badge
       in the sidebar is net-new read-side UI — the `status` field is stored+cloud-synced but
       currently UNREAD except the `setup-pending` badge; skip unless wanted.)
     - ⚠ **TEST — hiding must remove the board from EVERY surface, not just the Info Pages
       list:** the list, any board/project pickers (routing targets, tag-to-project selectors,
       owner/head pickers), and the intel routing fan-out. Verify all, not just the list.
     - ✅ **TIER CONFIRMED CLOUD (diagnose):** `workspace_boards` incl. `board_config`,
       `archived`, `deleted`, `position` is CLOUD-migrated + realtime (`boardsSeed.ts:50`,
       `boardsRealtime.ts:62`) with a local mirror — so board-state changes **SURVIVE a reset**
       (unlike `info_page_sources`, which was local-only). Prefer/keep cloud.
     - ⚠ **SAFETY — diagnose CORRECTION (contradicts the queued brief):** all 4 boards exist
       cloud + mirror, all `status:"active"`, `archived=0`. **All routed/approved intel +
       `info_page_items` are on `board-info-latam` ONLY.** `board-info-trump` (Immigration
       Undone) currently holds **ZERO routed intel, ZERO `info_page_items`, ZERO
       `info_page_sources`** — only 1 owner (head) + 1 board_member (cloud) + its own
       config/identity (repo `Doriankantor/Trump-immigration`, `index.html`). `info_page_sources`
       is **0 everywhere** (local wiped by reset; table absent on cloud — B2 not done). So
       hiding Immigration Undone risks **no content today** — but the slice is still
       reversible-only (archive, never delete) so any data it later accumulates is safe.
2. **Slice 5 — intel directives, CONTESTED SKIES ONLY** (other research boards DORMANT:
   Immigration Undone / Hollow Border / The Stated Order — deferred, not deleted). Reuses
   `createAssignment` + `source_type='intel-directive'` + board-scoped head gate.
3. **Intelligence + Info Pages RESTRUCTURE incl. the Contested Skies redesign** — **AUGUST
   DEADLINE**, design-first/mockup-first (Cowork). Contains publication pipeline + interview
   markup (per-highlight annotation, design-only, folded in).
4. **Team console** — consolidate people-mgmt into one page; "mostly relocating existing
   controls"; after publication.
5. **To-Do 2.6 full collaboration** — shared personal todos, DESIGN-LOCKED, DEFERRED.

**★ To-Do 2.6 (deferred) — locked model + key finding.** Shared personal todos: owner +
collaborators, equal edit, invite/accept/decline/re-invitable, everything shared-state
(recurrence respawns to all, missed/dismiss/steps shared). ★ **CHEAP/EXPENSIVE BOUNDARY:**
shared **COMPLETION is cheap** (diagnose verdict A: `personal_todos` IS cloud-materialized +
personalSync **BIDIRECTIONAL** → gated cloud completion write reconciles on drain, no new
path; a "lite" view+shared-done version is **~3 slices**). **CONTENT editing is the
foundational rework** (multi-writer → off personalSync → live migration → breaks
recurrence/missed/off-work; **~10 slices**). Dorian: do the **FULL model, deferred to after
publication**; lite kept as fallback.

**LATEST (2026-07-26, session close) — DESIGN ARC + RECOVERY PLAN.** No code shipped this
session after 2.5d; this is design + a diagnosed recovery task. _(This entry's RESEQUENCED
ROADMAP is authoritative and SUPERSEDES the roadmap in the "2.6 DESIGN ARC" entry below —
recovery now leads.)_

**★ INCIDENT + RECOVERY PLAN — 28 Contested Skies approvals, wiped routing pointers.**
Symptom: Contested Skies (`board-info-latam`) "New Sources" tab empty; 28 articles
approved in Intelligence not surfacing. DIAGNOSED (not data loss, not a code bug): the 28
approvals are SAFE in cloud `intelligence_sources`. Approval routes them by writing an
`info_page_sources` row at `stage='new'` — but `info_page_sources` is **LOCAL-ONLY** (the
Phase B2 cloud migration was deliberately paused; the table does not exist in cloud —
verified this session). [SUPERSEDED 2026-07-30: B2 SHIPPED — info_page_sources + info_page_changes are CLOUD (schema `3a1dc06`; writers B2b-1 + B2b-2 `0321259`). This line reflects the pre-B2 state.] The machine reset wiped the local DB, so the routing POINTERS were
lost while the approvals (cloud) survived. The pointer is DERIVABLE from the surviving
approval state — **fully recoverable.** _(Diagnose evidence: cloud `intelligence_sources` =
268 rows all `board-info-latam` incl. 20 `pushed` + 28 `approved`; cloud `cs_articles` =
197, GDELT ran 2026-07-26 — pipeline healthy; local `info_page_sources`/`info_page_items` =
0; local intel mirror only 92 of 268 — partial post-reset re-sync; "New Sources" reads
`getSourcePipeline` → `FROM info_page_sources … stage='new'`, so 0 local rows ⇒ empty tab
regardless of intel state.)_
★ **PLAN (do FRESH, in this order — do NOT do exhausted; the 28 are safe and not
time-pressured):**
  1. **B2 FIRST** — migrate `info_page_sources` to cloud (durable routing; a reset can't
     wipe it again). Live-table cloud migration, **same care class as N-2a**: byte-verify,
     upsert-by-id mirror, no delete. This is the ROOT-CAUSE fix.
  2. **THEN re-route the 28** — idempotently regenerate the missing `stage='new'` rows in
     the NOW-CLOUD table from the cloud `intelligence_sources` approvals. ⚠ **MUST check for
     existing pointers first** (partial survival) to avoid duplicates. Route into **CLOUD,
     not local** (routing into local then migrating = double-migrate).
  **Sequence rationale:** B2 before re-route so the 28 land somewhere durable first try.

**★ CONTESTED SKIES — CONTENT SPINE LOCKED; FORMAT REDESIGN NEXT (Cowork, mockup-first).**
Corrected understanding (I had it wrong twice — record the RIGHT version): Contested Skies
is a **REGION-WIDE (all Latin America)** analytical page on the **DRONE and COUNTER-DRONE
(C-UAS)** landscape. **NOT** a country-monitor, **NOT** an incident feed, **NOT**
system-organized. Organized by **FIVE DIMENSIONS** of the LATAM drone/C-UAS ecosystem (the
**CONTENT SPINE — locked**):
  1. **Systems** used by governments and VNSAs
  2. **Investment** decisions
  3. **Local** drone & counter-drone industry
  4. **Extra-regional actors** (outside suppliers/backers)
  5. **Legal frameworks**
The **FORMAT** (not the spine) is being redesigned — the current page "aggregates a lot of
info" in a format Dorian dislikes. Redesign = a **COWORK** session, **mockup-first**, built
around an **INTERACTIVE LATAM MAP**: `world-atlas` (`npm i world-atlas`) already installed on
the laptop; countries must be **CLICKABLE**; the click interaction (filter dimensions vs
country panel vs both) is **UNDECIDED** — decide from the rendered map, not upfront.
★ **THE CORE PROBLEM the redesign must solve** (the publication "meat and potatoes"): how
intel-process content gets **ORGANIZED** onto the page across the five dimensions + by
country, AND how the publication process feeds info **BACK** to this page (approved intel →
placed → published loop). A kickoff Cowork prompt was drafted.

**★ 2.6 — invited collaboration = SHARED PERSONAL TODOS. DESIGN-LOCKED, DEFERRED (after
publication).** Model: **OWNER + COLLABORATORS**; owner holds sharing/deletion; collaborators
**EQUAL EDIT**. Invite → notify → accept/decline, re-invitable. **EVERYTHING shared state**
(recurrence respawns to all, missed-state shared, dismiss shared, steps shared-edit); the only
per-person concept is **list membership**.
★ **THE CHEAP/EXPENSIVE BOUNDARY (key finding): between "toggle DONE" and "edit CONTENT".**
  - **Shared COMPLETION is CHEAP** — diagnose verdict (A): `personal_todos` IS
    cloud-materialized, personalSync is **BIDIRECTIONAL**, so a gated cloud completion write
    lands in the owner's view on next drain, **NO new reconcile**. A **"lite"** (view +
    shared-done only, via `todo_collaborators` + gated cloud toggle, owner stays on
    personalSync/offline) is **~3 slices**.
  - **CONTENT editing is the FOUNDATIONAL REWORK** — makes `personal_todos` multi-writer,
    forces them OFF personalSync, triggers a LIVE-TABLE migration, breaks
    recurrence/missed/off-work/dismiss assumptions. **~10 slices.**
  **DORIAN'S CALL:** the **FULL model, DEFERRED to after publication.** Lite kept as a
  fallback if the full rework proves too costly when its turn comes.

**★ RESEQUENCED ROADMAP (authoritative):**
1. **RECOVERY: B2 (`info_page_sources` → cloud) + re-route the 28** (see above). ← **do first.**
2. **Slice 5 — intel directives, CONTESTED SKIES ONLY** (Dorian deferred the new research
   boards: **Immigration Undone / Hollow Border / The Stated Order go DORMANT, not deleted**).
   Reuses `createAssignment` + `source_type='intel-directive'` + board-scoped head gate. Small.
3. **Intelligence + Info Pages RESTRUCTURE incl. the Contested Skies redesign** — the **AUGUST
   DEADLINE**, **DESIGN-FIRST / MOCKUP-FIRST (Cowork).** Contains the publication pipeline AND
   **interview markup** (per-highlight annotation, design-only, folded in).
4. **Team console** — consolidate scattered people-mgmt into one page; "mostly relocating
   existing controls" (Dorian); after publication.
5. **2.6 full collaboration** — deferred.

**LATEST (2026-07-26, session close) — 2.6 DESIGN ARC + ROADMAP RESEQUENCED.**

To-Do 2.5 (assignment) is complete and shipped (a→d, see the prior entry). This session
also ran a full DESIGN arc on **To-Do 2.6 (invited collaboration)** and **resequenced the
remaining roadmap**. **NO 2.6 code was written** — it is design-locked and DEFERRED.

**★ 2.6 — invited collaboration = SHARED PERSONAL TODOS. DESIGN-LOCKED, DEFERRED (after
publication).** The model (locked with Dorian):
- Personal todos become shareable: **OWNER + COLLABORATORS.** Owner holds sharing /
  deletion / lifecycle; collaborators have **EQUAL EDIT on content**. Invite → notify →
  **accept/decline, RE-INVITABLE** after decline. Leave by removal (self or owner); **delete
  is owner-only**.
- Everything is **SHARED STATE** (the whole simplification): recurrence respawns to **ALL**;
  missed-state is **single/shared** (anyone clears); **dismiss is shared** (hides for all);
  **steps shared-edit**. The ONLY per-person concept is **list membership**. This collapses
  the hard multi-user-state problem into a **single-shared-object** problem.
- ★ **THE CHEAP/EXPENSIVE BOUNDARY (the key architectural finding):** it runs exactly
  between **"toggle DONE"** and **"edit CONTENT"**.
  - **Shared COMPLETION (view + toggle done) is CHEAP.** Architecture-diagnose verdict (A):
    `personal_todos` IS cloud-materialized and personalSync is BIDIRECTIONAL, so a
    collaborator's gated cloud completion-write lands in the owner's view on next drain —
    **NO new reconcile path**. A **"lite"** version (view + shared-done only, via a
    `todo_collaborators` table + a gated cloud completion toggle, owner stays on
    personalSync/offline) is genuinely **~3 slices**.
  - **CONTENT editing (collaborator adds steps / edits notes / title) is the FOUNDATIONAL
    REWORK:** it makes `personal_todos` **multi-writer**, forcing them **OFF personalSync**
    (single-owner contract), triggering a **LIVE-TABLE migration**, and breaking
    recurrence-ownership / missed / off-work / dismiss assumptions. **~10 slices.**
    _(NOTE — the second architecture diagnose (2.6-lite two-writer question) sharpened this:
    personalSync's drain is a WHOLE-ROW unconditional upsert, so even shared COMPLETION on a
    still-owner-on-personalSync row races unless the owner's shared-todo writes go field-level
    /cloud-first. "Cheap" still holds for a lite build, but the owner's shared-row write
    discipline is the precise thing that must change — see the diagnose for the full trace.)_
- ★ **DORIAN'S DECISION: do the FULL model (equal edit), NOT lite — but DEFERRED to AFTER
  publication.** Collaboration is essential but **undated internal tooling**; it does not jump
  the August publication deadline. The full-model spec above is recorded so it is not
  re-derived; **lite exists as a fallback** if the full rework proves too costly when its turn
  comes.

**★ RESEQUENCED ROADMAP (this session):**
1. **Slice 5 — intel directives.** SHRUNK: Dorian is DEFERRING the new research boards
   (Immigration Undone, Hollow Border, The Stated Order go DORMANT); only **CONTESTED SKIES**
   stays live. So slice 5 serves **ONE board**. Reuses `createAssignment` +
   `source_type='intel-directive'` + the board-scoped head gate (2.5b machinery, built +
   tested). Small.
2. **Intelligence + Info Pages RESTRUCTURE — the AUGUST DEADLINE.** ★ **DESIGN-FIRST /
   MOCKUP-FIRST** (not diagnose-to-build). This project **CONTAINS** the publication pipeline
   (New sources → Analysis & design → Publish → Latest update notes → Sources) AND **interview
   markup (per-highlight annotation)** — they are NOT separable from the restructure. Open it
   with a vision/mockup pass, not a build diagnose.
3. **Team console** — consolidate scattered people-management (Settings→Board Access +
   Team→Member Permissions + the 2.5b-0 head toggle + off-work/leave) into one Team view.
   Dorian: "mostly relocating existing controls" — contained, AFTER publication.
4. **Full collaboration (2.6 above)** — deferred, deliberate, **no deadline**.

**★ RESEARCH-BOARD DEFERRAL (2026-07-26).** **Immigration Undone / Hollow Border / The Stated
Order are DORMANT for now** — Dorian is deferring new research projects; **only Contested Skies
is live**. They **remain in the schema; NOT deleted.** Slice 5 and collection scope stay
**Contested Skies only** until Dorian revives them. (Consistent with the pre-existing standing
issue "Only Contested Skies has news-pull architecture" — this makes it a deliberate call, not
just an unbuilt Phase 2.)

**★ PARKED-ITEMS RECONCILE (2026-07-26/27) — consolidated so nothing is lost.** All still queued:
**WIDEN GDELT pull for Investment/Industry/Legal** (NEW this session — the GDELT query is
EVENT-shaped and structurally starves the investment/local-industry/legal dimensions; widen it,
accept lower signal, human synthesizes in "Our Analysis"; a careful iterative PIPELINE-repo task
that affects review-queue volume — NOT part of the page redesign);
**interview markup** (per-highlight annotation — folded INTO the restructure, design-locked
#5, design-only/unbuilt); **analytical-frameworks-per-project** (never authored; a quality
ceiling, deferred until the intel process is complete); **archive-sidebar cleanup** (the
sidebar Archive expander was removed in `ff2bd9a`; residuals: archived-card panel reads live
context lists → blank stage dropdown; "Restore all" skips cloud boards); **`~/.zshrc:4` +
`~/.zprofile:1` stale `GH_TOKEN` export** (wins over `.env`; FIX is Dorian's — delete both
lines; there is no separate "line-2 typo" item, only this stale-token export); **News
hand-add-article** — ALREADY SHIPPED (`b076929`; requires a project via `d4e8ce9`) — kept here
only so it is not re-opened as "missing"; **★ LEARNING-LOOP CORRECTION 2026-07-28 (verified in code, not assumed): the loop
is LIVE.** On every pull, `learning.js` `fetchCalibration` reads `cs_articles` approved/
rejected (last 120 days) and feeds the gate TWO signals: few-shot examples in the Haiku
prompt (`categorize.js`) + deterministic score nudges by source/category approval rate
(source >=0.75 +1, <=0.25 -2; category >=0.8 +1, <=0.2 -1; clamped +/-2; min samples 4
source / 6 category; applied AFTER the hard gate). Write side: approve/reject ->
`cs_articles.status` via `pushVerdictToSupabase` (`index.ts:82`). Verified live: 24
approved / 12 rejected in cloud. It does NOT modify the GDELT query and does NOT override
the 3 hard-gate questions. **★ KNOWN LIMIT (load-bearing):** the loop only sees articles
that SURVIVED the gate (score >=5). The machine cull (`fetch-intelligence.js:394-397`)
discards sub-threshold articles with NO stored row (only a count logged) -> the loop is
blind to its own false-negatives, so it can tune precision but not recall. This is WHY
retain-first leads the collection redesign. _(This SUPERSEDES the prior "loop unbuilt /
raw material captured, loop not yet wired" phrasing; the linked open bug — un-reject
doesn't un-push — remains.)_;
**`.env` blanks** — `GH_TOKEN` (regenerate) + `GOOGLE_CLIENT_ID`/`SECRET` (Google OAuth,
Drive sync), both BUILD-TIME baked via `define()`; **X/Twitter pipeline** (seed handle
**@erichsaumeth**) — Dorian-flagged;
**not previously recorded in this doc** and not in-app (PIPELINE-repo territory, alongside
collection dedup / outlet targeting) — logged now so it is not lost.

**★ 2.5 CARRY-FORWARD VALIDATIONS (still pending — validate when the team roster is
repopulated** with Daniel / Leonardo / Juan Diego as `board_members`): **N>1 multi-assign
fan-out** (looping `createAssignment` + per-assignee notify to >1 recipient) and **the gate
REJECTION path** (2.5b-1 GATE B / 2.5d step gate — an unrelated peer being REFUSED). The ALLOW
paths + cross-person notify ARE verified live (root → dk).

**LATEST (2026-07-26) — TO-DO 2.5 FUNCTIONALLY COMPLETE** — the assignment feature
(create → notify assignee → complete → notify assigner → +steps/notes/sidebar) is
whole and proven on live data. Slices a / a-fix / b-0 / b-1 / c / d.

The off-card assignment feature is functionally whole: a board Head assigns work to
board members, the assignee is notified, completion notifies the assigner back, and
the cards have full personal-todo parity (steps, notes, detail sidebar).
Slices:
- **`b607ac7` 2.5a — assignments entity + read path.** Cloud table + local mirror,
  "Assigned to me" / "Assigned by me" tabs. One row per (assignment × assignee);
  `assignee_email` scalar; cloud-first via the boards.ts/notifications pattern, **NOT
  personalSync** (multi-user — same scope-contract trap as always). `source_type`/
  `source_id` reserved for slice-5 intel directives.
- **`0c5f417` 2.5a-fix — `board_id` NOT NULL.** DESIGN CORRECTION: off-card
  assignments are **board-scoped and always human-triggered**; a board Head assigns
  to a member of THAT board, and slice-5 intel directives are the SAME act (a head
  tasks a member with culling an intel stream; the AI does the culling, the head
  issues the directive). One actor, one gate, one table. `board_id` is the permission
  anchor. Local **drop+recreate** (SQLite can't ADD NOT NULL without a default that
  reintroduces the falsy value); cloud ALTER on the emptied table.
- **`c84da27` 2.5b-0 — board heads span ALL board types.** `info_page_owners` is
  structurally a plain `board_id→head_email` table (its only constraint, the FK to
  `board_members`, is board-type-agnostic and gives head-implies-member for free);
  `isOwner`/`addOwner`/etc already work on any board id. Relaxed 5 Team.tsx renderer
  conditionals + neutralized "project head / info-page" copy to "Head". Table/column
  names (`info_page_owners`/`page_id`) **KEPT**, commented as spanning all board types
  (renaming an FK'd permission table is the prefix-clobber risk family — not worth it).
- **`17a8910` 2.5b-1 — gated write path (+Add → Assign to other).**
  `listBoardsWhereHead` + `listBoardAssignees` back the pickers. `assignment:create`:
  **GATE A** (actor `isOwner` or root), **GATE B** (assignee in `listBoardAssignees`,
  best-effort). **`assigner_email` = actor.email ALWAYS**, never from the renderer
  payload. Multi-assign loops `createAssignment`, best-effort per-assignee results.
  Per-assignee notify via the **choke point**, SKIPPED on self-assign. Verified live:
  gate-A dropdown, assigner integrity (dk vs root recorded per actual actor),
  cross-person notify, self-skip.
- **`7cb1f5d` 2.5c — completion + notify-back.** `assignment:complete` sets
  `completed_at` and notifies the **ASSIGNER** ("X completed: …"), self-skip when
  completer == assigner. Uncomplete toggles, no notify. Dropped the `completed_at IS
  NULL` filter (4 sites) so completed assignments stay struck-through in the Completed
  section. Board `todo:complete` **UNTOUCHED** (separate handler / table / recipient —
  it notifies admin via `stage_change`; the two must never converge). Verified live:
  notify-back to root, self-skip, `completed_at` persistence, strike-through-to-Completed.
- **`6f21976` 2.5d — full-parity assignment cards.** Assignment rows get the
  `PersonalCard`/`TodoDetailPanel` treatment for the HONEST-parity subset: completion
  + sub-steps + notes + detail sidebar. **NOT** star/color/recurrence/missed/dismiss
  (personal-organization concepts that don't fit a shared assignment — over-parity).
  New **`assignment_steps`** table (cloud + mirror) via `cloud/assignmentSteps.ts`
  (boards.ts pattern, **NEVER personalSync**). Steps gated **assignee-OR-head**
  (`gateAssignmentEdit`: actor===assignee OR `isOwner(board_id)` OR root); **INDEPENDENT
  of parent completion** (a ticked step must not auto-complete — that would
  surprise-fire the 2.5c notify-back). Notes reuse the `body` column. `PersonalCard`/
  `TodoDetailPanel` parameterized by **`kind='personal'|'assignment'`** (reused, **NOT
  forked** — they're presentational/IPC-free; forking would duplicate the slide/focus/
  dnd machinery). **NOT LIVE** across users (no realtime on assignments; steps show on
  next refetch). Verified live: steps persist/reorder/toggle-independent, notes→body,
  personal todos not regressed.

★ **THE WHOLE LOOP verified on live data:** assign → notify assignee → complete →
notify assigner (+ full-parity cards). This is the first big payoff of the
notifications cloud arc.
**The gate is `isOwner` (board-scoped head), board-type-agnostic — `can_assign` was
never built and does not exist** (see the UNIFIED HEAD ROLE entry under Known issues).

**★ NEXT: To-Do 2.6 — invited collaboration.** A DIFFERENT animal from assignment:
non-board-scoped "invite someone to collaborate", with its own mechanics per the
locked three-concepts split (**assigned** / **invited-collaboration** / **personal**).
Do NOT model it as an assignment variant — it is not board-scoped and not head-gated.
Then: **slice 4** (card permission tiers + consolidating the ungated
`todo:complete`/`assignmentStep` gate story), **slice 5** (intel directives — reuse
`createAssignment` with `source_type='intel-directive'` + the board-scoped head gate,
exactly the 2.5b machinery), then **Team console**, then the **Intelligence + Info
Pages restructure**.

**Deferred (mentioned, NOT built):** assignment **CHAT** (floated as a possible 2.5d
piece — deferred, would need its own `assignment_chat` table + UI); **realtime on
assignments/assignment_steps** (a later slice if the team wants live cross-user
updates — 2.5 relies on refetch-on-open/`queueLoad`); the **ungated `todo:complete`
permission gate** (slice 4 — independent of the assignment work).

**★ Verified BY CONSTRUCTION, not live — validate when the roster is repopulated**
(Daniel / Leonardo / Juan Diego re-added as `board_members`; post-reset every board
has only dk@):
- **N>1 multi-assign fan-out** (2.5b-1) — looping `createAssignment` + per-assignee
  notify to more than one recipient.
- **The gate REJECTION path** (2.5b-1 GATE B; 2.5d step gate) — an unrelated peer
  being *refused*. The ALLOW paths (assignee, head, root) and cross-person notify ARE
  verified live (root → dk).

**LATEST (2026-07-25) — N-2c-3 SHIPPED. NOTIFICATIONS CLOUD ARC COMPLETE.**

- **`bea5a02` — N-2c-3: offline `markAllRead` stays online-required, shown as a
  disabled control.** **DECISION, not a ledger:** there is **NO purely-local signal
  that proves a row is in cloud** (`pending_sync` is overloaded — "synced" vs
  "legacy never-synced"; the `@`-filter fails because N-1 rewrote unread legacy rows
  to email keys). A blind offline mark-all would seed D8-excluded rows into a
  delete-less cloud table. So offline `markAllRead` is **INTENTIONALLY
  online-required** — no `cloud_confirmed` column, no schema change. **UX only:** the
  "Mark all as read" button is disabled+dimmed offline with an "Unavailable while
  offline" tooltip (matches the Intel-tab lockout pattern), so a blocked-by-design
  action reads as a **disabled affordance, not a rose error**. The `{ok:false}` rose
  path is kept as the hysteresis-window backstop. Single-row `markRead` stays enabled
  offline (N-2c-2). **Renderer-only.**

**★ NOTIFICATIONS CLOUD ARC — COMPLETE.** Full path summary for future reference:
  - **N-1 (`720dbb8`):** identity unification, `user_id` → `user_email`, single choke point
  - **N-2a (`8851499`):** cloud table + two-tier cloud-first read / mirror-fallback
  - **N-2b-1 (`64df164`):** Inbox stops lying on mark-read failure
  - **N-2c-1 (`87483b2`):** offline-CREATED notifications reach cloud via `pending_sync`
    marker + reconnect/launch sweep
  - **N-2c-2 (`3ea4021`):** offline single-row mark-READ via the same sweep, with the
    `syncMirror` `pending_sync=0` guard and the `created_at` cloud-membership split
  - **N-2c-3 (`bea5a02`):** offline bulk mark-read intentionally online-required

  Every notification path is now either cloud-backed or deliberately online-required
  with honest UX. **THE #1 PRIORITY-ORDER BLOCKER IS CLEARED.**

**★ NEXT: To-Do 2.5** — "Assigned to me" / "Assigned by me" tabs (currently empty).
This was **BLOCKED on notifications→cloud** (assignment notifies the assignee,
completion notifies the assigner back) — now **UNBLOCKED**. Needs
`board_members.can_assign`, `assigned_by`, and completion-notification-to-assigner
per the locked To-Do design. Then **To-Do 2.6 → 4 → 5**, then **Team console**, then
the **Intelligence + Info Pages restructure**.
_✅ SUPERSEDED / DONE — see **LATEST (2026-07-26)** at the top. To-Do 2.5 (a → d) is
FUNCTIONALLY COMPLETE. This entry's dependency list was wrong on two counts:
`can_assign` was never built (the gate is `isOwner`, board-scoped), and `assigned_by`
is native to the new `assignments` entity (`assigner_email`), not a `board_members`/
`workspace_tasks` column. NEXT is 2.6 (invited collaboration — a separate concept)._

**LATEST (2026-07-25) — N-2c-2 SHIPPED; notifications cloud arc COMPLETE except
the deliberately-deferred bulk path.**

- **`3ea4021` — N-2c-2: offline single-row `markRead` reaches cloud via the N-2c-1
  sweep.** Offline `markRead` writes `read=1, pending_sync=1` and returns `ok`; the
  sweep delivers it. A **FAILED** mirror write returns `ok:false` (N-2b-1 rule —
  never report success we did not achieve). **Load-bearing guard:** `syncMirror`'s
  `ON CONFLICT DO UPDATE` now carries **`WHERE notifications.pending_sync=0`**, so an
  interim online poll (`getNotifications → syncMirror`, same call as `mergePending`)
  can't overwrite a locally-read row back to unread before the sweep runs. The sweep
  **SPLITS its upsert by cloud membership** — created-offline rows send `created_at`
  (they're the origin), read-flipped rows **OMIT** it so cloud's ms-precision
  original is never truncated to the mirror's second-precision copy. `getUnreadCount`
  online branch does **signed pending-merge arithmetic** (a read-flipped-but-unread-
  in-cloud row SUBTRACTS). Sweep failures now log stuck ids. `env.d.ts` widened to
  `{ok, error?}`.
  **VERIFIED LIVE on a real network transition:** the marked row reached cloud
  `read=true`, its `created_at` stayed byte-identical (`.708`, not truncated), its
  same-second twin kept ordering, `pending_sync` cleared, **zero leak**, unread
  counts agreed cloud−1 / local−1.
- **`606d00e` — chore: electron 31.7.7 → 33.4.11** (see the reset note below).

**★ NEXT: N-2c-3** — offline `markAllRead`. **HELD OUT of N-2c-2 for a REAL
reason:** its predicate is unbounded (`WHERE user_email=? AND read=0`), and on a
production DB the N-1 backfill already rewrote ~240 `local-admin` rows to
`CLOUD_ADMIN_EMAIL`, so they're email-keyed and the sweep's `LIKE '%@%'` guard does
**NOT** exclude them. One offline "mark all read" would flip **hundreds** of
D8-excluded legacy rows to `pending_sync=1` and the next sweep would ship every one
into a cloud table **WITH NO DELETE PATH** — the "no seed" decision undone by one
click, unrecoverably. N-2c-3 must first answer: the mirror cannot distinguish "in
cloud, unread" from "never in cloud, unread", so bulk mark-read must mark **ONLY
provably-in-cloud rows**. Needs its own diagnose. Then **N-3** (user-scoped
realtime), then **To-Do 2.5**.
  *(RESOLVED N-2c-3 (`bea5a02`): intentionally online-required — see the decision above.)*

**LATEST (2026-07-24) — NOTIFICATIONS CLOUD ARC: N-2a, N-2b-1, N-2c-1 SHIPPED.**

- **`8851499` — N-2a: cloud `notifications` table + two-tier read/write.** Cloud is
  the source of truth, local SQLite is the **offline mirror**. Reads are
  cloud-first with mirror fallback. The choke point writes the mirror
  **SYNCHRONOUSLY** then dispatches the cloud insert **fire-and-forget**, so a
  failed delivery never fails the parent action. Delivery failures surface through
  the **EXISTING** connection banner via a new `app:notice` push channel —
  deliberately **NOT** an eighth ad-hoc toast. `reportCloudResult` on **READS
  ONLY**: a timer-driven fanout write must never be able to flip the whole app
  offline. Mirror sync is **UPSERT-BY-ID ONLY** — the mirror holds 545+ rows that
  will never exist in cloud, so delete-then-insert (the `known_tags` pattern) would
  destroy local history. **NO SEED (D8):** cloud starts empty and fills from real
  usage.
  ⚠ **CONSEQUENCE:** the Inbox shows **FEWER** rows online than offline until cloud
  accumulates. Expected, not a bug.
- **`64df164` — N-2b-1: Inbox no longer lies when mark-read fails.** Both handlers
  await the result and update state **only on `ok`**; new inline error surface.
- **`87483b2` — N-2c-1: offline-created notifications reach cloud via a pending-sync sweep.**
  `pending_sync` marker set on INSERT, cleared on cloud confirmation; sweep on
  **reconnect + launch+11s**; upsert-by-id with `.select()` confirmation.
  ⚠ **`DEFAULT 0`, NO BACKFILL, and predicate `AND user_email LIKE '%@%'`** — this
  is the line where a typo would push 555 orphaned rows into a cloud table **WITH
  NO DELETE PATH**. Never add a statement that sets `pending_sync=1` outside
  `createNotification`'s INSERT.
  **VERIFIED END TO END:** 10/10 rows reconcile local↔cloud, **six delivered BY THE
  SWEEP** (provable: `createNotificationCloud` stamps sub-second `toISOString()`,
  `toCloudTimestamp` derives from SQLite's second-truncated string — so a
  whole-second cloud timestamp means the sweep wrote it), timestamp delta **exactly
  0s** on every swept row.

**★ NEXT: N-2c-2** (offline mark-read + the `syncMirror` guard + zero-row-match
`.select()` + `env.d.ts` widening + `getUnreadCount` pending-merge). Then **N-3**
(user-scoped realtime axis), **N-4** (off-work notification drop), then **To-Do 2.5**.

**★ DECIDED — OFFLINE-FIRST FOR SHARED DATA IS NOT BEING BUILT (revisit
post-launch).** Queue+reconcile stays limited to data where **CONFLICT IS
IMPOSSIBLE**: personal to-dos (`personalSync`, single-owner) and notifications
(`read` is monotonic 0→1, created rows immutable). **Shared data stays
online-required.** Rationale: the queue is small, the **RECONCILIATION** is a
net-new conflict-resolution system needing a per-surface rule (the documented
higher-order-action-wins case is one of many), nobody uses the app yet so there is
no data on how often researchers are offline, and the intel deadline dominates.
Revisit once real usage shows which actions actually hurt to lose.

**LATEST (2026-07-23, late) — NOTIFICATIONS IDENTITY UNIFIED (N-1) + TWO SMALL FIXES.**

- **`720dbb8` — N-1: notifications single choke point + email identity (LOCAL).**
  Email is now the **CANONICAL RECIPIENT KEY**. Previously `notifications.user_id`
  held three incompatible formats at once (device UUIDs 300, literal
  `'local-admin'` 240, emails 6) written by 11 sites via 3 paths, and read by a
  device-id-only path — so email-keyed rows were **structurally unreadable** and
  cross-member notifications never arrived.
  · All 9 writers now route through `createNotification`, which holds the **ONLY**
    `INSERT INTO notifications` in `src/`. The direct INSERT (task-complete) and
    the `notifications:create` IPC both previously bypassed it.
  · Recipients normalized via the **EXISTING** `resolveIdentity` (`boards.ts:46`) —
    no second admin constant. Unresolvable recipients are logged and **NOT
    written**: a row nobody can read is worse than no row.
  · `createNotification`'s bare `catch {}` now logs. **Still never throws** —
    notifications are side effects and must not fail the parent action.
  · Column renamed `user_id` -> `user_email` (PRAGMA-guarded, idempotent).
    **IPC CHANNEL NAMES UNCHANGED.**
  · Read sites (Inbox/Header/Sidebar) switched to
    `(localUser?.email ?? ADMIN_EMAIL).toLowerCase()`. **VERIFIED:**
    `CLOUD_ADMIN_EMAIL` (main, `constants.ts:5`) and `ADMIN_EMAIL` (renderer,
    `supabase/client.ts:38`) are **BYTE-IDENTICAL** (`'doriankantor@gmail.com'`),
    so root's fallback resolves across the process boundary.
  · Added `idx_notifications_user_read_created (user_email, read,
    created_at DESC)` — the table previously had **NO index** on its filter column.
  · Backfill (**UNREAD ONLY**): 108 matched, 86 resolved, 0 as local-admin, 22 left
    untouched. **546 rows before and after — NOTHING DELETED.** Live DB matched the
    dry-run simulation exactly.

- **★ CARRIED FORWARD — 22 PERMANENTLY UNRESOLVABLE ROWS (deliberate).** Device
  UUIDs whose `local_users` row no longer exists, plus one legacy `'user-dorian'`.
  They are **INERT**: match nobody, inflate no badge, appear in no inbox. **NOT
  deleted.** The backfill still scans them every startup so they **SELF-HEAL** if a
  user's `local_users` row is ever recreated on this machine.

- **★ CARRIED FORWARD — THE 240 `'local-admin'` ROWS ARE ALL `read=1`**, so the
  backfill's local-admin branch resolved **ZERO** rows. The branch is correct for
  future writes but inert today. **ROOT'S INBOX SHOWING 0 UNREAD IS EXPECTED, NOT
  A BUG.** The unread rows now belong to Leonardo (30), Juan Diego (24), dk@ (20),
  Daniel (15) + 4 singletons — people who cannot log in yet.

- **★ CARRIED FORWARD — Sidebar keeps a SEPARATE `userId`** for
  `boardMembers.listForUser` (`Sidebar.tsx:380`), which is **id-keyed and unrelated
  to notifications**. Converting it in place would have silently broken the board
  list. **Do not "simplify" these into one variable.**

- **`607ef70`** — fix: corrected `CLOUD_ADMIN_EMAIL` import in attachmentsCloud.
  Node tsc baseline **8 -> 5**.
- **`2773ba2`** — chore: N-1 backfill logs only when it resolves something.
  Predicate and scan **UNCHANGED** (self-healing preserved); logging only.

- **★ NEXT: N-2 (cloud `notifications` table + two-tier read/write).** Then **N-3**
  (user-scoped realtime axis), **N-4** (off-work notification drop), then **To-Do 2.5**.

**LATEST (2026-07-23, night) — SORT TOGGLE SHIPPED · TEAM CONSOLE DESIGN LOCKED ·
PRIORITIES REORDERED · CLOUD JUNK CLEARED.**

**SHIPPED:**
- **`9bf124c` — RELEVANCE/DATE SORT TOGGLE ON NEWS.** Display-order only — the
  server query still orders by `added_at DESC`, so paging, `loadedCount`,
  `hasMore` and the count line are untouched. Persists via localStorage
  `intel-news-sort`, defaults to relevance. Built because fetch order and display
  order differed, which made appended rows scatter into the list and "Load more"
  look broken. _(Hash predates the last docs commit `859b2cf` — it shipped in the
  prior batch and was already logged in the evening entry below; re-stated here as
  part of tonight's summary. `git log 859b2cf..HEAD` is EMPTY: no new code commits
  this session — the cloud cleanup was a data operation with no code committed.)_
- **BOARD ACCESS RELOCATED TO THE TEAM PAGE** (`c2e7543`). **The Settings/Team
  permissions split is CLOSED.** Team now has two in-page tabs — *Team members*
  and *Board access & permissions* — with the relocated Board Access matrix and
  the existing Member Permissions matrix together on the second. Both the tab
  BUTTON and its content are `{isRoot && …}`-gated, because Team gates
  per-section, not whole-page.
  Pure renderer relocation — no data model, IPC or cloud change. The five
  handlers (`loadMatrix`, `toggleBoardAccess`, `toggleHead`, `grantAllBoards`,
  `revokeAllBoards`) moved VERBATIM, preserving the renderer-side
  head-implies-member invariant and info-page-only heads exactly as they were.
  The matrix now loads LAZILY on first activation of the tab instead of from
  Settings' shared mount effect; the loaded flag is set only in the success
  branch, so a failed fetch retries on the next click. Settings' Team Management
  collapses to its members content and drops the now-unused `ADMIN_EMAIL` import.
  This is step 1 of 4 toward the locked Team console design.

  **STILL DEFERRED from the console (each its own slice):**
  (a) the per-person **visibility model** — greenfield, and it MUST be enforced
      server-side because the drawer's stats are computed in the renderer;
  (b) **generalizing heads to workspace boards** (today `info_page_owners` covers
      info pages only);
  (c) **moving head-implies-member into the cloud function** — it stays
      renderer-only, so a direct `infoPages:addOwner` IPC call still bypasses it;
  (d) **rehoming the off-work card** — blocked on the shared `onLeaveEmails`
      state that the member-list "On leave" pill also reads;
  (e) **Sidebar nested sub-nav** — no primitive exists; only Workspace expands,
      hand-coded.

  **CARRIED FORWARD:** the matrix reads its roster from `team.list()` = the local
  `local_users` table, NOT the cloud `team_members` roster. So it shows who has
  logged in ON THIS DEVICE. Correct for a like-for-like move; a real decision when
  the console's own roster page lands.
- **★ HEAD-IMPLIES-MEMBER NOW ENFORCED IN THE DATABASE + permission writes no
  longer lie on failure** (`782b779`, plus hand-run DDL).

  **DDL (run by Dorian in the Supabase SQL editor — NOT in repo SQL):**

```sql
  ALTER TABLE info_page_owners
    ADD CONSTRAINT info_page_owners_membership_fk
    FOREIGN KEY (page_id, user_email)
    REFERENCES board_members (board_id, user_email)
    ON DELETE CASCADE;
```

  Verified in the catalog: `confdeltype='c'` (CASCADE), both column pairs mapped
  (`page_id→board_id`, `user_email→user_email`). Zero orphans existed beforehand,
  so no backfill was needed. **An owner row can no longer exist without a
  membership row, and deleting membership removes the owner in the same
  statement.**

  **What this actually fixes:** the invariant was previously enforced ONLY in the
  renderer handlers, so (a) a direct `infoPages:addOwner` IPC call could write an
  owner with no membership, and (b) `toggleBoardAccess` revoked membership FIRST
  then the owner — a failed second call left a head without a member. Both are
  now impossible. **Note the UI grant path was already correct** — `toggleHead`
  adds membership itself before granting, so it could never produce the bad state
  through the app. The FK guards the IPC path and half-applied revokes.

  **`toggleHead`'s "add membership before addOwner" ordering is now LOAD-BEARING,
  not belt-and-braces** — under the FK, `addOwner` fails with 23503 without it.
  Do not "simplify" it.

  **The `.ok` slice (renderer-only, Team.tsx):** the cloud fns return
  `{ ok, error }` and NEVER THROW on logical failure, so `try/catch` never caught
  them — all five matrix handlers ignored the return value and updated their
  optimistic Sets regardless. The FK made this worse by turning silent data
  problems into silent *failures*. Now every handler captures the result, skips
  the optimistic update on failure, and surfaces the error through the existing
  matrix banner via a shared helper. `toggleHead` stops before `addOwner` if the
  membership add fails. `grantAllBoards`/`revokeAllBoards` no longer swallow with
  `.catch(() => {})` — they collect failures and name the boards. Verified by
  toggling with Wi-Fi off: the banner appears and the toggle does not flip.

  **CARRIED FORWARD:**
  - `boardMembers.remove` returns `{ ok }` with NO error string (unlike the other
    three), so its failures get a generic message.
  - `revokeAllBoards` treats a no-op head removal as SUCCESS when membership was
    removed — the FK cascade already deleted the owner row, so reporting it as a
    failure would be a false alarm.
  - The renderer's head-removal-on-revoke in
    `toggleBoardAccess`/`revokeAllBoards` is now REDUNDANT for integrity (the
    cascade handles it) but KEPT as optimistic UI so checkboxes flip without
    waiting for a refetch.
  - **`pg_catalog`/`information_schema` are NOT reachable with the service-role
    key** (PostgREST data plane only — `PGRST106`). Catalog checks (constraint
    names, delete rules, FK definitions) must be run by hand in the Supabase SQL
    editor. Claude Code can prove an FK's existence behaviourally via a PostgREST
    relationship embed, but not its delete rule.
  - `info_page_owners` still has no `CREATE TABLE` in the repo's SQL — this
    constraint lives only in cloud Postgres. Worth capturing in `sql/` eventually
    so the schema is reproducible.

  **Team console progress: steps 1 and 2 of 4 done** (Board Access relocated;
  invariant hardened). Still deferred: the per-person visibility model
  (greenfield, must be server-side), generalizing heads to workspace boards,
  rehoming the off-work card (blocked on shared `onLeaveEmails`), and Sidebar
  sub-nav (no primitive exists).

**★ PRIORITY REORDER (Dorian's call — supersedes the previous ordering).** The
people/permissions layer now comes BEFORE the Intelligence + Info Pages
restructure, because heads can't be assigned without it and publication depends
on heads. New order:
  1. `notifications` → cloud — the shared prerequisite. Unblocks To-Do slice 5
     (intel directive loop) AND the off-work notification-drop stub.
     _(SUPERSEDED: notifications are CLOUD-BACKED as of N-2a/N-2c-1. The
     prerequisite for To-Do 2.5/2.6/5 and the off-work notification-drop is now
     MET.)_
  2. To-Do collaboration: **2.5** (off-card assignment entity — unblocks the
     empty "Assigned to me"/"Assigned by me" tabs) → **2.6** (invited
     collaboration) → **4** (head roles + card permission tiers) → **5** (intel
     directives).
  3. Team console build.
  4. Intelligence + Info Pages restructure.
Accepted consequence: the restructure's design conversation starts later than
planned.

**★ TEAM CONSOLE — DESIGN LOCKED. Mockup: `Team console/TeamConsole_mockup.html`**
(note the space in the folder name — quote the path). Seeded with the REAL roster
and REAL board ids. Interactive: switch the viewer between root and any of the 8
members and the whole page re-gates, including the sidebar nav.

LOCKED DECISIONS:
1. **Root is not in the roster.** `doriankantor@gmail.com` / `local-admin` has no
   profile row, no board rows, no drawer, and appears in no people list. All the
   root-row special-casing from mockup 1 is deleted.
2. **`dk@kantor-consulting.com` is an ORDINARY MEMBER WITH ALL PERMISSIONS.**
   Verified in code: root is a hardcoded email comparison (`boards.ts:46-63`,
   `constants.ts:5`), `role='admin'` is COSMETIC (`Settings.tsx:1358`), and dk has
   no special-casing anywhere. **IMPLEMENTATION RULE: no `if (email === dk)`
   anywhere.** His power comes from `member_permissions` rows + board memberships
   + heads — the same mechanism available to anyone. There are exactly TWO
   identity tiers, root and member; no third tier exists or is wanted.
3. **ONE TIER SYSTEM FOR EVERY BOARD: Member and Head.** A head hands out work; on
   an info page a head ALSO moves sources to analysis and publishes. HEAD IMPLIES
   MEMBER on every board type. **`can_assign` turned out not to exist** — not in
   the cloud schema, not anywhere in `src/` (HANDOFF already marked it
   SUPERSEDED) — so this merge costs nothing and affects zero people.
4. **Team gets three sub-pages:** Team members / Board access & permissions / What
   members can see (third is root-only and hidden from members entirely). Board
   access ABSORBS today's Settings → Board Access.
5. **Per-person VISIBILITY model (greenfield — nothing like it exists).** A
   default plus per-person overrides, governing what one member sees ABOUT
   another. Keys: `intelProjects`, `completion`, `overdue`, `boardAccess`
   (boolean) + `activity` (hidden|summary|full). Overrides are PER-KEY and
   sparse, so an unset key still tracks the default.
   - **Always visible:** name, email, role, assigned boards, active tasks.
     Rationale: coordination data must be public or every question routes through
     root.
   - **Gated:** completion and overdue (management metrics — peer-visible they
     turn the page into a scoreboard; same class of data, so open both or
     neither), plus activity detail.
   - **Everyone always sees their own data in full.**
6. **Starting state: everyone at zero, dk@ with everything.**

**★ FINDINGS THAT SHAPE THE BUILD:**
- **VISIBILITY CANNOT BE ENFORCED IN THE RENDERER.** Done-this-week, Active tasks
  and Overdue are computed CLIENT-SIDE from the full task list already in
  `WorkspaceContext` (`TeamMemberProfilePanel.tsx:87-95`), and Latest Activity
  filters `activity.getFeed()` in the browser. Hiding a number means the server
  must not send it. **Main-process work, not UI.**
- **HEAD-IMPLIES-MEMBER IS ENFORCED IN THE RENDERER ONLY** —
  `Settings.tsx:345-364`. A direct `infoPages:addOwner` IPC call bypasses it
  (`boards.ts:973-984` writes only the owner row). When heads generalize to all
  boards, the invariant must move into the cloud function.
- **THERE ARE THREE PERMISSION STORES, NOT TWO** — `board_members` (membership,
  email-keyed, NO can_assign, NO role), `info_page_owners` (heads, email-keyed,
  info-pages only), `member_permissions` (capability keys). Settings and Team
  write DISJOINT tables — consolidating them is a MOVE, not a merge.
- **THE ROSTER TABLE IS `team_members`, NOT `profiles`** (`profiles` does not
  exist). Eight rows: dk, Daniel Lozano, Elisabeth Weber, Istiak Ahmed, Juan Diego
  Cubillos, Leonardo Carreño, Maria Antonia Mejia, Maria Carolina Giraldo.
- **★ `local_users` AND CLOUD `team_members` NEVER RECONCILE.** The Dashboard TEAM
  panel reads the LOCAL `local_users` account table (`Dashboard.tsx:303-331` →
  `team:list` → `ipc/index.ts:558`), not the cloud roster. `teamRoster.ts:10-14`
  states the sync DELIBERATELY does not touch `local_users`; rows are created by
  invite/first-login and removed only by an explicit per-device `team:remove`. So
  the Dashboard shows who has logged in ON THIS MACHINE, not who is on the team,
  and stale rows persist with no auto-removal. Two surfaces, two sources, no
  reconciliation — worth a decision before the Team console ships.
- **`info_page_owners`, `info_page_sources` and `intelligence_sources` HAVE NO FK
  DEFINITIONS IN THE REPO'S SQL.** Their cascade behaviour on hard delete lives
  only in cloud Postgres and is unverifiable from source. Irrelevant for empty
  boards — **do not hard-delete a POPULATED board on that assumption.**

**★ CLOUD CLEANUP EXECUTED (data operation, no code committed).** Run via a
throwaway script outside the repo, dry-run first, then `--commit`; script deleted
afterwards.
- **Phase 1 — additive.** dk@ added to `board_members` for **Immigration Undone,
  Hollow Border and The Stated Order**, which had **NO member rows at all**.
  **This was a real bug, found by accident:** dk@ is an ordinary member and does
  NOT get root's membership bypass, so logging in as dk@ would have shown three
  EMPTY info pages. Invisible until now only because Dorian works as root.
- **Phase 2 — 8 empty boards hard-deleted:** the DUPLICATE "Subscription model"
  (`387e609d…`, 2 placeholder columns, 0 tasks), "LATAM drone monitor"
  (`3c4671de…`), "Visual Info Pages" (`20fad57c…`, `board_type='standard'` despite
  the name), plus 5 `blahblah`-class test boards. The keeper
  **`board-subscription`** (10 real columns, 1 archived task) was asserted intact
  before any delete.
- **2 boards SKIPPED by the safety gate and left as `deleted=1` shells** —
  `74293cef…` "blahblah 3" (holds a task) and `04e21f10…` "blabla" (holds an
  `info_page_owners` row). Invisible in-app. An earlier plan force-deleted these;
  it was reverted because destroying a board with content to clear an unrelated
  row is the wrong tool.
- **Phase 2b — Baez cleared surgically.** Maria Jose Baez has left the team. Her
  ONLY trace anywhere (cloud or local) was a single `board_members` row on the
  deleted board "blahblah 3"; that row was deleted directly, board untouched.
  Sweep now returns **ZERO** across all variant spellings.
- **End state: 7 live boards** — Think Tank, Subscription Model, Drone Database +
  the 4 info pages. `board_members` holds dk@ on all seven (plus one stray row on
  the skipped `blabla` shell). Nobody but dk@ is on any board.

**★ OPEN — the real prerequisite for the console.** `board_members` still holds
only dk@. **Nothing can enforce membership-scoped visibility until the other 7
people are attached to boards.** Also blocks board-scoped mentions. Additive and
reversible. Dorian's decision: memberships are NOT being seeded by hand — they
get assigned through the console once built, and **no heads are assigned yet**
(`info_page_owners` = dk@ on Contested Skies only). Drone Database is
deliberately left with no members beyond dk@.

**LATEST (2026-07-23, evening) — INTEL CORRECTNESS RUN + v2.4.0 RELEASED (and
BLOCKED on macOS). Everything below shipped after `00940cc`, each diagnosed
read-only, tested in-app, committed separately.**

**SLICES:**
- **`6208649` — PENDING COUNTER REDEFINED + PROJECT-SCOPED.** `getUnreviewedCount`
  now counts `(type='article' AND status='unreviewed') OR (non-article AND status <>
  'routed')`. Non-articles have NO approve/reject path — only delete and route —
  so a SAVED non-article is still awaiting review, while a saved ARTICLE is a
  post-review parking decision. Same status string, opposite meaning by type, so
  the predicate MUST branch on type (tension with locked decision #1: the status
  model is not unified — flagged, not relitigated). Optional `project` param via
  the existing `normalizeProject`, applied in BOTH cloud (two disjoint
  head-counts summed — type partitions cleanly) and mirror (equivalent OR).
  **ROOT CAUSE of the header not moving on project switch: `refreshStats` had
  EMPTY DEPS `[]`.**
- **`481c62c` — PER-CARD COLLAPSE PERSISTED.** localStorage per tab
  (`intel-opencards-{social,documents,interviews}`), lazy try/catch init,
  write-on-change, list-keyed prune guarded against wiping before first load.
  Default-open-for-substance fallback byte-unchanged — only user-toggled entries
  are stored.
- **`63e089e` — SIX MUTATIONS NOW REFRESH THE HEADER STAT.** The header refreshes only when a
  tab calls `onApprove` (= `handleApproved` → `refreshStats`). Six
  pending-changing mutations never did: the three compose deletes, News
  make-unreviewed (+1), News hand-add (+1), News mark-duplicate (−1).
- **`2927df7` — NO-OP SAVE REMOVED FROM COMPOSE TABS + UN-REJECT.** Save on
  Social/Documents/Interviews wrote ONLY `status='saved'` (notes arg
  `undefined`), which means nothing under the counter model. Verified safe:
  all panel content persists independently (notes/reconcile on blur, AI on
  demand, tags and social top-form via their own handlers) and "Send to New
  sources" has NO status precondition. Removed with the unreachable
  `handleStatus`. **News keeps its Save.** "Make unreviewed" now also renders on
  REJECTED articles. **The gate widening alone was NOT enough** — the optimistic
  counter only did `unreviewed +1`, correct for `saved` (no chip) but leaving the
  REJECTED chip over-counted; now conditionally decrements on the pre-flip
  status.
- **`2927df7` — ORPHANED-STATE CASCADE.** `pendingStatus`/`statusError`/`isPending` and the
  `{statusError…}` block formed a closed dead chain once `handleStatus` went.
  **Compiled clean only because `noUnusedLocals` is off** — nothing would ever
  have flagged it. (Same commit as the Save removal above.)
- **`80032f4` — DEAD "PUSH TO INFO PAGE" STAT REMOVED.** The button's onClick only showed a
  toast. Its number counted `info_page_items` — the RETIRED table whose fan-out
  is "kept defined but no longer called" — so it never moved when routing via
  "Send to New sources". No replacement added: whether the intel header should
  carry a routing indicator belongs to the restructure.
- **`e05e8a2` — SIDEBAR BADGE REFRESHES ON LOCAL MUTATIONS.** The Sidebar renders OUTSIDE
  `<Outlet />` so it never remounts on navigation; its badge effect had empty
  deps and only a 60s interval. Twelve sites now dispatch an `intelChanged`
  window event (the 11 that call `onApprove`, plus Info Pages
  `handleMoveBack` in NewSourcesTab, which reverts an article to unreviewed).
  New `utils/intelEvents.ts` leaf module holds the event name. `sendToReview`,
  `backSourceToNew` and `commitSources` are stage-only and deliberately excluded.
- **`9bf124c` — RELEVANCE/DATE SORT TOGGLE ON NEWS.** Display-order only; persists via
  `intel-news-sort`.

**★ v2.4.0 RELEASED — AND UNINSTALLABLE ON macOS.**
Version-bump `97846c3`, tag `v2.4.0`, PROJECT_SUMMARY updated `6970fe6`.
**A fresh install is deleted by macOS on launch** ("Malware entfernt und in den
Papierkorb gelegt"). `spctl -a -vvv` returns **"notarization indicates this code
has been revoked"**. Diagnosed:
- Quarantine is NOT involved — `xattr -l` shows only `com.apple.provenance`.
- Ad-hoc signing did NOT apply: every `codesign`/`xattr` write returned
  `Operation not permitted` because **App Management blocks Terminal from
  modifying `/Applications`**. The signature is still `linker-signed`,
  `Info.plist=not bound`, `Sealed Resources=none`.
- `appId` is already correct (`com.kantorconsulting.hub`); `Identifier=Electron`
  in the codesign output is a SYMPTOM of never being signed, not a config error.
- The build is unsigned by config: `notarize: false`, `hardenedRuntime: false`.
**RESOLUTION DEFERRED TO LAUNCH (Dorian's call):** Apple Developer Program
($99/yr) + Developer ID Application cert + `hardenedRuntime: true` +
`notarize: true`. Windows deferred too — Azure Artifact Signing ~$10/month,
EU-eligible, no hardware token; unsigned Windows still RUNS (SmartScreen warning
only), so macOS is the harder block.

**★ CORRECTION TO A LONG-STANDING FRAMING:** earlier HANDOFF entries said
"researchers are running old code" / "~40 commits unreleased". **Nobody is using
the app yet** — Dorian is building toward a stable, comprehensive first release.
Releases are version history until launch. No user-facing urgency from
unreleased work.

**★ REQUESTED — INTEL TAB STATE SHOULD SURVIVE NAVIGATION (session-scoped).**
Leaving Intelligence and returning resets to the default tab; it should reopen
on the last-used tab. EXPLICITLY session-scoped — persist across navigation but
NOT across app restart, so sessionStorage or a module-level variable, NOT the
localStorage pattern used by `intel-selected-project`/`intel-opencards-*`.
Mechanics: index.tsx sits INSIDE `<Outlet />` so the whole page unmounts on route
change; tab mounting is MIXED (News/Documents/Interviews conditionally mounted,
Social kept mounted-but-hidden). OPEN: does "where you were" include scroll
position and PAGING DEPTH (returning resets to page 1 — a meaningfully bigger
ask), filter state, and does this apply beyond Intelligence?

**★ FINDINGS — DO NOT DROP:**
- **PAGING "BUG" WAS A FALSE ALARM — do not re-investigate.** Reported as "100
  counted, only 52 reachable". Proven NOT a bug across four hypotheses:
  `loadedCount` increments by RAW `data.length` so offsets stay DB-aligned;
  `getSources` and `getSourcesCount` have byte-identical predicates; there are
  ZERO `Kantor Framework` rows; ordering ties are negligible (99 distinct
  `(added_at, published_at)` pairs of 101 rows). **The count line read "Showing
  100 of 101" the whole time.** The actual cause: fetch order (`added_at DESC`)
  differed from display order (`relevance_score DESC`), so appended rows
  scattered INTO the list rather than landing at the bottom — 50 rows arrived,
  only the lowest-relevance couple appeared below the scroll position. The sort
  toggle addresses this. **LESSON: read the count line before theorising.**
- **`id DESC` TIEBREAKER — worth adding, not urgent.** 4 of 101 rows share a full
  `(added_at, published_at)` key, so OFFSET paging is not fully deterministic.
  One line in `getSources`, `getSourcesCount` and the mirror path.
- **UN-REJECT LEAVES THE LEARNING SIGNAL STALE** (attach to the
  relevance-feedback slice). Rejecting fires
  `pushVerdictToSupabase(url,'rejected',reviewer)` → `cs_articles.status`, the
  training signal for the relevance gate. `revertToUnreviewed` touches ONLY
  `intelligence_sources` and there is **no un-push path**. The hub never reads
  `cs_articles.status` back (verified), so nothing breaks in-app — but the
  external pipeline keeps learning "irrelevant" from an article the researcher
  un-rejected, **which is exactly what the button is for**. Not fixed: the
  correct reset value (`'new'`? null?) is unconfirmed against the pipeline.
- **CROSS-DEVICE FRESHNESS (option B) — still deferred.** A `window` event is
  same-renderer only, so both the header and the sidebar still wait on their
  polls for another device's mutation. Subscribing to `intel:sourcesInvalidate`
  is blocked: the preload bridge tears down with `removeAllListeners`, so the
  first tab unmount would kill any other subscriber's listener. **Requires
  per-callback listener removal first.** Fold into the restructure's realtime
  work.
- **ARTICLE / NON-ARTICLE ROUTING ASYMMETRY.** Approved articles keep
  `status='approved'` and get an `info_page_sources` pointer but never call
  `markRouted`; non-articles go straight to `status='routed'`. The restructure
  will hit this.
- **MIRROR PHANTOM +1** unreviewed article (mirror 103 vs cloud 102 at the time).
  Offline-only, self-heals on sync. Cosmetic.
- **PROJECT_SUMMARY nits:** the trailing "NEXT STEP: 0b" line is stale (0b
  shipped in v2.2.0), and there is still no v2.3.0 changelog entry.

**LATEST (2026-07-23, later) — INTEL COUNTER + CARD CLEANUP RUN. Five slices
shipped after `00940cc`, each diagnosed read-only, tested in-app, committed
separately.**

- **`6208649` — PENDING COUNTER REDEFINED + PROJECT-SCOPED.** `getUnreviewedCount`
  now counts `(type='article' AND status='unreviewed') OR (non-article AND
  status <> 'routed')`. Rationale: social/documents/interviews have NO
  approve/reject path — their only actions are delete and route — so a SAVED
  non-article is still awaiting review, while a saved ARTICLE is a post-review
  parking decision. Same status string, opposite meaning by type; the predicate
  must branch on type (tension with locked decision #1 — the STATUS model is not
  unified — flagged, not relitigated). Optional `project` param via the existing
  `normalizeProject`, applied in BOTH cloud (two disjoint head-counts summed —
  type partitions cleanly, no double-count) and mirror (equivalent OR) branches.
  **ROOT CAUSE of the header not moving on project switch: `refreshStats` had
  EMPTY DEPS `[]`, freezing it on the first project.** Sidebar stays all-projects
  and adopts the new definition automatically. Both callers moved intentionally;
  no strays.
- **`481c62c` — PER-CARD COLLAPSE PERSISTED.** Social/Documents/Interviews stored
  `openCards` in local state, so the Intelligence route unmounting discarded every
  explicit collapse and substantive cards re-derived to open. Now persisted to
  localStorage per tab (`intel-opencards-{social,documents,interviews}`) with lazy
  try/catch init, write-on-change, and a list-keyed prune guarded against wiping
  the store before first load. **The default-open-for-substance fallback is
  byte-unchanged** — only user-toggled entries are stored, so untouched cards with
  notes/AI still auto-open. NewsTab untouched (its compose is a default-closed
  top-level panel).
- **`63e089e` — SIX MUTATIONS NOW REFRESH THE HEADER STAT.** The header refreshes
  only when a tab calls the `onApprove` prop (= `handleApproved` → `refreshStats`).
  SIX pending-changing mutations never did, leaving the counter stale until a full
  remount: the three compose deletes, News make-unreviewed (+1), News hand-add
  (+1), News mark-duplicate (−1). Each now calls no-arg `onApprove()` on its
  success path (no-arg ⇒ no push toast). Compose Save was pending-NEUTRAL and
  already refreshed harmlessly.
- **`2927df7` — NO-OP SAVE REMOVED FROM COMPOSE TABS + UN-REJECT.** Save on
  Social/Documents/Interviews wrote ONLY `status='saved'` (the notes arg was
  `undefined`), which means nothing under the counter model. Verified safe before
  removal: all panel content persists independently (notes/reconcile on blur, AI
  on demand, tags and the social top-form via their own handlers), and "Send to
  New sources" has NO status precondition — an unreviewed item routes fine.
  Removed with the now-unreachable `handleStatus`. Existing `saved` rows left
  untouched: they keep the amber badge and keep counting as pending. **News keeps
  its Save** — parking an article after review is a real decision there.
  "Make unreviewed" now also renders on REJECTED articles (Reject hides on a
  rejected row, so the two controls stay mutually exclusive). **The gate widening
  alone was NOT sufficient:** the optimistic counter only did `unreviewed +1`,
  correct for `saved` (no chip) but leaving the REJECTED chip over-counted when
  pulling a rejected row back — now conditionally decrements `rejected` based on
  the pre-flip status.
- **Orphaned-state cascade (folded into `2927df7`, same commit).**
  `pendingStatus`/`setPendingStatus`, `statusError`/`setStatusError`, the
  `isPending` derivation and the `{statusError…}` render block formed a fully
  closed dead chain in all three tabs once `handleStatus` went — grep-confirmed
  zero readers/writers per tab before removal. **It compiled clean only because
  `noUnusedLocals` is off**, so nothing would ever have flagged it. `fadingIds`
  left in place (live consumers elsewhere).

**★ LOGGED FINDINGS — DO NOT DROP:**

- **UN-REJECT LEAVES THE LEARNING SIGNAL STALE (attach to the relevance-feedback
  slice).** Rejecting fires `pushVerdictToSupabase(url,'rejected',reviewer)` →
  `cs_articles.status='rejected'`, matched by URL, fire-and-forget — the training
  signal for the Contested Skies relevance gate. `revertToUnreviewed` touches ONLY
  `intelligence_sources` and there is **no un-push path**. The hub NEVER reads
  `cs_articles.status` back (verified: zero selects on it; the only cs_articles
  read is the importer filtering `imported_to_hub=false`), so nothing breaks
  in-app — but the external pipeline keeps learning "irrelevant" from an article
  the researcher un-rejected, **which is exactly the case the un-reject button
  exists for**. NOT fixed because the correct reset value (`'new'`? null?) is
  unconfirmed against the pipeline. **This belongs with the queued "human
  relevance override → feedback loop into GDELT/Haiku culling" slice** — confirm
  the reset value there, then add the un-push. Note the pre-existing saved→
  unreviewed path never had this problem (`verdictToCsStatus('saved')` → null).
- **"PUSH TO INFO PAGE" (15) IS A DEAD, MISLEADING STAT — READY TO REMOVE.** Fully
  diagnosed. The onClick does nothing but show a toast. The number is
  `stats.sentToPages` = `COUNT(DISTINCT origin_source_id) FROM info_page_items
  WHERE sub_type='intelligence_source'` — the **RETIRED** table (the old
  `addApprovedSourceToInfoPages` fan-out is "kept defined but no longer called",
  ipc:3025). Current routing writes `info_page_sources` (stage='new'), so **the
  number will not move when you route via "Send to New sources"**. 15 matches
  nothing in the current model (info_page_sources=23, pushed=20, approved=27).
  `sentToPages` has no other reader. **Decision pending: remove entirely
  (recommended) vs repurpose to count `info_page_sources`** — the latter is a
  product decision about what belongs in the intel header vs the Info Pages side,
  and arguably restructure territory.
- **OPTION B — cross-device header freshness (DEFERRED into/after the
  restructure).** `intel:sourcesInvalidate` fires on INSERT/UPDATE/DELETE and the
  tabs listen, but **index.tsx subscribes to nothing**, so another user's mutation
  doesn't refresh this user's header until the 20s interval. Subscribing index.tsx
  is NOT drop-in: the preload bridge tears down with
  `removeAllListeners('intel:sourcesInvalidate')`, so the first tab unmount on any
  tab-switch would kill index.tsx's listener too. **Requires per-callback listener
  removal first.** Cosmetic + 20s-self-healing; the blast radius on shared realtime
  plumbing is not worth it before the restructure reworks this anyway.
- **ARTICLE / NON-ARTICLE ROUTING ASYMMETRY.** Approved articles keep
  `status='approved'` and get an `info_page_sources` pointer but **never call
  `markRouted`**; non-articles go straight to `status='routed'`. Two types reach
  Info Pages by different status transitions. Doesn't affect the pending counter
  (approved is excluded either way), but the restructure will hit it.
- **MIRROR CARRIES A PHANTOM +1 UNREVIEWED ARTICLE** (mirror 103 vs cloud 102),
  from the make-unreviewed/reject churn during testing. Offline-only, off by one,
  self-heals on next full sync. Cosmetic — logged, not chased.

---

**LATEST (2026-07-23) — INTEL LIST SCOPING + PAGING SHIPPED. HEAD `ad6469a`,
tree clean.**

**SHIPPED — query-level project scoping + paging on all four Intelligence tabs
(one commit, `ad6469a`).** `getSources` gained `project` + `excludeStatus`, applied
in BOTH cloud and mirror paths IN ADDITION to the `visibleBoardIdsFor`
membership gate (gate = security, project = view — never one replacing the
other). New `getSourcesCount` (`count:'exact'`, `head:true`, NO range) gives an
exact total over the same WHERE, driving the "Showing X of Y" line and
`hasMore`. `getStatusCounts` is now project-scoped (News badges show the
selected project; identical today at 100/27/79 since all articles are on
board-info-latam, diverges once other projects have content). All four tabs page
at 50 via fresh / append / background modes; background refetch uses
`limit=max(loadedCount,50), offset=0` to preserve depth. Compose tabs exclude
`routed` AT THE QUERY so raw-fetched === displayed (paging provably correct).
"Refresh now" was fixed to use background mode so refreshing while deep-paged
holds position instead of snapping to page one.

**WHAT IT FIXED:** the 101st unreviewed article was UNREACHABLE under the old
100-row cap (query returned newest 100, then filtered client-side). And once
Phase 2 opens the other three projects, the old code would have shown EMPTY
queues for any project whose rows weren't in the global newest-100 — a silent
wrong-empty-list, the recurring bug class. Both closed.

**DELIBERATELY UNTOUCHED:** the index-level "PENDING REVIEW" stat and
`getUnreviewedCount` — still type-agnostic AND project-agnostic. What "pending"
should mean is the NEXT slice (spec below).

**★ NEXT SLICE — PENDING COUNTER REDEFINITION (design RESOLVED this session,
ready to build after a status-lifecycle diagnose).** Dorian's model, confirmed
against the live UI:
- **Articles:** pending = `status='unreviewed'`. Saved/approved/rejected excluded
  (a saved article is a deliberate post-review parking decision).
- **Non-articles (social/documents/interviews):** pending = ANY item not yet
  ROUTED. Those tabs have NO approve/reject — the only action is "Send to New
  sources" — so a SAVED social/doc/interview is NOT reviewed, it's resting =
  waiting = pending. Same status string, opposite meaning from an article, purely
  by type. (Tension with locked decision #1's "same kind of item" — the STATUS
  model is not unified; flagged, not relitigated.)
- **Header "PENDING REVIEW" must become PROJECT-SCOPED.** Today Immigration Undone
  shows 100 (Contested Skies' count) — wrong. Should show that project's own
  pending total (currently 0).
- **"All sources" selection → a PER-PROJECT BREAKDOWN, not one number** (which
  projects have pending items, with counts). This is NEW UI (panel/hover), the
  biggest part of the slice, needs a placement decision.
- Correct Contested Skies total under this model = 104 (100 articles + 2 social +
  1 doc + 1 interview), reconciling against the News badge's 100 by exactly the
  4 non-article items — each visible in its tab.

**PREREQUISITE for that slice — STATUS-LIFECYCLE DIAGNOSE (not yet done).** Need
to confirm what `addSocial`/`addDocument`/`addInterview` write as `status` on
create, what transitions exist, and whether all three behave identically. If new
compose items are born `unreviewed`, they inflate the header from capture until
routed — the counter redefinition depends on knowing this. Do this read-only
FIRST, before building the counter.

**LOGGED THIS SESSION (do not drop):**
- **Social chevron reopens on navigate-back.** From `9ce1e7f`: the collapse state
  is component state, so leaving the Intelligence page unmounts the tab and it
  reopens expanded on return. Small renderer fix; the compose block should
  persist collapsed. (Confirmed live.)
- **Delete asymmetry.** `a1ceeed` hard-BLOCKS deletion of `type='article'` (every
  decision survives as a relevance-training label). But social/documents/
  interviews still HARD-DELETE via their trash icon — the unreviewed trump social
  `d064b462` was removed this way during this session's testing (that's what took
  the header 102→101; an actioned article took it →100). Decide whether the
  no-delete-preserve-the-label principle should extend to the other three types,
  or whether their delete is intentional.
- **Mirror can lag cloud.** Offline counts are "last known" and can trail cloud
  (surfaced as a transient offline-101/online-100 during testing — stale mirror
  vs fresh cloud, NOT a code bug). Offline surfaces show last-synced numbers by
  design.

**COUNTER DETOUR — CLOSED, no bug.** The 101-vs-102 that opened this session was
never a bug: `getUnreviewedCount` counts all types/all boards (was 101 articles
+ 1 trump social = 102); the News badge is article-scoped (101). Zero
NULL-project rows, no stranded articles. The trump social is legitimate content
on a Phase-2 board Dorian placed himself as root. Both regression checks from the
prior session (Make-unreviewed count, Info Pages move-back) verified WORKS.

**LATEST (2026-07-22) — INTEL CARD SESSION. HEAD `e591fc8`, tree clean. A run of
renderer-and-main intel-card slices, each diagnosed read-only, built, tested in the real
app, and committed with a dictated message. SHIPPED this session, in order:**

- **T6b — AI suggested-tag chips made clickable on Documents/Interviews/Social (`1fd48ff`).**
  They rendered as dead spans; `SuggestedTagChip` was threaded into each compose sub-component
  using each tab's own handler arity and row id var.
- **Social card editing (`6323a48`).** The add-form reopens pre-filled as an edit panel. New
  main-side `updateSocialFields(id, patch)` with an internal allowlist; `url` deliberately
  excluded (provenance).
- **Collapse chevron + CondensedSummary on Social/Documents/Interviews (`9ce1e7f`, Option 1).**
  Collapses the compose block only, matching News; header, preview, tags and Save/Send stay
  visible. **TECH DEBT:** `CondensedSummary` carries its own copy of the confidence colour scale
  (Interviews had none), so two copies now exist and could drift.
- **News hand-add (`b076929`).** `addNews` with a `url` duplicate pre-check (returns
  `existingId`/`existingTitle`) and an author guard rejecting empty or 'Kantor Framework' names —
  News filters that author out of its list, so such a row saves successfully but renders
  invisibly.
- **Article deletion hidden AND disabled (`a1ceeed`).** A type-scoped guard in the shared
  `deleteSource` rejects `type='article'`, placed before the permission gate so no caller can
  bypass it. Articles are accepted, rejected, or marked duplicate (with `duplicate_of`) so every
  decision survives as a relevance-training label. **CONSEQUENCE:** a genuinely broken article
  row can now only be removed in Supabase.
- **Duplicate auto-suggest (`d6bb90e`).** Seeds candidates from the article title's two most
  distinctive tokens, ranked by title-token overlap. Seeds from title, not `source_name` — a
  duplicate is the same story from a different outlet.
- **Editable AI analysis (`418d1dd`).** Human overrides for KEY FACTS + SYSTEMS stored in
  `analysis.human.overrides`, keyed by fact label and by the AI's original system string, so
  re-running Analyze (which replaces `.ai` wholesale) cannot wipe a correction. Shared
  `resolveAnalysis` helper; Intelligence shows full provenance (edited chip, "AI said", revert),
  Info Pages shows the resolved value only. Overrides reach Info Pages automatically via the
  existing pointer + live join — no copy, no sync step.
- **News footer toggle renamed to "Review and annotate" and restyled as a prominent button
  (`8aef44e`).**
- **News add panel: Read link auto-fill (`d4e8ce9`).** Fills only untyped fields from page
  metadata, with plain-language failure reasons. **CAVEAT:** the fetcher reads `<head>` meta
  only, so Content receives the page description, not the article body.
- **Hand-add now REQUIRES a project, defaulted to the selected one (`d4e8ce9`).** An unscoped
  article saves successfully but appears in no project queue.
- **"Make unreviewed" on saved News articles (`3026fca`).** Exposes the existing
  `revertToUnreviewed` as a standalone intelligence IPC, extended to also clear
  `reviewed_by`/`reviewed_at`. Deliberately NOT routed through `handleStatus`, which would stamp
  a reviewer, log a decision, and push an 'unreviewed' verdict to Supabase, polluting the
  relevance-feedback signal.
- **Intel card project pickers (all four tabs) switched from the local-mirror-only
  `infoPages.list` to the cloud-first `boards.list` (`1285bc4`).** Deleted info-page boards now
  disappear from the pickers. **KNOWN LIMITATION:** offline, `listBoards` falls back to the stale
  mirror and a deleted board can reappear until reconnect. The durable fix (propagating deletions
  to info-page rows in `syncBoardsMirror`) risks wiping genuinely local-only info-page boards and
  is out of scope.
- **NewsTab now passes real project keywords into AI analysis (`e591fc8`).** The bug was
  NewsTab-ONLY — Social, Documents and Interviews already received real keywords via the
  `selectedProjectConfig` prop built in `Intelligence/index.tsx` from
  `parseConfig(board_config).keywords`. NewsTab instead re-derived its own `projects` list mapped
  to `{ id, name }`, discarding `board_config`, so `projectConfig.keywords` was always `undefined`
  and every on-demand "Analyze with AI" run from a News card judged relevance against the article
  and project name alone, without the project's collection keywords. An `as any` cast was masking
  the missing property. Fixed by widening the `projects` state to carry keywords and deriving them
  with the same `parseConfig` call the parent already uses — `boards.list()` already returned
  `board_config`, NewsTab was simply dropping it. (This SUPERSEDES the earlier "latent bug"
  framing that called it an all-tabs gap; it was never all four tabs.)

**OPEN / IN-PROGRESS from the intel card session:**
- **Interview transcript editing** deliberately deferred into the interview restructure, since
  that work replaces the read-only transcript with an annotation surface.
- **Untested regression points on "Make unreviewed"** — whether the pending count increments on
  revert, and whether Info Pages "move back to intel" still works after `revertToUnreviewed` was
  changed.

**LATEST (2026-07-21) — HEAD `1ea04a7`, tree clean. Both off-work (`f918e42`) and the
DATE-PICKER slice (`1ea04a7`) are SHIPPED. ★ THE LAST TWO To-Do FEATURES BEFORE THE
TEAM THREAD ARE DONE — off-work leave windows + the date-picker fixes.**

**OFF-WORK / LEAVE-WINDOW — SHIPPED (`f918e42`).** A per-member self-set future-only leave
window (start→end) lives in a new cloud **`off_work`** table (PK `user_email`, RLS enabled) +
a local mirror the offline missed-evaluator can read. The evaluator reads the acting user's
window and **skips stamping misses** for boundaries inside it (the `due_date` still rolls
forward — suppression only gates the STAMP). Team page: an **"on leave" pill** on members
within a window, a **self-service leave picker**, an **"End leave"** action (deletes the row =
you're back; forward-only, so nothing already suppressed is retroactively un-suppressed) and an
**Update** path. **Notification-drop is DEFERRED** (blocked on notifications→cloud) with a
documented stub. _(SUPERSEDED: notifications are CLOUD-BACKED as of N-2a/N-2c-1. The
prerequisite for To-Do 2.5/2.6/5 and the off-work notification-drop is now MET.)_
IPC: `offWork` get/set/list/clear. Cloud DDL: `sql/2026-07-21_off_work.sql`.
Suppression was verified both directions via a local-seed test.

**DATE-PICKER SLICE — SHIPPED (`1ea04a7`).** Three bundled fixes plus a unification: **(a)** the
native `<input type=date/time>` pickers now open on clicking the field **body** via
`onClick→showPicker()` + `[color-scheme:dark]` for glyph visibility — the root cause was
Chromium only opening the picker from the tiny edge glyph (a behavior quirk, not a bug), on the
off-work start/end (`Team.tsx`) and new-todo date/time (`Todo.tsx`) inputs; **(b)** the To-Do
panel's one-off custom **`DatePopover` was REPLACED with a native `<input type=date>`** so ALL
date entry is native — its calendar-grid helpers (`WEEKDAYS`/`MONTH_NAMES`/`toISODate`/
`todayISO`/`prettyDate`) were deleted, while `usePopoverDismiss`/`PILL_CLASS`/`TimePopover` were
KEPT (still used by the recurrence + time controls). Native OS positioning auto-flips so the
off-work-at-bottom picker never clips (custom popovers WOULD have — native chosen deliberately,
no flip logic); **(c)** RECURRENCE is now **GATED ON A DUE DATE** (Option A / block) — the panel
`RecurrencePopover` is disabled + greyed with a "set a due date first" hint when the to-do has
no `due_date`, preventing the recurrence-without-due-date zombie state at the source (this is
what caused the "call mom" mess). Only **ONE** recurrence entry point (the panel), so one gate
covers all — the new-todo quick-add row has no recurrence control. The panel due-date write path
is unchanged (native `onChange` reuses the exact `onDue` setter; `''`→`null` preserves clear),
so the gate un-greys the moment a date is picked.

**"call mom" STUCK ITEM — RESOLVED.** Not a bug; a stray daily recurrence respawning on
completion. Its recurrence was cleared. **NOTE:** 15 completed "call mom" spawn-chain rows
remain in `personal_todos` (local + cloud), all `completed=1`, `recurrence=daily`, no
`due_date` — benign/invisible; cleanup deferred as optional.

**★ NEXT IS A DELIBERATE FORK — Dorian must decide:**
- **(A) The To-Do team/collaboration thread.** Slice **2.5** (the off-card assignment entity —
  unblocks the empty Assigned-to-me / Assigned-by-me tabs), then **2.6 / 4 / 5** (invited
  collaboration, head roles + card-permission tiers, the intel-directive assignment loop), with
  **`notifications`→cloud as a shared prerequisite** that ALSO unblocks the deferred off-work
  notification-drop. _(PARTIALLY SUPERSEDED by N-1 `720dbb8`: identity is now
  EMAIL-canonical; the CLOUD half is still outstanding — N-2.)_
- **(B) JUMP to the Intelligence + Info Pages restructure** — the PRIMARY goal, with a HARD
  deadline (complete the intel process by end of July / publish in August). This is the same
  "Path 2" reprioritization Dorian made once before. **The August deadline argues for starting
  the intel restructure's design-first phase soon** — flagged here so the fork is made
  consciously, not by default-continuing the To-Do thread.

**★ BACKLOG / PARKED ITEMS — DO NOT DROP (consolidated index; full detail at the linked
sections).** Whichever fork is chosen, these remain queued:
- **Deferred off-work NOTIFICATION-DROP** — the "no notifications to a member on leave" half of
  off-work is a documented stub (`createNotification`), BLOCKED on **notifications→cloud**
  (notifications are still local/per-device, `db.ts:253`). Wire it when notifications→cloud ships
  (that same prerequisite sits under fork A). _(PARTIALLY SUPERSEDED by N-1 `720dbb8`:
  identity is now EMAIL-canonical; the CLOUD half is still outstanding — N-2.)_
  _(SUPERSEDED: notifications are CLOUD-BACKED as of N-2a/N-2c-1. The prerequisite for
  To-Do 2.5/2.6/5 and the off-work notification-drop is now MET.)_
- **To-Do write-through — CORE ALREADY FIXED (`cc6aedf`).** `todo:complete`/`uncomplete` now route
  through cloud (`updateTask`) so completions survive re-sync — see the ✅ slice under the To-Do
  overhaul. **Do NOT re-diagnose the revert.** Two follow-ups it LEFT open: the **offline
  surfacing gap** (a cloud-backed to-do write while offline throws with no UI error — folds into the
  overhaul UI pass) and **`todo:dismiss` still local-only** (`todo_dismissed` table, deliberately
  untouched). The stale "route those writes through cloud" phrasings in KNOWN GAPS / NEXT UP are
  reconciled below.
- **T6b + per-card tag scoping** — extend the T6a `SuggestedTagChip` so suggested-tag chips are
  clickable on the Intelligence **Interviews / Documents / Social** compose tabs (confirmed
  not-clickable in testing); combined into one slice with per-card tag scoping (same prop threading).
- **Consolidate ALL people-management under Team (the Team console / Team-view redesign).** ROOT-only
  surface merging roster + work-board membership + intel-project membership (one member↔head toggle
  per board). **The off-work UI's current Team-page placement is PROVISIONAL and rehomes here.** A
  2-iteration mockup exists but needs a dk-not-root revision before it becomes a spec.
- **Intelligence + Info Pages RESTRUCTURE — the PRIMARY milestone** (fork B), hard deadline: intel
  process by end of July / publish in August. Includes the LAST cloud migration
  (`info_page_sources`, the pointer tier under `intelligence_sources`).
- **Optional cleanup of the 15 dead "call mom" rows** (recurrence-without-due-date, local + cloud,
  all `completed=1`) — benign/invisible; not urgent.

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
(collaboration thread vs. the intel restructure with its August deadline). **Twenty-eight code
commits are unreleased**; the installed app is 2.3.0 and contains none of them.

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
- **To-Do write-through revert — CORE FIXED (`cc6aedf`, 2026-07-18, UNRELEASED).**
  `todo:complete`/`uncomplete` now route through cloud (`updateTask`, `completed_at` added to the
  allowlist AND `TASK_COLS`) BEFORE the local write, so completions survive the next `getTasks`
  re-sync. **Do NOT re-diagnose.** STILL OPEN (folded into the overhaul, not this gap): the offline
  surfacing gap (a cloud-backed write while offline throws with no UI error) and `todo:dismiss`
  (a different `todo_dismissed` handler, deliberately left local-only).
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
2. **To-Do write-through — CORE DONE (`cc6aedf`).** `complete`/`uncomplete` route through cloud;
   completions no longer revert on the next `getTasks`. Remaining (folded into the overhaul, not a
   standalone slice): the offline surfacing gap + `todo:dismiss` (still local-only). See KNOWN GAPS.
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

## ⚠ Lesson -- CLIENT STATE-RESET ON BACKGROUND RELOAD + DIRECT-CLOUD-EDIT MIRROR STALENESS (P3 / P4c-2b guardrails)

**Three guardrails, all hit during the P4c-2b card-accept arc (2026-08-08) -- added to the recurring-bug-class list above:**

- **(i) STATE / SCROLL RESET ON BACKGROUND RELOAD (P3, recurred in P4c-2b -- FIXED).** Any success-path
  reload in PreCommitReviewTab MUST use `load({ background: true })`. Plain `load()` sets `loading=true`,
  which hits the spinner early-return that UNMOUNTS the canvas and resets scroll + activeSection. First
  seen in P3 (the scroll-jump); recurred in P4c-2b on card accept. This arc ALSO retrofitted the narrative
  handleAccept / handleKeep, which carried the same latent bug. GUARDRAIL: a success-path refetch meant to
  update in place must be the BACKGROUND variant -- never the spinner-gated one.
- **(ii) AUTO-LAND / AUTO-JUMP EFFECT KEYED ON A RELOAD-MINTED MEMO (P4c-2b -- FIXED).** The rail-landing
  effect (PreCommitReviewTab ~line 397) keyed on `[selectedArticleId, grouped]` re-fires on EVERY
  background reload: `grouped` gets a FRESH reference via `setRows` -> `useMemo`, so the effect re-runs and
  calls `setActiveSection(firstLandable = Systems)`. `setActiveSection(sameValue)` is a no-op, so it only
  VISIBLY jumps when the re-land resolves to a DIFFERENT section than the current one -- which is exactly
  why card ACCEPT jumped but DISMISS did not (latent for both). FIX: a per-source `landedForRef` guard --
  land once per source SELECTION, ignore background-reload rerefs, re-land only on a real source switch.
  GUARDRAIL: any auto-land / auto-jump effect keyed on a memo that background reloads re-mint must be
  ref-guarded per-entity, or it re-lands after every mutation.
- **(iii) DIRECT CLOUD SQL EDITS DO NOT REACH THE OFFLINE MIRROR (P4c-2b diagnose -- KNOWN / BY-DESIGN).**
  `info_page_sources` is an OFFLINE MIRROR refreshed ONLY via `resyncSourceRow` after the APP's own cloud
  writes; there is NO boot-time and NO on-tab-open full cloud->mirror pull, and `getSourcePipeline` (what
  the review tab reads) reads the MIRROR. So a hand-SQL edit in the Supabase editor (e.g. resetting a
  source's proposed_cards handled state) is INVISIBLE to the running app -- the mirror keeps the stale
  snapshot across relaunch. RELIABLE MANUAL-RESET RECIPE: to make the app see a reset source, back it out
  to New Sources and RE-SEND to Review (regenerates through the app writer, which resyncs the mirror). A
  raw cloud edit alone will not propagate.

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

## ⚠ Lesson — NEVER FIND/REPLACE A SYMBOL THAT IS A PREFIX OF ANOTHER SYMBOL

Commit `a1c30a5` (2026-06-05) renamed a local alias `CLOUD_ADMIN` ->
`CLOUD_ADMIN_EMAIL` by find/replace in `attachmentsCloud.ts`. Because
`CLOUD_ADMIN` is a **PREFIX SUBSTRING** of `CLOUD_ADMIN_EMAIL`, the replace **ALSO
fired inside the import specifier**, producing `CLOUD_ADMIN_EMAIL_EMAIL` — a
symbol nothing exports. It survived ~7 weeks inside the "accepted" 8-error tsc
baseline.

**SECOND DATA POINT** in the same family as the `cal-toggles-${userId}` clobber
(1c-2), but a **DISTINCT MECHANISM**: that one was a rename hitting an unrelated
string; this one was a rename hitting **ITS OWN LONGER FORM**.

**RULE: before any symbol rename, check whether the old name is a substring of the
new name (or of any other symbol in scope). If so, edit sites individually.**

**COROLLARY: A TOLERATED ERROR COUNT IS WHERE REAL BUGS HIDE.** esbuild does not
typecheck, so this shipped. Nobody re-reads a number that never changes. **When the
baseline count is stable, the errors inside it stop being read at all.**

## ⚠ Lesson — AN ERROR PATH THAT MISATTRIBUTES IS AS BAD AS ONE THAT SWALLOWS

`seedAttachmentsToCloud` threw `ReferenceError`, which propagated through
`ipcRenderer.invoke` into Settings' catch (`Settings.tsx:121`) and rendered
**"Couldn't reach the server:"** — presenting a **code defect as a NETWORK fault**.

Same family as the bare-`catch` cluster, but the **inverse failure**: it does not
swallow a true signal, it **FORWARDS A FALSE ONE**, which is worse — it sends the
reader to diagnose the **wrong subsystem**. **LOGGED, NOT FIXED.** When touching
that Settings maintenance panel, make the catch **distinguish transport failures
from handler exceptions**.

**ALSO RECORD: reading an UNDECLARED identifier throws `ReferenceError` — it does
NOT evaluate to `undefined`.** A gate comparing against a missing import therefore
**FAILS CLOSED BY EXCEPTION** (neither branch taken), not by falsy comparison. This
was initially reasoned about incorrectly; it was settled by reading the **SHIPPED
BUNDLE** (`out/main/index.js`), not the source. **VERIFY RUNTIME BEHAVIOUR IN THE
BUNDLE, NOT BY REASONING ABOUT THE SOURCE.**

## ⚠ Lesson — immutable=1 SKIPS WAL RECOVERY (every count is a lie)

Reading the live SQLite with `?immutable=1` **while the app is RUNNING** returns the
last **CHECKPOINT**, not current state — the flag tells SQLite the file never
changes, so `-wal` is **skipped entirely**.

This produced a **full false diagnosis**: cloud had 9 rows, local "had" 546, and
**cloud-succeeded-local-failed is IMPOSSIBLE by construction** (the mirror write is
synchronous and first). The mirror had all 9; they were sitting in a **2.4 MB
uncheckpointed `-wal`**. Same family as the **PHANTOM TEST**: a measurement that
fails **silently** and returns a **PLAUSIBLE** answer.

**CORRECT METHOD: copy `.sqlite` + `-wal` + `-shm` to scratch, open the copy
WITHOUT `immutable=1`.** `immutable=1` is only safe with the app **QUIT**.

**ALSO:** plain `node -e` cannot open this DB (`NODE_MODULE_VERSION` 125 vs 127 —
the module is built for Electron's ABI) — use the **`sqlite3` CLI**.

## ⚠ Lesson — postgrest-js DOES NOT REJECT ON NETWORK FAILURE

`shouldThrowOnError` is false everywhere (`throwOnError` appears **nowhere** in
`src/`), so `PostgrestBuilder` **CATCHES** the fetch rejection and **RESOLVES** with
`{ data: null, error: { message: 'TypeError: fetch failed' }, status: 0,
statusText: '' }`.

★ **CONSEQUENCE, CODEBASE-WIDE: every `catch` block written to handle a Supabase
network failure is DEAD CODE.** The failure arrives as a **RESOLVED `{error}`**, not
a throw. This is why `"TypeError: fetch failed"` reached the UI as an error
**STRING**.

**CLASSIFY STRUCTURALLY ON `status === 0`** — it is assigned in **exactly ONE place**
in postgrest-js (that catch handler); every other status comes from a real HTTP
`Response` or postgrest-js's own 200/204/406 overrides, and the Fetch spec reserves
0 for network errors. **Do NOT match message text.** `error.code === ''` is **NOT**
exclusive (the `{message: body}` fallback also produces it).

## ⚠ Lesson — the mirror is SECOND-PRECISION; cloud is MILLISECOND

Both `createNotification` (SQLite `CURRENT_TIMESTAMP`, 19 chars) and `syncMirror`
(`toLocalTimestamp` `.slice(0,19)`) store `created_at` at **SECOND** precision. Cloud
stores **ms** (`new Date().toISOString()`). So re-sending a mirror timestamp back to
cloud **TRUNCATES** it. Harmless for a row whose **ORIGIN is the mirror**
(created-offline — there is no fuller value), **CORRUPTING** for a row whose origin
is cloud (read-flipped — you'd overwrite the ms original and silently reorder
same-second rows for every viewer, since ordering is a `created_at DESC` **string**
compare). N-2c-2 fixes it by **splitting the sweep upsert**: send `created_at` only
for rows NOT already in cloud. **Lesson: a value that round-trips through two stores
with different precision is a silent-corruption source; check precision at every
boundary.**

## ⚠ Lesson — an ON CONFLICT DO UPDATE needs a WHERE when the local row can hold state cloud lacks

Once the mirror can carry a pending local edit (`read` flipped offline),
`syncMirror`'s blind `read = excluded.read` will **clobber it back** on the next
cloud read — **before** the sweep delivers it — and the sweep then ships the
clobbered value, making the loss **permanent**. Guard:
**`WHERE notifications.pending_sync = 0`**, so cloud only refreshes rows with no
unsynced local state. This is the **write-side statement** of the same rule
`mergePending` states on the read side.

## ⚠ Lesson — backticks inside a `db.exec(`...`)` template-literal comment CLOSE the literal

Twice now (2.5a-fix, 2.5b-0) a SQL comment like ``-- the `page_id` column`` placed
**inside** a `db.exec(`CREATE TABLE …`)` template literal closed the JS literal early
→ **TS1005 "',' expected"** parse error. The tell that made it obvious: the **node-tsc
error count DROPPED** (5 → 3 → 1) instead of rising. A DECREASE signals an **early
parse bail** — tsc stopped reading the file after the broken literal and never saw the
rest of the errors — **not** that you fixed something. **Rule:** NEVER put a backtick
in a comment that lives inside a JS template literal; use plain quotes (`'page_id'` or
just `page_id`). **And watch the tsc count: a DROP is a red flag, not a win** — verify
the real error list, not the number.

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

### Machine reset recovery (2026-07-24/25)

- Full macOS reset wiped `~/newsroom-pm`, the local SQLite, and all uncommitted
  work. **NOTHING was lost that mattered:** all commits were on `origin/main`, cloud
  Supabase state was untouched. Recovery = fresh clone + rebuild environment.
- **Toolchain rebuilt from scratch:** Xcode CLT, Homebrew, node@22 (ABI 130),
  `npm install`, `npm run rebuild`.
- **★ Tahoe (macOS 26) XProtect FALSE-POSITIVE:** it quarantined and **MOVED TO
  TRASH** the unsigned electron 31.7.7 dist on every `npm run dev`. `xattr -dr
  com.apple.quarantine` was blocked (Operation not permitted); ad-hoc `codesign`
  verified but was still Trashed; no "Open Anyway" appeared (the Trash-move consumes
  the approvable event). **FIX: bump electron 31→33 (`606d00e`).** 33.4.11 is signed
  acceptably and launches clean. If this recurs on a future Electron, bump to the
  next major; **don't fight the binary.**
- **`.env` is gitignored and was lost.** Rebuilt from a Claude Code diagnose of every
  `process.env`/`import.meta.env` read. ★ **KEY CORRECTION: main-process vars are
  UNPREFIXED (`SUPABASE_URL`), NOT `MAIN_VITE_`** as older docs implied —
  `electron.vite.config.ts` `loadEnv('')` + `define()` injects them. Renderer vars
  use plain `VITE_`. The full var list: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`/`SECRET`,
  `GH_TOKEN`, `ANTHROPIC_API_KEY` (scripts only — the **APP** reads its key from
  SQLite settings), `NEWSAPI_KEY`, `USE_NEWSAPI`.
- **★ Use the SAME service-role key as before** — it seeds the invite-code HMAC; a
  different key silently breaks every already-issued invite code.
- **Use LEGACY (JWT, `eyJ`-prefixed) Supabase keys, not the new `sb_publishable_`/
  `sb_secret_` format** — the code expects JWTs and the HMAC seeding depends on it.
- **Still BLANK in `.env`, restore before next use:** `GH_TOKEN` (regenerate —
  GitHub never re-shows it; needed for info-page publish + `npm run release`) and
  `GOOGLE_CLIENT_ID`/`SECRET` (retrievable from console.cloud.google.com; needed for
  Drive sync). Both are **BUILD-TIME baked via `define()`**, so adding them needs a
  rebuild, not just a dev restart.
- **Git auth** now via `gh` (GitHub CLI, browser login, Keychain) — no more PAT
  prompts. Username is `Doriankantor`.
- **Username path changed: `/Users/doriankantor` → `/Users/dorian`.** Any absolute
  path in older docs is stale.

### Found during the notifications cloud arc (2026-07-24) — logged, not fixed

- **`addComment` HAS NO `isOnline()` GUARD** (`boards.ts:1080`), unlike `getComments`
  directly above it. Offline it **THROWS**, `handleAddComment`'s uncaught `await`
  aborts, and the **Post button does NOTHING with NO error shown**. The block is
  **ACCIDENTAL** (an exception, not a policy). Also means the comment/mention
  notification writers are **unreachable offline**. `TaskDetailPanel` has **ZERO**
  connection awareness — `grep online` returns nothing.
- **Workspace task-panel DUE DATE has no picker.** The DATE-PICKER slice (`1ea04a7`)
  covered the To-Do panel and off-work only. Needs the same
  `onClick→showPicker()` + `[color-scheme:dark]` treatment as Start date.
- **A task due TODAY displays "Overdue."** Should read **"Due today"**. Boundary bug
  in the urgency computation — relevant to the **CET-anchored-clock** work, which
  assumed urgency states were computed correctly.
- **`isTransportError` matches ANY `TypeError`**, so a genuine coding bug inside the
  `try` would be misclassified as `'offline'` (banner suppressed, row marked,
  failure invisible). **Self-heals via the sweep.** Narrowing risks missing real
  transport errors — undici genuinely surfaces everything as a bare `TypeError` —
  so **left as is, logged**.
- **`personalSync.attempts` is WRITTEN BUT NEVER READ.** No retry cap, no surfacing;
  a permanently-poisoned op retries on **every reconnect and launch, forever**.
- ~~**`getUnreadCount` is NOT pending-merged** (N-2c-1 merged `getNotifications`
  only), so the Inbox list and the Header/Sidebar badges **disagree** in the
  hysteresis case. Folds into **N-2c-2**.~~ ✅ **RESOLVED in `3ea4021` (N-2c-2)** —
  the online branch now does signed pending-merge arithmetic. *(markAllRead offline
  is N-2c-3 — deferred for the unbounded-predicate mass-seed risk; single-row
  markRead shipped in N-2c-2.)* **RESOLVED N-2c-3 (`bea5a02`): offline markAllRead is
  intentionally online-required — disabled control, no ledger.**
- **`env.d.ts:634` types `notifications.create` as returning `{ok?, id?}`** but the
  handler returns a bare `{ok:true}` and **NEVER returns an id**.
- **Stale `~/Library/Application Support/Electron/` DB** — empty, two months old,
  from before the app name was set. Inert but a **diagnostic trap**; worth deleting.

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
  today, so a directive never reaches the assignee's machine). _(PARTIALLY SUPERSEDED by
  N-1 `720dbb8`: identity is now EMAIL-canonical; the CLOUD half is still outstanding — N-2.)_
  _(✅ **DONE — NOTIFICATIONS CLOUD ARC COMPLETE** through N-2c-3 (`bea5a02`); see the
  arc summary at the top. The prerequisite for To-Do 2.5/2.6/5 and the off-work
  notification-drop is MET, and **item 1 of this priority order is CLEARED — the new
  top of the queue is To-Do 2.5**.)_
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
    `notifications` → cloud**. Its own slice. _(PARTIALLY SUPERSEDED by N-1 `720dbb8`:
    identity is now EMAIL-canonical; the CLOUD half is still outstanding — N-2.)_
    _(SUPERSEDED: notifications are CLOUD-BACKED as of N-2a/N-2c-1. The prerequisite for
    To-Do 2.5/2.6/5 and the off-work notification-drop is now MET.)_
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
  *"consolidate ALL people-management under the Team page"* item — the Team-view redesign.
  **ROOT-ONLY.** Consolidates the roster + work-board membership + intel-project membership into
  one surface — **now ONE member↔head toggle per board** under the unified head role, not member +
  can-assign + head. **⚠ The off-work / leave-window UI's current Team-page placement is
  PROVISIONAL and rehomes into this redesign** (it was dropped on the Team page as a v1 stopgap).
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
         _(PARTIALLY SUPERSEDED by N-1 `720dbb8`: identity is now EMAIL-canonical; the CLOUD
         half is still outstanding — N-2.)_ _(SUPERSEDED: notifications are CLOUD-BACKED as
         of N-2a/N-2c-1. The prerequisite for To-Do 2.5/2.6/5 and the off-work
         notification-drop is now MET.)_
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
         _(SUPERSEDED: notifications are CLOUD-BACKED as of N-2a/N-2c-1. The prerequisite
         for To-Do 2.5/2.6/5 and the off-work notification-drop is now MET.)_
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
           DEFERRED** (blocked on notifications→cloud) with a documented stub. _(SUPERSEDED:
           notifications are CLOUD-BACKED as of N-2a/N-2c-1. The prerequisite for To-Do
           2.5/2.6/5 and the off-work notification-drop is now MET.)_ Verified both directions
           via a local-seed test.
       - **★ DATE-PICKER SLICE — ✅ SHIPPED (`1ea04a7`, 2026-07-21).** Not on the original queue;
         surfaced while using off-work. Three bundled fixes across `Team.tsx` + `Todo.tsx`: (a) native
         `<input type=date/time>` open on a body click via `onClick→showPicker()` + `[color-scheme:dark]`
         (root cause: Chromium only opens the picker from the tiny edge glyph — a quirk, not a bug); the
         panel's one-off custom `DatePopover` was REPLACED with a native `<input type=date>` so ALL date
         entry is native (calendar-grid helpers deleted; `usePopoverDismiss`/`PILL_CLASS`/`TimePopover`
         kept); (b) upward-opening was MOOT (native OS auto-flips — no custom flip logic); (c) recurrence GATED ON A
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
         _(PARTIALLY SUPERSEDED by N-1 `720dbb8`: identity is now EMAIL-canonical; the CLOUD
         half is still outstanding — N-2.)_ _(SUPERSEDED: notifications are CLOUD-BACKED as
         of N-2a/N-2c-1. The prerequisite for To-Do 2.5/2.6/5 and the off-work
         notification-drop is now MET.)_
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
    documented stub at `createNotification`). _(SUPERSEDED: notifications are CLOUD-BACKED as
    of N-2a/N-2c-1. The prerequisite for To-Do 2.5/2.6/5 and the off-work notification-drop is
    now MET.)_
  - **✅ SLICE DATE-PICKER SHIPPED (`1ea04a7`, 2026-07-21, UNRELEASED).** Three bundled fixes + a
    native unification in `Team.tsx` (off-work start/end) + `Todo.tsx` (new-todo date/time + panel
    due-date + recurrence). ★ **THREE REUSABLE LEARNINGS:**
    - **(a) Native date inputs only open the picker from the tiny edge glyph** — a body click does
      nothing. Wire `onClick={e => { try { e.currentTarget.showPicker() } catch {} }}` (the try/catch
      guards the already-open `InvalidStateError`; `showPicker()` is supported on Electron 31 /
      Chromium 126) so the whole field opens it, and add **`[color-scheme:dark]`** so the glyph is
      visible on the dark field. **The app-wide standard IS native inputs** — the custom `DatePopover`
      exists in only ONE place (the To-Do panel due-date); every other date field (Contacts,
      TeamCalendar, SocialTab, ManualInfoTab, TaskDetailPanel) is native. TaskDetailPanel's inputs
      already had `[color-scheme:dark]`; these four didn't.
    - **(b) UNIFIED all date entry on native inputs — the custom `DatePopover` was REMOVED.** The
      To-Do panel due-date was the last non-native date field; it's now a native `<input type=date>`
      whose `onChange` reuses the exact `onDue` setter (`''`→`null` preserves clear), so the write
      path is unchanged. `DatePopover` and its calendar-grid-only helpers
      (`WEEKDAYS`/`MONTH_NAMES`/`toISODate`/`todayISO`/`prettyDate`) were deleted; `usePopoverDismiss`/
      `PILL_CLASS`/`TimePopover`/`pad2` were KEPT (grep-verified still used by the recurrence + time
      controls). **Native OS picker positioning auto-flips** — the off-work block sits at the BOTTOM
      of the Team page and the native picker opens upward on its own, so **prefer native over a custom
      popover for edge/bottom-of-screen date fields** (the kept `RecurrencePopover`/`TimePopover` use
      `absolute … top-full` = always DOWNWARD, no flip/overflow logic — a custom date picker there
      WOULD have clipped). No custom flip logic needed or added.
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
      still never leaves the assigner's machine. _(PARTIALLY SUPERSEDED by N-1 `720dbb8`:
      identity is now EMAIL-canonical; the CLOUD half is still outstanding — N-2.)_
      _(SUPERSEDED: notifications are CLOUD-BACKED as of N-2a/N-2c-1. The prerequisite for
      To-Do 2.5/2.6/5 and the off-work notification-drop is now MET.)_
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
- CHECK EXISTING UI + ARCHITECTURE FIRST. Before designing, mocking, or building anything,
  read the actual component/code as it exists today -- never design against a mental model of
  it. This extends "read-only diagnose before build" to UI/design work: a mockup of a screen
  that already exists is wasted work. (Learned: mocked New Sources geography chips that already
  existed on the Intel card.)
- NO VIEW REMOUNTS ON ACTIONS -- views freeze where last used until app restart. Every action's
  success path must be a BACKGROUND update (load({background:true}) or optimistic setState),
  never a full reload that unmounts the list/canvas or resets scroll. This is a GLOBAL invariant,
  checked proactively on every slice that touches a view -- part of the pre-commit test like
  drag-and-drop. (Hit repeatedly: NewSourcesTab scroll-jump, PreCommitReview canvas-unmount.)
- TOKEN-EFFICIENT AI ALWAYS. AI runs only on explicit user action, never speculatively or
  repeatedly on unchanged content; guard/cache against re-analysis of already-processed sources;
  prefer the cheapest model that does the job (Haiku won the A/B over Luna/GPT-5.6 for structured
  extraction). Any slice that calls AI gets a "does this re-process anything already processed?"
  check. (Reference waste: intel sources being scanned and re-scanned repeatedly.)
