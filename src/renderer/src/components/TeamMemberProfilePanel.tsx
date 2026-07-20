import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { isAssignedTo } from '../utils/assignees'
import { useAuth } from '../contexts/AuthContext'

const AVATAR_PALETTE = ['#ef4444','#f59e0b','#22c55e','#3b82f6','#a855f7','#06b6d4','#ec4899','#8b5cf6']
function nameColor(name: string): string {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase()
}
function fmtDate(iso: string | null): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const hours = diff / 3600000
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${Math.floor(hours)}h ago`
  if (hours < 168) return `${Math.floor(hours/24)}d ago`
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
}
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' })
}

const STAGE_NAMES: Record<string,string> = {
  'col-scoping':'Scoping','col-research':'Research','col-drafting':'Drafting',
  'col-review':'Review','col-delivery':'Delivery','col-published':'Published'
}
const PRIORITY_COLOR: Record<string,string> = {
  low:'text-gray-400',medium:'text-blue-400',high:'text-amber-400',urgent:'text-red-400'
}

interface Props {
  memberId: string
  onClose: () => void
  showSendMessage?: boolean
}

export default function TeamMemberProfilePanel({ memberId, onClose, showSendMessage = false }: Props) {
  const navigate = useNavigate()
  const { tasks, setActiveBoardId, openTask, boards } = useWorkspace()
  const { localUser, isRoot } = useAuth()

  const [member, setMember] = useState<LocalTeamMember | null>(null)
  const [activity, setActivity] = useState<{id:string; task_id:string; actor_name:string; action:string; created_at:string; source:'activity'|'comment'; task_title:string|null}[]>([])
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    window.api.team.list().then(list => {
      const m = list.find(m => m.id === memberId)
      setMember(m ?? null)
    }).catch(() => {})
  }, [memberId])

  // Reload activity when member loads
  useEffect(() => {
    if (!member) return
    window.api.activity.getFeed().then(feed => {
      const name = member.full_name ?? member.email
      const memberFeed = feed.filter(e => e.actor_name === name || e.actor_name === member.full_name?.split(' ')[0]).slice(0, 10)
      setActivity(memberFeed)
    }).catch(() => {})
  }, [member])

  // Compute stats from tasks
  const memberTasks = tasks.filter(t => {
    // Assignments are email-keyed as of 1c-2b-①; memberId is a local_users.id, so
    // match on the member's email instead — the id would never appear in the array.
    return isAssignedTo(t.assignee_emails ?? [], member?.email)
  })

  const activeTasks = memberTasks.filter(t => t.column_id !== 'col-published')
  const completedThisWeek = memberTasks.filter(t => {
    const completed = (t as any).completed_at
    if (!completed) return false
    const d = new Date(completed)
    const weekAgo = new Date(Date.now() - 7 * 86400000)
    return d >= weekAgo
  }).length
  const overdueTasks = activeTasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length

  // Tasks grouped by stage
  const tasksByStage: Record<string, typeof activeTasks> = {}
  for (const t of activeTasks) {
    if (!tasksByStage[t.column_id]) tasksByStage[t.column_id] = []
    tasksByStage[t.column_id].push(t)
  }

  // Boards this member is on
  const memberBoardIds = new Set(activeTasks.map(t => t.board_id))
  const memberBoards = boards.filter(b => memberBoardIds.has(b.id))

  async function handleRemove() {
    if (!member) return
    setRemoving(true)
    await window.api.team.remove(member.id)
    setRemoving(false)
    onClose()
  }

  function navigateToTask(task: { id: string; board_id?: string }) {
    if (task.board_id) setActiveBoardId(task.board_id)
    navigate('/workspace')
    setTimeout(() => openTask(task.id), 150)
    onClose()
  }

  if (!member) return null

  const name = member.full_name ?? member.email
  const color = nameColor(name)

  const panel = (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 z-50 w-96 bg-white dark:bg-[#1a2233] border-l border-gray-200 dark:border-white/[0.08] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 py-5 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-base font-bold shrink-0" style={{ backgroundColor: color }}>
                {initials(name)}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{name}</p>
                <p className="text-xs text-gray-400 dark:text-white/50">{member.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${member.role === 'admin' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-gray-100 dark:bg-white/[0.06] border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-white/55'}`}>
                    {member.role === 'admin' ? 'Admin' : 'Member'}
                  </span>
                  {member.last_active && (
                    <span className="text-[10px] text-gray-400 dark:text-white/40">Active {fmtDate(member.last_active)}</span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="titlebar-no-drag p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.08] transition">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { navigate('/team'); onClose() }} className="titlebar-no-drag flex-1 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-xs font-medium text-gray-600 dark:text-white/65 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition">
              View on Team page
            </button>
            {showSendMessage && (
              <button onClick={() => { navigate('/inbox'); onClose() }} className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition">
                Send message
              </button>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 p-4 border-b border-gray-100 dark:border-white/[0.06]">
            {[
              { label: 'Done this week', value: completedThisWeek },
              { label: 'Active tasks', value: activeTasks.length },
              { label: 'Overdue', value: overdueTasks },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 dark:bg-white/[0.04] rounded-xl p-2.5 text-center">
                <p className={`text-xl font-bold tabular-nums ${s.label === 'Overdue' && s.value > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>{s.value}</p>
                <p className="text-[9px] text-gray-400 dark:text-white/40 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Assigned Boards */}
          {memberBoards.length > 0 && (
            <div className="p-4 border-b border-gray-100 dark:border-white/[0.06]">
              <h3 className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2">Assigned Boards</h3>
              <div className="space-y-1">
                {memberBoards.map(b => {
                  const boardTaskCount = activeTasks.filter(t => t.board_id === b.id).length
                  return (
                    <button
                      key={b.id}
                      onClick={() => { setActiveBoardId(b.id); navigate('/workspace'); onClose() }}
                      className="titlebar-no-drag w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] transition text-left"
                    >
                      <span className="text-xs font-medium text-gray-700 dark:text-white/80 truncate">{b.name}</span>
                      <span className="text-[10px] text-gray-400 dark:text-white/40 shrink-0 ml-2">{boardTaskCount} task{boardTaskCount !== 1 ? 's' : ''}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Active Tasks by stage */}
          {activeTasks.length > 0 && (
            <div className="p-4 border-b border-gray-100 dark:border-white/[0.06]">
              <h3 className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2">Active Tasks</h3>
              {Object.entries(tasksByStage).map(([stageId, stageTasks]) => (
                <div key={stageId} className="mb-2">
                  <p className="text-[10px] font-semibold text-gray-300 dark:text-white/30 uppercase mb-1">{STAGE_NAMES[stageId] ?? stageId}</p>
                  {stageTasks.map(t => (
                    <button
                      key={t.id}
                      onClick={() => navigateToTask(t)}
                      className="titlebar-no-drag w-full flex items-start gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] transition text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 dark:text-white/80 truncate">{t.title}</p>
                        {t.due_date && (
                          <p className={`text-[10px] mt-0.5 ${new Date(t.due_date) < new Date() ? 'text-red-400' : 'text-gray-400 dark:text-white/40'}`}>
                            Due {new Date(t.due_date).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] font-medium shrink-0 ${PRIORITY_COLOR[t.priority] ?? 'text-gray-400'}`}>{t.priority}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Latest Activity */}
          {activity.length > 0 && (
            <div className="p-4 border-b border-gray-100 dark:border-white/[0.06]">
              <h3 className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2">Latest Activity</h3>
              <div className="space-y-1">
                {activity.map(e => (
                  <button
                    key={e.id}
                    onClick={() => {
                      if (e.task_id) {
                        navigate('/workspace')
                        setTimeout(() => openTask(e.task_id, e.source === 'comment' ? 'comments' : undefined), 150)
                        onClose()
                      }
                    }}
                    className="titlebar-no-drag w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                  >
                    <p className="text-xs text-gray-700 dark:text-white/75 truncate">
                      {e.source === 'comment' ? '💬 commented on ' : '🔄 '}
                      <span className="font-medium">{e.task_title ?? 'a task'}</span>
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-white/40 mt-0.5">{relTime(e.created_at)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Remove from team — admin only, not self */}
          {isRoot && member.id !== localUser?.id && (
            <div className="p-4">
              {confirmRemove ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 dark:text-white/65">Remove <span className="font-semibold">{name}</span> from the team?</p>
                  <div className="flex gap-2">
                    <button onClick={handleRemove} disabled={removing} className="titlebar-no-drag flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition disabled:opacity-50">
                      {removing ? 'Removing…' : 'Remove'}
                    </button>
                    <button onClick={() => setConfirmRemove(false)} className="titlebar-no-drag px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/[0.08] text-gray-600 dark:text-white/65 text-xs transition">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmRemove(true)} className="titlebar-no-drag w-full py-2 rounded-xl border border-red-200 dark:border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                  Remove from team
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(panel, document.body)
}
