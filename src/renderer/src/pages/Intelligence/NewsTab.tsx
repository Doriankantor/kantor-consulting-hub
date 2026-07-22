import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useConnection } from '../../contexts/ConnectionContext'
import RichTextEditor from '../../components/RichTextEditor'
import TagPicker, { normalizeTagClient } from './TagPicker'
import SuggestedTagChip from './SuggestedTagChip'
import { actorTypeClass } from './actorTypeClass'
import { resolveFacts, resolveCaps, type ResolvedFact, type ResolvedCap } from './resolveAnalysis'
import { parseConfig } from './frameworkConfig'

const CONFIDENCE_COLORS = {
  high:   { bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-400',   dot: 'bg-green-500' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-400',   dot: 'bg-amber-500' },
  low:    { bg: 'bg-red-100 dark:bg-red-900/30',       text: 'text-red-700 dark:text-red-400',       dot: 'bg-red-500' },
}

const STATUS_COLORS: Record<string, string> = {
  unreviewed: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300',
  approved:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  rejected:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  saved:      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  pushed:     'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
  imported:   'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
}

const STATUS_LABELS: Record<string, string> = {
  imported: 'Imported — needs confirmation',
}

const ALL_CATEGORIES = [
  'Incident', 'Investment & Procurement', 'Innovation & Technology',
  'Policy & Regulation', 'Criminal & VNSA Activity', 'Counter-drone / C-UAS',
  'State Military Activity', 'Finance & Sanctions', 'Extra-regional Supplier',
]

// Short labels for the gate's proposed relevance type.
const REL_TYPE_LABELS: Record<string, string> = {
  'in-region': 'In-region',
  'supply-side': 'Supply-side',
  'precedent': 'Precedent',
  'escalation-signal': 'Escalation',
  'none': 'None',
}

