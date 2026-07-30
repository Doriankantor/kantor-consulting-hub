# Intel + Info Pages restructure — locked data model

*The session output. A single reconciled data model that `routing-design.md`, the
InfoPagesFlow narrative + mockup, `contested-skies-mockup_20.html`, and the app as it
actually is today all agree on. Design-track — nothing here is code, and the SQL is
hand-applied at build time in the Supabase editor + local mirror, dated file under `sql/`,
no migration runner. Five decisions are locked; this is what they add up to.*

Companion to: `RESTRUCTURE_reconciliation_agenda.md` (the brief), `InfoPagesFlow.html`
(the publication mockup), `PublicationProcess.md` (the publish narrative),
`contested-skies-mockup_20.html` (the public page, now the cutover target).

---

## 0. Ground truth (what the read-only diagnose confirmed)

The model is built on the live app, not on assumption. HEAD `79c150d`, tree clean.

- **`info_page_sources` is CLOUD.** PK `(article_id, info_page)`, Supabase-first writers,
  `onConflict:'article_id,info_page'`, created by `sql/2026-07-27-b2-info-page-sources-cloud.sql`.
  The older "local-only / B2 paused" HANDOFF entries are **stale** — trust the cloud verdict.
  So the placement-key change is an additive Supabase `ALTER` + local mirror + one `onConflict` edit.
- **`intelligence_sources.geography` is scalar** (`TEXT`), as is `location_mentioned`.
  `geography_confirmed` is a human-confirmed flag, not a subject/mentioned distinction.
  Multi-geography and subject-vs-mentioned are genuine gaps — new columns, nothing to extend.
- **Tags live in three JSON columns on `intelligence_sources`:** `categories_json` (the nine),
  `thematic_tags`, `disposition_tags`. `known_tags` is cloud, project-scoped (`project_board_id`).
- **`analyze.ts` (`analyzeText`) emits:** `summary`, `relevance_score`, `relevance_reasoning`,
  `suggested_tags`, `article_type` (enum: incident|regulatory|procurement|counter-uas|innovation|legal|governance|other),
  `capabilities[]` `{system, actor?, actor_type?∈(VNSA|state|commercial|unknown), cost?, category?, relationship?}`,
  `key_facts[]` `{label, value}`. **No routing category, no channel, no geography in the output.**
- **Two info-page pipelines exist and only one publishes.** `info_page_sources`+`info_page_changes`
  (CLOUD, `new→review→committed` pointer tier) is what InfoPagesFlow describes. `info_page_items`+
  `info_page_commits`+`info_page_published` (LOCAL) is what actually publishes today.
- **The live page is hand-authored HTML + an injected block**, not generated from data.
  `publishToRepo` fetches the repo `index.html`, builds a block from local `info_page_items`,
  injects it between `HUB_UPDATE_START/END` markers, PUTs the file back. The mockup's
  `const P = {…}` is a **separate prototype**, not the live mechanism.
- **Routing today is category-driven, not tag-driven**, and the live set is stale
  (`finance-nexus` still present, actor split not applied). `categories_json → queue_section`
  is the only live routing; thematic tags are not wired into placement.

---

## 1. Placement key — the cell (Decision 1, locked)

The published-source placement is keyed **`(article_id, info_page, category, geography)`**.
A source produces **one placement row per (category × subject-country) it substantiates.**

- `info_page_sources` gains **two** new columns — `category` and `geography` — not one.
  Geography is not on the table today; it comes in as part of this change.
- PK/UNIQUE widens `(article_id, info_page)` → `(article_id, info_page, category, geography)`.
- The `onConflict:'article_id,info_page'` upsert in `src/main/cloud/infoPageSources.ts` widens to
  `'article_id,info_page,category,geography'`. Cloud DDL + local mirror + this one clause.
- **Additive** — a wider key admits more rows, invalidates none. Existing rows keep their
  `article_id, info_page`; the new columns backfill.

The common case stays cheap: a single-country incident report is **one** row. Only the
comparative analytical piece — "Brazil invests via BNDES while Argentina relies on imports,"
one source, one category, two countries saying different things — fans wide, and that is the
analytical output the page exists to produce. Design for the expressive case; the simple case
is free under it.

