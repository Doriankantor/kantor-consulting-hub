import { useState, useEffect } from 'react'

interface Props {
  page: InfoPage
  pendingCount: number
}

function freshnessLabel(dateStr: string | null): { label: string; color: string; dotColor: string } {
  if (!dateStr) return { label: 'Unknown', color: 'text-gray-400 dark:text-white/30', dotColor: 'bg-gray-400' }
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000
  if (days < 7)  return { label: `Updated ${Math.round(days)}d ago`, color: 'text-green-600 dark:text-green-400', dotColor: 'bg-green-500' }
  if (days < 30) return { label: `Updated ${Math.round(days)}d ago`, color: 'text-amber-600 dark:text-amber-400', dotColor: 'bg-amber-400' }
  return { label: `Updated ${Math.round(days)}d ago`, color: 'text-red-600 dark:text-red-400', dotColor: 'bg-red-500' }
}

export default function InfoPageStatus({ page, pendingCount }: Props) {
  const [lastCommit, setLastCommit] = useState<{ date: string; message: string } | null>(null)
  const [lastPublished, setLastPublished] = useState<InfoPagePublished | null>(null)

  const config: InfoPageConfig = page.board_config ? (() => { try { return JSON.parse(page.board_config!) } catch { return {} } })() : {}

  useEffect(() => {
    if (config.repo) {
      window.api.infoPages.getLastCommit(config.repo).then(setLastCommit).catch(() => setLastCommit(null))
    }
    window.api.infoPages.getPublished(page.id).then(list => {
      setLastPublished(list[0] ?? null)
    }).catch(() => setLastPublished(null))
  }, [page.id, config.repo])

  const freshness = freshnessLabel(lastCommit?.date ?? null)

  return (
    <div className="w-48 shrink-0 bg-gray-50 dark:bg-white/[0.02] flex flex-col p-3 gap-3 overflow-y-auto">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">Page Status</h4>

      {/* Freshness */}
      <div className="bg-white dark:bg-white/[0.04] rounded-xl p-3 border border-gray-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`w-2 h-2 rounded-full ${freshness.dotColor}`} />
          <span className="text-xs font-medium text-gray-700 dark:text-white/75">Freshness</span>
        </div>
        <p className={`text-[11px] ${freshness.color}`}>{freshness.label}</p>
        {lastCommit && (
          <p className="text-[10px] text-gray-400 dark:text-white/25 mt-1 truncate" title={lastCommit.message}>
            {lastCommit.message.slice(0, 50)}
          </p>
        )}
      </div>

      {/* Last published */}
      <div className="bg-white dark:bg-white/[0.04] rounded-xl p-3 border border-gray-100 dark:border-white/[0.06]">
        <p className="text-xs font-medium text-gray-700 dark:text-white/75 mb-1">Last Published</p>
        {lastPublished ? (
          <>
            <p className="text-[11px] text-gray-500 dark:text-white/50">
              {new Date(lastPublished.date_implemented).toLocaleDateString()}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-white/25 mt-0.5 line-clamp-2">
              {lastPublished.what_changed}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-gray-400 dark:text-white/30">No publishes yet</p>
        )}
      </div>

      {/* Pending items */}
      {pendingCount > 0 && (
        <div className="bg-purple-50 dark:bg-purple-500/10 rounded-xl p-3 border border-purple-100 dark:border-purple-500/20">
          <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Pending Review</p>
          <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{pendingCount}</p>
          <p className="text-[10px] text-purple-500 dark:text-purple-400/70">item{pendingCount !== 1 ? 's' : ''} awaiting</p>
        </div>
      )}

      {/* View live */}
      {config.live_url && (
        <button
          onClick={() => window.open(`https://${config.live_url}`, '_blank')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M4 2H2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V6M6 1h3m0 0v3m0-3L4.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          View live page
        </button>
      )}

      {/* Daily reminder */}
      <div className="text-[10px] text-gray-400 dark:text-white/25 leading-relaxed">
        Review intelligence daily and commit relevant updates to keep this page fresh.
      </div>
    </div>
  )
}
