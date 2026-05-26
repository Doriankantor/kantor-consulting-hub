import { google } from 'googleapis'
import { getDatabase } from '../db'

const CLIENT_ID     = process.env.MAIN_VITE_GOOGLE_CLIENT_ID     ?? ''
const CLIENT_SECRET = process.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? ''
const REDIRECT_URI  = 'urn:ietf:wg:oauth:2.0:oob'

// Scopes: Calendar read/write + Drive read-only
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

export function getUserGoogleAuthUrl(): string {
  const db = getDatabase()
  const clientId     = (db.prepare("SELECT value FROM settings WHERE key='google_client_id'").get() as any)?.value ?? CLIENT_ID
  const clientSecret = (db.prepare("SELECT value FROM settings WHERE key='google_client_secret'").get() as any)?.value ?? CLIENT_SECRET
  const client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export async function exchangeUserGoogleCode(userId: string, code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getDatabase()
    const clientId     = (db.prepare("SELECT value FROM settings WHERE key='google_client_id'").get() as any)?.value ?? CLIENT_ID
    const clientSecret = (db.prepare("SELECT value FROM settings WHERE key='google_client_secret'").get() as any)?.value ?? CLIENT_SECRET
    const client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
    const { tokens } = await client.getToken(code)
    if (!tokens.refresh_token) return { ok: false, error: 'No refresh token received. Please revoke and retry.' }
    db.prepare(`INSERT INTO user_google_tokens (user_id, refresh_token, scopes, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET refresh_token=excluded.refresh_token, scopes=excluded.scopes, updated_at=CURRENT_TIMESTAMP`)
      .run(userId, tokens.refresh_token, SCOPES.join(' '))
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

export function getUserGoogleStatus(userId: string): { connected: boolean } {
  const db = getDatabase()
  const row = db.prepare('SELECT user_id FROM user_google_tokens WHERE user_id=?').get(userId)
  return { connected: !!row }
}

export function disconnectUserGoogle(userId: string): void {
  getDatabase().prepare('DELETE FROM user_google_tokens WHERE user_id=?').run(userId)
}

export function getUserGoogleClient(userId: string): InstanceType<typeof google.auth.OAuth2> | null {
  const db = getDatabase()
  const row = db.prepare('SELECT refresh_token FROM user_google_tokens WHERE user_id=?').get(userId) as { refresh_token: string } | undefined
  if (!row) return null
  const clientId     = (db.prepare("SELECT value FROM settings WHERE key='google_client_id'").get() as any)?.value ?? CLIENT_ID
  const clientSecret = (db.prepare("SELECT value FROM settings WHERE key='google_client_secret'").get() as any)?.value ?? CLIENT_SECRET
  const client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
  client.setCredentials({ refresh_token: row.refresh_token })
  return client
}

// Keep getClient in scope to avoid unused import warning
void getClient
