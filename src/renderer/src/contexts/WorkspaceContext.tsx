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
import type { Task, Column, TeamMember, ViewMode } from '../types'

// ── Context shape ──────────────────────────────────────────────────────────

interface WorkspaceContextType {
  // Data
  columns: Column[]
  tasks: Task[]
  members: TeamMember[]
  loading: boolean

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
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

// ── Provider ───────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS)
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS)
  const [members, setMembers] = useState<TeamMember[]>(SEED_MEMBERS)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    return (localStorage.getItem('workspace-view') as ViewMode) ?? 'kanban'
  })
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const supabaseReady = useRef(false)

  // ── Load from Supabase (graceful fallback to seed) ───────────────────────

  useEffect(() => {
    let mounted = true
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
        }
        if (colsRes.data && colsRes.data.length > 0) {
          setColumns(colsRes.data as Column[])
        }
        if (membersRes.data && membersRes.data.length > 0) {
          setMembers(membersRes.data as TeamMember[])
        }
        supabaseReady.current = true
      } catch {
        // Tables don't exist yet — seed data is already loaded
      }
      if (mounted) setLoading(false)
    }
    load()
    return () => { mounted = false }
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
