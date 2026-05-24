import { useWorkspace } from '../../contexts/WorkspaceContext'
import KanbanView from './KanbanView'
import TimelineView from './TimelineView'
import ListView from './ListView'
import CalendarView from './CalendarView'
import TaskDetailPanel from '../../components/TaskDetailPanel'
import type { ViewMode } from '../../types'

// ── View switcher tabs ─────────────────────────────────────────────────────

const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    id: 'kanban',
    label: 'Kanban',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="5.25" y="1" width="3.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="9.5" y="1" width="3.5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M1 7h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <rect x="2" y="3" width="5" height="2.5" rx="0.75" fill="currentColor"/>
        <rect x="6" y="8.5" width="6" height="2.5" rx="0.75" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: 'list',
    label: 'List',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M1.5 3.5h11M1.5 7h11M1.5 10.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1 6h12" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4 1v2M10 1v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="4.5" cy="9" r="0.75" fill="currentColor"/>
        <circle cx="7" cy="9" r="0.75" fill="currentColor"/>
        <circle cx="9.5" cy="9" r="0.75" fill="currentColor"/>
      </svg>
    ),
  },
]

// ── Workspace shell ────────────────────────────────────────────────────────

export default function Workspace() {
  const { viewMode, setViewMode, tasks, columns, selectedTask } = useWorkspace()

  const totalTasks = tasks.length
  const inProgress = tasks.filter(t =>
    ['col-drafting', 'col-review', 'col-delivery'].includes(t.column_id)
  ).length

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Workspace header */}
      <div className="titlebar-drag shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
        <div className="titlebar-no-drag flex flex-col">
          <h1 className="text-base font-bold text-white leading-tight">Workspace</h1>
          <p className="text-[11px] text-white/30 mt-0.5">
            {totalTasks} tasks · {inProgress} in progress · {columns.length} stages
          </p>
        </div>

        {/* View switcher */}
        <div className="titlebar-no-drag flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1">
          {VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                viewMode === v.id
                  ? 'bg-hub-gold text-white shadow-sm'
                  : 'text-white/45 hover:text-white/75 hover:bg-white/[0.06]'
              }`}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* View content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'kanban'   && <KanbanView />}
        {viewMode === 'timeline' && <TimelineView />}
        {viewMode === 'list'     && <ListView />}
        {viewMode === 'calendar' && <CalendarView />}
      </div>

      {/* Task detail panel (shared across all views) */}
      {selectedTask && <TaskDetailPanel />}
    </div>
  )
}
