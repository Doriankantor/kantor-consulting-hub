// ============================================================================
// Daily Intelligence Fetch — NewsAPI -> Claude categorization -> Supabase
// ============================================================================
// Pipeline (each stage is isolated so one failure never stops the whole run):
//   1. Fetch drone-related articles from NewsAPI (/v2/everything), es + en,
//      last 24h, paged, deduped by URL against existing cs_articles.
//   2. Categorize each new article with Claude Haiku (claude-haiku-4-5).
//      Keep only relevance_score >= 5. Claude failure -> store 'uncategorized'.
//   3. Insert categorized/uncategorized articles into cs_articles.
//   4. Log the run into cs_fetch_log.
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
import Anthropic from '@anthropic-ai/sdk'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Load the repo-root .env for local runs. In GitHub Actions the file is absent
// and the secrets arrive as real env vars (dotenv never overrides those).
dotenvConfig({ path: resolve(__dirname, '..', '.env') })

// ── Config ──────────────────────────────────────────────────────────────────
const NEWSAPI_KEY = process.env.NEWSAPI_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CLAUDE_MODEL = 'claude-haiku-4-5'
const LANGUAGES = ['en', 'es']
const PAGE_SIZE = 100
const MAX_PAGES = 5 // safety cap per query/language (NewsAPI dev plan is limited)
const RELEVANCE_THRESHOLD = 5

const KEYWORD_GROUPS = {
  'drone-operations': [
    'drone strike', 'drone attack', 'weaponized drone', 'armed drone',
    'drone warfare', 'loitering munition', 'kamikaze drone', 'FPV drone',
    'drone swarm', 'drone proliferation', 'criminal drone', 'cartel drone',
    'narco drone', 'drone bomb', 'drone explosive',
  ],
  'counter-drone': [
    'counter drone', 'anti-drone', 'drone jamming', 'drone interception',
    'C-UAS', 'counter-UAS', 'drone defense', 'drone detection',
  ],
  'procurement-industry': [
    'drone purchase', 'UAV procurement', 'drone contract', 'drone manufacturer',
    'DJI export', 'drone regulation', 'drone export control', 'autonomous weapons',
  ],
  'regional': [
    'drone Colombia', 'drone Venezuela', 'drone Mexico', 'drone Brazil',
    'drone Latin America', 'drone LATAM', 'drone cartel', 'drone FARC',
    'drone ELN', 'drone CJNG', 'Iranian drone', 'drone Ukraine Russia',
  ],
}

const ALL_KEYWORDS = Object.values(KEYWORD_GROUPS).flat()

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

let anthropic = null
if (ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
} else {
  console.warn('[config] ANTHROPIC_API_KEY missing — articles will be stored uncategorized.')
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function isoHoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString()
}

function buildQuery(phrases) {
  // NewsAPI OR-combines quoted phrases. Keep under the 500-char q limit.
  return phrases.map((p) => `"${p}"`).join(' OR ')
}

// STEP 1 — fetch one keyword group in one language, paging through results.
async function fetchGroup(groupName, phrases, language, errors) {
  const q = buildQuery(phrases)
  const from = isoHoursAgo(24)
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
        const msg = `NewsAPI [${groupName}/${language}] p${page}: ${res.status} ${body.code || ''} ${body.message || ''}`.trim()
        console.warn('  ✗', msg)
        errors.push(msg)
        break // stop paging this query; move on to the next
      }

      totalResults = body.totalResults || 0
      const articles = body.articles || []
      collected.push(...articles)
      console.log(`  • ${groupName}/${language} p${page}: +${articles.length} (total reported ${totalResults})`)

      if (articles.length < PAGE_SIZE || collected.length >= totalResults) break
      await sleep(250) // be gentle with the API
    } catch (e) {
      const msg = `NewsAPI [${groupName}/${language}] p${page} threw: ${e.message}`
      console.warn('  ✗', msg)
      errors.push(msg)
      break
    }
  }

  return { articles: collected, totalResults }
}

// STEP 2 — categorize a single article with Claude. Returns the parsed object
// or null on any failure (caller then stores the article 'uncategorized').
async function categorize(article) {
  if (!anthropic) return null

  const title = article.title || ''
  const snippet = (article.description || article.content || '').slice(0, 500)
  const source = article.source?.name || 'Unknown'

  const prompt = `You are categorizing a news article about drones in Latin America for an intelligence database.

Article title: ${title}
Article snippet: ${snippet}
Source: ${source}

Respond ONLY with a JSON object, no other text:
{
  "primary_category": one of [offensive, defensive, procurement, industry, regulatory, criminal, diplomatic],
  "sub_category": one of [kinetic_strike, reconnaissance, chemical_payload, prison_drop, smuggling, kamikaze, cuav_deployment, interception, jamming, detection, state_purchase, company_funding, rd_announcement, budget, new_manufacturer, new_platform, tech_development, export_deal, acquisition, new_law, agreement, sanctions, cartel_use, new_actor, tactic_evolution, training, foreign_supplier, state_transfer, extra_regional, general],
  "confidence_suggestion": one of [high, medium, low],
  "confidence_reasoning": "brief explanation",
  "relevance_score": number between 0 and 10,
  "key_actors": ["list", "of", "actors", "mentioned"],
  "countries": ["list", "of", "countries", "mentioned"],
  "summary": "one sentence summary"
}`

  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (msg.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    // Strip ```json fences / extract the first {...} block.
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    const jsonStr = cleaned.startsWith('{') ? cleaned : cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonStr)
    return parsed
  } catch (e) {
    console.warn(`  ✗ Claude categorization failed for "${title.slice(0, 60)}": ${e.message}`)
    return null
  }
}

