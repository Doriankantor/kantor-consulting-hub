import { cloud } from './client'
import { reportCloudResult, isOnline } from './connection'
import { isBoardVisibleFor } from './boards'

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
// "live version" predicate). The other three tables have no superseded_by column —
// they read unfiltered here (cards get their active/replaced_by filter in P3).
async function readTable(table: string): Promise<Record<string, unknown>[]> {
  let query = cloud.from(table).select('*')
  if (table === 'section_texts') query = query.is('superseded_by', null)
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
