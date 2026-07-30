# Intel + Info Pages restructure — tag → section priors (routing contract)

*Step-2 design artifact. The intel-side "routing contract" the locked model flags as
always-TBD — now authored against the REAL `known_tags` vocabulary (64 rows, all
`type='thematic'`, all under `board-info-latam`) and the live co-occurrence data pulled
2026-07-30. Design-track: this is the evidence→proposal mapping AI uses to propose a SET
of the nine sections; it is not code. Priors are seeds — the mapping LEARNS from
researcher add/remove decisions over time.*

Companion to: `RESTRUCTURE_locked-data-model.md` (Decision 4 = routing).

---

## 0. The three-axis discipline (the core rule)

A thematic tag lands on **exactly one** of three axes. This is what keeps routing
intelligent instead of a keyword lookup, and it enforces the locked GUARDRAIL — *tags
must not duplicate what structured fields already carry.*

| Axis | What it is | Where it routes | Carries a section prior? |
|---|---|---|---|
| **Section-prior** | descriptive tags about *what kind of thing* the source is | the nine sections | **YES** — this doc |
| **Geography** | country / place names | `subject_countries` / `mentioned_countries` | **NO** |
| **Actor** | named groups (FARC, CJNG…) | `actors_mentioned` + derived `actor_type` | **NO** (but see rule B) |

**The load-bearing consequence:** of the 64-tag vocab, **14 are geography** and **~9 are
named actors** — ~36% of the vocabulary carries *no* section prior at all. It routes to
its own axis. Only ~25 tags do real section-routing work. This is correct: the diagnose
proved geography is category-noise (`colombia` alone spreads across 5 categories), and a
named actor is a *who*, not a *what*.

### Rule A — geography feeds geography, never a section
A bare country tag (`china`, `ukraine`, `venezuela`) routes to the geography axis. The
`external`/`supply` lean that supplier-origin countries *seem* to imply does **not** come
from the country tag — it comes from the supplier-**role** tags (`chinese-supplier`,
`european-supplier`) plus the extra-regional flag. `china` the place ≠ `chinese-supplier`
the role. Keeping these separate is what stops every Ukraine-mentioning source from
falsely routing to Supply.

### Rule B — named actors feed `actor_type`, which *then* feeds the section
`farc` → actor axis → `actor_type='VNSA'` → **that** is the evidence that pulls the `vnsa`
section. The section prior sits on the *actor-type*, not the *named actor* — so we don't
re-encode "FARC is a VNSA" as a section rule. **Open call #2 below:** should `actor_type=VNSA`
auto-add the `vnsa` section, or only propose it?

### Rule C — event tags trigger an incident record *first*
Per Decision 3, a dated/located unmanned-system event (`drone-attack`, `military-target`,
`uas-aircraft-strike`) **creates/attaches an `incidents` record first**, then routes on to
the section(s) it substantiates by actor/target. "Incident" is a record type, not a
section — these tags carry both an incident trigger and a section lean.

---

## 1. Section-prior tags — the mapping

**Notation:** **bold** = primary/home-base lean (the default cell). Plain = secondary lean,
added by the one-to-many step *only when corroborating evidence is present* (a channel, a
buy signal, a foreign supplier, a target type). A tag with several leans is the design
working, not a problem — BANOT is the textbook case.

### → systems (01) — home base for capability, C-UAS, and state platforms
| tag (freq) | primary | + evidence-added |
|---|---|---|
| `weaponized-drone` (11) | **systems** | vnsa (who holds it) |
| `cuas` (4) *(merge `counter-uas` 3)* | **systems** | investment (if a buy) |
| `counter-uas-procurement` (7) | **systems** | **investment** *(true dual — co-occ C-UAS×5 + Investment×3)* |
| `uas-aircraft-strike` (1) | **systems** | + incident record |
| *state-platform sources* | **systems** | external / investment by evidence |

*C-UAS folds into systems (locked). The slot schema already carries "C-UAS performance" as
a systems figure-kind, so counter-drone cards have a home with no schema change.*

### → vnsa (02) — triggered by actor_type=VNSA
| tag (freq) | primary | + evidence-added |
|---|---|---|
| `violent-non-state-actor` (5) | **vnsa** | — *(this IS the actor-type evidence)* |
| `non-state-actor-uas` (1) | **vnsa** | systems (the UAS capability) |
| `urban-conflict` (3) | **vnsa** | + incident record |
| `crime` (2) | **vnsa** | logistics |
| *named actors (FARC/ELN/cartels)* | → actor axis | → vnsa via actor_type (rule B) |

### → industry (03)
| tag | primary | + evidence-added |
|---|---|---|
| *Innovation & Technology sources* | **industry** | — |
| `china-technology` (1) | industry | external + supply |
| `technology-transfer` (3) | industry | **supply** + external |

*Thin in the current vocab — industry is mostly reached as a secondary lean off the
technology/transfer tags. Watch whether it needs a dedicated tag as content grows.*

### → external (04) / supply (05) — channel disambiguates
`channel` (state-procurement/transfer vs commercial-retail/export) is the field that
separates these two; it is a step-2 `analyze.ts` addition, not a tag.
| tag (freq) | primary | + evidence-added |
|---|---|---|
| `iranian-supplier` (3) | **external** | supply + systems *(co-occ State×3 + Supplier×2)* |
| `chinese-supplier` (1) | **external** | supply |
| `european-supplier` (1) | **external** | supply |
| `iranian-uas-proliferation` (2) | **external** | supply + systems |
| `iran-cuba-military-alignment` (2) | **external** | systems |
| `cuban-airspace-threat` (2) | **external** | systems |
| `western-hemisphere-airspace-threat` (2) | **external** | systems *(reclassified OUT of geography)* |
| `technology-transfer` (3) | **supply** | external + industry |

