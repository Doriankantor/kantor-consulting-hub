import { useState, useEffect, useCallback } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUpdate } from '../contexts/UpdateContext'
import type { ViewMode } from '../types'

// ── Nav item type ──────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  badge?: number
  updateDot?: boolean
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

const CalendarIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1.5" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M5 1.5v2M10 1.5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M1.5 6h12" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
)

const FilesIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M2 13V3a1 1 0 0 1 1-1h4l2 2h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
)

const IntelligenceIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)

const InfoPagesIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="8" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="1.5" y="8" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="8" y="8" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
)

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M2.5 4.5h10M6 4.5V3h3v1.5M5 4.5l.5 8h4l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const TodoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M3.5 4l1 1 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="1.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M9 4.5h4.5M9 7.5h4.5M9 10.5h4.5M9 12.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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

// ── New Board Modal ────────────────────────────────────────────────────────

interface NewBoardModalProps {
  areas: Area[]
  onClose: () => void
  onCreate: (name: string, areaIds: string[], description: string) => Promise<void>
}

function NewBoardModal({ areas, onClose, onCreate }: NewBoardModalProps) {
  const [name, setName] = useState('')
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    setSubmitted(true)
    if (!name.trim()) return
    setSaving(true)
    try {
      await onCreate(name.trim(), selectedAreaIds, description)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function toggleArea(id: string) {
    setSelectedAreaIds(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-white/[0.12]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">New Board</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white/75 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Board name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5">Board name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Q3 Research"
              autoFocus
              className={`w-full px-3 py-2 rounded-xl border text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                submitted && !name.trim()
                  ? 'border-red-400 dark:border-red-500'
                  : 'border-gray-200 dark:border-white/[0.1]'
              }`}
            />
            {submitted && !name.trim() && (
              <p className="text-xs text-red-500 mt-1">Board name is required.</p>
            )}
          </div>

          {/* Area tags */}
          {areas.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5">Areas (optional)</label>
              <div className="flex flex-wrap gap-1.5">
                {areas.map(area => (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => toggleArea(area.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      selectedAreaIds.includes(area.id)
                        ? 'text-white border-transparent'
                        : 'border-gray-200 dark:border-white/[0.12] text-gray-600 dark:text-white/60 hover:border-gray-300 dark:hover:border-white/20'
                    }`}
                    style={selectedAreaIds.includes(area.id) ? { backgroundColor: area.color, borderColor: area.color } : {}}
                  >
                    {area.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this board for?"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl text-sm border border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-white/65 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating…' : 'Create Board'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Main sidebar ───────────────────────────────────────────────────────────

export default function Sidebar() {
  const { isAdmin, localUser } = useAuth()
  const { boards, archivedBoards, activeBoard, setActiveBoardId, createBoard, refreshBoards, areas } = useWorkspace()
  const { state: updateState } = useUpdate()
  const updateAvailable = updateState === 'available' || updateState === 'downloading' || updateState === 'ready'
  const navigate = useNavigate()
  const location = useLocation()
  const [inboxUnread,    setInboxUnread]    = useState(0)
  const [intelUnreviewed, setIntelUnreviewed] = useState(0)
  const [archiveOpen,  setArchiveOpen]  = useState(false)
  const [memberBoardIds, setMemberBoardIds] = useState<string[]>([])
  const [newBoardModal, setNewBoardModal] = useState(false)

  const userId = localUser?.id ?? 'local-admin'

  // Load board membership for non-admin users
  useEffect(() => {
    if (isAdmin) return
    if (!userId) return
    window.api.boardMembers.listForUser(userId).then(ids => setMemberBoardIds(ids)).catch(() => {})
  }, [isAdmin, userId])

  const visibleBoards = isAdmin ? boards : boards.filter(b => memberBoardIds.includes(b.id))

  const refreshInboxCount = useCallback(async () => {
    try {
      const count = await window.api.notifications.unreadCount(userId)
      setInboxUnread(count)
    } catch {}
  }, [userId])

  useEffect(() => {
    refreshInboxCount()
    const interval = setInterval(refreshInboxCount, 30000)
    // Refresh immediately when the Inbox page marks notifications as read
    window.addEventListener('notificationsChanged', refreshInboxCount)
    return () => {
      clearInterval(interval)
      window.removeEventListener('notificationsChanged', refreshInboxCount)
    }
  }, [refreshInboxCount])

  useEffect(() => {
    const load = async () => {
      try {
        const count = await window.api.intelligence.getUnreviewedCount()
        setIntelUnreviewed(count)
      } catch {}
    }
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  // Nav items excluding workspace (rendered separately)
  const navItems: NavItem[] = [
    { to: '/inbox',     label: 'Inbox',     icon: <InboxIcon />,     badge: inboxUnread || undefined },
    { to: '/todo',      label: 'To-Do',     icon: <TodoIcon /> },
    { to: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  ]

  const navItemsAfterWorkspace: NavItem[] = [
    { to: '/files',        label: 'Files',        icon: <FilesIcon /> },
    { to: '/intelligence', label: 'Intelligence', icon: <IntelligenceIcon />, badge: intelUnreviewed || undefined },
    { to: '/info-pages',   label: 'Info Pages',   icon: <InfoPagesIcon /> },
    { to: '/contacts',     label: 'Contacts',     icon: <ContactsIcon /> },
    { to: '/calendar',  label: 'Calendar',  icon: <CalendarIcon /> },
    ...(isAdmin ? [{ to: '/analytics', label: 'Analytics', icon: <AnalyticsIcon /> }] : []),
    { to: '/team',      label: 'Team',       icon: <TeamIcon /> },
    { to: '/settings',  label: 'Settings',   icon: <SettingsIcon />, updateDot: updateAvailable },
    { to: '/trash',     label: 'Trash',      icon: <TrashIcon /> },
  ]

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `titlebar-no-drag relative flex items-center gap-2.5 py-2 rounded-xl text-sm transition-all ${
      isActive
        ? 'bg-[#EEF0FF] dark:bg-white/[0.15] text-[#4338CA] dark:text-white font-semibold border-l-[3px] border-[#4338CA] dark:border-white pl-[10px] pr-3'
        : 'text-[#555] dark:text-white/75 hover:text-[#2d2d2d] dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.08] px-3'
    }`

  const isOnWorkspace = location.pathname.startsWith('/workspace')

  async function handleNewBoard(name: string, _areaIds: string[], _description: string) {
    const newId = await createBoard(name)
    await refreshBoards()
    navigate('/workspace')
    if (isAdmin) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('newBoardCreated', { detail: { id: newId, name } }))
      }, 200)
    }
  }

  return (
    <aside className="w-52 shrink-0 bg-white/90 dark:bg-black/[0.3] backdrop-blur-xl border-r border-black/[0.08] dark:border-white/[0.08] flex flex-col py-3 overflow-hidden">
      <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto">
        {/* Items before workspace */}
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
          </div>
        ))}

        {/* Workspace section with board sub-items */}
        <div>
          <NavLink to="/workspace" className={linkClass}>
            <span className="shrink-0"><WorkspaceIcon /></span>
            <span className="flex-1">Workspace</span>
          </NavLink>

          {/* Board sub-items */}
          <div className="mt-0.5 space-y-0.5 pl-1">
            {visibleBoards.map(board => (
              <button
                key={board.id}
                onClick={() => { setActiveBoardId(board.id); navigate('/workspace') }}
                className={`titlebar-no-drag w-full flex items-center gap-2 pl-5 pr-3 py-1.5 rounded-xl text-xs transition ${
                  activeBoard?.id === board.id && isOnWorkspace
                    ? 'bg-[#EEF0FF] dark:bg-white/[0.15] text-[#4338CA] dark:text-white font-semibold'
                    : 'text-[#555] dark:text-white/75 hover:text-[#2d2d2d] dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.08]'
                }`}
              >
                <span className={`w-1 h-1 rounded-full shrink-0 ${activeBoard?.id === board.id && isOnWorkspace ? 'bg-[#4338CA] dark:bg-white' : 'bg-gray-300 dark:bg-white/25'}`} />
                <span className="truncate text-left">{board.name}</span>
              </button>
            ))}

            {/* New Board button — admin only */}
            {isAdmin && (
              <button
                onClick={() => setNewBoardModal(true)}
                className="titlebar-no-drag w-full flex items-center gap-1.5 pl-5 pr-3 py-1.5 rounded-xl text-xs text-[#888] dark:text-white/40 hover:text-[#555] dark:hover:text-white/65 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>New Board</span>
              </button>
            )}
          </div>

          {/* View switcher */}
          <WorkspaceViewSwitcher />
        </div>

        {/* Items after workspace */}
        {navItemsAfterWorkspace.map(item => (
          <div key={item.to}>
            <NavLink to={item.to} className={linkClass}>
              <span className="shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.updateDot && (
                <span className="ml-auto w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Update available" />
              )}
              {!item.updateDot && item.badge ? (
                <span className="ml-auto px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold min-w-[18px] text-center">
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
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

      {/* Archive section */}
      {archivedBoards.length > 0 && (
        <div className="px-2.5 mt-2 mb-1">
          <button
            onClick={() => setArchiveOpen(v => !v)}
            className="titlebar-no-drag w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#888] dark:text-white/40 hover:text-[#555] dark:hover:text-white/60 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition"
          >
            {/* Archive box icon */}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
              <rect x="1" y="3.5" width="11" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M1 3.5l1.5-2.5h8L12 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M4.5 7h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <span className="flex-1 text-left font-medium">Archive</span>
            <span className="text-[10px] opacity-60">{archivedBoards.length}</span>
            {/* chevron */}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${archiveOpen ? 'rotate-180' : ''}`}>
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {archiveOpen && (
            <div className="mt-1 space-y-0.5">
              {archivedBoards.map(board => (
                <button
                  key={board.id}
                  onClick={() => { setActiveBoardId(board.id); navigate('/workspace') }}
                  className="titlebar-no-drag w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#888] dark:text-white/40 hover:text-[#555] dark:hover:text-white/60 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition group"
                >
                  <svg width="11" height="11" viewBox="0 0 13 13" fill="none" className="shrink-0 opacity-50">
                    <rect x="1" y="3.5" width="11" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M1 3.5l1.5-2.5h8L12 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                    <path d="M4.5 7h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  <span className="flex-1 text-left italic truncate opacity-70">{board.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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

      {/* New Board Modal */}
      {newBoardModal && (
        <NewBoardModal
          areas={areas}
          onClose={() => setNewBoardModal(false)}
          onCreate={handleNewBoard}
        />
      )}
    </aside>
  )
}