// Map a NewsAPI article + Claude categorization to a cs_articles row.
function buildRow(article, cat) {
  return {
    title: article.title || null,
    url: article.url || null,
    source_name: article.source?.name || null,
    published_at: article.publishedAt || null,
    content_snippet: (article.description || article.content || '').slice(0, 500) || null,
    primary_category: cat?.primary_category || null,
    sub_category: cat?.sub_category || null,
    confidence_level: cat?.confidence_suggestion || 'unrated',
    claude_analysis: cat ? JSON.stringify(cat) : null,
    status: cat ? 'new' : 'uncategorized',
    imported_to_hub: false,
  }
}

// Query existing URLs in cs_articles (chunked) so we only process genuinely new ones.
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
  console.log(`\n=== Daily Intelligence Fetch @ ${startedAt} ===`)
  if (!NEWSAPI_KEY) console.warn('[config] NEWSAPI_KEY is empty — NewsAPI calls will return 401 and yield 0 articles.')

  const errors = []
  let articlesFound = 0
  const rawArticles = []

  // STEP 1 — fetch everything
  console.log('\n[1/5] Fetching from NewsAPI...')
  for (const [groupName, phrases] of Object.entries(KEYWORD_GROUPS)) {
    for (const language of LANGUAGES) {
      try {
        const { articles, totalResults } = await fetchGroup(groupName, phrases, language, errors)
        articlesFound += totalResults
        rawArticles.push(...articles)
      } catch (e) {
        const msg = `fetchGroup ${groupName}/${language} fatal: ${e.message}`
        console.warn('  ✗', msg)
        errors.push(msg)
      }
    }
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

  // STEP 2 + filter — categorize each new article.
  console.log('\n[2/5] Categorizing with Claude...')
  const rows = []
  let discardedLowRelevance = 0
  for (const article of fresh) {
    const cat = await categorize(article)
    if (cat) {
      const score = Number(cat.relevance_score)
      if (Number.isFinite(score) && score < RELEVANCE_THRESHOLD) {
        discardedLowRelevance++
        continue // discard per spec (score < 5)
      }
      rows.push(buildRow(article, cat))
    } else {
      // Claude failed (or not configured) -> store uncategorized.
      rows.push(buildRow(article, null))
    }
  }
  console.log(`  Prepared ${rows.length} row(s); discarded ${discardedLowRelevance} low-relevance.`)

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
  console.log(`  Inserted ${articlesNew} new article(s).`)

  const status = errors.length === 0 ? 'success' : 'error'
  const errorMessage = errors.length ? errors.slice(0, 20).join(' | ').slice(0, 4000) : null

  // STEP 4 — log the fetch.
  console.log('\n[4/5] Logging to cs_fetch_log...')
  if (supabase) {
    const { error } = await supabase.from('cs_fetch_log').insert({
      articles_found: articlesFound,
      articles_new: articlesNew,
      keywords_used: ALL_KEYWORDS,
      status,
      error_message: errorMessage,
    })
    if (error) console.warn('  ✗ cs_fetch_log insert failed:', error.message)
    else console.log(`  Logged: found=${articlesFound}, new=${articlesNew}, status=${status}`)
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

  // Show the first 3 fetched + categorized articles.
  const categorizedPreview = inserted.filter((r) => r.status === 'new').slice(0, 3)
  if (categorizedPreview.length) {
    console.log('\n=== First 3 fetched + categorized articles ===')
    for (const r of categorizedPreview) {
      let analysis = {}
      try { analysis = JSON.parse(r.claude_analysis || '{}') } catch { /* ignore */ }
      console.log(`\n• ${r.title}`)
      console.log(`  source: ${r.source_name} | published: ${r.published_at}`)
      console.log(`  category: ${r.primary_category} / ${r.sub_category} | confidence: ${r.confidence_level}`)
      console.log(`  relevance: ${analysis.relevance_score ?? 'n/a'} | summary: ${analysis.summary ?? 'n/a'}`)
      console.log(`  url: ${r.url}`)
    }
  } else {
    console.log('\n(No categorized articles to preview this run.)')
  }

  console.log(`\n=== Done. found=${articlesFound} new=${articlesNew} status=${status} errors=${errors.length} ===\n`)
}

main().catch((e) => {
  // Top-level guard: even a catastrophic failure should exit 0 so the daily
  // schedule keeps running, but we surface the error loudly in the logs.
  console.error('FATAL (pipeline guarded):', e?.stack || e?.message || e)
  process.exit(0)
})
