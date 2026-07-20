// ─────────────────────────────────────────────────────────────────────────────
// THE URGENCY ENGINE (slice 3a)
//
// One shared module — promotion strips, urgency bands and due chips ALL read from
// here. Three near-duplicate grouping functions used to live in Todo.tsx
// (getGroup / getPersonalGroup / getCalendarGroup); this replaces them.
//
// ★ EVERYTHING IS EVALUATED IN CET (Europe/Berlin), NOT THE DEVICE TIMEZONE.
//
// A deadline must mean the same instant for the whole team. If urgency came off
// the local clock, "due today" would flip at a different moment for every user and
// a machine with a wrong timezone would quietly mis-sort the entire list.
//
// The device clock is still the `now` INPUT — we cannot get a trusted time source
// without a network round-trip — but every day-diff is computed on the CET
// CALENDAR DATE. A badly-wrong system clock still misleads; a merely-different
// TIMEZONE no longer does.
//
// NO HAND-ROLLED OFFSET. CET/CEST changes twice a year, so a fixed +1/+2 would be
// wrong for weeks at a time. Intl defers to ICU (shipped with Electron), which
// knows the DST rules. The 'en-CA' locale is chosen because it formats as
// YYYY-MM-DD, so the result is directly comparable to the date-only `due_date`
// strings the backend returns — no parsing, no Date objects, no drift.
// ─────────────────────────────────────────────────────────────────────────────

const CET_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar date in CET, as 'YYYY-MM-DD'. */
export function cetToday(): string {
  return CET_DATE.format(new Date())
}

/**
 * Whole days from CET-today to `due` (date-only 'YYYY-MM-DD'). Negative = past.
 * Returns null for a missing date.
 *
 * Both sides are parsed as UTC midnight so the subtraction is a pure day count —
 * anchoring to local midnight would reintroduce the timezone dependency this
 * module exists to remove.
 */
export function daysUntil(due: string | null | undefined): number | null {
  if (!due) return null
  const d = Date.parse(`${due.slice(0, 10)}T00:00:00Z`)
  const t = Date.parse(`${cetToday()}T00:00:00Z`)
  if (Number.isNaN(d) || Number.isNaN(t)) return null
  return Math.round((d - t) / 86400000)
}

export type UrgencyKey = 'pastdue' | 'today' | 'tomorrow' | 'd2' | 'd3' | 'later' | 'none'

export interface Urgency {
  k: UrgencyKey
  label: string
  short: string | null
}

/** Buckets match docs/TodoStepRail.html exactly. */
export function urgency(due: string | null | undefined): Urgency {
  const n = daysUntil(due)
  if (n === null) return { k: 'none',     label: 'No date',      short: null }
  if (n < 0)      return { k: 'pastdue',  label: 'Past due',     short: 'Past due' }
  if (n === 0)    return { k: 'today',    label: 'Due today',    short: 'Today' }
  if (n === 1)    return { k: 'tomorrow', label: 'Due tomorrow', short: 'Tomorrow' }
  if (n === 2)    return { k: 'd2',       label: '2 days to go', short: '2 days' }
  if (n === 3)    return { k: 'd3',       label: '3 days to go', short: '3 days' }
  return { k: 'later', label: 'Later', short: null }
}

export const URGENCY_RANK: Record<UrgencyKey, number> = {
  pastdue: 0, today: 1, tomorrow: 2, d2: 3, d3: 4, later: 5, none: 6,
}

/** Bands lifted OUT of the body into the pinned strip at the top of every tab. */
export const PROMOTED: UrgencyKey[] = ['pastdue', 'today']

export const isPromoted = (k: UrgencyKey): boolean => PROMOTED.includes(k)

/**
 * Display label for a due date. `due_time` is DISPLAY ONLY and never affects
 * bucketing — a 09:00 and a 23:00 item are both simply "due today".
 */
export function dueLabel(due: string | null | undefined, dueTime?: string | null): string {
  const u = urgency(due)
  if (u.k === 'none') return ''
  const n = daysUntil(due) ?? 0
  const base =
    u.k === 'pastdue' ? `${Math.abs(n)}d overdue`
    : u.short ?? new Date(`${due!.slice(0, 10)}T00:00:00Z`)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return dueTime ? `${base} · ${dueTime.slice(0, 5)}` : base
}
