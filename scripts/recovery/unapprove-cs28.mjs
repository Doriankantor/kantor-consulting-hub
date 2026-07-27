// ─────────────────────────────────────────────────────────────────────────────
// ONE-OFF DATA RECOVERY — un-approve the 28 Contested Skies (board-info-latam)
// intelligence_sources articles so they re-enter the Intelligence review queue.
//
// MUTATES cloud intelligence_sources AND the local better-sqlite3 mirror.
// Runs in strict phases with HARD ABORTS — it will not flip unless the derive
// finds exactly 28 approved rows AND the snapshot is written+re-read successfully.
//
// Mirrors what src/main/cloud/intel.ts:677 revertToUnreviewed writes:
//   status='unreviewed', reviewed_by_id=null, reviewed_by_name=null, reviewed_at=null
// Leaves project_board_id, categories_json, analysis_json, review_notes,
// queue_section untouched. Does NOT touch cs_articles or info_page_sources.
//
// PRECONDITION: the installed KC Hub app must be QUIT (this writes the mirror).
//
// RUN (system `node` cannot load the Electron-ABI better-sqlite3; use Electron-as-node):
//   cd ~/newsroom-pm
//   export PATH="/opt/homebrew/bin:$PATH"
//   ELECTRON_BIN=$(node -p "require('./node_modules/electron')")
//   ELECTRON_RUN_AS_NODE=1 "$ELECTRON_BIN" scripts/recovery/unapprove-cs28.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
// Electron's Node 20 has no native WebSocket; supabase-js constructs a realtime
// client eagerly and throws without one. We only use REST here — provide `ws` as
// the transport purely to satisfy the constructor (no channels are opened).
const WS = require('ws')

const BOARD = 'board-info-latam'
const EXPECTED = 28

// Resolve project root from this file: <root>/scripts/recovery/unapprove-cs28.mjs
const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '..', '..')
const MIRROR = join(process.env.HOME, 'Library', 'Application Support', 'kantor-consulting-hub', 'db', 'kantor-hub.sqlite')
const SNAP_DIR = join(ROOT, 'recovery')

const die = (msg) => { console.error(`\n❌ ABORT: ${msg}\n`); process.exit(1) }
const ok  = (msg) => console.log(`   ✓ ${msg}`)

// ── PHASE 0 — precondition: app must be quit ────────────────────────────────
console.log('── PHASE 0 — precondition (app quit) ──')
try {
  // Match ONLY the packaged app bundle; the dev Electron (node_modules/electron
  // /dist/Electron.app) that runs THIS script is a different path and won't match.
  const out = execSync('pgrep -fil "Kantor Consulting Hub.app" || true', { encoding: 'utf8' }).trim()
  if (out) die(`KC Hub app appears to be RUNNING — quit it first:\n${out}`)
  ok('no running "Kantor Consulting Hub.app" process detected')
} catch (e) {
  console.log(`   ⚠ process check inconclusive (${e.message}) — proceeding; ensure the app is quit`)
}

// ── env / clients ───────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) die('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
const cloud = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WS },
})

if (!existsSync(MIRROR)) die(`local mirror not found at ${MIRROR}`)

// ── PHASE 1 — DERIVE (read-only, cloud) ─────────────────────────────────────
console.log('\n── PHASE 1 — DERIVE (cloud, read-only) ──')
const { data: rows, count, error: e1 } = await cloud
  .from('intelligence_sources')
  .select('*', { count: 'exact' })
  .eq('project_board_id', BOARD)
  .eq('status', 'approved')
if (e1) die(`cloud derive query failed: ${e1.message}`)

const n = count ?? rows?.length ?? 0
if (n !== EXPECTED) {
  die(`expected ${EXPECTED} approved rows on ${BOARD}, found ${n}` +
      (n === 0 ? ' — if N=0 the flip already ran (nothing to do).' : ' — investigate before flipping.'))
}
ok(`cloud count of approved on ${BOARD} === ${EXPECTED}`)

const nullReviewed = rows.filter(r => r.reviewed_at == null)
if (nullReviewed.length) die(`${nullReviewed.length} of the ${EXPECTED} rows have NULL reviewed_at (ids: ${nullReviewed.map(r => r.id).join(', ')}) — not a clean approved set.`)
ok(`all ${EXPECTED} rows have a non-null reviewed_at`)

const ids = rows.map(r => r.id)
if (new Set(ids).size !== EXPECTED) die('derived id set is not 28 distinct ids')
ok(`captured ${ids.length} distinct target ids (derived live, not hardcoded)`)

