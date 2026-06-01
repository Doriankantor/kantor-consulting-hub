// ============================================================================
// GDELT DOC 2.0 fetcher — primary news source for the Contested Skies pipeline.
// ============================================================================
// GDELT DOC 2.0 (https://api.gdeltproject.org/api/v2/doc/doc) is keyless and has
// no hard quota. It searches the FULL article body (not just the headline) and
// supports a native source-country filter using FIPS 2-letter codes. We combine
// a drone keyword OR-group with a `sourcecountry:` filter so we surface LATAM
// drone coverage from regional outlets, plus a handful of un-filtered actor /
// supplier queries to catch cross-border stories. The 17 countries are batched
// into 4 OR-ed region queries (not 17 separate calls) so the run survives
// GDELT's aggressive per-IP throttling — see COUNTRY_BATCHES below. Total: 8
// requests per run (4 country batches + 4 theme queries).
//
// IMPORTANT GDELT CONSTRAINTS (verified empirically against the live API):
//   • Search terms must be at least 5 characters. Shorter tokens (UAV, UAS,
//     dron, DJI, FARC, ELN, EMC, CJNG, FPV) are rejected with
//     "The specified phrase is too short." Because every OR-term shares one
//     query string, a single too-short token makes the ENTIRE query fail — so
//     those tokens are replaced here with >=5-char equivalents that preserve
//     intent (e.g. "unmanned aircraft" for UAS, "Mavic"/"Phantom" for DJI,
//     "guerrilla"/"Liberation Army" for FARC/ELN, "narco"/"cartel" for CJNG).
//   • The country operator is `sourcecountry:` (NOT `country:`, which does not
//     exist). It filters by the PUBLISHER's country, not the country the article
//     is about — so country queries surface regional/local press, and the
//     un-filtered theme queries catch international supplier coverage.
//   • Rate limit: GDELT asks for ~1 request / 5s and applies a sustained per-IP
//     penalty under heavier use. We pace at 15s between the ~8 queries and retry
//     up to 4× with escalating backoff on HTTP 429 so the run stays resilient.
// ============================================================================

import fetch from 'node-fetch'

export const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc'
export const GDELT_TIMESPAN = '72h'
export const GDELT_MAXRECORDS = 250
export const GDELT_DELAY_MS = 15000      // generous spacing between queries (only ~8/run)
export const GDELT_BACKOFF_MS = 12000    // base wait before a retry (escalates per attempt)
export const GDELT_MAX_RETRIES = 4       // GDELT throttles aggressively; retry hard on 429

// Drone keyword OR-group shared by every per-country query. Only GDELT-valid
// (>=5 char) tokens — see the constraint note above. "drones" doubles as the
// Spanish plural, so Spanish-language coverage is retained without "dron".
export const DRONE_GROUP =
  '("drone" OR "drones" OR "unmanned aerial" OR "unmanned aircraft" OR ' +
  '"loitering munition" OR "counter-drone" OR "anti-drone" OR "C-UAS")'

// 17 LATAM countries -> GDELT FIPS 2-letter source-country codes.
export const LATAM_COUNTRIES = [
  { name: 'Mexico', fips: 'MX' },
  { name: 'Guatemala', fips: 'GT' },
  { name: 'Honduras', fips: 'HO' },
  { name: 'El Salvador', fips: 'ES' },
  { name: 'Nicaragua', fips: 'NU' },
  { name: 'Costa Rica', fips: 'CS' },
  { name: 'Panama', fips: 'PM' },
  { name: 'Colombia', fips: 'CO' },
  { name: 'Venezuela', fips: 'VE' },
  { name: 'Ecuador', fips: 'EC' },
  { name: 'Peru', fips: 'PE' },
  { name: 'Bolivia', fips: 'BL' },
  { name: 'Brazil', fips: 'BR' },
  { name: 'Paraguay', fips: 'PA' },
  { name: 'Uruguay', fips: 'UY' },
  { name: 'Argentina', fips: 'AR' },
  { name: 'Chile', fips: 'CI' },
]

