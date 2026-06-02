import { useState, useEffect, useCallback } from 'react'
import PipelineSourceCard from './PipelineSourceCard'

interface Props {
  pageId: string
}

// All Sources = the committed source library for this Info Page. Read-only,
// newest-committed first. This is the reference material Cowork will later use
// to build the page — not generated page content.
export default function AllSourcesTab({ pageId }: Props) {
  const [rows, setRows] = useState<InfoPageSourceRow[]>([])
  const [loading, setLoading] = useState(true)

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

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-700 dark:text-white/70">Committed source library</p>
        <span className="text-[11px] text-gray-400 dark:text-white/30">{rows.length} source{rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">No committed sources yet</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Commit sources from Pre-Commit Review to build this library</p>
          </div>
        )}
        {rows.map(row => (
          <PipelineSourceCard key={row.article_id} row={row} showDesignNotes />
        ))}
      </div>
    </div>
  )
}
