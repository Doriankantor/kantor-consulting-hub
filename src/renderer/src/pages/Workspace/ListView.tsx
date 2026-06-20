import { useState, useMemo } from 'react'
import type { Task, ContentType, Priority, AreaOfAnalysis } from '../../types'
import {
  CONTENT_TYPE_LABELS, CONTENT_TYPE_COLORS,
  AREA_LABELS, AREA_COLORS,
  PRIORITY_DOT, PRIORITY_COLORS,
} from '../../types'
import { useWorkspace } from '../../contexts/WorkspaceContext'

type SortKey = 'title' | 'content_type' | 'client' | 'column_id' | 'due_date' | 'priority' | 'area_of_analysis'
type SortDir = 'asc' | 'desc'

const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low']

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function isOverdue(iso: string | null, colId: string) {
  if (!iso || colId === 'col-published') return false
  return new Date(iso) < new Date()
}

// ── Filter bar ─────────────────────────────────────────────────────────────

interface Filters {
  search: string
  column: string
  content_type: string
  priority: string
  area: string
}

function FilterBar({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const { columns } = useWorkspace()
  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setFilters({ ...filters, [key]: e.target.value })

  const sel = "titlebar-no-drag px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-700 dark:text-white/70 text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40 cursor-pointer"
  const isActive = filters.search || filters.column || filters.content_type || filters.priority || filters.area

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/50" width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M8.5 8.5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          value={filters.search}
          onChange={set('search')}
          placeholder="Search engagements…"
          className="titlebar-no-drag pl-8 pr-3 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/40 w-52"
        />
      </div>

      <select value={filters.area} onChange={set('area')} className={sel}>
        <option value="">All areas</option>
        {(Object.entries(AREA_LABELS) as [AreaOfAnalysis, string][]).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <select value={filters.column} onChange={set('column')} className={sel}>
        <option value="">All stages</option>
        {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <select value={filters.content_type} onChange={set('content_type')} className={sel}>
        <option value="">All types</option>
        {(Object.entries(CONTENT_TYPE_LABELS) as [ContentType, string][]).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <select value={filters.priority} onChange={set('priority')} className={sel}>
        <option value="">All priorities</option>
        <option value="urgent">Urgent</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {isActive && (
        <button
          onClick={() => setFilters({ search: '', column: '', content_type: '', priority: '', area: '' })}
          className="titlebar-no-drag text-xs text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/60 transition px-2 py-1.5"
        >
          Clear
        </button>
      )}
    </div>
  )
}

// ── Sort header ────────────────────────────────────────────────────────────

function Th({ label, sortKey, current, dir, onClick }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <th
      onClick={() => onClick(sortKey)}
      className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 dark:text-white/65 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-white/70 transition select-none whitespace-nowrap"
    >
      <span className="flex items-center gap-1">
        {label}
        <span className={active ? 'text-hub-gold' : 'opacity-0'}>
          {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function ListView() {
  const { boardTasks: tasks, columns, selectTask, archiveTask } = useWorkspace()
  const [sortKey, setSortKey] = useState<SortKey>('due_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filters, setFilters] = useState<Filters>({
    search: '', column: '', content_type: '', priority: '', area: '',
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const columnMap = useMemo(() => Object.fromEntries(columns.map(c => [c.id, c])), [columns])

  const filtered = useMemo(() => tasks.filter(t => {
    if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false
    if (filters.column && t.column_id !== filters.column) return false
    if (filters.content_type && t.content_type !== filters.content_type) return false
    if (filters.priority && t.priority !== filters.priority) return false
    if (filters.area && t.area_of_analysis !== filters.area) return false
    return true
  }), [tasks, filters])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'due_date') {
      cmp = (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    } else if (sortKey === 'priority') {
      cmp = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    } else if (sortKey === 'column_id') {
      cmp = (columnMap[a.column_id]?.position ?? 99) - (columnMap[b.column_id]?.position ?? 99)
    } else if (sortKey === 'area_of_analysis') {
      cmp = (a.area_of_analysis ?? '').localeCompare(b.area_of_analysis ?? '')
    } else {
      cmp = ((a[sortKey] ?? '') as string).localeCompare((b[sortKey] ?? '') as string)
    }
    return sortDir === 'asc' ? cmp : -cmp
  }), [filtered, sortKey, sortDir, columnMap])

  return (
    <div className="h-full flex flex-col p-5">
      <div className="mb-4">
        <FilterBar filters={filters} setFilters={setFilters} />
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white/80 dark:bg-transparent">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white/90 dark:bg-black/60 backdrop-blur-md z-10">
            <tr className="border-b border-gray-200 dark:border-white/[0.08]">
              <Th label="Title"           sortKey="title"           current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Type"            sortKey="content_type"    current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Area"            sortKey="area_of_analysis"current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Client"          sortKey="client"          current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Stage"           sortKey="column_id"       current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Due Date"        sortKey="due_date"        current={sortKey} dir={sortDir} onClick={handleSort} />
              <Th label="Priority"        sortKey="priority"        current={sortKey} dir={sortDir} onClick={handleSort} />
              <th className="px-4 py-3 w-16"/>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-gray-400 dark:text-white/50 text-sm">
                  No engagements match your filters
                </td>
              </tr>
            ) : sorted.map((task, i) => {
              const col = columnMap[task.column_id]
              const overdue = isOverdue(task.due_date, task.column_id)
              return (
                <tr
                  key={task.id}
                  onClick={() => selectTask(task)}
                  className={`group border-b border-gray-100 dark:border-white/[0.05] cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04] ${i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-white/[0.015]'}`}
                >
                  {/* Title */}
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="text-sm text-gray-800 dark:text-white/90 font-medium truncate">{task.title}</p>
                  </td>
                  {/* Type */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${CONTENT_TYPE_COLORS[task.content_type]}`}>
                      {CONTENT_TYPE_LABELS[task.content_type]}
                    </span>
                  </td>
                  {/* Area */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {task.area_of_analysis ? (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${AREA_COLORS[task.area_of_analysis]}`}>
                        {AREA_LABELS[task.area_of_analysis]}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-white/50 text-sm">—</span>
                    )}
                  </td>
                  {/* Client */}
                  <td className="px-4 py-3 max-w-[160px]">
                    <span className="text-sm text-gray-500 dark:text-white/65 truncate block">{task.client ?? '—'}</span>
                  </td>
                  {/* Stage */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${col?.color ?? 'bg-slate-500'}`} />
                      <span className="text-sm text-gray-500 dark:text-white/75">{col?.name ?? '—'}</span>
                    </div>
                  </td>
                  {/* Due date */}
                  <td className={`px-4 py-3 whitespace-nowrap text-sm ${overdue ? 'text-red-400 font-medium' : 'text-gray-500 dark:text-white/65'}`}>
                    {overdue && <span className="mr-1">⚠</span>}
                    {formatDate(task.due_date)}
                  </td>
                  {/* Priority */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                      <span className={`text-sm capitalize ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
                    </div>
                  </td>
                  {/* Archive action */}
                  <td className="px-4 py-3">
                    <button
                      onClick={e => { e.stopPropagation(); archiveTask(task.id) }}
                      title="Archive"
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-lg text-gray-400 dark:text-white/40 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 text-xs transition-all whitespace-nowrap"
                    >
                      <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                        <rect x="1" y="3.5" width="11" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M1 3.5l1.5-2.5h8L12 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                        <path d="M4.5 7h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      Archive
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-gray-400 dark:text-white/50 text-right">
        {sorted.length} of {tasks.length} engagements
      </p>
    </div>
  )
}
