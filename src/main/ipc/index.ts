import { ipcMain, app } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { randomBytes } from 'crypto'
import { getDatabase, hashPassword } from '../db'
import { driveSync } from '../google/drive'
import { sendEmail, inviteEmailHtml } from '../google/gmail'

function uuid(): string { return crypto.randomUUID() }
function now():  string { return new Date().toISOString() }

function getSetting(key: string): string | null {
  const row = getDatabase()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  getDatabase()
    .prepare(`INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`)
    .run(key, value)
}

// ── Settings ───────────────────────────────────────────────────────────────

function registerSettingsHandlers() {
  ipcMain.handle('settings:get',    (_e, k: string)              => getSetting(k))
  ipcMain.handle('settings:set',    (_e, k: string, v: string)   => { setSetting(k, v); return true })
  ipcMain.handle('settings:delete', (_e, k: string)              => { getDatabase().prepare('DELETE FROM settings WHERE key=?').run(k); return true })
  ipcMain.handle('settings:getAll', () => {
    const rows = getDatabase().prepare('SELECT key,value FROM settings').all() as { key: string; value: string }[]
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  })
}

// ── Projects ───────────────────────────────────────────────────────────────

function registerProjectHandlers() {
  ipcMain.handle('projects:getAll', () =>
    getDatabase().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
  )
  ipcMain.handle('projects:upsert', (_e, p: Record<string, unknown>) => {
    getDatabase().prepare(`INSERT INTO projects (id,title,description,status,owner_id,created_at,updated_at,is_dirty)
      VALUES (@id,@title,@description,@status,@owner_id,@created_at,@updated_at,1)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,
        status=excluded.status,updated_at=excluded.updated_at,is_dirty=1`).run(p)
    return true
  })
}

// ── Tasks ──────────────────────────────────────────────────────────────────

function registerTaskHandlers() {
  ipcMain.handle('tasks:getByProject', (_e, projectId: string) =>
    getDatabase().prepare('SELECT * FROM tasks WHERE project_id=? ORDER BY position ASC').all(projectId)
  )
}

// ── Comments ───────────────────────────────────────────────────────────────

function registerCommentHandlers() {
  ipcMain.handle('comments:get', (_e, taskId: string) =>
    getDatabase().prepare('SELECT * FROM task_comments WHERE task_id=? ORDER BY created_at ASC').all(taskId)
  )
  ipcMain.handle('comments:add', (_e, c: { task_id: string; author_id: string; author_name: string; content: string }) => {
    const entry = { id: uuid(), created_at: now(), ...c }
    getDatabase().prepare(`INSERT INTO task_comments (id,task_id,author_id,author_name,content,created_at)
      VALUES (@id,@task_id,@author_id,@author_name,@content,@created_at)`).run(entry)
    return entry
  })
  ipcMain.handle('comments:delete', (_e, id: string) => {
    getDatabase().prepare('DELETE FROM task_comments WHERE id=?').run(id)
    return true
  })
}

// ── Activity ───────────────────────────────────────────────────────────────

function registerActivityHandlers() {
  ipcMain.handle('activity:get', (_e, taskId: string) =>
    getDatabase().prepare('SELECT * FROM task_activity WHERE task_id=? ORDER BY created_at DESC LIMIT 50').all(taskId)
  )
  ipcMain.handle('activity:add', (_e, e: { task_id: string; actor_name: string; action: string }) => {
    const row = { id: uuid(), created_at: now(), ...e }
    getDatabase().prepare(`INSERT INTO task_activity (id,task_id,actor_name,action,created_at)
      VALUES (@id,@task_id,@actor_name,@action,@created_at)`).run(row)
    return row
  })
}

// ── Auth ───────────────────────────────────────────────────────────────────

