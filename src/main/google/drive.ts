import { google } from 'googleapis'
import { Readable } from 'stream'
import { BrowserWindow, shell } from 'electron'
import { createServer } from 'http'
import { getDatabase } from '../db'

// ── Env credentials (injected at build time) ─────────────────────────────────
const ENV_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? ''
const ENV_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

function getSetting(key: string): string | null {
  try {
    const row = getDatabase()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row?.value ?? null
  } catch { return null }
}

function setSetting(key: string, value: string) {
  try {
    getDatabase()
      .prepare(`INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`)
      .run(key, value)
  } catch { /* db not ready */ }
}

export class DriveSync {
  private oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null
  private drive: ReturnType<typeof google.drive> | null = null
  private syncInterval: ReturnType<typeof setInterval> | null = null
  public status: 'disconnected' | 'syncing' | 'synced' | 'error' = 'disconnected'

  constructor() { this.init() }

  init(): void {
    // Prefer env-injected credentials; fall back to DB-stored (legacy manual setup)
    const clientId     = ENV_CLIENT_ID     || getSetting('google_client_id')     || ''
    const clientSecret = ENV_CLIENT_SECRET || getSetting('google_client_secret') || ''
    const refreshToken = getSetting('google_refresh_token')
    if (!clientId || !clientSecret) return
    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost')
    if (refreshToken) {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken })
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client })
      this.broadcast('synced')
      this.startAutoSync()
    }
  }

  private broadcast(s: DriveSync['status']): void {
    this.status = s
    try {
      const wins = BrowserWindow.getAllWindows()
      if (wins[0] && !wins[0].isDestroyed()) {
        wins[0].webContents.send('drive:status', s)
      }
    } catch { /* window may not be ready */ }
  }

  /** Full loopback OAuth flow — opens browser, waits for redirect, stores token. */
  async connect(): Promise<{ ok: boolean; error?: string }> {
    const clientId     = ENV_CLIENT_ID     || getSetting('google_client_id')     || ''
    const clientSecret = ENV_CLIENT_SECRET || getSetting('google_client_secret') || ''
    if (!clientId || !clientSecret) {
      return { ok: false, error: 'Google OAuth credentials not configured.' }
    }
    try {
      const result = await new Promise<{ code: string; client: InstanceType<typeof google.auth.OAuth2> }>((resolve, reject) => {
        const server = createServer((req, res) => {
          try {
            const url      = new URL(req.url ?? '/', 'http://localhost')
            const code     = url.searchParams.get('code')
            const errParam = url.searchParams.get('error')
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;">
              ${code
                ? '<h2 style="color:#22c55e">✓ Drive connected</h2><p>You can close this tab.</p>'
                : `<h2 style="color:#ef4444">Connection failed</h2><p>${errParam ?? 'Unknown error'}</p>`
              }
            </body></html>`)
            server.close()
            if (code) resolve({ code, client: (server as any).__client })
            else reject(new Error(errParam ?? 'No code received'))
          } catch (e: any) { server.close(); reject(e) }
        })
        server.on('error', reject)
        server.listen(0, '127.0.0.1', () => {
          const port        = (server.address() as { port: number }).port
          const redirectUri = `http://localhost:${port}`
          const client      = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
          const authUrl     = client.generateAuthUrl({
            access_type: 'offline',
            scope: [
              'https://www.googleapis.com/auth/drive.file',
              'https://mail.google.com/',
              'https://www.googleapis.com/auth/calendar',
            ],
            prompt: 'consent',
          })
          ;(server as any).__client = client
          shell.openExternal(authUrl)
        })
        const t = setTimeout(() => { server.close(); reject(new Error('Timed out')) }, 5 * 60 * 1000)
        server.on('close', () => clearTimeout(t))
      })

      const { tokens } = await result.client.getToken(result.code)
      result.client.setCredentials(tokens)
      if (tokens.refresh_token) setSetting('google_refresh_token', tokens.refresh_token)
      this.oauth2Client = result.client
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client })
      this.broadcast('synced')
      this.startAutoSync()
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  // Keep for legacy IPC compatibility
  getAuthUrl(): string | null { return null }
  async exchangeCode(_code: string): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: 'Use drive:connect instead.' }
  }

  private async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
    if (!this.drive) throw new Error('Drive not connected')
    const safeName = name.replace(/'/g, "\\'")
    const q = `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false` +
              (parentId ? ` and '${parentId}' in parents` : '')
    const res = await this.drive.files.list({ q, fields: 'files(id)', pageSize: 1 })
    if (res.data.files?.length) return res.data.files[0].id as string
    const created = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: 'id',
    })
    return created.data.id as string
  }

  async syncTask(task: Record<string, unknown>): Promise<void> {
    if (!this.drive) return
    try {
      const title = String(task.title ?? 'Untitled').slice(0, 50)
      const notes = typeof task.notes === 'string' ? task.notes : null
      const rootId       = await this.getOrCreateFolder('KantorConsultingHub')
      const projectId    = await this.getOrCreateFolder('General', rootId)
      const taskFolderId = await this.getOrCreateFolder(title, projectId)
      await this.drive.files.create({
        requestBody: { name: 'task.json', parents: [taskFolderId] },
        media: { mimeType: 'application/json', body: Readable.from([JSON.stringify(task, null, 2)]) },
        fields: 'id',
      })
      if (notes) {
        await this.drive.files.create({
          requestBody: { name: 'notes.txt', parents: [taskFolderId] },
          media: { mimeType: 'text/plain', body: Readable.from([notes.replace(/<[^>]*>/g, '')]) },
          fields: 'id',
        })
      }
    } catch (e: any) {
      console.error('[Drive] syncTask error:', e.message)
    }
  }

  startAutoSync(): void {
    if (this.syncInterval) clearInterval(this.syncInterval)
    this.syncInterval = setInterval(() => { void this.runAutoSync() }, 5 * 60 * 1000)
  }

  async runAutoSync(): Promise<{ ok: boolean; error?: string }> {
    if (!this.drive) return { ok: false, error: 'Drive not connected' }
    try {
      this.broadcast('syncing')
      const tasks = getDatabase()
        .prepare('SELECT * FROM tasks LIMIT 200')
        .all() as Record<string, unknown>[]
      for (const task of tasks) await this.syncTask(task)
      this.broadcast('synced')
      return { ok: true }
    } catch (e: any) {
      this.broadcast('error')
      return { ok: false, error: e.message }
    }
  }

  disconnect(): void {
    if (this.syncInterval) clearInterval(this.syncInterval)
    this.syncInterval = null
    this.oauth2Client = null
    this.drive = null
    try { getDatabase().prepare("DELETE FROM settings WHERE key='google_refresh_token'").run() }
    catch { /* ignore */ }
    this.broadcast('disconnected')
  }

  isConnected(): boolean { return !!this.drive }

  async listFolder(folderPath: string): Promise<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }[]> {
    if (!this.drive) return []
    try {
      const parts = folderPath.split('/').filter(Boolean)
      let parentId: string | undefined = undefined
      for (const part of parts) {
        const safeName = part.replace(/'/g, "\\'")
        const q = `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false` +
                  (parentId ? ` and '${parentId}' in parents` : '')
        const res = await this.drive.files.list({ q, fields: 'files(id)', pageSize: 1 })
        if (!res.data.files?.length) return []
        parentId = res.data.files[0].id as string
      }
      if (!parentId) return []
      const res = await this.drive.files.list({
        q: `'${parentId}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,size,modifiedTime)',
        pageSize: 50,
        orderBy: 'name',
      })
      return (res.data.files ?? []).map(f => ({
        id: f.id ?? '',
        name: f.name ?? '',
        mimeType: f.mimeType ?? '',
        size: f.size ?? undefined,
        modifiedTime: f.modifiedTime ?? undefined,
      }))
    } catch (e: any) {
      console.error('[Drive] listFolder error:', e.message)
      return []
    }
  }

  async copyFileToDrive(localPath: string, fileName: string, folderPath: string): Promise<string | null> {
    if (!this.drive) return null
    try {
      const parts = folderPath.split('/').filter(Boolean)
      let parentId: string | undefined = undefined
      for (const part of parts) {
        parentId = await this.getOrCreateFolder(part, parentId)
      }
      if (!parentId) return null
      const { createReadStream } = await import('fs')
      const created = await this.drive.files.create({
        requestBody: { name: fileName, parents: [parentId] },
        media: { body: createReadStream(localPath) },
        fields: 'id',
      })
      return created.data.id ?? null
    } catch (e: any) {
      console.error('[Drive] copyFileToDrive error:', e.message)
      return null
    }
  }

  async createCalendarEvent(event: {
    title: string
    description?: string | null
    location?: string | null
    startDate: string
    endDate: string
    allDay: boolean
    attendeeEmails: string[]
    meetingLink?: string | null
    rrule?: string | null
  }): Promise<string | null> {
    if (!this.drive) return null
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client! })
      const start = event.allDay
        ? { date: event.startDate.slice(0, 10) }
        : { dateTime: new Date(event.startDate).toISOString(), timeZone: 'UTC' }
      const end = event.allDay
        ? { date: event.endDate.slice(0, 10) }
        : { dateTime: new Date(event.endDate).toISOString(), timeZone: 'UTC' }

      const body: any = {
        summary: event.title,
        description: event.description ?? undefined,
        location: event.location ?? undefined,
        start,
        end,
        attendees: event.attendeeEmails.map(email => ({ email })),
      }
      if (event.meetingLink) {
        body.description = (body.description ?? '') + `\n\nJoin meeting: ${event.meetingLink}`
      }
      if (event.rrule) {
        body.recurrence = [event.rrule]
      }

      const res = await calendar.events.insert({
        calendarId: 'primary',
        sendUpdates: 'all',
        requestBody: body,
      })
      return res.data.id ?? null
    } catch (e: any) {
      console.error('[Drive] createCalendarEvent error:', e.message)
      return null
    }
  }

  async updateCalendarEvent(googleEventId: string, update: {
    title?: string
    description?: string | null
    location?: string | null
    startDate?: string
    endDate?: string
    allDay?: boolean
    attendeeEmails?: string[]
  }): Promise<boolean> {
    if (!this.drive) return false
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client! })
      const patch: any = {}
      if (update.title) patch.summary = update.title
      if (update.description !== undefined) patch.description = update.description ?? undefined
      if (update.location !== undefined) patch.location = update.location ?? undefined
      if (update.startDate) {
        patch.start = update.allDay
          ? { date: update.startDate.slice(0, 10) }
          : { dateTime: new Date(update.startDate).toISOString(), timeZone: 'UTC' }
      }
      if (update.endDate) {
        patch.end = update.allDay
          ? { date: update.endDate.slice(0, 10) }
          : { dateTime: new Date(update.endDate).toISOString(), timeZone: 'UTC' }
      }
      if (update.attendeeEmails) {
        patch.attendees = update.attendeeEmails.map(email => ({ email }))
      }
      await calendar.events.patch({
        calendarId: 'primary',
        eventId: googleEventId,
        sendUpdates: 'all',
        requestBody: patch,
      })
      return true
    } catch (e: any) {
      console.error('[Drive] updateCalendarEvent error:', e.message)
      return false
    }
  }
}

export const driveSync = new DriveSync()
