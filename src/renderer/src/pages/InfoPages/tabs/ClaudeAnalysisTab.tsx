import { useState, useEffect } from 'react'

interface Props {
  pageId: string
  page: InfoPage
  canApprove: boolean
  localUser: { id: string; name: string } | null
}

interface AnalysisItem {
  action: string
  section: string
  detail: string
  confidence: string
  source: string
  priority: string
}

const CONF_STYLES: Record<string, string> = {
  high:   'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
  medium: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  low:    'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
}

const SECTION_STYLES: Record<string, string> = {
  'Incident Feed':            'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
  'Platforms & Capabilities': 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
  'Investment & Procurement': 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
  'Finance Nexus':            'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300',
  'Source Archive':           'bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/50',
  'Statistics':               'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300',
}

export default function ClaudeAnalysisTab({ pageId, page, canApprove: _canApprove, localUser }: Props) {
  const [analysisItems, setAnalysisItems] = useState<AnalysisItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)

  const config: InfoPageConfig = page.board_config ? (() => { try { return JSON.parse(page.board_config!) } catch { return {} } })() : {}

  async function runAnalysis() {
    setRunning(true)
    setError(null)
    setAnalysisItems([])
    setSelected(new Set())
    try {
      // Load approved sources from intelligence
      const sources = await window.api.intelligence.getSources({ status: 'approved', limit: 30 })
      // Load manual items for this page
      const manualItems = await window.api.infoPages.getItems(pageId, 'manual')

      const result = await window.api.infoPages.analyzeWithClaude({
        pageId,
        pageName: page.name,
        userId: localUser?.id,
        sources,
        manualItems,
      })

      if (!result.ok) {
        setError(result.error || 'Analysis failed')
      } else {
        setAnalysisItems(result.items || [])
      }
    } catch (e: any) {
      setError(e.message || 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  // Load previous analysis items
  useEffect(() => {
    async function loadPrevious() {
      try {
        const prev = await window.api.infoPages.getItems(pageId, 'analysis')
        if (prev.length > 0 && analysisItems.length === 0) {
          const parsed = prev.map(item => {
            const c = (() => { try { return JSON.parse(item.analysis_json || '{}') } catch { return {} } })()
            return c as AnalysisItem
          }).filter((c: AnalysisItem) => c.action)
          if (parsed.length > 0) setAnalysisItems(parsed)
        }
      } catch {}
    }
    loadPrevious()
  }, [pageId])

  function toggleSelect(i: number) {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(i)) s.delete(i)
      else s.add(i)
      return s
    })
  }

  function selectAllHigh() {
    const highIdxs = analysisItems
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.confidence === 'high' || item.priority === 'high')
      .map(({ i }) => i)
    setSelected(prev => {
      const s = new Set(prev)
      highIdxs.forEach(i => s.add(i))
      return s
    })
  }

  async function handleCommit() {
    if (!selected.size || !localUser) return
    setCommitting(true)
    try {
      const itemIds: string[] = []
      for (const idx of Array.from(selected)) {
        const item = analysisItems[idx]
        if (!item) continue
        const res = await window.api.infoPages.addItem({
          page_id: pageId,
          tab: 'analysis',
          sub_type: 'ai_suggestion',
          title: item.action,
          proposed_section: item.section,
          confidence: item.confidence,
          source_ref: item.source,
          analysis_json: JSON.stringify(item),
          priority: item.priority || 'medium',
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

  // Group by section
  const grouped: Record<string, { item: AnalysisItem; idx: number }[]> = {}
  analysisItems.forEach((item, idx) => {
    if (!grouped[item.section]) grouped[item.section] = []
    grouped[item.section].push({ item, idx })
  })

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-700 dark:text-white/75">Claude Analysis</p>
          {config.live_url && (
            <p className="text-[10px] text-gray-400 dark:text-white/30">{config.live_url}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {analysisItems.length > 0 && (
            <button onClick={selectAllHigh} className="text-xs px-2.5 py-1.5 rounded-lg border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 transition">
              Select all high
            </button>
          )}
          <button
            onClick={runAnalysis}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50"
          >
            {running ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M4.5 6l1.2 1.2L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Analyze with Claude
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {analysisItems.length === 0 && !running && !error && (
          <div className="text-center py-8">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mx-auto mb-3 text-gray-300 dark:text-white/20">
              <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2"/>
              <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="2"/>
              <path d="M16 3v4M16 25v4M3 16h4M25 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p className="text-sm text-gray-400 dark:text-white/30">Click "Analyze with Claude" to generate a todo list</p>
            <p className="text-xs text-gray-400 dark:text-white/20 mt-1">Claude will analyze approved sources and manual info to suggest website updates.</p>
          </div>
        )}

        {Object.entries(grouped).map(([section, items]) => (
          <div key={section}>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 mb-2">{section}</h4>
            <div className="space-y-2">
              {items.map(({ item, idx }) => (
                <div
                  key={idx}
                  onClick={() => toggleSelect(idx)}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                    selected.has(idx)
                      ? 'border-indigo-300 dark:border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/5'
                      : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/[0.1]'
                  }`}
                >
                  <input type="checkbox" checked={selected.has(idx)} onChange={() => toggleSelect(idx)} onClick={e => e.stopPropagation()}
                    className="mt-0.5 w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500/30 cursor-pointer shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${SECTION_STYLES[item.section] || SECTION_STYLES['Source Archive']}`}>
                        {item.section}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${CONF_STYLES[item.confidence] || CONF_STYLES.low}`}>
                        {item.confidence}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-white/85">{item.action}</p>
                    <p className="text-[11px] text-gray-500 dark:text-white/50 mt-0.5">{item.detail}</p>
                    <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">Source: {item.source}</p>
                  </div>
                </div>
              ))}
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
            {committing ? 'Committing…' : `Commit ${selected.size} suggestion${selected.size !== 1 ? 's' : ''} for review`}
          </button>
        </div>
      )}
    </div>
  )
}
