// ─────────────────────────────────────────────────────────────────────────────
// Social-a: URL metadata fetcher (main process). Fetches a URL's HTML and pulls
// OpenGraph/meta tags into structured metadata. Reuses the native `fetch` already
// used across the codebase (GDELT/NewsAPI, live_url pings, GitHub API, Anthropic).
//
// No new dependency — OpenGraph/meta tags are well-structured, so we extract via
// string/regex rather than pulling in cheerio/jsdom.
//
// A blocked/login-walled URL (X, Instagram, TikTok, …) is a NORMAL, EXPECTED
// outcome (reason:'blocked'), NOT an exception — the caller falls back to manual
// entry. The function NEVER throws; every path resolves the {ok} union.
// ─────────────────────────────────────────────────────────────────────────────

export interface UrlMetadata {
  title?: string
  description?: string
  site_name?: string
  author?: string
  published?: string
  image?: string
  url: string
  platform?: string
}

export type UrlMetadataResponse =
  | { ok: true; metadata: UrlMetadata }
  | { ok: false; error: string; reason: 'blocked' | 'timeout' | 'not_html' | 'fetch_failed' | 'invalid_url' }

// A browser-like UA — many sites 403 a bare fetch/no-UA request.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 512 * 1024 // only the <head> matters for meta tags; cap the read

export async function fetchUrlMetadata(url: string): Promise<UrlMetadataResponse> {
  // 1) Validate — must be http(s).
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: 'Not a valid URL.', reason: 'invalid_url' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'URL must be http or https.', reason: 'invalid_url' }
  }

  // 2) Fetch with a browser-like UA, timeout, and redirect follow.
  let res: Response
  try {
    res = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: timeoutSignal(TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
  } catch (e) {
    // AbortController fires an AbortError on timeout; everything else is a network fail.
    if (isAbortError(e)) return { ok: false, error: 'Timed out reading the URL.', reason: 'timeout' }
    return { ok: false, error: errMsg(e), reason: 'fetch_failed' }
  }

  // 3) Non-OK (403/401/429/…) — the expected path for login-walled/blocked sites.
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}`, reason: 'blocked' }
  }

  // 4) Must be HTML to have meta tags.
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (contentType && !contentType.includes('html')) {
    return { ok: false, error: `Not HTML (${contentType.split(';')[0]}).`, reason: 'not_html' }
  }

  // 5) Read the HTML (capped), then extract meta tags.
  let html: string
  try {
    html = await readCapped(res, MAX_HTML_BYTES)
  } catch (e) {
    if (isAbortError(e)) return { ok: false, error: 'Timed out reading the URL.', reason: 'timeout' }
    return { ok: false, error: errMsg(e), reason: 'fetch_failed' }
  }

  const finalUrl = res.url || parsed.toString()
  const head = html.slice(0, MAX_HTML_BYTES) // meta tags live in <head>

  const metadata: UrlMetadata = {
    url: finalUrl,
    title: metaTag(head, 'og:title') ?? titleTag(head),
    description: metaTag(head, 'og:description') ?? metaName(head, 'description'),
    site_name: metaTag(head, 'og:site_name'),
    author: metaTag(head, 'article:author') ?? metaName(head, 'author'),
    published: metaTag(head, 'article:published_time') ?? metaTag(head, 'og:updated_time'),
    image: metaTag(head, 'og:image'),
    platform: platformFromHost(parsed.hostname),
  }

  // Drop empty keys so callers can cleanly test presence.
  for (const k of Object.keys(metadata) as (keyof UrlMetadata)[]) {
    if (metadata[k] === undefined || metadata[k] === '') delete metadata[k]
  }
  metadata.url = finalUrl // always keep url

  return { ok: true, metadata }
}

// ── Extraction helpers (string/regex — property/name order-independent) ──────

// Match <meta property="og:title" content="…"> OR content-before-property order.
function metaTag(html: string, property: string): string | undefined {
  const p = escapeRe(property)
  const a = html.match(new RegExp(`<meta[^>]+property=["']${p}["'][^>]*content=["']([^"']*)["']`, 'i'))
  if (a?.[1]) return decodeEntities(a[1].trim()) || undefined
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${p}["']`, 'i'))
  if (b?.[1]) return decodeEntities(b[1].trim()) || undefined
  return undefined
}

// Match <meta name="description" content="…"> (either attribute order).
function metaName(html: string, name: string): string | undefined {
  const n = escapeRe(name)
  const a = html.match(new RegExp(`<meta[^>]+name=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i'))
  if (a?.[1]) return decodeEntities(a[1].trim()) || undefined
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${n}["']`, 'i'))
  if (b?.[1]) return decodeEntities(b[1].trim()) || undefined
  return undefined
}

function titleTag(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (m?.[1]) return decodeEntities(m[1].replace(/\s+/g, ' ').trim()) || undefined
  return undefined
}

function platformFromHost(hostname: string): string {
  const h = hostname.replace(/^www\./, '').toLowerCase()
  if (h === 'x.com' || h.endsWith('twitter.com')) return 'X'
  if (h.endsWith('instagram.com')) return 'Instagram'
  if (h.endsWith('tiktok.com')) return 'TikTok'
  if (h.endsWith('youtube.com') || h === 'youtu.be') return 'YouTube'
  if (h.endsWith('facebook.com') || h === 'fb.com') return 'Facebook'
  if (h.endsWith('linkedin.com')) return 'LinkedIn'
  if (h.endsWith('reddit.com')) return 'Reddit'
  if (h.endsWith('t.me') || h.endsWith('telegram.me')) return 'Telegram'
  if (h.endsWith('bsky.app')) return 'Bluesky'
  if (h.endsWith('mastodon.social')) return 'Mastodon'
  return h
}

// Minimal HTML entity decode for extracted attribute text.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// ── fetch/stream utilities ───────────────────────────────────────────────────

// Read the response body but stop after `maxBytes` (meta tags are in <head>);
// avoids buffering huge pages. Falls back to res.text() if the body isn't a stream.
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body as ReadableStream<Uint8Array> | null
  if (!body || typeof body.getReader !== 'function') {
    const text = await res.text()
    return text.slice(0, maxBytes)
  }
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let out = ''
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        out += decoder.decode(value, { stream: true })
        if (total >= maxBytes || /<\/head>/i.test(out)) break // enough for meta tags
      }
    }
  } finally {
    try { await reader.cancel() } catch { /* ignore */ }
  }
  return out
}

// AbortSignal.timeout is available in Electron 31 / Node 20; guard anyway.
function timeoutSignal(ms: number): AbortSignal | undefined {
  const AS = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  setTimeout(() => c.abort(), ms)
  return c.signal
}

function isAbortError(e: unknown): boolean {
  return (e as { name?: string })?.name === 'AbortError' || (e as { name?: string })?.name === 'TimeoutError'
}

function errMsg(e: unknown): string {
  return String((e as Error)?.message || e).slice(0, 200)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
