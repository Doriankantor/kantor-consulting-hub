// ── Assignee matching, renderer side (slice 1c-2b-②) ────────────────────────
// Mirror of src/main/assignees.ts for code that already holds a parsed array.
// `assignee_emails` holds WORK EMAILS as of 1c-2b-①. Case-insensitive on both
// sides — neither the stored values (hand-run migration + roster) nor the acting
// identity is assumed to be normalized.
//
// Whole-element comparison only. Never `.includes()` on a joined string and never
// a substring test: with emails, a prefix address would silently match the wrong
// person, which is exactly the false positive the old unanchored LIKE allowed.

/** True if `email` appears in the assignee list. */
export function isAssignedTo(emails: string[] | null | undefined, email: string | null | undefined): boolean {
  if (!email || !emails?.length) return false
  const target = email.toLowerCase()
  return emails.some(e => typeof e === 'string' && e.toLowerCase() === target)
}

/** Case-insensitive equality for two identity values. */
export function sameIdentity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}
