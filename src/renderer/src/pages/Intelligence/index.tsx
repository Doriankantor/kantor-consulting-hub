import { useState, useEffect, useCallback } from 'react'
import NewsTab from './NewsTab'
import SocialTab from './SocialTab'
import DocumentsTab from './DocumentsTab'
import PublishQueue from './PublishQueue'

const TABS = [
  { id: 'news',      label: 'News Articles' },
  { id: 'social',    label: 'Social Media' },
  { id: 'documents', label: 'Documents' },
  { id: 'queue',     label: 'Publish Queue' },
]

export default function Intelligence() {
  const [activeTab, setActiveTab] = useState<'news' | 'social' | 'documents' | 'queue'>('news')
  const [queueCount, setQueueCount] = useState(0)
  const [stats, setStats] = useState<{ pending: number; sentToPages: number }>({ pending: 0, sentToPages: 0 })
  const [toast, setToast] = useState<string | null>(null)

  const refreshStats = useCallback(async () => {
    try {
      const s = await window.api.intelligence.getPipelineStats()
      setStats(s)
    } catch {}
  }, [])

  const refreshQueueCount = useCallback(async (addedToPages?: string[]) => {
    try {
      const items = await window.api.intelligence.getQueue()
      setQueueCount(items.length)
    } catch {}
    refreshStats()
    // Pipeline toast: surface which Info Pages the source flowed into.
    if (addedToPages && addedToPages.length) {
      const [first, ...rest] = addedToPages
      setToast(rest.length ? `Source added to ${first} +${rest.length} more` : `Source added to ${first}`)
      setTimeout(() => setToast(null), 3200)
    }
  }, [refreshStats])

  useEffect(() => {
    refreshQueueCount()
    const interval = setInterval(refreshStats, 20000)
    return () => clearInterval(interval)
  }, [refreshQueueCount, refreshStats])

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Pipeline toast */}
      {toast && (
        <div className="absolute top-4 right-6 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium shadow-2xl animate-[fadeIn_0.2s_ease-out]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-green-400 dark:text-green-600">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4.5 7l1.5 1.5L9.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {toast}
        </div>
      )}
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-0 border-b border-gray-200 dark:border-white/[0.08]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Source Intelligence</h1>
            <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5">
              Monitor, vet, and publish drone intelligence to Contested Skies
            </p>
          </div>
          {/* Pipeline counters */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-center">
              <p className="text-base font-bold text-amber-700 dark:text-amber-400 leading-none">{stats.pending}</p>
              <p className="text-[9px] text-amber-600/70 dark:text-amber-400/60 uppercase tracking-wider mt-0.5">pending review</p>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-center">
              <p className="text-base font-bold text-green-700 dark:text-green-400 leading-none">{stats.sentToPages}</p>
              <p className="text-[9px] text-green-600/70 dark:text-green-400/60 uppercase tracking-wider mt-0.5">sent to info pages</p>
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
                  : 'border-transparent text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/70'
              }`}
            >
              {tab.label}
              {tab.id === 'queue' && queueCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-bold">
                  {queueCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'news'      && <NewsTab onApprove={refreshQueueCount} />}
        {activeTab === 'social'    && <SocialTab onApprove={refreshQueueCount} />}
        {activeTab === 'documents' && <DocumentsTab onApprove={refreshQueueCount} />}
        {activeTab === 'queue'     && <PublishQueue onPushed={refreshQueueCount} />}
      </div>
    </div>
  )
}
