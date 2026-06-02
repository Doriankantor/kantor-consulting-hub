import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Shared cloud client (main process, service-role) ─────────────────────────
// This is the SINGLE place every migrated content category gets its Supabase
// client. All cloud access goes renderer → IPC → main → here; the renderer never
// touches Supabase directly.
//
// The service-role key BYPASSES RLS by design — the main process is the trusted
// server tier and stamps the caller's identity itself. RLS on each cloud table
// therefore protects against the *public anon key* (which is baked into the
// renderer bundle and could otherwise read/write the table directly), not this
// path. Every cloud table must still have RLS enabled.
//
// process.env.SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected at build time
// by electron.vite.config.ts → define.
export const cloud: SupabaseClient = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// The system admin is the logged-in owner, not a team member / chat participant.
export const CLOUD_ADMIN_EMAIL = 'doriankantor@gmail.com'
