import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'

const CONFIDENCE_COLORS = {
  high:   { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  low:    { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-400',     dot: 'bg-red-500' },
}

const STATUS_COLORS: Record<string, string> = {
  unreviewed: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300',
  approved:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  rejected:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  saved:      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  pushed:     'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
}

interface Props { onApprove: () => void }

export default function DocumentsTab({ onApprove }: Props) {
  const { localUser, isAdmin } = useAuth()
  const [documents, setDocuments] = useState<IntelligenceSource[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [expandedAnalysis, setExpandedAnalysis] = useState<Record<string, boolean>>({})
  const [pendingStatus, setPendingStatus] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.intelligence.getSources({ type: 'document' })
      setDocuments(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleUpload() {
    setUploading(true)
    try {
      const result = await window.api.intelligence.uploadDocument({
        userId: localUser?.id,
        addedByName: localUser?.name,
      })
      if (result.ok && !result.canceled) {
        await load()
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleStatus(id: string, status: string) {
    setPendingStatus(p => ({ ...p, [id]: true }))
    try {
      await window.api.intelligence.updateStatus(id, status, undefined, localUser?.id, localUser?.name)
      await load()
      if (status === 'approved') onApprove()
    } finally {
      setPendingStatus(p => ({ ...p, [id]: false }))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document?')) return
    await window.api.intelligence.deleteSource(id)
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  function toggleAnalysis(id: string) {
    setExpandedAnalysis(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return dateStr }
  }

  function getFileIcon(fileName: string | null) {
    const ext = (fileName || '').split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-red-500">
        <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M4 5h2c.5 0 1 .4 1 1s-.5 1-1 1H4V9M8.5 5h1.5c.3 0 .5.2.5.5s-.2.5-.5.5H8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>
    )
    if (ext === 'docx') return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-blue-500">
        <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M4 5l1.5 4L7 5.5 8.5 9 10 5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-500">
        <path d="M2 12V3a1 1 0 0 1 1-1h5l3 3v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
        <path d="M8 2v3h3" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Upload bar */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-3">
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition disabled:opacity-50"
        >
          {uploading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing with Claude...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 4l3-3 3 3M2 10v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Upload Documents
            </>
          )}
        </button>
        <span className="text-xs text-gray-400 dark:text-white/30">
          Accepts PDF, DOCX, TXT — Claude AI will analyze content automatically
        </span>
        <span className="ml-auto text-xs text-gray-400 dark:text-white/30">{documents.length} documents</span>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && documents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-400 dark:text-white/30">
                <path d="M3 16V4a1 1 0 0 1 1-1h7l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M11 3v5h5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">No documents uploaded</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Upload PDF, DOCX, or TXT files to analyze with Claude</p>
          </div>
        )}

        {!loading && documents.map(doc => {
          const conf = doc.confidence || 'low'
          const confStyle = CONFIDENCE_COLORS[conf as keyof typeof CONFIDENCE_COLORS] || CONFIDENCE_COLORS.low
          const cats: string[] = (() => { try { return JSON.parse(doc.categories_json || '[]') } catch { return [] } })()
          const analysis: Record<string, any> = (() => { try { return doc.analysis_json ? JSON.parse(doc.analysis_json) : null } catch { return null } })()
          const isExpanded = expandedAnalysis[doc.id]
          const isPending = pendingStatus[doc.id]

          return (
            <div key={doc.id} className="bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-4">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                  {getFileIcon(doc.file_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{doc.file_name || doc.title || 'Document'}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${confStyle.bg} ${confStyle.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${confStyle.dot}`} />
                      {conf}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${STATUS_COLORS[doc.status] || STATUS_COLORS.unreviewed}`}>
                      {doc.status}
                    </span>
                    {doc.added_by_name && (
                      <span className="text-xs text-gray-400 dark:text-white/30">by {doc.added_by_name}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-white/30">{formatDate(doc.added_at)}</span>
                  </div>
                </div>
              </div>

              {/* Category badges */}
              {cats.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {cats.map(cat => (
                    <span key={cat} className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              {/* Analysis panel */}
              {analysis && (
                <div className="mt-3">
                  <button
                    onClick={() => toggleAnalysis(doc.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition"
                  >
                    <svg
                      width="10" height="10" viewBox="0 0 10 10" fill="none"
                      className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {isExpanded ? 'Hide' : 'Show'} Claude analysis
                    {analysis.confidence_reasoning && (
                      <span className="text-gray-400 dark:text-white/30 font-normal ml-1">— {analysis.confidence_reasoning}</span>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] space-y-2.5 text-xs">
                      {analysis.key_findings?.length > 0 && (
                        <div>
                          <p className="font-semibold text-gray-700 dark:text-white/70 mb-1">Key Findings</p>
                          <ul className="space-y-0.5">
                            {analysis.key_findings.map((f: string, i: number) => (
                              <li key={i} className="flex gap-1.5 text-gray-600 dark:text-white/60">
                                <span className="text-indigo-500 shrink-0 mt-0.5">•</span>
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {analysis.named_actors?.length > 0 && (
                          <div>
                            <p className="font-semibold text-gray-700 dark:text-white/70 mb-1">Actors</p>
                            <p className="text-gray-600 dark:text-white/60">{analysis.named_actors.join(', ')}</p>
                          </div>
                        )}
                        {analysis.locations?.length > 0 && (
                          <div>
                            <p className="font-semibold text-gray-700 dark:text-white/70 mb-1">Locations</p>
                            <p className="text-gray-600 dark:text-white/60">{analysis.locations.join(', ')}</p>
                          </div>
                        )}
                        {analysis.platforms_systems?.length > 0 && (
                          <div>
                            <p className="font-semibold text-gray-700 dark:text-white/70 mb-1">Platforms / Systems</p>
                            <p className="text-gray-600 dark:text-white/60">{analysis.platforms_systems.join(', ')}</p>
                          </div>
                        )}
                        {analysis.dates_events?.length > 0 && (
                          <div>
                            <p className="font-semibold text-gray-700 dark:text-white/70 mb-1">Dates / Events</p>
                            <p className="text-gray-600 dark:text-white/60">{analysis.dates_events.join(', ')}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!analysis && (
                <p className="text-xs text-gray-400 dark:text-white/30 mt-2">No Claude analysis available (no API key configured, or analysis failed)</p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
                <div className="flex-1" />
                {doc.status !== 'approved' && doc.status !== 'pushed' && (
                  <button
                    onClick={() => handleStatus(doc.id, 'approved')}
                    disabled={isPending}
                    className="px-2.5 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}
                {doc.status !== 'saved' && doc.status !== 'approved' && doc.status !== 'pushed' && (
                  <button
                    onClick={() => handleStatus(doc.id, 'saved')}
                    disabled={isPending}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    Save
                  </button>
                )}
                {doc.status !== 'rejected' && (
                  <button
                    onClick={() => handleStatus(doc.id, 'rejected')}
                    disabled={isPending}
                    className="px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
