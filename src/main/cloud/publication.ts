import { cloud } from './client'
import { reportCloudResult, isOnline } from './connection'
import { isBoardVisibleFor } from './boards'
import { setProposalStatus } from './infoPageSources'

// ── publication grid: CLOUD-ONLY read path (P1a) ─────────────────────────────
// The four publication tables (section_texts / cards / section_items /
// section_citations) hold the editable page content, cell = (geography x
// section_key). They were seeded in P0 and are GREENFIELD on the client: no local
// mirror, no read path until now. This module is the read half.
//
// Unlike intel.ts getSources (cloud-first WITH an offline mirror fallback), these
// tables have NO mirror — so this is cloud-ONLY: on a cloud error a table returns
// [] (there is nothing local to fall back to). Never throws; a failed read yields
// an empty-but-shaped grid, same as a non-member read.
//
// ACCESS GATE: the four tables carry no project_board_id column — all publication
// content belongs to the single Contested Skies info-page board. So the gate is
// CHANNEL-WIDE (one membership check for that board), not per-row. Reuses
// isBoardVisibleFor — the same cheap one-shot check the info_page_* read tier
// (slice 0a-3) uses — rather than inventing a new gate.

const CONTESTED_SKIES_BOARD_ID = 'board-info-latam'

// Supplier-axis / extra-regional countries — MIRRORS CellGridTab's SUPPLIER_AXIS_GEOS
// exactly. These are bucketed off the LATAM grid as documented re-index debt, so the
// REGIONAL ("ALL LATAM") incident aggregate must EXCLUDE them (an incident homed to
// China/United States is not a LATAM regional event). Kept in sync with the renderer set.
const SUPPLIER_AXIS_COUNTRIES = [
  'United States', 'China', 'GLOBAL', 'Ukraine', 'Israel', 'Lebanon', 'Syria', 'Turkey', 'Costa Rica',
]

export interface PublicationGrid {
  section_texts: Record<string, unknown>[]
  cards: Record<string, unknown>[]
  section_items: Record<string, unknown>[]
  section_citations: Record<string, unknown>[]
}

const EMPTY_GRID = (): PublicationGrid => ({
  section_texts: [],
  cards: [],
  section_items: [],
  section_citations: [],
})

// One cloud table read: SELECT *, report the cloud result, return rows or [] on
// error. No mirror branch — there is no mirror for these tables.
//
// section_texts is now VERSIONED (P2): an edit inserts a new row and stamps the old
// row's superseded_by, so a cell can hold multiple rows. The grid must see ONE live
// row per cell, so section_texts is filtered to superseded_by IS NULL (the canonical
// "live version" predicate). cards are now VERSIONED too (P3): filtered to active=true
// so a superseded card doesn't double-render its slot. section_items / section_citations
// have no versioning columns yet — they read unfiltered here (P4+).
async function readTable(table: string): Promise<Record<string, unknown>[]> {
  let query = cloud.from(table).select('*')
  if (table === 'section_texts') query = query.is('superseded_by', null)
  if (table === 'cards') query = query.eq('active', true)
  const { data, error } = await query
  reportCloudResult(!error)
  if (error) {
    console.warn(`[publication] cloud read ${table} failed:`, error.message)
    return []
  }
  return (data ?? []) as Record<string, unknown>[]
}

export async function getGrid(actingUserId?: string): Promise<PublicationGrid> {
  // Channel-wide membership gate. Non-member (and non-root) → empty-but-shaped
  // grid; a non-member seeing an empty grid is the correct read behavior, not an error.
  if (!(await isBoardVisibleFor(actingUserId, CONTESTED_SKIES_BOARD_ID))) return EMPTY_GRID()

  const [section_texts, cards, section_items, section_citations] = await Promise.all([
    readTable('section_texts'),
    readTable('cards'),
    readTable('section_items'),
    readTable('section_citations'),
  ])
  return { section_texts, cards, section_items, section_citations }
}

