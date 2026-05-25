import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Task, Area } from '../../types'
import {
  CONTENT_TYPE_COLORS, CONTENT_TYPE_LABELS,
  PRIORITY_DOT,
} from '../../types'
import { useWorkspace } from '../../contexts/WorkspaceContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function isOverdue(iso: string | null, colId: string) {
  if (!iso || colId === 'col-published') return false
  return new Date(iso) < new Date()
}

// ── Area color helper ──────────────────────────────────────────────────────

function getAreaColor(areaId: string | null, areas: Area[]): string {
  if (!areaId) return '#6b7280'
  const area = areas.find(a => a.id === areaId)
  return area?.color ?? '#6b7280'
}

// ── Task card (display) ────────────────────────────────────────────────────

function TaskCardDisplay({ task, isDragging = false, areas }: { task: Task; isDragging?: boolean; areas: Area[] }) {
  const { selectTask } = useWorkspace()
  const overdue = isOverdue(task.due_date, task.column_id)
  const areaColor = getAreaColor(task.area_of_analysis, areas)

  return (
    <div
      onClick={() => !isDragging && selectTask(task)}
      style={{ borderTopColor: areaColor }}
      className={`group relative bg-white dark:bg-[#1a2233] border border-gray-200 dark:border-white/[0.08]
        border-t-[3px] rounded-xl p-3.5 cursor-pointer shadow-sm dark:shadow-none
        hover:shadow-md dark:hover:bg-white/[0.08] hover:-translate-y-px
        active:scale-[0.99] transition-all duration-150
        ${isDragging ? 'opacity-60 shadow-xl rotate-1 scale-105' : ''}`}
    >
      {/* Type badge + priority dot */}
      <div className="flex items-center justify-between mb-2.5">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${CONTENT_TYPE_COLORS[task.content_type]}`}>
          {CONTENT_TYPE_LABELS[task.content_type]}
        </span>
        <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} title={task.priority} />
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug mb-2.5 line-clamp-2">{task.title}</p>

      {/* Area tag */}
      {task.area_of_analysis && (() => {
        const area = areas.find(a => a.id === task.area_of_analysis)
        return area ? (
          <div className="mb-2">
            <span
              style={{ color: area.color, borderColor: area.color + '40', backgroundColor: area.color + '18' }}
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border"
            >
              {area.name}
            </span>
          </div>
        ) : null
      })()}

      {/* Client */}
      {task.client && (
        <p className="text-[11px] text-gray-400 dark:text-white/35 mb-2 truncate">{task.client}</p>
      )}

      {/* Due date */}
      {task.due_date && (
        <div className={`flex items-center gap-1 text-[11px] ${overdue ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-white/35'}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1" y="2" width="8" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M3 1v2M7 1v2M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          {overdue ? 'Overdue · ' : ''}{formatDate(task.due_date)}
        </div>
      )}
    </div>
  )
}

// ── Sortable card wrapper ──────────────────────────────────────────────────

function SortableCard({ task, areas }: { task: Task; areas: Area[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  })

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCardDisplay task={task} isDragging={isDragging} areas={areas} />
    </div>
  )
}

// ── Column ─────────────────────────────────────────────────────────────────

