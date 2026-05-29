import { useState, useEffect, useCallback } from 'react'

interface Props {
  pageId: string
  page: InfoPage
  localUser: { id: string; name: string } | null
}

const CONF_STYLES: Record<string, string> = {
  high:   'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
  medium: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  low:    'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
}

function matchesKeywords(source: IntelligenceSource, keywords: string[]): boolean {
  if (!keywords.length) return true
  const text = [(source.title || ''), (source.snippet || ''), (source.content || ''), (source.source_name || '')].join(' ').toLowerCase()
  return keywords.some(kw => text.includes(kw.trim().toLowerCase()))
}

export default function SourcesTab({ pageId, page, localUser }: Props) {
  const [allSources, setAllSources] = useState<IntelligenceSource[]>([])
  const [filtered, setFiltered] = useState<IntelligenceSource[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [committing, setCommitting] = useState(false)

  const config: InfoPageConfig = page.board_config ? (() => { try { return JSON.parse(page.board_config!) } catch { return {} } })() : {}
  const keywords = (config.keywords || '').split(',').map(k => k.trim()).filter(Boolean)

  const loadSources = useCallback(async () => {
    setLoading(true)
    try {
      const sources = await window.api.intelligence.getSources({ status: 'approved', limit: 200 })
      setAllSources(sources)
      setFiltered(sources.filter(s => matchesKeywords(s, keywords)))
    } catch {} finally {
      setLoading(false)
    }
  }, [pageId, config.keywords])

  useEffect(() => { loadSources() }, [loadSources])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  function selectAllHighConfidence() {
    const highIds = filtered.filter(s => s.confidence === 'high').map(s => s.id)
    setSelected(prev => {
      const s = new Set(prev)
      highIds.forEach(id => s.add(id))
      return s
    })
  }

  async function handleCommit() {
    if (!selected.size || !localUser) return
    setCommitting(true)
    try {
      // Add each selected source as an info_page_item under 'sources' tab, then commit
      const itemIds: string[] = []
      for (const sourceId of Array.from(selected)) {
        const src = allSources.find(s => s.id === sourceId)
        if (!src) continue
        const res = await window.api.infoPages.addItem({
          page_id: pageId,
          tab: 'sources',
          sub_type: 'intelligence_source',
          title: src.title || src.handle || 'Untitled',
          content_json: JSON.stringify({ source_id: src.id, url: src.url, snippet: src.snippet }),
          confidence: src.confidence || 'low',
          source_ref: src.source_name || src.platform || '',
          created_by_id: localUser.id,
          created_by_name: localUser.name,
        })
        itemIds.push(res.id)
      }
      if (itemIds.length) {
        await window.api.infoPages.commitItems({
          pageId,
          itemIds,
          submittedById: localUser.id,
          submittedByName: localUser.name,
        })
      }
      setSelected(new Set())
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-700 dark:text-white/75">
            {loading ? 'Loading…' : `${filtered.length} sources matching keywords`}
          </p>
          {keywords.length > 0 && (
            <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5 truncate max-w-sm">
              Keywords: {keywords.slice(0, 5).join(', ')}{keywords.length > 5 ? `… +${keywords.length - 5}` : ''}
            </p>
          )}
        </div>
        <button
          onClick={selectAllHighConfidence}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 transition"
        >
          Select all high confidence
        </button>
      </div>

      {/* Sources list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400 dark:text-white/30">No approved sources matching your keywords.</p>
            <p className="text-xs text-gray-400 dark:text-white/20 mt-1">Review and approve sources in the Intelligence tab first.</p>
          </div>
        )}
        {filtered.map(source => (
          <div
            key={source.id}
            onClick={() => toggleSelect(source.id)}
            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
              selected.has(source.id)
                ? 'border-indigo-300 dark:border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/5'
                : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/[0.1]'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(source.id)}
              onChange={() => toggleSelect(source.id)}
              onClick={e => e.stopPropagation()}
              className="mt-0.5 w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500/30 cursor-pointer shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                {source.confidence && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase ${CONF_STYLES[source.confidence] || CONF_STYLES.low}`}>
                    {source.confidence}
                  </span>
                )}
                <span className="text-[10px] text-gray-400 dark:text-white/30">{source.source_name || source.platform || 'Unknown source'}</span>
                {source.published_at && (
                  <span className="text-[10px] text-gray-400 dark:text-white/30">{new Date(source.published_at).toLocaleDateString()}</span>
                )}
              </div>
              <p className="text-xs font-medium text-gray-800 dark:text-white/85 line-clamp-2">
                {source.title || source.handle || 'Untitled'}
              </p>
              {source.snippet && (
                <p className="text-[11px] text-gray-500 dark:text-white/40 mt-0.5 line-clamp-2">{source.snippet}</p>
              )}
              {/* Category tags */}
              {source.categories_json && (() => {
                try {
                  const cats: string[] = JSON.parse(source.categories_json)
                  return cats.length > 0 ? (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {cats.slice(0, 3).map(cat => (
                        <span key={cat} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40">
                          {cat}
                        </span>
                      ))}
                    </div>
                  ) : null
                } catch { return null }
              })()}
            </div>
          </div>
        ))}
      </div>

      {/* Commit bar */}
      {selected.size > 0 && (
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900">
          <button
            onClick={handleCommit}
            disabled={committing}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-purple-500 hover:bg-purple-600 text-white transition disabled:opacity-50"
          >
            {committing ? 'Committing…' : `Commit ${selected.size} source${selected.size !== 1 ? 's' : ''} for review`}
          </button>
        </div>
      )}
    </div>
  )
}
