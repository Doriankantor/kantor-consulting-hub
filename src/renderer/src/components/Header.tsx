import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
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

export default function Header() {
  const { profile, user, localUser, isAdmin } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()

  const displayName = profile?.full_name || localUser?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName[0].toUpperCase()
  const isDark = resolvedTheme === 'dark'

  return (
    <header className="titlebar-drag h-[52px] shrink-0 bg-white/70 dark:bg-hub-navy/70 backdrop-blur-md border-b border-black/[0.07] dark:border-white/[0.07] flex items-center px-4 z-10">
      <div className="w-[72px] shrink-0" />

      <div className="flex-1 flex items-center justify-center">
        <span className="text-[13px] font-semibold text-gray-500 dark:text-white/50 tracking-tight select-none">
          Kantor Consulting Hub
        </span>
      </div>

      <div className="titlebar-no-drag w-[72px] flex items-center justify-end gap-2">
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 dark:text-white/35 hover:text-gray-600 dark:hover:text-white/60 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

        {isAdmin && (
          <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-hub-gold/15 border border-hub-gold/25 text-hub-gold text-[10px] font-bold tracking-wide">
            ADMIN
          </span>
        )}
        <button
          onClick={() => navigate('/settings')}
          className="w-7 h-7 rounded-full bg-hub-gold/15 border border-hub-gold/25 flex items-center justify-center hover:bg-hub-gold/25 transition"
          title={displayName}
        >
          <span className="text-hub-gold text-xs font-bold leading-none">{initials}</span>
        </button>
      </div>
    </header>
  )
}
