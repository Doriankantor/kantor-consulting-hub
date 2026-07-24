import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConnection } from '../contexts/ConnectionContext'
import { ADMIN_EMAIL } from '../supabase/client'

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

// Notify the sidebar to refresh its counter immediately
function notifyRead() {
  window.dispatchEvent(new CustomEvent('notificationsChanged'))
}

// N-2b-1: mark-read is ONLINE-REQUIRED (N-2a). Offline, main returns
// { ok:false, error:'offline' } having written NOTHING — not cloud, not the
// mirror. env.d.ts still types the result as { ok?: boolean }; main has returned
// the wider shape since N-2a. Narrowed here rather than widening the shared type,
// which would be a preload/env.d.ts change and is outside this slice.
type MarkResult = { ok?: boolean; error?: string }

// One wording rule for both paths. 'offline' is the common case and is
// self-explanatory, so it gets the actionable sentence; anything else reports the
// underlying reason so a real failure is not disguised as a connectivity blip.
function markFailureMessage(kind: 'one' | 'all', error?: string): string {
  const what = kind === 'all' ? "Couldn't mark all as read" : "Couldn't mark as read"
  if (error === 'offline') return `${what} — you're offline. Try again when you reconnect.`
  return error ? `${what} — ${error}` : `${what} — the request failed.`
}

type NotifType = AppNotification['type']
type Filter = 'all' | 'unread' | 'mention' | 'deadline'

const SECTION_FOR_TYPE: Record<NotifType, string> = {
  comment:      'comments',
  mention:      'comments',
  assignment:   'members',
  deadline:     'dates',
  stage_change: 'stage',
  attachment:   'attachments',
}

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

