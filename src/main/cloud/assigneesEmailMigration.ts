import { isOnline } from './connection'
import { getDatabase } from '../db'

// ── Slice 1c-2a: assignees_json device-id → work-email, REVERSIBLE HALF ───────
// `assignees_json` stores local_users.id UUIDs, which are minted per-device with
// crypto.randomUUID() at first sign-in and never sync. An assignment made on one
// machine therefore resolves on NO other machine — cross-device assignment has
// never worked. This slice rewrites the LOCAL data to the roster's work email,
// which is the one cross-device-stable identity.
//
// SCOPE — this half touches NOTHING irreversible:
//   • LOCAL workspace_tasks.assignees_json  (backed up first)
//   • LOCAL local_users.email               (backed up first)
//   • NO cloud writes of any kind. NO matcher/writer repoint (that is 1c-2b).
//
// ⚠ THE LOCAL REWRITE IS TRANSIENT UNTIL 1c-2b REWRITES CLOUD. Local
// workspace_tasks is a MIRROR: getTasks → syncTasksMirror (boards.ts:682) DELETEs
// every active-board row and re-INSERTs from cloud, so any ONLINE workspace read
// clobbers these emails straight back to device ids. That is expected and bounded,
// not a bug — it is exactly why the verification runbook for this slice is run
// OFFLINE, where getTasks returns readTasksMirror early and never syncs.
//
// local_users.email is NOT mirrored and does not have this problem; that rewrite
// is durable immediately. It matters because resolveIdentity() returns
// local_users.email, so leaving it stale would make every researcher's own device
// resolve them to an old-format address that matches nothing in their assignments
// — a failure invisible on the admin's machine, whose address never changed.

const FLAG = 'assignees_email_migration_1c2a_v1'

// The CONFIRMED old→new map (1c-2 diagnosis; zero orphans in live data). Keyed by
// device id so the rewrite never depends on the stale email being readable, and
// carrying the old email so the local_users rewrite can be made idempotent.
const ID_MAP: Record<string, { oldEmail: string; newEmail: string }> = {
  '7f8293a1-368b-4e3c-aa97-4a33c6587c00': { oldEmail: 'daniel_lozano@kantor-consulting.com', newEmail: 'daniel.lozano@kantor-consulting.com' },
  '89c0b49c-73bc-4113-8399-956e66b37640': { oldEmail: 'jdcubillos@kantor-consulting.com',    newEmail: 'jd.cubillos@kantor-consulting.com' },
  '798d7c6a-5011-4240-a001-8667134f02b2': { oldEmail: 'leonardocs@kantor-consulting.com',    newEmail: 'leonardo.carreno@kantor-consulting.com' },
  '37dd8f04-5254-4f37-b823-0f3356291db1': { oldEmail: 'dk@kantor-consulting.com',            newEmail: 'dk@kantor-consulting.com' },
}

function getFlag(): boolean {
  try {
    const row = getDatabase().prepare('SELECT value FROM settings WHERE key=?').get(FLAG) as { value?: string } | undefined
    return row?.value === 'done'
  } catch { return false }
}

function setFlag(): void {
  try {
    getDatabase().prepare(
      "INSERT INTO settings (key,value,updated_at) VALUES (?,'done',CURRENT_TIMESTAMP) " +
      'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP'
    ).run(FLAG)
  } catch (e) {
    console.warn('[assigneesMigration] could not persist flag:', (e as Error)?.message)
  }
}

function clearFlag(): void {
  try {
    getDatabase().prepare('DELETE FROM settings WHERE key=?').run(FLAG)
  } catch (e) {
    console.warn('[assigneesMigration] could not clear flag:', (e as Error)?.message)
  }
}

export interface MigrationResult {
  ok: boolean
  tasksRewritten?: number
  emailsRewritten?: number
  skipped?: number
  reason?: string
}

