import { ipcMain, app, dialog, shell } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { randomBytes } from 'crypto'
import { getDatabase, hashPassword } from '../db'
import { driveSync } from '../google/drive'
import { sendEmail, inviteEmailHtml } from '../google/gmail'
import { connectUserGoogle, getUserGoogleStatus, disconnectUserGoogle } from '../google/userGoogle'

// ── Supabase admin client (service role) ──────────────────────────────────
// process.env.SUPABASE_URL and process.env.SUPABASE_SERVICE_ROLE_KEY are
// injected at build time by electron.vite.config.ts → define.
// ws is required as transport because Node.js 20 has no native WebSocket.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  }
)

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

function createNotification(n: {
  user_id: string; type: string; title: string; body?: string;
  task_id?: string; task_title?: string; actor_name?: string
}) {
  try {
    getDatabase().prepare(`INSERT INTO notifications (id,user_id,type,title,body,task_id,task_title,actor_name)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuid(), n.user_id, n.type, n.title, n.body ?? null, n.task_id ?? null, n.task_title ?? null, n.actor_name ?? null)
  } catch {}
}

function registerCommentHandlers() {
  ipcMain.handle('comments:get', (_e, taskId: string) =>
    getDatabase().prepare('SELECT * FROM task_comments WHERE task_id=? ORDER BY created_at ASC').all(taskId)
  )
  ipcMain.handle('comments:add', (_e, c: {
    task_id: string; author_id: string; author_name: string; content: string;
    task_title?: string; assignee_ids?: string[]
  }) => {
    const { task_title, assignee_ids, ...fields } = c
    const entry = { id: uuid(), created_at: now(), ...fields }
    getDatabase().prepare(`INSERT INTO task_comments (id,task_id,author_id,author_name,content,created_at)
      VALUES (@id,@task_id,@author_id,@author_name,@content,@created_at)`).run(entry)

    // Notify assignees (except the commenter)
    const targets = (assignee_ids ?? []).filter(id => id !== c.author_id)
    for (const userId of targets) {
      createNotification({
        user_id: userId, type: 'comment',
        title: `${c.author_name} commented on "${task_title ?? 'a task'}"`,
        body: c.content.slice(0, 120),
        task_id: c.task_id, task_title, actor_name: c.author_name,
      })
    }

    // Notify @mentioned users
    const mentionRe = /@([\w .'-]+)/g
    let m: RegExpExecArray | null
    const mentionedNames = new Set<string>()
    while ((m = mentionRe.exec(c.content)) !== null) mentionedNames.add(m[1].toLowerCase().trim())
    if (mentionedNames.size > 0) {
      const users = getDatabase().prepare('SELECT id,full_name FROM local_users WHERE status != ?').all('inactive') as { id: string; full_name: string | null }[]
      for (const u of users) {
        if (u.id === c.author_id) continue
        const name = (u.full_name ?? '').toLowerCase().trim()
        if (name && mentionedNames.has(name)) {
          createNotification({
            user_id: u.id, type: 'mention',
            title: `${c.author_name} mentioned you in "${task_title ?? 'a task'}"`,
            body: c.content.slice(0, 120),
            task_id: c.task_id, task_title, actor_name: c.author_name,
          })
        }
      }
    }

    return entry
  })
  ipcMain.handle('comments:delete', (_e, id: string, deletedById?: string, deletedByName?: string) => {
    const db = getDatabase()
    const comment = db.prepare('SELECT * FROM task_comments WHERE id=?').get(id) as Record<string, unknown> | undefined
    if (comment) {
      db.prepare(`INSERT INTO trash (id,item_type,item_id,item_name,item_data_json,deleted_by_id,deleted_by_name,expires_at)
        VALUES (?,?,?,?,?,?,?,datetime('now','+30 days'))`)
        .run(uuid(), 'comment', id,
          String(comment.content ?? '').slice(0, 80),
          JSON.stringify(comment),
          deletedById ?? null, deletedByName ?? null)
    }
    db.prepare('DELETE FROM task_comments WHERE id=?').run(id)
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

  // Global feed: last 60 events across all tasks (activity + comments merged)
  ipcMain.handle('activity:getFeed', () => {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT id, task_id, actor_name, action, created_at, 'activity' as source,
             (SELECT title FROM workspace_tasks WHERE id = task_id) as task_title
      FROM task_activity
      UNION ALL
      SELECT id, task_id, author_name as actor_name,
             CASE WHEN LENGTH(content) > 80 THEN SUBSTR(content,1,80)||'…' ELSE content END as action,
             created_at, 'comment' as source,
             (SELECT title FROM workspace_tasks WHERE id = task_id) as task_title
      FROM task_comments
      ORDER BY created_at DESC
      LIMIT 60
    `).all()
    return rows
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
      .prepare(`SELECT id,email,full_name,role,status,must_change_password,anthropic_key_set,created_at,last_active
                FROM local_users
                WHERE status != 'inactive'
                ORDER BY created_at`)
      .all()
  )

  ipcMain.handle('team:invite', async (_e, params: { email: string; full_name: string; role?: string }) => {
    const email = (params.email ?? '').trim().toLowerCase()

    // Domain validation — allow @kantor-consulting.com + doriankantor@gmail.com
    if (email !== 'doriankantor@gmail.com' && !email.endsWith('@kantor-consulting.com')) {
      return { error: 'Only @kantor-consulting.com emails are allowed.' }
    }

    const db = getDatabase()

    // Already-a-member check
    const existing = db.prepare('SELECT id, status FROM local_users WHERE LOWER(email)=?').get(email) as
      { id: string; status: string } | undefined
    if (existing) {
      return { error: 'This email is already a team member.' }
    }

    // ── Supabase admin invite ───────────────────────────────────────────────
    console.log('[Invite] SUPABASE_URL:              ', process.env.SUPABASE_URL              ? '✓ set' : '✗ MISSING')
    console.log('[Invite] SUPABASE_SERVICE_ROLE_KEY: ', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ MISSING')
    console.log('[Invite] Inviting:', email)

    try {
      const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: params.full_name ?? '' },
      })

      console.log('[Invite] Supabase response data: ', JSON.stringify(data))
      console.log('[Invite] Supabase response error:', JSON.stringify(inviteError))

      if (inviteError) {
        console.error('[Invite] Supabase error full object:', inviteError)
        if (inviteError.message?.toLowerCase().includes('already registered')) {
          return { error: 'This email is already a team member.' }
        }
        return { error: `Invite failed: ${inviteError.message}` }
      }

      // ── Create local SQLite record so the member appears in the list ──────
      const id           = uuid()
      const salt         = randomBytes(16).toString('hex')
      const tempPassword = 'KC-' + Math.random().toString(36).slice(2, 8).toUpperCase()
      const hash         = hashPassword(tempPassword, salt)

      db.prepare(`INSERT INTO local_users
          (id,email,full_name,role,status,password_hash,password_salt,must_change_password,invited_by)
          VALUES (?,?,?,?,'invited',?,?,1,'local-admin')`)
        .run(id, email, params.full_name ?? '', params.role ?? 'member', hash, salt)

      console.log('[Invite] Local record created, id:', id)
      return { ok: true, id }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Invite] Unexpected exception:', err)
      return { error: `Invite failed: ${message}` }
    }
  })

  ipcMain.handle('team:remove', (_e, id: string) => {
    // Hard-delete so the user is fully gone; they can only return via a fresh invite
    getDatabase().prepare('DELETE FROM local_users WHERE id=?').run(id)
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
  ipcMain.handle('drive:listFolder',   (_e, folderPath: string) => driveSync.listFolder(folderPath))
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

// ── Labels ─────────────────────────────────────────────────────────────────

function registerLabelHandlers() {
  ipcMain.handle('labels:list', () =>
    getDatabase().prepare('SELECT * FROM labels ORDER BY position ASC').all()
  )
  ipcMain.handle('labels:create', (_e, name: string, color: string) => {
    const id = 'label-' + Date.now().toString(36)
    const maxPos = (getDatabase().prepare('SELECT MAX(position) as m FROM labels').get() as { m: number | null }).m ?? 0
    getDatabase().prepare('INSERT INTO labels (id,name,color,position) VALUES (?,?,?,?)').run(id, name.trim(), color, maxPos + 1)
    return { ok: true, id }
  })
  ipcMain.handle('labels:update', (_e, id: string, name: string, color: string) => {
    getDatabase().prepare('UPDATE labels SET name=?,color=? WHERE id=?').run(name.trim(), color, id)
    return { ok: true }
  })
  ipcMain.handle('labels:delete', (_e, id: string) => {
    getDatabase().prepare('DELETE FROM task_labels WHERE label_id=?').run(id)
    getDatabase().prepare('DELETE FROM labels WHERE id=?').run(id)
    return { ok: true }
  })
  ipcMain.handle('taskLabels:get', (_e, taskId: string) => {
    return getDatabase().prepare(`
      SELECT l.* FROM labels l
      JOIN task_labels tl ON tl.label_id = l.id
      WHERE tl.task_id = ?
      ORDER BY l.position ASC
    `).all(taskId)
  })
  ipcMain.handle('taskLabels:set', (_e, taskId: string, labelIds: string[]) => {
    const db = getDatabase()
    db.prepare('DELETE FROM task_labels WHERE task_id=?').run(taskId)
    const insert = db.prepare('INSERT OR IGNORE INTO task_labels (task_id,label_id) VALUES (?,?)')
    for (const lid of labelIds) insert.run(taskId, lid)
    return { ok: true }
  })
}

// ── Checklists ─────────────────────────────────────────────────────────────

function registerChecklistHandlers() {
  ipcMain.handle('checklists:get', (_e, taskId: string) => {
    const db = getDatabase()
    const lists = db.prepare('SELECT * FROM task_checklists WHERE task_id=? ORDER BY position ASC').all(taskId) as any[]
    for (const list of lists) {
      list.items = db.prepare('SELECT * FROM task_checklist_items WHERE checklist_id=? ORDER BY position ASC').all(list.id)
    }
    return lists
  })
  ipcMain.handle('checklists:create', (_e, taskId: string, title: string) => {
    const id = uuid()
    const maxPos = (getDatabase().prepare('SELECT MAX(position) as m FROM task_checklists WHERE task_id=?').get(taskId) as { m: number | null }).m ?? 0
    getDatabase().prepare('INSERT INTO task_checklists (id,task_id,title,position) VALUES (?,?,?,?)').run(id, taskId, title.trim(), maxPos + 1)
    return { ok: true, id }
  })
  ipcMain.handle('checklists:delete', (_e, checklistId: string) => {
    const db = getDatabase()
    db.prepare('DELETE FROM task_checklist_items WHERE checklist_id=?').run(checklistId)
    db.prepare('DELETE FROM task_checklists WHERE id=?').run(checklistId)
    return { ok: true }
  })
  ipcMain.handle('checklistItems:add', (_e, checklistId: string, taskId: string, text: string) => {
    const id = uuid()
    const maxPos = (getDatabase().prepare('SELECT MAX(position) as m FROM task_checklist_items WHERE checklist_id=?').get(checklistId) as { m: number | null }).m ?? 0
    getDatabase().prepare('INSERT INTO task_checklist_items (id,checklist_id,task_id,text,checked,position) VALUES (?,?,?,?,0,?)').run(id, checklistId, taskId, text.trim(), maxPos + 1)
    return { ok: true, id }
  })
  ipcMain.handle('checklistItems:toggle', (_e, itemId: string, checked: boolean) => {
    getDatabase().prepare('UPDATE task_checklist_items SET checked=? WHERE id=?').run(checked ? 1 : 0, itemId)
    return { ok: true }
  })
  ipcMain.handle('checklistItems:delete', (_e, itemId: string) => {
    getDatabase().prepare('DELETE FROM task_checklist_items WHERE id=?').run(itemId)
    return { ok: true }
  })
  ipcMain.handle('checklistItems:update', (_e, itemId: string, text: string) => {
    getDatabase().prepare('UPDATE task_checklist_items SET text=? WHERE id=?').run(text.trim(), itemId)
    return { ok: true }
  })
}

// ── Attachments ────────────────────────────────────────────────────────────

function registerAttachmentHandlers() {
  const userDataPath = app.getPath('userData')
  const attachmentsDir = join(userDataPath, 'attachments')

  ipcMain.handle('attachments:get', (_e, taskId: string) =>
    getDatabase().prepare('SELECT * FROM task_attachments WHERE task_id=? ORDER BY created_at ASC').all(taskId)
  )

  ipcMain.handle('attachments:addFile', async (_e, taskId: string, authorId: string, authorName: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Select File to Attach' })
    if (canceled || !filePaths[0]) return { canceled: true }

    if (!existsSync(attachmentsDir)) mkdirSync(attachmentsDir, { recursive: true })

    const srcPath = filePaths[0]
    const ext = extname(srcPath)
    const id = uuid()
    const destPath = join(attachmentsDir, id + ext)
    copyFileSync(srcPath, destPath)

    const fileName = basename(srcPath)
    getDatabase().prepare(`INSERT INTO task_attachments (id,task_id,name,type,local_path,mime_type,author_id,author_name) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, taskId, fileName, 'file', destPath, '', authorId, authorName)

    // Auto-copy to Drive if connected
    if (driveSync.isConnected()) {
      try {
        const task = getDatabase().prepare('SELECT wt.title, wb.name as board_name FROM workspace_tasks wt LEFT JOIN workspace_boards wb ON wt.board_id = wb.id WHERE wt.id = ?').get(taskId) as { title: string; board_name: string } | undefined
        const projectName = task?.board_name ?? 'General'
        const taskTitle = task?.title ?? 'Untitled'
        const folderPath = `KantorConsultingHub/${projectName}/${taskTitle}`
        void driveSync.copyFileToDrive(destPath, fileName, folderPath)
      } catch {}
    }

    return { ok: true, id, name: fileName, local_path: destPath }
  })

  ipcMain.handle('attachments:addUrl', (_e, taskId: string, name: string, url: string, type: string, authorId: string, authorName: string) => {
    const id = uuid()
    getDatabase().prepare(`INSERT INTO task_attachments (id,task_id,name,type,url,author_id,author_name) VALUES (?,?,?,?,?,?,?)`)
      .run(id, taskId, name.trim() || url, type || 'url', url.trim(), authorId, authorName)
    return { ok: true, id }
  })

  ipcMain.handle('attachments:delete', (_e, id: string) => {
    getDatabase().prepare('DELETE FROM task_attachments WHERE id=?').run(id)
    return { ok: true }
  })

  ipcMain.handle('attachments:open', async (_e, attachmentId: string) => {
    const row = getDatabase().prepare('SELECT * FROM task_attachments WHERE id=?').get(attachmentId) as any
    if (!row) return { error: 'Not found' }
    if (row.local_path && existsSync(row.local_path)) {
      await shell.openPath(row.local_path)
      return { ok: true }
    }
    if (row.url) {
      await shell.openExternal(row.url)
      return { ok: true }
    }
    return { error: 'No file or URL' }
  })
}

// ── Notifications ──────────────────────────────────────────────────────────

function registerNotificationHandlers() {
  ipcMain.handle('notifications:get', (_e, userId: string) =>
    getDatabase().prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(userId)
  )
  ipcMain.handle('notifications:unreadCount', (_e, userId: string) => {
    const row = getDatabase().prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND read=0').get(userId) as { c: number }
    return row.c
  })
  ipcMain.handle('notifications:markRead', (_e, id: string) => {
    getDatabase().prepare('UPDATE notifications SET read=1 WHERE id=?').run(id)
    return { ok: true }
  })
  ipcMain.handle('notifications:markAllRead', (_e, userId: string) => {
    getDatabase().prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(userId)
    return { ok: true }
  })
  ipcMain.handle('notifications:create', (_e, n: {
    user_id: string; type: string; title: string; body?: string;
    task_id?: string; task_title?: string; actor_name?: string
  }) => {
    const id = uuid()
    getDatabase().prepare(`INSERT INTO notifications (id,user_id,type,title,body,task_id,task_title,actor_name)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, n.user_id, n.type, n.title, n.body ?? null, n.task_id ?? null, n.task_title ?? null, n.actor_name ?? null)
    return { ok: true, id }
  })
}

// ── Chat ───────────────────────────────────────────────────────────────────

function registerChatHandlers() {
  ipcMain.handle('chat:getMessages', (_e, limit: number = 100) =>
    getDatabase().prepare('SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT ?').all(limit).reverse()
  )
  ipcMain.handle('chat:send', (_e, msg: { author_id: string; author_name: string; content: string }) => {
    const id = uuid()
    const entry = { id, created_at: now(), ...msg }
    getDatabase().prepare(`INSERT INTO chat_messages (id,author_id,author_name,content,created_at) VALUES (@id,@author_id,@author_name,@content,@created_at)`).run(entry)
    return entry
  })
}

// ── Comment edit ───────────────────────────────────────────────────────────

function registerCommentEditHandler() {
  ipcMain.handle('comments:update', (_e, id: string, content: string) => {
    getDatabase().prepare('UPDATE task_comments SET content=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(content, id)
    return { ok: true }
  })
}

// ── Boards ────────────────────────────────────────────────────────────────

function registerBoardHandlers() {
  const db = () => getDatabase()

  ipcMain.handle('boards:list', (_e, includeArchived: boolean = false) => {
    const rows = includeArchived
      ? db().prepare('SELECT * FROM workspace_boards ORDER BY position ASC, created_at ASC').all()
      : db().prepare('SELECT * FROM workspace_boards WHERE archived=0 ORDER BY position ASC, created_at ASC').all()
    return rows
  })

  ipcMain.handle('boards:listArchived', () =>
    db().prepare('SELECT * FROM workspace_boards WHERE archived=1 ORDER BY archived_at DESC').all()
  )

  ipcMain.handle('boards:create', (_e, name: string) => {
    const id = uuid()
    const maxPos = (db().prepare('SELECT MAX(position) as mp FROM workspace_boards WHERE archived=0').get() as { mp: number | null })?.mp ?? -1
    db().prepare('INSERT INTO workspace_boards (id,name,position) VALUES (?,?,?)').run(id, name, maxPos + 1)
    return { ok: true, id }
  })

  ipcMain.handle('boards:rename', (_e, id: string, name: string) => {
    db().prepare("UPDATE workspace_boards SET name=?,updated_at=datetime('now') WHERE id=?").run(name, id)
    return { ok: true }
  })

  ipcMain.handle('boards:archive', (_e, id: string, archivedBy: string) => {
    db().prepare("UPDATE workspace_boards SET archived=1,archived_at=datetime('now'),archived_by=?,updated_at=datetime('now') WHERE id=?").run(archivedBy, id)
    return { ok: true }
  })

  ipcMain.handle('boards:restore', (_e, id: string) => {
    const maxPos = (db().prepare('SELECT MAX(position) as mp FROM workspace_boards WHERE archived=0').get() as { mp: number | null })?.mp ?? -1
    db().prepare("UPDATE workspace_boards SET archived=0,archived_at=NULL,archived_by=NULL,position=?,updated_at=datetime('now') WHERE id=?").run(maxPos + 1, id)
    return { ok: true }
  })

  ipcMain.handle('boards:delete', (_e, id: string, deletedById?: string, deletedByName?: string) => {
    const board = db().prepare('SELECT * FROM workspace_boards WHERE id=?').get(id) as Record<string, unknown> | undefined
    if (board) {
      db().prepare(`INSERT INTO trash (id,item_type,item_id,item_name,item_data_json,deleted_by_id,deleted_by_name,expires_at)
        VALUES (?,?,?,?,?,?,?,datetime('now','+30 days'))`)
        .run(uuid(), 'board', id, String(board.name ?? id), JSON.stringify(board), deletedById ?? null, deletedByName ?? null)
    }
    // Delete all tasks in this board first, then the board itself
    db().prepare('DELETE FROM task_activity WHERE task_id IN (SELECT id FROM workspace_tasks WHERE board_id=?)').run(id)
    db().prepare('DELETE FROM task_comments WHERE task_id IN (SELECT id FROM workspace_tasks WHERE board_id=?)').run(id)
    db().prepare('DELETE FROM workspace_tasks WHERE board_id=?').run(id)
    db().prepare('DELETE FROM workspace_boards WHERE id=?').run(id)
    return { ok: true }
  })

  ipcMain.handle('boards:duplicate', (_e, id: string, newName: string) => {
    const newId = uuid()
    const maxPos = (db().prepare('SELECT MAX(position) as mp FROM workspace_boards WHERE archived=0').get() as { mp: number | null })?.mp ?? -1
    db().prepare('INSERT INTO workspace_boards (id,name,position) VALUES (?,?,?)').run(newId, newName, maxPos + 1)
    return { ok: true, id: newId }
  })

  ipcMain.handle('boards:taskCount', (_e, id: string) => {
    const row = db().prepare('SELECT COUNT(*) as c FROM workspace_tasks WHERE board_id=?').get(id) as { c: number }
    return row.c
  })
}

// ── Workspace (local SQLite — columns + tasks) ────────────────────────────

function registerWorkspaceHandlers() {
  const db = () => getDatabase()

  // ── Columns ──
  ipcMain.handle('workspace:getColumns', () =>
    db().prepare('SELECT * FROM workspace_columns ORDER BY position ASC').all()
  )

  ipcMain.handle('workspace:addColumn', (_e, col: { id: string; name: string; position: number; color: string }) => {
    db().prepare('INSERT INTO workspace_columns (id,name,position,color) VALUES (?,?,?,?)').run(col.id, col.name, col.position, col.color)
    return { ok: true }
  })

  ipcMain.handle('workspace:updateColumn', (_e, colId: string, partial: { name?: string; position?: number }) => {
    const sets: string[] = []
    const vals: unknown[] = []
    if (partial.name     !== undefined) { sets.push('name=?');     vals.push(partial.name) }
    if (partial.position !== undefined) { sets.push('position=?'); vals.push(partial.position) }
    if (sets.length) db().prepare(`UPDATE workspace_columns SET ${sets.join(',')} WHERE id=?`).run(...vals, colId)
    return { ok: true }
  })

  // ── Tasks ──
  ipcMain.handle('workspace:getTasks', () => {
    const rows = db().prepare(`
      SELECT t.* FROM workspace_tasks t
      LEFT JOIN workspace_boards b ON t.board_id = b.id
      WHERE (t.archived IS NULL OR t.archived = 0)
        AND (b.id IS NULL OR b.archived = 0)
      ORDER BY t.position ASC
    `).all() as Record<string, unknown>[]
    return rows.map(r => ({ ...r, assignee_ids: JSON.parse((r.assignees_json as string) || '[]') }))
  })

  ipcMain.handle('workspace:archiveTask', (_e, taskId: string) => {
    db().prepare("UPDATE workspace_tasks SET archived=1, updated_at=datetime('now') WHERE id=?").run(taskId)
    return { ok: true }
  })

  ipcMain.handle('workspace:getArchivedTasks', () => {
    const rows = db().prepare(`
      SELECT t.* FROM workspace_tasks t
      WHERE t.archived = 1
      ORDER BY t.updated_at DESC
    `).all() as Record<string, unknown>[]
    return rows.map(r => ({ ...r, assignee_ids: JSON.parse((r.assignees_json as string) || '[]') }))
  })

  ipcMain.handle('workspace:restoreTask', (_e, taskId: string) => {
    db().prepare("UPDATE workspace_tasks SET archived=0, updated_at=datetime('now') WHERE id=?").run(taskId)
    return { ok: true }
  })

  ipcMain.handle('workspace:createTask', (_e, t: {
    id: string; board_id?: string; column_id: string; title: string; content_type: string;
    client: string | null; area_of_analysis: string | null; assignee_ids: string[];
    due_date: string | null; start_date: string | null; priority: string;
    description: string | null; notes: string | null; sources_json: string | null; position: number
  }) => {
    db().prepare(`INSERT INTO workspace_tasks
      (id,board_id,column_id,title,content_type,client,area_of_analysis,assignees_json,
       due_date,start_date,priority,description,notes,sources_json,position)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(t.id, t.board_id ?? 'board-main', t.column_id, t.title, t.content_type,
      t.client, t.area_of_analysis,
      JSON.stringify(t.assignee_ids ?? []),
      t.due_date, t.start_date, t.priority, t.description, t.notes, t.sources_json, t.position)
    return { ok: true }
  })

  ipcMain.handle('workspace:updateTask', (_e, taskId: string, partial: Record<string, unknown>) => {
    const sets: string[] = []
    const vals: unknown[] = []
    const fields: Record<string, string> = {
      column_id: 'column_id', title: 'title', content_type: 'content_type',
      client: 'client', client_id: 'client_id', area_of_analysis: 'area_of_analysis',
      due_date: 'due_date', start_date: 'start_date', priority: 'priority',
      description: 'description', notes: 'notes', sources_json: 'sources_json',
      position: 'position', recurrence_json: 'recurrence_json',
    }
    for (const [key, col] of Object.entries(fields)) {
      if (key in partial) { sets.push(`${col}=?`); vals.push(partial[key]) }
    }
    if ('assignee_ids' in partial) {
      sets.push('assignees_json=?')
      vals.push(JSON.stringify(partial.assignee_ids))
    }
    sets.push("updated_at=datetime('now')")
    if (sets.length > 1) db().prepare(`UPDATE workspace_tasks SET ${sets.join(',')} WHERE id=?`).run(...vals, taskId)

    // Recurring task auto-copy logic
    if ('column_id' in partial) {
      const newCol = partial.column_id as string
      if (newCol === 'col-delivery' || newCol === 'col-published') {
        const task = db().prepare('SELECT * FROM workspace_tasks WHERE id=?').get(taskId) as Record<string,unknown> | undefined
        if (task?.recurrence_json) {
          try {
            const rec = JSON.parse(task.recurrence_json as string) as { type: string; value: string | number }
            const now2 = new Date()
            let nextDue: Date | null = null
            if (task.due_date) {
              const base = new Date(task.due_date as string)
              if (rec.type === 'weekly')    { nextDue = new Date(base); nextDue.setDate(nextDue.getDate() + 7) }
              if (rec.type === 'monthly')   { nextDue = new Date(base); nextDue.setMonth(nextDue.getMonth() + 1) }
              if (rec.type === 'quarterly') { nextDue = new Date(base); nextDue.setMonth(nextDue.getMonth() + 3) }
              if (rec.type === 'custom')    { nextDue = new Date(base); nextDue.setDate(nextDue.getDate() + Number(rec.value)) }
            }
            const newId = uuid()
            const colCount = (db().prepare('SELECT COUNT(*) as c FROM workspace_tasks WHERE column_id=?').get('col-scoping') as {c:number}).c
            db().prepare(`INSERT INTO workspace_tasks
              (id,column_id,title,content_type,client,client_id,area_of_analysis,assignees_json,due_date,start_date,priority,recurrence_json,position)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
              .run(newId, 'col-scoping', task.title, task.content_type, task.client??null, task.client_id??null,
                   task.area_of_analysis??null, task.assignees_json??'[]',
                   nextDue ? nextDue.toISOString().slice(0,10) : null,
                   now2.toISOString().slice(0,10),
                   task.priority, task.recurrence_json, colCount)
          } catch {}
        }
      }
    }

    return { ok: true }
  })

  ipcMain.handle('workspace:deleteTask', (_e, taskId: string, deletedById?: string, deletedByName?: string) => {
    const task = db().prepare('SELECT * FROM workspace_tasks WHERE id=?').get(taskId) as Record<string, unknown> | undefined
    if (task) {
      db().prepare(`INSERT INTO trash (id,item_type,item_id,item_name,item_data_json,deleted_by_id,deleted_by_name,expires_at)
        VALUES (?,?,?,?,?,?,?,datetime('now','+30 days'))`)
        .run(uuid(), 'task', taskId, String(task.title ?? taskId), JSON.stringify(task), deletedById ?? null, deletedByName ?? null)
    }
    db().prepare('DELETE FROM workspace_tasks WHERE id=?').run(taskId)
    return { ok: true }
  })
}