// ── incidents feed: CLOUD-ONLY read path (Slice 3) ───────────────────────────
// Incidents are the "10th container" — a per-GEOGRAPHY feed (peer to the 9 sections,
// but keyed on country, not section_key). The table is cloud-only/unmirrored (Slice 1),
// so this is a cloud-direct read, exactly like getGrid, behind the SAME channel-wide
// board gate. A parallel getter (NOT folded into getGrid) so the feed loads lazily only
// when the Incidents rail entry is opened.
//
// GEOGRAPHY FILTER (matches the grid's geography vocabulary — bare English country
// names / 'REGIONAL', see analyze.ts normalizeIncident):
//   • 'REGIONAL' → AGGREGATE scoped to LATAM: every incident whose country is NOT a
//     supplier-axis/extra-regional country. Incidents homed literally to 'REGIONAL'
//     (genuinely region-wide LATAM events) ARE included — 'REGIONAL' is not in the
//     supplier set. This makes the "ALL LATAM" tab a region-wide feed, not the thin
//     country='REGIONAL'-only bucket.
//   • any country (e.g. 'Colombia') → exact country = geography.
// Ordered event_date desc (newest first). Never throws — a failed read yields [].
export interface IncidentRow {
  id: string
  event_date: string
  country: string
  verification: string | null
  title: string | null
  summary: string | null
  location: string | null
  actor: string | null
  actor_type: string | null
  system: string | null
  casualties: number | null
  source_id: string | null
}

const INCIDENT_COLS =
  'id,event_date,country,verification,title,summary,location,actor,actor_type,system,casualties,source_id'

export async function getIncidents(actingUserId: string | undefined, geography: string): Promise<IncidentRow[]> {
  // Same channel-wide membership gate as getGrid — incidents belong to the same
  // Contested Skies board. Non-member (and non-root) → empty feed, not an error.
  if (!(await isBoardVisibleFor(actingUserId, CONTESTED_SKIES_BOARD_ID))) return []

  let query = cloud.from('incidents').select(INCIDENT_COLS)
  if (geography === 'REGIONAL') {
    // country NOT IN (supplier-axis set). PostgREST `in` needs each value quoted so the
    // multi-word names (e.g. "United States") parse as single list items.
    const inList = `(${SUPPLIER_AXIS_COUNTRIES.map(c => `"${c}"`).join(',')})`
    query = query.not('country', 'in', inList)
  } else {
    query = query.eq('country', geography)
  }
  const { data, error } = await query.order('event_date', { ascending: false })
  reportCloudResult(!error)
  if (error) {
    console.warn('[publication] cloud read incidents failed:', error.message)
    return []
  }
  return (data ?? []) as IncidentRow[]
}

// Slice 4: THIS SOURCE's proposed incident(s) — the by-source read for Pre-Commit Review
// (getIncidents queries by geography for the committed feed; this queries by source_id for
// a single source's proposal). Same board gate. Usually 0 or 1 row — a source describes one
// event and generateIncident dedups by dedup_key — but a regeneration whose analysis changed
// the country/date can leave a 2nd orphan row, so this returns ALL rows (newest first), never
// assumes exactly one. Never throws; failed read → [].
export async function getIncidentBySource(actingUserId: string | undefined, articleId: string): Promise<IncidentRow[]> {
  if (!(await isBoardVisibleFor(actingUserId, CONTESTED_SKIES_BOARD_ID))) return []
  const { data, error } = await cloud.from('incidents')
    .select(INCIDENT_COLS)
    .eq('source_id', articleId)
    .order('event_date', { ascending: false })
  reportCloudResult(!error)
  if (error) {
    console.warn('[publication] cloud read incident by source failed:', error.message)
    return []
  }
  return (data ?? []) as IncidentRow[]
}

