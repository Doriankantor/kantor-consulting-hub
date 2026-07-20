import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConnection } from '../contexts/ConnectionContext'
import { useNavigate } from 'react-router-dom'
import { urgency, URGENCY_RANK, isPromoted, dueLabel, type UrgencyKey } from '../utils/urgency'

// ─────────────────────────────────────────────────────────────────────────────
// The To-Do tab (slice 3a). Structure ported from docs/TodoStepRail.html.
//
// DATA: ONE window.api.todos.list(userId) call replaces the old getMyTasks +
// personalTodo.list pair. Dismissals stay a separate read (not part of TodoItem),
// and Google meetings stay a SEPARATE, ONLINE-ONLY renderer concern — they are not
// in the main-process aggregate because they cannot be assembled locally.
//
// NO STEP RAIL HERE. `has_steps` is deliberately NOT consumed: it reads a local
// checklist table that no longer receives writes, so it is not trustworthy until
// slice 3b adds the mirror. The rail is 3b.
// ─────────────────────────────────────────────────────────────────────────────

/** Display sources = the backend's TodoItem sources + meetings, which are view-layer. */
type DisplaySource =
  | TodoItem['source']
  | 'kc-meeting'
  | 'kc-intel'
  | 'assigned'
  /**
   * The REVERSE of 'assigned' — off-card work where the acting user is the
   * ASSIGNER, not the assignee. Same slice-2.5 entity, queried from the other
   * end. No backend emits it yet, so its tab is empty by construction.
   */
  | 'assigned-by-me'

/**
 * A TodoItem widened for display. Meetings are projected into this shape so tabs,
 * promotion and bands treat every row identically — and so that when kc-meeting
 * becomes a real backend source, the UI needs no restructuring.
 */
interface DisplayItem extends Omit<TodoItem, 'source'> {
  source: DisplaySource
  /** Meetings only — carried through for the chip and Join button. */
  meta?: { timeLabel: string; calendarName: string; calendarColor: string; meetingLink?: string }
}

const TABS = [
  { id: 'kc',              name: 'KC tasks' },
  { id: 'assigned',        name: 'Assigned to me' },
  { id: 'assigned-by-me',  name: 'Assigned by me' },
  { id: 'personal',        name: 'Personal' },
  { id: 'all',             name: 'All tasks' },
] as const
type TabId = typeof TABS[number]['id']

/**
 * KC is a SUPERSET — firm work plus what's assigned TO me (prototype inTab).
 *
 * ★ 'assigned-by-me' is deliberately NOT in the superset. KC answers "what is on
 * my plate"; work I delegated is on someone ELSE's plate and would inflate my own
 * list with items I am not doing. Note this is NOT handled by the `startsWith('kc')`
 * arm either — neither 'assigned' nor 'assigned-by-me' starts with 'kc', so only
 * the explicit `=== 'assigned'` lets one through. The other falls to the final arm
 * and appears solely under its own tab.
 */
const inTab = (t: DisplayItem, id: TabId): boolean =>
  id === 'all' ? true
  : id === 'kc' ? (t.source.startsWith('kc') || t.source === 'assigned')
  : t.source === id

const BAND_LABELS: Record<UrgencyKey, string> = {
  pastdue: 'Past due', today: 'Due today', tomorrow: 'Due tomorrow',
  d2: '2 days to go', d3: '3 days to go', later: 'Later', none: 'No date',
}

