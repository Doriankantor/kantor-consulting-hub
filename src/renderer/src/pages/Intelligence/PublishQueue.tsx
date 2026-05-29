import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'

const QUEUE_SECTIONS = [
  { id: 'incident-feed',          label: 'Incident Feed' },
  { id: 'source-archive',         label: 'Source Archive' },
  { id: 'investment-procurement', label: 'Investment & Procurement' },
  { id: 'finance-nexus',          label: 'Finance Nexus' },
  { id: 'platforms',              label: 'Platforms' },
]

const SECTION_COLORS: Record<string, string> = {
  'incident-feed':          'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  'source-archive':         'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300',
  'investment-procurement': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  'finance-nexus':          'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  'platforms':              'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
}

const CONFIDENCE_COLORS = {
  high:   { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  low:    { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-400' },
}

const TYPE_COLORS: Record<string, string> = {
  article:  'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
  social:   'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
  document: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
}

interface Props { onPushed: () => void }

export default function PublishQueue({ onPushed }: Props) {
  const { localUser, isAdmin } = useAuth()
  const [queue, setQueue] = useState<IntelligenceSource[]>([])
  const [pushLog, setPushLog] = useState<IntelligencePushLog[]>([])
  const [loading, setLoading] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ ok: boolean; count?: number; sections?: string[]; error?: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [items, log] = await Promise.all([
        window.api.intelligence.getQueue(),
        window.api.intelligence.getPushLog(),
      ])
      setQueue(items)
      setPushLog(log)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handlePush() {
    if (!localUser) return
    if (!confirm(`Push ${queue.length} approved item${queue.length !== 1 ? 's' : ''} to Contested Skies Monitor? This will update the live site.`)) return
    setPushing(true)
    setPushResult(null)
    try {
      const result = await window.api.intelligence.pushToContestedSkies({
        pushedById: localUser.id,
        pushedByName: localUser.name,
      })
      setPushResult(result)
      if (result.ok) {
        await load()
        onPushed()
      }
    } finally {
      setPushing(false)
    }
  }

  async function handleRemove(id: string) {
    await window.api.intelligence.removeFromQueue(id)
    setQueue(prev => prev.filter(i => i.id !== id))
  }

  async function handleSectionChange(id: string, section: string) {
    await window.api.intelligence.updateQueueSection(id, section)
    setQueue(prev => prev.map(i => i.id === id ? { ...i, queue_section: section } : i))
  }

  function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return dateStr }
  }

  // Group by section
  const bySection: Record<string, IntelligenceSource[]> = {}
  for (const item of queue) {
    const sec = item.queue_section || 'source-archive'
    if (!bySection[sec]) bySection[sec] = []
    bySection[sec].push(item)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Push header */}
      <div className="shrink-0 px-6 py-4 border-b border-gray-100 dark:border-white/[0.06]">
        {/* Push result message */}
        {pushResult && (
          <div className={`mb-3 p-3 rounded-xl border text-sm flex items-start gap-2 ${
            pushResult.ok
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/40 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/40 text-red-800 dark:text-red-300'
          }`}>
            {pushResult.ok ? (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <p className="font-medium">
                    {pushResult.count} item{pushResult.count !== 1 ? 's' : ''} pushed successfully!
                  </p>
                  {pushResult.sections && pushResult.sections.length > 0 && (
                    <p className="text-xs mt-0.5 opacity-80">Sections updated: {pushResult.sections.join(', ')}</p>
                  )}
                  <p className="text-xs mt-1 opacity-70">Changes will be live on Contested Skies Monitor in ~2 minutes.</p>
                  <a
                    href="https://doriankantor.github.io/contested-skies-monitor"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium mt-1 underline underline-offset-2"
                  >
                    View live site
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 7.5l5-5M4 2.5h3.5V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </a>
                </div>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <div>
                  <p className="font-medium">Push failed</p>
                  <p className="text-xs mt-0.5 opacity-80">{pushResult.error}</p>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Publish Queue
              <span className="ml-2 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[11px] font-bold">
                {queue.length} items
              </span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
              Approved items ready to push to Contested Skies Monitor
            </p>
          </div>
          <div className="ml-auto">
            {isAdmin ? (
              <button
                onClick={handlePush}
                disabled={pushing || queue.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {pushing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Pushing...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1v8M4.5 3.5L7 1l2.5 2.5M1 11v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Push to Contested Skies
                  </>
                )}
              </button>
            ) : (
              <p className="text-xs text-gray-400 dark:text-white/30 italic">Admin access required to push</p>
            )}
          </div>
        </div>
      </div>

      {/* Queue content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && queue.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-400 dark:text-white/30">
                <path d="M3 5h14M7 10h10M7 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">Queue is empty</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Approve items in the News, Social, or Documents tabs to add them here</p>
          </div>
        )}

        {!loading && queue.length > 0 && (
          <div className="space-y-4">
            {QUEUE_SECTIONS.filter(s => bySection[s.id]?.length > 0).map(section => (
              <div key={section.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${SECTION_COLORS[section.id] || 'bg-gray-100 text-gray-600'}`}>
                    {section.label}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-white/30">{bySection[section.id].length} item{bySection[section.id].length !== 1 ? 's' : ''}</span>
                </div>

                <div className="space-y-2">
                  {bySection[section.id].map(item => {
                    const conf = item.confidence || 'low'
                    const confStyle = CONFIDENCE_COLORS[conf as keyof typeof CONFIDENCE_COLORS] || CONFIDENCE_COLORS.low

                    return (
                      <div key={item.id} className="bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${TYPE_COLORS[item.type] || ''}`}>
                              {item.type}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${confStyle.bg} ${confStyle.text}`}>
                              {conf}
                            </span>
                            {item.reviewed_by_name && (
                              <span className="text-[11px] text-gray-400 dark:text-white/30">Approved by {item.reviewed_by_name}</span>
                            )}
                            {item.reviewed_at && (
                              <span className="text-[11px] text-gray-400 dark:text-white/30">{formatDate(item.reviewed_at)}</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">
                            {item.title || item.file_name || item.content?.slice(0, 80) || 'Untitled'}
                          </p>
                          {item.source_name && (
                            <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">{item.source_name}</p>
                          )}
                        </div>

                        {/* Section selector */}
                        <select
                          value={item.queue_section || 'source-archive'}
                          onChange={e => handleSectionChange(item.id, e.target.value)}
                          className="px-2 py-1 rounded text-[11px] border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-gray-600 dark:text-white/70 focus:outline-none shrink-0"
                        >
                          {QUEUE_SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>

                        {/* Remove */}
                        <button
                          onClick={() => handleRemove(item.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
                          title="Remove from queue"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Items without a matched section */}
            {(() => {
              const knownSections = QUEUE_SECTIONS.map(s => s.id)
              const uncategorized = queue.filter(i => !knownSections.includes(i.queue_section || 'source-archive'))
              if (uncategorized.length === 0) return null
              return (
                <div>
                  <p className="text-xs font-semibold text-gray-400 dark:text-white/30 mb-2">Other</p>
                  <div className="space-y-2">
                    {uncategorized.map(item => (
                      <div key={item.id} className="bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-3 flex items-center gap-3">
                        <p className="flex-1 text-sm text-gray-700 dark:text-white/80 truncate">{item.title || item.file_name || 'Untitled'}</p>
                        <button onClick={() => handleRemove(item.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 transition">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Push log */}
        {!loading && pushLog.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide mb-3">Push History</h3>
            <div className="space-y-2">
              {pushLog.map(entry => {
                const secs: string[] = (() => { try { return JSON.parse(entry.sections_json || '[]') } catch { return [] } })()
                return (
                  <div key={entry.id} className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs ${
                    entry.success
                      ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-800/30 text-green-700 dark:text-green-400'
                      : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800/30 text-red-700 dark:text-red-400'
                  }`}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      {entry.success
                        ? <><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></>
                        : <><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 4v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></>
                      }
                    </svg>
                    <span className="font-medium">{entry.items_count} item{entry.items_count !== 1 ? 's' : ''}</span>
                    {secs.length > 0 && <span className="opacity-70">{secs.join(', ')}</span>}
                    <span className="opacity-60 ml-auto">{entry.pushed_by_name || entry.pushed_by_id}</span>
                    <span className="opacity-50">{formatDate(entry.pushed_at)}</span>
                    {entry.error_message && <span className="opacity-70">{entry.error_message}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
