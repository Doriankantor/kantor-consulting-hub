// ============================================================================
// Daily Intelligence Fetch — GDELT DOC 2.0 -> Claude categorization -> Supabase
// ============================================================================
// PRIMARY SOURCE: GDELT DOC 2.0 (keyless, no quota, full-body search + native
// FIPS source-country filter). See lib/gdelt-fetch.js for the 21-query strategy
// (17 LATAM countries × a drone OR-group + 4 actor/supplier theme queries).
//
// NewsAPI is retained behind the USE_NEWSAPI flag (default false) so it can be
// re-enabled later; its strict combined-query code below is dormant when off.
//
// The Claude relevance gate, the 8 categories, the URL de-duplication and the
// Supabase storage are all UNCHANGED — only the fetch layer differs by source.
//
// Pipeline (each stage is isolated so one failure never stops the whole run):
//   1. Fetch from GDELT (or NewsAPI if the flag is on); normalize to a common
//      shape; dedup by URL within the run and against existing cs_articles.
//   2. Categorize each new article with Claude Haiku + strict relevance gate.
//      Keep only relevance_score >= RELEVANCE_THRESHOLD. Failure -> 'uncategorized'.
//   3. Insert kept articles into cs_articles.
//   4. Log the run into cs_fetch_log (source tagged in keywords_used).
//   5. Upsert cs_fetch_status (last_fetch + new_articles_count) for Hub realtime.
// Supabase failure at any write -> articles dumped to a local JSON backup.
// ============================================================================

import { config as dotenvConfig } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import fetch from 'node-fetch'
import WebSocket from 'ws'
import { createClient } from '@supabase/supabase-js'
import { makeAnthropic, categorize, isRelevant, RELEVANCE_THRESHOLD } from './lib/categorize.js'
import { fetchAllGdelt, buildGdeltQueries } from './lib/gdelt-fetch.js'
import { fetchCalibration } from './lib/learning.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Load the repo-root .env for local runs. `override: true` lets the .env win
// over variables the surrounding shell may export as EMPTY (e.g. some tooling
// exports a blank ANTHROPIC_API_KEY, which would otherwise shadow the real key).
// In GitHub Actions the .env file is absent, so this no-ops and the injected
// secrets (real env vars) are used as-is.
dotenvConfig({ path: resolve(__dirname, '..', '.env'), override: true })

// ── Config ──────────────────────────────────────────────────────────────────
// Source switch: GDELT is the primary fetcher. Flip to true to fall back to the
// legacy NewsAPI strategy (kept intact below). Env override: USE_NEWSAPI=true.
const USE_NEWSAPI = process.env.USE_NEWSAPI === 'true'

const NEWSAPI_KEY = process.env.NEWSAPI_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const PAGE_SIZE = 100
const MAX_PAGES = 2 // strict queries are narrow; rarely more than one page.
// NewsAPI's free Developer plan serves articles with a ~24h delay and caps usage
// at 100 requests/day, so a strict "last 24h" window returns nothing. We look
// back 72h to overlap the delayed-availability zone (and recover a missed run);
// URL dedup against cs_articles guarantees we never re-insert what we already have.
const LOOKBACK_HOURS = 72

