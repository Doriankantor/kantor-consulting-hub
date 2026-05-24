import { ipcMain, BrowserWindow } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { createHash, randomBytes } from 'crypto'
import { getDatabase, hashPassword } from '../db'

// ── Helpers ────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID()
}
function now() {
  return new Date().toISOString()
}

// ── Settings ───────────────────────────────────────────────────────────────

function registerSettingsHandlers() {
  ipcMain.handle('settings:get', (_e, key: string): string | null => {
    const row = getDatabase()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row?.value ?? null
  })

  ipcMain.handle('settings:set', (_e, key: string, value: string): boolean => {
    getDatabase()
      .prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE
          SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `)
      .run(key, value)
    return true
  })

  ipcMain.handle('settings:delete', (_e, key: string): boolean => {
    getDatabase().prepare('DELETE FROM settings WHERE key = ?').run(key)
    return true
  })

  ipcMain.handle('settings:getAll', (): Record<string, string> => {
    const rows = getDatabase()
      .prepare('SELECT key, value FROM settings')
      .all() as { key: string; value: string }[]
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  })
}

// ── Projects ───────────────────────────────────────────────────────────────

function registerProjectHandlers() {
  ipcMain.handle('projects:getAll', () =>
    getDatabase().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
  )

  ipcMain.handle('projects:upsert', (_e, project: Record<string, unknown>) => {
    getDatabase().prepare(`
      INSERT INTO projects (id, title, description, status, owner_id, created_at, updated_at, is_dirty)
      VALUES (@id, @title, @description, @status, @owner_id, @created_at, @updated_at, 1)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title, description = excluded.description,
        status = excluded.status, updated_at = excluded.updated_at, is_dirty = 1
    `).run(project)
    return true
  })
}

// ── Tasks ──────────────────────────────────────────────────────────────────

function registerTaskHandlers() {
  ipcMain.handle('tasks:getByProject', (_e, projectId: string) =>
    getDatabase()
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY position ASC')
      .all(projectId)
  )
}

// ── Comments ───────────────────────────────────────────────────────────────

function registerCommentHandlers() {
  ipcMain.handle('comments:get', (_e, taskId: string) =>
    getDatabase()
      .prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId)
  )

  ipcMain.handle('comments:add', (_e, comment: {
    task_id: string; author_id: string; author_name: string; content: string
  }) => {
    const entry = { id: uuid(), created_at: now(), ...comment }
    getDatabase().prepare(`
      INSERT INTO task_comments (id, task_id, author_id, author_name, content, created_at)
      VALUES (@id, @task_id, @author_id, @author_name, @content, @created_at)
    `).run(entry)
    return entry
  })

  ipcMain.handle('comments:delete', (_e, commentId: string): boolean => {
    getDatabase().prepare('DELETE FROM task_comments WHERE id = ?').run(commentId)
    return true
  })
}

// ── Activity log ───────────────────────────────────────────────────────────

function registerActivityHandlers() {
  ipcMain.handle('activity:get', (_e, taskId: string) =>
    getDatabase()
      .prepare('SELECT * FROM task_activity WHERE task_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(taskId)
  )

  ipcMain.handle('activity:add', (_e, entry: {
    task_id: string; actor_name: string; action: string
  }) => {
    const row = { id: uuid(), created_at: now(), ...entry }
    getDatabase().prepare(`
      INSERT INTO task_activity (id, task_id, actor_name, action, created_at)
      VALUES (@id, @task_id, @actor_name, @action, @created_at)
    `).run(row)
    return row
  })
}

// ── Claude AI (streaming) ──────────────────────────────────────────────────

function buildSystemPrompt(ctx: Record<string, string | null>): string {
  return `You are an expert political analysis assistant working with Kantor Consulting — a boutique consultancy specialising in geopolitical risk, foreign policy analysis, and strategic advisory for government, financial, and private-sector clients.

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

function registerClaudeHandlers() {
  // Start a streaming chat session
  // Returns { started: true } immediately; chunks arrive as 'claude:chunk' events
  ipcMain.handle('claude:sendMessage', async (event, params: {
    messages: { role: 'user' | 'assistant'; content: string }[]
    taskContext: Record<string, string | null>
  }) => {
    const db = getDatabase()
    const keyRow = db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('anthropic_api_key') as { value: string } | undefined

    if (!keyRow?.value) {
      return { error: 'No Anthropic API key found. Please add your key in Settings → AI Configuration.' }
    }

    const anthropic = new Anthropic({ apiKey: keyRow.value })

    // Fire-and-forget stream — caller listens for claude:chunk / claude:done events
    ;(async () => {
      try {
        const stream = anthropic.messages.stream({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: buildSystemPrompt(params.taskContext),
          messages: params.messages,
        })

        for await (const event_chunk of stream) {
          if (
            event_chunk.type === 'content_block_delta' &&
            event_chunk.delta.type === 'text_delta'
          ) {
            if (!event.sender.isDestroyed()) {
              event.sender.send('claude:chunk', event_chunk.delta.text)
            }
          }
        }

        await stream.finalMessage()
        if (!event.sender.isDestroyed()) event.sender.send('claude:done')
      } catch (err: any) {
        if (!event.sender.isDestroyed()) {
          event.sender.send('claude:error', err.message ?? 'Unknown error')
        }
      }
    })()

    return { started: true }
  })
}

// ── Local auth ─────────────────────────────────────────────────────────────

function getSetting(key: string): string | null {
  const row = getDatabase()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setSetting(key: string, value: string) {
  getDatabase().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value)
}

function registerAuthHandlers() {
  // Sign in with local credentials
  ipcMain.handle('auth:localSignIn', (_e, email: string, password: string) => {
    const storedEmail = getSetting('local_admin_email')
    const storedSalt  = getSetting('local_admin_salt')
    const storedHash  = getSetting('local_admin_hash')
    const storedName  = getSetting('local_admin_name') ?? 'Admin'

    if (!storedEmail || !storedSalt || !storedHash) {
      return { error: 'No local account found.' }
    }
    if (email.trim().toLowerCase() !== storedEmail.toLowerCase()) {
      return { error: 'Invalid email or password.' }
    }
    const hash = hashPassword(password, storedSalt)
    if (hash !== storedHash) {
      return { error: 'Invalid email or password.' }
    }

    return {
      ok: true,
      user: { id: 'local-admin', email: storedEmail, name: storedName, role: 'admin' },
    }
  })

  // Change local admin password
  ipcMain.handle('auth:changeLocalPassword', (_e, currentPassword: string, newPassword: string) => {
    const storedSalt = getSetting('local_admin_salt')
    const storedHash = getSetting('local_admin_hash')
    if (!storedSalt || !storedHash) return { error: 'No local account.' }

    if (hashPassword(currentPassword, storedSalt) !== storedHash) {
      return { error: 'Current password is incorrect.' }
    }
    const newSalt = randomBytes(16).toString('hex')
    const newHash = hashPassword(newPassword, newSalt)
    setSetting('local_admin_salt', newSalt)
    setSetting('local_admin_hash', newHash)
    return { ok: true }
  })
}

// ── Boot ───────────────────────────────────────────────────────────────────

export function registerIpcHandlers(): void {
  registerSettingsHandlers()
  registerProjectHandlers()
  registerTaskHandlers()
  registerCommentHandlers()
  registerActivityHandlers()
  registerClaudeHandlers()
  registerAuthHandlers()
}
