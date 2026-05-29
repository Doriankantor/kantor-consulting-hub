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

  const refreshQueueCount = useCallback(async () => {
    try {
      const items = await window.api.intelligence.getQueue()
      setQueueCount(items.length)
    } catch {}
  }, [])

  useEffect(() => {
    refreshQueueCount()
  }, [refreshQueueCount])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-0 border-b border-gray-200 dark:border-white/[0.08]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Source Intelligence</h1>
            <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5">
              Monitor, vet, and publish drone intelligence to Contested Skies
            </p>
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
