// A1.5 — scalar `geography` -> `subject_countries` backfill.
// Promotes the AI's freeform scalar `geography` (rendered today only as a dead-end fallback pill in
// the picker) into REAL subject_countries[] chips, so the geography picker treats them as first-class
// selections. Pure data: geography is PARSED from the existing scalar string and RESOLVED against the
// country vocabulary -- no AI, no Anthropic call.
//
// Pattern cloned from scripts/geo3-backfill.mjs EXACTLY:
//   - env loading (.env in repo root), supabase client with SERVICE_ROLE key
//   - DRY RUN by default (prints the full plan, writes NOTHING); --commit to write
//   - idempotency guard: only rows with EMPTY subject_countries AND non-empty scalar AND a parse that
//     yields >=1 resolved country; never touches the rows that already have subject_countries
//   - cloud-direct write (mirror self-heals on the next app read via getSources' mirrorUpsertRows --
//     do NOT write the local mirror directly; that's the desync trap)
//   - fail-stop on any Supabase error; post-commit verify
//
// Usage:
//   node scripts/geo-scalar-backfill.mjs            # DRY RUN — prints the plan, writes NOTHING
//   node scripts/geo-scalar-backfill.mjs --commit   # performs the writes, then verifies
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

const argv = new Set(process.argv.slice(2))
const COMMIT = argv.has('--commit')
const LATAM_ONLY = argv.has('--latam-only')   // pass 1: only LATAM-region + REGIONAL-sentinel rows
const tag = COMMIT ? '[COMMIT]' : '[DRY-RUN]'
const passLabel = LATAM_ONLY ? 'PASS 1 (LATAM-only)' : 'PASS 2 (full / all remaining)'

// ============================================================================
// THE RESOLVER — replicated VERBATIM (in behavior) from src/main/geography.ts.
// That file is the SOURCE OF TRUTH; main-bundle TS can't be imported from a .mjs
// script, so the map/aliases/normalizer are copied here. **If COUNTRY_TO_REGION or
// COUNTRY_ALIASES changes in geography.ts, update this copy by hand.** (Last synced
// 2026-08-10 against the 197-country / 9-region map.)
// ============================================================================

// Minimal MATCH-normalization: trim, collapse internal whitespace, title-case each
// whitespace-separated word. Deliberately dumb (see geography.ts) so irregular keys
// like "Cote D'ivoire" / "Guinea-bissau" match exactly.
function normalizeCountry(raw) {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ')
}

