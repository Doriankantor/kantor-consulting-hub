// ── Off-work / leave windows: cloud-sourced with a local offline MIRROR (v1) ──
// Cloud `off_work` (PK user_email) is the source of truth for WHO IS ON LEAVE and
// WHEN. The local SQLite `off_work` table is an offline mirror so the missed-
// occurrence evaluator — which runs in main on the offline-capable 1b path — can
// read a member's leave window without a cloud roundtrip. Same shape as
// cloud/teamRoster.ts (cloud read → syncMirror → return; fall back to readMirror).
//
// SCOPE: one leave window per member (PK = user_email); setOffWork UPSERTs, so a
// new window replaces the old one. Dates are 'YYYY-MM-DD' strings, compared with
// the SAME main-side cetToday() the evaluator/urgency engine use — NO second date
// authority. The notification-drop effect is DEFERRED (notifications are still
// local/per-device); this module only powers evaluator suppression + the Team pill.

import { cloud } from './client'
import { isOnline, reportCloudResult } from './connection'
import { getDatabase } from '../db'
import { cetToday } from '../todos/cetToday'

export interface OffWorkWindow {
  user_email: string
  start_date: string
  end_date: string
}

/** Is `today` inside [start,end] inclusive? Pure 'YYYY-MM-DD' string compare. */
export function isOnLeaveToday(w: { start_date: string; end_date: string }, today = cetToday()): boolean {
  return today >= w.start_date && today <= w.end_date
}

// ── Local mirror ─────────────────────────────────────────────────────────────
// UPSERT-only, best-effort — a mirror failure must never fail the read/write.

function upsertMirror(w: OffWorkWindow): void {
  try {
    getDatabase().prepare(`
      INSERT INTO off_work (user_email, start_date, end_date, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_email) DO UPDATE SET
        start_date = excluded.start_date,
        end_date   = excluded.end_date,
        updated_at = excluded.updated_at
    `).run(w.user_email, w.start_date, w.end_date, new Date().toISOString())
  } catch (e) {
    console.warn('[offWork] mirror upsert failed:', (e as Error)?.message)
  }
}

function syncMirror(rows: OffWorkWindow[]): void {
  // Deliberately UPSERT-only, not delete-then-insert: a partial cloud read must
  // never erase a window we already mirrored. A stale extra row is harmless — the
  // pill/evaluator both re-check today ∈ [start,end], and an expired window simply
  // reads as "not on leave".
  for (const w of rows) upsertMirror(w)
}

function readMirrorOne(email: string): OffWorkWindow | null {
  try {
    const r = getDatabase()
      .prepare('SELECT user_email, start_date, end_date FROM off_work WHERE user_email=?')
      .get(email) as OffWorkWindow | undefined
    return r && r.start_date && r.end_date ? r : null
  } catch (e) {
    console.warn('[offWork] mirror read failed:', (e as Error)?.message)
    return null
  }
}

/**
 * SYNCHRONOUS local-mirror read of one member's window — for the missed-occurrence
 * evaluator, which runs sync on the offline-capable path. Offline-safe, never throws,
 * no cloud. Returns null when there is no mirrored window.
 */
export function offWorkMirror(email: string): OffWorkWindow | null {
  return email ? readMirrorOne(email) : null
}

function readMirrorAll(): OffWorkWindow[] {
  try {
    return getDatabase()
      .prepare('SELECT user_email, start_date, end_date FROM off_work WHERE start_date IS NOT NULL AND end_date IS NOT NULL')
      .all() as OffWorkWindow[]
  } catch (e) {
    console.warn('[offWork] mirror read-all failed:', (e as Error)?.message)
    return []
  }
}

// ── Cloud reads/writes ───────────────────────────────────────────────────────

/**
 * The leave window for one member. Cloud-first → refresh mirror → return; on
 * offline/error fall back to the mirror. NEVER throws (the evaluator calls this on
 * a path that must not break); returns null when there is no window.
 */
export async function getOffWork(email: string): Promise<OffWorkWindow | null> {
  if (!email) return null
  if (!isOnline()) return readMirrorOne(email)
  try {
    const { data, error } = await cloud
      .from('off_work')
      .select('user_email, start_date, end_date')
      .eq('user_email', email)
      .maybeSingle()
    reportCloudResult(!error)
    if (error) {
      console.warn('[offWork] cloud read failed, serving mirror:', error.message)
      return readMirrorOne(email)
    }
    if (!data || !data.start_date || !data.end_date) return readMirrorOne(email)
    const w: OffWorkWindow = { user_email: data.user_email, start_date: data.start_date, end_date: data.end_date }
    upsertMirror(w)
    return w
  } catch (e) {
    console.warn('[offWork] cloud read threw, serving mirror:', (e as Error)?.message)
    return readMirrorOne(email)
  }
}