function registerAuthHandlers() {
  ipcMain.handle('auth:localSignIn', (_e, email: string, password: string) => {
    const trimmed = email.trim().toLowerCase()
    if (trimmed !== 'doriankantor@gmail.com' && !trimmed.endsWith('@kantor-consulting.com')) {
      return { error: 'Access restricted to Kantor Consulting team members only.' }
    }
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM local_users WHERE LOWER(email)=?').get(trimmed) as Record<string, unknown> | undefined
    if (row) {
      if (row.status === 'inactive') return { error: 'Your account has been deactivated. Contact your administrator.' }
      if (hashPassword(password, row.password_salt as string) !== (row.password_hash as string)) {
        return { error: 'Invalid email or password.' }
      }
      db.prepare("UPDATE local_users SET last_active=CURRENT_TIMESTAMP, status='active' WHERE id=?").run(row.id)
      return {
        ok: true,
        user: { id: row.id, email: row.email, name: row.full_name ?? row.email, role: row.role },
        mustChangePassword: !!(row.must_change_password as number),
        anthropicKeySet:    !!(row.anthropic_key_set as number),
      }
    }
    // Legacy fallback
    const sE = getSetting('local_admin_email')
    const sS = getSetting('local_admin_salt')
    const sH = getSetting('local_admin_hash')
    const sN = getSetting('local_admin_name') ?? 'Dorian Kantor'
    if (sE && sS && sH && trimmed === sE.toLowerCase()) {
      if (hashPassword(password, sS) !== sH) return { error: 'Invalid email or password.' }
      return { ok: true, user: { id: 'local-admin', email: sE, name: sN, role: 'admin' }, mustChangePassword: false, anthropicKeySet: false }
    }
    return { error: 'Invalid email or password.' }
  })

  ipcMain.handle('auth:changeLocalPassword', (_e, currentPw: string, newPw: string) => {
    const sS = getSetting('local_admin_salt')
    const sH = getSetting('local_admin_hash')
    if (!sS || !sH) return { error: 'No local account.' }
    if (hashPassword(currentPw, sS) !== sH) return { error: 'Current password is incorrect.' }
    const ns = randomBytes(16).toString('hex')
    const nh = hashPassword(newPw, ns)
    setSetting('local_admin_salt', ns)
    setSetting('local_admin_hash', nh)
    return { ok: true }
  })
}

// ── Team ───────────────────────────────────────────────────────────────────

function registerTeamHandlers() {
  ipcMain.handle('team:list', () =>
    getDatabase()
      .prepare('SELECT id,email,full_name,role,status,must_change_password,anthropic_key_set,created_at,last_active FROM local_users ORDER BY created_at')
      .all()
  )

  ipcMain.handle('team:invite', async (_e, params: { email: string; full_name: string; role?: string }) => {
    if (!params.email.endsWith('@kantor-consulting.com')) {
      return { error: 'Email must use the @kantor-consulting.com domain.' }
    }
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM local_users WHERE LOWER(email)=?').get(params.email.toLowerCase())
    if (existing) return { error: 'A user with this email already exists.' }
    const tempPassword = 'KC-' + Math.random().toString(36).slice(2, 8).toUpperCase()
    const salt = randomBytes(16).toString('hex')
    const hash = hashPassword(tempPassword, salt)
    const id   = uuid()
    db.prepare(`INSERT INTO local_users (id,email,full_name,role,status,password_hash,password_salt,must_change_password,invited_by)
      VALUES (?,?,?,?,'invited',?,?,1,'local-admin')`)
      .run(id, params.email, params.full_name, params.role ?? 'member', hash, salt)
    const emailResult = await sendEmail(
      params.email,
      "You've been invited to Kantor Consulting Hub",
      inviteEmailHtml({ name: params.full_name, email: params.email, tempPassword, appVersion: app.getVersion() })
    )
    return { ok: true, id, tempPassword, emailSent: emailResult.ok, emailError: emailResult.error }
  })

  ipcMain.handle('team:remove', (_e, id: string) => {
    getDatabase().prepare("UPDATE local_users SET status='inactive' WHERE id=?").run(id)
    return { ok: true }
  })

  ipcMain.handle('team:edit', (_e, params: { id: string; full_name?: string; email?: string; role?: string }) => {
    if (params.email && !params.email.endsWith('@kantor-consulting.com') && params.email !== 'doriankantor@gmail.com') {
      return { error: 'Email must use the @kantor-consulting.com domain.' }
    }
    const db = getDatabase()
    if (params.full_name !== undefined) db.prepare('UPDATE local_users SET full_name=? WHERE id=?').run(params.full_name, params.id)
    if (params.email     !== undefined) db.prepare('UPDATE local_users SET email=? WHERE id=?').run(params.email, params.id)
    if (params.role      !== undefined) db.prepare('UPDATE local_users SET role=? WHERE id=?').run(params.role, params.id)
    return { ok: true }
  })

  ipcMain.handle('team:heartbeat',       (_e, id: string) => { getDatabase().prepare('UPDATE local_users SET last_active=CURRENT_TIMESTAMP WHERE id=?').run(id); return true })
  ipcMain.handle('team:markApiKeySet',   (_e, id: string) => { getDatabase().prepare('UPDATE local_users SET anthropic_key_set=1 WHERE id=?').run(id); return true })
  ipcMain.handle('team:savePreferences', (_e, id: string, prefs: Record<string, unknown>) => {
    getDatabase().prepare('UPDATE local_users SET preferences_json=? WHERE id=?').run(JSON.stringify(prefs), id); return true
  })

  ipcMain.handle('team:changePassword', (_e, userId: string, currentPw: string, newPw: string) => {
    const db  = getDatabase()
    const row = db.prepare('SELECT password_hash,password_salt FROM local_users WHERE id=?').get(userId) as { password_hash: string; password_salt: string } | undefined
    if (!row) return { error: 'User not found.' }
    if (hashPassword(currentPw, row.password_salt) !== row.password_hash) return { error: 'Current password is incorrect.' }
    const ns = randomBytes(16).toString('hex')
    const nh = hashPassword(newPw, ns)
    db.prepare("UPDATE local_users SET password_hash=?,password_salt=?,must_change_password=0,status='active' WHERE id=?").run(nh, ns, userId)
    return { ok: true }
  })
}

