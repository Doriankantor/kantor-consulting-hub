import { useState, useEffect, useCallback, useMemo } from 'react'
import { diffWords } from 'diff'
import PipelineSourceCard from './PipelineSourceCard'
import { groupByArticle, type Placement } from './groupByArticle'
import { Box } from './cellPrimitives'
import { IncidentCard, INCIDENTS_COLOR } from './incidentCard'
import { SECTION_LABELS, sectionLabel } from '../../Intelligence/sectionLabels'
import { sectionColor } from '../../Intelligence/sectionColors'
import { resolveIncident } from '../../Intelligence/resolveAnalysis'

interface Props {
  pageId: string
  onMoved?: () => void
}

// Pre-Commit Review (P4a-2): source-driven reconciliation view. A top dropdown picks a
// review-stage source; the left rail is the 9 sections (mirroring Page Content), marking
// the sections THIS source proposes a change to; the canvas shows that section's
// before/after text diffs (one Box per geography). READ-ONLY — accept/edit/write is
// P4a-2b. Commit stays (batch stage-flip only).

const SECTION_ORDER = Object.keys(SECTION_LABELS)   // canonical 9, display order
// Slice 4: incidents sentinel — the source's proposed incident as a 10th rail entry, kept
// OUT of SECTION_ORDER (it's not a (geo x section) cell). Mirrors CellGridTab's sentinel.
const INCIDENTS_VIEW = '__incidents__'
const sectionNo = (key: string) => key === INCIDENTS_VIEW ? '⚠' : String(SECTION_ORDER.indexOf(key) + 1).padStart(2, '0')

// The stored per-cell proposal shape (written by the P4a-1 generation hook). Mirror
// stores it as TEXT, so the row carries a JSON STRING — parse + guard defensively.
interface Proposal {
  status: 'pending' | 'generating' | 'ready' | 'error' | 'nochange'
  original_body?: string
  proposed_body?: string
  divergence?: boolean
  divergence_reasoning?: string
  error?: string
  generated_at?: string
}

function parseProposal(raw: string | null | undefined): Proposal | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw)
    return o && typeof o === 'object' && typeof o.status === 'string' ? (o as Proposal) : null
  } catch { return null }
}

// Minimal HTML→prose strip for the diff (mirrors the app idiom): block tags → breaks,
// drop remaining tags, decode the common entities. Diffing PROSE (not markup) keeps
// <p> churn out of the highlight view. Also reused for the raw-article-text panel.
function stripHtml(html?: string): string {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
}

const geoLabel = (g?: string) => (!g || g === 'REGIONAL' ? 'ALL LATAM' : g)

// Word-level marked-up diff (read-only). added → green, removed → red+strike, else plain.
function DiffText({ original, proposed }: { original: string; proposed: string }) {
  const parts = useMemo(() => diffWords(stripHtml(original), stripHtml(proposed)), [original, proposed])
  return (
    <p className="text-[13px] leading-relaxed text-gray-700 dark:text-white/70 whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.added) return <span key={i} className="bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300 rounded px-0.5">{part.value}</span>
        if (part.removed) return <span key={i} className="bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 line-through rounded px-0.5">{part.value}</span>
        return <span key={i}>{part.value}</span>
      })}
    </p>
  )
}

// One touched cell's proposal (one geography of the active section), framed in a <Box>.
function CellProposal({ placement }: { placement: Placement }) {
  const section = placement.section ?? ''
  const geo = placement.geography
  const color = sectionColor(section)
  const title = `${sectionLabel(section)} · ${geoLabel(geo)}`
  const proposal = parseProposal(placement.proposal_json)

  if (!proposal) {
    return (
      <Box title={title} color={color}>
        <p className="text-xs text-gray-400 dark:text-white/30 italic">No proposal for this section.</p>
      </Box>
    )
  }

  if (proposal.status === 'generating' || proposal.status === 'pending') {
    return (
      <Box title={title} color={color} meta={proposal.status}>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-white/50">
          <span className="w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          Analyzing…
        </div>
      </Box>
    )
  }

  if (proposal.status === 'error') {
    return (
      <Box title={title} color={color} meta="error">
        <p className="text-xs text-red-500 dark:text-red-400">{proposal.error || 'Proposal generation failed.'}</p>
      </Box>
    )
  }

  if (proposal.status === 'nochange') {
    return (
      <Box title={title} color={color} meta="no change">
        <p className="text-xs text-gray-400 dark:text-white/40 italic">No material change proposed for this section.</p>
      </Box>
    )
  }

  // status === 'ready' → the before/after diff.
  return (
    <Box title={title} color={color} meta="proposed">
      {proposal.divergence && (
        <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2 py-1.5 rounded-lg">
          ⚠ Contradicts current text{proposal.divergence_reasoning ? `: ${proposal.divergence_reasoning}` : ''}
        </p>
      )}
      <DiffText original={proposal.original_body ?? ''} proposed={proposal.proposed_body ?? ''} />
    </Box>
  )
}

