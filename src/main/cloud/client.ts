import { createClient, SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'

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
// `ws` MUST be supplied as the realtime transport: createClient eagerly builds a
// RealtimeClient, and Electron's Node 20 has no native WebSocket — without this
// the constructor throws "Node.js 20 detected without native WebSocket support"
// at startup and crashes the whole main process. Mirrors the cs_articles client.
export const cloud: SupabaseClient = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  }
)

// The system admin is the logged-in owner, not a team member / chat participant.
export const CLOUD_ADMIN_EMAIL = 'doriankantor@gmail.com'