// Relevance-score badge color tiers: 7-10 green, 4-6 amber, 0-3 red, null gray.
function relevanceBadge(score: number | null): { label: string; cls: string } {
  if (score == null) return { label: '—', cls: 'bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/40' }
  if (score >= 7) return { label: String(score), cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' }
  if (score >= 4) return { label: String(score), cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' }
  return { label: String(score), cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' }
}

function readTags(raw: string | null): string[] {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

// News human layer helpers.
function parseAnalysis(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : {} } catch { return {} }
}
// Plain text from TipTap HTML — used to tell "empty notes" from real content.
function notesText(html: string | null): string {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}
// 3e: return analysis_json with one top-level key replaced, preserving the rest.
function withAnalysisKey(raw: string | null, key: string, block: unknown): string {
  const o = parseAnalysis(raw)
  o[key] = block
  return JSON.stringify(o)
}
// 3e: escape for seeding the reconciled RichTextEditor from the AI summary.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}


interface Props {
  onApprove: (addedToPages?: string[]) => void
  selectedProjectId?: string   // 3a: top-dropdown project (Slice 1) → default for unset cards
}

// News hand-add: the manual "Add article" form. Title is the ONLY required field —
// everything else is optional. An unscoped, ungated article is valid; the researcher
// fills relevance / project / tags post-hoc on the card, exactly like a pipeline row.
const NEWS_EMPTY_FORM = {
  title: '',
  url: '',
  source_name: '',
  published_at: '',
  content: '',
  confidence: '',
  project_board_id: '',
}

// ISO/date string -> yyyy-mm-dd for <input type="date">, or '' if unparseable
// (mirrors SocialTab's toDateInput). Used by the "Read link" autofill.
function toDateInput(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// Paging: how many rows a page fetches. Passed explicitly to getSources; the
// main-side default (limit ?? 100) is left untouched for other callers.
const PAGE_SIZE = 50

export default function NewsTab({ onApprove, selectedProjectId }: Props) {
  const { localUser, isRoot, can } = useAuth()
  const { online } = useConnection()
  const [sources, setSources] = useState<IntelligenceSource[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Phase 3: default to 'unreviewed' so the queue shows only items needing action.
  const [statusFilter, setStatusFilter] = useState('unreviewed')
  const [confidenceFilter, setConfidenceFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [minRelevance, setMinRelevance] = useState(0)
  const [search, setSearch] = useState('')
  const [geoEdit, setGeoEdit] = useState<{ id: string; value: string } | null>(null)
  const [pendingStatus, setPendingStatus] = useState<Record<string, boolean>>({})
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set())
  // Phase 1: project list sourced from info-page boards (replaces disposition tag registry).
  const [projects, setProjects] = useState<Array<{ id: string; name: string; keywords?: string }>>([])
  // Phase 3: live count badges (Pending / Approved / Rejected).
  const [statusCounts, setStatusCounts] = useState({ unreviewed: 0, approved: 0, rejected: 0 })
  // Paging: loadedCount = RAW rows fetched so far (pre-'Kantor Framework' filter, so the
  // next offset stays aligned with the DB). total = exact count for the current query.
  // The ref lets load() read the depth without depending on it (which would loop the
  // filter-driven effect). loadingMore drives the button spinner.
  const [loadedCount, setLoadedCount] = useState(0)
  const loadedCountRef = useRef(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  // Phase 4: gate error state per article + force-open topic picker.
  const [gateError, setGateError] = useState<Record<string, { missingProject: boolean; missingTopic: boolean }>>({})
  const [forceOpenTopicId, setForceOpenTopicId] = useState<string | null>(null)
  // Topic tag registry (thematic — the only picker that stays).
  const [knownThematic, setKnownThematic] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [confirmingImported, setConfirmingImported] = useState(false)
  // News human layer: per-card elongating footer open state + in-progress note drafts.
  const [openFooter, setOpenFooter] = useState<Record<string, boolean>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  // 3e: per-source keyed state for the rich human-first footer (article text + AI + reconcile).
  const [contentDrafts, setContentDrafts]       = useState<Record<string, string>>({})
  const [reconciledDrafts, setReconciledDrafts] = useState<Record<string, string>>({})
  const [analyzingId, setAnalyzingId]           = useState<string | null>(null)
  const [reconcilingId, setReconcilingId]       = useState<string | null>(null)
  const [aiErr, setAiErr]                        = useState<Record<string, string>>({})
  // Per-card STATUS-write error. Deliberately NOT aiErr: analyze/reconcile blank aiErr on
  // entry (so a status error would be silently erased), and aiErr renders inside the
  // compose panel, which is hidden on a collapsed card — exactly the case here.
  const [statusError, setStatusError]            = useState<Record<string, string>>({})
  // Duplicate slice: modal state for marking an article a duplicate of another.
  const [dupModalFor, setDupModalFor] = useState<string | null>(null)   // article id being marked duplicate, or null
  const [dupSearch, setDupSearch]     = useState('')
  const [dupResults, setDupResults]   = useState<Array<{ id: string; title: string; source_name?: string; published_at?: string }>>([])
  const [dupChosen, setDupChosen]     = useState<{ id: string; title: string } | null>(null)
  const [dupSearching, setDupSearching] = useState(false)
  // Duplicate auto-suggest: likely originals seeded from the article's title on modal open.
  const [dupSuggestions, setDupSuggestions] = useState<Array<{ id: string; title: string; source_name?: string; published_at?: string }>>([])
  const [dupSuggesting, setDupSuggesting]   = useState(false)
  // News hand-add: the "Add article" panel + its form (author = localUser?.name).
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [newsForm, setNewsForm] = useState({ ...NEWS_EMPTY_FORM })
  const [newsErrors, setNewsErrors] = useState<Record<string, string>>({})
  const [newsFormError, setNewsFormError] = useState<string | null>(null)
  const [newsDup, setNewsDup] = useState<{ existingId?: string; existingTitle?: string; notVisible?: boolean } | null>(null)
  // "Read link" autofill: in-flight flag + a plain-language result note (success caveat or failure reason).
  const [newsFetching, setNewsFetching] = useState(false)
  const [newsFetchNote, setNewsFetchNote] = useState<string | null>(null)
  const [newsSaving, setNewsSaving] = useState(false)
  // News hand-add: briefly ring the card a "jump to existing" action scrolls to.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // KEY FACTS / SYSTEMS in-place editing: which cell is open, its draft, last write error.
  // Cell id: `${sourceId}|fact|${label}` or `${sourceId}|cap|${key}|${field}`.
  const [editCell, setEditCell]   = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const skipBlur = useRef(false)   // set when Esc closes the input, so the ensuing blur doesn't commit

  // Autosave researcher notes to intel_notes (existing row → safe). Save-if-changed.
  async function saveNote(id: string) {
    const draft = noteDrafts[id]
    if (draft === undefined) return
    const current = sources.find(s => s.id === id)?.intel_notes || ''
    if (draft === current) return
    try {
      await window.api.intelligence.updateNotes(id, draft)
      setSources(prev => prev.map(s => s.id === id ? { ...s, intel_notes: draft || null } : s))
    } catch (e) { console.warn('[NewsTab] updateNotes failed:', e) }
  }

  // 3e: save pasted article text → content (save-if-changed).
  async function saveContent(id: string) {
    const draft = contentDrafts[id]
    if (draft === undefined) return
    const current = sources.find(s => s.id === id)?.content || ''
    if (draft === current) return
    try {
      await window.api.intelligence.updateContent(id, draft)
      setSources(prev => prev.map(s => s.id === id ? { ...s, content: draft } : s))
    } catch (e) { console.warn('[NewsTab] updateContent failed:', e) }
  }

  // 3e: on-demand AI read over the PASTED article text (task='relevance', project-aware).
  async function analyzeSource(id: string) {
    if (analyzingId) return
    // use the pasted draft if present, else the stored content
    const text = contentDrafts[id] ?? (sources.find(s => s.id === id)?.content || '')
    setAnalyzingId(id); setAiErr(p => ({ ...p, [id]: '' }))
    try {
      // persist the pasted text first so analysis + later reload agree
      await saveContent(id)
      const src = sources.find(s => s.id === id)
      const boardId = src?.project_board_id
      const proj = boardId ? projects.find(p => p.id === boardId) : null
      const res = await window.api.intelligence.analyzeText({
        task: 'relevance',
        text,
        projectConfig: proj ? { name: proj.name, keywords: proj.keywords } : null,
        existingTags: knownThematic,   // T7: bias the AI toward reusing existing project tags
      })
      if (!res.ok) { setAiErr(p => ({ ...p, [id]: res.error || 'Analysis failed.' })); return }
      const saved = await window.api.intelligence.saveAiAnalysis(id, res.result)
      if (!saved.ok) { setAiErr(p => ({ ...p, [id]: saved.error || 'Save failed.' })); return }
      setSources(prev => prev.map(s => s.id === id ? { ...s, analysis_json: withAnalysisKey(s.analysis_json, 'ai', saved.ai) } : s))
    } catch (e) { setAiErr(p => ({ ...p, [id]: (e as Error)?.message || 'Analysis failed.' })) }
    finally { setAnalyzingId(null) }
  }

  // 3e: merge notes + article into an editable reconciled read (task='reconcile').
  async function reconcileSource(id: string) {
    if (reconcilingId) return
    const src = sources.find(s => s.id === id)
    if (!src) return
    const notesHtml = noteDrafts[id] ?? (src.intel_notes || '')
    const plainNotes = notesText(notesHtml)
    setReconcilingId(id); setAiErr(p => ({ ...p, [id]: '' }))
    try {
      if (notesHtml !== (src.intel_notes || '')) {
        await window.api.intelligence.updateNotes(id, notesHtml)
        setSources(prev => prev.map(s => s.id === id ? { ...s, intel_notes: notesHtml || null } : s))
      }
      const text = contentDrafts[id] ?? (src.content || '')
      const priorAi = (parseAnalysis(src.analysis_json) as any).ai as Record<string, any> | undefined
      const boardId = src.project_board_id
      const proj = boardId ? projects.find(p => p.id === boardId) : null
      const res = await window.api.intelligence.analyzeText({
        task: 'reconcile', text, userNotes: plainNotes,
        projectConfig: proj ? { name: proj.name, keywords: proj.keywords } : null,
        existingTags: knownThematic,   // T7: bias the AI toward reusing existing project tags
        priorAi,
      })
      if (!res.ok) { setAiErr(p => ({ ...p, [id]: res.error || 'Reconcile failed.' })); return }
      const savedMeta = await window.api.intelligence.saveReconciled(id, res.result)
      if (!savedMeta.ok) { setAiErr(p => ({ ...p, [id]: savedMeta.error || 'Save failed.' })); return }
      const seeded = res.result.summary ? `<p>${escapeHtml(res.result.summary)}</p>` : (reconciledDrafts[id] || '')
      await window.api.intelligence.updateReconciledNotes(id, seeded)
      setReconciledDrafts(p => ({ ...p, [id]: seeded }))
      setSources(prev => prev.map(s => s.id === id ? { ...s, analysis_json: withAnalysisKey(s.analysis_json, 'reconciled', savedMeta.reconciled), reconciled_notes: seeded || null } : s))
    } catch (e) { setAiErr(p => ({ ...p, [id]: (e as Error)?.message || 'Reconcile failed.' })) }
    finally { setReconcilingId(null) }
  }

  // 3e: autosave the editable reconciled read (save-if-changed).
  async function saveReconciledText(id: string) {
    const draft = reconciledDrafts[id]
    if (draft === undefined) return
    const current = sources.find(s => s.id === id)?.reconciled_notes || ''
    if (draft === current) return
    try {
      await window.api.intelligence.updateReconciledNotes(id, draft)
      setSources(prev => prev.map(s => s.id === id ? { ...s, reconciled_notes: draft } : s))
    } catch (e) { console.warn('[NewsTab] updateReconciledNotes failed:', e) }
  }

  // Researcher relevance override → analysis_json.human (gate-safe; never relevance_score).
  async function handleHumanRelevance(id: string, value: string) {
    try {
      const res = await window.api.intelligence.setHumanRelevance(id, value || null)
      if (!res.ok) return
      setSources(prev => prev.map(s => {
        if (s.id !== id) return s
        let a: Record<string, unknown> = {}
        try { a = s.analysis_json ? JSON.parse(s.analysis_json) : {} } catch { a = {} }
        if (res.human) a.human = res.human; else delete a.human
        return { ...s, analysis_json: JSON.stringify(a) }
      }))
    } catch (e) { console.warn('[NewsTab] setHumanRelevance failed:', e) }
  }

  // --- KEY FACTS / SYSTEMS in-place editing (analysis_json.human.overrides) ---------------
  // Overrides live OUTSIDE analysis.ai (Part A), so re-analysis never clobbers an edit.
  function startEdit(cellId: string, seed: string) { skipBlur.current = false; setEditCell(cellId); setEditDraft(seed ?? ''); setEditError(null) }

  // Write one override, then optimistically patch the row's analysis from the returned
  // { human } — same pattern handleHumanRelevance uses. patch === null clears the override.
  // Returns false (and surfaces the error inline) on a non-ok/thrown result.
  async function saveOverride(id: string, kind: 'key_fact' | 'capability', key: string, patch: Record<string, unknown> | null): Promise<boolean> {
    try {
      const res = await window.api.intelligence.setAnalysisOverride(id, kind, key, patch)
      if (!res.ok) { setEditError(res.error || 'Save failed'); return false }
      setSources(prev => prev.map(s => {
        if (s.id !== id) return s
        let a: Record<string, unknown> = {}
        try { a = s.analysis_json ? JSON.parse(s.analysis_json) : {} } catch { a = {} }
        if (res.human) a.human = res.human; else delete a.human
        return { ...s, analysis_json: JSON.stringify(a) }
      }))
      setEditError(null)
      return true
    } catch (e) { console.warn('[NewsTab] setAnalysisOverride failed:', e); setEditError('Save failed'); return false }
  }

  // Commit a KEY FACT value. No-op when unchanged; clears the override when back to the AI value.
  async function commitFact(id: string, f: ResolvedFact) {
    const trimmed = editDraft.trim()
    setEditCell(null)   // return to display immediately; the optimistic patch lands on success
    if (trimmed === (f.value ?? '')) return                              // unchanged → no write
    const aiOriginal = f.edited ? (f.aiValue ?? '') : f.value
    if (trimmed === aiOriginal) { await saveOverride(id, 'key_fact', f.label, null); return }  // back to AI → clear
    await saveOverride(id, 'key_fact', f.label, { value: trimmed })
  }

  // Commit one SYSTEMS cell. Sends only the changed field; clears the whole entry if the cap
  // now matches the AI on every field (the merger can only clear a whole entry, not one field).
  const CAP_FIELDS = ['system', 'actor', 'actor_type', 'cost', 'category'] as const
  async function commitCap(id: string, c: ResolvedCap, field: typeof CAP_FIELDS[number], rawVal: string) {
    const val = (rawVal ?? '').toString().trim()
    setEditCell(null)
    const cur = ((c as Record<string, any>)[field] ?? '').toString()
    if (val === cur) return                                             // unchanged → no write
    const aiCap = (c.ai ?? c) as Record<string, any>
    const prospectiveEqualsAi = CAP_FIELDS.every(fld => {
      const next = (fld === field ? val : ((c as Record<string, any>)[fld] ?? '')).toString()
      return next === (aiCap[fld] ?? '').toString()
    })
    if (prospectiveEqualsAi) { await saveOverride(id, 'capability', c.key, null); return }   // fully back to AI → clear
    await saveOverride(id, 'capability', c.key, { [field]: val })
  }

  // Shared click-to-edit text cell. Enter/blur commit, Esc cancels (skipBlur guards the
  // unmount blur). `display` overrides the shown label when not editing.
  function editableText(cellId: string, current: string, onCommit: (v: string) => void, opts?: { display?: ReactNode; className?: string; inputClassName?: string }): ReactNode {
    if (editCell === cellId) {
      return (
        <input
          autoFocus
          value={editDraft}
          onChange={e => setEditDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() }
            else if (e.key === 'Escape') { e.preventDefault(); skipBlur.current = true; (e.currentTarget as HTMLInputElement).blur() }
          }}
          onBlur={() => { if (skipBlur.current) { skipBlur.current = false; setEditCell(null); return } onCommit(editDraft) }}
          className={`px-1 py-0.5 rounded border border-indigo-300 dark:border-indigo-500/40 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-400 ${opts?.inputClassName || 'w-full'}`}
        />
      )
    }
    return (
      <button
        type="button"
        onClick={() => startEdit(cellId, current)}
        className={`text-left hover:underline decoration-dotted decoration-gray-400 underline-offset-2 ${opts?.className || ''}`}
        title="Click to edit"
      >
        {opts?.display ?? (current || <span className="italic text-gray-300 dark:text-white/25">add</span>)}
      </button>
    )
  }

  // actor_type is constrained to the card's existing vocabulary; edit via a native select.
  function editableActorType(cellId: string, c: ResolvedCap, onCommit: (v: string) => void): ReactNode {
    if (editCell === cellId) {
      return (
        <select
          autoFocus
          value={editDraft}
          onChange={e => { setEditDraft(e.target.value); onCommit(e.target.value) }}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); skipBlur.current = true; (e.currentTarget as HTMLSelectElement).blur() } }}
          onBlur={() => { if (skipBlur.current) { skipBlur.current = false; setEditCell(null) } }}
          className="px-1 py-0.5 rounded border border-indigo-300 dark:border-indigo-500/40 bg-white dark:bg-gray-800 text-[9px] uppercase font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          {['', 'VNSA', 'state', 'commercial', 'unknown'].map(v => <option key={v || 'blank'} value={v}>{v || '—'}</option>)}
        </select>
      )
    }
    return (
      <button
        type="button"
        onClick={() => startEdit(cellId, c.actor_type || '')}
        className={`px-1 py-0.5 rounded text-[9px] font-medium uppercase ${c.actor_type ? actorTypeClass(c.actor_type) : 'bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/30'}`}
        title="Click to edit"
      >
        {c.actor_type || 'type'}
      </button>
    )
  }

  const refreshImportedCount = useCallback(async () => {
    try { setImportedCount(await window.api.intelligence.getImportedCount()) } catch { /* ignore */ }
  }, [])

  // Phase 3: refresh the three live count badges — now scoped to the selected project.
  const refreshStatusCounts = useCallback(async () => {
    try {
      const project = selectedProjectId && selectedProjectId !== 'all' ? selectedProjectId : undefined
      const c = await window.api.intelligence.getStatusCounts(project)
      setStatusCounts(c)
    } catch { /* ignore */ }
  }, [selectedProjectId])

  const load = useCallback(async (opts?: { background?: boolean; append?: boolean }) => {
    // Three modes:
    //  fresh (default) — filter/project change: offset 0, one page, REPLACE, spinner.
    //  append          — "Load more": offset = depth, one page, APPEND, no spinner.
    //  background      — realtime echo/reconnect: ONE query, limit = current depth,
    //                    offset 0, REPLACE. Preserves how far the user paged without a
    //                    snap-back to page one and without append/dedupe logic (2d).
    const background = opts?.background ?? false
    const append = opts?.append ?? false
    if (!background && !append) setLoading(true)
    if (append) setLoadingMore(true)
    // Server-side filters (shared by the page query AND the exact-count query).
    const project = selectedProjectId && selectedProjectId !== 'all' ? selectedProjectId : undefined
    const filters: { type: string; status?: string; confidence?: string; category?: string; search?: string; project?: string } = { type: 'article' }
    if (statusFilter)     filters.status     = statusFilter
    if (confidenceFilter) filters.confidence = confidenceFilter
    if (categoryFilter)   filters.category   = categoryFilter
    if (search)           filters.search     = search
    if (project)          filters.project    = project
    const offset = append ? loadedCountRef.current : 0
    const limit = background ? Math.max(loadedCountRef.current, PAGE_SIZE) : PAGE_SIZE
    try {
      const data = await window.api.intelligence.getSources({ ...filters, limit, offset })
      // Framework references (Kantor Consulting + FIU publications) are FIXED
      // citations, not news — they must never appear in the News Articles feed.
      const rows = data.filter((s) => s.added_by_name !== 'Kantor Framework')
      if (append) {
        setSources(prev => [...prev, ...rows])
        const n = loadedCountRef.current + data.length
        loadedCountRef.current = n; setLoadedCount(n)
      } else {
        setSources(rows)
        loadedCountRef.current = data.length; setLoadedCount(data.length)
      }
    } catch (e) {
      console.error('[NewsTab] load error:', e)
    } finally {
      if (!background && !append) setLoading(false)
      if (append) setLoadingMore(false)
    }
    // Exact total for the "Showing X of Y" line + the Load-more gate (same server
    // filters, sans limit/offset). Not needed on append — the total is filter-scoped.
    if (!append) window.api.intelligence.getSourcesCount(filters).then(setTotal).catch(() => {})
    refreshImportedCount()
    refreshStatusCounts()
  }, [statusFilter, confidenceFilter, categoryFilter, search, selectedProjectId, refreshImportedCount, refreshStatusCounts])

  useEffect(() => { load() }, [load])

  // Phase 1: load projects from existing info-page boards.
  useEffect(() => {
    (async () => {
      try {
        // Cloud-first board list (filters deleted=0/archived=0), same source the Info Pages
        // list uses — so a deleted info-page board no longer lingers in the picker via the
        // stale local mirror. Carry keywords from board_config (parsed the SAME way the parent
        // does for the other tabs) so project-aware analysis is judged against the project's
        // collection keywords, not generically.
        const boards = await window.api.boards.list()
        setProjects((boards as Array<{ id: string; name: string; board_type?: string; board_config?: string | null }>)
          .filter(b => b.board_type === 'info-page')
          .map(b => ({ id: b.id, name: b.name, keywords: parseConfig(b.board_config).keywords })))
      } catch (e) { console.warn('[NewsTab] projects load failed:', e) }
    })()
  }, [])

  // T1: the topic-tag registry is now PROJECT-SCOPED. Load the currently selected
  // project's vocabulary (the top dropdown) and reload when it changes. When the
  // dropdown is 'all' or empty there is no project scope → load nothing.
  useEffect(() => {
    (async () => {
      const boardId = selectedProjectId && selectedProjectId !== 'all' ? selectedProjectId : ''
      if (!boardId) { setKnownThematic([]); return }
      try {
        const t = await window.api.intelligence.getKnownTags('thematic', boardId)
        setKnownThematic(t || [])
      } catch (e) { console.warn('[NewsTab] known-tags load failed:', e) }
    })()
  }, [selectedProjectId])

  // Realtime: re-fetch this project's tag vocabulary when known_tags changes in cloud.
  useEffect(() => {
    const boardId = selectedProjectId && selectedProjectId !== 'all' ? selectedProjectId : ''
    window.api.intelligence.onTagsInvalidate((d) => {
      if (!boardId) return
      if (d.boardId && d.boardId !== boardId) return
      window.api.intelligence.getKnownTags('thematic', boardId).then(setKnownThematic).catch(() => {})
    })
    return () => window.api.intelligence.removeTagsInvalidateListeners()
  }, [selectedProjectId])

  // Realtime: re-fetch the list + count badges when intelligence_sources changes
  // in cloud (another device approved/rejected/deleted). load() already refetches
  // sources + the counts.
  useEffect(() => {
    window.api.intelligence.onSourcesInvalidate(() => { load({ background: true }) })
    return () => window.api.intelligence.removeSourcesInvalidateListeners()
  }, [load])

  // Reconnect: on offline→online, refetch — realtime's postgres_changes never
  // replays the outage window. prevOnlineRef avoids a double-load on mount.
  const prevOnlineRef = useRef(online)
  useEffect(() => {
    const wasOnline = prevOnlineRef.current
    prevOnlineRef.current = online
    if (!online || wasOnline) return
    load({ background: true })
  }, [online, load])

  // Duplicate slice: search candidate originals while the modal is open (excludes self).
  useEffect(() => {
    if (!dupModalFor || dupSearch.trim().length < 2) { setDupResults([]); return }
    let cancelled = false
    setDupSearching(true)
    window.api.intelligence.getSources({ type: 'article', search: dupSearch.trim() })
      .then((rows: any[]) => { if (!cancelled) setDupResults(rows.filter(r => r.id !== dupModalFor).slice(0, 20)) })
      .catch(() => { if (!cancelled) setDupResults([]) })
      .finally(() => { if (!cancelled) setDupSearching(false) })
    return () => { cancelled = true }
  }, [dupSearch, dupModalFor])

  // Duplicate slice: Esc closes the modal while it's open.
  useEffect(() => {
    if (!dupModalFor) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeDupModal() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dupModalFor])

  async function handleRefreshNews() {
    setRefreshing(true)
    try {
      const result = await window.api.intelligence.fetchNews()
      if (result.ok) { await load({ background: true }) }
    } finally {
      setRefreshing(false)
    }
  }

  // "Read link": fetch the pasted URL's <head> metadata and autofill ONLY the blank fields
  // (never overwrite what the researcher already typed). The fetcher reads meta tags only,
  // so `content` is the summary blurb, not the full article — the note says so. On any
  // failure the form is left UNTOUCHED and a plain-language reason is shown. Never fakes success.
  async function handleReadNewsLink() {
    const u = newsForm.url.trim()
    if (!u || newsFetching) return
    setNewsFetching(true)
    setNewsFetchNote(null)
    try {
      const res = await window.api.intelligence.fetchUrlMetadata(u)
      if (res.ok) {
        const m = res.metadata
        setNewsForm(f => ({
          ...f,
          title:        f.title.trim()       ? f.title       : (m.title || f.title),
          source_name:  f.source_name.trim() ? f.source_name : (m.site_name || f.source_name),
          published_at: f.published_at       ? f.published_at : (toDateInput(m.published) || f.published_at),
          content:      f.content.trim()     ? f.content     : (m.description || f.content),
          url:          m.url || f.url,   // resolved/canonical url normalizes what they pasted
        }))
        setNewsFetchNote("Filled from the page's metadata. Content is the summary blurb, not the full article — paste the article text if you need it.")
      } else {
        const REASONS: Record<string, string> = {
          blocked:      'That site blocked the request. Fill the fields in manually.',
          timeout:      'The page took too long to respond. Try again or fill in manually.',
          not_html:     "That link isn't a web page we can read. Fill in manually.",
          invalid_url:  "That doesn't look like a valid URL.",
          fetch_failed: "Couldn't reach that page. Fill in manually.",
        }
        setNewsFetchNote(REASONS[res.reason] || "Couldn't read this link — fill in manually.")
      }
    } catch {
      setNewsFetchNote("Couldn't read this link — fill in manually.")
    } finally {
      setNewsFetching(false)
    }
  }

  // News hand-add: submit the manual "Add article" form. Title is required; author must
  // be the real user's display name — News hides 'Kantor Framework' rows, so that author
  // (or none) would save a row that reports success yet never renders. The three addNews
  // outcomes are handled explicitly (ok → reset+close+refetch; duplicate → keep open,
  // offer to jump; error → keep open, surface it). Never a bare catch, never fake success.
  async function handleAddNews() {
    const errs: Record<string, string> = {}
    if (!newsForm.title.trim()) errs.title = 'Title is required'
    if (!newsForm.project_board_id) errs.project_board_id = "Pick a project — articles without one won't appear in any project's queue."
    setNewsErrors(errs)
    if (Object.keys(errs).length) return
    setNewsFormError(null)
    setNewsDup(null)

    const author = (localUser?.name ?? '').trim()
    if (!author || author === 'Kantor Framework') {
      setNewsFormError('Your account has no display name set — cannot attribute the article.')
      return
    }

    setNewsSaving(true)
    try {
      const content = newsForm.content.trim()
      const row = {
        title: newsForm.title.trim(),
        url: newsForm.url.trim() || null,
        source_name: newsForm.source_name.trim() || null,
        published_at: newsForm.published_at || null,
        content: content || null,
        snippet: content ? content.slice(0, 300) : null,
        confidence: newsForm.confidence || null,
        project_board_id: newsForm.project_board_id || null,
        added_by_name: author,
        added_by_id: localUser?.id ?? null,
      }
      const res = await window.api.intelligence.addNews(row)
      if (res.ok) {
        setNewsForm({ ...NEWS_EMPTY_FORM })
        setNewsErrors({})
        setNewsFetchNote(null)
        setShowAddPanel(false)
        await load()
        return
      }
      if (res.duplicate) {
        setNewsDup({ existingId: res.existingId, existingTitle: res.existingTitle })
        return
      }
      setNewsFormError(res.error || 'Could not save the article.')
    } catch (e) {
      setNewsFormError((e as Error)?.message || 'Could not save the article.')
    } finally {
      setNewsSaving(false)
    }
  }

  // News hand-add: jump to the article a duplicate collided with. Scrolls its card into
  // view + briefly rings it. If that card isn't currently rendered (filtered out / other
  // project), flag notVisible so the panel tells the user instead of scrolling to nothing.
  function goToExisting(id?: string) {
    if (!id) return
    const el = document.getElementById(`news-card-${id}`)
    if (!el) { setNewsDup(d => (d ? { ...d, notVisible: true } : d)); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(id)
    setNewsFetchNote(null)
    setShowAddPanel(false)
    window.setTimeout(() => setHighlightId(cur => (cur === id ? null : cur)), 2000)
  }

  async function handleConfirmImported() {
    if (!online) return   // read-only offline (bulk approve)
    setConfirmingImported(true)
    try {
      const res = await window.api.intelligence.confirmImported({
        confidence: 'medium',
        reviewedById: localUser?.id,
        reviewedByName: localUser?.name,
      })
      await load()
      onApprove(res?.addedToPages)
    } finally {
      setConfirmingImported(false)
    }
  }

  async function handleStatus(id: string, status: string) {
    if (!online) return   // read-only offline (Approve/Reject/Save)
    setPendingStatus(p => ({ ...p, [id]: true }))
    // Snapshot BEFORE write for decision log (Phase 5).
    const snap = sources.find(s => s.id === id)
    try {
      const res = await window.api.intelligence.updateStatus(
        id, status, undefined,
        localUser?.id, localUser?.name
      )
      // GATE EVERY CONSEQUENCE OF THE WRITE ON res.ok. updateStatus now returns
      // {ok:false,error} for a row that no longer exists (the phantom-row guard). The
      // decision log, the badge, the optimistic counts and — worst of all — the FADE that
      // removes the card from the queue must not fire for a write that never landed.
      // Order inside the else is UNCHANGED from before the gate.
      if (!res.ok) {
        setStatusError(prev => ({ ...prev, [id]: res.error || 'Could not update.' }))
      } else {
        setStatusError(prev => { const n = { ...prev }; delete n[id]; return n })
        // Phase 5: log every Approve/Reject/Save as a decision. Never block on this.
        if (snap) {
          const action = status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : 'correct'
          try {
            await window.api.intelligence.logDecision({
              articleId: id,
              action,
              aiProposed: {
                relevance_score: snap.relevance_score ?? null,
                relevance_type: snap.relevance_type ?? null,
                geography: snap.geography ?? null,
                region: snap.region ?? null,
                gate_reasoning: snap.gate_reasoning ?? null,
              },
              humanFinal: {
                status,
                confidence: snap.confidence ?? null,
                geography: snap.geography ?? null,
                geography_confirmed: snap.geography_confirmed ?? 0,
                disposition_tags: readTags(snap.disposition_tags),
                thematic_tags: readTags(snap.thematic_tags),
              },
              reason: null,
            })
          } catch (e) { console.warn('[NewsTab] logDecision failed:', e) }
        }
        // Update badge in-place — do NOT call load() so scroll position is preserved.
        setSources(prev => prev.map(s => s.id === id ? { ...s, status: status as any } : s))
        // Phase 3: optimistic count update for Approve / Reject.
        if (status === 'approved') {
          setStatusCounts(prev => ({ ...prev, unreviewed: Math.max(0, prev.unreviewed - 1), approved: prev.approved + 1 }))
        } else if (status === 'rejected') {
          setStatusCounts(prev => ({ ...prev, unreviewed: Math.max(0, prev.unreviewed - 1), rejected: prev.rejected + 1 }))
        }
        // Phase 3: when viewing the unreviewed queue (default), fade approved/rejected out.
        if (statusFilter && status !== statusFilter) {
          setFadingIds(f => new Set([...f, id]))
          setTimeout(() => {
            setSources(curr => curr.filter(s => s.id !== id))
            setFadingIds(f => { const n = new Set(f); n.delete(id); return n })
          }, 350)
        }
      }
      // onApprove fires on BOTH paths — deliberately. refreshStats/refreshUnscoredCount are
      // exactly what a stale-or-phantom card needs, and the toast self-guards (addedToPages
      // is undefined when the write failed). Do NOT move this into the else.
      if (status === 'approved') onApprove(res?.addedToPages)
      else onApprove()
    } finally {
      setPendingStatus(p => ({ ...p, [id]: false }))
    }
  }

  // "Make unreviewed" — undo a Save, flipping a 'saved' article back to the queue. Deliberately
  // NOT routed through handleStatus (which would stamp a reviewer, log a decision, and push an
  // 'unreviewed' verdict to Supabase). Pure status flip; surfaces failures like the other actions.
  async function handleMakeUnreviewed(id: string) {
    if (!online) return
    setPendingStatus(p => ({ ...p, [id]: true }))
    try {
      const res = await window.api.intelligence.revertToUnreviewed(id)
      if (!res.ok) {
        setStatusError(prev => ({ ...prev, [id]: res.error || 'Could not update.' }))
        return
      }
      setStatusError(prev => { const n = { ...prev }; delete n[id]; return n })
      setSources(prev => prev.map(s => s.id === id ? { ...s, status: 'unreviewed' as any } : s))
      // 'saved' is in no badge → nothing to decrement; the pending queue gains one.
      setStatusCounts(prev => ({ ...prev, unreviewed: prev.unreviewed + 1 }))
      // Mirror handleStatus's fade: drop the card from the current view when it no longer matches.
      if (statusFilter && statusFilter !== 'unreviewed') {
        setFadingIds(f => new Set([...f, id]))
        setTimeout(() => {
          setSources(curr => curr.filter(s => s.id !== id))
          setFadingIds(f => { const n = new Set(f); n.delete(id); return n })
        }, 350)
      }
    } finally {
      setPendingStatus(p => ({ ...p, [id]: false }))
    }
  }

  async function handleConfidence(id: string, confidence: string) {
    await window.api.intelligence.updateConfidence(id, confidence)
    setSources(prev => prev.map(s => s.id === id ? { ...s, confidence: confidence as any, confidence_override: 1 } : s))
  }

  // Duplicate slice: mark as duplicate. NO learning signal — does NOT go through
  // updateStatus/handleStatus (no logDecision, no pushVerdictToSupabase). Drops the
  // card from the queue optimistically, exactly like reject's fade at handleStatus.
  // Auto-suggest tokenizer: lowercase, strip punctuation, drop stopwords + <4-char tokens.
  // The signal-carrying tokens (usually proper nouns) are what make a good duplicate seed.
  const DUP_STOPWORDS = new Set(['a','an','the','of','in','on','for','to','and','with','as','at','by','from','after','says','said','new','over','amid','its','is','are','be'])
  function dupTitleTokens(title: string): string[] {
    return (title || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 4 && !DUP_STOPWORDS.has(t))
  }
  function openDupModal(id: string) {
    setDupModalFor(id); setDupSearch(''); setDupResults([]); setDupChosen(null); setDupSuggestions([])
    // Seed likely originals from the article's TITLE (not source_name — a duplicate is the
    // same story from a DIFFERENT outlet, so same-outlet rows are the least likely matches).
    const srcTokens = dupTitleTokens(sources.find(s => s.id === id)?.title || '')
    if (srcTokens.length === 0) { setDupSuggesting(false); return }  // no usable token → no suggestions
    const seeds = [...srcTokens].sort((a, b) => b.length - a.length).slice(0, 2)  // 2 longest = most distinctive
    const srcTokenSet = new Set(srcTokens)
    setDupSuggesting(true)
    void (async () => {
      try {
        // One query per seed token (LIKE rarely hits on a multi-word phrase); merge, dedupe by id.
        const merged = new Map<string, any>()
        for (const token of seeds) {
          const rows: any[] = await window.api.intelligence.getSources({ type: 'article', search: token })
          for (const r of rows) {
            if (r.id === id) continue                 // exclude self
            if (r.status === 'duplicate') continue    // exclude rows already marked duplicate
            if (!merged.has(r.id)) merged.set(r.id, r)
          }
        }
        // Rank by shared-title-token overlap desc, tie-break published_at desc; keep top 5.
        const ranked = [...merged.values()]
          .map(r => ({ r, overlap: dupTitleTokens(r.title || '').filter(t => srcTokenSet.has(t)).length }))
          .sort((a, b) => b.overlap - a.overlap
            || String(b.r.published_at || '').localeCompare(String(a.r.published_at || '')))
          .slice(0, 5)
          .map(x => x.r)
        setDupSuggestions(ranked)
      } catch (e) {
        // Surface (don't swallow): drop the suggestions, typed search still works.
        console.warn('[NewsTab] dup auto-suggest failed:', e)
        setDupSuggestions([])
      } finally {
        setDupSuggesting(false)
      }
    })()
  }
  function closeDupModal() { setDupModalFor(null); setDupSearch(''); setDupResults([]); setDupChosen(null); setDupSuggestions([]); setDupSuggesting(false) }
  async function markDuplicate(id: string, originalId: string | null) {
    if (!online) return   // read-only offline (Duplicate — creates a row)
    try {
      await window.api.intelligence.markDuplicate(id, originalId)
      // drop from the current (unreviewed) view like reject does, no learning signal
      setFadingIds(f => new Set([...f, id]))
      setTimeout(() => {
        setSources(curr => curr.filter(s => s.id !== id))
        setFadingIds(f => { const n = new Set(f); n.delete(id); return n })
      }, 350)
      // statusCounts shape is { unreviewed, approved, rejected } — mirror reject's decrement.
      setStatusCounts(prev => ({ ...prev, unreviewed: Math.max(0, prev.unreviewed - 1) }))
    } catch (e) { console.warn('[NewsTab] markDuplicate failed:', e) }
    closeDupModal()
  }

  // Confirm / correct the gate's proposed geography.
  async function handleGeography(id: string, geography: string) {
    const value = geography.trim()
    await window.api.intelligence.updateGeography(id, value)
    setSources(prev => prev.map(s =>
      s.id === id ? { ...s, geography: value, geography_confirmed: 1 } : s
    ))
    setGeoEdit(null)
  }

  // Write a tag set for one type (thematic) immediately — no Approve needed.
  async function handleSetTags(id: string, type: 'disposition' | 'thematic', tags: string[]) {
    const col = type === 'disposition' ? 'disposition_tags' : 'thematic_tags'
    try {
      const res = await window.api.intelligence.setArticleTags(id, type, tags)
      const final = res?.tags ?? tags
      setSources(prev => prev.map(s => s.id === id ? { ...s, [col]: JSON.stringify(final) } : s))
    } catch (e) { console.warn('[NewsTab] setArticleTags failed:', e) }
  }

  // 3a: Project selector change — persist the reliable board-id association
  // (project_board_id). No longer writes disposition_tags. No routing (that's 3c).
  async function handleProjectSelect(id: string, boardId: string) {
    await window.api.intelligence.setProject(id, boardId || null)
    setSources(prev => prev.map(s => s.id === id ? { ...s, project_board_id: boardId || null } : s))
    // Clear any gate error for this article since a project is now set.
    setGateError(prev => {
      const n = { ...prev }
      if (n[id]) n[id] = { ...n[id], missingProject: false }
      return n
    })
  }

  // Create a new registry tag, refresh the local registry, then attach it.
  // T1: the tag belongs to the ARTICLE's project (boardId = source.project_board_id).
  async function handleCreateTag(id: string, type: 'thematic', boardId: string, current: string[], name: string) {
    if (!boardId) return
    try {
      const res = await window.api.intelligence.createTag(name, type, boardId)
      if (!res?.ok || !res.name) {
        console.warn('[NewsTab] createTag failed:', res?.error)
        // Cloud write failed — refetch so the picker reflects cloud truth (no phantom).
        window.api.intelligence.getKnownTags(type, boardId).then(setKnownThematic).catch(() => {})
        return
      }
      setKnownThematic(prev => prev.includes(res.name) ? prev : [...prev, res.name].sort((a, b) => a.localeCompare(b)))
      if (!current.includes(res.name)) await handleSetTags(id, type, [...current, res.name])
    } catch (e) { console.warn('[NewsTab] createTag failed:', e) }
  }

  // Admin: delete a tag from the known_tags registry. Existing article chips are
  // kept (articles retain their stored JSON) but the tag leaves the autocomplete.
  // T1: deletion is scoped to the currently viewed project's registry (boardId).
  async function handleDeleteTag(type: 'thematic', name: string, boardId: string) {
    if (!boardId) return
    if (!confirm(`Delete tag "${name}" from the registry? Articles that already use it will keep it as a chip.`)) return
    try {
      const res = await window.api.intelligence.deleteTag(name, type, boardId)
      if (!res?.ok) {
        console.warn('[NewsTab] deleteTag failed:', res?.error)
        window.api.intelligence.getKnownTags(type, boardId).then(setKnownThematic).catch(() => {})
        alert(res?.error || 'Could not delete the tag.')
        return
      }
      setKnownThematic(prev => prev.filter(t => t !== name))
    } catch (e) { console.warn('[NewsTab] deleteTag failed:', e) }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return dateStr }
  }

  // 3b: scope by the top dropdown's selected project (board id). "all"/unset → no scope.
  const projectScoped = !!selectedProjectId && selectedProjectId !== 'all'

  // Client-side filters (combine with the server-side status/search filters already
  // applied in load()): minimum-relevance AND selected project. Then sort:
  // relevance_score DESC (NULL last), then published_at DESC.
  const visible = useMemo(() => {
    let filtered = sources
    if (minRelevance > 0) filtered = filtered.filter(s => (s.relevance_score ?? -1) >= minRelevance)
    if (projectScoped) filtered = filtered.filter(s => s.project_board_id === selectedProjectId)
    return [...filtered].sort((a, b) => {
      const sa = a.relevance_score, sb = b.relevance_score
      if (sa == null && sb != null) return 1
      if (sa != null && sb == null) return -1
      if (sa != null && sb != null && sa !== sb) return sb - sa
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0
      return tb - ta
    })
  }, [sources, minRelevance, projectScoped, selectedProjectId])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter bar */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-100 dark:border-white/[0.06] flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search articles..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 w-48"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-700 dark:text-white/80 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="saved">Saved</option>
          <option value="pushed">Pushed</option>
        </select>
        <select
          value={confidenceFilter}
          onChange={e => setConfidenceFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-700 dark:text-white/80 focus:outline-none"
        >
          <option value="">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-700 dark:text-white/80 focus:outline-none"
        >
          <option value="">All categories</option>
          {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={minRelevance}
          onChange={e => setMinRelevance(Number(e.target.value))}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-700 dark:text-white/80 focus:outline-none"
          title="Minimum Colombia-relevance score"
        >
          <option value={0}>Any relevance</option>
          <option value={4}>Relevance ≥ 4</option>
          <option value={7}>Relevance ≥ 7</option>
        </select>

        {/* Phase 3: three live count badges — Pending / Approved / Rejected. */}
        <div className="flex items-center gap-1.5 ml-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
            {statusCounts.unreviewed} pending
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300">
            {statusCounts.approved} approved
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300">
            {statusCounts.rejected} rejected
          </span>
        </div>

        {/* Add article is ALWAYS visible (any researcher can hand-add); Refresh now
            stays root-only — it triggers the shared Contested Skies pipeline pull. */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              const opening = !showAddPanel
              // On open, default the required Project field to the tab's selected project
              // (blank when the top filter is "all", so the placeholder shows and validation fires).
              if (opening) {
                const def = selectedProjectId && selectedProjectId !== 'all' ? selectedProjectId : ''
                setNewsForm(f => ({ ...f, project_board_id: def }))
              }
              setNewsFetchNote(null)
              setShowAddPanel(opening)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.15] text-gray-700 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/[0.05] text-xs font-medium transition"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Add article
          </button>
          {isRoot && (
            <button
              onClick={handleRefreshNews}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition disabled:opacity-50"
            >
              {refreshing ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10.5 6A4.5 4.5 0 1 1 6 1.5M10.5 1.5v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
              {refreshing ? 'Fetching...' : 'Refresh now'}
            </button>
          )}
        </div>
      </div>

      {/* Imported-from-Contested-Skies banner */}
      {importedCount > 0 && (
        <div className="shrink-0 mx-6 mt-3 px-4 py-3 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 flex items-center justify-between gap-3">
          <p className="text-xs text-orange-800 dark:text-orange-300">
            <span className="font-semibold">{importedCount} source{importedCount !== 1 ? 's' : ''} imported from Contested Skies</span> — pending your confirmation. Review and set final confidence before they move to the Info Pages Sources tab.
          </p>
          {isRoot && (
            <button
              onClick={handleConfirmImported}
              disabled={confirmingImported || !online}
              title={!online ? 'Unavailable while offline' : undefined}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              {confirmingImported ? 'Confirming…' : 'Confirm all as Medium confidence'}
            </button>
          )}
        </div>
      )}

      {/* Article list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {/* News hand-add: manual "Add article" panel (toggled from the toolbar). Lives
            INSIDE the scroll container so it scrolls with the list — a saved article is
            a normal ungated/unreviewed card, no special-casing anywhere. */}
        {showAddPanel && (
          <div className="bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add article</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Title *</label>
                <input
                  value={newsForm.title}
                  onChange={e => setNewsForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Article headline"
                  className={`w-full px-3 py-1.5 rounded-lg border text-sm bg-white dark:bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${newsErrors.title ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-white/[0.1]'}`}
                />
                {newsErrors.title && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{newsErrors.title}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">URL (optional)</label>
                <div className="flex gap-2">
                  <input
                    value={newsForm.url}
                    onChange={e => setNewsForm(f => ({ ...f, url: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleReadNewsLink() } }}
                    placeholder="https://..."
                    className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-sm bg-white dark:bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                  <button
                    type="button"
                    onClick={handleReadNewsLink}
                    disabled={!newsForm.url.trim() || newsFetching}
                    title="Auto-fill the fields from the link's page metadata"
                    className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {newsFetching ? 'Reading…' : '✦ Read link'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Outlet / Source</label>
                <input
                  value={newsForm.source_name}
                  onChange={e => setNewsForm(f => ({ ...f, source_name: e.target.value }))}
                  placeholder="e.g. Reuters"
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-sm bg-white dark:bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Published date</label>
                <input
                  type="date"
                  value={newsForm.published_at}
                  onChange={e => setNewsForm(f => ({ ...f, published_at: e.target.value }))}
                  onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch { /* already open */ } }}
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-sm bg-white dark:bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Confidence</label>
                <select
                  value={newsForm.confidence}
                  onChange={e => setNewsForm(f => ({ ...f, confidence: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="">— confidence —</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Project *</label>
                <select
                  value={newsForm.project_board_id}
                  onChange={e => setNewsForm(f => ({ ...f, project_board_id: e.target.value }))}
                  className={`w-full px-3 py-1.5 rounded-lg border text-sm bg-white dark:bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${newsErrors.project_board_id ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-white/[0.1]'}`}
                >
                  {/* Placeholder only while nothing valid is chosen — its empty value fails validation. */}
                  {!newsForm.project_board_id && <option value="">— Select a project —</option>}
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {newsErrors.project_board_id && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{newsErrors.project_board_id}</p>}
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Content</label>
                <textarea
                  value={newsForm.content}
                  onChange={e => setNewsForm(f => ({ ...f, content: e.target.value }))}
                  rows={4}
                  placeholder="Paste the article text (optional — a snippet is derived from the first 300 characters)."
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-sm bg-white dark:bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-y"
                />
              </div>
            </div>

            {newsDup && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
                {newsDup.notVisible ? (
                  <span>Already saved as: <span className="font-semibold">{newsDup.existingTitle || 'an existing article'}</span> — not visible in the current view.</span>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span>This article is already in the queue.</span>
                    <button
                      onClick={() => goToExisting(newsDup.existingId)}
                      className="shrink-0 px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-medium transition"
                    >
                      Go to existing article
                    </button>
                  </div>
                )}
              </div>
            )}

            {newsFetchNote && (
              <p className="mt-2 text-xs text-gray-500 dark:text-white/45">{newsFetchNote}</p>
            )}

            <div className="flex items-center justify-end gap-2 mt-3">
              {newsFormError && <span className="text-xs text-red-500 dark:text-red-400 mr-auto">{newsFormError}</span>}
              <button
                onClick={() => { setShowAddPanel(false); setNewsForm({ ...NEWS_EMPTY_FORM }); setNewsErrors({}); setNewsFormError(null); setNewsDup(null); setNewsFetchNote(null) }}
                disabled={newsSaving}
                className="px-4 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.15] text-gray-600 dark:text-white/70 text-sm font-medium transition hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNews}
                disabled={newsSaving}
                className="px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition disabled:opacity-50"
              >
                {newsSaving ? 'Saving…' : 'Save article'}
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-400 dark:text-white/30">
                <path d="M3 5h14M3 10h14M3 15h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">
              {projectScoped ? 'No articles for this project yet'
                : statusFilter === 'unreviewed' ? 'Queue is empty' : 'No articles found'}
            </p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">
              {projectScoped
                ? 'Switch the project dropdown to “All sources” to see every article.'
                : statusFilter || confidenceFilter || categoryFilter || search || minRelevance > 0
                ? 'Try adjusting your filters'
                : 'Click "Refresh now" to fetch the latest news'}
            </p>
          </div>
        )}

        {!loading && visible.map(source => {
          const conf = source.confidence || 'low'
          const confStyle = CONFIDENCE_COLORS[conf as keyof typeof CONFIDENCE_COLORS] || CONFIDENCE_COLORS.low
          const cats: string[] = (() => { try { return JSON.parse(source.categories_json || '[]') } catch { return [] } })()
          const dispoTags = readTags(source.disposition_tags)
          const themaTags = readTags(source.thematic_tags)
          // News human layer: relevance override (analysis_json.human) + footer open state.
          const humanRel = (parseAnalysis(source.analysis_json).human as { relevance?: string } | undefined)?.relevance
          const footerFilled = !!notesText(source.intel_notes)   // footer is notes-only now
          const footerOpen = openFooter[source.id] ?? footerFilled
          // 3e: rich human-first footer — article text + AI + reconcile (per-source keyed).
          const contentDraft = contentDrafts[source.id] ?? (source.content || '')
          const hasArticleText = notesText(contentDraft).length > 40   // substantial pasted text (not ~52-char snippet leftovers)
          const srcAnalysis = parseAnalysis(source.analysis_json)
          const aiBlock = srcAnalysis.ai as Record<string, any> | undefined
          const reconciledBlock = srcAnalysis.reconciled as Record<string, any> | undefined
          // B2: structured identifiers from the AI block (B1 extraction). Graceful-degrade.
          const articleType = aiBlock?.article_type as string | undefined
          // B2 + Part B: AI-extracted systems/facts with human overrides layered on (edited ?? ai).
          const caps: ResolvedCap[] = resolveCaps(srcAnalysis)
          const facts: ResolvedFact[] = resolveFacts(srcAnalysis)
          const reconciledDraft = reconciledDrafts[source.id] ?? (source.reconciled_notes || '')
          const showReconciled = notesText(reconciledDraft).trim() !== '' || !!reconciledBlock
          const notesFilledForReconcile = notesText(noteDrafts[source.id] ?? (source.intel_notes || '')).length > 0
          const isPending = pendingStatus[source.id]
          const isFading = fadingIds.has(source.id)

          // Phase 1: compute effective project (stored or first-project default).
          const defaultProject = projects[0]?.name ?? ''
          const projectSel = dispoTags[0] || defaultProject
          // 3a: the reliable board-id project association shown/edited by the picker.
          // Seeded articles have project_board_id; unset cards default to the top
          // dropdown's selected project (Slice 1) as inherited working context.
          const projectBoardSel = source.project_board_id
            || (selectedProjectId && selectedProjectId !== 'all' ? selectedProjectId : '')

          // Phase 4: gate — Approve requires at least one project AND one topic tag.
          const canApprove = projectSel !== '' && themaTags.length > 0
          const gateErr = gateError[source.id]

          // Phase 4: tooltip explaining what's missing.
          const gateTooltip = !canApprove
            ? (projectSel === '' && themaTags.length === 0
                ? 'Select a project and add a topic tag to approve'
                : projectSel === ''
                ? 'Select a project to approve'
                : 'Add a topic tag to approve')
            : undefined

          return (
            <div
              key={source.id}
              id={`news-card-${source.id}`}
              className={`bg-white dark:bg-white/[0.04] rounded-xl border p-4 hover:border-gray-300 dark:hover:border-white/[0.12] transition-all duration-300 ${highlightId === source.id ? 'border-indigo-400 dark:border-indigo-400 ring-2 ring-indigo-400/40' : 'border-gray-200 dark:border-white/[0.08]'} ${isFading ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
            >
              <div className="flex items-start gap-3">
                {source.image_url && (
                  <img
                    src={source.image_url}
                    alt=""
                    className="w-16 h-12 rounded-lg object-cover shrink-0 border border-gray-100 dark:border-white/[0.06]"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {/* Confidence badge */}
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${confStyle.bg} ${confStyle.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${confStyle.dot}`} />
                      {conf}
                    </span>
                    {/* Relevance-score badge.
                        gate_processed=1 + NULL score = tombstoned (failed to score) → gray "scoring failed".
                        gate_processed=0 + NULL score = not yet gated → gray "REL —". */}
                    {source.gate_processed === 1 && source.relevance_score == null ? (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/30"
                        title={source.gate_reasoning || 'Scoring failed — could not classify this article'}
                      >
                        scoring failed
                      </span>
                    ) : ((() => {
                      const rb = relevanceBadge(source.relevance_score)
                      return (
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${rb.cls}`}
                          title="Colombia relevance score (0–10)"
                        >
                          <span className="opacity-60 font-medium">REL</span>{rb.label}
                        </span>
                      )
                    })())}
                    {/* Relevance-type badge */}
                    {source.relevance_type && source.relevance_type !== 'none' && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300"
                        title="Why this matters (gate classification)"
                      >
                        {REL_TYPE_LABELS[source.relevance_type] || source.relevance_type}
                      </span>
                    )}
                    {/* Status badge */}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${source.status === 'imported' ? '' : 'uppercase'} ${STATUS_COLORS[source.status] || STATUS_COLORS.unreviewed}`}>
                      {STATUS_LABELS[source.status] || source.status}
                    </span>
                    {/* Language badge — ES / EN / PT visibility only, no filter */}
                    {source.language && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                          source.language === 'es' ? 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300' :
                          source.language === 'pt' ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300' :
                          'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        }`}
                        title={`Article language: ${source.language.toUpperCase()}`}
                      >
                        {source.language.toUpperCase()}
                      </span>
                    )}
                    {/* Origin badges */}
                    {source.added_by_name === 'Contested Skies Pipeline' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">Pipeline</span>
                    )}
                    {source.added_by_name === 'Imported from Contested Skies' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40">from Contested Skies</span>
                    )}
                    {source.added_by_name === 'Kantor Framework' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300" title="Fixed authoritative framework reference — not graded">Framework — fixed</span>
                    )}
                    {source.added_by_name === 'Contested Skies Archive' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40">Source archive</span>
                    )}
                    {source.used_in_page && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                        title={source.used_in_page_at ? `Published ${formatDate(source.used_in_page_at)}` : undefined}>
                        Published — used in {source.used_in_page}
                      </span>
                    )}
                    {/* Source name */}
                    {source.source_name && (
                      <span className="text-xs text-gray-500 dark:text-white/40 font-medium">{source.source_name}</span>
                    )}
                    {/* Date */}
                    <span className="text-xs text-gray-400 dark:text-white/30">{formatDate(source.published_at)}</span>

                    {/* Geography editor */}
                    {geoEdit?.id === source.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          autoFocus
                          value={geoEdit.value}
                          onChange={e => setGeoEdit({ id: source.id, value: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleGeography(source.id, geoEdit.value)
                            if (e.key === 'Escape') setGeoEdit(null)
                          }}
                          placeholder="Geography…"
                          className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-transparent text-[11px] text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-32"
                        />
                        <button onClick={() => handleGeography(source.id, geoEdit.value)} className="p-0.5 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Save geography">
                          <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button onClick={() => setGeoEdit(null)} className="p-0.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]" title="Cancel">
                          <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                      </span>
                    ) : source.geography ? (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                        onClick={() => setGeoEdit({ id: source.id, value: source.geography || '' })}
                        title={source.geography_confirmed ? 'Confirmed geography — click to edit' : 'AI-proposed geography — click to confirm or edit'}
                      >
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M5 .8C3 .8 1.6 2.2 1.6 4.1c0 2.3 3.4 5.1 3.4 5.1s3.4-2.8 3.4-5.1C8.4 2.2 7 .8 5 .8z" stroke="currentColor" strokeWidth="1" /><circle cx="5" cy="4" r="1.1" fill="currentColor"/></svg>
                        {source.geography}
                        {!source.geography_confirmed && (
                          <span className="ml-0.5 px-1 rounded bg-amber-200/70 dark:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-[8px] font-bold uppercase tracking-wide" title="AI proposal — not yet confirmed">AI</span>
                        )}
                      </span>
                    ) : (
                      <button
                        onClick={() => setGeoEdit({ id: source.id, value: '' })}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 dark:text-white/30 border border-dashed border-gray-300 dark:border-white/[0.15] hover:text-gray-600 dark:hover:text-white/60"
                        title="Add geography"
                      >
                        + geography
                      </button>
                    )}
                  </div>

                  {/* Title */}
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition line-clamp-2">
                      {source.title}
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{source.title}</p>
                  )}

                  {/* Snippet */}
                  {source.snippet && (
                    <p className="text-xs text-gray-500 dark:text-white/50 mt-1 line-clamp-2">{source.snippet}</p>
                  )}

                  {/* Category badges */}
                  {cats.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {cats.map(cat => (
                        <span key={cat} className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">{cat}</span>
                      ))}
                    </div>
                  )}

                  {/* Phase 1 + Phase 4: PROJECT selector (replaces Disposition TagPicker).
                      Phase 4: TOPIC tag picker (unchanged, with forceOpen for gate). */}
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5 mt-2.5">
                    {/* PROJECT — single-select dropdown, stored in disposition_tags. */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">Project</span>
                      {projects.length > 0 ? (
                        <select
                          value={projectBoardSel}
                          onChange={e => handleProjectSelect(source.id, e.target.value)}
                          className={`px-2 py-0.5 rounded text-[11px] border focus:outline-none focus:ring-1 focus:ring-indigo-500/50 bg-white dark:bg-gray-900 text-gray-700 dark:text-white/80 ${
                            gateErr?.missingProject
                              ? 'border-red-400 dark:border-red-500'
                              : 'border-gray-200 dark:border-white/[0.15]'
                          }`}
                        >
                          {!projectBoardSel && <option value="">— select project —</option>}
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-gray-400 dark:text-white/30">Loading…</span>
                      )}
                    </div>
                    {/* TOPIC tag picker moved into the human-layer footer below. */}
                  </div>

                  {/* Phase 4: inline gate error message (shown when Approve is blocked). */}
                  {gateErr && (gateErr.missingProject || gateErr.missingTopic) && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M6 4v2.5M6 8h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      {gateErr.missingProject && gateErr.missingTopic
                        ? 'Select a project and add a topic tag to approve'
                        : gateErr.missingProject
                        ? 'Select a project to approve'
                        : 'Add a topic tag to approve'}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions + quick controls (confidence · topic tags · relevance override) */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
                {/* Confidence: fixed for framework refs, gradeable for journalistic sources */}
                {source.added_by_name === 'Kantor Framework' ? (
                  <span className="px-2 py-1 rounded text-[11px] border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 font-medium" title="Fixed authoritative source — confidence is not graded">
                    Authoritative — fixed
                  </span>
                ) : (
                  <select
                    value={source.confidence || 'low'}
                    onChange={e => handleConfidence(source.id, e.target.value)}
                    className="px-2 py-1 rounded text-[11px] border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-gray-600 dark:text-white/70 focus:outline-none"
                    title="Grade by how solid the source is"
                  >
                    <option value="high">High confidence</option>
                    <option value="medium">Medium confidence</option>
                    <option value="low">Low confidence</option>
                  </select>
                )}

                {/* TOPIC tags — always-visible quick control (writes thematic_tags via setArticleTags) */}
                <TagPicker
                  label="Topic"
                  value={themaTags}
                  known={knownThematic}
                  chipClass="bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300"
                  onAdd={tag => {
                    handleSetTags(source.id, 'thematic', [...themaTags, tag])
                    setGateError(prev => {
                      const n = { ...prev }
                      if (n[source.id]) n[source.id] = { ...n[source.id], missingTopic: false }
                      return n
                    })
                  }}
                  onRemove={tag => handleSetTags(source.id, 'thematic', themaTags.filter(t => t !== tag))}
                  onCreate={name => handleCreateTag(source.id, 'thematic', source.project_board_id || '', themaTags, name)}
                  onDelete={((can('delete_intel_tag') || isRoot) && selectedProjectId && selectedProjectId !== 'all') ? tag => handleDeleteTag('thematic', tag, selectedProjectId) : undefined}
                  isAdmin={can('delete_intel_tag') || isRoot}
                  forceOpen={forceOpenTopicId === source.id}
                />

                {/* RELEVANCE override — always-visible; stored in analysis_json.human (AI score kept) */}
                <span className="inline-flex items-center gap-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">Rel</span>
                  <select
                    value={humanRel ?? ''}
                    onChange={e => handleHumanRelevance(source.id, e.target.value)}
                    className="px-2 py-0.5 rounded text-[11px] border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-gray-900 text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    title="Your relevance override — does not change the AI's REL score"
                  >
                    <option value="">— (use AI)</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  {humanRel && (
                    <span className="text-[10px] text-gray-400 dark:text-white/35" title="AI relevance score is preserved">overrides AI REL {source.relevance_score ?? '—'}</span>
                  )}
                </span>

                <div className="flex-1" />

                {/* Phase 4: Approve — gated on project + topic. Dimmed + tooltip when blocked. */}
                {source.status !== 'approved' && source.status !== 'pushed' && (
                  <button
                    onClick={async () => {
                      if (!canApprove) {
                        // Show inline error and auto-open the relevant picker.
                        setGateError(prev => ({
                          ...prev,
                          [source.id]: {
                            missingProject: projectSel === '',
                            missingTopic: themaTags.length === 0,
                          },
                        }))
                        if (themaTags.length === 0) {
                          // Topic picker is always visible in the quick-controls row — just force it open.
                          setForceOpenTopicId(source.id)
                          setTimeout(() => setForceOpenTopicId(null), 0)
                        }
                        return
                      }
                      // Clear any gate error.
                      setGateError(prev => { const n = { ...prev }; delete n[source.id]; return n })
                      // 3c: ensure the reliable board-id project association is persisted
                      // BEFORE routing, so the server routes this source to the right
                      // project's New sources. (Replaces the legacy disposition auto-save.)
                      if (!source.project_board_id && projectBoardSel) {
                        await handleProjectSelect(source.id, projectBoardSel)
                      }
                      handleStatus(source.id, 'approved')
                    }}
                    disabled={isPending || !online}
                    title={!online ? 'Unavailable while offline' : gateTooltip}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-white text-xs font-medium transition ${
                      canApprove
                        ? 'bg-green-500 hover:bg-green-600 disabled:opacity-50'
                        : 'bg-green-500/40 cursor-not-allowed'
                    }`}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Approve
                  </button>
                )}
                {/* Save — ungated */}
                {source.status !== 'saved' && source.status !== 'approved' && source.status !== 'pushed' && (
                  <button
                    onClick={() => handleStatus(source.id, 'saved')}
                    disabled={isPending || !online}
                    title={!online ? 'Unavailable while offline' : undefined}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v5M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 7.5v1a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    Save
                  </button>
                )}
                {/* Make unreviewed — quiet undo; only for the Saved basket (inverse of Save's guard) */}
                {source.status === 'saved' && (
                  <button
                    onClick={() => handleMakeUnreviewed(source.id)}
                    disabled={isPending || !online}
                    title={!online ? 'Unavailable while offline' : 'Return this article to the review queue'}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-white/[0.15] text-gray-600 dark:text-white/60 text-xs font-medium transition hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2L1.5 4l2 2M1.5 4H6a2.5 2.5 0 0 1 0 5H4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Make unreviewed
                  </button>
                )}
                {/* Reject — ungated */}
                {source.status !== 'rejected' && (
                  <button
                    onClick={() => handleStatus(source.id, 'rejected')}
                    disabled={isPending || !online}
                    title={!online ? 'Unavailable while offline' : undefined}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    Reject
                  </button>
                )}
                {/* Duplicate — neutral (not a rejection); opens the link modal, no learning signal */}
                {source.status !== 'duplicate' && (
                  <button
                    onClick={() => openDupModal(source.id)}
                    disabled={isPending || !online}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] text-gray-700 dark:text-white/70 text-xs font-medium transition disabled:opacity-50"
                    title={!online ? 'Unavailable while offline' : 'Mark as a duplicate of another article (no learning signal)'}
                  >
                    Duplicate
                  </button>
                )}
              </div>
              {/* Per-card STATUS error — rendered HERE, next to the status buttons, NOT in
                  the compose panel below (which is hidden on a collapsed card). */}
              {statusError[source.id] && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{statusError[source.id]}</p>}

              {/* News human layer — elongating footer, NOTES ONLY. Compact "✎ Add notes"
                  when empty; "● Notes" + default-open when notes exist. Tags + relevance
                  override moved up to the always-visible quick-controls row above. */}
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-white/[0.06]">
                <button
                  onClick={() => setOpenFooter(prev => ({ ...prev, [source.id]: !footerOpen }))}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    footerFilled
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/15'
                      : 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/25 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-500/15'
                  }`}
                >
                  <span className={`text-sm ${footerFilled ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-white/30'}`}>{footerFilled ? '●' : '✎'}</span>
                  <span className="text-[13px] font-medium">
                    Review and annotate
                  </span>
                  <span className="flex-1" />
                  <svg width="18" height="18" viewBox="0 0 12 12" fill="none" className={`transition-transform ${footerOpen ? 'rotate-180' : ''}`}>
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {footerOpen && (
                  <div className="mt-3 space-y-4">
                    {/* (1) 3e: ARTICLE TEXT — paste the full article (the feed only stores a snippet) */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">Article text</span>
                        <span className="text-[10px] font-normal text-gray-300 dark:text-white/25">· paste the full article for AI analysis (the feed only captures a snippet)</span>
                      </div>
                      <RichTextEditor
                        value={contentDraft}
                        onChange={html => setContentDrafts(prev => ({ ...prev, [source.id]: html }))}
                        onBlur={() => saveContent(source.id)}
                        placeholder="Paste the full article text here…"
                        minHeight="96px"
                      />
                    </div>

                    {/* (2) 3e: AI ANALYSIS — on-demand over the pasted text; nothing runs until pressed */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">AI analysis — suggestions</span>
                        <button
                          onClick={() => analyzeSource(source.id)}
                          disabled={!hasArticleText || analyzingId === source.id}
                          title={hasArticleText ? 'Run the AI analysis on demand (project-aware). Nothing runs until you press this.' : 'Paste the full article text first'}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {analyzingId === source.id ? (
                            <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
                          ) : (
                            <>✦ {aiBlock ? 'Re-analyze' : 'Analyze with AI'}</>
                          )}
                        </button>
                      </div>
                      {aiBlock ? (
                        <div className="p-3 rounded-lg bg-indigo-50/60 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 space-y-2 text-xs">
                          {(typeof aiBlock.relevance_score === 'number' || articleType) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {typeof aiBlock.relevance_score === 'number' && (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 font-bold text-[10px]">relevance {aiBlock.relevance_score}/10</span>
                              )}
                              {articleType && (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-600/30 text-slate-700 dark:text-slate-300 font-medium text-[10px] uppercase tracking-wide">{articleType}</span>
                              )}
                            </div>
                          )}
                          {aiBlock.summary && <p className="text-gray-700 dark:text-white/70">{aiBlock.summary}</p>}
                          {aiBlock.relevance_reasoning && <p className="text-gray-500 dark:text-white/50 italic">{aiBlock.relevance_reasoning}</p>}
                          {Array.isArray(aiBlock.suggested_tags) && aiBlock.suggested_tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {aiBlock.suggested_tags.map((t: string, i: number) => (
                                <SuggestedTagChip
                                  key={`${t}-${i}`}
                                  tag={t}
                                  onArticle={themaTags.includes(normalizeTagClient(t))}
                                  inLibrary={knownThematic.includes(normalizeTagClient(t))}
                                  canApply={!!projectBoardSel}
                                  onAttach={tag => handleSetTags(source.id, 'thematic', [...themaTags, tag])}
                                  onCreate={tag => handleCreateTag(source.id, 'thematic', projectBoardSel, themaTags, tag)}
                                />
                              ))}
                            </div>
                          )}
                          {/* B2 + Part B: SYSTEMS — each cell click-to-edit; overrides shadow the AI cap. */}
                          {caps.length > 0 && (
                            <div>
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 mb-1">Systems</p>
                              <div className="space-y-1">
                                {caps.map(c => {
                                  const base = `${source.id}|cap|${c.key}`
                                  return (
                                    <div key={c.key} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                      {editableText(`${base}|system`, c.system, v => commitCap(source.id, c, 'system', v), { className: 'font-semibold text-gray-800 dark:text-white/80' })}
                                      <span className="text-gray-400 dark:text-white/30">·</span>
                                      {editableText(`${base}|actor`, c.actor || '', v => commitCap(source.id, c, 'actor', v), { className: 'text-gray-500 dark:text-white/50' })}
                                      {editableActorType(`${base}|actor_type`, c, v => commitCap(source.id, c, 'actor_type', v))}
                                      {editableText(`${base}|cost`, c.cost || '', v => commitCap(source.id, c, 'cost', v), { display: c.cost
                                        ? <span className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-medium">{c.cost}</span>
                                        : <span className="text-[9px] text-gray-300 dark:text-white/25 italic">cost</span> })}
                                      {editableText(`${base}|category`, c.category || '', v => commitCap(source.id, c, 'category', v), { display: c.category
                                        ? <span className="px-1 py-0.5 rounded bg-indigo-100/70 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[9px] font-medium">{c.category}</span>
                                        : <span className="text-[9px] text-gray-300 dark:text-white/25 italic">category</span> })}
                                      {c.edited && (
                                        <>
                                          <span className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[8px] font-semibold uppercase tracking-wide">edited</span>
                                          <button type="button" onClick={() => saveOverride(source.id, 'capability', c.key, null)} title="Revert to AI values" className="text-gray-400 hover:text-gray-700 dark:text-white/30 dark:hover:text-white/70 text-[11px] leading-none">↺</button>
                                        </>
                                      )}
                                      {c.edited && c.ai && (
                                        <span className="basis-full text-[10px] text-gray-400 dark:text-white/30">
                                          AI said: {[c.ai.system, c.ai.actor, c.ai.actor_type, c.ai.cost, c.ai.category].filter(Boolean).join(' · ') || '—'}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {/* B2 + Part B: KEY FACTS — value click-to-edit; override shadows the AI value. */}
                          {facts.length > 0 && (
                            <div>
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 mb-1">Key facts</p>
                              <div className="space-y-1">
                                {facts.map(f => {
                                  const cellId = `${source.id}|fact|${f.label}`
                                  const editing = editCell === cellId
                                  return (
                                    <div key={f.label} className="grid grid-cols-[128px_1fr] gap-x-2">
                                      <span className="text-gray-400 dark:text-white/35 break-words">{f.label}</span>
                                      <span className="text-gray-700 dark:text-white/70 break-words">
                                        <span className="inline-flex flex-wrap items-baseline gap-1">
                                          {editableText(cellId, f.value, () => commitFact(source.id, f), { className: 'text-gray-700 dark:text-white/70 break-words' })}
                                          {f.edited && !editing && (
                                            <>
                                              <span className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[8px] font-semibold uppercase tracking-wide">edited</span>
                                              <button type="button" onClick={() => saveOverride(source.id, 'key_fact', f.label, null)} title="Revert to AI value" className="text-gray-400 hover:text-gray-700 dark:text-white/30 dark:hover:text-white/70 text-[11px] leading-none">↺</button>
                                            </>
                                          )}
                                        </span>
                                        {f.edited && !editing && f.aiValue !== undefined && (
                                          <span className="block text-[10px] text-gray-400 dark:text-white/30 mt-0.5">AI said: {f.aiValue || '—'}</span>
                                        )}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {editError && <p className="text-[10px] text-red-500 dark:text-red-400">{editError}</p>}
                          {aiBlock.analyzed_at && <p className="text-[10px] text-indigo-500/60 dark:text-indigo-400/40">Analyzed {formatDate(aiBlock.analyzed_at)}</p>}
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg border border-dashed border-gray-200 dark:border-white/10 text-[11px] text-gray-400 dark:text-white/30">
                          Press <span className="font-medium">Analyze with AI</span> — nothing runs until you ask.
                        </div>
                      )}
                    </div>

                    {/* (3) 3e: RECONCILE — editable merged read; appears once an AI read exists */}
                    {aiBlock && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Reconciled — editable before commit</span>
                          <div className="flex items-center gap-2">
                            {!notesFilledForReconcile && <span className="text-[10px] text-gray-300 dark:text-white/25">add notes first</span>}
                            <button
                              onClick={() => reconcileSource(source.id)}
                              disabled={!notesFilledForReconcile || reconcilingId === source.id}
                              title={notesFilledForReconcile ? 'Merge your notes with the AI read into an editable version' : 'Analyze first, and add notes, to reconcile'}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {reconcilingId === source.id ? (
                                <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Reconciling…</>
                              ) : (
                                <>⟲ Reconcile with my notes</>
                              )}
                            </button>
                          </div>
                        </div>
                        {reconciledBlock && (
                          <div className="flex items-center flex-wrap gap-1 mb-1.5">
                            {typeof reconciledBlock.relevance_score === 'number' && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold text-[10px]">relevance {reconciledBlock.relevance_score}/10</span>
                            )}
                            {Array.isArray(reconciledBlock.suggested_tags) && reconciledBlock.suggested_tags.map((t: string, i: number) => (
                              <SuggestedTagChip
                                key={`${t}-${i}`}
                                tag={t}
                                onArticle={themaTags.includes(normalizeTagClient(t))}
                                inLibrary={knownThematic.includes(normalizeTagClient(t))}
                                canApply={!!projectBoardSel}
                                onAttach={tag => handleSetTags(source.id, 'thematic', [...themaTags, tag])}
                                onCreate={tag => handleCreateTag(source.id, 'thematic', projectBoardSel, themaTags, tag)}
                              />
                            ))}
                            {reconciledBlock.reconciled_at && (
                              <span className="text-[10px] text-amber-600/60 dark:text-amber-400/40 ml-1">Reconciled {formatDate(reconciledBlock.reconciled_at)}</span>
                            )}
                          </div>
                        )}
                        {showReconciled ? (
                          <RichTextEditor
                            value={reconciledDraft}
                            onChange={html => setReconciledDrafts(prev => ({ ...prev, [source.id]: html }))}
                            onBlur={() => saveReconciledText(source.id)}
                            placeholder="The reconciled read — edit freely before commit…"
                            minHeight="80px"
                          />
                        ) : (
                          <p className="text-[11px] text-gray-400 dark:text-white/30">Press <span className="font-medium">Reconcile with my notes</span> to generate an editable merged read.</p>
                        )}
                      </div>
                    )}

                    {/* (4) NOTES — reuse intel_notes + updateNotes (row already exists → autosave safe) */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold uppercase tracking-wide">Primary</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">Researcher notes — your interpretation</span>
                      </div>
                      <RichTextEditor
                        value={noteDrafts[source.id] ?? (source.intel_notes || '')}
                        onChange={html => setNoteDrafts(prev => ({ ...prev, [source.id]: html }))}
                        onBlur={() => saveNote(source.id)}
                        placeholder="Your interpretation, context, why it matters for the project…"
                        minHeight="72px"
                      />
                    </div>

                    {/* (5) 3e: per-source AI error */}
                    {aiErr[source.id] && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{aiErr[source.id]}</p>}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Paging: honest count + Load more. Makes the old 100-row truncation visible. */}
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

      {/* Duplicate slice: link modal — portal to document.body so it escapes card
          stacking contexts (cards use transition-all). Shown when dupModalFor is set. */}
      {dupModalFor && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 dark:bg-black/60 animate-[fadeIn_0.15s_ease-out]"
          onMouseDown={closeDupModal}
        >
          <div
            className="w-full max-w-md mx-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/[0.12] shadow-2xl p-5"
            onMouseDown={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Mark as duplicate</h3>
            <p className="text-xs text-gray-500 dark:text-white/50 mt-1">
              This removes the article from review without affecting AI learning. Optionally link the original it duplicates.
            </p>
            {/* Auto-suggested originals — shown only before the user starts typing. Once
                dupSearch has 2+ chars the typed-search list below takes over unchanged. */}
            {dupSearch.trim().length === 0 && (dupSuggesting || dupSuggestions.length > 0) && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/35 mb-1">Suggested originals</p>
                <div className="max-h-40 overflow-auto rounded-lg border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-white/[0.06]">
                  {dupSuggesting ? (
                    <p className="px-3 py-3 text-xs text-gray-400 dark:text-white/30">Searching…</p>
                  ) : (
                    dupSuggestions.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setDupChosen({ id: r.id, title: r.title })}
                        className={`w-full text-left px-3 py-2 transition ${dupChosen?.id === r.id ? 'bg-indigo-50 dark:bg-indigo-500/15' : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'}`}
                      >
                        <p className="text-xs font-medium text-gray-800 dark:text-white/80 line-clamp-2">{r.title}</p>
                        <p className="text-[10px] text-gray-400 dark:text-white/35 mt-0.5">
                          {[r.source_name, formatDate(r.published_at || null)].filter(Boolean).join(' · ')}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            <input
              autoFocus
              type="text"
              value={dupSearch}
              onChange={e => setDupSearch(e.target.value)}
              placeholder="Search for the original article… (optional)"
              className="mt-3 w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-white/[0.06]">
              {dupSearching ? (
                <p className="px-3 py-3 text-xs text-gray-400 dark:text-white/30">Searching…</p>
              ) : dupSearch.trim().length >= 2 && dupResults.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400 dark:text-white/30">No matches</p>
              ) : (
                dupResults.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setDupChosen({ id: r.id, title: r.title })}
                    className={`w-full text-left px-3 py-2 transition ${dupChosen?.id === r.id ? 'bg-indigo-50 dark:bg-indigo-500/15' : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'}`}
                  >
                    <p className="text-xs font-medium text-gray-800 dark:text-white/80 line-clamp-2">{r.title}</p>
                    <p className="text-[10px] text-gray-400 dark:text-white/35 mt-0.5">
                      {[r.source_name, formatDate(r.published_at || null)].filter(Boolean).join(' · ')}
                    </p>
                  </button>
                ))
              )}
            </div>
            {dupChosen && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                <span className="text-gray-500 dark:text-white/40">Linked to:</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium max-w-[240px]">
                  <span className="truncate">{dupChosen.title}</span>
                  <button onClick={() => setDupChosen(null)} className="opacity-60 hover:opacity-100" title="Clear link">✕</button>
                </span>
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={closeDupModal}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => markDuplicate(dupModalFor, dupChosen?.id ?? null)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition"
              >
                Mark as duplicate
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
