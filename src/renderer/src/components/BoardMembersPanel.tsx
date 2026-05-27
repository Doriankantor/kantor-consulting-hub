import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// ── Color helpers ──────────────────────────────────────────────────────────

const MEMBER_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#06b6d4']

function memberColor(userId: string): string {
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface BoardMember {
  user_id: string
  full_name: string
  email: string
  role: string
  added_at: string
}

interface TeamMemberRow {
  id: string
  full_name: string | null
  email: string
  role: string
}

interface Props {
  boardId: string
  boardName: string
  isAdmin: boolean
  currentUserId: string
  currentUserName: string
  onClose: () => void
}

// ── Panel ──────────────────────────────────────────────────────────────────

export default function BoardMembersPanel({ boardId, boardName, isAdmin, currentUserId, currentUserName, onClose }: Props) {
  const [members, setMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)

  // Remove state
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeTaskCount, setRemoveTaskCount] = useState(0)

  // Add member
  const [addQuery, setAddQuery] = useState('')
  const [allTeam, setAllTeam] = useState<TeamMemberRow[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)

  async function loadMembers() {
    try {
      const data = await window.api.boardMembers.list(boardId)
      setMembers(data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    loadMembers()
    window.api.team.list().then(team => {
      setAllTeam(team.map(m => ({ id: m.id, full_name: m.full_name, email: m.email, role: m.role })))
    }).catch(() => {})
  }, [boardId])

  // Filter suggestions: team members not already on board
  const memberIds = new Set(members.map(m => m.user_id))
  const suggestions = allTeam.filter(m => {
    if (memberIds.has(m.id)) return false
    if (!addQuery.trim()) return false
    const q = addQuery.toLowerCase()
    return (
      (m.full_name ?? '').toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    )
  })

  async function handleAdd(member: TeamMemberRow) {
    setAdding(true)
    await window.api.boardMembers.add(boardId, member.id, currentUserName)
    setAddQuery('')
    setDropdownOpen(false)
    await loadMembers()
    setAdding(false)
  }

  async function startRemove(userId: string) {
    const count = await window.api.boardMembers.taskCount(boardId, userId)
    setRemoveTaskCount(count)
    setRemovingId(userId)
  }

  async function confirmRemove() {
    if (!removingId) return
    await window.api.boardMembers.remove(boardId, removingId)
    setRemovingId(null)
    await loadMembers()
  }

  const panel = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-80 bg-white dark:bg-[#1a2233] border-l border-gray-200 dark:border-white/[0.08] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Board Members</h2>
            <p className="text-xs text-gray-400 dark:text-white/50 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="titlebar-no-drag p-1.5 rounded-lg text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.08] transition"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-400 dark:text-white/50 text-center py-8">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-white/50 text-center py-8">No members yet.</p>
          ) : (
            <div className="py-2">
              {members.map(m => {
                const name = m.full_name || m.email
                const isSelf = m.user_id === currentUserId
                const isAdminMember = m.role === 'admin'
                const canRemove = isAdmin && !isSelf && !isAdminMember

                return (
                  <div key={m.user_id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition group">
                    {/* Remove confirmation */}
                    {removingId === m.user_id ? (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-700 dark:text-white/75 leading-relaxed">
                          Remove <span className="font-semibold">{name}</span> from this board?
                          They will lose access immediately.
                        </p>
                        {removeTaskCount > 0 && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Warning: {name} has {removeTaskCount} active task{removeTaskCount !== 1 ? 's' : ''} on this board. These will remain assigned to them.
                          </p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={confirmRemove}
                            className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition"
                          >
                            Remove anyway
                          </button>
                          <button
                            onClick={() => setRemovingId(null)}
                            className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.08] text-gray-600 dark:text-white/65 text-xs transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 select-none"
                          style={{ backgroundColor: memberColor(m.user_id) }}
                          title={name}
                        >
                          {initials(name)}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-gray-800 dark:text-white/90 truncate">{name}</p>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                              isAdminMember
                                ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                                : 'bg-gray-50 dark:bg-white/[0.05] border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/55'
                            }`}>
                              {isAdminMember ? 'Admin' : 'Member'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 dark:text-white/45 truncate">{m.email}</p>
                          <p className="text-[10px] text-gray-300 dark:text-white/30 mt-0.5">Added {fmtDate(m.added_at)}</p>
                        </div>

                        {/* Remove button */}
                        {canRemove && (
                          <button
                            onClick={() => startRemove(m.user_id)}
                            className="titlebar-no-drag opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 dark:text-white/30 hover:text-red-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition shrink-0"
                            title={`Remove ${name}`}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add member (admin only) */}
        {isAdmin && (
          <div className="border-t border-gray-100 dark:border-white/[0.06] px-4 py-3">
            <div className="relative">
              <input
                ref={addInputRef}
                value={addQuery}
                onChange={e => { setAddQuery(e.target.value); setDropdownOpen(true) }}
                onFocus={() => addQuery && setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                placeholder="Add team member…"
                disabled={adding}
                className="titlebar-no-drag w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.1] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition disabled:opacity-50"
              />
              {adding && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              )}

              {/* Dropdown */}
              {dropdownOpen && suggestions.length > 0 && (
                <div className="absolute bottom-full mb-1 left-0 right-0 bg-white dark:bg-[#1a2233] border border-gray-200 dark:border-white/[0.1] rounded-xl shadow-lg overflow-hidden z-10">
                  {suggestions.map(m => {
                    const name = m.full_name || m.email
                    return (
                      <button
                        key={m.id}
                        onMouseDown={() => handleAdd(m)}
                        className="titlebar-no-drag w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition text-left"
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: memberColor(m.id) }}
                        >
                          {initials(name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-white/85 truncate">{name}</p>
                          <p className="text-[10px] text-gray-400 dark:text-white/45 truncate">{m.email}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )

  return createPortal(panel, document.body)
}
