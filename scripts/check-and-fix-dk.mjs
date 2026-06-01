// One-shot diagnostic + fix for cross-device login.
// Lists every Supabase Auth user and (re)provisions dk@kantor-consulting.com
// with the deterministic access code so the user can sign in on any device.
//
// Usage:
//   node scripts/check-and-fix-dk.mjs                 # list users + show dk status
//   node scripts/check-and-fix-dk.mjs --provision     # also (re)create dk in Supabase Auth
//   node scripts/check-and-fix-dk.mjs --reset-pw      # reset dk's password back to the access code
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env in the repo root.

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createHash, createHmac } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import ws from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '..', '.env') })

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

// Mirror the access-code derivation from src/main/ipc/index.ts so this script
// computes the same KC-XXXX-XXXX-XXXX code the app does.
const INVITE_HMAC_KEY = createHash('sha256')
  .update('kc-invite-v1|' + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'kc-fallback-secret'))
  .digest()

function inviteCodeForEmail(email) {
  const mac = createHmac('sha256', INVITE_HMAC_KEY)
    .update(email.trim().toLowerCase())
    .digest('hex')
    .toUpperCase()
  return `KC-${mac.slice(0, 4)}-${mac.slice(4, 8)}-${mac.slice(8, 12)}`
}

const TARGET = 'dk@kantor-consulting.com'
const args = new Set(process.argv.slice(2))

console.log('Supabase URL:', url)
console.log('Listing Supabase Auth users...\n')

async function listAllUsers() {
  const all = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) { console.error('listUsers error:', error.message); process.exit(2) }
    all.push(...(data?.users ?? []))
    if ((data?.users ?? []).length < 200) break
  }
  return all
}

const users = await listAllUsers()
console.log(`Total users in Supabase Auth: ${users.length}`)
for (const u of users) {
  console.log(`  - ${u.email}  (id: ${u.id.slice(0, 8)}…  confirmed: ${u.email_confirmed_at ? 'yes' : 'no'})`)
}

const code = inviteCodeForEmail(TARGET)
console.log(`\nDeterministic access code for ${TARGET}: ${code}`)

const found = users.find(u => (u.email ?? '').toLowerCase() === TARGET.toLowerCase())
console.log(found
  ? `\n✓ ${TARGET} EXISTS in Supabase Auth (id: ${found.id})`
  : `\n✗ ${TARGET} does NOT exist in Supabase Auth`)

if (args.has('--provision') && !found) {
  console.log('\nProvisioning...')
  const { data, error } = await supabase.auth.admin.createUser({
    email: TARGET,
    password: code,
    email_confirm: true,
  })
  if (error) { console.error('createUser error:', error.message); process.exit(3) }
  console.log('✓ Created. id:', data.user.id)
  console.log(`  Initial password is the access code above (${code}).`)
  console.log('  User should sign in once with email + that code, then they will be prompted to set a real password.')
}

if (args.has('--reset-pw') && found) {
  console.log('\nResetting password back to access code...')
  const { error } = await supabase.auth.admin.updateUserById(found.id, { password: code })
  if (error) { console.error('updateUserById error:', error.message); process.exit(4) }
  console.log('✓ Password reset to access code above.')
  console.log('  User should sign in with email + access code, then set a new password.')
}

if (args.has('--confirm-all')) {
  console.log('\nConfirming any unconfirmed @kantor-consulting.com users so they can actually sign in...')
  for (const u of users) {
    const e = (u.email ?? '').toLowerCase()
    if (!e.endsWith('@kantor-consulting.com')) continue
    if (u.email_confirmed_at) { console.log(`  ✓ ${e} already confirmed, skipping`); continue }
    const { error } = await supabase.auth.admin.updateUserById(u.id, { email_confirm: true })
    if (error) console.error(`  ✗ ${e}: ${error.message}`)
    else console.log(`  ✓ ${e}: confirmed`)
  }
}

if (!args.has('--provision') && !args.has('--reset-pw') && !args.has('--confirm-all')) {
  console.log('\n(Pass --provision to create the user if missing, --reset-pw to reset their password to the access code, --confirm-all to email-confirm every @kantor-consulting.com user.)')
}
