import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import type { ViewMode } from '../types'

// ── Nav item type ──────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  badge?: number
}

// ── Icons ──────────────────────────────────────────────────────────────────

const DashboardIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
)

const WorkspaceIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1" y="1" width="3" height="13" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="5" y="1" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="1" width="5" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
)

const TeamIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M1 13c0-2.485 2.015-4 4.5-4s4.5 1.515 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M10.5 3c1.243 0 2.25.896 2.25 2S11.743 7 10.5 7M13.5 13c0-1.657-1.007-3-2.25-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)

const SettingsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M12.5 7.5c0-.23-.019-.455-.055-.675l1.452-1.124a.375.375 0 0 0 .09-.476l-1.377-2.382a.375.375 0 0 0-.454-.166l-1.713.687a5.59 5.59 0 0 0-1.154-.453l-.256-1.816A.375.375 0 0 0 8.625 1.5h-2.25a.375.375 0 0 0-.374.336l-.257 1.816a5.592 5.592 0 0 0-1.153.453L2.877 3.42a.375.375 0 0 0-.454.166L1.046 5.968a.375.375 0 0 0 .09.476l1.452 1.124A5.6 5.6 0 0 0 2.5 8.177l-.055-.677c0 .23.019.455.055.675L1.048 9.299a.375.375 0 0 0-.09.476l1.377 2.382a.375.375 0 0 0 .454.166l1.713-.687c.373.175.76.325 1.154.453l.256 1.816c.044.193.214.336.374.336h2.25c.193 0 .36-.144.374-.336l.257-1.816a5.59 5.59 0 0 0 1.153-.453l1.714.687a.375.375 0 0 0 .454-.166l1.377-2.382a.375.375 0 0 0-.09-.476L12.555 8.175c.036-.22.055-.445.055-.675z" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
)

// ── View switcher (inside workspace section) ───────────────────────────────

const VIEW_BUTTONS: { id: ViewMode; label: string }[] = [
  { id: 'kanban',   label: 'Kanban' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'list',     label: 'List' },
  { id: 'calendar', label: 'Calendar' },
]

function WorkspaceViewSwitcher() {
  const { viewMode, setViewMode } = useWorkspace()
  const location = useLocation()
  if (!location.pathname.startsWith('/workspace')) return null

  return (
    <div className="mx-2 mt-1 mb-1 rounded-xl overflow-hidden bg-black/20 border border-white/[0.05]">
      {VIEW_BUTTONS.map(v => (
        <button
          key={v.id}
          onClick={() => setViewMode(v.id)}
          className={`titlebar-no-drag w-full flex items-center gap-2 px-3 py-1.5 text-xs transition ${
            viewMode === v.id
              ? 'bg-hub-gold/10 text-hub-gold font-semibold'
              : 'text-white/35 hover:text-white/60 hover:bg-white/[0.04]'
          }`}
        >
          <span className={`w-1 h-1 rounded-full ${viewMode === v.id ? 'bg-hub-gold' : 'bg-white/20'}`} />
          {v.label}
        </button>
      ))}
    </div>
  )
}

// ── Main sidebar ───────────────────────────────────────────────────────────

export default function Sidebar() {
  const { isAdmin } = useAuth()
  const { tasks } = useWorkspace()

  const urgentCount = tasks.filter(t =>
    t.priority === 'urgent' && t.column_id !== 'col-published'
  ).length

  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: <DashboardIcon />, badge: urgentCount || undefined },
    { to: '/workspace', label: 'Workspace',  icon: <WorkspaceIcon /> },
    { to: '/team',      label: 'Team',       icon: <TeamIcon /> },
    { to: '/settings',  label: 'Settings',   icon: <SettingsIcon /> },
  ]

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `titlebar-no-drag flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
      isActive
        ? 'bg-hub-gold/12 text-hub-gold font-semibold'
        : 'text-white/40 hover:text-white/75 hover:bg-white/[0.05]'
    }`

  return (
    <aside className="w-52 shrink-0 bg-black/10 border-r border-white/[0.06] flex flex-col py-3 overflow-hidden">
      <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <div key={item.to}>
            <NavLink to={item.to} className={linkClass}>
              <span className="shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="ml-auto px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold min-w-[18px] text-center">
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
            {/* Inline view switcher under Workspace */}
            {item.to === '/workspace' && (
              <WorkspaceViewSwitcher />
            )}
          </div>
        ))}
      </nav>

      {/* Admin indicator */}
      {isAdmin && (
        <div className="px-3 mx-2.5 py-2 rounded-xl bg-hub-gold/[0.06] border border-hub-gold/[0.12]">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-hub-gold">
              <path d="M6 1l1.5 3 3.5.5-2.5 2.5.5 3.5L6 9l-3 1.5.5-3.5L1 4.5 4.5 4z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            </svg>
            <span className="text-[10px] font-semibold text-hub-gold/70">Admin</span>
          </div>
        </div>
      )}
    </aside>
  )
}
