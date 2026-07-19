import { cloud } from './client'
import { isOnline, reportCloudResult } from './connection'
import { getDatabase } from '../db'

// ── Team roster: cloud-sourced with a local offline MIRROR (slice 1c-1) ──────
// Cloud `team_members` is the source of truth for WHO IS ON THE TEAM, keyed on
// the stable work email. The local SQLite `team_members` table is an offline
// mirror so the assignee picker and @mention list still populate with no network.
//
// SCOPE — this is roster DISPLAY data only. It deliberately does NOT touch:
//   • local_users        — still the account table (auth, status, heartbeat,
//                          password, anthropic_key_set). `team:list` is unchanged.
//   • assignees_json     — still stores device-local local_users.id values.
//                          Migrating those to emails is slice 1c-2.
//   • attendees_json     — untouched for the same reason.
// Adding a roster read here must never become a reason to repoint an id-keyed
// write: nine `team:*` handlers resolve against local_users.id and would silently
// no-op (UPDATE … WHERE id=<email> matches zero rows, reports no error).

export interface RosterMember {
  email: string
  display_name: string
  assignable: boolean
}

// UPSERT-only mirror sync — deliberately NOT delete-then-insert. A cloud read
// that returns a short/partial list must never erase names we already have;
// the worst case is a stale extra row, not a picker that lost half the team.
// Best-effort: a mirror failure must NOT fail the read.
function syncMirror(rows: RosterMember[]): void {
  if (rows.length === 0) return
  try {
    const db = getDatabase()
    const up = db.prepare(`
      INSERT INTO team_members (email, display_name, assignable, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        display_name = excluded.display_name,
        assignable   = excluded.assignable,
        updated_at   = CURRENT_TIMESTAMP
    `)
    const tx = db.transaction((list: RosterMember[]) => {
      for (const r of list) up.run(r.email, r.display_name, r.assignable ? 1 : 0)
    })
    tx(rows)
  } catch (e) {
    console.warn('[teamRoster] local mirror sync failed (read still served from cloud):', (e as Error)?.message)
  }
}

// Read the local mirror (offline fallback + last-known cache).
function readMirror(): RosterMember[] {
  try {
    const rows = getDatabase()
      .prepare('SELECT email, display_name, assignable FROM team_members ORDER BY display_name COLLATE NOCASE ASC, email ASC')
      .all() as { email: string; display_name: string | null; assignable: number | null }[]
    return rows.map(r => ({
      email: r.email,
      display_name: r.display_name || r.email,
      assignable: r.assignable !== 0,
    }))
  } catch (e) {
    console.warn('[teamRoster] local mirror read failed:', (e as Error)?.message)
    return []
  }
}

// Cloud read → refresh the mirror → return the roster. On cloud error or offline,
// FALL BACK to the mirror. Never throws; always returns an array.
export async function getTeamRoster(): Promise<RosterMember[]> {
  if (!isOnline()) return readMirror()
  const { data, error } = await cloud
    .from('team_members')
    .select('email, display_name, assignable')
    .order('display_name', { ascending: true })
  reportCloudResult(!error)
  if (error) {
    console.warn('[teamRoster] cloud read failed, serving local mirror:', error.message)
    return readMirror()
  }
  const raw = (data ?? []) as { email?: string; display_name?: string | null; assignable?: boolean | null }[]
  const rows: RosterMember[] = raw
    .filter(r => !!r.email)
    .map(r => ({
      email: r.email!,
      display_name: r.display_name || r.email!,
      // Default to assignable when the column is absent/null — a roster member
      // who can't be picked is a worse failure than one who shouldn't have been.
      assignable: r.assignable !== false,
    }))
  syncMirror(rows)
  // Cloud returned an empty roster: don't hand the renderer an empty picker if
  // we still hold a usable mirror (e.g. the table was truncated mid-seed).
  if (rows.length === 0) return readMirror()
  return rows
}
