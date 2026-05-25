import { useState, useRef, useCallback, useMemo } from 'react'
import type { Task } from '../../types'
import { CONTENT_TYPE_BAR_COLORS, CONTENT_TYPE_LABELS } from '../../types'
import { useWorkspace } from '../../contexts/WorkspaceContext'

// ── Zoom levels ────────────────────────────────────────────────────────────

type Zoom = 'week' | 'month' | 'quarter'
const ZOOM_CONFIG: Record<Zoom, { days: number; colWidth: number; label: string }> = {
  week:    { days: 14,  colWidth: 72,  label: 'Week' },
  month:   { days: 60,  colWidth: 28,  label: 'Month' },
  quarter: { days: 120, colWidth: 14,  label: 'Quarter' },
}
const DAY_MS = 86_400_000

function addDays(date: Date, n: number) {
  return new Date(date.getTime() + n * DAY_MS)
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}
function toDateObj(iso: string) {
  return new Date(iso + 'T00:00:00')
}
function fmtMonth(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short' })
}
function fmtDay(d: Date) {
  return d.getDate()
}

const TASK_ROW_H = 44

// ── Component ──────────────────────────────────────────────────────────────

export default function TimelineView() {
  const { tasks, columns, selectTask, updateTask } = useWorkspace()
  const [zoom, setZoom] = useState<Zoom>('month')
  const cfg = ZOOM_CONFIG[zoom]

  // Period starts 3 days before today
  const periodStart = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return addDays(d, -3)
  }, [])

  const days = useMemo(() =>
    Array.from({ length: cfg.days }, (_, i) => addDays(periodStart, i)),
  [periodStart, cfg.days])

  const totalWidth = cfg.days * cfg.colWidth

  // Dragging state
  const dragging = useRef<{ taskId: string; startX: number; origStart: string | null; origEnd: string | null } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Filter tasks that have at least a due_date
  const scheduledTasks = useMemo(() =>
    tasks.filter(t => t.due_date),
  [tasks])

  const columnMap = useMemo(() =>
    Object.fromEntries(columns.map(c => [c.id, c])),
  [columns])

  // Position helpers
  function barLeft(task: Task): number {
    const start = task.start_date ? toDateObj(task.start_date) : toDateObj(task.due_date!)
    const offset = daysBetween(periodStart, start)
    return offset * cfg.colWidth
  }

  function barWidth(task: Task): number {
    if (!task.start_date || !task.due_date) return cfg.colWidth * 1.5
    const start = toDateObj(task.start_date)
    const end = toDateObj(task.due_date)
    const dur = Math.max(1, daysBetween(start, end))
    return dur * cfg.colWidth
  }

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, task: Task) => {
    e.stopPropagation()
    dragging.current = {
      taskId: task.id,
      startX: e.clientX,
      origStart: task.start_date,
      origEnd: task.due_date,
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const { taskId, startX, origStart, origEnd } = dragging.current
    const deltaX = e.clientX - startX
    const deltaDays = Math.round(deltaX / cfg.colWidth)
    if (deltaDays === 0) return

    const newStart = origStart
      ? addDays(toDateObj(origStart), deltaDays).toISOString().slice(0, 10)
      : null
    const newEnd = origEnd
      ? addDays(toDateObj(origEnd), deltaDays).toISOString().slice(0, 10)
      : null

    updateTask(taskId, {
      start_date: newStart,
      due_date: newEnd ?? undefined,
    } as Partial<Task>)
  }, [cfg.colWidth, updateTask])

  const handleMouseUp = useCallback(() => {
    dragging.current = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  // Today marker position
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayLeft = daysBetween(periodStart, today) * cfg.colWidth

  return (
    <div className="h-full flex flex-col select-none">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-white/[0.07]">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-lg p-0.5">
          {(['week', 'month', 'quarter'] as Zoom[]).map(z => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`titlebar-no-drag px-3 py-1.5 rounded-md text-xs font-medium transition ${
                zoom === z ? 'bg-hub-gold text-white shadow' : 'text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80'
              }`}
            >
              {ZOOM_CONFIG[z].label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-white/30">Drag bars to reschedule</p>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: task name column */}
        <div className="w-56 shrink-0 border-r border-gray-200 dark:border-white/[0.07] flex flex-col">
          {/* Header spacer */}
          <div className="h-10 border-b border-gray-200 dark:border-white/[0.07] px-4 flex items-center">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/30 uppercase tracking-widest">Task</span>
          </div>
          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {scheduledTasks.map(task => {
              const col = columnMap[task.column_id]
              return (
                <div
                  key={task.id}
                  onClick={() => selectTask(task)}
                  style={{ height: TASK_ROW_H }}
                  className="flex items-center px-4 gap-2 border-b border-gray-100 dark:border-white/[0.04] cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.04] transition group"
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${col?.color ?? 'bg-slate-500'}`} />
                  <p className="text-sm text-gray-600 dark:text-white/70 truncate group-hover:text-gray-900 dark:group-hover:text-white/90 transition">{task.title}</p>
                </div>
              )
            })}
            {scheduledTasks.length === 0 && (
              <div className="flex items-center justify-center h-32 text-gray-400 dark:text-white/25 text-sm">
                No scheduled tasks
              </div>
            )}
          </div>
        </div>

        {/* Right: timeline */}
        <div ref={containerRef} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, minWidth: '100%' }} className="relative">
            {/* Date header */}
            <div className="sticky top-0 z-10 bg-slate-50 dark:bg-[#0f1624] border-b border-gray-200 dark:border-white/[0.07] flex" style={{ height: 40 }}>
              {days.map((d, i) => {
                const isFirst = i === 0 || d.getDate() === 1
                const isToday = d.toDateString() === new Date().toDateString()
                return (
                  <div
                    key={i}
                    style={{ width: cfg.colWidth, minWidth: cfg.colWidth }}
                    className={`shrink-0 flex flex-col items-center justify-center border-r border-gray-100 dark:border-white/[0.04] text-[10px]
                      ${isToday ? 'bg-hub-gold/10 text-hub-gold font-bold' : 'text-gray-400 dark:text-white/25'}`}
                  >
                    {zoom !== 'week' && isFirst ? (
                      <span className="font-semibold text-gray-500 dark:text-white/50">{fmtMonth(d)}</span>
                    ) : null}
                    {zoom === 'week' || isFirst || d.getDate() % (zoom === 'month' ? 7 : 14) === 0 ? (
                      <span>{fmtDay(d)}</span>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {/* Grid + bars */}
            <div style={{ position: 'relative' }}>
              {/* Today line */}
              {todayLeft >= 0 && todayLeft <= totalWidth && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-hub-gold/40 z-10 pointer-events-none"
                  style={{ left: todayLeft }}
                />
              )}

              {/* Column grid lines */}
              <div className="absolute inset-0 flex pointer-events-none">
                {days.map((d, i) => (
                  <div
                    key={i}
                    style={{ width: cfg.colWidth, minWidth: cfg.colWidth }}
                    className={`shrink-0 border-r ${
                      d.getDay() === 0 || d.getDay() === 6
                        ? 'border-gray-100 dark:border-white/[0.04] bg-gray-50/50 dark:bg-white/[0.01]'
                        : 'border-gray-100/50 dark:border-white/[0.03]'
                    }`}
                  />
                ))}
              </div>

              {/* Task rows */}
              {scheduledTasks.map(task => {
                const left = barLeft(task)
                const width = barWidth(task)
                const color = CONTENT_TYPE_BAR_COLORS[task.content_type]
                const isVisible = left < totalWidth && left + width > 0

                return (
                  <div
                    key={task.id}
                    style={{ height: TASK_ROW_H }}
                    className="relative border-b border-gray-100 dark:border-white/[0.04] flex items-center"
                  >
                    {isVisible && (
                      <div
                        style={{
                          left: Math.max(0, left),
                          width: Math.min(width, totalWidth - Math.max(0, left)),
                          backgroundColor: color,
                          maxWidth: totalWidth,
                        }}
                        className="absolute h-7 rounded-md cursor-grab active:cursor-grabbing flex items-center px-2 opacity-85 hover:opacity-100 transition-opacity shadow-md"
                        onMouseDown={e => handleMouseDown(e, task)}
                        onClick={() => selectTask(task)}
                      >
                        <span className="text-white text-[11px] font-medium truncate select-none">
                          {task.title}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