// ── STRICT QUERY SET ─────────────────────────────────────────────────────────
// Each entry is { terms: [...], lang }. The query sent to NewsAPI is the terms
// AND-joined (multi-word / hyphenated terms get quoted for an exact phrase), so
// EVERY query requires a drone term AND a place/actor term to co-occur.
const QUERY_GROUPS = {
  // GROUP 1 — drone incidents in LATAM (attacks, strikes, criminal use)
  'offensive-incidents': [
    { terms: ['drone', 'Colombia'],     lang: 'en' },
    { terms: ['drone', 'Venezuela'],    lang: 'en' },
    { terms: ['drone', 'Mexico'],       lang: 'en' },
    { terms: ['drone', 'Brazil'],       lang: 'en' },
    { terms: ['drone', 'Peru'],         lang: 'en' },
    { terms: ['drone', 'Ecuador'],      lang: 'en' },
    { terms: ['drone', 'Bolivia'],      lang: 'en' },
    { terms: ['drone', 'Argentina'],    lang: 'en' },
    { terms: ['drone', 'Chile'],        lang: 'en' },
    { terms: ['drone', 'Guatemala'],    lang: 'en' },
    { terms: ['drone', 'Honduras'],     lang: 'en' },
    { terms: ['drone', 'El Salvador'],  lang: 'en' },
    { terms: ['UAV', 'Colombia'],       lang: 'en' },
    { terms: ['UAV', 'Venezuela'],      lang: 'en' },
    { terms: ['UAV', 'Mexico'],         lang: 'en' },
    { terms: ['dron', 'Colombia'],      lang: 'es' },
    { terms: ['dron', 'México'],        lang: 'es' },
    { terms: ['dron', 'Venezuela'],     lang: 'es' },
    { terms: ['FARC', 'dron'],          lang: 'es' },
    { terms: ['ELN', 'dron'],           lang: 'es' },
    { terms: ['CJNG', 'dron'],          lang: 'es' },
    { terms: ['cartel', 'dron'],        lang: 'es' },
    { terms: ['narco', 'dron'],         lang: 'es' },
    { terms: ['FARC', 'drone'],         lang: 'en' },
    { terms: ['ELN', 'drone'],          lang: 'en' },
    { terms: ['CJNG', 'drone'],         lang: 'en' },
    { terms: ['cartel', 'drone'],       lang: 'en' },
    { terms: ['narco', 'drone'],        lang: 'en' },
  ],

  // GROUP 2 — drone investment in LATAM (military procurement, national programs)
  'military-investment': [
    { terms: ['drone', 'military', 'Colombia'],     lang: 'en' },
    { terms: ['drone', 'military', 'Venezuela'],    lang: 'en' },
    { terms: ['drone', 'military', 'Brazil'],       lang: 'en' },
    { terms: ['drone', 'military', 'Mexico'],       lang: 'en' },
    { terms: ['UAV', 'military', 'Latin America'],  lang: 'en' },
    { terms: ['drone', 'procurement', 'Latin America'], lang: 'en' },
    { terms: ['drone', 'investment', 'Latin America'],  lang: 'en' },
    { terms: ['compra', 'dron', 'militar', 'Colombia'],  lang: 'es' },
    { terms: ['compra', 'dron', 'militar', 'Venezuela'], lang: 'es' },
    { terms: ['compra', 'dron', 'militar', 'México'],    lang: 'es' },
    { terms: ['drone', 'fuerzas armadas', 'Colombia'],   lang: 'es' },
    { terms: ['drone', 'fuerzas armadas', 'Venezuela'],  lang: 'es' },
    { terms: ['drone', 'fuerzas armadas', 'México'],     lang: 'es' },
    { terms: ['drone', 'fuerzas armadas', 'Brasil'],     lang: 'es' },
    { terms: ['Iranian', 'drone', 'Venezuela'],     lang: 'en' },
    { terms: ['Iranian', 'drone', 'Latin America'], lang: 'en' },
  ],

  // GROUP 3 — drone technology in LATAM (new systems, manufacturers, innovations)
  'new-technology': [
    { terms: ['drone', 'empresa', 'Colombia'],  lang: 'es' },
    { terms: ['drone', 'empresa', 'México'],     lang: 'es' },
    { terms: ['drone', 'empresa', 'Brasil'],     lang: 'es' },
    { terms: ['drone', 'empresa', 'Argentina'],  lang: 'es' },
    { terms: ['drone', 'fabricante', 'Colombia'], lang: 'es' },
    { terms: ['drone', 'fabricante', 'México'],   lang: 'es' },
    { terms: ['drone', 'fabricante', 'Brasil'],   lang: 'es' },
    { terms: ['UAS', 'manufacturer', 'Latin America'], lang: 'en' },
    { terms: ['drone', 'technology', 'Colombia'], lang: 'en' },
    { terms: ['drone', 'technology', 'Brazil'],   lang: 'en' },
    { terms: ['drone', 'technology', 'Mexico'],   lang: 'en' },
    { terms: ['counter-drone', 'Latin America'],  lang: 'en' },
    { terms: ['anti-drone', 'Latin America'],     lang: 'en' },
    { terms: ['contra', 'dron', 'Colombia'],      lang: 'es' },
    { terms: ['contra', 'dron', 'México'],         lang: 'es' },
    { terms: ['contra', 'dron', 'Brasil'],         lang: 'es' },
  ],

  // GROUP 4 — counter-drone in LATAM
  'counter-drone': [
    { terms: ['anti-drone', 'Colombia'],   lang: 'en' },
    { terms: ['anti-drone', 'Venezuela'],  lang: 'en' },
    { terms: ['anti-drone', 'Mexico'],     lang: 'en' },
    { terms: ['anti-drone', 'Brazil'],     lang: 'en' },
    { terms: ['counter-drone', 'Colombia'],  lang: 'en' },
    { terms: ['counter-drone', 'Venezuela'], lang: 'en' },
    { terms: ['counter', 'UAS', 'Latin America'], lang: 'en' },
    { terms: ['C-UAS', 'Colombia'],        lang: 'en' },
    { terms: ['drone', 'defense', 'Latin America'], lang: 'en' },
    { terms: ['drone', 'jammer', 'Latin America'],  lang: 'en' },
  ],
}

