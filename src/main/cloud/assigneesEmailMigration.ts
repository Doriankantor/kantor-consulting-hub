import { isOnline } from './connection'
import { cloud } from './client'
import { updateTask } from './boards'
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

// ── Slice 1c-2b-①: the CLOUD rewrite — THE COMMIT-ONCE STEP ──────────────────
// Everything above this line is reversible from one machine. This is not. Cloud
// is shared: once it holds emails and a second device syncs them down, that
// device's mirror holds emails too, and restoring cloud alone no longer restores
// the system. The cloud backup table (sql/2026-07-20_assignees_cloud_backup.sql)
// is the last reversible point, and this routine REFUSES TO RUN WITHOUT IT.
//
// After this lands, the transient-local caveat from 1c-2a INVERTS and disappears:
// syncTasksMirror starts pulling emails DOWN from cloud, so it reinforces the
// migration instead of clobbering it. That inversion is the acceptance test.
//
// Still NOT touched here: every matcher, every notification target site,
// toggleAssignee, and the `assignee_ids` field name. Those are 1c-2b-②. The
// assignee picker stays greyed until then — expected, not a regression.

const CLOUD_FLAG = 'assignees_cloud_email_migration_1c2b_v1'

function getCloudFlag(): boolean {
  try {
    const row = getDatabase().prepare('SELECT value FROM settings WHERE key=?').get(CLOUD_FLAG) as { value?: string } | undefined
    return row?.value === 'done'
  } catch { return false }
}

function setCloudFlag(): void {
  try {
    getDatabase().prepare(
      "INSERT INTO settings (key,value,updated_at) VALUES (?,'done',CURRENT_TIMESTAMP) " +
      'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP'
    ).run(CLOUD_FLAG)
  } catch (e) {
    console.warn('[assigneesCloudMigration] could not persist flag:', (e as Error)?.message)
  }
}

function clearCloudFlag(): void {
  try {
    getDatabase().prepare('DELETE FROM settings WHERE key=?').run(CLOUD_FLAG)
  } catch (e) {
    console.warn('[assigneesCloudMigration] could not clear flag:', (e as Error)?.message)
  }
}

type CloudTaskRow = { id: string; assignees_json: string | null }

const hasAssignees = (v: string | null | undefined): v is string =>
  !!v && v !== '' && v !== '[]' && v !== 'null'