---

## 2. Geography model (Decision 2, locked)

Geography is a **list**, split by role:

- `intelligence_sources` gains **subject-countries** and **mentioned-countries** lists
  (JSON-string columns, matching the `categories_json`/`thematic_tags` pattern already in use).
- **Only subject countries generate placement rows.** Mentioned countries are metadata —
  they keep the map honest without over-attributing.
- **Cards keep their own multi-country list** (the mockup's `SLOTS[*].slots[*].countries[]`),
  independent of a source's placement geographies.
- **Extra-regional implicates two geographies** — a subject entry for both the supplier and the
  recipient, each generating placements (e.g. an Iran→Venezuela transfer is subject-VE and
  subject-REGIONAL/supplier as the design requires).
- The existing scalar `geography` and `location_mentioned` are superseded by these lists;
  `geography_confirmed` stays as an orthogonal human-confirmed flag.

---

## 3. Incidents are their own record type (Decision 3, locked)

Incidents do **not** share the placement schema. They are single-country, event-shaped, and the
page already models them separately (`INC` vs `sources[]`).

- A distinct **incidents** table, keyed by event (event id + date + country + verification
  status: single-source | corroborated | disputed), holds the incident feed.
- Routing-design's step 0 holds: a dated, located unmanned-system event **creates/attaches an
  incident first**, then continues into category routing.
- An incident **may** emit a placement pointer into a cell it substantiates, but the incident
  record itself is separate and separately keyed. Conflating incidents with analytical
  placements is the modeling error this decision exists to prevent.

---

## 4. Routing — AI-proposed, one-to-many, evidence-based (Decision 4, locked)

Routing is an **AI proposal step**, not a field lookup. This is the intake vision made precise,
and it replaces the current `categories_json → queue_section` path.

**The mechanism.** At capture/analyze time (not at approval), AI reads the **evidence** —
`thematic_tags` + `summary` + the structured content (`capabilities[]`, `actor_type`,
`key_facts[]`, `article_type`) — and proposes a **set of the nine categories** (one-to-many),
each marked `proposed`, together with the geography fan-out (§2). The nine categories are the
**output**; the tags-and-structure are the **evidence**; AI is the mapping layer between them.
Tags are primary evidence, not decoration.

**The researcher disposes.** On the New-sources screen the researcher confirms, removes, or adds
sections (the add control shows all nine, selected ones checked). The exit gate holds: a source
cannot leave New sources until ≥1 section is selected. Every correction is stored as a labelled
example — the feedback loop that tunes the mapping over time.

**What this requires building** (it is a build, not a tweak):

1. **Reconcile the live category set to the nine** — drop `finance-nexus`, apply the actor split,
   retire the `platforms` lump. The approval-side routing was never reconciled to the nine even
   though collection was.
2. **Add a `channel` field to `analyze.ts` output** — state-procurement/transfer vs.
   commercial-retail/export. This is what separates 04 Extra-regional from 05 Supply chains, and
   tags alone cannot disambiguate it. One new extracted field.
3. **Author the evidence→category mapping**, including **tag→section priors authored against the
   real `known_tags` vocabulary.** For "AI proposes based on the tags" to be more than free
   association, each thematic tag should carry a prior — which section(s) it points toward — that
   AI combines with the summary and structure.

**`actor_type` is routing evidence, not a placement axis.** It answers "who holds this system"
and is the field that most sharply separates 01 Systems from 02 VNSA, and 03/04/05 from each
other. It feeds the routing proposal; it is not itself a category or a key column.

**First build step (read-only, precedes wiring the AI step):** pull the actual `known_tags`
thematic vocabulary and author the per-tag section priors against real tags, not invented ones.
This is the intel-side "routing contract" that was always TBD — now it has a concrete first move.

---

## 5. Content tier — `section_texts` + `cards`, mapped onto the mockup (Decision 5, locked)

The publication content of record becomes two new tables that map onto the mockup's `P` object.

### `section_texts` — versioned narrative, maps cleanly from `CNARR` + `I18N`

```
section_texts(
  id,
  geography,            -- country code | 'REGIONAL' (All LATAM)
  section_key,          -- one of the nine
  lang,                 -- 'en' | 'es' | 'pt'
  body,                 -- the narrative prose
  version, superseded_by,   -- versioned, not overwritten → diff / history / rollback
  updated_by, updated_at
)
```

Maps directly: `CNARR[cc][section_key]` → country-level EN rows; the mockup's region-level
narratives → `geography='REGIONAL'` rows; `I18N.es`/`I18N.pt` region + country prose → the `es`/`pt`
rows. **This is a clean, full seed** — the mockup already carries authored ES/PT, so the store
starts with human translations, not machine ones (see §7).

### `cards` — the 12-slot published-figure layer, seeded partially/derived

```
cards(
  id,
  geography, section_key,       -- the cell
  slot_kind,                    -- OPTIONAL, advisory (name|range|endurance|price|…)
  headline, detail,             -- the published figure + its note
  countries,                    -- multi-country presence list (own axis, per §2)
  confidence, source_id,
  position(1-12),               -- 12 slots per cell, hard max
  active, replaced_by,          -- swap is reversible, archived not deleted
  updated_by, updated_at
)
```

**Honest reconciliation — `cards` does NOT map 1:1 from `P` the way `section_texts` does.**
The mockup's `SLOTS` is a *coverage catalogue* (per category: which slot-kinds like range /
endurance / price exist, and which countries have them filled) — it is the **advisory slot-kind
vocabulary**, per agenda §4 option A, not a table of twelve headline+detail cards. The published
figures themselves are drawn from `SLOTS` examples + the `DATA` portfolio fields + `CNARR` prose +
`CHARTS`. So:

