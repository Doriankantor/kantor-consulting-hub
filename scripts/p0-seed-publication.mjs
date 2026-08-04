// P0 publication seed — import the Cowork export into the step-1 publication tables.
//
// CLOUD-ONLY: nothing reads the mirror for these tables yet (greenfield). This seeds
// Supabase directly; no local sqlite write.
//
// Targets four tables (all created empty in step-1 + the 2026-08-04 additive migration):
//   section_texts     ← cell.narrative        (one row per non-empty narrative)
//   cards             ← cell.cards[]          (one row per figure card)
//   section_items     ← cell.outline[].items  (FLATTENED — one row per outline item)
//   section_citations ← cell.citations[]      (one row per citation)
//
// INPUT: scripts/data/contested-skies-cells-full.json — array of cells:
//   { geography, section, narrative?, cards?[{headline,detail}],
//     outline?[{heading, items:[{label,detail,status,operator,origin,conf, + section-specific}]}],
//     citations?[{what,where}] }
//
// MAPPING NOTE: the JSON uses `section`; the tables use `section_key` (historical naming —
//   info_page_sources uses `section`, but section_texts/cards/section_items/section_citations
//   all use `section_key`; same nine values). geography is carried verbatim from the cell.
//
// Usage:
//   node scripts/p0-seed-publication.mjs            # DRY RUN — prints planned counts, writes NOTHING
//   node scripts/p0-seed-publication.mjs --commit   # clears the four tables, then inserts
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env in the repo root.
// Idempotent + re-runnable: --commit first CLEARS all four tables (they have this one seed
//   as their only source), then re-inserts — a second --commit run reproduces the same state.
// Fail-stop: any Supabase error prints and exits non-zero — a partial seed is worse than a stopped one.

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import ws from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '..', '.env') })

const COMMIT = process.argv.includes('--commit')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

// ── locate the input file ────────────────────────────────────────────────────
// Canonical path is scripts/data/. Fall back to the actual on-disk location
// (a capital-D / trailing-space "Data " dir from a Finder drag) so the seed runs
// today; logs which file it loaded either way.
const INPUT_CANDIDATES = [
  resolve(__dirname, 'data', 'contested-skies-cells-full.json'),
  resolve(__dirname, 'Data ', 'contested-skies-cells-full.json'),
]
const inputPath = INPUT_CANDIDATES.find(p => existsSync(p))
if (!inputPath) {
  console.error('Input file not found. Looked in:\n  ' + INPUT_CANDIDATES.join('\n  '))
  process.exit(1)
}

const cells = JSON.parse(readFileSync(inputPath, 'utf8'))
if (!Array.isArray(cells)) {
  console.error('Expected the export to be an array of cells; got ' + typeof cells)
  process.exit(1)
}

// ── build the four row sets ──────────────────────────────────────────────────
// Outline items promote a fixed common set to columns; every OTHER field on the
// item lands in attrs jsonb (the "don't drop any field" decision). heading comes
// from the group, not the item.
const ITEM_PROMOTED = new Set(['label', 'detail', 'status', 'operator', 'origin', 'conf'])

const sectionTexts = []
const cardRows = []
const sectionItems = []
const sectionCitations = []

for (const cell of cells) {
  const geography = cell.geography
  const section_key = cell.section

  // 1. narrative → section_texts
  if (cell.narrative && String(cell.narrative).trim().length > 0) {
    sectionTexts.push({ geography, section_key, body: cell.narrative, lang: 'en', version: 1 })
  }

  // 2. cards[] → cards (position 1-based by array index)
  ;(cell.cards || []).forEach((card, i) => {
    cardRows.push({
      geography,
      section_key,
      headline: card.headline ?? '',
      detail: card.detail ?? null,
      confidence: card.conf ?? null,
      position: i + 1,
      active: true,
    })
  })

  // 3. outline[] (grouped) → section_items (FLATTENED, per-cell running position)
  let itemPos = 0
  for (const group of (cell.outline || [])) {
    for (const item of (group.items || [])) {
      itemPos += 1
      const attrs = {}
      for (const [k, v] of Object.entries(item)) {
        if (!ITEM_PROMOTED.has(k)) attrs[k] = v
      }
      sectionItems.push({
        geography,
        section_key,
        heading: group.heading ?? null,
        label: item.label ?? '',
        detail: item.detail ?? null,
        status: item.status ?? null,
        operator: item.operator ?? null,
        origin: item.origin ?? null,
        conf: item.conf ?? null,
        attrs: Object.keys(attrs).length ? attrs : null,
        position: itemPos,
        active: true,
      })
    }
  }

  // 4. citations[] → section_citations (position 1-based; JSON 'where' → column 'where_ref')
  ;(cell.citations || []).forEach((cit, i) => {
    sectionCitations.push({
      geography,
      section_key,
      what: cit.what ?? null,
      where_ref: cit.where ?? null,
      position: i + 1,
    })
  })
}

// ── expected invariants (self-derived from the export) ───────────────────────
const expected = {
  section_texts: sectionTexts.length,
  cards: cardRows.length,
  section_items: sectionItems.length,
  section_citations: sectionCitations.length,
}
const itemsWithAttrs = sectionItems.filter(r => r.attrs).length

