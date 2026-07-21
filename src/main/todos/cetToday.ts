// ─────────────────────────────────────────────────────────────────────────────
// MAIN-SIDE CET "TODAY" (slice C-recurring-3)
//
// ⚠ DUPLICATE-BY-DESIGN. This is a deliberate copy of the renderer's CET-today
// idiom in src/renderer/src/utils/urgency.ts (`cetToday`). There is NO shared
// module across the main/renderer boundary — main is Node/Electron-main, the
// renderer is the browser bundle — so the two definitions must be kept in sync
// BY HAND. If you change the timezone rule in one, change it in the other.
//
// Why CET (Europe/Berlin), not the device clock: a deadline must mean the same
// calendar day for the whole team, and the whole To-Do urgency engine already
// ranks on the CET calendar date. The missed-occurrence evaluator rolls deadlines
// forward against THIS date, so it must agree with what the renderer shows.
//
// 'en-CA' formats as YYYY-MM-DD, directly comparable to the date-only `due_date`
// strings the DB stores — no parsing, no Date objects, no drift. Intl defers to
// ICU (shipped with Electron) for the DST rules, so no hand-rolled +1/+2 offset.
// ─────────────────────────────────────────────────────────────────────────────

const CET_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar date in CET (Europe/Berlin), as 'YYYY-MM-DD'. */
export function cetToday(): string {
  return CET_DATE.format(new Date())
}
