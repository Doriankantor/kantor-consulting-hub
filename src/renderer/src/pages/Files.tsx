import { useState, useEffect, useMemo } from 'react'

type FilterType = 'all' | 'board' | 'type' | 'member'
type ViewType = 'list' | 'grid'
type FileTypeGroup = 'Documents' | 'PDFs' | 'Images' | 'Other'

function getFileTypeGroup(file: FileRecord): FileTypeGroup {
  if (file.type === 'gdoc' || file.type === 'url') return 'Other'
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'PDFs'
  if (name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/)) return 'Images'
  if (name.match(/\.(doc|docx|txt|rtf|odt|xls|xlsx|ppt|pptx|csv)$/)) return 'Documents'
  return 'Other'
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function FileTypeIcon({ file }: { file: FileRecord }) {
  const name = file.name.toLowerCase()

  if (file.type === 'url') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-gray-400 dark:text-white/40 shrink-0">
      <path d="M7 11l2-2M11 7l-2 2M6 9a3 3 0 0 0 0 4.24L7.76 15A3 3 0 0 0 12 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M12 9a3 3 0 0 0 0-4.24L10.24 3A3 3 0 0 0 6 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
  if (file.type === 'gdoc') return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-blue-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
  if (name.endsWith('.pdf')) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-red-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 8h2.5a1 1 0 0 1 0 2H6V8z" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M10 8v4M12 8v2.5a1 1 0 0 1-2 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
  if (name.match(/\.(doc|docx)$/)) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-blue-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
  if (name.match(/\.(xls|xlsx|csv)$/)) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-green-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 6h6M6 9h6M6 12h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M10 1v6M3 7h12" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
  if (name.match(/\.(ppt|pptx)$/)) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-orange-500 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="6" y="5" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
  if (name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/)) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-purple-500 shrink-0">
      <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="6.5" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M2 13l4-3.5 3 2.5 2.5-2 4.5 4" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-gray-400 dark:text-white/40 shrink-0">
      <rect x="3" y="1" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}

