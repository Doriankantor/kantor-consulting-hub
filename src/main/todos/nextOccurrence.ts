// ─────────────────────────────────────────────────────────────────────────────
// NEXT-OCCURRENCE DATE MATH (slice C-recurring)
//
// Pure STRING arithmetic on 'YYYY-MM-DD' — deliberately NOT `new Date(str)`.
//
// `new Date('2026-07-21')` parses as UTC midnight, then every getter reads it back
// in the DEVICE timezone, so west-of-UTC machines see the PREVIOUS day and the roll
// lands a day early. The whole To-Do urgency engine (utils/urgency.ts) avoids Date
// for exactly this reason and compares date-only strings; this stays consistent
// with it. We parse to integer y/m/d, do integer math, and reformat.
// ─────────────────────────────────────────────────────────────────────────────

export type RecurrenceFreq = 'daily' | 'weekly' | 'weekdays' | 'monthly' | 'yearly'

/** Days in month `m` (1-12) of year `y`, leap-year aware. */
export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28
  // 30-day months: Apr, Jun, Sep, Nov.
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** Parse 'YYYY-MM-DD' → [y, m, d] integers. Ignores any time suffix. */
function parse(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return [y, m, d]
}

function fmt(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

/**
 * Add `n` days to a y/m/d, carrying across month/year boundaries with the correct
 * per-month length (never a fixed 30). `n` is expected small (1, 2, 3, 7).
 */
function addDays(y: number, m: number, d: number, n: number): string {
  let day = d + n
  while (day > daysInMonth(y, m)) {
    day -= daysInMonth(y, m)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return fmt(y, m, day)
}

/**
 * Day of week for an integer y/m/d, via Zeller's congruence (no Date object).
 * Returns 0=Sunday … 6=Saturday.
 */
function dayOfWeek(y: number, m: number, d: number): number {
  // Zeller treats Jan/Feb as months 13/14 of the PREVIOUS year.
  let mm = m
  let yy = y
  if (mm < 3) { mm += 12; yy -= 1 }
  const k = yy % 100
  const j = Math.floor(yy / 100)
  // Zeller's h: 0=Saturday, 1=Sunday, 2=Monday, … 6=Friday.
  const h = (d + Math.floor((13 * (mm + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7
  // Convert to 0=Sunday … 6=Saturday.
  return (h + 6) % 7
}

/**
 * The next occurrence of `dueDate` under `freq`, as 'YYYY-MM-DD'.
 *
 * Edge cases are made explicit below:
 *   • monthly  — clamps to the last valid day (Jan 31 → Feb 28/29), and because
 *                the CLAMP happens each roll, a 31st that lands on a short month
 *                still climbs back to the 31st on the next long month is NOT done
 *                here (we clamp, not remember) — the next roll is off the clamped
 *                day, which is the conventional "last-day" behaviour.
 *   • yearly   — Feb 29 in a non-leap target year → Feb 28.
 *   • weekdays — advances to the next Mon–Fri (Fri→+3, Sat→+2, Sun→+1, else +1).
 */
export function nextOccurrence(dueDate: string, freq: RecurrenceFreq | string): string {
  const [y, m, d] = parse(dueDate)

  switch (freq) {
    case 'daily':
      return addDays(y, m, d, 1)

    case 'weekly':
      return addDays(y, m, d, 7)

    case 'weekdays': {
      // From the due day, step to the next weekday. Zeller: 5=Fri, 6=Sat, 0=Sun.
      const dow = dayOfWeek(y, m, d)
      const step = dow === 5 ? 3 : dow === 6 ? 2 : dow === 0 ? 1 : 1
      return addDays(y, m, d, step)
    }

    case 'monthly': {
      let ny = y
      let nm = m + 1
      if (nm > 12) { nm = 1; ny += 1 }
      // CLAMP: e.g. Jan 31 → Feb has only 28/29 days.
      const nd = Math.min(d, daysInMonth(ny, nm))
      return fmt(ny, nm, nd)
    }

    case 'yearly': {
      const ny = y + 1
      // Feb 29 → Feb 28 in a non-leap target year.
      const nd = Math.min(d, daysInMonth(ny, m))
      return fmt(ny, m, nd)
    }

    default:
      // Unknown frequency — no roll. Caller should have guarded, but never throw
      // inside a completion transaction.
      return dueDate.slice(0, 10)
  }
}