// All 17 countries ARE searched, but batched into region queries instead of 17
// separate requests. GDELT's free endpoint throttles ~1 req per several seconds
// (and applies a sustained per-IP penalty under repeated use), so 21 requests/run
// lost ~half to HTTP 429; batching the countries (GDELT supports OR-ed
// `sourcecountry:` filters) cuts the country search to 4 requests and reliably
// completes. 72h LATAM drone volume (~120 articles) is far under the 250-record
// cap, so a batch never truncates real coverage.
//
// Batch size is capped at 5 countries: GDELT also enforces a query-LENGTH limit
// ("Your query was too short or too long.") — a 5-country batch is ~213 chars and
// works; a 10-country batch (~290 chars) is rejected. Keep each batch <= 5.
export const COUNTRY_BATCHES = [
  { label: 'batch1 (CO VE EC PE BR)', fips: ['CO', 'VE', 'EC', 'PE', 'BR'] },
  { label: 'batch2 (BL PA UY AR CI)', fips: ['BL', 'PA', 'UY', 'AR', 'CI'] },
  { label: 'batch3 (MX GT HO ES NU)', fips: ['MX', 'GT', 'HO', 'ES', 'NU'] },
  { label: 'batch4 (CS PM)', fips: ['CS', 'PM'] },
]

// 4 actor / cross-border supplier theme queries (NO country filter). Reworked to
// drop sub-5-char tokens while keeping the original intent:
//   • DJI    -> "Mavic"/"Phantom" (DJI product lines) + "Bayraktar"/"quadcopter"
//   • FARC/ELN/EMC -> "guerrilla"/"guerrillas"/"disidencias"/"Liberation Army"
//   • CJNG   -> "Sinaloa"/"cartel"/"narco"
export const THEME_QUERIES = [
  {
    label: 'iranian-supplier',
    query: '("Iranian drone" OR "Shahed" OR "Mohajer") AND (Venezuela OR "Latin America")',
  },
  {
    label: 'guerrilla-actors',
    query: '("guerrilla" OR "guerrillas" OR "disidencias" OR "Liberation Army" OR "Revolutionary Armed Forces") AND (drone OR drones)',
  },
  {
    label: 'cartel-actors',
    query: '("Sinaloa" OR "cartel" OR "cartels" OR "narco") AND (drone OR drones)',
  },
  {
    label: 'manufacturers',
    query: '("Bayraktar" OR "Mavic" OR "Phantom" OR "quadcopter") AND ("Latin America" OR Colombia OR Mexico OR Venezuela OR Brazil)',
  },
]

// Build the full ordered list of GDELT query descriptors:
// 4 batched country queries (covering all 17 countries) + 4 theme queries = 8.
export function buildGdeltQueries() {
  const countryQueries = COUNTRY_BATCHES.map((b) => ({
    label: b.label,
    country: null,
    query: `${DRONE_GROUP} (${b.fips.map((f) => `sourcecountry:${f}`).join(' OR ')})`,
  }))
  const themeQueries = THEME_QUERIES.map((t) => ({
    label: t.label,
    country: null,
    query: t.query,
  }))
  return [...countryQueries, ...themeQueries]
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const snippet = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 200)

