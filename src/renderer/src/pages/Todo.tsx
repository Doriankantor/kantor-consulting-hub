import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
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

type Group = 'today' | 'week' | 'upcoming' | 'nodate' | 'done'

export default function Todo() {
  const { localUser } = useAuth()
  const { areas, openTask, setActiveBoardId } = useWorkspace()
  const navigate = useNavigate()
  const userId = localUser?.id ?? 'local-admin'
  const userName = localUser?.name ?? 'Admin'

  const [tasks, setTasks] = useState<TodoTask[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [completing, setCompleting] = useState<Set<string>>(new Set())

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

  useEffect(() => { load() }, [load])

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

  async function handleComplete(task: TodoTask) {
    if (completing.has(task.id)) return
    setCompleting(prev => new Set([...prev, task.id]))
    try {
      await window.api.todo.complete(task.id, userId, userName)
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed_at: new Date().toISOString(), column_id: 'col-published' } : t))
    } finally {
      setCompleting(prev => { const n = new Set(prev); n.delete(task.id); return n })
    }
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

  const visible = tasks.filter(t => !dismissed.has(t.id))

  const groups: Record<Group, TodoTask[]> = {
    today:    visible.filter(t => getGroup(t) === 'today'),
    week:     visible.filter(t => getGroup(t) === 'week'),
    upcoming: visible.filter(t => getGroup(t) === 'upcoming'),
    nodate:   visible.filter(t => getGroup(t) === 'nodate'),
    done:     visible.filter(t => getGroup(t) === 'done'),
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
          onClick={e => { e.stopPropagation(); if (!isChecked) handleComplete(task) }}
          className={`shrink-0 rounded border transition flex items-center justify-center ${
            isChecked
              ? 'bg-green-500 border-green-500'
              : 'border-gray-300 dark:border-white/30 hover:border-indigo-400'
          }`}
          style={{ width: 18, height: 18 }}
          disabled={isCompleting || isChecked}
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

  function Section({ group, tasks: sectionTasks }: { group: Group; tasks: TodoTask[] }) {
    if (sectionTasks.length === 0) return null
    const isDone = group === 'done'

    if (isDone) {
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
            <span className="text-xs text-gray-400 dark:text-white/35">({sectionTasks.length})</span>
          </button>
          {doneExpanded && (
            <>
              {sectionTasks.map(t => <TaskItem key={t.id} task={t} isDone />)}
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
          <span className="text-xs text-gray-300 dark:text-white/25">({sectionTasks.length})</span>
        </div>
        {sectionTasks.map(t => <TaskItem key={t.id} task={t} />)}
      </div>
    )
  }

  const totalPending = groups.today.length + groups.week.length + groups.upcoming.length + groups.nodate.length

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
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 dark:text-white/50 text-sm">Loading…</div>
        ) : totalPending === 0 && groups.done.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="text-3xl">✓</div>
            <p className="text-sm font-medium text-gray-500 dark:text-white/65">Nothing to do!</p>
            <p className="text-xs text-gray-400 dark:text-white/50">Tasks assigned to you will appear here.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-black/10">
            <Section group="today" tasks={groups.today} />
            <Section group="week" tasks={groups.week} />
            <Section group="upcoming" tasks={groups.upcoming} />
            <Section group="nodate" tasks={groups.nodate} />
            <Section group="done" tasks={groups.done} />
          </div>
        )}
      </div>
    </div>
  )
}
