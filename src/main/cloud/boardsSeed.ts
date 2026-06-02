import { cloud, CLOUD_ADMIN_EMAIL } from './client'
import { getDatabase } from '../db'

// ── One-time seed: local board tables → cloud (Stage 2, category 3) ──────────
// Mirrors seedChatToCloud / seedContactsToCloud. Guards:
//   1. Admin-only (requestEmail === CLOUD_ADMIN_EMAIL).
//   2. No-op if the cloud workspace_boards table already has ANY rows — the
//      founding dataset is seeded exactly once, from this machine; every other
//      run/machine sees a non-empty table and does nothing.
// Rows are deduped by id (upsert/ignore), local rows are NEVER deleted, and
// task_attachments is intentionally EXCLUDED (out of scope — stays local).
// FK-safe order: boards/areas/projects/labels → columns → tasks →
// comments/checklists/items/labels/activity/templates → board_members LAST.
// board_members.user_id (a device-local id) is translated to the stable EMAIL,
// because membership is email-keyed in the cloud; the admin is excluded (never a
// board member). Memberships are the founding source of truth for who sees what.

async function upsertBatch(table: string, rows: Record<string, unknown>[], conflictCol: string): Promise<number> {
  if (!rows.length) return 0
  const BATCH = 200
  let uploaded = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await cloud.from(table).upsert(chunk, { onConflict: conflictCol, ignoreDuplicates: true })
    if (error) throw new Error(`seed ${table} failed: ${error.message}`)
    uploaded += chunk.length
  }
  return uploaded
}

export async function seedBoardsToCloud(requestEmail: string): Promise<{
  ok: boolean
  counts?: Record<string, number>
  reason?: string
}> {
  if ((requestEmail ?? '').toLowerCase() !== CLOUD_ADMIN_EMAIL) {
    return { ok: false, counts: {}, reason: 'Only the admin can run the one-time boards seed.' }
  }

  // Guard: no-op if cloud workspace_boards is non-empty.
  const { count, error: cErr } = await cloud.from('workspace_boards').select('id', { count: 'exact', head: true })
  if (cErr) return { ok: false, counts: {}, reason: `cloud check failed: ${cErr.message}` }
  if ((count ?? 0) > 0) return { ok: true, counts: {}, reason: 'Cloud boards already seeded — no-op.' }

  const db = getDatabase()
  const counts: Record<string, number> = {}
  const all = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[]

  // 1. parents (no board FK dependencies)
  counts.workspace_boards = await upsertBatch('workspace_boards', all('SELECT id,name,position,archived,archived_at,archived_by,created_at,updated_at,deleted FROM workspace_boards'), 'id')
  counts.areas    = await upsertBatch('areas',    all('SELECT id,name,color,is_default,position,created_at FROM areas'), 'id')
  counts.projects = await upsertBatch('projects', all('SELECT id,title,description,status,owner_id,created_at,updated_at FROM projects'), 'id')
  counts.labels   = await upsertBatch('labels',   all('SELECT id,name,color,position,created_at FROM labels'), 'id')

  // 2. columns (FK → boards)
  counts.workspace_columns = await upsertBatch('workspace_columns', all('SELECT id,name,position,color,board_id FROM workspace_columns'), 'id')

  // 3. tasks (FK → boards). Local has exactly the cloud columns, so SELECT * is safe.
  counts.workspace_tasks = await upsertBatch('workspace_tasks', all('SELECT * FROM workspace_tasks'), 'id')

  // 4. task children (FK → tasks; checklist_items FK → checklists)
  counts.task_comments        = await upsertBatch('task_comments',        all('SELECT id,task_id,author_id,author_name,content,created_at,updated_at,mentions_json FROM task_comments'), 'id')
  counts.task_checklists      = await upsertBatch('task_checklists',      all('SELECT id,task_id,title,position,created_at FROM task_checklists'), 'id')
  counts.task_checklist_items = await upsertBatch('task_checklist_items', all('SELECT id,checklist_id,task_id,text,checked,position,created_at FROM task_checklist_items'), 'id')
  counts.task_labels          = await upsertBatch('task_labels',          all('SELECT task_id,label_id FROM task_labels'), 'task_id,label_id')
  counts.task_activity        = await upsertBatch('task_activity',        all('SELECT id,task_id,actor_name,action,created_at FROM task_activity'), 'id')
  counts.task_templates       = await upsertBatch('task_templates',       all('SELECT id,name,content_type,duration_days,checklist_json,is_builtin,board_id,created_at,updated_at FROM task_templates'), 'id')

  // 5. board_members LAST — translate local user_id → stable email; exclude admin.
  const emailById = new Map<string, string>()
  try {
    for (const u of db.prepare('SELECT id, email FROM local_users').all() as { id: string; email: string }[]) {
      emailById.set(u.id, (u.email ?? '').toLowerCase())
    }
  } catch { /* */ }
  const localMembers = db.prepare('SELECT board_id, user_id, added_by, added_at FROM board_members').all() as
    { board_id: string; user_id: string; added_by: string | null; added_at: string }[]
  const memberRows: Record<string, unknown>[] = []
  for (const m of localMembers) {
    const email = m.user_id === 'local-admin' ? CLOUD_ADMIN_EMAIL : (emailById.get(m.user_id) ?? '')
    if (!email || email === CLOUD_ADMIN_EMAIL) continue // admin is never a board member; skip unresolvable
    const addedByEmail = m.added_by && emailById.get(m.added_by) ? emailById.get(m.added_by) : (m.added_by ?? null)
    memberRows.push({ board_id: m.board_id, user_email: email, added_by_email: addedByEmail, added_at: m.added_at })
  }
  counts.board_members = await upsertBatch('board_members', memberRows, 'board_id,user_email')

  return { ok: true, counts }
}
