// One-shot data migration — "the cull" commit 2: fold the VNSA-actor tag family to
// one canonical winner, drop junk tag `inadequate`, delete the dead known_tags rows.
//
// Scope: project_board_id = 'board-info-latam' (Contested Skies).
// Counts (from the read-only diagnose, 274 sources on the board):
//   losers → violent-non-state-actor:
//     criminal-organizations (2), grupos-armados (8), grupo (1), colombia-grupos-armados (1)
//   1 loser-carrier already has the winner (de-dupe, not append); 0 carry >1 loser.
//   inadequate (2)  — pure drop, no repoint.
//   known_tags DELETE by id: 18 criminal-organizations, 30 grupos-armados, 31 inadequate.
//   csa-co-01 carries ONLY colombia-grupos-armados → folds to [violent-non-state-actor];
//     its geography is set to Colombia so the geography axis isn't lost with the tag.
//   Expected post-state: violent-non-state-actor 5→16, losers→0, inadequate→0.
//
// Companion RECORD: sql/2026-07-30-cull-vnsa-fold.sql (documents what this applied).
//
// Usage:
//   node scripts/cull-vnsa-fold.mjs            # DRY RUN — prints the plan, writes NOTHING
//   node scripts/cull-vnsa-fold.mjs --commit   # performs the writes
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env in the repo root.
// Idempotent + re-runnable: every step checks before writing; a second --commit run is a no-op.
// Fail-stop: any Supabase error prints and exits non-zero — a partial migration is worse than a stopped one.

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import ws from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '..', '.env') })

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

const COMMIT = new Set(process.argv.slice(2)).has('--commit')
const BOARD = 'board-info-latam'
const WINNER = 'violent-non-state-actor'
const LOSERS = ['criminal-organizations', 'grupos-armados', 'grupo', 'colombia-grupos-armados']
const LOSER_SET = new Set(LOSERS)
const INADEQUATE = 'inadequate'
// known_tags rows to delete, each with the name we MUST confirm before deleting (never delete by id blind).
const KNOWN_TAG_DELETES = [
  { id: 18, expect: 'criminal-organizations' },
  { id: 30, expect: 'grupos-armados' },
  { id: 31, expect: INADEQUATE },
]

const tag = COMMIT ? '[COMMIT]' : '[DRY-RUN]'
console.log(`\n=== VNSA fold — ${COMMIT ? 'COMMIT (writing)' : 'DRY RUN (no writes)'} · board ${BOARD} ===\n`)

// ── helpers ──────────────────────────────────────────────────────────────────
function parseArr(v) {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : [] } catch { return [] }
}
function arraysEqual(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]) }
// Fold losers → winner, preserving order, de-duping so an existing winner isn't doubled.
function foldTags(arr) {
  const seen = new Set(), out = []
  for (const t of arr) {
    const mapped = LOSER_SET.has(t) ? WINNER : t
    if (!seen.has(mapped)) { seen.add(mapped); out.push(mapped) }
  }
  return out
}
// Stop the whole migration on any Supabase error (no partial writes).
function die(where, error) {
  console.error(`\n✗ STOPPED at ${where}: ${error.message ?? error}`)
  console.error('  No further steps run. Re-run after resolving; the script is idempotent.')
  process.exit(2)
}

// ── load every board source once (id, thematic_tags, geography) ───────────────
const { data: rows, error: readErr } = await supabase
  .from('intelligence_sources')
  .select('id,thematic_tags,geography')
  .eq('project_board_id', BOARD)
if (readErr) die('initial read of intelligence_sources', readErr)
console.log(`Loaded ${rows.length} sources on ${BOARD}.\n`)

// ── STEP 1 — repoint the loser-carriers ──────────────────────────────────────
console.log('── STEP 1 — fold loser tags → violent-non-state-actor ──')

// Determine the canonical Colombia geography format from a neighbouring CO source (csa-co-01 special case).
let colombiaGeo = 'Colombia'
{
  const { data: coRows, error: coErr } = await supabase
    .from('intelligence_sources')
    .select('geography')
    .eq('project_board_id', BOARD)
    .ilike('geography', 'colombia')
    .limit(1)
  if (coErr) die('lookup of canonical Colombia geography', coErr)
  if (coRows && coRows.length && coRows[0].geography) colombiaGeo = coRows[0].geography
  console.log(`  (canonical Colombia geography format = ${JSON.stringify(colombiaGeo)})`)
}

let step1Changed = 0
for (const r of rows) {
  const orig = parseArr(r.thematic_tags)
  if (!orig.some(t => LOSER_SET.has(t))) continue   // no loser → skip
  const folded = foldTags(orig)

  // csa-co-01 special case: preserve Colombia geography when the tag that encoded it is folded away.
  const update = {}
  let geoNote = ''
  if (r.id === 'csa-co-01') {
    const geoNow = (r.geography ?? '').trim()
    if (!/colombia/i.test(geoNow)) { update.geography = colombiaGeo; geoNote = ` + geography ${JSON.stringify(geoNow || null)} → ${JSON.stringify(colombiaGeo)}` }
    else geoNote = ` (geography already Colombia: ${JSON.stringify(geoNow)} — left as-is)`
  }

  const tagsChanged = !arraysEqual(orig, folded)
  if (!tagsChanged && !update.geography) {
    console.log(`  ${r.id}: already folded, no-op${geoNote}`)
    continue
  }
  if (tagsChanged) update.thematic_tags = JSON.stringify(folded)

  console.log(`  ${tag} ${r.id}: ${JSON.stringify(orig)} → ${JSON.stringify(folded)}${geoNote}`)
  if (COMMIT) {
    const { error } = await supabase.from('intelligence_sources').update(update).eq('id', r.id)
    if (error) die(`STEP 1 update of ${r.id}`, error)
  }
  step1Changed++
}
console.log(`  STEP 1: ${step1Changed} source(s) ${COMMIT ? 'updated' : 'would change'}.\n`)

