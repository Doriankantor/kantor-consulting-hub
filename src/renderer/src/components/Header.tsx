import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Header() {
  const { profile, user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'
  const initials = displayName[0].toUpperCase()

  return (
    // titlebar-drag enables macOS window dragging on the header bar
    <header className="titlebar-drag h-[52px] shrink-0 bg-hub-navy/70 backdrop-blur-md border-b border-white/[0.07] flex items-center px-4 z-10">
      {/* Traffic light spacer (macOS hiddenInset puts them at x:16, y:18) */}
      <div className="w-[72px] shrink-0" />

      {/* App name centred */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[13px] font-semibold text-white/50 tracking-tight select-none">
          Kantor Consulting Hub
        </span>
      </div>

      {/* Right: admin badge + avatar */}
      <div className="titlebar-no-drag w-[72px] flex items-center justify-end gap-2">
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
