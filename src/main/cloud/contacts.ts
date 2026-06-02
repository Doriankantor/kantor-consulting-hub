import { randomUUID } from 'crypto'
import { cloud } from './client'
import { getDatabase } from '../db'

// ── Contacts / CRM: cloud-sourced (Stage 2, category 2) ─────────────────────
// Mirrors the chat.ts pattern: cloud is the single source of truth for contacts,
// contact_interactions, contact_task_links, clients, and client_contacts.
// The only exception is workspace_tasks: task links store task IDs in the cloud,
// but the task RECORDS themselves are still resolved from local SQLite (workspace
// tasks are not yet migrated). contacts:get and clients:get therefore do a two-
// step read: cloud for contacts/interactions/links, local for task data.
//
// Deletion is a SHARED SOFT-DELETE: a deleted contact gets deleted_at/deleted_by
// set (cloud), leaves the active list for everyone, and shows in the team-wide
// Trash. Any member can soft-delete/restore; only the admin can permanently
// delete (admin check enforced in the main process — see permanentDeleteContact).

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────────────────────────────────────

// Active contacts only (deleted_at IS NULL). Trashed rows live in listTrashedContacts.
export async function listContacts(): Promise<Record<string, unknown>[]> {
  const { data, error } = await cloud
    .from('contacts')
    .select('*')
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
  if (error) throw new Error(`contacts list failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

// Shared trash: every trashed contact (deleted_at IS NOT NULL), team-wide.
export async function listTrashedContacts(): Promise<Record<string, unknown>[]> {
  const { data, error } = await cloud
    .from('contacts')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) throw new Error(`contacts trash list failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

export async function getContact(id: string): Promise<{
  contact: Record<string, unknown> | null
  interactions: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
}> {
  const [contactRes, interactionsRes, linksRes] = await Promise.all([
    cloud.from('contacts').select('*').eq('id', id).single(),
    cloud.from('contact_interactions').select('*').eq('contact_id', id).order('date', { ascending: false }),
    cloud.from('contact_task_links').select('task_id').eq('contact_id', id),
  ])
  if (contactRes.error && contactRes.error.code !== 'PGRST116') {
    throw new Error(`contacts get failed: ${contactRes.error.message}`)
  }
  if (interactionsRes.error) throw new Error(`interactions get failed: ${interactionsRes.error.message}`)
  if (linksRes.error) throw new Error(`task links get failed: ${linksRes.error.message}`)

  // Resolve task data from LOCAL SQLite (workspace_tasks not migrated yet)
  const taskIds = ((linksRes.data ?? []) as { task_id: string }[]).map(r => r.task_id)
  let tasks: Record<string, unknown>[] = []
  if (taskIds.length > 0) {
    try {
      tasks = getDatabase()
        .prepare(`SELECT id,title,column_id,due_date,priority,content_type FROM workspace_tasks
                  WHERE id IN (${taskIds.map(() => '?').join(',')})
                  ORDER BY due_date ASC`)
        .all(...taskIds) as Record<string, unknown>[]
    } catch { tasks = [] }
  }
  return {
    contact: (contactRes.data ?? null) as Record<string, unknown> | null,
    interactions: (interactionsRes.data ?? []) as Record<string, unknown>[],
    tasks,
  }
}

export async function createContact(data: Record<string, unknown>): Promise<{ ok: boolean; id: string }> {
  const id = (data.id as string | undefined) || randomUUID()
  const now = new Date().toISOString()
  const row = {
    id,
    full_name:            data.full_name,
    job_title:            data.job_title ?? null,
    organization:         data.organization ?? null,
    contact_types_json:   typeof data.contact_types === 'object' ? JSON.stringify(data.contact_types) : (data.contact_types_json ?? '[]'),
    email_primary:        data.email_primary ?? null,
    email_secondary:      data.email_secondary ?? null,
    phone_primary:        data.phone_primary ?? null,
    phone_mobile:         data.phone_mobile ?? null,
    phone_secondary:      data.phone_secondary ?? null,
    linkedin_url:         data.linkedin_url ?? null,
    twitter_handle:       data.twitter_handle ?? null,
    telegram_username:    data.telegram_username ?? null,
    website_url:          data.website_url ?? null,
    country:              data.country ?? null,
    city:                 data.city ?? null,
    languages_json:       typeof data.languages === 'object' ? JSON.stringify(data.languages) : (data.languages_json ?? '[]'),
    org_type:             data.org_type ?? null,
    expertise_areas_json: typeof data.expertise_areas === 'object' ? JSON.stringify(data.expertise_areas) : (data.expertise_areas_json ?? '[]'),
    security_sensitivity: data.security_sensitivity ?? 'none',
    how_we_met:           data.how_we_met ?? null,
    how_we_met_note:      data.how_we_met_note ?? null,
    assigned_to:          data.assigned_to ?? null,
    last_contacted_date:  data.last_contacted_date ?? null,
    confidential:         data.confidential ?? 0,
    do_not_contact:       data.do_not_contact ?? 0,
    internal_notes:       data.internal_notes ?? null,
    notes_updated_by:     data.notes_updated_by ?? null,
    notes_updated_at:     data.notes_updated_at ?? null,
    created_by:           data.created_by ?? null,
    created_at:           data.created_at ?? now,
    updated_at:           data.updated_at ?? now,
  }
  const { error } = await cloud.from('contacts').insert(row)
  if (error) throw new Error(`contacts create failed: ${error.message}`)
  return { ok: true, id }
}

export async function updateContact(id: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const scalarFields = [
    'full_name','job_title','organization','email_primary','email_secondary',
    'phone_primary','phone_mobile','phone_secondary','linkedin_url','twitter_handle',
    'telegram_username','website_url','country','city','org_type','security_sensitivity',
    'how_we_met','how_we_met_note','assigned_to','last_contacted_date',
    'confidential','do_not_contact','internal_notes','notes_updated_by','notes_updated_at',
  ]
  for (const f of scalarFields) { if (f in data) patch[f] = data[f] }
  if ('contact_types' in data)   patch['contact_types_json']   = JSON.stringify(data.contact_types)
  if ('languages' in data)       patch['languages_json']       = JSON.stringify(data.languages)
  if ('expertise_areas' in data) patch['expertise_areas_json'] = JSON.stringify(data.expertise_areas)
  const { error } = await cloud.from('contacts').update(patch).eq('id', id)
  if (error) throw new Error(`contacts update failed: ${error.message}`)
  return { ok: true }
}

// SHARED SOFT-DELETE TRASH (Stage 2, category 2 — trash). Deleting a contact
// sets deleted_at/deleted_by so it drops out of the active list for everyone and
// appears in the shared Trash. Any authenticated member may soft-delete or
// restore; only the admin may permanently delete (enforced in the main process —
// the service-role key bypasses RLS, so the gate lives here, not only in SQL).

// Soft-delete: move a contact to the shared trash. Any team member.
export async function softDeleteContact(id: string, deletedBy: string | null): Promise<{ ok: boolean }> {
  const { error } = await cloud
    .from('contacts')
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy ?? null })
    .eq('id', id)
  if (error) throw new Error(`contacts soft-delete failed: ${error.message}`)
  return { ok: true }
}

