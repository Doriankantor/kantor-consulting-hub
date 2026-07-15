import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'

interface Props {
  pages: InfoPage[]
  selectedPageId: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
  isAdmin: boolean
}

function freshnessColor(dateStr: string | null): string {
  if (!dateStr) return 'bg-gray-400'
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000
  if (days < 7)  return 'bg-green-500'
  if (days < 30) return 'bg-amber-400'
  return 'bg-red-500'
}

// Shared form for creating or editing an Info Page's link config.
function PageFormModal({
  title, submitLabel, initial, onClose, onSubmit,
}: {
  title: string
  submitLabel: string
  initial: { name: string; repo: string; liveUrl: string; file: string }
  onClose: () => void
  onSubmit: (name: string, config: Record<string,unknown>) => Promise<void>
}) {
  const [name, setName] = useState(initial.name)
  const [repo, setRepo] = useState(initial.repo)
  const [liveUrl, setLiveUrl] = useState(initial.liveUrl)
  const [file, setFile] = useState(initial.file)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      // Hosting fields only. Keywords are admin-managed via Claude Code (locked
      // design), so they are NOT edited here; on edit they're preserved by the
      // merge in handleEdit.
      await onSubmit(name.trim(), {
        repo: repo.trim(),
        live_url: liveUrl.trim(),
        file: file.trim(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-white/[0.12]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white/75 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Page name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. LATAM Drone Threat"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">GitHub repo (owner/repo)</label>
            <input value={repo} onChange={e => setRepo(e.target.value)} placeholder="e.g. Doriankantor/my-site"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
            <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">Used for commit-freshness, live page state, and one-click publishing. Needs GH_TOKEN write access.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Live URL</label>
            <input value={liveUrl} onChange={e => setLiveUrl(e.target.value)} placeholder="e.g. mysite.com"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">HTML file in repo</label>
            <input value={file} onChange={e => setFile(e.target.value)} placeholder="index.html"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
            <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">File that gets updated on publish. Defaults to index.html.</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl text-sm border border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-white/65 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition">Cancel</button>
          <button onClick={handleSubmit} disabled={!name.trim() || saving}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50">
            {saving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function InfoPagesList({ pages, selectedPageId, onSelect, onRefresh, isAdmin }: Props) {
  const [addModal, setAddModal] = useState(false)
  const [editPage, setEditPage] = useState<InfoPage | null>(null)
  const [lastCommits, setLastCommits] = useState<Record<string, { date: string; message: string } | null>>({})
  const [sourceStats, setSourceStats] = useState<Record<string, { newAvailable: number; inAnalysis: number }>>({})
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const { createBoard, renameBoard, updateBoardConfig, deleteBoard } = useWorkspace()

  useEffect(() => {
    async function loadCommits() {
      const results: Record<string, { date: string; message: string } | null> = {}
      for (const page of pages) {
        const config: InfoPageConfig = page.board_config ? JSON.parse(page.board_config) : {}
        if (config.repo) {
          try {
            results[page.id] = await window.api.infoPages.getLastCommit(config.repo)
          } catch {
            results[page.id] = null
          }
        } else {
          results[page.id] = null
        }
      }
      setLastCommits(results)
    }
    if (pages.length) loadCommits()
  }, [pages])

  // Per-page pipeline counters, polled every 20s. (No longer runs the keyword
  // fan-out — getSourceStats reads info_page_sources directly now; syncSources
  // was the retired 3c fan-out that only inflated the legacy info_page_items.)
  useEffect(() => {
    if (!pages.length) return
    let cancelled = false
    async function loadStats() {
      const results: Record<string, { newAvailable: number; inAnalysis: number }> = {}
      for (const page of pages) {
        try {
          results[page.id] = await window.api.infoPages.getSourceStats(page.id)
        } catch {
          results[page.id] = { newAvailable: 0, inAnalysis: 0 }
        }
      }
      if (!cancelled) setSourceStats(results)
    }
    loadStats()
    const interval = setInterval(loadStats, 20000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [pages])

  // B0.6: create/edit/delete are now CLOUD-authoritative (reuse the context board
  // mutations, which each refetch the cloud board list). onRefresh() is redundant
  // with that auto-refresh but kept as a belt-and-suspenders trigger for the list.
  async function handleAdd(name: string, config: Record<string,unknown>) {
    await createBoard(name, 'info-page', JSON.stringify(config))
    onRefresh()
  }

  async function handleEdit(pageId: string, name: string, config: Record<string,unknown>) {
    // Merge hosting fields over the EXISTING board_config so keywords (and pipeline,
    // etc.) are preserved — editing hosting settings must not wipe the keyword list.
    const page = pages.find(p => p.id === pageId)
    let existing: Record<string, unknown> = {}
    try { existing = page?.board_config ? JSON.parse(page.board_config) : {} } catch { existing = {} }
    const merged = { ...existing, ...config }
    await renameBoard(pageId, name)
    await updateBoardConfig(pageId, JSON.stringify(merged))
    onRefresh()
  }

  async function handleDelete(pageId: string) {
    // Soft-delete (moves the board to Trash, recoverable). Local info_page_* content
    // is intentionally left intact so an undelete restores the page with its data.
    if (!confirm('Move this info page to Trash? You can restore it from Trash later.')) return
    await deleteBoard(pageId)
    setMenuOpen(null)
    onRefresh()
  }

  return (
    <div className="w-52 shrink-0 border-r border-gray-200 dark:border-white/[0.08] flex flex-col">
      <div className="px-3 py-3 border-b border-gray-200 dark:border-white/[0.08]">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider">Info Pages</h3>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {pages.map(page => {
          const config: InfoPageConfig = page.board_config ? (() => { try { return JSON.parse(page.board_config!) } catch { return {} } })() : {}
          const lastCommit = lastCommits[page.id]
          const isSelected = page.id === selectedPageId
          const isPending = config.status === 'setup-pending'

          return (
            <div key={page.id} className="relative group">
              <button
                onClick={() => onSelect(page.id)}
                className={`w-full flex items-start gap-2 px-3 py-2.5 text-left transition ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-r-2 border-indigo-500'
                    : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                }`}
              >
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${freshnessColor(lastCommit?.date ?? null)}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-white/85'}`}>
                    {page.name}
                  </p>
                  {isPending && (
                    <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-medium mt-0.5">
                      Setup pending
                    </span>
                  )}
                  {lastCommit && (
                    <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5 truncate">
                      {new Date(lastCommit.date).toLocaleDateString()}
                    </p>
                  )}
                  {/* Pipeline counters */}
                  {(() => {
                    const st = sourceStats[page.id]
                    if (!st || (!st.newAvailable && !st.inAnalysis)) return null
                    return (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {st.newAvailable > 0 && (
                          <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            {st.newAvailable} new
                          </span>
                        )}
                        {st.inAnalysis > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-medium">
                            {st.inAnalysis} in analysis
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </div>
                {isAdmin && (
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === page.id ? null : page.id) }}
                    className="p-0.5 rounded text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 opacity-0 group-hover:opacity-100 transition"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="2" r="1" fill="currentColor"/>
                      <circle cx="6" cy="6" r="1" fill="currentColor"/>
                      <circle cx="6" cy="10" r="1" fill="currentColor"/>
                    </svg>
                  </button>
                )}
              </button>

              {/* 3-dot dropdown */}
              {menuOpen === page.id && isAdmin && (
                <div className="absolute right-2 top-8 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/[0.12] rounded-xl shadow-xl py-1 min-w-[140px]">
                  <button
                    onClick={() => { setEditPage(page); setMenuOpen(null) }}
                    className="w-full px-3 py-2 text-xs text-left text-gray-700 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
                  >
                    Edit settings
                  </button>
                  <button
                    onClick={() => handleDelete(page.id)}
                    className="w-full px-3 py-2 text-xs text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                  >
                    Delete page
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isAdmin && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-white/[0.08]">
          <button
            onClick={() => setAddModal(true)}
            className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/65 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
              <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Add Info Page
          </button>
        </div>
      )}

      {/* Overlay to close menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
      )}

      {addModal && (
        <PageFormModal
          title="New Info Page"
          submitLabel="Create Page"
          initial={{ name: '', repo: '', liveUrl: '', file: '' }}
          onClose={() => setAddModal(false)}
          onSubmit={handleAdd}
        />
      )}

      {editPage && (() => {
        const cfg: InfoPageConfig = editPage.board_config ? (() => { try { return JSON.parse(editPage.board_config!) } catch { return {} } })() : {}
        return (
          <PageFormModal
            title="Edit Info Page"
            submitLabel="Save Changes"
            initial={{
              name: editPage.name,
              repo: cfg.repo || '',
              liveUrl: cfg.live_url || '',
              file: cfg.file || '',
            }}
            onClose={() => setEditPage(null)}
            onSubmit={(name, config) => handleEdit(editPage.id, name, config)}
          />
        )
      })()}
    </div>
  )
}