// ── Drive ──────────────────────────────────────────────────────────────────

function registerDriveHandlers() {
  ipcMain.handle('drive:getStatus',    ()                      => driveSync.status)
  ipcMain.handle('drive:getAuthUrl',   ()                      => driveSync.getAuthUrl())
  ipcMain.handle('drive:exchangeCode', (_e, code: string)      => driveSync.exchangeCode(code))
  ipcMain.handle('drive:syncNow',      ()                      => driveSync.runAutoSync())
  ipcMain.handle('drive:disconnect',   ()                      => { driveSync.disconnect(); return true })
  ipcMain.handle('drive:isConnected',  ()                      => driveSync.isConnected())
  ipcMain.handle('drive:reinit',       ()                      => { driveSync.init(); return driveSync.status })
}

// ── Areas ─────────────────────────────────────────────────────────────────

function registerAreaHandlers() {
  ipcMain.handle('areas:list', () =>
    getDatabase().prepare('SELECT * FROM areas ORDER BY is_default DESC, position ASC').all()
  )

  ipcMain.handle('areas:create', (_e, name: string, color: string) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
    const maxPos = (getDatabase().prepare('SELECT MAX(position) as m FROM areas').get() as { m: number | null }).m ?? 0
    getDatabase().prepare('INSERT INTO areas (id, name, color, is_default, position) VALUES (?, ?, ?, 0, ?)')
      .run(id, name.trim(), color, maxPos + 1)
    return { ok: true, id }
  })

  ipcMain.handle('areas:update', (_e, id: string, name: string, color: string) => {
    getDatabase().prepare('UPDATE areas SET name=?, color=? WHERE id=?').run(name.trim(), color, id)
    return { ok: true }
  })

  ipcMain.handle('areas:delete', (_e, id: string) => {
    // Only delete non-default areas
    const area = getDatabase().prepare('SELECT is_default FROM areas WHERE id=?').get(id) as { is_default: number } | undefined
    if (!area) return { error: 'Area not found.' }
    if (area.is_default) return { error: 'Default areas cannot be deleted.' }
    getDatabase().prepare('DELETE FROM areas WHERE id=?').run(id)
    return { ok: true }
  })
}

// ── App ────────────────────────────────────────────────────────────────────

function registerAppHandlers() {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:checkForUpdates', async () => {
    try {
      const { autoUpdater } = await import('electron-updater')
      await autoUpdater.checkForUpdatesAndNotify()
      return { ok: true }
    } catch (e: any) {
      return { error: e.message }
    }
  })
}