// Canonical country -> region (copied from geography.ts COUNTRY_TO_REGION). We only
// need the KEYS here (membership = "is a real country"), but the full map is kept so
// this stays a faithful mirror that's trivial to diff against the source.
const COUNTRY_TO_REGION = {
  // ---- LATAM ----
  Mexico: 'LATAM', Guatemala: 'LATAM', Belize: 'LATAM', Honduras: 'LATAM', 'El Salvador': 'LATAM',
  Nicaragua: 'LATAM', 'Costa Rica': 'LATAM', Panama: 'LATAM', Cuba: 'LATAM', Haiti: 'LATAM',
  'Dominican Republic': 'LATAM', Jamaica: 'LATAM', 'Trinidad And Tobago': 'LATAM', Bahamas: 'LATAM',
  Barbados: 'LATAM', 'Saint Lucia': 'LATAM', Grenada: 'LATAM', 'Saint Vincent And The Grenadines': 'LATAM',
  'Antigua And Barbuda': 'LATAM', 'Saint Kitts And Nevis': 'LATAM', Dominica: 'LATAM', Colombia: 'LATAM',
  Venezuela: 'LATAM', Ecuador: 'LATAM', Peru: 'LATAM', Bolivia: 'LATAM', Brazil: 'LATAM',
  Paraguay: 'LATAM', Uruguay: 'LATAM', Argentina: 'LATAM', Chile: 'LATAM', Guyana: 'LATAM',
  Suriname: 'LATAM',
  // ---- NORTH AMERICA ----
  'United States': 'North America', Canada: 'North America',
  // ---- EUROPE ----
  Austria: 'Europe', Belgium: 'Europe', Bulgaria: 'Europe', Croatia: 'Europe', Cyprus: 'Europe',
  Czechia: 'Europe', Denmark: 'Europe', Estonia: 'Europe', Finland: 'Europe', France: 'Europe',
  Germany: 'Europe', Greece: 'Europe', Hungary: 'Europe', Ireland: 'Europe', Italy: 'Europe',
  Latvia: 'Europe', Lithuania: 'Europe', Luxembourg: 'Europe', Malta: 'Europe', Netherlands: 'Europe',
  Poland: 'Europe', Portugal: 'Europe', Romania: 'Europe', Slovakia: 'Europe', Slovenia: 'Europe',
  Spain: 'Europe', Sweden: 'Europe', 'United Kingdom': 'Europe', Norway: 'Europe', Switzerland: 'Europe',
  Iceland: 'Europe', Serbia: 'Europe', 'Bosnia And Herzegovina': 'Europe', 'North Macedonia': 'Europe',
  Albania: 'Europe', Montenegro: 'Europe', Kosovo: 'Europe', Ukraine: 'Europe', Belarus: 'Europe',
  Moldova: 'Europe', Liechtenstein: 'Europe', Monaco: 'Europe', Andorra: 'Europe', 'San Marino': 'Europe',
  'Vatican City': 'Europe',
  // ---- RUSSIA (standalone) ----
  Russia: 'Russia',
  // ---- MENA ----
  Turkey: 'MENA', Egypt: 'MENA', Israel: 'MENA', Palestine: 'MENA', Jordan: 'MENA', Lebanon: 'MENA',
  Syria: 'MENA', Iraq: 'MENA', Iran: 'MENA', 'Saudi Arabia': 'MENA', Yemen: 'MENA', Oman: 'MENA',
  'United Arab Emirates': 'MENA', Qatar: 'MENA', Bahrain: 'MENA', Kuwait: 'MENA', Libya: 'MENA',
  Tunisia: 'MENA', Algeria: 'MENA', Morocco: 'MENA', Sudan: 'MENA', Mauritania: 'MENA', Georgia: 'MENA',
  Armenia: 'MENA', Azerbaijan: 'MENA',
  // ---- SUB-SAHARAN AFRICA ----
  Nigeria: 'Sub-Saharan Africa', Ethiopia: 'Sub-Saharan Africa', Kenya: 'Sub-Saharan Africa',
  'South Africa': 'Sub-Saharan Africa', Ghana: 'Sub-Saharan Africa', "Cote D'ivoire": 'Sub-Saharan Africa',
  Chad: 'Sub-Saharan Africa', Mali: 'Sub-Saharan Africa', Niger: 'Sub-Saharan Africa',
  Senegal: 'Sub-Saharan Africa', Somalia: 'Sub-Saharan Africa',
  'Democratic Republic Of The Congo': 'Sub-Saharan Africa', Uganda: 'Sub-Saharan Africa',
  Tanzania: 'Sub-Saharan Africa', Angola: 'Sub-Saharan Africa', Mozambique: 'Sub-Saharan Africa',
  Zambia: 'Sub-Saharan Africa', Zimbabwe: 'Sub-Saharan Africa', Cameroon: 'Sub-Saharan Africa',
  'Burkina Faso': 'Sub-Saharan Africa', Benin: 'Sub-Saharan Africa', Togo: 'Sub-Saharan Africa',
  Guinea: 'Sub-Saharan Africa', 'Guinea-bissau': 'Sub-Saharan Africa', 'Sierra Leone': 'Sub-Saharan Africa',
  Liberia: 'Sub-Saharan Africa', Gambia: 'Sub-Saharan Africa', Mauritius: 'Sub-Saharan Africa',
  Madagascar: 'Sub-Saharan Africa', Malawi: 'Sub-Saharan Africa', Rwanda: 'Sub-Saharan Africa',
  Burundi: 'Sub-Saharan Africa', 'South Sudan': 'Sub-Saharan Africa', Eritrea: 'Sub-Saharan Africa',
  Djibouti: 'Sub-Saharan Africa', 'Central African Republic': 'Sub-Saharan Africa',
  'Republic Of The Congo': 'Sub-Saharan Africa', Gabon: 'Sub-Saharan Africa',
  'Equatorial Guinea': 'Sub-Saharan Africa', Botswana: 'Sub-Saharan Africa', Namibia: 'Sub-Saharan Africa',
  Lesotho: 'Sub-Saharan Africa', Eswatini: 'Sub-Saharan Africa', Comoros: 'Sub-Saharan Africa',
  Seychelles: 'Sub-Saharan Africa', 'Cape Verde': 'Sub-Saharan Africa',
  'Sao Tome And Principe': 'Sub-Saharan Africa',
  // ---- ASIA ----
  China: 'Asia', Japan: 'Asia', 'South Korea': 'Asia', 'North Korea': 'Asia', Taiwan: 'Asia',
  Mongolia: 'Asia', India: 'Asia', Pakistan: 'Asia', Afghanistan: 'Asia', Bangladesh: 'Asia',
  'Sri Lanka': 'Asia', Nepal: 'Asia', Bhutan: 'Asia', Maldives: 'Asia', Myanmar: 'Asia',
  Thailand: 'Asia', Vietnam: 'Asia', Cambodia: 'Asia', Laos: 'Asia', Malaysia: 'Asia',
  Singapore: 'Asia', Indonesia: 'Asia', Philippines: 'Asia', Brunei: 'Asia', 'Timor-leste': 'Asia',
  Kazakhstan: 'Asia', Uzbekistan: 'Asia', Turkmenistan: 'Asia', Kyrgyzstan: 'Asia', Tajikistan: 'Asia',
  // ---- OCEANIA ----
  Australia: 'Oceania', 'New Zealand': 'Oceania', 'Papua New Guinea': 'Oceania', Fiji: 'Oceania',
  'Solomon Islands': 'Oceania', Vanuatu: 'Oceania', Samoa: 'Oceania', Tonga: 'Oceania',
  Kiribati: 'Oceania', Micronesia: 'Oceania', 'Marshall Islands': 'Oceania', Palau: 'Oceania',
  Nauru: 'Oceania', Tuvalu: 'Oceania',
}