- **Slot-kinds** (the advisory checklist) seed from `SLOTS[section_key].slots[*].slot`.
- **Card content** (headline+detail) is a **derived / curated** seed, not a straight import — it
  may start partial and fill as researchers author figure-cards.
- **No blanking risk:** during transition the generated page keeps rendering figures from the
  existing `P` coverage structures (`SLOTS`/`DATA`/`CHARTS`) for any cell whose `cards` are not yet
  authored, so a partial `cards` table never empties the page.

**Slot model = advisory for v1** (agenda §4): free-form cards, `slot_kind` optional, the kind list
is a coverage checklist. The stricter "slot is the schema" version stays reachable without a
migration.

---

## 6. Publication tier + page cutover (Decision 5, locked: **A**, migration-tax removed)

**The decision: generate the page from data (option A), with the migration tax removed by a
manual page swap, sequenced last.**

**Dorian replaces the live page with the mockup by hand.** This is the cutover move. Once the
live page *is* the `P`-shaped mockup, the base content lives in structured data, so the
"migrate hand-authored HTML into structured data" cost — the thing that made A heavy — is paid
once, by hand, deliberately, instead of built.

**Seed the store from `P` at cutover** (locked): import `CNARR` + `I18N` → `section_texts` v1
(full), and `SLOTS` slot-kinds → `cards` (partial/derived per §5), so **the database is
authoritative from the first generated publish.** Empty or lazy seeding was rejected — the first
generated publish would blank the page, or leave a per-cell split source of truth.

**The generated publish path** (built last, per `PublicationProcess.md`): Publish reads
`section_texts`/`cards` from the store, regenerates the page (the `P` object / rendered HTML),
then commits + pushes via the GitHub API from the main process (token held like the Supabase
service key), and the host auto-deploys. **DB-first ordering, page-as-projection**: a failed push
is `sync-pending`/retry, never a page ahead of the record. One transaction writes source
placements + versioned texts + cards + change-log together, or nothing.

**Retired, not bridged:** `info_page_items`, `info_page_commits`, `info_page_published`, and the
inject-block `publishToRepo`. Once the page is `P`-shaped, nothing feeds them; they become dead
and are removed. `info_page_sources` (+`info_page_changes`) is the standardized pointer tier.

**Sequenced publish-last:** intake (§§1–4) is built first and is independent of the publish
mechanism. The generated-publish cutover happens only after routed content is flowing into the
new tables and the store has been exercised — so fidelity can be eyeballed before the
hand-authored page is retired. This matches the one-slice-at-a-time, commit-when-it-works workflow.