export default function PreCommitReviewTab({ pageId, onMoved }: Props) {
  const [rows, setRows] = useState<InfoPageSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [backingOut, setBackingOut] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>(SECTION_ORDER[0])
  const [showFullSource, setShowFullSource] = useState(false)
  const [showArticleText, setShowArticleText] = useState(false)
  // Slice 4: the SELECTED source's proposed incident(s), by source_id (0..N, newest first).
  const [incidents, setIncidents] = useState<any[]>([])

  const load = useCallback(async (opts?: { background?: boolean }) => {
    if (!opts?.background) setLoading(true)
    try {
      const all = await window.api.infoPages.getSourcePipeline(pageId)
      setRows(all.filter(r => r.stage === 'review'))
    } catch (e) { console.error(e) }
    if (!opts?.background) setLoading(false)
  }, [pageId])

  useEffect(() => { load() }, [load])

  // One entry per ARTICLE. CSIS's N review placements → 1 grouped source.
  const grouped = useMemo(() => groupByArticle(rows), [rows])
  const selected = grouped.find(g => g.article_id === selectedArticleId) ?? null

  // Keep the selection valid across reloads/commits; default to the first source.
  useEffect(() => {
    if (!grouped.length) { if (selectedArticleId !== null) setSelectedArticleId(null); return }
    if (!grouped.some(g => g.article_id === selectedArticleId)) setSelectedArticleId(grouped[0].article_id)
  }, [grouped, selectedArticleId])

  // Per-section state for the SELECTED source: touched (has a real placement), ready
  // (at least one geography has a 'ready' proposal), and the placement count.
  const sectionState = useMemo(() => {
    const m: Record<string, { touched: boolean; ready: boolean; count: number }> = {}
    for (const sec of SECTION_ORDER) m[sec] = { touched: false, ready: false, count: 0 }
    for (const p of selected?.placements ?? []) {
      const sec = p.section ?? ''
      if (!sec || !(sec in m)) continue
      m[sec].touched = true
      m[sec].count++
      if (parseProposal(p.proposal_json)?.status === 'ready') m[sec].ready = true
    }
    return m
  }, [selected])

  // True while the SELECTED source has any proposal still generating/pending. Proposals
  // are written by a background (fire-and-forget) main-process batch, so without this the
  // 'generating' state would persist visually until the tab remounts.
  const anyGenerating = useMemo(() => {
    for (const p of selected?.placements ?? []) {
      const st = parseProposal(p.proposal_json)?.status
      if (st === 'generating' || st === 'pending') return true
    }
    return false
  }, [selected])

  // Poll-while-generating: while the selected source has any generating/pending cell,
  // background-refetch every 3s (no spinner) so completion shows without a remount. The
  // effect re-runs whenever anyGenerating or the selection changes, so it STOPS (cleanup
  // clears the interval) the moment every proposal resolves to ready/nochange/error, when
  // the source changes, and on unmount. A safety cap (40 polls ~= 2 min) prevents a truly
  // stuck 'generating' (a call that never wrote a terminal status) from polling forever —
  // on cap we stop and leave it; the user can remount to retry.
  useEffect(() => {
    if (!anyGenerating) return
    let polls = 0
    const MAX_POLLS = 40
    const id = setInterval(() => {
      if (++polls > MAX_POLLS) { clearInterval(id); return }
      void load({ background: true })
      // Slice 4: the incident generates in PARALLEL with the narrative proposals (same
      // fire-and-forget batch), so piggyback its refetch onto the same poll — the Incidents
      // sentinel then appears as soon as the row lands, without a manual reselect. Converges
      // and stops on the same bounded cycle (this effect's cleanup clears the interval).
      if (selectedArticleId) {
        void window.api.publication.getIncidentBySource(selectedArticleId)
          .then(rows => setIncidents(rows)).catch(() => {})
      }
    }, 3000)
    return () => clearInterval(id)
  }, [anyGenerating, selectedArticleId, load])

  // Slice 4: fetch the SELECTED source's proposed incident(s) by source_id. Keyed on the
  // source id ONLY (not grouped), so it fetches once per source switch — the poll above
  // covers the still-generating refetch. Clears first so a prior source's incident (and its
  // sentinel) never lingers; cancelled flag drops a stale response mid-switch.
  useEffect(() => {
    setIncidents([])
    if (!selectedArticleId) return
    let cancelled = false
    window.api.publication.getIncidentBySource(selectedArticleId)
      .then(rows => { if (!cancelled) setIncidents(rows) })
      .catch(e => { console.error(e); if (!cancelled) setIncidents([]) })
    return () => { cancelled = true }
  }, [selectedArticleId])

  // When the source changes, jump the rail to its first ready (else first touched) section.
  // Slice 4: a source with an incident but NO ready narrative section (a pure-incident source
  // — routed to a section that proposes no change) opens on its incident instead. The incident
  // presence uses the RESOLVED flag on the source's own analysis (synchronous, no wait on the
  // by-source fetch); the sentinel rail entry itself is still gated on actual fetched rows.
  useEffect(() => {
    if (!selectedArticleId) return
    const src = grouped.find(g => g.article_id === selectedArticleId)
    if (!src) return
    const touched: Record<string, boolean> = {}, ready: Record<string, boolean> = {}
    for (const p of src.placements) {
      const sec = p.section ?? ''
      if (!sec) continue
      touched[sec] = true
      if (parseProposal(p.proposal_json)?.status === 'ready') ready[sec] = true
    }
    const firstReady = SECTION_ORDER.find(s => ready[s])
    let isIncident = false
    try { isIncident = resolveIncident(src.analysis_json ? JSON.parse(src.analysis_json) : {}).isIncident } catch { isIncident = false }
    setActiveSection(
      !firstReady && isIncident
        ? INCIDENTS_VIEW
        : (firstReady ?? SECTION_ORDER.find(s => touched[s]) ?? SECTION_ORDER[0]),
    )
    setShowFullSource(false)
    setShowArticleText(false)
  }, [selectedArticleId, grouped])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }

  async function handleCommit() {
    if (!grouped.length) return
    setCommitting(true)
    try {
      // Design-notes box was removed from this tab (P4a-2); commit carries no notes now.
      await window.api.infoPages.commitSources(pageId, '')
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

  if (grouped.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-gray-500 dark:text-white/40">Nothing in review</p>
      <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Check sources in New Sources and click “Send to Review” to stage them here</p>
    </div>
  )

  // The active section's cells for the selected source (one per geography). A section can
  // be touched in REGIONAL + a country → each renders its own diff Box.
  const activeCells = (selected?.placements ?? []).filter(p => (p.section ?? '') === activeSection)
  const articleText = selected?.content ? stripHtml(selected.content) : ''

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {toast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium shadow-2xl">
          {toast}
        </div>
      )}

      {/* TOP BAR — source dropdown + batch Commit (commit is still the stage-flip). */}
      <div className="shrink-0 px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-3">
        <select
          value={selectedArticleId ?? ''}
          onChange={e => setSelectedArticleId(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] text-xs text-gray-800 dark:text-white/85 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          {grouped.map(g => (
            <option key={g.article_id} value={g.article_id}>{g.title || '(untitled)'}</option>
          ))}
        </select>
        <p className="shrink-0 text-[11px] text-gray-400 dark:text-white/30">{grouped.length} in review</p>
        <button
          onClick={handleCommit}
          disabled={committing || grouped.length === 0}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition disabled:opacity-40"
        >
          {committing && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
          Commit ({grouped.length})
        </button>
      </div>

      {/* TWO-COLUMN FRAME — section rail + canvas (mirrors Page Content). */}
      <div className="flex-1 flex overflow-hidden">
        {/* SECTION RAIL — the 9 sections; marks sections this source proposes a change to. */}
        <div className="shrink-0 w-52 border-r border-gray-100 dark:border-white/[0.06] overflow-y-auto py-2">
          {SECTION_ORDER.map(sec => {
            const st = sectionState[sec]
            const active = sec === activeSection
            const color = sectionColor(sec)
            // Dimmed unless the source proposes a change here (touched + ready).
            const lit = st.touched && st.ready
            return (
              <button
                key={sec}
                onClick={() => setActiveSection(sec)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left border-l-2 transition ${
                  active
                    ? 'bg-gray-50 dark:bg-white/[0.05] text-gray-900 dark:text-white'
                    : 'border-l-transparent text-gray-600 dark:text-white/60 hover:bg-gray-50/60 dark:hover:bg-white/[0.03]'
                } ${lit ? '' : 'opacity-40'}`}
                style={active ? { borderLeftColor: color } : undefined}
              >
                <span className="text-[10px] font-mono tabular-nums text-gray-400 dark:text-white/30">{sectionNo(sec)}</span>
                <span className="flex-1 text-xs font-medium truncate">{sectionLabel(sec)}</span>
                {lit && <span className="text-[11px] font-bold" style={{ color }}>!</span>}
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: lit ? color : 'transparent', boxShadow: lit ? undefined : 'inset 0 0 0 1px rgba(148,163,184,.4)' }} />
              </button>
            )
          })}

          {/* Slice 4: INCIDENTS sentinel — the source's proposed incident, a 10th rail entry
              OUTSIDE the 9. Shown ONLY when this source has >=1 incident row (mirrors how a
              section only lights when it has a proposed change). Always lit: a present
              incident IS a proposed change. */}
          {incidents.length > 0 && (
            <button
              onClick={() => setActiveSection(INCIDENTS_VIEW)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left border-l-2 mt-1 transition ${
                activeSection === INCIDENTS_VIEW
                  ? 'bg-gray-50 dark:bg-white/[0.05] text-gray-900 dark:text-white'
                  : 'border-l-transparent text-gray-600 dark:text-white/60 hover:bg-gray-50/60 dark:hover:bg-white/[0.03]'
              }`}
              style={activeSection === INCIDENTS_VIEW ? { borderLeftColor: INCIDENTS_COLOR } : undefined}
            >
              <span className="text-[10px] leading-none" style={{ color: INCIDENTS_COLOR }}>⚠</span>
              <span className="flex-1 text-xs font-medium truncate">Incident{incidents.length > 1 ? `s (${incidents.length})` : ''}</span>
              <span className="text-[11px] font-bold" style={{ color: INCIDENTS_COLOR }}>!</span>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: INCIDENTS_COLOR }} />
            </button>
          )}
        </div>

        {/* CANVAS — full-source expander + the active section's diffs. */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selected ? (
            <p className="text-sm text-gray-400 dark:text-white/30 py-8 text-center">Select a source to review its proposals.</p>
          ) : (
            <div className="space-y-3">
              {/* Header: title + Full source / back-out controls. */}
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white line-clamp-1">{selected.title || '(untitled)'}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowFullSource(s => !s)}
                    className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
                  >
                    {showFullSource ? 'Hide source' : 'Full source'}
                  </button>
                  <button
                    onClick={() => handleBackOut(selected.article_id)}
                    disabled={backingOut === selected.article_id}
                    className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition disabled:opacity-50"
                    title="Return this source to New Sources"
                  >
                    {backingOut === selected.article_id ? '…' : '← New Sources'}
                  </button>
                </div>
              </div>

              {/* Full source: AI analysis card + an optional raw-article-text toggle. */}
              {showFullSource && (
                <div className="space-y-2">
                  <PipelineSourceCard row={selected} />
                  {selected.content && (
                    <div>
                      <button
                        onClick={() => setShowArticleText(s => !s)}
                        className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
                      >
                        {showArticleText ? 'Hide article text' : 'Show article text'}
                      </button>
                      {showArticleText && (
                        <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-3.5 py-3 space-y-2">
                          {articleText
                            ? articleText.split(/\n\n+/).map((p, i) => <p key={i} className="text-[13px] leading-relaxed text-gray-700 dark:text-white/70">{p}</p>)
                            : <p className="text-xs text-gray-400 dark:text-white/30 italic">No article text available.</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Slice 4: the sentinel shows the source's proposed incident (read-only card),
                  not a narrative diff. Otherwise the active section's header + per-geo diffs. */}
              {activeSection === INCIDENTS_VIEW ? (
                <>
                  <div className="flex items-center gap-2.5 pt-1">
                    <span className="text-sm font-bold" style={{ color: INCIDENTS_COLOR }}>⚠</span>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Incident</h3>
                    <span className="ml-auto text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/40">read-only</span>
                  </div>
                  {incidents.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-white/30 py-8 text-center">No incident generated for this source.</p>
                  ) : (
                    <div className="space-y-3">
                      {incidents.map(inc => <IncidentCard key={String(inc.id)} inc={inc} />)}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Active section header + its per-geography diffs. */}
                  <div className="flex items-center gap-2.5 pt-1">
                    <span className="text-sm font-mono font-bold tabular-nums" style={{ color: sectionColor(activeSection) }}>{sectionNo(activeSection)}</span>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">{sectionLabel(activeSection)}</h3>
                    <span className="ml-auto text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/40">read-only</span>
                  </div>

                  {activeCells.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-white/30 py-8 text-center">This source has no placement in this section.</p>
                  ) : (
                    activeCells.map(p => <CellProposal key={p.pipeline_id} placement={p} />)
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
