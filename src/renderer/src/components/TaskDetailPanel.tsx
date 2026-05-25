import { useState, useEffect, useRef, useCallback } from 'react'
import type {
  Task, ContentType, Priority, AreaOfAnalysis,
  Source, TaskComment, ActivityEntry,
} from '../types'
import {
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_COLORS,
} from '../types'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useAuth } from '../contexts/AuthContext'
import RichTextEditor from './RichTextEditor'
import ClaudeAISidebar from './ClaudeAISidebar'

// ── Constants ──────────────────────────────────────────────────────────────

const CONTENT_TYPES: ContentType[] = [
  'policy-brief', 'research-report', 'op-ed',
  'briefing-note', 'consulting-engagement', 'client-advisory',
]
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

// ── Small helpers ──────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-semibold text-gray-400 dark:text-white/55 uppercase tracking-widest mb-1.5">
      {title}
    </p>
  )
}

function initials(name: string) {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Main component ─────────────────────────────────────────────────────────

export default function TaskDetailPanel() {
  const { selectedTask, selectTask, updateTask, deleteTask, columns, members, areas, labels, refreshTaskMeta, pendingSection, setPendingSection } = useWorkspace()
  const { localUser } = useAuth()
  const currentUserId   = localUser?.id   ?? 'local-admin'
  const currentUserName = localUser?.name ?? 'Dorian Kantor'
  const isAdminUser     = localUser?.role === 'admin'

  // Editing state — overrides selected task fields until saved
  const [editing, setEditing] = useState<Partial<Task>>({})

  // Claude sidebar
  const [claudeOpen, setClaudeOpen] = useState(false)

  // Comments
  const [comments, setComments]       = useState<TaskComment[]>([])
  const [newComment, setNewComment]   = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [editingCommentId, setEditingCommentId]       = useState<string | null>(null)
  const [editingCommentContent, setEditingCommentContent] = useState('')

  // Activity
  const [activity, setActivity] = useState<ActivityEntry[]>([])

  // Sources (parsed from task.sources_json)
  const [sources, setSources]           = useState<Source[]>([])
  const [showAddSource, setShowAddSource] = useState(false)
  const [newSrc, setNewSrc] = useState<{
    type: 'url' | 'reference' | 'file'
    title: string; url: string; note: string
  }>({ type: 'url', title: '', url: '', note: '' })

  // Attachments — persisted to SQLite
  const [attachments, setAttachments]   = useState<TaskAttachment[]>([])
  const [showAddAttUrl, setShowAddAttUrl] = useState(false)
  const [newAttName, setNewAttName]       = useState('')
  const [newAttUrl, setNewAttUrl]         = useState('')
  const [attLoading, setAttLoading]       = useState(false)

  // Checklists
  const [checklists, setChecklists]       = useState<Checklist[]>([])
  const [showAddChecklist, setShowAddChecklist] = useState(false)
  const [newChecklistTitle, setNewChecklistTitle] = useState('Checklist')
  const [newItemText, setNewItemText]     = useState<Record<string, string>>({})

  // Labels
  const [taskLabels, setTaskLabels]       = useState<Label[]>([])
  const [showLabelPicker, setShowLabelPicker] = useState(false)

  // @mention state
  const [mentionQuery, setMentionQuery]   = useState('')
  const [showMentions, setShowMentions]   = useState(false)
  const [mentionIndex, setMentionIndex]   = useState(0)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  const mentionResults = members.filter(m =>
    (m.full_name ?? m.email).toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 5)

  const titleRef        = useRef<HTMLInputElement>(null)
  const panelBodyRef    = useRef<HTMLDivElement>(null)
  const rightPanelRef   = useRef<HTMLDivElement>(null)
  const sectionRefs: Record<string, React.RefObject<HTMLDivElement>> = {
    stage:       useRef<HTMLDivElement>(null),
    dates:       useRef<HTMLDivElement>(null),
    members:     useRef<HTMLDivElement>(null),
    comments:    useRef<HTMLDivElement>(null),
    attachments: useRef<HTMLDivElement>(null),
  }

  const loadAttachments = useCallback(async (taskId: string) => {
    try { setAttachments(await window.api.attachments.get(taskId)) } catch {}
  }, [])

  const loadChecklists = useCallback(async (taskId: string) => {
    try { setChecklists(await window.api.checklists.get(taskId)) } catch {}
  }, [])

  const loadTaskLabels = useCallback(async (taskId: string) => {
    try { setTaskLabels(await window.api.taskLabels.get(taskId)) } catch {}
  }, [])

  // Reset all local state when the selected task changes
  useEffect(() => {
    if (!selectedTask) return
    setEditing({})
    setClaudeOpen(false)
    setComments([])
    setActivity([])
    setNewComment('')
    setAddingComment(false)
    setEditingCommentId(null)
    setSources(selectedTask.sources_json ? (JSON.parse(selectedTask.sources_json) as Source[]) : [])
    setAttachments([])
    setShowAddAttUrl(false)
    setNewAttName('')
    setNewAttUrl('')
    setChecklists([])
    setShowAddChecklist(false)
    setTaskLabels([])
    setShowLabelPicker(false)
    setShowAddSource(false)

    window.api.comments.get(selectedTask.id).then(data => setComments(data))
    window.api.activity.get(selectedTask.id).then(data => setActivity(data))
    loadAttachments(selectedTask.id)
    loadChecklists(selectedTask.id)
    loadTaskLabels(selectedTask.id)
  }, [selectedTask?.id])

  // Scroll to pending section when panel opens from inbox navigation
  useEffect(() => {
    if (!pendingSection || !selectedTask) return
    const ref = sectionRefs[pendingSection]
    // Comments section is in the right panel now
    if (pendingSection === 'comments') {
      if (!rightPanelRef?.current) return
      const t = setTimeout(() => {
        rightPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        setPendingSection(null)
      }, 150)
      return () => clearTimeout(t)
    }
    if (!ref?.current) return
    // Small delay to let layout settle
    const t = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setPendingSection(null)
    }, 150)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSection, selectedTask?.id])

  if (!selectedTask) return null

  // ── Field helpers ────────────────────────────────────────────────────────

  function field<K extends keyof Task>(key: K): Task[K] {
    return (editing[key] !== undefined ? editing[key] : selectedTask[key]) as Task[K]
  }

  function set<K extends keyof Task>(key: K, value: Task[K]) {
    setEditing(prev => ({ ...prev, [key]: value }))
  }

  const isDirty = Object.keys(editing).length > 0

  async function handleSave() {
    if (!isDirty) return
    await updateTask(selectedTask.id, editing)
    setEditing({})
  }

  async function handleDelete() {
    if (!confirm('Delete this engagement? This cannot be undone.')) return
    await deleteTask(selectedTask.id)
  }

  // ── Sources ──────────────────────────────────────────────────────────────

  async function persistSources(updated: Source[]) {
    setSources(updated)
    await updateTask(selectedTask.id, { sources_json: JSON.stringify(updated) })
  }

  async function handleAddSource() {
    if (!newSrc.title.trim()) return
    const src: Source = {
      id: crypto.randomUUID(),
      type: newSrc.type,
      title: newSrc.title.trim(),
      url: newSrc.url.trim() || null,
      note: newSrc.note.trim() || null,
      added_at: new Date().toISOString(),
    }
    await persistSources([...sources, src])
    setNewSrc({ type: 'url', title: '', url: '', note: '' })
    setShowAddSource(false)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async function handleAddComment() {
    if (!newComment.trim()) return
    const comment = await window.api.comments.add({
      task_id: selectedTask.id,
      author_id: currentUserId,
      author_name: currentUserName,
      content: newComment.trim(),
      task_title: selectedTask.title,
      assignee_ids: selectedTask.assignee_ids ?? [],
    })
    setComments(prev => [...prev, comment])
    const entry = await window.api.activity.add({
      task_id: selectedTask.id,
      actor_name: currentUserName,
      action: 'added a comment',
    })
    setActivity(prev => [...prev, entry])
    setNewComment('')
    setAddingComment(false)
    refreshTaskMeta(selectedTask.id)
  }

  async function handleDeleteComment(id: string) {
    await window.api.comments.delete(id)
    setComments(prev => prev.filter(c => c.id !== id))
    refreshTaskMeta(selectedTask.id)
  }

  async function handleSaveCommentEdit(id: string) {
    if (!editingCommentContent.trim()) return
    await window.api.comments.update(id, editingCommentContent.trim())
    setComments(prev => prev.map(c => c.id === id ? { ...c, content: editingCommentContent.trim() } : c))
    setEditingCommentId(null)
    setEditingCommentContent('')
  }

  // ── Attachments ───────────────────────────────────────────────────────────

  async function handleAddFile() {
    setAttLoading(true)
    try {
      const result = await window.api.attachments.addFile(selectedTask.id, currentUserId, currentUserName)
      if (!result.canceled) {
        await loadAttachments(selectedTask.id)
        refreshTaskMeta(selectedTask.id)
      }
    } finally { setAttLoading(false) }
  }

  async function handleAddAttUrl() {
    const url = newAttUrl.trim()
    if (!url) return
    const type = url.includes('docs.google.com') ? 'gdoc' : 'url'
    await window.api.attachments.addUrl(selectedTask.id, newAttName || url, url, type, currentUserId, currentUserName)
    await loadAttachments(selectedTask.id)
    refreshTaskMeta(selectedTask.id)
    setNewAttName('')
    setNewAttUrl('')
    setShowAddAttUrl(false)
  }

  async function handleDeleteAttachment(id: string) {
    await window.api.attachments.delete(id)
    setAttachments(prev => prev.filter(a => a.id !== id))
    refreshTaskMeta(selectedTask.id)
  }

  // ── Checklists ────────────────────────────────────────────────────────────

  async function handleCreateChecklist() {
    if (!newChecklistTitle.trim()) return
    await window.api.checklists.create(selectedTask.id, newChecklistTitle.trim())
    await loadChecklists(selectedTask.id)
    setNewChecklistTitle('Checklist')
    setShowAddChecklist(false)
    refreshTaskMeta(selectedTask.id)
  }

  async function handleDeleteChecklist(checklistId: string) {
    await window.api.checklists.delete(checklistId)
    setChecklists(prev => prev.filter(cl => cl.id !== checklistId))
    refreshTaskMeta(selectedTask.id)
  }

  async function handleAddChecklistItem(checklistId: string) {
    const text = newItemText[checklistId]?.trim()
    if (!text) return
    await window.api.checklistItems.add(checklistId, selectedTask.id, text)
    await loadChecklists(selectedTask.id)
    setNewItemText(prev => ({ ...prev, [checklistId]: '' }))
    refreshTaskMeta(selectedTask.id)
  }

  async function handleToggleItem(itemId: string, checked: boolean) {
    await window.api.checklistItems.toggle(itemId, !checked)
    setChecklists(prev => prev.map(cl => ({
      ...cl,
      items: cl.items.map(i => i.id === itemId ? { ...i, checked: checked ? 0 : 1 } : i)
    })))
    refreshTaskMeta(selectedTask.id)
  }

  async function handleDeleteItem(itemId: string) {
    await window.api.checklistItems.delete(itemId)
    setChecklists(prev => prev.map(cl => ({
      ...cl,
      items: cl.items.filter(i => i.id !== itemId)
    })))
    refreshTaskMeta(selectedTask.id)
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  async function handleToggleLabel(labelId: string) {
    const isSelected = taskLabels.some(l => l.id === labelId)
    const newIds = isSelected
      ? taskLabels.filter(l => l.id !== labelId).map(l => l.id)
      : [...taskLabels.map(l => l.id), labelId]
    await window.api.taskLabels.set(selectedTask.id, newIds)
    await loadTaskLabels(selectedTask.id)
    refreshTaskMeta(selectedTask.id)
  }

  // ── Assignees ────────────────────────────────────────────────────────────

  const assigneeIds: string[] = (field('assignee_ids') as string[] | null) ?? []

  function toggleAssignee(memberId: string) {
    const isAdding = !assigneeIds.includes(memberId)
    const updated = isAdding
      ? [...assigneeIds, memberId]
      : assigneeIds.filter(id => id !== memberId)
    set('assignee_ids', updated)
    updateTask(selectedTask.id, { assignee_ids: updated })
    // Notify newly assigned member
    if (isAdding && memberId !== currentUserId) {
      window.api.notifications.create({
        user_id: memberId, type: 'assignment',
        title: `${currentUserName} assigned you to "${selectedTask.title}"`,
        task_id: selectedTask.id, task_title: selectedTask.title,
        actor_name: currentUserName,
      }).catch(() => {})
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const area = field('area_of_analysis')
  const isOverdue =
    !!field('due_date') &&
    new Date(field('due_date')!) < new Date() &&
    field('column_id') !== 'col-published'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        onClick={() => { if (isDirty) handleSave(); selectTask(null) }}
      />

      {/* Panel wrapper — expands left when Claude is open */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex"
        style={{ width: claudeOpen ? 1200 : 760, transition: 'width 0.25s ease' }}
      >
        {/* Claude sidebar — left portion */}
        {claudeOpen && (
          <div className="w-[440px] shrink-0 border-r border-gray-200 dark:border-white/[0.06]">
            <ClaudeAISidebar task={selectedTask} onClose={() => setClaudeOpen(false)} />
          </div>
        )}

        {/* Task detail — two-column layout (always 760 px) */}
        <div className="w-[760px] shrink-0 flex flex-col bg-white dark:bg-[#111827] border-l border-gray-200 dark:border-white/[0.08] shadow-2xl overflow-hidden">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-white/[0.08] shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1 mr-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${CONTENT_TYPE_COLORS[field('content_type')]}`}>
                {CONTENT_TYPE_LABELS[field('content_type')]}
              </span>
              {area && (() => {
                const areaObj = areas.find(a => a.id === area)
                return areaObj ? (
                  <span
                    style={{ color: areaObj.color, borderColor: areaObj.color + '40', backgroundColor: areaObj.color + '18' }}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border"
                  >
                    {areaObj.name}
                  </span>
                ) : null
              })()}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Ask Claude toggle */}
              <button
                onClick={() => setClaudeOpen(v => !v)}
                className={`titlebar-no-drag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                  claudeOpen
                    ? 'bg-hub-gold/20 text-hub-gold border-hub-gold/40'
                    : 'bg-gray-50 dark:bg-white/[0.05] text-gray-500 dark:text-white/55 border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.09] hover:text-gray-700 dark:hover:text-white/85'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-hub-gold/20 border border-hub-gold/30 flex items-center justify-center shrink-0">
                  <span className="text-hub-gold text-[8px] font-bold">K</span>
                </div>
                Ask Claude
              </button>

              {isDirty && (
                <button
                  onClick={handleSave}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs font-semibold bg-hub-gold text-white hover:bg-hub-gold-light transition"
                >
                  Save
                </button>
              )}

              <button
                onClick={() => { if (isDirty) handleSave(); selectTask(null) }}
                className="titlebar-no-drag p-1.5 rounded-lg text-gray-400 dark:text-white/65 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.07] transition"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Two-column body ──────────────────────────────────────────── */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* ── LEFT column (scrollable) ─────────────────────────────── */}
            <div ref={panelBodyRef} className="flex-1 overflow-y-auto border-r border-gray-100 dark:border-white/[0.06]">
              <div className="p-5 space-y-6">

                {/* Title */}
                <input
                  ref={titleRef}
                  value={field('title')}
                  onChange={e => set('title', e.target.value)}
                  onBlur={handleSave}
                  className="titlebar-no-drag w-full bg-transparent text-xl font-bold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 border-b border-transparent hover:border-gray-200 dark:hover:border-white/10 focus:border-hub-gold/50 outline-none pb-1 transition"
                  placeholder="Engagement title"
                />

                {/* Meta grid */}
                <div ref={sectionRefs.stage} className="grid grid-cols-2 gap-3">
                  {/* Stage */}
                  <div>
                    <SectionLabel title="Stage" />
                    <select
                      value={field('column_id')}
                      onChange={e => {
                        const newColId = e.target.value
                        set('column_id', newColId)
                        updateTask(selectedTask.id, { column_id: newColId })
                        // Notify assignees of stage change
                        const newColName = columns.find(c => c.id === newColId)?.name ?? newColId
                        const assignees = (field('assignee_ids') as string[] | null) ?? []
                        for (const uid of assignees) {
                          if (uid === currentUserId) continue
                          window.api.notifications.create({
                            user_id: uid, type: 'stage_change',
                            title: `"${selectedTask.title}" moved to ${newColName}`,
                            task_id: selectedTask.id, task_title: selectedTask.title,
                            actor_name: currentUserName,
                          }).catch(() => {})
                        }
                      }}
                      className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
                    >
                      {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <SectionLabel title="Priority" />
                    <select
                      value={field('priority')}
                      onChange={e => {
                        set('priority', e.target.value as Priority)
                        updateTask(selectedTask.id, { priority: e.target.value as Priority })
                      }}
                      className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
                    >
                      {PRIORITIES.map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Deliverable type */}
                  <div>
                    <SectionLabel title="Deliverable Type" />
                    <select
                      value={field('content_type')}
                      onChange={e => {
                        set('content_type', e.target.value as ContentType)
                        updateTask(selectedTask.id, { content_type: e.target.value as ContentType })
                      }}
                      className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
                    >
                      {CONTENT_TYPES.map(t => (
                        <option key={t} value={t}>{CONTENT_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Area of analysis */}
                  <div>
                    <SectionLabel title="Area of Analysis" />
                    <select
                      value={field('area_of_analysis') ?? ''}
                      onChange={e => {
                        const v = (e.target.value || null) as AreaOfAnalysis | null
                        set('area_of_analysis', v)
                        updateTask(selectedTask.id, { area_of_analysis: v })
                      }}
                      className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
                    >
                      <option value="">No area</option>
                      {areas.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Client */}
                  <div>
                    <SectionLabel title="Client" />
                    <input
                      type="text"
                      value={field('client') ?? ''}
                      onChange={e => set('client', e.target.value || null)}
                      onBlur={handleSave}
                      placeholder="e.g. Confidential Government Client"
                      className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
                    />
                  </div>

                  {/* Start date */}
                  <div ref={sectionRefs.dates}>
                    <SectionLabel title="Start Date" />
                    <input
                      type="date"
                      value={field('start_date') ?? ''}
                      onChange={e => set('start_date', e.target.value || null)}
                      onBlur={handleSave}
                      className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40 [color-scheme:dark]"
                    />
                  </div>

                  {/* Due date — full width */}
                  <div className="col-span-2">
                    <SectionLabel title="Due Date" />
                    <input
                      type="date"
                      value={field('due_date') ?? ''}
                      onChange={e => set('due_date', e.target.value || null)}
                      onBlur={handleSave}
                      className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40 [color-scheme:dark]"
                    />
                  </div>
                </div>

                {/* Overdue warning */}
                {isOverdue && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                      <path d="M6 4v2.5M6 8v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4"/>
                    </svg>
                    This engagement is overdue
                  </div>
                )}

                {/* Assignees */}
                {members.length > 0 && (
                  <div ref={sectionRefs.members}>
                    <SectionLabel title="Assignees" />
                    <div className="flex flex-wrap gap-2">
                      {members.map(m => {
                        const assigned = assigneeIds.includes(m.id)
                        const ini = initials(m.full_name ?? m.email)
                        return (
                          <button
                            key={m.id}
                            onClick={() => toggleAssignee(m.id)}
                            className={`titlebar-no-drag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition ${
                              assigned
                                ? 'bg-hub-gold/15 border-hub-gold/30 text-gray-900 dark:text-white'
                                : 'bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/[0.07] text-gray-500 dark:text-white/70 hover:text-gray-700 dark:hover:text-white/85 hover:bg-gray-100 dark:hover:bg-white/[0.07]'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${assigned ? 'bg-hub-gold/40 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-white/65'}`}>
                              {ini}
                            </div>
                            <span>{m.full_name ?? m.email}</span>
                            {assigned && <span className="text-hub-gold text-[10px] ml-0.5">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <SectionLabel title="Description" />
                  <RichTextEditor
                    value={field('description') ?? ''}
                    onChange={v => set('description', v || null)}
                    onBlur={handleSave}
                    placeholder="Scope of work, objectives, key questions…"
                    minHeight="100px"
                  />
                </div>

                {/* ── Sources ─────────────────────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <SectionLabel title={`Sources${sources.length ? ` (${sources.length})` : ''}`} />
                    <button
                      onClick={() => setShowAddSource(v => !v)}
                      className="titlebar-no-drag flex items-center gap-1 text-[10px] text-gray-400 dark:text-white/55 hover:text-hub-gold transition -mt-0.5"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Add source
                    </button>
                  </div>

                  {sources.length === 0 && !showAddSource && (
                    <p className="text-xs text-gray-300 dark:text-white/40 italic">No sources added yet.</p>
                  )}

                  {sources.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {sources.map(src => (
                        <div key={src.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] group">
                          <span className="text-sm shrink-0 mt-0.5">
                            {src.type === 'url' ? '🔗' : src.type === 'file' ? '📎' : '📚'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 dark:text-white/80 font-medium">{src.title}</p>
                            {src.url && (
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-hub-gold/65 hover:text-hub-gold truncate block transition"
                              >
                                {src.url}
                              </a>
                            )}
                            {src.note && (
                              <p className="text-[11px] text-gray-400 dark:text-white/55 mt-0.5">{src.note}</p>
                            )}
                          </div>
                          <button
                            onClick={() => persistSources(sources.filter(s => s.id !== src.id))}
                            className="titlebar-no-drag shrink-0 p-1 rounded text-gray-300 dark:text-white/40 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 2.5h7M3.5 2.5V1.5h3v1M4 4.5v3M6 4.5v3M2.5 2.5l.5 6h4l.5-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showAddSource && (
                    <div className="p-3 rounded-xl bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={newSrc.type}
                          onChange={e => setNewSrc(p => ({ ...p, type: e.target.value as Source['type'] }))}
                          className="titlebar-no-drag px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                        >
                          <option value="url">URL</option>
                          <option value="reference">Reference</option>
                          <option value="file">File</option>
                        </select>
                        <input
                          type="text"
                          value={newSrc.title}
                          onChange={e => setNewSrc(p => ({ ...p, title: e.target.value }))}
                          placeholder="Source title *"
                          className="titlebar-no-drag flex-1 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                        />
                      </div>
                      {newSrc.type === 'url' && (
                        <input
                          type="url"
                          value={newSrc.url}
                          onChange={e => setNewSrc(p => ({ ...p, url: e.target.value }))}
                          placeholder="https://…"
                          className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                        />
                      )}
                      <input
                        type="text"
                        value={newSrc.note}
                        onChange={e => setNewSrc(p => ({ ...p, note: e.target.value }))}
                        placeholder="Note (optional)"
                        className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddSource}
                          disabled={!newSrc.title.trim()}
                          className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition"
                        >
                          Add source
                        </button>
                        <button
                          onClick={() => {
                            setShowAddSource(false)
                            setNewSrc({ type: 'url', title: '', url: '', note: '' })
                          }}
                          className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.05] hover:bg-gray-200 dark:hover:bg-white/[0.09] text-gray-500 dark:text-white/70 text-xs transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <SectionLabel title="Internal Notes" />
                  <RichTextEditor
                    value={field('notes') ?? ''}
                    onChange={v => set('notes', v || null)}
                    onBlur={handleSave}
                    placeholder="Internal notes, follow-ups, sensitivities…"
                    minHeight="80px"
                  />
                </div>

                {/* ── Labels ───────────────────────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <SectionLabel title="Labels" />
                    <button
                      onClick={() => setShowLabelPicker(v => !v)}
                      className="titlebar-no-drag flex items-center gap-1 text-[10px] text-gray-400 dark:text-white/55 hover:text-hub-gold transition -mt-0.5"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Manage
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {taskLabels.length === 0 && !showLabelPicker && (
                      <p className="text-xs text-gray-300 dark:text-white/40 italic">No labels.</p>
                    )}
                    {taskLabels.map(lbl => (
                      <span
                        key={lbl.id}
                        style={{ backgroundColor: lbl.color }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-sm"
                      >
                        {lbl.name}
                        <button onClick={() => handleToggleLabel(lbl.id)} className="titlebar-no-drag ml-0.5 hover:opacity-70 transition">×</button>
                      </span>
                    ))}
                  </div>
                  {showLabelPicker && (
                    <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] space-y-1">
                      {labels.map(lbl => {
                        const selected = taskLabels.some(l => l.id === lbl.id)
                        return (
                          <button
                            key={lbl.id}
                            onClick={() => handleToggleLabel(lbl.id)}
                            className="titlebar-no-drag w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition text-left"
                          >
                            <span style={{ backgroundColor: lbl.color }} className="w-3 h-3 rounded-sm shrink-0" />
                            <span className="flex-1 text-xs text-gray-700 dark:text-white/80">{lbl.name}</span>
                            {selected && <span className="text-hub-gold text-xs">✓</span>}
                          </button>
                        )
                      })}
                      <button onClick={() => setShowLabelPicker(false)} className="titlebar-no-drag w-full mt-1 py-1 text-[11px] text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/70 transition">Done</button>
                    </div>
                  )}
                </div>

                {/* ── Checklists ────────────────────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <SectionLabel title="Checklist" />
                    <button
                      onClick={() => setShowAddChecklist(v => !v)}
                      className="titlebar-no-drag flex items-center gap-1 text-[10px] text-gray-400 dark:text-white/55 hover:text-hub-gold transition -mt-0.5"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Add checklist
                    </button>
                  </div>

                  {checklists.length === 0 && !showAddChecklist && (
                    <p className="text-xs text-gray-300 dark:text-white/40 italic">No checklists yet.</p>
                  )}

                  {checklists.map(cl => {
                    const done = cl.items.filter(i => i.checked).length
                    const total = cl.items.length
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    return (
                      <div key={cl.id} className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-700 dark:text-white/85">{cl.title}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 dark:text-white/50 tabular-nums">{done}/{total}</span>
                            <button onClick={() => handleDeleteChecklist(cl.id)} className="titlebar-no-drag text-[10px] text-gray-300 dark:text-white/40 hover:text-red-400 transition">✕</button>
                          </div>
                        </div>
                        {total > 0 && (
                          <div className="h-1 rounded-full bg-gray-200 dark:bg-white/10 mb-2 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-hub-blue'}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                        <div className="space-y-1">
                          {cl.items.map(item => (
                            <div key={item.id} className="flex items-center gap-2 group px-1">
                              <input
                                type="checkbox"
                                checked={!!item.checked}
                                onChange={() => handleToggleItem(item.id, !!item.checked)}
                                className="titlebar-no-drag w-3.5 h-3.5 rounded accent-hub-gold shrink-0 cursor-pointer"
                              />
                              <span className={`flex-1 text-xs leading-relaxed ${item.checked ? 'line-through text-gray-300 dark:text-white/45' : 'text-gray-700 dark:text-white/85'}`}>
                                {item.text}
                              </span>
                              <button onClick={() => handleDeleteItem(item.id)} className="titlebar-no-drag shrink-0 text-[10px] text-gray-300 dark:text-white/30 hover:text-red-400 transition opacity-0 group-hover:opacity-100">✕</button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-1.5 mt-1.5">
                          <input
                            type="text"
                            value={newItemText[cl.id] ?? ''}
                            onChange={e => setNewItemText(prev => ({ ...prev, [cl.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddChecklistItem(cl.id) }}
                            placeholder="Add item…"
                            className="titlebar-no-drag flex-1 px-2 py-1 rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.07] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                          />
                          <button
                            onClick={() => handleAddChecklistItem(cl.id)}
                            disabled={!(newItemText[cl.id] ?? '').trim()}
                            className="titlebar-no-drag px-2.5 py-1 rounded-lg bg-hub-gold/80 hover:bg-hub-gold disabled:opacity-40 text-white text-xs font-semibold transition"
                          >Add</button>
                        </div>
                      </div>
                    )
                  })}

                  {showAddChecklist && (
                    <div className="flex gap-1.5 mt-1">
                      <input
                        type="text"
                        value={newChecklistTitle}
                        onChange={e => setNewChecklistTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateChecklist(); if (e.key === 'Escape') setShowAddChecklist(false) }}
                        autoFocus
                        placeholder="Checklist title…"
                        className="titlebar-no-drag flex-1 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                      />
                      <button onClick={handleCreateChecklist} disabled={!newChecklistTitle.trim()} className="titlebar-no-drag px-2.5 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition">Create</button>
                      <button onClick={() => setShowAddChecklist(false)} className="titlebar-no-drag px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.05] text-gray-500 dark:text-white/65 text-xs transition hover:bg-gray-200 dark:hover:bg-white/[0.09]">✕</button>
                    </div>
                  )}
                </div>

                {/* ── Attachments ──────────────────────────────────────────── */}
                <div ref={sectionRefs.attachments}>
                  <div className="flex items-center justify-between mb-1.5">
                    <SectionLabel title={`Attachments${attachments.length ? ` (${attachments.length})` : ''}`} />
                    <div className="flex items-center gap-2 -mt-0.5">
                      <button
                        onClick={handleAddFile}
                        disabled={attLoading}
                        className="titlebar-no-drag flex items-center gap-1 text-[10px] text-gray-400 dark:text-white/55 hover:text-hub-gold transition disabled:opacity-50"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        {attLoading ? 'Adding…' : 'File'}
                      </button>
                      <button
                        onClick={() => setShowAddAttUrl(v => !v)}
                        className="titlebar-no-drag flex items-center gap-1 text-[10px] text-gray-400 dark:text-white/55 hover:text-hub-gold transition"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        URL / GDoc
                      </button>
                    </div>
                  </div>

                  {attachments.length === 0 && !showAddAttUrl && (
                    <p className="text-xs text-gray-300 dark:text-white/40 italic">No attachments yet.</p>
                  )}

                  {attachments.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {attachments.map(att => {
                        const icon = att.type === 'gdoc' ? '📝' : att.type === 'file' ? '📎' : '🔗'
                        const canDelete = att.author_id === currentUserId || isAdminUser
                        return (
                          <div key={att.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] group">
                            <span className="text-sm shrink-0">{icon}</span>
                            <div className="flex-1 min-w-0">
                              <button
                                onClick={() => window.api.attachments.open(att.id)}
                                className="titlebar-no-drag text-xs text-gray-700 dark:text-white/80 font-medium truncate block hover:text-hub-gold transition text-left w-full"
                              >
                                {att.name}
                              </button>
                              <p className="text-[10px] text-gray-400 dark:text-white/45">{att.author_name} · {new Date(att.created_at).toLocaleDateString()}</p>
                            </div>
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteAttachment(att.id)}
                                className="titlebar-no-drag shrink-0 p-1 rounded text-gray-300 dark:text-white/40 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                              >
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M1.5 2.5h7M3.5 2.5V1.5h3v1M4 4.5v3M6 4.5v3M2.5 2.5l.5 6h4l.5-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {showAddAttUrl && (
                    <div className="p-3 rounded-xl bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] space-y-2">
                      <input
                        type="text"
                        value={newAttName}
                        onChange={e => setNewAttName(e.target.value)}
                        placeholder="Name (optional)"
                        className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                      />
                      <input
                        type="url"
                        value={newAttUrl}
                        onChange={e => setNewAttUrl(e.target.value)}
                        placeholder="https://docs.google.com/… or any URL"
                        className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleAddAttUrl} disabled={!newAttUrl.trim()} className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition">Add</button>
                        <button onClick={() => { setShowAddAttUrl(false); setNewAttName(''); setNewAttUrl('') }} className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.05] hover:bg-gray-200 dark:hover:bg-white/[0.09] text-gray-500 dark:text-white/70 text-xs transition">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* ── Footer ──────────────────────────────────────────────────── */}
              <div className="px-5 py-3 border-t border-gray-100 dark:border-white/[0.06] flex items-center justify-between shrink-0">
                <p className="text-[11px] text-gray-300 dark:text-white/40">
                  Created {new Date(selectedTask.created_at).toLocaleDateString()}
                </p>
                <button
                  onClick={handleDelete}
                  className="titlebar-no-drag flex items-center gap-1.5 text-xs text-red-400/45 hover:text-red-400 transition"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1.5 3h9M4.5 3V1.5h3V3M5 5.5v3.5M7 5.5v3.5M2.5 3l.5 7.5h6l.5-7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Delete engagement
                </button>
              </div>
            </div>

            {/* ── RIGHT column: Comments & Activity (300px, scrollable) ─── */}
            <div className="w-[300px] shrink-0 flex flex-col bg-gray-50/50 dark:bg-white/[0.02]">

              {/* Sticky header */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
                <p className="text-[11px] font-semibold text-gray-500 dark:text-white/70 uppercase tracking-widest">
                  Comments & Activity
                  {comments.length > 0 && (
                    <span className="ml-1.5 text-gray-400 dark:text-white/50 font-normal normal-case tracking-normal">({comments.length})</span>
                  )}
                </p>
              </div>

              {/* Compose area — always visible */}
              <div className="px-4 pt-3 pb-2 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
                <div className="relative">
                  <textarea
                    ref={commentInputRef}
                    value={newComment}
                    onFocus={() => setAddingComment(true)}
                    onChange={e => {
                      const val = e.target.value
                      setNewComment(val)
                      if (val.trim()) setAddingComment(true)
                      // Detect @mention trigger
                      const cursor = e.target.selectionStart ?? val.length
                      const before = val.slice(0, cursor)
                      const atMatch = before.match(/@([\w ]*)$/)
                      if (atMatch) {
                        setMentionQuery(atMatch[1])
                        setShowMentions(true)
                        setMentionIndex(0)
                      } else {
                        setShowMentions(false)
                      }
                    }}
                    rows={addingComment ? 3 : 2}
                    placeholder="Write a comment… type @ to mention"
                    onKeyDown={e => {
                      if (showMentions && mentionResults.length > 0) {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionResults.length); return }
                        if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionResults.length) % mentionResults.length); return }
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.preventDefault()
                          const m = mentionResults[mentionIndex]
                          const name = m.full_name ?? m.email
                          setNewComment(prev => prev.replace(/@[\w ]*$/, `@${name} `))
                          setShowMentions(false)
                          return
                        }
                        if (e.key === 'Escape') { setShowMentions(false); return }
                      }
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        handleAddComment()
                      }
                      if (e.key === 'Escape' && !showMentions) {
                        setAddingComment(false)
                        setNewComment('')
                      }
                    }}
                    className="titlebar-no-drag w-full px-3 py-2 rounded-xl bg-white dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.09] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30 resize-none leading-relaxed transition-all"
                  />
                  {/* @mention popover */}
                  {showMentions && mentionResults.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 w-48 bg-white dark:bg-[#1a2233] border border-gray-200 dark:border-white/[0.1] rounded-xl shadow-lg overflow-hidden z-10">
                      {mentionResults.map((m, i) => (
                        <button
                          key={m.id}
                          onMouseDown={e => {
                            e.preventDefault()
                            const name = m.full_name ?? m.email
                            setNewComment(prev => prev.replace(/@[\w ]*$/, `@${name} `))
                            setShowMentions(false)
                            commentInputRef.current?.focus()
                          }}
                          className={`titlebar-no-drag w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition ${
                            i === mentionIndex ? 'bg-hub-gold/10 text-hub-gold' : 'text-gray-700 dark:text-white/85 hover:bg-gray-50 dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="w-5 h-5 rounded-full bg-hub-gold/20 flex items-center justify-center text-[9px] font-bold text-hub-gold shrink-0">
                            {(m.full_name ?? m.email).slice(0, 2).toUpperCase()}
                          </div>
                          {m.full_name ?? m.email}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {addingComment && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim()}
                      className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition"
                    >
                      Post
                    </button>
                    <button
                      onClick={() => { setAddingComment(false); setNewComment('') }}
                      className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.10] text-gray-500 dark:text-white/70 text-xs transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {addingComment && (
                  <p className="text-[10px] text-gray-300 dark:text-white/40 mt-1">⌘ + Enter to post · Esc to cancel</p>
                )}
              </div>

              {/* Scrollable feed */}
              <div ref={rightPanelRef} className="flex-1 overflow-y-auto">
                <div className="px-4 py-3 space-y-4">

                  {/* ── Comments ─────────────────────────────────────────── */}
                  {comments.length === 0 && (
                    <p className="text-xs text-gray-300 dark:text-white/40 italic text-center pt-2">No comments yet.</p>
                  )}

                  {comments.length > 0 && (
                    <div className="space-y-3">
                      {comments.map(c => {
                        const canEdit   = c.author_id === currentUserId
                        const canDelete = c.author_id === currentUserId || isAdminUser
                        const isEditing = editingCommentId === c.id
                        return (
                          <div key={c.id} className="flex gap-2.5 group">
                            <div className="w-6 h-6 rounded-full bg-hub-gold/20 border border-hub-gold/25 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-hub-gold text-[9px] font-bold">{initials(c.author_name)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                                <span className="text-xs font-semibold text-gray-700 dark:text-white/90">{c.author_name}</span>
                                <span className="text-[10px] text-gray-400 dark:text-white/45">{fmtDate(c.created_at)}</span>
                                <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                                  {canEdit && !isEditing && (
                                    <button
                                      onClick={() => { setEditingCommentId(c.id); setEditingCommentContent(c.content) }}
                                      className="titlebar-no-drag text-[10px] text-gray-400 dark:text-white/45 hover:text-hub-gold transition"
                                    >Edit</button>
                                  )}
                                  {canDelete && (
                                    <button
                                      onClick={() => handleDeleteComment(c.id)}
                                      className="titlebar-no-drag text-[10px] text-gray-300 dark:text-white/40 hover:text-red-400 transition"
                                    >Delete</button>
                                  )}
                                </div>
                              </div>
                              {isEditing ? (
                                <div className="space-y-1.5">
                                  <textarea
                                    value={editingCommentContent}
                                    onChange={e => setEditingCommentContent(e.target.value)}
                                    rows={3}
                                    autoFocus
                                    className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30 resize-none leading-relaxed"
                                  />
                                  <div className="flex gap-1.5">
                                    <button onClick={() => handleSaveCommentEdit(c.id)} disabled={!editingCommentContent.trim()} className="titlebar-no-drag px-2.5 py-1 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition">Save</button>
                                    <button onClick={() => setEditingCommentId(null)} className="titlebar-no-drag px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-white/[0.05] hover:bg-gray-200 dark:hover:bg-white/[0.09] text-gray-500 dark:text-white/70 text-xs transition">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500 dark:text-white/82 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* ── Activity log ─────────────────────────────────────── */}
                  {activity.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-white/55 uppercase tracking-widest mb-2 pt-1 border-t border-gray-100 dark:border-white/[0.06] mt-1">Activity</p>
                      <div className="space-y-2">
                        {[...activity].reverse().map(entry => (
                          <div key={entry.id} className="flex items-start gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-white/20 shrink-0 mt-1.5" />
                            <p className="text-[11px] text-gray-400 dark:text-white/55 flex-1 leading-relaxed">
                              <span className="text-gray-500 dark:text-white/70 font-medium">{entry.actor_name}</span>
                              {' '}{entry.action}
                            </p>
                            <span className="text-[10px] text-gray-300 dark:text-white/40 shrink-0 mt-0.5">
                              {fmtShort(entry.created_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>{/* /right column */}

          </div>{/* /two-column body */}

        </div>{/* /task detail */}
      </div>{/* /panel wrapper */}
    </>
  )
}