// Flat list of human-readable query labels (for cs_fetch_log.keywords_used).
const ALL_QUERY_LABELS = Object.values(QUERY_GROUPS)
  .flat()
  .map((q) => q.terms.join(' + '))

// ── Supabase / Anthropic clients (created defensively) ───────────────────────
let supabase = null
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    // Node < 22 has no native WebSocket; supply ws so client construction
    // doesn't throw (we only use REST here, but the client initializes Realtime).
    realtime: { transport: WebSocket },
  })
} else {
  console.warn('[config] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — Supabase writes will be backed up locally.')
}

const anthropic = makeAnthropic(ANTHROPIC_API_KEY)
if (!anthropic) {
  console.warn('[config] ANTHROPIC_API_KEY missing — articles will be stored uncategorized.')
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function isoHoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString()
}

// Build the NewsAPI `q` from a strict term list: AND-join the terms, quoting any
// multi-word or hyphenated term so it is matched as an exact phrase. This forces
// every required term (drone AND place/actor) to co-occur in the article.
function buildQ(terms) {
  return terms.map((t) => (/[\s-]/.test(t) ? `"${t}"` : t)).join(' AND ')
}

// LEGACY (NewsAPI) — run ONE strict query (one NewsAPI call, paged defensively).
// Only used when USE_NEWSAPI is true; dormant otherwise.
async function fetchQuery(groupName, terms, language, errors) {
  const q = buildQ(terms)
  const label = terms.join(' + ')
  const from = isoHoursAgo(LOOKBACK_HOURS)
  const collected = []
  let totalResults = 0

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
        const msg = `NewsAPI [${groupName}: ${label}/${language}] p${page}: ${res.status} ${body.code || ''} ${body.message || ''}`.trim()
        console.warn('  ✗', msg)
        errors.push(msg)
        break // stop paging this query; move on to the next
      }

      totalResults = body.totalResults || 0
      const articles = body.articles || []
      collected.push(...articles)
      if (articles.length > 0) {
        console.log(`  • ${groupName} "${label}"/${language} p${page}: +${articles.length} (total ${totalResults})`)
      }

      if (articles.length < PAGE_SIZE || collected.length >= totalResults) break
      await sleep(200)
    } catch (e) {
      const msg = `NewsAPI [${groupName}: ${label}/${language}] p${page} threw: ${e.message}`
      console.warn('  ✗', msg)
      errors.push(msg)
      break
    }
  }

  return { articles: collected, totalResults }
}

// Normalize a raw NewsAPI article into the common pipeline shape. (Legacy path.)
function normalizeNewsApiArticle(a, queryLabel) {
  return {
    url: a.url || null,
    title: a.title || null,
    source_name: a.source?.name || null,
    published_at: a.publishedAt || null,
    content_snippet: (a.description || a.content || '').slice(0, 500) || null,
    language: null,
    image_url: a.urlToImage || null,
    source_country: null,
    found_by_query: queryLabel,
  }
}

