import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConnection } from '../contexts/ConnectionContext'
import { useNavigate } from 'react-router-dom'
import { urgency, URGENCY_RANK, isPromoted, dueLabel, type UrgencyKey } from '../utils/urgency'
import StepRail, { railOrder } from '../components/StepRail'

// ─────────────────────────────────────────────────────────────────────────────
// The To-Do tab (slice 3a). Structure ported from docs/TodoStepRail.html.
//
// DATA: ONE window.api.todos.list(userId) call replaces the old getMyTasks +
// personalTodo.list pair. Dismissals stay a separate read (not part of TodoItem),
// and Google meetings stay a SEPARATE, ONLINE-ONLY renderer concern — they are not
// in the main-process aggregate because they cannot be assembled locally.
//
// STEP RAIL (3b) — PERSONAL ITEMS ONLY. Personal steps arrive INLINE on the
// TodoItem (`steps`), so the rail needs no fetch of its own. Board cards still get
// NO rail: their steps are card checklists, which read an unmirrored local table
// and whose toggle is a card edit gated by slice 4's EDIT tier.
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

/**
 * ★ ADD-STEP INPUT — MODULE-LEVEL, WITH ITS OWN DRAFT STATE. Both halves matter.
 *
 * THE BUG THIS FIXES: `Row` is defined INSIDE `Todo()`, so every render of Todo
 * creates a NEW function identity for it. React compares component types by
 * identity, sees a different type, and UNMOUNTS + REMOUNTS the whole subtree
 * rather than updating it — destroying the DOM node that had focus. With the draft
 * held in Todo's state, each keystroke re-rendered Todo → new Row → remount →
 * focus lost after exactly one character.
 *
 * THE FIX: keep the draft HERE. Typing now mutates only this component's state, so
 * Todo never re-renders while you type, Row is never recreated, and the input node
 * survives. `onAdd` fires on Enter only — the one moment a refetch is wanted anyway.
 *
 * Defined at module level so its own identity is stable too; without that it would
 * be recreated alongside Row and remount regardless of where the draft lived.
 */
function AddStepInput({ onAdd }: { onAdd: (text: string) => void }) {
  const [draft, setDraft] = useState('')
  return (
    <input
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key !== 'Enter') return
        const t = draft.trim()
        if (!t) return
        setDraft('')
        onAdd(t)
      }}
      placeholder="Add step"
      className="w-full bg-transparent text-xs px-1 py-1 border-b border-transparent focus:border-indigo-400 outline-none text-gray-700 dark:text-white/80 placeholder:text-gray-400 dark:placeholder:text-white/30"
    />
  )
}

/**
 * ★ THE PERSONAL CARD — MODULE-LEVEL, AND THAT IS THE WHOLE POINT.
 *
 * `Row` is defined INSIDE `Todo()`, so it gets a new function identity on every
 * Todo render and React REMOUNTS its entire subtree rather than reconciling it.
 * That destroyed the Step Rail's DOM nodes on every toggle, which is why FLIP had
 * no "before" node to measure and the fill bar had no from-width to transition.
 *
 * React.memo CANNOT fix that: memo skips re-rendering a component that stays
 * MOUNTED — it cannot survive a parent unmount, and its comparator is never even
 * reached when the parent element's type changed. Stabilizing props via
 * useCallback/useMemo has the same limitation.
 *
 * Hoisting THIS component out is what fixes it: its type is now stable, so React
 * reconciles it (and StepRail below it) instead of tearing it down. Note the
 * distinction that matters — CHANGING PROP IDENTITY causes a re-render, which is
 * fine and in fact required for FLIP; CHANGING COMPONENT TYPE causes a remount,
 * which is fatal. The handlers below may be recreated freely.
 *
 * `Row` itself stays inside Todo (logged tech debt) — only the branch that owns
 * DOM state needed to move.
 */