// Alias map (copied from geography.ts COUNTRY_ALIASES). Keys are in normalizeCountry() form.
const COUNTRY_ALIASES = {
  Usa: 'United States', Us: 'United States', 'United States Of America': 'United States',
  America: 'United States',
  Uk: 'United Kingdom', Britain: 'United Kingdom', 'Great Britain': 'United Kingdom',
  Uae: 'United Arab Emirates', Turkiye: 'Turkey', 'Palestinian Territories': 'Palestine',
  'Czech Republic': 'Czechia', Macedonia: 'North Macedonia', 'Holy See': 'Vatican City',
  Vatican: 'Vatican City', 'Russian Federation': 'Russia',
  'Ivory Coast': "Cote D'ivoire", Drc: 'Democratic Republic Of The Congo',
  'Dr Congo': 'Democratic Republic Of The Congo', Congo: 'Republic Of The Congo',
  'The Gambia': 'Gambia', Swaziland: 'Eswatini', 'Cabo Verde': 'Cape Verde',
  Burma: 'Myanmar', 'East Timor': 'Timor-leste', 'Republic Of Korea': 'South Korea', Dprk: 'North Korea',
  // SCRIPT-LOCAL (not in geography.ts): the AI scalar sometimes writes "Gaza" for the territory.
  Gaza: 'Palestine',
}

// Resolve ONE fragment to a canonical country name OR a valid sentinel, or null on a miss.
//   - "GLOBAL" (any case)  -> 'GLOBAL'   sentinel  (kept)
//   - "LATAM"  (any case)  -> 'REGIONAL' sentinel  (kept; storage stays 'REGIONAL' per the
//                             deferred REGIONAL->LATAM rename -- display maps it to "LATAM")
//   - a canonical country / alias -> the canonical country name (kept)
//   - everything else (bare region-words like "Eastern Europe"/"Caribbean", sub-areas, hedges)
//     -> null -> DROPPED by the parser.
// 'GLOBAL'/'REGIONAL' are first-class OUTPUT values: dedupe treats them like any other kept
// value and they are NEVER re-run through the country map.
function resolveCountry(fragment) {
  const sentinel = fragment.trim().toUpperCase()
  if (sentinel === 'GLOBAL') return 'GLOBAL'
  if (sentinel === 'LATAM') return 'REGIONAL'
  const norm = normalizeCountry(fragment)
  const canonical = COUNTRY_ALIASES[norm] ?? norm
  return COUNTRY_TO_REGION[canonical] !== undefined ? canonical : null
}

