import { useEffect, useState } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import KanbanView from './KanbanView'
import TimelineView from './TimelineView'
import ListView from './ListView'
import CalendarView from './CalendarView'
import TaskDetailPanel from '../../components/TaskDetailPanel'
import type { ViewMode } from '../../types'
import { CONTENT_TYPE_LABELS } from '../../types'

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
  const { viewMode, setViewMode, tasks, columns, selectedTask, createTask, selectTask } = useWorkspace()
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const searchResults = searchQuery.trim()
    ? tasks.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.client ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'k': e.preventDefault(); setShowSearch(v => !v); break
          case 'n': e.preventDefault(); {
            const firstCol = columns[0]
            if (firstCol) createTask(firstCol.id, { title: 'New deliverable', content_type: 'policy-brief', priority: 'medium' })
            break
          }
          case '1': e.preventDefault(); setViewMode('kanban'); break
          case '2': e.preventDefault(); setViewMode('timeline'); break
          case '3': e.preventDefault(); setViewMode('list'); break
          case '4': e.preventDefault(); setViewMode('calendar'); break
        }
      }
      if (e.key === 'Escape') setShowSearch(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [columns, createTask, setViewMode])

  const totalTasks = tasks.length
  const inProgress = tasks.filter(t =>
    ['col-drafting', 'col-review', 'col-delivery'].includes(t.column_id)
  ).length

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Workspace header */}
      <div className="titlebar-drag shrink-0 flex items-center justify-between px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.07] bg-white/60 dark:bg-transparent backdrop-blur-sm">
        <div className="titlebar-no-drag flex flex-col">
          <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Workspace</h1>
          <p className="text-[11px] text-gray-400 dark:text-white/50 mt-0.5">
            {totalTasks} tasks · {inProgress} in progress · {columns.length} stages
          </p>
        </div>

        {/* View switcher */}
        <div className="titlebar-no-drag flex items-center gap-1 bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-xl p-1">
          {VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                viewMode === v.id
                  ? 'bg-hub-gold text-white shadow-sm'
                  : 'text-gray-500 dark:text-white/65 hover:text-gray-700 dark:hover:text-white/75 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
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

      {/* Search modal */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/40 backdrop-blur-sm" onClick={() => setShowSearch(false)}>
          <div className="w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="bg-white dark:bg-[#1a2233] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.1] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-white/[0.06]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-400 dark:text-white/50 shrink-0">
                  <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  autoFocus
                  placeholder="Search deliverables…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 text-sm focus:outline-none"
                />
                <kbd className="text-[10px] text-gray-400 dark:text-white/50 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08]">Esc</kbd>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-white/50 text-center py-8">
                    {searchQuery ? 'No results found' : 'Start typing to search…'}
                  </p>
                ) : searchResults.slice(0, 8).map(task => (
                  <button key={task.id} onClick={() => { selectTask(task); setShowSearch(false); setSearchQuery('') }}
                    className="titlebar-no-drag w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition border-b border-gray-50 dark:border-white/[0.03] last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                      {task.client && <p className="text-xs text-gray-400 dark:text-white/50 mt-0.5 truncate">{task.client}</p>}
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-white/50 shrink-0">{CONTENT_TYPE_LABELS[task.content_type]}</span>
                  </button>
                ))}
              </div>
              {searchQuery === '' && (
                <div className="px-4 py-3 border-t border-gray-100 dark:border-white/[0.05] flex gap-4 text-[10px] text-gray-400 dark:text-white/50">
                  <span><kbd className="font-mono">⌘1</kbd>–<kbd className="font-mono">4</kbd> Switch view</span>
                  <span><kbd className="font-mono">⌘N</kbd> New task</span>
                  <span><kbd className="font-mono">⌘K</kbd> Search</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