export default function Todo() {
  const { localUser, isRoot } = useAuth()
  const { areas, openTask, setActiveBoardId, todoDataVersion } = useWorkspace()
  const { online } = useConnection()
  const navigate = useNavigate()
  const userId = localUser?.id ?? 'local-admin'
  const userName = localUser?.name ?? 'Admin'

  const [items, setItems] = useState<DisplayItem[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [completing, setCompleting] = useState<Set<string>>(new Set())

  const [tab, setTab] = useState<TabId>(() => {
    try {
      const saved = localStorage.getItem(`todo-tab-${userId}`)
      if (saved && TABS.some(t => t.id === saved)) return saved as TabId
    } catch { /* private mode / quota — fall through to the default */ }
    return 'personal'   // prototype default
  })
  useEffect(() => {
    try { localStorage.setItem(`todo-tab-${userId}`, tab) } catch { /* non-fatal */ }
  }, [tab, userId])

  // Add-personal form
  const [showAddPersonal, setShowAddPersonal] = useState(false)
  const [newPersonalTitle, setNewPersonalTitle] = useState('')
  const [newPersonalDate, setNewPersonalDate] = useState('')
  const [newPersonalTime, setNewPersonalTime] = useState('')
  const [addingPersonal, setAddingPersonal] = useState(false)

  // Meetings (Google, online-only, view-layer)
  const [meetings, setMeetings] = useState<DisplayItem[]>([])
  const [showCalEvents, setShowCalEvents] = useState<boolean>(() => {
    try { return localStorage.getItem(`todo-show-cal-${userId}`) !== 'false' } catch { return true }
  })
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleNeedsReauth, setGoogleNeedsReauth] = useState(false)

  // ── Loads ──────────────────────────────────────────────────────────────────
  // Refetches are SERIALIZED through this chain so overlapping pushes can never
  // interleave and land an older result last (same pattern as WorkspaceContext's
  // remoteChainRef).
  const loadChainRef = useRef<Promise<void>>(Promise.resolve())

  const load = useCallback(async () => {
    try {
      const [list, dismissedIds] = await Promise.all([
        window.api.todos.list(userId),
        window.api.todo.getDismissed(userId),
      ])
      setItems(list as DisplayItem[])
      setDismissed(new Set(dismissedIds))
    } catch {
      // Leave whatever is on screen rather than blanking the tab; the aggregate
      // already degrades per-source in main, so a total failure here is a bug
      // worth seeing as staleness, not as an empty list.
    } finally {
      setLoading(false)
    }
  }, [userId])

  const queueLoad = useCallback(() => {
    loadChainRef.current = loadChainRef.current.then(() => load()).catch(() => {})
  }, [load])

  const loadMeetings = useCallback(async () => {
    try {
      const status = await window.api.userGoogle.getStatus(userId)
      setGoogleConnected(status.connected)
      if (!status.connected) return
      const calsResult = await window.api.userGoogle.getCalendars(userId)
      if ('needsReauth' in calsResult && calsResult.needsReauth) {
        setGoogleNeedsReauth(true); setGoogleConnected(false); return
      }
      const cals = calsResult as { id: string; summary: string; backgroundColor: string }[]
      let enabledSet: Set<string>
      try {
        const saved = localStorage.getItem(`cal-toggles-${userId}`)
        enabledSet = saved ? new Set(JSON.parse(saved)) : new Set(cals.map(c => c.id))
      } catch { enabledSet = new Set(cals.map(c => c.id)) }

      const today = new Date()
      const startDate = today.toISOString().slice(0, 10)
      const endDate = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10)
      const now = Date.now()
      const out: DisplayItem[] = []
      for (const cal of cals) {
        if (!enabledSet.has(cal.id)) continue
        try {
          const evs = await window.api.userGoogle.getCalendarEvents(userId, cal.id, startDate, endDate, cal.backgroundColor)
          for (const ev of evs) {
            // Skip timed meetings that already ended (all-day events always show).
            if (!ev.allDay && ev.end && new Date(ev.end).getTime() < now) continue
            out.push({
              id: 'gcal-' + ev.id,
              source: 'kc-meeting',
              title: ev.summary,
              due_date: ev.start.slice(0, 10),
              due_time: ev.allDay ? null : ev.start.slice(11, 16),
              completed: false,
              completed_at: null,
              position: null,
              board_id: null,
              board_name: null,
              linked_task_id: null,
              column_id: null,
              area_of_analysis: null,
              has_steps: false,
              meta: {
                timeLabel: ev.allDay ? 'All day' : `${ev.start.slice(11, 16)} – ${ev.end.slice(11, 16)}`,
                calendarName: cal.summary,
                calendarColor: cal.backgroundColor,
                meetingLink: ev.meetingLink,
              },
            })
          }
        } catch { /* one calendar failing must not drop the others */ }
      }
      setMeetings(out)
    } catch { /* Google unreachable — meetings simply absent, per the offline contract */ }
  }, [userId])

  useEffect(() => { queueLoad() }, [queueLoad])
  useEffect(() => { loadMeetings() }, [loadMeetings])

  // ── REFRESH ON CHANGE ──────────────────────────────────────────────────────
  // ★ NO SECOND realtime SUBSCRIPTION HERE — deliberately.
  //
  // The preload teardown is ipcRenderer.removeAllListeners('workspace:remoteChange'),
  // which is CHANNEL-GLOBAL: a second window.api.workspace.onRemoteChange in this
  // component would be silently unsubscribed whenever WorkspaceContext's effect
  // re-ran its cleanup, and the tab would quietly stop updating with no error.
  //
  // Instead we consume `todoDataVersion` off WorkspaceContext, which bumps on every
  // realtime push from the app's single subscription. This is the same mechanism
  // TaskDetailPanel already uses via boardContentVersion.
  useEffect(() => {
    if (todoDataVersion === 0) return   // skip the initial value; mount already loaded
    queueLoad()
  }, [todoDataVersion, queueLoad])

  // Refetch when the window regains focus — covers changes made elsewhere while
  // the app was backgrounded, and anything realtime missed.
  useEffect(() => {
    const onFocus = () => queueLoad()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [queueLoad])

  useEffect(() => {
    try { localStorage.setItem(`todo-show-cal-${userId}`, showCalEvents ? 'true' : 'false') } catch { /* non-fatal */ }
  }, [showCalEvents, userId])

  // ── Identity helpers ───────────────────────────────────────────────────────
  // Personal ids are source-prefixed by the backend (`personal-<uuid>`); the raw
  // id is what the personalTodo:* handlers expect.
  const rawPersonalId = (id: string) => id.replace(/^personal-/, '')

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleComplete(item: DisplayItem) {
    if (!online) return   // board writes are cloud-authoritative — read-only offline
    const taskId = item.linked_task_id
    if (!taskId || completing.has(item.id)) return
    setCompleting(prev => new Set([...prev, item.id]))
    try {
      await window.api.todo.complete(taskId, userId, userName)
      setItems(prev => prev.map(i => i.id === item.id
        ? { ...i, completed: true, completed_at: new Date().toISOString() } : i))
      queueLoad()
    } finally {
      setCompleting(prev => { const n = new Set(prev); n.delete(item.id); return n })
    }
  }

  async function handleUncomplete(item: DisplayItem) {
    if (!online) return
    const taskId = item.linked_task_id
    if (!taskId) return
    await window.api.todo.uncomplete(taskId)
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, completed: false, completed_at: null } : i))
    queueLoad()
  }

  async function handlePersonalToggle(item: DisplayItem) {
    const id = rawPersonalId(item.id)
    // Local-first (slice 1b): these run offline by design.
    if (item.completed) await window.api.personalTodo.uncomplete(id)
    else await window.api.personalTodo.complete(id)
    queueLoad()
  }

  async function handlePersonalDelete(item: DisplayItem) {
    // Optimistic removal, then reconcile via refetch — a rejected delete puts the
    // item back rather than leaving the list lying.
    setItems(prev => prev.filter(i => i.id !== item.id))
    try { await window.api.personalTodo.delete(rawPersonalId(item.id)) }
    finally { queueLoad() }
  }

  async function handleAddPersonal() {
    if (!newPersonalTitle.trim()) return
    setAddingPersonal(true)
    try {
      await window.api.personalTodo.create({
        id: crypto.randomUUID(),
        user_id: userId,
        title: newPersonalTitle.trim(),
        due_date: newPersonalDate || undefined,
        due_time: newPersonalTime || undefined,
      })
      setNewPersonalTitle(''); setNewPersonalDate(''); setNewPersonalTime('')
      setShowAddPersonal(false)
      queueLoad()
    } finally {
      setAddingPersonal(false)
    }
  }

  async function handleClearCompleted() {
    const done = tabItems.filter(t => t.completed && t.linked_task_id)
    await Promise.all(done.map(t => window.api.todo.dismiss(userId, t.linked_task_id!)))
    setDismissed(prev => new Set([...prev, ...done.map(t => t.linked_task_id!)]))
  }

  function handleItemClick(item: DisplayItem) {
    if (item.source === 'kc-deadline' && item.board_id && item.linked_task_id) {
      setActiveBoardId(item.board_id)
      openTask(item.linked_task_id)
      navigate('/workspace')
    }
  }

  // ── Derivation ─────────────────────────────────────────────────────────────
  // Personal to-dos render only for the logged-in user (never root viewing others).
  const showPersonal = !isRoot || localUser?.id === userId

  const all = useMemo<DisplayItem[]>(() => {
    const base = items.filter(i => {
      if (i.source === 'personal' && !showPersonal) return false
      // Dismissals are keyed on the raw task id.
      if (i.linked_task_id && dismissed.has(i.linked_task_id)) return false
      return true
    })
    return showCalEvents ? [...base, ...meetings] : base
  }, [items, meetings, dismissed, showCalEvents, showPersonal])

  const tabItems = useMemo(() => all.filter(t => inTab(t, tab)), [all, tab])
  const active   = useMemo(() => tabItems.filter(t => !t.completed), [tabItems])

  // kc-intel directives pin above everything (slice 5 — empty until then).
  const directives = useMemo(() => active.filter(t => t.source === 'kc-intel'), [active])

  // PROMOTION: pastdue + today lift OUT of the bands into a pinned strip. They are
  // not duplicated below — `body` excludes them.
  const promoted = useMemo(() =>
    active
      .filter(t => t.source !== 'kc-intel' && isPromoted(urgency(t.due_date).k))
      .sort((a, b) => URGENCY_RANK[urgency(a.due_date).k] - URGENCY_RANK[urgency(b.due_date).k]),
    [active])

  const bands = useMemo(() => {
    const body = active.filter(t => t.source !== 'kc-intel' && !isPromoted(urgency(t.due_date).k))
    const map = new Map<UrgencyKey, DisplayItem[]>()
    for (const t of body) {
      const k = urgency(t.due_date).k
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(t)
    }
    // Bands are built by reducing over items PRESENT, so absent sources simply
    // produce no band — empty sources need no special-casing.
    return [...map.entries()]
      .sort((a, b) => URGENCY_RANK[a[0]] - URGENCY_RANK[b[0]])
      .map(([k, list]) => ({ k, label: BAND_LABELS[k], items: list }))
  }, [active])

  const doneItems = useMemo(() =>
    tabItems.filter(t => t.completed)
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [tabItems])

  const tabCounts = useMemo(() => {
    const out = {} as Record<TabId, number>
    for (const t of TABS) out[t.id] = all.filter(i => !i.completed && inTab(i, t.id)).length
    return out
  }, [all])

  // ── Item rendering ─────────────────────────────────────────────────────────
  function Row({ item, extraClass = '' }: { item: DisplayItem; extraClass?: string }) {
    const area = areas.find(a => a.id === item.area_of_analysis)
    const isPersonal = item.source === 'personal'
    const isMeeting  = item.source === 'kc-meeting'
    const isBusy     = completing.has(item.id)
    const u          = urgency(item.due_date)
    const dueColor =
      u.k === 'pastdue' ? 'text-red-500 dark:text-red-400'
      : u.k === 'today' ? 'text-amber-500 dark:text-amber-400'
      : 'text-gray-400 dark:text-white/40'

    if (isMeeting) {
      return (
        <div className="flex items-center gap-3 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/15 rounded-xl mx-3 my-1 px-3 py-2.5">
          <div className="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="2" width="12" height="11" rx="2" stroke="#6366f1" strokeWidth="1.2"/>
              <path d="M1 5h12" stroke="#6366f1" strokeWidth="1.2"/>
              <path d="M4 1v2M10 1v2" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 dark:text-white truncate">{item.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[10px] text-gray-500 dark:text-white/50">{item.meta?.timeLabel}</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.meta?.calendarColor }} />
                <span className="text-[10px] text-gray-400 dark:text-white/40 truncate">{item.meta?.calendarName}</span>
              </div>
            </div>
          </div>
          {item.meta?.meetingLink && (
            <button
              onClick={() => window.open(item.meta!.meetingLink, '_blank')}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-500/20 transition"
            >
              Join
            </button>
          )}
        </div>
      )
    }

    if (isPersonal) {
      return (
        <div className={`group flex items-center gap-3 border border-dashed border-gray-200 dark:border-white/15 bg-gray-50/30 dark:bg-white/[0.015] rounded-xl mx-3 my-1 px-3 py-2.5 ${extraClass}`}>
          <button
            onClick={() => handlePersonalToggle(item)}
            className={`shrink-0 w-[18px] h-[18px] rounded-full border-2 transition flex items-center justify-center ${
              item.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-white/30 hover:border-indigo-400'
            }`}
          >
            {item.completed && (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm ${item.completed ? 'line-through text-gray-400 dark:text-white/40' : 'text-gray-900 dark:text-white'}`}>
                {item.title}
              </p>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-white/[0.08] text-gray-400 dark:text-white/40 border border-gray-200 dark:border-white/[0.08]">
                Personal
              </span>
            </div>
            {(item.due_date || item.due_time) && (
              <p className={`text-[10px] mt-0.5 ${dueColor}`}>{dueLabel(item.due_date, item.due_time)}</p>
            )}
          </div>
          <button
            onClick={() => handlePersonalDelete(item)}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 dark:text-white/25 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition shrink-0"
            title="Delete"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )
    }

    // Board card (kc-deadline) — and, later, off-card 'assigned'.
    return (
      <div
        className={`group flex items-center gap-3 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.04] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition cursor-pointer ${item.completed ? 'opacity-60' : ''} ${extraClass}`}
        onClick={() => handleItemClick(item)}
      >
        <button
          onClick={e => { e.stopPropagation(); if (!item.completed) handleComplete(item); else handleUncomplete(item) }}
          className={`shrink-0 rounded border transition flex items-center justify-center ${
            item.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-white/30 hover:border-indigo-400'
          } ${!online ? 'opacity-40 cursor-not-allowed' : ''}`}
          style={{ width: 18, height: 18 }}
          disabled={isBusy || !online}
          title={!online ? 'Board tasks are read-only offline' : undefined}
        >
          {(item.completed || isBusy) && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        {area && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: area.color }} />}
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${item.completed ? 'line-through text-gray-400 dark:text-white/40' : 'text-gray-900 dark:text-white'}`}>
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {item.board_name && <span className="text-[10px] text-gray-400 dark:text-white/40">{item.board_name}</span>}
            {item.completed && item.completed_at && (
              <span className="text-[10px] text-gray-400 dark:text-white/35">
                Completed {new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        {item.due_date && !item.completed && (
          <span className={`text-[11px] font-medium shrink-0 ${dueColor}`}>{dueLabel(item.due_date)}</span>
        )}
      </div>
    )
  }

  const totalPending = tabCounts.all

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-hub-navy overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-black/20 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">To-Do</h1>
          {totalPending > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[11px] font-bold min-w-[22px] text-center">
              {totalPending}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCalEvents(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
              showCalEvents
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                : 'border-gray-200 dark:border-white/[0.1] text-gray-400 dark:text-white/40'
            }`}
            title="Toggle calendar events"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="0.5" y="1.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M0.5 4.5h11" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M3.5 0v2M8.5 0v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
            Calendar
          </button>
          <button
            onClick={() => setShowAddPersonal(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.12] text-gray-700 dark:text-white/75 transition border border-gray-200 dark:border-white/[0.1]"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Add personal
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3 bg-white dark:bg-black/20 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition ${
              tab === t.id
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70'
            }`}
          >
            {t.name}
            {tabCounts[t.id] > 0 && (
              <span className="ml-1.5 text-[10px] text-gray-400 dark:text-white/35">{tabCounts[t.id]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Inline add personal form */}
      {showAddPersonal && (
        <div className="bg-white dark:bg-black/20 border-b border-black/[0.06] dark:border-white/[0.06] px-6 py-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={newPersonalTitle}
              onChange={e => setNewPersonalTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddPersonal() }}
              placeholder="What do you need to do?"
              autoFocus
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/35 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <input type="date" value={newPersonalDate} onChange={e => setNewPersonalDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            <input type="time" value={newPersonalTime} onChange={e => setNewPersonalTime(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            <button onClick={handleAddPersonal} disabled={!newPersonalTitle.trim() || addingPersonal}
              className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium transition">
              {addingPersonal ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => { setShowAddPersonal(false); setNewPersonalTitle(''); setNewPersonalDate(''); setNewPersonalTime('') }}
              className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/65 text-sm transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 dark:text-white/50 text-sm">Loading…</div>
        ) : (
          <div className="bg-white dark:bg-black/10">
            {/* PINNED: intel directives (slice 5 — none exist yet) */}
            {directives.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  Directives
                </div>
                {directives.map(t => <Row key={t.id} item={t} extraClass="bg-violet-50/40 dark:bg-violet-500/5" />)}
              </div>
            )}

            {/* PINNED: promotion strip — past due + due today, all sources */}
            {promoted.length > 0 && (
              <div>
                <div className="px-4 py-2 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-red-500 dark:text-red-400">
                    Needs attention
                  </span>
                  <span className="text-xs text-gray-300 dark:text-white/25">({promoted.length})</span>
                </div>
                {promoted.map(t => (
                  <Row key={t.id} item={t}
                    extraClass={urgency(t.due_date).k === 'pastdue'
                      ? 'bg-red-50/40 dark:bg-red-500/5'
                      : 'bg-amber-50/40 dark:bg-amber-500/5'} />
                ))}
              </div>
            )}

            {/* BANDS */}
            {bands.map(b => (
              <div key={b.k}>
                <div className="px-4 py-2 flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">{b.label}</span>
                  <span className="text-xs text-gray-300 dark:text-white/25">({b.items.length})</span>
                </div>
                {b.items.map(t => <Row key={t.id} item={t} />)}
              </div>
            ))}

            {/* COMPLETED — collapsed by default */}
            {doneItems.length > 0 && (
              <div>
                <button
                  onClick={() => setDoneExpanded(v => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${doneExpanded ? 'rotate-90' : ''}`}>
                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider">Completed</span>
                  <span className="text-xs text-gray-400 dark:text-white/35">({doneItems.length})</span>
                </button>
                {doneExpanded && (
                  <>
                    {doneItems.map(t => <Row key={t.id} item={t} />)}
                    <div className="px-4 py-3">
                      <button onClick={handleClearCompleted}
                        className="text-xs text-gray-400 dark:text-white/40 hover:text-red-400 dark:hover:text-red-400 transition">
                        Clear completed
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* EMPTY STATES — per tab, so the not-yet-built sources read as
                intentional rather than broken. */}
            {directives.length === 0 && promoted.length === 0 && bands.length === 0 && doneItems.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 gap-3 px-6 text-center">
                {tab === 'assigned' ? (
                  <>
                    <div className="text-3xl">📋</div>
                    <p className="text-sm font-medium text-gray-500 dark:text-white/65">Nothing assigned to you yet</p>
                    <p className="text-xs text-gray-400 dark:text-white/50">
                      Off-card assignments from a board or info-page head will appear here.
                    </p>
                  </>
                ) : tab === 'assigned-by-me' ? (
                  <>
                    <div className="text-3xl">📤</div>
                    <p className="text-sm font-medium text-gray-500 dark:text-white/65">
                      You haven’t assigned anything off-card yet
                    </p>
                    <p className="text-xs text-gray-400 dark:text-white/50">
                      Tasks you delegate will appear here so you can track them.
                    </p>
                  </>
                ) : tab === 'personal' ? (
                  <>
                    <div className="text-3xl">✓</div>
                    <p className="text-sm font-medium text-gray-500 dark:text-white/65">No personal to-dos</p>
                    <p className="text-xs text-gray-400 dark:text-white/50">Use “Add personal” to jot something down.</p>
                  </>
                ) : (
                  <>
                    <div className="text-3xl">✓</div>
                    <p className="text-sm font-medium text-gray-500 dark:text-white/65">Nothing to do!</p>
                    <p className="text-xs text-gray-400 dark:text-white/50">Tasks assigned to you will appear here.</p>
                  </>
                )}
                {(tab === 'kc' || tab === 'all') && (!googleConnected || googleNeedsReauth) && (
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2 cursor-pointer hover:underline" onClick={() => navigate('/settings')}>
                    {googleNeedsReauth ? 'Re-connect Google in Settings to sync calendar events' : 'Connect Google in Settings to see calendar events'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