// A resolved value is "LATAM-scope" if it is the REGIONAL sentinel or a LATAM-region country.
// (The GLOBAL sentinel is NOT LATAM-scope -> such a row defers to pass 2.)
function isLatamScopeValue(v) {
  return v === 'REGIONAL' || COUNTRY_TO_REGION[v] === 'LATAM'
}
function isLatamOnlyRow(kept) {
  return kept.length > 0 && kept.every(isLatamScopeValue)
}

// ============================================================================
// THE PARSER (locked decisions)
//   1. STRIP PARENTHETICALS entirely before splitting ("Brazil (Sao Paulo)" -> "Brazil";
//      paren contents are NOT promoted to sub-areas).
//   2. SPLIT on "/" ONLY (optional surrounding whitespace). Never on , ; & "and" "or".
//   3. Resolve each WHOLE fragment; keep canonical countries, DROP everything else.
//   4. DEDUPE, preserving order.
//   CRITICAL (hedge trap): whole-fragment resolution ONLY, never substring-scan. So
//   "likely Mexico or Colombia (based on ...)" -> strip parens -> one fragment
//   "likely Mexico or Colombia" -> title-cased whole string -> UNMAPPED -> DROPPED -> [].
// ============================================================================
function parseScalar(raw) {
  const noParens = raw.replace(/\([^)]*\)/g, ' ')
  const fragments = noParens.split('/').map((f) => f.trim()).filter((f) => f.length > 0)
  const kept = []
  const seen = new Set()
  for (const f of fragments) {
    const c = resolveCountry(f)
    if (c && !seen.has(c)) { seen.add(c); kept.push(c) }
  }
  return { fragments, kept }
}

// Eyeball label for the dry-run (purely descriptive; does not affect the write).
function bucketLabel(raw, fragments, kept) {
  if (kept.length === 0) return 'hedge-unresolved'
  if (/\(/.test(raw)) return 'paren'
  if (kept.length >= 2) return 'multi'
  if (fragments.length >= 2) return 'country+region'
  return 'clean'
}

// ── helpers (mirrors geo3-backfill.mjs) ────────────────────────────────────────
function parseArr(v) {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : [] } catch { return [] }
}
function arraysEqual(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]) }
function die(where, error) {
  console.error(`\n✗ STOPPED at ${where}: ${error.message ?? error}`)
  console.error('  No further writes. Re-run after resolving; the script is idempotent.')
  process.exit(2)
}

console.log(`\n=== A1.5 scalar geography -> subject_countries backfill — ${COMMIT ? 'COMMIT (writing)' : 'DRY RUN (no writes)'} · ${passLabel} ===`)
console.log(`  (sentinel outputs 'REGIONAL' [displays as "LATAM"] and 'GLOBAL' are INTENTIONAL, valid subject_countries members — not bugs.)\n`)

// ── read ALL rows from cloud (preview == exactly what --commit sees) ───────────
const { data: allRows, error: readErr } = await supabase
  .from('intelligence_sources')
  .select('id,title,geography,subject_countries')
if (readErr) die('read all rows', readErr)
console.log(`Read ${allRows.length} rows from cloud.\n`)

// ── classify every row ─────────────────────────────────────────────────────────
const writePlan = []          // { id, title, scalar, fragments, kept, bucket }  -> would write THIS pass
const deferred = []           // resolvable but extra-LATAM, skipped in --latam-only pass 1
const hedges = []             // scalar present, subject empty, parse -> []       -> skip
let alreadyPopulated = 0      // subject_countries non-empty                      -> skip (never touch)
let noScalar = 0              // subject empty AND scalar empty/null              -> skip
const preSnap = {}            // id -> raw subject_countries (for post-commit "unchanged" asserts)

