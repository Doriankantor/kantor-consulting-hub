// Geo-3 Step 2 — pure-data axis backfill of the 3 at-risk sources.
// NO AI, no analyzeWithClaude, no Anthropic call: geography is DERIVED from scalar + existing tags
// (all knowable, verified in the read-only diagnose). Fills the empty subject_countries /
// mentioned_countries axis columns via REST so no source loses its geo signal when Step 3 later
// strips the geography tags from thematic_tags.
//
// Scope: project_board_id = 'board-info-latam' (Contested Skies).
// SAFE + additive: only fills EMPTY axis fields (idempotency guard skips any row already backfilled).
// Never touches scalar geography, thematic_tags, or anything else — axis columns only.
//
// Companion RECORD: sql/2026-07-30-geo3-backfill.sql.
//
// Usage:
//   node scripts/geo3-backfill.mjs            # DRY RUN — prints the plan, writes NOTHING
//   node scripts/geo3-backfill.mjs --commit   # performs the writes
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env in the repo root.
// Idempotent + re-runnable: a row with non-empty subject_countries is skipped. A second --commit is a no-op.
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

// Derived backfill values (hardcoded — verified in the diagnose, NOT AI-generated):
//   csa-rg-02  : subject Mexico (scalar) + real text mentions of Colombia/Venezuela/Ukraine.
//   d1ef73a3   : subject Colombia (tag-derived: Tibú / Norte de Santander are Colombian; scalar null).
//   75706600   : subject Romania (scalar/title); mentioned Ukraine/Russia. Marginal European story on
//                a LATAM board — backfilled per decision so a later strip loses nothing.
const BACKFILL = [
  { id: 'csa-rg-02',                              subject: ['Mexico'],   mentioned: ['Colombia', 'Venezuela', 'Ukraine'] },
  { id: 'd1ef73a3-1358-4bba-9cef-c0b861ac3196',   subject: ['Colombia'], mentioned: [] },
  { id: '75706600-8b14-4e57-b08f-49879e2dc391',   subject: ['Romania'],  mentioned: ['Ukraine', 'Russia'] },
]
// Sanity-only (already done — assert, never write):
const ALREADY_DONE = { id: '5b1358a1-9a45-406e-a223-d8fd9859cbd9', expectSubject: ['Bolivia'] }
const ALL_IDS = [...BACKFILL.map(b => b.id), ALREADY_DONE.id]

const tag = COMMIT ? '[COMMIT]' : '[DRY-RUN]'
console.log(`\n=== Geo-3 axis backfill — ${COMMIT ? 'COMMIT (writing)' : 'DRY RUN (no writes)'} · board ${BOARD} ===\n`)

// ── helpers ──────────────────────────────────────────────────────────────────
function parseArr(v) {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : [] } catch { return [] }
}
function arraysEqual(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]) }
function die(where, error) {
  console.error(`\n✗ STOPPED at ${where}: ${error.message ?? error}`)
  console.error('  No further writes. Re-run after resolving; the script is idempotent.')
  process.exit(2)
}

// ── PRE-SNAPSHOT — capture thematic_tags for all 4 ids so inv3 can prove they were untouched ──
const preSnap = {}
{
  const { data, error } = await supabase
    .from('intelligence_sources').select('id,thematic_tags').in('id', ALL_IDS)
  if (error) die('pre-snapshot read', error)
  for (const r of (data ?? [])) preSnap[r.id] = r.thematic_tags ?? null
}

// ── backfill the 3 ────────────────────────────────────────────────────────────
console.log('── Backfill (fills EMPTY axis fields only) ──')
let written = 0
for (const b of BACKFILL) {
  const { data, error } = await supabase
    .from('intelligence_sources')
    .select('id,title,subject_countries,mentioned_countries,geography')
    .eq('id', b.id).maybeSingle()
  if (error) die(`read of ${b.id}`, error)
  if (!data) { console.log(`  ${b.id}: NOT FOUND in cloud — skip`); continue }

  const curSubject = parseArr(data.subject_countries)
  const curMentioned = parseArr(data.mentioned_countries)
  console.log(`  ${'─'.repeat(66)}`)
  console.log(`  ${b.id}  "${(data.title || '(no title)').slice(0, 50)}"`)
  console.log(`    scalar geography: ${JSON.stringify(data.geography)}`)

  // IDEMPOTENCY GUARD — never overwrite a row that already has a subject.
  if (curSubject.length > 0) {
    console.log(`    already backfilled (subject=${JSON.stringify(curSubject)}) — SKIP`)
    continue
  }

  console.log(`    before: subject=${JSON.stringify(curSubject)} mentioned=${JSON.stringify(curMentioned)}`)
  console.log(`    ${tag} after:  subject=${JSON.stringify(b.subject)} mentioned=${JSON.stringify(b.mentioned)}`)
  if (COMMIT) {
    const { error: uErr } = await supabase.from('intelligence_sources').update({
      subject_countries: JSON.stringify(b.subject),
      mentioned_countries: JSON.stringify(b.mentioned),
    }).eq('id', b.id)
    if (uErr) die(`update of ${b.id}`, uErr)
  }
  written++
}
console.log(`\n  ${written} row(s) ${COMMIT ? 'written' : 'would be written'}.\n`)