console.log(`\nP0 publication seed — ${COMMIT ? 'COMMIT' : 'DRY RUN'}`)
console.log(`Input: ${inputPath}`)
console.log(`Cells: ${cells.length}\n`)
console.log('Rows that WOULD insert:')
console.log(`  section_texts     : ${expected.section_texts}   (cells with non-empty narrative)`)
console.log(`  cards             : ${expected.cards}   (sum of cards[] across cells)`)
console.log(`  section_items     : ${expected.section_items}   (flattened outline items; ${itemsWithAttrs} carry attrs)`)
console.log(`  section_citations : ${expected.section_citations}   (sum of citations[])`)

// ── helpers ──────────────────────────────────────────────────────────────────
function die(where, error) {
  console.error(`\nFAILED at ${where}: ${error.message || JSON.stringify(error)}`)
  process.exit(1)
}

async function clearTable(table) {
  // uuid & bigint PKs both: id is never null → matches every row.
  const { error } = await supabase.from(table).delete().not('id', 'is', null)
  if (error) die(`clear ${table}`, error)
  console.log(`  cleared ${table}`)
}

async function insertChunked(table, rows) {
  const CHUNK = 200
  let done = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from(table).insert(slice)
    if (error) die(`insert ${table} [rows ${i}..${i + slice.length - 1}]`, error)
    done += slice.length
  }
  console.log(`  inserted ${done} into ${table}`)
}

async function count(table) {
  const { count: c, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) die(`count ${table}`, error)
  return c
}

// ── dry run stops here ───────────────────────────────────────────────────────
if (!COMMIT) {
  console.log('\nDRY RUN — no rows written. Sample planned rows:')
  console.log('  section_texts[0]:', JSON.stringify(sectionTexts[0]))
  console.log('  cards[0]:', JSON.stringify(cardRows[0]))
  console.log('  section_items (first with attrs):', JSON.stringify(sectionItems.find(r => r.attrs)))
  console.log('  section_citations[0]:', JSON.stringify(sectionCitations[0]))
  console.log('\nRe-run with --commit to clear + insert.')
  process.exit(0)
}

// ── commit: clear then insert ────────────────────────────────────────────────
console.log('\nClearing the four tables (only this seed populates them)…')
await clearTable('section_citations')
await clearTable('section_items')
await clearTable('cards')
await clearTable('section_texts')

console.log('\nInserting…')
await insertChunked('section_texts', sectionTexts)
await insertChunked('cards', cardRows)
await insertChunked('section_items', sectionItems)
await insertChunked('section_citations', sectionCitations)

// ── verification: re-count + assert invariants ───────────────────────────────
console.log('\nVerifying invariants (expected vs actual)…')
// Two independent verdicts: countsOk is HARD (row-count mismatch = data loss → exit 1);
// spotOk is SOFT (a witness assertion missed but the counts are fine → exit 2). Keeping
// them separate makes a real integrity failure distinguishable from a cosmetic spot-check miss.
let countsOk = true
let spotOk = true
for (const table of ['section_texts', 'cards', 'section_items', 'section_citations']) {
  const actual = await count(table)
  const exp = expected[table]
  const pass = actual === exp
  countsOk = countsOk && pass
  console.log(`  ${pass ? 'OK ' : 'MISMATCH'} ${table}: expected ${exp}, actual ${actual}`)
}

// spot-check A: REGIONAL/systems has a narrative
{
  const { data, error } = await supabase
    .from('section_texts')
    .select('geography,section_key,body')
    .eq('geography', 'REGIONAL').eq('section_key', 'systems').limit(1)
  if (error) die('spot-check REGIONAL/systems narrative', error)
  const has = data && data.length && data[0].body && data[0].body.trim().length > 0
  spotOk = spotOk && has
  console.log(`  ${has ? 'OK ' : 'MISMATCH'} spot-check: REGIONAL/systems narrative present`)
}

// spot-check B: a known multi-item outline cell has items with attrs populated.
// REGIONAL/external carries {supplier,channel} on multiple rows (REGIONAL/systems has 0
// attrs items — a false witness — so this targets external instead).
{
  const { data, error } = await supabase
    .from('section_items')
    .select('geography,section_key,label,attrs')
    .eq('geography', 'REGIONAL').eq('section_key', 'external')
  if (error) die('spot-check REGIONAL/external outline attrs', error)
  const withAttrs = (data || []).filter(r => r.attrs && Object.keys(r.attrs).length > 0).length
  const has = (data || []).length > 1 && withAttrs > 0
  spotOk = spotOk && has
  console.log(`  ${has ? 'OK ' : 'MISMATCH'} spot-check: REGIONAL/external has ${data ? data.length : 0} outline items, ${withAttrs} with attrs`)
}

if (!countsOk) {
  console.error('\nCOUNT INVARIANT FAILED — data integrity mismatch. See counts above.')
  process.exit(1)   // hard: real data loss
}
if (!spotOk) {
  console.error('\nSPOT-CHECK FAILED — counts are OK but a witness assertion missed. Cosmetic/witness issue, not data loss. See spot-check lines above.')
  process.exit(2)   // soft: distinguishable from a count failure
}
console.log('\nAll invariants + spot-checks passed.')
process.exit(0)
