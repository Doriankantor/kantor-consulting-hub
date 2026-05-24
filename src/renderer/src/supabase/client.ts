import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Don't try to read tokens from URL hash (Electron has no URL bar)
    detectSessionInUrl: false,
    storageKey: 'kantor-hub-auth',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// ── Types ──────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'member'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  created_at: string
}

export const ADMIN_EMAIL = 'doriankantor@gmail.com'
