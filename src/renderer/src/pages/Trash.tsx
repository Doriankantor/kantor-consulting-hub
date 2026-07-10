import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'

type FilterType = 'all' | 'task' | 'board' | 'contact' | 'comment'
type SortType = 'date' | 'remaining' | 'name'
type ItemSource = 'local' | 'cloud-board' | 'cloud-contact'

interface UnifiedItem {
  _uid: string          // local trash row id (for local) or entity id (for cloud)
  _source: ItemSource
  item_type: 'task' | 'board' | 'contact' | 'comment'
  item_id: string       // the actual entity ID
  item_name: string
  deleted_at: string
  expires_at: string | null   // null = cloud item, no auto-expiry
  deleted_by_name: string | null
}

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

function CloudBadge() {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30">
      Cloud
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
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-orange-400">
      <path d="M2 2.5h10v7H8l-1.5 2L5 9.5H2v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}

export default function Trash() {
  const { localUser, isRoot } = useAuth()
  const { undeleteBoard, refreshTasks, refreshBoards } = useWorkspace()
  const [items, setItems] = useState<UnifiedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [sort, setSort] = useState<SortType>('date')
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [confirmPermBoard, setConfirmPermBoard] = useState<UnifiedItem | null>(null)
  const [permBoardName, setPermBoardName] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [restoringAll, setRestoringAll] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [localRaw, boardsRaw, contactsRaw] = await Promise.all([
        window.api.trash.list().catch(() => [] as TrashItem[]),
        isRoot ? window.api.boards.listTrashed().catch(() => [] as Record<string, unknown>[]) : Promise.resolve([] as Record<string, unknown>[]),
        window.api.contacts.listTrash().catch(() => [] as Contact[]),
      ])

      // Local items: tasks + comments only (boards are now cloud-managed)
      const localItems: UnifiedItem[] = (localRaw as TrashItem[])
        .filter(i => i.item_type !== 'board')
        .map(i => ({
          _uid: i.id,
          _source: 'local',
          item_type: i.item_type,
          item_id: i.item_id,
          item_name: i.item_name,
          deleted_at: i.deleted_at,
          expires_at: i.expires_at,
          deleted_by_name: i.deleted_by_name,
        }))

      // Cloud boards (soft-deleted)
      const boardItems: UnifiedItem[] = (boardsRaw as Record<string, unknown>[]).map(b => ({
        _uid: b.id as string,
        _source: 'cloud-board',
        item_type: 'board',
        item_id: b.id as string,
        item_name: (b.name as string) ?? 'Untitled board',
        deleted_at: (b.updated_at as string) ?? new Date().toISOString(),
        expires_at: null,
        deleted_by_name: null,
      }))

      // Cloud contacts (soft-deleted)
      const contactItems: UnifiedItem[] = (contactsRaw as Contact[])
        .filter(c => c.deleted_at != null)
        .map(c => ({
          _uid: c.id,
          _source: 'cloud-contact',
          item_type: 'contact',
          item_id: c.id,
          item_name: c.full_name,
          deleted_at: c.deleted_at!,
          expires_at: null,
          deleted_by_name: null,
        }))

      setItems([...boardItems, ...contactItems, ...localItems])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [isRoot])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(i => filter === 'all' || i.item_type === filter)

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'date') return new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
    if (sort === 'remaining') {
      const aD = a.expires_at ? daysRemaining(a.expires_at) : Infinity
      const bD = b.expires_at ? daysRemaining(b.expires_at) : Infinity
      return aD - bD
    }
    return a.item_name.localeCompare(b.item_name)
  })

  // Local-only items (for bulk actions)
  const localItems = items.filter(i => i._source === 'local')

  async function handleRestore(item: UnifiedItem) {
    setRestoring(item._uid)
    try {
      if (item._source === 'local') {
        await window.api.trash.restore(item._uid)
      } else if (item._source === 'cloud-board') {
        // Route through context so the board list AND its tasks refresh (sidebar + cards).
        await undeleteBoard(item.item_id)
      } else if (item._source === 'cloud-contact') {
        await window.api.contacts.restore(item.item_id)
      }
      await load()
    } finally {
      setRestoring(null)
    }
  }

  async function handleDeletePerm(item: UnifiedItem) {
    setDeleting(item._uid)
    try {
      if (item._source === 'local') {
        await window.api.trash.deletePermanently(item._uid)
      } else if (item._source === 'cloud-board') {
        await window.api.boards.permanentlyDelete(item.item_id)
      } else if (item._source === 'cloud-contact') {
        await window.api.contacts.permanentDelete(item.item_id, localUser?.email ?? '')
      }
      await load()
    } finally {
      setDeleting(null)
    }
  }

  async function handleRestoreAll() {
    if (restoringAll) return
    setRestoringAll(true)
    setBulkMsg(null)
    // Route each item by _source, mirroring single-item handleRestore. Use the
    // UNDERLYING cloud calls in the loop (not context undeleteBoard, which bundles
    // its own loadBoards+refreshTasks) so we do ONE reconcile after, not N.
    const failed: string[] = []
    try {
      for (const item of items) {
        try {
          if (item._source === 'local') {
            await window.api.trash.restore(item._uid)
          } else if (item._source === 'cloud-board') {
            await window.api.boards.undelete(item.item_id)
          } else if (item._source === 'cloud-contact') {
            await window.api.contacts.restore(item.item_id)
          }
        } catch {
          failed.push(item.item_name)   // one failure doesn't abort the rest
        }
      }
    } finally {
      // Guaranteed reconcile — exactly once, even if items errored. load() only
      // refreshes the Trash lists, so refreshBoards() covers the sidebar board list
      // and refreshTasks() repopulates restored boards' cards.
      try { await refreshBoards() } catch {}
      try { await refreshTasks() } catch {}
      await load()
      setRestoringAll(false)
      if (failed.length > 0) {
        setBulkMsg(`${failed.length} item${failed.length !== 1 ? 's' : ''} couldn't be restored — try again.`)
      }
    }
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
              {items.length === 0
                ? 'No items in trash'
                : `${items.length} item${items.length !== 1 ? 's' : ''} — local items removed after 30 days`}
            </p>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreAll}
                disabled={restoringAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/20 transition disabled:opacity-50 disabled:cursor-default"
              >
                {restoringAll && <span className="w-3 h-3 border-2 border-teal-400/30 border-t-teal-500 rounded-full animate-spin" />}
                {restoringAll ? 'Restoring…' : 'Restore all'}
              </button>
              {isRoot && localItems.length > 0 && (
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

      {/* Bulk-restore failure notice */}
      {bulkMsg && (
        <div className="mb-4 p-3 rounded-xl text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
          {bulkMsg}
        </div>
      )}

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
          <p className="text-gray-300 dark:text-white/25 text-sm mt-1">Deleted items will appear here</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden">
          {sorted.map((item, idx) => {
            const deletedDate = new Date(item.deleted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <div
                key={item._uid}
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
                {item.expires_at != null ? (
                  <DaysBadge days={daysRemaining(item.expires_at)} />
                ) : (
                  <CloudBadge />
                )}
                <button
                  onClick={() => handleRestore(item)}
                  disabled={restoring === item._uid}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/20 transition disabled:opacity-50"
                >
                  {restoring === item._uid ? '…' : 'Restore'}
                </button>
                {isRoot && (
                  <button
                    onClick={() => {
                      if (item._source === 'cloud-board') {
                        setPermBoardName('')
                        setConfirmPermBoard(item)
                      } else {
                        handleDeletePerm(item)
                      }
                    }}
                    disabled={deleting === item._uid}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/20 transition disabled:opacity-50"
                  >
                    {deleting === item._uid ? '…' : 'Delete'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Permanently delete board confirmation (type-to-confirm gate) */}
      {confirmPermBoard && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/[0.12] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-red-500 mb-2">Permanently delete "{confirmPermBoard.item_name}"?</h3>
            <p className="text-sm text-gray-500 dark:text-white/60 mb-4 leading-relaxed">
              This permanently deletes the board and all its tasks, comments, and attachments. This cannot be undone.
            </p>
            <p className="text-xs text-gray-400 dark:text-white/55 mb-2">Type the project name to confirm:</p>
            <input
              autoFocus
              value={permBoardName}
              onChange={e => setPermBoardName(e.target.value)}
              placeholder={confirmPermBoard.item_name}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.1] text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setConfirmPermBoard(null); setPermBoardName('') }}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-white/[0.12] text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
              >
                Cancel
              </button>
              <button
                disabled={permBoardName !== confirmPermBoard.item_name}
                onClick={async () => {
                  const item = confirmPermBoard
                  setConfirmPermBoard(null)
                  setPermBoardName('')
                  await handleDeletePerm(item)
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm empty dialog */}
      {confirmEmpty && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/[0.12] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Empty trash?</h3>
            <p className="text-sm text-gray-500 dark:text-white/60 mb-5">
              This will permanently remove all {localItems.length} local item{localItems.length !== 1 ? 's' : ''} (tasks and comments). Cloud items (boards and contacts) must be deleted individually. This action cannot be undone.
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
