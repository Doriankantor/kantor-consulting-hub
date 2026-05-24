import { google } from 'googleapis'
import { Readable } from 'stream'
import { BrowserWindow } from 'electron'
import { getDatabase } from '../db'

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
    const clientId     = getSetting('google_client_id')
    const clientSecret = getSetting('google_client_secret')
    const refreshToken = getSetting('google_refresh_token')
    if (!clientId || !clientSecret) return
    this.oauth2Client = new google.auth.OAuth2(
      clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob'
    )
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

  getAuthUrl(): string | null {
    if (!this.oauth2Client) return null
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://mail.google.com/',
      ],
      prompt: 'consent',
    })
  }

  async exchangeCode(code: string): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!this.oauth2Client) {
        return { ok: false, error: 'OAuth2 client not initialised. Add Client ID and Secret first.' }
      }
      const { tokens } = await this.oauth2Client.getToken(code)
      this.oauth2Client.setCredentials(tokens)
      if (tokens.refresh_token) setSetting('google_refresh_token', tokens.refresh_token)
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client })
      this.broadcast('synced')
      this.startAutoSync()
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
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
}

export const driveSync = new DriveSync()
