import { ipcMain, app, dialog, shell } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { randomBytes, createHash, createHmac } from 'crypto'
import { getDatabase, hashPassword } from '../db'
import { driveSync } from '../google/drive'
import { sendEmail, inviteEmailHtml } from '../google/gmail'
import { connectUserGoogle, getUserGoogleStatus, disconnectUserGoogle, getUserCalendars, getUserCalendarEvents, diagnoseUserGoogle } from '../google/userGoogle'

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

// ── Learning loop: mirror review verdicts up to Supabase cs_articles ─────────
// The daily GitHub-Actions fetcher (scripts/) reads cs_articles to calibrate its
// Claude relevance gate (few-shot examples + per-source/category weighting). The
// app records approve/reject in LOCAL SQLite (intelligence_sources), so we mirror
// those verdicts up to cs_articles.status — matched by the article URL, which is
// the shared join key between the website-imported rows and the pipeline rows.
// Fire-and-forget and FAIL-OPEN: a Supabase/network error must NEVER block or
// break a review action. Only 'approved' / 'rejected' are learning signals.
function verdictToCsStatus(status: string): 'approved' | 'rejected' | null {
  return status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : null
}

async function pushVerdictToSupabase(url: string | null | undefined, status: string, reviewerName?: string | null): Promise<void> {
  const csStatus = verdictToCsStatus(status)
  if (!url || !csStatus) return
  try {
    const patch: Record<string, unknown> = { status: csStatus }
    if (csStatus === 'approved') {
      patch.approved_by = reviewerName ?? null
      patch.approved_at = new Date().toISOString()
    }
    const { error } = await supabaseAdmin.from('cs_articles').update(patch).eq('url', url)
    if (error) console.warn('[Learning] cs_articles verdict write-back failed:', error.message)
  } catch (e) {
    console.warn('[Learning] cs_articles verdict write-back threw:', (e as Error)?.message)
  }
}

// Bulk variant (confirmImported / backfill): one chunked UPDATE per verdict class.
async function pushVerdictsToSupabase(urls: Array<string | null | undefined>, status: string, reviewerName?: string | null): Promise<void> {
  const csStatus = verdictToCsStatus(status)
  const clean = urls.filter((u): u is string => typeof u === 'string' && u.length > 0)
  if (!csStatus || clean.length === 0) return
  try {
    const patch: Record<string, unknown> = { status: csStatus }
    if (csStatus === 'approved') {
      patch.approved_by = reviewerName ?? null
      patch.approved_at = new Date().toISOString()
    }
    const CHUNK = 100
    for (let i = 0; i < clean.length; i += CHUNK) {
      const chunk = clean.slice(i, i + CHUNK)
      const { error } = await supabaseAdmin.from('cs_articles').update(patch).in('url', chunk)
      if (error) console.warn('[Learning] cs_articles bulk write-back failed:', error.message)
    }
  } catch (e) {
    console.warn('[Learning] cs_articles bulk write-back threw:', (e as Error)?.message)
  }
}

// One-time backfill: push EXISTING local approve/reject verdicts up to cs_articles
// so the gate has training signal immediately instead of waiting for new reviews.
// Idempotent (UPDATE-by-URL) and guarded by a settings flag so it runs once.
async function backfillDecisionsToSupabase(): Promise<void> {
  try {
    const db = getDatabase()
    const approved = (db.prepare("SELECT url FROM intelligence_sources WHERE status='approved' AND url IS NOT NULL").all() as { url: string }[]).map((r) => r.url)
    const rejected = (db.prepare("SELECT url FROM intelligence_sources WHERE status='rejected' AND url IS NOT NULL").all() as { url: string }[]).map((r) => r.url)
    await pushVerdictsToSupabase(approved, 'approved', 'Backfill')
    await pushVerdictsToSupabase(rejected, 'rejected')
    setSetting('cs_decisions_backfilled_v1', 'done')
    console.log(`[Learning] Backfilled ${approved.length} approved + ${rejected.length} rejected verdict(s) to cs_articles.`)
  } catch (e) {
    console.warn('[Learning] backfill failed:', (e as Error)?.message)
  }
}

function uuid(): string { return crypto.randomUUID() }
function now():  string { return new Date().toISOString() }

// ── Offline-verifiable access codes ────────────────────────────────────────
// An invited user can sign in on ANY machine using a code their admin shares.
// The code is a deterministic signature of their email, computed with a secret
// baked into every build (derived from the service-role key). Because all
// installs share the same secret, any copy of the app can verify a code that
// any other copy generated — no cloud round-trip, no email, no shared database.
const INVITE_HMAC_KEY = createHash('sha256')
  .update('kc-invite-v1|' + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'kc-fallback-secret'))
  .digest()

function inviteCodeForEmail(email: string): string {
  const mac = createHmac('sha256', INVITE_HMAC_KEY)
    .update(email.trim().toLowerCase())
    .digest('hex')
    .toUpperCase()
  // 12 hex chars (48 bits), grouped for readability: KC-XXXX-XXXX-XXXX
  return `KC-${mac.slice(0, 4)}-${mac.slice(4, 8)}-${mac.slice(8, 12)}`
}

// Canonical form for comparison — tolerates dashes, spaces, and case so the
// user can type "kc xxxx xxxx xxxx", "KC-XXXX-XXXX-XXXX", or paste either.
function canonCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

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

// ── Supabase Auth bridge ───────────────────────────────────────────────────
// Source-of-truth for passwords is now Supabase Auth (cloud). Local SQLite
// keeps a mirrored hash so the app still functions offline and so the
// established sign-in code path keeps working, but the cloud value wins.
//
// All three helpers are idempotent and fail-open from the caller's POV:
// if Supabase is unreachable, the local sign-in still succeeds for THIS
// machine, but the cross-device promise can't be honored until the next
// successful sync. Callers that REQUIRE the cloud write (set/change password)
// surface the error to the user.

async function findSupabaseAuthUserId(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase()
  for (let page = 1; page <= 10; page++) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return null
      const users = data?.users ?? []
      const hit = users.find(u => (u.email ?? '').toLowerCase() === target)
      if (hit) return hit.id
      if (users.length < 200) return null
    } catch { return null }
  }
  return null
}

async function ensureSupabaseAuthUser(email: string, password: string): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  try {
    const e = email.trim().toLowerCase()
    const existingId = await findSupabaseAuthUserId(e)
    if (existingId) return { ok: true, created: false }
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: e,
      password,
      email_confirm: true,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, created: true }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message ?? String(e) }
  }
}

async function updateSupabaseAuthPassword(email: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const id = await findSupabaseAuthUserId(email)
    if (!id) {
      const r = await ensureSupabaseAuthUser(email, newPassword)
      return r.ok ? { ok: true } : { ok: false, error: r.error }
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password: newPassword })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message ?? String(e) }
  }
}

async function verifySupabaseAuthPassword(email: string, password: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    return !error
  } catch { return false }
}

