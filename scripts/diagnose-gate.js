// ============================================================================
// diagnose-gate.js  —  READ-ONLY diagnostic for the Claude relevance gate
// ============================================================================
// Purpose: understand WHY the gate keeps/discards what it does, WITHOUT changing
// any pipeline logic and WITHOUT writing to Supabase.
//
// What it does:
//   1. Re-runs the most recent fetch in DRY-RUN: hits NewsAPI with the EXACT
//      strict queries + 72h lookback used in production. Inserts NOTHING.
//   2. Runs every fetched article through the SAME gate (lib/categorize.js),
//      capturing the full JSON (Q1/Q2/Q3 + relevance_score + reasoning).
//   3. Writes ../gate-diagnostic.txt with three sections (SUMMARY / DISCARDED /
//      KEPT) and prints the file to stdout.
//
// IMPORTANT: This script does NOT import fetch-intelligence.js (that file runs
// main() on import). The QUERY_GROUPS + buildQ + fetch params below are copied
// VERBATIM from fetch-intelligence.js so the diagnostic matches production; if
// the production queries change, mirror them here. No Supabase client is created.
//
// Usage:
//   node diagnose-gate.js            # full run (70 queries)
//   node diagnose-gate.js --sample 2 # first 2 queries per group (low quota)
// ============================================================================

import { config as dotenvConfig } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { writeFileSync } from 'fs'
import fetch from 'node-fetch'
import { makeAnthropic, categorize, isRelevant, RELEVANCE_THRESHOLD } from './lib/categorize.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: resolve(__dirname, '..', '.env'), override: true })

const NEWSAPI_KEY = process.env.NEWSAPI_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Optional: --sample N  => take only the first N queries from each group.
const sampleIdx = process.argv.indexOf('--sample')
const SAMPLE_PER_GROUP = sampleIdx !== -1 ? Number(process.argv[sampleIdx + 1]) || 0 : 0

// ── Fetch params (copied verbatim from fetch-intelligence.js) ────────────────
const PAGE_SIZE = 100
const MAX_PAGES = 2
const LOOKBACK_HOURS = 72