// Parse GDELT `seendate` (YYYYMMDDTHHMMSSZ) -> ISO 8601 timestamp string.
export function parseSeenDate(seendate) {
  if (!seendate || typeof seendate !== 'string') return null
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (m) {
    const [, y, mo, d, h, mi, s] = m
    return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
  }
  const d = new Date(seendate)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Normalize one GDELT ArtList article into the neutral shape the pipeline uses.
// GDELT provides no body snippet, so content_snippet is left null here and the
// caller falls back to the title (the Claude gate works from title + source).
export function normalizeGdeltArticle(a, queryLabel) {
  return {
    url: a.url || null,
    title: a.title || null,
    source_name: a.domain || null,          // GDELT "domain" -> publication name
    published_at: parseSeenDate(a.seendate),
    content_snippet: null,                   // GDELT has no snippet
    language: a.language || null,
    image_url: a.socialimage || null,        // kept for logging; no DB column yet
    source_country: a.sourcecountry || null, // kept for logging; no DB column yet
    found_by_query: queryLabel,
  }
}

// Run ONE GDELT query. Returns { articles, error } and NEVER throws, so a single
// bad query can't crash the run. GDELT throttles aggressively and signals it BOTH
// as an HTTP 429 AND as a 200 with a plain-text "limit requests" body — we treat
// either as retryable with escalating backoff. Genuine errors (bad query, short
// phrase) are returned without retry so we don't waste time on them.
export async function fetchGdeltQuery({ label, query }, { retries = GDELT_MAX_RETRIES } = {}) {
  const url = new URL(GDELT_ENDPOINT)
  url.searchParams.set('query', query)
  url.searchParams.set('mode', 'ArtList')
  url.searchParams.set('format', 'json')
  url.searchParams.set('maxrecords', String(GDELT_MAXRECORDS))
  url.searchParams.set('timespan', GDELT_TIMESPAN)
  url.searchParams.set('sort', 'DateDesc')

  let lastError = 'exhausted retries'
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'KantorIntel/1.0 (Contested Skies monitor)' },
      })
      const text = await res.text()
      const trimmed = (text || '').trim()

      // Throttled? GDELT uses HTTP 429 and/or a plain-text "limit requests" body.
      const throttled = res.status === 429 || /limit requests|one every/i.test(trimmed)
      if (throttled) {
        lastError = `throttled (HTTP ${res.status})`
        if (attempt < retries) {
          await sleep(GDELT_BACKOFF_MS * (attempt + 1)) // 10s, 20s, 30s, 40s
          continue
        }
        return { articles: [], error: lastError }
      }

      if (!res.ok) {
        return { articles: [], error: `HTTP ${res.status}: ${snippet(text)}` }
      }

      // Valid JSON responses start with '{'. Anything else is a GDELT text error
      // (e.g. "The specified phrase is too short.") — not retryable.
      if (!trimmed.startsWith('{')) {
        return { articles: [], error: snippet(trimmed) || 'empty response' }
      }

      let body
      try {
        body = JSON.parse(trimmed)
      } catch {
        return { articles: [], error: `non-JSON response: ${snippet(trimmed)}` }
      }

      const articles = Array.isArray(body.articles) ? body.articles : []
      return { articles: articles.map((a) => normalizeGdeltArticle(a, label)), error: null }
    } catch (e) {
      lastError = `threw: ${e.message}`
      if (attempt < retries) {
        await sleep(GDELT_BACKOFF_MS * (attempt + 1))
        continue
      }
      return { articles: [], error: lastError }
    }
  }
  return { articles: [], error: lastError }
}

// Fetch ALL 21 GDELT queries politely (6s between calls). Never throws.
// Returns { articles, perQuery, errors, queryCount }.
//   articles : flat array of normalized articles (with cross-query duplicates)
//   perQuery : [{ label, count, error }] per query, in order
//   errors   : human-readable error strings for the run log
export async function fetchAllGdelt({ onProgress } = {}) {
  const queries = buildGdeltQueries()
  const articles = []
  const perQuery = []
  const errors = []

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]
    const { articles: got, error } = await fetchGdeltQuery(q)
    if (error) errors.push(`GDELT [${q.label}]: ${error}`)
    perQuery.push({ label: q.label, count: got.length, error })
    articles.push(...got)
    if (typeof onProgress === 'function') {
      onProgress({ index: i + 1, total: queries.length, label: q.label, count: got.length, error })
    }
    if (i < queries.length - 1) await sleep(GDELT_DELAY_MS)
  }

  return { articles, perQuery, errors, queryCount: queries.length }
}
