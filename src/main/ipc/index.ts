import { ipcMain, app, dialog, shell } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { randomBytes, createHash, createHmac } from 'crypto'
import { getDatabase, hashPassword } from '../db'
import { CLOUD_ADMIN_EMAIL, PERMISSION_KEYS } from '../constants'
import { cloud } from '../cloud/client'
import { driveSync } from '../google/drive'
import { sendEmail, inviteEmailHtml } from '../google/gmail'
import { analyzeWithClaude, type AnalyzeOpts } from '../ai/analyze'
import { fetchUrlMetadata } from '../social/fetchUrlMetadata'
import { connectUserGoogle, getUserGoogleStatus, disconnectUserGoogle, getUserCalendars, getUserCalendarEvents, diagnoseUserGoogle } from '../google/userGoogle'
import { listChatMessages, sendChatMessage, seedChatToCloud } from '../cloud/chat'
import {
  listContacts, listTrashedContacts, getContact, createContact, updateContact,
  softDeleteContact, restoreContact, permanentDeleteContact,
  addInteraction, updateInteraction, deleteInteraction, linkTask, unlinkTask,
  listClients, getClient, createClientRecord, updateClient, deleteClient,
  addClientContact, deleteClientContact, seedContactsToCloud,
} from '../cloud/contacts'
import * as boardsCloud from '../cloud/boards'
import { resolveIdentity } from '../cloud/boards'
import { assignedToSql, parseAssignees } from '../assignees'
import { listTodos } from '../todos'
import { nextOccurrence } from '../todos/nextOccurrence'
import { startMissedSchedule, stopMissedSchedule } from '../todos/missedEvaluator'
import * as intelCloud from '../cloud/intel'
import { isOnline } from '../cloud/connection'
import { getKnownTags as cloudGetKnownTags, createTag as cloudCreateTag, deleteTag as cloudDeleteTag } from '../cloud/tags'
import { seedBoardsToCloud } from '../cloud/boardsSeed'
import { getTeamRoster } from '../cloud/teamRoster'
import { getOffWork, setOffWork, listOffWork, clearOffWork } from '../cloud/offWork'
import { migrateAssigneesToEmail, rollbackAssigneesToIds, migrateCloudAssigneesToEmail, rollbackCloudAssignees } from '../cloud/assigneesEmailMigration'
import { syncPersonalWrite, ownerEmail, nowIso, personalCloudRow } from '../cloud/personalSync'
import { startRealtime, rescope as rescopeRealtime, teardownAll as teardownRealtime, getRealtimeHealth } from '../cloud/realtimeManager'
import {
  listAttachments, addFileAttachment, addUrlAttachment,
  openAttachment, deleteAttachment, seedAttachmentsToCloud,
} from '../cloud/attachmentsCloud'

