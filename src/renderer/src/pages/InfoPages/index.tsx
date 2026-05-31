import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import InfoPagesList from './InfoPagesList'
import InfoPageStatus from './InfoPageStatus'
import SourcesTab from './tabs/SourcesTab'
import ManualInfoTab from './tabs/ManualInfoTab'
import ClaudeAnalysisTab from './tabs/ClaudeAnalysisTab'
import DesignNotesTab from './tabs/DesignNotesTab'
import CommitReviewTab from './tabs/CommitReviewTab'
import RecentlyPublishedTab from './tabs/RecentlyPublishedTab'

const TABS = [
  { id: 'sources',  label: 'Sources' },
  { id: 'manual',   label: 'Manual Info' },
  { id: 'analysis', label: 'Claude Analysis' },
  { id: 'design',   label: 'Pre-publish Design Notes' },
  { id: 'review',   label: 'Commit for Review' },
  { id: 'published',label: 'Recently Published' },
]

export default function InfoPages() {
  const { isAdmin, localUser } = useAuth()
  const [pages, setPages] = useState<InfoPage[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('sources')
  const [isOwner, setIsOwner] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const selectedPage = pages.find(p => p.id === selectedPageId) || null

  const loadPages = useCallback(async () => {
    try {
      const list = await window.api.infoPages.list()
      setPages(list)
      if (list.length && !selectedPageId) setSelectedPageId(list[0].id)
    } catch {}
  }, [selectedPageId])

  useEffect(() => { loadPages() }, [])

  useEffect(() => {
    if (!selectedPageId || !localUser) return
    window.api.infoPages.isOwner(selectedPageId, localUser.id).then(setIsOwner).catch(() => setIsOwner(false))
    window.api.infoPages.getCommits(selectedPageId).then(commits => {
      setPendingCount(commits.filter(c => c.status === 'pending_owner' || c.status === 'approved').length)
    }).catch(() => setPendingCount(0))
  }, [selectedPageId, localUser])

  const canApprove = isAdmin || isOwner
  const canGeneratePrompt = isAdmin

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <InfoPagesList
        pages={pages}
        selectedPageId={selectedPageId}
        onSelect={setSelectedPageId}
        onRefresh={loadPages}
        isAdmin={isAdmin}
      />

      {/* Main area */}
      {selectedPage ? (
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 dark:border-white/[0.08]">
          <div className="shrink-0 px-5 pt-4 pb-0 border-b border-gray-200 dark:border-white/[0.08]">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">{selectedPage.name}</h2>
            <div className="flex gap-0.5 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
                      : 'border-transparent text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/70'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'review' && pendingCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-purple-500 text-white text-[9px] font-bold">{pendingCount}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'sources'   && <SourcesTab  pageId={selectedPage.id} page={selectedPage} localUser={localUser} />}
            {activeTab === 'manual'    && <ManualInfoTab pageId={selectedPage.id} page={selectedPage} localUser={localUser} />}
            {activeTab === 'analysis'  && <ClaudeAnalysisTab pageId={selectedPage.id} page={selectedPage} canApprove={canApprove} localUser={localUser} onNavigate={setActiveTab} />}
            {activeTab === 'design'    && <DesignNotesTab pageId={selectedPage.id} page={selectedPage} localUser={localUser} onNavigate={setActiveTab} />}
            {activeTab === 'review'    && <CommitReviewTab pageId={selectedPage.id} page={selectedPage} canApprove={canApprove} canGeneratePrompt={canGeneratePrompt} onCountChange={setPendingCount} localUser={localUser} isAdmin={isAdmin} />}
            {activeTab === 'published' && <RecentlyPublishedTab pageId={selectedPage.id} />}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 dark:text-white/30 text-sm">Select a page from the left to get started</p>
        </div>
      )}

      {/* Right panel */}
      {selectedPage && (
        <InfoPageStatus page={selectedPage} pendingCount={pendingCount} />
      )}
    </div>
  )
}
