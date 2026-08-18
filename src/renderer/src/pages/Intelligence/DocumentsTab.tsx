import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useConnection } from '../../contexts/ConnectionContext'
import RichTextEditor from '../../components/RichTextEditor'
import TagPicker, { normalizeTagClient } from './TagPicker'
import SuggestedTagChip from './SuggestedTagChip'
import CondensedSummary from './CondensedSummary'
import SourceCard from '../../components/source-card/SourceCard'
import { fromIntelligenceSource } from '../../components/source-card/sourceCore'
import { notifyIntelChanged } from '../../utils/intelEvents'
import { useThematicTagVocabulary } from '../../hooks/useThematicTagVocabulary'

// 2b: the selected project's config, threaded from the Intelligence container so
// the reconcile call is project-aware. null when "All sources" is selected.
type ProjectInfo = { id: string; name: string; keywords?: string } | null

// Strip TipTap HTML to plain text — for the reconcile userNotes payload and the
// "has notes?" emptiness check. Good enough for both (not for rendering).
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

// S6: CONFIDENCE_COLORS + STATUS_COLORS removed -- the confidence + status badges they styled
// (and the filename title) now render on the SourceCard face, which owns its own copies of
// these palettes. Mirrors the S5 removal in SocialTab.

interface Props {
  onApprove: (addedToPages?: string[]) => void
  project?: ProjectInfo   // 2b: selected project for project-aware reconcile
}

