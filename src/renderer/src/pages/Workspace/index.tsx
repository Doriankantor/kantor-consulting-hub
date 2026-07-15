import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useAuth } from '../../contexts/AuthContext'
import { useConnection } from '../../contexts/ConnectionContext'
import { ADMIN_EMAIL } from '../../supabase/client'
import KanbanView from './KanbanView'
import TimelineView from './TimelineView'
import ListView from './ListView'
import CalendarView from './CalendarView'
import TaskDetailPanel from '../../components/TaskDetailPanel'
import BoardMembersPanel from '../../components/BoardMembersPanel'
import type { ViewMode } from '../../types'
import { CONTENT_TYPE_LABELS } from '../../types'

// ── Color helpers (shared with BoardMembersPanel) ─────────────────────────

const MEMBER_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#06b6d4']

function memberColor(userId: string): string {
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length]
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

// ── BoardMemberAvatars ─────────────────────────────────────────────────────

interface AvatarMember {
  user_id: string
  full_name: string
  email: string
  role: string
  added_at: string
}

interface BoardMemberAvatarsProps {
  boardId: string
  boardName: string
  isAdmin: boolean
  currentUserId: string
  currentUserName: string
}

function BoardMemberAvatars({ boardId, boardName, isAdmin, currentUserId, currentUserName }: BoardMemberAvatarsProps) {
  const [members, setMembers] = useState<AvatarMember[]>([])
  const [showPanel, setShowPanel] = useState(false)
  const { isRoot, can, localUser } = useAuth()
  // STRICT membership of THIS board, by email (the cloud board_members key),
  // derived from the already-loaded member list — no extra IPC. Only a real
  // board_members row counts (root adds via isRoot, below).
  const myEmail = localUser?.email?.toLowerCase()
  const isMemberOfThisBoard = !!myEmail && members.some(m => m.email.toLowerCase() === myEmail)
  // Reacts to permsVersion: AuthContext rebuilds `can` on every permissions
  // refresh, re-rendering this consumer, so a live grant/revoke shows/hides the
  // add control without a reload.
  const canAddMembers = isRoot || (can('add_board_members') && isMemberOfThisBoard)

  const loadMembers = useCallback(() => {
    window.api.boardMembers.list(boardId).then(setMembers).catch(() => {})
  }, [boardId])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  const shown = members.slice(0, 5)
  const overflow = members.length - 5

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Overlapping avatars */}
        <div
          className="flex items-center cursor-pointer"
          onClick={() => setShowPanel(true)}
          title="Board members"
        >
          {shown.map((m, i) => {
            const name = m.full_name || m.email
            return (
              <div
                key={m.user_id}
                className="w-6 h-6 rounded-full border-2 border-white dark:border-[#1a2233] flex items-center justify-center text-white text-[9px] font-bold select-none"
                style={{
                  backgroundColor: memberColor(m.user_id),
                  marginLeft: i === 0 ? 0 : -6,
                  zIndex: shown.length - i,
                  position: 'relative',
                }}
                title={name}
              >
                {memberInitials(name)}
              </div>
            )
          })}
          {overflow > 0 && (
            <div
              className="w-6 h-6 rounded-full border-2 border-white dark:border-[#1a2233] bg-gray-300 dark:bg-white/20 flex items-center justify-center text-gray-600 dark:text-white/70 text-[8px] font-bold"
              style={{ marginLeft: -6, position: 'relative', zIndex: 0 }}
            >
              +{overflow}
            </div>
          )}
        </div>

        {/* Add member button (root, or a scoped member of THIS board) */}
        {canAddMembers && (
          <button
            onClick={() => setShowPanel(true)}
            className="titlebar-no-drag w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-white/25 flex items-center justify-center text-gray-400 dark:text-white/40 hover:border-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition"
            title="Manage board members"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {showPanel && (
        <BoardMembersPanel
          boardId={boardId}
          boardName={boardName}
          isAdmin={isAdmin}
          canAddMembers={canAddMembers}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => { setShowPanel(false); loadMembers() }}
        />
      )}
    </>
  )
}

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
  const {
    viewMode, setViewMode, tasks, columns, selectedTask, createTask, selectTask,
    boards, activeBoard, archiveBoard, deleteBoard, duplicateBoard, renameBoard,
    createBoard, setActiveBoardId, archivedBoards, restoreBoard, boardContentVersion, openTask, restoreTask, requestHighlight, refreshTasks, setTasks,
  } = useWorkspace()
  const { localUser, isRoot, can } = useAuth()
  const { online } = useConnection()

  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // ── Access protection ───────────────────────────────────────────────────
  const [accessDenied, setAccessDenied] = useState(false)
  useEffect(() => {
    if (!activeBoard || isRoot) { setAccessDenied(false); return }
    const userId = localUser?.id ?? 'local-admin'
    window.api.boardMembers.check(activeBoard.id, userId).then(({ hasAccess }) => {
      if (hasAccess) { setAccessDenied(false); return }
      // No access to the active board — try to switch to any board this user CAN see.
      window.api.boardMembers.listForUser(userId).then(ids => {
        if (ids.length > 0) { setActiveBoardId(ids[0]); setAccessDenied(false) }
        else {
          // Zero accessible boards on THIS machine. Board memberships live in
          // local SQLite and do NOT sync across devices, so a member set up on
          // another machine can legitimately have no memberships here. Show an
          // inline state and STAY on Workspace — never silently bounce to the
          // dashboard (which previously hid the real reason).
          console.warn('[Workspace] No accessible boards for user', userId,
            '— board_members rows are absent on this device (they are local-only and do not sync). Showing inline access state instead of redirecting.')
          setAccessDenied(true)
        }
      }).catch(err => {
        console.error('[Workspace] boardMembers.listForUser failed:', err)
        setAccessDenied(true)
      })
    }).catch(err => {
      console.error('[Workspace] boardMembers.check failed:', err)
      setAccessDenied(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoard?.id, isRoot])

  // ── New board members modal ─────────────────────────────────────────────
  const [newBoardMembersModal, setNewBoardMembersModal] = useState<{ boardId: string; boardName: string } | null>(null)
  const [allTeamForModal, setAllTeamForModal] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [addingModalMembers, setAddingModalMembers] = useState(false)

  // ── Existing boards setup banner (admin only, one-time) ─────────────────
  const [showSetupBanner, setShowSetupBanner] = useState(false)
  const [setupBoardIndex, setSetupBoardIndex] = useState(0)
  const [setupPanelBoard, setSetupPanelBoard] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (!isRoot || boards.length === 0) return
    const dismissed = localStorage.getItem('boardMembershipSetupDismissed')
    if (dismissed) {
      const until = Number(dismissed)
      if (until > Date.now()) return
    }
    // Check if any board has 0 non-admin members
    Promise.all(boards.map(b =>
      window.api.boardMembers.list(b.id).then(ms => ms.filter(m => m.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()).length)
    )).then(counts => {
      if (counts.some(c => c === 0)) setShowSetupBanner(true)
    }).catch(() => {})
  }, [isRoot, boards])

  // Listen for new board creation event from sidebar
  useEffect(() => {
    function handleNewBoardCreated(e: Event) {
      const detail = (e as CustomEvent<{ id: string; name: string }>).detail
      if (detail && isRoot) {
        openNewBoardMembersModal(detail.id, detail.name)
      }
    }
    window.addEventListener('newBoardCreated', handleNewBoardCreated)
    return () => window.removeEventListener('newBoardCreated', handleNewBoardCreated)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRoot])

  // Completed / marked-for-deletion drawer
  const [showArchivedTasks, setShowArchivedTasks] = useState(false)
  const [drawerHeight, setDrawerHeight] = useState(384)
  const [completedTasks, setCompletedTasks] = useState<import('../../types').Task[]>([])
  const [completedLoading, setCompletedLoading] = useState(false)
  const [markedTasks, setMarkedTasks] = useState<import('../../types').Task[]>([])
  const [markedLoading, setMarkedLoading] = useState(false)
  // In-flight guard for card revive/undelete/delete — prevents multi-fire on slow networks
  const [reviving, setReviving] = useState<Set<string>>(new Set())

  async function loadCompleted() {
    setCompletedLoading(true)
    try {
      const rows = await window.api.workspace.getCompletedTasks() as import('../../types').Task[]
      setCompletedTasks(rows.filter(t => t.board_id === activeBoard?.id))
    } catch {}
    setCompletedLoading(false)
  }

  async function loadMarked() {
    setMarkedLoading(true)
    try {
      const rows = await window.api.workspace.getMarkedForDeletionTasks() as import('../../types').Task[]
      setMarkedTasks(rows.filter(t => t.board_id === activeBoard?.id))
    } catch {}
    setMarkedLoading(false)
  }

  async function handleUndelete(task: import('../../types').Task) {
    if (reviving.has(task.id)) return                       // in-flight guard — no multi-fire
    setReviving(prev => new Set(prev).add(task.id))
    setMarkedTasks(prev => prev.filter(t => t.id !== task.id))  // remove source immediately
    try {
      if ((task.pre_deletion_archived ?? 0) === 0) {
        // Card returns to board — navigate, arm highlight, optimistic insert, persist.
        setActiveBoardId(task.board_id!)
        setShowArchivedTasks(false)
        requestHighlight(task.id)
        // Optimistic insert so the card appears instantly (mirrors markForDeletion/markCompleteNow, inverted)
        setTasks(prev => prev.some(t => t.id === task.id)
          ? prev
          : [...prev, { ...task, archived: 0, deletion_scheduled_at: null }])
        await window.api.workspace.undeleteTask(task.id)
        await refreshTasks()   // single reconciling refetch (see note below)
      } else {
        // Card returns to Completed — just reload that list
        await window.api.workspace.undeleteTask(task.id)
        loadCompleted()
      }
    } finally {
      setReviving(prev => { const n = new Set(prev); n.delete(task.id); return n })
    }
  }

  async function handleAdminMarkForDeletion(task: import('../../types').Task) {
    await window.api.workspace.adminMarkForDeletion(task.id)
    setCompletedTasks(prev => prev.filter(t => t.id !== task.id))
    loadMarked()
  }

  async function handleDeleteNow(task: import('../../types').Task) {
    if (reviving.has(task.id)) return                       // in-flight guard
    const ok = window.confirm(`Permanently delete "${task.title}"? This cannot be undone.`)
    if (!ok) return
    setReviving(prev => new Set(prev).add(task.id))
    setMarkedTasks(prev => prev.filter(t => t.id !== task.id))  // remove source immediately
    try {
      await window.api.workspace.deleteTask(task.id, localUser?.id, localUser?.name)
    } finally {
      setReviving(prev => { const n = new Set(prev); n.delete(task.id); return n })
    }
  }

  async function handleRevive(task: import('../../types').Task) {
    if (reviving.has(task.id)) return                       // in-flight guard — no multi-fire
    const originExists = boards.some(b => b.id === task.board_id)
    if (!originExists) {
      alert('The original board for this card no longer exists. Reviving to a chosen board will be added soon.')
      return
    }
    setReviving(prev => new Set(prev).add(task.id))
    setCompletedTasks(prev => prev.filter(t => t.id !== task.id))  // remove source BEFORE await (part 3)
    try {
      setActiveBoardId(task.board_id!)         // switch board first
      setShowArchivedTasks(false)              // close drawer
      requestHighlight(task.id)                // arm highlight for when card appears in tasks
      // Optimistic insert so the card appears instantly (mirrors markForDeletion/markCompleteNow, inverted)
      setTasks(prev => prev.some(t => t.id === task.id)
        ? prev
        : [...prev, { ...task, archived: 0, deletion_scheduled_at: null }])
      await restoreTask(task.id)               // context restoreTask: archived=0 + single reconciling refetch
    } finally {
      setReviving(prev => { const n = new Set(prev); n.delete(task.id); return n })
    }
  }

  useEffect(() => {
    if (showArchivedTasks) { loadCompleted(); loadMarked() }
  }, [showArchivedTasks, activeBoard?.id, boardContentVersion])

  // Board menu state
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const boardMenuRef = useRef<HTMLDivElement>(null)
  const boardMenuBtnRef = useRef<HTMLButtonElement>(null)
  const boardMenuPortalRef = useRef<HTMLDivElement>(null)
  const [boardMenuPos, setBoardMenuPos] = useState({ top: 0, right: 0 })

  // Rename state
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // Archive confirm state
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

  // Delete confirm state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Board tasks (only tasks from the active board)
  const boardTasks = useMemo(() =>
    activeBoard ? tasks.filter(t => t.board_id === activeBoard.id) : tasks,
  [tasks, activeBoard])

  const searchResults = searchQuery.trim()
    ? tasks.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.client ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  // Close board menu on outside click (exclude the portal dropdown itself)
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node
      const insideBtn    = boardMenuRef.current?.contains(target)
      const insidePortal = boardMenuPortalRef.current?.contains(target)
      if (!insideBtn && !insidePortal) setBoardMenuOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'k': e.preventDefault(); setShowSearch(v => !v); break
          case 'n': e.preventDefault(); {
            const firstCol = columns[0]
            if (firstCol && online) createTask(firstCol.id, { title: 'New deliverable', content_type: 'policy-brief', priority: 'medium' })
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
  }, [columns, createTask, setViewMode, online])

  const inProgress = boardTasks.filter(t =>
    ['col-drafting', 'col-review', 'col-delivery'].includes(t.column_id)
  ).length

  function handleRename() {
    setBoardMenuOpen(false)
    setRenameValue(activeBoard?.name ?? '')
    setRenaming(true)
  }

  async function handleDuplicate() {
    if (!activeBoard) return
    setBoardMenuOpen(false)
    const newName = window.prompt('Name for the duplicated board:', `Copy of ${activeBoard.name}`)
    if (!newName?.trim()) return
    const newId = await duplicateBoard(activeBoard.id, newName.trim())
    setActiveBoardId(newId)
  }

  function handleArchive() {
    setBoardMenuOpen(false)
    setShowArchiveConfirm(true)
  }

  function handleDelete() {
    setBoardMenuOpen(false)
    setShowDeleteConfirm(true)
  }

  async function openNewBoardMembersModal(boardId: string, boardName: string) {
    const team = await window.api.team.list().catch(() => [])
    // Existing members of THIS board — boardMembers.list returns user_id = email
    // (the cloud key). Match by email (lowercased): the id/email mismatch across
    // devices makes id comparison unreliable.
    const members = await window.api.boardMembers.list(boardId).catch(() => [])
    const existingEmails = new Set(members.map(m => String(m.user_id).toLowerCase()))
    // Exclude root (always has access) and anyone already a member of this board.
    setAllTeamForModal(team.filter(m =>
      m.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
      && m.id !== 'local-admin'
      && !existingEmails.has(m.email.toLowerCase())
    ).map(m => ({ id: m.id, full_name: m.full_name, email: m.email })))
    setSelectedMemberIds(new Set())
    setNewBoardMembersModal({ boardId, boardName })
  }

  async function handleAddModalMembers() {
    if (!newBoardMembersModal) return
    setAddingModalMembers(true)
    const adderName = localUser?.name ?? 'Admin'
    for (const uid of selectedMemberIds) {
      await window.api.boardMembers.add(newBoardMembersModal.boardId, uid, adderName).catch(() => {})
    }
    setAddingModalMembers(false)
    setNewBoardMembersModal(null)
    setSelectedMemberIds(new Set())
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Workspace header */}
      <div className="titlebar-drag shrink-0 flex items-center justify-between px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.07] bg-white/60 dark:bg-transparent backdrop-blur-sm">
        <div className="titlebar-no-drag flex flex-col">
          {renaming ? (
            <form onSubmit={async e => {
              e.preventDefault()
              if (renameValue.trim() && activeBoard) {
                await renameBoard(activeBoard.id, renameValue.trim())
                setRenaming(false)
              }
            }}>
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => setRenaming(false)}
                onKeyDown={e => e.key === 'Escape' && setRenaming(false)}
                className="titlebar-no-drag text-base font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-hub-gold focus:outline-none"
              />
            </form>
          ) : (
            <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
              {activeBoard?.name ?? 'Workspace'}
            </h1>
          )}
          <p className="text-[11px] text-gray-400 dark:text-white/50 mt-0.5">
            {boardTasks.length} tasks · {inProgress} in progress · {columns.length} stages
            {' · '}
            <button
              onClick={() => setShowArchivedTasks(v => !v)}
              className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-white/70 transition"
            >
              {showArchivedTasks ? 'Hide completed & deleted' : 'Show completed & deleted'}
            </button>
          </p>
        </div>

        {/* Board member avatars + add button */}
        {activeBoard && (
          <BoardMemberAvatars
            boardId={activeBoard.id}
            boardName={activeBoard.name}
            isAdmin={isRoot}
            currentUserId={localUser?.id ?? 'local-admin'}
            currentUserName={localUser?.name ?? 'Admin'}
          />
        )}

        <div className="titlebar-no-drag flex items-center gap-2">
          {/* View switcher */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-xl p-1">
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

          {/* Three-dot board menu */}
          {activeBoard && (
            <div ref={boardMenuRef}>
              <button
                ref={boardMenuBtnRef}
                onClick={() => {
                  const rect = boardMenuBtnRef.current?.getBoundingClientRect()
                  if (rect) setBoardMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                  setBoardMenuOpen(v => !v)
                }}
                className="titlebar-no-drag p-2 rounded-xl text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition"
                title="Board options"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="3" r="1.2" fill="currentColor"/>
                  <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
                  <circle cx="8" cy="13" r="1.2" fill="currentColor"/>
                </svg>
              </button>
              {boardMenuOpen && createPortal(
                <div
                  ref={boardMenuPortalRef}
                  style={{ position: 'fixed', top: boardMenuPos.top, right: boardMenuPos.right, zIndex: 9999 }}
                  className="w-44 bg-white dark:bg-[#1a2233] border border-gray-200 dark:border-white/[0.1] rounded-xl shadow-xl overflow-hidden"
                >
                  <button onClick={handleRename} className="titlebar-no-drag w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition text-left">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                    Rename
                  </button>
                  <button onClick={handleDuplicate} className="titlebar-no-drag w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition text-left">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 9V2a1 1 0 011-1h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    Duplicate
                  </button>
                  {activeBoard.archived !== 1 && (
                    <button onClick={handleArchive} className="titlebar-no-drag w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition text-left">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="3.5" width="11" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M1 3.5l1.5-2.5h8L12 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M4.5 7h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      Archive
                    </button>
                  )}
                  {isRoot && (
                    <>
                      <div className="mx-3 my-1 border-t border-gray-100 dark:border-white/[0.06]"/>
                      <button onClick={handleDelete} className="titlebar-no-drag w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition text-left">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 3h10M4.5 3V2h4v1M2.5 3l.7 8.5h6.6L10.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Move to Trash
                      </button>
                    </>
                  )}
                </div>,
                document.body
              )}
            </div>
          )}
        </div>
      </div>

      {/* Archived board banner */}
      {activeBoard?.archived === 1 && (
        <div className="shrink-0 flex items-center gap-3 px-5 py-3 bg-amber-500/10 border-b border-amber-500/20">
          <svg width="15" height="15" viewBox="0 0 13 13" fill="none" className="text-amber-500 shrink-0">
            <rect x="1" y="3.5" width="11" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M1 3.5l1.5-2.5h8L12 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M4.5 7h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <p className="text-sm text-amber-700 dark:text-amber-400 flex-1">
            This project is archived. Restore it to make changes.
          </p>
          <button
            onClick={async () => { if (activeBoard) await restoreBoard(activeBoard.id) }}
            className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition shrink-0"
          >
            Restore project
          </button>
          <button
            onClick={async () => {
              if (!activeBoard) return
              const newName = window.prompt('Name for the duplicated board:', `Copy of ${activeBoard.name}`)
              if (!newName?.trim()) return
              const newId = await duplicateBoard(activeBoard.id, newName.trim())
              setActiveBoardId(newId)
            }}
            className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-semibold transition shrink-0"
          >
            Duplicate
          </button>
        </div>
      )}

      {/* Setup banner (admin only, one-time) */}
      {showSetupBanner && isRoot && (
        <div className="shrink-0 flex items-center gap-3 px-5 py-3 bg-indigo-500/10 border-b border-indigo-500/20">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-indigo-500 shrink-0">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p className="text-sm text-indigo-700 dark:text-indigo-300 flex-1">
            Set up board membership for your existing boards to control who sees what.
          </p>
          <button
            onClick={() => {
              setShowSetupBanner(false)
              if (boards.length > 0) {
                setSetupBoardIndex(0)
                setSetupPanelBoard({ id: boards[0].id, name: boards[0].name })
              }
            }}
            className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold transition shrink-0"
          >
            Set up now
          </button>
          <button
            onClick={() => {
              localStorage.setItem('boardMembershipSetupDismissed', String(Date.now() + 24 * 3600 * 1000))
              setShowSetupBanner(false)
            }}
            className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition shrink-0"
          >
            Later
          </button>
        </div>
      )}

      {/* Offline is surfaced by the app-wide banner in Layout (OfflineBanner). */}

      {/* View content */}
      <div className="flex-1 overflow-hidden">
        {(!isRoot && boards.length === 0) ? (
          // Zero visible boards (cloud, membership-scoped). Filter, don't bounce.
          <div className="flex-1 flex items-center justify-center h-full p-6">
            <div className="text-center max-w-md">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">You have not been added to any workspaces yet.</p>
              <p className="text-sm text-gray-400 dark:text-white/50 mt-1">
                Ask an admin or a member of a board to add you, and it will appear here.
              </p>
            </div>
          </div>
        ) : accessDenied ? (
          <div className="flex-1 flex items-center justify-center h-full p-6">
            <div className="text-center max-w-md">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">You don’t have access to this board</p>
              <p className="text-sm text-gray-400 dark:text-white/50 mt-1">
                Ask an admin or an existing member to add you to this board.
              </p>
            </div>
          </div>
        ) : (
          <>
            {viewMode === 'kanban'   && <KanbanView />}
            {viewMode === 'timeline' && <TimelineView />}
            {viewMode === 'list'     && <ListView />}
            {viewMode === 'calendar' && <CalendarView />}
          </>
        )}
      </div>

      {/* Completed & marked-for-deletion drawer */}
      {showArchivedTasks && (
        <div className="shrink-0 border-t border-gray-200 dark:border-white/[0.08] bg-white/60 dark:bg-black/20 overflow-y-auto" style={{ height: drawerHeight }}>
          <div
            className="shrink-0 h-1.5 cursor-ns-resize hover:bg-indigo-400/30 transition"
            onMouseDown={(e) => {
              e.preventDefault()
              const startY = e.clientY
              const startH = drawerHeight
              const onMove = (ev: MouseEvent) => {
                const next = startH - (ev.clientY - startY)
                const clamped = Math.max(120, Math.min(next, window.innerHeight * 0.7))
                setDrawerHeight(clamped)
              }
              const onUp = () => {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
              }
              document.addEventListener('mousemove', onMove)
              document.addEventListener('mouseup', onUp)
            }}
          />
          <div className="px-5 py-3 flex items-center justify-between sticky top-0 bg-white/90 dark:bg-[#1a2233]/90 backdrop-blur-sm border-b border-gray-100 dark:border-white/[0.06]">
            <p className="text-xs font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">
              Completed &amp; deleted
            </p>
            <button onClick={() => setShowArchivedTasks(false)} className="titlebar-no-drag text-gray-400 hover:text-gray-600 dark:hover:text-white/60 transition">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>

          {/* ── Completed group ───────────────────────────────────────── */}
          <div className="px-5 pt-3 pb-1">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-white/35 uppercase tracking-wider mb-1">
              Completed {completedTasks.length > 0 ? `(${completedTasks.length})` : ''}
            </p>
          </div>
          {completedLoading ? (
            <p className="text-xs text-gray-400 dark:text-white/50 text-center py-3">Loading…</p>
          ) : completedTasks.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-white/40 px-5 pb-3">No completed projects in this board.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-white/[0.05] mb-1">
              {completedTasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-2.5 group hover:bg-gray-50 dark:hover:bg-white/[0.04] transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-600 dark:text-white/65 truncate">{task.title}</p>
                    {task.client && <p className="text-xs text-gray-400 dark:text-white/40 truncate">{task.client}</p>}
                  </div>
                  <button
                    onClick={() => handleRevive(task)}
                    disabled={reviving.has(task.id)}
                    className="titlebar-no-drag opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 text-xs font-medium transition disabled:opacity-40 disabled:cursor-default"
                  >
                    Revive
                  </button>
                  {isRoot && (
                    <button
                      onClick={() => handleAdminMarkForDeletion(task)}
                      className="titlebar-no-drag opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium transition"
                    >
                      Mark for deletion
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Marked for deletion group ─────────────────────────────── */}
          <div className="px-5 pt-2 pb-1 border-t border-gray-100 dark:border-white/[0.05]">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-white/35 uppercase tracking-wider mb-1">
              Marked for deletion {markedTasks.length > 0 ? `(${markedTasks.length})` : ''}
            </p>
          </div>
          {markedLoading ? (
            <p className="text-xs text-gray-400 dark:text-white/50 text-center py-3">Loading…</p>
          ) : markedTasks.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-white/40 px-5 pb-3">Nothing marked for deletion.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {markedTasks.map(t => {
                const daysLeft = Math.max(0, Math.ceil((new Date(t.deletion_scheduled_at as string).getTime() - Date.now()) / 86400000))
                return (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-2.5 group hover:bg-gray-50 dark:hover:bg-white/[0.04] transition">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-600 dark:text-white/65 truncate">{t.title}</p>
                      {t.client && <p className="text-xs text-gray-400 dark:text-white/40 truncate">{t.client}</p>}
                    </div>
                    <span className="text-xs text-amber-500/70 dark:text-amber-400/60 shrink-0 mr-2">Deletes in {daysLeft}d</span>
                    <button
                      onClick={() => handleUndelete(t)}
                      disabled={reviving.has(t.id)}
                      className="titlebar-no-drag opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 text-xs font-medium transition disabled:opacity-40 disabled:cursor-default"
                    >
                      Undelete
                    </button>
                    {isRoot && (
                      <button
                        onClick={() => handleDeleteNow(t)}
                        disabled={reviving.has(t.id)}
                        className="titlebar-no-drag opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium transition disabled:opacity-40 disabled:cursor-default"
                      >
                        Delete permanently
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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

      {/* Archive confirmation dialog */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowArchiveConfirm(false)}>
          <div className="bg-white dark:bg-[#1a2233] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-200 dark:border-white/[0.1]" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">Archive this project?</h2>
            <p className="text-sm text-gray-500 dark:text-white/65 mb-5 leading-relaxed">
              It will be hidden from the workspace but all data, tasks, and files will be preserved. You can restore it at any time.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button onClick={() => setShowArchiveConfirm(false)} className="titlebar-no-drag px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/[0.08] text-gray-700 dark:text-white/75 text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/[0.13] transition">Cancel</button>
              <button onClick={async () => {
                if (!activeBoard) return
                const by = localUser?.name ?? localUser?.email ?? 'Admin'
                await archiveBoard(activeBoard.id, by)
                setShowArchiveConfirm(false)
              }} className="titlebar-no-drag px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition">Archive</button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Trash confirmation dialog (admin only) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-[#1a2233] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-200 dark:border-white/[0.1]" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">Move "{activeBoard?.name}" to Trash?</h2>
            <p className="text-sm text-gray-500 dark:text-white/65 mb-5 leading-relaxed">
              This board will be moved to Trash. You can restore it, or delete it permanently from Trash later.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="titlebar-no-drag px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/[0.08] text-gray-700 dark:text-white/75 text-sm font-medium transition">Cancel</button>
              <button
                onClick={async () => {
                  if (!activeBoard) return
                  await deleteBoard(activeBoard.id)
                  setShowDeleteConfirm(false)
                }}
                className="titlebar-no-drag px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition">
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup wizard panel (admin — walks through each board) */}
      {setupPanelBoard && (
        <BoardMembersPanel
          boardId={setupPanelBoard.id}
          boardName={setupPanelBoard.name}
          isAdmin={true}
          canAddMembers={true}
          currentUserId={localUser?.id ?? 'local-admin'}
          currentUserName={localUser?.name ?? 'Admin'}
          onClose={() => {
            const nextIndex = setupBoardIndex + 1
            if (nextIndex < boards.length) {
              setSetupBoardIndex(nextIndex)
              setSetupPanelBoard({ id: boards[nextIndex].id, name: boards[nextIndex].name })
            } else {
              setSetupPanelBoard(null)
            }
          }}
        />
      )}

      {/* New board members modal */}
      {newBoardMembersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setNewBoardMembersModal(null)}>
          <div className="bg-white dark:bg-[#1a2233] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-200 dark:border-white/[0.1]" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">
              Who should have access to "{newBoardMembersModal.boardName}"?
            </h2>
            <p className="text-xs text-gray-400 dark:text-white/50 mb-4">Select team members to grant access to this board.</p>

            {allTeamForModal.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-white/50 py-4 text-center">No team members to add.</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto mb-4">
                {allTeamForModal.map(m => {
                  const name = m.full_name || m.email
                  const checked = selectedMemberIds.has(m.id)
                  return (
                    <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] cursor-pointer transition">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedMemberIds(prev => {
                            const next = new Set(prev)
                            if (checked) next.delete(m.id)
                            else next.add(m.id)
                            return next
                          })
                        }}
                        className="titlebar-no-drag w-4 h-4 rounded accent-indigo-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white/85 truncate">{name}</p>
                        <p className="text-xs text-gray-400 dark:text-white/45 truncate">{m.email}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setNewBoardMembersModal(null)}
                className="titlebar-no-drag text-xs text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/70 underline transition"
              >
                Skip for now
              </button>
              <div className="flex gap-2">
                <button onClick={() => setNewBoardMembersModal(null)} className="titlebar-no-drag px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/[0.08] text-gray-700 dark:text-white/75 text-sm font-medium transition">
                  Cancel
                </button>
                <button
                  onClick={handleAddModalMembers}
                  disabled={addingModalMembers || selectedMemberIds.size === 0}
                  className="titlebar-no-drag px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-semibold transition"
                >
                  {addingModalMembers ? 'Adding…' : `Add ${selectedMemberIds.size > 0 ? selectedMemberIds.size : ''} member${selectedMemberIds.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
