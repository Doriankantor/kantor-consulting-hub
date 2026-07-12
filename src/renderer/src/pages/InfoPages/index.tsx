import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import InfoPagesList from './InfoPagesList'
import InfoPageStatus from './InfoPageStatus'
import SourcesTab from './tabs/SourcesTab'
import ManualInfoTab from './tabs/ManualInfoTab'
import ClaudeAnalysisTab from './tabs/ClaudeAnalysisTab'
import DesignNotesTab from './tabs/DesignNotesTab'
import CommitReviewTab from './tabs/CommitReviewTab'
import RecentlyPublishedTab from './tabs/RecentlyPublishedTab'
import NewSourcesTab from './tabs/NewSourcesTab'
import PreCommitReviewTab from './tabs/PreCommitReviewTab'
import AllSourcesTab from './tabs/AllSourcesTab'
import RecentChangesTab from './tabs/RecentChangesTab'

// Source-commit pipeline tabs — shown only on pipeline-enabled Info Pages
// (currently the LATAM drone monitor). These implement the two-stage commit
// lifecycle: New Sources → Pre-Commit Review → All Sources, plus a log.
const PIPELINE_TABS = [
  { id: 'new-sources',    label: 'New Sources' },
  { id: 'pre-commit',     label: 'Pre-Commit Review' },
  { id: 'all-sources',    label: 'All Sources' },
  { id: 'recent-changes', label: 'Recent Changes' },
]

// Existing editorial tabs — present on every Info Page.
const BASE_TABS = [
  { id: 'sources',  label: 'Sources' },
  { id: 'manual',   label: 'Manual Info' },
  { id: 'analysis', label: 'Claude Analysis' },
  { id: 'design',   label: 'Pre-publish Design Notes' },
  { id: 'review',   label: 'Commit for Review' },
  { id: 'published',label: 'Recently Published' },
]

function parseConfig(raw: string | null | undefined): InfoPageConfig {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

export default function InfoPages() {
  const { isRoot, localUser } = useAuth()
  const { boards, refreshBoards } = useWorkspace()
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('sources')
  const [isOwner, setIsOwner] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [pipelineCounts, setPipelineCounts] = useState<{ new: number; review: number; committed: number }>({ new: 0, review: 0, committed: 0 })

  // B0.5: source the Info Pages list from the CLOUD board list (already loaded for
  // the sidebar via useWorkspace) filtered to info-page boards, so ALL projects show
  // here — not just the ones that also exist in local SQLite (the old infoPages:list).
  // Per-page content reads stay local + unchanged; the selected page's board_config
  // comes from this (cloud) board object, which is the correct source.
  const pages = useMemo(
    () => (boards as unknown as InfoPage[])
      .filter(b => b.board_type === 'info-page')
      .sort((a, b) => a.position - b.position),
    [boards],
  )

  const selectedPage = pages.find(p => p.id === selectedPageId) || null
  const isPipeline = !!parseConfig(selectedPage?.board_config).pipeline
  const tabs = isPipeline ? [...PIPELINE_TABS, ...BASE_TABS] : BASE_TABS

  // Auto-select the first page once the list is available (unchanged behavior).
  useEffect(() => {
    if (pages.length && !selectedPageId) setSelectedPageId(pages[0].id)
  }, [pages, selectedPageId])

  // Reset to the first relevant tab whenever the selected page changes, so a
  // pipeline page opens on New Sources and a standard page on Sources.
  useEffect(() => {
    if (!selectedPageId) return
    const page = pages.find(p => p.id === selectedPageId)
    setActiveTab(parseConfig(page?.board_config).pipeline ? 'new-sources' : 'sources')
  }, [selectedPageId])

  const refreshPipelineCounts = useCallback(async () => {
    if (!selectedPageId) return
    try { setPipelineCounts(await window.api.infoPages.getSourcePipelineCounts(selectedPageId)) }
    catch { setPipelineCounts({ new: 0, review: 0, committed: 0 }) }
  }, [selectedPageId])

  useEffect(() => {
    if (!selectedPageId || !localUser) return
    window.api.infoPages.isOwner(selectedPageId, localUser.id).then(setIsOwner).catch(() => setIsOwner(false))
    window.api.infoPages.getCommits(selectedPageId).then(commits => {
      setPendingCount(commits.filter(c => c.status === 'pending_owner' || c.status === 'approved').length)
    }).catch(() => setPendingCount(0))
  }, [selectedPageId, localUser])

  useEffect(() => { refreshPipelineCounts() }, [refreshPipelineCounts])

  const canApprove = isRoot || isOwner
  const canGeneratePrompt = isRoot

  function tabBadge(id: string): number {
    if (id === 'review') return pendingCount
    if (id === 'new-sources') return pipelineCounts.new
    if (id === 'pre-commit') return pipelineCounts.review
    return 0
  }
  function badgeColor(id: string): string {
    if (id === 'pre-commit') return 'bg-indigo-500'
    if (id === 'new-sources') return 'bg-gray-400 dark:bg-white/30'
    return 'bg-purple-500'
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <InfoPagesList
        pages={pages}
        selectedPageId={selectedPageId}
        onSelect={setSelectedPageId}
        onRefresh={refreshBoards}
        isAdmin={isRoot}
      />

      {/* Main area */}
      {selectedPage ? (
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 dark:border-white/[0.08]">
          <div className="shrink-0 px-5 pt-4 pb-0 border-b border-gray-200 dark:border-white/[0.08]">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">{selectedPage.name}</h2>
            <div className="flex gap-0.5 overflow-x-auto">
              {tabs.map(tab => {
                const badge = tabBadge(tab.id)
                return (
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
                    {badge > 0 && (
                      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-white text-[9px] font-bold ${badgeColor(tab.id)}`}>{badge}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {/* Source-commit pipeline tabs (pipeline pages only) */}
            {activeTab === 'new-sources'    && <NewSourcesTab pageId={selectedPage.id} onMoved={refreshPipelineCounts} />}
            {activeTab === 'pre-commit'     && <PreCommitReviewTab pageId={selectedPage.id} onMoved={refreshPipelineCounts} />}
            {activeTab === 'all-sources'    && <AllSourcesTab pageId={selectedPage.id} />}
            {activeTab === 'recent-changes' && <RecentChangesTab pageId={selectedPage.id} />}

            {/* Existing editorial tabs */}
            {activeTab === 'sources'   && <SourcesTab  pageId={selectedPage.id} page={selectedPage} localUser={localUser} />}
            {activeTab === 'manual'    && <ManualInfoTab pageId={selectedPage.id} page={selectedPage} localUser={localUser} />}
            {activeTab === 'analysis'  && <ClaudeAnalysisTab pageId={selectedPage.id} page={selectedPage} canApprove={canApprove} localUser={localUser} onNavigate={setActiveTab} />}
            {activeTab === 'design'    && <DesignNotesTab pageId={selectedPage.id} page={selectedPage} localUser={localUser} onNavigate={setActiveTab} />}
            {activeTab === 'review'    && <CommitReviewTab pageId={selectedPage.id} page={selectedPage} canApprove={canApprove} canGeneratePrompt={canGeneratePrompt} onCountChange={setPendingCount} localUser={localUser} isAdmin={isRoot} />}
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