// ── PHASE 2 — SNAPSHOT (the safety net) ─────────────────────────────────────
console.log('\n── PHASE 2 — SNAPSHOT ──')
mkdirSync(SNAP_DIR, { recursive: true })
const d = new Date()
const p2 = (x) => String(x).padStart(2, '0')
const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`
const SNAP_PATH = join(SNAP_DIR, `cs28-snapshot-${stamp}.json`)
writeFileSync(SNAP_PATH, JSON.stringify(rows, null, 2), 'utf8')

// Re-read and validate BEFORE any mutation.
let parsed
try { parsed = JSON.parse(readFileSync(SNAP_PATH, 'utf8')) }
catch (e) { die(`snapshot re-read/parse failed: ${e.message}`) }
if (!Array.isArray(parsed) || parsed.length !== EXPECTED) die(`snapshot has ${Array.isArray(parsed) ? parsed.length : 'non-array'} rows, expected ${EXPECTED}`)
const snapNull = parsed.filter(r => r.reviewed_at == null)
if (snapNull.length) die(`snapshot has ${snapNull.length} rows with null reviewed_at — refusing to mutate`)
ok(`snapshot written + re-read OK: ${EXPECTED} rows, all with reviewed_at`)
console.log(`   → snapshot: ${SNAP_PATH}`)

// ── PHASE 3 — FLIP (mutation) ───────────────────────────────────────────────
console.log('\n── PHASE 3 — FLIP (mutation) ──')
const PATCH = { status: 'unreviewed', reviewed_by_id: null, reviewed_by_name: null, reviewed_at: null }

// CLOUD: only rows still currently approved among our ids (race-safe guard).
const { data: upd, error: e3 } = await cloud
  .from('intelligence_sources')
  .update(PATCH)
  .in('id', ids)
  .eq('status', 'approved')
  .select('id')
if (e3) die(`cloud update failed (nothing local written yet): ${e3.message}`)
const cloudAffected = upd?.length ?? 0
console.log(`   cloud rows updated: ${cloudAffected}`)
if (cloudAffected !== EXPECTED) console.log(`   ⚠ expected ${EXPECTED} cloud updates, got ${cloudAffected} — Phase 4 will verify true state`)

// LOCAL MIRROR: same fields, same ids, same currently-approved guard.
const db = new Database(MIRROR)  // read-write; NOT immutable
let localAffected = 0
const applyLocal = db.transaction((idList) => {
  const stmt = db.prepare("UPDATE intelligence_sources SET status='unreviewed', reviewed_by_id=NULL, reviewed_by_name=NULL, reviewed_at=NULL WHERE id=? AND status='approved'")
  for (const id of idList) localAffected += stmt.run(id).changes
})
applyLocal(ids)
console.log(`   local mirror rows updated: ${localAffected}`)
if (localAffected !== EXPECTED) console.log(`   ⚠ expected ${EXPECTED} local updates, got ${localAffected} — Phase 4 will verify true state`)

// ── PHASE 4 — VERIFY (read-only, print) ─────────────────────────────────────
console.log('\n── PHASE 4 — VERIFY ──')

// Cloud
const { count: cloudApproved } = await cloud.from('intelligence_sources')
  .select('id', { count: 'exact', head: true }).eq('project_board_id', BOARD).eq('status', 'approved')
const { count: cloud28Unrev } = await cloud.from('intelligence_sources')
  .select('id', { count: 'exact', head: true }).in('id', ids).eq('status', 'unreviewed')
const { count: cloud28StillApproved } = await cloud.from('intelligence_sources')
  .select('id', { count: 'exact', head: true }).in('id', ids).eq('status', 'approved')

// Local
const q = (sql, ...a) => db.prepare(sql).get(...a).c
const inClause = `(${ids.map(() => '?').join(',')})`
const localApproved = q(`SELECT COUNT(*) c FROM intelligence_sources WHERE project_board_id=? AND status='approved'`, BOARD)
const local28Unrev = q(`SELECT COUNT(*) c FROM intelligence_sources WHERE id IN ${inClause} AND status='unreviewed'`, ...ids)
const local28StillApproved = q(`SELECT COUNT(*) c FROM intelligence_sources WHERE id IN ${inClause} AND status='approved'`, ...ids)
db.close()

console.log(`   CLOUD  approved-on-${BOARD} = ${cloudApproved}   (expect 0)`)
console.log(`   CLOUD  of-28 now unreviewed = ${cloud28Unrev}   (expect 28)`)
console.log(`   CLOUD  of-28 still approved = ${cloud28StillApproved}   (expect 0)`)
console.log(`   LOCAL  approved-on-${BOARD} = ${localApproved}   (expect 4 — the stale csa-fw rows, 'pushed' in cloud, NOT part of the 28)`)
console.log(`   LOCAL  of-28 now unreviewed = ${local28Unrev}   (expect 28)`)
console.log(`   LOCAL  of-28 still approved = ${local28StillApproved}   (expect 0)`)

const pass =
  cloudApproved === 0 &&
  cloud28Unrev === EXPECTED && cloud28StillApproved === 0 &&
  local28Unrev === EXPECTED && local28StillApproved === 0

console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — 28 Contested Skies articles ${pass ? 'un-approved in cloud + mirror; snapshot preserved.' : 'NOT cleanly flipped — inspect counts above; snapshot preserved for restore.'}`)
console.log(`   snapshot: ${SNAP_PATH}`)
process.exit(pass ? 0 : 1)