// Map a NORMALIZED article + Claude categorization to a cs_articles row.
// Note: image_url / source_country are intentionally NOT written — cs_articles
// has no such columns (an unknown column would make the insert fail). GDELT has
// no body snippet, so content_snippet falls back to the title.
function buildRow(article, cat) {
  return {
    title: article.title || null,
    url: article.url || null,
    source_name: article.source_name || null,
    published_at: article.published_at || null,
    content_snippet: (article.content_snippet || article.title || '').slice(0, 500) || null,
    primary_category: cat?.primary_category || null,
    sub_category: cat?.sub_category || null,
    confidence_level: cat?.confidence_suggestion || 'unrated',
    claude_analysis: cat ? JSON.stringify(cat) : null,
    status: cat ? 'new' : 'uncategorized',
    imported_to_hub: false,
  }
}

// Query existing URLs in cs_articles (chunked) so we only process genuinely new
// ones — true deduplication: an article already stored is never inserted again.
async function filterNewUrls(urls) {
  if (!supabase || urls.length === 0) return new Set()
  const existing = new Set()
  const CHUNK = 100
  for (let i = 0; i < urls.length; i += CHUNK) {
    const chunk = urls.slice(i, i + CHUNK)
    const { data, error } = await supabase.from('cs_articles').select('url').in('url', chunk)
    if (error) {
      console.warn('  ✗ dedupe query failed:', error.message)
      continue // fail open: better a possible dup than dropping everything
    }
    for (const r of data || []) existing.add(r.url)
  }
  return existing
}