// ── publication WRITE path (P2): versioned direct-edit of section_texts ───────
// The FIRST slice that writes publication data, and the first use of the dormant
// versioning columns (version / superseded_by, present since step-1, unused until now).
//
// An edit does NOT overwrite: it INSERTS a new row (version = prev+1) and stamps the
// prior live row's superseded_by → the new id. The "live" row for a cell is the one
// with superseded_by IS NULL (getGrid's readTable filter). Insert-first / supersede-
// second so a failure never loses content — at worst a cell briefly has two live rows,
// which the next write refuses (repair case) rather than compounding.
//
// Cloud has NO cross-row transaction (same caveat as infoPageSources.commitSourceRow),
// hence the deliberate ordering. Cloud-direct, no mirror. Gating is at the IPC layer
// (Head-only, isOwner) — this writer assumes an authorized caller.
export async function writeSection(
  actingUserId: string | undefined,
  cell: { geography: string; section_key: string; lang: string; body: string }
): Promise<{ ok: boolean; error?: string; id?: number }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot edit section text while offline' }

  // find the current live row for this cell (superseded_by IS NULL is canonical)
  const { data: liveRows, error: readErr } = await cloud.from('section_texts')
    .select('id,version')
    .eq('geography', cell.geography).eq('section_key', cell.section_key).eq('lang', cell.lang)
    .is('superseded_by', null)
  if (readErr) return { ok: false, error: `read live row: ${readErr.message}` }

  // >1 null-superseded row = repair case; refuse rather than compound it
  if (liveRows && liveRows.length > 1)
    return { ok: false, error: `cell has ${liveRows.length} live rows (repair needed): ${cell.geography}/${cell.section_key}/${cell.lang}` }

  const prev = (liveRows && liveRows.length === 1) ? liveRows[0] : null
  const nextVersion = prev ? (prev.version + 1) : 1

  // INSERT FIRST — a failure here leaves the old live row intact, no orphan
  const { data: inserted, error: insErr } = await cloud.from('section_texts')
    .insert({
      geography: cell.geography, section_key: cell.section_key, lang: cell.lang,
      body: cell.body, version: nextVersion, updated_by: actingUserId ?? null,
    })
    .select('id').single()
  reportCloudResult(!insErr)
  if (insErr || !inserted) return { ok: false, error: `insert new version: ${insErr?.message ?? 'no row returned'}` }

  // SUPERSEDE SECOND — stamp the old row. If this fails, cell has 2 live rows
  // (the repair case above will catch it next time); content is NOT lost.
  if (prev) {
    const { error: supErr } = await cloud.from('section_texts')
      .update({ superseded_by: inserted.id }).eq('id', prev.id)
    if (supErr) return { ok: false, error: `supersede old row (new row ${inserted.id} written OK): ${supErr.message}` }
  }
  return { ok: true, id: inserted.id }
}

// ── P4a-2b: the ACCEPT FLOW — the first WRITE off the Pre-Commit Review screen ─
// acceptProposal turns a reviewer's "accept this edit" into (1) a versioned section
// write via the EXISTING writeSection (no new write discipline), (2) a Layer-1
// change-record in publication_changes (the before/after audit corpus), and (3) a
// terminal proposal flip so the diff can't be re-accepted and collapses on reload.
//
// FAILURE ORDERING is deliberate: the section write is the only step that must succeed
// (its own insert-first/supersede-second keeps content safe). The change-record and the
// status flip are AUDIT / UI-hygiene — if either fails the PAGE IS STILL CORRECT, so we
// log loudly and still return ok rather than surfacing a scary error for a written edit.
// Gating is at the IPC layer (Head-only) — this assumes an authorized caller.
export async function acceptProposal(
  actingUserId: string | undefined,
  input: {
    article_id: string
    info_page: string
    geography: string
    section_key: string
    before_body: string | null
    after_body: string
    divergence: boolean
    divergence_reasoning: string | null
  }
): Promise<{ ok: boolean; error?: string; section_text_id?: number }> {
  // 1. Versioned write (insert-first/supersede-second). lang locked 'en' to match generation.
  const w = await writeSection(actingUserId, {
    geography: input.geography,
    section_key: input.section_key,
    lang: 'en',
    body: input.after_body
  })
  if (!w.ok) return { ok: false, error: w.error ?? 'writeSection failed' }

  // 2. Change-record. If this insert fails, the section IS already written (versioned,
  //    recoverable) — log loudly but do not fail the accept; the page is correct, only
  //    the audit row is missing. (Explicit error inspection, not a bare catch.)
  const rec = await cloud
    .from('publication_changes')
    .insert({
      article_id: input.article_id,
      info_page: input.info_page,
      section_key: input.section_key,
      geography: input.geography,
      lang: 'en',
      action: 'accept',
      before_body: input.before_body,
      after_body: input.after_body,
      divergence: input.divergence,
      divergence_reasoning: input.divergence_reasoning,
      section_text_id: w.id ?? null,
      accepted_by: actingUserId ?? 'unknown'
    })
  reportCloudResult(!rec.error)
  if (rec.error) {
    console.error('[acceptProposal] change-record insert FAILED (section still written ok):', rec.error.message)
  }

  // 3. Flip the placement's proposal to terminal 'accepted' so it can't be re-accepted
  //    and the diff collapses on reload.
  const flip = await setProposalStatus(input.article_id, input.info_page, input.section_key, input.geography, 'accepted')
  if (!flip.ok) {
    console.error('[acceptProposal] status flip to accepted FAILED (section + record ok):', flip.error)
  }

  return { ok: true, section_text_id: w.id }
}

