import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  type CollisionDetection,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Task, Area } from '../../types'
import {
  CONTENT_TYPE_COLORS, CONTENT_TYPE_LABELS,
  PRIORITY_DOT, DEFAULT_COLUMNS,
} from '../../types'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useAuth } from '../../contexts/AuthContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function isOverdue(iso: string | null, colId: string) {
  if (!iso || colId === 'col-published') return false
  return new Date(iso) < new Date()
}

function dueDateClass(iso: string | null, colId: string): string {
  if (!iso || colId === 'col-published') return 'text-gray-400 dark:text-white/65'
  const diff = (new Date(iso).getTime() - Date.now()) / 86400000
  if (diff < 0) return 'text-red-500 dark:text-red-400 font-semibold'
  if (diff <= 3) return 'text-amber-500 dark:text-amber-400 font-semibold'
  return 'text-emerald-600 dark:text-emerald-400'
}

const CARD_TYPE_COLORS: Record<string, string> = {
  'policy-brief':          'bg-blue-500 text-white border-transparent',
  'research-report':       'bg-violet-500 text-white border-transparent',
  'op-ed':                 'bg-amber-500 text-white border-transparent',
  'briefing-note':         'bg-cyan-500 text-white border-transparent',
  'consulting-engagement': 'bg-orange-500 text-white border-transparent',
  'client-advisory':       'bg-emerald-500 text-white border-transparent',
}

const AVATAR_PALETTE = ['#ef4444','#f59e0b','#22c55e','#3b82f6','#a855f7','#06b6d4','#ec4899','#8b5cf6']
function memberColor(userId: string): string {
  const hash = userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}
function memberInitials(name: string | null, email: string): string {
  if (!name) return email.slice(0, 2).toUpperCase()
  const parts = name.trim().split(' ')
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || email.slice(0, 2).toUpperCase()
}

// ── Area color helper ──────────────────────────────────────────────────────

function getAreaColor(areaId: string | null, areas: Area[]): string {
  if (!areaId) return '#6b7280'
  const area = areas.find(a => a.id === areaId)
  return area?.color ?? '#6b7280'
}

// ── Task card (display) ────────────────────────────────────────────────────

