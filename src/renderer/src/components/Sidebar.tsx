import { useState, useEffect, useCallback } from 'react'
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

const InboxIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M1.5 9.5h3l1.5 2h3l1.5-2h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
)

const ContactsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="6" cy="5.5" r="2.8" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M1 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M11.5 4c1.38 0 2.5.9 2.5 2S12.88 8 11.5 8M14 13c0-1.66-1.12-3-2.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)

const AnalyticsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M2 13V8M6 13V4M10 13V7M14 13V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const ChatIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M2 2.5h11v8H8.5l-2 2v-2H2v-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
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
    <div className="mx-2 mt-1 mb-1 rounded-xl overflow-hidden bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06]">
      {VIEW_BUTTONS.map(v => (
        <button
          key={v.id}
          onClick={() => setViewMode(v.id)}
          className={`titlebar-no-drag w-full flex items-center gap-2 px-3 py-1.5 text-xs transition ${
            viewMode === v.id
              ? 'bg-[#EEF0FF] dark:bg-white/[0.15] text-[#4338CA] dark:text-white font-semibold'
              : 'text-[#555] dark:text-white/65 hover:text-[#2d2d2d] dark:hover:text-white/70 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
          }`}
        >
          <span className={`w-1 h-1 rounded-full ${viewMode === v.id ? 'bg-[#4338CA] dark:bg-white' : 'bg-gray-400 dark:bg-white/25'}`} />
          {v.label}
        </button>
      ))}
    </div>
  )
}

// ── Main sidebar ───────────────────────────────────────────────────────────

export default function Sidebar() {
  const { isAdmin, localUser } = useAuth()
  const { tasks } = useWorkspace()
  const [inboxUnread, setInboxUnread] = useState(0)

  const userId = localUser?.id ?? 'local-admin'

  const refreshInboxCount = useCallback(async () => {
    try {
      const count = await window.api.notifications.unreadCount(userId)
      setInboxUnread(count)
    } catch {}
  }, [userId])

  useEffect(() => {
    refreshInboxCount()
    const interval = setInterval(refreshInboxCount, 30000)
    return () => clearInterval(interval)
  }, [refreshInboxCount])

  // Dashboard badge: only count urgent tasks updated AFTER the last time
  // the user viewed the dashboard for ≥3 seconds
  const [dashSeenAt, setDashSeenAt] = useState<string>(() =>
    localStorage.getItem('dashboardSeenAt') ?? new Date(0).toISOString()
  )
  useEffect(() => {
    const onSeen = () => setDashSeenAt(localStorage.getItem('dashboardSeenAt') ?? new Date().toISOString())
    window.addEventListener('dashboardSeen', onSeen)
    return () => window.removeEventListener('dashboardSeen', onSeen)
  }, [])

  const urgentCount = tasks.filter(t =>
    t.priority === 'urgent' &&
    t.column_id !== 'col-published' &&
    t.updated_at > dashSeenAt
  ).length

  const navItems: NavItem[] = [
    { to: '/inbox',     label: 'Inbox',     icon: <InboxIcon />,     badge: inboxUnread || undefined },
    { to: '/dashboard', label: 'Dashboard', icon: <DashboardIcon />, badge: urgentCount || undefined },
    { to: '/workspace', label: 'Workspace',  icon: <WorkspaceIcon /> },
    { to: '/contacts',  label: 'Contacts',  icon: <ContactsIcon /> },
    ...(isAdmin ? [{ to: '/analytics', label: 'Analytics', icon: <AnalyticsIcon /> }] : []),
    { to: '/team',      label: 'Team',       icon: <TeamIcon /> },
    { to: '/settings',  label: 'Settings',   icon: <SettingsIcon /> },
  ]

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `titlebar-no-drag relative flex items-center gap-2.5 py-2 rounded-xl text-sm transition-all ${
      isActive
        ? 'bg-[#EEF0FF] dark:bg-white/[0.15] text-[#4338CA] dark:text-white font-semibold border-l-[3px] border-[#4338CA] dark:border-white pl-[10px] pr-3'
        : 'text-[#555] dark:text-white/75 hover:text-[#2d2d2d] dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.08] px-3'
    }`

  return (
    <aside className="w-52 shrink-0 bg-white/90 dark:bg-black/[0.3] backdrop-blur-xl border-r border-black/[0.08] dark:border-white/[0.08] flex flex-col py-3 overflow-hidden">
      <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <div key={item.to}>
            <NavLink to={item.to} className={linkClass}>
              <span className="shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="ml-auto px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold min-w-[18px] text-center">
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

      {/* Chat toggle */}
      <div className="px-2.5 mb-1">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toggleChat'))}
          className="titlebar-no-drag w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all text-[#555] dark:text-white/75 hover:text-[#2d2d2d] dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
        >
          <span className="shrink-0"><ChatIcon /></span>
          <span className="flex-1 text-left">Team Chat</span>
        </button>
      </div>

      {/* Admin indicator */}
      {isAdmin && (
        <div className="px-3 mx-2.5 py-2 rounded-xl bg-black/[0.06] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12]">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-gray-600 dark:text-white/75">
              <path d="M6 1l1.5 3 3.5.5-2.5 2.5.5 3.5L6 9l-3 1.5.5-3.5L1 4.5 4.5 4z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            </svg>
            <span className="text-[10px] font-semibold text-gray-600 dark:text-white/75">Admin</span>
          </div>
        </div>
      )}
    </aside>
  )
}
