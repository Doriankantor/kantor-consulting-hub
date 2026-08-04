import { cloud } from './client'
import { reportCloudResult } from './connection'
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
async function readTable(table: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await cloud.from(table).select('*')
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
