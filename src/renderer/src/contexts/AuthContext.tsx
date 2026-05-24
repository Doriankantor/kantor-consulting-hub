import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase, Profile, ADMIN_EMAIL } from '../supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────

interface AuthContextType {
  session:     Session | null
  localUser:   LocalAuthUser | null
  user:        User | null
  profile:     Profile | null
  loading:     boolean
  needsSetup:  boolean
  isAdmin:     boolean
  signIn:      (email: string, password: string) => Promise<{ error: string | null }>
  signOut:     () => Promise<void>
  completeSetup: (anthropicKey: string) => Promise<void>
  skipSetup:   () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const LOCAL_USER_KEY = 'kantor-local-user'

// ── Provider ───────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session,   setSession]   = useState<Session | null>(null)
  const [user,      setUser]      = useState<User | null>(null)
  const [profile,   setProfile]   = useState<Profile | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  // Local auth — persisted in localStorage so the session survives restarts
  const [localUser, setLocalUserState] = useState<LocalAuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_USER_KEY)
      return stored ? (JSON.parse(stored) as LocalAuthUser) : null
    } catch {
      return null
    }
  })

  const isAdmin =
    user?.email === ADMIN_EMAIL ||
    localUser?.email === ADMIN_EMAIL

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setLocalUser(u: LocalAuthUser | null) {
    setLocalUserState(u)
    if (u) localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u))
    else    localStorage.removeItem(LOCAL_USER_KEY)
  }

  const checkSetupNeeded = useCallback(async () => {
    try {
      const key     = await window.api.settings.get('anthropic_api_key')
      const skipped = await window.api.settings.get('setup_skipped')
      setNeedsSetup(!key && !skipped)
    } catch {
      setNeedsSetup(false)
    }
  }, [])

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (!error && data) setProfile(data as Profile)
      else               setProfile(null)
    } catch {
      setProfile(null)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id)
  }, [user, fetchProfile])

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true

    // If we already have a local user from localStorage, skip the loading state
    if (localUser) {
      checkSetupNeeded()
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        checkSetupNeeded()
      }
      if (!localUser) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        checkSetupNeeded()
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])  // intentionally not re-running on localUser change

  // ── Sign in ────────────────────────────────────────────────────────────────

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    // 1. Try Supabase first
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) {
        await checkSetupNeeded()
        return { error: null }
      }
    } catch {
      // Supabase unavailable — fall through to local auth
    }

    // 2. Fall back to local SQLite auth
    try {
      const result = await window.api.auth.localSignIn(email, password)
      if (result.ok && result.user) {
        setLocalUser(result.user)
        await checkSetupNeeded()
        return { error: null }
      }
      return { error: result.error ?? 'Invalid email or password.' }
    } catch {
      return { error: 'Sign-in failed. Please try again.' }
    }
  }

  // ── Sign out ───────────────────────────────────────────────────────────────

  const signOut = async () => {
    await supabase.auth.signOut()
    setLocalUser(null)
    setProfile(null)
    setNeedsSetup(false)
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  const completeSetup = async (anthropicKey: string) => {
    await window.api.settings.set('anthropic_api_key', anthropicKey.trim())
    setNeedsSetup(false)
  }

  const skipSetup = async () => {
    await window.api.settings.set('setup_skipped', 'true')
    setNeedsSetup(false)
  }

  // ── Context value ──────────────────────────────────────────────────────────

  return (
    <AuthContext.Provider
      value={{
        session,
        localUser,
        user,
        profile,
        loading,
        needsSetup,
        isAdmin,
        signIn,
        signOut,
        completeSetup,
        skipSetup,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