export async function migrateCloudAssigneesToEmail(): Promise<MigrationResult> {
  if (getCloudFlag()) return { ok: true, reason: 'already migrated' }
  if (!isOnline()) return { ok: false, reason: 'offline — cloud rewrite needs cloud; will retry next launch' }

  try {
    // ── 1. Read the live cloud rows ────────────────────────────────────────
    const { data, error } = await cloud.from('workspace_tasks').select('id, assignees_json')
    if (error) return { ok: false, reason: `cloud read failed: ${error.message}` }
    const targets = ((data ?? []) as CloudTaskRow[]).filter(r => hasAssignees(r.assignees_json))
    if (targets.length === 0) {
      console.log('[assigneesCloudMigration] nothing to rewrite (no cloud rows carry assignees)')
      setCloudFlag()
      return { ok: true, tasksRewritten: 0, skipped: 0 }
    }

    // ── 2. VERIFY THE BACKUP EXISTS AND COVERS EVERY TARGET ────────────────
    // Hard precondition, not a warning. A commit-once step must never run on the
    // assumption that a backup was taken — an unverified backup is not a backup.
    const { data: backupData, error: backupErr } = await cloud
      .from('assignees_backup_cloud')
      .select('task_id')
    if (backupErr) {
      return {
        ok: false,
        reason:
          `REFUSING TO RUN — cloud backup table unreadable (${backupErr.message}). ` +
          'Apply sql/2026-07-20_assignees_cloud_backup.sql in Supabase first.',
      }
    }
    const backedUp = new Set(((backupData ?? []) as { task_id: string }[]).map(r => r.task_id))
    const unbacked = targets.filter(t => !backedUp.has(t.id)).map(t => t.id)
    if (unbacked.length > 0) {
      return {
        ok: false,
        reason:
          `REFUSING TO RUN — ${unbacked.length} task(s) have no cloud backup row: ${unbacked.join(', ')}. ` +
          'Re-run sql/2026-07-20_assignees_cloud_backup.sql in Supabase, then relaunch.',
      }
    }

    // ── 3. Rewrite, one task at a time ─────────────────────────────────────
    let tasksRewritten = 0
    let skipped = 0
    let failed = 0

    for (const row of targets) {
      let ids: unknown
      try {
        ids = JSON.parse(row.assignees_json as string)
      } catch {
        console.warn(`[assigneesCloudMigration] SKIP malformed assignees_json on cloud task ${row.id}`)
        skipped++
        continue
      }
      if (!Array.isArray(ids) || ids.length === 0) continue
      // Already migrated — a re-run is a no-op, never a double translation.
      if (ids.every(v => typeof v === 'string' && v.includes('@'))) continue

      const mapped: string[] = []
      for (const id of ids as string[]) {
        if (typeof id === 'string' && id.includes('@')) { mapped.push(id); continue }
        const hit = ID_MAP[id]
        if (!hit) {
          // Skip and LOG — never drop, never guess. The id stays in place so the
          // row remains the record of it and the backup still matches reality.
          console.warn(`[assigneesCloudMigration] SKIP unmapped assignee id ${id} on cloud task ${row.id} — left unchanged`)
          skipped++
          mapped.push(id)
          continue
        }
        mapped.push(hit.newEmail)
      }

      try {
        // The EXISTING cloud write path. Passing only assignee_ids means none of
        // updateTask's column_id branches fire — no published_at stamp, no
        // recurrence auto-copy, no prefetch. It stamps updated_at, which is what
        // we want: realtime propagates the rewrite to any open renderer.
        await updateTask(row.id, { assignee_ids: mapped })
        tasksRewritten++
      } catch (e) {
        console.error(`[assigneesCloudMigration] cloud write FAILED for task ${row.id}:`, (e as Error)?.message)
        failed++
      }
    }

    if (failed > 0) {
      // Flag deliberately NOT set. Partial progress is safe to re-run: rewritten
      // rows are all-email and get skipped, the rest are retried.
      console.error(`[assigneesCloudMigration] INCOMPLETE — ${tasksRewritten} rewritten, ${failed} failed, ${skipped} skipped. Flag left unset; will retry next launch.`)
      return { ok: false, tasksRewritten, skipped, reason: `${failed} cloud write(s) failed` }
    }

    setCloudFlag()
    console.log(`[assigneesCloudMigration] done — ${tasksRewritten} rewritten, ${skipped} skipped. Cloud is now email-keyed; syncTasksMirror will pull emails DOWN from here on.`)
    return { ok: true, tasksRewritten, skipped }
  } catch (e) {
    const msg = (e as Error)?.message || 'cloud migration failed'
    console.error('[assigneesCloudMigration] FAILED (flag left unset, will retry next launch):', msg)
    return { ok: false, reason: msg }
  }
}

// Restore cloud assignees_json from the cloud backup, and clear the flag so the
// migration can run again. ⚠ VALID ONLY while no second device has synced the
// rewritten emails down — after that this restores cloud, but the other device's
// mirror already holds emails and will serve them again.
export async function rollbackCloudAssignees(): Promise<MigrationResult> {
  try {
    if (!isOnline()) return { ok: false, reason: 'offline — cloud rollback needs cloud' }
    const { data, error } = await cloud
      .from('assignees_backup_cloud')
      .select('task_id, assignees_json_old')
    if (error) return { ok: false, reason: `cloud backup read failed: ${error.message}` }
    const rows = (data ?? []) as { task_id: string; assignees_json_old: string }[]
    if (rows.length === 0) return { ok: false, reason: 'cloud backup table is empty — nothing to restore' }

    let restored = 0
    let failed = 0
    for (const r of rows) {
      const { error: uErr } = await cloud
        .from('workspace_tasks')
        .update({ assignees_json: r.assignees_json_old, updated_at: new Date().toISOString() })
        .eq('id', r.task_id)
      if (uErr) {
        console.error(`[assigneesCloudMigration] ROLLBACK failed for task ${r.task_id}:`, uErr.message)
        failed++
      } else restored++
    }
    if (failed > 0) return { ok: false, tasksRewritten: restored, reason: `${failed} restore(s) failed` }

    clearCloudFlag()
    console.log(`[assigneesCloudMigration] ROLLBACK done — ${restored} cloud task(s) restored, flag cleared`)
    return { ok: true, tasksRewritten: restored }
  } catch (e) {
    const msg = (e as Error)?.message || 'cloud rollback failed'
    console.error('[assigneesCloudMigration] ROLLBACK FAILED:', msg)
    return { ok: false, reason: msg }
  }
}

// Launch entry point. Never throws out of app startup; logs its own refusal.
export function runCloudAssigneesMigration(): void {
  migrateCloudAssigneesToEmail()
    .then(res => {
      if (!res.ok && res.reason) console.warn('[assigneesCloudMigration]', res.reason)
    })
    .catch(e => console.error('[assigneesCloudMigration] unexpected error at launch:', (e as Error)?.message))
}
