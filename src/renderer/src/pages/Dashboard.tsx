import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { PRIORITY_DOT, CONTENT_TYPE_COLORS, CONTENT_TYPE_LABELS } from '../types'

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

export default function Dashboard() {
  const { user, profile, isAdmin } = useAuth()
  const { tasks, columns, members, selectTask } = useWorkspace()
  const navigate = useNavigate()

  const firstName = profile?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  // Stats
  const stats = useMemo(() => {
    const active = tasks.filter(t => t.column_id !== 'col-published').length
    const inProgress = tasks.filter(t => ['col-drafting', 'col-review', 'col-delivery'].includes(t.column_id)).length
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

  // Upcoming tasks (next 10 by due date, excluding published)
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
    { label: 'Active Tasks',    value: stats.active,      icon: '📋', color: 'text-white' },
    { label: 'In Progress',     value: stats.inProgress,  icon: '✍️',  color: 'text-blue-300' },
    { label: 'Due This Week',   value: stats.dueThisWeek, icon: '📅', color: 'text-amber-300' },
    { label: 'Overdue',         value: stats.overdue,     icon: '⚠️',  color: stats.overdue > 0 ? 'text-red-400' : 'text-white' },
  ]

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Greeting */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-white">
          Good {getGreeting()}, {firstName}
          {isAdmin && (
            <span className="ml-3 text-sm font-semibold px-2.5 py-1 rounded-full bg-hub-gold/15 border border-hub-gold/30 text-hub-gold align-middle">
              Admin
            </span>
          )}
        </h1>
        <p className="text-white/35 text-sm mt-1">{today}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        {statCards.map(s => (
          <button
            key={s.label}
            onClick={() => navigate('/workspace')}
            className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 text-left hover:bg-white/[0.07] transition-colors group"
          >
            <div className="text-xl mb-2">{s.icon}</div>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-white/35 text-xs mt-1 font-medium">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upcoming tasks */}
        <div className="lg:col-span-2 bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Upcoming</h2>
            <button onClick={() => navigate('/workspace')} className="text-xs text-hub-gold/60 hover:text-hub-gold transition">
              View all →
            </button>
          </div>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="text-3xl mb-2 opacity-40">🎉</span>
              <p className="text-white/30 text-sm">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {upcoming.map(task => {
                const col = colMap[task.column_id]
                const overdue = isOverdue(task.due_date, task.column_id)
                return (
                  <div
                    key={task.id}
                    onClick={() => selectTask(task)}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.04] cursor-pointer transition group"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate group-hover:text-white transition">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center px-1 py-0 rounded text-[10px] font-semibold border ${CONTENT_TYPE_COLORS[task.content_type]}`}>
                          {CONTENT_TYPE_LABELS[task.content_type]}
                        </span>
                        {task.client && (
                          <span className="text-[11px] text-white/25">{task.client}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] ${
                        col ? `text-white/40` : 'text-white/20'
                      }`}>
                        <div className={`w-1 h-1 rounded-full ${col?.color ?? 'bg-slate-500'}`} />
                        {col?.name}
                      </div>
                      <span className={`text-[11px] font-medium tabular-nums ${overdue ? 'text-red-400' : 'text-white/30'}`}>
                        {overdue ? '⚠ ' : ''}{formatDate(task.due_date)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Team + quick stats */}
        <div className="space-y-4">
          {/* Team */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Team</h2>
              <button onClick={() => navigate('/team')} className="text-xs text-hub-gold/60 hover:text-hub-gold transition">
                Manage →
              </button>
            </div>
            <div className="p-4 space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-hub-gold/15 border border-hub-gold/20 flex items-center justify-center shrink-0">
                    <span className="text-hub-gold text-xs font-bold">
                      {(m.full_name || m.email)[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white/70 truncate">{m.full_name || m.email}</p>
                    <p className="text-[10px] text-white/25 capitalize">{m.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stage breakdown */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.06]">
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">By Stage</h2>
            </div>
            <div className="p-4 space-y-2">
              {columns.map(col => {
                const count = tasks.filter(t => t.column_id === col.id).length
                const pct = tasks.length > 0 ? (count / tasks.length) * 100 : 0
                return (
                  <div key={col.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/50">{col.name}</span>
                      <span className="text-xs text-white/30 tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
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
    </div>
  )
}