### → investment (06)
| tag | primary | + evidence-added |
|---|---|---|
| `investment` (1) | **investment** | — |
| `counter-uas-procurement` (7) | systems + **investment** | *(dual, listed under systems)* |
| *procurement / investment-signal content* | **investment** | systems (if C-UAS) |

### → legal (07, "Regulatory")
| tag (freq) | primary | + evidence-added |
|---|---|---|
| `regulation` (1) *(merge `regulatory-response`)* | **legal** | — |
| `deregulation` (0*) | **legal** | — |
| `governance` (0*) | **legal** | investment (if industry-governance) |
| `civilian-uas-compliance` (0*) | **legal** | **civilian** |
| `non-security-regulatory-guidance` (0*) | **legal** | civilian |
| `unauthorized-drone-operation` (4) | **legal** | civilian |
| `utm` (0*) | **legal** | civilian |
| `BANOT-parallel` (0*) | **legal** | **systems** + **investment** *(the smorgasbord — reorg = legal + posture + budget)* |

*(0* = in the controlled vocab but not yet observed in a used source; prior authored from
meaning, will calibrate on first use.)*

### → civilian (08) — STARVED cell (see §3)
| tag (freq) | primary | + evidence-added |
|---|---|---|
| `civilian-target` (3) | **civilian** | + incident record |
| `civilian-casualties` (5) | **civilian** | + incident record |
| `civilian-impact` (2) | **civilian** | — |
| `airport-security` (2) | **civilian** | systems |
| `airspace-security` (5) | civilian | **systems** |
| `facial-recognition` (1) | **civilian** | — |

### → logistics (09) — STARVED cell (see §3)
| tag (freq) | primary | + evidence-added |
|---|---|---|
| `contraband` (0*) | **logistics** | — |
| `drone-seizure` (1) | **logistics** | vnsa |
| `crime` (2) | vnsa + **logistics** | *(dual)* |
| `law-enforcement` (1) | *(context)* | minor logistics / civilian |

### → incidents record (Decision 3 — record type, then place by actor/target)
| tag (freq) | triggers | places to |
|---|---|---|
| `drone-attack` (20) | **incident** | vnsa *(actor)* / systems *(state)* — co-occ Incident×15 + VNSA×11 |
| `military-target` (13) | **incident** | systems / vnsa — co-occ Incident×9 + State×6 |
| `drone-delivered-explosives` (12) | **incident** | vnsa (+systems) |
| `uas-aircraft-strike` (1) | **incident** | systems |
| `civilian-target` / `civilian-casualties` | **incident** | civilian |
| `explosives` (0*) | *(weak support)* | reinforces incident/vnsa, no standalone prior |

---

## 2. Housekeeping — merges, drift folds, junk

**Near-duplicate merges (collapse to one canonical tag):**
- `counter-uas` → **`cuas`**
- `regulatory-response` → **`regulation`**
- `criminal-organizations` → **`violent-non-state-actor`** *(both = actor_type VNSA)*

**Drift tags — used in sources but NOT in the controlled 64-vocab — fold or reject:**
- `romania` (2) → geography axis *(supplier-origin, like `europe`)*
- `drone-delivered-ordnance` (2) → **`drone-delivered-explosives`**
- `grupo` (1) → **`grupos-armados`**
- `colombia-grupos-armados` (1) → split into `colombia` *(geo)* + `grupos-armados` *(actor)*

**Junk / non-descriptive — drop from the routing vocab entirely:**
- `inadequate` (2) — a quality/disposition judgment, not a descriptive tag. No section prior. Remove.

**Reclassified out of "geography":**
- `western-hemisphere-airspace-threat` — a threat-framing, not a place → external/systems (see §1).

---

## 3. Known gaps — NOT a priors problem to solve here

- **`civilian` (08) and `logistics` (09) are starved.** Priors route *to* them correctly,
  but too little raw material reaches them — the upstream relevance-gate + keyword-net
  narrowing the design docs already flagged. This is a **collection-widening** fix (its own
  later session), not something priors can manufacture. Flagged so it's not mistaken for a
  routing failure.
- **`industry` (03) is thin** — reached mostly as a secondary lean. Monitor; may need a
  dedicated tag as innovation content grows.
- **Long tail (~30 single-use tags)** not enumerated here route by their cluster's rule.
  The mapping learns them from researcher decisions rather than pre-authoring each.

---

## 4. The three calls that need a ruling before this locks

1. **Starved cells (§3)** — confirm you accept `civilian`/`logistics` stay thin until the
   collection-widening session; priors are correct, material is upstream. *(Recommend: yes,
   note it, move on.)*

2. **Does `actor_type=VNSA` AUTO-ADD the `vnsa` section, or only propose it?** A `farc`-tagged
   source → actor axis → VNSA. Should that automatically put the source in `vnsa` (fast, but
   a FARC *procurement* story is really investment), or should AI still *propose* vnsa for
   confirmation like any other section? *(Recommend: propose, don't auto-add — consistent
   with "AI proposes, researcher disposes"; a named actor is strong evidence, not a verdict.)*

3. **Confirm the housekeeping (§2)** — the 3 merges, 4 drift folds, and dropping `inadequate`.
   These edit the controlled `known_tags` vocab, so they're a small data change, not just doc.
   *(Recommend: yes to all; they're unambiguous.)*

---

*Once these three are ruled, this doc is the frozen v1 routing contract. Next: wire the
AI category-proposal step in `analyze.ts` (evidence → one-to-many `proposed` sections +
geography fan-out) against these priors, and add the `channel` field. Corrections captured
on the New-sources screen feed back as labelled examples — the priors are the seed, the
researcher decisions are the training.*
