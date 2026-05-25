import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
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

type NotifType = AppNotification['type']
type Filter = 'all' | 'unread' | 'mention' | 'deadline'

const TYPE_ICON: Record<NotifType, string> = {
  comment:      '💬',
  mention:      '@',
  assignment:   '👤',
  deadline:     '📅',
  stage_change: '🔄',
  attachment:   '📎',
}

const TYPE_COLOR: Record<NotifType, string> = {
  comment:      'bg-blue-500/15 text-blue-400',
  mention:      'bg-purple-500/15 text-purple-400',
  assignment:   'bg-green-500/15 text-green-400',
  deadline:     'bg-red-500/15 text-red-400',
  stage_change: 'bg-amber-500/15 text-amber-400',
  attachment:   'bg-cyan-500/15 text-cyan-400',
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Inbox() {
  const { localUser } = useAuth()
  const userId = localUser?.id ?? 'local-admin'

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await window.api.notifications.get(userId)
      setNotifications(data)
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  async function handleMarkRead(id: string) {
    await window.api.notifications.markRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n))
  }

  async function handleMarkAllRead() {
    await window.api.notifications.markAllRead(userId)
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })))
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread')   return !n.read
    if (filter === 'mention')  return n.type === 'mention'
    if (filter === 'deadline') return n.type === 'deadline'
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all',      label: 'All' },
    { id: 'unread',   label: 'Unread' },
    { id: 'mention',  label: 'Mentions' },
    { id: 'deadline', label: 'Deadlines' },
  ]

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-hub-navy overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-black/20 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Inbox</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-hub-blue text-white text-[11px] font-bold min-w-[22px] text-center">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-gray-400 dark:text-white/40 hover:text-hub-gold dark:hover:text-hub-gold transition font-medium"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-6 py-2.5 border-b border-black/[0.05] dark:border-white/[0.05] bg-white dark:bg-black/10 shrink-0">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              filter === f.id
                ? 'bg-hub-gold/15 text-hub-gold border border-hub-gold/30'
                : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 dark:text-white/30 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="text-3xl">✅</div>
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">You're all caught up!</p>
            <p className="text-xs text-gray-400 dark:text-white/25">No notifications here.</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {filtered.map(n => (
              <button
                key={n.id}
                onClick={() => !n.read && handleMarkRead(n.id)}
                className={`w-full flex items-start gap-3 px-6 py-3.5 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition ${
                  !n.read ? 'bg-blue-50/50 dark:bg-hub-blue/[0.04]' : ''
                }`}
              >
                {/* Unread dot */}
                <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${!n.read ? 'bg-hub-blue' : 'bg-transparent'}`} />

                {/* Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${TYPE_COLOR[n.type]}`}>
                  {TYPE_ICON[n.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-white/70'}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs text-gray-500 dark:text-white/45 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {n.task_title && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-white/[0.08] text-[10px] text-gray-500 dark:text-white/40 font-medium border border-gray-200 dark:border-white/[0.06]">
                        {n.task_title}
                      </span>
                    )}
                    {n.actor_name && (
                      <span className="text-[10px] text-gray-400 dark:text-white/30">{n.actor_name}</span>
                    )}
                    <span className="text-[10px] text-gray-300 dark:text-white/20 ml-auto">{relativeTime(n.created_at)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