// Keep original: no section write, no change-record. Just flip the proposal to terminal 'kept'.
export async function keepProposal(
  _actingUserId: string | undefined,
  input: { article_id: string; info_page: string; geography: string; section_key: string }
): Promise<{ ok: boolean; error?: string }> {
  const flip = await setProposalStatus(input.article_id, input.info_page, input.section_key, input.geography, 'kept')
  return flip
}

// ── publication WRITE path (P3): editable cards, 12-slot replace flow ─────────
// The second write slice. Turns on the dormant active / replaced_by columns for
// cards (the analogue of section_texts' version / superseded_by). Slots are
// COUNT-ENFORCED (option A): a cell holds at most 12 ACTIVE cards, `position` is a
// dense 1-based rank for ordering, `slot_kind` stays null (typed slots deferred).
//
// Same discipline as writeSection: online-guard, read the CURRENT active state of
// the cell before writing, INSERT-first / flip-second so a failure never loses a
// card, reportCloudResult on the insert, never throw. Cloud-direct, no mirror.
// Gating is at the IPC layer (Head-only, isOwner) — these assume an authorized caller.

// Read a cell's live (active) cards, ordered by dense position rank. Used by every
// card writer to see the current slot state before mutating (writeSection's live-row
// read, generalized to N cards).
async function activeCardsFor(
  geography: string,
  section_key: string
): Promise<{ rows: { id: number; position: number; headline: string }[]; error: string | null }> {
  const { data, error } = await cloud.from('cards')
    .select('id,position,headline')
    .eq('geography', geography).eq('section_key', section_key).eq('active', true)
    .order('position')
  return { rows: (data ?? []) as { id: number; position: number; headline: string }[], error: error?.message ?? null }
}

// 1a. addCard — append a new card at the next free position. HARD CEILING at 12:
// when the cell is full we do NOT error blindly — we return { full: true } so the UI
// opens the eviction picker (→ replaceCard) instead. No flip: an add only inserts.
export async function addCard(
  actingUserId: string | undefined,
  cell: { geography: string; section_key: string; headline: string; detail?: string; confidence?: string }
): Promise<{ ok: boolean; error?: string; id?: number; full?: boolean }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot add card while offline' }

  const { rows, error: readErr } = await activeCardsFor(cell.geography, cell.section_key)
  if (readErr) return { ok: false, error: `read cell cards: ${readErr}` }

  // 12-slot ceiling. full:true is a signal, not an error — the UI evicts instead.
  if (rows.length >= 12)
    return { ok: false, full: true, error: 'Cell is full (12 cards). Choose a card to replace.' }

  const nextPosition = rows.length ? rows[rows.length - 1].position + 1 : 1
  const { data: inserted, error: insErr } = await cloud.from('cards')
    .insert({
      geography: cell.geography, section_key: cell.section_key,
      headline: cell.headline, detail: cell.detail ?? null, confidence: cell.confidence ?? null,
      position: nextPosition, active: true, updated_by: actingUserId ?? null,
    })
    .select('id').single()
  reportCloudResult(!insErr)
  if (insErr || !inserted) return { ok: false, error: `insert card: ${insErr?.message ?? 'no row returned'}` }
  return { ok: true, id: inserted.id }
}

