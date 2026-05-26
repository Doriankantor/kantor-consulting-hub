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
      return { ok: false, error: 'No refresh token — please revoke app access in your Google account and try again.' }
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
