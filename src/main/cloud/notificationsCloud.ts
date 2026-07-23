import { cloud } from './client'
import { isOnline, reportCloudResult } from './connection'
import { getDatabase } from '../db'

// ── Notifications: cloud-sourced with a local offline MIRROR (N-2a) ──────────
// Follows the tags.ts two-tier convention: cloud is the SOURCE OF TRUTH, the
// local SQLite `notifications` table is an OFFLINE MIRROR, every function
// returns { ok, error? } instead of throwing, and reads short-circuit to the
// mirror when offline. Renderer → IPC → main → here; the renderer never touches
// Supabase. The service-role key bypasses RLS (main is the trusted tier); RLS on
// the cloud table is the backstop against the anon key.
//
// ⚠ TWO WAYS THIS DIFFERS FROM tags.ts — both load-bearing:
//
// 1. THE MIRROR IS NOT A CACHE. known_tags' mirror is a pure copy of cloud, so
//    it can be rebuilt with delete-then-insert. Here 454 local rows (432 read=1
//    orphans + 22 rows whose recipient never resolved) exist ONLY locally and
//    will NEVER be in cloud — N-2a deliberately seeds nothing. A scoped DELETE
//    would destroy history that has no cloud copy. Mirror sync is therefore
//    UPSERT-BY-ID ONLY. This app has no delete path for notifications at all,
//    and this module does not add one.
//
// 2. READS REPORT TO THE CONNECTION TIER, WRITES DO NOT. Notifications are
//    high-frequency, high-fanout, timer-driven side effects. reportCloudResult
//    flips the whole app OFFLINE after 2 consecutive failures — locking editing
//    and switching every read to a mirror. Letting a fire-and-forget notification
//    write trigger that would take the app down over something nobody awaited.

// Cloud `read` is BOOLEAN; SQLite `read` is INTEGER 0/1. Convert EXPLICITLY at
// every boundary — a truthy object is not the same as 1, and `read` is the one
// mutable field on the row, so a half-conversion looks like it works until a
// row round-trips.
const toSqliteRead = (v: unknown): 0 | 1 => (v === true || v === 1 || v === '1' ? 1 : 0)