// 1b. editCard — versioned edit in place. Insert a NEW active card inheriting the
// old card's geography / section_key / position, then flip the old one (active=false,
// replaced_by=new.id). Insert-first: if the insert fails the old card is untouched.
export async function editCard(
  actingUserId: string | undefined,
  edit: { id: number; headline: string; detail?: string; confidence?: string }
): Promise<{ ok: boolean; error?: string; id?: number }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot edit card while offline' }

  const { data: old, error: readErr } = await cloud.from('cards').select('*').eq('id', edit.id).single()
  if (readErr) return { ok: false, error: `read card: ${readErr.message}` }
  if (!old || old.active === false) return { ok: false, error: 'card not found or not active' }

  // INSERT FIRST — same slot (position), old card still live if this fails
  const { data: inserted, error: insErr } = await cloud.from('cards')
    .insert({
      geography: old.geography, section_key: old.section_key, position: old.position,
      headline: edit.headline, detail: edit.detail ?? null, confidence: edit.confidence ?? null,
      active: true, updated_by: actingUserId ?? null,
    })
    .select('id').single()
  reportCloudResult(!insErr)
  if (insErr || !inserted) return { ok: false, error: `insert edited card: ${insErr?.message ?? 'no row returned'}` }

  // FLIP OLD — stamp replaced_by. If this fails the cell briefly shows 2 cards at
  // that position (repair case); content is NOT lost.
  const { error: flipErr } = await cloud.from('cards')
    .update({ active: false, replaced_by: inserted.id }).eq('id', edit.id)
  if (flipErr) return { ok: false, error: `edit: new card written (id ${inserted.id}) but old flip failed: ${flipErr.message}` }
  return { ok: true, id: inserted.id }
}

// 1c. replaceCard — the EVICTION op. Used when the cell is full and the user picked
// which card to evict. Insert the new card at the VICTIM's position, then flip the
// victim (active=false, replaced_by=new.id). Net active count is unchanged: one in,
// one out. Insert-first: if the insert fails the victim is untouched.
export async function replaceCard(
  actingUserId: string | undefined,
  repl: { victimId: number; headline: string; detail?: string; confidence?: string }
): Promise<{ ok: boolean; error?: string; id?: number }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot replace card while offline' }

  const { data: victim, error: readErr } = await cloud.from('cards').select('*').eq('id', repl.victimId).single()
  if (readErr) return { ok: false, error: `read victim card: ${readErr.message}` }
  if (!victim || victim.active === false) return { ok: false, error: 'victim card not found or not active' }

  // INSERT FIRST at the victim's slot — victim still live if this fails
  const { data: inserted, error: insErr } = await cloud.from('cards')
    .insert({
      geography: victim.geography, section_key: victim.section_key, position: victim.position,
      headline: repl.headline, detail: repl.detail ?? null, confidence: repl.confidence ?? null,
      active: true, updated_by: actingUserId ?? null,
    })
    .select('id').single()
  reportCloudResult(!insErr)
  if (insErr || !inserted) return { ok: false, error: `insert replacement card: ${insErr?.message ?? 'no row returned'}` }

  // FLIP VICTIM — evict it. If this fails the cell briefly has 13 cards (repair case).
  const { error: flipErr } = await cloud.from('cards')
    .update({ active: false, replaced_by: inserted.id }).eq('id', repl.victimId)
  if (flipErr) return { ok: false, error: `replace: new card written (id ${inserted.id}) but victim flip failed: ${flipErr.message}` }
  return { ok: true, id: inserted.id }
}

// 1d. deleteCard — SOFT delete, no new row: flip active=false, leave replaced_by
// null (a delete is not a replacement). This leaves a position GAP (delete position
// 3 of 5 → 1,2,4,5). Acceptable for v1: position is a rank for ordering and CardsBox
// sorts by it, so gaps don't break rendering. We deliberately do NOT renumber the
// survivors — that would be N extra writes with no transaction to make them atomic.
export async function deleteCard(
  actingUserId: string | undefined,
  del: { id: number }
): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: 'offline — cannot delete card while offline' }

  const { error: delErr } = await cloud.from('cards')
    .update({ active: false }).eq('id', del.id).eq('active', true)
  reportCloudResult(!delErr)
  if (delErr) return { ok: false, error: `delete card: ${delErr.message}` }
  return { ok: true }
}
