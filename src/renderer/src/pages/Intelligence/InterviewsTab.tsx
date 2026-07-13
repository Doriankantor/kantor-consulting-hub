import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import RichTextEditor from '../../components/RichTextEditor'
import TagPicker from './TagPicker'

// 2c: Intelligence "Interviews" tab — human-first, mirroring the Documents (2b)
// compose flow. type='interview' rows on intelligence_sources; the transcript is
// stored as PLAIN TEXT in `content` (never JSON-wrapped) so a later per-span
// annotation slice can anchor to character offsets. Reuses the 2b columns
// (intel_notes / analysis_json / reconciled_notes) and the 2a AI helper via the
// shared intelligence:* IPCs. The compose pattern is REPLICATED (not extracted)
// from DocumentsTab: 2b left it internal to DocumentsTab, and this slice must not
// touch that tab, so extraction is deferred.

// The selected project, threaded from the Intelligence container (Slice 1/2b).
type ProjectInfo = { id: string; name: string; keywords?: string } | null

const STATUS_COLORS: Record<string, string> = {
  unreviewed: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300',
  approved:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  rejected:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  saved:      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  pushed:     'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
}

// Strip TipTap HTML to plain text — for the reconcile userNotes payload and the
// "has notes?" emptiness check.
function stripHtml(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Props {
  onApprove: (addedToPages?: string[]) => void
  project?: ProjectInfo
}

// T3: parse a thematic_tags JSON array safely (mirrors NewsTab's readTags).
function readTags(raw: string | null): string[] {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

export default function InterviewsTab({ onApprove, project = null }: Props) {
  const { localUser, isRoot, can } = useAuth()
  const [interviews, setInterviews] = useState<IntelligenceSource[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [transcript, setTranscript] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<Record<string, boolean>>({})
  // 3d: the info-page projects (for the per-item project picker + Send target).
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  // T3: the selected project's thematic tag vocabulary (project-scoped, from T1).
  const [knownThematic, setKnownThematic] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.intelligence.getSources({ type: 'interview' })
      // 3d: sent items (status='routed') live in the pipeline now — drop from compose.
      setInterviews(data.filter((d: any) => d.status !== 'routed'))
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // 3d: load the info-page projects once for the picker/Send target.
  useEffect(() => {
    (async () => {
      try {
        const boards = await window.api.infoPages.list()
        setProjects((boards as Array<{ id: string; name: string }>).map(b => ({ id: b.id, name: b.name })))
      } catch (e) { console.warn('[InterviewsTab] projects load failed:', e) }
    })()
  }, [])

  // T3: load the selected project's thematic tag vocabulary; reload on project change.
  useEffect(() => {
    const boardId = project?.id
    if (!boardId) { setKnownThematic([]); return }
    window.api.intelligence.getKnownTags('thematic', boardId)
      .then(setKnownThematic).catch(() => setKnownThematic([]))
  }, [project?.id])

  // Capture a new interview: transcript goes to `content` as PLAIN TEXT.
  async function handleAdd() {
    if (!transcript.trim()) { setFormError('Paste the interview transcript first.'); return }
    setFormError(null)
    setSaving(true)
    try {
      const res = await window.api.intelligence.addInterview({
        title: title.trim(),
        transcript,                 // plain text — do NOT JSON-wrap
        added_by_id: localUser?.id,
        added_by_name: localUser?.name,
      })
      if (!res.ok) { setFormError('Could not save the interview.'); return }
      // T5: stamp the selected project onto the new interview so it shows under that
      // project (not only "All"). No stamp when "All" is selected (project null).
      if (res.id && project?.id) {
        await window.api.intelligence.setProject(res.id, project.id)
      }
      setTitle('')
      setTranscript('')
      await load()
    } catch (e) {
      setFormError((e as Error)?.message || 'Could not save the interview.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatus(id: string, status: string) {
    setPendingStatus(p => ({ ...p, [id]: true }))
    try {
      const res = await window.api.intelligence.updateStatus(id, status, undefined, localUser?.id, localUser?.name)
      setInterviews(prev => prev.map(iv => iv.id === id ? { ...iv, status: status as any } : iv))
      if (status === 'approved') onApprove(res?.addedToPages)
      else onApprove()
    } finally {
      setPendingStatus(p => ({ ...p, [id]: false }))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this interview?')) return
    await window.api.intelligence.deleteSource(id)
    setInterviews(prev => prev.filter(iv => iv.id !== id))
  }

  // 3d: persist the reliable board-id project association (picker change).
  const handleProjectSelect = async (id: string, boardId: string) => {
    await window.api.intelligence.setProject(id, boardId || null)
    setInterviews(prev => prev.map(iv => iv.id === id ? { ...iv, project_board_id: boardId || null } : iv))
  }

  // 3d: Send to New sources — route into the selected project's pipeline (stage='new')
  // and drop the item from the compose list (status='routed').
  const handleSend = async (id: string, boardId: string) => {
    const res = await window.api.intelligence.routeToProject(id, boardId)
    if (res?.ok) {
      setInterviews(prev => prev.filter(iv => iv.id !== id))
      onApprove(res.pageName ? [res.pageName] : [])
    } else if (res?.error) {
      console.warn('[3d] send failed:', res.error)
    }
  }

  // T3: project-scoped topic tags on the compose item (mirrors NewsTab).
  const handleSetTags = async (id: string, tags: string[]) => {
    try {
      const res = await window.api.intelligence.setArticleTags(id, 'thematic', tags)
      const final = res?.tags ?? tags
      setInterviews(prev => prev.map(iv => iv.id === id ? { ...iv, thematic_tags: JSON.stringify(final) } : iv))
    } catch (e) { console.warn('[InterviewsTab] setArticleTags failed:', e) }
  }
  const handleCreateTag = async (id: string, current: string[], name: string, boardId: string) => {
    if (!boardId) return
    try {
      const res = await window.api.intelligence.createTag(name, 'thematic', boardId)
      if (!res?.ok || !res.name) return
      setKnownThematic(prev => prev.includes(res.name) ? prev : [...prev, res.name].sort((a, b) => a.localeCompare(b)))
      if (!current.includes(res.name)) await handleSetTags(id, [...current, res.name])
    } catch (e) { console.warn('[InterviewsTab] createTag failed:', e) }
  }
  const handleDeleteTag = async (name: string, boardId: string) => {
    if (!boardId) return
    if (!confirm(`Delete tag "${name}" from this project's registry?`)) return
    try {
      await window.api.intelligence.deleteTag(name, 'thematic', boardId)
      setKnownThematic(prev => prev.filter(t => t !== name))
    } catch (e) { console.warn('[InterviewsTab] deleteTag failed:', e) }
  }

  // Patch one interview in local state so notes/AI results re-render in place.
  const patchDoc = useCallback((id: string, patch: Partial<IntelligenceSource>) => {
    setInterviews(prev => prev.map(iv => iv.id === id ? { ...iv, ...patch } : iv))
  }, [])

  function formatDate(dateStr: string | null) {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return dateStr }
  }

  // T5: project-scoped view — mirror NewsTab. When a project is selected (project not
  // null / "All"), show only that project's items; changing a card's project (which
  // patches project_board_id in state) makes it drop out here with no refetch.
  const projectScoped = !!project?.id
  const visible = interviews.filter(iv => !projectScoped || iv.project_board_id === project?.id)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Capture bar */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-100 dark:border-white/[0.06] space-y-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Interview title (interviewee, org, date…)"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white/85 placeholder:text-gray-400 dark:placeholder:text-white/30"
        />
        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder="Paste interview transcript… (stored as plain text)"
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white/85 placeholder:text-gray-400 dark:placeholder:text-white/30 resize-y"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleAdd}
            disabled={saving || !transcript.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition disabled:opacity-50"
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
            ) : (
              <>+ Add interview</>
            )}
          </button>
          {formError && <span className="text-xs text-red-500 dark:text-red-400">{formError}</span>}
          <span className="ml-auto text-xs text-gray-400 dark:text-white/30">{visible.length} interviews</span>
        </div>
      </div>

      {/* Interview list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">No interviews yet</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Paste a transcript above to capture one.</p>
          </div>
        )}

        {!loading && visible.map(iv => {
          const isPending = pendingStatus[iv.id]
          // 3d: picker default — the interview's project, else the top-dropdown selected project.
          const projectBoardSel = iv.project_board_id || (project?.id ?? '')
          // T3: this item's topic tags (project-scoped write target = projectBoardSel).
          const themaTags = readTags(iv.thematic_tags)
          return (
            <div key={iv.id} className="bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-4">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white break-words">{iv.title || 'Untitled interview'}</span>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${STATUS_COLORS[iv.status] || STATUS_COLORS.unreviewed}`}>
                      {iv.status}
                    </span>
                    {iv.added_by_name && <span className="text-xs text-gray-400 dark:text-white/30">by {iv.added_by_name}</span>}
                    <span className="text-xs text-gray-400 dark:text-white/30">{formatDate(iv.added_at)}</span>
                  </div>
                </div>
                {(can('delete_intel_doc') || isRoot) && (
                  <button
                    onClick={() => handleDelete(iv.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
                    title="Delete interview"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
              </div>

              {/* Human-first compose: transcript → primary notes → on-demand AI → editable reconcile */}
              <InterviewCompose doc={iv} project={project} onPatch={patchDoc} formatDate={formatDate} />

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
                <div className="flex-1" />
                {/* 3d: project picker (reliable board-id association) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">Project</span>
                  {projects.length > 0 ? (
                    <select
                      value={projectBoardSel}
                      onChange={e => handleProjectSelect(iv.id, e.target.value)}
                      className="px-2 py-0.5 rounded text-[11px] border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-gray-900 text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    >
                      {!projectBoardSel && <option value="">— select project —</option>}
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-[11px] text-gray-400 dark:text-white/30">Loading…</span>
                  )}
                </div>
                {/* T3: project-scoped topic tags */}
                {projectBoardSel ? (
                  <TagPicker
                    label="Topic"
                    value={themaTags}
                    known={knownThematic}
                    chipClass="bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300"
                    onAdd={tag => handleSetTags(iv.id, [...themaTags, tag])}
                    onRemove={tag => handleSetTags(iv.id, themaTags.filter(t => t !== tag))}
                    onCreate={name => handleCreateTag(iv.id, themaTags, name, projectBoardSel)}
                    onDelete={(can('delete_intel_tag') || isRoot) ? tag => handleDeleteTag(tag, projectBoardSel) : undefined}
                    isAdmin={can('delete_intel_tag') || isRoot}
                  />
                ) : (
                  <span className="text-[10px] text-gray-400 dark:text-white/30 italic">Select a project to tag</span>
                )}
                {iv.status !== 'saved' && (
                  <button onClick={() => handleStatus(iv.id, 'saved')} disabled={isPending}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition disabled:opacity-50">Save</button>
                )}
                {/* 3d: Send to New sources — routes into the selected project's pipeline */}
                <button
                  onClick={() => handleSend(iv.id, projectBoardSel)}
                  disabled={!projectBoardSel}
                  title={projectBoardSel ? 'Route this interview into the project’s New sources' : 'Select a project first'}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ➤ Send to New sources
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// 2c: the Interviews compose area for one row — replicates DocumentCompose (2b).
// Order top→bottom: (a) transcript (read-only, the captured content); (b) RESEARCHER
// NOTES (primary, editable, → intel_notes); (c) on-demand AI (never auto-runs,
// → analysis_json.ai); (d) editable reconcile (→ reconciled_notes). Every AI call
// is an explicit button. The transcript (doc.content) is the text fed to the AI.
function InterviewCompose({
  doc, project, onPatch, formatDate,
}: {
  doc: IntelligenceSource
  project: ProjectInfo
  onPatch: (id: string, patch: Partial<IntelligenceSource>) => void
  formatDate: (d: string | null) => string
}) {
  const [notes, setNotes] = useState<string>(doc.intel_notes || '')
  const [reconciledText, setReconciledText] = useState<string>(doc.reconciled_notes || '')
  const [analyzing, setAnalyzing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)

  const analysis = parseAnalysis(doc.analysis_json)
  const ai = analysis.ai as Record<string, any> | undefined
  const reconciledMeta = analysis.reconciled as Record<string, any> | undefined
  const hasAi = !!ai
  const plain = stripHtml(notes)
  const hasNotes = plain.length > 0
  const transcript = doc.content || ''

  async function saveNotes() {
    if (notes === (doc.intel_notes || '')) return
    try {
      await window.api.intelligence.updateNotes(doc.id, notes)
      onPatch(doc.id, { intel_notes: notes || null })
    } catch { /* transient — next blur retries */ }
  }

  async function saveReconciledText() {
    if (reconciledText === (doc.reconciled_notes || '')) return
    try {
      await window.api.intelligence.updateReconciledNotes(doc.id, reconciledText)
      onPatch(doc.id, { reconciled_notes: reconciledText || null })
    } catch { /* transient — next blur retries */ }
  }

  // Explicit, on-demand AI read (task='relevance', project-aware). Never auto-runs.
  async function analyze() {
    if (analyzing) return
    setAnalyzing(true)
    setError(null)
    try {
      const res = await window.api.intelligence.analyzeText({
        task: 'relevance',
        text: transcript,
        projectConfig: project ? { name: project.name, keywords: project.keywords } : null,
      })
      if (!res.ok) { setError(res.error); return }
      const saved = await window.api.intelligence.saveAiAnalysis(doc.id, res.result)
      if (!saved.ok) { setError(saved.error); return }
      onPatch(doc.id, { analysis_json: withAnalysisKey(doc.analysis_json, 'ai', saved.ai) })
    } catch (e) {
      setError((e as Error)?.message || 'Analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  // Reconcile: merge notes + transcript into an EDITABLE merged read.
  async function reconcile() {
    if (!hasAi || !hasNotes || reconciling) return
    setReconciling(true)
    setError(null)
    try {
      if (notes !== (doc.intel_notes || '')) {
        await window.api.intelligence.updateNotes(doc.id, notes)
        onPatch(doc.id, { intel_notes: notes || null })
      }
      const res = await window.api.intelligence.analyzeText({
        task: 'reconcile',
        text: transcript,
        userNotes: plain,
        projectConfig: project ? { name: project.name, keywords: project.keywords } : null,
      })
      if (!res.ok) { setError(res.error); return }
      const savedMeta = await window.api.intelligence.saveReconciled(doc.id, res.result)
      if (!savedMeta.ok) { setError(savedMeta.error); return }
      const seeded = res.result.summary ? `<p>${escapeHtml(res.result.summary)}</p>` : (reconciledText || '')
      await window.api.intelligence.updateReconciledNotes(doc.id, seeded)
      setReconciledText(seeded)
      onPatch(doc.id, {
        analysis_json: withAnalysisKey(doc.analysis_json, 'reconciled', savedMeta.reconciled),
        reconciled_notes: seeded || null,
      })
    } catch (e) {
      setError((e as Error)?.message || 'Reconcile failed.')
    } finally {
      setReconciling(false)
    }
  }

  const showReconciledField = reconciledText.trim() !== '' || !!reconciledMeta

  return (
    <div className="mt-3 space-y-4">
      {/* (a) Transcript — the captured plain-text content, read-only + collapsible */}
      <div>
        <button
          onClick={() => setShowTranscript(s => !s)}
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50 transition"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${showTranscript ? 'rotate-180' : ''}`}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {showTranscript ? 'Hide' : 'Show'} transcript ({transcript.length.toLocaleString()} chars)
        </button>
        {showTranscript && (
          <pre className="mt-1.5 max-h-56 overflow-y-auto p-3 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] text-[11px] text-gray-600 dark:text-white/60 whitespace-pre-wrap font-sans">
            {transcript || '(empty transcript)'}
          </pre>
        )}
      </div>

      {/* (b) PRIMARY — researcher notes, before AI */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold uppercase tracking-wide">Primary</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">Your interpretation</span>
          <span className="text-[10px] font-normal text-gray-300 dark:text-white/25">· optional</span>
        </div>
        <RichTextEditor
          value={notes}
          onChange={setNotes}
          onBlur={saveNotes}
          placeholder="Your interpretation, what the interviewee revealed, why it matters for the project…"
          minHeight="80px"
        />
      </div>

      {/* (c) AI — on-demand, separate box; nothing runs until pressed */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">AI analysis — suggestions</span>
          <button
            onClick={analyze}
            disabled={analyzing}
            title="Run the AI analysis on demand (project-aware). Nothing runs until you press this."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition disabled:opacity-50"
          >
            {analyzing ? (
              <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
            ) : (
              <>✦ {hasAi ? 'Re-analyze' : 'Analyze with AI'}</>
            )}
          </button>
        </div>
        {hasAi ? (
          <div className="p-3 rounded-lg bg-indigo-50/60 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 space-y-2 text-xs">
            {typeof ai!.relevance_score === 'number' && (
              <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 font-bold text-[10px]">relevance {ai!.relevance_score}/10</span>
            )}
            {ai!.summary && <p className="text-gray-700 dark:text-white/70">{ai!.summary}</p>}
            {ai!.relevance_reasoning && <p className="text-gray-500 dark:text-white/50 italic">{ai!.relevance_reasoning}</p>}
            {Array.isArray(ai!.suggested_tags) && ai!.suggested_tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ai!.suggested_tags.map((t: string, i: number) => (
                  <span key={`${t}-${i}`} className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">{t}</span>
                ))}
              </div>
            )}
            {ai!.analyzed_at && <p className="text-[10px] text-indigo-500/60 dark:text-indigo-400/40">Analyzed {formatDate(ai!.analyzed_at)}</p>}
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-dashed border-gray-200 dark:border-white/10 text-[11px] text-gray-400 dark:text-white/30">
            Press <span className="font-medium">Analyze with AI</span> to generate analysis — nothing runs until you ask.
          </div>
        )}
      </div>

      {/* (d) RECONCILE — editable merged read; appears once an AI read exists */}
      {hasAi && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Reconciled — editable before commit</span>
            <div className="flex items-center gap-2">
              {!hasNotes && <span className="text-[10px] text-gray-300 dark:text-white/25">add notes first</span>}
              <button
                onClick={reconcile}
                disabled={!hasNotes || reconciling}
                title={hasNotes ? 'Merge your notes with the AI read into an editable version' : 'Add notes to enable reconcile'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {reconciling ? (
                  <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Reconciling…</>
                ) : (
                  <>⟲ Reconcile with my notes</>
                )}
              </button>
            </div>
          </div>
          {reconciledMeta && (
            <div className="flex items-center flex-wrap gap-1 mb-1.5">
              {typeof reconciledMeta.relevance_score === 'number' && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold text-[10px]">relevance {reconciledMeta.relevance_score}/10</span>
              )}
              {Array.isArray(reconciledMeta.suggested_tags) && reconciledMeta.suggested_tags.map((t: string, i: number) => (
                <span key={`${t}-${i}`} className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-medium">{t}</span>
              ))}
              {reconciledMeta.reconciled_at && (
                <span className="text-[10px] text-amber-600/60 dark:text-amber-400/40 ml-1">Reconciled {formatDate(reconciledMeta.reconciled_at)}</span>
              )}
            </div>
          )}
          {showReconciledField ? (
            <RichTextEditor
              value={reconciledText}
              onChange={setReconciledText}
              onBlur={saveReconciledText}
              placeholder="The reconciled read — edit freely before commit…"
              minHeight="80px"
            />
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-white/30">Press <span className="font-medium">Reconcile with my notes</span> to generate an editable merged read.</p>
          )}
        </div>
      )}

      {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

// Parse analysis_json to an object (never throws; {} on missing/invalid).
function parseAnalysis(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : {} } catch { return {} }
}

// Return analysis_json with one top-level key replaced, preserving the rest.
function withAnalysisKey(raw: string | null, key: string, block: unknown): string {
  const o = parseAnalysis(raw)
  o[key] = block
  return JSON.stringify(o)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
