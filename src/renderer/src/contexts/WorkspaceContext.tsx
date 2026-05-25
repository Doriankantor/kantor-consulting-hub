import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { supabase } from '../supabase/client'
import { SEED_TASKS, SEED_MEMBERS } from '../data/seed'
import { DEFAULT_COLUMNS } from '../types'
import type { Task, Column, TeamMember, ViewMode, Area } from '../types'

// ── Context shape ──────────────────────────────────────────────────────────

interface WorkspaceContextType {
  // Data
  columns: Column[]
  tasks: Task[]
  members: TeamMember[]
  areas: Area[]
  labels: Label[]
  loading: boolean

  // Card meta maps (for Kanban display)
  commentCounts: Record<string, number>
  checklistSummaries: Record<string, { total: number; done: number }>
  taskLabelMap: Record<string, Label[]>

  // Inbox navigation
  pendingSection: string | null
  setPendingSection: (s: string | null) => void
  highlightTaskId: string | null
  openTask: (taskId: string, section?: string) => void

  // View state
  viewMode: ViewMode
  setViewMode: (v: ViewMode) => void

  // Selected task (detail panel)
  selectedTask: Task | null
  selectTask: (task: Task | null) => void

  // Task actions
  moveTask: (taskId: string, newColumnId: string, overTaskId?: string) => void
  reorderWithinColumn: (columnId: string, activeId: string, overId: string) => void
  createTask: (columnId: string, partial: Partial<Task>) => Promise<void>
  updateTask: (taskId: string, partial: Partial<Task>) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>

  // Column actions
  renameColumn: (columnId: string, name: string) => Promise<void>
  addColumn: () => Promise<void>

