import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

type FilterType = 'all' | 'task' | 'board' | 'contact' | 'comment'
type SortType = 'date' | 'remaining' | 'name'

function daysRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
}

function DaysBadge({ days }: { days: number }) {
  const cls =
    days > 7  ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30' :
    days >= 3 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30' :
                'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30'
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {days}d left
    </span>
  )
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'task') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-blue-400">
      <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4 7l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (type === 'board') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-purple-400">
      <rect x="1" y="1" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="5.5" y="1" width="3" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="10" y="1" width="3" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
  if (type === 'contact') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-emerald-400">
      <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
  // comment
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-orange-400">
      <path d="M2 2.5h10v7H8l-1.5 2L5 9.5H2v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}

export default function Trash() {
  const { localUser, isRoot } = useAuth()
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [sort, setSort] = useState<SortType>('date')
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await window.api.trash.list()
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(i => filter === 'all' || i.item_type === filter)

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'date')      return new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
    if (sort === 'remaining') return daysRemaining(a.expires_at) - daysRemaining(b.expires_at)
    return a.item_name.localeCompare(b.item_name)
  })

  async function handleRestore(id: string) {
    setRestoring(id)
    try {
      await window.api.trash.restore(id)
      await load()
    } finally {
      setRestoring(null)
    }
  }

  async function handleDeletePerm(id: string) {
    setDeleting(id)
    try {
      await window.api.trash.deletePermanently(id)
      await load()
    } finally {
      setDeleting(null)
    }
  }

  async function handleRestoreAll() {
    await window.api.trash.restoreAll()
    await load()
  }

  async function handleEmptyTrash() {
    await window.api.trash.emptyTrash()
    setConfirmEmpty(false)
    await load()
  }

  const filterTabs: { id: FilterType; label: string }[] = [
    { id: 'all',     label: 'All' },
    { id: 'board',   label: 'Projects' },
    { id: 'task',    label: 'Tasks' },
    { id: 'contact', label: 'Contacts' },
    { id: 'comment', label: 'Comments' },
  ]

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trash</h1>
            <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5">
              {items.length === 0 ? 'No items in trash' : `${items.length} item${items.length !== 1 ? 's' : ''} — deleted items are removed after 30 days`}
            </p>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreAll}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/20 transition"
              >
                Restore all
              </button>
              {isRoot && (
                <button
                  onClick={() => setConfirmEmpty(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 transition"
                >
                  Empty trash
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-xl p-1">
            {filterTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  filter === tab.id
                    ? 'bg-white dark:bg-white/[0.15] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/75'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortType)}
            className="text-xs border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.06] text-gray-700 dark:text-white/75 rounded-lg px-2 py-1.5"
          >
            <option value="date">Date deleted</option>
            <option value="remaining">Days remaining</option>
            <option value="name">Name</option>
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-gray-300 dark:text-white/20 mb-4">
            <path d="M8 12h32M20 8h8M18 20v16M24 20v16M30 20v16M10 12l2 28h24l2-28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="text-gray-400 dark:text-white/40 font-medium">Trash is empty</p>
          <p className="text-gray-300 dark:text-white/25 text-sm mt-1">Deleted items will appear here for 30 days</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden">
          {sorted.map((item, idx) => {
            const days = daysRemaining(item.expires_at)
            const deletedDate = new Date(item.deleted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-5 py-3.5 ${idx !== sorted.length - 1 ? 'border-b border-gray-100 dark:border-white/[0.05]' : ''}`}
              >
                <div className="shrink-0">
                  <TypeIcon type={item.item_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm line-through text-gray-400 dark:text-white/40 truncate block">
                    {item.item_name}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-white/30">
                    {item.deleted_by_name ? `Deleted by ${item.deleted_by_name} · ` : ''}{deletedDate}
                  </span>
                </div>
                <DaysBadge days={days} />
                <button
                  onClick={() => handleRestore(item.id)}
                  disabled={restoring === item.id}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/20 transition disabled:opacity-50"
                >
                  {restoring === item.id ? '…' : 'Restore'}
                </button>
                {isRoot && (
                  <button
                    onClick={() => handleDeletePerm(item.id)}
                    disabled={deleting === item.id}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/20 transition disabled:opacity-50"
                  >
                    {deleting === item.id ? '…' : 'Delete'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm empty dialog */}
      {confirmEmpty && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/[0.12] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Empty trash?</h3>
            <p className="text-sm text-gray-500 dark:text-white/60 mb-5">
              This will permanently delete all {items.length} item{items.length !== 1 ? 's' : ''} in the trash. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmEmpty(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-white/[0.12] text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEmptyTrash}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition"
              >
                Empty trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
