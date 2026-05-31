import { useState, useEffect, useCallback, useRef } from 'react'

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

interface SourceContent {
  source_id?: string
  url?: string | null
  snippet?: string
  type?: string
  source_name?: string | null
  platform?: string | null
  handle?: string | null
  categories?: string[]
  published_at?: string | null
}

function parseContent(raw: string | null | undefined): SourceContent {
  if (!raw) return {}
  try { return JSON.parse(raw) as SourceContent } catch { return {} }
}

export default function SourcesTab({ pageId }: Props) {
  const [items, setItems] = useState<InfoPageSourceItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // Baseline for "new since last visit" — captured once per mount.
  const seenKey = `kc-infopage-sources-seen-${pageId}`
  const baselineRef = useRef<number>(0)
  if (baselineRef.current === 0) {
    const stored = localStorage.getItem(seenKey)
    baselineRef.current = stored ? new Date(stored).getTime() : 0
  }

  const load = useCallback(async () => {
    try {
      const rows = await window.api.infoPages.getSourceItems(pageId)
      setItems(rows)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [pageId])

  // Initial backfill + load, then poll every 15s (STEP 3: real-time within 30s).
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try { await window.api.infoPages.syncSources(pageId) } catch { /* ignore */ }
      if (!cancelled) await load()
    }
    tick()
    const interval = setInterval(tick, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
      // Mark everything seen as of now when leaving the tab.
      localStorage.setItem(seenKey, new Date().toISOString())
    }
  }, [pageId, load, seenKey])

  const ready = items.filter(i => i.status === 'ready_for_analysis')
  const inAnalysis = items.filter(i => i.status === 'in_analysis')
  const newCount = ready.filter(i => new Date(i.created_at).getTime() > baselineRef.current).length

  function isNew(item: InfoPageSourceItem): boolean {
    return item.status === 'ready_for_analysis' && new Date(item.created_at).getTime() > baselineRef.current
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  function selectAllReady() {
    setSelected(new Set(ready.map(i => i.id)))
  }

  async function sendToAnalysis(itemIds: string[]) {
    if (!itemIds.length) return
    setSending(true)
    try {
      await window.api.infoPages.sendSourcesToAnalysis(itemIds)
      setSelected(prev => {
        const s = new Set(prev)
        itemIds.forEach(id => s.delete(id))
        return s
      })
      await load()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-700 dark:text-white/75">
            {loading ? 'Loading…' : `${ready.length} source${ready.length !== 1 ? 's' : ''} ready · ${inAnalysis.length} in analysis`}
          </p>
          {newCount > 0 && (
            <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5 font-medium">
              {newCount} new source{newCount !== 1 ? 's' : ''} since last visit
            </p>
          )}
        </div>
        {ready.length > 0 && (
          <button
            onClick={selectAllReady}
            className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition"
          >
            Select all
          </button>
        )}
      </div>

      {/* Sources list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400 dark:text-white/30">No intelligence sources yet.</p>
            <p className="text-xs text-gray-400 dark:text-white/20 mt-1">
              Approved sources matching this page's keywords appear here automatically.
            </p>
          </div>
        )}
        {items.map(item => {
          const content = parseContent(item.content_json)
          const cats = content.categories || []
          const origin = content.source_name || content.platform || content.type || 'Source Intelligence'
          const sel = selected.has(item.id)
          const analysing = item.status === 'in_analysis'
          return (
            <div
              key={item.id}
              onClick={() => { if (!analysing) toggleSelect(item.id) }}
              className={`flex items-start gap-2.5 p-3 rounded-xl border transition ${analysing ? 'opacity-70 cursor-default' : 'cursor-pointer'} ${
                sel
                  ? 'border-indigo-300 dark:border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/5'
                  : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/[0.1]'
              }`}
            >
              {!analysing ? (
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggleSelect(item.id)}
                  onClick={e => e.stopPropagation()}
                  className="mt-0.5 w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500/30 cursor-pointer shrink-0"
                />
              ) : (
                <span className="mt-1 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-medium shrink-0">
                  In analysis
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  {isNew(item) && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="New" />}
                  {item.confidence && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase ${CONF_STYLES[item.confidence] || CONF_STYLES.low}`}>
                      {item.confidence}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 dark:text-white/30">{origin}</span>
                  {content.published_at && (
                    <span className="text-[10px] text-gray-400 dark:text-white/30">{new Date(content.published_at).toLocaleDateString()}</span>
                  )}
                </div>
                <p className="text-xs font-medium text-gray-800 dark:text-white/85 line-clamp-2">
                  {item.title || 'Untitled'}
                </p>
                {content.snippet && (
                  <p className="text-[11px] text-gray-500 dark:text-white/40 mt-0.5 line-clamp-2">{content.snippet}</p>
                )}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="text-[9px] text-gray-400 dark:text-white/25">From: Source Intelligence</span>
                  {cats.slice(0, 3).map(cat => (
                    <span key={cat} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40">
                      {cat}
                    </span>
                  ))}
                </div>
                {!analysing && (
                  <button
                    onClick={e => { e.stopPropagation(); sendToAnalysis([item.id]) }}
                    disabled={sending}
                    className="mt-2 text-[10px] px-2 py-1 rounded-lg border border-purple-300 dark:border-purple-500/30 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition disabled:opacity-50"
                  >
                    Send to Claude Analysis →
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900">
          <button
            onClick={() => sendToAnalysis(Array.from(selected))}
            disabled={sending}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-purple-500 hover:bg-purple-600 text-white transition disabled:opacity-50"
          >
            {sending ? 'Sending…' : `Send ${selected.size} selected to Claude Analysis`}
          </button>
        </div>
      )}
    </div>
  )
}