function PersonalCard({
  item, isOpen, dueColor, extraClass = '',
  onComplete, onDelete, onToggleExpand, onStepToggle, onStepAdd, onStepDelete,
}: {
  item: DisplayItem
  isOpen: boolean
  dueColor: string
  extraClass?: string
  onComplete: () => void
  onDelete: () => void
  onToggleExpand: () => void
  onStepToggle: (stepId: string) => void
  onStepAdd: (text: string) => void
  onStepDelete: (stepId: string) => void
}) {
  const steps = item.steps ?? []
  return (
      <div className={`group border border-dashed border-gray-200 dark:border-white/15 bg-gray-50/30 dark:bg-white/[0.015] rounded-xl mx-3 my-1 px-3 py-2.5 ${extraClass}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onComplete()}
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
        {/* ★ AFFORDANCES — visible at rest, not hover-only. They were opacity-0
            until hover on a gray-300 / white-25 icon, which is invisible twice
            over: undiscoverable before hover, low-contrast after. Now they sit at
            60% and come to full on hover, on a larger 7×7 target with a heavier
            stroke. Same interaction, actually findable. */}
        <button
          onClick={() => onToggleExpand()}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition shrink-0 opacity-60 group-hover:opacity-100 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 ${
            isOpen
              ? 'text-indigo-500 dark:text-indigo-400 opacity-100'
              : 'text-gray-500 dark:text-white/50 hover:text-indigo-500 dark:hover:text-indigo-400'
          }`}
          title={isOpen ? 'Hide steps' : 'Steps'}
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none"
               className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={() => onDelete()}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-white/50 opacity-60 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition shrink-0"
          title="Delete"
        >
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* ★ THE RAIL IS ALWAYS VISIBLE ONCE A STEP EXISTS — no expand required.
          StepRail itself returns null at zero steps, so a step-less to-do renders
          exactly as it did before 3b: no bar, no track, nothing. */}
      <StepRail
        steps={steps}
        labelMode={steps.length <= 4 ? 'all' : 'truncate'}
        onToggle={sid => onStepToggle(sid)}
      />

      {/* EXPANDED — the EDITING affordances only (add + per-step delete). The rail
          above stays put; expanding never moves or duplicates it. */}
      {isOpen && (
        <div className="mt-2 pt-2 border-t border-dashed border-gray-300 dark:border-white/[0.12] space-y-1">
          {railOrder(steps).map(s => (
            <div key={s.id} className="flex items-start gap-2 group/step py-0.5">
              <button
                onClick={() => onStepToggle(s.id)}
                className={`shrink-0 mt-[3px] w-[16px] h-[16px] rounded-full border-2 flex items-center justify-center transition-all duration-150 hover:scale-110 ${
                  s.checked ? 'bg-indigo-500 border-indigo-500' : 'bg-gray-100 dark:bg-white/[0.08] border-gray-300 dark:border-white/30 hover:border-indigo-400'
                }`}
              >
                {s.checked && (
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <span className={`flex-1 min-w-0 text-xs leading-snug break-words ${s.checked ? 'text-indigo-500 dark:text-indigo-300' : 'text-gray-600 dark:text-white/70'}`}>
                {s.text}
              </span>
              <button
                onClick={() => onStepDelete(s.id)}
                className="opacity-0 group-hover/step:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-gray-500 dark:text-white/50 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition shrink-0"
                title="Delete step"
              >
                <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))}
          <AddStepInput onAdd={text => onStepAdd(text)} />
        </div>
      )}
      </div>
  )
}

/** Due-date colour. Module-level so both render paths share one definition. */
function dueColorFor(item: DisplayItem): string {
  const k = urgency(item.due_date).k
  return k === 'pastdue' ? 'text-red-500 dark:text-red-400'
    : k === 'today' ? 'text-amber-500 dark:text-amber-400'
    : 'text-gray-400 dark:text-white/40'
}

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

  // Which personal cards are expanded (step editing). Ephemeral by design — this
  // is an editing affordance, not a preference worth persisting across sessions.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpanded = (id: string): void => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  // NOTE: add-step drafts deliberately do NOT live here. See AddStepInput — holding
  // them in this component re-rendered Todo on every keystroke, which recreated the
  // inline `Row` and remounted the input, losing focus after one character.

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
              // Meetings have no local row to write to; raw_id carries the bare
              // Google event id purely for shape parity with the aggregate.
              raw_id: ev.id,
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

  // ── Steps (3b) ─────────────────────────────────────────────────────────────
  // NO `if (!online)` GUARD ANYWHERE BELOW — deliberately. Personal is the
  // offline-capable source (local-first + sync queue, 1b), and the 1b lesson was
  // that a renderer-side online guard blocks the one write path that works
  // offline. Board actions elsewhere on this page ARE guarded; these must not be.

  async function handleStepToggle(item: DisplayItem, stepId: string) {
    // Optimistic: the rail's FLIP animation reads from the CURRENT render, so
    // waiting for the round-trip would make the dots jump instead of slide.
    setItems(prev => prev.map(i => i.id !== item.id ? i : {
      ...i,
      steps: (i.steps ?? []).map(s => s.id === stepId ? { ...s, checked: !s.checked } : s),
    }))
    // ★ NO queueLoad() HERE — deliberately. The refetch used to land mid-animation
    // and re-settle the rail, producing a visible second hitch. The optimistic
    // update above already holds the correct state, and the write is durable
    // regardless: the handler writes LOCAL first and hands the cloud op to the
    // sync queue, which replays it on reconnect. Refetching bought nothing but a
    // flicker. A genuinely failed toggle is corrected by the next natural
    // refetch (focus, realtime push, tab switch) rather than by fighting the
    // animation on every successful one.
    const res = await window.api.personalTodoStep.toggle(stepId)
    if (!res?.ok) {
      // Revert only on an explicit refusal (e.g. the row vanished). Silent
      // divergence between what the rail shows and what is stored is worse than
      // a visible snap-back.
      setItems(prev => prev.map(i => i.id !== item.id ? i : {
        ...i,
        steps: (i.steps ?? []).map(s => s.id === stepId ? { ...s, checked: !s.checked } : s),
      }))
    }
  }

  async function handleStepAdd(item: DisplayItem, text: string) {
    const body = text.trim()
    if (!body) return
    // raw_id, NOT item.id — the display id carries a `personal-` prefix and would
    // create a step attached to no to-do, with no FK to reject it.
    await window.api.personalTodoStep.create(item.raw_id, body)
    queueLoad()
  }

  async function handleStepDelete(stepId: string, item: DisplayItem) {
    setItems(prev => prev.map(i => i.id !== item.id ? i : {
      ...i, steps: (i.steps ?? []).filter(s => s.id !== stepId),
    }))
    try { await window.api.personalTodoStep.delete(stepId) }
    finally { queueLoad() }
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
  /**
   * ★ THE DISPATCHER. Personal items go STRAIGHT to PersonalCard; everything else
   * goes through Row.
   *
   * This is a FACTORY, not a component — it is never used as a JSX type, so its
   * unstable identity is harmless. React reconciles on the element type it RETURNS
   * (`PersonalCard`, module-level and stable), which is the whole point:
   *
   *   Todo re-render → Row gets a new identity → React unmounts the Row fiber and
   *   EVERYTHING under it. Nothing below that boundary can be saved — not by
   *   React.memo, not by a stable child type, not by useCallback'd props. Two
   *   earlier attempts failed on exactly that.
   *
   * Routing personal cards ABOVE the boundary is what makes their DOM persist, so
   * StepRail keeps its nodes and FLIP has a "before" to measure. Board and meeting
   * cards still remount every render — harmless, they hold no focus or animation
   * state. ⚠ Do NOT reintroduce a component defined inside Todo for personal cards.
   */
  function renderItem(item: DisplayItem, extraClass = ''): JSX.Element {
    if (item.source === 'personal') {
      return (
        <PersonalCard
          key={item.id}
          item={item}
          isOpen={expanded.has(item.id)}
          dueColor={dueColorFor(item)}
          extraClass={extraClass}
          onComplete={() => handlePersonalToggle(item)}
          onDelete={() => handlePersonalDelete(item)}
          onToggleExpand={() => toggleExpanded(item.id)}
          onStepToggle={sid => handleStepToggle(item, sid)}
          onStepAdd={text => handleStepAdd(item, text)}
          onStepDelete={sid => handleStepDelete(sid, item)}
        />
      )
    }
    return <Row key={item.id} item={item} extraClass={extraClass} />
  }

  function Row({ item, extraClass = '' }: { item: DisplayItem; extraClass?: string }) {
    const area = areas.find(a => a.id === item.area_of_analysis)
    const isMeeting  = item.source === 'kc-meeting'
    const isBusy     = completing.has(item.id)
    const dueColor   = dueColorFor(item)

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

    // ⚠ NO PERSONAL BRANCH HERE — deliberately removed. Personal items are routed
    // to PersonalCard by renderItem, ABOVE this component, because anything Row
    // renders is destroyed whenever Row's identity changes. Re-adding a personal
    // branch here would silently reinstate the animation bug.

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
                {directives.map(t => renderItem(t, 'bg-violet-50/40 dark:bg-violet-500/5'))}
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
                {promoted.map(t => renderItem(t, urgency(t.due_date).k === 'pastdue'
                  ? 'bg-red-50/40 dark:bg-red-500/5'
                  : 'bg-amber-50/40 dark:bg-amber-500/5'))}
              </div>
            )}

            {/* BANDS */}
            {bands.map(b => (
              <div key={b.k}>
                <div className="px-4 py-2 flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">{b.label}</span>
                  <span className="text-xs text-gray-300 dark:text-white/25">({b.items.length})</span>
                </div>
                {b.items.map(t => renderItem(t))}
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
                    {doneItems.map(t => renderItem(t))}
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
