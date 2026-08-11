import { useState, useEffect, useCallback, useMemo } from 'react'
import PipelineSourceCard from './PipelineSourceCard'
import { groupByArticle } from './groupByArticle'
import { classifyGeo } from '../../Intelligence/geographyVocab'
import { SECTION_LABELS } from '../../Intelligence/sectionLabels'
import { resolveIncident } from '../../Intelligence/resolveAnalysis'

interface Props {
  pageId: string
}

// Y2: sentinel for the category dropdown's "Incidents" option — distinct from every section key.
// (Same value NewsTab uses; kept local so the two filter bars stay independent.)
const INCIDENTS_FILTER = '__incidents__'

// Parse a JSON-string array column (subject_countries, etc.) defensively → [] on null/invalid.
// Same helper NewsTab uses; a missing parse would silently match nothing.
function readTags(raw: string | null): string[] {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
// Parse the analysis_json blob → {} on missing/invalid (mirrors PipelineSourceCard/NewsTab).
function parseAnalysis(raw: string | null | undefined): { ai?: any; human?: any; reconciled?: any } {
  if (!raw) return {}
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : {} } catch { return {} }
}

// All Sources = the committed source library for this Info Page. Read-only,
// newest-committed first. This is the reference material Cowork will later use
// to build the page — not generated page content.
export default function AllSourcesTab({ pageId }: Props) {
  const [rows, setRows] = useState<InfoPageSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  // Y2 filter bar — client-side only, over the fully-loaded committed set (no reload on change).
  // Omits NewsTab's status/project/refresh/add controls (no unreviewed lifecycle on committed sources).
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')       // '' = all; else a section KEY or INCIDENTS_FILTER
  const [confidenceFilter, setConfidenceFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('all')      // 'all' | 'latam' | 'extra' | 'both'
  const [minRelevance, setMinRelevance] = useState(0)
  // Default = newest-committed, preserving this tab's identity (the load() committed_at DESC order).
  // Persisted per NewsTab's 'intel-news-sort' pattern; any non-literal value falls back to 'committed'.
  const [sort, setSort] = useState<'committed' | 'relevance' | 'date'>(() => {
    try {
      const v = localStorage.getItem('allsources-sort')
      if (v === 'committed' || v === 'relevance' || v === 'date') return v
    } catch { /* ignore */ }
    return 'committed'
  })
  useEffect(() => {
    try { localStorage.setItem('allsources-sort', sort) } catch { /* ignore */ }
  }, [sort])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await window.api.infoPages.getSourcePipeline(pageId)
      const committed = all
        .filter(r => r.stage === 'committed')
        .sort((a, b) => {
          const ta = a.committed_at ? new Date(a.committed_at).getTime() : 0
          const tb = b.committed_at ? new Date(b.committed_at).getTime() : 0
          return tb - ta
        })
      setRows(committed)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [pageId])

  useEffect(() => { load() }, [load])

  // Y2: filter the committed ROWS first (every predicate field lives on the row), THEN group. This is
  // a pure useMemo over the already-loaded set — changing a filter never re-calls getSourcePipeline and
  // never remounts the list. Predicates copied faithfully from NewsTab's `visible` memo; NewsTab pushes
  // search/confidence server-side, so here they become client-side predicates with the same semantics.
  const visible = useMemo(() => {
    let filtered = rows
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      filtered = filtered.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.snippet || '').toLowerCase().includes(q) ||
        (r.source_name || '').toLowerCase().includes(q))
    }
    if (confidenceFilter) filtered = filtered.filter(r => r.confidence === confidenceFilter)
    if (minRelevance > 0) filtered = filtered.filter(r => (r.relevance_score ?? -1) >= minRelevance)
    // Region (from subject_countries): 'latam'/'extra' are INCLUSIVE — a mixed source passes each side
    // it touches; 'both' is the narrower "is mixed" test. Empty-geography rows appear only under 'all'.
    if (regionFilter !== 'all') filtered = filtered.filter(r => {
      const { hasLatam, hasExtra } = classifyGeo(readTags(r.subject_countries ?? null))
      return regionFilter === 'latam' ? hasLatam
        : regionFilter === 'extra' ? hasExtra
        : hasLatam && hasExtra   // 'both'
    })
    // Category: a canonical CS section or Incidents. Match the lit/selected chips — routing.confirmed is
    // authoritative once touched (even if []), else fall back to proposed_sections (confirmed-else-
    // proposed). confirmed is string[] of KEYS; proposed_sections is {section,confidence}[]. NOT ai_category.
    if (sectionFilter) filtered = filtered.filter(r => {
      const analysis = parseAnalysis(r.analysis_json)
      if (sectionFilter === INCIDENTS_FILTER) return resolveIncident(analysis).isIncident
      const routing = ((analysis as any).routing ?? {}) as Record<string, any>
      const sections = Array.isArray(routing.confirmed) ? routing.confirmed
        : Array.isArray(routing.proposed_sections) ? routing.proposed_sections
        : []
      return sections.some((el: any) => (typeof el === 'string' ? el : el?.section) === sectionFilter)
    })
    // 'committed' (default) = committed_at DESC, nulls last — reproduces the load() first-paint order.
    if (sort === 'committed') {
      return [...filtered].sort((a, b) => {
        const ta = a.committed_at ? new Date(a.committed_at).getTime() : 0
        const tb = b.committed_at ? new Date(b.committed_at).getTime() : 0
        return tb - ta
      })
    }
    if (sort === 'date') {
      return [...filtered].sort((a, b) => {
        const ta = a.published_at ? new Date(a.published_at).getTime() : 0
        const tb = b.published_at ? new Date(b.published_at).getTime() : 0
        return tb - ta
      })
    }
    // 'relevance' = score DESC nulls-last, then published_at DESC (NewsTab's comparator).
    return [...filtered].sort((a, b) => {
      const sa = a.relevance_score, sb = b.relevance_score
      if (sa == null && sb != null) return 1
      if (sa != null && sb == null) return -1
      if (sa != null && sb != null && sa !== sb) return sb - sa
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0
      return tb - ta
    })
  }, [rows, search, confidenceFilter, minRelevance, regionFilter, sectionFilter, sort])

  // NS-2 Step 5: one card per ARTICLE (shared helper). Group the FILTERED rows for display + count.
  const grouped = useMemo(() => groupByArticle(visible), [visible])
  const filtersActive = !!search || !!sectionFilter || !!confidenceFilter || regionFilter !== 'all' || minRelevance > 0

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-700 dark:text-white/70">Committed source library</p>
        <span className="text-[11px] text-gray-400 dark:text-white/30">{grouped.length} source{grouped.length !== 1 ? 's' : ''}</span>
      </div>
      {/* Y2 filter bar — ported from NewsTab (search, category, confidence, region, relevance, sort). */}
      <div className="shrink-0 px-5 py-2.5 border-b border-gray-100 dark:border-white/[0.06] flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search sources..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 w-48"
        />
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
        {/* Canonical CS sections (routing.confirmed, else proposed_sections) + Incidents. KEY is the value. */}
        <select
          value={sectionFilter}
          onChange={e => setSectionFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-700 dark:text-white/80 focus:outline-none"
        >
          <option value="">All categories</option>
          {Object.entries(SECTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          <option value={INCIDENTS_FILTER}>Incidents</option>
        </select>
        {/* Region over subject_countries — LATAM/extra are inclusive, Both = mixed. */}
        <select
          value={regionFilter}
          onChange={e => setRegionFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-700 dark:text-white/80 focus:outline-none"
          title="Filter by geography region (LATAM / extra-LATAM / both)"
        >
          <option value="all">All regions</option>
          <option value="latam">LATAM</option>
          <option value="extra">extra-LATAM</option>
          <option value="both">Both</option>
        </select>
        <select
          value={minRelevance}
          onChange={e => setMinRelevance(Number(e.target.value))}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-700 dark:text-white/80 focus:outline-none"
          title="Minimum relevance score"
        >
          <option value={0}>Any relevance</option>
          <option value={4}>Relevance ≥ 4</option>
          <option value={7}>Relevance ≥ 7</option>
        </select>
        <select
          value={sort}
          onChange={e => { const v = e.target.value; setSort(v === 'relevance' || v === 'date' ? v : 'committed') }}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-700 dark:text-white/80 focus:outline-none"
          title="Sort by commit recency, relevance, or publish date"
        >
          <option value="committed">Sort: Newest committed</option>
          <option value="relevance">Sort: Relevance</option>
          <option value="date">Sort: Date</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">
              {filtersActive ? 'No sources match your filters' : 'No committed sources yet'}
            </p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">
              {filtersActive ? 'Try adjusting your filters' : 'Commit sources from Pre-Commit Review to build this library'}
            </p>
          </div>
        )}
        {grouped.map(g => (
          <PipelineSourceCard key={g.article_id} row={g} showDesignNotes />
        ))}
      </div>
    </div>
  )
}
