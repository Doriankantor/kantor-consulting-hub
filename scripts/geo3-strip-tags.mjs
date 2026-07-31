// Geo-3 Step 3 — SOURCE-STRIP of the 10 country-level geography tags from thematic_tags.
// Geography now lives on the axis (subject_countries / mentioned_countries / scalar geography), so the
// flat country tags are redundant and are removed from every source's thematic_tags array.
//
// SOURCE-STRIP ONLY: the known_tags vocab rows for these country tags were already hand-deleted earlier,
// so there are NO vocab deletes here — this script only rewrites the thematic_tags arrays on sources.
//
// Scope: project_board_id = 'board-info-latam' (Contested Skies).
// PRESERVES the sub-geo tags (cauca / catatumbo / rio-de-janeiro) — deferred until sub_geographies has
// a home; they are NOT stripped.
//
// Companion RECORD: sql/2026-07-30-geo3-strip-tags.sql.
//
// Usage:
//   node scripts/geo3-strip-tags.mjs            # DRY RUN — prints the plan, writes NOTHING
//   node scripts/geo3-strip-tags.mjs --commit   # performs the writes
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env in the repo root.
// Idempotent + re-runnable: a source with no country-geo tags is skipped. A second --commit is a no-op.
// Fail-stop: any Supabase error prints and exits non-zero — a partial run is worse than a stopped one.

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
const tag = COMMIT ? '[COMMIT]' : '[DRY-RUN]'

// The 10 COUNTRY-LEVEL geography tags to strip (case-insensitive match).
const STRIP = new Set(['argentina', 'brazil', 'colombia', 'venezuela', 'europe', 'usa', 'china', 'russia', 'ukraine', 'latam'])
// Sub-geo tags explicitly PRESERVED (deferred until sub_geographies is populated). Never stripped.
const PRESERVE_SUBGEO = ['cauca', 'catatumbo', 'rio-de-janeiro']
// The 4 backfilled / at-risk sources whose geography axis must survive the strip (inv3).
const AXIS_IDS = ['csa-rg-02', 'd1ef73a3-1358-4bba-9cef-c0b861ac3196', '75706600-8b14-4e57-b08f-49879e2dc391', '5b1358a1-9a45-406e-a223-d8fd9859cbd9']

console.log(`\n=== Geo-3 Step 3 tag strip — ${COMMIT ? 'COMMIT (writing)' : 'DRY RUN (no writes)'} · board ${BOARD} ===\n`)

// ── helpers ──────────────────────────────────────────────────────────────────
function parseArr(v) {
  if (Array.isArray(v)) return v.map(String)
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : [] } catch { return [] }
}
function die(where, error) {
  console.error(`\n✗ STOPPED at ${where}: ${error.message ?? error}`)
  console.error('  No further writes. Re-run after resolving; the script is idempotent.')
  process.exit(2)
}

// ── read every source on the board ─────────────────────────────────────────────
const { data: rows, error: readErr } = await supabase
  .from('intelligence_sources')
  .select('id,title,thematic_tags,subject_countries,mentioned_countries,geography')
  .eq('project_board_id', BOARD)
if (readErr) die('board read', readErr)
console.log(`Read ${rows?.length ?? 0} sources on ${BOARD}.\n`)