function backupLocally(rows, reason) {
  try {
    const dir = resolve(__dirname, 'backups')
    mkdirSync(dir, { recursive: true })
    const file = resolve(dir, `intelligence-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    writeFileSync(file, JSON.stringify({ reason, savedAt: new Date().toISOString(), rows }, null, 2))
    console.warn(`  ⚠ Saved ${rows.length} article(s) to local backup: ${file}`)
  } catch (e) {
    console.error('  ✗ Backup write failed:', e.message)
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = new Date().toISOString()
  const SOURCE = USE_NEWSAPI ? 'newsapi' : 'gdelt'
  console.log(`\n=== Daily Intelligence Fetch @ ${startedAt} ===`)
  console.log(`  Primary source: ${SOURCE.toUpperCase()}`)

  const errors = []
  let articlesFound = 0
  const rawArticles = []
  let keywordsUsed = []

  // STEP 1 — fetch from the active source and normalize to a common shape.
  if (USE_NEWSAPI) {
    // ── LEGACY NewsAPI path (dormant unless USE_NEWSAPI=true) ────────────────
    console.log(`\n[1/5] Fetching from NewsAPI (${ALL_QUERY_LABELS.length} strict combined queries)...`)
    if (!NEWSAPI_KEY) console.warn('[config] NEWSAPI_KEY is empty — NewsAPI calls will return 401 and yield 0 articles.')
    for (const [groupName, queries] of Object.entries(QUERY_GROUPS)) {
      for (const { terms, lang } of queries) {
        try {
          const { articles, totalResults } = await fetchQuery(groupName, terms, lang, errors)
          articlesFound += totalResults
          rawArticles.push(...articles.map((a) => normalizeNewsApiArticle(a, terms.join(' + '))))
        } catch (e) {
          const msg = `fetchQuery ${groupName} [${terms.join(' + ')}/${lang}] fatal: ${e.message}`
          console.warn('  ✗', msg)
          errors.push(msg)
        }
      }
    }
    keywordsUsed = ['source:newsapi', ...ALL_QUERY_LABELS]
  } else {
    // ── PRIMARY GDELT path ───────────────────────────────────────────────────
    const queryCount = buildGdeltQueries().length
    console.log(`\n[1/5] Fetching from GDELT DOC 2.0 (${queryCount} queries: 4 country batches covering 17 countries + 4 theme)...`)
    const { articles, perQuery, errors: gErrors } = await fetchAllGdelt({
      onProgress: ({ index, total, label, count, error }) => {
        if (error) console.warn(`  ✗ [${index}/${total}] ${label}: ${error}`)
        else if (count > 0) console.log(`  • [${index}/${total}] ${label}: +${count}`)
        else console.log(`  · [${index}/${total}] ${label}: 0`)
      },
    })
    rawArticles.push(...articles)
    articlesFound = articles.length // GDELT has no totalResults; count raw articles
    errors.push(...gErrors)
    keywordsUsed = ['source:gdelt', ...perQuery.map((p) => p.label)]
  }

  // Dedup within this run by URL.
  const byUrl = new Map()
  for (const a of rawArticles) {
    if (a?.url && !byUrl.has(a.url)) byUrl.set(a.url, a)
  }
  const candidates = [...byUrl.values()]
  console.log(`  Collected ${rawArticles.length} raw, ${candidates.length} unique by URL.`)

  // Dedup against existing rows in Supabase.
  let existing = new Set()
  try {
    existing = await filterNewUrls(candidates.map((a) => a.url))
  } catch (e) {
    errors.push(`dedupe failed: ${e.message}`)
  }
  const fresh = candidates.filter((a) => !existing.has(a.url))
  console.log(`  ${fresh.length} new (not already in cs_articles).`)

  // STEP 2 — categorize each new article with the strict relevance gate.
  console.log('\n[2/5] Categorizing with Claude (strict LATAM-drone relevance gate)...')
  // Learning loop: pull the editor's past approve/reject verdicts ONCE and feed
  // them to the gate as few-shot examples + source/category score weighting.
  const calibration = await fetchCalibration(supabase)
  if (calibration.hasData) {
    console.log(`  Calibrated from ${calibration.counts.approved} approved + ${calibration.counts.rejected} rejected past verdict(s).`)
  } else {
    console.log('  No human verdict history yet — gate runs un-calibrated (baseline).')
  }
  const rows = []
  let discardedLowRelevance = 0
  let learningAdjusted = 0
  for (const article of fresh) {
    const cat = await categorize(anthropic, {
      title: article.title,
      snippet: article.content_snippet || article.title || '',
      source: article.source_name,
    }, calibration)
    if (cat?.learning_note) learningAdjusted++
    if (cat) {
      if (!isRelevant(cat)) {
        discardedLowRelevance++
        continue // gate failed or score < threshold -> not a LATAM-drone article
      }
      rows.push(buildRow(article, cat))
    } else {
      // Claude failed (or not configured) -> store uncategorized for manual review.
      rows.push(buildRow(article, null))
    }
  }
  console.log(`  Prepared ${rows.length} relevant row(s); discarded ${discardedLowRelevance} as off-topic / low-relevance.`)

  // STEP 3 — insert into cs_articles.
  console.log('\n[3/5] Inserting into cs_articles...')
  let inserted = []
  if (rows.length > 0) {
    if (!supabase) {
      backupLocally(rows, 'no-supabase-client')
    } else {
      const CHUNK = 50
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('cs_articles')
          .insert(chunk)
          .select('id, title, url, source_name, published_at, primary_category, sub_category, confidence_level, status, claude_analysis')
        if (error) {
          console.warn('  ✗ Supabase insert failed:', error.message)
          errors.push(`insert failed: ${error.message}`)
          backupLocally(chunk, `insert-error: ${error.message}`)
        } else {
          inserted.push(...(data || []))
        }
      }
    }
  }
  const articlesNew = inserted.length
  console.log(`  Inserted ${articlesNew} new relevant article(s).`)

  const status = errors.length === 0 ? 'success' : 'error'
  const errorMessage = errors.length ? errors.slice(0, 20).join(' | ').slice(0, 4000) : null

  // STEP 4 — log the fetch.
  console.log('\n[4/5] Logging to cs_fetch_log...')
  if (supabase) {
    const { error } = await supabase.from('cs_fetch_log').insert({
      articles_found: articlesFound,
      articles_new: articlesNew,
      keywords_used: keywordsUsed, // first element tags the source (e.g. 'source:gdelt')
      status,
      error_message: errorMessage,
    })
    if (error) console.warn('  ✗ cs_fetch_log insert failed:', error.message)
    else console.log(`  Logged: source=${SOURCE}, found=${articlesFound}, new=${articlesNew}, status=${status}`)
  }

  // STEP 5 — notify (single-row status table for Hub realtime).
  console.log('\n[5/5] Updating cs_fetch_status...')
  if (supabase) {
    const { error } = await supabase
      .from('cs_fetch_status')
      .upsert({ id: 1, last_fetch: new Date().toISOString(), new_articles_count: articlesNew, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) console.warn('  ✗ cs_fetch_status upsert failed:', error.message)
    else console.log('  cs_fetch_status updated.')
  }

  // ── REPORT ──────────────────────────────────────────────────────────────
  const keptByGate = rows.filter((r) => r.status === 'new').length
  const uncategorized = rows.filter((r) => r.status === 'uncategorized').length
  const newRows = inserted.filter((r) => r.status === 'new')

  // Breakdown of kept articles by primary_category.
  const byCategory = {}
  for (const r of newRows) {
    const k = r.primary_category || '(none)'
    byCategory[k] = (byCategory[k] || 0) + 1
  }

  console.log(`\n=== ${SOURCE.toUpperCase()} FETCH REPORT ===`)
  console.log(`  1. Raw articles fetched (across all queries): ${rawArticles.length}`)
  console.log(`  2. Unique after URL dedup:                    ${candidates.length}`)
  console.log(`  3. New (not already in cs_articles):          ${fresh.length}`)
  console.log(`  4. Kept by Claude gate (score >= ${RELEVANCE_THRESHOLD}):          ${keptByGate}`)
  console.log(`  5. Discarded by gate (off-topic / low score): ${discardedLowRelevance}`)
  if (uncategorized) console.log(`     (+ ${uncategorized} stored 'uncategorized' — Claude eval failed)`)
  console.log('  6. Kept by primary_category:')
  const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
  if (catEntries.length) {
    for (const [cat, n] of catEntries) console.log(`       ${cat}: ${n}`)
  } else {
    console.log('       (none kept this run)')
  }

  // Learning loop summary: how much human feedback shaped this run.
  if (calibration.hasData) {
    console.log(`  6b. Learning: calibrated from ${calibration.counts.approved} approved + ${calibration.counts.rejected} rejected verdict(s); score nudged on ${learningAdjusted} article(s) this run.`)
  } else {
    console.log('  6b. Learning: no human verdict history yet (baseline gate).')
  }

  // 7. First 8 kept articles.
  console.log('\n  7. First 8 kept articles:')
  const preview = newRows.slice(0, 8)
  if (preview.length) {
    for (const r of preview) {
      let analysis = {}
      try { analysis = JSON.parse(r.claude_analysis || '{}') } catch { /* ignore */ }
      const countries = (analysis.countries || []).join(', ') || 'n/a'
      console.log(`\n   • ${r.title}`)
      console.log(`     source: ${r.source_name} | country: ${countries}`)
      console.log(`     category: ${r.primary_category} | confidence: ${r.confidence_level} | relevance: ${analysis.relevance_score ?? 'n/a'}`)
      console.log(`     url: ${r.url}`)
    }
  } else {
    console.log('     (no kept articles to preview this run)')
  }

  // Comparison to the previous NewsAPI run (88 raw -> 3 kept).
  const PREV_NEWSAPI = { raw: 88, kept: 3 }
  const prevRate = ((PREV_NEWSAPI.kept / PREV_NEWSAPI.raw) * 100).toFixed(1)
  const thisRate = rawArticles.length ? ((keptByGate / rawArticles.length) * 100).toFixed(1) : '0.0'
  console.log('\n=== HIT-RATE COMPARISON ===')
  console.log(`  Previous NewsAPI run: ${PREV_NEWSAPI.raw} raw -> ${PREV_NEWSAPI.kept} kept (${prevRate}% pass)`)
  console.log(`  This ${SOURCE.toUpperCase()} run:        ${rawArticles.length} raw -> ${keptByGate} kept (${thisRate}% pass)`)

  console.log(`\n=== Done. source=${SOURCE} found=${articlesFound} new=${articlesNew} status=${status} errors=${errors.length} ===\n`)
}

main().catch((e) => {
  // Top-level guard: even a catastrophic failure should exit 0 so the daily
  // schedule keeps running, but we surface the error loudly in the logs.
  console.error('FATAL (pipeline guarded):', e?.stack || e?.message || e)
  process.exit(0)
})