// Restore: clear the trash markers so the contact returns to the active list.
// Any team member.
export async function restoreContact(id: string): Promise<{ ok: boolean }> {
  const { error } = await cloud
    .from('contacts')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id)
  if (error) throw new Error(`contacts restore failed: ${error.message}`)
  return { ok: true }
}

// Permanent delete: hard DELETE from cloud (CASCADE handles interactions +
// task_links). ADMIN ONLY — the requesting user's email is verified here in the
// main process before the delete is issued (RLS cannot gate the service-role key).
export async function permanentDeleteContact(id: string, requestEmail: string): Promise<{ ok: boolean; reason?: string }> {
  if ((requestEmail ?? '').toLowerCase() !== CLOUD_ADMIN) {
    return { ok: false, reason: 'Only the admin can permanently delete contacts.' }
  }
  const { error } = await cloud.from('contacts').delete().eq('id', id)
  if (error) throw new Error(`contacts permanent delete failed: ${error.message}`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function addInteraction(data: Record<string, unknown>): Promise<{ ok: boolean; id: string }> {
  const id = (data.id as string | undefined) || randomUUID()
  const now = new Date().toISOString()
  const row = {
    id,
    contact_id:     data.contact_id,
    date:           data.date,
    type:           data.type ?? 'Meeting',
    summary:        data.summary,
    logged_by_id:   data.logged_by_id ?? null,
    logged_by_name: data.logged_by_name ?? null,
    follow_up:      data.follow_up ?? 0,
    follow_up_date: data.follow_up_date ?? null,
    created_at:     data.created_at ?? now,
    updated_at:     data.updated_at ?? now,
  }
  const { error } = await cloud.from('contact_interactions').insert(row)
  if (error) throw new Error(`add interaction failed: ${error.message}`)
  // Update last_contacted_date on the contact (unconditionally -- the interaction
  // date is the most recent we know about; fire-and-forget, main insert succeeded).
  try {
    await cloud.from('contacts')
      .update({ last_contacted_date: data.date, updated_at: now })
      .eq('id', data.contact_id as string)
  } catch { /* non-fatal */ }
  return { ok: true, id }
}

export async function updateInteraction(id: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of ['date','type','summary','follow_up','follow_up_date']) {
    if (f in data) patch[f] = data[f]
  }
  const { error } = await cloud.from('contact_interactions').update(patch).eq('id', id)
  if (error) throw new Error(`update interaction failed: ${error.message}`)
  return { ok: true }
}

export async function deleteInteraction(id: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('contact_interactions').delete().eq('id', id)
  if (error) throw new Error(`delete interaction failed: ${error.message}`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK LINKS
// ─────────────────────────────────────────────────────────────────────────────

export async function linkTask(contactId: string, taskId: string): Promise<{ ok: boolean }> {
  const { error } = await cloud
    .from('contact_task_links')
    .upsert({ contact_id: contactId, task_id: taskId, created_at: new Date().toISOString() }, { onConflict: 'contact_id,task_id', ignoreDuplicates: true })
  if (error) throw new Error(`link task failed: ${error.message}`)
  return { ok: true }
}

export async function unlinkTask(contactId: string, taskId: string): Promise<{ ok: boolean }> {
  const { error } = await cloud
    .from('contact_task_links')
    .delete()
    .eq('contact_id', contactId)
    .eq('task_id', taskId)
  if (error) throw new Error(`unlink task failed: ${error.message}`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────────────────────────────────────────

export async function listClients(): Promise<Record<string, unknown>[]> {
  const { data, error } = await cloud.from('clients').select('*').order('name', { ascending: true })
  if (error) throw new Error(`clients list failed: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

export async function getClient(id: string): Promise<{
  client: Record<string, unknown> | null
  contacts: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
}> {
  const [clientRes, contactsRes] = await Promise.all([
    cloud.from('clients').select('*').eq('id', id).single(),
    cloud.from('client_contacts').select('*').eq('client_id', id).order('created_at', { ascending: true }),
  ])
  if (clientRes.error && clientRes.error.code !== 'PGRST116') {
    throw new Error(`clients get failed: ${clientRes.error.message}`)
  }
  if (contactsRes.error) throw new Error(`client_contacts get failed: ${contactsRes.error.message}`)

  // Resolve linked workspace tasks from LOCAL SQLite (not migrated yet)
  let tasks: Record<string, unknown>[] = []
  try {
    tasks = getDatabase()
      .prepare(`SELECT id,title,column_id,due_date,priority,content_type FROM workspace_tasks
                WHERE client_id=? ORDER BY due_date ASC`)
      .all(id) as Record<string, unknown>[]
  } catch { tasks = [] }

  return {
    client:   (clientRes.data ?? null) as Record<string, unknown> | null,
    contacts: (contactsRes.data ?? []) as Record<string, unknown>[],
    tasks,
  }
}

export async function createClientRecord(data: Record<string, unknown>): Promise<{ ok: boolean; id: string }> {
  const id = (data.id as string | undefined) || randomUUID()
  const now = new Date().toISOString()
  const row = {
    id,
    name:                   data.name,
    type:                   data.type ?? 'Private',
    country:                data.country ?? null,
    region:                 data.region ?? null,
    status:                 data.status ?? 'Active',
    primary_contact_name:   data.primary_contact_name ?? null,
    primary_contact_email:  data.primary_contact_email ?? null,
    primary_contact_phone:  data.primary_contact_phone ?? null,
    notes:                  data.notes ?? null,
    area_tags_json:         typeof data.area_tags === 'object' ? JSON.stringify(data.area_tags) : (data.area_tags_json ?? '[]'),
    created_at:             data.created_at ?? now,
    updated_at:             data.updated_at ?? now,
  }
  const { error } = await cloud.from('clients').insert(row)
  if (error) throw new Error(`clients create failed: ${error.message}`)
  return { ok: true, id }
}

export async function updateClient(id: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const fields = ['name','type','country','region','status',
    'primary_contact_name','primary_contact_email','primary_contact_phone','notes']
  for (const f of fields) { if (f in data) patch[f] = data[f] }
  if ('area_tags' in data) patch['area_tags_json'] = JSON.stringify(data.area_tags)
  const { error } = await cloud.from('clients').update(patch).eq('id', id)
  if (error) throw new Error(`clients update failed: ${error.message}`)
  return { ok: true }
}

export async function deleteClient(id: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('clients').delete().eq('id', id)
  if (error) throw new Error(`clients delete failed: ${error.message}`)
  return { ok: true }
}

export async function addClientContact(clientId: string, contact: Record<string, unknown>): Promise<{ ok: boolean; id: string }> {
  const id = (contact.id as string | undefined) || randomUUID()
  const row = {
    id,
    client_id:  clientId,
    name:       contact.name,
    role:       contact.role ?? null,
    email:      contact.email ?? null,
    phone:      contact.phone ?? null,
    created_at: contact.created_at ?? new Date().toISOString(),
  }
  const { error } = await cloud.from('client_contacts').insert(row)
  if (error) throw new Error(`client contact add failed: ${error.message}`)
  return { ok: true, id }
}

export async function deleteClientContact(contactId: string): Promise<{ ok: boolean }> {
  const { error } = await cloud.from('client_contacts').delete().eq('id', contactId)
  if (error) throw new Error(`client contact delete failed: ${error.message}`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME SEED (guarded — mirrors seedChatToCloud)
// ─────────────────────────────────────────────────────────────────────────────
// Guards:
//   1. Admin-only (requestEmail === doriankantor@gmail.com)
//   2. No-op if the cloud contacts table already has ANY rows — the founding
//      dataset is seeded exactly once from this machine; every other run/machine
//      sees a non-empty table and does nothing. Deduped by id (upsert/ignore) so
//      a forced re-run cannot duplicate. Local rows are never deleted.
// FK-safe upload order: clients & contacts first, then dependent tables.

const CLOUD_ADMIN = 'doriankantor@gmail.com'

export async function seedContactsToCloud(requestEmail: string): Promise<{
  ok: boolean
  counts?: Record<string, number>
  reason?: string
}> {
  if ((requestEmail ?? '').toLowerCase() !== CLOUD_ADMIN) {
    return { ok: false, counts: {}, reason: 'Only the admin can run the one-time contacts seed.' }
  }

  // Guard: no-op if cloud contacts table is non-empty
  const { count, error: cErr } = await cloud
    .from('contacts')
    .select('id', { count: 'exact', head: true })
  if (cErr) return { ok: false, counts: {}, reason: `cloud check failed: ${cErr.message}` }
  if ((count ?? 0) > 0) {
    return { ok: true, counts: {}, reason: 'Cloud contacts already seeded — no-op.' }
  }

  const db = getDatabase()
  const counts: Record<string, number> = {}

  async function upsertBatch(table: string, rows: Record<string, unknown>[], conflictCol: string): Promise<number> {
    if (!rows.length) return 0
    const BATCH = 100
    let uploaded = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH)
      const { error } = await cloud.from(table).upsert(chunk, { onConflict: conflictCol, ignoreDuplicates: true })
      if (error) throw new Error(`seed ${table} failed: ${error.message}`)
      uploaded += chunk.length
    }
    return uploaded
  }

  // 1. clients (no FK dependencies)
  const clients = db.prepare('SELECT * FROM clients').all() as Record<string, unknown>[]
  counts.clients = await upsertBatch('clients', clients, 'id')

  // 2. contacts (no FK dependencies)
  const contacts = db.prepare('SELECT * FROM contacts').all() as Record<string, unknown>[]
  counts.contacts = await upsertBatch('contacts', contacts, 'id')

  // 3. client_contacts (FK → clients)
  const clientContacts = db.prepare('SELECT * FROM client_contacts').all() as Record<string, unknown>[]
  counts.client_contacts = await upsertBatch('client_contacts', clientContacts, 'id')

  // 4. contact_interactions (FK → contacts)
  const interactions = db.prepare('SELECT * FROM contact_interactions').all() as Record<string, unknown>[]
  counts.contact_interactions = await upsertBatch('contact_interactions', interactions, 'id')

  // 5. contact_task_links (FK → contacts; task_id is local-only but stored as text)
  const taskLinks = db.prepare('SELECT * FROM contact_task_links').all() as Record<string, unknown>[]
  counts.contact_task_links = await upsertBatch('contact_task_links', taskLinks, 'contact_id,task_id')

  return { ok: true, counts }
}
