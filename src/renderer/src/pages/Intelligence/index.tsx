import { useState, useEffect, useCallback, useMemo } from 'react'
import NewsTab from './NewsTab'
import SocialTab from './SocialTab'
import DocumentsTab from './DocumentsTab'
import InterviewsTab from './InterviewsTab'
import ProjectSelect from './ProjectSelect'
import FrameworkPanel from './FrameworkPanel'
import { parseConfig } from './frameworkConfig'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useConnection } from '../../contexts/ConnectionContext'

// Phase 7: the Publish Queue / "Push to Contested Skies" tab has been removed.
// Approved articles now flow to the linked Info Page's New Sources, where they
// are committed and (later, with admin approval) pushed live from downstream.
const TABS = [
  { id: 'news',       label: 'News Articles' },
  { id: 'social',     label: 'Social Media' },
  { id: 'documents',  label: 'Documents' },
  { id: 'interviews', label: 'Interviews' },
]

export default function Intelligence() {
  const [activeTab, setActiveTab] = useState<'news' | 'social' | 'documents' | 'interviews'>('news')
  const [stats, setStats] = useState<{ pending: number; sentToPages: number }>({ pending: 0, sentToPages: 0 })
  // Slice 1: project scope selector + read-only framework panel. The 4 projects
  // are the cloud info-page boards (same source as InfoPages/index.tsx). Selecting
  // a project sets context + drives the framework panel ONLY — per decision A it
  // does NOT filter the source list (per-project filtering is Slice 3), so
  // selectedProjectId is intentionally never threaded into the tab reads.
  const { boards } = useWorkspace()
  const { online } = useConnection()
  const projects = useMemo(
    () => boards.filter(b => b.board_type === 'info-page').sort((a, b) => a.position - b.position),
    [boards],
  )
  // Persisted across navigation (the /intelligence route fully unmounts on nav, which
  // would otherwise reset this to 'all' and empty knownThematic → breaks T7 + tag coloring).
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    try { return localStorage.getItem('intel-selected-project') || 'all' } catch { return 'all' }
  })
  const selectedProject = selectedProjectId === 'all'
    ? null
    : projects.find(p => p.id === selectedProjectId) || null
  // 2b: the selected project's config (name + collection keywords) threaded into
  // DocumentsTab so its reconcile call is project-aware. null when "All sources".
  const selectedProjectConfig = selectedProject
    ? { id: selectedProject.id, name: selectedProject.name, keywords: parseConfig(selectedProject.board_config).keywords }
    : null

  // Persist the selection so it survives navigating away and back.
  useEffect(() => {
    try { localStorage.setItem('intel-selected-project', selectedProjectId) } catch {}
  }, [selectedProjectId])

  // Guard: if a persisted id points at a project that no longer exists, fall back to
  // 'all'. Race-safe — only resets ONCE projects have genuinely loaded (length > 0) and
  // the id isn't among them; never fires during the loading window (projects still empty),
  // so it can't clobber a valid restored selection on mount.
  useEffect(() => {
    if (selectedProjectId !== 'all' && projects.length > 0 && !projects.some(p => p.id === selectedProjectId)) {
      setSelectedProjectId('all')
    }
  }, [projects, selectedProjectId])
  const [toast, setToast] = useState<string | null>(null)
  // Re-score button state
  const [unscoredCount, setUnscoredCount] = useState(0)
  const [rescoring, setRescoring] = useState(false)
  const [rescoreResult, setRescoreResult] = useState<string | null>(null)

  // Header "PENDING REVIEW" is project-scoped to the dropdown. selectedProjectId in the
  // deps is what makes the stat refetch on project switch (the old [] deps were why it
  // used to stay on the previous project's number). 'all' → normalizeProject drops it
  // main-side, so the header shows the all-projects total.
  const refreshStats = useCallback(async () => {
    try {
      const s = await window.api.intelligence.getPipelineStats(selectedProjectId)
      setStats(s)
    } catch {}
  }, [selectedProjectId])

  const refreshUnscoredCount = useCallback(async () => {
    try {
      const n = await window.api.intelligence.getUnscoredCount()
      setUnscoredCount(n)
    } catch {}
  }, [])

  // Called after an approve/reject in the News/Social/Documents tabs.
  const handleApproved = useCallback(async (addedToPages?: string[]) => {
    refreshStats()
    refreshUnscoredCount()
    // Push-to-Info-Page feedback: surface which Info Page New Sources the source flowed into.
    if (addedToPages && addedToPages.length) {
      const [first, ...rest] = addedToPages
      setToast(rest.length ? `Pushed to ${first} +${rest.length} more` : `Pushed to ${first} → New Sources`)
      setTimeout(() => setToast(null), 3200)
    }
  }, [refreshStats, refreshUnscoredCount])

  useEffect(() => {
    handleApproved()
    const interval = setInterval(() => { refreshStats(); refreshUnscoredCount() }, 20000)
    return () => clearInterval(interval)
    // selectedProjectId listed explicitly: switching projects must refetch the header stat.
    // (It already cascades via refreshStats' identity, but the dep makes the intent clear.)
  }, [handleApproved, refreshStats, refreshUnscoredCount, selectedProjectId])

  async function handleRescore() {
    if (!online) return   // read-only offline
    setRescoring(true)
    setRescoreResult(null)
    try {
      const res = await window.api.intelligence.rescoreUnscored()
      if (!res.ok) {
        setRescoreResult(`Error: ${res.error ?? 'unknown'}`)
      } else {
        setRescoreResult(`Done — ${res.processed} scored, ${res.relevant} relevant (≥4), ${res.failed} failed, ${res.remaining} remaining`)
        setUnscoredCount(res.remaining)
        // Show as toast
        setToast(`Re-scored ${res.processed} articles (${res.relevant} relevant)`)
        setTimeout(() => setToast(null), 4000)
      }
    } catch (e) {
      setRescoreResult(`Failed: ${(e as Error)?.message}`)
    } finally {
      setRescoring(false)
    }
  }

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
              Monitor, vet, and route drone intelligence to the linked Info Page
            </p>
          </div>
          {/* Pipeline counters + re-score button */}
          <div className="flex items-center gap-2">
            {/* Re-score unscored button — only shown when unscored articles exist */}
            {unscoredCount > 0 && (
              <div className="flex flex-col items-end gap-0.5">
                <button
                  onClick={handleRescore}
                  disabled={rescoring || !online}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 text-xs font-medium transition disabled:opacity-50"
                  title={online ? 'Run the relevance gate over all articles that haven\'t been scored yet' : 'Unavailable while offline'}
                >
                  {rescoring ? (
                    <span className="w-3 h-3 border-2 border-violet-400/30 border-t-violet-500 rounded-full animate-spin" />
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M10 6A4 4 0 1 1 6 2M10 2v4H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {rescoring ? 'Scoring…' : `Re-score unscored (${unscoredCount})`}
                </button>
                {rescoreResult && (
                  <span className="text-[10px] text-gray-500 dark:text-white/40 max-w-[220px] text-right leading-tight">{rescoreResult}</span>
                )}
              </div>
            )}
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-center">
              <p className="text-base font-bold text-amber-700 dark:text-amber-400 leading-none">{stats.pending}</p>
              <p className="text-[9px] text-amber-600/70 dark:text-amber-400/60 uppercase tracking-wider mt-0.5">pending review</p>
            </div>
            {/* Phase 7: Push to Info Page affordance (replaces "Push to Contested Skies").
                Approving an article auto-pushes it to the linked Info Page's New Sources;
                this button explains/surfaces that routing. */}
            <button
              onClick={() => {
                setToast('Approve an article to push it to the Info Page → New Sources')
                setTimeout(() => setToast(null), 3200)
              }}
              title="Approving an article pushes it to the linked Info Page's New Sources, where it can be reviewed and committed."
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 transition text-center"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-indigo-600 dark:text-indigo-400 shrink-0">
                <path d="M7 9.5V2.5M7 2.5L4 5.5M7 2.5l3 3M2.5 10.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="leading-none">
                <span className="block text-base font-bold text-indigo-700 dark:text-indigo-400">{stats.sentToPages}</span>
                <span className="block text-[9px] text-indigo-600/70 dark:text-indigo-400/60 uppercase tracking-wider mt-0.5">push to info page</span>
              </span>
            </button>
          </div>
        </div>
        {/* Slice 1: project scope selector + read-only data-gathering framework panel.
            Additive context only — does NOT filter the source list below (Slice 3). */}
        <div className="mb-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-white/50 shrink-0">Project</span>
            <ProjectSelect
              projects={projects}
              selectedProjectId={selectedProjectId}
              onChange={setSelectedProjectId}
            />
          </div>
          {selectedProject ? (
            <FrameworkPanel board={selectedProject} />
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-white/35">
              Showing all sources across projects. Select a project to view its data-gathering framework.
            </p>
          )}
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
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'news'      && <NewsTab onApprove={handleApproved} selectedProjectId={selectedProjectId} />}
        {/* SocialTab stays MOUNTED (hidden, not unmounted) so its in-progress add-form +
            description survive a tab switch. News/Documents/Interviews keep conditional
            mount, so their on-mount loads are unchanged. */}
        <div className={activeTab === 'social' ? 'h-full' : 'hidden'}>
          <SocialTab onApprove={handleApproved} project={selectedProjectConfig} />
        </div>
        {activeTab === 'documents' && <DocumentsTab onApprove={handleApproved} project={selectedProjectConfig} />}
        {activeTab === 'interviews' && <InterviewsTab onApprove={handleApproved} project={selectedProjectConfig} />}
      </div>
    </div>
  )
}