// ── STEP 2 — strip `inadequate` (pure drop) ──────────────────────────────────
console.log('── STEP 2 — strip `inadequate` from thematic_tags ──')
let step2Changed = 0
for (const r of rows) {
  const orig = parseArr(r.thematic_tags)
  if (!orig.includes(INADEQUATE)) continue
  // Re-fold too, in case this source also carried a loser (STEP 1 would have handled tags, but we
  // re-read from the ORIGINAL row here; apply both folds so the final array is correct in one write).
  const cleaned = foldTags(orig).filter(t => t !== INADEQUATE)
  if (arraysEqual(orig, cleaned)) { console.log(`  ${r.id}: already clean, no-op`); continue }
  console.log(`  ${tag} ${r.id}: ${JSON.stringify(orig)} → ${JSON.stringify(cleaned)}`)
  if (COMMIT) {
    const { error } = await supabase.from('intelligence_sources').update({ thematic_tags: JSON.stringify(cleaned) }).eq('id', r.id)
    if (error) die(`STEP 2 update of ${r.id}`, error)
  }
  step2Changed++
}
console.log(`  STEP 2: ${step2Changed} source(s) ${COMMIT ? 'updated' : 'would change'}.\n`)

// ── STEP 3 — delete dead known_tags rows (name-guarded) ───────────────────────
console.log('── STEP 3 — delete known_tags rows (id + name-guarded) ──')
for (const { id, expect } of KNOWN_TAG_DELETES) {
  const { data: kt, error: ktErr } = await supabase.from('known_tags').select('id,name,type,project_board_id').eq('id', id)
  if (ktErr) die(`STEP 3 read of known_tags id=${id}`, ktErr)
  if (!kt || kt.length === 0) { console.log(`  id=${id} (${expect}): already gone, skip`); continue }
  const row = kt[0]
  if (row.name !== expect) {
    die(`STEP 3 guard for known_tags id=${id}`, { message: `expected name "${expect}" but row is "${row.name}" — refusing to delete by id blind` })
  }
  console.log(`  ${tag} id=${id}: delete "${row.name}" (type=${row.type}, board=${row.project_board_id})`)
  if (COMMIT) {
    const { error } = await supabase.from('known_tags').delete().eq('id', id)
    if (error) die(`STEP 3 delete of known_tags id=${id}`, error)
  }
}
console.log('')

// ── STEP 4 — verification (only meaningful after --commit) ────────────────────
console.log('── STEP 4 — verification ──')
if (!COMMIT) {
  console.log('  (dry run — no writes performed; re-run with --commit, then this re-reads and checks.)\n')
  console.log('Dry run complete. Review the plan above, then re-run with --commit.')
  process.exit(0)
}

// Assert CORRECTNESS INVARIANTS, not an absolute winner count: commit-1's write-time fold
// runs on live traffic, so the winner's absolute count drifts (5→6 already, pre-migration).
// The winner count is printed as INFORMATIONAL only; pass/fail hangs on invariants 1-4.
const { data: after, error: vErr } = await supabase
  .from('intelligence_sources').select('id,thematic_tags').eq('project_board_id', BOARD)
if (vErr) die('STEP 4 verification read', vErr)
let winnerCount = 0
const loserRemaining = {}
for (const l of LOSERS) loserRemaining[l] = 0
let inadequateRemaining = 0
let winnerDupSources = 0
for (const r of after) {
  const th = parseArr(r.thematic_tags)
  const winnerHits = th.filter(t => t === WINNER).length
  if (winnerHits >= 1) winnerCount++
  if (winnerHits > 1) winnerDupSources++
  for (const l of LOSERS) if (th.includes(l)) loserRemaining[l]++
  if (th.includes(INADEQUATE)) inadequateRemaining++
}
const { data: ktLeft, error: ktLeftErr } = await supabase.from('known_tags').select('id').in('id', [18, 30, 31])
if (ktLeftErr) die('STEP 4 known_tags verification', ktLeftErr)

// Informational (not asserted).
console.log(`  ${WINNER} carriers: ${winnerCount}  (informational — absolute count not asserted)`)

// Invariant 1 — no loser tag survives anywhere in thematic_tags.
const losersTotal = LOSERS.reduce((s, l) => s + loserRemaining[l], 0)
const inv1 = losersTotal === 0
console.log(`  ${inv1 ? '✓' : '✗'} inv1 — zero loser tags remaining: ${LOSERS.map(l => `${l}=${loserRemaining[l]}`).join(', ')}`)
// Invariant 2 — inadequate fully dropped.
const inv2 = inadequateRemaining === 0
console.log(`  ${inv2 ? '✓' : '✗'} inv2 — zero 'inadequate' remaining: ${inadequateRemaining}`)
// Invariant 3 — de-dupe held (no source carries the winner more than once).
const inv3 = winnerDupSources === 0
console.log(`  ${inv3 ? '✓' : '✗'} inv3 — no source carries '${WINNER}' more than once: ${winnerDupSources} offending`)
// Invariant 4 — dead known_tags rows gone.
const inv4 = ktLeft.length === 0
console.log(`  ${inv4 ? '✓' : '✗'} inv4 — known_tags 18/30/31 absent: ${ktLeft.length} remaining`)

const ok = inv1 && inv2 && inv3 && inv4
console.log(`\n${ok ? '✓ Migration verified — all invariants hold.' : '⚠ Invariant FAILURE — inspect the ✗ checks above.'}`)
process.exit(ok ? 0 : 3)
