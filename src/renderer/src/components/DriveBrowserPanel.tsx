import { useState, useEffect } from 'react'

interface Props {
  taskId: string
  authorId: string
  authorName: string
  onClose: () => void
  onAttachmentAdded: () => void
}

type PanelTab = 'upload' | 'link' | 'drive'

export default function DriveBrowserPanel({ taskId, authorId, authorName, onClose, onAttachmentAdded }: Props) {
  const [tab,          setTab]          = useState<PanelTab>('upload')
  const [driveConnected, setDriveConnected] = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [linkUrl,      setLinkUrl]      = useState('')
  const [linkName,     setLinkName]     = useState('')
  const [linkType,     setLinkType]     = useState<'url' | 'gdoc'>('url')
  const [addingLink,   setAddingLink]   = useState(false)
  const [sharedFiles,  setSharedFiles]  = useState<{id:string;name:string;mimeType:string;size?:string}[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  useEffect(() => {
    window.api.drive.isConnected().then(setDriveConnected).catch(() => setDriveConnected(false))
  }, [])

  useEffect(() => {
    if (tab === 'drive' && driveConnected) {
      setLoadingFiles(true)
      window.api.drive.listFolder('KantorConsultingHub/Shared')
        .then(setSharedFiles)
        .catch(() => setSharedFiles([]))
        .finally(() => setLoadingFiles(false))
    }
  }, [tab, driveConnected])

  async function handleUploadFile() {
    setUploading(true)
    try {
      const result = await window.api.attachments.addFile(taskId)
      if (result.ok) {
        onAttachmentAdded()
        onClose()
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleAddLink() {
    if (!linkUrl.trim()) return
    setAddingLink(true)
    try {
      await window.api.attachments.addUrl(
        taskId,
        linkName.trim() || linkUrl.trim(),
        linkUrl.trim(),
        linkType
      )
      onAttachmentAdded()
      onClose()
    } finally {
      setAddingLink(false)
    }
  }

  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'upload', label: 'Upload File' },
    { id: 'link',   label: 'Add Link' },
    { id: 'drive',  label: 'Kantor Hub Drive' },
  ]

  return (
    <div className="absolute inset-0 flex items-stretch">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-white/[0.1] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.08]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add Attachment</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white/75 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-white/[0.08]">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-medium transition ${
                tab === t.id
                  ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/75'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto">

          {/* Upload tab */}
          {tab === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={handleUploadFile}
                className="border-2 border-dashed border-gray-200 dark:border-white/[0.12] rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500/60 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition"
              >
                {uploading ? (
                  <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                ) : (
                  <>
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-gray-300 dark:text-white/25">
                      <path d="M16 22V10M10 16l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M6 26h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-600 dark:text-white/70">Click to select a file</p>
                      <p className="text-xs text-gray-400 dark:text-white/35 mt-0.5">Any file type</p>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleUploadFile}
                disabled={uploading}
                className="w-full py-2 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50"
              >
                {uploading ? 'Opening picker…' : 'Choose File'}
              </button>
            </div>
          )}

          {/* Link tab */}
          {tab === 'link' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5">Link type</label>
                <div className="flex gap-2">
                  {(['url', 'gdoc'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setLinkType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        linkType === t
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                          : 'border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-white/60 hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      {t === 'url' ? 'URL' : 'Google Doc'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5">URL</label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5">Name (optional)</label>
                <input
                  type="text"
                  value={linkName}
                  onChange={e => setLinkName(e.target.value)}
                  placeholder="Link name…"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <button
                onClick={handleAddLink}
                disabled={!linkUrl.trim() || addingLink}
                className="w-full py-2 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50"
              >
                {addingLink ? 'Adding…' : 'Add Link'}
              </button>
            </div>
          )}

          {/* Drive tab */}
          {tab === 'drive' && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${driveConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-white/25'}`} />
                <span className="text-xs text-gray-500 dark:text-white/50">
                  {driveConnected ? 'Drive connected' : 'Drive not connected'}
                </span>
              </div>

              {driveConnected ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-white/50">Shared Folder</span>
                    <button
                      onClick={() => window.open('https://drive.google.com', '_blank')}
                      className="text-xs text-indigo-500 hover:text-indigo-600 transition"
                    >
                      Open Drive ↗
                    </button>
                  </div>
                  {loadingFiles ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                  ) : sharedFiles.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-white/35 text-center py-4">
                      No files in KantorConsultingHub/Shared
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {sharedFiles.map(f => (
                        <div
                          key={f.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.04] transition cursor-default"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-400 dark:text-white/35 shrink-0">
                            <rect x="2" y="1" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                          </svg>
                          <span className="text-xs text-gray-700 dark:text-white/75 truncate flex-1">{f.name}</span>
                          {f.size && <span className="text-[10px] text-gray-400 dark:text-white/30 shrink-0">{Math.round(parseInt(f.size)/1024)}K</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500 dark:text-white/50">
                    Connect Google Drive in Settings to access your team's shared files.
                  </p>
                  <p className="text-xs text-gray-400 dark:text-white/35">
                    Go to Settings → Drive Integration to connect your account.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