// ── strip loop ─────────────────────────────────────────────────────────────────
console.log('── Strip (removes the 10 country-level tags; preserves sub-geo + all non-geo tags) ──')
let changed = 0
for (const r of (rows ?? [])) {
  const tags = parseArr(r.thematic_tags)
  const stripped = tags.filter(t => STRIP.has(String(t).toLowerCase()))
  if (stripped.length === 0) continue // idempotent no-op

  const kept = tags.filter(t => !STRIP.has(String(t).toLowerCase())) // order preserved

  // ── SAFETY ASSERTION — never orphan a source's geography ──
  // If we're stripping any country tag, the source MUST retain geo signal on the axis
  // (subject/mentioned non-empty) OR a scalar geography. Otherwise STOP (the csa-co-01 guard).
  const hasAxis = parseArr(r.subject_countries).length > 0 || parseArr(r.mentioned_countries).length > 0
  const hasScalar = r.geography != null && String(r.geography).trim() !== ''
  if (!hasAxis && !hasScalar) {
    console.error(`\n✗ ORPHAN GUARD tripped on ${r.id} "${(r.title || '').slice(0, 50)}"`)
    console.error(`  Stripping ${JSON.stringify(stripped)} would remove this source's ONLY geo signal`)
    console.error(`  (subject_countries + mentioned_countries empty AND scalar geography null).`)
    console.error(`  Run the Geo-3 Step 2 backfill for this row FIRST. No writes performed.`)
    process.exit(4)
  }

  console.log(`  ${'─'.repeat(66)}`)
  console.log(`  ${r.id}  "${(r.title || '(no title)').slice(0, 50)}"`)
  console.log(`    guard OK — axis:${hasAxis ? 'yes' : 'no'} scalar:${hasScalar ? JSON.stringify(r.geography) : 'null'}`)
  console.log(`    strip:  ${JSON.stringify(stripped)}`)
  console.log(`    before: ${JSON.stringify(tags)}`)
  console.log(`    ${tag} after:  ${JSON.stringify(kept)}`)

  if (COMMIT) {
    const { error: uErr } = await supabase
      .from('intelligence_sources')
      .update({ thematic_tags: JSON.stringify(kept) })
      .eq('id', r.id)
    if (uErr) die(`update of ${r.id}`, uErr)
  }
  changed++
}
console.log(`\n  ${changed} source(s) ${COMMIT ? 'stripped' : 'would be stripped'}.\n`)

// ── verification (only meaningful after --commit) ──────────────────────────────
console.log('── Verification ──')
if (!COMMIT) {
  console.log('  (dry run — no writes; re-run with --commit, then this re-reads and asserts.)\n')
  console.log('Dry run complete. Review the plan above, then re-run with --commit.')
  process.exit(0)
}

const { data: after, error: vErr } = await supabase
  .from('intelligence_sources')
  .select('id,thematic_tags,subject_countries')
  .eq('project_board_id', BOARD)
if (vErr) die('verification read', vErr)

// inv1 — ZERO sources carry any of the 10 country-level tags.
let inv1 = true
const offenders = []
for (const r of (after ?? [])) {
  const has = parseArr(r.thematic_tags).filter(t => STRIP.has(String(t).toLowerCase()))
  if (has.length) { inv1 = false; offenders.push(`${r.id}=${JSON.stringify(has)}`) }
}
console.log(`  ${inv1 ? '✓' : '✗'} inv1 — zero sources carry any country-level tag${inv1 ? '' : `: ${offenders.join(', ')}`}`)

// inv2 — sub-geo tags cauca/catatumbo/rio-de-janeiro still present (counts unchanged: 4/3/3).
const EXPECT_SUBGEO = { 'cauca': 4, 'catatumbo': 3, 'rio-de-janeiro': 3 }
let inv2 = true
for (const sg of PRESERVE_SUBGEO) {
  const count = (after ?? []).filter(r => parseArr(r.thematic_tags).some(t => String(t).toLowerCase() === sg)).length
  const exp = EXPECT_SUBGEO[sg]
  const ok = count === exp
  if (!ok) inv2 = false
  console.log(`      ${ok ? '✓' : '✗'} ${sg}: ${count} source(s) (expected ${exp})`)
}
console.log(`  ${inv2 ? '✓' : '✗'} inv2 — sub-geo tags preserved (cauca/catatumbo/rio-de-janeiro untouched)`)

// inv3 — the 4 backfilled/at-risk sources still have non-empty subject_countries (geography survived).
const byId = new Map((after ?? []).map(r => [r.id, r]))
let inv3 = true
for (const id of AXIS_IDS) {
  const subj = parseArr(byId.get(id)?.subject_countries)
  if (subj.length === 0) { inv3 = false; console.log(`      ✗ ${id.slice(0, 8)}: subject_countries EMPTY`) }
}
console.log(`  ${inv3 ? '✓' : '✗'} inv3 — 4 backfilled sources still carry non-empty subject_countries`)

const ok = inv1 && inv2 && inv3
console.log(`\n${ok ? '✓ Strip verified — all invariants hold.' : '⚠ Invariant FAILURE — inspect the ✗ checks above.'}`)
process.exit(ok ? 0 : 3)