// ── Strict query set (copied verbatim from fetch-intelligence.js) ────────────
const QUERY_GROUPS = {
  'offensive-incidents': [
    { terms: ['drone', 'Colombia'], lang: 'en' },
    { terms: ['drone', 'Venezuela'], lang: 'en' },
    { terms: ['drone', 'Mexico'], lang: 'en' },
    { terms: ['drone', 'Brazil'], lang: 'en' },
    { terms: ['drone', 'Peru'], lang: 'en' },
    { terms: ['drone', 'Ecuador'], lang: 'en' },
    { terms: ['drone', 'Bolivia'], lang: 'en' },
    { terms: ['drone', 'Argentina'], lang: 'en' },
    { terms: ['drone', 'Chile'], lang: 'en' },
    { terms: ['drone', 'Guatemala'], lang: 'en' },
    { terms: ['drone', 'Honduras'], lang: 'en' },
    { terms: ['drone', 'El Salvador'], lang: 'en' },
    { terms: ['UAV', 'Colombia'], lang: 'en' },
    { terms: ['UAV', 'Venezuela'], lang: 'en' },
    { terms: ['UAV', 'Mexico'], lang: 'en' },
    { terms: ['dron', 'Colombia'], lang: 'es' },
    { terms: ['dron', 'México'], lang: 'es' },
    { terms: ['dron', 'Venezuela'], lang: 'es' },
    { terms: ['FARC', 'dron'], lang: 'es' },
    { terms: ['ELN', 'dron'], lang: 'es' },
    { terms: ['CJNG', 'dron'], lang: 'es' },
    { terms: ['cartel', 'dron'], lang: 'es' },
    { terms: ['narco', 'dron'], lang: 'es' },
    { terms: ['FARC', 'drone'], lang: 'en' },
    { terms: ['ELN', 'drone'], lang: 'en' },
    { terms: ['CJNG', 'drone'], lang: 'en' },
    { terms: ['cartel', 'drone'], lang: 'en' },
    { terms: ['narco', 'drone'], lang: 'en' },
  ],
  'military-investment': [
    { terms: ['drone', 'military', 'Colombia'], lang: 'en' },
    { terms: ['drone', 'military', 'Venezuela'], lang: 'en' },
    { terms: ['drone', 'military', 'Brazil'], lang: 'en' },
    { terms: ['drone', 'military', 'Mexico'], lang: 'en' },
    { terms: ['UAV', 'military', 'Latin America'], lang: 'en' },
    { terms: ['drone', 'procurement', 'Latin America'], lang: 'en' },
    { terms: ['drone', 'investment', 'Latin America'], lang: 'en' },
    { terms: ['compra', 'dron', 'militar', 'Colombia'], lang: 'es' },
    { terms: ['compra', 'dron', 'militar', 'Venezuela'], lang: 'es' },
    { terms: ['compra', 'dron', 'militar', 'México'], lang: 'es' },
    { terms: ['drone', 'fuerzas armadas', 'Colombia'], lang: 'es' },
    { terms: ['drone', 'fuerzas armadas', 'Venezuela'], lang: 'es' },
    { terms: ['drone', 'fuerzas armadas', 'México'], lang: 'es' },
    { terms: ['drone', 'fuerzas armadas', 'Brasil'], lang: 'es' },
    { terms: ['Iranian', 'drone', 'Venezuela'], lang: 'en' },
    { terms: ['Iranian', 'drone', 'Latin America'], lang: 'en' },
  ],
  'new-technology': [
    { terms: ['drone', 'empresa', 'Colombia'], lang: 'es' },
    { terms: ['drone', 'empresa', 'México'], lang: 'es' },
    { terms: ['drone', 'empresa', 'Brasil'], lang: 'es' },
    { terms: ['drone', 'empresa', 'Argentina'], lang: 'es' },
    { terms: ['drone', 'fabricante', 'Colombia'], lang: 'es' },
    { terms: ['drone', 'fabricante', 'México'], lang: 'es' },
    { terms: ['drone', 'fabricante', 'Brasil'], lang: 'es' },
    { terms: ['UAS', 'manufacturer', 'Latin America'], lang: 'en' },
    { terms: ['drone', 'technology', 'Colombia'], lang: 'en' },
    { terms: ['drone', 'technology', 'Brazil'], lang: 'en' },
    { terms: ['drone', 'technology', 'Mexico'], lang: 'en' },
    { terms: ['counter-drone', 'Latin America'], lang: 'en' },
    { terms: ['anti-drone', 'Latin America'], lang: 'en' },
    { terms: ['contra', 'dron', 'Colombia'], lang: 'es' },
    { terms: ['contra', 'dron', 'México'], lang: 'es' },
    { terms: ['contra', 'dron', 'Brasil'], lang: 'es' },
  ],
  'counter-drone': [
    { terms: ['anti-drone', 'Colombia'], lang: 'en' },
    { terms: ['anti-drone', 'Venezuela'], lang: 'en' },
    { terms: ['anti-drone', 'Mexico'], lang: 'en' },
    { terms: ['anti-drone', 'Brazil'], lang: 'en' },
    { terms: ['counter-drone', 'Colombia'], lang: 'en' },
    { terms: ['counter-drone', 'Venezuela'], lang: 'en' },
    { terms: ['counter', 'UAS', 'Latin America'], lang: 'en' },
    { terms: ['C-UAS', 'Colombia'], lang: 'en' },
    { terms: ['drone', 'defense', 'Latin America'], lang: 'en' },
    { terms: ['drone', 'jammer', 'Latin America'], lang: 'en' },
  ],
}

// ── Helpers (copied verbatim from fetch-intelligence.js) ─────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const isoHoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString()
const buildQ = (terms) => terms.map((t) => (/[\s-]/.test(t) ? `"${t}"` : t)).join(' AND ')

const anthropic = makeAnthropic(ANTHROPIC_API_KEY)

// Fetch one strict query (paged). Returns { articles, totalResults, error }.
async function fetchQuery(terms, language) {
  const q = buildQ(terms)
  const from = isoHoursAgo(LOOKBACK_HOURS)
  const collected = []
  let totalResults = 0
  let error = null

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL('https://newsapi.org/v2/everything')
    url.searchParams.set('q', q)
    url.searchParams.set('language', language)
    url.searchParams.set('from', from)
    url.searchParams.set('sortBy', 'publishedAt')
    url.searchParams.set('pageSize', String(PAGE_SIZE))
    url.searchParams.set('page', String(page))
    try {
      const res = await fetch(url.toString(), {
        headers: { 'X-Api-Key': NEWSAPI_KEY || '', 'User-Agent': 'KantorIntel/1.0' },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.status === 'error') {
        error = `${res.status} ${body.code || ''} ${body.message || ''}`.trim()
        break
      }
      totalResults = body.totalResults || 0
      const articles = body.articles || []
      collected.push(...articles)
      if (articles.length < PAGE_SIZE || collected.length >= totalResults) break
      await sleep(200)
    } catch (e) {
      error = `threw: ${e.message}`
      break
    }
  }
  return { articles: collected, totalResults, error }
}

const yn = (v) => String(v ?? '').toLowerCase() === 'no' ? 'no' : (String(v ?? '').toLowerCase() === 'yes' ? 'yes' : '?')
const noCount = (cat) =>
  ['q1_about_drones', 'q2_latam_country', 'q3_main_topic'].filter((k) => yn(cat?.[k]) === 'no').length