---

## 7. Translations (agenda §6)

**Translate-at-publish from approved EN, with a per-cell override flag.** Refinement from the
diagnose: the mockup's `I18N` already carries **authored** ES/PT for the region and country
narratives, so the seed (§6) starts the store with human translations. Translate-at-publish only
fills **future gaps** (new/edited EN cells with no hand translation); the per-cell override flag
lets a native-speaker researcher keep a hand-tuned translation from being overwritten. `lang` on
`section_texts` carries the three languages; most cells never need a hand translation, and the
ones that do are usually already being read by a native-speaker researcher.

---

## 8. The Analysis & design grid (agenda §1 UI requirement)

The 2-axis editor from the InfoPagesFlow mockup is the working surface for the placement model:
**geographies across the top** (ALL LATAM + each implicated country), **the nine sections down
the left**, with a `!` badge only where AI has proposed a change or content exists. Design
obligation from Decision 1's distribution: the **common single-cell case must feel light** (filing
one incident report is not a trek through a 135-cell grid) and the **comparative many-cell case
must feel navigable** (fluid movement across the cells one source touches). Section text edits go
three ways — direct / AI-integrate (diff, accept-replaces) / AI-integrate-divergent (the explicit
second-click warning) — writing versioned rows to `section_texts`. Cards: 12 slots, add / replace
(archive the evicted) / delete, per §5.

---

## 9. Build order

The dependencies run one way; out of order means rework. Steps 1–3 are a working editorial tool
even with AI turned off — the correct failure mode.

1. **Schema + versioning** (hand-applied SQL, dated `sql/` file, update B2b `onConflict`):
   widen `info_page_sources` key (+`category`, +`geography`); add subject/mentioned country lists
   to `intelligence_sources`; add storage for the `channel` field; create the `incidents` table
   (own key); create `section_texts` (versioned) + `cards` (12-slot, `replaced_by`).
2. **Routing (intake).** First move — read-only pull of the real `known_tags` vocabulary + author
   tag→section priors. Then: reconcile the approval category set to the nine; add `channel` to
   `analyze.ts`; wire the AI category-proposal step (evidence → one-to-many `proposed` categories +
   geography fan-out); New-sources UI (section chips, add-all-nine menu, ≥1-section gate, bulk
   approve); capture corrections as labelled examples.
3. **Analysis & design grid.** The 2-axis editor (§8): section-text editing (direct / AI-integrate
   / divergence warning) → `section_texts`; cards (12 slots, add/replace/delete, advisory slot-kind).
4. **Page cutover (manual).** Dorian replaces the live page with the mockup; seed `section_texts`
   (full, from `CNARR`+`I18N`) and `cards` (partial/derived, from `SLOTS`) as v1.
5. **Generated publish path.** Publish reads store → regenerates page → GitHub-API commit/push →
   update-note → change-log; DB-first, page-as-projection, sync-pending. Retire the legacy
   `info_page_items`/`commits`/`published` + inject-block.
6. **History / rollback / Sources archive.**

---

## 10. Out of scope / retired / deferred

- **Retired** (once §6 cutover lands): `info_page_items`, `info_page_commits`,
  `info_page_published`, the inject-block `publishToRepo`.
- **Out of scope** (already decided, agenda §0): the finance/laundering strand — 09 is Illicit
  logistics only.
- **Deferred, reachable without migration:** the stricter "slot is the schema" card model
  (advisory for v1); hand-tuned per-cell translations beyond the override flag.
- **The stale-set cleanup is part of step 2**, not a separate effort: the live approval routing
  still references `finance-nexus`/`platforms` and must be reconciled to the nine as routing is
  rebuilt.

---

*Locked: placement key `(article_id, info_page, category, geography)`; geography as
subject/mentioned lists; incidents as their own record; routing as an AI-proposed, one-to-many,
evidence-based step with tag→section priors; content tier `section_texts`+`cards` mapped onto
`CNARR`/`SLOTS`, seeded from `P`; generated-from-data publication (option A) with the page
replaced by hand and the legacy publish tier retired, sequenced last. This is the contract the
build slices are written against.*