  // Refresh actions
  refreshAreas: () => Promise<void>
  refreshLabels: () => Promise<void>
  refreshTaskMeta: (taskId?: string) => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

// ── Provider ───────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS)
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS)
  const [members, setMembers] = useState<TeamMember[]>(SEED_MEMBERS)
  const [areas, setAreas] = useState<Area[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [checklistSummaries, setChecklistSummaries] = useState<Record<string, { total: number; done: number }>>({})
  const [taskLabelMap, setTaskLabelMap] = useState<Record<string, Label[]>>({})
  const [pendingSection, setPendingSection] = useState<string | null>(null)
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    return (localStorage.getItem('workspace-view') as ViewMode) ?? 'kanban'
  })
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const supabaseReady = useRef(false)

  // ── Load areas ──────────────────────────────────────────────────────────

  const loadAreas = useCallback(async () => {
    try {
      const data = await window.api.areas.list()
      setAreas(data)
    } catch {
      setAreas([
        { id: 'latin-america',           name: 'Latin America',          color: '#22c55e', is_default: 1, position: 0, created_at: '' },
        { id: 'us-foreign-policy',       name: 'US Foreign Policy',      color: '#3b82f6', is_default: 1, position: 1, created_at: '' },
        { id: 'european-politics',       name: 'European Politics',      color: '#a855f7', is_default: 1, position: 2, created_at: '' },
        { id: 'international-security',  name: 'International Security', color: '#ef4444', is_default: 1, position: 3, created_at: '' },
        { id: 'security-technology',     name: 'Security Technology',    color: '#06b6d4', is_default: 1, position: 4, created_at: '' },
      ])
    }
  }, [])

  const refreshAreas = loadAreas

  // ── Load labels ──────────────────────────────────────────────────────────

  const loadLabels = useCallback(async () => {
    try {
      const data = await window.api.labels.list()
      setLabels(data)
    } catch {}
  }, [])

  const refreshLabels = loadLabels

  // ── Deadline warnings ─────────────────────────────────────────────────────

  const checkDeadlines = useCallback(async (taskList: Task[]) => {
    try {
      const localUserRaw = localStorage.getItem('kantor-local-user')
      if (!localUserRaw) return
      const localUser = JSON.parse(localUserRaw) as { id: string; name: string }
      const userId = localUser.id
      const now = Date.now()
      const oneDayMs  = 86400000
      const threeDayMs = 3 * oneDayMs

      for (const t of taskList) {
        if (!t.due_date || t.column_id === 'col-published') continue
        const due = new Date(t.due_date).getTime()
        const diff = due - now
        let type: 'overdue' | '1d' | '3d' | null = null
        if (diff < 0)          type = 'overdue'
        else if (diff < oneDayMs)  type = '1d'
        else if (diff < threeDayMs) type = '3d'
        if (!type) continue

        // Only notify assignees (or everyone if unassigned)
        const assignees = t.assignee_ids ?? []
        const targets = assignees.length > 0 ? assignees : [userId]
        if (!targets.includes(userId)) continue

        const dedupKey = `deadline-notified-${t.id}-${type}`
        if (localStorage.getItem(dedupKey)) continue
        localStorage.setItem(dedupKey, '1')

        const label = type === 'overdue' ? 'is overdue' : type === '1d' ? 'is due tomorrow' : 'is due in 3 days'
        await window.api.notifications.create({
          user_id: userId, type: 'deadline',
          title: `"${t.title}" ${label}`,
          body: t.client ? `Client: ${t.client}` : undefined,
          task_id: t.id, task_title: t.title,
        })
      }
    } catch {}
  }, [])

  // ── Load card meta (comment counts, checklist summaries, task labels) ────

  const loadTaskMeta = useCallback(async (taskList: Task[]) => {
    if (!taskList.length) return
    try {
      const [commentResults, checklistResults, labelResults] = await Promise.all([
        Promise.all(taskList.map(async t => {
          try { const cs = await window.api.comments.get(t.id); return [t.id, cs.length] as [string, number] }
          catch { return [t.id, 0] as [string, number] }
        })),
        Promise.all(taskList.map(async t => {
          try {
            const cls = await window.api.checklists.get(t.id)
            const total = cls.reduce((s, cl) => s + cl.items.length, 0)
            const done  = cls.reduce((s, cl) => s + cl.items.filter(i => i.checked).length, 0)
            return [t.id, { total, done }] as [string, { total: number; done: number }]
          } catch { return [t.id, { total: 0, done: 0 }] as [string, { total: number; done: number }] }
        })),
        Promise.all(taskList.map(async t => {
          try { const lbls = await window.api.taskLabels.get(t.id); return [t.id, lbls] as [string, Label[]] }
          catch { return [t.id, []] as [string, Label[]] }
        })),
      ])
      setCommentCounts(Object.fromEntries(commentResults))
      setChecklistSummaries(Object.fromEntries(checklistResults))
      setTaskLabelMap(Object.fromEntries(labelResults))
    } catch {}
  }, [])

  const refreshTaskMeta = useCallback(async (taskId?: string) => {
    if (taskId) {
      // Refresh single task
      try {
        const [cs, cls, lbls] = await Promise.all([
          window.api.comments.get(taskId),
          window.api.checklists.get(taskId),
          window.api.taskLabels.get(taskId),
        ])
        setCommentCounts(prev => ({ ...prev, [taskId]: cs.length }))
        const total = cls.reduce((s, cl) => s + cl.items.length, 0)
        const done  = cls.reduce((s, cl) => s + cl.items.filter(i => i.checked).length, 0)
        setChecklistSummaries(prev => ({ ...prev, [taskId]: { total, done } }))
        setTaskLabelMap(prev => ({ ...prev, [taskId]: lbls }))
      } catch {}
    } else {
      await loadTaskMeta(tasks)
    }
  }, [tasks, loadTaskMeta])

  // ── Load from Supabase (graceful fallback to seed) ───────────────────────

  useEffect(() => {
    let mounted = true
    loadAreas()
    loadLabels()
    async function load() {
      try {
        const [tasksRes, colsRes, membersRes] = await Promise.all([
          supabase.from('tasks').select('*').order('position'),
          supabase.from('columns').select('*').order('position'),
          supabase.from('profiles').select('*'),
        ])

        if (!mounted) return

        if (tasksRes.data && tasksRes.data.length > 0) {
          setTasks(tasksRes.data as Task[])
          loadTaskMeta(tasksRes.data as Task[])
          checkDeadlines(tasksRes.data as Task[])
        } else {
          loadTaskMeta(SEED_TASKS)
          checkDeadlines(SEED_TASKS)
        }
        if (colsRes.data && colsRes.data.length > 0) {
          setColumns(colsRes.data as Column[])
        }
        if (membersRes.data && membersRes.data.length > 0) {
          setMembers(membersRes.data as TeamMember[])
        }
        supabaseReady.current = true
      } catch {
        // Tables don't exist yet — seed data is already loaded; still load meta
      loadTaskMeta(SEED_TASKS)
      checkDeadlines(SEED_TASKS)
      }
      if (mounted) setLoading(false)
    }
    load()
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Realtime subscription ────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('workspace-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks(prev => [...prev, payload.new as Task])
          } else if (payload.eventType === 'UPDATE') {
            setTasks(prev => prev.map(t =>
              t.id === (payload.new as Task).id ? (payload.new as Task) : t
            ))
          } else if (payload.eventType === 'DELETE') {
            setTasks(prev => prev.filter(t => t.id !== (payload.old as Task).id))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'columns' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setColumns(prev => prev.map(c =>
              c.id === (payload.new as Column).id ? (payload.new as Column) : c
            ))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const setViewMode = useCallback((v: ViewMode) => {
    setViewModeState(v)
    localStorage.setItem('workspace-view', v)
  }, [])

  const selectTask = useCallback((task: Task | null) => {
    setSelectedTask(task)
  }, [])

  const openTask = useCallback((taskId: string, section?: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    setSelectedTask(task)
    if (section) setPendingSection(section)
    setHighlightTaskId(taskId)
    setTimeout(() => setHighlightTaskId(null), 2200)
  }, [tasks])

  async function syncTask(taskId: string, data: Partial<Task>) {
    if (!supabaseReady.current) return
    await supabase.from('tasks').update({ ...data, updated_at: new Date().toISOString() }).eq('id', taskId)
  }

  // ── Task actions ──────────────────────────────────────────────────────────

  const moveTask = useCallback((taskId: string, newColumnId: string, _overTaskId?: string) => {
    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === taskId ? { ...t, column_id: newColumnId, updated_at: new Date().toISOString() } : t
      )
      return updated
    })
    syncTask(taskId, { column_id: newColumnId })
  }, [])

  const reorderWithinColumn = useCallback((columnId: string, activeId: string, overId: string) => {
    setTasks(prev => {
      const colTasks = prev
        .filter(t => t.column_id === columnId)
        .sort((a, b) => a.position - b.position)
      const oldIndex = colTasks.findIndex(t => t.id === activeId)
      const newIndex = colTasks.findIndex(t => t.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev

      const reordered = arrayMove(colTasks, oldIndex, newIndex).map((t, i) => ({
        ...t,
        position: i,
        updated_at: new Date().toISOString(),
      }))

      // Sync each reordered item
      reordered.forEach(t => syncTask(t.id, { position: t.position }))

      return [
        ...prev.filter(t => t.column_id !== columnId),
        ...reordered,
      ]
    })
  }, [])

  const createTask = useCallback(async (columnId: string, partial: Partial<Task>) => {
    const colTasks = tasks.filter(t => t.column_id === columnId)
    const newTask: Task = {
      id: crypto.randomUUID(),
      column_id: columnId,
      title: partial.title ?? 'Untitled',
      content_type: partial.content_type ?? 'policy-brief',
      client: partial.client ?? null,
      area_of_analysis: partial.area_of_analysis ?? null,
      assignee_ids: partial.assignee_ids ?? [],
      due_date: partial.due_date ?? null,
      start_date: partial.start_date ?? null,
      priority: partial.priority ?? 'medium',
      description: partial.description ?? null,
      notes: partial.notes ?? null,
      position: colTasks.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setTasks(prev => [...prev, newTask])

    if (supabaseReady.current) {
      await supabase.from('tasks').insert(newTask)
    }
  }, [tasks])

  const updateTask = useCallback(async (taskId: string, partial: Partial<Task>) => {
    const updated = { ...partial, updated_at: new Date().toISOString() }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updated } : t))
    // Update selected task too if it's the same one
    setSelectedTask(prev => prev?.id === taskId ? { ...prev, ...updated } : prev)
    await syncTask(taskId, partial)
  }, [])

  const deleteTask = useCallback(async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setSelectedTask(prev => prev?.id === taskId ? null : prev)
    if (supabaseReady.current) {
      await supabase.from('tasks').delete().eq('id', taskId)
    }
  }, [])

  // ── Column actions ─────────────────────────────────────────────────────────

  const renameColumn = useCallback(async (columnId: string, name: string) => {
    setColumns(prev => prev.map(c => c.id === columnId ? { ...c, name } : c))
    if (supabaseReady.current) {
      await supabase.from('columns').update({ name }).eq('id', columnId)
    }
  }, [])

  const addColumn = useCallback(async () => {
    const newCol: Column = {
      id: crypto.randomUUID(),
      name: 'New Stage',
      position: columns.length,
      color: 'bg-slate-500',
    }
    setColumns(prev => [...prev, newCol])
    if (supabaseReady.current) {
      await supabase.from('columns').insert(newCol)
    }
  }, [columns])

  return (
    <WorkspaceContext.Provider value={{
      columns,
      tasks,
      members,
      areas,
      labels,
      commentCounts,
      checklistSummaries,
      taskLabelMap,
      loading,
      viewMode,
      setViewMode,
      selectedTask,
      selectTask,
      moveTask,
      reorderWithinColumn,
      createTask,
      updateTask,
      deleteTask,
      renameColumn,
      addColumn,
      refreshAreas,
      refreshLabels,
      refreshTaskMeta,
      pendingSection,
      setPendingSection,
      highlightTaskId,
      openTask,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}
