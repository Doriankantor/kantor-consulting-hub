# Unified Card — model spec for reuse

**Purpose of this document.** KC Hub has a single card component that renders one *source* across three surfaces (Intel, New Sources, All Sources). The card is a **three-zone shell** whose only per-surface difference is *which zone is editable*. This document describes that shell abstractly so the drone-database project can judge how much of it transfers to a *drone-systems catalogue entry*. The companion interactive mockup is `unified-source-card-mockup.html` — open it and toggle the three surfaces to see the shell morph.

Nothing here is drone-specific yet. The last section maps the shell onto drone content as a starting proposal; the drone designer decides what actually fits.

---

## 1. The core idea — one shell, an editability axis

The card is **not** three different cards. It is one shell rendered at different **editability levels**. Each informational axis (a "zone" or a field within a zone) is independently in one of three states on a given surface:

- **EDIT** — the control is interactive here (add/remove chips, override a value, pick from a list).
- **READ** — the value is shown but flat/non-interactive; it is edited on some *other* surface.
- **ABSENT** — not shown at all on this surface.

A surface is therefore just a **config object**: for each axis, one of EDIT / READ / ABSENT. Adding a new surface = adding a new config, not a new component. This is the single most reusable idea in the design, and it is domain-agnostic: it works for sources, drones, contacts, or anything with a lifecycle where different stages grant different editing rights.

> **Design rule that makes this honest:** the shell must never show EDIT for something the underlying stage can't actually save, and never show a "done/ready" state the real gate would block. Editability in the UI mirrors the real permission/stage gate exactly.

---

## 2. Anatomy of the shell (top to bottom)

```
┌───────────────────────────────────────────────┐
│  TITLE SURFACE  (prominent)                    │
│  kicker: status · confidence · source · date   │
│  Title (large)                                 │
│  One-line summary                              │
├───────────────┬───────────────┬───────────────┤
│  ZONE A ⚙      │  ZONE B 🌐     │  ZONE C 👤     │
│  (cogwheel)   │  (globe)      │  (bust)       │
│  assessment / │  geography /  │  engaged      │
│  routing /    │  place        │  entities     │
│  meta         │               │               │
├───────────────┴───────────────┴───────────────┤
│  REVIEW & ANNOTATE  (collapsible)              │
│    ▸ completeness meter (3-state)              │
│    ▸ gate checklist                            │
│    ▸ notes                                     │
│    ▸ [Close panel]                             │
├───────────────────────────────────────────────┤
│  ACTION BAR  (varies per surface)              │
└───────────────────────────────────────────────┘
```

### 2.1 Title surface
The prominent hero of the card. Holds the **title** and a **one-line summary**, plus a "kicker" row of at-a-glance status (a headline status badge, the confidence value, the source/provenance, the date). This is the one part that is always read-only and always the same across surfaces.

