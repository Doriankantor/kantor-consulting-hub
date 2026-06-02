import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { DEFAULT_COLUMNS } from '../types'
import type { Task, Column, TeamMember, ViewMode, Area, Board } from '../types'
import { useAuth } from './AuthContext'

// ── Context shape ──────────────────────────────────────────────────────────

interface WorkspaceContextType {
  // Data
  columns: Column[]
  tasks: Task[]
  members: TeamMember[]
  areas: Area[]
  labels: Label[]
  loading: boolean
  cloudError: string | null   // set when a cloud read fails (no stale-local fallback)

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
  archiveTask: (taskId: string) => Promise<void>
  restoreTask: (taskId: string) => Promise<void>

  // Column actions
  renameColumn: (columnId: string, name: string) => Promise<void>
  addColumn: () => Promise<string>   // returns new column id

  // Refresh actions
  refreshAreas: () => Promise<void>
  refreshLabels: () => Promise<void>
  refreshTaskMeta: (taskId?: string) => Promise<void>

  // Boards
  boards: Board[]
  archivedBoards: Board[]
  activeBoard: Board | null
  setActiveBoardId: (id: string) => void
  createBoard:    (name: string) => Promise<string>   // returns new board id
  renameBoard:    (id: string, name: string) => Promise<void>
  archiveBoard:   (id: string, archivedBy: string) => Promise<void>
  restoreBoard:   (id: string) => Promise<void>
  deleteBoard:    (id: string) => Promise<void>
  duplicateBoard: (id: string, newName: string) => Promise<string> // returns new id
  refreshBoards:  () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

// ── Provider ───────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { localUser } = useAuth()
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS)
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [checklistSummaries, setChecklistSummaries] = useState<Record<string, { total: number; done: number }>>({})
  const [taskLabelMap, setTaskLabelMap] = useState<Record<string, Label[]>>({})
  const [pendingSection, setPendingSection] = useState<string | null>(null)
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    return (localStorage.getItem('workspace-view') as ViewMode) ?? 'kanban'
  })
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [boards, setBoards]               = useState<Board[]>([])
  const [archivedBoards, setArchivedBoards] = useState<Board[]>([])
  const [activeBoardId, setActiveBoardIdState] = useState<string>(() =>
    localStorage.getItem('activeBoard') ?? 'board-main'
  )
  // Ref to skip the columns-reload effect on first mount (initial load handles it)
  const columnsFirstRender = useRef(true)

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0] ?? null

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

  // ── Load boards ──────────────────────────────────────────────────────────

  const loadBoards = useCallback(async () => {
    try {
      const [active, archived] = await Promise.all([
        window.api.boards.list(false),
        window.api.boards.listArchived(),
      ])
      setBoards(active)
      setArchivedBoards(archived)
      setCloudError(null)
      // If saved activeBoard no longer exists (was deleted/archived), reset to first board
      setActiveBoardIdState(prev => {
        const stillActive = active.find(b => b.id === prev)
        if (!stillActive && active.length > 0) {
          localStorage.setItem('activeBoard', active[0].id)
          return active[0].id
        }
        return prev
      })
    } catch (e: any) {
      // Cloud unreachable — surface inline; do NOT silently fall back to stale local data.
      setCloudError(`Couldn't reach the server — boards may be out of date. (${e?.message ?? 'network error'})`)
    }
  }, [])

  const refreshBoards = loadBoards

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

  // ── Load from local SQLite ───────────────────────────────────────────────

  useEffect(() => {
    let mounted = true
    loadAreas()
    loadLabels()
    loadBoards()

    async function load() {
      try {
        // Use activeBoardId snapshot from initial state for column loading
        const boardId = localStorage.getItem('activeBoard') ?? 'board-main'
        const [cols, taskList, teamList] = await Promise.all([
          window.api.workspace.getColumns(boardId),
          window.api.workspace.getTasks(),
          window.api.team.list(),
        ])
        if (!mounted) return
        setColumns(cols)
        setTasks(taskList)
        setMembers(teamList.map(m => ({
          id: m.id,
          email: m.email,
          full_name: m.full_name,
          avatar_url: null,
          role: (m.role as 'admin' | 'member') ?? 'member',
        })))
        setCloudError(null)
        loadTaskMeta(taskList)
        checkDeadlines(taskList)
      } catch (err: any) {
        console.error('[WorkspaceContext] load error', err)
        setCloudError(`Couldn't reach the server — the workspace may be out of date. (${err?.message ?? 'network error'})`)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reload columns when active board changes ─────────────────────────────
  useEffect(() => {
    // Skip on first mount — the initial useEffect handles it
    if (columnsFirstRender.current) {
      columnsFirstRender.current = false
      return
    }
    let mounted = true
    async function loadColumnsForBoard() {
      try {
        const cols = await window.api.workspace.getColumns(activeBoardId)
        if (!mounted) return
        setColumns(cols)
      } catch {}
    }
    loadColumnsForBoard()
    return () => { mounted = false }
  }, [activeBoardId])

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

  // ── setActiveBoardId helper ────────────────────────────────────────────────

  const setActiveBoardId = useCallback((id: string) => {
    setActiveBoardIdState(id)
    localStorage.setItem('activeBoard', id)
  }, [])

  // ── Task actions ──────────────────────────────────────────────────────────

  const moveTask = useCallback((taskId: string, newColumnId: string, _overTaskId?: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, column_id: newColumnId, updated_at: new Date().toISOString() } : t
    ))
    window.api.workspace.updateTask(taskId, { column_id: newColumnId }).catch(() => {})
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
      reordered.forEach(t => window.api.workspace.updateTask(t.id, { position: t.position }).catch(() => {}))
      return [...prev.filter(t => t.column_id !== columnId), ...reordered]
    })
  }, [])

  const createTask = useCallback(async (columnId: string, partial: Partial<Task>) => {
    const colTasks = tasks.filter(t => t.column_id === columnId)
    const newTask: Task = {
      id: crypto.randomUUID(),
      board_id: activeBoardId,
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
      sources_json: partial.sources_json ?? null,
      position: colTasks.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setTasks(prev => [...prev, newTask])
    await window.api.workspace.createTask(newTask as unknown as Record<string, unknown>)
  }, [tasks, activeBoardId])

  const updateTask = useCallback(async (taskId: string, partial: Partial<Task>) => {
    const updated = { ...partial, updated_at: new Date().toISOString() }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updated } : t))
    setSelectedTask(prev => prev?.id === taskId ? { ...prev, ...updated } : prev)
    await window.api.workspace.updateTask(taskId, partial as Record<string, unknown>)
  }, [])

  const deleteTask = useCallback(async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setSelectedTask(prev => prev?.id === taskId ? null : prev)
    await window.api.workspace.deleteTask(taskId, localUser?.id, localUser?.name)
  }, [localUser])

  const archiveTask = useCallback(async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setSelectedTask(prev => prev?.id === taskId ? null : prev)
    await window.api.workspace.archiveTask(taskId)
  }, [])

  const restoreTask = useCallback(async (taskId: string) => {
    await window.api.workspace.restoreTask(taskId)
    // Re-fetch all tasks to bring the restored task back into the board
    const rows = await window.api.workspace.getTasks() as Task[]
    const taskList = rows.map((r: Record<string, unknown>) => ({
      ...(r as unknown as Task),
      assignee_ids: Array.isArray(r.assignee_ids) ? r.assignee_ids : [],
    }))
    setTasks(taskList)
  }, [])

  // ── Board CRUD operations ──────────────────────────────────────────────────

  const createBoard = useCallback(async (name: string): Promise<string> => {
    const result = await window.api.boards.create(name)
    await loadBoards()
    return result.id
  }, [loadBoards])

  const renameBoard = useCallback(async (id: string, name: string) => {
    setBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b))
    await window.api.boards.rename(id, name)
  }, [])

  const archiveBoard = useCallback(async (id: string, archivedBy: string) => {
    await window.api.boards.archive(id, archivedBy)
    await loadBoards()
    // If archiving the active board, switch to first remaining active board
    setActiveBoardIdState(prev => {
      if (prev === id) {
        // will be corrected by loadBoards side effect
        localStorage.removeItem('activeBoard')
        return 'board-main'
      }
      return prev
    })
  }, [loadBoards])

  const restoreBoard = useCallback(async (id: string) => {
    await window.api.boards.restore(id)
    await loadBoards()
  }, [loadBoards])

  const deleteBoard = useCallback(async (id: string) => {
    await window.api.boards.delete(id)
    // Remove tasks from local state
    setTasks(prev => prev.filter(t => t.board_id !== id))
    await loadBoards()
    setActiveBoardIdState(prev => {
      if (prev === id) {
        localStorage.removeItem('activeBoard')
        return 'board-main'
      }
      return prev
    })
  }, [loadBoards])

  const duplicateBoard = useCallback(async (id: string, newName: string): Promise<string> => {
    const result = await window.api.boards.duplicate(id, newName)
    await loadBoards()
    return result.id
  }, [loadBoards])

  // ── Column actions ─────────────────────────────────────────────────────────

  const renameColumn = useCallback(async (columnId: string, name: string) => {
    setColumns(prev => prev.map(c => c.id === columnId ? { ...c, name } : c))
    await window.api.workspace.updateColumn(columnId, { name })
  }, [])

  const addColumn = useCallback(async (): Promise<string> => {
    const newId = crypto.randomUUID()
    const newCol: Column = {
      id: newId,
      name: 'New Stage',
      position: columns.length,
      color: 'bg-slate-500',
      board_id: activeBoardId,
    }
    setColumns(prev => [...prev, newCol])
    await window.api.workspace.addColumn(newCol as unknown as Record<string, unknown>)
    return newId
  }, [columns, activeBoardId])

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
      cloudError,
      viewMode,
      setViewMode,
      selectedTask,
      selectTask,
      moveTask,
      reorderWithinColumn,
      createTask,
      updateTask,
      deleteTask,
      archiveTask,
      restoreTask,
      renameColumn,
      addColumn,
      refreshAreas,
      refreshLabels,
      refreshTaskMeta,
      pendingSection,
      setPendingSection,
      highlightTaskId,
      openTask,
      boards,
      archivedBoards,
      activeBoard,
      setActiveBoardId,
      createBoard,
      renameBoard,
      archiveBoard,
      restoreBoard,
      deleteBoard,
      duplicateBoard,
      refreshBoards,
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
