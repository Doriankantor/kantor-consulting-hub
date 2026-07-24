import { cloud } from './client'
import { isOnline, reportCloudResult, isTransportError, isTransportStatus } from './connection'
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

// The INVERSE of toLocalTimestamp, for the sweep: local 'YYYY-MM-DD HH:MM:SS' →
// cloud ISO with an explicit 'Z'.
//
// ⚠ THIS PRESERVES THE ORIGINAL TIME — it never stamps now(). The mirror string is
// UTC (written by SQLite CURRENT_TIMESTAMP) but carries NO zone, so sending it
// bare to a TIMESTAMPTZ column makes Postgres apply the session timezone and shift
// every swept row. Appending 'Z' is what keeps a swept notification at the moment
// it actually happened.
//
// ⚠ Deliberately NOT the approach createNotificationCloud uses — that one sends
// `new Date().toISOString()` and IGNORES row.created_at, which is right for a
// brand-new notification and wrong here.
function toCloudTimestamp(value: unknown): string {
  const s = String(value ?? '').trim()
  if (!s) return new Date().toISOString()
  // Already ISO (has a zone or a 'T') — hand it over untouched.
  if (s.includes('T')) return s
  const iso = `${s.replace(' ', 'T')}Z`
  const d = new Date(iso)
  // Unparseable: fall back to now() rather than sending a string Postgres will
  // reject and fail the whole chunk with it.
  if (Number.isNaN(d.getTime())) {
    console.warn(`[notifications] unparseable created_at "${s}" — stamping now() for the cloud copy`)
    return new Date().toISOString()
  }
  return d.toISOString()
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
// Sweep batch size — bounded so one PostgREST request stays well inside payload
// limits even after a long outage.
const SWEEP_CHUNK = 200

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
//
// ★ THE `WHERE notifications.pending_sync = 0` GUARD IS LOAD-BEARING (N-2c-2).
// Without it this function is a DATA-LOSS PATH, not a cache refresh. A row marked
// read offline is mirror read=1 / pending_sync=1 while cloud still says read=false.
// `read = excluded.read` would flip the mirror back to 0 — and pending_sync is NOT
// in the SET list, so the row stays marked and the sweep then pushes read=false to
// cloud, destroying the flag permanently. Worse, getNotifications calls this at :219
// and mergePending at :220, so the clobber lands BEFORE the merge in the SAME call —
// mergePending cannot save the row.
//
// This is the write-side statement of the rule mergePending already states on the
// read side (see :175): a row that is still marked pending is by definition the
// version cloud does not have, so the mirror wins. Skipping the whole update (rather
// than a CASE on `read` alone) costs nothing — cloud never mutates title/body/
// task_title/actor_name on this table, only `read`.
//
// Fresh INSERTs are unaffected: no conflict means the WHERE is never evaluated.
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
        actor_name = excluded.actor_name
      WHERE notifications.pending_sync = 0`)
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

// Fold not-yet-swept mirror rows into a cloud read (N-2c-1).
//
// THE WINDOW THIS CLOSES: the read path is CLOUD-FIRST, so online it returns cloud
// rows ONLY and a mirror-only row is invisible. Genuinely offline that is fine —
// the read serves the whole mirror. But a creation that failed while the app still
// believed it was online (the 2-failure hysteresis window, an RLS rejection) leaves
// a row that is invisible INDEFINITELY: no disconnect happened, so no reconnect
// event will ever fire to sweep it. Three writers are SELF-addressed (the 60s
// reminder timers), so the symptom is the user's own reminder never appearing.
//
// MIRROR WINS on an id collision: a row that is still marked pending is by
// definition the version cloud does not have.
function mergePending(userEmail: string, cloudRows: NotificationRow[]): NotificationRow[] {
  let pending: NotificationRow[]
  try {
    pending = getDatabase()
      .prepare(`SELECT ${SELECT_COLS} FROM notifications WHERE user_email=? AND pending_sync=1`)
      .all(userEmail) as NotificationRow[]
  } catch (e) {
    // The cloud read already succeeded — never fail it over the merge.
    console.warn('[notifications] pending merge failed (serving cloud rows only):', (e as Error)?.message)
    return cloudRows
  }
  if (!pending.length) return cloudRows

  const byId = new Map<string, NotificationRow>()
  for (const r of cloudRows) byId.set(r.id, r)
  for (const r of pending) byId.set(r.id, { ...r, read: toSqliteRead(r.read) })

  // Both sides are in the local 'YYYY-MM-DD HH:MM:SS' shape here — fromCloud
  // normalizes the cloud side — so the string compare matches SQLite's ordering.
  return [...byId.values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, PAGE_LIMIT)
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
    return mergePending(userEmail, rows)
  } catch (e) {
    console.warn('[notifications] cloud read threw, serving local mirror:', (e as Error)?.message)
    return readMirror(userEmail)
  }
}

// Fold pending mirror state into a cloud unread count (N-2c-2).
//
// ⚠ THE ARITHMETIC IS SIGNED — this is NOT mergePending's union-with-override. There
// the cloud rows are in hand and a pending row simply replaces its twin. Here the
// answer is a NUMBER, and a pending row can move it in either direction:
//   • pending, cloud counts it as unread, mirror says read  → SUBTRACT (read offline)
//   • pending, cloud does not count it, mirror says unread  → ADD (created offline)
//   • pending, cloud does not count it, mirror says read    → no change
// Which is why the caller fetches cloud's unread IDS rather than its scalar count:
// |C| alone cannot tell you whether a given pending id is inside C.
//
// Mirror is authoritative for every pending id — the same rule mergePending and
// syncMirror's guard state, applied to a count.
function mergePendingUnreadCount(userEmail: string, cloudUnread: Set<string>): number {
  let pending: { id: string; read: number }[]
  try {
    pending = getDatabase()
      .prepare('SELECT id, read FROM notifications WHERE user_email=? AND pending_sync=1')
      .all(userEmail) as { id: string; read: number }[]
  } catch (e) {
    // The cloud read already succeeded — never fail it over the merge.
    console.warn('[notifications] pending unread merge failed (serving cloud count only):', (e as Error)?.message)
    return cloudUnread.size
  }
  let n = cloudUnread.size
  for (const p of pending) {
    const mirrorUnread = toSqliteRead(p.read) === 0
    const countedByCloud = cloudUnread.has(p.id)
    if (countedByCloud && !mirrorUnread) n--
    else if (!countedByCloud && mirrorUnread) n++
  }
  // A negative count is impossible by construction (every subtraction is matched by
  // a distinct member of C), but the badge must never render one if that changes.
  return n < 0 ? 0 : n
}

// Unread badge count. Cloud when online, mirror when offline or on error.
//
// N-2c-2: this fetches unread IDS, not a head:true count. A row marked read offline
// is still read=false in cloud, so cloud's scalar count would keep counting it and
// the badge would contradict the Inbox list (which mergePending already corrects)
// until the sweep ran. The merge needs set membership, and a count cannot provide it.
//
// NOTE: dropping head:true here does NOT weaken the old warning above it — that
// warning is about using head:true as an EXISTENCE check, since against a missing
// table it returns { count: null, error: null } and so reports success for a table
// that is not there. This call was never an existence check; it is a real read of a
// table we know exists, and it still is.
export async function getUnreadCount(userEmail: string): Promise<number> {
  if (!userEmail) return 0
  if (!isOnline()) return readMirrorUnreadCount(userEmail)
  try {
    const { data, error } = await cloud
      .from('notifications')
      .select('id')
      .eq('user_email', userEmail)
      .eq('read', false)
    reportCloudResult(!error)
    if (error) {
      console.warn('[notifications] cloud unread count failed, serving local mirror:', error.message)
      return readMirrorUnreadCount(userEmail)
    }
    const cloudUnread = new Set(((data ?? []) as { id: string }[]).map(r => r.id))
    return mergePendingUnreadCount(userEmail, cloudUnread)
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
    const { error, status } = await cloud.from('notifications').insert({
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
    if (error) {
      // ★ THIS is where a network failure actually lands. postgrest-js does NOT
      // reject on one — it RESOLVES with an error object and status 0, so the catch
      // below never sees it. Classify structurally (status 0 = the request never
      // completed) and report the SAME 'offline' token the isOnline() guard above
      // returns, so callers test one token instead of matching undici's
      // `TypeError: fetch failed` message text. A resolved error with a real HTTP
      // status IS a server answer (RLS, constraint, bad payload) and keeps its own
      // wording — that one the user should see verbatim.
      if (isTransportStatus(status)) return { ok: false, error: 'offline' }
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    // Belt-and-braces. postgrest-js resolves rather than rejects for network
    // failures, so this path is NOT the transport path — but a genuine throw is
    // still possible (an AbortError, or a bug in our own payload construction
    // above), and classifying it costs nothing.
    if (isTransportError(e)) return { ok: false, error: 'offline' }
    return { ok: false, error: (e as Error)?.message ?? 'insert threw' }
  }
}

// ── Sweep: deliver notifications the cloud never got (N-2c-1) ────────────────
// createNotification INSERTs with pending_sync=1 and clears it when the cloud
// insert confirms. Whatever is still marked is a row that exists ONLY on this
// machine — created offline, or created inside the connection module's 2-failure
// hysteresis window while the app still believed it was online. Since most
// notifications are addressed to OTHER PEOPLE, an unswept row means that recipient
// never learns the event happened.
//
// NO QUEUE TABLE, NO OP REPLAY: a created notification is immutable, so the row
// itself IS the operation and a full-payload upsert is idempotent and
// order-independent. Structure follows personalSync.drainPersonalSyncQueue
// (in-flight guard, isOnline re-check, one summary line) but deliberately does NOT
// import from or extend it — that module's "SCOPE IS THE CONTRACT" header is
// intentional and stays untouched.
//
// ⚠ THE PREDICATE IS SAFETY-CRITICAL. pending_sync=1 excludes the 557 pre-existing
// rows (D8: no seed — they are addressed to nobody and the cloud table has no
// delete path). The user_email LIKE '%@%' clause is belt-and-braces: N-1
// deliberately left ~21 unread uuid-keyed rows unresolved, and without it the first
// thing to mark one pending would ship it to cloud under a garbage key.
//
// ★ TWO KINDS OF PENDING ROW SINCE N-2c-2, and the difference decides one field:
//   • CREATED pending  — cloud has never seen this row. The mirror IS the origin.
//   • READ-FLIPPED pending — cloud HAS the row; only the local `read` flag is newer.
// The upsert handles both identically EXCEPT for created_at (see the R2 note on
// splitCreatedAt below). Everything else about the payload is origin-independent,
// which is why this stayed one sweep instead of growing a second one.
let sweeping = false

// Cap the ids written into one log line so a permanently-wedged sweep cannot emit an
// unbounded line on every reconnect. The COUNT is always exact; only the list is cut.
const LOG_ID_CAP = 10
function formatIds(ids: string[]): string {
  if (!ids.length) return 'none'
  if (ids.length <= LOG_ID_CAP) return ids.join(', ')
  return `${ids.slice(0, LOG_ID_CAP).join(', ')} … (+${ids.length - LOG_ID_CAP} more)`
}

// ── Which of these ids does cloud ALREADY have? (N-2c-2, R2) ─────────────────
// `.in()` compiles to a query-string filter, so the id list rides in the URL. A full
// SWEEP_CHUNK of 200 uuids is ~7.4 KB of request line — past where proxies start
// rejecting it — so the probe batches SMALLER than the upsert (which POSTs a body).
//
// Returns null if ANY batch failed. A partial answer is worse than none: "absent"
// would become indistinguishable from "never asked", and we would then stamp a
// truncated created_at over a row cloud already holds at full precision.
//
// ⚠ Deliberately NOT reportCloudResult'd — the sweep is a WRITE path, and N-2a's
// rule is that a notification write must never move the connection verdict.
const PROBE_CHUNK = 50

async function fetchExistingCloudIds(ids: string[]): Promise<Set<string> | null> {
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += PROBE_CHUNK) {
    const batch = ids.slice(i, i + PROBE_CHUNK)
    const { data, error } = await cloud.from('notifications').select('id').in('id', batch)
    if (error) {
      console.warn('[notifications] sweep existence probe failed:', error.message)
      return null
    }
    for (const r of (data ?? []) as { id: string }[]) found.add(r.id)
  }
  return found
}

export async function sweepPendingNotifications(trigger = 'manual'): Promise<void> {
  // In-flight guard: the launch sweep and a reconnect sweep can otherwise overlap
  // and send the same rows twice.
  if (sweeping) return
  if (!isOnline()) return
  sweeping = true
  try {
    const db = getDatabase()
    const rows = db.prepare(
      `SELECT ${SELECT_COLS} FROM notifications
       WHERE pending_sync = 1 AND user_email LIKE '%@%'
       ORDER BY created_at ASC`
    ).all() as NotificationRow[]
    if (!rows.length) return

    const clear = db.prepare('UPDATE notifications SET pending_sync = 0 WHERE id = ?')
    const tx = db.transaction((ids: string[]) => { for (const id of ids) clear.run(id) })
    let sent = 0

    for (let i = 0; i < rows.length; i += SWEEP_CHUNK) {
      const chunk = rows.slice(i, i + SWEEP_CHUNK)
      const chunkIds = chunk.map(r => r.id)
      try {
        // ── R2: created_at may only be sent for rows cloud does NOT have ───────
        // The mirror stores created_at at SECOND precision — CURRENT_TIMESTAMP
        // (created-offline rows) and toLocalTimestamp's .slice(0,19) (rows
        // materialized from cloud) both produce 'YYYY-MM-DD HH:MM:SS'. Cloud, by
        // contrast, holds what createNotificationCloud sent: an ISO string with
        // MILLISECONDS. So re-sending the mirror's copy over a row cloud already has
        // truncates .123 → .000 and silently reorders same-second rows for every
        // viewer (ORDER BY created_at is a string compare). Real data already
        // contains same-second pairs, so this is not hypothetical.
        //
        // Omitting it wholesale is equally wrong: a created-offline row NEEDS it on
        // first insert or the column defaults to now() and the original time is gone
        // — the exact failure toCloudTimestamp exists to prevent.
        const inCloud = await fetchExistingCloudIds(chunkIds)
        if (!inCloud) {
          // Cannot tell the groups apart, and BOTH guesses corrupt data. Leave the
          // chunk marked; the next sweep retries it.
          console.warn(`[notifications] sweep chunk skipped — existence probe failed (${chunk.length} row(s) left pending) — ids: ${formatIds(chunkIds)}`)
          continue
        }

        // PostgREST requires every object in one upsert array to carry the SAME key
        // set, so the two groups cannot share a request. Two calls, each skipped when
        // empty — in practice only one group is ever non-empty.
        const groups: { rows: NotificationRow[]; withCreatedAt: boolean; label: string }[] = [
          { rows: chunk.filter(r => !inCloud.has(r.id)), withCreatedAt: true,  label: 'insert' },
          { rows: chunk.filter(r =>  inCloud.has(r.id)), withCreatedAt: false, label: 'update' },
        ]

        const confirmed: string[] = []
        for (const g of groups) {
          if (!g.rows.length) continue
          const payload = g.rows.map(r => ({
            id: r.id,
            user_email: r.user_email,
            type: r.type,
            title: r.title,
            body: r.body,
            task_id: r.task_id,
            task_title: r.task_title,
            actor_name: r.actor_name,
            read: toSqliteRead(r.read) === 1,   // INTEGER → BOOLEAN
            // ONLY for rows cloud has never seen — see the R2 note above.
            ...(g.withCreatedAt ? { created_at: toCloudTimestamp(r.created_at) } : {}),
          }))
          // .select('id') is REQUIRED: it is the only confirmation of what actually
          // landed. Clearing the marker blind would silently drop the remainder of a
          // partially-applied chunk.
          const { data, error } = await cloud
            .from('notifications')
            .upsert(payload, { onConflict: 'id', ignoreDuplicates: false })
            .select('id')
          if (error) {
            // Leave this group marked and keep going — one bad group must not strand
            // the rest, and the next sweep retries it.
            console.warn(`[notifications] sweep ${g.label} group failed (${g.rows.length} row(s) left pending): ${error.message} — ids: ${formatIds(g.rows.map(r => r.id))}`)
            continue
          }
          confirmed.push(...((data ?? []) as { id: string }[]).map(r => r.id))
        }
        tx(confirmed)
        sent += confirmed.length
      } catch (e) {
        console.warn(`[notifications] sweep chunk threw (${chunk.length} row(s) left pending): ${(e as Error)?.message} — ids: ${formatIds(chunkIds)}`)
      }
    }

    // ★ NAME THE STUCK ROWS (N-2c-2, R3). Since Part 1's guard makes syncMirror skip
    // any pending row, a row the sweep can never deliver (a permanent RLS/constraint
    // rejection) is now frozen: it will never be refreshed from cloud again. A bare
    // count made that invisible. Logging only — retry behaviour is unchanged.
    const stuck = (db.prepare('SELECT id FROM notifications WHERE pending_sync = 1').all() as { id: string }[]).map(r => r.id)
    console.log(
      `[notifications] sweep: ${sent} sent, ${stuck.length} remaining (${trigger})` +
      (stuck.length ? ` — still pending: ${formatIds(stuck)}` : '')
    )
  } catch (e) {
    console.warn('[notifications] sweep aborted:', (e as Error)?.message)
  } finally {
    sweeping = false
  }
}

// Mark ONE notification read. WORKS OFFLINE (N-2c-2).
//
// The old rule was ONLINE-REQUIRED, because a local-only read flag would be silently
// reverted by the next cloud read. That reversion is now impossible: syncMirror will
// not touch a row with pending_sync=1 (see its guard), so the flag survives until the
// sweep delivers it.
//
// NO QUEUE AND NO SECOND SWEEP. A read-flipped row is just "local state cloud does
// not have yet", which is precisely what the N-2c-1 sweep already carries — its
// full-payload upsert is source-type-agnostic, so this row rides the same path as a
// created-offline one. The only thing that differs is created_at handling (see the
// R2 note in sweepPendingNotifications).
export async function markRead(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'missing id' }
  if (!isOnline()) {
    // Offline: write the flag AND mark the row for the sweep. pending_sync=1 is what
    // makes this durable — it both protects the row from syncMirror and enrolls it in
    // the next reconnect/launch sweep.
    try {
      getDatabase().prepare('UPDATE notifications SET read=1, pending_sync=1 WHERE id=?').run(id)
    } catch (e) {
      // N-2b-1's rule: never report success we did not achieve. If the mirror write
      // failed, nothing was recorded anywhere and the Inbox must not show it read.
      console.warn('[notifications] offline markRead mirror write failed:', (e as Error)?.message)
      return { ok: false, error: (e as Error)?.message ?? 'mirror write failed' }
    }
    console.log(`[notifications] markRead applied offline for ${id} — marked pending, will sweep on reconnect`)
    return { ok: true }
  }
  try {
    const { error } = await cloud.from('notifications').update({ read: true }).eq('id', id)
    reportCloudResult(!error)
    if (error) {
      console.warn('[notifications] cloud markRead failed:', error.message)
      return { ok: false, error: error.message }
    }
    try {
      // ⚠ NEARLY the offline statement, minus `, pending_sync=1` — and that
      // difference is the whole point, so do NOT extract a shared statement. Cloud
      // has just confirmed the flag, so there is nothing for the sweep to carry;
      // marking it pending here would enrol a row that is already in sync and hand
      // the sweep a needless (if idempotent) round trip.
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

// Mark every unread notification for one recipient read.
//
// ⚠ STILL ONLINE-REQUIRED — deliberately NOT changed alongside markRead (N-2c-2).
// Offline markAllRead is N-2c-3 and needs its own design, because this predicate is
// UNBOUNDED: `WHERE user_email=? AND read=0` would flip every matching row to
// pending_sync=1 in one click. On a real DB that includes the pre-N-2c-1 legacy rows
// (ADD COLUMN DEFAULT 0, deliberately never backfilled) which D8 excluded from cloud
// — and the sweep's `user_email LIKE '%@%'` filter does NOT stop them, because N-1
// already rewrote the local-admin ones to a real address. The sweep would ship
// hundreds of them into a cloud table with NO DELETE PATH. Unrecoverable.
export async function markAllRead(userEmail: string): Promise<{ ok: boolean; error?: string }> {
  if (!userEmail) return { ok: false, error: 'no recipient' }
  if (!isOnline()) {
    console.warn('[notifications] markAllRead skipped — offline (single-row markRead works offline; bulk is N-2c-3)')
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