for (const row of allRows) {
  preSnap[row.id] = row.subject_countries ?? null
  const subj = parseArr(row.subject_countries)
  if (subj.length > 0) { alreadyPopulated++; continue }
  const scalar = (row.geography ?? '').trim()
  if (scalar === '') { noScalar++; continue }
  const { fragments, kept } = parseScalar(row.geography)
  const bucket = bucketLabel(row.geography, fragments, kept)
  if (kept.length < 1) { hedges.push({ id: row.id, title: row.title, scalar: row.geography, fragments }); continue }
  const rec = { id: row.id, title: row.title, scalar: row.geography, fragments, kept, bucket }
  if (LATAM_ONLY && !isLatamOnlyRow(kept)) deferred.push(rec)   // pass 1 defers extra-LATAM to pass 2
  else writePlan.push(rec)
}

// ── DRY-RUN OUTPUT: print every candidate row (writes + hedges) ────────────────
const bucketOrder = ['clean', 'country+region', 'multi', 'paren']
const byBucket = {}
for (const b of bucketOrder) byBucket[b] = writePlan.filter((p) => p.bucket === b)

const hasSentinel = (kept) => kept.some((v) => v === 'REGIONAL' || v === 'GLOBAL')
const fmtRow = (p) =>
  `    ${p.id.slice(0, 8)} | scalar=${JSON.stringify(p.scalar)} | frags=${JSON.stringify(p.fragments)} -> ${JSON.stringify(p.kept)}` +
  (hasSentinel(p.kept) ? '  [sentinel]' : '')

console.log(`── WOULD WRITE THIS PASS (${LATAM_ONLY ? 'LATAM-region + REGIONAL only' : 'all resolvable rows'}) ──`)
for (const b of bucketOrder) {
  const rows = byBucket[b]
  if (!rows.length) continue
  console.log(`\n  [${b}] — ${rows.length} row(s)`)
  for (const p of rows) console.log(fmtRow(p))
}

if (LATAM_ONLY) {
  console.log(`\n── DEFER TO PASS 2: extra-LATAM (resolvable, but not LATAM-only) ──`)
  if (!deferred.length) console.log('  (none)')
  for (const p of deferred) console.log(fmtRow(p) + '  (deferred)')
}

console.log('\n── SKIP: hedge-unresolved (scalar present, parse -> [], left for the gate) ──')
if (!hedges.length) console.log('  (none)')
for (const h of hedges) {
  console.log(`    ${h.id.slice(0, 8)} | scalar=${JSON.stringify(h.scalar)} | frags=${JSON.stringify(h.fragments)} -> []  (SKIP)`)
}

// ── totals ─────────────────────────────────────────────────────────────────────
console.log('\n── TOTALS ──')
for (const b of bucketOrder) console.log(`  ${b.padEnd(18)} ${byBucket[b].length}`)
if (LATAM_ONLY) console.log(`  ${'extra-LATAM defer'.padEnd(18)} ${deferred.length}  (deferred to pass 2)`)
console.log(`  ${'hedge-unresolved'.padEnd(18)} ${hedges.length}  (skip)`)
console.log(`  ${'no-scalar'.padEnd(18)} ${noScalar}  (skip)`)
console.log(`  ${'already-populated'.padEnd(18)} ${alreadyPopulated}  (skip — never touched)`)
const skipCount = hedges.length + noScalar + alreadyPopulated + deferred.length
console.log(
  `\n  ${tag} ${passLabel} — would write ${writePlan.length} row(s); skip ${skipCount} ` +
  `(${deferred.length} extra-LATAM deferred + ${hedges.length} hedges + ${noScalar} no-scalar + ${alreadyPopulated} already-populated).`
)
if (LATAM_ONLY) console.log(`  Next: verify pass 1, then run WITHOUT --latam-only to write the ${deferred.length} deferred row(s).`)

// ── DRY RUN stops here ─────────────────────────────────────────────────────────
if (!COMMIT) {
  console.log('\nDry run complete. NOTHING written. Review the plan above, then re-run with --commit.\n')
  process.exit(0)
}

