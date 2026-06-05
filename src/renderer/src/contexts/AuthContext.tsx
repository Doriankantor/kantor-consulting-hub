import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase, Profile, ADMIN_EMAIL } from '../supabase/client'

interface AuthContextType {
  session:            Session | null
  localUser:          LocalAuthUser | null
  user:               User | null
  profile:            Profile | null
  loading:            boolean
  needsSetup:         boolean
  mustChangePassword: boolean
  isRoot:             boolean
  can:                (key: string) => boolean
  permsVersion:       number   // bumps on every permissions refresh (live invalidate); a stable re-fetch signal
  signIn:             (email: string, password: string) => Promise<{ error: string | null }>
  signOut:            () => Promise<void>
  completeSetup:      (anthropicKey: string) => Promise<void>
  skipSetup:          () => Promise<void>
  completeMustChange: () => void
  refreshProfile:     () => Promise<void>
  refreshPermissions: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const LOCAL_USER_KEY = 'kantor-local-user'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session,   setSession]   = useState<Session | null>(null)
  const [user,      setUser]      = useState<User | null>(null)
  const [profile,   setProfile]   = useState<Profile | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [needsSetup,         setNeedsSetup]         = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)

  const [localUser, setLocalUserState] = useState<LocalAuthUser | null>(() => {
    try { const s = localStorage.getItem(LOCAL_USER_KEY); return s ? JSON.parse(s) as LocalAuthUser : null }
    catch { return null }
  })

  const [permKeys, setPermKeys] = useState<Set<string>>(new Set())
  // Monotonic counter bumped on each permissions refresh. Consumers (e.g. the
  // board list) depend on this instead of permKeys' Set identity to re-fetch when
  // permissions change live, without subscribing a second permissions.onChange.
  const [permsVersion, setPermsVersion] = useState(0)
  const isRoot  = user?.email === ADMIN_EMAIL || localUser?.email === ADMIN_EMAIL
  const can = useMemo(() => (key: string) => isRoot || permKeys.has(key), [isRoot, permKeys])

  const refreshPermissions = useCallback(async () => {
    try {
      const result = await window.api.permissions.getMine()
      setPermKeys(new Set(result.keys))
      setPermsVersion(v => v + 1)
    } catch { /* best-effort */ }
  }, [])

  function setLocalUser(u: LocalAuthUser | null) {
    setLocalUserState(u)
    if (u) localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u))
    else   localStorage.removeItem(LOCAL_USER_KEY)
  }

  // Stamp the main process with the signed-in user's local id so the
  // membership-scoped cloud board handlers know who is asking (the service-role
  // key bypasses RLS, so visibility is enforced in the main process). Runs on the
  // restored session at startup and on every sign-in / sign-out.
  useEffect(() => {
    window.api.app.setActingUser(localUser?.id ?? null).catch(() => {})
  }, [localUser?.id])

  // Fetch permission keys on login and clear on logout.
  useEffect(() => {
    if (localUser) { refreshPermissions() } else { setPermKeys(new Set()) }
  }, [localUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live propagation: re-fetch permissions when main sends an invalidate
  // (triggered by member_permissions realtime change).
  useEffect(() => {
    window.api.permissions.onChange(refreshPermissions)
    return () => window.api.permissions.removeChangeListeners()
  }, [refreshPermissions])

  const checkSetupNeeded = useCallback(async () => {
    try {
      const key     = await window.api.settings.get('anthropic_api_key')
      const skipped = await window.api.settings.get('setup_skipped')
      setNeedsSetup(!key && !skipped)
    } catch { setNeedsSetup(false) }
  }, [])

  // NOTE: profile/team identity lives in LOCAL SQLite (local_users), not a
  // Supabase "profiles" table — that table doesn't exist in the configured
  // project, so the old query 404'd on every auth event (and re-fired on each
  // token refresh). Display name falls back to localUser?.name in Header.
  // Supabase AUTH (sessions / signInWithPassword) is kept intact below.
  const refreshProfile = useCallback(async () => { /* no-op: profile data is local */ }, [])

  useEffect(() => {
    let mounted = true
    if (localUser) { checkSetupNeeded().then(() => { if (mounted) setLoading(false) }) }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session); setUser(session?.user ?? null)
      if (session?.user) { checkSetupNeeded() }
      if (!localUser) setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session); setUser(session?.user ?? null)
      if (session?.user) { checkSetupNeeded() }
      else setProfile(null)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    // Main-process handler is now the source of truth: it verifies against the
    // local cache OR Supabase Auth (whichever knows the password), provisions
    // the cloud account on first sign-in / access-code, and migrates a
    // laptop-only password up to the cloud the first time it's seen.
    try {
      const result = await window.api.auth.localSignIn(email, password)
      if (result?.ok && result.user) {
        // Best-effort: establish a Supabase Auth SESSION so renderer-side
        // queries (profiles, realtime) work too. Sign-in succeeds either way.
        supabase.auth.signInWithPassword({ email, password }).catch(() => {})
        setLocalUser(result.user)
        if (result.mustChangePassword) setMustChangePassword(true)
        await checkSetupNeeded()
        return { error: null }
      }
      return { error: result?.error ?? 'Invalid email or password.' }
    } catch {
      // Main process unreachable — last-ditch direct cloud attempt.
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (!error) { await checkSetupNeeded(); return { error: null } }
      } catch { /* fall through */ }
      return { error: 'Sign-in failed. Please try again.' }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setLocalUser(null); setProfile(null)
    setNeedsSetup(false); setMustChangePassword(false)
  }

  const completeSetup  = async (key: string) => { await window.api.settings.set('anthropic_api_key', key.trim()); setNeedsSetup(false) }
  const skipSetup      = async ()            => { await window.api.settings.set('setup_skipped', 'true'); setNeedsSetup(false) }
  const completeMustChange = () => setMustChangePassword(false)

  return (
    <AuthContext.Provider value={{
      session, localUser, user, profile, loading,
      needsSetup, mustChangePassword, isRoot, can, permsVersion,
      signIn, signOut, completeSetup, skipSetup, completeMustChange, refreshProfile, refreshPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
