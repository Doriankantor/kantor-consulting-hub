import { useState, useEffect, useCallback } from 'react'
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
}

const ALL_CATEGORIES = [
  'Incident', 'Investment & Procurement', 'Innovation & Technology',
  'Policy & Regulation', 'Criminal & VNSA Activity', 'Counter-drone / C-UAS',
  'State Military Activity', 'Finance & Sanctions', 'Extra-regional Supplier',
]

interface Props {
  onApprove: () => void
}

export default function NewsTab({ onApprove }: Props) {
  const { localUser, isAdmin } = useAuth()
  const [sources, setSources] = useState<IntelligenceSource[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [confidenceFilter, setConfidenceFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [pendingStatus, setPendingStatus] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { type: 'article' }
      if (statusFilter)     params.status     = statusFilter
      if (confidenceFilter) params.confidence = confidenceFilter
      if (categoryFilter)   params.category   = categoryFilter
      if (search)           params.search     = search
      const data = await window.api.intelligence.getSources(params)
      setSources(data)
    } catch (e) {
      console.error('[NewsTab] load error:', e)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, confidenceFilter, categoryFilter, search])

  useEffect(() => { load() }, [load])

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

  async function handleStatus(id: string, status: string) {
    setPendingStatus(p => ({ ...p, [id]: true }))
    try {
      await window.api.intelligence.updateStatus(
        id, status, undefined,
        localUser?.id, localUser?.name
      )
      await load()
      if (status === 'approved') onApprove()
    } finally {
      setPendingStatus(p => ({ ...p, [id]: false }))
    }
  }

  async function handleConfidence(id: string, confidence: string) {
    await window.api.intelligence.updateConfidence(id, confidence)
    setSources(prev => prev.map(s => s.id === id ? { ...s, confidence: confidence as any, confidence_override: 1 } : s))
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

        <span className="text-xs text-gray-400 dark:text-white/30 ml-1">{sources.length} items</span>

        {isAdmin && (
          <button
            onClick={handleRefreshNews}
            disabled={refreshing}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition disabled:opacity-50"
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

      {/* Article list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && sources.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-400 dark:text-white/30">
                <path d="M3 5h14M3 10h14M3 15h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">No articles found</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">
              {statusFilter || confidenceFilter || categoryFilter || search
                ? 'Try adjusting your filters'
                : 'Click "Refresh now" to fetch the latest news'}
            </p>
          </div>
        )}

        {!loading && sources.map(source => {
          const conf = source.confidence || 'low'
          const confStyle = CONFIDENCE_COLORS[conf as keyof typeof CONFIDENCE_COLORS] || CONFIDENCE_COLORS.low
          const cats: string[] = (() => { try { return JSON.parse(source.categories_json || '[]') } catch { return [] } })()
          const isPending = pendingStatus[source.id]

          return (
            <div
              key={source.id}
              className="bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-4 hover:border-gray-300 dark:hover:border-white/[0.12] transition"
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
                    {/* Status badge */}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${STATUS_COLORS[source.status] || STATUS_COLORS.unreviewed}`}>
                      {source.status}
                    </span>
                    {/* Source name */}
                    {source.source_name && (
                      <span className="text-xs text-gray-500 dark:text-white/40 font-medium">{source.source_name}</span>
                    )}
                    {/* Date */}
                    <span className="text-xs text-gray-400 dark:text-white/30">{formatDate(source.published_at)}</span>
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
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
                {/* Confidence override */}
                <select
                  value={source.confidence || 'low'}
                  onChange={e => handleConfidence(source.id, e.target.value)}
                  className="px-2 py-1 rounded text-[11px] border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-gray-600 dark:text-white/70 focus:outline-none"
                  title="Override confidence"
                >
                  <option value="high">High confidence</option>
                  <option value="medium">Medium confidence</option>
                  <option value="low">Low confidence</option>
                </select>

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