// Left-border color per type (unread only)
const BORDER_COLOR: Record<NotifType, string> = {
  comment:      'border-l-blue-400',
  mention:      'border-l-purple-400',
  assignment:   'border-l-green-400',
  deadline:     'border-l-red-400',
  stage_change: 'border-l-amber-400',
  attachment:   'border-l-cyan-400',
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Inbox() {
  const { localUser } = useAuth()
  const { openTask } = useWorkspace()
  const { online } = useConnection()
  const navigate = useNavigate()
  // N-1: notifications are keyed by EMAIL. Root falls back to the admin email so
  // the break-glass 'local-admin' session still resolves to a real inbox.
  const userEmail = (localUser?.email ?? ADMIN_EMAIL).toLowerCase()

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  // The ONE error surface for this page. Inline, not a timed toast — there are
  // already seven ad-hoc useState+setTimeout toasts in this codebase. Cleared by
  // the next mark-read that succeeds, never by a timer.
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await window.api.notifications.get(userEmail)
      setNotifications(data)
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [userEmail])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  // Mark a single notification as read. AWAIT THE RESULT FIRST, then update state
  // only if it succeeded. Not optimistic-then-rollback: rolling back would make
  // the row flip to read and back, which is the flicker this replaces. The old
  // code applied the update unconditionally, so offline the row went read and then
  // silently reverted up to 30s later when the poll re-read the mirror.
  async function markOneRead(id: string) {
    let res: MarkResult
    try {
      res = (await window.api.notifications.markRead(id)) as MarkResult
    } catch (e) {
      // A genuine throw — the IPC call itself failed, distinct from a returned
      // { ok:false }. Same handling: no state change, error surfaced.
      setActionError(markFailureMessage('one', (e as Error)?.message))
      return
    }
    if (!res?.ok) {
      setActionError(markFailureMessage('one', res?.error))
      return
    }
    setActionError(null)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n))
    notifyRead()
  }

  // Click on the row body → mark as read in place (no navigation)
  function handleRowClick(n: AppNotification) {
    if (!n.read) void markOneRead(n.id)
  }

  // Click "Go to card" → mark as read + navigate to task. Navigation is NOT
  // gated on the mark-read result: opening the card is what the user asked for
  // and it works offline.
  function handleGoToCard(n: AppNotification, e: React.MouseEvent) {
    e.stopPropagation()
    if (!n.read) void markOneRead(n.id)
    if (!n.task_id) return
    openTask(n.task_id, SECTION_FOR_TYPE[n.type])
    navigate('/workspace')
  }

  async function handleMarkAllRead() {
    let res: MarkResult
    try {
      res = (await window.api.notifications.markAllRead(userEmail)) as MarkResult
    } catch (e) {
      setActionError(markFailureMessage('all', (e as Error)?.message))
      return
    }
    if (!res?.ok) {
      setActionError(markFailureMessage('all', res?.error))
      return
    }
    setActionError(null)
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })))
    notifyRead()
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
          // N-2c-3: "Mark all as read" is INTENTIONALLY online-required. Its cloud
          // update is unbounded (WHERE user_email=? AND read=0); offline the mirror
          // cannot prove which unread rows are in cloud (pending_sync is overloaded;
          // N-1 rewrote unread legacy rows to email keys), so a blind bulk mark would
          // seed D8-excluded rows into a delete-less cloud table. The DISABLE is the
          // PRIMARY signal (known-offline). handleMarkAllRead's {ok:false} rose strip
          // stays as the BACKSTOP for the hysteresis window — a click in the first
          // ~2 failures after a drop, before `online` flips false, still attempts the
          // call and fails cleanly. Single-row markRead works offline (N-2c-2) and is
          // NOT gated here.
          <button
            onClick={handleMarkAllRead}
            disabled={!online}
            title={!online ? 'Unavailable while offline' : undefined}
            className="text-xs text-gray-400 dark:text-white/65 hover:text-hub-gold dark:hover:text-hub-gold transition font-medium disabled:opacity-50"
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
                : 'text-gray-500 dark:text-white/65 hover:text-gray-700 dark:hover:text-white/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
            }`}
          >
            {f.label}
            {f.id === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-hub-blue/20 text-hub-blue text-[10px] font-bold">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Action error — inline, persists until the next successful mark-read.
          Deliberately NOT the app:notice / connection banner: that channel is for
          main-process side effects with no in-flight call to return through. This
          is a renderer-initiated action with a return value, so it reports through
          its own return path. */}
      {actionError && (
        <div className="shrink-0 flex items-center gap-2 px-6 py-2 bg-rose-500/10 border-b border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
          {actionError}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 dark:text-white/50 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="text-3xl">✅</div>
            <p className="text-sm font-medium text-gray-500 dark:text-white/65">You're all caught up!</p>
            <p className="text-xs text-gray-400 dark:text-white/50">No notifications here.</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {filtered.map(n => {
              const isUnread = !n.read
              return (
                <div
                  key={n.id}
                  onClick={() => handleRowClick(n)}
                  className={`group relative flex items-start gap-3 pl-4 pr-6 py-3.5 cursor-pointer transition border-l-[3px] ${
                    isUnread
                      ? `${BORDER_COLOR[n.type]} bg-blue-50/60 dark:bg-hub-blue/[0.06] hover:bg-blue-50 dark:hover:bg-hub-blue/[0.09]`
                      : 'border-l-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Unread dot */}
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 transition ${
                    isUnread ? 'bg-hub-blue' : 'bg-transparent'
                  }`} />

                  {/* Type icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${TYPE_COLOR[n.type]}`}>
                    {TYPE_ICON[n.type]}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${
                      isUnread
                        ? 'font-semibold text-gray-900 dark:text-white'
                        : 'font-normal text-gray-600 dark:text-white/60'
                    }`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className={`text-xs mt-0.5 line-clamp-2 leading-relaxed ${
                        isUnread
                          ? 'text-gray-600 dark:text-white/70'
                          : 'text-gray-400 dark:text-white/45'
                      }`}>{n.body}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {n.task_title && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${
                          isUnread
                            ? 'bg-gray-100 dark:bg-white/[0.1] text-gray-600 dark:text-white/70 border-gray-200 dark:border-white/[0.08]'
                            : 'bg-gray-50 dark:bg-white/[0.05] text-gray-400 dark:text-white/50 border-gray-100 dark:border-white/[0.05]'
                        }`}>
                          {n.task_title}
                        </span>
                      )}
                      {n.actor_name && (
                        <span className="text-[10px] text-gray-400 dark:text-white/50">{n.actor_name}</span>
                      )}
                      <span className="text-[10px] text-gray-300 dark:text-white/40 ml-auto">{relativeTime(n.created_at)}</span>
                    </div>
                  </div>

                  {/* "Go to card" button */}
                  {n.task_id && (
                    <button
                      onClick={e => handleGoToCard(n, e)}
                      className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition flex items-center gap-1 px-2.5 py-1 rounded-lg bg-hub-gold/10 hover:bg-hub-gold/20 text-hub-gold text-[11px] font-semibold border border-hub-gold/20 hover:border-hub-gold/40 whitespace-nowrap"
                    >
                      Go to card
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M2 7L7 2M7 2H3.5M7 2V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
