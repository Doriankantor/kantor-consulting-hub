import { useState, useEffect, useRef } from 'react'
import type {
  Task, ContentType, Priority, AreaOfAnalysis,
  Source, TaskComment, ActivityEntry,
} from '../types'
import {
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_COLORS,
  AREA_LABELS,
  AREA_COLORS,
} from '../types'
import { useWorkspace } from '../contexts/WorkspaceContext'
import RichTextEditor from './RichTextEditor'
import ClaudeAISidebar from './ClaudeAISidebar'

// ── Constants ──────────────────────────────────────────────────────────────

const CONTENT_TYPES: ContentType[] = [
  'policy-brief', 'research-report', 'op-ed',
  'briefing-note', 'consulting-engagement', 'client-advisory',
]
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const AREAS: AreaOfAnalysis[] = [
  'latin-america', 'us-foreign-policy', 'european-politics',
  'international-security', 'security-technology',
]

// ── Small helpers ──────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">
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
  const { selectedTask, selectTask, updateTask, deleteTask, columns, members } = useWorkspace()

  // Editing state — overrides selected task fields until saved
  const [editing, setEditing] = useState<Partial<Task>>({})

  // Claude sidebar
  const [claudeOpen, setClaudeOpen] = useState(false)

  // Comments
  const [comments, setComments]     = useState<TaskComment[]>([])
  const [newComment, setNewComment]  = useState('')
  const [addingComment, setAddingComment] = useState(false)

  // Activity
  const [activity, setActivity] = useState<ActivityEntry[]>([])

  // Sources (parsed from task.sources_json)
  const [sources, setSources]           = useState<Source[]>([])
  const [showAddSource, setShowAddSource] = useState(false)
  const [newSrc, setNewSrc] = useState<{
    type: 'url' | 'reference' | 'file'
    title: string; url: string; note: string
  }>({ type: 'url', title: '', url: '', note: '' })

  // Attachments (Google Docs / Drive links — stored in local state for now)
  const [attachments, setAttachments] = useState<{ id: string; title: string; url: string }[]>([])
  const [showAddAtt, setShowAddAtt]     = useState(false)
  const [newAtt, setNewAtt] = useState({ title: '', url: '' })

  const titleRef = useRef<HTMLInputElement>(null)

  // Reset all local state when the selected task changes
  useEffect(() => {
    if (!selectedTask) return
    setEditing({})
    setClaudeOpen(false)
    setComments([])
    setActivity([])
    setNewComment('')
    setAddingComment(false)
    setSources(selectedTask.sources_json ? (JSON.parse(selectedTask.sources_json) as Source[]) : [])
    setAttachments([])
    setShowAddSource(false)
    setShowAddAtt(false)

    window.api.comments.get(selectedTask.id).then(data => setComments(data))
    window.api.activity.get(selectedTask.id).then(data => setActivity(data))
  }, [selectedTask?.id])

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
      author_id: 'admin',
      author_name: 'Dorian Kantor',
      content: newComment.trim(),
    })
    setComments(prev => [...prev, comment])
    const entry = await window.api.activity.add({
      task_id: selectedTask.id,
      actor_name: 'Dorian Kantor',
      action: 'added a comment',
    })
    setActivity(prev => [...prev, entry])
    setNewComment('')
    setAddingComment(false)
  }

  async function handleDeleteComment(id: string) {
    await window.api.comments.delete(id)
    setComments(prev => prev.filter(c => c.id !== id))
  }

  // ── Assignees ────────────────────────────────────────────────────────────

  const assigneeIds: string[] = (field('assignee_ids') as string[] | null) ?? []

  function toggleAssignee(memberId: string) {
    const updated = assigneeIds.includes(memberId)
      ? assigneeIds.filter(id => id !== memberId)
      : [...assigneeIds, memberId]
    set('assignee_ids', updated)
    updateTask(selectedTask.id, { assignee_ids: updated })
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
        style={{ width: claudeOpen ? 940 : 500, transition: 'width 0.25s ease' }}
      >
        {/* Claude sidebar — left half */}
        {claudeOpen && (
          <div className="w-[440px] shrink-0 border-r border-white/[0.06]">
            <ClaudeAISidebar task={selectedTask} onClose={() => setClaudeOpen(false)} />
          </div>
        )}

        {/* Task detail — right half (always 500 px) */}
        <div className="w-[500px] shrink-0 flex flex-col bg-[#111827] border-l border-white/[0.08] shadow-2xl overflow-hidden">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1 mr-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${CONTENT_TYPE_COLORS[field('content_type')]}`}>
                {CONTENT_TYPE_LABELS[field('content_type')]}
              </span>
              {area && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${AREA_COLORS[area]}`}>
                  {AREA_LABELS[area]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Ask Claude toggle */}
              <button
                onClick={() => setClaudeOpen(v => !v)}
                className={`titlebar-no-drag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                  claudeOpen
                    ? 'bg-hub-gold/20 text-hub-gold border-hub-gold/40'
                    : 'bg-white/[0.05] text-white/55 border-white/[0.08] hover:bg-white/[0.09] hover:text-white/85'
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
                className="titlebar-no-drag p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.07] transition"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-6">

              {/* Title */}
              <input
                ref={titleRef}
                value={field('title')}
                onChange={e => set('title', e.target.value)}
                onBlur={handleSave}
                className="titlebar-no-drag w-full bg-transparent text-xl font-bold text-white placeholder-white/30 border-b border-transparent hover:border-white/10 focus:border-hub-gold/50 outline-none pb-1 transition"
                placeholder="Engagement title"
              />

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Stage */}
                <div>
                  <SectionLabel title="Stage" />
                  <select
                    value={field('column_id')}
                    onChange={e => {
                      set('column_id', e.target.value)
                      updateTask(selectedTask.id, { column_id: e.target.value })
                    }}
                    className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
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
                    className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
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
                    className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
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
                    className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
                  >
                    <option value="">— None —</option>
                    {AREAS.map(a => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
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
                    className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/40"
                  />
                </div>

                {/* Start date */}
                <div>
                  <SectionLabel title="Start Date" />
                  <input
                    type="date"
                    value={field('start_date') ?? ''}
                    onChange={e => set('start_date', e.target.value || null)}
                    onBlur={handleSave}
                    className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40 [color-scheme:dark]"
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
                    className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40 [color-scheme:dark]"
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
                <div>
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
                              ? 'bg-hub-gold/15 border-hub-gold/30 text-white'
                              : 'bg-white/[0.04] border-white/[0.07] text-white/45 hover:text-white/70 hover:bg-white/[0.07]'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${assigned ? 'bg-hub-gold/40 text-white' : 'bg-white/10 text-white/50'}`}>
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
                    className="titlebar-no-drag flex items-center gap-1 text-[10px] text-white/35 hover:text-hub-gold transition -mt-0.5"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Add source
                  </button>
                </div>

                {sources.length === 0 && !showAddSource && (
                  <p className="text-xs text-white/20 italic">No sources added yet.</p>
                )}

                {sources.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {sources.map(src => (
                      <div key={src.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] group">
                        <span className="text-sm shrink-0 mt-0.5">
                          {src.type === 'url' ? '🔗' : src.type === 'file' ? '📎' : '📚'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/80 font-medium">{src.title}</p>
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
                            <p className="text-[11px] text-white/35 mt-0.5">{src.note}</p>
                          )}
                        </div>
                        <button
                          onClick={() => persistSources(sources.filter(s => s.id !== src.id))}
                          className="titlebar-no-drag shrink-0 p-1 rounded text-white/20 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
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
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={newSrc.type}
                        onChange={e => setNewSrc(p => ({ ...p, type: e.target.value as Source['type'] }))}
                        className="titlebar-no-drag px-2 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-xs focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
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
                        className="titlebar-no-drag flex-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                      />
                    </div>
                    {newSrc.type === 'url' && (
                      <input
                        type="url"
                        value={newSrc.url}
                        onChange={e => setNewSrc(p => ({ ...p, url: e.target.value }))}
                        placeholder="https://…"
                        className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                      />
                    )}
                    <input
                      type="text"
                      value={newSrc.note}
                      onChange={e => setNewSrc(p => ({ ...p, note: e.target.value }))}
                      placeholder="Note (optional)"
                      className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
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
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-white/45 text-xs transition"
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

              {/* ── Attachments ──────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <SectionLabel title="Attachments" />
                  <button
                    onClick={() => setShowAddAtt(v => !v)}
                    className="titlebar-no-drag flex items-center gap-1 text-[10px] text-white/35 hover:text-hub-gold transition -mt-0.5"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Add link
                  </button>
                </div>

                {attachments.length === 0 && !showAddAtt && (
                  <p className="text-xs text-white/20 italic">No attachments — add Google Docs or Drive links.</p>
                )}

                {attachments.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] group">
                        <span className="text-sm shrink-0">📄</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/80 font-medium truncate">{att.title}</p>
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-hub-gold/65 hover:text-hub-gold truncate block transition"
                          >
                            {att.url}
                          </a>
                        </div>
                        <button
                          onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                          className="titlebar-no-drag shrink-0 p-1 rounded text-white/20 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 2.5h7M3.5 2.5V1.5h3v1M4 4.5v3M6 4.5v3M2.5 2.5l.5 6h4l.5-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {showAddAtt && (
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-2">
                    <input
                      type="text"
                      value={newAtt.title}
                      onChange={e => setNewAtt(p => ({ ...p, title: e.target.value }))}
                      placeholder="Title (e.g. Draft Report v2)"
                      className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                    />
                    <input
                      type="url"
                      value={newAtt.url}
                      onChange={e => setNewAtt(p => ({ ...p, url: e.target.value }))}
                      placeholder="https://docs.google.com/…"
                      className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (!newAtt.title.trim() || !newAtt.url.trim()) return
                          setAttachments(prev => [...prev, { id: crypto.randomUUID(), ...newAtt }])
                          setNewAtt({ title: '', url: '' })
                          setShowAddAtt(false)
                        }}
                        disabled={!newAtt.title.trim() || !newAtt.url.trim()}
                        className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setShowAddAtt(false); setNewAtt({ title: '', url: '' }) }}
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-white/45 text-xs transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Comments ─────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <SectionLabel title={`Comments${comments.length ? ` (${comments.length})` : ''}`} />
                  <button
                    onClick={() => setAddingComment(v => !v)}
                    className="titlebar-no-drag flex items-center gap-1 text-[10px] text-white/35 hover:text-hub-gold transition -mt-0.5"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Add comment
                  </button>
                </div>

                {comments.length === 0 && !addingComment && (
                  <p className="text-xs text-white/20 italic">No comments yet.</p>
                )}

                {comments.length > 0 && (
                  <div className="space-y-3 mb-3">
                    {comments.map(c => (
                      <div key={c.id} className="flex gap-2.5 group">
                        <div className="w-6 h-6 rounded-full bg-hub-gold/20 border border-hub-gold/25 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-hub-gold text-[9px] font-bold">
                            {initials(c.author_name)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                            <span className="text-xs font-semibold text-white/80">{c.author_name}</span>
                            <span className="text-[10px] text-white/25">{fmtDate(c.created_at)}</span>
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              className="titlebar-no-drag ml-auto text-[10px] text-white/20 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                            >
                              Delete
                            </button>
                          </div>
                          <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {addingComment && (
                  <div className="space-y-2">
                    <textarea
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      rows={3}
                      placeholder="Write a comment…"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          handleAddComment()
                        }
                      }}
                      className="titlebar-no-drag w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30 resize-none leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                        className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition"
                      >
                        Post comment
                      </button>
                      <button
                        onClick={() => { setAddingComment(false); setNewComment('') }}
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-white/45 text-xs transition"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-[10px] text-white/20">⌘ + Enter to post</p>
                  </div>
                )}
              </div>

              {/* ── Activity log ─────────────────────────────────────────── */}
              {activity.length > 0 && (
                <div>
                  <SectionLabel title="Activity" />
                  <div className="space-y-2">
                    {[...activity].reverse().map(entry => (
                      <div key={entry.id} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0 mt-1.5" />
                        <p className="text-[11px] text-white/35 flex-1 leading-relaxed">
                          <span className="text-white/50 font-medium">{entry.actor_name}</span>
                          {' '}{entry.action}
                        </p>
                        <span className="text-[10px] text-white/20 shrink-0 mt-0.5">
                          {fmtShort(entry.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between shrink-0">
            <p className="text-[11px] text-white/20">
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

        </div>{/* /task detail */}
      </div>{/* /panel wrapper */}
    </>
  )
}