function pad(s, n) { s = String(s ?? ''); return s.length >= n ? s : s + ' '.repeat(n - s.length) }

async function main() {
  const lines = []
  const out = (s = '') => lines.push(s)

  const startedAt = new Date().toISOString()
  if (!NEWSAPI_KEY) console.warn('[diag] NEWSAPI_KEY empty — fetch will yield nothing.')
  if (!anthropic) console.warn('[diag] ANTHROPIC_API_KEY missing — gate cannot evaluate.')

  // ── STEP 1: fetch (dry-run, no writes) ─────────────────────────────────────
  const rawArticles = []          // every article object, with duplicates
  const queriesByUrl = new Map()  // url -> Set(queryLabel)
  const articleByUrl = new Map()  // url -> first article object seen
  const fetchErrors = []
  let totalReportedSum = 0

  for (const [groupName, queries] of Object.entries(QUERY_GROUPS)) {
    const list = SAMPLE_PER_GROUP > 0 ? queries.slice(0, SAMPLE_PER_GROUP) : queries
    for (const { terms, lang } of list) {
      const label = `${groupName}: ${terms.join(' + ')} [${lang}]`
      const { articles, totalResults, error } = await fetchQuery(terms, lang)
      if (error) { fetchErrors.push(`${label} -> ${error}`); continue }
      totalReportedSum += totalResults
      for (const a of articles) {
        rawArticles.push(a)
        if (a?.url) {
          if (!queriesByUrl.has(a.url)) queriesByUrl.set(a.url, new Set())
          queriesByUrl.get(a.url).add(label)
          if (!articleByUrl.has(a.url)) articleByUrl.set(a.url, a)
        }
      }
    }
  }

  const uniqueArticles = [...articleByUrl.values()]
  console.log(`[diag] fetched ${rawArticles.length} raw, ${uniqueArticles.length} unique. Grading...`)

  // ── STEP 2: run the SAME gate on every unique article ──────────────────────
  // (Duplicates share a URL and produce identical gate output, so we grade each
  //  unique URL once and record ALL queries that surfaced it.)
  const records = [] // { article, queries[], cat, kept, evalFailed }
  for (const a of uniqueArticles) {
    const cat = await categorize(anthropic, {
      title: a.title,
      snippet: a.description || a.content || '',
      source: a.source?.name,
    })
    records.push({
      article: a,
      queries: [...(queriesByUrl.get(a.url) || [])],
      cat,
      kept: isRelevant(cat),
      evalFailed: cat === null,
    })
  }

  const evaluated = records.filter((r) => !r.evalFailed)
  const evalFailedRecs = records.filter((r) => r.evalFailed)
  const kept = evaluated.filter((r) => r.kept)
  const discarded = evaluated.filter((r) => !r.kept)

  const failedQ1 = discarded.filter((r) => yn(r.cat.q1_about_drones) === 'no').length
  const failedQ2 = discarded.filter((r) => yn(r.cat.q2_latam_country) === 'no').length
  const failedQ3 = discarded.filter((r) => yn(r.cat.q3_main_topic) === 'no').length

  const catCounts = {}
  for (const r of kept) {
    const c = r.cat.primary_category || '(none)'
    catCounts[c] = (catCounts[c] || 0) + 1
  }

  // ── REPORT ─────────────────────────────────────────────────────────────────
  out('================================================================================')
  out('GATE DIAGNOSTIC REPORT  (READ-ONLY — no Supabase writes)')
  out('================================================================================')
  out(`Generated: ${startedAt}`)
  out(`Mode: ${SAMPLE_PER_GROUP > 0 ? `SAMPLE (first ${SAMPLE_PER_GROUP} queries/group)` : 'FULL (all 70 queries)'}`)
  out(`Lookback: ${LOOKBACK_HOURS}h | Relevance threshold (keep): score >= ${RELEVANCE_THRESHOLD}`)
  out(`Note: articles graded per UNIQUE url; duplicates produce identical gate output.`)
  out('')

  // SECTION A — SUMMARY
  out('--------------------------------------------------------------------------------')
  out('SECTION A — SUMMARY')
  out('--------------------------------------------------------------------------------')
  out(`Total raw articles fetched (incl. duplicates): ${rawArticles.length}`)
  out(`Unique after URL dedup:                        ${uniqueArticles.length}`)
  out(`  Evaluated by gate:                           ${evaluated.length}`)
  out(`  Gate eval failures (Claude error, skipped):  ${evalFailedRecs.length}`)
  out('')
  out(`KEPT     (score >= ${RELEVANCE_THRESHOLD}): ${kept.length}`)
  out(`DISCARDED (score <  ${RELEVANCE_THRESHOLD}): ${discarded.length}`)
  out('')
  out('Of the DISCARDED, how many answered "no" to each gate question')
  out('(a single article can fail more than one, so these can overlap):')
  out(`  Q1 "not about drones/UAS/UAV":         ${failedQ1}`)
  out(`  Q2 "no Latin American country":        ${failedQ2}`)
  out(`  Q3 "drone not the main topic":         ${failedQ3}`)
  out('')
  out('KEPT articles by primary_category:')
  const catKeys = Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a])
  if (catKeys.length === 0) out('  (none)')
  for (const c of catKeys) out(`  ${pad(c, 22)} ${catCounts[c]}`)
  if (fetchErrors.length) {
    out('')
    out(`NewsAPI fetch errors (${fetchErrors.length}) — these queries returned no data:`)
    for (const e of fetchErrors.slice(0, 80)) out(`  ! ${e}`)
  }
  out('')

  // SECTION B — DISCARDED (sorted: fewest "no" answers first = most borderline)
  out('--------------------------------------------------------------------------------')
  out('SECTION B — DISCARDED ARTICLES  (borderline first: fewest gate failures on top)')
  out('--------------------------------------------------------------------------------')
  const discSorted = [...discarded].sort((a, b) => {
    const d = noCount(a.cat) - noCount(b.cat)
    if (d !== 0) return d
    return (Number(b.cat.relevance_score) || 0) - (Number(a.cat.relevance_score) || 0)
  })
  if (discSorted.length === 0) out('(none discarded)')
  let idx = 0
  for (const r of discSorted) {
    idx++
    const c = r.cat
    const nNo = noCount(c)
    out(`[${idx}] (${nNo} gate failure${nNo === 1 ? '' : 's'})  ${r.article.title || '(no title)'}`)
    out(`     source:   ${r.article.source?.name || 'Unknown'}`)
    out(`     query:    ${r.queries.join('  |  ')}`)
    out(`     gate:     Q1 about-drones=${yn(c.q1_about_drones)}  Q2 latam-country=${yn(c.q2_latam_country)}  Q3 main-topic=${yn(c.q3_main_topic)}`)
    out(`     score:    ${c.relevance_score}   (category Claude proposed: ${c.primary_category || 'n/a'})`)
    out(`     summary:  ${c.summary || 'n/a'}`)
    out(`     reasoning:${c.confidence_reasoning ? ' ' + c.confidence_reasoning : ' n/a'}`)
    out(`     url:      ${r.article.url || 'n/a'}`)
    out('')
  }

  // SECTION C — KEPT
  out('--------------------------------------------------------------------------------')
  out('SECTION C — KEPT ARTICLES')
  out('--------------------------------------------------------------------------------')
  const keptSorted = [...kept].sort((a, b) => (Number(b.cat.relevance_score) || 0) - (Number(a.cat.relevance_score) || 0))
  if (keptSorted.length === 0) out('(none kept)')
  let k = 0
  for (const r of keptSorted) {
    k++
    const c = r.cat
    out(`[${k}] score ${c.relevance_score}  ${r.article.title || '(no title)'}`)
    out(`     source:    ${r.article.source?.name || 'Unknown'}`)
    out(`     category:  ${c.primary_category || 'n/a'}${c.sub_category ? ' / ' + c.sub_category : ''}`)
    out(`     countries: ${(c.countries || []).join(', ') || 'n/a'}`)
    out(`     summary:   ${c.summary || 'n/a'}`)
    out(`     url:       ${r.article.url || 'n/a'}`)
    out('')
  }

  // Eval-failed (if any) listed at the very end for completeness.
  if (evalFailedRecs.length) {
    out('--------------------------------------------------------------------------------')
    out('APPENDIX — ARTICLES THE GATE COULD NOT EVALUATE (Claude error; left out of counts)')
    out('--------------------------------------------------------------------------------')
    for (const r of evalFailedRecs) {
      out(`  ? ${r.article.title || '(no title)'}  [${r.article.source?.name || 'Unknown'}]`)
    }
    out('')
  }

  out('================================================================================')
  out(`END OF REPORT  —  raw=${rawArticles.length} unique=${uniqueArticles.length} kept=${kept.length} discarded=${discarded.length}`)
  out('================================================================================')

  const report = lines.join('\n') + '\n'
  const outPath = resolve(__dirname, '..', 'gate-diagnostic.txt')
  writeFileSync(outPath, report)
  console.log(`\n[diag] Wrote ${outPath}\n`)
  // Print the full report to the terminal.
  process.stdout.write(report)
}

main().catch((e) => {
  console.error('FATAL (diagnostic):', e?.stack || e?.message || e)
  process.exit(1)
})
