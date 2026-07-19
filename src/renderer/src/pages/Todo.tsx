import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConnection } from '../contexts/ConnectionContext'
import { useNavigate } from 'react-router-dom'

// Types
interface TodoTask {
  id: string
  title: string
  board_id: string
  board_name: string | null
  column_id: string
  due_date: string | null
  priority: string
  area_of_analysis: string | null
  completed_at: string | null
  assignee_ids: string[]
  content_type: string
}

interface PersonalTodoItem {
  id: string
  type: 'personal'
  title: string
  due_date: string | null
  due_time: string | null
  completed: number
  completed_at: string | null
}

interface CalendarItem {
  id: string
  type: 'calendar-event'
  title: string
  start: string
  end: string
  allDay: boolean
  calendarName: string
  calendarColor: string
  meetingLink?: string
}

type Group = 'today' | 'week' | 'upcoming' | 'nodate' | 'done'

export default function Todo() {
  const { localUser, isRoot } = useAuth()
  const { areas, openTask, setActiveBoardId } = useWorkspace()
  const { online } = useConnection()
  const navigate = useNavigate()
  const userId = localUser?.id ?? 'local-admin'
  const userName = localUser?.name ?? 'Admin'

  const [tasks, setTasks] = useState<TodoTask[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [completing, setCompleting] = useState<Set<string>>(new Set())

  // Personal todos
  const [personalTodos, setPersonalTodos] = useState<PersonalTodoItem[]>([])
  const [showAddPersonal, setShowAddPersonal] = useState(false)
  const [newPersonalTitle, setNewPersonalTitle] = useState('')
  const [newPersonalDate, setNewPersonalDate] = useState('')
  const [newPersonalTime, setNewPersonalTime] = useState('')
  const [addingPersonal, setAddingPersonal] = useState(false)

  // Calendar events
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([])
  const [showCalEvents, setShowCalEvents] = useState<boolean>(() => {
    try { return localStorage.getItem(`todo-show-cal-${userId}`) !== 'false' } catch { return true }
  })
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleNeedsReauth, setGoogleNeedsReauth] = useState(false)

  const load = useCallback(async () => {
    try {
      const [taskList, dismissedIds] = await Promise.all([
        window.api.todo.getMyTasks(userId),
        window.api.todo.getDismissed(userId),
      ])
      setTasks(taskList as TodoTask[])
      setDismissed(new Set(dismissedIds))
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  const loadPersonalTodos = useCallback(async () => {
    try {
      const items = await window.api.personalTodo.list(userId)
      setPersonalTodos(items.map(i => ({ ...i, type: 'personal' as const })))
    } catch {}
  }, [userId])

  const loadCalendarItems = useCallback(async () => {
    try {
      const status = await window.api.userGoogle.getStatus(userId)
      setGoogleConnected(status.connected)
      if (!status.connected) return
      const calsResult = await window.api.userGoogle.getCalendars(userId)
      if ('needsReauth' in calsResult && calsResult.needsReauth) {
        setGoogleNeedsReauth(true)
        setGoogleConnected(false)
        return
      }
      const cals = calsResult as { id:string; summary:string; backgroundColor:string; foregroundColor:string; primary:boolean; accessRole:string }[]
      // Read enabled toggles from localStorage (same format as TeamCalendar)
      let enabledSet: Set<string>
      try {
        const saved = localStorage.getItem(`cal-toggles-${userId}`)
        enabledSet = saved ? new Set(JSON.parse(saved)) : new Set(cals.map((c: any) => c.id))
      } catch {
        enabledSet = new Set(cals.map((c: any) => c.id))
      }

      const today = new Date()
      const startDate = today.toISOString().slice(0, 10)
      const endDate = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10)

      const now = Date.now()
      const items: CalendarItem[] = []
      for (const cal of cals) {
        if (!enabledSet.has(cal.id)) continue
        try {
          const evs = await window.api.userGoogle.getCalendarEvents(userId, cal.id, startDate, endDate, cal.backgroundColor)
          for (const ev of evs) {
            // Skip timed meetings that have already ended (all-day events always show)
            if (!ev.allDay && ev.end) {
              const endMs = new Date(ev.end).getTime()
              if (endMs < now) continue
            }
            items.push({
              id: 'gcal-' + ev.id,
              type: 'calendar-event',
              title: ev.summary,
              start: ev.start,
              end: ev.end,
              allDay: ev.allDay,
              calendarName: cal.summary,
              calendarColor: cal.backgroundColor,
              meetingLink: ev.meetingLink,
            })
          }
        } catch {}
      }
      setCalendarItems(items)
    } catch {}
  }, [userId])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadPersonalTodos() }, [loadPersonalTodos])
  useEffect(() => { loadCalendarItems() }, [loadCalendarItems])

  // Persist showCalEvents
  useEffect(() => {
    try { localStorage.setItem(`todo-show-cal-${userId}`, showCalEvents ? 'true' : 'false') } catch {}
  }, [showCalEvents, userId])

  function getGroup(task: TodoTask): Group {
    if (task.completed_at || task.column_id === 'col-published') return 'done'
    if (!task.due_date) return 'nodate'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(task.due_date)
    due.setHours(0, 0, 0, 0)
    const diff = Math.floor((due.getTime() - today.getTime()) / 86400000)
    if (diff < 0 || diff === 0) return 'today'
    if (diff <= 7) return 'week'
    return 'upcoming'
  }

  function getPersonalGroup(item: PersonalTodoItem): Group {
    if (item.completed) return 'done'
    if (!item.due_date) return 'nodate'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(item.due_date)
    due.setHours(0, 0, 0, 0)
    const diff = Math.floor((due.getTime() - today.getTime()) / 86400000)
    if (diff < 0 || diff === 0) return 'today'
    if (diff <= 7) return 'week'
    return 'upcoming'
  }

  function getCalendarGroup(item: CalendarItem): Group | null {
    const startDate = item.start.slice(0, 10)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const diff = Math.floor((start.getTime() - today.getTime()) / 86400000)
    if (diff < 0) return null // past event
    if (diff === 0) return 'today'
    if (diff <= 7) return 'week'
    return null // beyond next week, skip
  }

  async function handleComplete(task: TodoTask) {
    if (!online) return   // read-only offline
    if (completing.has(task.id)) return
    setCompleting(prev => new Set([...prev, task.id]))
    try {
      await window.api.todo.complete(task.id, userId, userName)
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed_at: new Date().toISOString(), column_id: 'col-published' } : t))
    } finally {
      setCompleting(prev => { const n = new Set(prev); n.delete(task.id); return n })
    }
  }

  async function handleUncomplete(task: TodoTask) {
    if (!online) return   // read-only offline
    await window.api.todo.uncomplete(task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed_at: null, column_id: 'col-drafting' } : t))
  }

  async function handleClearCompleted() {
    const doneTasks = visible.filter(t => getGroup(t) === 'done')
    await Promise.all(doneTasks.map(t => window.api.todo.dismiss(userId, t.id)))
    setDismissed(prev => new Set([...prev, ...doneTasks.map(t => t.id)]))
  }

  function handleTaskClick(task: TodoTask) {
    setActiveBoardId(task.board_id)
    openTask(task.id)
    navigate('/workspace')
  }

  // PERSONAL to-dos are local-first (slice 1b): the main handler writes SQLite
  // immediately and queues the cloud push, so these three must run offline. The
  // board handlers above (handleComplete / handleUncomplete) keep their offline
  // guard — they write workspace_tasks, which is cloud-authoritative with no queue.
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
      setNewPersonalTitle('')
      setNewPersonalDate('')
      setNewPersonalTime('')
      setShowAddPersonal(false)
      await loadPersonalTodos()
    } finally {
      setAddingPersonal(false)
    }
  }

  async function handlePersonalComplete(item: PersonalTodoItem) {
    if (item.completed) {
      await window.api.personalTodo.uncomplete(item.id)
    } else {
      await window.api.personalTodo.complete(item.id)
    }
    await loadPersonalTodos()
  }

  async function handlePersonalDelete(id: string) {
    // Optimistic removal before the await, then reconcile — the same shape as the
    // card-revive path, which likewise mutates state first and lets a refetch settle
    // the truth. loadPersonalTodos() re-reads local SQLite, so a rejected delete puts
    // the item back instead of leaving the list lying until a manual reload.
    setPersonalTodos(prev => prev.filter(i => i.id !== id))
    try {
      await window.api.personalTodo.delete(id)
    } catch {
      await loadPersonalTodos()
    }
  }

  const visible = tasks.filter(t => !dismissed.has(t.id))

  const groups: Record<Group, TodoTask[]> = {
    today:    visible.filter(t => getGroup(t) === 'today'),
    week:     visible.filter(t => getGroup(t) === 'week'),
    upcoming: visible.filter(t => getGroup(t) === 'upcoming'),
    nodate:   visible.filter(t => getGroup(t) === 'nodate'),
    done:     visible.filter(t => getGroup(t) === 'done'),
  }

  const personalGroups: Record<Group, PersonalTodoItem[]> = {
    today:    personalTodos.filter(i => getPersonalGroup(i) === 'today'),
    week:     personalTodos.filter(i => getPersonalGroup(i) === 'week'),
    upcoming: personalTodos.filter(i => getPersonalGroup(i) === 'upcoming'),
    nodate:   personalTodos.filter(i => getPersonalGroup(i) === 'nodate'),
    done:     personalTodos.filter(i => getPersonalGroup(i) === 'done'),
  }

  const calGroups: Record<'today' | 'week', CalendarItem[]> = {
    today: showCalEvents ? calendarItems.filter(i => getCalendarGroup(i) === 'today') : [],
    week:  showCalEvents ? calendarItems.filter(i => getCalendarGroup(i) === 'week') : [],
  }

  const GROUP_LABELS: Record<Group, string> = {
    today:    'Today',
    week:     'This Week',
    upcoming: 'Upcoming',
    nodate:   'No Date',
    done:     'Done',
  }

  function dueDateLabel(dateStr: string): { text: string; color: string } {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(dateStr); due.setHours(0, 0, 0, 0)
    const diff = Math.floor((due.getTime() - today.getTime()) / 86400000)
    if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, color: 'text-red-500 dark:text-red-400' }
    if (diff === 0) return { text: 'Today', color: 'text-amber-500 dark:text-amber-400' }
    if (diff === 1) return { text: 'Tomorrow', color: 'text-gray-500 dark:text-white/50' }
    return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'text-gray-400 dark:text-white/40' }
  }

  function TaskItem({ task, isDone }: { task: TodoTask; isDone?: boolean }) {
    const area = areas.find(a => a.id === task.area_of_analysis)
    const isCompleting = completing.has(task.id)
    const isChecked = isDone || !!task.completed_at

    return (
      <div
        className={`group flex items-center gap-3 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.04] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition cursor-pointer ${isDone ? 'opacity-60' : ''}`}
        onClick={() => handleTaskClick(task)}
      >
        {/* Checkbox */}
        <button
          onClick={e => { e.stopPropagation(); if (!isChecked) handleComplete(task); else handleUncomplete(task) }}
          className={`shrink-0 rounded border transition flex items-center justify-center ${
            isChecked
              ? 'bg-green-500 border-green-500'
              : 'border-gray-300 dark:border-white/30 hover:border-indigo-400'
          }`}
          style={{ width: 18, height: 18 }}
          disabled={isCompleting}
        >
          {(isChecked || isCompleting) && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* Area color dot */}
        {area && (
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: area.color }} />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isDone ? 'line-through text-gray-400 dark:text-white/40' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.board_name && (
              <span className="text-[10px] text-gray-400 dark:text-white/40">{task.board_name}</span>
            )}
            {isDone && task.completed_at && (
              <span className="text-[10px] text-gray-400 dark:text-white/35">
                Completed {new Date(task.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        {/* Due date */}
        {task.due_date && !isDone && (() => {
          const { text, color } = dueDateLabel(task.due_date)
          return <span className={`text-[11px] font-medium shrink-0 ${color}`}>{text}</span>
        })()}
      </div>
    )
  }

  function PersonalTodoItemComponent({ item }: { item: PersonalTodoItem }) {
    const isCompleted = !!item.completed
    return (
      <div className="group flex items-center gap-3 border border-dashed border-gray-200 dark:border-white/15 bg-gray-50/30 dark:bg-white/[0.015] rounded-xl mx-3 my-1 px-3 py-2.5">
        {/* Completion circle */}
        <button
          onClick={() => handlePersonalComplete(item)}
          className={`shrink-0 w-[18px] h-[18px] rounded-full border-2 transition flex items-center justify-center ${
            isCompleted ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-white/30 hover:border-indigo-400'
          }`}
        >
          {isCompleted && (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm ${isCompleted ? 'line-through text-gray-400 dark:text-white/40' : 'text-gray-900 dark:text-white'}`}>
              {item.title}
            </p>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-white/[0.08] text-gray-400 dark:text-white/40 border border-gray-200 dark:border-white/[0.08]">
              Personal
            </span>
          </div>
          {(item.due_date || item.due_time) && (
            <p className="text-[10px] text-gray-400 dark:text-white/40 mt-0.5">
              {item.due_date && new Date(item.due_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {item.due_time && ` at ${item.due_time}`}
            </p>
          )}
        </div>

        {/* Delete button */}
        <button
          onClick={() => handlePersonalDelete(item.id)}
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

  function CalendarEventItem({ item }: { item: CalendarItem }) {
    const timeStr = item.allDay
      ? 'All day'
      : `${item.start.slice(11, 16)} – ${item.end.slice(11, 16)}`

    return (
      <div className="flex items-center gap-3 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/15 rounded-xl mx-3 my-1 px-3 py-2.5">
        {/* Calendar icon */}
        <div className="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="11" rx="2" stroke="#6366f1" strokeWidth="1.2"/>
            <path d="M1 5h12" stroke="#6366f1" strokeWidth="1.2"/>
            <path d="M4 1v2M10 1v2" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 dark:text-white truncate">{item.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-gray-500 dark:text-white/50">{timeStr}</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.calendarColor }} />
              <span className="text-[10px] text-gray-400 dark:text-white/40 truncate">{item.calendarName}</span>
            </div>
          </div>
        </div>

        {/* Join button */}
        {item.meetingLink && (
          <button
            onClick={() => window.open(item.meetingLink, '_blank')}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-500/20 transition"
          >
            Join
          </button>
        )}
      </div>
    )
  }

  function Section({ group, tasks: sectionTasks, personalItems, calItems }: {
    group: Group
    tasks: TodoTask[]
    personalItems: PersonalTodoItem[]
    calItems?: CalendarItem[]
  }) {
    const allEmpty = sectionTasks.length === 0 && personalItems.length === 0 && (calItems?.length ?? 0) === 0
    if (allEmpty) return null
    const isDone = group === 'done'

    if (isDone) {
      const doneTasks = sectionTasks
      const donePersonal = personalItems
      if (doneTasks.length === 0 && donePersonal.length === 0) return null
      return (
        <div>
          <button
            onClick={() => setDoneExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${doneExpanded ? 'rotate-90' : ''}`}>
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider">Done</span>
            <span className="text-xs text-gray-400 dark:text-white/35">({doneTasks.length + donePersonal.length})</span>
          </button>
          {doneExpanded && (
            <>
              {doneTasks.map(t => <TaskItem key={t.id} task={t} isDone />)}
              {donePersonal.map(i => <PersonalTodoItemComponent key={i.id} item={i} />)}
              <div className="px-4 py-3">
                <button
                  onClick={handleClearCompleted}
                  className="text-xs text-gray-400 dark:text-white/40 hover:text-red-400 dark:hover:text-red-400 transition"
                >
                  Clear completed
                </button>
              </div>
            </>
          )}
        </div>
      )
    }

    return (
      <div>
        <div className="px-4 py-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">{GROUP_LABELS[group]}</span>
          <span className="text-xs text-gray-300 dark:text-white/25">({sectionTasks.length + personalItems.length + (calItems?.length ?? 0)})</span>
        </div>
        {calItems?.map(i => <CalendarEventItem key={i.id} item={i} />)}
        {personalItems.map(i => <PersonalTodoItemComponent key={i.id} item={i} />)}
        {sectionTasks.map(t => <TaskItem key={t.id} task={t} />)}
      </div>
    )
  }

  const totalPending = groups.today.length + groups.week.length + groups.upcoming.length + groups.nodate.length
    + personalGroups.today.filter(i => !i.completed).length + personalGroups.week.filter(i => !i.completed).length
    + personalGroups.upcoming.filter(i => !i.completed).length + personalGroups.nodate.filter(i => !i.completed).length
    + calGroups.today.length + calGroups.week.length

  // Personal todos only render for the logged-in user (never admin viewing others)
  const showPersonal = !isRoot || localUser?.id === userId

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
          {/* Calendar events toggle */}
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
          {/* Add personal to-do */}
          <button
            onClick={() => setShowAddPersonal(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.12] text-gray-700 dark:text-white/75 transition border border-gray-200 dark:border-white/[0.1]"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Add personal
          </button>
        </div>
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
            <input
              type="date"
              value={newPersonalDate}
              onChange={e => setNewPersonalDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <input
              type="time"
              value={newPersonalTime}
              onChange={e => setNewPersonalTime(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <button
              onClick={handleAddPersonal}
              disabled={!newPersonalTitle.trim() || addingPersonal}
              className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium transition"
            >
              {addingPersonal ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAddPersonal(false); setNewPersonalTitle(''); setNewPersonalDate(''); setNewPersonalTime('') }}
              className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/65 text-sm transition"
            >
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
            <Section
              group="today"
              tasks={groups.today}
              personalItems={showPersonal ? personalGroups.today : []}
              calItems={calGroups.today}
            />
            <Section
              group="week"
              tasks={groups.week}
              personalItems={showPersonal ? personalGroups.week : []}
              calItems={calGroups.week}
            />
            <Section
              group="upcoming"
              tasks={groups.upcoming}
              personalItems={showPersonal ? personalGroups.upcoming : []}
            />
            <Section
              group="nodate"
              tasks={groups.nodate}
              personalItems={showPersonal ? personalGroups.nodate : []}
            />
            <Section
              group="done"
              tasks={groups.done}
              personalItems={showPersonal ? personalGroups.done : []}
            />
            {totalPending === 0 && groups.done.length === 0 && personalGroups.done.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="text-3xl">✓</div>
                <p className="text-sm font-medium text-gray-500 dark:text-white/65">Nothing to do!</p>
                <p className="text-xs text-gray-400 dark:text-white/50">Tasks assigned to you will appear here.</p>
                {(!googleConnected || googleNeedsReauth) && (
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