function TaskCardDisplay({ task, isDragging = false, areas }: { task: Task; isDragging?: boolean; areas: Area[] }) {
  const { selectTask, commentCounts, checklistSummaries, taskLabelMap, members, highlightTaskId, archiveTask, markForDeletion, markCompleteNow } = useWorkspace()
  const overdue = isOverdue(task.due_date, task.column_id)
  const areaColor = getAreaColor(task.area_of_analysis, areas)
  const commentCount = commentCounts[task.id] ?? 0
  const clSummary = checklistSummaries[task.id]
  const taskLabels = taskLabelMap[task.id] ?? []

  // Assignees: use assignee_ids array
  const assigneeIds = task.assignee_ids ?? []
  const assigneeMembers = assigneeIds
    .map(id => members.find(m => m.id === id))
    .filter(Boolean) as typeof members

  const visibleAssignees = assigneeMembers.slice(0, 2)
  const extraAssignees = assigneeMembers.length > 2 ? assigneeMembers.length - 2 : 0

  // Labels: show up to 3
  const visibleLabels = taskLabels.slice(0, 3)
  const extraLabels = taskLabels.length > 3 ? taskLabels.length - 3 : 0

  const hasFooter = commentCount > 0 || (clSummary && clSummary.total > 0) || assigneeMembers.length > 0

  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (highlightTaskId === task.id) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }
  }, [highlightTaskId, task.id])

  return (
    <div
      ref={cardRef}
      onClick={() => !isDragging && selectTask(task)}
      style={{ borderTopColor: areaColor }}
      className={`group relative bg-white dark:bg-[#1e2235] border border-transparent dark:border-white/[0.06]
        border-t-[3px] rounded-2xl p-3.5 cursor-pointer
        shadow-[0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.45)]
        card-lift active:scale-[0.99]
        ${isDragging ? 'opacity-60 shadow-2xl rotate-1 scale-105' : ''}
        ${highlightTaskId === task.id ? 'ring-2 ring-hub-gold ring-offset-2 dark:ring-offset-[#1a2233] animate-card-flash' : ''}`}
    >
      {/* Type badge + priority dot + archive button */}
      <div className="flex items-center justify-between mb-2.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${CARD_TYPE_COLORS[task.content_type] ?? 'bg-gray-500 text-white'}`}>
          {CONTENT_TYPE_LABELS[task.content_type]}
        </span>
        <div className="flex items-center gap-1.5">
          {task.column_id === 'col-published' ? (
            <button
              onClick={e => { e.stopPropagation(); markCompleteNow(task.id) }}
              title="Mark completed"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 dark:text-white/25 hover:text-emerald-500 dark:hover:text-emerald-400 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); markForDeletion(task.id) }}
              title="Mark for deletion"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 dark:text-white/25 hover:text-red-400 dark:hover:text-red-400 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M5 3V2h2v1M4.5 3v6.5h3V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="3" y="3" width="6" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            </button>
          )}
          <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} title={task.priority} />
        </div>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug mb-2 line-clamp-2">{task.title}</p>

      {/* Labels */}
      {visibleLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {visibleLabels.map(lbl => (
            <span
              key={lbl.id}
              style={{ backgroundColor: lbl.color }}
              className="inline-flex items-center px-2 py-px rounded-full text-[9px] font-bold text-white"
            >
              {lbl.name}
            </span>
          ))}
          {extraLabels > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-white/50 border border-gray-200 dark:border-white/10">
              +{extraLabels}
            </span>
          )}
        </div>
      )}

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

      {/* Recurring badge */}
      {task.recurrence_json && (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-400 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 rounded-full px-1.5 py-0.5 mb-1">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 4a3 3 0 1 0 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M4 1L2.5 2.5 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Recurring
        </span>
      )}

      {/* Client + organization badge */}
      {task.client && (
        <div className="flex items-center gap-1.5 mb-2 min-w-0">
          <span className="text-[11px] text-gray-500 dark:text-white/70 truncate">{task.client}</span>
          {task.client_org && (
            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-hub-gold/15 text-hub-gold border border-hub-gold/25 truncate max-w-[110px]">
              {task.client_org}
            </span>
          )}
        </div>
      )}

      {/* Due date */}
      {task.due_date && (
        <div className={`flex items-center gap-1 text-[11px] mb-2 ${dueDateClass(task.due_date, task.column_id)}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1" y="2" width="8" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M3 1v2M7 1v2M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          {(() => {
            const diff = (new Date(task.due_date).getTime() - Date.now()) / 86400000
            if (task.column_id !== 'col-published' && diff < 0) return `Overdue · ${formatDate(task.due_date)}`
            return formatDate(task.due_date)
          })()}
        </div>
      )}

      {/* Checklist progress bar */}
      {clSummary && clSummary.total > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 mb-0.5">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="text-gray-400 dark:text-white/50 shrink-0">
              <path d="M1.5 4.5l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className={`text-[10px] tabular-nums ${clSummary.done === clSummary.total ? 'text-green-500 dark:text-green-400' : 'text-gray-400 dark:text-white/50'}`}>
              {clSummary.done}/{clSummary.total}
            </span>
          </div>
          <div className="h-0.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${clSummary.done === clSummary.total ? 'bg-green-500' : 'bg-hub-blue'}`}
              style={{ width: `${Math.round((clSummary.done / clSummary.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer: assignees + comment badge */}
      {hasFooter && (
        <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100 dark:border-white/[0.05]">
          {/* Assignee avatars */}
          <div className="flex items-center -space-x-1">
            {visibleAssignees.map(m => (
              <div
                key={m.id}
                title={m.full_name ?? m.email}
                style={{ backgroundColor: memberColor(m.id) }}
                className="w-6 h-6 rounded-full border-2 border-white dark:border-[#1e2235] flex items-center justify-center text-[9px] font-bold text-white shrink-0 shadow-sm"
              >
                {memberInitials(m.full_name, m.email)}
              </div>
            ))}
            {extraAssignees > 0 && (
              <div className="w-6 h-6 rounded-full border-2 border-white dark:border-[#1e2235] bg-gray-300 dark:bg-white/20 flex items-center justify-center text-[9px] font-bold text-gray-600 dark:text-white/75">
                +{extraAssignees}
              </div>
            )}
          </div>

          {/* Comment badge */}
          {commentCount > 0 && (
            <div className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-white/50">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1.5h8v5.5H6L5 9 4 7H1V1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
              </svg>
              {commentCount}
            </div>
          )}
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

const CONTENT_TYPE_LABELS_SHORT: Record<string, string> = {
  'policy-brief':          'Policy Brief',
  'research-report':       'Research Report',
  'op-ed':                 'Op-Ed',
  'briefing-note':         'Briefing Note',
  'consulting-engagement': 'Consulting',
  'client-advisory':       'Client Advisory',
}

function KanbanColumn({ columnId, areas, boardId, autoEdit = false, onEditStart, dragHandleListeners }: {
  columnId: string
  areas: Area[]
  boardId?: string
  autoEdit?: boolean
  onEditStart?: () => void
  dragHandleListeners?: React.HTMLAttributes<HTMLElement>
}) {
  const { columns, boardTasks: tasks, renameColumn, createTask, deleteColumn } = useWorkspace()
  const { isRoot } = useAuth()
  const col = columns.find(c => c.id === columnId)!
  const isSystemColumn = DEFAULT_COLUMNS.some(c => c.id === columnId)
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

  // Template picker state
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  // Ref to anchor the picker portal to the "Add engagement" button
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null)

  // Auto-start editing when this column was just added
  useEffect(() => {
    if (autoEdit) {
      setEditingName(true)
      setNameValue(col.name)
      onEditStart?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  // Sync nameValue if col.name changes externally
  useEffect(() => {
    if (!editingName) setNameValue(col.name)
  }, [col.name, editingName])

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

  async function handleOpenTemplatePicker() {
    if (showTemplatePicker) {
      setShowTemplatePicker(false)
      return
    }
    // Capture button position for portal positioning
    if (addBtnRef.current) {
      setPickerAnchor(addBtnRef.current.getBoundingClientRect())
    }
    setShowTemplatePicker(true)
    if (!templatesLoaded) {
      try {
        const data = await window.api.templates.list(boardId)
        setTemplates(data)
        setTemplatesLoaded(true)
      } catch {}
    }
  }

  async function handlePickTemplate(tpl: TaskTemplate) {
    setShowTemplatePicker(false)
    const today = new Date()
    today.setDate(today.getDate() + tpl.duration_days)
    const dueDate = today.toISOString().slice(0, 10)
    await createTask(columnId, {
      title: tpl.name,
      content_type: tpl.content_type,
      due_date: dueDate,
    })
  }

  // Template picker content (shared between portal and inline)
  const pickerContent = (
    <>
      <div className="px-3 py-2 border-b border-white/[0.08]">
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Start from</p>
      </div>
      <button
        onClick={() => { setShowTemplatePicker(false); setAddingTask(true) }}
        className="titlebar-no-drag w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.08] transition text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-white/[0.1] flex items-center justify-center shrink-0 text-white/60">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-white/85">Start blank</p>
          <p className="text-[10px] text-white/40">Empty engagement</p>
        </div>
      </button>
      {templates.length > 0 && (
        <div className="border-t border-white/[0.08]">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-white/40 uppercase tracking-widest">Templates</p>
          {templates.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => handlePickTemplate(tpl)}
              className="titlebar-no-drag w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.08] transition text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-hub-gold/20 border border-hub-gold/30 flex items-center justify-center shrink-0">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-hub-gold">
                  <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M3 4h4M3 6.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/85 truncate">{tpl.name}</p>
                <p className="text-[10px] text-white/40 truncate">
                  {CONTENT_TYPE_LABELS_SHORT[tpl.content_type] ?? tpl.content_type} · {tpl.duration_days}d
                </p>
              </div>
              {!!tpl.is_builtin && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/40 shrink-0">Built-in</span>
              )}
            </button>
          ))}
        </div>
      )}
      {!templatesLoaded && (
        <div className="flex items-center justify-center py-4">
          <div className="w-4 h-4 border-2 border-hub-gold/20 border-t-hub-gold rounded-full animate-spin" />
        </div>
      )}
    </>
  )

  // Render picker via portal so it escapes overflow:hidden clipping
  const pickerPortal = showTemplatePicker && pickerAnchor
    ? createPortal(
        <>
          {/* Invisible backdrop to close on outside click */}
          <div className="fixed inset-0 z-40" onClick={() => setShowTemplatePicker(false)} />
          {(() => {
            // Decide whether to open above or below based on available space
            const gap = 4
            const spaceAbove = pickerAnchor.top - gap - 8   // 8px from top edge of viewport
            const spaceBelow = window.innerHeight - pickerAnchor.bottom - gap - 8
            const openAbove = spaceAbove >= spaceBelow || spaceAbove >= 220

            const posStyle: React.CSSProperties = openAbove
              ? {
                  bottom: `${window.innerHeight - pickerAnchor.top + gap}px`,
                  maxHeight: `${Math.max(spaceAbove, 120)}px`,
                }
              : {
                  top: `${pickerAnchor.bottom + gap}px`,
                  maxHeight: `${Math.max(spaceBelow, 120)}px`,
                }

            return (
              <div
                className="fixed z-50 bg-[#1e1b4b]/95 backdrop-blur-xl border border-white/[0.12] rounded-2xl shadow-2xl overflow-y-auto overflow-x-hidden"
                style={{
                  left: `${pickerAnchor.left}px`,
                  width: `${pickerAnchor.width}px`,
                  ...posStyle,
                }}
              >
                {pickerContent}
              </div>
            )
          })()}
        </>,
        document.body
      )
    : null

  return (
    <>
      {pickerPortal}
      <div className="flex flex-col w-64 shrink-0 h-full rounded-2xl bg-white/[0.75] dark:bg-white/[0.08] backdrop-blur-md border border-black/[0.08] dark:border-white/[0.12] shadow-sm dark:shadow-none overflow-hidden">
        {/* Header */}
        <div className="group flex items-center justify-between px-3 py-2.5 border-b border-black/[0.05] dark:border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`w-2 h-2 rounded-full shrink-0 ${col.color}`} />
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
              <span className="text-sm font-bold text-gray-900 dark:text-white/90 truncate">
                {col.name}
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-white/65 tabular-nums shrink-0">{colTasks.length}</span>
          </div>
          {/* Grip handle — drag to reorder, admin only */}
          {dragHandleListeners && !editingName && (
            <div
              {...dragHandleListeners}
              title="Drag to reorder stage"
              className="titlebar-no-drag opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing p-1 rounded text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition shrink-0"
            >
              <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                <circle cx="3" cy="2.5" r="1" fill="currentColor"/>
                <circle cx="7" cy="2.5" r="1" fill="currentColor"/>
                <circle cx="3" cy="6" r="1" fill="currentColor"/>
                <circle cx="7" cy="6" r="1" fill="currentColor"/>
                <circle cx="3" cy="9.5" r="1" fill="currentColor"/>
                <circle cx="7" cy="9.5" r="1" fill="currentColor"/>
              </svg>
            </div>
          )}
          {/* Pencil icon — visible on header hover */}
          {!editingName && (
            <button
              onClick={() => { setEditingName(true); setNameValue(col.name) }}
              title="Rename stage"
              className="titlebar-no-drag opacity-0 group-hover:opacity-100 ml-1 p-1 rounded text-gray-400 dark:text-white/35 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition shrink-0"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M7.8 1.2l2 2L3 10H1V8L7.8 1.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          {/* Trash icon — admin only, non-system columns */}
          {isRoot && !isSystemColumn && !editingName && (
            <button
              onClick={async () => {
                if (colTasks.length > 0) {
                  alert(`Move or archive all cards in "${col.name}" before deleting this stage.`)
                  return
                }
                if (!window.confirm(`Delete stage "${col.name}"? This cannot be undone.`)) return
                const result = await deleteColumn(columnId)
                if (!result.ok) alert(result.error ?? 'Failed to delete stage.')
              }}
              title="Delete stage"
              className="titlebar-no-drag opacity-0 group-hover:opacity-100 ml-0.5 p-1 rounded text-red-400/60 hover:text-red-500 hover:bg-red-500/[0.08] transition shrink-0"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 2.5h8M4 2.5V1.5h3v1M2.5 2.5l.5 7h5l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Cards */}
        <div
          ref={setNodeRef}
          className={`flex-1 min-h-0 overflow-y-auto p-2 space-y-2 transition-colors ${
            isOver ? 'bg-black/[0.04] dark:bg-white/[0.06] ring-inset ring-1 ring-black/[0.06] dark:ring-white/25' : ''
          }`}
        >
          <SortableContext items={colTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
            {colTasks.map(task => <SortableCard key={task.id} task={task} areas={areas} />)}
          </SortableContext>

          {addingTask ? (
            <div className="bg-white dark:bg-white/10 border border-gray-200 dark:border-white/20 rounded-2xl p-3">
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') { setAddingTask(false); setNewTitle('') } }}
                placeholder="Engagement title…"
                className="titlebar-no-drag w-full bg-transparent text-sm text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-white/40 outline-none mb-2"
              />
              <div className="flex gap-1.5">
                <button onClick={handleAddTask} className="titlebar-no-drag px-2.5 py-1 rounded-lg bg-hub-gold text-white text-xs font-semibold hover:bg-hub-gold-light transition">Add</button>
                <button onClick={() => { setAddingTask(false); setNewTitle('') }} className="titlebar-no-drag px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/75 text-xs hover:bg-gray-200 dark:hover:bg-white/20 transition">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              ref={addBtnRef}
              onClick={handleOpenTemplatePicker}
              className="titlebar-no-drag w-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-gray-400 dark:text-white/65 hover:text-gray-700 dark:hover:text-white/80 border border-dashed border-gray-300 dark:border-white/20 hover:border-gray-400 dark:hover:border-white/40 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition text-sm mt-1"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Add engagement
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Sortable column wrapper ────────────────────────────────────────────────

function SortableColumnWrapper({ col, areas, boardId, autoEdit, onEditStart }: {
  col: import('../../types').Column
  areas: Area[]
  boardId?: string
  autoEdit?: boolean
  onEditStart?: () => void
}) {
  const { isRoot } = useAuth()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.id,
    data: { type: 'column' },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, zIndex: isDragging ? 50 : undefined }}
      {...attributes}
    >
      <KanbanColumn
        columnId={col.id}
        areas={areas}
        boardId={boardId}
        autoEdit={autoEdit}
        onEditStart={onEditStart}
        dragHandleListeners={isRoot ? listeners : undefined}
      />
    </div>
  )
}

// ── Board ──────────────────────────────────────────────────────────────────

export default function KanbanView() {
  const { columns, boardTasks: tasks, moveTask, reorderWithinColumn, reorderColumns, addColumn, areas, activeBoard } = useWorkspace()
  const { isRoot } = useAuth()
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null)
  // Track the id of the column just added so we can auto-focus its name for editing
  const [newColumnId, setNewColumnId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // When dragging a COLUMN, restrict collision candidates to column-level droppables
  // so the outer SortableContext always sees a column as `over` (enabling shift-aside
  // preview). Without this, closestCorners can resolve to a task card from an inner
  // SortableContext and the preview disappears.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    if (args.active.data.current?.type === 'column') {
      const columnOnly = args.droppableContainers.filter(c => {
        const stripped = (c.id as string).replace('droppable-', '')
        return columns.some(col => col.id === stripped)
      })
      return closestCorners({ ...args, droppableContainers: columnOnly })
    }
    return closestCorners(args)
  }, [columns])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (event.active.data.current?.type === 'column') {
      setActiveColumnId(event.active.id as string)
      setActiveTask(null)
    } else {
      setActiveTask(tasks.find(t => t.id === event.active.id) ?? null)
      setActiveColumnId(null)
    }
  }, [tasks])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    if (active.data.current?.type === 'column') return
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
    if (active.data.current?.type === 'column') {
      setActiveColumnId(null)
      if (!over) return
      const overRaw = (over.id as string).replace('droppable-', '')
      let overColId = overRaw
      if (!columns.some(c => c.id === overColId)) {
        const overTask = tasks.find(t => t.id === overColId)
        if (overTask) overColId = overTask.column_id
      }
      if (!columns.some(c => c.id === overColId)) return
      if (active.id !== overColId) {
        const sorted = [...columns].sort((a, b) => a.position - b.position)
        const oldIndex = sorted.findIndex(c => c.id === active.id)
        const newIndex = sorted.findIndex(c => c.id === overColId)
        if (oldIndex !== -1 && newIndex !== -1) {
          reorderColumns(arrayMove(sorted, oldIndex, newIndex).map(c => c.id))
        }
      }
      return
    }
    setActiveTask(null)
    if (!over) return
    const activeTask = tasks.find(t => t.id === active.id as string)
    const overTask = tasks.find(t => t.id === over.id as string)
    if (activeTask && overTask && overTask.column_id === activeTask.column_id && active.id !== over.id) {
      reorderWithinColumn(activeTask.column_id, active.id as string, over.id as string)
    }
  }, [tasks, columns, reorderWithinColumn, reorderColumns])

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 p-5 h-full items-stretch min-w-max">
            <SortableContext
              items={[...columns].sort((a, b) => a.position - b.position).map(c => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              {[...columns]
                .sort((a, b) => a.position - b.position)
                .map(col => (
                  <SortableColumnWrapper
                    key={col.id}
                    col={col}
                    areas={areas}
                    boardId={activeBoard?.id}
                    autoEdit={col.id === newColumnId}
                    onEditStart={() => setNewColumnId(null)}
                  />
                ))}
            </SortableContext>

            {isRoot && (
              <button
                onClick={async () => {
                  const id = await addColumn()
                  setNewColumnId(id)
                }}
                className="titlebar-no-drag flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-dashed border-gray-300 dark:border-white/20 text-gray-400 dark:text-white/65 hover:text-gray-700 dark:hover:text-white/70 hover:border-gray-400 dark:hover:border-white/40 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition text-sm mt-8 w-56 shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Add stage
              </button>
            )}
          </div>

          <DragOverlay>
            {activeTask && <TaskCardDisplay task={activeTask} isDragging areas={areas} />}
            {activeColumnId && (() => {
              const col = columns.find(c => c.id === activeColumnId)
              return col ? (
                <div className="w-64 rounded-2xl bg-white/90 dark:bg-[#1e2235]/90 border border-black/[0.12] dark:border-white/20 shadow-xl">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${col.color}`} />
                    <span className="text-sm font-bold text-gray-900 dark:text-white/90">{col.name}</span>
                  </div>
                </div>
              ) : null
            })()}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
