import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../contexts/AuthContext'

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

// Mirror the backend tag normalization for live previews (trim, lowercase, spaces→hyphens).
function normalizeTagClient(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

function readTags(raw: string | null): string[] {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

// ── TagPicker ──────────────────────────────────────────────────────────────────
// Portal-based dropdown — rendered at document.body root so it escapes any card
// stacking context (cards have `transition-all` which creates a new stacking
// context, trapping z-index and causing the panel to render under later cards).
//
// Key design decisions:
// • createPortal to document.body — panel is NEVER a child of the card DOM tree.
// • position:fixed computed from trigger's getBoundingClientRect — no clipping.
// • Solid bg-white/dark:bg-gray-900 on BOTH the panel AND every individual row,
//   so no card content can bleed through any row.
// • onMouseDown + e.preventDefault() on rows beats the outside-mousedown handler.
// • Panel stays open after row pick (multi-select); closes on outside click/Escape.
// • forceOpen: parent sets to true to auto-open the panel (used by approval gate).
function TagPicker({ label, value, known, chipClass, onAdd, onRemove, onCreate, onDelete, isAdmin, forceOpen }: {
  label: string
  value: string[]
  known: string[]
  chipClass: string
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  onCreate: (name: string) => void
  onDelete?: (tag: string) => void
  isAdmin?: boolean
  forceOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const norm = normalizeTagClient(query)
  const available = known.filter(t => !value.includes(t))
  const matches = norm ? available.filter(t => t.includes(norm)) : available
  const exactExists = known.includes(norm)

  // Compute panel position from the trigger button, then open.
  function openPanel() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setPanelPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen(true)
  }

  // Phase 4: parent can force the panel open (e.g., on gate block).
  useEffect(() => {
    if (forceOpen) openPanel()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen])

  // Close on outside mousedown — must check BOTH the trigger area and the portal panel.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      const inTrigger = triggerRef.current?.contains(target)
      const inPanel   = panelRef.current?.contains(target)
      if (!inTrigger && !inPanel) { setOpen(false); setQuery('') }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: panelPos.top, left: panelPos.left, zIndex: 9999 }}
      className="w-56 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-900 shadow-xl p-1"
    >
      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && norm) {
            if (known.includes(norm)) { onAdd(norm); setQuery('') }
            else { onCreate(norm); setQuery(''); setOpen(false) }
          }
          if (e.key === 'Escape') { setOpen(false); setQuery('') }
        }}
        placeholder="Search or create…"
        className="w-full px-2 py-1 rounded text-[11px] border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-900 text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 mb-1"
      />
      {/* Each row: solid bg on the whole row so no card content bleeds through.
          Admin gets a trash icon on the right to delete the tag from the registry. */}
      {matches.map(t => (
        <div
          key={t}
          className="flex items-center rounded bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 group"
        >
          <button
            onMouseDown={e => { e.preventDefault(); onAdd(t) }}
            className="flex-1 text-left px-2 py-1 text-[11px] text-gray-700 dark:text-white/80 cursor-pointer"
          >
            {t}
          </button>
          {isAdmin && onDelete && (
            <button
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onDelete(t) }}
              className="mr-1 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              title={`Delete "${t}" from registry`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 2.5h7M4 2.5V1.5h2v1M3.5 2.5l.5 6h3l.5-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      ))}
      {norm && !exactExists && (
        <button
          onMouseDown={e => { e.preventDefault(); onCreate(norm); setQuery(''); setOpen(false) }}
          className="block w-full text-left px-2 py-1 rounded text-[11px] font-medium bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 cursor-pointer"
        >
          + create &quot;{norm}&quot;
        </button>
      )}
      {matches.length === 0 && !norm && (
        <p className="px-2 py-1 text-[11px] bg-white dark:bg-gray-900 text-gray-400 dark:text-white/30">
          No tags yet — type to create one
        </p>
      )}
    </div>,
    document.body
  ) : null

  return (
    <div>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30 mr-0.5">{label}</span>
        {value.map(tag => (
          <span key={tag} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${chipClass}`}>
            {tag}
            <button
              onMouseDown={e => { e.preventDefault(); onRemove(tag) }}
              className="opacity-50 hover:opacity-100"
              title="Remove tag"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          </span>
        ))}
        <button
          ref={triggerRef}
          onClick={() => open ? (setOpen(false)) : openPanel()}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 dark:text-white/30 border border-dashed border-gray-300 dark:border-white/[0.15] hover:text-gray-600 dark:hover:text-white/60"
          title={`Add ${label.toLowerCase()} tag`}
        >
          + tag
        </button>
      </div>
      {panel}
    </div>
  )
}

interface Props {
  onApprove: (addedToPages?: string[]) => void
}

export default function NewsTab({ onApprove }: Props) {
  const { localUser, isRoot } = useAuth()
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
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  // Phase 3: live count badges (Pending / Approved / Rejected).
  const [statusCounts, setStatusCounts] = useState({ unreviewed: 0, approved: 0, rejected: 0 })
  // Phase 4: gate error state per article + force-open topic picker.
  const [gateError, setGateError] = useState<Record<string, { missingProject: boolean; missingTopic: boolean }>>({})
  const [forceOpenTopicId, setForceOpenTopicId] = useState<string | null>(null)
  // Topic tag registry (thematic — the only picker that stays).
  const [knownThematic, setKnownThematic] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [confirmingImported, setConfirmingImported] = useState(false)

  const refreshImportedCount = useCallback(async () => {
    try { setImportedCount(await window.api.intelligence.getImportedCount()) } catch { /* ignore */ }
  }, [])

  // Phase 3: refresh the three live count badges.
  const refreshStatusCounts = useCallback(async () => {
    try {
      const c = await window.api.intelligence.getStatusCounts()
      setStatusCounts(c)
    } catch { /* ignore */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { type: 'article' }
      if (statusFilter)     params.status     = statusFilter
      if (confidenceFilter) params.confidence = confidenceFilter
      if (categoryFilter)   params.category   = categoryFilter
      if (search)           params.search     = search
      const data = await window.api.intelligence.getSources(params)
      // Framework references (Kantor Consulting + FIU publications) are FIXED
      // citations, not news — they must never appear in the News Articles feed.
      setSources(data.filter((s) => s.added_by_name !== 'Kantor Framework'))
    } catch (e) {
      console.error('[NewsTab] load error:', e)
    } finally {
      setLoading(false)
    }
    refreshImportedCount()
    refreshStatusCounts()
  }, [statusFilter, confidenceFilter, categoryFilter, search, refreshImportedCount, refreshStatusCounts])

  useEffect(() => { load() }, [load])

  // Phase 1: load projects from existing info-page boards.
  // Phase 2 (thematic): load known topic tag registry.
  useEffect(() => {
    (async () => {
      try {
        const boards = await window.api.infoPages.list()
        setProjects((boards as Array<{ id: string; name: string }>).map(b => ({ id: b.id, name: b.name })))
      } catch (e) { console.warn('[NewsTab] projects load failed:', e) }
      try {
        const t = await window.api.intelligence.getKnownTags('thematic')
        setKnownThematic(t || [])
      } catch (e) { console.warn('[NewsTab] known-tags load failed:', e) }
    })()
  }, [])

  async function handleRefreshNews() {
    setRefreshing(true)
    try {
      const result = await window.api.intelligence.fetchNews()
      if (result.ok) { await load() }
    } finally {
      setRefreshing(false)
    }
  }

  async function handleConfirmImported() {
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
    setPendingStatus(p => ({ ...p, [id]: true }))
    // Snapshot BEFORE write for decision log (Phase 5).
    const snap = sources.find(s => s.id === id)
    try {
      const res = await window.api.intelligence.updateStatus(
        id, status, undefined,
        localUser?.id, localUser?.name
      )
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
      if (status === 'approved') onApprove(res?.addedToPages)
      else onApprove()
    } finally {
      setPendingStatus(p => ({ ...p, [id]: false }))
    }
  }

  async function handleConfidence(id: string, confidence: string) {
    await window.api.intelligence.updateConfidence(id, confidence)
    setSources(prev => prev.map(s => s.id === id ? { ...s, confidence: confidence as any, confidence_override: 1 } : s))
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

  // Phase 1: Project selector change — immediately persist to disposition_tags.
  async function handleProjectSelect(id: string, projectName: string) {
    await handleSetTags(id, 'disposition', projectName ? [projectName] : [])
    // Clear any gate error for this article since project requirement is now met.
    setGateError(prev => {
      const n = { ...prev }
      if (n[id]) n[id] = { ...n[id], missingProject: false }
      return n
    })
  }

  // Create a new registry tag, refresh the local registry, then attach it.
  async function handleCreateTag(id: string, type: 'thematic', current: string[], name: string) {
    try {
      const res = await window.api.intelligence.createTag(name, type)
      if (!res?.ok || !res.name) return
      setKnownThematic(prev => prev.includes(res.name) ? prev : [...prev, res.name].sort((a, b) => a.localeCompare(b)))
      if (!current.includes(res.name)) await handleSetTags(id, type, [...current, res.name])
    } catch (e) { console.warn('[NewsTab] createTag failed:', e) }
  }

  // Admin: delete a tag from the known_tags registry. Existing article chips are
  // kept (articles retain their stored JSON) but the tag leaves the autocomplete.
  async function handleDeleteTag(type: 'thematic', name: string) {
    if (!confirm(`Delete tag "${name}" from the registry? Articles that already use it will keep it as a chip.`)) return
    try {
      await window.api.intelligence.deleteTag(name, type)
      setKnownThematic(prev => prev.filter(t => t !== name))
    } catch (e) { console.warn('[NewsTab] deleteTag failed:', e) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this source permanently?')) return
    await window.api.intelligence.deleteSource(id)
    setSources(prev => prev.filter(s => s.id !== id))
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return dateStr }
  }

  // Client-side minimum-relevance filter + sort: relevance_score DESC (NULL last), then published_at DESC.
  const visible = useMemo(() => {
    const filtered = minRelevance > 0
      ? sources.filter(s => (s.relevance_score ?? -1) >= minRelevance)
      : sources
    return [...filtered].sort((a, b) => {
      const sa = a.relevance_score, sb = b.relevance_score
      if (sa == null && sb != null) return 1
      if (sa != null && sb == null) return -1
      if (sa != null && sb != null && sa !== sb) return sb - sa
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0
      return tb - ta
    })
  }, [sources, minRelevance])

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

        {isRoot && (
          <div className="ml-auto flex items-center gap-2">
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
          </div>
        )}
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
              disabled={confirmingImported}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              {confirmingImported ? 'Confirming…' : 'Confirm all as Medium confidence'}
            </button>
          )}
        </div>
      )}

      {/* Article list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
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
              {statusFilter === 'unreviewed' ? 'Queue is empty' : 'No articles found'}
            </p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">
              {statusFilter || confidenceFilter || categoryFilter || search || minRelevance > 0
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
          const isPending = pendingStatus[source.id]
          const isFading = fadingIds.has(source.id)

          // Phase 1: compute effective project (stored or first-project default).
          const defaultProject = projects[0]?.name ?? ''
          const projectSel = dispoTags[0] || defaultProject

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
              className={`bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-4 hover:border-gray-300 dark:hover:border-white/[0.12] transition-all duration-300 ${isFading ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
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
                          value={projectSel}
                          onChange={e => handleProjectSelect(source.id, e.target.value)}
                          className={`px-2 py-0.5 rounded text-[11px] border focus:outline-none focus:ring-1 focus:ring-indigo-500/50 bg-white dark:bg-gray-900 text-gray-700 dark:text-white/80 ${
                            gateErr?.missingProject
                              ? 'border-red-400 dark:border-red-500'
                              : 'border-gray-200 dark:border-white/[0.15]'
                          }`}
                        >
                          {projects.map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-gray-400 dark:text-white/30">Loading…</span>
                      )}
                    </div>

                    {/* TOPIC tag picker (thematic) — portal-based, admin can delete from registry. */}
                    <TagPicker
                      label="Topic"
                      value={themaTags}
                      known={knownThematic}
                      chipClass="bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300"
                      onAdd={tag => {
                        handleSetTags(source.id, 'thematic', [...themaTags, tag])
                        // Clear gate error once topic is satisfied.
                        setGateError(prev => {
                          const n = { ...prev }
                          if (n[source.id]) n[source.id] = { ...n[source.id], missingTopic: false }
                          return n
                        })
                      }}
                      onRemove={tag => handleSetTags(source.id, 'thematic', themaTags.filter(t => t !== tag))}
                      onCreate={name => handleCreateTag(source.id, 'thematic', themaTags, name)}
                      onDelete={isRoot ? tag => handleDeleteTag('thematic', tag) : undefined}
                      isAdmin={isRoot}
                      forceOpen={forceOpenTopicId === source.id}
                    />
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

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
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
                          setForceOpenTopicId(source.id)
                          setTimeout(() => setForceOpenTopicId(null), 0)
                        }
                        return
                      }
                      // Clear any gate error.
                      setGateError(prev => { const n = { ...prev }; delete n[source.id]; return n })
                      // Auto-save project to disposition_tags if not yet persisted.
                      if (dispoTags.length === 0 && projectSel) {
                        await handleSetTags(source.id, 'disposition', [projectSel])
                      }
                      handleStatus(source.id, 'approved')
                    }}
                    disabled={isPending}
                    title={gateTooltip}
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
                    disabled={isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v5M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 7.5v1a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    Save
                  </button>
                )}
                {/* Reject — ungated */}
                {source.status !== 'rejected' && (
                  <button
                    onClick={() => handleStatus(source.id, 'rejected')}
                    disabled={isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    Reject
                  </button>
                )}
                {/* Delete */}
                {isRoot && (
                  <button
                    onClick={() => handleDelete(source.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    title="Delete permanently"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
