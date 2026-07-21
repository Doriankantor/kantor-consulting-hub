// ─────────────────────────────────────────────────────────────────────────────
// MISSED-OCCURRENCE EVALUATOR (slice C-recurring-3)
//
// The ONE piece of time-driven machinery in the app. Completion-anchored spawning
// (C-recurring-1) deliberately avoided a scheduler; missed-tracking needs one,
// because a boundary can pass with the app closed. Runs at login and at each CET
// midnight (wired in ipc app:setActingUser).
//
// For every recurring, not-completed personal to-do whose due_date is in the PAST
// (CET calendar), it rolls the due_date forward one boundary at a time, stamping
// each passed boundary into missed_dates — so "app closed 3 weeks, weekly" records
// 3 misses and lands due_date on the next future occurrence, in one pass. A NULL
// due_date is dateless-by-design: no roll, no miss.
//
// Writes go through the SAME 1b path as every personal write (local UPDATE first,
// then un-awaited syncPersonalWrite via the canonical personalCloudRow) so the
// autonomous roll reaches cloud. No isOnline guard — personal is offline-capable.
// ─────────────────────────────────────────────────────────────────────────────

import { getDatabase } from '../db'
import { nextOccurrence } from './nextOccurrence'
import { cetToday } from './cetToday'
import { syncPersonalWrite, personalCloudRow, nowIso } from '../cloud/personalSync'

/** A leave window (inclusive) during which boundaries are rolled but NOT stamped. */
export interface SkipRange { start: string; end: string }

/** True if `date` ('YYYY-MM-DD') falls inside any inclusive skip range. */
export function dateFallsInAnyRange(date: string, ranges: SkipRange[]): boolean {
  // Date-only string comparison is a valid calendar comparison for 'YYYY-MM-DD'.
  return ranges.some(r => date >= r.start && date <= r.end)
}

/**
 * Evaluate missed occurrences for one user's recurring personal to-dos.
 *
 * @param skipRanges OFF-WORK SEAM. Unused today (nothing populates it); the off-work
 *   slice will pass a member's leave windows so boundaries inside them roll forward
 *   WITHOUT being stamped as missed. Wired from the start so that slice needs no
 *   change here.
 */
export function runMissedOccurrenceEvaluator(userId: string, skipRanges: SkipRange[] = []): void {
  if (!userId) return
  const db = getDatabase()

  let rows: { id: string; due_date: string | null; recurrence: string | null; missed_dates: string | null }[]
  try {
    rows = db.prepare(
      'SELECT id, due_date, recurrence, missed_dates FROM personal_todos WHERE user_id=? AND recurrence IS NOT NULL AND completed=0'
    ).all(userId) as typeof rows
  } catch (e) {
    console.warn('[missedEval] query failed:', (e as Error)?.message)
    return
  }

  const today = cetToday()
  const upd = db.prepare('UPDATE personal_todos SET due_date=?, missed_dates=?, updated_at=? WHERE id=?')

  for (const row of rows) {
    // Dateless recurrence: nothing to roll, nothing to miss (by design).
    if (!row.due_date || !row.recurrence) continue

    let due = row.due_date.slice(0, 10)
    let missed: string[] = []
    try {
      const v = row.missed_dates ? JSON.parse(row.missed_dates) : []
      if (Array.isArray(v)) missed = v.filter((x): x is string => typeof x === 'string')
    } catch { missed = [] }

    let changed = false
    // Bounded by the calendar (each pass advances `due`); a safety cap guards against
    // a pathological freq that fails to advance.
    let guard = 0
    while (due < today && guard < 10000) {
      guard++
      // A boundary INSIDE a leave window rolls forward but is not stamped as missed.
      if (!dateFallsInAnyRange(due, skipRanges)) missed.push(due)
      const nextDue = nextOccurrence(due, row.recurrence)
      if (nextDue <= due) break   // never-advancing guard (unknown freq)
      due = nextDue
      changed = true
    }

    if (changed) {
      const ts = nowIso()
      try {
        upd.run(due, missed.length ? JSON.stringify(missed) : null, ts, row.id)
      } catch (e) {
        console.warn('[missedEval] update failed for', row.id, (e as Error)?.message)
        continue
      }
      // Autonomous write reaches cloud on the same 1b path (no isOnline guard).
      const cloud = personalCloudRow(row.id)
      if (cloud) syncPersonalWrite('update', 'personal_todos', cloud)
    }
  }
}

// ── Schedule: run at login + each CET midnight ───────────────────────────────
// A single module-level timer, owned by the app lifecycle. Started in ipc
// app:setActingUser (first login / user switch) and torn down in the SAME places
// realtime is (logout, window-all-closed, before-quit). A leaked timer across user
// sessions is the main risk — stopMissedSchedule must be called on every teardown.

let missedTimer: ReturnType<typeof setTimeout> | null = null
let missedUserId: string | null = null

const CET_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

/** Milliseconds from now until the next 00:00 in Europe/Berlin (+5s buffer past midnight). */
function msToNextCetMidnight(): number {
  // en-GB h23 renders '24:00:00' at midnight; normalise the 24 to 0.
  const parts = CET_TIME.formatToParts(new Date())
  const get = (t: string): number => Number(parts.find(p => p.type === t)?.value ?? '0')
  const h = get('hour') % 24
  const m = get('minute')
  const s = get('second')
  const secsElapsed = h * 3600 + m * 60 + s
  const secsToMidnight = 86400 - secsElapsed
  // +5s so the timer fires just AFTER midnight, on the new calendar day. DST drift of
  // ±1h is harmless: the evaluator is idempotent and we reschedule daily.
  return (secsToMidnight + 5) * 1000
}

function scheduleNext(): void {
  if (missedTimer) clearTimeout(missedTimer)
  missedTimer = setTimeout(() => {
    if (missedUserId) {
      try { runMissedOccurrenceEvaluator(missedUserId) } catch (e) { console.warn('[missedEval] midnight run failed:', (e as Error)?.message) }
    }
    scheduleNext()   // reschedule for the following midnight
  }, msToNextCetMidnight())
}

/** Run the evaluator for `userId` now, and (re)arm the CET-midnight timer scoped to them. */
export function startMissedSchedule(userId: string): void {
  if (!userId) return
  missedUserId = userId
  try { runMissedOccurrenceEvaluator(userId) } catch (e) { console.warn('[missedEval] login run failed:', (e as Error)?.message) }
  scheduleNext()
}

/** Clear the timer. Called on logout / window-all-closed / before-quit / user-switch. */
export function stopMissedSchedule(): void {
  if (missedTimer) { clearTimeout(missedTimer); missedTimer = null }
  missedUserId = null
}
