import { useState, useEffect } from 'react'

interface Props {
  pageId: string
}

export default function RecentlyPublishedTab({ pageId }: Props) {
  const [published, setPublished] = useState<InfoPagePublished[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const list = await window.api.infoPages.getPublished(pageId)
        setPublished(list)
      } catch {} finally {
        setLoading(false)
      }
    }
    load()
  }, [pageId])

  // Group by date
  const grouped: Record<string, InfoPagePublished[]> = {}
  for (const entry of published) {
    const date = new Date(entry.date_implemented).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    if (!grouped[date]) grouped[date] = []
    grouped[date].push(entry)
  }

  const totalChanges = published.reduce((sum, e) => sum + e.commit_count, 0)

  return (
    <div className="h-full overflow-y-auto p-4">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && published.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400 dark:text-white/30">No published updates yet.</p>
          <p className="text-xs text-gray-400 dark:text-white/20 mt-1">Updates will appear here after they are committed, approved, and implemented.</p>
        </div>
      )}

      {!loading && published.length > 0 && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-xl px-4 py-2 border border-indigo-100 dark:border-indigo-500/20">
              <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium uppercase tracking-wider">Total Updates</p>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-300">{published.length}</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl px-4 py-2 border border-emerald-100 dark:border-emerald-500/20">
              <p className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium uppercase tracking-wider">Total Changes</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-300">{totalChanges}</p>
            </div>
          </div>

          <div className="space-y-5">
            {Object.entries(grouped).map(([date, entries]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-white/70">{date}</h4>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-white/[0.06]" />
                  <span className="text-[10px] text-gray-400 dark:text-white/30">{entries.length} update{entries.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-2 pl-4">
                  {entries.map(entry => (
                    <div key={entry.id} className="p-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-white/85">{entry.what_changed}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {entry.commit_count > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium">
                                {entry.commit_count} item{entry.commit_count !== 1 ? 's' : ''}
                              </span>
                            )}
                            {entry.committed_by_name && (
                              <span className="text-[10px] text-gray-400 dark:text-white/30">
                                by {entry.committed_by_name}
                              </span>
                            )}
                            {entry.approved_by_name && entry.approved_by_name !== entry.committed_by_name && (
                              <span className="text-[10px] text-gray-400 dark:text-white/30">
                                · approved by {entry.approved_by_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-white/25 shrink-0">
                          {new Date(entry.date_implemented).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
