import { useState, useEffect, useCallback } from 'react'
import PipelineSourceCard from './PipelineSourceCard'
import { notifyIntelChanged } from '../../../utils/intelEvents'

interface Props {
  pageId: string
  onMoved?: () => void
}

export default function NewSourcesTab({ pageId, onMoved }: Props) {
  const [rows, setRows] = useState<InfoPageSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // 4b-iii: brief inline notice (mirrors the sibling tabs). Slightly longer than the
  // sibling 1800ms because the gate message is actionable ("confirm a section first").
  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3200)
  }

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
      const res = await window.api.infoPages.sendToReview(pageId, ids)
      // 4b-iii: surface the ≥1-section gate (and any writer error) instead of swallowing it.
      // Keep the selection on failure so the researcher can confirm sections and retry.
      if (!res.ok) flash(res.error || 'Could not send to review.')
      else setChecked(new Set())
      await load()   // reflect any partial batch that DID advance before the block
      onMoved?.()
    } finally { setSending(false) }
  }

  // NS-1: confirm/trim the AI's proposed sections → analysis_json.routing.confirmed on the
  // intel row. Optimistic: patch routing.confirmed on the local row's analysis_json so the chips
  // reflect the choice immediately. NO info_page_sources / placement write (that's NS-2).
  const handleConfirmSections = async (articleId: string, sections: string[]) => {
    await window.api.intelligence.setRoutingConfirmed(articleId, sections)
    // NS-2 4b-ii: reconcile the physical placement rows to the confirmed set (stage-safe
    // diff). Runs AFTER the confirmed write — a placement-sync failure must not lose it,
    // so we log and continue rather than revert. No placement-view refresh needed yet
    // (New Sources doesn't render placement rows until the Step-5 UI re-key).
    try {
      const res = await window.api.infoPages.syncPlacements(pageId, articleId, sections)
      if (!res.ok) console.warn('[NS-2 4b-ii] syncPlacements failed:', res.error)
    } catch (e) { console.warn('[NS-2 4b-ii] syncPlacements threw:', e) }
    setRows(prev => prev.map(r => {
      if (r.article_id !== articleId) return r
      let analysis: any = {}
      try { analysis = r.analysis_json ? JSON.parse(r.analysis_json) : {} } catch { analysis = {} }
      analysis.routing = { ...(analysis.routing ?? {}), confirmed: sections }
      return { ...r, analysis_json: JSON.stringify(analysis) }
    }))
  }

  // 3c-2b: remove this source from the pipeline and return it to the intel queue.
  const handleMoveBack = async (articleId: string) => {
    await window.api.infoPages.moveBackToIntel(pageId, articleId)
    await load()
    onMoved?.()
    notifyIntelChanged()   // intel row reverts to 'unreviewed' (+1 pending) — refresh the Sidebar badge now
  }

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/></div>

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {toast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium shadow-2xl">
          {toast}
        </div>
      )}
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
            onConfirmSections={handleConfirmSections}
            onCheck={c => {
              const s = new Set(checked)
              c ? s.add(row.article_id) : s.delete(row.article_id)
              setChecked(s)
            }}
            action={
              <button
                onClick={() => handleMoveBack(row.article_id)}
                className="px-2 py-0.5 rounded-lg text-[11px] font-medium text-gray-500 dark:text-white/50 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                title="Return this source to the Intelligence pending queue"
              >↩ Move back to intel</button>
            }
          />
        ))}
      </div>
    </div>
  )
}