function LargeFileIcon({ file }: { file: FileRecord }) {
  const name = file.name.toLowerCase()
  if (file.type === 'url') return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-gray-400 dark:text-white/35">
      <path d="M11 17l3-3M17 11l-3 3M9 14a4.5 4.5 0 0 0 0 6.36L11.64 23A4.5 4.5 0 0 0 18 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M19 14a4.5 4.5 0 0 0 0-6.36L16.36 5A4.5 4.5 0 0 0 10 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (name.endsWith('.pdf')) return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-red-500">
      <rect x="4" y="2" width="20" height="24" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 13h3.5a1.5 1.5 0 0 1 0 3H9v-3z" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
  if (name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-purple-500">
      <rect x="3" y="4" width="22" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M3 20l6-5 5 4 4-3 7 6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-gray-400 dark:text-white/35">
      <rect x="4" y="2" width="20" height="24" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 10h10M9 14h10M9 18h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export default function Files() {
  const [files,       setFiles]       = useState<FileRecord[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [viewMode,    setViewMode]    = useState<ViewType>('list')
  const [filter,      setFilter]      = useState<FilterType>('all')
  const [filterValue, setFilterValue] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['By Project', 'By Type', 'By Team Member']))

  useEffect(() => {
    window.api.files.listAll()
      .then(data => { setFiles(data); setLoading(false) })
      .catch(() => { setFiles([]); setLoading(false) })
  }, [])

  // Computed filter tree data
  const boardGroups = useMemo(() => {
    const m: Record<string, { name: string; count: number }> = {}
    for (const f of files) {
      const key = f.board_id ?? '__none__'
      const name = f.board_name ?? 'No Project'
      if (!m[key]) m[key] = { name, count: 0 }
      m[key].count++
    }
    return m
  }, [files])

  const memberGroups = useMemo(() => {
    const m: Record<string, { name: string; count: number }> = {}
    for (const f of files) {
      const key = f.author_id
      if (!m[key]) m[key] = { name: f.author_name, count: 0 }
      m[key].count++
    }
    return m
  }, [files])

  const typeGroupCounts = useMemo(() => {
    const m: Record<string, number> = { Documents: 0, PDFs: 0, Images: 0, Other: 0 }
    for (const f of files) m[getFileTypeGroup(f)]++
    return m
  }, [files])

  // Apply filters
  const filtered = useMemo(() => {
    return files.filter(f => {
      if (search && !f.name.toLowerCase().includes(search.toLowerCase()) && !(f.task_title ?? '').toLowerCase().includes(search.toLowerCase())) return false
      if (filter === 'board' && filterValue !== null) return (f.board_id ?? '__none__') === filterValue
      if (filter === 'type' && filterValue !== null) return getFileTypeGroup(f) === filterValue
      if (filter === 'member' && filterValue !== null) return f.author_id === filterValue
      return true
    })
  }, [files, search, filter, filterValue])

  function setFilterAll() { setFilter('all'); setFilterValue(null) }
  function toggleSection(s: string) {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  async function openFile(id: string) {
    try { await window.api.attachments.open(id) } catch {}
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left pane */}
      <div className="w-48 shrink-0 border-r border-gray-200 dark:border-white/[0.08] flex flex-col py-4 overflow-y-auto bg-gray-50/50 dark:bg-white/[0.02]">
        {/* All files */}
        <button
          onClick={setFilterAll}
          className={`flex items-center justify-between px-4 py-2 text-sm font-medium transition ${
            filter === 'all'
              ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
              : 'text-gray-600 dark:text-white/65 hover:bg-gray-100 dark:hover:bg-white/[0.05]'
          }`}
        >
          <span>All Files</span>
          <span className="text-xs text-gray-400 dark:text-white/30">{files.length}</span>
        </button>

        {/* By Project */}
        <div className="mt-2">
          <button
            onClick={() => toggleSection('By Project')}
            className="flex items-center justify-between w-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/35 hover:text-gray-600 dark:hover:text-white/50 transition"
          >
            By Project
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${expandedSections.has('By Project') ? 'rotate-180' : ''}`}>
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {expandedSections.has('By Project') && (
            <div>
              {Object.entries(boardGroups).map(([key, { name, count }]) => (
                <button
                  key={key}
                  onClick={() => { setFilter('board'); setFilterValue(key) }}
                  className={`flex items-center justify-between w-full px-4 py-1.5 text-xs transition ${
                    filter === 'board' && filterValue === key
                      ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
                      : 'text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="truncate">{name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-white/30 ml-1 shrink-0">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* By Type */}
        <div className="mt-2">
          <button
            onClick={() => toggleSection('By Type')}
            className="flex items-center justify-between w-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/35 hover:text-gray-600 dark:hover:text-white/50 transition"
          >
            By Type
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${expandedSections.has('By Type') ? 'rotate-180' : ''}`}>
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {expandedSections.has('By Type') && (
            <div>
              {(['Documents','PDFs','Images','Other'] as FileTypeGroup[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setFilter('type'); setFilterValue(t) }}
                  className={`flex items-center justify-between w-full px-4 py-1.5 text-xs transition ${
                    filter === 'type' && filterValue === t
                      ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
                      : 'text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <span>{t}</span>
                  <span className="text-[10px] text-gray-400 dark:text-white/30 ml-1">{typeGroupCounts[t]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* By Team Member */}
        <div className="mt-2">
          <button
            onClick={() => toggleSection('By Team Member')}
            className="flex items-center justify-between w-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/35 hover:text-gray-600 dark:hover:text-white/50 transition"
          >
            By Member
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${expandedSections.has('By Team Member') ? 'rotate-180' : ''}`}>
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {expandedSections.has('By Team Member') && (
            <div>
              {Object.entries(memberGroups).map(([key, { name, count }]) => (
                <button
                  key={key}
                  onClick={() => { setFilter('member'); setFilterValue(key) }}
                  className={`flex items-center justify-between w-full px-4 py-1.5 text-xs transition ${
                    filter === 'member' && filterValue === key
                      ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
                      : 'text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="truncate">{name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-white/30 ml-1 shrink-0">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right pane */}
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="flex-1 relative">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/35">
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search files…"
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
          {/* View toggle */}
          <div className="flex bg-black/[0.04] dark:bg-white/[0.06] rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white dark:bg-white/[0.15] shadow-sm text-gray-800 dark:text-white' : 'text-gray-400 dark:text-white/40'}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white dark:bg-white/[0.15] shadow-sm text-gray-800 dark:text-white' : 'text-gray-400 dark:text-white/40'}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-gray-300 dark:text-white/20 mb-4">
              <path d="M6 38V12a2 2 0 0 1 2-2h12l4 4h16a2 2 0 0 1 2 2v22a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <p className="text-gray-400 dark:text-white/40 font-medium">No files found</p>
            <p className="text-gray-300 dark:text-white/25 text-sm mt-1">Attach files to tasks to see them here</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden">
            {/* Table header */}
            <div className="grid text-xs font-semibold text-gray-400 dark:text-white/35 uppercase tracking-wider px-4 py-2 border-b border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02]"
              style={{ gridTemplateColumns: '3fr 1fr 2fr 2fr 2fr 1fr 1fr' }}>
              <span>Name</span>
              <span>Type</span>
              <span>Project</span>
              <span>Task</span>
              <span>Added by</span>
              <span>Date</span>
              <span>Size</span>
            </div>
            {filtered.map((file, idx) => (
              <div
                key={file.id}
                onClick={() => openFile(file.id)}
                className={`grid items-center px-4 py-3 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03] transition ${idx !== filtered.length - 1 ? 'border-b border-gray-100 dark:border-white/[0.05]' : ''}`}
                style={{ gridTemplateColumns: '3fr 1fr 2fr 2fr 2fr 1fr 1fr' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileTypeIcon file={file} />
                  <span className="truncate text-gray-900 dark:text-white font-medium">{file.name}</span>
                </div>
                <span className="text-xs text-gray-400 dark:text-white/40 uppercase">{file.type}</span>
                <span className="truncate text-gray-500 dark:text-white/50 text-xs">{file.board_name ?? '—'}</span>
                <span className="truncate text-gray-500 dark:text-white/50 text-xs">{file.task_title ?? '—'}</span>
                <span className="truncate text-gray-500 dark:text-white/50 text-xs">{file.author_name}</span>
                <span className="text-gray-400 dark:text-white/30 text-xs">{new Date(file.created_at).toLocaleDateString()}</span>
                <span className="text-gray-400 dark:text-white/30 text-xs">{formatSize(file.size_bytes)}</span>
              </div>
            ))}
          </div>
        ) : (
          /* Grid view */
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-4 gap-3">
              {filtered.map(file => (
                <div
                  key={file.id}
                  onClick={() => openFile(file.id)}
                  className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-xl p-4 cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-white/[0.15] transition flex flex-col items-center gap-2"
                >
                  <div className="w-12 h-12 flex items-center justify-center bg-gray-50 dark:bg-white/[0.06] rounded-xl">
                    <LargeFileIcon file={file} />
                  </div>
                  <div className="text-xs font-medium text-gray-800 dark:text-white/85 text-center truncate w-full">{file.name}</div>
                  <div className="text-[10px] text-gray-400 dark:text-white/35 text-center truncate w-full">{file.board_name ?? file.task_title ?? '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