// ── Clients ───────────────────────────────────────────────────────────────

function registerClientsHandlers() {
  const db = () => getDatabase()

  ipcMain.handle('clients:list', () =>
    db().prepare('SELECT * FROM clients ORDER BY name ASC').all()
  )
  ipcMain.handle('clients:get', (_e, id: string) => {
    const client = db().prepare('SELECT * FROM clients WHERE id=?').get(id)
    const contacts = db().prepare('SELECT * FROM client_contacts WHERE client_id=? ORDER BY created_at ASC').all(id)
    const tasks = db().prepare(`SELECT id,title,column_id,due_date,priority,content_type FROM workspace_tasks WHERE client_id=? ORDER BY due_date ASC NULLS LAST`).all(id)
    return { client, contacts, tasks }
  })
  ipcMain.handle('clients:create', (_e, data: Record<string, unknown>) => {
    const id = uuid()
    db().prepare(`INSERT INTO clients (id,name,type,country,region,status,primary_contact_name,primary_contact_email,primary_contact_phone,notes,area_tags_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, data.name, data.type??'Private', data.country??null, data.region??null, data.status??'Active',
           data.primary_contact_name??null, data.primary_contact_email??null, data.primary_contact_phone??null,
           data.notes??null, JSON.stringify(data.area_tags??[]))
    return { ok: true, id }
  })
  ipcMain.handle('clients:update', (_e, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const vals: unknown[] = []
    const fields: Record<string,string> = {
      name:'name', type:'type', country:'country', region:'region', status:'status',
      primary_contact_name:'primary_contact_name', primary_contact_email:'primary_contact_email',
      primary_contact_phone:'primary_contact_phone', notes:'notes'
    }
    for (const [k,col] of Object.entries(fields)) {
      if (k in data) { sets.push(`${col}=?`); vals.push(data[k]) }
    }
    if ('area_tags' in data) { sets.push('area_tags_json=?'); vals.push(JSON.stringify(data.area_tags)) }
    sets.push("updated_at=datetime('now')")
    if (sets.length > 1) db().prepare(`UPDATE clients SET ${sets.join(',')} WHERE id=?`).run(...vals, id)
    return { ok: true }
  })
  ipcMain.handle('clients:delete', (_e, id: string) => {
    db().prepare('DELETE FROM clients WHERE id=?').run(id)
    return { ok: true }
  })
  // Contacts
  ipcMain.handle('clients:addContact', (_e, clientId: string, contact: Record<string, unknown>) => {
    const id = uuid()
    db().prepare('INSERT INTO client_contacts (id,client_id,name,role,email,phone) VALUES (?,?,?,?,?,?)')
      .run(id, clientId, contact.name, contact.role??null, contact.email??null, contact.phone??null)
    return { ok: true, id }
  })
  ipcMain.handle('clients:deleteContact', (_e, contactId: string) => {
    db().prepare('DELETE FROM client_contacts WHERE id=?').run(contactId)
    return { ok: true }
  })
}

// ── Contacts ──────────────────────────────────────────────────────────────

function registerContactsHandlers() {
  const db = () => getDatabase()

  ipcMain.handle('contacts:list', () =>
    db().prepare('SELECT * FROM contacts ORDER BY full_name ASC').all()
  )

  ipcMain.handle('contacts:get', (_e, id: string) => {
    const contact = db().prepare('SELECT * FROM contacts WHERE id=?').get(id)
    const interactions = db().prepare(
      'SELECT * FROM contact_interactions WHERE contact_id=? ORDER BY date DESC, created_at DESC'
    ).all(id)
    const linkedIds = (db().prepare('SELECT task_id FROM contact_task_links WHERE contact_id=?').all(id) as { task_id: string }[])
      .map(r => r.task_id)
    const tasks = linkedIds.length > 0
      ? db().prepare(
          `SELECT id,title,column_id,due_date,priority,content_type FROM workspace_tasks
           WHERE id IN (${linkedIds.map(() => '?').join(',')})
           ORDER BY due_date ASC NULLS LAST`
        ).all(...linkedIds)
      : []
    return { contact, interactions, tasks }
  })

  ipcMain.handle('contacts:create', (_e, data: Record<string, unknown>) => {
    const id = uuid()
    db().prepare(`INSERT INTO contacts
      (id,full_name,job_title,organization,contact_types_json,
       email_primary,email_secondary,phone_primary,phone_mobile,phone_secondary,
       linkedin_url,twitter_handle,telegram_username,website_url,
       country,city,languages_json,org_type,expertise_areas_json,
       security_sensitivity,how_we_met,how_we_met_note,assigned_to,
       last_contacted_date,confidential,do_not_contact,internal_notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id, data.full_name, data.job_title ?? null, data.organization ?? null,
        JSON.stringify(data.contact_types ?? []),
        data.email_primary ?? null, data.email_secondary ?? null,
        data.phone_primary ?? null, data.phone_mobile ?? null, data.phone_secondary ?? null,
        data.linkedin_url ?? null, data.twitter_handle ?? null,
        data.telegram_username ?? null, data.website_url ?? null,
        data.country ?? null, data.city ?? null,
        JSON.stringify(data.languages ?? []),
        data.org_type ?? null, JSON.stringify(data.expertise_areas ?? []),
        data.security_sensitivity ?? 'none',
        data.how_we_met ?? null, data.how_we_met_note ?? null,
        data.assigned_to ?? null, data.last_contacted_date ?? null,
        data.confidential ?? 0, data.do_not_contact ?? 0,
        data.internal_notes ?? null, data.created_by ?? null
      )
    return { ok: true, id }
  })

  ipcMain.handle('contacts:update', (_e, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const vals: unknown[] = []
    const fields: Record<string, string> = {
      full_name: 'full_name', job_title: 'job_title', organization: 'organization',
      email_primary: 'email_primary', email_secondary: 'email_secondary',
      phone_primary: 'phone_primary', phone_mobile: 'phone_mobile', phone_secondary: 'phone_secondary',
      linkedin_url: 'linkedin_url', twitter_handle: 'twitter_handle',
      telegram_username: 'telegram_username', website_url: 'website_url',
      country: 'country', city: 'city',
      org_type: 'org_type', security_sensitivity: 'security_sensitivity',
      how_we_met: 'how_we_met', how_we_met_note: 'how_we_met_note',
      assigned_to: 'assigned_to', last_contacted_date: 'last_contacted_date',
      confidential: 'confidential', do_not_contact: 'do_not_contact',
      internal_notes: 'internal_notes',
      notes_updated_by: 'notes_updated_by', notes_updated_at: 'notes_updated_at',
    }
    for (const [k, col] of Object.entries(fields)) {
      if (k in data) { sets.push(`${col}=?`); vals.push(data[k]) }
    }
    if ('contact_types' in data) { sets.push('contact_types_json=?'); vals.push(JSON.stringify(data.contact_types)) }
    if ('languages' in data)     { sets.push('languages_json=?');     vals.push(JSON.stringify(data.languages)) }
    if ('expertise_areas' in data){ sets.push('expertise_areas_json=?'); vals.push(JSON.stringify(data.expertise_areas)) }
    sets.push("updated_at=datetime('now')")
    if (sets.length > 1) db().prepare(`UPDATE contacts SET ${sets.join(',')} WHERE id=?`).run(...vals, id)
    return { ok: true }
  })

  ipcMain.handle('contacts:delete', (_e, id: string, deletedById?: string, deletedByName?: string) => {
    const contact = db().prepare('SELECT * FROM contacts WHERE id=?').get(id) as Record<string, unknown> | undefined
    if (contact) {
      db().prepare(`INSERT INTO trash (id,item_type,item_id,item_name,item_data_json,deleted_by_id,deleted_by_name,expires_at)
        VALUES (?,?,?,?,?,?,?,datetime('now','+30 days'))`)
        .run(uuid(), 'contact', id, String(contact.full_name ?? id), JSON.stringify(contact), deletedById ?? null, deletedByName ?? null)
    }
    db().prepare('DELETE FROM contact_task_links WHERE contact_id=?').run(id)
    db().prepare('DELETE FROM contact_interactions WHERE contact_id=?').run(id)
    db().prepare('DELETE FROM contacts WHERE id=?').run(id)
    return { ok: true }
  })

  ipcMain.handle('contacts:addInteraction', (_e, data: Record<string, unknown>) => {
    const id = uuid()
    db().prepare(`INSERT INTO contact_interactions
      (id,contact_id,date,type,summary,logged_by_id,logged_by_name,follow_up,follow_up_date)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, data.contact_id, data.date, data.type, data.summary,
           data.logged_by_id ?? null, data.logged_by_name ?? null,
           data.follow_up ?? 0, data.follow_up_date ?? null)
    // Update last_contacted_date if this is more recent
    db().prepare(`UPDATE contacts SET last_contacted_date=?,updated_at=datetime('now')
      WHERE id=? AND (last_contacted_date IS NULL OR last_contacted_date < ?)`)
      .run(data.date, data.contact_id, data.date)
    return { ok: true, id }
  })

  ipcMain.handle('contacts:updateInteraction', (_e, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const vals: unknown[] = []
    if ('date' in data)           { sets.push('date=?');           vals.push(data.date) }
    if ('type' in data)           { sets.push('type=?');           vals.push(data.type) }
    if ('summary' in data)        { sets.push('summary=?');        vals.push(data.summary) }
    if ('follow_up' in data)      { sets.push('follow_up=?');      vals.push(data.follow_up) }
    if ('follow_up_date' in data) { sets.push('follow_up_date=?'); vals.push(data.follow_up_date) }
    sets.push("updated_at=datetime('now')")
    if (sets.length > 1) db().prepare(`UPDATE contact_interactions SET ${sets.join(',')} WHERE id=?`).run(...vals, id)
    return { ok: true }
  })

  ipcMain.handle('contacts:deleteInteraction', (_e, id: string) => {
    db().prepare('DELETE FROM contact_interactions WHERE id=?').run(id)
    return { ok: true }
  })

  ipcMain.handle('contacts:linkTask', (_e, contactId: string, taskId: string) => {
    db().prepare('INSERT OR IGNORE INTO contact_task_links (contact_id,task_id) VALUES (?,?)').run(contactId, taskId)
    return { ok: true }
  })

  ipcMain.handle('contacts:unlinkTask', (_e, contactId: string, taskId: string) => {
    db().prepare('DELETE FROM contact_task_links WHERE contact_id=? AND task_id=?').run(contactId, taskId)
    return { ok: true }
  })
}

// ── Templates ──────────────────────────────────────────────────────────────

function registerTemplatesHandlers() {
  const db = () => getDatabase()
  ipcMain.handle('templates:list', () =>
    db().prepare('SELECT * FROM task_templates ORDER BY is_builtin DESC, name ASC').all()
  )
  ipcMain.handle('templates:create', (_e, data: Record<string, unknown>) => {
    const id = uuid()
    db().prepare(`INSERT INTO task_templates (id,name,content_type,duration_days,checklist_json,is_builtin) VALUES (?,?,?,?,?,0)`)
      .run(id, data.name, data.content_type??'policy-brief', data.duration_days??7, JSON.stringify(data.checklist??[]))
    return { ok: true, id }
  })
  ipcMain.handle('templates:update', (_e, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const vals: unknown[] = []
    if ('name' in data) { sets.push('name=?'); vals.push(data.name) }
    if ('content_type' in data) { sets.push('content_type=?'); vals.push(data.content_type) }
    if ('duration_days' in data) { sets.push('duration_days=?'); vals.push(data.duration_days) }
    if ('checklist' in data) { sets.push('checklist_json=?'); vals.push(JSON.stringify(data.checklist)) }
    sets.push("updated_at=datetime('now')")
    if (sets.length > 1) db().prepare(`UPDATE task_templates SET ${sets.join(',')} WHERE id=? AND is_builtin=0`).run(...vals, id)
    return { ok: true }
  })
  ipcMain.handle('templates:delete', (_e, id: string) => {
    db().prepare('DELETE FROM task_templates WHERE id=? AND is_builtin=0').run(id)
    return { ok: true }
  })
}

// ── Analytics ──────────────────────────────────────────────────────────────

function registerAnalyticsHandlers() {
  ipcMain.handle('analytics:getData', () => {
    const db = getDatabase()
    const tasks = db.prepare('SELECT * FROM workspace_tasks').all() as Record<string,unknown>[]
    const activity = db.prepare(`
      SELECT * FROM task_activity
      WHERE created_at >= datetime('now', '-7 days')
      ORDER BY created_at DESC
    `).all()
    const comments = db.prepare(`
      SELECT * FROM task_comments
      WHERE created_at >= datetime('now', '-7 days')
      ORDER BY created_at DESC
    `).all()
    // Time in stage: compute average days between stage change events per column
    const stageActivity = db.prepare(`
      SELECT task_id, action, created_at FROM task_activity
      WHERE action LIKE 'moved to%'
      ORDER BY created_at ASC
    `).all() as { task_id: string; action: string; created_at: string }[]
    return { tasks, activity, comments, stageActivity }
  })

  ipcMain.handle('analytics:exportPDF', async (_e) => {
    try {
      const { BrowserWindow } = await import('electron')
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { ok: false, error: 'No window' }
      const data = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        landscape: false,
        margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      })
      const { app: electronApp } = await import('electron')
      const { join: joinPath } = await import('path')
      const { writeFileSync } = await import('fs')
      const filePath = joinPath(electronApp.getPath('downloads'), `KCHub-Analytics-${new Date().toISOString().slice(0,10)}.pdf`)
      writeFileSync(filePath, data)
      const { shell } = await import('electron')
      shell.showItemInFolder(filePath)
      return { ok: true, filePath }
    } catch (err: unknown) {
      return { ok: false, error: String(err) }
    }
  })
}

// ── Dialog ─────────────────────────────────────────────────────────────────

function registerDialogHandlers() {
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    return result
  })
}

// ── Trash ──────────────────────────────────────────────────────────────────

function registerTrashHandlers() {
  const db = () => getDatabase()

  ipcMain.handle('trash:list', () =>
    db().prepare('SELECT * FROM trash ORDER BY deleted_at DESC').all()
  )

  ipcMain.handle('trash:count', () => {
    const row = db().prepare('SELECT COUNT(*) as c FROM trash').get() as { c: number }
    return row.c
  })

  ipcMain.handle('trash:restore', (_e, id: string) => {
    const item = db().prepare('SELECT * FROM trash WHERE id=?').get(id) as Record<string, unknown> | undefined
    if (!item) return { error: 'Item not found in trash' }
    try {
      if (item.item_type === 'task') {
        db().prepare("UPDATE workspace_tasks SET archived=0, updated_at=datetime('now') WHERE id=?").run(item.item_id)
      } else if (item.item_type === 'board') {
        const maxPos = (db().prepare('SELECT MAX(position) as mp FROM workspace_boards WHERE archived=0').get() as { mp: number | null })?.mp ?? -1
        db().prepare("UPDATE workspace_boards SET archived=0, archived_at=NULL, archived_by=NULL, position=?, updated_at=datetime('now') WHERE id=?").run(maxPos + 1, item.item_id)
      } else if (item.item_type === 'comment') {
        try {
          const data = JSON.parse(item.item_data_json as string) as Record<string, unknown>
          db().prepare(`INSERT OR IGNORE INTO task_comments (id,task_id,author_id,author_name,content,created_at)
            VALUES (?,?,?,?,?,?)`)
            .run(data.id, data.task_id, data.author_id, data.author_name, data.content, data.created_at)
        } catch {}
      }
      db().prepare('DELETE FROM trash WHERE id=?').run(id)
      return { ok: true }
    } catch (err: unknown) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('trash:deletePermanently', (_e, id: string) => {
    const item = db().prepare('SELECT * FROM trash WHERE id=?').get(id) as Record<string, unknown> | undefined
    if (!item) return { error: 'Item not found in trash' }
    // Hard-delete already happened when the item was first deleted; just remove from trash
    db().prepare('DELETE FROM trash WHERE id=?').run(id)
    return { ok: true }
  })

  ipcMain.handle('trash:emptyTrash', () => {
    db().prepare('DELETE FROM trash').run()
    return { ok: true }
  })

  ipcMain.handle('trash:restoreAll', () => {
    const items = db().prepare('SELECT * FROM trash').all() as Record<string, unknown>[]
    for (const item of items) {
      try {
        if (item.item_type === 'task') {
          db().prepare("UPDATE workspace_tasks SET archived=0, updated_at=datetime('now') WHERE id=?").run(item.item_id)
        } else if (item.item_type === 'board') {
          const maxPos = (db().prepare('SELECT MAX(position) as mp FROM workspace_boards WHERE archived=0').get() as { mp: number | null })?.mp ?? -1
          db().prepare("UPDATE workspace_boards SET archived=0, archived_at=NULL, archived_by=NULL, position=?, updated_at=datetime('now') WHERE id=?").run(maxPos + 1, item.item_id)
        } else if (item.item_type === 'comment') {
          try {
            const data = JSON.parse(item.item_data_json as string) as Record<string, unknown>
            db().prepare(`INSERT OR IGNORE INTO task_comments (id,task_id,author_id,author_name,content,created_at)
              VALUES (?,?,?,?,?,?)`)
              .run(data.id, data.task_id, data.author_id, data.author_name, data.content, data.created_at)
          } catch {}
        }
      } catch {}
    }
    db().prepare('DELETE FROM trash').run()
    return { ok: true }
  })
}

// ── Trash auto-delete (called once on startup) ─────────────────────────────

function startTrashAutoDelete() {
  const doCleanup = () => {
    try {
      const database = getDatabase()
      const expired = database.prepare("SELECT * FROM trash WHERE expires_at <= datetime('now')").all()
      if (expired.length > 0) {
        database.prepare("DELETE FROM trash WHERE expires_at <= datetime('now')").run()
        console.log(`[Trash] Auto-deleted ${expired.length} expired items`)
      }
    } catch {}
  }
  doCleanup()
  setInterval(doCleanup, 24 * 60 * 60 * 1000)
}

// ── Calendar ───────────────────────────────────────────────────────────────

function registerCalendarHandlers() {
  const db = () => getDatabase()

  ipcMain.handle('calendar:list', (_e, startDate: string, endDate: string) => {
    const raw = db().prepare(`SELECT * FROM calendar_events
      WHERE start_date <= ? AND end_date >= ?
      ORDER BY start_date ASC`).all(endDate, startDate) as any[]

    // Expand recurring events
    const expanded: any[] = []
    for (const ev of raw) {
      expanded.push(ev)
      if (!ev.recurrence_json) continue
      try {
        const r = JSON.parse(ev.recurrence_json) as { freq: string; interval?: number; endType: 'never'|'count'|'date'; endCount?: number; endDate?: string }
        if (!r.freq || r.freq === 'none') continue
        const masterStart = new Date(ev.start_date)
        const masterEnd   = new Date(ev.end_date)
        const duration    = masterEnd.getTime() - masterStart.getTime()
        const freqMap: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, annually: 365 }
        const intervalDays = (freqMap[r.freq] ?? 7) * (r.interval ?? 1)
        const rangeEndDate = new Date(endDate + 'T23:59:59')
        let count = 1
        let cursor = new Date(masterStart)
        // advance by one interval to skip master
        if (r.freq === 'monthly') { cursor.setMonth(cursor.getMonth() + (r.interval ?? 1)) }
        else { cursor.setDate(cursor.getDate() + intervalDays) }
        while (cursor <= rangeEndDate) {
          if (r.endType === 'count' && count >= (r.endCount ?? 1)) break
          if (r.endType === 'date' && r.endDate && cursor > new Date(r.endDate)) break
          const instanceEnd = new Date(cursor.getTime() + duration)
          expanded.push({
            ...ev,
            id: ev.id + '-' + cursor.toISOString().slice(0, 10),
            start_date: ev.all_day ? cursor.toISOString().slice(0, 10) : cursor.toISOString().slice(0, 16),
            end_date:   ev.all_day ? instanceEnd.toISOString().slice(0, 10) : instanceEnd.toISOString().slice(0, 16),
            recurrence_parent_id: ev.id,
          })
          count++
          if (r.freq === 'monthly') { cursor.setMonth(cursor.getMonth() + (r.interval ?? 1)) }
          else { cursor.setDate(cursor.getDate() + intervalDays) }
          if (count > 365) break // safety cap
        }
      } catch {}
    }
    return expanded
  })

  ipcMain.handle('calendar:get', (_e, id: string) =>
    db().prepare('SELECT * FROM calendar_events WHERE id=?').get(id)
  )

  ipcMain.handle('calendar:create', (_e, data: Record<string, unknown>) => {
    const id = uuid()
    db().prepare(`INSERT INTO calendar_events
      (id,title,description,location,start_date,end_date,all_day,color,visibility,created_by_id,created_by_name,attendees_json,linked_task_id,recurrence_json,meeting_link,meeting_type,external_attendees_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id,
        data.title,
        data.description ?? null,
        data.location ?? null,
        data.start_date,
        data.end_date,
        data.all_day ? 1 : 0,
        data.color ?? '#6366f1',
        data.visibility ?? 'team',
        data.created_by_id ?? null,
        data.created_by_name ?? null,
        JSON.stringify(data.attendees ?? []),
        data.linked_task_id ?? null,
        data.recurrence_json ? JSON.stringify(data.recurrence_json) : null,
        data.meeting_link ?? null,
        data.meeting_type ?? null,
        JSON.stringify(data.external_attendees ?? [])
      )

    // Sync to Google Calendar if hub Drive is connected and there are attendees
    const attendeeObjs = Array.isArray(data.attendees) ? data.attendees : []
    const allAttendees = [...attendeeObjs, ...(Array.isArray(data.external_attendees) ? data.external_attendees : [])]
    if (driveSync.isConnected() && allAttendees.length > 0) {
      const attendeeEmails = allAttendees.map((a: any) => a.email).filter(Boolean)
      void driveSync.createCalendarEvent({
        title: String(data.title),
        description: data.description as string ?? null,
        location: data.location as string ?? null,
        startDate: String(data.start_date),
        endDate: String(data.end_date),
        allDay: !!(data.all_day),
        attendeeEmails,
        meetingLink: data.meeting_link as string ?? null,
      }).then(googleEventId => {
        if (googleEventId) {
          getDatabase().prepare("UPDATE calendar_events SET google_event_id=? WHERE id=?").run(googleEventId, id)
        }
      })

      // Send in-app notifications to internal attendees
      for (const attendee of attendeeObjs) {
        if ((attendee as any).id) {
          createNotification({
            user_id: (attendee as any).id,
            type: 'calendar_invite',
            title: `You've been invited to "${data.title}"`,
            body: `${data.start_date ? new Date(data.start_date as string).toLocaleString() : ''}`,
            actor_name: data.created_by_name as string ?? undefined,
          })
        }
      }
    }

    return { ok: true, id }
  })

  ipcMain.handle('calendar:update', (_e, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const vals: unknown[] = []
    const fields: Record<string, string> = {
      title: 'title', description: 'description', location: 'location',
      start_date: 'start_date', end_date: 'end_date', all_day: 'all_day',
      color: 'color', visibility: 'visibility', linked_task_id: 'linked_task_id',
      meeting_link: 'meeting_link', meeting_type: 'meeting_type',
    }
    for (const [k, col] of Object.entries(fields)) {
      if (k in data) { sets.push(`${col}=?`); vals.push(data[k]) }
    }
    if ('attendees' in data) { sets.push('attendees_json=?'); vals.push(JSON.stringify(data.attendees)) }
    if ('recurrence_json' in data) { sets.push('recurrence_json=?'); vals.push(data.recurrence_json ? JSON.stringify(data.recurrence_json) : null) }
    if ('external_attendees' in data) { sets.push('external_attendees_json=?'); vals.push(JSON.stringify(data.external_attendees ?? [])) }
    sets.push("updated_at=datetime('now')")
    if (sets.length > 1) db().prepare(`UPDATE calendar_events SET ${sets.join(',')} WHERE id=?`).run(...vals, id)

    // Sync to Google Calendar if hub Drive is connected
    const ev = db().prepare('SELECT * FROM calendar_events WHERE id=?').get(id) as any
    if (driveSync.isConnected() && ev?.google_event_id) {
      const attendeeObjs = ev.attendees_json ? JSON.parse(ev.attendees_json) : []
      const extAttendees = ev.external_attendees_json ? JSON.parse(ev.external_attendees_json) : []
      const emails = [...attendeeObjs, ...extAttendees].map((a: any) => a.email).filter(Boolean)
      void driveSync.updateCalendarEvent(ev.google_event_id, {
        title: data.title as string ?? ev.title,
        description: data.description as string ?? ev.description,
        location: data.location as string ?? ev.location,
        startDate: data.start_date as string ?? ev.start_date,
        endDate: data.end_date as string ?? ev.end_date,
        allDay: !!(data.all_day ?? ev.all_day),
        attendeeEmails: emails,
      })
    }

    return { ok: true }
  })

  ipcMain.handle('calendar:delete', (_e, id: string) => {
    db().prepare('DELETE FROM calendar_events WHERE id=?').run(id)
    return { ok: true }
  })
}

// ── Files ──────────────────────────────────────────────────────────────────

function registerFilesHandlers() {
  ipcMain.handle('files:listAll', () => {
    return getDatabase().prepare(`
      SELECT
        a.*,
        t.title as task_title,
        t.board_id,
        b.name as board_name,
        t.column_id
      FROM task_attachments a
      LEFT JOIN workspace_tasks t ON a.task_id = t.id
      LEFT JOIN workspace_boards b ON t.board_id = b.id
      WHERE (t.archived IS NULL OR t.archived = 0)
      ORDER BY a.created_at DESC
    `).all()
  })
}

// ── User Google ────────────────────────────────────────────────────────────

function registerUserGoogleHandlers() {
  ipcMain.handle('userGoogle:connect',    (_e, userId: string) => connectUserGoogle(userId))
  ipcMain.handle('userGoogle:getStatus',  (_e, userId: string) => getUserGoogleStatus(userId))
  ipcMain.handle('userGoogle:disconnect', (_e, userId: string) => { disconnectUserGoogle(userId); return { ok: true } })
}

function registerDriveConnectHandler() {
  ipcMain.handle('drive:connect', () => driveSync.connect())
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
  registerLabelHandlers()
  registerChecklistHandlers()
  registerAttachmentHandlers()
  registerNotificationHandlers()
  registerChatHandlers()
  registerCommentEditHandler()
  registerDialogHandlers()
  registerBoardHandlers()
  registerWorkspaceHandlers()
  registerClientsHandlers()
  registerContactsHandlers()
  registerTemplatesHandlers()
  registerAnalyticsHandlers()
  registerTrashHandlers()
  registerCalendarHandlers()
  registerFilesHandlers()
  registerUserGoogleHandlers()
  registerDriveConnectHandler()
  startTrashAutoDelete()
}
