import { useState, useEffect, useCallback, useMemo } from 'react'
import PipelineSourceCard from './PipelineSourceCard'
import { groupByArticle } from './groupByArticle'

interface Props {
  pageId: string
  onMoved?: () => void
}

export default function PreCommitReviewTab({ pageId, onMoved }: Props) {
  const [rows, setRows] = useState<InfoPageSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [backingOut, setBackingOut] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await window.api.infoPages.getSourcePipeline(pageId)
      const review = all.filter(r => r.stage === 'review')
      setRows(review)
      // The batch shares one design-notes value; seed from the first item that has it.
      const existing = review.find(r => r.design_notes)?.design_notes || ''
      setNotes(existing)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [pageId])

  useEffect(() => { load() }, [load])

  // NS-2 Step 5: one card per ARTICLE (shared helper). CSIS's 5 review placements → 1 card.
  const grouped = useMemo(() => groupByArticle(rows), [rows])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    try {
      await window.api.infoPages.saveReviewNotes(pageId, notes)
      flash('Design notes saved')
    } finally { setSavingNotes(false) }
  }

  async function handleCommit() {
    if (!grouped.length) return
    setCommitting(true)
    try {
      // Persist the latest notes before committing so they travel with the batch. The commit
      // is a page-wide batch (commitSources commits ALL review rows) — per-article dedup of the
      // server loop lives in the main handler (SELECT DISTINCT article_id), not here; the count
      // shown is sources (grouped.length), not placement rows.
      await window.api.infoPages.commitSources(pageId, notes)
      flash(`Committed ${grouped.length} source${grouped.length !== 1 ? 's' : ''}`)
      await load()
      onMoved?.()
    } finally { setCommitting(false) }
  }

  async function handleBackOut(articleId: string) {
    setBackingOut(articleId)
    try {
      await window.api.infoPages.backSourceToNew(pageId, articleId)
      await load()
      onMoved?.()
    } finally { setBackingOut(null) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/></div>

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {toast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium shadow-2xl">
          {toast}
        </div>
      )}

      {/* Pre-publish design notes (moved here — guidance for designing the page later with Cowork) */}
      <div className="shrink-0 px-5 py-3 border-b border-gray-100 dark:border-white/[0.06]">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">Pre-publish design notes</label>
          <button
            onClick={handleSaveNotes}
            disabled={savingNotes}
            className="text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition disabled:opacity-50"
          >
            {savingNotes ? 'Saving…' : 'Save notes'}
          </button>
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Guidance for designing this page later with Cowork — layout, emphasis, framing, what to highlight from these sources…"
          className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-800 dark:text-white/85 placeholder-gray-400 dark:placeholder-white/25 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
        <div className="flex items-center gap-3 mt-2">
          <p className="text-[11px] text-gray-400 dark:text-white/30">{grouped.length} source{grouped.length !== 1 ? 's' : ''} in review</p>
          <div className="flex-1" />
          <button
            onClick={handleCommit}
            disabled={committing || grouped.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition disabled:opacity-40"
          >
            {committing && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
            Commit ({grouped.length})
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-white/40">Nothing in review</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Check sources in New Sources and click “Send to Review” to stage them here</p>
          </div>
        )}
        {grouped.map(g => (
          <PipelineSourceCard
            key={g.article_id}
            row={g}
            action={
              <button
                onClick={() => handleBackOut(g.article_id)}
                disabled={backingOut === g.article_id}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition disabled:opacity-50"
                title="Return this source to New Sources"
              >
                {backingOut === g.article_id ? '…' : '← New Sources'}
              </button>
            }
          />
        ))}
      </div>
    </div>
  )
}
