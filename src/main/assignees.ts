// ── Assignee matching (slice 1c-2b-②) ───────────────────────────────────────
// `assignees_json` holds WORK EMAILS as of 1c-2b-① (it held device-local
// local_users.id UUIDs before, which only resolved on the minting machine).
// Everything that answers "is X assigned to this task?" routes through here.
//
// THE RULE: match the WHOLE array element, never a substring. The old code used
// unanchored `assignees_json LIKE '%<id>%'`, which was survivable with UUIDs but
// is a live false-positive generator with emails — `d.lozano@…` substring-matches
// nothing today, but any address that is a prefix of another would silently match
// the wrong person. json_each compares element-by-element and cannot do that.
//
// Comparison is case-insensitive on both sides: resolveIdentity lowercases what
// it returns, but stored values came from a hand-run migration and the roster,
// so we do not assume either side is already normalized.

/**
 * SQL fragment testing whether `col` (a JSON array column) contains an email.
 * Binds exactly ONE parameter — the email. Use in a WHERE clause:
 *   `WHERE archived=0 AND ${assignedToSql('wt.assignees_json')}`
 */
export function assignedToSql(col: string): string {
  return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE LOWER(json_each.value) = LOWER(?))`
}

/** JS-side equivalent for rows already in memory. Never throws on bad JSON. */
export function isAssignedTo(email: string | null | undefined, assigneesJson: string | null | undefined): boolean {
  if (!email) return false
  try {
    const arr = JSON.parse(assigneesJson || '[]')
    if (!Array.isArray(arr)) return false
    const target = email.toLowerCase()
    return arr.some(v => typeof v === 'string' && v.toLowerCase() === target)
  } catch {
    return false
  }
}

/** Parse an assignees_json column to a string[] of emails. Never throws. */
export function parseAssignees(assigneesJson: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(assigneesJson || '[]')
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}
