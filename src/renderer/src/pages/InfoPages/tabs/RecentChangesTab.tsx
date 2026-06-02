import { useState, useEffect, useCallback } from 'react'

interface Props {
  pageId: string
}

const STAGE_LABEL: Record<string, string> = {
  new: 'New Sources',
  review: 'Pre-Commit Review',
  committed: 'All Sources',
}

const TO_STAGE_STYLE: Record<string, string> = {
  new:       'bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/60',
  review:    'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  committed: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
}

function describe(from: string | null, to: string): string {
  if (!from) return `Added to ${STAGE_LABEL[to] || to}`
  return `${STAGE_LABEL[from] || from} → ${STAGE_LABEL[to] || to}`
}

// Recent Changes = reverse-chronological audit log of every stage transition
// for this Info Page's source pipeline. Read-only.
export default function RecentChangesTab({ pageId }: Props) {
  const [rows, setRows] = useState<InfoPageChangeRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await window.api.infoPages.getSourceChanges(pageId)
      setRows(all)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [pageId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-5 py-3 border-b border-gray-100 dark:border-white/[0.06]">
        <p className="text-xs font-semibold text-gray-700 dark:text-white/70">Recent changes</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">No changes yet</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Source movements between stages are logged here</p>
          </div>
        )}
        {rows.map(row => (
          <div key={row.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]">
            <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${TO_STAGE_STYLE[row.to_stage] || 'bg-gray-100 text-gray-600'}`}>
              {describe(row.from_stage, row.to_stage)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 dark:text-white/85 line-clamp-1">{row.title || row.article_id}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {row.source_name && <span className="text-[11px] text-gray-400 dark:text-white/30">{row.source_name}</span>}
                <span className="text-[11px] text-gray-400 dark:text-white/25">{new Date(row.created_at).toLocaleString()}</span>
              </div>
              {row.note && <p className="text-[11px] text-gray-500 dark:text-white/40 mt-1 line-clamp-2 italic">{row.note}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
