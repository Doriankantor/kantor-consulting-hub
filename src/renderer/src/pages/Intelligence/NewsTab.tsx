import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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

// Mirror the backend tag normalization for live previews (trim, lowercase,
// spaces→hyphens). The backend re-normalizes authoritatively.
function normalizeTagClient(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

function readTags(raw: string | null): string[] {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

// A removable-chip tag picker with autocomplete from a known-tags registry and
// an explicit "+ create" affordance for new tags.
function TagPicker({ label, value, known, chipClass, onAdd, onRemove, onCreate }: {
  label: string
  value: string[]
  known: string[]
  chipClass: string
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  onCreate: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const norm = normalizeTagClient(query)
  const available = known.filter(t => !value.includes(t))
  const matches = norm ? available.filter(t => t.includes(norm)) : available
  const exactExists = known.includes(norm)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30 mr-0.5">{label}</span>
        {value.map(tag => (
          <span key={tag} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${chipClass}`}>
            {tag}
            <button onClick={() => onRemove(tag)} className="opacity-50 hover:opacity-100" title="Remove tag">
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          </span>
        ))}
        <button
          onClick={() => setOpen(o => !o)}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 dark:text-white/30 border border-dashed border-gray-300 dark:border-white/[0.15] hover:text-gray-600 dark:hover:text-white/60"
          title={`Add ${label.toLowerCase()} tag`}
        >
          + tag
        </button>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-56 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-800 shadow-lg p-1">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && norm) {
                if (known.includes(norm)) onAdd(norm); else onCreate(norm)
                setQuery(''); setOpen(false)
              }
              if (e.key === 'Escape') { setOpen(false); setQuery('') }
            }}
            placeholder="Search or create…"
            className="w-full px-2 py-1 rounded text-[11px] border border-gray-200 dark:border-white/[0.12] bg-transparent text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 mb-1"
          />
          {matches.map(t => (
            <button
              key={t}
              onClick={() => { onAdd(t); setQuery(''); setOpen(false) }}
              className="block w-full text-left px-2 py-1 rounded text-[11px] text-gray-700 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            >
              {t}
            </button>
          ))}
          {norm && !exactExists && (
            <button
              onClick={() => { onCreate(norm); setQuery(''); setOpen(false) }}
              className="block w-full text-left px-2 py-1 rounded text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
            >
              + create &quot;{norm}&quot;
            </button>
          )}
          {matches.length === 0 && !norm && (
            <p className="px-2 py-1 text-[11px] text-gray-400 dark:text-white/30">No tags yet — type to create one</p>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  onApprove: (addedToPages?: string[]) => void
}

export default function NewsTab({ onApprove }: Props) {
  const { localUser, isAdmin } = useAuth()
  const [sources, setSources] = useState<IntelligenceSource[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [confidenceFilter, setConfidenceFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [minRelevance, setMinRelevance] = useState(0)
  const [search, setSearch] = useState('')
  const [geoEdit, setGeoEdit] = useState<{ id: string; value: string } | null>(null)
  const [pendingStatus, setPendingStatus] = useState<Record<string, boolean>>({})
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set())
  const [knownDisposition, setKnownDisposition] = useState<string[]>([])
  const [knownThematic, setKnownThematic] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [confirmingImported, setConfirmingImported] = useState(false)

  const refreshImportedCount = useCallback(async () => {
    try { setImportedCount(await window.api.intelligence.getImportedCount()) } catch { /* ignore */ }
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
      // citations, not news. They must never appear in the News Articles feed —
      // only journalistic sources are listed and graded here.
      setSources(data.filter((s) => s.added_by_name !== 'Kantor Framework'))
    } catch (e) {
      console.error('[NewsTab] load error:', e)
    } finally {
      setLoading(false)
    }
    refreshImportedCount()
  }, [statusFilter, confidenceFilter, categoryFilter, search, refreshImportedCount])

  useEffect(() => { load() }, [load])

  // Load the disposition + thematic tag registries once on mount.
  useEffect(() => {
    (async () => {
      try {
        const [d, t] = await Promise.all([
          window.api.intelligence.getKnownTags('disposition'),
          window.api.intelligence.getKnownTags('thematic'),
        ])
        setKnownDisposition(d || [])
        setKnownThematic(t || [])
      } catch (e) { console.warn('[NewsTab] known-tags load failed:', e) }
    })()
  }, [])

  async function handleRefreshNews() {
    setRefreshing(true)
    try {
      const result = await window.api.intelligence.fetchNews()
      if (result.ok) {
        await load()
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function handleImportContestedSkies() {
    setImporting(true)
    try {
      const res = await window.api.intelligence.importFromContestedSkies({ userId: localUser?.id, addedByName: localUser?.name })
      if (res.ok) await load()
      else alert(res.error || 'Import failed')
    } finally {
      setImporting(false)
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
    // Snapshot the article BEFORE the status write so the decision log captures
    // the AI proposal alongside the human-final state. (Phase 5, capture-only.)
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
      // Update badge in-place — do NOT call load() so scroll position is preserved
      setSources(prev => prev.map(s => s.id === id ? { ...s, status: status as any } : s))
      // If a status filter is active and the item no longer matches, fade it out
      if (statusFilter && status !== statusFilter) {
        setFadingIds(f => new Set([...f, id]))
        setTimeout(() => {
          setSources(curr => curr.filter(s => s.id !== id))
          setFadingIds(f => { const n = new Set(f); n.delete(id); return n })
        }, 350)
      }
      if (status === 'approved') onApprove(res?.addedToPages)
      else onApprove() // keep pending-review counter current
    } finally {
      setPendingStatus(p => ({ ...p, [id]: false }))
    }
  }

  async function handleConfidence(id: string, confidence: string) {
    await window.api.intelligence.updateConfidence(id, confidence)
    setSources(prev => prev.map(s => s.id === id ? { ...s, confidence: confidence as any, confidence_override: 1 } : s))
  }

  // Human confirms / corrects the gate's proposed geography. Once saved, the row
  // is marked geography_confirmed=1 so the "AI" marker disappears and the gate
  // will never overwrite it on a later classification pass.
  async function handleGeography(id: string, geography: string) {
    const value = geography.trim()
    await window.api.intelligence.updateGeography(id, value)
    setSources(prev => prev.map(s =>
      s.id === id ? { ...s, geography: value, geography_confirmed: 1 } : s
    ))
    setGeoEdit(null)
  }

  // Phase 4: write a tag set for one type (disposition|thematic) immediately.
  async function handleSetTags(id: string, type: 'disposition' | 'thematic', tags: string[]) {
    const col = type === 'disposition' ? 'disposition_tags' : 'thematic_tags'
    try {
      const res = await window.api.intelligence.setArticleTags(id, type, tags)
      const final = res?.tags ?? tags
      setSources(prev => prev.map(s => s.id === id ? { ...s, [col]: JSON.stringify(final) } : s))
    } catch (e) { console.warn('[NewsTab] setArticleTags failed:', e) }
  }

  // Create a new registry tag, refresh the local registry, then attach it.
  async function handleCreateTag(id: string, type: 'disposition' | 'thematic', current: string[], name: string) {
    try {
      const res = await window.api.intelligence.createTag(name, type)
      if (!res?.ok || !res.name) return
      const setKnown = type === 'disposition' ? setKnownDisposition : setKnownThematic
      setKnown(prev => prev.includes(res.name) ? prev : [...prev, res.name].sort((a, b) => a.localeCompare(b)))
      if (!current.includes(res.name)) await handleSetTags(id, type, [...current, res.name])
    } catch (e) { console.warn('[NewsTab] createTag failed:', e) }
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

  // Client-side minimum-relevance filter + default ordering:
  // relevance_score DESC (NULL last), then published_at DESC.
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

        <span className="text-xs text-gray-400 dark:text-white/30 ml-1">{visible.length} items</span>

        {isAdmin && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleImportContestedSkies}
              disabled={importing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-300 dark:border-orange-500/40 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 text-xs font-medium transition disabled:opacity-50"
            >
              {importing ? (
                <span className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-500 rounded-full animate-spin" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v6M3.5 5L6 7.5 8.5 5M2 9.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
              {importing ? 'Importing…' : 'Import Contested Skies'}
            </button>
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
          {isAdmin && (
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
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">No articles found</p>
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
                    {/* Relevance-score badge (gate's 0-10 Colombia relevance) */}
                    {(() => {
                      const rb = relevanceBadge(source.relevance_score)
                      return (
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${rb.cls}`}
                          title="Colombia relevance score (0–10)"
                        >
                          <span className="opacity-60 font-medium">REL</span>{rb.label}
                        </span>
                      )
                    })()}
                    {/* Relevance-type badge (gate's proposed classification) */}
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
                    {/* Origin badge for imported sources */}
                    {source.added_by_name === 'Imported from Contested Skies' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40">
                        from Contested Skies
                      </span>
                    )}
                    {/* Fixed authoritative framework reference (Kantor / FIU) — not graded */}
                    {source.added_by_name === 'Kantor Framework' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300"
                        title="Fixed authoritative framework reference — not graded">
                        Framework — fixed
                      </span>
                    )}
                    {/* Source-archive origin badge */}
                    {source.added_by_name === 'Contested Skies Archive' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40">
                        Source archive
                      </span>
                    )}
                    {/* Published-to-info-page badge (feedback loop) */}
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

                    {/* Geography — gate proposes (geography_confirmed=0), human confirms/edits */}
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
                        <button
                          onClick={() => handleGeography(source.id, geoEdit.value)}
                          className="p-0.5 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                          title="Save geography"
                        >
                          <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button
                          onClick={() => setGeoEdit(null)}
                          className="p-0.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                          title="Cancel"
                        >
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
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition line-clamp-2"
                    >
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
                        <span key={cat} className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Phase 4: Disposition + Topic tag pickers (save immediately) */}
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5 mt-2.5">
                    <TagPicker
                      label="Disposition"
                      value={dispoTags}
                      known={knownDisposition}
                      chipClass="bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300"
                      onAdd={tag => handleSetTags(source.id, 'disposition', [...dispoTags, tag])}
                      onRemove={tag => handleSetTags(source.id, 'disposition', dispoTags.filter(t => t !== tag))}
                      onCreate={name => handleCreateTag(source.id, 'disposition', dispoTags, name)}
                    />
                    <TagPicker
                      label="Topic"
                      value={themaTags}
                      known={knownThematic}
                      chipClass="bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300"
                      onAdd={tag => handleSetTags(source.id, 'thematic', [...themaTags, tag])}
                      onRemove={tag => handleSetTags(source.id, 'thematic', themaTags.filter(t => t !== tag))}
                      onCreate={name => handleCreateTag(source.id, 'thematic', themaTags, name)}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
                {/* Confidence: fixed for framework refs, gradeable for journalistic sources */}
                {source.added_by_name === 'Kantor Framework' ? (
                  <span
                    className="px-2 py-1 rounded text-[11px] border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 font-medium"
                    title="Fixed authoritative source — confidence is not graded"
                  >
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

                {/* Approve */}
                {source.status !== 'approved' && source.status !== 'pushed' && (
                  <button
                    onClick={() => handleStatus(source.id, 'approved')}
                    disabled={isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Approve
                  </button>
                )}
                {/* Save */}
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
                {/* Reject */}
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
                {isAdmin && (
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
