import { useState, useMemo } from 'react'
import type { Task } from '../../types'
import { CONTENT_TYPE_BAR_COLORS, CONTENT_TYPE_LABELS } from '../../types'
import { useWorkspace } from '../../contexts/WorkspaceContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay() // 0 = Sunday
}
function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Day cell ───────────────────────────────────────────────────────────────

function DayCell({
  day, isToday, isCurrentMonth, tasks, onTaskClick, onDrop,
}: {
  day: number | null
  isToday: boolean
  isCurrentMonth: boolean
  tasks: Task[]
  onTaskClick: (t: Task) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { setDragOver(false); onDrop(e) }}
      className={`min-h-[100px] rounded-xl border p-2 transition-colors ${
        isToday
          ? 'border-hub-gold/40 bg-hub-gold/[0.05]'
          : dragOver
          ? 'border-hub-gold/30 bg-hub-gold/[0.04]'
          : isCurrentMonth
          ? 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:bg-gray-50 dark:hover:bg-white/[0.04]'
          : 'border-gray-100 dark:border-white/[0.03] bg-transparent'
      }`}
    >
      {day && (
        <>
          <p className={`text-xs font-semibold mb-1.5 w-6 h-6 flex items-center justify-center rounded-full ${
            isToday ? 'bg-hub-gold text-white' : isCurrentMonth ? 'text-gray-600 dark:text-white/75' : 'text-gray-300 dark:text-white/50'
          }`}>
            {day}
          </p>
          <div className="space-y-1">
            {tasks.slice(0, 3).map(task => (
              <div
                key={task.id}
                draggable
                onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
                onClick={() => onTaskClick(task)}
                title={task.title}
                style={{ backgroundColor: CONTENT_TYPE_BAR_COLORS[task.content_type] }}
                className="w-full rounded px-1.5 py-0.5 text-[10px] text-white font-medium truncate cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
              >
                {task.title}
              </div>
            ))}
            {tasks.length > 3 && (
              <p className="text-[10px] text-gray-400 dark:text-white/50 px-1">+{tasks.length - 3} more</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CalendarView() {
  const { boardTasks: tasks, selectTask, updateTask } = useWorkspace()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const numDays = daysInMonth(year, month)
  const firstDay = firstDayOfMonth(year, month)

  // Build calendar grid (6 weeks × 7 days)
  const grid = useMemo(() => {
    const cells: (number | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= numDays; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [year, month, numDays, firstDay])

  // Map due_date → tasks
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {}
    tasks.forEach(t => {
      if (!t.due_date) return
      if (!map[t.due_date]) map[t.due_date] = []
      map[t.due_date].push(t)
    })
    return map
  }, [tasks])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function handleDrop(e: React.DragEvent, day: number | null) {
    if (!day) return
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    const newDate = isoDate(year, month, day)
    updateTask(taskId, { due_date: newDate })
  }

  const weeks: (number | null)[][] = []
  for (let i = 0; i < grid.length; i += 7) {
    weeks.push(grid.slice(i, i + 7))
  }

  return (
    <div className="h-full flex flex-col p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="titlebar-no-drag p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.07] text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white min-w-[180px] text-center">
            {MONTHS[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="titlebar-no-drag p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.07] text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
            className="titlebar-no-drag ml-2 px-3 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white transition"
          >
            Today
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {Object.entries(CONTENT_TYPE_LABELS).slice(0, 5).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CONTENT_TYPE_BAR_COLORS[type as keyof typeof CONTENT_TYPE_BAR_COLORS] }} />
              <span className="text-[10px] text-gray-400 dark:text-white/50">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase tracking-wider py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-2">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-2">
              {week.map((day, di) => {
                const dateStr = day ? isoDate(year, month, day) : ''
                const dayTasks = day ? (tasksByDate[dateStr] ?? []) : []
                const isToday = day !== null &&
                  today.getFullYear() === year &&
                  today.getMonth() === month &&
                  today.getDate() === day

                return (
                  <DayCell
                    key={di}
                    day={day}
                    isToday={isToday}
                    isCurrentMonth={true}
                    tasks={dayTasks}
                    onTaskClick={selectTask}
                    onDrop={e => handleDrop(e, day)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