// ── Ambient acting user (Stage 2 cat.3) ──────────────────────────────────────
// Board visibility is membership-scoped and must be enforced in the main process
// (the service-role key bypasses RLS). Many board/workspace READ channels carry
// no user argument, so the renderer stamps the signed-in user's local id here
// once at login via app:setActingUser, and the board handlers resolve it to a
// stable email + admin flag (see cloud/boards.ts resolveActor).
let currentActingUserId: string | undefined
export function getActingUserId(): string | undefined { return currentActingUserId }

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
  // CLOUD-SOURCED (Stage 2, category 3).
  ipcMain.handle('projects:getAll', () => boardsCloud.getAllProjects())
  ipcMain.handle('projects:upsert', (_e, p: Record<string, unknown>) => boardsCloud.upsertProject(p))
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
  // TODO(off-work): when notifications move to cloud (the cross-member sender that
  // slice 5 also needs), DROP notifications to a member whose off_work window
  // contains today — look up off_work by the recipient's email and skip the send.
  // No-op today: notifications are local/per-device (this row targets THIS device's
  // own user_id), so there is no cross-member send to suppress yet.
  try {
    getDatabase().prepare(`INSERT INTO notifications (id,user_id,type,title,body,task_id,task_title,actor_name)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuid(), n.user_id, n.type, n.title, n.body ?? null, n.task_id ?? null, n.task_title ?? null, n.actor_name ?? null)
  } catch {}
}

function registerCommentHandlers() {
  // CLOUD-SOURCED (Stage 2, category 3). Comment rows live in the cloud; local
  // notification + @mention side-effects are preserved (notifications not migrated).
  ipcMain.handle('comments:get', (_e, taskId: string) => boardsCloud.getComments(taskId))
  ipcMain.handle('comments:add', async (_e, c: {
    task_id: string; author_id: string; author_name: string; content: string;
    task_title?: string; assignee_emails?: string[]
  }) => {
    const { task_title, assignee_emails } = c
    const entry = await boardsCloud.addComment(c)

    // Notify assignees (except the commenter). Assignees are EMAILS as of 1c-2b-①,
    // but author_id is still a local_users.id — comparing the two directly would
    // never match, silently notifying the author about their own comment. Resolve
    // the author to an email so the self-exclusion compares like with like.
    const authorEmail = resolveIdentity(c.author_id).email.toLowerCase()
    const targets = (assignee_emails ?? []).filter(e => e.toLowerCase() !== authorEmail)
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
  ipcMain.handle('comments:delete', async (_e, id: string, deletedById?: string, deletedByName?: string) => {
    return boardsCloud.deleteComment(currentActingUserId, id, deletedById, deletedByName)
  })
}

// ── Activity ───────────────────────────────────────────────────────────────

function registerActivityHandlers() {
  // CLOUD-SOURCED (Stage 2, category 3). Feed is membership-filtered via the ambient actor.
  ipcMain.handle('activity:get', (_e, taskId: string) => boardsCloud.getActivity(taskId))
  ipcMain.handle('activity:add', (_e, e: { task_id: string; actor_name: string; action: string }) => boardsCloud.addActivity(e))
  ipcMain.handle('activity:getFeed', (_e, actorId?: string) => boardsCloud.getFeed(actorId ?? currentActingUserId))
}

// ── Auth ───────────────────────────────────────────────────────────────────

function registerAuthHandlers() {
  ipcMain.handle('auth:localSignIn', async (_e, email: string, password: string) => {
    const trimmed = email.trim().toLowerCase()
    if (trimmed !== CLOUD_ADMIN_EMAIL && !trimmed.endsWith('@kantor-consulting.com')) {
      return { error: 'Access restricted to Kantor Consulting team members only.' }
    }
    // The system admin must always resolve to role 'admin' on every device. On a
    // fresh machine (no local row, no local_admin bootstrap) the cross-device
    // path (C) below would otherwise provision the admin as 'member', which makes
    // the Workspace board-access guard bounce them to the dashboard.
    const isAdminEmail = trimmed === CLOUD_ADMIN_EMAIL
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM local_users WHERE LOWER(email)=?').get(trimmed) as Record<string, unknown> | undefined

    // ── (A) Local row exists ──────────────────────────────────────────────
    if (row) {
      if (row.status === 'inactive') return { error: 'Your account has been deactivated. Contact your administrator.' }

      // Heal a mis-provisioned admin row (e.g. created as 'member' by path C on a
      // prior fresh-device sign-in) so backend board-access checks see admin too.
      if (isAdminEmail && row.role !== 'admin') {
        db.prepare("UPDATE local_users SET role='admin' WHERE id=?").run(row.id)
        row.role = 'admin'
      }

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
        .run(id, trimmed, name, isAdminEmail ? 'admin' : 'member', hash, salt, isAccessCode ? 1 : 0)
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
        .run(id, trimmed, name, isAdminEmail ? 'admin' : 'member', hash, salt)
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
  ipcMain.handle('team:list', (_e, includeAdmin?: boolean) =>
    getDatabase()
      .prepare(`SELECT id,email,full_name,role,status,must_change_password,anthropic_key_set,created_at,last_active
                FROM local_users
                WHERE status != 'inactive'
                ${includeAdmin ? '' : 'AND LOWER(email) != ?'}
                ORDER BY created_at`)
      .all(...(includeAdmin ? [] : [CLOUD_ADMIN_EMAIL]))
  )

  // Slice 1c-1: the ROSTER — cloud team_members with an offline mirror, keyed on
  // the stable work email. Additive: `team:list` above is untouched and remains
  // the account channel (auth, status, removal, heartbeat — all local_users.id).
  // This channel exists so display surfaces (assignee picker, @mentions) can show
  // the whole team without the id-keyed handlers inheriting an email as their key.
  ipcMain.handle('team:roster', () => getTeamRoster())

  // ── Off-work / leave windows (v1) ─────────────────────────────────────────
  // Per-member self-set ONE leave window, email-keyed in cloud (+ local mirror the
  // evaluator reads offline). get/set resolve the ACTING user's email — a member
  // only ever reads/writes their OWN window. list feeds the Team "on leave" pill.
  ipcMain.handle('offWork:get', () => {
    const email = resolveIdentity(currentActingUserId).email
    if (!email) return null
    return getOffWork(email)
  })
  ipcMain.handle('offWork:set', (_e, start: string, end: string) => {
    const email = resolveIdentity(currentActingUserId).email
    if (!email) return { ok: false, error: 'No user identity.' }
    return setOffWork(email, start, end)
  })
  ipcMain.handle('offWork:list', () => listOffWork())
  ipcMain.handle('offWork:clear', () => {
    const email = resolveIdentity(currentActingUserId).email
    if (!email) return { ok: false, error: 'No user identity.' }
    return clearOffWork(email)
  })

  // Slice 1c-2a: assignees id→email migration control surface. Real channels rather
  // than a documented SQL block so the rollback REHEARSAL exercises the same code
  // path a real rollback would — a restore procedure that has only ever been run as
  // hand-typed SQL is an untested restore procedure.
  ipcMain.handle('assigneesMigration:run',      () => migrateAssigneesToEmail())
  ipcMain.handle('assigneesMigration:rollback', () => rollbackAssigneesToIds())
  // Slice 1c-2b-①: the cloud half. `cloudRollback` is the LAST REVERSIBLE POINT —
  // valid only while no second device has synced the rewritten emails down.
  ipcMain.handle('assigneesMigration:cloudRun',      () => migrateCloudAssigneesToEmail())
  ipcMain.handle('assigneesMigration:cloudRollback', () => rollbackCloudAssignees())

  ipcMain.handle('team:invite', async (_e, params: { email: string; full_name: string; role?: string }) => {
    // Inviting people to the app is admin-only (enforced in main; never trust renderer).
    const caller = await boardsCloud.resolveActor(currentActingUserId)
    if (!caller.isRoot) {
      return { error: 'You do not have permission to invite team members.' }
    }

    const email = (params.email ?? '').trim().toLowerCase()

    // Domain validation — allow @kantor-consulting.com + admin email (unchanged)
    if (email !== CLOUD_ADMIN_EMAIL && !email.endsWith('@kantor-consulting.com')) {
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
    if (params.email && !params.email.endsWith('@kantor-consulting.com') && params.email !== CLOUD_ADMIN_EMAIL) {
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
  // CLOUD-SOURCED (Stage 2, category 3). Workspace-global.
  ipcMain.handle('areas:list', () => boardsCloud.listAreas())
  ipcMain.handle('areas:create', (_e, name: string, color: string) => boardsCloud.createArea(name, color))
  ipcMain.handle('areas:update', (_e, id: string, name: string, color: string) => boardsCloud.updateArea(id, name, color))
  ipcMain.handle('areas:delete', (_e, id: string) => boardsCloud.deleteArea(id))
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
  // CLOUD-SOURCED (Stage 2, category 3).
  ipcMain.handle('labels:list', () => boardsCloud.listLabels())
  ipcMain.handle('labels:create', (_e, name: string, color: string) => boardsCloud.createLabel(name, color))
  ipcMain.handle('labels:update', (_e, id: string, name: string, color: string) => boardsCloud.updateLabel(id, name, color))
  ipcMain.handle('labels:delete', (_e, id: string) => boardsCloud.deleteLabel(id))
  ipcMain.handle('taskLabels:get', (_e, taskId: string) => boardsCloud.getTaskLabels(taskId))
  ipcMain.handle('taskLabels:set', (_e, taskId: string, labelIds: string[]) => boardsCloud.setTaskLabels(taskId, labelIds))
}

// ── Checklists ─────────────────────────────────────────────────────────────

function registerChecklistHandlers() {
  // CLOUD-SOURCED (Stage 2, category 3).
  ipcMain.handle('checklists:get', (_e, taskId: string) => boardsCloud.getChecklists(taskId))
  ipcMain.handle('checklists:create', (_e, taskId: string, title: string) => boardsCloud.createChecklist(taskId, title))
  ipcMain.handle('checklists:delete', (_e, checklistId: string) => boardsCloud.deleteChecklist(checklistId))
  ipcMain.handle('checklistItems:add', (_e, checklistId: string, taskId: string, text: string) => boardsCloud.addChecklistItem(checklistId, taskId, text))
  ipcMain.handle('checklistItems:toggle', (_e, itemId: string, checked: boolean) => boardsCloud.toggleChecklistItem(itemId, checked))
  ipcMain.handle('checklistItems:delete', (_e, itemId: string) => boardsCloud.deleteChecklistItem(itemId))
  ipcMain.handle('checklistItems:update', (_e, itemId: string, text: string) => boardsCloud.updateChecklistItem(itemId, text))
}

// ── Attachments ────────────────────────────────────────────────────────────

function registerAttachmentHandlers() {
  // CLOUD-SOURCED (Stage 2 — final piece of boards). All attachment metadata in the
  // cloud task_attachments table; blobs in the private 'card-attachments' Storage bucket.
  // Renderer makes NO direct Storage calls. Native picker stays in main (no IPC payload).
  // Local userData/attachments/ dir is left untouched (seed READS it; we do not modify it).
  ipcMain.handle('attachments:get', (_e, taskId: string) =>
    listAttachments(currentActingUserId, taskId)
  )
  ipcMain.handle('attachments:addFile', (e, taskId: string) => {
    const { BrowserWindow } = require('electron') as typeof import('electron')
    const win = BrowserWindow.fromWebContents(e.sender)
    return addFileAttachment(currentActingUserId, taskId, win)
  })
  ipcMain.handle('attachments:addUrl', (_e, taskId: string, name: string, url: string, type: string) =>
    addUrlAttachment(currentActingUserId, taskId, url, name, type)
  )
  ipcMain.handle('attachments:delete', (_e, id: string) =>
    deleteAttachment(currentActingUserId, id)
  )
  // open: URL-type attachments return { url } for renderer shell.openExternal.
  // Blob-type: cache-then-shell.openPath (handled in main via openAttachment).
  ipcMain.handle('attachments:open', async (_e, attachmentId: string) => {
    const result = await openAttachment(currentActingUserId, attachmentId)
    if (result.url) {
      await shell.openExternal(result.url)
      return { ok: true }
    }
    return result
  })
  ipcMain.handle('attachments:seedToCloud', (_e, requestEmail: string) =>
    seedAttachmentsToCloud(requestEmail)
  )
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
  // Team chat is CLOUD-SOURCED (Stage 2, category 1). The IPC channel names are
  // unchanged; only the implementation moved from local SQLite to the cloud
  // (renderer → IPC → main → Supabase). Errors propagate so the UI can show a
  // readable "couldn't reach the server" message rather than falling back to
  // stale local data.
  ipcMain.handle('chat:getMessages', (_e, limit: number = 100) => listChatMessages(limit))
  ipcMain.handle('chat:send', (_e, msg: { author_id: string; author_name: string; content: string }) => sendChatMessage(msg))
  // Admin-only, one-time, idempotent seed of this machine's local chat history.
  ipcMain.handle('chat:seedToCloud', (_e, requestEmail: string) => seedChatToCloud(requestEmail))
}

// ── Comment edit ───────────────────────────────────────────────────────────

function registerCommentEditHandler() {
  // CLOUD-SOURCED (Stage 2, category 3).
  ipcMain.handle('comments:update', (_e, id: string, content: string) => boardsCloud.updateComment(id, content))
}

// ── Board membership: ambient acting user + one-time seed ───────────────────
function registerBoardsCloudHandlers() {
  // Renderer stamps the signed-in user's local id once at login so the
  // membership-scoped board handlers know who is asking (service role bypasses RLS).
  ipcMain.handle('app:setActingUser', (_e, userId: string | null) => {
    const prev = currentActingUserId
    currentActingUserId = userId ?? undefined
    boardsCloud.setAmbientActingUser(currentActingUserId)
    // Realtime lifecycle: start once identity is known; rescope on user switch so
    // the live relevance filter follows the new user; tear down on logout.
    try {
      if (!currentActingUserId) teardownRealtime()
      else if (!prev) startRealtime()
      else if (prev !== currentActingUserId) rescopeRealtime()
    } catch (e) {
      console.warn('[realtime] lifecycle on setActingUser failed:', (e as Error)?.message)
    }
    // C-recurring-3: the missed-occurrence evaluator + CET-midnight timer follow the
    // SAME lifecycle as realtime — start on login, restart scoped to the new user on
    // switch, stop on logout. Teardown also happens in window-all-closed / before-quit
    // (index.ts), matching the realtime teardown discipline.
    try {
      if (!currentActingUserId) stopMissedSchedule()
      else if (!prev) startMissedSchedule(currentActingUserId)
      else if (prev !== currentActingUserId) { stopMissedSchedule(); startMissedSchedule(currentActingUserId) }
    } catch (e) {
      console.warn('[missedEval] lifecycle on setActingUser failed:', (e as Error)?.message)
    }
    return { ok: true }
  })
  // Admin-only, one-time, idempotent seed of this machine's local board tables.
  ipcMain.handle('boards:seedToCloud', (_e, requestEmail: string) => seedBoardsToCloud(requestEmail))
  // 0b-0: READ-ONLY realtime health snapshot (debug surface — window.api.realtime.health()
  // from devtools). Reading it triggers NOTHING: no resubscribe, no teardown, no rescope.
  // Exists because the HTTP-derived `online` flag cannot see socket death (findings 3/4).
  ipcMain.handle('realtime:health', () => getRealtimeHealth())
}

// ── Boards ────────────────────────────────────────────────────────────────

function registerBoardHandlers() {
  // CLOUD-SOURCED (Stage 2, category 3). Membership-scoped: admin sees all,
  // members see only their boards (enforced in cloud/boards via the ambient actor).
  // Board READS carry the acting user EXPLICITLY (actorId arg) so visibility never
  // depends on effect ordering; fall back to the ambient value if not supplied.
  ipcMain.handle('boards:list', (_e, includeArchived: boolean = false, actorId?: string) =>
    boardsCloud.listBoards(actorId ?? currentActingUserId, includeArchived))
  ipcMain.handle('boards:listArchived', (_e, actorId?: string) => boardsCloud.listArchivedBoards(actorId ?? currentActingUserId))
  ipcMain.handle('boards:create', (_e, name: string, boardType?: string, boardConfig?: string | null) => boardsCloud.createBoard(currentActingUserId, name, boardType, boardConfig))
  ipcMain.handle('boards:rename', (_e, id: string, name: string) => boardsCloud.renameBoard(id, name))
  ipcMain.handle('boards:updateConfig', (_e, id: string, config: string | null) => boardsCloud.updateBoardConfig(currentActingUserId, id, config))
  ipcMain.handle('boards:archive', (_e, id: string, archivedBy: string) => boardsCloud.archiveBoard(id, archivedBy))
  ipcMain.handle('boards:restore', (_e, id: string) => boardsCloud.restoreBoard(id))
  // Soft-delete is ADMIN-ONLY (verified in the main process — service role bypasses RLS).
  ipcMain.handle('boards:delete', (_e, id: string, deletedById?: string, deletedByName?: string) =>
    boardsCloud.deleteBoard(currentActingUserId, id, deletedById, deletedByName))
  ipcMain.handle('boards:listTrashed', () => boardsCloud.listTrashedBoards(currentActingUserId))
  ipcMain.handle('boards:permanentlyDelete', (_e, id: string) => boardsCloud.permanentlyDeleteBoard(currentActingUserId, id))
  ipcMain.handle('boards:undelete', (_e, id: string) => boardsCloud.undeleteBoard(id))
  ipcMain.handle('boards:duplicate', (_e, id: string, newName: string) => boardsCloud.duplicateBoard(currentActingUserId, id, newName))
  ipcMain.handle('boards:taskCount', (_e, id: string) => boardsCloud.boardTaskCount(id))
  ipcMain.handle('boards:getTasks', (_e, boardId: string, actorId?: string) => boardsCloud.getBoardTasks(actorId ?? currentActingUserId, boardId))
  ipcMain.handle('boards:reorder', (_e, boardIds: string[]) => boardsCloud.reorderBoards(boardIds, currentActingUserId))
}

// ── Workspace (local SQLite — columns + tasks) ────────────────────────────

function registerWorkspaceHandlers() {
  // CLOUD-SOURCED (Stage 2, category 3). Columns + tasks live in the cloud;
  // task lists are membership-filtered via the ambient actor; ordering preserved.
  // Reads carry the acting user explicitly (actorId), ambient as fallback.
  ipcMain.handle('workspace:getColumns', (_e, boardId?: string, actorId?: string) => boardsCloud.getColumns(actorId ?? currentActingUserId, boardId))
  ipcMain.handle('workspace:addColumn', (_e, col: { id: string; name: string; position: number; color: string; board_id?: string }) => boardsCloud.addColumn(col, currentActingUserId))
  ipcMain.handle('workspace:deleteColumn', (_e, colId: string) => boardsCloud.deleteColumn(colId, currentActingUserId))
  ipcMain.handle('workspace:updateColumn', (_e, colId: string, partial: { name?: string; position?: number }) => boardsCloud.updateColumn(colId, partial))
  ipcMain.handle('workspace:reorderColumns', (_e, ids: string[]) => boardsCloud.reorderColumns(ids))

  ipcMain.handle('workspace:getTasks', (_e, actorId?: string) => boardsCloud.getTasks(actorId ?? currentActingUserId))
  ipcMain.handle('workspace:archiveTask', (_e, taskId: string) => boardsCloud.archiveTask(taskId))
  ipcMain.handle('workspace:getArchivedTasks', (_e, actorId?: string) => boardsCloud.getArchivedTasks(actorId ?? currentActingUserId))
  ipcMain.handle('workspace:restoreTask', (_e, taskId: string) => boardsCloud.restoreTask(taskId))
  ipcMain.handle('workspace:markForDeletion', (_e, taskId: string) => boardsCloud.markForDeletion(taskId))
  ipcMain.handle('workspace:adminMarkForDeletion', (_e, taskId: string) => boardsCloud.adminMarkForDeletion(taskId, currentActingUserId))
  ipcMain.handle('workspace:undeleteTask', (_e, taskId: string) => boardsCloud.undeleteTask(taskId))
  ipcMain.handle('workspace:markCompleteNow', (_e, taskId: string) => boardsCloud.markCompleteNow(taskId))
  ipcMain.handle('workspace:getCompletedTasks', (_e, actorId?: string) => boardsCloud.getCompletedTasks(actorId ?? currentActingUserId))
  ipcMain.handle('workspace:getMarkedForDeletionTasks', (_e, actorId?: string) => boardsCloud.getMarkedForDeletionTasks(actorId ?? currentActingUserId))
  ipcMain.handle('workspace:createTask', (_e, t: Parameters<typeof boardsCloud.createTask>[0]) => boardsCloud.createTask(t))
  ipcMain.handle('workspace:updateTask', (_e, taskId: string, partial: Record<string, unknown>) => boardsCloud.updateTask(taskId, partial))
  ipcMain.handle('workspace:deleteTask', (_e, taskId: string, deletedById?: string, deletedByName?: string) => boardsCloud.deleteTask(taskId, deletedById, deletedByName))
}

// ── Clients ───────────────────────────────────────────────────────────────

function registerClientsHandlers() {
  const db = () => getDatabase()

  // Clients — CLOUD-SOURCED (Stage 2, category 2). Channel names unchanged.
  ipcMain.handle('clients:list', () => listClients())
  ipcMain.handle('clients:get', (_e, id: string) => getClient(id))
  ipcMain.handle('clients:create', (_e, data: Record<string, unknown>) => createClientRecord(data))
  ipcMain.handle('clients:update', (_e, id: string, data: Record<string, unknown>) => updateClient(id, data))
  ipcMain.handle('clients:delete', (_e, id: string) => deleteClient(id))
  ipcMain.handle('clients:addContact', (_e, clientId: string, contact: Record<string, unknown>) => addClientContact(clientId, contact))
  ipcMain.handle('clients:deleteContact', (_e, contactId: string) => deleteClientContact(contactId))
  ipcMain.handle('clients:seedToCloud', (_e, requestEmail: string) => seedContactsToCloud(requestEmail))
}

// ── Contacts ──────────────────────────────────────────────────────────────

function registerContactsHandlers() {
  // Contacts — CLOUD-SOURCED (Stage 2, category 2). Channel names unchanged.
  // SHARED SOFT-DELETE TRASH: deleting a contact moves it to the cloud trash
  // (deleted_at set) so it leaves the active list for everyone and appears in the
  // shared Trash view. Any member can soft-delete/restore; only the admin can
  // permanently delete — the admin email is verified in the main process below.
  ipcMain.handle('contacts:list', () => listContacts())
  ipcMain.handle('contacts:listTrash', () => listTrashedContacts())
  ipcMain.handle('contacts:get', (_e, id: string) => getContact(id))
  ipcMain.handle('contacts:create', (_e, data: Record<string, unknown>) => createContact(data))
  ipcMain.handle('contacts:update', (_e, id: string, data: Record<string, unknown>) => updateContact(id, data))
  ipcMain.handle('contacts:softDelete', (_e, id: string, deletedById?: string) => softDeleteContact(id, deletedById ?? null))
  ipcMain.handle('contacts:restore', (_e, id: string) => restoreContact(id))
  ipcMain.handle('contacts:permanentDelete', (_e, id: string, requestEmail: string) => permanentDeleteContact(id, requestEmail))
  ipcMain.handle('contacts:addInteraction', (_e, data: Record<string, unknown>) => addInteraction(data))
  ipcMain.handle('contacts:updateInteraction', (_e, id: string, data: Record<string, unknown>) => updateInteraction(id, data))
  ipcMain.handle('contacts:deleteInteraction', (_e, id: string) => deleteInteraction(id))
  ipcMain.handle('contacts:linkTask', (_e, contactId: string, taskId: string) => linkTask(contactId, taskId))
  ipcMain.handle('contacts:unlinkTask', (_e, contactId: string, taskId: string) => unlinkTask(contactId, taskId))
}

// ── Templates ──────────────────────────────────────────────────────────────

function registerTemplatesHandlers() {
  // CLOUD-SOURCED (Stage 2, category 3). Renderer passes `checklist` (array);
  // it is serialized to checklist_json here to match the cloud schema.
  ipcMain.handle('templates:list', (_e, boardId?: string) => boardsCloud.listTemplates(boardId))
  ipcMain.handle('templates:create', (_e, data: Record<string, unknown>) =>
    boardsCloud.createTemplate({
      name: data.name, content_type: data.content_type, duration_days: data.duration_days,
      checklist_json: JSON.stringify(data.checklist ?? []), board_id: data.board_id ?? null,
    }))
  ipcMain.handle('templates:update', (_e, id: string, data: Record<string, unknown>) => {
    const patch: Record<string, unknown> = {}
    if ('name' in data) patch.name = data.name
    if ('content_type' in data) patch.content_type = data.content_type
    if ('duration_days' in data) patch.duration_days = data.duration_days
    if ('checklist' in data) patch.checklist_json = JSON.stringify(data.checklist)
    return boardsCloud.updateTemplate(id, patch)
  })
  ipcMain.handle('templates:delete', (_e, id: string) => boardsCloud.deleteTemplate(id))
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
      SELECT wt.*, tm.display_name as assignee_name
      FROM workspace_tasks wt
      LEFT JOIN team_members tm ON LOWER(tm.email) = LOWER((
        SELECT json_each.value FROM json_each(wt.assignees_json) LIMIT 1
      ))
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
    const allMembers = db.prepare("SELECT id, full_name, email FROM local_users WHERE status=? AND LOWER(email) != ?").all('active', CLOUD_ADMIN_EMAIL) as any[]
    const memberStats = allMembers.map(m => {
      const assigned = db.prepare(`SELECT COUNT(*) as c FROM workspace_tasks WHERE archived=0 AND ${assignedToSql('assignees_json')}`).get(m.email) as {c:number}
      const completed = db.prepare(`SELECT COUNT(*) as c FROM workspace_tasks WHERE column_id='col-published' AND archived=0 AND ${assignedToSql('assignees_json')}`).get(m.email) as {c:number}
      const overdue = db.prepare(`SELECT COUNT(*) as c FROM workspace_tasks WHERE archived=0 AND column_id!='col-published' AND due_date < ? AND ${assignedToSql('assignees_json')}`).get(todayStr, m.email) as {c:number}
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

// ── To-Do aggregation (slice 2) ────────────────────────────────────────────
// ADDITIVE. `todo:getMyTasks` and the `personalTodo:*` handlers below are left
// EXACTLY as they are, and Todo.tsx keeps calling them — the renderer migrates in
// slice 3. Repointing the UI in the same slice that introduces the aggregate would
// leave no working path to compare against ("ADD, don't repoint", per 1c-1).
function registerTodosHandlers() {
  ipcMain.handle('todos:list', (_e, actingUser: string) => listTodos(actingUser))
}

// ── To-Do ──────────────────────────────────────────────────────────────────

function registerTodoHandlers() {
  // Get all tasks assigned to a user (across all boards they're a member of)
  ipcMain.handle('todo:getMyTasks', (_e, userId: string) => {
    // Callers still pass localUser.id; resolveIdentity accepts an id, an email or
    // 'local-admin' and returns the stable work email, so the renderer needed no
    // change. Assignments are email-keyed as of 1c-2b-①.
    const { email } = resolveIdentity(userId)
    if (!email) return []
    const rows = getDatabase().prepare(`
      SELECT wt.*, wb.name as board_name
      FROM workspace_tasks wt
      LEFT JOIN workspace_boards wb ON wb.id = wt.board_id
      WHERE wt.archived = 0
        AND ${assignedToSql('wt.assignees_json')}
      ORDER BY wt.due_date ASC, wt.created_at DESC
    `).all(email) as any[]

    return rows.map(r => ({
      ...r,
      assignee_emails: parseAssignees(r.assignees_json),
    }))
  })

  // Complete a task: move to last column, set completed_at, notify admin
  ipcMain.handle('todo:complete', async (_e, taskId: string, userId: string, userName: string) => {
    const db = getDatabase()
    const task = db.prepare('SELECT * FROM workspace_tasks WHERE id=?').get(taskId) as any
    if (!task) return { ok: false }

    const completedAt = new Date().toISOString()

    // Find the last column (published/done)
    const lastCol = db.prepare(
      'SELECT id FROM workspace_columns ORDER BY position DESC LIMIT 1'
    ).get() as { id: string } | undefined
    const targetCol = lastCol?.id ?? 'col-published'

    // WRITE-THROUGH FIX — CLOUD FIRST, and it is AUTHORITATIVE. This used to be a local-only
    // UPDATE, so syncTasksMirror (which DELETEs + re-INSERTs from cloud on any successful
    // getTasks) reverted the completion. Field-level patch of ONLY the two fields this
    // action changes — never a full-row write from the local mirror, which could clobber a
    // field another device changed. updateTask throws on failure, matching the board
    // task-write convention (writes are cloud-only and online-required; the isOnline()
    // guards in boards.ts are on READS, not writes), so a failed write propagates instead of
    // silently leaving a local-only completion.
    await boardsCloud.updateTask(taskId, { column_id: targetCol, completed_at: completedAt })

    // Local mirror written with the SAME values just persisted to cloud, so the To-Do view
    // (todo:getMyTasks reads local and never re-syncs) reflects it immediately. Identical
    // values means no divergence — the next syncTasksMirror overwrites with what cloud has.
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
    // Dual-write (1b). Local stays user_id-keyed; the cloud row is owner-keyed by the
    // resolved email. There is no un-dismiss path anywhere in the app, so 'insert' is
    // the only op this table ever produces.
    const email = ownerEmail(userId)
    if (email) syncPersonalWrite('insert', 'todo_dismissed', { user_email: email, task_id: taskId, dismissed_at: nowIso() })
    else console.warn(`[personalSync] SKIP cloud dismissal for task ${taskId} — user_id "${userId}" does not resolve to an email.`)
    return { ok: true }
  })

  // Get list of dismissed task IDs for a user
  ipcMain.handle('todo:getDismissed', (_e, userId: string) => {
    const rows = getDatabase().prepare('SELECT task_id FROM todo_dismissed WHERE user_id=?').all(userId) as {task_id:string}[]
    return rows.map(r => r.task_id)
  })

  // Undo completion: restore to previous column (scoping)
  ipcMain.handle('todo:uncomplete', async (_e, taskId: string) => {
    const updatedAt = new Date().toISOString()
    // Cloud-first, field-level — same rationale as todo:complete above. Clearing
    // completed_at requires `completed_at` in updateTask's field allowlist; null is a
    // meaningful value here, not an omission.
    await boardsCloud.updateTask(taskId, { column_id: 'col-scoping', completed_at: null })
    getDatabase().prepare('UPDATE workspace_tasks SET column_id=?, completed_at=NULL, updated_at=? WHERE id=?')
      .run('col-scoping', updatedAt, taskId)
    return { ok: true }
  })
}

// ── Board Members ──────────────────────────────────────────────────────────

function registerBoardMembersHandlers() {
  const db = () => getDatabase()

  // CLOUD-SOURCED (Stage 2, category 3). Membership is email-keyed in the cloud.
  ipcMain.handle('boardMembers:list', (_e, boardId: string) => boardsCloud.listMembers(boardId))

  // Add: cloud module authorizes (admin OR existing member) and writes the row;
  // local notification + email side-effects are preserved here (notifications not migrated).
  ipcMain.handle('boardMembers:add', async (_e, boardId: string, userId: string, addedByName: string) => {
    const res = await boardsCloud.addMember(currentActingUserId, boardId, userId, addedByName)
    if (!res.ok) return res
    try {
      const boardName = await boardsCloud.getBoardName(boardId)
      const userRow = db().prepare('SELECT email, full_name FROM local_users WHERE id=?').get(userId) as { email: string; full_name: string | null } | undefined

      // In-app notification (local; targets this device's local user id if present)
      createNotification({
        user_id: userId, type: 'board_added',
        title: `You've been added to ${boardName}`,
        body: `You now have access to ${boardName} on Kantor Consulting Hub`,
        actor_name: addedByName,
      })

      // Notification email — FIRE-AND-FORGET. The member row is already written
      // above; the email must never block (or hang) the IPC response. A stalled
      // Gmail SMTP send previously left this handler unsettled forever, sticking
      // the "Adding…" button. We run it detached and, as a backstop, give the
      // transport connection/greeting/socket timeouts so a dead socket can't hang.
      if (userRow?.email) {
        const recipientEmail = userRow.email
        const recipientName = userRow.full_name ?? userRow.email
        void (async () => {
          try {
            const gmailPass = getSetting('gmail_app_password')
            if (!gmailPass) return
            const nodemailer = await import('nodemailer')
            const transporter = nodemailer.default.createTransport({
              service: 'gmail',
              auth: { user: 'kantorconsulting.hub@gmail.com', pass: gmailPass },
              connectionTimeout: 10000,
              greetingTimeout: 10000,
              socketTimeout: 15000,
            })
            await transporter.sendMail({
              from: '"Kantor Consulting Hub" <kantorconsulting.hub@gmail.com>',
              to: recipientEmail,
              subject: `You now have access to ${boardName}`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
                  <h2 style="color:#1a2233">You've been added to ${boardName}</h2>
                  <p style="color:#555">Hi ${recipientName},</p>
                  <p style="color:#555">
                    ${addedByName} has added you to the <strong>${boardName}</strong> board on Kantor Consulting Hub.
                    You now have access to view and manage deliverables on this board.
                  </p>
                  <p style="color:#888;font-size:12px;margin-top:24px">Kantor Consulting Hub</p>
                </div>
              `,
            })
          } catch (emailErr) {
            console.warn('[boardMembers:add] email send failed:', emailErr)
          }
        })()
      }
    } catch (sideErr) {
      console.warn('[boardMembers:add] notification side-effect failed:', sideErr)
    }
    return { ok: true }
  })

  ipcMain.handle('boardMembers:remove', (_e, boardId: string, userId: string) => boardsCloud.removeMember(currentActingUserId, boardId, userId))
  ipcMain.handle('boardMembers:check', (_e, boardId: string, userId: string) => boardsCloud.checkAccess(userId ?? currentActingUserId, boardId))
  ipcMain.handle('boardMembers:taskCount', (_e, boardId: string, userId: string) => boardsCloud.memberTaskCount(boardId, userId))
  ipcMain.handle('boardMembers:listForUser', (_e, userId: string) => boardsCloud.listForUser(userId ?? currentActingUserId))
}

// ── Personal To-Do ─────────────────────────────────────────────────────────

function registerPersonalTodoHandlers() {
  const db = () => getDatabase()

  // NOTE: there is deliberately NO `personalTodo:list` channel. Personal to-dos are
  // read only through `todos:list` (listTodos → readPersonal), the single shaped path
  // that applies parseMissed and coerces booleans. A raw `SELECT *` list channel used
  // to exist here; it was removed because it bypassed that shaping and returned
  // missed_dates as an unparsed string, diverging from the TodoItem contract.

  // ── Dual-write (slice 1b) ────────────────────────────────────────────────
  // Every mutating handler below writes LOCAL FIRST and returns {ok:true} on that
  // basis alone, then hands the cloud write to syncPersonalWrite, which either
  // lands it or queues it. The cloud attempt is deliberately NOT awaited: the
  // handlers keep their existing synchronous signatures (no preload/env.d.ts
  // change, no renderer change) and the UI never waits on a network round-trip.
  // syncPersonalWrite never throws or rejects, so nothing can surface as an
  // unhandled rejection.

  /** Re-read a row and shape it for the cloud, resolving the stable owner email. */
  // Delegates to the CANONICAL builder in cloud/personalSync.ts (shared with the
  // C-recurring-3 missed-occurrence evaluator) so the clobber-critical column list
  // lives in exactly one place. See personalCloudRow for the ⚠ completeness note.
  const cloudRowFor = personalCloudRow

  ipcMain.handle('personalTodo:create', (_e, item: { id: string; user_id: string; title: string; due_date?: string; due_time?: string }) => {
    const ts = nowIso()
    db().prepare('INSERT INTO personal_todos (id, user_id, title, due_date, due_time, updated_at) VALUES (?,?,?,?,?,?)')
      .run(item.id, item.user_id, item.title, item.due_date ?? null, item.due_time ?? null, ts)
    const row = cloudRowFor(item.id)
    if (row) syncPersonalWrite('insert', 'personal_todos', row)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:complete', (_e, id: string) => {
    // Normalize a possibly display-prefixed id ONCE — exactly like every setter
    // below (bareTodoId). complete/uncomplete historically bound the RAW id, so a
    // 'personal-<uuid>' would silently match zero rows and return ok:true having
    // done nothing (the setter zero-match landmine, see comment further down).
    const key = bareTodoId(id)
    // Slice C-recurring-3 GATE: a to-do with un-cleared missed occurrences cannot be
    // completed — the user must clear the misses first (bookkeeping) so completion
    // never silently papers over a skipped cycle. Checked BEFORE any write: no
    // UPDATE, no spawn. The renderer surfaces reason:'missed' as a block.
    {
      const g = db().prepare('SELECT missed_dates FROM personal_todos WHERE id=?').get(key) as { missed_dates: string | null } | undefined
      if (g && g.missed_dates) {
        try {
          const arr = JSON.parse(g.missed_dates)
          if (Array.isArray(arr) && arr.length > 0) return { ok: false, reason: 'missed' as const }
        } catch { /* malformed → treat as no misses, fall through */ }
      }
    }

    const ts = nowIso()

    // Slice C-recurring: completing a RECURRING to-do spawns its next occurrence.
    // The complete-UPDATE and the spawn-INSERT run in ONE transaction so a crash
    // can't leave the old instance done with no successor (or vice-versa). The
    // spawned_successor guard makes this idempotent: complete → revive → complete
    // can never spawn twice, because the first complete set the flag to 1 and
    // revive (below) deliberately does NOT reset it.
    let spawnedId: string | null = null
    db().transaction(() => {
      db().prepare('UPDATE personal_todos SET completed=1, completed_at=?, updated_at=? WHERE id=?').run(ts, ts, key)

      const src = db().prepare(
        'SELECT user_id, title, due_date, due_time, recurrence, series_id, spawned_successor, color, starred FROM personal_todos WHERE id=?'
      ).get(key) as {
        user_id: string; title: string; due_date: string | null; due_time: string | null
        recurrence: string | null; series_id: string | null; spawned_successor: number
        color: string | null; starred: number
      } | undefined

      if (src && src.recurrence && !src.spawned_successor) {
        // First instance seeds the series from its OWN id, so every instance shares it.
        const seriesId = src.series_id ?? key
        const newId = uuid()
        // No due_date ⇒ nothing to roll; the occurrence just carries recurrence forward.
        const newDue = src.due_date ? nextOccurrence(src.due_date, src.recurrence) : null
        // Append at the end, same idiom personal steps/todos use elsewhere.
        const pos = (db().prepare(
          'SELECT COALESCE(MAX(position),-1)+1 AS p FROM personal_todos WHERE user_id=?'
        ).get(src.user_id) as { p: number }).p

        db().prepare(
          `INSERT INTO personal_todos
             (id, user_id, title, due_date, due_time, completed, completed_at,
              position, color, starred, notes, recurrence, recurrence_anchor,
              series_id, spawned_successor, updated_at)
           VALUES (?,?,?,?,?,0,NULL,?,?,?,NULL,?,?,?,0,?)`
        ).run(
          newId, src.user_id, src.title, newDue, src.due_time ?? null,
          pos, src.color ?? null, src.starred ?? 0,
          src.recurrence, 'completion', seriesId, ts
        )
        spawnedId = newId

        // Flag the completed row so a re-complete can't double-spawn, and backfill
        // its series_id if this was the first instance (so both rows share it).
        db().prepare('UPDATE personal_todos SET spawned_successor=1, series_id=?, updated_at=? WHERE id=?')
          .run(seriesId, ts, key)
      }
    })()

    // Cloud after the local transaction commits. No isOnline guard — personal is
    // offline-capable; both writes queue on failure and drain in id order.
    const row = cloudRowFor(key)
    if (row) syncPersonalWrite('update', 'personal_todos', row)
    if (spawnedId) {
      const spawnRow = cloudRowFor(spawnedId)
      if (spawnRow) syncPersonalWrite('insert', 'personal_todos', spawnRow)
    }
    return { ok: true, spawnedId }
  })

  ipcMain.handle('personalTodo:uncomplete', (_e, id: string) => {
    const key = bareTodoId(id)
    db().prepare('UPDATE personal_todos SET completed=0, completed_at=NULL, updated_at=? WHERE id=?').run(nowIso(), key)
    const row = cloudRowFor(key)
    if (row) syncPersonalWrite('update', 'personal_todos', row)
    return { ok: true }
  })

  // ── Detail-panel field setters (slice A-1) ───────────────────────────────
  // Same 1b contract as everything above: LOCAL WRITE FIRST and alone decides
  // {ok:true}; the cloud upsert goes to syncPersonalWrite un-awaited and queues on
  // failure or offline. NO isOnline() guard — personal is the offline-capable
  // source, and guarding it would block the one thing that works offline.
  //
  // All three take the BARE personal_todos.id and strip a stray `personal-` prefix
  // via bareTodoId (defined below, in scope by the time any handler fires). An
  // unstripped id matches zero rows: UPDATE would report 0 changes, cloudRowFor
  // would return null, and the write would vanish without an error — the same
  // silent shape as the 3b step landmine.

  ipcMain.handle('personalTodo:setColor', (_e, id: string, color: string | null) => {
    const key = bareTodoId(id)
    // Validation lives in the renderer (isTodoColorKey); main stores what it is
    // given so a future palette addition needs no main-process change. NULL clears.
    db().prepare('UPDATE personal_todos SET color=?, updated_at=? WHERE id=?')
      .run(color ?? null, nowIso(), key)
    const row = cloudRowFor(key)
    if (row) syncPersonalWrite('update', 'personal_todos', row)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:setStar', (_e, id: string, starred: boolean) => {
    const key = bareTodoId(id)
    // Coerced at the boundary: the column is INTEGER NOT NULL, and SQLite would
    // otherwise bind a JS boolean as a type better-sqlite3 rejects outright.
    db().prepare('UPDATE personal_todos SET starred=?, updated_at=? WHERE id=?')
      .run(starred ? 1 : 0, nowIso(), key)
    const row = cloudRowFor(key)
    if (row) syncPersonalWrite('update', 'personal_todos', row)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:setRecurrence', (_e, id: string, freq: string | null) => {
    // Slice C-recurring-2. Verbatim setColor clone. Validation lives renderer-side
    // (against RECUR_LABELS); main stores what it is given, NULL = non-recurring.
    // Deliberately does NOT touch series_id (the spawn seeds it via `?? id` on first
    // completion) or spawned_successor. `recurrence` is already in cloudRowFor.
    const key = bareTodoId(id)
    db().prepare('UPDATE personal_todos SET recurrence=?, updated_at=? WHERE id=?')
      .run(freq ?? null, nowIso(), key)
    const row = cloudRowFor(key)
    if (row) syncPersonalWrite('update', 'personal_todos', row)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:clearMissed', (_e, id: string, date: string) => {
    // Slice C-recurring-3. BOOKKEEPING ONLY — removes one date from missed_dates so
    // the completion gate can pass. MUST NOT spawn, and MUST NOT touch due_date /
    // spawned_successor / series_id: it is a pure array edit on the setColor shape.
    const key = bareTodoId(id)
    const cur = db().prepare('SELECT missed_dates FROM personal_todos WHERE id=?').get(key) as { missed_dates: string | null } | undefined
    let arr: string[] = []
    if (cur && cur.missed_dates) {
      try { const v = JSON.parse(cur.missed_dates); if (Array.isArray(v)) arr = v.filter((x): x is string => typeof x === 'string') } catch { arr = [] }
    }
    const next = arr.filter(d => d !== date)
    // Empty → NULL so "cleared" and "never missed" read identically downstream.
    const value = next.length ? JSON.stringify(next) : null
    db().prepare('UPDATE personal_todos SET missed_dates=?, updated_at=? WHERE id=?')
      .run(value, nowIso(), key)
    const row = cloudRowFor(key)
    if (row) syncPersonalWrite('update', 'personal_todos', row)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:setDue', (_e, id: string, dueDate: string | null, dueTime: string | null) => {
    const key = bareTodoId(id)
    // BOTH fields are written on every call, so clearing a date is a real write of
    // NULL rather than an omission. due_time without due_date is meaningless, so a
    // null date drops the time with it — otherwise an orphan "14:30, no day" would
    // survive and the urgency banding (3a, CET-anchored) has no date to rank on.
    const date = dueDate ?? null
    const time = date === null ? null : (dueTime ?? null)
    db().prepare('UPDATE personal_todos SET due_date=?, due_time=?, updated_at=? WHERE id=?')
      .run(date, time, nowIso(), key)
    const row = cloudRowFor(key)
    if (row) syncPersonalWrite('update', 'personal_todos', row)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:setNotes', (_e, id: string, notes: string | null) => {
    // Slice B. Free-text notes, mirroring setColor exactly. Empty string is stored
    // as NULL so "cleared" and "never had notes" read the same downstream.
    const key = bareTodoId(id)
    const value = notes && notes.length ? notes : null
    db().prepare('UPDATE personal_todos SET notes=?, updated_at=? WHERE id=?')
      .run(value, nowIso(), key)
    const row = cloudRowFor(key)
    if (row) syncPersonalWrite('update', 'personal_todos', row)
    return { ok: true }
  })

  ipcMain.handle('personalTodo:delete', (_e, id: string) => {
    // Order is safe either way here: a delete payload needs only the id, which is a
    // parameter — unlike the update paths it never re-reads the (now gone) local row,
    // and it needs no owner resolution because the cloud PK is the id alone.
    db().prepare('DELETE FROM personal_todos WHERE id=?').run(id)
    syncPersonalWrite('delete', 'personal_todos', { id })
    // Steps are FK-less by design (cloud SQL:20 — so the queue may upload a step
    // before its parent). That means NOTHING cascades: without this, deleting a
    // to-do would strand its steps locally AND in cloud forever.
    const orphans = db().prepare('SELECT id FROM personal_todo_steps WHERE todo_id=?')
      .all(id) as { id: string }[]
    if (orphans.length) {
      db().prepare('DELETE FROM personal_todo_steps WHERE todo_id=?').run(id)
      for (const o of orphans) syncPersonalWrite('delete', 'personal_todo_steps', { id: o.id })
    }
    return { ok: true }
  })

  // ── Personal to-do STEPS (slice 3b) ──────────────────────────────────────
  // Same local-first contract as the to-do handlers above: the local write lands
  // FIRST and alone decides {ok:true}; the cloud write is handed to
  // syncPersonalWrite un-awaited and queues on failure or offline. NO isOnline()
  // guard — personal is the offline-capable source, and the 1b lesson was that
  // guarding a personal write blocks the one thing that does work offline.
  //
  // ⚠ EVERY todoId PARAMETER HERE IS THE BARE `personal_todos.id`. `todos:list`
  // emits a DISPLAY id (`personal-<uuid>`); passing that through would write steps
  // whose todo_id matches no row. There is no FK locally or in cloud, so nothing
  // would error — the steps would simply never be read again. The renderer sends
  // `raw_id`; this strip is the second line of defence, not the first.
  const bareTodoId = (id: string): string => id.replace(/^personal-/, '')

  /**
   * Resolve the owner email for a step, via its PARENT to-do.
   *
   * `personal_todo_steps.user_email` is NOT NULL (db.ts:709) — unlike
   * `personal_todos`, which is user_id-keyed locally and only translates at the
   * cloud boundary. So an unresolvable owner cannot be handled the way
   * `cloudRowFor` handles it (skip the cloud write, keep the local row); the LOCAL
   * insert itself would violate the constraint. Resolve up front and refuse
   * loudly rather than throwing a constraint error from inside SQLite.
   */
  function stepOwnerEmail(todoId: string): string {
    const r = db().prepare('SELECT user_id FROM personal_todos WHERE id=?').get(todoId) as
      { user_id?: string } | undefined
    if (!r) return ''
    return ownerEmail(r.user_id)
  }

  /** Re-read a step and shape it for cloud. Mirrors cloudRowFor's contract. */
  function stepCloudRow(stepId: string): Record<string, unknown> | null {
    const r = db().prepare(
      'SELECT id, todo_id, user_email, text, checked, position, created_at, updated_at FROM personal_todo_steps WHERE id=?'
    ).get(stepId) as Record<string, unknown> | undefined
    if (!r) return null
    return {
      id: r.id, todo_id: r.todo_id, user_email: r.user_email, text: r.text,
      checked: r.checked ?? 0, position: r.position ?? 0,
      created_at: r.created_at ?? nowIso(), updated_at: r.updated_at ?? nowIso(),
    }
  }

  ipcMain.handle('personalTodoStep:create', (_e, todoId: string, text: string) => {
    const parent = bareTodoId(todoId)
    const body = (text ?? '').trim()
    if (!body) return { ok: false, error: 'empty step' }

    const email = stepOwnerEmail(parent)
    if (!email) {
      console.warn(`[personalSync] REFUSED step create for todo ${parent} — no resolvable owner email.`)
      return { ok: false, error: 'unresolvable owner' }
    }

    const id = uuid()
    const ts = nowIso()
    // Append at the end. COALESCE covers the nullable-position column: a NULL max
    // (no steps yet) must start at 0, not NaN.
    const maxPos = (db().prepare(
      'SELECT COALESCE(MAX(position), -1) AS m FROM personal_todo_steps WHERE todo_id=?'
    ).get(parent) as { m: number }).m
    db().prepare(
      'INSERT INTO personal_todo_steps (id, todo_id, user_email, text, checked, position, created_at, updated_at) VALUES (?,?,?,?,0,?,?,?)'
    ).run(id, parent, email, body, maxPos + 1, ts, ts)

    const row = stepCloudRow(id)
    if (row) syncPersonalWrite('insert', 'personal_todo_steps', row)
    return { ok: true, id }
  })

  ipcMain.handle('personalTodoStep:toggle', (_e, stepId: string) => {
    // Flip in SQL rather than read-modify-write: two rapid clicks can otherwise
    // both read the same value and write the same result, eating one toggle.
    const res = db().prepare(
      'UPDATE personal_todo_steps SET checked = CASE WHEN checked=1 THEN 0 ELSE 1 END, updated_at=? WHERE id=?'
    ).run(nowIso(), stepId)
    if (!res.changes) return { ok: false, error: 'no such step' }
    const row = stepCloudRow(stepId)   // re-read AFTER the update, before it can move
    if (row) syncPersonalWrite('update', 'personal_todo_steps', row)
    return { ok: true }
  })

  ipcMain.handle('personalTodoStep:delete', (_e, stepId: string) => {
    // Delete needs only the id for the cloud op (PK is the id alone), so unlike
    // toggle it is safe to enqueue after the local row is gone.
    db().prepare('DELETE FROM personal_todo_steps WHERE id=?').run(stepId)
    syncPersonalWrite('delete', 'personal_todo_steps', { id: stepId })
    return { ok: true }
  })

  // REORDER (slice A-3). DENSE-REWRITE-ALL: position becomes the array index 0..n-1,
  // which also self-heals the sparse/gappy positions 3b left behind (append-only
  // MAX(position)+1 never reclaims a deleted slot). Same ordered-id-array shape as
  // boards.reorder / workspace:reorderColumns (ipc:1030/1043).
  ipcMain.handle('personalTodoStep:reorder', (_e, todoId: string, orderedStepIds: string[]) => {
    const parent = bareTodoId(todoId)
    const ids = Array.isArray(orderedStepIds) ? orderedStepIds : []
    if (!ids.length) return { ok: true }
    const ts = nowIso()

    // ONE transaction. The `AND todo_id=?` guard means a stray or foreign id can only
    // no-op (0 changes), never reposition another to-do's step — there is no FK to
    // catch that otherwise.
    const stmt = db().prepare(
      'UPDATE personal_todo_steps SET position=?, updated_at=? WHERE id=? AND todo_id=?'
    )
    db().transaction((list: string[]) => {
      list.forEach((id, i) => stmt.run(i, ts, id, parent))
    })(ids)

    // One cloud update per row, un-awaited (the 1b pattern) — stepCloudRow re-reads
    // the now-dense position. NO isOnline() guard: personal is the offline-capable
    // source and the queue drains on reconnect.
    for (const id of ids) {
      const row = stepCloudRow(id)
      if (row) syncPersonalWrite('update', 'personal_todo_steps', row)
    }
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
          // Assignees are EMAILS as of 1c-2b-①, so notifications.user_id now holds
          // emails on this path while older rows still hold device ids — the table
          // is MIXED-FORMAT and stays that way until it moves to cloud (a slice-5
          // prerequisite, since a directive notification currently never leaves the
          // assigner's machine). The 'local-admin' fallback is unchanged.
          const assigneeEmails = parseAssignees(t.assignees_json)
          const notifyUsers = assigneeEmails.length > 0 ? assigneeEmails : ['local-admin']

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

// ── Permissions ────────────────────────────────────────────────────────────

function registerPermissionsHandlers() {
  // Return the acting user's root status + granted permission keys.
  // Called by renderer on login and whenever permissions:invalidate fires.
  ipcMain.handle('permissions:getMine', async () => {
    const actor = await boardsCloud.resolveActor(currentActingUserId)
    if (actor.isRoot) {
      return { isRoot: true, keys: Object.values(PERMISSION_KEYS) as string[] }
    }
    const { data } = await cloud.from('member_permissions').select('permission_key').eq('user_email', actor.email)
    const keys = ((data ?? []) as { permission_key: string }[]).map(r => r.permission_key)
    return { isRoot: false, keys }
  })

  // Return all granted permissions (root-only; for the admin panel UI).
  ipcMain.handle('permissions:getAll', async () => {
    const actor = await boardsCloud.resolveActor(currentActingUserId)
    if (!actor.isRoot) return []
    const { data } = await cloud.from('member_permissions').select('*').order('granted_at', { ascending: true })
    return (data ?? []) as { user_email: string; permission_key: string; granted_by: string; granted_at: string }[]
  })

  // Grant or revoke a permission toggle. Root-only; verified in main.
  ipcMain.handle('permissions:set', async (_e, params: { userEmail: string; key: string; on: boolean }) => {
    const actor = await boardsCloud.resolveActor(currentActingUserId)
    if (!actor.isRoot) return { ok: false, error: 'Only root can set permissions.' }
    const { userEmail, key, on } = params
    const validKeys = Object.values(PERMISSION_KEYS) as string[]
    if (!validKeys.includes(key)) return { ok: false, error: `Unknown permission key: ${key}` }
    if (on) {
      const { error } = await cloud.from('member_permissions').upsert(
        { user_email: userEmail, permission_key: key, granted_by: actor.email, granted_at: new Date().toISOString() },
        { onConflict: 'user_email,permission_key', ignoreDuplicates: false }
      )
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await cloud.from('member_permissions')
        .delete().eq('user_email', userEmail).eq('permission_key', key)
      if (error) return { ok: false, error: error.message }
    }
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
  registerBoardsCloudHandlers()
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
  registerTodosHandlers()
  registerPersonalTodoHandlers()
  registerNotificationSchedulerHandlers()
  startNotificationScheduler()
  startTrashAutoDelete()
  registerIntelligenceHandlers()
  registerInfoPageHandlers()
  registerPermissionsHandlers()
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

// ── NewsAPI fetch (DISABLED — Supabase cs_articles is now primary source) ───
// Set ENABLE_NEWSAPI = true to re-enable the English-only NewsAPI fetch.
// The code is fully preserved and will work again when the flag is flipped.
const ENABLE_NEWSAPI = false

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

// Classify a single article.
// Returns GateResult on success, or { error: string } on any failure so the
// caller can write a tombstone (gate_processed=1, relevance_score NULL) instead
// of leaving the row at gate_processed=0 and retrying forever.
async function gateClassifyArticle(
  article: { title?: string | null; snippet?: string | null; source?: string | null },
  apiKey: string
): Promise<GateResult | { error: string }> {
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
    if (!jsonMatch) return { error: 'no JSON in response' }
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
    return { error: String((e as Error)?.message || e).slice(0, 200) }
  }
}

// Score a capped batch of articles that haven't been through the gate yet.
// Writes proposals with geography_confirmed left at 0 (AI proposal). A geography
// the human already confirmed (geography_confirmed=1) is never overwritten.
// FAIL-OPEN per row; never throws.
async function classifyUnscoredArticles(limit = GATE_MAX_PER_RUN): Promise<number> {
  // RMW → cloud-only: reads unscored rows from CLOUD, writes scores to CLOUD (+ mirror
  // re-sync) via intel helpers. FAIL-OPEN per row; never throws. Offline / no-key → 0.
  if (!isOnline()) {
    console.log('[Gate] Offline — skipping relevance gate (fail-open).')
    return 0
  }
  const apiKey = getGlobalAnthropicKey()
  if (!apiKey) {
    console.log('[Gate] No Anthropic API key set — skipping relevance gate (fail-open).')
    return 0
  }
  const rows = await intelCloud.getUnscoredForGate(limit)
  let scored = 0
  let failed = 0
  for (const row of rows) {
    const result = await gateClassifyArticle(
      { title: row.title, snippet: row.snippet || row.content?.slice(0, 300) || '', source: row.source_name },
      apiKey
    )
    if ('error' in result) {
      // Permanent failure: write a tombstone so this row is never retried.
      // relevance_score stays NULL (distinguishable via gate_processed=1 + NULL score).
      const reason = `gate failed: ${result.error}`.slice(0, 300)
      console.warn('[Gate] row failed — tombstoning:', row.id, reason)
      const t = await intelCloud.tombstoneGate(row.id, reason)
      if (!t.ok) console.warn('[Gate] could not write tombstone for', row.id, t.error)
      failed++
      continue
    }
    const w = await intelCloud.applyGateResult(row.id, {
      relevance_score: result.relevance_score, relevance_type: result.relevance_type,
      reasoning: result.reasoning, geography: result.geography, region: result.region,
    })
    if (w.ok) scored++
    else console.warn('[Gate] could not persist score for', row.id, w.error)
  }
  if (scored || failed) console.log(`[Gate] Scored ${scored} article(s), tombstoned ${failed} permanently-failed article(s).`)
  return scored
}

// ── Supabase → local sync helpers ─────────────────────────────────────────

// Map cs_articles primary_category values to the app's category strings.
const PIPELINE_CATEGORY_MAP: Record<string, string> = {
  criminal_vnsa:       'Criminal & VNSA Activity',
  offensive_use:       'Incident',
  defensive_systems:   'Counter-drone / C-UAS',
  military_investment: 'Investment & Procurement',
  private_investment:  'Investment & Procurement',
  new_technology:      'Innovation & Technology',
  policy_regulation:   'Policy & Regulation',
  military_activity:   'State Military Activity',
  finance_sanctions:   'Finance & Sanctions',
  extra_regional:      'Extra-regional Supplier',
}

// Infer the article's language from its title and source domain.
// Simple heuristic: Portuguese if Brazilian domain or pt-keywords; Spanish if
// Spanish-language outlet domain or es-keywords; null if unsure (leaves badge blank).
function inferLanguage(title: string | null, url: string | null): 'es' | 'pt' | 'en' | null {
  const txt = `${title || ''} ${url || ''}`.toLowerCase()
  const PT_SIGNALS = ['.br/', '.br"', 'globo.com', 'r7.com', 'uol.com', 'folha.uol', 'estadao', 'defesanet',
    'polícia', 'policia', 'adolescente', 'brasileiro', 'avanço', 'eficiência', 'reforça', 'adota', 'atingido']
  const ES_SIGNALS = ['eltiempo.com', 'elespectador.com', 'aristeguinoticias', 'lafm.com.co', '.mx/',
    'record.com.mx', 'eldiariodechihuahua', 'semana.com', 'caracol', 'infobae', 'elpais.com',
    'infodefensa', 'defensa.com', 'zona-militar', 'dron ', 'drones ', 'guerrilla', 'concejal',
    'ejército', 'ejercito', 'ministro de defensa', 'prohibid', 'alistan', 'colombian', 'colombia ']
  if (PT_SIGNALS.some(s => txt.includes(s))) return 'pt'
  if (ES_SIGNALS.some(s => txt.includes(s))) return 'es'
  return null
}

// The GDELT/cs_articles pipeline is single-project (LATAM) by design; cs_articles
// carries no project column, so the writer must supply the board id from a constant.
// This makes the previously-implicit mapping EXPLICIT — without it, pipeline rows
// land in cloud with project_board_id=NULL and the membership gate (0a-2) hides
// them from every non-root user (SQL IN never matches NULL). Phase 2 multi-project
// pipelines will need this to come from board_config or a cs_articles column.
const CONTESTED_SKIES_BOARD_ID = 'board-info-latam'

// Pull unimported rows from cs_articles, map pipeline analysis fields to local
// intelligence_sources schema, and mark each successfully inserted row as
// imported_to_hub=true in Supabase. This is the SHARED function used by both
// the manual "Sync now" button and the automatic refresh flow.
// IMPORTANT: imported rows arrive with gate_processed=1 — the local relevance
// gate DOES NOT run on them (they are already scored by the GDELT pipeline).
async function syncFromContestedSkies(): Promise<{ imported: number; skipped: number; total: number }> {
  const { data: rows, error } = await supabaseAdmin
    .from('cs_articles')
    .select('*')
    .eq('imported_to_hub', false)

  if (error) {
    console.warn('[Sync] cs_articles fetch failed:', error.message)
    return { imported: 0, skipped: 0, total: 0 }
  }
  if (!rows || rows.length === 0) {
    console.log('[Sync] cs_articles: no new articles to import')
    return { imported: 0, skipped: 0, total: 0 }
  }

  const { randomUUID } = require('crypto') as typeof import('crypto')

  let skipped = 0
  // Build the candidate rows (identical field mapping to the old local INSERT),
  // then hand them to intel.insertPipelineArticles which upserts into CLOUD
  // (ignore-on-url, so it stays idempotent like INSERT OR IGNORE) and mirrors the
  // rows that were actually inserted. Cloud-authoritative: pipeline rows land in
  // cloud first, mirror second.
  const candidates: Record<string, unknown>[] = []
  for (const row of rows) {
    const url: string | null = row.url || null
    if (!url) { skipped++; continue }

    // Parse the GDELT pipeline's Claude analysis blob.
    let analysis: Record<string, unknown> = {}
    try { analysis = JSON.parse(row.claude_analysis || '{}') } catch { /* leave empty */ }

    const title: string | null = row.title || null
    const snippet: string | null =
      (analysis.summary as string | undefined) || row.content_snippet || null
    const content: string | null = row.content_snippet || null
    const sourceName: string | null = row.source_name || null
    const publishedAt: string | null = row.published_at || null

    // confidence: prefer pipeline's claude_analysis suggestion, fallback 'medium'
    const confSuggestion = String(analysis.confidence_suggestion ?? '').toLowerCase()
    const confidence: 'high' | 'medium' | 'low' =
      confSuggestion === 'high' ? 'high' : confSuggestion === 'low' ? 'low' : 'medium'

    // categories: pipeline primary_category → mapped label + autoDetect supplement
    const pipelineCat = PIPELINE_CATEGORY_MAP[String(row.primary_category ?? '')] || null
    const autoCats = autoDetectCategories(`${title || ''} ${snippet || ''}`)
    const allCats = [...new Set([...(pipelineCat ? [pipelineCat] : []), ...autoCats])].slice(0, 3)

    // geography: first country from pipeline's countries array
    const countries: string[] = Array.isArray(analysis.countries) ? analysis.countries as string[] : []
    const geography: string | null = countries[0] || null

    // relevance_score: directly from pipeline (already Claude-scored, 0-10)
    const rawScore = Number(analysis.relevance_score)
    const relevanceScore: number | null = Number.isFinite(rawScore) ? rawScore : null

    // language: inferred (cs_articles has no language column)
    const language = inferLanguage(title, url)

    candidates.push({
      id: randomUUID(), type: 'article', title, snippet, content, url,
      source_name: sourceName, published_at: publishedAt, status: 'unreviewed',
      confidence, categories_json: JSON.stringify(allCats),
      geography, region: geography, relevance_score: relevanceScore,
      gate_processed: 1, language, added_by_name: 'Contested Skies Pipeline',
      project_board_id: CONTESTED_SKIES_BOARD_ID,   // single-project pipeline; stamp explicitly (0a-1b)
    })
  }

  const { inserted } = await intelCloud.insertPipelineArticles(candidates)
  const imported = inserted.length
  skipped += candidates.length - imported   // url already present → ignored by upsert
  const importedUrls = inserted.map((r) => String(r.url)).filter(Boolean)

  // Mark the successfully inserted rows as imported in Supabase so they aren't
  // re-pulled next sync. Fire-and-forget: a Supabase failure here is non-fatal
  // because INSERT OR IGNORE will de-dup them on the next sync anyway.
  if (importedUrls.length > 0) {
    try {
      const { error: updErr } = await supabaseAdmin
        .from('cs_articles')
        .update({ imported_to_hub: true, imported_at: new Date().toISOString() })
        .in('url', importedUrls)
      if (updErr) console.warn('[Sync] imported_to_hub update failed:', updErr.message)
    } catch (e) {
      console.warn('[Sync] imported_to_hub update threw:', (e as Error)?.message)
    }
  }

  console.log(`[Sync] cs_articles → local: ${imported} imported, ${skipped} skipped (already in DB), ${rows.length} total checked`)
  return { imported, skipped, total: rows.length }
}

async function fetchAndStoreNews(): Promise<number> {
  // ── Primary source: Supabase cs_articles (GDELT pipeline, bilingual LATAM) ──
  let stored = 0
  try {
    const { imported } = await syncFromContestedSkies()
    stored += imported
  } catch (e) {
    console.warn('[Sync] Supabase sync failed (fail-open):', (e as Error)?.message)
  }

  // ── Secondary source: NewsAPI (English-only — DISABLED, flag ENABLE_NEWSAPI) ──
  // Set ENABLE_NEWSAPI = true at the top of this file to re-enable.
  if (ENABLE_NEWSAPI) {
    const apiKey = process.env.NEWSAPI_KEY
    const db = getDatabase()
    if (!apiKey) {
      console.log('[Intelligence] NEWSAPI_KEY not set, skipping NewsAPI fetch')
    } else {
      for (const q of NEWS_QUERIES) {
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
                  (id, type, title, snippet, url, source_name, published_at, confidence, categories_json, image_url, project_board_id)
                VALUES (?, 'article', ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                randomUUID(), article.title, snippet, article.url,
                article.source?.name || '', article.publishedAt,
                confidence, JSON.stringify(categories), article.urlToImage || null,
                CONTESTED_SKIES_BOARD_ID   // 0a-1b: stamp the latent NewsAPI writer too (disabled, local-only)
              )
              stored++
            } catch { /* duplicate URL — skip */ }
          }
        } catch (e) {
          console.warn('[Intelligence] NewsAPI query error:', e)
        }
      }
      console.log(`[Intelligence] NewsAPI fetched ${stored} new articles`)
    }
  }

  // Relevance gate: score any rows that still have gate_processed=0.
  // Pipeline rows arrive with gate_processed=1 and are SKIPPED by this —
  // they are already scored and must not be re-gated.
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
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
}
function sourceMatchesKeywords(src: Record<string, unknown>, keywords: string[]): boolean {
  if (!keywords.length) return false
  const haystack = [
    src.title, src.snippet, src.content, src.source_name,
    src.location_mentioned, src.actors_mentioned, src.handle, src.file_name,
  ].filter(Boolean).join(' ').toLowerCase()
  if (!haystack) return false
  // Boundary-anchored match (not naked substring): short keywords like "ice" must
  // match the standalone word, not "office"/"police". Internal spaces/hyphens/
  // digits in phrases ("anti-drone systems", "h-1b", "title 42") stay literal.
  return keywords.some(k => new RegExp('(?:^|[^a-z0-9])' + escapeRegex(k) + '(?:[^a-z0-9]|$)').test(haystack))
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
export function resolveAnthropicKey(userId?: string): string | undefined {
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
  const admin = db.prepare("SELECT id FROM local_users WHERE LOWER(email)=?").get(CLOUD_ADMIN_EMAIL) as { id: string } | undefined
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
// ── Info-page source pipeline ─────────────────────────────────────────────
// Normalize a board name to the same format stored in disposition_tags.
// "LATAM drone monitor" → "latam-drone-monitor"
function normalizeBoardName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

// When an article is approved, create info_page_sources rows (stage='new') for
// every PIPELINE info-page whose project (board) appears in the article's
// disposition_tags. The Source Intelligence project selector stores the board's
// raw display name (e.g. "LATAM Drone Threat"), so we match on that first, with
// id / normalized-name fallbacks for robustness. INSERT OR IGNORE prevents
// duplicates on re-approve. Scoped to pipeline pages so only the LATAM drone
// monitor (the sole pipeline page) collects sources.
function addToInfoPagePipeline(sourceId: string): void {
  const db = getDatabase()
  const src = db.prepare('SELECT disposition_tags FROM intelligence_sources WHERE id=?').get(sourceId) as { disposition_tags: string | null } | undefined
  if (!src) return
  let tags: string[] = []
  try { tags = JSON.parse(src.disposition_tags || '[]') } catch { return }
  if (!tags.length) return

  const boards = db.prepare("SELECT id, name, board_config FROM workspace_boards WHERE board_type='info-page' AND archived=0").all() as { id: string; name: string; board_config: string | null }[]
  const now = new Date().toISOString()

  for (const board of boards) {
    // Only pipeline-enabled info pages collect a committable source library.
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(board.board_config || '{}') } catch { cfg = {} }
    if (!cfg.pipeline) continue
    // Match disposition_tags against the board's display name (what the project
    // selector persists), falling back to id and normalized name.
    const matches = tags.includes(board.name) || tags.includes(board.id) || tags.includes(normalizeBoardName(board.name))
    if (!matches) continue
    try {
      const r = db.prepare(
        'INSERT OR IGNORE INTO info_page_sources (article_id, info_page, stage, added_at) VALUES (?,?,?,?)'
      ).run(sourceId, board.id, 'new', now)
      if (r.changes > 0) {
        db.prepare(
          'INSERT INTO info_page_changes (article_id, info_page, from_stage, to_stage, created_at) VALUES (?,?,NULL,?,?)'
        ).run(sourceId, board.id, 'new', now)
      }
    } catch (e) {
      console.warn('[Pipeline] addToInfoPagePipeline failed for', sourceId, board.id, (e as Error)?.message)
    }
  }
}

// 3c: route an intel source into a project's "New sources" (info_page_sources,
// stage='new'), keyed by the RELIABLE board id (project_board_id). Type-agnostic —
// any intel type works, so 3d's compose "Send" reuses this. The routed row is a
// durable pointer: article_id links back to the intel row (content/analysis/notes
// stay LIVE via that reference — no copy — so the item remains editable and
// move-back-able); source_type is denormalized for display. Idempotent via
// UNIQUE(article_id, info_page) + INSERT OR IGNORE — re-approving never duplicates
// or resets a row already at new/review/committed. Returns the target page name.
async function routeToNewSources(
  intelSourceId: string,
  boardId: string | null | undefined,
): Promise<{ ok: boolean; id?: number; pageName?: string; error?: string }> {
  const db = getDatabase()
  const bid = (boardId ?? '').trim()
  if (!bid) return { ok: false, error: 'No project assigned to this source.' }
  // 0a-4: gate the TARGET page write on membership — the write-side sibling of 0a-3.
  // Placed here so it covers all three intelligence:* callers (updateStatus,
  // routeToProject, confirmImported) in one spot.
  if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, bid))) {
    console.warn(`[0a-4] deny routeToNewSources — actor=${currentActingUserId} pageId=${bid} sourceId=${intelSourceId}`)
    return { ok: false, error: 'Not authorized' }
  }
  const src = db.prepare('SELECT id, type FROM intelligence_sources WHERE id=?').get(intelSourceId) as { id: string; type: string } | undefined
  if (!src) return { ok: false, error: 'Source not found.' }
  const board = db.prepare("SELECT name FROM workspace_boards WHERE id=? AND board_type='info-page'").get(bid) as { name?: string } | undefined
  const now = new Date().toISOString()
  const r = db.prepare(
    "INSERT OR IGNORE INTO info_page_sources (article_id, info_page, stage, source_type, added_at) VALUES (?,?,'new',?,?)"
  ).run(intelSourceId, bid, src.type, now)
  if (r.changes > 0) {
    db.prepare(
      "INSERT INTO info_page_changes (article_id, info_page, from_stage, to_stage, created_at) VALUES (?,?,NULL,'new',?)"
    ).run(intelSourceId, bid, now)
  }
  const row = db.prepare('SELECT id FROM info_page_sources WHERE article_id=? AND info_page=?').get(intelSourceId, bid) as { id: number } | undefined
  return { ok: true, id: row?.id, pageName: board?.name ?? bid }
}

// Retired in 3c: keyword-match fan-out into info_page_items (replaced by
// routeToNewSources' reliable board-id routing). Kept defined but no longer called.
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

  // Cloud-first (mirror-fallback, sync-on-read). Channel/args/return shape unchanged.
  ipcMain.handle('intelligence:getSources', (_e, params: {
    type?: string; status?: string; confidence?: string;
    category?: string; search?: string; limit?: number; offset?: number; project?: string; excludeStatus?: string
  } = {}) => intelCloud.getSources(params, currentActingUserId))

  // Exact total for the same query (drives each tab's "Showing X of Y" + Load-more gate).
  ipcMain.handle('intelligence:getSourcesCount', (_e, params: {
    type?: string; status?: string; confidence?: string;
    category?: string; search?: string; project?: string; excludeStatus?: string
  } = {}) => intelCloud.getSourcesCount(params, currentActingUserId))

  ipcMain.handle('intelligence:getUnreviewedCount', () => intelCloud.getUnreviewedCount(currentActingUserId))

  // Mark a news article as a duplicate. Removes it from the review queue WITHOUT any
  // learning signal (no verdict to cs_articles, no decision log) - a duplicate is
  // relevant-but-redundant, not a relevance rejection. Optionally links to the original.
  // RMW → cloud-only (intel.markDuplicate). Offline → { ok:false, error }.
  ipcMain.handle('intelligence:markDuplicate', (_e, id: string, duplicateOf: string | null) =>
    intelCloud.markDuplicate(id, duplicateOf))

  // "Make unreviewed" (News undo for a saved article): pure status flip back to the queue.
  // Deliberately NOT via updateStatus — no verdict push, no routing, no decision log, and it
  // clears the review stamp. Cloud-only. Offline → { ok:false }.
  ipcMain.handle('intelligence:revertToUnreviewed', (_e, id: string) =>
    intelCloud.revertToUnreviewed(id))

  // RMW → cloud-only. The cloud write derives queue_section from categories_json
  // read from CLOUD; routing (local info_page_sources) and the cs_articles verdict
  // write-back stay HERE. On the approve path, intel.updateStatus returns the
  // project_board_id + url it read from cloud so we don't re-read the mirror.
  ipcMain.handle('intelligence:updateStatus', async (_e, id: string, status: string, notes?: string, reviewedById?: string, reviewedByName?: string) => {
    const res = await intelCloud.updateStatus(id, status, notes, reviewedById, reviewedByName)
    if (!res.ok) return res
    if (status === 'approved') {
      // 3c: route this approved source into its project's "New sources"
      // (info_page_sources, stage='new') by its reliable board id (project_board_id).
      let addedToPages: string[] = []
      try {
        const routed = await routeToNewSources(id, res.projectBoardId)
        if (routed.ok && routed.pageName) addedToPages = [routed.pageName]
        else if (!routed.ok) console.warn('[3c] routeToNewSources skipped:', routed.error)
      } catch (e) { console.warn('[3c] routing failed', e) }
      void pushVerdictToSupabase(res.url, status, reviewedByName)
      return { ok: true, addedToPages }
    }
    // Learning loop: mirror approve/reject up to Supabase (fire-and-forget).
    void pushVerdictToSupabase(res.url, status, reviewedByName)
    return { ok: true }
  })

  // Pipeline counters. `pending` (intel) is cloud-first; `sentToPages` reads the
  // LOCAL info_page_items table (not migrated) and stays local.
  ipcMain.handle('intelligence:getPipelineStats', async (_e, project?: string) => {
    const pending = await intelCloud.getPipelinePending(currentActingUserId, project)
    const sentToPages = (db().prepare("SELECT COUNT(DISTINCT origin_source_id) as c FROM info_page_items WHERE sub_type='intelligence_source' AND origin_source_id IS NOT NULL").get() as { c: number }).c
    return { pending, sentToPages }
  })

  // Phase 3: live queue counts for the News Articles filter bar. Cloud-first.
  ipcMain.handle('intelligence:getStatusCounts', (_e, project?: string) => intelCloud.getStatusCounts(currentActingUserId, project))

  // Count articles still waiting for gate scoring (gate_processed=0 or NULL).
  // Excludes 'Kantor Framework' rows — same filter as classifyUnscoredArticles —
  // so authoritative fixed references never inflate the counter. Cloud-first.
  ipcMain.handle('intelligence:getUnscoredCount', () => intelCloud.getUnscoredCount(currentActingUserId))

  // Re-score the backlog of unscored articles using the same gate path.
  // Runs the existing classifyUnscoredArticles() in sequential batches of 10
  // so cost and rate-limit exposure are bounded. Progress is logged after each batch.
  // Returns totals: { processed, relevant, failed, remaining }.
  // RMW → cloud-only: reads unscored rows from CLOUD, writes scores to CLOUD (+ mirror
  // re-sync) via intel helpers. The AI loop stays here. Offline → { ok:false } (the gate
  // needs cloud + the Anthropic API anyway; the commit-2 lockout also disables the button).
  ipcMain.handle('intelligence:rescoreUnscored', async () => {
    const BATCH = 10
    let totalProcessed = 0
    let totalRelevant = 0
    let totalFailed = 0

    if (!isOnline()) return { ok: false, error: 'Unavailable while offline', processed: 0, relevant: 0, failed: 0, remaining: 0 }
    const apiKey = getGlobalAnthropicKey()
    if (!apiKey) return { ok: false, error: 'No Anthropic API key configured', processed: 0, relevant: 0, failed: 0, remaining: 0 }

    // Count total unscored before starting (cloud-first)
    const totalUnscored = await intelCloud.getUnscoredCount()
    console.log(`[Gate:rescore] Starting — ${totalUnscored} unscored article(s) to process in batches of ${BATCH}`)

    // Process until no unscored rows remain
    while (true) {
      const rows = await intelCloud.getUnscoredForGate(BATCH)
      if (rows.length === 0) break

      let batchProcessed = 0
      let batchRelevant = 0
      let batchFailed = 0

      for (const row of rows) {
        try {
          const result = await gateClassifyArticle(
            { title: row.title, snippet: row.snippet || row.content?.slice(0, 300) || '', source: row.source_name },
            apiKey
          )
          if ('error' in result) {
            // Permanent failure: tombstone so it's never retried.
            const reason = `gate failed: ${result.error}`.slice(0, 300)
            await intelCloud.tombstoneGate(row.id, reason)
            batchFailed++
            totalFailed++
            continue
          }
          await intelCloud.applyGateResult(row.id, {
            relevance_score: result.relevance_score, relevance_type: result.relevance_type,
            reasoning: result.reasoning, geography: result.geography, region: result.region,
          })
          batchProcessed++
          totalProcessed++
          if (result.relevance_score >= 4) { batchRelevant++; totalRelevant++ }
        } catch (e) {
          console.warn('[Gate:rescore] row error (fail-open):', row.id, (e as Error)?.message)
          batchFailed++
          totalFailed++
        }
      }

      console.log(`[Gate:rescore] Batch done — processed=${batchProcessed} relevant(≥4)=${batchRelevant} failed=${batchFailed} | running totals: ${totalProcessed}/${totalUnscored}`)
    }

    const remaining = await intelCloud.getUnscoredCount()
    console.log(`[Gate:rescore] Complete — processed=${totalProcessed} relevant=${totalRelevant} failed=${totalFailed} remaining=${remaining}`)
    return { ok: true, processed: totalProcessed, relevant: totalRelevant, failed: totalFailed, remaining }
  })

  // Pure write → cloud + mirror. Offline → { ok:false, error }.
  ipcMain.handle('intelligence:updateConfidence', (_e, id: string, confidence: string) =>
    intelCloud.updateConfidence(id, confidence))

  // Phase 3: confirm or correct the AI-proposed geography. Either action marks
  // the geography human-confirmed (geography_confirmed=1) so the gate won't
  // overwrite it on future passes. Pure write → cloud + mirror.
  ipcMain.handle('intelligence:updateGeography', (_e, id: string, geography: string) =>
    intelCloud.updateGeography(id, geography))

  // 3a: reliable board-id project association. Sets project_board_id to a board id
  // (e.g. 'board-info-latam'); empty/null clears it. Does NOT touch disposition_tags.
  // No routing here — routing lands in 3c. Pure write → cloud + mirror.
  ipcMain.handle('intelligence:setProject', (_e, id: string, boardId: string | null) =>
    intelCloud.setProject(id, boardId))

  // 3d: explicit "Send to New sources" for composed items (documents/social/interviews).
  // Cross-tier: the two intelligence_sources writes (project_board_id, status='routed')
  // go cloud + mirror; routeToNewSources (LOCAL info_page_sources) stays here. Offline →
  // { ok:false } from setProjectBoard before any local write, so nothing half-applies.
  ipcMain.handle('intelligence:routeToProject', async (_e, sourceId: string, boardId: string) => {
    const bid = (boardId ?? '').trim()
    if (!bid) return { ok: false, error: 'No project selected.' }
    const set = await intelCloud.setProjectBoard(sourceId, bid)
    if (!set.ok) return set
    const routed = await routeToNewSources(sourceId, bid)
    if (!routed.ok) return routed
    const marked = await intelCloud.markRouted(sourceId)
    if (!marked.ok) return marked
    return { ok: true, pageName: routed.pageName }
  })

  // 2b: persist the researcher's rich-text notes (HTML) for a source. Separate
  // column from review_notes — approve/reject never touches this. Pure write.
  ipcMain.handle('intelligence:updateNotes', (_e, id: string, notesHtml: string) =>
    intelCloud.updateNotes(id, notesHtml))

  // 3e: save researcher-pasted full article text into content. Pure write.
  ipcMain.handle('intelligence:updateContent', (_e, id: string, content: string) =>
    intelCloud.updateContent(id, content))

  // Social edit: patch a saved social post's editable fields (allowlisted main-side
  // in updateSocialFields). Pure write → cloud + mirror. Offline → { ok:false }.
  ipcMain.handle('intelligence:updateSocialFields', (_e, id: string, patch: Record<string, any>) =>
    intelCloud.updateSocialFields(id, patch))

  // 2b: store a reconciled AI read UNDER analysis_json.reconciled, leaving the
  // original top-level analysis untouched. Stamps reconciled_at server-side and
  // returns the stored block so the renderer can merge it without a refetch.
  // RMW → cloud-only: reads analysis_json from CLOUD, merges .reconciled, writes
  // CLOUD (+ mirror re-sync). Reading cloud (not the mirror) is what prevents a
  // stale read from clobbering the .ai / .human siblings. Offline → { ok:false }.
  ipcMain.handle('intelligence:saveReconciled', (_e, id: string, reconciled: {
    relevance_score?: number; relevance_reasoning?: string; summary?: string; suggested_tags?: string[]
  }) => intelCloud.saveReconciled(id, reconciled))

  // News human layer: store a researcher's RELEVANCE OVERRIDE under
  // analysis_json.human — NOT the relevance_score column (the gate owns that and
  // would clobber a human value on the next rescore). Merge-in-place like
  // saveReconciled so other analysis_json keys (.ai / .reconciled) are preserved.
  // Passing null/'' clears the override.
  // RMW → cloud-only (analysis_json.human merge). Offline → { ok:false }.
  ipcMain.handle('intelligence:setHumanRelevance', (_e, id: string, value: string | null) =>
    intelCloud.setHumanRelevance(id, value))

  // Human overrides for the AI's extracted KEY FACTS / SYSTEMS. Stored under
  // analysis_json.human.overrides (OUTSIDE .ai) so re-analysis cannot clobber them.
  // patch === null clears that entry. RMW → cloud-only. Offline → { ok:false }.
  ipcMain.handle('intelligence:setAnalysisOverride', (_e,
    id: string, kind: 'key_fact' | 'capability', key: string, patch: Record<string, unknown> | null
  ) => intelCloud.setAnalysisOverride(id, kind, key, patch))

  // 2b (human-first): store the on-demand "Analyze with AI" read UNDER
  // analysis_json.ai (separate box from the researcher's notes). Re-running
  // replaces .ai only. RMW → cloud-only. Offline → { ok:false }.
  ipcMain.handle('intelligence:saveAiAnalysis', (_e, id: string, ai: {
    relevance_score?: number; relevance_reasoning?: string; summary?: string; suggested_tags?: string[]
  }) => intelCloud.saveAiAnalysis(id, ai))

  // 2b (human-first): persist the EDITABLE reconciled read (HTML) the researcher
  // can amend before commit — its own column, never overwrites intel_notes. Pure write.
  ipcMain.handle('intelligence:updateReconciledNotes', (_e, id: string, html: string) =>
    intelCloud.updateReconciledNotes(id, html))

  // ── Phase 4: disposition + thematic tag registry & per-article tagging ───────
  // known_tags is now CLOUD-sourced with a local offline mirror (see cloud/tags.ts).
  // These three handlers delegate; the renderer contract (channels, arg order) is
  // unchanged. normalizeTag is imported from cloud/tags (single source of truth).

  // Return all registered tags of a type ('disposition' | 'thematic'), A→Z.
  ipcMain.handle('intelligence:getKnownTags', (_e, type: string, boardId: string) =>
    cloudGetKnownTags(type, boardId))

  // Create (or upsert) a tag in the registry; returns the normalized name.
  ipcMain.handle('intelligence:createTag', (_e, name: string, type: string, boardId: string) =>
    cloudCreateTag(currentActingUserId, name, type, boardId))

  // Admin: remove a tag from the registry. Existing article chips are preserved
  // (articles keep their stored JSON) but the tag won't appear in autocomplete.
  ipcMain.handle('intelligence:deleteTag', async (_e, name: string, type: string, boardId: string) =>
    cloudDeleteTag(currentActingUserId, name, type, boardId))

  // Replace an article's tag set for one type. Tags are normalized + de-duped,
  // and the row is updated immediately (no Approve needed).
  ipcMain.handle('intelligence:setArticleTags', (_e, id: string, type: string, tags: string[]) =>
    intelCloud.setArticleTags(id, type, tags))

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

  // Cloud delete + mirror delete, behind the same type-aware permission gate
  // (resolveActor + can()), now inside intel.deleteSource. Offline → { ok:false }.
  ipcMain.handle('intelligence:deleteSource', async (_e, id: string) => {
    return intelCloud.deleteSource(currentActingUserId, id)
  })

  // Pure write (INSERT) → cloud + mirror. Category auto-detect stays here; the id
  // is minted here so the return shape ({ ok, id }) is unchanged. Offline → { ok:false }.
  ipcMain.handle('intelligence:addSocial', (_e, post: {
    platform: string; handle: string; post_date: string; content: string;
    location_mentioned?: string; actors_mentioned?: string; url?: string;
    categories_json?: string; confidence?: string;
    added_by_id?: string; added_by_name?: string;
    project_board_id?: string;
  }) => {
    const { randomUUID } = require('crypto')
    const id = randomUUID()
    const categories = JSON.parse(post.categories_json || '[]')
    const cats = categories.length ? categories : autoDetectCategories(post.content)
    return intelCloud.addSocial(post, id, JSON.stringify(cats))
  })

  // News hand-add: manual article capture. UNGATED insert (no relevance / gate) so it
  // enters the review queue as unreviewed. id is minted here like addSocial; url is
  // deduped inside addNews. Offline → { ok:false }.
  ipcMain.handle('intelligence:addNews', (_e, row: {
    title: string; content?: string; url?: string; source_name?: string;
    published_at?: string; snippet?: string; confidence?: string;
    added_by_id?: string; added_by_name?: string; project_board_id?: string;
  }) => {
    const { randomUUID } = require('crypto')
    const id = randomUUID()
    return intelCloud.addNews(row, id)
  })

  // 2c: manual interview capture. Transcript is stored as PLAIN TEXT in `content`
  // (NOT JSON-wrapped) so the deferred per-span annotation slice can anchor to
  // character offsets. Reuses the 2b compose columns (intel_notes / analysis_json /
  // reconciled_notes) via the shared updateNotes / saveAiAnalysis / saveReconciled /
  // updateReconciledNotes handlers — no new type table, just type='interview'.
  ipcMain.handle('intelligence:addInterview', (_e, iv: {
    title: string; transcript: string; date?: string;
    added_by_id?: string; added_by_name?: string;
    project_board_id?: string;
  }) => {
    const { randomUUID } = require('crypto')
    const id = randomUUID()
    return intelCloud.addInterview(iv, id)
  })

  // Intelligence restructure 2a: thin IPC over the shared project-aware AI helper.
  // Not yet wired to any tab — this exists to test analyzeWithClaude in isolation.
  // The renderer will call window.api.intelligence.analyzeText(opts).
  ipcMain.handle('intelligence:analyzeText', (_e, opts: AnalyzeOpts) => analyzeWithClaude(opts))

  // Social-a: thin IPC over the URL metadata fetcher. Not yet wired to any tab —
  // this exists to test fetchUrlMetadata in isolation (paste-URL flow comes later).
  ipcMain.handle('intelligence:fetchUrlMetadata', (_e, url: string) => fetchUrlMetadata(url))

  ipcMain.handle('intelligence:fetchNews', async () => {
    try {
      const count = await fetchAndStoreNews()
      return { ok: true, count }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('intelligence:uploadDocument', async (_e, params: {
    userId?: string; addedByName?: string; projectBoardId?: string
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
    // Per-file failures used to be console.warn'd in the MAIN process only — invisible in
    // DevTools — while the handler still reported ok:true. Collect them so the renderer can
    // surface what actually failed.
    const errors: Array<{ file: string; error: string }> = []
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
          } catch (e) {
            console.warn('[Intelligence] PDF text extraction FAILED for', fileName, e)
            textContent = '[PDF text extraction unavailable]'
          }
        } else if (ext === 'docx') {
          try {
            const mammoth = require('mammoth')
            const mammothResult = await mammoth.extractRawText({ path: filePath })
            textContent = mammothResult.value?.slice(0, 50000) || ''
          } catch (e) {
            console.warn('[Intelligence] DOCX text extraction FAILED for', fileName, e)
            textContent = '[DOCX text extraction unavailable]'
          }
        }

        // 2b (human-first): AI does NOT auto-run on upload. The document just
        // uploads + extracts text; AI analysis is produced only by the explicit
        // "Analyze with AI" button in the Documents compose view (token discipline).
        // The former upload-time Claude pass has been removed from this flow.
        const analysisJson: string | null = null

        const analysis = analysisJson ? JSON.parse(analysisJson) : null
        const { randomUUID: newUUID } = require('crypto')
        const docId = newUUID()
        // Pure write (INSERT) → cloud + mirror. The file dialog + text extraction
        // above stay local; only the row persist delegates. Offline → { ok:false }.
        const added = await intelCloud.addDocument({
          id: docId,
          file_name: fileName,
          local_path: filePath,
          content: textContent.slice(0, 10000),
          analysis_json: analysisJson,
          categories_json: JSON.stringify(analysis?.suggested_categories || []),
          confidence: analysis?.confidence || 'low',
          added_by_id: params.userId || null,
          added_by_name: params.addedByName || null,
          project_board_id: params.projectBoardId,   // every row in this upload gets the same project
        })
        if (!added.ok) {
          console.warn('[Intelligence] Upload persist failed for', fileName, added.error)
          errors.push({ file: fileName, error: added.error || 'persist failed' })
          continue
        }
        results.push({ id: docId, file_name: fileName })
      } catch (e: any) {
        console.warn('[Intelligence] Upload error for', filePath, e)
        // `fileName` is scoped inside the try and may not exist yet (e.g. a readFileSync
        // throw), so derive the label from filePath here.
        const { basename: bname2 } = require('path')
        errors.push({ file: bname2(filePath), error: e?.message || 'upload failed' })
      }
    }
    // ok now reflects whether ANYTHING actually persisted. All files failed → ok:false with
    // errors populated; some succeeded → ok:true, with any partial failures still listed.
    // (The canceled path above returns its own shape and is untouched — cancel is not an error.)
    return { ok: results.length > 0, results, errors }
  })

  // ── Part 8: Sync from Supabase cs_articles (replaced HTML scrape 2026-06-02) ──
  // The handler name is preserved so existing UI callers (NewsTab "Sync now"
  // button) continue to work unchanged. The old HTML-scrape approach is retired;
  // the shared syncFromContestedSkies() function queries cs_articles directly.
  // NOTE: imported rows arrive with gate_processed=1 — the local gate does NOT
  // re-run on them; they carry relevance_score from the GDELT pipeline already.
  ipcMain.handle('intelligence:importFromContestedSkies', async (_e, _params: {
    userId?: string; addedByName?: string
  }) => {
    try {
      const result = await syncFromContestedSkies()
      return { ok: true, imported: result.imported, total: result.total, skipped: result.skipped }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Count of sources still pending confirmation from the Contested Skies import.
  // Cloud-first (mirror-fallback).
  ipcMain.handle('intelligence:getImportedCount', () => intelCloud.getImportedCount(currentActingUserId))

  // Bulk-confirm all imported sources at a chosen confidence, approving them so
  // they flow into the matching Info Pages' Sources tabs. RMW → cloud-only:
  // intel.confirmImported does the cloud SELECT + per-row cloud UPDATE (+ mirror
  // re-sync); routing (LOCAL info_page_sources) and the cs_articles verdict
  // write-back stay HERE. Offline → { ok:false }.
  ipcMain.handle('intelligence:confirmImported', async (_e, params: {
    confidence?: string; reviewedById?: string; reviewedByName?: string
  }) => {
    const res = await intelCloud.confirmImported(params)
    if (!res.ok) return res
    const addedAll = new Set<string>()
    for (const r of res.rows) {
      // 3c: bulk-confirm is also an approve path — route via the reliable board id.
      try {
        const routed = await routeToNewSources(r.id, r.project_board_id)
        if (routed.ok && routed.pageName) addedAll.add(routed.pageName)
      } catch (e) { console.warn('[3c] confirmImported routing failed', e) }
    }
    // Learning loop: mirror this bulk approval up to Supabase (fire-and-forget).
    void pushVerdictsToSupabase(res.rows.map((r) => r.url), 'approved', params.reviewedByName)
    return { ok: true, count: res.rows.length, addedToPages: [...addedAll] }
  })
}

// ── Info Pages ────────────────────────────────────────────────────────────

export function registerInfoPageHandlers(): void {
  const db = () => getDatabase()

  // Read gate (0a-3): no pageId, so not an entry guard. (a) deleted fix — was
  // archived=0 only, so a cloud-soft-deleted info page still appeared; now excludes
  // deleted too. (b) intersect with the acting user's visible board ids (root → all;
  // non-root → only pages they're a member of). Small, unpaginated → a JS filter is fine.
  ipcMain.handle('infoPages:list', async () => {
    const rows = db().prepare("SELECT * FROM workspace_boards WHERE board_type='info-page' AND COALESCE(deleted,0)=0 AND COALESCE(archived,0)=0 ORDER BY position ASC").all() as Record<string, unknown>[]
    const { isRoot, ids } = await boardsCloud.visibleBoardIdsFor(currentActingUserId)
    return isRoot ? rows : rows.filter(r => ids.has(r.id as string))
  })

  ipcMain.handle('infoPages:getConfig', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return {}
    const row = db().prepare('SELECT board_config FROM workspace_boards WHERE id=?').get(pageId) as { board_config: string | null } | undefined
    try { return row?.board_config ? JSON.parse(row.board_config) : {} } catch { return {} }
  })

  ipcMain.handle('infoPages:saveConfig', (_e, pageId: string, config: Record<string, unknown>) => {
    // Orphaned handler (UI routes page edits through the root-gated boards:* cloud path);
    // console-reachable only. Root-gate it (LOCAL-only isRoot check), do not change behavior.
    if (!boardsCloud.resolveIdentity(currentActingUserId).isRoot) {
      console.warn(`[0a-4] deny infoPages:saveConfig — actor=${currentActingUserId} pageId=${pageId}`)
      return { ok: false, error: 'Only an admin can edit page settings.' }
    }
    db().prepare("UPDATE workspace_boards SET board_config=?,updated_at=datetime('now') WHERE id=?").run(JSON.stringify(config), pageId)
    return { ok: true }
  })

  // Edit an existing page's name and/or link config (repo, live_url, keywords, file…) in one call.
  ipcMain.handle('infoPages:updateMeta', (_e, pageId: string, meta: { name?: string; config?: Record<string, unknown> }) => {
    // Orphaned handler (see saveConfig). Root-gate it (LOCAL-only isRoot check).
    if (!boardsCloud.resolveIdentity(currentActingUserId).isRoot) {
      console.warn(`[0a-4] deny infoPages:updateMeta — actor=${currentActingUserId} pageId=${pageId}`)
      return { ok: false, error: 'Only an admin can edit page settings.' }
    }
    if (typeof meta?.name === 'string' && meta.name.trim()) {
      db().prepare("UPDATE workspace_boards SET name=?,updated_at=datetime('now') WHERE id=?").run(meta.name.trim(), pageId)
    }
    if (meta?.config) {
      db().prepare("UPDATE workspace_boards SET board_config=?,updated_at=datetime('now') WHERE id=?").run(JSON.stringify(meta.config), pageId)
    }
    return { ok: true }
  })

  ipcMain.handle('infoPages:create', (_e, params: { name: string; config: Record<string, unknown> }) => {
    // Orphaned handler (see saveConfig); mirrors createBoard's admin-only standard.
    if (!boardsCloud.resolveIdentity(currentActingUserId).isRoot) {
      console.warn(`[0a-4] deny infoPages:create — actor=${currentActingUserId} name=${params?.name}`)
      return { ok: false, error: 'Only an admin can create pages.' }
    }
    const { randomUUID } = require('crypto')
    const id = randomUUID()
    const maxPos = (db().prepare("SELECT MAX(position) as mp FROM workspace_boards WHERE board_type='info-page'").get() as { mp: number | null })?.mp ?? 49
    db().prepare("INSERT INTO workspace_boards (id,name,position,board_type,board_config) VALUES (?,?,?,'info-page',?)").run(id, params.name, maxPos + 1, JSON.stringify(params.config || {}))
    return { ok: true, id }
  })

  ipcMain.handle('infoPages:delete', (_e, pageId: string) => {
    // Orphaned handler — an ungated HARD delete (the cloud path it replaced does a
    // root-gated SOFT delete). Root-gate it; behavior unchanged (still a hard delete).
    if (!boardsCloud.resolveIdentity(currentActingUserId).isRoot) {
      console.warn(`[0a-4] deny infoPages:delete — actor=${currentActingUserId} pageId=${pageId}`)
      return { ok: false, error: 'Only an admin can delete pages.' }
    }
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

  // B1: info-page owners ("project heads") are CLOUD + email-keyed (identity spine,
  // shared with email-keyed board_members). The local info_page_owners table stays
  // in place, unused. addOwner/removeOwner are root-gated in the cloud fn; isOwner
  // resolves the acting user to email (the renderer still passes localUser.id, which
  // the cloud path ignores in favor of the acting user).
  ipcMain.handle('infoPages:getOwners', async (_e, pageId: string) => {
    // 0a-3 missed this read (misfiled under the ownership axis). Same entry guard as the
    // 0a-3 reads: [] on deny. (getOwners throws on cloud error; this deny is its first
    // non-throwing exit — fine, no restructure.)
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return []
    return boardsCloud.getOwners(pageId)
  })
  ipcMain.handle('infoPages:addOwner', (_e, pageId: string, userId: string) => boardsCloud.addOwner(currentActingUserId, pageId, userId))
  ipcMain.handle('infoPages:removeOwner', (_e, pageId: string, userId: string) => boardsCloud.removeOwner(currentActingUserId, pageId, userId))
  ipcMain.handle('infoPages:isOwner', (_e, pageId: string) => boardsCloud.isOwner(currentActingUserId, pageId))

  ipcMain.handle('infoPages:getItems', async (_e, pageId: string, tab?: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return []
    if (tab) return db().prepare('SELECT * FROM info_page_items WHERE page_id=? AND tab=? ORDER BY created_at DESC').all(pageId, tab)
    return db().prepare('SELECT * FROM info_page_items WHERE page_id=? ORDER BY created_at DESC').all(pageId)
  })

  ipcMain.handle('infoPages:addItem', async (_e, item: {
    page_id: string; tab: string; sub_type?: string; title?: string;
    content_json?: string; priority?: string; proposed_section?: string;
    confidence?: string; source_ref?: string; analysis_json?: string;
    created_by_id?: string; created_by_name?: string
  }) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, item.page_id))) {
      console.warn(`[0a-4] deny infoPages:addItem — actor=${currentActingUserId} pageId=${item.page_id}`)
      return { ok: false, error: 'Not authorized' }
    }
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

  ipcMain.handle('infoPages:updateItem', async (_e, id: string, updates: Record<string, unknown>) => {
    // No pageId in scope — resolve it from the item. No row → DENY (do not fall through).
    const owner = db().prepare('SELECT page_id FROM info_page_items WHERE id=?').get(id) as { page_id: string } | undefined
    if (!owner || !(await boardsCloud.isBoardVisibleFor(currentActingUserId, owner.page_id))) {
      console.warn(`[0a-4] deny infoPages:updateItem — actor=${currentActingUserId} itemId=${id} pageId=${owner?.page_id ?? 'NONE'}`)
      return { ok: false, error: 'Not authorized' }
    }
    const allowed = ['title','content_json','status','priority','proposed_section','confidence','source_ref','analysis_json']
    const sets: string[] = ["updated_at=datetime('now')"]
    const vals: unknown[] = []
    for (const key of allowed) {
      if (updates[key] !== undefined) { sets.push(`${key}=?`); vals.push(updates[key]) }
    }
    if (sets.length > 1) db().prepare(`UPDATE info_page_items SET ${sets.join(',')} WHERE id=?`).run(...vals, id)
    return { ok: true }
  })

  ipcMain.handle('infoPages:deleteItem', async (_e, id: string) => {
    // No pageId in scope — resolve it from the item. No row → DENY (do not fall through).
    const owner = db().prepare('SELECT page_id FROM info_page_items WHERE id=?').get(id) as { page_id: string } | undefined
    if (!owner || !(await boardsCloud.isBoardVisibleFor(currentActingUserId, owner.page_id))) {
      console.warn(`[0a-4] deny infoPages:deleteItem — actor=${currentActingUserId} itemId=${id} pageId=${owner?.page_id ?? 'NONE'}`)
      return { ok: false, error: 'Not authorized' }
    }
    db().prepare('DELETE FROM info_page_items WHERE id=?').run(id)
    db().prepare('DELETE FROM info_page_commits WHERE item_id=?').run(id)
    return { ok: true }
  })

  ipcMain.handle('infoPages:commitItems', async (_e, params: {
    pageId: string; itemIds: string[]; submittedById: string; submittedByName: string
  }) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, params.pageId))) {
      console.warn(`[0a-4] deny infoPages:commitItems — actor=${currentActingUserId} pageId=${params.pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
    const { randomUUID } = require('crypto')
    for (const itemId of params.itemIds) {
      db().prepare("INSERT OR IGNORE INTO info_page_commits (id,page_id,item_id,submitted_by_id,submitted_by_name) VALUES (?,?,?,?,?)")
        .run(randomUUID(), params.pageId, itemId, params.submittedById, params.submittedByName)
      db().prepare("UPDATE info_page_items SET status='committed',updated_at=datetime('now') WHERE id=?").run(itemId)
    }
    return { ok: true }
  })

  ipcMain.handle('infoPages:getCommits', async (_e, pageId: string, status?: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return []
    const sql = status
      ? `SELECT ipc.*, ipi.title, ipi.tab, ipi.sub_type, ipi.confidence, ipi.proposed_section, ipi.content_json
         FROM info_page_commits ipc LEFT JOIN info_page_items ipi ON ipi.id=ipc.item_id
         WHERE ipc.page_id=? AND ipc.status=? ORDER BY ipc.submitted_at DESC`
      : `SELECT ipc.*, ipi.title, ipi.tab, ipi.sub_type, ipi.confidence, ipi.proposed_section, ipi.content_json
         FROM info_page_commits ipc LEFT JOIN info_page_items ipi ON ipi.id=ipc.item_id
         WHERE ipc.page_id=? ORDER BY ipc.submitted_at DESC`
    return status ? db().prepare(sql).all(pageId, status) : db().prepare(sql).all(pageId)
  })

  ipcMain.handle('infoPages:reviewCommit', async (_e, commitId: string, action: 'approve'|'reject', params: {
    reviewedById: string; reviewedByName: string; rejectionNote?: string
  }) => {
    // Publication side — gate on A (canApprove = isRoot || isOwner), NOT membership.
    // Resolve the pageId from the commit; no row → DENY.
    const owner = db().prepare('SELECT page_id FROM info_page_commits WHERE id=?').get(commitId) as { page_id: string } | undefined
    if (!owner || !(await boardsCloud.isOwner(currentActingUserId, owner.page_id))) {
      console.warn(`[0a-4] deny infoPages:reviewCommit — actor=${currentActingUserId} commitId=${commitId} pageId=${owner?.page_id ?? 'NONE'}`)
      return { ok: false, error: 'Not authorized' }
    }
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

  ipcMain.handle('infoPages:adminReviewCommit', async (_e, commitId: string, action: 'approve'|'reject', params: {
    reviewedById: string; reviewedByName: string; rejectionNote?: string
  }) => {
    // Publication side — gate on A (canApprove = isRoot || isOwner), NOT membership.
    // Resolve the pageId from the commit; no row → DENY.
    const owner = db().prepare('SELECT page_id FROM info_page_commits WHERE id=?').get(commitId) as { page_id: string } | undefined
    if (!owner || !(await boardsCloud.isOwner(currentActingUserId, owner.page_id))) {
      console.warn(`[0a-4] deny infoPages:adminReviewCommit — actor=${currentActingUserId} commitId=${commitId} pageId=${owner?.page_id ?? 'NONE'}`)
      return { ok: false, error: 'Not authorized' }
    }
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

  ipcMain.handle('infoPages:getPublished', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return []
    return db().prepare('SELECT * FROM info_page_published WHERE page_id=? ORDER BY date_implemented DESC LIMIT 50').all(pageId)
  })

  ipcMain.handle('infoPages:logPublished', async (_e, entry: {
    pageId: string; whatChanged: string; committedById: string; committedByName: string;
    approvedById: string; approvedByName: string; promptUsed: string; itemIds: string[]; commitCount: number
  }) => {
    // Publication side — gate on A (canApprove = isRoot || isOwner), NOT membership.
    if (!(await boardsCloud.isOwner(currentActingUserId, entry.pageId))) {
      console.warn(`[0a-4] deny infoPages:logPublished — actor=${currentActingUserId} pageId=${entry.pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
    const { randomUUID } = require('crypto')
    db().prepare(`INSERT INTO info_page_published (id,page_id,what_changed,committed_by_id,committed_by_name,approved_by_id,approved_by_name,prompt_used,item_ids_json,commit_count) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), entry.pageId, entry.whatChanged, entry.committedById, entry.committedByName,
           entry.approvedById, entry.approvedByName, entry.promptUsed, JSON.stringify(entry.itemIds), entry.commitCount)
    // Resolve page name for the feedback loop.
    const pageRow = db().prepare('SELECT name FROM workspace_boards WHERE id=?').get(entry.pageId) as { name: string } | undefined
    const pageName = pageRow?.name || entry.pageId
    const nowIso = new Date().toISOString()
    // Mark items as implemented (info_page_items / info_page_commits stay LOCAL).
    for (const id of entry.itemIds) {
      db().prepare("UPDATE info_page_items SET status='implemented',updated_at=datetime('now') WHERE id=?").run(id)
      db().prepare("UPDATE info_page_commits SET status='implemented' WHERE item_id=?").run(id)
      // Feedback loop: flag the origin intelligence source as published (cloud +
      // mirror, best-effort — never blocks publish). The intel write is the only
      // migrated line here.
      const item = db().prepare('SELECT origin_source_id FROM info_page_items WHERE id=?').get(id) as { origin_source_id: string | null } | undefined
      if (item?.origin_source_id) {
        await intelCloud.markUsedInPage(item.origin_source_id, pageName, nowIso)
      }
    }
    return { ok: true }
  })

  // Publish a page's admin-approved commits to its OWN linked GitHub repo.
  // Generic version of the Contested Skies push — works for any linked Info Page.
  ipcMain.handle('infoPages:publishToRepo', async (_e, params: {
    pageId: string; pushedById: string; pushedByName: string; whatChanged?: string
  }) => {
    // Publication side — gate on A (canApprove = isRoot || isOwner), NOT membership.
    if (!(await boardsCloud.isOwner(currentActingUserId, params.pageId))) {
      console.warn(`[0a-4] deny infoPages:publishToRepo — actor=${currentActingUserId} pageId=${params.pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
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
        // Only the intel feedback flag is migrated (cloud + mirror, best-effort).
        await intelCloud.markUsedInPage(item.origin_source_id, page.name, nowIso)
      }
    }
    return { ok: true, count: commits.length, repo, url: htmlUrl }
  })

  // ── Pipeline: Source Intelligence → Sources tab ──────────────────────────
  // Reconcile all approved intelligence sources matching this page's keywords
  // into 'ready_for_analysis' source items. Used for backfill + polling sync.
  ipcMain.handle('infoPages:syncSources', async (_e, pageId: string) => {
    // Gate the TARGET page (0a-3): a non-member can't backfill into a page they can't
    // see. KNOWN GAP (defense-in-depth, deliberately out of scope): the cross-project
    // source read below still scans ALL approved/pushed sources — but the caller is
    // already entitled to this page and the matches are keyword-scoped to its config.
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return { added: 0 }
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
  ipcMain.handle('infoPages:getSourceItems', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return []
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
  ipcMain.handle('infoPages:sendSourcesToAnalysis', async (_e, itemIds: string[]) => {
    if (!Array.isArray(itemIds) || !itemIds.length) return { ok: true, count: 0 }
    // No pageId — resolve EVERY id's page. FAIL CLOSED: any missing id, or any page the
    // actor cannot see, denies the WHOLE batch (no filter-and-partially-apply).
    for (const id of itemIds) {
      const owner = db().prepare('SELECT page_id FROM info_page_items WHERE id=?').get(id) as { page_id: string } | undefined
      if (!owner || !(await boardsCloud.isBoardVisibleFor(currentActingUserId, owner.page_id))) {
        console.warn(`[0a-4] deny infoPages:sendSourcesToAnalysis — actor=${currentActingUserId} itemId=${id} pageId=${owner?.page_id ?? 'NONE'}`)
        return { ok: false, error: 'Not authorized' }
      }
    }
    const stmt = db().prepare("UPDATE info_page_items SET status='in_analysis',updated_at=datetime('now') WHERE id=? AND status='ready_for_analysis'")
    let count = 0
    for (const id of itemIds) { const r = stmt.run(id); count += r.changes }
    return { ok: true, count }
  })

  // Counters for the Info Pages left panel.
  ipcMain.handle('infoPages:getSourceStats', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return { newAvailable: 0, inAnalysis: 0 }
    // newAvailable now reads the REAL 3c pipeline table (info_page_sources stage='new'),
    // matching getSourcePipelineCounts so the list badge and the New Sources tab agree.
    // inAnalysis still reflects the legacy manual flow (info_page_items in_analysis).
    const newAvailable = (db().prepare("SELECT COUNT(*) as c FROM info_page_sources WHERE info_page=? AND stage='new'").get(pageId) as { c: number }).c
    const inAnalysis = (db().prepare("SELECT COUNT(*) as c FROM info_page_items WHERE page_id=? AND sub_type='intelligence_source' AND status='in_analysis'").get(pageId) as { c: number }).c
    return { newAvailable, inAnalysis }
  })

  // Intelligence sources currently queued for analysis on this page (for ClaudeAnalysisTab).
  ipcMain.handle('infoPages:getAnalysisSources', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return []
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
  ipcMain.handle('infoPages:getChat', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return []
    return db().prepare('SELECT * FROM info_page_chat WHERE page_id=? ORDER BY created_at ASC, rowid ASC').all(pageId)
  })

  ipcMain.handle('infoPages:clearChat', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) {
      console.warn(`[0a-4] deny infoPages:clearChat — actor=${currentActingUserId} pageId=${pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
    db().prepare('DELETE FROM info_page_chat WHERE page_id=?').run(pageId)
    return { ok: true }
  })

  ipcMain.handle('infoPages:chat', async (_e, params: {
    pageId: string; pageName: string; userId?: string; message: string
  }) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, params.pageId))) {
      console.warn(`[0a-4] deny infoPages:chat — actor=${currentActingUserId} pageId=${params.pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
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

  // ── Source pipeline: info_page_sources lifecycle handlers ─────────────────

  // Return all info_page_sources rows for a page (all stages), joined with full
  // intelligence_sources metadata so the UI has everything it needs to display.
  ipcMain.handle('infoPages:getSourcePipeline', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return []
    return db().prepare(`
      SELECT ips.id as pipeline_id, ips.article_id, ips.info_page, ips.stage,
             ips.design_notes, ips.added_at, ips.committed_at,
             is2.title, is2.url, is2.source_name, is2.published_at, is2.snippet,
             is2.relevance_score, is2.relevance_type, is2.geography, is2.language,
             is2.categories_json, is2.thematic_tags, is2.confidence,
             is2.review_notes, is2.disposition_tags,
             is2.type, is2.analysis_json, is2.intel_notes
      FROM info_page_sources ips
      JOIN intelligence_sources is2 ON is2.id = ips.article_id
      WHERE ips.info_page = ?
      ORDER BY ips.added_at DESC
    `).all(pageId)
  })

  // Move checked 'new' items to 'review'. Logs each transition.
  ipcMain.handle('infoPages:sendToReview', async (_e, pageId: string, articleIds: string[]) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) {
      console.warn(`[0a-4] deny infoPages:sendToReview — actor=${currentActingUserId} pageId=${pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
    if (!articleIds?.length) return { ok: true, moved: 0 }
    const now = new Date().toISOString()
    let moved = 0
    for (const articleId of articleIds) {
      const r = db().prepare(
        "UPDATE info_page_sources SET stage='review' WHERE article_id=? AND info_page=? AND stage='new'"
      ).run(articleId, pageId)
      if (r.changes > 0) {
        db().prepare(
          "INSERT INTO info_page_changes (article_id, info_page, from_stage, to_stage, created_at) VALUES (?,?,'new','review',?)"
        ).run(articleId, pageId, now)
        moved++
      }
    }
    return { ok: true, moved }
  })

  // Move one 'review' item back to 'new' (back-out path).
  ipcMain.handle('infoPages:backSourceToNew', async (_e, pageId: string, articleId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) {
      console.warn(`[0a-4] deny infoPages:backSourceToNew — actor=${currentActingUserId} pageId=${pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
    const now = new Date().toISOString()
    const r = db().prepare(
      "UPDATE info_page_sources SET stage='new', design_notes=NULL WHERE article_id=? AND info_page=? AND stage='review'"
    ).run(articleId, pageId)
    if (r.changes > 0) {
      db().prepare(
        "INSERT INTO info_page_changes (article_id, info_page, from_stage, to_stage, created_at) VALUES (?,?,'review','new',?)"
      ).run(articleId, pageId, now)
    }
    return { ok: true }
  })

  // Move a 'new' source OUT of the pipeline and back to the intel pending queue.
  // Deletes the pointer row (intel row + its content/analysis/notes are untouched)
  // and returns the intel source to status='unreviewed' so it reappears in News.
  // Guarded: only acts on stage='new'; intel status flips ONLY if a row was deleted.
  ipcMain.handle('infoPages:moveBackToIntel', async (_e, pageId: string, articleId: string) => {
    // ONE gate on pageId (before the cloud write): the intel-row flip is a consequence
    // of the authorized pointer delete, so membership on this page authorizes the whole op.
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) {
      console.warn(`[0a-4] deny infoPages:moveBackToIntel — actor=${currentActingUserId} pageId=${pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
    const now = new Date().toISOString()
    // Cross-tier: the info_page_sources DELETE + info_page_changes log stay LOCAL;
    // the intel status flip is cloud-authoritative. Check existence FIRST, do the
    // cloud write, and only then apply the local writes — so an offline/failed
    // cloud write can never leave the pointer deleted but the intel status unmoved.
    const exists = db().prepare(
      "SELECT 1 FROM info_page_sources WHERE article_id=? AND info_page=? AND stage='new'"
    ).get(articleId, pageId)
    if (!exists) return { ok: true, movedBack: false }
    const reverted = await intelCloud.revertToUnreviewed(articleId)
    if (!reverted.ok) return { ok: false, error: reverted.error, movedBack: false }
    db().prepare(
      "DELETE FROM info_page_sources WHERE article_id=? AND info_page=? AND stage='new'"
    ).run(articleId, pageId)
    db().prepare(
      "INSERT INTO info_page_changes (article_id, info_page, from_stage, to_stage, created_at) VALUES (?,?,'new','intel',?)"
    ).run(articleId, pageId, now)
    return { ok: true, movedBack: true }
  })

  // Commit all 'review' items to 'committed'. Saves design_notes onto each row.
  ipcMain.handle('infoPages:commitSources', async (_e, pageId: string, designNotes: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) {
      console.warn(`[0a-4] deny infoPages:commitSources — actor=${currentActingUserId} pageId=${pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
    const now = new Date().toISOString()
    // Collect review items before updating.
    const reviewItems = db().prepare(
      "SELECT article_id FROM info_page_sources WHERE info_page=? AND stage='review'"
    ).all(pageId) as { article_id: string }[]
    if (!reviewItems.length) return { ok: true, committed: 0 }
    db().prepare(
      "UPDATE info_page_sources SET stage='committed', committed_at=?, design_notes=? WHERE info_page=? AND stage='review'"
    ).run(now, designNotes || null, pageId)
    for (const item of reviewItems) {
      db().prepare(
        "INSERT INTO info_page_changes (article_id, info_page, from_stage, to_stage, note, created_at) VALUES (?,?,'review','committed',?,?)"
      ).run(item.article_id, pageId, designNotes || null, now)
    }
    return { ok: true, committed: reviewItems.length }
  })

  // Persist the shared pre-publish design notes onto every item currently in the
  // 'review' stage, without committing. Lets the batch's design guidance survive
  // reloads and be read back when the user returns to Pre-Commit Review.
  ipcMain.handle('infoPages:saveReviewNotes', async (_e, pageId: string, designNotes: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) {
      console.warn(`[0a-4] deny infoPages:saveReviewNotes — actor=${currentActingUserId} pageId=${pageId}`)
      return { ok: false, error: 'Not authorized' }
    }
    const r = db().prepare(
      "UPDATE info_page_sources SET design_notes=? WHERE info_page=? AND stage='review'"
    ).run(designNotes || null, pageId)
    return { ok: true, saved: r.changes }
  })

  // Return info_page_changes in reverse-chronological order (Recent Changes tab).
  ipcMain.handle('infoPages:getSourceChanges', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return []
    return db().prepare(`
      SELECT ipc.*, is2.title, is2.source_name
      FROM info_page_changes ipc
      LEFT JOIN intelligence_sources is2 ON is2.id = ipc.article_id
      WHERE ipc.info_page = ?
      ORDER BY ipc.created_at DESC
      LIMIT 200
    `).all(pageId)
  })

  // Count items currently in each pipeline stage for a page (used by Intelligence tab).
  ipcMain.handle('infoPages:getSourcePipelineCounts', async (_e, pageId: string) => {
    if (!(await boardsCloud.isBoardVisibleFor(currentActingUserId, pageId))) return { new: 0, review: 0, committed: 0 }
    const rows = db().prepare(
      'SELECT stage, COUNT(*) as c FROM info_page_sources WHERE info_page=? GROUP BY stage'
    ).all(pageId) as { stage: string; c: number }[]
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.stage] = r.c })
    return { new: m['new'] ?? 0, review: m['review'] ?? 0, committed: m['committed'] ?? 0 }
  })
}
