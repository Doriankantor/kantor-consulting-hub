// ============================================================================
// rescore-culled.mjs  —  READ-ONLY dry run of a candidate gate prompt
// ============================================================================
// Re-scores three samples of stored cs_articles through the CURRENT
// lib/categorize.js (i.e. whatever prompt is in the working tree) WITHOUT
// calibration, so the only variable is the prompt. SELECT only — never writes
// to Supabase. Output: stdout summary + full table in ./rescore-dryrun.txt.
//
//   (a) RESCUE POOL   — culled rows whose stored verdict passed Q1 and Q2
//   (b) CONTROL-KEEP  — 40 random status='new' rows (should stay KEEP)
//   (c) CONTROL-JUNK  — 40 random culled rows that failed Q1 (should stay CULL)
//
// Usage (from scripts/):  node rescore-culled.mjs
// ============================================================================

import { config as dotenvConfig } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { makeAnthropic, categorize, isRelevant } from './lib/categorize.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: resolve(__dirname, '..', '.env'), override: true })

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anthropic = makeAnthropic(ANTHROPIC_API_KEY)

const CONTROL_N = 40
const CONCURRENCY = 4

const parse = (j) => { try { return typeof j === 'string' ? JSON.parse(j) : (j || {}) } catch { return {} } }
const said = (a, q) => String(a?.[q]).toLowerCase()
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

async function selectAll(status) {
  const out = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from('cs_articles')
      .select('id, title, content_snippet, source_name, status, primary_category, claude_analysis')
      .eq('status', status).range(i, i + 999)
    if (error) throw new Error(`select ${status}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// categorize() swallows API errors into null; retry once so a transient 429
// isn't reported as a verdict.
async function rescore(row) {
  const input = { title: row.title, snippet: row.content_snippet || row.title || '', source: row.source_name }
  let cat = await categorize(anthropic, input)
  if (!cat) { await new Promise((r) => setTimeout(r, 3000)); cat = await categorize(anthropic, input) }
  return cat
}

async function runPool(rows) {
  const results = new Array(rows.length)
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < rows.length) {
      const i = next++
      const row = rows[i]
      const old = parse(row.claude_analysis)
      const cat = await rescore(row)
      results[i] = {
        title: row.title || '',
        oldScore: old.relevance_score ?? '-', oldCat: row.primary_category || '-',
        oldKeep: row.status === 'new',
        newScore: cat ? cat.relevance_score : 'ERR', newCat: cat?.primary_category || '-',
        newKeep: cat ? isRelevant(cat) : null,
        newQ: cat ? [cat.q1_about_drones, cat.q2_latam_country, cat.q3_main_topic].map((x) => String(x)[0]).join('') : '---',
        why: cat?.confidence_reasoning || '',
      }
    }
  }))
  return results
}

const label = (r) => r.newKeep === null ? 'ERROR' : r.oldKeep === r.newKeep ? (r.newKeep ? 'KEEP=' : 'CULL=') : (r.newKeep ? 'CULL->KEEP' : 'KEEP->CULL')
const fmt = (r) => `${label(r).padEnd(10)} | ${String(r.oldScore).padStart(2)}/${r.oldCat} -> ${String(r.newScore).padStart(3)}/${r.newCat} [q${r.newQ}] | ${r.title.slice(0, 110)}\n             why: ${r.why.slice(0, 200)}`

const [culled, fresh] = await Promise.all([selectAll('culled'), selectAll('new')])
const rescuePool = culled.filter((r) => { const a = parse(r.claude_analysis); return said(a, 'q1_about_drones') !== 'no' && said(a, 'q2_latam_country') !== 'no' })
const controlKeep = shuffle(fresh).slice(0, CONTROL_N)
const controlJunk = shuffle(culled.filter((r) => said(parse(r.claude_analysis), 'q1_about_drones') === 'no')).slice(0, CONTROL_N)

console.log(`Pools: (a) rescue ${rescuePool.length}, (b) control-keep ${controlKeep.length}, (c) control-junk ${controlJunk.length}. Scoring...`)
const [a, b, c] = [await runPool(rescuePool), await runPool(controlKeep), await runPool(controlJunk)]

const count = (rs, pred) => rs.filter(pred).length
const summary = [
  `=== GATE DRY RUN (${new Date().toISOString()}) — prompt from working-tree lib/categorize.js, NO calibration, NO writes ===`,
  `(a) RESCUE POOL      ${a.length} rows: ${count(a, (r) => r.newKeep === true)} flip to KEEP, ${count(a, (r) => r.newKeep === false)} stay CULL, ${count(a, (r) => r.newKeep === null)} errors`,
  `    new category of flips: ${JSON.stringify(a.filter((r) => r.newKeep).reduce((m, r) => (m[r.newCat] = (m[r.newCat] || 0) + 1, m), {}))}`,
  `(b) CONTROL-KEEP     ${b.length} rows: ${count(b, (r) => r.newKeep === false)} REGRESSIONS (would now CULL), ${count(b, (r) => r.newKeep === null)} errors`,
  `(c) CONTROL-JUNK     ${c.length} rows: ${count(c, (r) => r.newKeep === true)} FALSE ADMISSIONS (would now KEEP), ${count(c, (r) => r.newKeep === null)} errors`,
].join('\n')

const section = (name, rs) => `\n\n### ${name}\n` + rs.map(fmt).join('\n')
writeFileSync(resolve(__dirname, 'rescore-dryrun.txt'),
  summary + section('(a) RESCUE POOL', a) + section('(b) CONTROL-KEEP', b) + section('(c) CONTROL-JUNK', c) + '\n')

console.log('\n' + summary)
console.log(section('(a) flips to KEEP', a.filter((r) => r.newKeep === true)))
console.log(section('(b) REGRESSIONS', b.filter((r) => r.newKeep === false)))
console.log(section('(c) FALSE ADMISSIONS', c.filter((r) => r.newKeep === true)))
const errs = [...a, ...b, ...c].filter((r) => r.newKeep === null)
if (errs.length) console.log(section('ERRORS (no verdict after retry)', errs))
console.log('\nFull table: scripts/rescore-dryrun.txt')