// One-time migration: provision a Supabase Auth user for every local team
// member that doesn't already have one, using their deterministic access code
// as the initial password. Idempotent — users that already exist in cloud are
// left untouched. Runs on the admin's machine on startup (the admin's local
// DB is the canonical team roster).
async function provisionAllLocalUsersInSupabase(): Promise<{ created: number; existing: number; failed: number; total: number }> {
  let created = 0, existing = 0, failed = 0
  try {
    const db = getDatabase()
    const rows = db.prepare("SELECT email FROM local_users WHERE status != 'inactive'").all() as { email: string }[]
    for (const r of rows) {
      const code = inviteCodeForEmail(r.email)
      const res = await ensureSupabaseAuthUser(r.email, code)
      if (!res.ok) {
        failed++
        console.warn('[Auth migration] provisioning failed for', r.email, ':', res.error)
      } else if (res.created) created++
      else existing++
    }
    console.log(`[Auth migration] ${created} created, ${existing} already in cloud, ${failed} failed (of ${rows.length}).`)
    setSetting('cs_auth_provisioned_v1', 'done')
    return { created, existing, failed, total: rows.length }
  } catch (e) {
    console.warn('[Auth migration] crashed:', (e as Error)?.message)
    return { created, existing, failed, total: 0 }
  }
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
  ipcMain.handle('auth:localSignIn', async (_e, email: string, password: string) => {
    const trimmed = email.trim().toLowerCase()
    if (trimmed !== 'doriankantor@gmail.com' && !trimmed.endsWith('@kantor-consulting.com')) {
      return { error: 'Access restricted to Kantor Consulting team members only.' }
    }
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM local_users WHERE LOWER(email)=?').get(trimmed) as Record<string, unknown> | undefined

    // ── (A) Local row exists ──────────────────────────────────────────────
    if (row) {
      if (row.status === 'inactive') return { error: 'Your account has been deactivated. Contact your administrator.' }

      const localOk = hashPassword(password, row.password_salt as string) === (row.password_hash as string)
      if (localOk) {
        db.prepare("UPDATE local_users SET last_active=CURRENT_TIMESTAMP, status='active' WHERE id=?").run(row.id)
        // Lazy sync: ensure cloud user exists; if it does but with a DIFFERENT
        // password (e.g. the access code from the startup migration), push
        // this just-verified password up so it works on every other device too.
        ;(async () => {
          try {
            const ensure = await ensureSupabaseAuthUser(trimmed, password)
            if (ensure.ok && !ensure.created) {
              const cloudOk = await verifySupabaseAuthPassword(trimmed, password)
              if (!cloudOk) {
                const upd = await updateSupabaseAuthPassword(trimmed, password)
                if (!upd.ok) console.warn('[Auth] cloud password sync failed:', upd.error)
                else console.log('[Auth] pushed local password to cloud for', trimmed)
              }
            }
          } catch (err) { console.warn('[Auth] cloud sync threw:', (err as Error)?.message) }
        })()
        return {
          ok: true,
          user: { id: row.id, email: row.email, name: row.full_name ?? row.email, role: row.role },
          mustChangePassword: !!(row.must_change_password as number),
          anthropicKeySet:    !!(row.anthropic_key_set as number),
        }
      }

      // Local hash didn't match — try the cloud password (cross-device returning user
      // whose laptop password was rotated, or who set a new password on another machine).
      if (await verifySupabaseAuthPassword(trimmed, password)) {
        const ns = randomBytes(16).toString('hex')
        const nh = hashPassword(password, ns)
        db.prepare("UPDATE local_users SET password_hash=?, password_salt=?, must_change_password=0, status='active', last_active=CURRENT_TIMESTAMP WHERE id=?")
          .run(nh, ns, row.id)
        return {
          ok: true,
          user: { id: row.id, email: row.email, name: row.full_name ?? row.email, role: row.role },
          mustChangePassword: false,
          anthropicKeySet:    !!(row.anthropic_key_set as number),
        }
      }
      return { error: 'Invalid email or password.' }
    }

    // ── (B) Legacy local-admin fallback (doriankantor@gmail.com break-glass) ─
    const sE = getSetting('local_admin_email')
    const sS = getSetting('local_admin_salt')
    const sH = getSetting('local_admin_hash')
    const sN = getSetting('local_admin_name') ?? 'Dorian Kantor'
    if (sE && sS && sH && trimmed === sE.toLowerCase()) {
      if (hashPassword(password, sS) !== sH) {
        // Even the admin gets the cross-device path if cloud verifies.
        if (await verifySupabaseAuthPassword(trimmed, password)) {
          return { ok: true, user: { id: 'local-admin', email: sE, name: sN, role: 'admin' }, mustChangePassword: false, anthropicKeySet: false }
        }
        return { error: 'Invalid email or password.' }
      }
      ensureSupabaseAuthUser(trimmed, password).catch(err =>
        console.warn('[Auth] ensureSupabaseAuthUser (admin) failed:', (err as Error)?.message))
      return { ok: true, user: { id: 'local-admin', email: sE, name: sN, role: 'admin' }, mustChangePassword: false, anthropicKeySet: false }
    }

    // ── (C) No local row — cross-device returning user via Supabase Auth ──
    // This is the path that was broken before: the user set a password on
    // Computer A; Computer B never knew about it. Now Supabase Auth is the
    // shared store, so we verify against it and provision a local mirror.
    // If the password used IS the deterministic access code, treat this as
    // first-login on this device (force "Set your password") so the user
    // doesn't keep using a stable derived code as a real password.
    if (await verifySupabaseAuthPassword(trimmed, password)) {
      const isAccessCode = canonCode(password) === canonCode(inviteCodeForEmail(trimmed))
      const id   = uuid()
      const salt = randomBytes(16).toString('hex')
      const hash = hashPassword(password, salt)
      const name = trimmed.split('@')[0]
      db.prepare(`INSERT OR IGNORE INTO local_users
          (id,email,full_name,role,status,password_hash,password_salt,must_change_password,invited_by)
          VALUES (?,?,?,?,'active',?,?,?,'supabase-auth')`)
        .run(id, trimmed, name, 'member', hash, salt, isAccessCode ? 1 : 0)
      const created = db.prepare('SELECT * FROM local_users WHERE LOWER(email)=?').get(trimmed) as Record<string, unknown>
      db.prepare("UPDATE local_users SET last_active=CURRENT_TIMESTAMP, status='active' WHERE id=?").run(created.id)
      return {
        ok: true,
        user: { id: created.id, email: created.email, name: created.full_name ?? created.email, role: created.role },
        mustChangePassword: isAccessCode,
        anthropicKeySet:    !!(created.anthropic_key_set as number),
      }
    }

    // ── (D) First-login via deterministic access code ─────────────────────
    if (canonCode(password) === canonCode(inviteCodeForEmail(trimmed))) {
      const id   = uuid()
      const salt = randomBytes(16).toString('hex')
      const hash = hashPassword(canonCode(password), salt)
      const name = trimmed.split('@')[0]
      db.prepare(`INSERT OR IGNORE INTO local_users
          (id,email,full_name,role,status,password_hash,password_salt,must_change_password,invited_by)
          VALUES (?,?,?,?,'active',?,?,1,'access-code')`)
        .run(id, trimmed, name, 'member', hash, salt)
      const created = db.prepare('SELECT * FROM local_users WHERE LOWER(email)=?').get(trimmed) as Record<string, unknown>
      db.prepare("UPDATE local_users SET last_active=CURRENT_TIMESTAMP, status='active' WHERE id=?").run(created.id)
      // Provision the Supabase Auth account with the access code as the initial
      // password — the user replaces it via setInitialPassword in the next step.
      ensureSupabaseAuthUser(trimmed, canonCode(password)).catch(err =>
        console.warn('[Auth] ensureSupabaseAuthUser (access-code) failed:', (err as Error)?.message))
      return {
        ok: true,
        user: { id: created.id, email: created.email, name: created.full_name ?? created.email, role: created.role },
        mustChangePassword: true,
        anthropicKeySet: false,
      }
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

  // Admin-triggered manual re-run of the team migration. Idempotent.
  ipcMain.handle('auth:syncAllToSupabase', async () => {
    const r = await provisionAllLocalUsersInSupabase()
    return { ok: true, ...r }
  })

  // One-time startup migration. Provisions a Supabase Auth user for every
  // local team member (using their deterministic access code as the initial
  // password) so they can sign in from any device. Guarded by a settings
  // flag so it runs exactly once per install. Deferred so it never blocks
  // app startup; if Supabase is unreachable, runs again on next launch.
  try {
    if (getSetting('cs_auth_provisioned_v1') !== 'done') {
      setTimeout(() => { void provisionAllLocalUsersInSupabase() }, 8000)
    }
  } catch (e) {
    console.warn('[Auth migration] guard check failed:', (e as Error)?.message)
  }
}

// ── Team ───────────────────────────────────────────────────────────────────

function registerTeamHandlers() {
  // The system admin account (doriankantor@gmail.com) is the logged-in owner and
  // must never surface as a *team member*. By default team:list hides it; the
  // Settings admin panel passes includeAdmin=true to manage it directly.
  const ADMIN_EMAIL = 'doriankantor@gmail.com'
  ipcMain.handle('team:list', (_e, includeAdmin?: boolean) =>
    getDatabase()
      .prepare(`SELECT id,email,full_name,role,status,must_change_password,anthropic_key_set,created_at,last_active
                FROM local_users
                WHERE status != 'inactive'
                ${includeAdmin ? '' : 'AND LOWER(email) != ?'}
                ORDER BY created_at`)
      .all(...(includeAdmin ? [] : [ADMIN_EMAIL]))
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

    // ── Create local SQLite record ────────────────────────────────────────
    try {
      const id           = uuid()
      const salt         = randomBytes(16).toString('hex')
      // Deterministic, offline-verifiable code — same value the employee's
      // machine will independently compute and accept on first login.
      const tempPassword = inviteCodeForEmail(email)
      const hash         = hashPassword(tempPassword, salt)

      db.prepare(`INSERT INTO local_users
          (id,email,full_name,role,status,password_hash,password_salt,must_change_password,invited_by)
          VALUES (?,?,?,?,'invited',?,?,1,'local-admin')`)
        .run(id, email, params.full_name ?? '', params.role ?? 'member', hash, salt)

      console.log('[Invite] Local record created, id:', id, 'tempPassword:', tempPassword)

      // ── Provision the Supabase Auth account NOW so the invited user can
      // sign in from any device using their access code; they will replace
      // it with a real password on first login (team:setInitialPassword).
      // Fire-and-forget: if Supabase is unreachable the access-code path on
      // the user's machine will still provision the cloud account lazily.
      ensureSupabaseAuthUser(email, tempPassword)
        .then(r => { if (!r.ok) console.warn('[Invite] Supabase Auth provisioning failed:', r.error); else if (r.created) console.log('[Invite] Supabase Auth user created for', email) })
        .catch(err => console.warn('[Invite] Supabase Auth provisioning threw:', (err as Error)?.message))

      // ── Send invite email with temp password ──────────────────────────────
      try {
        const emailResult = await sendEmail(
          email,
          "You've been invited to Kantor Consulting Hub",
          inviteEmailHtml({
            name: params.full_name ?? email,
            email,
            tempPassword,
            appVersion: app.getVersion(),
          })
        )
        if (!emailResult.ok) {
          console.warn('[Invite] Email send failed:', emailResult.error)
        } else {
          console.log('[Invite] Invite email sent to', email)
        }
      } catch (emailErr) {
        console.warn('[Invite] Email exception:', emailErr)
        // Don't fail the invite if email sending fails — record is already created
      }

      return { ok: true, id, tempPassword }

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

  // Re-derive a member's access code so the admin can copy & re-share it any time.
  ipcMain.handle('team:getLoginCode', (_e, email: string) => {
    return { code: inviteCodeForEmail((email ?? '').trim().toLowerCase()) }
  })

  // First-login password set: no current-password challenge (the user just
  // authenticated with their access code), only allowed while the account is
  // still flagged must_change_password. Writes to Supabase Auth (cloud
  // source-of-truth) FIRST so the password is portable across devices; the
  // local SQLite row is updated only after the cloud write succeeds.
  ipcMain.handle('team:setInitialPassword', async (_e, userId: string, newPw: string) => {
    if (!newPw || newPw.length < 8) return { error: 'Password must be at least 8 characters.' }
    const db  = getDatabase()
    const row = db.prepare('SELECT email, must_change_password FROM local_users WHERE id=?').get(userId) as { email: string; must_change_password: number } | undefined
    if (!row) return { error: 'User not found.' }
    const cloud = await updateSupabaseAuthPassword(row.email, newPw)
    if (!cloud.ok) return { error: `Could not save your password. Check your internet connection and try again. (${cloud.error ?? 'unknown error'})` }
    const ns = randomBytes(16).toString('hex')
    const nh = hashPassword(newPw, ns)
    db.prepare("UPDATE local_users SET password_hash=?,password_salt=?,must_change_password=0,status='active' WHERE id=?").run(nh, ns, userId)
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

  // Admin can manually confirm an invited member who has already set up their
  // account on their own machine (local-first: status doesn't sync across installs).
  ipcMain.handle('team:markActive', (_e, id: string) => {
    getDatabase().prepare("UPDATE local_users SET status='active', must_change_password=0 WHERE id=?").run(id)
    return { ok: true }
  })

  ipcMain.handle('team:heartbeat',       (_e, id: string) => { getDatabase().prepare('UPDATE local_users SET last_active=CURRENT_TIMESTAMP WHERE id=?').run(id); return true })
  ipcMain.handle('team:markApiKeySet',   (_e, id: string) => { getDatabase().prepare('UPDATE local_users SET anthropic_key_set=1 WHERE id=?').run(id); return true })
  ipcMain.handle('team:savePreferences', (_e, id: string, prefs: Record<string, unknown>) => {
    getDatabase().prepare('UPDATE local_users SET preferences_json=? WHERE id=?').run(JSON.stringify(prefs), id); return true
  })

  ipcMain.handle('team:changePassword', async (_e, userId: string, currentPw: string, newPw: string) => {
    if (!newPw || newPw.length < 8) return { error: 'New password must be at least 8 characters.' }
    const db  = getDatabase()
    const row = db.prepare('SELECT email,password_hash,password_salt FROM local_users WHERE id=?').get(userId) as { email: string; password_hash: string; password_salt: string } | undefined
    if (!row) return { error: 'User not found.' }
    // Verify current password against either local hash or cloud (whichever wins).
    const localOk  = hashPassword(currentPw, row.password_salt) === row.password_hash
    const cloudOk  = localOk ? true : await verifySupabaseAuthPassword(row.email, currentPw)
    if (!localOk && !cloudOk) return { error: 'Current password is incorrect.' }
    // Push the new password to Supabase Auth FIRST.
    const cloud = await updateSupabaseAuthPassword(row.email, newPw)
    if (!cloud.ok) return { error: `Could not save your password. Check your internet connection and try again. (${cloud.error ?? 'unknown error'})` }
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
  ipcMain.handle('workspace:getColumns', (_e, boardId?: string) => {
    if (boardId) {
      return db().prepare('SELECT * FROM workspace_columns WHERE board_id=? ORDER BY position ASC').all(boardId)
    }
    return db().prepare('SELECT * FROM workspace_columns ORDER BY position ASC').all()
  })

  ipcMain.handle('workspace:addColumn', (_e, col: { id: string; name: string; position: number; color: string; board_id?: string }) => {
    db().prepare('INSERT INTO workspace_columns (id,name,position,color,board_id) VALUES (?,?,?,?,?)').run(col.id, col.name, col.position, col.color, col.board_id ?? 'board-main')
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
      client: 'client', client_id: 'client_id', client_org: 'client_org', area_of_analysis: 'area_of_analysis',
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
  ipcMain.handle('templates:list', (_e, boardId?: string) => {
    if (boardId) {
      return db().prepare('SELECT * FROM task_templates WHERE board_id=? OR board_id IS NULL ORDER BY is_builtin DESC, name ASC').all(boardId)
    }
    return db().prepare('SELECT * FROM task_templates ORDER BY is_builtin DESC, name ASC').all()
  })
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

    // ── Completions data ──────────────────────────────────────────────────────
    const completedTasks = db.prepare(`
      SELECT wt.*, lu.full_name as assignee_name
      FROM workspace_tasks wt
      LEFT JOIN local_users lu ON lu.id = (
        SELECT json_each.value FROM json_each(wt.assignees_json) LIMIT 1
      )
      WHERE wt.column_id = 'col-published' AND wt.archived = 0
      ORDER BY wt.updated_at DESC
    `).all() as any[]

    const todayStr = new Date().toISOString().slice(0, 10)
    const todayCompletions = completedTasks.filter(t =>
      (t.completed_at || t.updated_at || '').slice(0, 10) === todayStr
    )

    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const lastWeekStart = new Date(weekStart)
    lastWeekStart.setDate(weekStart.getDate() - 7)
    const thisWeekCompletions = completedTasks.filter(t => new Date(t.completed_at || t.updated_at || 0) >= weekStart)
    const lastWeekCompletions = completedTasks.filter(t => {
      const d = new Date(t.completed_at || t.updated_at || 0)
      return d >= lastWeekStart && d < weekStart
    })

    // Exclude the system admin account from the team breakdown.
    const allMembers = db.prepare("SELECT id, full_name, email FROM local_users WHERE status=? AND LOWER(email) != 'doriankantor@gmail.com'").all('active') as any[]
    const memberStats = allMembers.map(m => {
      const assigned = db.prepare(`SELECT COUNT(*) as c FROM workspace_tasks WHERE archived=0 AND assignees_json LIKE ?`).get(`%"${m.id}"%`) as {c:number}
      const completed = db.prepare(`SELECT COUNT(*) as c FROM workspace_tasks WHERE column_id='col-published' AND archived=0 AND assignees_json LIKE ?`).get(`%"${m.id}"%`) as {c:number}
      const overdue = db.prepare(`SELECT COUNT(*) as c FROM workspace_tasks WHERE archived=0 AND column_id!='col-published' AND due_date < ? AND assignees_json LIKE ?`).get(todayStr, `%"${m.id}"%`) as {c:number}
      return {
        id: m.id,
        name: m.full_name || m.email,
        assigned: assigned.c,
        completed: completed.c,
        overdue: overdue.c,
        pct: assigned.c > 0 ? Math.round((completed.c / assigned.c) * 100) : 0,
      }
    })

    const contentTypes = ['policy-brief','research-report','op-ed','briefing-note','consulting-engagement','client-advisory']
    const avgTimeByType = contentTypes.map(ct => {
      const rows = db.prepare(`
        SELECT
          CAST((julianday(COALESCE(completed_at, updated_at)) - julianday(created_at)) AS INTEGER) as days
        FROM workspace_tasks
        WHERE content_type=? AND column_id='col-published' AND archived=0
      `).all(ct) as {days:number}[]
      const validRows = rows.filter(r => r.days !== null && r.days >= 0)
      const avg = validRows.length > 0 ? Math.round(validRows.reduce((s,r) => s+r.days, 0) / validRows.length) : null
      return { contentType: ct, avgDays: avg, count: validRows.length }
    })

    const timeline: {date:string; count:number}[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const ds = d.toISOString().slice(0,10)
      const count = completedTasks.filter(t => (t.completed_at || t.updated_at || '').slice(0,10) === ds).length
      timeline.push({ date: ds, count })
    }

    return {
      tasks,
      activity,
      comments,
      stageActivity,
      completions: {
        total: completedTasks.length,
        today: todayCompletions.length,
        thisWeek: thisWeekCompletions.length,
        lastWeek: lastWeekCompletions.length,
        memberStats,
        avgTimeByType,
        timeline,
        todayList: todayCompletions.slice(0,10).map(t => ({ id: t.id, title: t.title, content_type: t.content_type })),
      }
    }
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
  ipcMain.handle('userGoogle:diagnose',   (_e, userId: string) => diagnoseUserGoogle(userId))
  ipcMain.handle('userGoogle:getCalendars', async (_e, userId: string) => {
    return getUserCalendars(userId)
  })
  ipcMain.handle('userGoogle:getCalendarEvents', async (_e, userId: string, calendarId: string, startDate: string, endDate: string, calendarColor?: string) => {
    return getUserCalendarEvents(userId, calendarId, startDate, endDate, calendarColor)
  })
}

function registerDriveConnectHandler() {
  ipcMain.handle('drive:connect', () => driveSync.connect())
}

// ── To-Do ──────────────────────────────────────────────────────────────────

function registerTodoHandlers() {
  // Get all tasks assigned to a user (across all boards they're a member of)
  ipcMain.handle('todo:getMyTasks', (_e, userId: string) => {
    const rows = getDatabase().prepare(`
      SELECT wt.*, wb.name as board_name
      FROM workspace_tasks wt
      LEFT JOIN workspace_boards wb ON wb.id = wt.board_id
      WHERE wt.archived = 0
        AND (
          wt.assignees_json LIKE ? OR wt.assignees_json LIKE ? OR wt.assignees_json LIKE ?
        )
      ORDER BY wt.due_date ASC, wt.created_at DESC
    `).all(`%"${userId}"%`, `%${userId}%`, `["${userId}"]`) as any[]

    return rows.map(r => ({
      ...r,
      assignee_ids: (() => { try { return JSON.parse(r.assignees_json || '[]') } catch { return [] } })(),
    }))
  })

  // Complete a task: move to last column, set completed_at, notify admin
  ipcMain.handle('todo:complete', (_e, taskId: string, userId: string, userName: string) => {
    const db = getDatabase()
    const task = db.prepare('SELECT * FROM workspace_tasks WHERE id=?').get(taskId) as any
    if (!task) return { ok: false }

    const completedAt = new Date().toISOString()

    // Find the last column (published/done)
    const lastCol = db.prepare(
      'SELECT id FROM workspace_columns ORDER BY position DESC LIMIT 1'
    ).get() as { id: string } | undefined
    const targetCol = lastCol?.id ?? 'col-published'

    db.prepare('UPDATE workspace_tasks SET column_id=?, completed_at=?, updated_at=? WHERE id=?')
      .run(targetCol, completedAt, completedAt, taskId)

    // Add activity log entry
    db.prepare('INSERT INTO task_activity (id,task_id,actor_name,action,created_at) VALUES (?,?,?,?,?)')
      .run(crypto.randomUUID(), taskId, userName, `marked this task as complete`, completedAt)

    // Notify admin (local-admin)
    try {
      db.prepare(`INSERT INTO notifications (id,user_id,type,title,body,task_id,task_title,actor_name)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(crypto.randomUUID(), 'local-admin', 'stage_change',
          `${userName} completed: ${task.title}`,
          null, taskId, task.title, userName)
    } catch {}

    return { ok: true }
  })

  // Dismiss/clear a completed task from the To-Do view
  ipcMain.handle('todo:dismiss', (_e, userId: string, taskId: string) => {
    getDatabase().prepare('INSERT OR IGNORE INTO todo_dismissed (user_id,task_id) VALUES (?,?)')
      .run(userId, taskId)
    return { ok: true }
  })

  // Get list of dismissed task IDs for a user
  ipcMain.handle('todo:getDismissed', (_e, userId: string) => {
    const rows = getDatabase().prepare('SELECT task_id FROM todo_dismissed WHERE user_id=?').all(userId) as {task_id:string}[]
    return rows.map(r => r.task_id)
  })

  // Undo completion: restore to previous column (scoping)
  ipcMain.handle('todo:uncomplete', (_e, taskId: string) => {
    getDatabase().prepare('UPDATE workspace_tasks SET column_id=?, completed_at=NULL, updated_at=? WHERE id=?')
      .run('col-scoping', new Date().toISOString(), taskId)
    return { ok: true }
  })
}

// ── Board Members ──────────────────────────────────────────────────────────

function registerBoardMembersHandlers() {
  const db = () => getDatabase()

  ipcMain.handle('boardMembers:list', (_e, boardId: string) => {
    return db().prepare(`
      SELECT bm.user_id, lu.full_name, lu.email, lu.role, bm.added_at
      FROM board_members bm
      JOIN local_users lu ON lu.id = bm.user_id
      WHERE bm.board_id = ?
      ORDER BY bm.added_at ASC
    `).all(boardId) as { user_id: string; full_name: string; email: string; role: string; added_at: string }[]
  })

  ipcMain.handle('boardMembers:add', async (_e, boardId: string, userId: string, addedByName: string) => {
    try {
      db().prepare(`INSERT OR IGNORE INTO board_members (board_id, user_id, added_by) VALUES (?, ?, ?)`)
        .run(boardId, userId, addedByName)

      // Get board name and user info for notification/email
      const board = db().prepare('SELECT name FROM workspace_boards WHERE id=?').get(boardId) as { name: string } | undefined
      const boardName = board?.name ?? boardId
      const userRow = db().prepare('SELECT email, full_name FROM local_users WHERE id=?').get(userId) as { email: string; full_name: string | null } | undefined

      // Create in-app notification
      createNotification({
        user_id: userId,
        type: 'board_added',
        title: `You've been added to ${boardName}`,
        body: `You now have access to ${boardName} on Kantor Consulting Hub`,
        actor_name: addedByName,
      })

      // Send email notification
      if (userRow?.email) {
        try {
          const gmailPass = getSetting('gmail_app_password')
          if (gmailPass) {
            const nodemailer = await import('nodemailer')
            const transporter = nodemailer.default.createTransport({
              service: 'gmail',
              auth: { user: 'kantorconsulting.hub@gmail.com', pass: gmailPass },
            })
            await transporter.sendMail({
              from: '"Kantor Consulting Hub" <kantorconsulting.hub@gmail.com>',
              to: userRow.email,
              subject: `You now have access to ${boardName}`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
                  <h2 style="color:#1a2233">You've been added to ${boardName}</h2>
                  <p style="color:#555">Hi ${userRow.full_name ?? userRow.email},</p>
                  <p style="color:#555">
                    ${addedByName} has added you to the <strong>${boardName}</strong> board on Kantor Consulting Hub.
                    You now have access to view and manage deliverables on this board.
                  </p>
                  <p style="color:#888;font-size:12px;margin-top:24px">Kantor Consulting Hub</p>
                </div>
              `,
            })
          }
        } catch (emailErr) {
          console.warn('[boardMembers:add] email send failed:', emailErr)
        }
      }

      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('boardMembers:remove', (_e, boardId: string, userId: string) => {
    db().prepare('DELETE FROM board_members WHERE board_id=? AND user_id=?').run(boardId, userId)
    return { ok: true }
  })

  ipcMain.handle('boardMembers:check', (_e, boardId: string, userId: string) => {
    // Admin always has access
    const user = db().prepare('SELECT role FROM local_users WHERE id=?').get(userId) as { role: string } | undefined
    if (user?.role === 'admin' || userId === 'local-admin') return { hasAccess: true }
    const row = db().prepare('SELECT 1 FROM board_members WHERE board_id=? AND user_id=?').get(boardId, userId)
    return { hasAccess: !!row }
  })

  ipcMain.handle('boardMembers:taskCount', (_e, boardId: string, userId: string) => {
    const rows = db().prepare(
      `SELECT assignees_json FROM workspace_tasks WHERE board_id=? AND (archived IS NULL OR archived=0)`
    ).all(boardId) as { assignees_json: string }[]
    let count = 0
    for (const r of rows) {
      try {
        const ids: string[] = JSON.parse(r.assignees_json || '[]')
        if (ids.includes(userId)) count++
      } catch {}
    }
    return count
  })

  ipcMain.handle('boardMembers:listForUser', (_e, userId: string) => {
    // Admin gets all board IDs
    const user = db().prepare('SELECT role FROM local_users WHERE id=?').get(userId) as { role: string } | undefined
    if (user?.role === 'admin' || userId === 'local-admin') {
      const allBoards = db().prepare('SELECT id FROM workspace_boards WHERE archived=0').all() as { id: string }[]
      return allBoards.map(b => b.id)
    }
    const rows = db().prepare(
      `SELECT bm.board_id FROM board_members bm
       JOIN workspace_boards wb ON wb.id = bm.board_id
       WHERE bm.user_id=? AND wb.archived=0`
    ).all(userId) as { board_id: string }[]
    return rows.map(r => r.board_id)
  })
}

// ── Personal To-Do ─────────────────────────────────────────────────────────

function registerPersonalTodoHandlers() {
  const db = () => getDatabase()

  ipcMain.handle('personalTodo:list', (_e, userId: string) => {
    return db().prepare('SELECT * FROM personal_todos WHERE user_id=? ORDER BY due_date ASC, due_time ASC, created_at DESC').all(userId)
  })

  ipcMain.handle('personalTodo:create', (_e, item: { id: string; user_id: string; title: string; due_date?: string; due_time?: string }) => {
    db().prepare('INSERT INTO personal_todos (id, user_id, title, due_date, due_time) VALUES (?,?,?,?,?)')
      .run(item.id, item.user_id, item.title, item.due_date ?? null, item.due_time ?? null)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:complete', (_e, id: string) => {
    db().prepare('UPDATE personal_todos SET completed=1, completed_at=? WHERE id=?').run(new Date().toISOString(), id)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:uncomplete', (_e, id: string) => {
    db().prepare('UPDATE personal_todos SET completed=0, completed_at=NULL WHERE id=?').run(id)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:delete', (_e, id: string) => {
    db().prepare('DELETE FROM personal_todos WHERE id=?').run(id)
    return { ok: true }
  })
}

// ── Notification Prefs + Scheduler ─────────────────────────────────────────

// Track sent reminders to avoid duplicates (in-memory, resets on restart)
const sentReminders = new Set<string>()

function registerNotificationSchedulerHandlers() {
  ipcMain.handle('notificationPrefs:get', (_e, userId: string) => {
    const row = getDatabase().prepare('SELECT * FROM notification_prefs WHERE user_id=?').get(userId) as any
    if (!row) return { first_reminder_min: 60, second_reminder_min: 30, apply_calendar: 1, apply_tasks: 1, apply_personal: 1, email_prefs_json: '{}' }
    return row
  })

  ipcMain.handle('notificationPrefs:save', (_e, userId: string, prefs: Record<string,unknown>) => {
    const db = getDatabase()
    const existing = db.prepare('SELECT user_id FROM notification_prefs WHERE user_id=?').get(userId)
    if (existing) {
      db.prepare('UPDATE notification_prefs SET first_reminder_min=?, second_reminder_min=?, apply_calendar=?, apply_tasks=?, apply_personal=?, email_prefs_json=? WHERE user_id=?')
        .run(prefs.first_reminder_min ?? 60, prefs.second_reminder_min ?? 30, prefs.apply_calendar ?? 1, prefs.apply_tasks ?? 1, prefs.apply_personal ?? 1, typeof prefs.email_prefs_json === 'string' ? prefs.email_prefs_json : JSON.stringify(prefs.email_prefs_json ?? {}), userId)
    } else {
      db.prepare('INSERT INTO notification_prefs (user_id, first_reminder_min, second_reminder_min, apply_calendar, apply_tasks, apply_personal, email_prefs_json) VALUES (?,?,?,?,?,?,?)')
        .run(userId, prefs.first_reminder_min ?? 60, prefs.second_reminder_min ?? 30, prefs.apply_calendar ?? 1, prefs.apply_tasks ?? 1, prefs.apply_personal ?? 1, typeof prefs.email_prefs_json === 'string' ? prefs.email_prefs_json : JSON.stringify(prefs.email_prefs_json ?? {}))
    }
    return { ok: true }
  })
}

function fireSystemNotification(title: string, body: string) {
  try {
    const { Notification } = require('electron')
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show()
    }
  } catch {}
}

async function sendReminderEmail(toEmail: string, subject: string, dateStr: string) {
  try {
    const gmailPass = getSetting('gmail_app_password')
    if (!gmailPass || !toEmail) return
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport({ service: 'gmail', auth: { user: 'kantorconsulting.hub@gmail.com', pass: gmailPass } })
    await transporter.sendMail({
      from: '"Kantor Consulting Hub" <kantorconsulting.hub@gmail.com>',
      to: toEmail,
      subject,
      html: `<div style="font-family:sans-serif;padding:24px"><h2>${subject}</h2><p>Date: ${dateStr}</p><p style="color:#888;font-size:12px">Kantor Consulting Hub</p></div>`,
    })
  } catch {}
}

async function checkAndSendReminders() {
  const db = getDatabase()
  const now = new Date()
  const users = db.prepare('SELECT id, email FROM local_users WHERE status=?').all('active') as { id:string; email:string }[]

  for (const user of users) {
    const prefs = db.prepare('SELECT * FROM notification_prefs WHERE user_id=?').get(user.id) as any ?? { first_reminder_min: 60, second_reminder_min: 30, apply_calendar: 1, apply_tasks: 1, apply_personal: 1, email_prefs_json: '{}' }
    const emailPrefs: Record<string,boolean> = (() => { try { return JSON.parse(prefs.email_prefs_json ?? '{}') } catch { return {} } })()
    const reminderMins = [prefs.first_reminder_min, prefs.second_reminder_min].filter((m: number) => m > 0)

    for (const mins of reminderMins) {
      const windowStart = new Date(now.getTime() + (mins - 1) * 60_000)
      const windowEnd   = new Date(now.getTime() + (mins + 1) * 60_000)
      const ws = windowStart.toISOString().slice(0, 16)
      const we = windowEnd.toISOString().slice(0, 16)

      // Calendar events
      if (prefs.apply_calendar) {
        const events = db.prepare(`
          SELECT id, title, start_date, meeting_link FROM calendar_events
          WHERE start_date >= ? AND start_date <= ? AND all_day = 0
        `).all(ws, we) as { id:string; title:string; start_date:string; meeting_link:string|null }[]

        for (const ev of events) {
          const key = `cal-${ev.id}-${mins}-${now.toISOString().slice(0,13)}`
          if (sentReminders.has(key)) continue
          sentReminders.add(key)

          const body = `${mins >= 60 ? `${mins/60}h` : `${mins}min`} from now`

          const attendeesRaw = db.prepare('SELECT attendees_json FROM calendar_events WHERE id=?').get(ev.id) as { attendees_json:string } | undefined
          const attendeeIds: string[] = (() => { try { return (JSON.parse(attendeesRaw?.attendees_json ?? '[]') as {id:string}[]).map((a: {id:string}) => a.id) } catch { return [] } })()
          const notifyUsers = attendeeIds.length > 0 ? attendeeIds : [user.id]

          for (const uid of notifyUsers) {
            createNotification({ user_id: uid, type: 'deadline', title: `Reminder: ${ev.title} in ${body}`, body: `Calendar event at ${ev.start_date.slice(11,16)}` })
          }

          fireSystemNotification(`Reminder: ${ev.title}`, `Starting in ${body}`)

          if (emailPrefs['email_calendar_reminder'] !== false) {
            sendReminderEmail(user.email, `Reminder: ${ev.title} in ${body}`, ev.start_date)
          }
        }
      }

      // Task deadlines
      if (prefs.apply_tasks) {
        const dueTasks = db.prepare(`
          SELECT wt.id, wt.title, wt.due_date, wt.assignees_json FROM workspace_tasks wt
          WHERE wt.due_date >= ? AND wt.due_date <= ? AND wt.completed_at IS NULL AND wt.archived=0
        `).all(ws.slice(0,10), we.slice(0,10)) as { id:string; title:string; due_date:string; assignees_json:string }[]

        for (const t of dueTasks) {
          const key = `task-${t.id}-${mins}-${now.toISOString().slice(0,10)}`
          if (sentReminders.has(key)) continue
          sentReminders.add(key)

          const body = `Due ${mins >= 60 ? `${mins/60}h` : `${mins}min`} from now`
          const assigneeIds: string[] = (() => { try { return JSON.parse(t.assignees_json ?? '[]') } catch { return [] } })()
          const notifyUsers = assigneeIds.length > 0 ? assigneeIds : ['local-admin']

          for (const uid of notifyUsers) {
            createNotification({ user_id: uid, type: 'deadline', title: `Reminder: ${t.title}`, body })
          }
          fireSystemNotification(`Task Deadline: ${t.title}`, body)

          if (emailPrefs['email_task_deadline'] !== false) {
            sendReminderEmail(user.email, `Task deadline reminder: ${t.title}`, t.due_date)
          }
        }
      }

      // Personal todos
      if (prefs.apply_personal) {
        const personalItems = db.prepare(`
          SELECT id, title, due_date, due_time FROM personal_todos
          WHERE user_id=? AND completed=0 AND due_date IS NOT NULL
          AND (due_date || 'T' || COALESCE(due_time,'09:00')) >= ?
          AND (due_date || 'T' || COALESCE(due_time,'09:00')) <= ?
        `).all(user.id, ws, we) as { id:string; title:string; due_date:string; due_time:string|null }[]

        for (const item of personalItems) {
          const key = `personal-${item.id}-${mins}-${now.toISOString().slice(0,13)}`
          if (sentReminders.has(key)) continue
          sentReminders.add(key)

          const body = `${mins >= 60 ? `${mins/60}h` : `${mins}min`} from now`
          createNotification({ user_id: user.id, type: 'deadline', title: `Reminder: ${item.title}`, body })
          fireSystemNotification(`Personal To-Do: ${item.title}`, `Due in ${body}`)
        }
      }
    }
  }
}

function startNotificationScheduler() {
  setInterval(async () => {
    try { await checkAndSendReminders() } catch (e) { console.warn('[scheduler]', e) }
  }, 60_000)
  setTimeout(() => checkAndSendReminders().catch(() => {}), 30_000)
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
  registerBoardMembersHandlers()
  registerTodoHandlers()
  registerPersonalTodoHandlers()
  registerNotificationSchedulerHandlers()
  startNotificationScheduler()
  startTrashAutoDelete()
  registerIntelligenceHandlers()
  registerInfoPageHandlers()
}

// ── Intelligence auto-refresh (called from main/index.ts after app ready) ──
export function startIntelligenceAutoRefresh() {
  const INTERVAL = 6 * 60 * 60 * 1000 // 6 hours
  setInterval(() => fetchAndStoreNews(), INTERVAL)
}

export async function triggerInitialNewsFetch() {
  try { await fetchAndStoreNews() } catch (e) { console.warn('[Intelligence] Initial fetch failed:', e) }
}

// ── Confidence auto-detection ────────────────────────────────────────────
const HIGH_CONFIDENCE_SOURCES = [
  'reuters', 'apnews', 'ap news', 'bbc', 'nytimes', 'new york times',
  'ft.com', 'financial times', "jane's", 'janes', 'insightcrime',
  'insight crime', 'infodefensa', 'washingtonpost', 'washington post',
  'theguardian', 'guardian', 'bloomberg', 'wsj', 'wall street journal',
  'foreignpolicy', 'foreign policy', 'defenseone', 'defense one',
  'breakingdefense', 'breaking defense'
]
const MEDIUM_CONFIDENCE_SOURCES = [
  'semana', 'el tiempo', 'zona militar', 'la nacion', 'infobae',
  'mercopress', 'elpais', 'el pais', 'elespectador', 'el espectador',
  'larepublica', 'la republica', 'dinero', 'portafolio', 'caracoltv',
  'rcnradio', 'rcn', 'civiles en red', 'defensa.com', 'infodefensa',
  'americaeconomia', 'america economia', 'telam', 'agencia efe', 'efe',
  'dw.com', 'dw', 'france24', 'france 24', 'al jazeera', 'aljazeera',
  'rferl', 'radio free europe', 'kyivindependent', 'kyiv independent',
  'themoscowtimes', 'moscow times', 'thedrive', 'the drive',
  'warisboring', 'war is boring', 'bellingcat', 'bulgarianmilitary',
  'bulgarian military', 'militarytimes', 'military times',
  'defensenews', 'defense news', 'aviationweek', 'flightglobal'
]

function autoDetectConfidence(sourceName: string): 'high' | 'medium' | 'low' {
  if (!sourceName) return 'low'
  const lower = sourceName.toLowerCase()
  if (HIGH_CONFIDENCE_SOURCES.some(s => lower.includes(s))) return 'high'
  if (MEDIUM_CONFIDENCE_SOURCES.some(s => lower.includes(s))) return 'medium'
  return 'low'
}

// ── Auto-detected categories ─────────────────────────────────────────────
const CATEGORY_RULES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['strike', 'attack', 'casualt', 'kill', 'wound', 'injur', 'explosion', 'bomb', 'shot down', 'intercept', 'destroy', 'hit', 'target'], category: 'Incident' },
  { keywords: ['procure', 'purchase', 'buy', 'acquire', 'contract', 'deal', 'sale', 'order', 'invest', 'budget', 'fund', 'billion', 'million', 'tender'], category: 'Investment & Procurement' },
  { keywords: ['technolog', 'innovat', 'develop', 'prototype', 'test', 'capabilit', 'sensor', 'ai ', 'autonomo', 'swarm', 'stealth', 'payload', 'range', 'endurance'], category: 'Innovation & Technology' },
  { keywords: ['regulat', 'policy', 'law', 'legislat', 'ban', 'restrict', 'export control', 'sanction', 'treaty', 'agreement', 'framework', 'standard'], category: 'Policy & Regulation' },
  { keywords: ['cartel', 'criminal', 'narco', 'traffick', 'gang', 'vnsa', 'non-state', 'terror', 'insurgent', 'rebel', 'militia', 'drug', 'smuggl'], category: 'Criminal & VNSA Activity' },
  { keywords: ['counter-drone', 'counter drone', 'c-uas', 'anti-drone', 'anti drone', 'intercept', 'jam', 'defeat', 'detect', 'defend'], category: 'Counter-drone / C-UAS' },
  { keywords: ['military', 'armed force', 'army', 'navy', 'air force', 'deploy', 'operati', 'exercise', 'training', 'unit', 'battalion', 'brigade'], category: 'State Military Activity' },
  { keywords: ['sanction', 'financ', 'payment', 'transfer', 'fund', 'launder', 'revenue', 'profit', 'illicit', 'dark web', 'crypto', 'bank'], category: 'Finance & Sanctions' },
  { keywords: ['china', 'chinese', 'iran', 'iranian', 'russia', 'russian', 'turkey', 'turkish', 'export', 'supplier', 'transfer', 'proliferat', 'third-party', 'third party'], category: 'Extra-regional Supplier' },
]

function autoDetectCategories(text: string): string[] {
  const lower = (text || '').toLowerCase()
  const cats: string[] = []
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      if (!cats.includes(rule.category)) cats.push(rule.category)
    }
  }
  return cats.slice(0, 3) // max 3 categories
}

// ── NewsAPI fetch ────────────────────────────────────────────────────────
const NEWS_QUERIES = [
  'drone proliferation OR "drone strikes" OR "drone purchases" OR "counter drone" OR "weaponized drones" OR "DJI drones" OR "drone warfare" OR "loitering munitions" OR "FPV drones" OR "drone swarms"',
  '"autonomous weapons" OR UAV OR "MALE drones" OR "drone jamming" OR "anti-drone systems" OR "drone export" OR "drone regulation" OR "kamikaze drones"',
  '"drones Latin America" OR "drones Colombia" OR "drones Venezuela" OR "drones Mexico" OR "drones Brazil" OR "cartel drones" OR "narco drones"',
  '"drones Ukraine" OR "drones Middle East" OR "drones Iran" OR "drones NATO" OR "Iranian drones"',
  '"DJI export" OR "Turkish Bayraktar" OR "Chinese drone exports" OR "drone proliferation" OR "non-state actors drones"',
]

// ── In-app relevance gate (Phase 2) ───────────────────────────────────────
// Editorial gate for the Colombia-focused LATAM drone monitor. Proposes, per
// article, a Colombia-relevance score (0-10), a relevance_type, and a best-guess
// geography. This is the LOCAL counterpart to the scripts/ + Supabase cs_articles
// gate (which it does NOT touch or duplicate): it scores rows in the local
// intelligence_sources table that the review card reads. Cost-controlled and
// FAIL-OPEN: any error leaves the row unscored (gate_processed stays 0) so it
// is retried next pass, and it NEVER throws into the fetch path.
const GATE_MODEL = 'claude-haiku-4-5'
const GATE_MAX_PER_RUN = 25 // cost cap: classify at most N unscored rows per pass
const GATE_TYPES = ['in-region', 'supply-side', 'precedent', 'escalation-signal', 'none'] as const
type GateRelevanceType = typeof GATE_TYPES[number]
interface GateResult {
  relevance_score: number
  relevance_type: GateRelevanceType
  geography: string | null
  region: string | null
  reasoning: string | null
}

// The global Anthropic key (same source the document-analysis path uses).
function getGlobalAnthropicKey(): string | null {
  try {
    const row = getDatabase().prepare("SELECT value FROM settings WHERE key='anthropic_api_key'").get() as { value: string } | undefined
    return row?.value || process.env.ANTHROPIC_API_KEY || null
  } catch { return process.env.ANTHROPIC_API_KEY || null }
}

const GATE_SYSTEM_PROMPT = `You classify drone/UAS news for a Colombia-focused security consultancy. An article matters if it is (a) in-region LATAM, (b) supply-side (a supplier/transfer/training that could reach LATAM), (c) a precedent (a policy/legal/operational development elsewhere that is a model or warning for Colombia, e.g. foreign policing powers vs. Colombian counterparts), or (d) an escalation-signal (a drone-conflict dynamic that could foreshadow LATAM escalation). Score 0-10 for Colombia relevance. Work in Spanish or English. Return ONLY JSON.`

// Classify a single article. Returns null on ANY failure (fail-open).
async function gateClassifyArticle(
  article: { title?: string | null; snippet?: string | null; source?: string | null },
  apiKey: string
): Promise<GateResult | null> {
  try {
    const AnthropicLib = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk')
    const client = new AnthropicLib({ apiKey })
    const msg = await client.messages.create({
      model: GATE_MODEL,
      max_tokens: 300,
      system: GATE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Classify this article. Return ONLY JSON with exactly these keys:
{
  "relevance_score": <integer 0-10 for Colombia relevance>,
  "relevance_type": "in-region | supply-side | precedent | escalation-signal | none",
  "geography": "<primary country or region of the article, your best guess>",
  "reasoning": "<one short sentence>"
}

Title: ${article.title || ''}
Snippet: ${article.snippet || ''}
Source: ${article.source || 'Unknown'}`,
      }],
    })
    const text = msg.content?.[0]?.type === 'text' ? msg.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    let score = Number(parsed.relevance_score)
    if (!Number.isFinite(score)) score = 0
    score = Math.max(0, Math.min(10, Math.round(score)))
    let rtype = String(parsed.relevance_type ?? 'none').toLowerCase().trim()
    if (!(GATE_TYPES as readonly string[]).includes(rtype)) rtype = 'none'
    const geography = parsed.geography ? String(parsed.geography).slice(0, 120) : null
    const reasoning = parsed.reasoning ? String(parsed.reasoning).slice(0, 500) : null
    return { relevance_score: score, relevance_type: rtype as GateRelevanceType, geography, region: geography, reasoning }
  } catch (e) {
    console.warn('[Gate] classify failed (fail-open):', (e as Error)?.message)
    return null
  }
}

// Score a capped batch of articles that haven't been through the gate yet.
// Writes proposals with geography_confirmed left at 0 (AI proposal). A geography
// the human already confirmed (geography_confirmed=1) is never overwritten.
// FAIL-OPEN per row; never throws.
async function classifyUnscoredArticles(limit = GATE_MAX_PER_RUN): Promise<number> {
  const apiKey = getGlobalAnthropicKey()
  if (!apiKey) {
    console.log('[Gate] No Anthropic API key set — skipping relevance gate (fail-open).')
    return 0
  }
  const db = getDatabase()
  let rows: Array<{ id: string; title: string | null; snippet: string | null; content: string | null; source_name: string | null }> = []
  try {
    rows = db.prepare(`
      SELECT id, title, snippet, content, source_name
      FROM intelligence_sources
      WHERE type='article'
        AND (gate_processed IS NULL OR gate_processed=0)
        AND COALESCE(added_by_name,'') != 'Kantor Framework'
      ORDER BY added_at DESC
      LIMIT ?
    `).all(limit) as typeof rows
  } catch (e) {
    console.warn('[Gate] could not load unscored rows:', (e as Error)?.message)
    return 0
  }
  let scored = 0
  for (const row of rows) {
    const result = await gateClassifyArticle(
      { title: row.title, snippet: row.snippet || row.content?.slice(0, 300) || '', source: row.source_name },
      apiKey
    )
    if (!result) continue // FAIL-OPEN: leave unscored, retried next pass
    try {
      db.prepare(`
        UPDATE intelligence_sources
        SET relevance_score=?, relevance_type=?, gate_reasoning=?, gate_processed=1,
            geography = CASE WHEN COALESCE(geography_confirmed,0)=1 THEN geography ELSE ? END,
            region    = CASE WHEN COALESCE(geography_confirmed,0)=1 THEN region    ELSE ? END
        WHERE id=?
      `).run(result.relevance_score, result.relevance_type, result.reasoning, result.geography, result.region, row.id)
      scored++
    } catch (e) {
      console.warn('[Gate] could not persist score for', row.id, (e as Error)?.message)
    }
  }
  if (scored) console.log(`[Gate] Scored ${scored} article(s) for Colombia relevance.`)
  return scored
}

async function fetchAndStoreNews(): Promise<number> {
  const apiKey = process.env.NEWSAPI_KEY
  const db = getDatabase()
  let stored = 0
  if (!apiKey) console.log('[Intelligence] NEWSAPI_KEY not set, skipping news fetch')
  if (apiKey) for (const q of NEWS_QUERIES) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${apiKey}`
      const res = await fetch(url)
      if (!res.ok) {
        console.warn('[Intelligence] NewsAPI error:', res.status, await res.text())
        continue
      }
      const data = await res.json() as { articles?: Array<{ url: string; title: string; description: string; content: string; source: { name: string }; publishedAt: string; urlToImage: string }> }
      for (const article of data.articles ?? []) {
        if (!article.url || !article.title) continue
        const confidence = autoDetectConfidence(article.source?.name ?? '')
        const snippet = article.description || article.content?.slice(0, 300) || ''
        const categories = autoDetectCategories((article.title || '') + ' ' + snippet)
        try {
          const { randomUUID } = await import('crypto')
          db.prepare(`
            INSERT OR IGNORE INTO intelligence_sources
              (id, type, title, snippet, url, source_name, published_at, confidence, categories_json, image_url)
            VALUES (?, 'article', ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            randomUUID(),
            article.title,
            snippet,
            article.url,
            article.source?.name || '',
            article.publishedAt,
            confidence,
            JSON.stringify(categories),
            article.urlToImage || null
          )
          stored++
        } catch { /* duplicate URL — skip */ }
      }
    } catch (e) {
      console.warn('[Intelligence] NewsAPI query error:', e)
    }
  }
  if (apiKey) console.log(`[Intelligence] Fetched and stored ${stored} new articles`)
  // Relevance gate (Phase 2): score any articles not yet through the gate.
  // Cost-capped + FAIL-OPEN — never throws, so it can't break the fetch.
  try { await classifyUnscoredArticles() } catch (e) { console.warn('[Gate] pass failed:', (e as Error)?.message) }
  return stored
}

// ── Source Intelligence → Info Pages pipeline helpers ─────────────────────
// Parse an info-page board_config into a normalized keyword list.
function keywordsForInfoPage(boardConfig: string | null | undefined): string[] {
  if (!boardConfig) return []
  let cfg: Record<string, unknown>
  try { cfg = JSON.parse(boardConfig) } catch { return [] }
  const raw = (cfg.keywords as string | undefined) || ''
  return raw
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean)
}

// Does an intelligence source match any of an info page's keywords?
// Returns false when there are no keywords — pages without keywords don't auto-collect.
function sourceMatchesKeywords(src: Record<string, unknown>, keywords: string[]): boolean {
  if (!keywords.length) return false
  const haystack = [
    src.title, src.snippet, src.content, src.source_name,
    src.location_mentioned, src.actors_mentioned, src.handle, src.file_name,
  ].filter(Boolean).join(' ').toLowerCase()
  if (!haystack) return false
  return keywords.some(k => haystack.includes(k))
}

// Insert a 'ready_for_analysis' source item into an info page's Sources tab.
function insertSourceItemForPage(pageId: string, src: Record<string, any>): string {
  const id = uuid()
  let categories: string[] = []
  try { categories = JSON.parse(src.categories_json || '[]') } catch { /* ignore */ }
  const content = {
    source_id: src.id,
    url: src.url || null,
    snippet: src.snippet || (src.content ? String(src.content).slice(0, 300) : ''),
    type: src.type,
    source_name: src.source_name || src.platform || src.file_name || null,
    platform: src.platform || null,
    handle: src.handle || null,
    categories,
    published_at: src.published_at || null,
  }
  getDatabase().prepare(`
    INSERT INTO info_page_items
      (id,page_id,tab,sub_type,title,content_json,status,confidence,source_ref,origin_source_id,created_by_name)
    VALUES (?,?,'sources','intelligence_source',?,?,'ready_for_analysis',?,?,?,?)
  `).run(
    id, pageId,
    src.title || src.handle || src.file_name || 'Intelligence source',
    JSON.stringify(content),
    src.confidence || null,
    src.url || null,
    src.id,
    'Source Intelligence',
  )
  return id
}

// Resolve the Anthropic API key to use: prefer the current user's key, then the
// global admin key in settings, then fall back to the admin account's stored key.
function resolveAnthropicKey(userId?: string): string | undefined {
  const db = getDatabase()
  const keyForUser = (id?: string): string | undefined => {
    if (!id) return undefined
    const row = db.prepare('SELECT preferences_json FROM local_users WHERE id=?').get(id) as { preferences_json: string } | undefined
    try { return row?.preferences_json ? JSON.parse(row.preferences_json).anthropicApiKey : undefined } catch { return undefined }
  }
  const userKey = keyForUser(userId)
  if (userKey) return userKey
  const globalKey = (db.prepare("SELECT value FROM settings WHERE key='anthropic_api_key'").get() as { value: string } | undefined)?.value
  if (globalKey) return globalKey
  const admin = db.prepare("SELECT id FROM local_users WHERE LOWER(email)='doriankantor@gmail.com'").get() as { id: string } | undefined
  return keyForUser(admin?.id)
}

// Build the system prompt for the Claude Analysis chat: page topic/keywords, all
// Sources-tab sources, all Manual Info, and a text extract of the live page state.
async function buildAnalysisSystemPrompt(pageId: string, pageName: string): Promise<string> {
  const db = getDatabase()
  const pageRow = db.prepare('SELECT board_config FROM workspace_boards WHERE id=?').get(pageId) as { board_config: string | null } | undefined
  let config: Record<string, any> = {}
  try { config = pageRow?.board_config ? JSON.parse(pageRow.board_config) : {} } catch { config = {} }
  const keywords = config.keywords || ''

  const sourceItems = db.prepare("SELECT title, content_json, confidence FROM info_page_items WHERE page_id=? AND tab='sources' AND sub_type='intelligence_source' ORDER BY created_at DESC LIMIT 40").all(pageId) as any[]
  const sourcesText = sourceItems.map((s, i) => {
    let c: any = {}; try { c = JSON.parse(s.content_json || '{}') } catch { /* ignore */ }
    return `[Source ${i + 1}] ${s.title || ''} (${c.source_name || c.platform || 'unknown'}, confidence: ${s.confidence || '?'})\n${c.snippet || ''}`
  }).join('\n\n')

  // Prefer manual items explicitly committed to analysis; fall back to all of them.
  let manualItems = db.prepare("SELECT sub_type, title, content_json FROM info_page_items WHERE page_id=? AND tab='manual' AND status='in_analysis' ORDER BY created_at DESC LIMIT 25").all(pageId) as any[]
  if (!manualItems.length) manualItems = db.prepare("SELECT sub_type, title, content_json FROM info_page_items WHERE page_id=? AND tab='manual' ORDER BY created_at DESC LIMIT 25").all(pageId) as any[]
  const manualText = manualItems.map((m, i) => {
    let c: any = {}; try { c = JSON.parse(m.content_json || '{}') } catch { /* ignore */ }
    const body = c.text || c.content || (Array.isArray(c.key_quotes) ? c.key_quotes.join(', ') : '') || ''
    return `[Manual ${i + 1}] ${(m.sub_type || 'info').toUpperCase()}: ${m.title || ''}\n${body}`
  }).join('\n\n')

  let liveState = ''
  const liveUrl = config.live_url ? (String(config.live_url).startsWith('http') ? config.live_url : `https://${config.live_url}`) : ''
  if (liveUrl) {
    try {
      const res = await fetch(liveUrl, { signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(15000) : undefined })
      if (res.ok) {
        let html = await res.text()
        html = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        liveState = html.slice(0, 6000)
      }
    } catch { /* ignore live fetch errors */ }
  }

  return `You are helping update the "${pageName}" intelligence page${liveUrl ? ` (live at ${liveUrl})` : ''}.

Your job is to help the analyst decide what to add, change, or remove on this page based on newly gathered intelligence. Be specific and concrete. When you recommend changes, name the exact section to edit and what the new content should say, and cite which source each recommendation comes from.

PAGE TOPIC / KEYWORDS:
${keywords || '(none specified)'}

SOURCES READY FOR THIS PAGE:
${sourcesText || '(none)'}

MANUAL INFORMATION GATHERED:
${manualText || '(none)'}

CURRENT LIVE PAGE STATE (text extract):
${liveState || '(could not fetch live page)'}

Help the analyst think through the update. Ask clarifying questions when useful, and propose concrete, sourced changes.`
}

// When a source is approved, fan it out into every matching info page's Sources tab.
// Only routes to pages that have "pipeline": true in their board_config — this ensures
// all pulled drone articles go exclusively to LATAM Drone Threat and never to
// unrelated pages (e.g. Trump Immigration) even if keywords overlap.
// Dedupes by (page_id, origin_source_id) and skips pages where it's already published.
// Returns the names of the pages it was added to.
function addApprovedSourceToInfoPages(sourceId: string): string[] {
  const db = getDatabase()
  const src = db.prepare('SELECT * FROM intelligence_sources WHERE id=?').get(sourceId) as Record<string, any> | undefined
  if (!src) return []
  const pages = db.prepare("SELECT id,name,board_config FROM workspace_boards WHERE board_type='info-page' AND archived=0").all() as Array<{ id: string; name: string; board_config: string | null }>
  const added: string[] = []
  for (const page of pages) {
    // Only route to pages explicitly opted into the automated pipeline.
    let cfg: Record<string, unknown> = {}
    try { cfg = page.board_config ? JSON.parse(page.board_config) : {} } catch { cfg = {} }
    if (cfg.pipeline !== true) continue
    const keywords = keywordsForInfoPage(page.board_config)
    if (!sourceMatchesKeywords(src, keywords)) continue
    // Skip if already used (published) in this page.
    if (src.used_in_page && src.used_in_page === page.name) continue
    // Dedupe: don't add the same source to the same page twice.
    const exists = db.prepare("SELECT 1 FROM info_page_items WHERE page_id=? AND origin_source_id=?").get(page.id, sourceId)
    if (exists) continue
    insertSourceItemForPage(page.id, src)
    added.push(page.name)
  }
  return added
}

// ── Intelligence IPC handlers ────────────────────────────────────────────
function registerIntelligenceHandlers(): void {
  const db = () => getDatabase()

  // One-time learning backfill: mirror EXISTING local approve/reject verdicts up
  // to Supabase cs_articles so the gate has training signal immediately. Guarded
  // by a settings flag (runs once), deferred so it never blocks app startup.
  try {
    if (getSetting('cs_decisions_backfilled_v1') !== 'done') {
      setTimeout(() => { void backfillDecisionsToSupabase() }, 8000)
    }
  } catch (e) {
    console.warn('[Learning] backfill guard check failed:', (e as Error)?.message)
  }

  ipcMain.handle('intelligence:getSources', (_e, params: {
    type?: string; status?: string; confidence?: string;
    category?: string; search?: string; limit?: number; offset?: number
  } = {}) => {
    let sql = 'SELECT * FROM intelligence_sources WHERE 1=1'
    const args: unknown[] = []
    if (params.type)       { sql += ' AND type=?';              args.push(params.type) }
    if (params.status)     { sql += ' AND status=?';            args.push(params.status) }
    if (params.confidence) { sql += ' AND confidence=?';        args.push(params.confidence) }
    if (params.category)   { sql += " AND categories_json LIKE ?"; args.push(`%${params.category}%`) }
    if (params.search)     {
      sql += ' AND (title LIKE ? OR snippet LIKE ? OR source_name LIKE ? OR content LIKE ?)'
      const s = `%${params.search}%`
      args.push(s, s, s, s)
    }
    sql += ' ORDER BY added_at DESC, published_at DESC'
    sql += ` LIMIT ${params.limit ?? 100} OFFSET ${params.offset ?? 0}`
    return db().prepare(sql).all(...args)
  })

  ipcMain.handle('intelligence:getUnreviewedCount', () => {
    const row = db().prepare("SELECT COUNT(*) as c FROM intelligence_sources WHERE status='unreviewed'").get() as { c: number }
    return row.c
  })

  ipcMain.handle('intelligence:updateStatus', (_e, id: string, status: string, notes?: string, reviewedById?: string, reviewedByName?: string) => {
    const now2 = new Date().toISOString()
    // The article URL is the join key for mirroring this verdict to cs_articles.
    const meta = db().prepare('SELECT url FROM intelligence_sources WHERE id=?').get(id) as { url?: string } | undefined
    if (status === 'approved') {
      const row = db().prepare('SELECT categories_json FROM intelligence_sources WHERE id=?').get(id) as { categories_json: string } | undefined
      const cats: string[] = JSON.parse(row?.categories_json || '[]')
      let section = 'source-archive'
      if (cats.includes('Incident')) section = 'incident-feed'
      else if (cats.includes('Investment & Procurement')) section = 'investment-procurement'
      else if (cats.includes('Finance & Sanctions')) section = 'finance-nexus'
      else if (cats.includes('Innovation & Technology') || cats.includes('State Military Activity')) section = 'platforms'
      db().prepare(`
        UPDATE intelligence_sources SET status=?, review_notes=?, reviewed_by_id=?, reviewed_by_name=?, reviewed_at=?, queue_section=? WHERE id=?
      `).run(status, notes ?? null, reviewedById ?? null, reviewedByName ?? null, now2, section, id)
      // Pipeline: fan this approved source out into matching Info Pages' Sources tabs.
      let addedToPages: string[] = []
      try { addedToPages = addApprovedSourceToInfoPages(id) } catch (e) { console.warn('[Pipeline] fan-out failed', e) }
      // Learning loop: mirror the verdict up to Supabase (fire-and-forget).
      void pushVerdictToSupabase(meta?.url, status, reviewedByName)
      return { ok: true, addedToPages }
    } else {
      db().prepare(`
        UPDATE intelligence_sources SET status=?, review_notes=?, reviewed_by_id=?, reviewed_by_name=?, reviewed_at=? WHERE id=?
      `).run(status, notes ?? null, reviewedById ?? null, reviewedByName ?? null, now2, id)
    }
    // Learning loop: mirror approve/reject up to Supabase (fire-and-forget).
    void pushVerdictToSupabase(meta?.url, status, reviewedByName)
    return { ok: true }
  })

  // Pipeline counters for the Intelligence left/header panel.
  ipcMain.handle('intelligence:getPipelineStats', () => {
    const pending = (db().prepare("SELECT COUNT(*) as c FROM intelligence_sources WHERE status='unreviewed'").get() as { c: number }).c
    const sentToPages = (db().prepare("SELECT COUNT(DISTINCT origin_source_id) as c FROM info_page_items WHERE sub_type='intelligence_source' AND origin_source_id IS NOT NULL").get() as { c: number }).c
    return { pending, sentToPages }
  })

  ipcMain.handle('intelligence:updateConfidence', (_e, id: string, confidence: string) => {
    db().prepare('UPDATE intelligence_sources SET confidence=?, confidence_override=1 WHERE id=?').run(confidence, id)
    return { ok: true }
  })

  // Phase 3: confirm or correct the AI-proposed geography. Either action marks
  // the geography human-confirmed (geography_confirmed=1) so the gate won't
  // overwrite it on future passes.
  ipcMain.handle('intelligence:updateGeography', (_e, id: string, geography: string) => {
    const geo = (geography ?? '').trim()
    db().prepare('UPDATE intelligence_sources SET geography=?, geography_confirmed=1 WHERE id=?')
      .run(geo || null, id)
    return { ok: true }
  })

  // ── Phase 4: disposition + thematic tag registry & per-article tagging ───────
  // Normalize a free-text tag: trim, lowercase, collapse whitespace → hyphens.
  function normalizeTag(name: string): string {
    return (name ?? '').trim().toLowerCase().replace(/\s+/g, '-')
  }

  // Return all registered tags of a type ('disposition' | 'thematic'), A→Z.
  ipcMain.handle('intelligence:getKnownTags', (_e, type: string) => {
    const t = type === 'disposition' ? 'disposition' : 'thematic'
    const rows = db().prepare(
      'SELECT name FROM known_tags WHERE type=? ORDER BY name COLLATE NOCASE ASC'
    ).all(t) as { name: string }[]
    return rows.map(r => r.name)
  })

  // Create (or upsert) a tag in the registry; returns the normalized name.
  ipcMain.handle('intelligence:createTag', (_e, name: string, type: string) => {
    const t = type === 'disposition' ? 'disposition' : 'thematic'
    const norm = normalizeTag(name)
    if (!norm) return { ok: false, name: '' }
    db().prepare(
      'INSERT OR IGNORE INTO known_tags (name, type, created_at) VALUES (?, ?, ?)'
    ).run(norm, t, new Date().toISOString())
    return { ok: true, name: norm }
  })

  // Replace an article's tag set for one type. Tags are normalized + de-duped,
  // and the row is updated immediately (no Approve needed).
  ipcMain.handle('intelligence:setArticleTags', (_e, id: string, type: string, tags: string[]) => {
    const col = type === 'disposition' ? 'disposition_tags' : 'thematic_tags'
    const clean = Array.from(new Set((tags || []).map(normalizeTag).filter(Boolean)))
    db().prepare(`UPDATE intelligence_sources SET ${col}=? WHERE id=?`)
      .run(JSON.stringify(clean), id)
    return { ok: true, tags: clean }
  })

  // ── Phase 5: capture-only decision log ──────────────────────────────────────
  // Records one row per Approve/Reject/Save(correct) with the AI proposal and the
  // human-final snapshot. Wrapped so a logging failure never blocks the action.
  ipcMain.handle('intelligence:logDecision', (_e, payload: {
    articleId: string; action: string; aiProposed?: unknown; humanFinal?: unknown; reason?: string | null
  }) => {
    try {
      db().prepare(
        'INSERT INTO intelligence_decisions (article_id, action, ai_proposed, human_final, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        payload.articleId,
        payload.action,
        payload.aiProposed != null ? JSON.stringify(payload.aiProposed) : null,
        payload.humanFinal != null ? JSON.stringify(payload.humanFinal) : null,
        payload.reason ?? null,
        new Date().toISOString()
      )
      return { ok: true }
    } catch (e) {
      console.warn('[intelligence] logDecision failed:', e)
      return { ok: false }
    }
  })

  ipcMain.handle('intelligence:updateQueueSection', (_e, id: string, section: string) => {
    db().prepare('UPDATE intelligence_sources SET queue_section=? WHERE id=?').run(section, id)
    return { ok: true }
  })

  ipcMain.handle('intelligence:removeFromQueue', (_e, id: string) => {
    db().prepare("UPDATE intelligence_sources SET status='saved', queue_section=NULL, queued_at=NULL WHERE id=?").run(id)
    return { ok: true }
  })

  ipcMain.handle('intelligence:deleteSource', (_e, id: string) => {
    db().prepare('DELETE FROM intelligence_sources WHERE id=?').run(id)
    return { ok: true }
  })

  ipcMain.handle('intelligence:addSocial', (_e, post: {
    platform: string; handle: string; post_date: string; content: string;
    location_mentioned?: string; actors_mentioned?: string; url?: string;
    categories_json?: string; confidence?: string;
    added_by_id?: string; added_by_name?: string;
  }) => {
    const { randomUUID } = require('crypto')
    const id = randomUUID()
    const categories = JSON.parse(post.categories_json || '[]')
    const cats = categories.length ? categories : autoDetectCategories(post.content)
    db().prepare(`
      INSERT INTO intelligence_sources
        (id, type, platform, handle, published_at, content, url, location_mentioned, actors_mentioned,
         categories_json, confidence, added_by_id, added_by_name)
      VALUES (?, 'social', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, post.platform, post.handle, post.post_date, post.content,
           post.url || null, post.location_mentioned || null, post.actors_mentioned || null,
           JSON.stringify(cats), post.confidence || 'low',
           post.added_by_id || null, post.added_by_name || null)
    return { ok: true, id }
  })

  ipcMain.handle('intelligence:fetchNews', async () => {
    try {
      const count = await fetchAndStoreNews()
      return { ok: true, count }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('intelligence:uploadDocument', async (_e, params: {
    userId?: string; addedByName?: string
  }) => {
    const { dialog: dlg } = await import('electron')
    const result = await dlg.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'txt'] },
      ],
    })
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true }

    const results: Array<{ id: string; file_name: string }> = []
    for (const filePath of result.filePaths) {
      try {
        const { readFileSync } = require('fs')
        const { basename: bname } = require('path')
        const { randomUUID } = require('crypto')
        const fileName = bname(filePath)
        const ext = fileName.split('.').pop()?.toLowerCase() || ''
        let textContent = ''

        if (ext === 'txt') {
          textContent = readFileSync(filePath, 'utf-8').slice(0, 50000)
        } else if (ext === 'pdf') {
          try {
            const pdfParse = require('pdf-parse')
            const buffer = readFileSync(filePath)
            const pdfData = await pdfParse(buffer)
            textContent = pdfData.text?.slice(0, 50000) || ''
          } catch { textContent = '[PDF text extraction unavailable]' }
        } else if (ext === 'docx') {
          try {
            const mammoth = require('mammoth')
            const mammothResult = await mammoth.extractRawText({ path: filePath })
            textContent = mammothResult.value?.slice(0, 50000) || ''
          } catch { textContent = '[DOCX text extraction unavailable]' }
        }

        // Run Claude analysis if we have text
        let analysisJson: string | null = null
        if (textContent && textContent.length > 50) {
          try {
            const userRow = params.userId
              ? db().prepare("SELECT preferences_json FROM local_users WHERE id=?").get(params.userId) as { preferences_json: string } | undefined
              : undefined
            const prefs = userRow?.preferences_json ? JSON.parse(userRow.preferences_json) : {}
            const globalKey = db().prepare("SELECT value FROM settings WHERE key='anthropic_api_key'").get() as { value: string } | undefined
            const apiKey = prefs.anthropicApiKey || globalKey?.value
            if (apiKey) {
              const AnthropicLib = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk')
              const client = new AnthropicLib({ apiKey })
              const msg = await client.messages.create({
                model: 'claude-opus-4-5',
                max_tokens: 1024,
                messages: [{
                  role: 'user',
                  content: `Analyze this document and extract structured intelligence. Return ONLY valid JSON with these exact keys:
{
  "key_findings": ["finding 1", "finding 2", ...],
  "named_actors": ["actor 1", ...],
  "locations": ["location 1", ...],
  "dates_events": ["date/event 1", ...],
  "platforms_systems": ["platform 1", ...],
  "suggested_categories": ["category from: Incident, Investment & Procurement, Innovation & Technology, Policy & Regulation, Criminal & VNSA Activity, Counter-drone / C-UAS, State Military Activity, Finance & Sanctions, Extra-regional Supplier"],
  "confidence": "high|medium|low",
  "confidence_reasoning": "brief explanation"
}

Document:
${textContent.slice(0, 8000)}`
                }]
              })
              const responseText = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
              const jsonMatch = responseText.match(/\{[\s\S]*\}/)
              if (jsonMatch) analysisJson = jsonMatch[0]
            }
          } catch (e) {
            console.warn('[Intelligence] Claude analysis failed:', e)
          }
        }

        const analysis = analysisJson ? JSON.parse(analysisJson) : null
        const { randomUUID: newUUID } = require('crypto')
        const docId = newUUID()
        db().prepare(`
          INSERT INTO intelligence_sources
            (id, type, title, file_name, local_path, content, analysis_json, categories_json, confidence, added_by_id, added_by_name)
          VALUES (?, 'document', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          docId,
          fileName,
          fileName,
          filePath,
          textContent.slice(0, 10000),
          analysisJson,
          JSON.stringify(analysis?.suggested_categories || []),
          analysis?.confidence || 'low',
          params.userId || null,
          params.addedByName || null
        )
        results.push({ id: docId, file_name: fileName })
      } catch (e: any) {
        console.warn('[Intelligence] Upload error for', filePath, e)
      }
    }
    return { ok: true, results }
  })

  ipcMain.handle('intelligence:getQueue', () => {
    return db().prepare("SELECT * FROM intelligence_sources WHERE status='approved' ORDER BY added_at DESC, reviewed_at DESC").all()
  })

  ipcMain.handle('intelligence:getPushLog', () => {
    return db().prepare('SELECT * FROM intelligence_push_log ORDER BY pushed_at DESC LIMIT 50').all()
  })

  ipcMain.handle('intelligence:pushToContestedSkies', async (_e, params: { pushedById: string; pushedByName: string; }) => {
    const token = process.env.GH_TOKEN
    if (!token) return { ok: false, error: 'GH_TOKEN not configured in .env' }

    const items = db().prepare("SELECT * FROM intelligence_sources WHERE status='approved'").all() as any[]
    if (!items.length) return { ok: false, error: 'No approved items in publish queue' }

    const REPO = 'Doriankantor/contested-skies-monitor'
    const FILE = 'index.html'
    const BASE_URL = `https://api.github.com/repos/${REPO}/contents/${FILE}`
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    }

    let currentContent = '', sha = ''
    try {
      const getRes = await fetch(BASE_URL, { headers })
      if (getRes.status === 401) return { ok: false, error: 'GitHub token invalid or lacks write access to contested-skies-monitor.' }
      if (!getRes.ok) return { ok: false, error: `GitHub API error: ${getRes.status} ${await getRes.text()}` }
      const fileData = await getRes.json() as { content: string; sha: string }
      sha = fileData.sha
      currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8')
    } catch (e: any) {
      return { ok: false, error: `Failed to fetch contested-skies-monitor: ${e.message}` }
    }

    const now2 = new Date()
    const dateStr = now2.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    const sections: string[] = []
    let modified = currentContent

    const bySection: Record<string, any[]> = {}
    for (const item of items) {
      const sec = item.queue_section || 'source-archive'
      if (!bySection[sec]) bySection[sec] = []
      bySection[sec].push(item)
    }

    const CONF_COLOR: Record<string, string> = {
      high: '#22c55e', medium: '#f59e0b', low: '#ef4444'
    }
    const CONF_LABEL: Record<string, string> = {
      high: 'HIGH', medium: 'MED', low: 'LOW'
    }

    function confBadge(confidence: string): string {
      const color = CONF_COLOR[confidence] || '#6b7280'
      const label = CONF_LABEL[confidence] || confidence?.toUpperCase() || 'UNK'
      return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;color:#fff;background:${color}">${label}</span>`
    }

    if (bySection['incident-feed']?.length) {
      sections.push('Incident Feed')
      const html = bySection['incident-feed'].map((item: any) => `
        <div class="incident-entry" style="border-left:3px solid ${CONF_COLOR[item.confidence]||'#6b7280'};padding:10px 16px;margin-bottom:12px;background:rgba(255,255,255,0.03)">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            ${confBadge(item.confidence)}
            <span style="font-size:12px;color:rgba(255,255,255,0.5)">${item.published_at ? new Date(item.published_at).toLocaleDateString() : dateStr}</span>
          </div>
          <div style="font-weight:600;color:#fff;margin-bottom:4px">${item.title || 'Incident Report'}</div>
          <div style="color:rgba(255,255,255,0.7);font-size:13px;line-height:1.5">${item.snippet || item.content?.slice(0,200) || ''}</div>
          ${item.url ? `<a href="${item.url}" style="font-size:12px;color:#6366f1;text-decoration:none" target="_blank">Source: ${item.source_name || 'View source'} →</a>` : ''}
        </div>`).join('\n')

      if (modified.includes('<!-- INCIDENT_FEED_START -->')) {
        modified = modified.replace(
          /(<!-- INCIDENT_FEED_START -->)([\s\S]*?)(<!-- INCIDENT_FEED_END -->)/,
          `$1\n${html}\n$3`
        )
      } else if (modified.includes('id="incident-feed"') || modified.includes('id="section-02"')) {
        const marker = modified.includes('id="incident-feed"') ? 'id="incident-feed"' : 'id="section-02"'
        modified = modified.replace(marker, `${marker} data-intelligence-injected="true"`)
        const idx = modified.indexOf(marker) + marker.length
        const tagEnd = modified.indexOf('>', idx) + 1
        modified = modified.slice(0, tagEnd) + '\n<!-- INCIDENT_FEED_START -->\n' + html + '\n<!-- INCIDENT_FEED_END -->\n' + modified.slice(tagEnd)
      } else {
        modified = modified.replace('</body>', `<section id="incident-feed">\n<!-- INCIDENT_FEED_START -->\n${html}\n<!-- INCIDENT_FEED_END -->\n</section>\n</body>`)
      }
    }

    if (bySection['source-archive']?.length) {
      sections.push('Source Archive')
      const html = bySection['source-archive'].map((item: any) => `
        <div class="source-entry" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
            ${confBadge(item.confidence)}
            <span style="font-size:11px;color:rgba(255,255,255,0.4)">${item.source_name || item.platform || ''}</span>
            <span style="font-size:11px;color:rgba(255,255,255,0.4)">${item.published_at ? new Date(item.published_at).toLocaleDateString() : dateStr}</span>
          </div>
          ${item.url ? `<a href="${item.url}" style="color:#fff;font-weight:500;font-size:14px;text-decoration:none" target="_blank">${item.title || item.content?.slice(0,100) || 'View source'}</a>` : `<span style="color:#fff;font-weight:500;font-size:14px">${item.title || item.content?.slice(0,100) || ''}</span>`}
          <div style="color:rgba(255,255,255,0.6);font-size:13px;margin-top:4px">${item.snippet || item.content?.slice(0,150) || ''}</div>
        </div>`).join('\n')

      if (modified.includes('<!-- SOURCE_ARCHIVE_START -->')) {
        modified = modified.replace(
          /(<!-- SOURCE_ARCHIVE_START -->)([\s\S]*?)(<!-- SOURCE_ARCHIVE_END -->)/,
          `$1\n${html}\n$3`
        )
      } else {
        modified = modified.replace('</body>', `<section id="source-archive">\n<!-- SOURCE_ARCHIVE_START -->\n${html}\n<!-- SOURCE_ARCHIVE_END -->\n</section>\n</body>`)
      }
    }

    if (bySection['investment-procurement']?.length) {
      sections.push('Investment & Procurement')
      const html = bySection['investment-procurement'].map((item: any) => `
        <div class="procurement-entry" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
            ${confBadge(item.confidence)}
            <span style="font-size:11px;color:rgba(255,255,255,0.4)">${item.published_at ? new Date(item.published_at).toLocaleDateString() : dateStr}</span>
          </div>
          <div style="color:#fff;font-weight:500;font-size:14px;margin-bottom:4px">${item.title || ''}</div>
          <div style="color:rgba(255,255,255,0.7);font-size:13px">${item.snippet || item.content?.slice(0,200) || ''}</div>
          ${item.url ? `<a href="${item.url}" style="font-size:12px;color:#6366f1;text-decoration:none" target="_blank">Source →</a>` : ''}
        </div>`).join('\n')
      if (modified.includes('<!-- INVESTMENT_PROCUREMENT_START -->')) {
        modified = modified.replace(
          /(<!-- INVESTMENT_PROCUREMENT_START -->)([\s\S]*?)(<!-- INVESTMENT_PROCUREMENT_END -->)/,
          `$1\n${html}\n$3`
        )
      } else {
        modified = modified.replace('</body>', `<section id="investment-procurement">\n<!-- INVESTMENT_PROCUREMENT_START -->\n${html}\n<!-- INVESTMENT_PROCUREMENT_END -->\n</section>\n</body>`)
      }
    }

    if (bySection['finance-nexus']?.length) {
      sections.push('Finance Nexus')
      const html = bySection['finance-nexus'].map((item: any) => `
        <div class="finance-entry" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
            ${confBadge(item.confidence)}
            <span style="font-size:11px;color:rgba(255,255,255,0.4)">${item.published_at ? new Date(item.published_at).toLocaleDateString() : dateStr}</span>
          </div>
          <div style="color:#fff;font-size:14px">${item.title || item.content?.slice(0,150) || ''}</div>
          ${item.url ? `<a href="${item.url}" style="font-size:12px;color:#6366f1;text-decoration:none" target="_blank">Source →</a>` : ''}
        </div>`).join('\n')
      if (modified.includes('<!-- FINANCE_NEXUS_START -->')) {
        modified = modified.replace(
          /(<!-- FINANCE_NEXUS_START -->)([\s\S]*?)(<!-- FINANCE_NEXUS_END -->)/,
          `$1\n${html}\n$3`
        )
      } else {
        modified = modified.replace('</body>', `<section id="finance-nexus">\n<!-- FINANCE_NEXUS_START -->\n${html}\n<!-- FINANCE_NEXUS_END -->\n</section>\n</body>`)
      }
    }

    try {
      const commitMsg = `Intelligence update: ${dateStr} — ${items.length} new item${items.length !== 1 ? 's' : ''}`
      const pushRes = await fetch(BASE_URL, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: commitMsg,
          content: Buffer.from(modified, 'utf-8').toString('base64'),
          sha,
          branch: 'main',
        }),
      })
      if (!pushRes.ok) {
        const errText = await pushRes.text()
        if (pushRes.status === 401) return { ok: false, error: 'GitHub token invalid or lacks write access to contested-skies-monitor.' }
        if (pushRes.status === 409) return { ok: false, error: 'Merge conflict detected — fetch the latest version and retry.' }
        return { ok: false, error: `GitHub push failed: ${pushRes.status} — ${errText}` }
      }
    } catch (e: any) {
      return { ok: false, error: `Push failed: ${e.message}` }
    }

    const { randomUUID: pushUUID } = require('crypto')
    db().prepare(`
      INSERT INTO intelligence_push_log (id, pushed_by_id, pushed_by_name, items_count, sections_json, success)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(pushUUID(), params.pushedById, params.pushedByName, items.length, JSON.stringify(sections))

    db().prepare("UPDATE intelligence_sources SET status='pushed' WHERE status='approved'").run()

    return { ok: true, count: items.length, sections }
  })

  // ── Part 8: Import the Contested Skies Source Archive (Section 07) ─────────
  // Fetches the live page, parses its embedded sourceArchive JS data, and imports
  // each article as a pending-confirmation intelligence source.
  ipcMain.handle('intelligence:importFromContestedSkies', async (_e, params: {
    userId?: string; addedByName?: string
  }) => {
    try {
      const res = await fetch('https://contestedskies.kantor-consulting.com', {
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined,
      })
      if (!res.ok) return { ok: false, error: `Failed to fetch Contested Skies (HTTP ${res.status})` }
      const html = await res.text()

      // Extract each country block: name + its articles array contents.
      const countryRe = /(\w+):\s*\{\s*name:\s*"([^"]+)",[\s\S]*?articles:\s*\[([\s\S]*?)\]\s*\}/g
      const articleRe = /\{\s*date:\s*"([^"]*)",\s*pub:\s*"([^"]*)",\s*title:\s*"([^"]*)",\s*url:\s*"([^"]*)",\s*blurb:\s*"([^"]*)"\s*,\s*platformMentioned:\s*(true|false)\s*\}/g

      const insert = db().prepare(`
        INSERT OR IGNORE INTO intelligence_sources
          (id, type, title, content, url, source_name, published_at, status, confidence,
           categories_json, snippet, location_mentioned, added_by_id, added_by_name)
        VALUES (?, 'article', ?, ?, ?, ?, ?, 'imported', 'medium', ?, ?, ?, ?, ?)
      `)

      let imported = 0
      let total = 0
      let cm: RegExpExecArray | null
      while ((cm = countryRe.exec(html)) !== null) {
        const countryName = cm[2]
        const articlesBlock = cm[3]
        let am: RegExpExecArray | null
        articleRe.lastIndex = 0
        while ((am = articleRe.exec(articlesBlock)) !== null) {
          total++
          const [, rawDate, pub, title, url, blurb, platformMentioned] = am
          const publishedAt = rawDate.replace(/-XX/g, '-01')
          const cats = autoDetectCategories(`${title} ${blurb}`)
          if (platformMentioned === 'true' && !cats.includes('Innovation & Technology')) cats.push('Innovation & Technology')
          const r = insert.run(
            uuid(), title, blurb, url, pub, publishedAt,
            JSON.stringify(cats), blurb.slice(0, 300), countryName,
            params.userId || null, 'Imported from Contested Skies',
          )
          if (r.changes > 0) imported++
        }
      }
      return { ok: true, imported, total }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Count of sources still pending confirmation from the Contested Skies import.
  ipcMain.handle('intelligence:getImportedCount', () => {
    return (db().prepare("SELECT COUNT(*) as c FROM intelligence_sources WHERE status='imported'").get() as { c: number }).c
  })

  // Bulk-confirm all imported sources at a chosen confidence, approving them so
  // they flow into the matching Info Pages' Sources tabs.
  ipcMain.handle('intelligence:confirmImported', (_e, params: {
    confidence?: string; reviewedById?: string; reviewedByName?: string
  }) => {
    const conf = params.confidence || 'medium'
    const now2 = new Date().toISOString()
    const rows = db().prepare("SELECT id, url FROM intelligence_sources WHERE status='imported'").all() as { id: string; url?: string }[]
    const addedAll = new Set<string>()
    const upd = db().prepare(`
      UPDATE intelligence_sources
      SET confidence=?, confidence_override=1, status='approved',
          reviewed_by_id=?, reviewed_by_name=?, reviewed_at=?, queue_section='source-archive'
      WHERE id=?
    `)
    for (const r of rows) {
      upd.run(conf, params.reviewedById || null, params.reviewedByName || null, now2, r.id)
      try { addApprovedSourceToInfoPages(r.id).forEach(p => addedAll.add(p)) } catch (e) { console.warn('[Pipeline] confirmImported fan-out failed', e) }
    }
    // Learning loop: mirror this bulk approval up to Supabase (fire-and-forget).
    void pushVerdictsToSupabase(rows.map((r) => r.url), 'approved', params.reviewedByName)
    return { ok: true, count: rows.length, addedToPages: [...addedAll] }
  })
}

// ── Info Pages ────────────────────────────────────────────────────────────

export function registerInfoPageHandlers(): void {
  const db = () => getDatabase()

  ipcMain.handle('infoPages:list', () => {
    return db().prepare("SELECT * FROM workspace_boards WHERE board_type='info-page' AND archived=0 ORDER BY position ASC").all()
  })

  ipcMain.handle('infoPages:getConfig', (_e, pageId: string) => {
    const row = db().prepare('SELECT board_config FROM workspace_boards WHERE id=?').get(pageId) as { board_config: string | null } | undefined
    try { return row?.board_config ? JSON.parse(row.board_config) : {} } catch { return {} }
  })

  ipcMain.handle('infoPages:saveConfig', (_e, pageId: string, config: Record<string, unknown>) => {
    db().prepare("UPDATE workspace_boards SET board_config=?,updated_at=datetime('now') WHERE id=?").run(JSON.stringify(config), pageId)
    return { ok: true }
  })

  // Edit an existing page's name and/or link config (repo, live_url, keywords, file…) in one call.
  ipcMain.handle('infoPages:updateMeta', (_e, pageId: string, meta: { name?: string; config?: Record<string, unknown> }) => {
    if (typeof meta?.name === 'string' && meta.name.trim()) {
      db().prepare("UPDATE workspace_boards SET name=?,updated_at=datetime('now') WHERE id=?").run(meta.name.trim(), pageId)
    }
    if (meta?.config) {
      db().prepare("UPDATE workspace_boards SET board_config=?,updated_at=datetime('now') WHERE id=?").run(JSON.stringify(meta.config), pageId)
    }
    return { ok: true }
  })

  ipcMain.handle('infoPages:create', (_e, params: { name: string; config: Record<string, unknown> }) => {
    const { randomUUID } = require('crypto')
    const id = randomUUID()
    const maxPos = (db().prepare("SELECT MAX(position) as mp FROM workspace_boards WHERE board_type='info-page'").get() as { mp: number | null })?.mp ?? 49
    db().prepare("INSERT INTO workspace_boards (id,name,position,board_type,board_config) VALUES (?,?,?,'info-page',?)").run(id, params.name, maxPos + 1, JSON.stringify(params.config || {}))
    return { ok: true, id }
  })

  ipcMain.handle('infoPages:delete', (_e, pageId: string) => {
    db().prepare('DELETE FROM workspace_boards WHERE id=?').run(pageId)
    db().prepare('DELETE FROM info_page_items WHERE page_id=?').run(pageId)
    db().prepare('DELETE FROM info_page_commits WHERE page_id=?').run(pageId)
    db().prepare('DELETE FROM info_page_owners WHERE page_id=?').run(pageId)
    return { ok: true }
  })

  ipcMain.handle('infoPages:getLastCommit', async (_e, repo: string) => {
    if (!repo) return null
    const token = process.env.GH_TOKEN
    if (!token) return null
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/commits/main`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      })
      if (!res.ok) return null
      const data = await res.json() as { commit: { author: { date: string }; message: string } }
      return { date: data.commit.author.date, message: data.commit.message }
    } catch { return null }
  })

  ipcMain.handle('infoPages:getOwners', (_e, pageId: string) => {
    return db().prepare(`
      SELECT ipo.user_id, lu.full_name, lu.email, ipo.assigned_at
      FROM info_page_owners ipo
      LEFT JOIN local_users lu ON lu.id = ipo.user_id
      WHERE ipo.page_id=?
    `).all(pageId)
  })

  ipcMain.handle('infoPages:addOwner', (_e, pageId: string, userId: string, assignedBy: string) => {
    db().prepare("INSERT OR IGNORE INTO info_page_owners (page_id,user_id,assigned_by) VALUES (?,?,?)").run(pageId, userId, assignedBy)
    return { ok: true }
  })

  ipcMain.handle('infoPages:removeOwner', (_e, pageId: string, userId: string) => {
    db().prepare("DELETE FROM info_page_owners WHERE page_id=? AND user_id=?").run(pageId, userId)
    return { ok: true }
  })

  ipcMain.handle('infoPages:isOwner', (_e, pageId: string, userId: string) => {
    const row = db().prepare("SELECT 1 FROM info_page_owners WHERE page_id=? AND user_id=?").get(pageId, userId)
    return !!row
  })

  ipcMain.handle('infoPages:getItems', (_e, pageId: string, tab?: string) => {
    if (tab) return db().prepare('SELECT * FROM info_page_items WHERE page_id=? AND tab=? ORDER BY created_at DESC').all(pageId, tab)
    return db().prepare('SELECT * FROM info_page_items WHERE page_id=? ORDER BY created_at DESC').all(pageId)
  })

  ipcMain.handle('infoPages:addItem', (_e, item: {
    page_id: string; tab: string; sub_type?: string; title?: string;
    content_json?: string; priority?: string; proposed_section?: string;
    confidence?: string; source_ref?: string; analysis_json?: string;
    created_by_id?: string; created_by_name?: string
  }) => {
    const { randomUUID } = require('crypto')
    const id = randomUUID()
    db().prepare(`
      INSERT INTO info_page_items (id,page_id,tab,sub_type,title,content_json,priority,proposed_section,confidence,source_ref,analysis_json,created_by_id,created_by_name)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, item.page_id, item.tab, item.sub_type||null, item.title||null,
           item.content_json||'{}', item.priority||'medium', item.proposed_section||null,
           item.confidence||null, item.source_ref||null, item.analysis_json||null,
           item.created_by_id||null, item.created_by_name||null)
    return { ok: true, id }
  })

  ipcMain.handle('infoPages:updateItem', (_e, id: string, updates: Record<string, unknown>) => {
    const allowed = ['title','content_json','status','priority','proposed_section','confidence','source_ref','analysis_json']
    const sets: string[] = ["updated_at=datetime('now')"]
    const vals: unknown[] = []
    for (const key of allowed) {
      if (updates[key] !== undefined) { sets.push(`${key}=?`); vals.push(updates[key]) }
    }
    if (sets.length > 1) db().prepare(`UPDATE info_page_items SET ${sets.join(',')} WHERE id=?`).run(...vals, id)
    return { ok: true }
  })

  ipcMain.handle('infoPages:deleteItem', (_e, id: string) => {
    db().prepare('DELETE FROM info_page_items WHERE id=?').run(id)
    db().prepare('DELETE FROM info_page_commits WHERE item_id=?').run(id)
    return { ok: true }
  })

  ipcMain.handle('infoPages:commitItems', (_e, params: {
    pageId: string; itemIds: string[]; submittedById: string; submittedByName: string
  }) => {
    const { randomUUID } = require('crypto')
    for (const itemId of params.itemIds) {
      db().prepare("INSERT OR IGNORE INTO info_page_commits (id,page_id,item_id,submitted_by_id,submitted_by_name) VALUES (?,?,?,?,?)")
        .run(randomUUID(), params.pageId, itemId, params.submittedById, params.submittedByName)
      db().prepare("UPDATE info_page_items SET status='committed',updated_at=datetime('now') WHERE id=?").run(itemId)
    }
    return { ok: true }
  })

  ipcMain.handle('infoPages:getCommits', (_e, pageId: string, status?: string) => {
    const sql = status
      ? `SELECT ipc.*, ipi.title, ipi.tab, ipi.sub_type, ipi.confidence, ipi.proposed_section, ipi.content_json
         FROM info_page_commits ipc LEFT JOIN info_page_items ipi ON ipi.id=ipc.item_id
         WHERE ipc.page_id=? AND ipc.status=? ORDER BY ipc.submitted_at DESC`
      : `SELECT ipc.*, ipi.title, ipi.tab, ipi.sub_type, ipi.confidence, ipi.proposed_section, ipi.content_json
         FROM info_page_commits ipc LEFT JOIN info_page_items ipi ON ipi.id=ipc.item_id
         WHERE ipc.page_id=? ORDER BY ipc.submitted_at DESC`
    return status ? db().prepare(sql).all(pageId, status) : db().prepare(sql).all(pageId)
  })

  ipcMain.handle('infoPages:reviewCommit', (_e, commitId: string, action: 'approve'|'reject', params: {
    reviewedById: string; reviewedByName: string; rejectionNote?: string
  }) => {
    const now = new Date().toISOString()
    const status = action === 'approve' ? 'approved' : 'rejected'
    db().prepare("UPDATE info_page_commits SET status=?,reviewed_by_id=?,reviewed_by_name=?,reviewed_at=?,rejection_note=? WHERE id=?")
      .run(status, params.reviewedById, params.reviewedByName, now, params.rejectionNote||null, commitId)
    if (action === 'approve') {
      const commit = db().prepare('SELECT item_id FROM info_page_commits WHERE id=?').get(commitId) as { item_id: string } | undefined
      if (commit) db().prepare("UPDATE info_page_items SET status='approved',updated_at=datetime('now') WHERE id=?").run(commit.item_id)
    }
    return { ok: true }
  })

  ipcMain.handle('infoPages:adminReviewCommit', (_e, commitId: string, action: 'approve'|'reject', params: {
    reviewedById: string; reviewedByName: string; rejectionNote?: string
  }) => {
    const now = new Date().toISOString()
    const status = action === 'approve' ? 'admin_approved' : 'rejected'
    db().prepare("UPDATE info_page_commits SET status=?,admin_approved=?,admin_reviewed_by=?,admin_reviewed_at=?,rejection_note=? WHERE id=?")
      .run(status, action==='approve'?1:0, params.reviewedById, params.reviewedByName, params.rejectionNote||null, commitId)
    if (action === 'approve') {
      const commit = db().prepare('SELECT item_id FROM info_page_commits WHERE id=?').get(commitId) as { item_id: string } | undefined
      if (commit) db().prepare("UPDATE info_page_items SET status='pending_admin',updated_at=datetime('now') WHERE id=?").run(commit.item_id)
    }
    return { ok: true }
  })

  ipcMain.handle('infoPages:getPublished', (_e, pageId: string) => {
    return db().prepare('SELECT * FROM info_page_published WHERE page_id=? ORDER BY date_implemented DESC LIMIT 50').all(pageId)
  })

  ipcMain.handle('infoPages:logPublished', (_e, entry: {
    pageId: string; whatChanged: string; committedById: string; committedByName: string;
    approvedById: string; approvedByName: string; promptUsed: string; itemIds: string[]; commitCount: number
  }) => {
    const { randomUUID } = require('crypto')
    db().prepare(`INSERT INTO info_page_published (id,page_id,what_changed,committed_by_id,committed_by_name,approved_by_id,approved_by_name,prompt_used,item_ids_json,commit_count) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), entry.pageId, entry.whatChanged, entry.committedById, entry.committedByName,
           entry.approvedById, entry.approvedByName, entry.promptUsed, JSON.stringify(entry.itemIds), entry.commitCount)
    // Resolve page name for the feedback loop.
    const pageRow = db().prepare('SELECT name FROM workspace_boards WHERE id=?').get(entry.pageId) as { name: string } | undefined
    const pageName = pageRow?.name || entry.pageId
    const nowIso = new Date().toISOString()
    // Mark items as implemented
    for (const id of entry.itemIds) {
      db().prepare("UPDATE info_page_items SET status='implemented',updated_at=datetime('now') WHERE id=?").run(id)
      db().prepare("UPDATE info_page_commits SET status='implemented' WHERE item_id=?").run(id)
      // Feedback loop: if this item came from an intelligence source, flag the
      // source as published so it isn't re-suggested for this page.
      const item = db().prepare('SELECT origin_source_id FROM info_page_items WHERE id=?').get(id) as { origin_source_id: string | null } | undefined
      if (item?.origin_source_id) {
        db().prepare("UPDATE intelligence_sources SET used_in_page=?, used_in_page_at=? WHERE id=?")
          .run(pageName, nowIso, item.origin_source_id)
      }
    }
    return { ok: true }
  })

  // Publish a page's admin-approved commits to its OWN linked GitHub repo.
  // Generic version of the Contested Skies push — works for any linked Info Page.
  ipcMain.handle('infoPages:publishToRepo', async (_e, params: {
    pageId: string; pushedById: string; pushedByName: string; whatChanged?: string
  }) => {
    const token = process.env.GH_TOKEN
    if (!token) return { ok: false, error: 'GH_TOKEN not configured in .env' }

    const page = db().prepare('SELECT id,name,board_config FROM workspace_boards WHERE id=?').get(params.pageId) as { id: string; name: string; board_config: string | null } | undefined
    if (!page) return { ok: false, error: 'Page not found' }
    let config: any = {}
    try { config = page.board_config ? JSON.parse(page.board_config) : {} } catch { config = {} }
    const repo = String(config.repo || '').trim()
    if (!repo) return { ok: false, error: 'This page is not linked to a GitHub repo. Add one in Edit settings.' }
    const file = String(config.file || 'index.html').trim()
    const branch = String(config.branch || 'main').trim()

    // Gather this page's admin-approved commits.
    const commits = db().prepare(`
      SELECT ipc.id AS commit_id, ipc.item_id, ipi.title, ipi.proposed_section, ipi.confidence, ipi.analysis_json, ipi.content_json
      FROM info_page_commits ipc LEFT JOIN info_page_items ipi ON ipi.id=ipc.item_id
      WHERE ipc.page_id=? AND ipc.status='admin_approved'
    `).all(params.pageId) as any[]
    if (!commits.length) return { ok: false, error: 'No admin-approved items to publish for this page.' }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    const BASE_URL = `https://api.github.com/repos/${repo}/contents/${file}`

    let currentContent = '', sha = ''
    try {
      const getRes = await fetch(`${BASE_URL}?ref=${encodeURIComponent(branch)}`, { headers })
      if (getRes.status === 401) return { ok: false, error: `GitHub token invalid or lacks write access to ${repo}.` }
      if (getRes.status === 404) return { ok: false, error: `File "${file}" not found in ${repo} (branch ${branch}).` }
      if (!getRes.ok) return { ok: false, error: `GitHub API error: ${getRes.status} ${await getRes.text()}` }
      const fileData = await getRes.json() as { content: string; sha: string }
      sha = fileData.sha
      currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8')
    } catch (e: any) {
      return { ok: false, error: `Failed to fetch ${repo}/${file}: ${e.message}` }
    }

    // Build the update block from the approved commits.
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    const CONF_COLOR: Record<string,string> = { high:'#22c55e', medium:'#f59e0b', low:'#ef4444' }
    const CONF_LABEL: Record<string,string> = { high:'HIGH', medium:'MED', low:'LOW' }
    function confBadge(c: string): string {
      const color = CONF_COLOR[c] || '#6b7280'
      const label = CONF_LABEL[c] || (c || '').toUpperCase() || 'UNK'
      return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;color:#fff;background:${color}">${label}</span>`
    }
    const entries = commits.map(c => {
      let analysis: any = {}; try { analysis = c.analysis_json ? JSON.parse(c.analysis_json) : {} } catch {}
      let content: any = {}; try { content = c.content_json ? JSON.parse(c.content_json) : {} } catch {}
      const title = c.title || analysis.action || 'Update'
      const section = c.proposed_section || analysis.section || ''
      const detail = analysis.detail || content.detail || content.text || ''
      const source = analysis.source || content.url || ''
      return `
        <div class="hub-entry" style="border-left:3px solid ${CONF_COLOR[c.confidence]||'#6b7280'};padding:10px 16px;margin-bottom:12px;background:rgba(0,0,0,0.03)">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            ${confBadge(c.confidence)}
            ${section ? `<span style="font-size:11px;color:#888">${section}</span>` : ''}
            <span style="font-size:11px;color:#888">${dateStr}</span>
          </div>
          <div style="font-weight:600;margin-bottom:4px">${title}</div>
          ${detail ? `<div style="font-size:13px;line-height:1.5;color:#444">${detail}</div>` : ''}
          ${source ? `<a href="${source}" target="_blank" style="font-size:12px;color:#6366f1;text-decoration:none">Source →</a>` : ''}
        </div>`
    }).join('\n')

    const block = `<!-- HUB_UPDATE ${dateStr} -->\n${entries}`
    let modified = currentContent
    if (modified.includes('<!-- HUB_UPDATE_START -->')) {
      modified = modified.replace(/(<!-- HUB_UPDATE_START -->)([\s\S]*?)(<!-- HUB_UPDATE_END -->)/, `$1\n${block}\n$3`)
    } else if (modified.includes('</body>')) {
      modified = modified.replace('</body>', `<section id="hub-intelligence-update">\n<!-- HUB_UPDATE_START -->\n${block}\n<!-- HUB_UPDATE_END -->\n</section>\n</body>`)
    } else {
      modified = modified + `\n<!-- HUB_UPDATE_START -->\n${block}\n<!-- HUB_UPDATE_END -->\n`
    }

    // Write back to the repo.
    let htmlUrl = ''
    try {
      const commitMsg = `Intelligence update: ${dateStr} — ${commits.length} item${commits.length !== 1 ? 's' : ''} (${page.name})`
      const pushRes = await fetch(BASE_URL, {
        method: 'PUT', headers,
        body: JSON.stringify({ message: commitMsg, content: Buffer.from(modified, 'utf-8').toString('base64'), sha, branch }),
      })
      if (!pushRes.ok) {
        const errText = await pushRes.text()
        if (pushRes.status === 401) return { ok: false, error: `GitHub token lacks write access to ${repo}.` }
        if (pushRes.status === 409) return { ok: false, error: 'Merge conflict — the file changed upstream. Retry.' }
        return { ok: false, error: `GitHub push failed: ${pushRes.status} — ${errText}` }
      }
      const pushData = await pushRes.json().catch(() => ({})) as any
      htmlUrl = pushData?.commit?.html_url || ''
    } catch (e: any) {
      return { ok: false, error: `Push failed: ${e.message}` }
    }

    // Record history, mark items implemented, and close the source feedback loop.
    const { randomUUID } = require('crypto')
    const itemIds = commits.map(c => c.item_id).filter(Boolean)
    const whatChanged = params.whatChanged || `${commits.length} item${commits.length !== 1 ? 's' : ''} published to ${repo}`
    db().prepare(`INSERT INTO info_page_published (id,page_id,what_changed,committed_by_id,committed_by_name,approved_by_id,approved_by_name,prompt_used,item_ids_json,commit_count) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), params.pageId, whatChanged, params.pushedById, params.pushedByName, params.pushedById, params.pushedByName, `Auto-published to ${repo}/${file}`, JSON.stringify(itemIds), commits.length)
    const nowIso = new Date().toISOString()
    for (const id of itemIds) {
      db().prepare("UPDATE info_page_items SET status='implemented',updated_at=datetime('now') WHERE id=?").run(id)
      db().prepare("UPDATE info_page_commits SET status='implemented' WHERE item_id=?").run(id)
      const item = db().prepare('SELECT origin_source_id FROM info_page_items WHERE id=?').get(id) as { origin_source_id: string | null } | undefined
      if (item?.origin_source_id) {
        db().prepare("UPDATE intelligence_sources SET used_in_page=?, used_in_page_at=? WHERE id=?").run(page.name, nowIso, item.origin_source_id)
      }
    }
    return { ok: true, count: commits.length, repo, url: htmlUrl }
  })

  // ── Pipeline: Source Intelligence → Sources tab ──────────────────────────
  // Reconcile all approved intelligence sources matching this page's keywords
  // into 'ready_for_analysis' source items. Used for backfill + polling sync.
  ipcMain.handle('infoPages:syncSources', (_e, pageId: string) => {
    const page = db().prepare("SELECT id,name,board_config FROM workspace_boards WHERE id=?").get(pageId) as { id: string; name: string; board_config: string | null } | undefined
    if (!page) return { added: 0 }
    const keywords = keywordsForInfoPage(page.board_config)
    if (!keywords.length) return { added: 0 }
    const approved = db().prepare("SELECT * FROM intelligence_sources WHERE status IN ('approved','pushed')").all() as Array<Record<string, any>>
    let added = 0
    for (const src of approved) {
      if (!sourceMatchesKeywords(src, keywords)) continue
      if (src.used_in_page && src.used_in_page === page.name) continue
      const exists = db().prepare("SELECT 1 FROM info_page_items WHERE page_id=? AND origin_source_id=?").get(pageId, src.id)
      if (exists) continue
      insertSourceItemForPage(pageId, src)
      added++
    }
    return { added }
  })

  // Source items currently flowing through the Sources tab (ready or in analysis).
  ipcMain.handle('infoPages:getSourceItems', (_e, pageId: string) => {
    return db().prepare(`
      SELECT i.*, s.used_in_page, s.used_in_page_at, s.status AS source_status
      FROM info_page_items i
      LEFT JOIN intelligence_sources s ON s.id = i.origin_source_id
      WHERE i.page_id=? AND i.tab='sources' AND i.sub_type='intelligence_source'
        AND i.status IN ('ready_for_analysis','in_analysis')
      ORDER BY i.created_at DESC
    `).all(pageId)
  })

  // Move selected source items into Claude Analysis.
  ipcMain.handle('infoPages:sendSourcesToAnalysis', (_e, itemIds: string[]) => {
    if (!Array.isArray(itemIds) || !itemIds.length) return { ok: true, count: 0 }
    const stmt = db().prepare("UPDATE info_page_items SET status='in_analysis',updated_at=datetime('now') WHERE id=? AND status='ready_for_analysis'")
    let count = 0
    for (const id of itemIds) { const r = stmt.run(id); count += r.changes }
    return { ok: true, count }
  })

  // Counters for the Info Pages left panel.
  ipcMain.handle('infoPages:getSourceStats', (_e, pageId: string) => {
    const newAvailable = (db().prepare("SELECT COUNT(*) as c FROM info_page_items WHERE page_id=? AND sub_type='intelligence_source' AND status='ready_for_analysis'").get(pageId) as { c: number }).c
    const inAnalysis = (db().prepare("SELECT COUNT(*) as c FROM info_page_items WHERE page_id=? AND sub_type='intelligence_source' AND status='in_analysis'").get(pageId) as { c: number }).c
    return { newAvailable, inAnalysis }
  })

  // Intelligence sources currently queued for analysis on this page (for ClaudeAnalysisTab).
  ipcMain.handle('infoPages:getAnalysisSources', (_e, pageId: string) => {
    return db().prepare(`
      SELECT s.* FROM intelligence_sources s
      JOIN info_page_items i ON i.origin_source_id = s.id
      WHERE i.page_id=? AND i.sub_type='intelligence_source' AND i.status='in_analysis'
      ORDER BY i.created_at DESC
    `).all(pageId)
  })

  ipcMain.handle('infoPages:analyzeWithClaude', async (_e, params: {
    pageId: string; pageName: string; userId?: string;
    sources: unknown[]; manualItems: unknown[]
  }) => {
    try {
      const userRow = params.userId
        ? db().prepare("SELECT preferences_json FROM local_users WHERE id=?").get(params.userId) as { preferences_json: string } | undefined
        : undefined
      const prefs = userRow?.preferences_json ? JSON.parse(userRow.preferences_json) : {}
      const globalKey = db().prepare("SELECT value FROM settings WHERE key='anthropic_api_key'").get() as { value: string } | undefined
      const apiKey = prefs.anthropicApiKey || globalKey?.value
      if (!apiKey) return { ok: false, error: 'No Anthropic API key configured' }

      const AnthropicLib = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk')
      const client = new AnthropicLib({ apiKey })

      const sourcesText = (params.sources as any[]).slice(0, 20).map((s: any, i: number) =>
        `[Source ${i+1}] ${s.title || s.handle || 'Untitled'} (${s.source_name || s.platform || 'unknown'}, confidence: ${s.confidence || 'unknown'})\n${s.snippet || s.content?.slice(0,200) || ''}`
      ).join('\n\n')

      const manualText = (params.manualItems as any[]).slice(0, 10).map((m: any, i: number) => {
        const c = m.content_json ? (typeof m.content_json === 'string' ? JSON.parse(m.content_json) : m.content_json) : {}
        return `[Manual ${i+1}] ${m.sub_type?.toUpperCase() || 'INFO'}: ${m.title || ''}\n${c.text || c.content || c.key_quotes?.join(', ') || ''}`
      }).join('\n\n')

      const pageConfig = db().prepare('SELECT board_config FROM workspace_boards WHERE id=?').get(params.pageId) as { board_config: string | null } | undefined
      const config = pageConfig?.board_config ? JSON.parse(pageConfig.board_config) : {}

      const msg = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `You are analyzing intelligence content for the "${params.pageName}" information page (website: ${config.live_url || 'unknown'}).

Based on the sources and manual information below, generate a specific, actionable todo list of changes to make to the website. Format ONLY as valid JSON array:

[
  {
    "action": "Add new incident entry at top of feed",
    "section": "Incident Feed",
    "detail": "Specific detail of what to add/change",
    "confidence": "high|medium|low",
    "source": "Which source this comes from",
    "priority": "high|medium|low"
  }
]

Website sections available: Incident Feed, Platforms & Capabilities, Investment & Procurement, Finance Nexus, Source Archive, Statistics

SOURCES:
${sourcesText || 'None'}

MANUAL INFORMATION:
${manualText || 'None'}

Return ONLY the JSON array, no other text.`
        }]
      })

      const responseText = msg.content[0]?.type === 'text' ? msg.content[0].text : '[]'
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      const items = jsonMatch ? JSON.parse(jsonMatch[0]) : []
      return { ok: true, items }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // ── Claude Analysis chat (full interactive conversation per Info Page) ─────
  ipcMain.handle('infoPages:getChat', (_e, pageId: string) => {
    return db().prepare('SELECT * FROM info_page_chat WHERE page_id=? ORDER BY created_at ASC, rowid ASC').all(pageId)
  })

  ipcMain.handle('infoPages:clearChat', (_e, pageId: string) => {
    db().prepare('DELETE FROM info_page_chat WHERE page_id=?').run(pageId)
    return { ok: true }
  })

  ipcMain.handle('infoPages:chat', async (_e, params: {
    pageId: string; pageName: string; userId?: string; message: string
  }) => {
    try {
      const apiKey = resolveAnthropicKey(params.userId)
      if (!apiKey) return { ok: false, error: 'No Anthropic API key configured. Add one in Settings.' }
      const { randomUUID } = require('crypto')
      // Persist the analyst's message first.
      db().prepare('INSERT INTO info_page_chat (id,page_id,role,content) VALUES (?,?,?,?)')
        .run(randomUUID(), params.pageId, 'user', params.message)
      const history = db().prepare('SELECT role,content FROM info_page_chat WHERE page_id=? ORDER BY created_at ASC, rowid ASC').all(params.pageId) as { role: string; content: string }[]
      const system = await buildAnalysisSystemPrompt(params.pageId, params.pageName)
      const AnthropicLib = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk')
      const client = new AnthropicLib({ apiKey })
      const msg = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        system,
        messages: history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
      })
      const reply = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
      db().prepare('INSERT INTO info_page_chat (id,page_id,role,content) VALUES (?,?,?,?)')
        .run(randomUUID(), params.pageId, 'assistant', reply)
      return { ok: true, reply }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Summarize the analysis conversation into a structured set of design
  // recommendations to pre-populate the Pre-publish Design Notes tab.
  ipcMain.handle('infoPages:summarizeAnalysis', async (_e, params: {
    pageId: string; pageName: string; userId?: string
  }) => {
    try {
      const apiKey = resolveAnthropicKey(params.userId)
      if (!apiKey) return { ok: false, error: 'No Anthropic API key configured.' }
      const history = db().prepare('SELECT role,content FROM info_page_chat WHERE page_id=? ORDER BY created_at ASC, rowid ASC').all(params.pageId) as { role: string; content: string }[]
      if (!history.length) return { ok: false, error: 'No conversation to summarize yet.' }
      const convo = history.map(h => `${h.role === 'assistant' ? 'CLAUDE' : 'ANALYST'}: ${h.content}`).join('\n\n')
      const AnthropicLib = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk')
      const client = new AnthropicLib({ apiKey })
      const msg = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Based on the analysis conversation below about the "${params.pageName}" intelligence page, produce a JSON object summarizing the agreed changes to make to the page. Format ONLY as valid JSON:

{
  "summary": "1-3 sentence overview of what should change on the page",
  "recommendations": [
    { "section": "Section name", "action": "Short imperative change", "detail": "Specific detail of what to add/change", "confidence": "high|medium|low" }
  ]
}

CONVERSATION:
${convo}

Return ONLY the JSON object, no other text.`
        }]
      })
      const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
      const m = text.match(/\{[\s\S]*\}/)
      const parsed = m ? JSON.parse(m[0]) : { summary: '', recommendations: [] }
      return { ok: true, summary: parsed.summary || '', recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [] }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('infoPages:generatePrompt', (_e, params: {
    pageName: string; pageRepo: string; items: Array<{
      action: string; section: string; detail: string; confidence: string; source: string
    }>
  }) => {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const n = params.items.length

    const changesList = params.items.map((item, i) => {
      const section = item.section
      const conf = item.confidence?.toUpperCase() || 'MEDIUM'
      if (section === 'Incident Feed') {
        return `${i+1}. In Section 02 (Incident Feed), add a new incident entry at the top of the feed:
   - Description: ${item.detail}
   - Confidence: ${conf} (${conf==='HIGH'?'green':conf==='MEDIUM'?'amber':'red'} badge)
   - Source: ${item.source}`
      } else if (section === 'Investment & Procurement') {
        return `${i+1}. In Section 04 (Investment & Procurement), add a new procurement signal entry:
   - Description: ${item.detail}
   - Confidence: ${conf}
   - Source: ${item.source}`
      } else if (section === 'Source Archive') {
        return `${i+1}. In Section 07 (Source Archive), add a new entry:
   - Title: ${item.action}
   - Detail: ${item.detail}
   - Confidence: ${conf}
   - Source: ${item.source}`
      } else if (section === 'Platforms & Capabilities') {
        return `${i+1}. In Section 03 (Platforms & Capabilities):
   - ${item.detail}
   - Source: ${item.source}`
      } else if (section === 'Finance Nexus') {
        return `${i+1}. In Section 05 (Finance Nexus), add a new entry:
   - ${item.detail}
   - Confidence: ${conf}
   - Source: ${item.source}`
      } else {
        return `${i+1}. ${item.action} (${section}):
   - ${item.detail}
   - Confidence: ${conf}
   - Source: ${item.source}`
      }
    }).join('\n\n')

    const prompt = `Update the ${params.pageName} website (github.com/${params.pageRepo}).
Implement the following specific changes:

${changesList}

Preserve all existing HTML structure, CSS, and visual design exactly. Only add the new content listed above. Do not remove any existing content. After implementing all changes, commit with message: "Intelligence update: ${today} — ${n} item${n!==1?'s':''}" and push to main branch.`

    return { ok: true, prompt }
  })
}
