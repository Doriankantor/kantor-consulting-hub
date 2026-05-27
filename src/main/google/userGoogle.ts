import { createServer } from 'http'
import { shell } from 'electron'
import { google } from 'googleapis'
import { getDatabase } from '../db'

// ── Credentials (injected at build time from .env) ──────────────────────────
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

// Scopes: Calendar read/write + Drive read-only + profile
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

// ── Loopback OAuth helper ────────────────────────────────────────────────────
// Starts a one-shot local HTTP server, opens the browser with the auth URL,
// waits for Google to redirect back with ?code=..., then shuts down the server.
function startLoopbackFlow(clientId: string, clientSecret: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url  = new URL(req.url ?? '/', 'http://localhost')
        const code = url.searchParams.get('code')
        const err  = url.searchParams.get('error')

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!DOCTYPE html><html><head><title>Kantor Hub</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;">
          ${code
            ? '<h2 style="color:#22c55e">✓ Authorization complete</h2><p>You can close this tab and return to Kantor Consulting Hub.</p>'
            : `<h2 style="color:#ef4444">Authorization failed</h2><p>${err ?? 'Unknown error'}</p>`
          }
        </body></html>`)

        server.close()
        if (code) resolve(code)
        else reject(new Error(err ?? 'No authorization code received'))
      } catch (e: any) {
        server.close()
        reject(e)
      }
    })

    server.on('error', reject)

    // Listen on a random available port
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      const redirectUri = `http://localhost:${port}`

      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
      })

      // Open browser and attach redirect URI to the promise so we can use it
      // when exchanging the code. Pass it back via a WeakMap trick or just
      // store on the server object.
      ;(server as any).__redirectUri = redirectUri
      ;(server as any).__client      = client

      shell.openExternal(authUrl)
    })

    // 5-minute timeout
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Authorization timed out after 5 minutes'))
    }, 5 * 60 * 1000)

    server.on('close', () => clearTimeout(timeout))
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Full automated connect flow. Opens browser, waits for redirect, stores tokens. */
export async function connectUserGoogle(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { ok: false, error: 'Google OAuth credentials not configured.' }
  }
  try {
    // We need the client and redirect URI that were created inside startLoopbackFlow.
    // Re-implement inline so we can share the OAuth2 client instance.
    const code = await new Promise<{ code: string; redirectUri: string; client: any }>((resolve, reject) => {
      const server = createServer((req, res) => {
        try {
          const url      = new URL(req.url ?? '/', 'http://localhost')
          const code     = url.searchParams.get('code')
          const errParam = url.searchParams.get('error')

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<!DOCTYPE html><html><head><title>Kantor Hub</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;">
            ${code
              ? '<h2 style="color:#22c55e">✓ Connected to Kantor Hub</h2><p>You can close this tab.</p>'
              : `<h2 style="color:#ef4444">Connection failed</h2><p>${errParam ?? 'Unknown error'}</p>`
            }
          </body></html>`)

          server.close()
          if (code) resolve({ code, redirectUri: (server as any).__redirectUri, client: (server as any).__client })
          else reject(new Error(errParam ?? 'No authorization code received'))
        } catch (e: any) { server.close(); reject(e) }
      })

      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const port        = (server.address() as { port: number }).port
        const redirectUri = `http://localhost:${port}`
        const client      = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri)
        const authUrl     = client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
          prompt: 'consent',
        })
        ;(server as any).__redirectUri = redirectUri
        ;(server as any).__client      = client
        shell.openExternal(authUrl)
      })

      const t = setTimeout(() => { server.close(); reject(new Error('Authorization timed out')) }, 5 * 60 * 1000)
      server.on('close', () => clearTimeout(t))
    })

    // Exchange code for tokens using the same client (same redirect URI)
    const { tokens } = await code.client.getToken(code.code)
    if (!tokens.refresh_token) {
      // Google withholds the refresh token when the user already authorized this app.
      // The existing refresh token is still valid — just update the scopes to reflect re-auth.
      const existing = getDatabase()
        .prepare('SELECT refresh_token FROM user_google_tokens WHERE user_id=?')
        .get(userId) as { refresh_token: string } | undefined
      if (existing?.refresh_token) {
        getDatabase()
          .prepare("UPDATE user_google_tokens SET scopes=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
          .run(SCOPES.join(' '), userId)
        return { ok: true }
      }
      return { ok: false, error: 'No refresh token — please revoke app access at myaccount.google.com/permissions and try again.' }
    }

    getDatabase()
      .prepare(`INSERT INTO user_google_tokens (user_id, refresh_token, scopes, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          refresh_token = excluded.refresh_token,
          scopes        = excluded.scopes,
          updated_at    = CURRENT_TIMESTAMP`)
      .run(userId, tokens.refresh_token, SCOPES.join(' '))

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

export function getUserGoogleStatus(userId: string): { connected: boolean } {
  const row = getDatabase().prepare('SELECT user_id FROM user_google_tokens WHERE user_id=?').get(userId)
  return { connected: !!row }
}

export function disconnectUserGoogle(userId: string): void {
  getDatabase().prepare('DELETE FROM user_google_tokens WHERE user_id=?').run(userId)
}

export function getUserGoogleClient(userId: string): InstanceType<typeof google.auth.OAuth2> | null {
  const row = getDatabase()
    .prepare('SELECT refresh_token FROM user_google_tokens WHERE user_id=?')
    .get(userId) as { refresh_token: string } | undefined
  if (!row) return null
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'http://localhost')
  client.setCredentials({ refresh_token: row.refresh_token })
  return client
}