### 2.2 The three zones
Each zone is a bordered, tinted box with a **corner icon that names the axis** (structure = information; the container tells you which axis you're reading without a label). The three zones are:

- **Zone A — "Assessment & routing" (⚙ cogwheel).** The densest zone. Holds the machine/meta layer: review status, a **confidence** value, a **relevance** value, language, an **incident** determination, the **sections/categories** this item is routed into, and **tags**. Confidence and relevance are shown as **click-to-override pills** (the pill itself is the edit control — no separate dropdown — to save space).
- **Zone B — "Geography" (🌐 globe).** Where the item sits in the world: a **subject** set (primary) and a **mentioned** set (secondary), plus a scope/level control.
- **Zone C — "Engaged entities" (👤 bust).** The people/organizations/things involved. In the source card these are actors (armed groups, state forces, companies).

Zones are proportioned to content — the cogwheel zone is widest because it carries the most.

### 2.3 Overflow — the `··· +N` pattern (important for dense cards)
Zones do **not** try to fit everything inline. Each zone shows a **primary set** (~5 chips) and collapses the rest behind a compact **`··· +N`** pill rendered in the zone's own accent color — the count tells you *how much* is hidden, not merely that something is. Clicking it opens a **popover anchored to that zone**, showing the full set **grouped by sub-type** (e.g. actors grouped as VNSAs / State forces / Industry; geography as subject / mentioned). The popover inherits the zone's editability: editable surface → removable chips + an add control; read surface → flat chips.

This matters for any reuse: catalogue entries get dense (many operators, many variants), and the overflow pattern keeps the card compact and stable while making the full detail one click away. The popover grouping is what makes the spinout *better* than the inline row, not just longer.

### 2.4 Review & annotate + completeness meter
A **collapsible** panel with:
- a **three-state completeness meter** (No work · In progress · Ready to commit) shown as a segmented bar in the panel's header bar,
- a **gate checklist** — the specific fields that must be satisfied before the item is "ready" (the meter reflects the checklist, and "ready" means *the real commit/approve gate will pass* — the meter never lies),
- a free-text **notes** area,
- a **Close panel** control at the bottom.

Behavior rule (from a real bug we fixed): the panel **defaults collapsed on restart**; it may preserve its open/closed state while navigating within a session, but content never force-opens it.

### 2.5 Action bar
A row of actions that **changes per surface** — the workbench surface has the full verb set (approve/save/reject/etc.), an intermediate surface has fewer (confirm/move-back), the archive surface has none. Actions are part of the surface config, not baked into the shell.

---

## 3. The editability matrix (source card, concrete example)

This is what "one shell, three surfaces" looks like filled in for the *source* domain. The drone domain will have its own matrix — the point is the *shape*, not these exact values.

| Axis | Workbench (Intel) | Routing (New Sources) | Archive (All Sources) |
|---|---|---|---|
| Title & summary | READ | READ | READ |
| Geography | **EDIT** | READ | READ |
| Entities (actors) | **EDIT** | READ | READ |
| Sections / categories | READ (AI-proposed) | **EDIT** | READ |
| Tags | **EDIT** | READ | READ |
| Incident / classification | **EDIT** | **EDIT** | READ |
| Confidence | **EDIT** | READ | READ |
| Relevance | **EDIT** | READ | READ |
| Status / actions | full verb set | confirm · move back | none |

Read this as: *content authorship* happens on the workbench, *routing/classification* happens on the routing desk, the *archive* is read-only. Exactly one dimension (editability) varies across the columns — that is what justifies one shell instead of three components.

---

## 4. What is domain-agnostic vs. source-specific

**Reusable as-is (domain-agnostic):**
- The **shell layout**: title surface → three tinted zones with corner icons → collapsible review/annotate → action bar.
- The **editability model**: per-axis EDIT / READ / ABSENT driven by a per-surface config object.
- The **overflow `··· +N` pattern** with zone-anchored, grouped popovers.
- The **three-state completeness meter + gate checklist** tied to the real commit gate.
- The **click-to-override pill** pattern for scalar values (confidence/relevance style).
- The **collapsible panel** behavior (default-closed-on-restart).
- The **action bar as per-surface config**.

**Source-specific (the content inside the zones):**
- The *particular* axes: geography-as-countries, actors-as-armed-groups, sections-as-9-CS-categories, tags, incident.
- The *particular* editability matrix above (which surface edits what).
- The vocabulary (country lists, the nine sections, actor types).

So the reuse question for the drone DB is **not** "does the whole card fit" — it's "keep the shell + the three reusable patterns, swap the zone *contents* for drone fields, and write a new editability matrix for the drone lifecycle."

---

## 5. Proposed mapping onto a drone-systems catalogue entry

A starting proposal for the drone DB to react to — **not** a locked design. Same shell, drone content:

**Title surface:** system name + one-line descriptor (e.g. platform family, role). Kicker: catalogue status (draft/verified), a data-confidence value, the primary data source, last-updated date.

**Zone A — Assessment & routing (⚙):**
- status (draft / verified), **data-confidence** (click-to-override, same pattern as source confidence),
- **class & role** (e.g. loitering munition / ISR / cargo), **NATO/type designation**,
- **capability tags** (FPV, swarm-capable, GPS-denied, etc.),
- **catalogue sections** this entry populates (the drone-DB equivalent of the 9 categories — whatever the catalogue's own taxonomy is).

**Zone B — Geography (🌐):**
- **country of origin** (subject), **operator / observed-deployment states** (mentioned), scope/level.
- Directly reuses the subject/mentioned geography model.

**Zone C — Engaged entities (👤):**
- **manufacturer**, **operators**, **known counter-systems / integrators**.
- Same entity-chip + grouped-overflow pattern; groups become Manufacturer / Operators / Counter-systems instead of VNSAs / State forces / Industry.

**Review & annotate:** the completeness meter's gate checklist changes to the *catalogue's* required fields (e.g. name, class, origin, at least one spec, at least one source) — but the three-state meter and the "ready means the real gate passes" rule carry over unchanged.

**Action bar:** whatever the drone-DB lifecycle needs (e.g. verify / save / archive).

**Spec fields note:** a catalogue entry has hard spec fields a source doesn't (range, endurance, payload, speed, price, NATO class). Those are the one genuinely *new* content type the drone card needs — they'd most naturally live as a structured sub-block inside Zone A (or a fourth "specs" zone if they're numerous). This is the main open question for the drone designer: **do the specs fit inside the cogwheel zone, or do they warrant a fourth zone?** The shell supports either; the mockup shows three zones because sources have no spec block.

---

## 6. How to use the mockup alongside this doc

Open `unified-source-card-mockup.html`:
- The **surface toggle** (Intel / New Sources / All Sources) demonstrates the editability model live — watch a zone go EDIT → READ across surfaces.
- The **`··· +N` pills** demonstrate the overflow + grouped popover.
- The **matrix** and **"Same shell, drone database"** panel at the bottom are the reuse summary in visual form.

The ask for the drone project: **assess how much of Section 4's "reusable" list transfers**, write the drone editability matrix (Section 3's shape, drone axes), and resolve the specs-zone question (Section 5). What comes back tells us whether the shell becomes a genuinely shared component across both products or stays a source-only pattern the drone card borrows selectively.