// T3: parse a thematic_tags JSON array safely (mirrors NewsTab's readTags).
function readTags(raw: string | null): string[] {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

// Paging page size (see NewsTab). getSources' own limit ?? 100 default is untouched.
const PAGE_SIZE = 50

// Persist per-card collapse across route unmounts (leaving Intelligence). Only ids the
// user EXPLICITLY toggled are stored; untouched cards still derive open/closed from the
// substance fallback in the render, so this never freezes today's content state.
const OPENCARDS_KEY = 'intel-opencards-documents'

export default function DocumentsTab({ onApprove, project = null }: Props) {
  const { localUser, isRoot, can } = useAuth()
  const { online } = useConnection()
  const [documents, setDocuments] = useState<IntelligenceSource[]>([])
  const [loading, setLoading] = useState(true)
  // S5b-1: touched sets for the amber "AI-unconfirmed" cue -- first geo/actor edit clears the
  // badge for that row this session. Mirrors NewsTab verbatim.
  const [countriesTouched, setCountriesTouched] = useState<Set<string>>(new Set())
  const [actorsTouched, setActorsTouched] = useState<Set<string>>(new Set())
  // Paging (see SocialTab): loadedCount = rows fetched (routed excluded at query = displayed),
  // total = exact non-routed count for the project, ref lets load() read depth without looping.
  const [loadedCount, setLoadedCount] = useState(0)
  const loadedCountRef = useRef(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Upload-bar error. The DocumentCompose-internal `error` state is per-card and unreachable
  // from here, so the bar needs its own surface for a failed/partial upload.
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set())
  // 3d: the info-page projects (for the per-item project picker + Send target).
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  // T3: the selected project's thematic tag vocabulary (project-scoped, from T1). S5b-2: the
  // vocabulary + registry layer is the shared useThematicTagVocabulary hook (one impl across
  // all four intel tabs); `knownThematic` keeps its name so mounts/inLibrary refs are unchanged.
  const { known: knownThematic, createTag: createThematicTag, deleteTag: deleteThematicTag } =
    useThematicTagVocabulary(project?.id ?? '')
  // Slice 4: per-card collapse state (id → open). Absent = fall back to default-open.
  // Persisted (option b): lazy-init from localStorage so an explicit collapse survives
  // leaving Intelligence; corrupt/missing value falls back to {} without crashing.
  const [openCards, setOpenCards] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(OPENCARDS_KEY) || '{}') || {} } catch { return {} }
  })
  // Persist on every change (only user-toggled entries are ever written).
  useEffect(() => {
    try { localStorage.setItem(OPENCARDS_KEY, JSON.stringify(openCards)) } catch { /* ignore quota/serialize */ }
  }, [openCards])
  // Prune stale ids once the list has loaded, so the store can't grow unbounded. Guarded
  // on a non-empty list (documents is [] before load — pruning then would wipe the store)
  // and no-ops (same ref) when nothing is stale, so it never clobbers present entries.
  useEffect(() => {
    if (documents.length === 0) return
    setOpenCards(prev => {
      const ids = new Set(documents.map(d => d.id))
      const kept = Object.keys(prev).filter(k => ids.has(k))
      if (kept.length === Object.keys(prev).length) return prev
      const next: Record<string, boolean> = {}
      for (const k of kept) next[k] = prev[k]
      return next
    })
  }, [documents])

  const load = useCallback(async (opts?: { background?: boolean; append?: boolean }) => {
    // fresh/append/background modes — see SocialTab. routed excluded at the QUERY so
    // raw-fetched === displayed and offset paging never hides a row.
    const background = opts?.background ?? false
    const append = opts?.append ?? false
    if (!background && !append) setLoading(true)
    if (append) setLoadingMore(true)
    const filters = { type: 'document', excludeStatus: 'routed', ...(project?.id ? { project: project.id } : {}) }
    const offset = append ? loadedCountRef.current : 0
    const limit = background ? Math.max(loadedCountRef.current, PAGE_SIZE) : PAGE_SIZE
    try {
      const data = await window.api.intelligence.getSources({ ...filters, limit, offset })
      if (append) {
        setDocuments(prev => [...prev, ...data])
        const n = loadedCountRef.current + data.length
        loadedCountRef.current = n; setLoadedCount(n)
      } else {
        setDocuments(data)
        loadedCountRef.current = data.length; setLoadedCount(data.length)
      }
    } catch {}
    finally {
      if (!background && !append) setLoading(false)
      if (append) setLoadingMore(false)
    }
    if (!append) window.api.intelligence.getSourcesCount(filters).then(setTotal).catch(() => {})
  }, [project?.id])

  useEffect(() => { load() }, [load])

  // 3d: load the info-page projects once for the picker/Send target.
  useEffect(() => {
    (async () => {
      try {
        // Cloud-first board list (filters deleted=0/archived=0) so deleted info-page boards
        // don't linger in the picker via the stale local mirror. Picker needs only {id,name}.
        const boards = await window.api.boards.list()
        setProjects((boards as Array<{ id: string; name: string; board_type?: string }>)
          .filter(b => b.board_type === 'info-page')
          .map(b => ({ id: b.id, name: b.name })))
      } catch (e) { console.warn('[DocumentsTab] projects load failed:', e) }
    })()
  }, [])

  // S5b-2: the project-scoped tag-vocabulary load + realtime subscription moved into
  // useThematicTagVocabulary (called above). See the hook for the lifted implementation.

  // Realtime: re-fetch the document list when intelligence_sources changes in cloud.
  useEffect(() => {
    window.api.intelligence.onSourcesInvalidate(() => { load({ background: true }) })
    return () => window.api.intelligence.removeSourcesInvalidateListeners()
  }, [load])

  // Reconnect: on offline→online, refetch — postgres_changes never replays the
  // outage window. prevOnlineRef avoids a double-load on mount.
  const prevOnlineRef = useRef(online)
  useEffect(() => {
    const wasOnline = prevOnlineRef.current
    prevOnlineRef.current = online
    if (!online || wasOnline) return
    load({ background: true })
  }, [online, load])

  // S5b-1: geography / actors / confidence editors, wired VERBATIM from NewsTab
  // (handleCountries / handleActors / handleConfidence). The writers are type-agnostic;
  // updateCountries stamps geography_confirmed=1 in the SAME write (implicit confirm). Optimistic
  // patches mirror the DB string format; the touched sets clear the amber AI cue on first edit.
  async function handleCountries(id: string, subject: string[], mentioned: string[], subGeo: Record<string, string[]>) {
    const res = await window.api.intelligence.updateCountries(id, subject, mentioned, subGeo)
    if (!res?.ok) {
      console.error('[DocumentsTab] updateCountries failed — state not updated:', res?.error ?? 'no result')
      return
    }
    setDocuments(prev => prev.map(s => s.id === id ? {
      ...s,
      subject_countries: JSON.stringify(subject),
      mentioned_countries: JSON.stringify(mentioned),
      sub_geographies: JSON.stringify(subGeo),
      geography_confirmed: 1,
    } : s))
    setCountriesTouched(prev => new Set(prev).add(id))
  }
  async function handleActors(id: string, next: { name: string; type: string }[]) {
    await window.api.intelligence.updateActors(id, next)
    setDocuments(prev => prev.map(s => s.id === id ? { ...s, actors: JSON.stringify(next) } : s))
    setActorsTouched(prev => new Set(prev).add(id))
  }
  async function handleConfidence(id: string, confidence: string) {
    await window.api.intelligence.updateConfidence(id, confidence)
    setDocuments(prev => prev.map(s => s.id === id ? { ...s, confidence: confidence as any, confidence_override: 1 } : s))
  }

  async function handleUpload() {
    setUploadError(null)
    setUploading(true)
    try {
      const result = await window.api.intelligence.uploadDocument({
        userId: localUser?.id,
        addedByName: localUser?.name,
        // 0a-1: every uploaded doc is born with the selected project (Upload is
        // disabled when none is selected). Replaces the former non-atomic setProject loop.
        projectBoardId: project?.id,
      })
      // Canceling the file dialog is a NO-OP, not a failure — stay silent.
      if (result.canceled) return
      // `ok` now means "at least one row actually persisted". It used to be hard-coded true,
      // so a total failure looked identical to a success and the user saw nothing at all.
      const failed = result.errors ?? []
      if (!result.ok) {
        setUploadError(
          failed.length
            ? `Upload failed — ${failed.map(f => `${f.file}: ${f.error}`).join('; ')}`
            : 'Upload failed.'
        )
        return
      }
      // Partial success: some rows landed, some didn't. Refresh AND report.
      if (failed.length) setUploadError(`${failed.length} file(s) failed — ${failed.map(f => f.file).join(', ')}`)
      await load()
    } catch (e) {
      // Previously absent: a rejected invoke vanished as an unhandled rejection while the
      // button quietly reset, which is what "nothing happened" looked like.
      setUploadError((e as Error)?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document?')) return
    await window.api.intelligence.deleteSource(id)
    setDocuments(prev => prev.filter(d => d.id !== id))
    // Deleting a non-article drops it from the pending set — refresh the header stat.
    // onApprove() = handleApproved; no args → refreshStats + refreshUnscoredCount, no toast.
    onApprove()
    notifyIntelChanged()   // nudge the Sidebar badge to refetch now, not on its 60s tick
  }

  // 3d: persist the reliable board-id project association (picker change).
  const handleProjectSelect = async (id: string, boardId: string) => {
    await window.api.intelligence.setProject(id, boardId || null)
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, project_board_id: boardId || null } : d))
  }

  // 3d: Send to New sources — route into the selected project's pipeline (stage='new')
  // and drop the item from the compose list (status='routed').
  const handleSend = async (id: string, boardId: string) => {
    if (!online) return   // read-only offline (Send to New sources)
    const res = await window.api.intelligence.routeToProject(id, boardId)
    if (res?.ok) {
      setDocuments(prev => prev.filter(d => d.id !== id))
      onApprove(res.pageName ? [res.pageName] : [])
      notifyIntelChanged()   // routed item leaves the pending set — refresh the Sidebar badge now
    } else if (res?.error) {
      console.warn('[3d] send failed:', res.error)
    }
  }

  // T3: project-scoped topic tags on the compose item (mirrors NewsTab).
  const handleSetTags = async (id: string, tags: string[]) => {
    try {
      const res = await window.api.intelligence.setArticleTags(id, 'thematic', tags)
      const final = res?.tags ?? tags
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, thematic_tags: JSON.stringify(final) } : d))
    } catch (e) { console.warn('[DocumentsTab] setArticleTags failed:', e) }
  }
  const handleCreateTag = async (id: string, current: string[], name: string, boardId: string) => {
    if (!boardId) return
    const created = await createThematicTag(name, boardId)
    if (created && !current.includes(created)) await handleSetTags(id, [...current, created])
  }
  const handleDeleteTag = async (name: string, boardId: string) => {
    if (!boardId) return
    if (!confirm(`Delete tag "${name}" from this project's registry?`)) return
    const res = await deleteThematicTag(name, boardId)
    if (!res.ok) alert(res.error || 'Could not delete the tag.')
  }

  // 2b: patch one document in local state (notes / analysis_json / reconciled_notes)
  // so saves + AI results re-render in place without a full refetch.
  const patchDoc = useCallback((id: string, patch: Partial<IntelligenceSource>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d))
  }, [])

  function formatDate(dateStr: string | null) {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return dateStr }
  }

  function getFileIcon(fileName: string | null) {
    const ext = (fileName || '').split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-red-500">
        <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M4 5h2c.5 0 1 .4 1 1s-.5 1-1 1H4V9M8.5 5h1.5c.3 0 .5.2.5.5s-.2.5-.5.5H8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>
    )
    if (ext === 'docx') return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-blue-500">
        <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M4 5l1.5 4L7 5.5 8.5 9 10 5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-500">
        <path d="M2 12V3a1 1 0 0 1 1-1h5l3 3v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
        <path d="M8 2v3h3" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    )
  }

  // T5: project-scoped view — mirror NewsTab. When a project is selected (project not
  // null / "All"), show only that project's items; changing a card's project (which
  // patches project_board_id in state) makes it drop out here with no refetch.
  const projectScoped = !!project?.id
  const visible = documents.filter(d => !projectScoped || d.project_board_id === project?.id)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Upload bar */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-3">
        <button
          onClick={handleUpload}
          disabled={uploading || !project?.id || !online}
          title={!project?.id ? 'Select a project first' : !online ? 'Unavailable while offline' : ''}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition disabled:opacity-50"
        >
          {uploading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 4l3-3 3 3M2 10v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Upload Documents
            </>
          )}
        </button>
        {uploadError ? (
          <span className="text-xs text-red-500 dark:text-red-400">{uploadError}</span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-white/30">
            {!project?.id
              ? 'Select a project above to add sources.'
              : 'Accepts PDF, DOCX, TXT — text is extracted on upload; AI analysis runs only when you ask'}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400 dark:text-white/30">{visible.length} documents</span>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-400 dark:text-white/30">
                <path d="M3 16V4a1 1 0 0 1 1-1h7l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M11 3v5h5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">No documents uploaded</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Upload PDF, DOCX, or TXT files to analyze with Claude</p>
          </div>
        )}

        {!loading && visible.map(doc => {
          // S6: conf/confStyle removed -- the confidence badge they styled now renders on the
          // SourceCard face below (confidence is carried by core).
          const cats: string[] = (() => { try { return JSON.parse(doc.categories_json || '[]') } catch { return [] } })()
          // 3d: picker default — the doc's project, else the top-dropdown selected project.
          const projectBoardSel = doc.project_board_id || (project?.id ?? '')
          // T3: this item's topic tags (project-scoped write target = projectBoardSel).
          const themaTags = readTags(doc.thematic_tags)

          const isFading = fadingIds.has(doc.id)
          // Slice 4: condensed-summary flags + collapse state. Default-open iff the
          // card already has substance (notes / AI read / reconcile).
          const _analysis = parseAnalysis(doc.analysis_json)
          const _hasNotes = stripHtml(doc.intel_notes || '').trim().length > 0
          const _analyzed = !!_analysis.ai
          const _reconciled = !!_analysis.reconciled || !!doc.reconciled_notes
          const cardOpen = openCards[doc.id] ?? (_hasNotes || _analyzed || _reconciled)
          return (
            <div key={doc.id} className={`bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-4 transition-all duration-300 ${isFading ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                  {getFileIcon(doc.file_name)}
                </div>
                <div className="flex-1 min-w-0">
                  {/* S6: filename now renders as the SourceCard title (Option A); confidence +
                      status badges moved to the SourceCard face. This header row keeps only the
                      byline + added_at date -- docs have no published_at, so the card's date span
                      is empty and the added_at date is NOT duplicated. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {doc.added_by_name && (
                      <span className="text-xs text-gray-400 dark:text-white/30">by {doc.added_by_name}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-white/30">{formatDate(doc.added_at)}</span>
                  </div>
                </div>
                {/* Delete — always available (any status), mirrors InterviewsTab's header delete */}
                {(can('delete_intel_doc') || isRoot) && (
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
                    title="Delete document"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
              </div>

              {/* S6: the unified card face, READ-ONLY (no onChange props). Empty-data guards in
                  SourceCard suppress every article-only zone (snippet/geo/actors/relevance/
                  incident/date) on a document row; title renders the filename (Option A), so this
                  shows the filename + confidence + status -- parity with the header stripped above. */}
              <SourceCard
                core={fromIntelligenceSource(doc)}
                onCountriesChange={(subject, mentioned, subGeo) => handleCountries(doc.id, subject, mentioned, subGeo)}
                onActorsChange={next => handleActors(doc.id, next)}
                onConfidenceChange={v => handleConfidence(doc.id, v)}
                geoTouched={countriesTouched.has(doc.id)}
                actorsTouched={actorsTouched.has(doc.id)}
              />

              {/* Category badges */}
              {cats.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {cats.map(cat => (
                    <span key={cat} className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              {/* Slice 4: collapse toggle — hides the compose panel only; header,
                  category badges and the tail controls stay visible. */}
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-white/[0.06]">
                <button
                  onClick={() => setOpenCards(prev => ({ ...prev, [doc.id]: !cardOpen }))}
                  className="w-full flex items-center gap-2 text-left"
                >
                  <span className="text-[11px] font-medium text-gray-500 dark:text-white/45">Details</span>
                  <span className="flex-1" />
                  <svg width="16" height="16" viewBox="0 0 12 12" fill="none" className={`text-gray-500 dark:text-white/50 transition-transform ${cardOpen ? 'rotate-180' : ''}`}>
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {!cardOpen && (
                  <CondensedSummary hasNotes={_hasNotes} analyzed={_analyzed} reconciled={_reconciled} tagCount={themaTags.length} confidence={doc.confidence} />
                )}
              </div>

              {/* 2b (human-first): notes-primary compose. Researcher notes come FIRST;
                  AI is on-demand (never auto-runs) in a separate box; reconcile is an
                  editable merged read. See DocumentCompose. */}
              {cardOpen && (
                <DocumentCompose
                  doc={doc} project={project} onPatch={patchDoc} formatDate={formatDate}
                  knownThematic={knownThematic} themaTags={themaTags} projectBoardSel={projectBoardSel}
                  onAttachTag={tag => handleSetTags(doc.id, [...themaTags, tag])}
                  onCreateTag={tag => handleCreateTag(doc.id, themaTags, tag, projectBoardSel)}
                />
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
                {/* 3d: project picker (reliable board-id association) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">Project</span>
                  {projects.length > 0 ? (
                    <select
                      value={projectBoardSel}
                      onChange={e => handleProjectSelect(doc.id, e.target.value)}
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
                    onAdd={tag => handleSetTags(doc.id, [...themaTags, tag])}
                    onRemove={tag => handleSetTags(doc.id, themaTags.filter(t => t !== tag))}
                    onCreate={name => handleCreateTag(doc.id, themaTags, name, projectBoardSel)}
                    onDelete={((can('delete_intel_tag') || isRoot) && projectBoardSel) ? tag => handleDeleteTag(tag, projectBoardSel) : undefined}
                    isAdmin={can('delete_intel_tag') || isRoot}
                  />
                ) : (
                  <span className="text-[10px] text-gray-400 dark:text-white/30 italic">Select a project to tag</span>
                )}
                <div className="flex-1" />
                {/* 3d: Send to New sources — routes into the selected project's pipeline */}
                <button
                  onClick={() => handleSend(doc.id, projectBoardSel)}
                  disabled={!projectBoardSel || !online}
                  title={!online ? 'Unavailable while offline' : projectBoardSel ? 'Route this document into the project’s New sources' : 'Select a project first'}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ➤ Send to New sources
                </button>
              </div>
            </div>
          )
        })}

        {/* Paging: honest count + Load more (routed excluded, so this matches the query). */}
        {!loading && total > 0 && (
          <div className="flex flex-col items-center gap-2 pt-3 pb-1">
            <p className="text-xs text-gray-400 dark:text-white/40">Showing {visible.length} of {total}</p>
            {loadedCount < total && (
              <button
                onClick={() => load({ append: true })}
                disabled={loadingMore || !online}
                className="px-4 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.12] text-sm text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// 2b (human-first): the Documents compose area for one card. Order top→bottom:
//   (1) RESEARCHER NOTES — primary, editable, autosaved to intel_notes.
//   (2) AI ANALYSIS — on-demand ONLY (explicit "Analyze with AI"), shown in its own
//       box under analysis_json.ai. Nothing runs until the button is pressed.
//   (3) RECONCILE — once AI + notes exist, an editable merged read (reconciled_notes),
//       seeded from the AI reconcile but freely editable before commit.
// One instance per card (keyed by doc.id), holding its own editor/AI state.
function DocumentCompose({
  doc, project, onPatch, formatDate,
  knownThematic, themaTags, projectBoardSel, onAttachTag, onCreateTag,
}: {
  doc: IntelligenceSource
  project: ProjectInfo
  onPatch: (id: string, patch: Partial<IntelligenceSource>) => void
  formatDate: (d: string | null) => string
  knownThematic: string[]
  themaTags: string[]
  projectBoardSel: string
  onAttachTag: (tag: string) => void
  onCreateTag: (tag: string) => void
}) {
  const [notes, setNotes] = useState<string>(doc.intel_notes || '')
  const [reconciledText, setReconciledText] = useState<string>(doc.reconciled_notes || '')
  const [analyzing, setAnalyzing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analysis = parseAnalysis(doc.analysis_json)
  const ai = analysis.ai as Record<string, any> | undefined
  const reconciledMeta = analysis.reconciled as Record<string, any> | undefined
  const hasAi = !!ai
  const plain = stripHtml(notes)
  const hasNotes = plain.length > 0

  // Autosave researcher notes on blur (only when changed).
  async function saveNotes() {
    if (notes === (doc.intel_notes || '')) return
    try {
      await window.api.intelligence.updateNotes(doc.id, notes)
      onPatch(doc.id, { intel_notes: notes || null })
    } catch { /* transient — next blur retries */ }
  }

  // Autosave the editable reconciled read on blur (only when changed).
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
        text: doc.content || '',
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

  // Reconcile: merge notes + doc into a new read the researcher can then EDIT.
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
        text: doc.content || '',
        userNotes: plain,
        projectConfig: project ? { name: project.name, keywords: project.keywords } : null,
        priorAi: ai,
      })
      if (!res.ok) { setError(res.error); return }
      const savedMeta = await window.api.intelligence.saveReconciled(doc.id, res.result)
      if (!savedMeta.ok) { setError(savedMeta.error); return }
      // Seed the editable field from the AI's reconciled summary (researcher can amend).
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
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06] space-y-4">
      {/* (1) PRIMARY — researcher notes, first */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold uppercase tracking-wide">Primary</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">Researcher notes — your interpretation</span>
          <span className="text-[10px] font-normal text-gray-300 dark:text-white/25">· optional</span>
        </div>
        <RichTextEditor
          value={notes}
          onChange={setNotes}
          onBlur={saveNotes}
          placeholder="Your interpretation, context the AI missed, why this matters for the project…"
          minHeight="80px"
        />
      </div>

      {/* (2) AI — on-demand, separate box; nothing runs until pressed */}
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
                  <SuggestedTagChip
                    key={`${t}-${i}`}
                    tag={t}
                    onArticle={themaTags.includes(normalizeTagClient(t))}
                    inLibrary={knownThematic.includes(normalizeTagClient(t))}
                    canApply={!!projectBoardSel}
                    onAttach={onAttachTag}
                    onCreate={onCreateTag}
                  />
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

      {/* (3) RECONCILE — editable merged read; appears once an AI read exists */}
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
                <SuggestedTagChip
                  key={`${t}-${i}`}
                  tag={t}
                  onArticle={themaTags.includes(normalizeTagClient(t))}
                  inLibrary={knownThematic.includes(normalizeTagClient(t))}
                  canApply={!!projectBoardSel}
                  onAttach={onAttachTag}
                  onCreate={onCreateTag}
                />
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