// ── Claude ─────────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: Record<string, string | null>): string {
  return `You are an expert political analysis assistant working with Kantor Consulting — a boutique consultancy specializing in geopolitical risk, foreign policy analysis, and strategic advisory for government, financial, and private-sector clients.

You are helping with the following engagement:

Title: ${ctx.title ?? 'Untitled'}
Deliverable type: ${ctx.content_type ?? 'Unknown'}
Area of analysis: ${ctx.area_of_analysis ?? 'Not specified'}
Client: ${ctx.client ?? 'Confidential'}
Description: ${ctx.description ?? 'None provided'}
${ctx.sources ? `\nReferenced sources:\n${ctx.sources}` : ''}
${ctx.notes ? `\nWorking notes:\n${ctx.notes}` : ''}

Guidelines:
- Be concise, precise, and analytically rigorous
- Use the vocabulary and style of a senior political analyst or foreign policy adviser
- Avoid generic commentary — focus on specific, actionable insights
- Respect client confidentiality; do not reference real-world individuals by name unless the analyst has already done so
- Produce structured output (headings, bullets) when writing outlines or reports
- When suggesting deadlines, consider that Policy Briefs take 1–2 weeks, Research Reports 2–4 weeks, Briefing Notes 2–5 days, Client Advisories 3–7 days, Consulting Engagements are ongoing, and Op-Eds take 3–7 days`
}

function getUserPreferences(userId: string): Record<string, unknown> {
  const row = getDatabase()
    .prepare('SELECT preferences_json FROM local_users WHERE id=?')
    .get(userId) as { preferences_json: string | null } | undefined
  if (!row?.preferences_json) return {}
  try { return JSON.parse(row.preferences_json) } catch { return {} }
}

function registerClaudeHandlers() {
  ipcMain.handle('claude:sendMessage', async (event, params: {
    messages: { role: 'user' | 'assistant'; content: string }[]
    taskContext: Record<string, string | null>
    userId?: string
  }) => {
    // Check user's personal key first, then fall back to global team key
    let apiKey: string | null = null
    if (params.userId) {
      const prefs = getUserPreferences(params.userId)
      if (typeof prefs.anthropicApiKey === 'string' && prefs.anthropicApiKey) {
        apiKey = prefs.anthropicApiKey
      }
    }
    if (!apiKey) {
      const keyRow = getDatabase()
        .prepare('SELECT value FROM settings WHERE key=?')
        .get('anthropic_api_key') as { value: string } | undefined
      apiKey = keyRow?.value ?? null
    }
    if (!apiKey) return { error: 'no_key' }
    const anthropic = new Anthropic({ apiKey })
    ;(async () => {
      try {
        const stream = anthropic.messages.stream({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: buildSystemPrompt(params.taskContext),
          messages: params.messages,
        })
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            if (!event.sender.isDestroyed()) event.sender.send('claude:chunk', ev.delta.text)
          }
        }
        await stream.finalMessage()
        if (!event.sender.isDestroyed()) event.sender.send('claude:done')
      } catch (err: any) {
        if (!event.sender.isDestroyed()) event.sender.send('claude:error', err.message ?? 'Unknown error')
      }
    })()
    return { started: true }
  })

  ipcMain.handle('claude:saveUserKey', (_e, userId: string, apiKey: string) => {
    const db = getDatabase()
    const prefs = getUserPreferences(userId)
    prefs.anthropicApiKey = apiKey
    db.prepare('UPDATE local_users SET preferences_json=?, anthropic_key_set=1 WHERE id=?')
      .run(JSON.stringify(prefs), userId)
    return { ok: true }
  })

  ipcMain.handle('claude:removeUserKey', (_e, userId: string) => {
    const db = getDatabase()
    const prefs = getUserPreferences(userId)
    delete prefs.anthropicApiKey
    db.prepare('UPDATE local_users SET preferences_json=?, anthropic_key_set=0 WHERE id=?')
      .run(JSON.stringify(prefs), userId)
    return { ok: true }
  })

  ipcMain.handle('claude:getUserKeyStatus', (_e, userId: string) => {
    const prefs = getUserPreferences(userId)
    return { hasKey: typeof prefs.anthropicApiKey === 'string' && prefs.anthropicApiKey.length > 0 }
  })
}

// ── Boot ───────────────────────────────────────────────────────────────────

export function registerIpcHandlers(): void {
  registerSettingsHandlers()
  registerProjectHandlers()
  registerTaskHandlers()
  registerCommentHandlers()
  registerActivityHandlers()
  registerAuthHandlers()
  registerTeamHandlers()
  registerDriveHandlers()
  registerAreaHandlers()
  registerAppHandlers()
  registerClaudeHandlers()
}
