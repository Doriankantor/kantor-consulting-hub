import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { Board } from '../types'

export default function Archive() {
  const { isRoot } = useAuth()
  const [boards, setBoards] = useState<Board[]>([])
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const boardsList = await window.api.boards.listArchived()
      setBoards(boardsList)
      const counts: Record<string, number> = {}
      await Promise.all(boardsList.map(async (b: Board) => {
        counts[b.id] = await window.api.boards.taskCount(b.id)
      }))
      setTaskCounts(counts)
    } catch {
      setBoards([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3000)
  }

  async function handleRestore(id: string, name: string) {
    await window.api.boards.restore(id)
    setBoards(prev => prev.filter(b => b.id !== id))
    flash('ok', `"${name}" restored successfully.`)
  }

  async function handleMoveToTrash(id: string, name: string) {
    if (!confirm(`Move "${name}" to Trash?\n\nYou can restore it from Trash, or delete it permanently there.`)) return
    await window.api.boards.delete(id)
    setBoards(prev => prev.filter(b => b.id !== id))
    flash('ok', `"${name}" moved to Trash.`)
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Page header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Archive</h1>
        <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5">
          Archived boards and projects — all data preserved, restored any time.
        </p>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`mb-4 p-3 rounded-xl text-xs font-medium ${
          msg.type === 'ok'
            ? 'bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400'
        }`}>
          {msg.text}
        </div>
      )}

      {/* ── Archived Boards section ─────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-widest mb-3">
          Archived Boards
        </h2>

        {loading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-gray-300 dark:text-white/20 mb-3">
              <rect x="3" y="12" width="34" height="25" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M3 12l4.5-9h25L37 12" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M14 22h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <p className="text-gray-400 dark:text-white/40 font-medium text-sm">No archived boards.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    <th className="text-left px-5 py-3 text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-widest">Project</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-widest">Tasks</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-widest">Archived</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-widest">By</th>
                    <th className="py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {boards.map(board => (
                    <tr key={board.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.03] transition">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-gray-400 dark:text-white/40 shrink-0">
                            <rect x="1" y="3.5" width="11" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                            <path d="M1 3.5l1.5-2.5h8L12 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                            <path d="M4.5 7h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                          <span className="font-medium text-gray-700 dark:text-white/75 italic">{board.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right text-gray-400 dark:text-white/50 tabular-nums">
                        {taskCounts[board.id] ?? '–'}
                      </td>
                      <td className="px-4 py-3.5 text-gray-400 dark:text-white/50 text-xs whitespace-nowrap">
                        {board.archived_at
                          ? new Date(board.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '–'}
                      </td>
                      <td className="px-4 py-3.5 text-gray-400 dark:text-white/50 text-xs truncate max-w-[120px]">
                        {board.archived_by ?? '–'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => handleRestore(board.id, board.name)}
                            className="px-2.5 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 text-xs font-medium transition"
                          >
                            Restore
                          </button>
                          {isRoot && (
                            <button
                              onClick={() => handleMoveToTrash(board.id, board.name)}
                              className="px-2.5 py-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 text-xs transition"
                            >
                              Move to Trash
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Completed Projects section (placeholder for future) ─────────────── */}
      {/* <section>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-widest mb-3">
          Completed Projects
        </h2>
      </section> */}
    </div>
  )
}