const GOOGLE_COLORS: Record<string, string> = {
  '1':'#7986cb','2':'#33b679','3':'#8e24aa','4':'#e67c73',
  '5':'#f6c026','6':'#f5511d','7':'#039be5','8':'#616161',
  '9':'#3f51b5','10':'#0b8043','11':'#d60000'
}

export async function getUserCalendars(userId: string): Promise<{ id: string; summary: string; backgroundColor: string; foregroundColor: string; primary: boolean; accessRole: string }[] | { needsReauth: true }> {
  const db = getDatabase()
  let tokenRow: { refresh_token: string; scopes: string | null } | undefined
  try {
    tokenRow = db.prepare('SELECT refresh_token, scopes FROM user_google_tokens WHERE user_id=?').get(userId) as typeof tokenRow
  } catch {
    // scopes column missing on old installs — fall back to just refresh_token
    try {
      const r = db.prepare('SELECT refresh_token FROM user_google_tokens WHERE user_id=?').get(userId) as { refresh_token: string } | undefined
      if (r) tokenRow = { refresh_token: r.refresh_token, scopes: null }
    } catch { return { needsReauth: true } }
  }
  if (!tokenRow) return { needsReauth: true }

  // If we know the stored scopes and they don't include calendar, force re-auth
  if (tokenRow.scopes && !tokenRow.scopes.includes('calendar')) {
    return { needsReauth: true }
  }

  const client = getUserGoogleClient(userId)
  if (!client) return { needsReauth: true }
  try {
    const cal = google.calendar({ version: 'v3', auth: client })
    const res = await cal.calendarList.list({ minAccessRole: 'reader' })
    return (res.data.items ?? []).map(c => ({
      id: c.id ?? '',
      summary: c.summary ?? '',
      backgroundColor: c.backgroundColor ?? '#6366f1',
      foregroundColor: c.foregroundColor ?? '#ffffff',
      primary: !!(c.primary),
      accessRole: c.accessRole ?? 'reader',
    }))
  } catch (e: any) {
    const msg: string = e.message ?? ''
    // Only signal re-auth for genuine authentication/authorisation failures
    const isAuthError =
      e.code === 401 ||
      msg.includes('invalid_grant') ||
      msg.includes('Token has been expired') ||
      (e.code === 403 && (msg.includes('insufficient') || msg.includes('forbidden') || msg.includes('scope')))
    if (isAuthError) return { needsReauth: true }
    // Other 403s (e.g. "Calendar API not enabled") or network errors → empty, don't force re-auth
    return []
  }
}

export async function getUserCalendarEvents(
  userId: string,
  calendarId: string,
  startDate: string,
  endDate: string,
  calendarColor?: string
): Promise<{ id: string; summary: string; start: string; end: string; allDay: boolean; color: string; location?: string; meetingLink?: string; calendarId: string }[]> {
  const client = getUserGoogleClient(userId)
  if (!client) return []

  const GOOGLE_EVENT_COLORS: Record<string, string> = {
    '1':'#7986cb','2':'#33b679','3':'#8e24aa','4':'#e67c73',
    '5':'#f6c026','6':'#f5511d','7':'#039be5','8':'#616161',
    '9':'#3f51b5','10':'#0b8043','11':'#d60000'
  }

  try {
    const cal = google.calendar({ version: 'v3', auth: client })
    const res = await cal.events.list({
      calendarId,
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate + 'T23:59:59').toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500,
      showDeleted: false,
    })
    return (res.data.items ?? []).map(ev => {
      const startStr = ev.start?.dateTime ?? ev.start?.date ?? ''
      const endStr   = ev.end?.dateTime   ?? ev.end?.date   ?? ''
      const allDay   = !ev.start?.dateTime
      // Color: use event colorId if set, else use calendar color
      const color = ev.colorId ? (GOOGLE_EVENT_COLORS[ev.colorId] ?? calendarColor ?? '#6366f1') : (calendarColor ?? '#6366f1')
      // Meeting link: hangoutLink is Google Meet, or check conferenceData, or URL in location
      let meetingLink = ev.hangoutLink ?? undefined
      if (!meetingLink && ev.conferenceData?.entryPoints) {
        const videoEntry = ev.conferenceData.entryPoints.find(e => e.entryPointType === 'video')
        if (videoEntry?.uri) meetingLink = videoEntry.uri
      }
      return {
        id: ev.id ?? crypto.randomUUID(),
        summary: ev.summary ?? '(No title)',
        start: startStr,
        end: endStr,
        allDay,
        color,
        location: ev.location ?? undefined,
        meetingLink,
        calendarId,
      }
    })
  } catch { return [] }
}