// ── sanity: 5b1358a1 already done ─────────────────────────────────────────────
console.log('── Sanity: 5b1358a1 (expect already backfilled, no write) ──')
{
  const { data, error } = await supabase
    .from('intelligence_sources').select('id,subject_countries').eq('id', ALREADY_DONE.id).maybeSingle()
  if (error) die('sanity read of 5b1358a1', error)
  const subj = parseArr(data?.subject_countries)
  if (subj.length && arraysEqual(subj, ALREADY_DONE.expectSubject)) {
    console.log(`  ✓ already backfilled (subject=${JSON.stringify(subj)}), skip — as expected`)
  } else {
    console.log(`  ⚠ UNEXPECTED: 5b1358a1 subject=${JSON.stringify(subj)} (expected ${JSON.stringify(ALREADY_DONE.expectSubject)})`)
  }
}

// ── verification (only meaningful after --commit) ─────────────────────────────
console.log('\n── Verification ──')
if (!COMMIT) {
  console.log('  (dry run — no writes; re-run with --commit, then this re-reads and asserts.)\n')
  console.log('Dry run complete. Review the plan above, then re-run with --commit.')
  process.exit(0)
}

const { data: after, error: vErr } = await supabase
  .from('intelligence_sources').select('id,subject_countries,thematic_tags').in('id', ALL_IDS)
if (vErr) die('verification read', vErr)
const byId = new Map((after ?? []).map(r => [r.id, r]))

const EXPECT_SUBJECT = {
  'csa-rg-02': ['Mexico'],
  'd1ef73a3-1358-4bba-9cef-c0b861ac3196': ['Colombia'],
  '75706600-8b14-4e57-b08f-49879e2dc391': ['Romania'],
  '5b1358a1-9a45-406e-a223-d8fd9859cbd9': ['Bolivia'],
}

// inv1 — all 4 have non-empty subject_countries.
const inv1 = ALL_IDS.every(id => parseArr(byId.get(id)?.subject_countries).length > 0)
console.log(`  ${inv1 ? '✓' : '✗'} inv1 — all 4 have non-empty subject_countries: ${ALL_IDS.map(id => `${id.slice(0, 8)}=${parseArr(byId.get(id)?.subject_countries).length}`).join(', ')}`)
// inv2 — exact subject values.
let inv2 = true
for (const [id, exp] of Object.entries(EXPECT_SUBJECT)) {
  const got = parseArr(byId.get(id)?.subject_countries)
  if (!arraysEqual(got, exp)) { inv2 = false; console.log(`      ✗ ${id.slice(0, 8)}: got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`) }
}
console.log(`  ${inv2 ? '✓' : '✗'} inv2 — exact subject values (Mexico/Colombia/Romania/Bolivia)`)
// inv3 — thematic_tags UNCHANGED vs pre-snapshot (geo tags must still be present; Step 3 strips them).
let inv3 = true
for (const id of ALL_IDS) {
  const before = preSnap[id] ?? null
  const now = byId.get(id)?.thematic_tags ?? null
  if (before !== now) { inv3 = false; console.log(`      ✗ ${id.slice(0, 8)}: thematic_tags changed (${JSON.stringify(before)} → ${JSON.stringify(now)})`) }
}
console.log(`  ${inv3 ? '✓' : '✗'} inv3 — no thematic_tags modified (geo tags still present for Step 3)`)

const ok = inv1 && inv2 && inv3
console.log(`\n${ok ? '✓ Backfill verified — all invariants hold.' : '⚠ Invariant FAILURE — inspect the ✗ checks above.'}`)
process.exit(ok ? 0 : 3)