// ============================================================================
// COMMIT — write subject_countries ONLY. Never touch geography / mentioned_countries /
// sub_geographies. Per-row re-read + idempotency guard (mirrors geo3-backfill.mjs:100),
// cloud-direct update (mirrors :108), fail-stop. Mirror self-heals on next app read.
// ============================================================================
console.log('\n── Writing (subject_countries only) ──')
let written = 0
for (const p of writePlan) {
  const { data: cur, error: rErr } = await supabase
    .from('intelligence_sources').select('id,subject_countries').eq('id', p.id).maybeSingle()
  if (rErr) die(`read of ${p.id}`, rErr)
  if (!cur) { console.log(`  ${p.id.slice(0, 8)}: NOT FOUND in cloud — skip`); continue }
  const curSubj = parseArr(cur.subject_countries)
  if (curSubj.length > 0) {                       // IDEMPOTENCY GUARD — never overwrite
    console.log(`  ${p.id.slice(0, 8)}: already populated (${JSON.stringify(curSubj)}) — SKIP`)
    continue
  }
  const { error: uErr } = await supabase
    .from('intelligence_sources').update({ subject_countries: JSON.stringify(p.kept) }).eq('id', p.id)
  if (uErr) die(`update of ${p.id}`, uErr)
  written++
}
console.log(`\n  ${written} row(s) written.`)

// ── POST-COMMIT VERIFY ─────────────────────────────────────────────────────────
console.log('\n── Verification ──')
const writeIds = writePlan.map((p) => p.id)
const expectById = new Map(writePlan.map((p) => [p.id, p.kept]))

const { data: after, error: vErr } = await supabase
  .from('intelligence_sources').select('id,subject_countries').in('id', writeIds)
if (vErr) die('verification read', vErr)
const afterById = new Map((after ?? []).map((r) => [r.id, parseArr(r.subject_countries)]))

// inv1 — every written row now has the EXACT expected subject_countries.
let inv1 = true
let mismatches = 0
for (const id of writeIds) {
  const got = afterById.get(id) ?? []
  const exp = expectById.get(id)
  if (!arraysEqual(got, exp)) {
    inv1 = false; mismatches++
    console.log(`      ✗ ${id.slice(0, 8)}: got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`)
  }
}
console.log(`  ${inv1 ? '✓' : '✗'} inv1 — all ${writeIds.length} written rows match expected subject_countries (${mismatches} mismatch)`)

// inv2 — the 2 hedge rows are UNCHANGED (still empty subject_countries).
let inv2 = true
if (hedges.length) {
  const hedgeIds = hedges.map((h) => h.id)
  const { data: hAfter, error: hErr } = await supabase
    .from('intelligence_sources').select('id,subject_countries').in('id', hedgeIds)
  if (hErr) die('hedge verification read', hErr)
  for (const r of hAfter ?? []) {
    if (parseArr(r.subject_countries).length !== 0) {
      inv2 = false
      console.log(`      ✗ ${r.id.slice(0, 8)}: hedge row unexpectedly has subject_countries=${JSON.stringify(r.subject_countries)}`)
    }
  }
}
console.log(`  ${inv2 ? '✓' : '✗'} inv2 — the ${hedges.length} hedge row(s) still empty (untouched)`)

// inv3 — the already-populated rows are UNCHANGED vs the pre-snapshot.
let inv3 = true
const prePopIds = allRows.filter((r) => parseArr(r.subject_countries).length > 0).map((r) => r.id)
if (prePopIds.length) {
  const { data: pAfter, error: pErr } = await supabase
    .from('intelligence_sources').select('id,subject_countries').in('id', prePopIds)
  if (pErr) die('pre-populated verification read', pErr)
  for (const r of pAfter ?? []) {
    if ((r.subject_countries ?? null) !== (preSnap[r.id] ?? null)) {
      inv3 = false
      console.log(`      ✗ ${r.id.slice(0, 8)}: pre-populated row changed (${JSON.stringify(preSnap[r.id])} -> ${JSON.stringify(r.subject_countries)})`)
    }
  }
}
console.log(`  ${inv3 ? '✓' : '✗'} inv3 — the ${prePopIds.length} pre-populated rows unchanged`)

const ok = inv1 && inv2 && inv3
console.log(`\n${ok ? '✓ Backfill verified — all invariants hold.' : '⚠ Invariant FAILURE — inspect the ✗ checks above.'}`)
console.log('  (The local mirror self-heals on the next app read of these rows via getSources.)\n')
process.exit(ok ? 0 : 3)
