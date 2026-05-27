import { useMemo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { PRIORITY_DOT, CONTENT_TYPE_COLORS, CONTENT_TYPE_LABELS } from '../types'
import TeamMemberProfilePanel from '../components/TeamMemberProfilePanel'

// ── Types ──────────────────────────────────────────────────────────────────

type FeedEntry = {
  id: string
  task_id: string
  actor_name: string
  action: string
  created_at: string
  source: 'activity' | 'comment'
  task_title: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function isOverdue(iso: string | null, colId: string) {
  if (!iso || colId === 'col-published') return false
  return new Date(iso) < new Date()
}
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 2)  return 'Just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function actorInitials(name: string): string {
  const parts = name.trim().split(' ')
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase()
}

const AVATAR_PALETTE = ['#ef4444','#f59e0b','#22c55e','#3b82f6','#a855f7','#06b6d4','#ec4899','#8b5cf6']
function nameColor(name: string): string {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

// Detect the type of action from the action string for an icon
function feedIcon(source: 'activity' | 'comment', action: string): string {
  if (source === 'comment') return '💬'
  const a = action.toLowerCase()
  if (a.includes('attach') || a.includes('file') || a.includes('url')) return '📎'
  if (a.includes('checklist') || a.includes('item') || a.includes('checked')) return '✅'
  if (a.includes('moved') || a.includes('stage') || a.includes('scoping') ||
      a.includes('research') || a.includes('draft') || a.includes('review') ||
      a.includes('delivery') || a.includes('published')) return '🔄'
  if (a.includes('due') || a.includes('date') || a.includes('deadline')) return '📅'
  if (a.includes('assign') || a.includes('member')) return '👤'
  if (a.includes('label')) return '🏷'
  if (a.includes('created') || a.includes('added')) return '✨'
  if (a.includes('deleted') || a.includes('removed')) return '🗑'
  return '📝'
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { localUser } = useAuth()
  const { tasks, columns, members, selectTask, openTask, setActiveBoardId } = useWorkspace()
  const navigate = useNavigate()
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null)

  const firstName = localUser?.name?.split(' ')[0] ?? localUser?.email?.split('@')[0] ?? 'there'
  const isAdmin   = localUser?.role === 'admin'
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // Clear Dashboard badge after 3 seconds of viewing
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem('dashboardSeenAt', new Date().toISOString())
      window.dispatchEvent(new CustomEvent('dashboardSeen'))
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  // Activity feed
  const [feed, setFeed] = useState<FeedEntry[]>([])
  useEffect(() => {
    window.api.activity.getFeed()
      .then(data => setFeed(data))
      .catch(() => {})
    const iv = setInterval(() => {
      window.api.activity.getFeed().then(data => setFeed(data)).catch(() => {})
    }, 15000)
    return () => clearInterval(iv)
  }, [])

  // Stats
  const stats = useMemo(() => {
    const active      = tasks.filter(t => t.column_id !== 'col-published').length
    const inProgress  = tasks.filter(t => ['col-drafting', 'col-review', 'col-delivery'].includes(t.column_id)).length
    const dueThisWeek = tasks.filter(t => {
      if (!t.due_date || t.column_id === 'col-published') return false
      const d = new Date(t.due_date)
      const now = new Date()
      const weekOut = new Date(); weekOut.setDate(now.getDate() + 7)
      return d >= now && d <= weekOut
    }).length
    const overdue = tasks.filter(t => isOverdue(t.due_date, t.column_id)).length
    return { active, inProgress, dueThisWeek, overdue }
  }, [tasks])

  // Upcoming tasks
  const upcoming = useMemo(() =>
    tasks
      .filter(t => t.due_date && t.column_id !== 'col-published')
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
      .slice(0, 8),
  [tasks])

  const colMap = useMemo(() =>
    Object.fromEntries(columns.map(c => [c.id, c])),
  [columns])

  const statCards = [
    { label: 'Active Tasks',  value: stats.active,      icon: '📋', color: 'text-gray-900 dark:text-white' },
    { label: 'In Progress',   value: stats.inProgress,  icon: '✍️',  color: 'text-blue-500 dark:text-blue-300' },
    { label: 'Due This Week', value: stats.dueThisWeek, icon: '📅', color: 'text-amber-500 dark:text-amber-300' },
    { label: 'Overdue',       value: stats.overdue,     icon: '⚠️',  color: stats.overdue > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-white' },
  ]

  return (
    <div className="p-6 h-full overflow-y-auto">

      {/* Greeting */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Good {getGreeting()}, {firstName}
          {isAdmin && (
            <span className="ml-3 text-sm font-semibold px-2.5 py-1 rounded-full bg-hub-gold/15 border border-hub-gold/30 text-hub-gold align-middle">
              Admin
            </span>
          )}
        </h1>
        <p className="text-gray-400 dark:text-white/65 text-sm mt-1">{today}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {statCards.map(s => (
          <button
            key={s.label}
            onClick={() => navigate('/workspace')}
            className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.07] transition-colors group"
          >
            <div className="text-xl mb-2">{s.icon}</div>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-gray-400 dark:text-white/65 text-xs mt-1 font-medium">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Main grid: upcoming + activity feed + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Upcoming tasks — 5 cols */}
        <div className="lg:col-span-5 bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-widest">Upcoming</h2>
            <button onClick={() => navigate('/workspace')} className="text-xs text-hub-gold/70 hover:text-hub-gold transition">
              View all →
            </button>
          </div>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="text-3xl mb-2 opacity-40">🎉</span>
              <p className="text-gray-400 dark:text-white/65 text-sm">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-white/[0.04] overflow-y-auto">
              {upcoming.map(task => {
                const col = colMap[task.column_id]
                const overdue = isOverdue(task.due_date, task.column_id)
                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      navigate('/workspace')
                      setTimeout(() => selectTask(task), 100)
                    }}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-white/[0.04] cursor-pointer transition group"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 dark:text-white/80 truncate group-hover:text-gray-900 dark:group-hover:text-white transition">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold border ${CONTENT_TYPE_COLORS[task.content_type]}`}>
                          {CONTENT_TYPE_LABELS[task.content_type]}
                        </span>
                        {task.client && (
                          <span className="text-[11px] text-gray-400 dark:text-white/65 truncate max-w-[100px]">{task.client}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-white/65">
                        <div className={`w-1 h-1 rounded-full ${col?.color ?? 'bg-slate-500'}`} />
                        <span className="hidden xl:inline">{col?.name}</span>
                      </div>
                      <span className={`text-[11px] font-medium tabular-nums ${overdue ? 'text-red-400' : 'text-gray-400 dark:text-white/65'}`}>
                        {overdue ? '⚠ ' : ''}{formatDate(task.due_date)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Activity feed — 4 cols */}
        <div className="lg:col-span-4 bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-white/[0.06] shrink-0 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-widest">Latest Changes</h2>
            <span className="text-[10px] text-gray-300 dark:text-white/50 font-medium">Live · 15s</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {feed.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center px-4">
                <span className="text-3xl mb-2 opacity-40">📭</span>
                <p className="text-gray-400 dark:text-white/65 text-sm">No activity yet</p>
                <p className="text-gray-300 dark:text-white/50 text-xs mt-1">Changes to cards will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                {feed.map(entry => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition cursor-pointer group"
                    title={entry.task_id ? 'Click to open task' : undefined}
                    onClick={() => {
                      if (!entry.task_id) return
                      navigate('/workspace')
                      setTimeout(() => openTask(entry.task_id, entry.source === 'comment' ? 'comments' : undefined), 150)
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white text-[10px] font-bold"
                      style={{ backgroundColor: nameColor(entry.actor_name) }}
                    >
                      {actorInitials(entry.actor_name)}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-snug text-gray-700 dark:text-white/75">
                        <span className="font-semibold text-gray-900 dark:text-white/90">
                          {entry.actor_name.split(' ')[0]}
                        </span>
                        {' '}
                        <span className="text-[10px] mr-1">{feedIcon(entry.source, entry.action)}</span>
                        {entry.source === 'comment' ? (
                          <>commented: <span className="italic text-gray-500 dark:text-white/75">"{entry.action}"</span></>
                        ) : (
                          entry.action
                        )}
                      </p>
                      {entry.task_title && (
                        <p className="text-[10px] text-gray-400 dark:text-white/65 mt-0.5 truncate">
                          on <span className="font-medium text-gray-500 dark:text-white/75">{entry.task_title}</span>
                        </p>
                      )}
                    </div>

                    {/* Time */}
                    <span className="text-[10px] text-gray-300 dark:text-white/50 shrink-0 mt-0.5 tabular-nums">
                      {relTime(entry.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar — 3 cols */}
        <div className="lg:col-span-3 space-y-4">

          {/* Team */}
          <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/[0.06]">
              <h2 className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-widest">Team</h2>
              <button onClick={() => navigate('/team')} className="text-xs text-hub-gold/70 hover:text-hub-gold transition">
                Manage →
              </button>
            </div>
            <div className="p-4 space-y-2">
              {members.map(m => (
                <div
                  key={m.id}
                  className={`flex items-center gap-2.5 ${isAdmin ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.04] rounded-xl px-2 py-1 -mx-2 transition' : ''}`}
                  onClick={() => isAdmin && setProfileMemberId(m.id)}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
                    style={{ backgroundColor: nameColor(m.full_name ?? m.email) }}
                  >
                    {actorInitials(m.full_name ?? m.email)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-white/80 truncate">{m.full_name ?? m.email}</p>
                    <p className="text-[10px] text-gray-400 dark:text-white/65 capitalize">{m.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stage breakdown */}
          <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-white/[0.06]">
              <h2 className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-widest">By Stage</h2>
            </div>
            <div className="p-4 space-y-2.5">
              {columns.map(col => {
                const count = tasks.filter(t => t.column_id === col.id).length
                const pct   = tasks.length > 0 ? (count / tasks.length) * 100 : 0
                return (
                  <div key={col.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500 dark:text-white/75">{col.name}</span>
                      <span className="text-xs text-gray-400 dark:text-white/65 tabular-nums font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.07] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${col.color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>

      {profileMemberId && (
        <TeamMemberProfilePanel
          memberId={profileMemberId}
          onClose={() => setProfileMemberId(null)}
        />
      )}
    </div>
  )
}