// Backup → rewrite, all in ONE transaction so a partial failure can never leave
// data rewritten with no backup behind it. Idempotent on every axis: the backups
// use INSERT OR IGNORE (first run wins, so a re-run can't overwrite the true
// original with an already-migrated value), and the email rewrite only fires on
// rows still holding the OLD address.
export function migrateAssigneesToEmail(): MigrationResult {
  if (getFlag()) return { ok: true, reason: 'already migrated' }

  // ⚠ Not a failure — but the caller needs to know the local writes below may not
  // survive. Logged loudly so a future session reading a clean summary can't
  // mistake "4 tasks rewritten" for "4 tasks durably hold emails".
  if (isOnline()) {
    console.warn(
      '[assigneesMigration] ⚠ RUNNING WHILE ONLINE — local workspace_tasks is a MIRROR: the next ' +
      'getTasks() calls syncTasksMirror (boards.ts:682), which DELETEs and re-INSERTs every ' +
      'active-board row from cloud and will CLOBBER these email rewrites back to device ids. ' +
      'Cloud is not rewritten until slice 1c-2b. Verify this migration OFFLINE, where getTasks ' +
      'returns readTasksMirror early and never syncs. The local_users.email rewrite IS durable.'
    )
  }

  let tasksRewritten = 0
  let emailsRewritten = 0
  let skipped = 0

  try {
    const db = getDatabase()
    const now = new Date().toISOString()

    const tx = db.transaction(() => {
      // ── 1. Tasks: back up, then rewrite ────────────────────────────────────
      const rows = db
        .prepare("SELECT id, assignees_json FROM workspace_tasks WHERE assignees_json IS NOT NULL AND assignees_json NOT IN ('','[]','null')")
        .all() as { id: string; assignees_json: string }[]

      const backupTask = db.prepare('INSERT OR IGNORE INTO assignees_backup (task_id, assignees_json_old, backed_up_at) VALUES (?,?,?)')
      const updTask    = db.prepare('UPDATE workspace_tasks SET assignees_json=? WHERE id=?')

      for (const r of rows) {
        try {
          const ids: string[] = JSON.parse(r.assignees_json || '[]')
          if (!Array.isArray(ids) || ids.length === 0) continue
          // Already-migrated values pass through untouched — a re-run is a no-op,
          // not a double translation.
          if (ids.every(v => typeof v === 'string' && v.includes('@'))) continue

          const mapped: string[] = []
          let sawUnmapped = false
          for (const id of ids) {
            if (typeof id === 'string' && id.includes('@')) { mapped.push(id); continue }
            const hit = ID_MAP[id]
            if (!hit) {
              // Skip and LOG — never drop, never guess. The id stays as-is so the
              // row remains the record of it and a later pass can still resolve it.
              console.warn(`[assigneesMigration] SKIP unmapped assignee id ${id} on task ${r.id} — left unchanged`)
              skipped++
              sawUnmapped = true
              mapped.push(id)
              continue
            }
            mapped.push(hit.newEmail)
          }

          backupTask.run(r.id, r.assignees_json, now)
          updTask.run(JSON.stringify(mapped), r.id)
          tasksRewritten++
          if (sawUnmapped) console.warn(`[assigneesMigration] task ${r.id} rewritten with ${skipped} id(s) left unmapped`)
        } catch {
          // Malformed JSON: skip, exactly as db.ts:630's precedent does.
          console.warn(`[assigneesMigration] SKIP malformed assignees_json on task ${r.id}`)
          skipped++
        }
      }

      // ── 2. local_users.email: back up, then rewrite ────────────────────────
      // Durable (this table is not mirrored). Guarded on the OLD value so a
      // re-run cannot touch an already-migrated row, and dk@ (old === new) is
      // filtered out entirely rather than written as a no-op UPDATE.
      const backupEmail = db.prepare('INSERT OR IGNORE INTO local_users_email_backup (id, email_old, backed_up_at) VALUES (?,?,?)')
      const updEmail    = db.prepare('UPDATE local_users SET email=? WHERE id=? AND LOWER(email)=?')

      for (const [id, { oldEmail, newEmail }] of Object.entries(ID_MAP)) {
        if (oldEmail === newEmail) continue
        const cur = db.prepare('SELECT email FROM local_users WHERE id=?').get(id) as { email?: string } | undefined
        if (!cur?.email) continue
        if (cur.email.toLowerCase() !== oldEmail.toLowerCase()) continue
        backupEmail.run(id, cur.email, now)
        const res = updEmail.run(newEmail, id, oldEmail.toLowerCase())
        if (res.changes > 0) emailsRewritten++
      }
    })

    tx()
    setFlag()
    console.log(`[assigneesMigration] done — ${tasksRewritten} task(s) rewritten, ${emailsRewritten} email(s) rewritten, ${skipped} skipped`)
    return { ok: true, tasksRewritten, emailsRewritten, skipped }
  } catch (e) {
    const msg = (e as Error)?.message || 'migration failed'
    // Flag deliberately NOT set — the whole thing retries next launch. The
    // transaction rolled back, so there is nothing half-written to clean up.
    console.error('[assigneesMigration] FAILED (flag left unset, will retry next launch):', msg)
    return { ok: false, reason: msg }
  }
}

// Full restore to pre-migration state. Exposed over IPC (not left as a documented
// SQL block) so the rehearsal exercises the SAME code path a real rollback would.
// Backups are left in place: they are the record of what was restored, and the
// migration's INSERT OR IGNORE means keeping them cannot corrupt a later re-run.
export function rollbackAssigneesToIds(): MigrationResult {
  let tasksRewritten = 0
  let emailsRewritten = 0
  try {
    const db = getDatabase()
    const tx = db.transaction(() => {
      const tasks = db.prepare('SELECT task_id, assignees_json_old FROM assignees_backup').all() as { task_id: string; assignees_json_old: string }[]
      const updTask = db.prepare('UPDATE workspace_tasks SET assignees_json=? WHERE id=?')
      for (const t of tasks) {
        const res = updTask.run(t.assignees_json_old, t.task_id)
        if (res.changes > 0) tasksRewritten++
      }

      const emails = db.prepare('SELECT id, email_old FROM local_users_email_backup').all() as { id: string; email_old: string }[]
      const updEmail = db.prepare('UPDATE local_users SET email=? WHERE id=?')
      for (const e of emails) {
        const res = updEmail.run(e.email_old, e.id)
        if (res.changes > 0) emailsRewritten++
      }
    })
    tx()
    clearFlag()
    console.log(`[assigneesMigration] ROLLBACK done — ${tasksRewritten} task(s) restored, ${emailsRewritten} email(s) restored, flag cleared`)
    return { ok: true, tasksRewritten, emailsRewritten }
  } catch (e) {
    const msg = (e as Error)?.message || 'rollback failed'
    console.error('[assigneesMigration] ROLLBACK FAILED:', msg)
    return { ok: false, reason: msg }
  }
}

// Launch entry point. Never throws out of app startup.
export function runAssigneesEmailMigration(): void {
  try {
    migrateAssigneesToEmail()
  } catch (e) {
    console.error('[assigneesMigration] unexpected error at launch:', (e as Error)?.message)
  }
}