function KanbanColumn({ columnId, areas }: { columnId: string; areas: Area[] }) {
  const { columns, tasks, renameColumn, createTask } = useWorkspace()
  const col = columns.find(c => c.id === columnId)!
  const colTasks = tasks
    .filter(t => t.column_id === columnId)
    .sort((a, b) => a.position - b.position)

  const { setNodeRef, isOver } = useDroppable({
    id: `droppable-${columnId}`,
    data: { type: 'column', columnId },
  })

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(col.name)
  const [addingTask, setAddingTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  async function handleRename() {
    setEditingName(false)
    if (nameValue.trim() && nameValue !== col.name) await renameColumn(columnId, nameValue.trim())
  }
  async function handleAddTask() {
    if (!newTitle.trim()) { setAddingTask(false); return }
    await createTask(columnId, { title: newTitle.trim() })
    setNewTitle('')
    setAddingTask(false)
  }

  return (
    <div className="flex flex-col w-64 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5 px-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${col.color}`} />
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingName(false) }}
              className="titlebar-no-drag bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded px-1.5 py-0.5 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none w-36"
            />
          ) : (
            <button
              onDoubleClick={() => { setEditingName(true); setNameValue(col.name) }}
              className="titlebar-no-drag text-sm font-semibold text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition"
              title="Double-click to rename"
            >
              {col.name}
            </button>
          )}
          <span className="text-xs text-gray-400 dark:text-white/30 tabular-nums">{colTasks.length}</span>
        </div>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[80px] rounded-xl p-2 space-y-2 transition-colors ${
          isOver ? 'bg-hub-gold/5 ring-1 ring-hub-gold/20' : 'bg-gray-100/50 dark:bg-black/[0.15]'
        }`}
      >
        <SortableContext items={colTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {colTasks.map(task => <SortableCard key={task.id} task={task} areas={areas} />)}
        </SortableContext>

        {addingTask ? (
          <div className="bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.12] rounded-xl p-3">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') { setAddingTask(false); setNewTitle('') } }}
              placeholder="Engagement title…"
              className="titlebar-no-drag w-full bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 outline-none mb-2"
            />
            <div className="flex gap-1.5">
              <button onClick={handleAddTask} className="titlebar-no-drag px-2.5 py-1 rounded-lg bg-hub-gold text-white text-xs font-semibold hover:bg-hub-gold-light transition">Add</button>
              <button onClick={() => { setAddingTask(false); setNewTitle('') }} className="titlebar-no-drag px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/60 text-xs hover:bg-gray-200 dark:hover:bg-white/15 transition">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingTask(true)}
            className="titlebar-no-drag w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-400 dark:text-white/25 hover:text-gray-600 dark:hover:text-white/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition text-sm"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Add engagement
          </button>
        )}
      </div>
    </div>
  )
}

// ── Board ──────────────────────────────────────────────────────────────────

export default function KanbanView() {
  const { columns, tasks, moveTask, reorderWithinColumn, addColumn, areas } = useWorkspace()
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTask(tasks.find(t => t.id === event.active.id) ?? null)
  }, [tasks])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    const overColId = (over.id as string).replace('droppable-', '')
    const isOverColumn = columns.some(c => c.id === overColId) && (over.id as string).startsWith('droppable-')
    if (isOverColumn && activeTask.column_id !== overColId) {
      moveTask(activeTask.id, overColId)
      return
    }
    const overTask = tasks.find(t => t.id === over.id)
    if (overTask && overTask.column_id !== activeTask.column_id) {
      moveTask(activeTask.id, overTask.column_id)
    }
  }, [tasks, columns, moveTask])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)
    if (!over) return
    const activeTask = tasks.find(t => t.id === active.id as string)
    const overTask = tasks.find(t => t.id === over.id as string)
    if (activeTask && overTask && overTask.column_id === activeTask.column_id && active.id !== over.id) {
      reorderWithinColumn(activeTask.column_id, active.id as string, over.id as string)
    }
  }, [tasks, reorderWithinColumn])

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 p-5 h-full items-start min-w-max">
            {columns
              .sort((a, b) => a.position - b.position)
              .map(col => <KanbanColumn key={col.id} columnId={col.id} areas={areas} />)}

            <button
              onClick={addColumn}
              className="titlebar-no-drag flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-white/[0.12] text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 hover:border-gray-400 dark:hover:border-white/25 transition text-sm mt-8 w-56 shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Add stage
            </button>
          </div>

          <DragOverlay>
            {activeTask && <TaskCardDisplay task={activeTask} isDragging areas={areas} />}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
