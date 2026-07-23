import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { ADMIN_EMAIL } from '../supabase/client'
import { useNavigate } from 'react-router-dom'

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M9.01 9.01l1.06 1.06M2.93 11.07l1.06-1.06M9.01 4.99l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M11.5 8A5.5 5.5 0 0 1 5 1.5a.5.5 0 0 0-.6-.6A6 6 0 1 0 12.1 9.1a.5.5 0 0 0-.6-.6 5.5 5.5 0 0 1 0 0z" fill="currentColor" opacity="0.8"/>
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5A4 4 0 0 0 3 5.5v3l-1 1.5h10l-1-1.5v-3A4 4 0 0 0 7 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5.5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export default function Header() {
  const { profile, user, localUser, isRoot } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [inboxUnread, setInboxUnread] = useState(0)

  // N-1: notifications are keyed by EMAIL; root falls back to the admin email.
  const userEmail = (localUser?.email ?? ADMIN_EMAIL).toLowerCase()

  const refreshUnread = useCallback(async () => {
    try {
      const count = await window.api.notifications.unreadCount(userEmail)
      setInboxUnread(count)
    } catch {}
  }, [userEmail])

  useEffect(() => {
    refreshUnread()
    const interval = setInterval(refreshUnread, 30000)
    return () => clearInterval(interval)
  }, [refreshUnread])

  const displayName = (profile as { full_name?: string } | null | undefined)?.full_name || localUser?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName[0].toUpperCase()
  const isDark = resolvedTheme === 'dark'

  return (
    <header className="titlebar-drag h-[52px] shrink-0 bg-white/[0.15] dark:bg-black/20 backdrop-blur-xl border-b border-black/[0.08] dark:border-white/[0.1] flex items-center px-4 z-10">
      {/* macOS traffic light spacer */}
      <div className="w-[110px] shrink-0" />

      <div className="flex-1 flex items-center justify-center">
        <span className="text-[13px] font-bold text-gray-900 dark:text-white/90 tracking-tight select-none">
          Kantor Consulting Hub
        </span>
      </div>

      <div className="titlebar-no-drag flex items-center justify-end gap-2">
        {/* Inbox bell */}
        <button
          onClick={() => navigate('/inbox')}
          className="relative w-8 h-8 rounded-xl flex items-center justify-center text-gray-600 dark:text-white/75 hover:text-gray-900 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.12] transition"
          title="Inbox"
        >
          <BellIcon />
          {inboxUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5 leading-none">
              {inboxUnread > 9 ? '9+' : inboxUnread}
            </span>
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-600 dark:text-white/75 hover:text-gray-900 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.12] transition"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

        {isRoot && (
          <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-black/[0.06] dark:bg-white/10 border border-black/[0.08] dark:border-white/20 text-gray-600 dark:text-white/70 text-[10px] font-bold tracking-wide">
            ADMIN
          </span>
        )}
        <button
          onClick={() => navigate('/settings')}
          className="w-8 h-8 rounded-full bg-black/[0.08] dark:bg-white/15 border border-black/[0.12] dark:border-white/25 flex items-center justify-center hover:bg-black/[0.14] dark:hover:bg-white/25 transition"
          title={displayName}
        >
          <span className="text-gray-800 dark:text-white text-xs font-bold leading-none">{initials}</span>
        </button>
      </div>
    </header>
  )
}
