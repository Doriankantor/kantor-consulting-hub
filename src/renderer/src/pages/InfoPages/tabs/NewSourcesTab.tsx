import { useState, useEffect, useCallback } from 'react'
import PipelineSourceCard from './PipelineSourceCard'

interface Props {
  pageId: string
  onMoved?: () => void
}

export default function NewSourcesTab({ pageId, onMoved }: Props) {
  const [rows, setRows] = useState<InfoPageSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await window.api.infoPages.getSourcePipeline(pageId)
      setRows(all.filter(r => r.stage === 'new'))
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [pageId])

  useEffect(() => { load() }, [load])

  const allChecked = rows.length > 0 && rows.every(r => checked.has(r.article_id))

  function toggleAll() {
    if (allChecked) setChecked(new Set())
    else setChecked(new Set(rows.map(r => r.article_id)))
  }

  async function handleSendToReview() {
    const ids = [...checked]
    if (!ids.length) return
    setSending(true)
    try {
      await window.api.infoPages.sendToReview(pageId, ids)
      setChecked(new Set())
      await load()
      onMoved?.()
    } finally { setSending(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/60 cursor-pointer select-none">
          <input type="checkbox" checked={allChecked} onChange={toggleAll}
            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-white/20 accent-indigo-600"/>
          Select all ({rows.length})
        </label>
        <div className="flex-1"/>
        <button
          onClick={handleSendToReview}
          disabled={checked.size === 0 || sending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition disabled:opacity-40"
        >
          {sending && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
          Send to Review ({checked.size})
        </button>
      </div>
      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">No new sources</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Approved articles assigned to this project appear here</p>
          </div>
        )}
        {rows.map(row => (
          <PipelineSourceCard key={row.article_id} row={row}
            checked={checked.has(row.article_id)}
            onCheck={c => {
              const s = new Set(checked)
              c ? s.add(row.article_id) : s.delete(row.article_id)
              setChecked(s)
            }}
          />
        ))}
      </div>
    </div>
  )
}
