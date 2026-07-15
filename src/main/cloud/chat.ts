import { randomUUID } from 'crypto'
import { cloud, CLOUD_ADMIN_EMAIL } from './client'
import { isOnline } from './connection'
import { getDatabase } from '../db'

// ── Team chat: cloud-sourced (the reusable per-category template) ────────────
// Cloud is the SINGLE SOURCE OF TRUTH: reads come live from the cloud table,
// writes go to the cloud table. No local read fallback, no offline sync. Every
// later content category mirrors this shape: a list(), a create(), and a guarded
// one-time seed().

export interface ChatRow {
  id: string
  author_id: string
  author_name: string
  content: string
  created_at: string
}

const COLS = 'id, author_id, author_name, content, created_at'

// READ — newest `limit` messages, returned oldest→newest (matches the prior
// local ordering the UI expects). Throws on any cloud error (no local fallback).
export async function listChatMessages(limit = 100): Promise<ChatRow[]> {
  if (!isOnline()) return []   // offline: chat unavailable (no local mirror)
  const { data, error } = await cloud
    .from('chat_messages')
    .select(COLS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`chat list failed: ${error.message}`)
  return ((data ?? []) as ChatRow[]).reverse()
}

// WRITE — insert a message to the cloud as the signed-in user. Identity is
// stamped server-side from local_users (the canonical name), so a message is
// always attributed to its real sender. Throws on any cloud error.
export async function sendChatMessage(msg: { author_id: string; author_name: string; content: string }): Promise<ChatRow> {
  const content = (msg.content ?? '').trim()
  if (!content) throw new Error('chat send failed: empty message')
  if (!msg.author_id) throw new Error('chat send failed: missing sender identity')
  let name = msg.author_name
  try {
    const row = getDatabase().prepare('SELECT full_name FROM local_users WHERE id=?').get(msg.author_id) as { full_name?: string } | undefined
    if (row?.full_name) name = row.full_name
  } catch { /* fall back to the supplied name */ }
  const row: ChatRow = {
    id: randomUUID(),
    author_id: msg.author_id,
    author_name: name,
    content,
    created_at: new Date().toISOString(),
  }
  const { data, error } = await cloud.from('chat_messages').insert(row).select(COLS).single()
  if (error) throw new Error(`chat send failed: ${error.message}`)
  return data as ChatRow
}

// ONE-TIME SEED (guarded). Uploads THIS machine's existing local chat history to
// the cloud — the founding dataset. Two independent guards make it safe to call
// again, and safe against running from another machine:
//   1. Admin-only: only the system admin email may invoke it.
//   2. No-op if the cloud table already has any rows (the founding dataset is
//      seeded exactly once, from whichever machine runs first; every later run
//      or other machine sees a non-empty cloud and no-ops).
// Admin-authored messages are excluded (admin is not a chat participant). Rows
// are deduped by id, so even a forced re-run cannot duplicate. Local rows are
// NEVER deleted — they remain as a backup.
export async function seedChatToCloud(requestEmail: string): Promise<{ ok: boolean; uploaded: number; reason?: string }> {
  if ((requestEmail ?? '').toLowerCase() !== CLOUD_ADMIN_EMAIL) {
    return { ok: false, uploaded: 0, reason: 'Only the admin can run the one-time chat seed.' }
  }

  // Guard: cloud must be empty.
  const { count, error: cErr } = await cloud.from('chat_messages').select('id', { count: 'exact', head: true })
  if (cErr) return { ok: false, uploaded: 0, reason: `cloud check failed: ${cErr.message}` }
  if ((count ?? 0) > 0) return { ok: true, uploaded: 0, reason: 'Cloud chat already seeded — no-op.' }

  // Resolve admin local id(s) so admin-authored messages are excluded.
  const adminIds = new Set<string>(['local-admin'])
  try {
    const r = getDatabase().prepare("SELECT id FROM local_users WHERE LOWER(email)=?").all(CLOUD_ADMIN_EMAIL) as { id: string }[]
    r.forEach(x => adminIds.add(x.id))
  } catch { /* ignore */ }

  const allRows = getDatabase()
    .prepare(`SELECT ${COLS} FROM chat_messages ORDER BY created_at ASC`)
    .all() as ChatRow[]
  const rows = allRows.filter(r => !adminIds.has(r.author_id))
  if (!rows.length) return { ok: true, uploaded: 0, reason: 'No local chat history to seed.' }

  // Dedup by id so a re-run can never duplicate.
  const { error: insErr } = await cloud.from('chat_messages').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
  if (insErr) return { ok: false, uploaded: 0, reason: `seed insert failed: ${insErr.message}` }
  return { ok: true, uploaded: rows.length }
}