// Cloud created_at is TIMESTAMPTZ (ISO, 'T' + offset); the local column is a
// DATETIME written by CURRENT_TIMESTAMP as 'YYYY-MM-DD HH:MM:SS' (UTC, space).
// Normalize cloud → the LOCAL shape so the mirror stays internally consistent:
// ORDER BY created_at is a STRING comparison in SQLite, and ' ' (0x20) sorts
// before 'T' (0x54), so mixing the two formats would reorder same-day rows.
// This keeps display behavior byte-identical to today.
function toLocalTimestamp(value: unknown): string {
  const s = String(value ?? '')
  if (!s) return new Date().toISOString().slice(0, 19).replace('T', ' ')
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s.slice(0, 19).replace('T', ' ')
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export interface NotificationRow {
  id: string
  user_email: string
  type: string
  title: string
  body: string | null
  task_id: string | null
  task_title: string | null
  actor_name: string | null
  read: number
  created_at: string
}

const SELECT_COLS = 'id, user_email, type, title, body, task_id, task_title, actor_name, read, created_at'
const PAGE_LIMIT = 100

// Shape a cloud row into the renderer's AppNotification (read as 0/1, local ts).
function fromCloud(r: Record<string, unknown>): NotificationRow {
  return {
    id: String(r.id),
    user_email: String(r.user_email ?? ''),
    type: String(r.type ?? ''),
    title: String(r.title ?? ''),
    body: (r.body as string | null) ?? null,
    task_id: (r.task_id as string | null) ?? null,
    task_title: (r.task_title as string | null) ?? null,
    actor_name: (r.actor_name as string | null) ?? null,
    read: toSqliteRead(r.read),
    created_at: toLocalTimestamp(r.created_at),
  }
}

// Read the mirror for one recipient (offline fallback + last-known cache).
// Same query the pre-N-2a local handler ran, so offline behavior is unchanged.
function readMirror(userEmail: string): NotificationRow[] {
  try {
    return getDatabase()
      .prepare(`SELECT ${SELECT_COLS} FROM notifications WHERE user_email=? ORDER BY created_at DESC LIMIT ${PAGE_LIMIT}`)
      .all(userEmail) as NotificationRow[]
  } catch (e) {
    console.warn('[notifications] local mirror read failed:', (e as Error)?.message)
    return []
  }
}

function readMirrorUnreadCount(userEmail: string): number {
  try {
    const row = getDatabase()
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_email=? AND read=0')
      .get(userEmail) as { c: number } | undefined
    return row?.c ?? 0
  } catch (e) {
    console.warn('[notifications] local mirror count failed:', (e as Error)?.message)
    return 0
  }
}

// Refresh the mirror from a cloud read. UPSERT BY ID — never delete (see the
// header note). One transaction so a partial write cannot leave a torn set.
// Best-effort: the read is already satisfied from cloud, so a mirror failure
// must NOT fail it.
function syncMirror(rows: NotificationRow[]): void {
  if (!rows.length) return
  try {
    const db = getDatabase()
    const ins = db.prepare(`
      INSERT INTO notifications (id,user_email,type,title,body,task_id,task_title,actor_name,read,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        read       = excluded.read,
        title      = excluded.title,
        body       = excluded.body,
        task_title = excluded.task_title,
        actor_name = excluded.actor_name`)
    const tx = db.transaction((list: NotificationRow[]) => {
      for (const r of list) {
        ins.run(r.id, r.user_email, r.type, r.title, r.body, r.task_id, r.task_title, r.actor_name, toSqliteRead(r.read), r.created_at)
      }
    })
    tx(rows)
  } catch (e) {
    console.warn('[notifications] local mirror sync failed (read still served from cloud):', (e as Error)?.message)
  }
}

// Cloud read → refresh mirror → return. On offline or cloud error, FALL BACK to
// the mirror. Never throws; always an array.
export async function getNotifications(userEmail: string): Promise<NotificationRow[]> {
  if (!userEmail) return []
  if (!isOnline()) return readMirror(userEmail)
  try {
    const { data, error } = await cloud
      .from('notifications')
      .select(SELECT_COLS)
      .eq('user_email', userEmail)
      .order('created_at', { ascending: false })
      .limit(PAGE_LIMIT)
    reportCloudResult(!error)
    if (error) {
      console.warn('[notifications] cloud read failed, serving local mirror:', error.message)
      return readMirror(userEmail)
    }
    const rows = ((data ?? []) as Record<string, unknown>[]).map(fromCloud)
    syncMirror(rows)
    return rows
  } catch (e) {
    console.warn('[notifications] cloud read threw, serving local mirror:', (e as Error)?.message)
    return readMirror(userEmail)
  }
}

// Unread badge count. Cloud count when online, mirror when offline or on error.
// NOTE: head:true is fine HERE — this counts rows in a table we know exists. It
// must NEVER be used as an existence check: against a missing table it returns
// { count: null, error: null }, i.e. it reports success for a table that is not
// there.
export async function getUnreadCount(userEmail: string): Promise<number> {
  if (!userEmail) return 0
  if (!isOnline()) return readMirrorUnreadCount(userEmail)
  try {
    const { count, error } = await cloud
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_email', userEmail)
      .eq('read', false)
    reportCloudResult(!error)
    if (error) {
      console.warn('[notifications] cloud unread count failed, serving local mirror:', error.message)
      return readMirrorUnreadCount(userEmail)
    }
    return count ?? 0
  } catch (e) {
    console.warn('[notifications] cloud unread count threw, serving local mirror:', (e as Error)?.message)
    return readMirrorUnreadCount(userEmail)
  }
}

// Insert one notification into cloud. The MIRROR IS WRITTEN BY THE CALLER
// (createNotification, the single choke point) regardless of this result — the
// row must exist locally either way.
// ⚠ Does NOT call reportCloudResult: writes must not move the connection verdict
// (see the header note). Never throws.
export async function createNotificationCloud(row: NotificationRow): Promise<{ ok: boolean; error?: string }> {
  if (!row?.id || !row.user_email) return { ok: false, error: 'missing id or recipient' }
  if (!isOnline()) return { ok: false, error: 'offline' }
  try {
    const { error } = await cloud.from('notifications').insert({
      id: row.id,
      user_email: row.user_email,
      type: row.type,
      title: row.title,
      body: row.body,
      task_id: row.task_id,
      task_title: row.task_title,
      actor_name: row.actor_name,
      read: toSqliteRead(row.read) === 1,   // INTEGER → BOOLEAN for the cloud column
      created_at: new Date().toISOString(),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'insert threw' }
  }
}

// Mark ONE notification read. ONLINE-REQUIRED: a local-only read flag would be
// silently reverted by the next cloud read, which is worse than not applying it.
// Offline mark-read needs a sync queue — that is N-2b.
export async function markRead(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'missing id' }
  if (!isOnline()) {
    console.warn('[notifications] markRead skipped — offline (no optimistic mirror write; N-2b adds the queue)')
    return { ok: false, error: 'offline' }
  }
  try {
    const { error } = await cloud.from('notifications').update({ read: true }).eq('id', id)
    reportCloudResult(!error)
    if (error) {
      console.warn('[notifications] cloud markRead failed:', error.message)
      return { ok: false, error: error.message }
    }
    try {
      getDatabase().prepare('UPDATE notifications SET read=1 WHERE id=?').run(id)
    } catch (e) {
      console.warn('[notifications] mirror markRead failed (cloud already updated):', (e as Error)?.message)
    }
    return { ok: true }
  } catch (e) {
    console.warn('[notifications] cloud markRead threw:', (e as Error)?.message)
    return { ok: false, error: (e as Error)?.message ?? 'update threw' }
  }
}

// Mark every unread notification for one recipient read. Same online-required
// rule as markRead.
export async function markAllRead(userEmail: string): Promise<{ ok: boolean; error?: string }> {
  if (!userEmail) return { ok: false, error: 'no recipient' }
  if (!isOnline()) {
    console.warn('[notifications] markAllRead skipped — offline (no optimistic mirror write; N-2b adds the queue)')
    return { ok: false, error: 'offline' }
  }
  try {
    const { error } = await cloud
      .from('notifications')
      .update({ read: true })
      .eq('user_email', userEmail)
      .eq('read', false)
    reportCloudResult(!error)
    if (error) {
      console.warn('[notifications] cloud markAllRead failed:', error.message)
      return { ok: false, error: error.message }
    }
    try {
      getDatabase().prepare('UPDATE notifications SET read=1 WHERE user_email=? AND read=0').run(userEmail)
    } catch (e) {
      console.warn('[notifications] mirror markAllRead failed (cloud already updated):', (e as Error)?.message)
    }
    return { ok: true }
  } catch (e) {
    console.warn('[notifications] cloud markAllRead threw:', (e as Error)?.message)
    return { ok: false, error: (e as Error)?.message ?? 'update threw' }
  }
}