/**
 * All current (non-expired) leave windows, for the Team "on leave" pill. Cloud-
 * first → refresh mirror → return; mirror fallback on offline/error. Never throws.
 */
export async function listOffWork(): Promise<OffWorkWindow[]> {
  const today = cetToday()
  if (!isOnline()) return readMirrorAll().filter(w => isOnLeaveToday(w, today))
  try {
    const { data, error } = await cloud
      .from('off_work')
      .select('user_email, start_date, end_date')
    reportCloudResult(!error)
    if (error) {
      console.warn('[offWork] cloud list failed, serving mirror:', error.message)
      return readMirrorAll().filter(w => isOnLeaveToday(w, today))
    }
    const rows = ((data ?? []) as OffWorkWindow[]).filter(w => w.user_email && w.start_date && w.end_date)
    syncMirror(rows)
    // The pill only cares about members currently on leave; expired windows stay in
    // the table (and mirror) but are filtered out here.
    return rows.filter(w => isOnLeaveToday(w, today))
  } catch (e) {
    console.warn('[offWork] cloud list threw, serving mirror:', (e as Error)?.message)
    return readMirrorAll().filter(w => isOnLeaveToday(w, today))
  }
}

export interface SetOffWorkResult {
  ok: boolean
  error?: string
  window?: OffWorkWindow
}

/**
 * Upsert a member's leave window (PK user_email ⇒ replaces any existing one).
 * Server-side backstop validation: both dates present, end >= start, and
 * start >= today (future-only). Writes cloud + mirror. Requires online (the write
 * is authoritative and cross-device — no offline queue for v1).
 */
export async function setOffWork(email: string, start: string, end: string): Promise<SetOffWorkResult> {
  if (!email) return { ok: false, error: 'No user identity.' }
  const today = cetToday()
  const s = (start ?? '').slice(0, 10)
  const e = (end ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return { ok: false, error: 'Both start and end dates are required (YYYY-MM-DD).' }
  }
  if (s < today) return { ok: false, error: 'Start date must be today or later.' }
  if (e < s) return { ok: false, error: 'End date must be on or after the start date.' }

  if (!isOnline()) return { ok: false, error: 'You are offline — setting a leave window needs a connection.' }
  try {
    const { error } = await cloud
      .from('off_work')
      .upsert({ user_email: email, start_date: s, end_date: e }, { onConflict: 'user_email' })
    reportCloudResult(!error)
    if (error) {
      console.warn('[offWork] cloud upsert failed:', error.message)
      return { ok: false, error: 'Could not save your leave window. Try again.' }
    }
    const w: OffWorkWindow = { user_email: email, start_date: s, end_date: e }
    upsertMirror(w)
    return { ok: true, window: w }
  } catch (err) {
    console.warn('[offWork] cloud upsert threw:', (err as Error)?.message)
    return { ok: false, error: 'Could not save your leave window. Try again.' }
  }
}

/**
 * "I'm back" — DELETE the member's leave window from cloud + local mirror. Deleting
 * (not truncating end_date) is the correct model: suppression is forward-only, so
 * removing the window just lets FUTURE boundaries stamp again; already-suppressed
 * misses stay suppressed (nothing retroactive). Requires online (authoritative
 * cross-device write, same as setOffWork); offline returns a clear error.
 */
export async function clearOffWork(email: string): Promise<SetOffWorkResult> {
  if (!email) return { ok: false, error: 'No user identity.' }
  if (!isOnline()) return { ok: false, error: 'You are offline — ending a leave window needs a connection.' }
  try {
    const { error } = await cloud.from('off_work').delete().eq('user_email', email)
    reportCloudResult(!error)
    if (error) {
      console.warn('[offWork] cloud delete failed:', error.message)
      return { ok: false, error: 'Could not end your leave window. Try again.' }
    }
    try {
      getDatabase().prepare('DELETE FROM off_work WHERE user_email=?').run(email)
    } catch (e) {
      console.warn('[offWork] mirror delete failed (cloud already cleared):', (e as Error)?.message)
    }
    return { ok: true }
  } catch (err) {
    console.warn('[offWork] cloud delete threw:', (err as Error)?.message)
    return { ok: false, error: 'Could not end your leave window. Try again.' }
  }
}
