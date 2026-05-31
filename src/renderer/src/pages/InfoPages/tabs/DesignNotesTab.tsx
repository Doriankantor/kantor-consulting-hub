import { useState, useEffect, useCallback } from 'react'

interface Props {
  pageId: string
  page: InfoPage
  localUser: { id: string; name: string } | null
  onNavigate?: (tab: string) => void
}

interface Rec {
  section: string
  action: string
  detail: string
  confidence: string
  checked: boolean
}

const CONF_STYLES: Record<string, string> = {
  high:   'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
  medium: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  low:    'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
}

export default function DesignNotesTab({ pageId, localUser, onNavigate }: Props) {
  const [designItem, setDesignItem] = useState<InfoPageItem | null>(null)
  const [summary, setSummary] = useState('')
  const [recs, setRecs] = useState<Rec[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = await window.api.infoPages.getItems(pageId, 'design')
      // Most recent unconfirmed design-notes item (getItems is DESC by created_at).
      const latest = items.find(i => i.sub_type === 'design_notes' && i.status !== 'confirmed')
        || items.find(i => i.sub_type === 'design_notes')
        || null
      setDesignItem(latest)
      if (latest) {
        let parsed: { summary?: string; recommendations?: Partial<Rec>[] } = {}
        try { parsed = JSON.parse(latest.analysis_json || '{}') } catch { /* ignore */ }
        setSummary(parsed.summary || '')
        setRecs((parsed.recommendations || []).map(r => ({
          section: r.section || 'General',
          action: r.action || '',
          detail: r.detail || '',
          confidence: r.confidence || 'medium',
          checked: r.checked !== false,
        })))
      } else {
        setSummary(''); setRecs([])
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [pageId])

  useEffect(() => { load() }, [load])

  function updateRec(i: number, patch: Partial<Rec>) {
    setRecs(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  async function persist(status?: string) {
    if (!designItem) return
    await window.api.infoPages.updateItem(designItem.id, {
      status: status || designItem.status,
      analysis_json: JSON.stringify({ summary, recommendations: recs }),
    })
  }

  async function saveDraft() {
    if (!designItem) return
    setSaving(true)
    try { await persist(); setToast('Saved'); setTimeout(() => setToast(null), 1500) }
    finally { setSaving(false) }
  }

  async function confirmAll() {
    if (!designItem || !localUser || confirming) return
    const chosen = recs.filter(r => r.checked && r.action.trim())
    if (!chosen.length) { setToast('Select at least one change first'); setTimeout(() => setToast(null), 1800); return }
    setConfirming(true)
    try {
      await persist('confirmed')
      const itemIds: string[] = []
      for (const r of chosen) {
        const res = await window.api.infoPages.addItem({
          page_id: pageId,
          tab: 'analysis',
          sub_type: 'ai_suggestion',
          title: r.action,
          proposed_section: r.section,
          confidence: r.confidence,
          source_ref: 'Design notes',
          analysis_json: JSON.stringify({ action: r.action, section: r.section, detail: r.detail, confidence: r.confidence, source: 'Design notes', priority: r.confidence === 'high' ? 'high' : 'medium' }),
          priority: r.confidence === 'high' ? 'high' : 'medium',
          created_by_id: localUser.id,
          created_by_name: localUser.name,
        })
        if (res?.id) itemIds.push(res.id)
      }
      if (itemIds.length) {
        await window.api.infoPages.commitItems({
          pageId,
          itemIds,
          submittedById: localUser.id,
          submittedByName: localUser.name,
        })
      }
      setToast(`${itemIds.length} change${itemIds.length !== 1 ? 's' : ''} sent to Commit for Review`)
      setTimeout(() => { setToast(null); onNavigate?.('review') }, 1300)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {toast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium shadow-2xl">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-700 dark:text-white/75">Pre-publish Design Notes</p>
          <p className="text-[10px] text-gray-400 dark:text-white/30">Review and edit the changes Claude recommended before they go to Commit for Review.</p>
        </div>
        {designItem && (
          <button onClick={saveDraft} disabled={saving}
            className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && !designItem && (
          <div className="text-center py-10">
            <p className="text-sm text-gray-400 dark:text-white/30">No design notes yet.</p>
            <p className="text-xs text-gray-400 dark:text-white/20 mt-1 max-w-sm mx-auto">
              Run a conversation in <span className="font-medium">Claude Analysis</span> and click “Mark analysis complete” to generate design notes here.
            </p>
            <button onClick={() => onNavigate?.('analysis')}
              className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition">
              Go to Claude Analysis
            </button>
          </div>
        )}

        {!loading && designItem && (
          <>
            {/* Summary of uncommitted changes */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 mb-1.5">Summary of uncommitted changes</label>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                rows={3}
                placeholder="Overview of what will change on the page…"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-800 dark:text-white/85 placeholder-gray-400 dark:placeholder-white/25 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            {/* Design recommendations */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 mb-1.5">Design recommendations</label>
              {recs.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-white/25 py-2">No specific recommendations were extracted.</p>
              )}
              <div className="space-y-2">
                {recs.map((r, i) => (
                  <div key={i} className={`p-3 rounded-xl border transition ${
                    r.checked
                      ? 'border-indigo-200 dark:border-indigo-500/40 bg-indigo-50/50 dark:bg-indigo-500/5'
                      : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] opacity-70'
                  }`}>
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={r.checked}
                        onChange={e => updateRec(i, { checked: e.target.checked })}
                        className="mt-0.5 w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500/30 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/50">{r.section}</span>
                          <select
                            value={r.confidence}
                            onChange={e => updateRec(i, { confidence: e.target.value })}
                            className={`text-[9px] px-1 py-0.5 rounded-full font-medium uppercase border-0 focus:outline-none cursor-pointer ${CONF_STYLES[r.confidence] || CONF_STYLES.medium}`}
                          >
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                          </select>
                        </div>
                        <input
                          value={r.action}
                          onChange={e => updateRec(i, { action: e.target.value })}
                          placeholder="Change title"
                          className="w-full bg-transparent text-xs font-semibold text-gray-800 dark:text-white/85 focus:outline-none mb-1"
                        />
                        <textarea
                          value={r.detail}
                          onChange={e => updateRec(i, { detail: e.target.value })}
                          rows={2}
                          placeholder="Specific detail…"
                          className="w-full bg-transparent text-[11px] text-gray-500 dark:text-white/50 resize-none focus:outline-none"
                        />
                      </div>
                      <button onClick={() => setRecs(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-gray-300 dark:text-white/20 hover:text-red-500 transition shrink-0">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setRecs(prev => [...prev, { section: 'General', action: '', detail: '', confidence: 'medium', checked: true }])}
                className="mt-2 text-[11px] px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-white/[0.12] text-gray-500 dark:text-white/40 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
              >
                + Add a recommendation
              </button>
            </div>
          </>
        )}
      </div>

      {/* Confirm bar */}
      {!loading && designItem && (
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900">
          <button
            onClick={confirmAll}
            disabled={confirming}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-green-500 hover:bg-green-600 text-white transition disabled:opacity-50"
          >
            {confirming ? 'Confirming…' : 'All design decisions confirmed — Move to Commit for Review'}
          </button>
        </div>
      )}
    </div>
  )
}
