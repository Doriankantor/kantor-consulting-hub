import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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

// A single proposed card entry inside proposal_json.proposed_cards[]. `id` is the per-(card x
// cell) UUID minted in fanOutCards (P4c-2b-i) — the stable handle the accept/dismiss setters
// key on. `handled` is the per-card terminal state (P4c-2b-ii, setCardHandled), INDEPENDENT of
// the narrative `status`. Both optional: pre-2b data carried neither.
type ProposedCard = { id?: string; headline: string; detail?: string; confidence?: string; handled?: 'accepted' | 'dismissed' }
// A live card already on the cell (getCellCards) — the eviction-picker victim shape. DB `id`
// is numeric (cards table PK), distinct from ProposedCard's string uuid.
type CellCard = { id: number; headline: string; detail: string; confidence?: string; position: number }

// The stored per-cell proposal shape (written by the P4a-1 generation hook). Mirror
// stores it as TEXT, so the row carries a JSON STRING — parse + guard defensively.
interface Proposal {
  status: 'pending' | 'generating' | 'ready' | 'error' | 'nochange' | 'accepted' | 'kept'
  original_body?: string
  proposed_body?: string
  divergence?: boolean
  divergence_reasoning?: string
  error?: string
  generated_at?: string
  // P4c-1 writes this into the same blob (INDEPENDENT of narrative status — a cell can be
  // 'nochange' yet carry proposed cards). parseProposal already returns it at runtime; this
  // declaration just makes it type-visible.
  proposed_cards?: ProposedCard[]
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

// P4a-2b: a stable per-cell key for the in-flight/error tracking. pipeline_id is globally
// unique per placement row (already this cell's React key), so it disambiguates cells across
// geographies of the same section without needing article_id (which Placement doesn't carry).
const cellKey = (p: Placement) => String(p.pipeline_id)

// One touched cell's proposal (one geography of the active section), framed in a <Box>.
// P4a-2b: the 'ready' box now carries [Keep original] / [Accept edited]; accepted/kept are
// terminal states with their own minimal note (they must short-circuit BEFORE the ready
// return, else the fall-through would re-render the diff). busy/cellError are per-cell
// primitives computed by the parent; onAccept/onKeep call the ② IPC via the parent handlers.
function CellProposal({ placement, busy, cellError, onAccept, onKeep, cardBusy, cardError, onAcceptCard, onDismissCard }: {
  placement: Placement
  busy: boolean
  cellError: string | null
  onAccept: (p: Placement) => Promise<void>
  onKeep: (p: Placement) => Promise<void>
  // P4c-2b-iii: per-card action wiring. cardBusy/cardError are GLOBAL (the busy card's id and
  // the errored card's id+msg) — each tile matches on its own card.id. The two handlers live in
  // the parent (they need selected.article_id + pageId, neither on Placement), mirroring
  // onAccept/onKeep.
  cardBusy: string | null
  cardError: { id: string; msg: string } | null
  onAcceptCard: (p: Placement, card: ProposedCard) => void
  onDismissCard: (p: Placement, card: ProposedCard) => void
}) {
  const section = placement.section ?? ''
  const geo = placement.geography
  const color = sectionColor(section)
  const title = `${sectionLabel(section)} · ${geoLabel(geo)}`
  const proposal = parseProposal(placement.proposal_json)

  // The NARRATIVE sub-region — the status switch (unchanged). Returns one <Box> per status.
  // P4c-2a: pulled into a closure so the proposed-cards block can render AFTER it on EVERY
  // status path — a card-only cell has status 'nochange' yet must still show its cards.
  const renderNarrative = () => {
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

    // Terminal states (P4a-2b) — short-circuit BEFORE the ready return so an already-resolved
    // cell reads clearly instead of re-showing the diff + buttons.
    if (proposal.status === 'accepted') {
      return (
        <Box title={title} color={color} meta="accepted">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Accepted — page text updated</p>
        </Box>
      )
    }

    if (proposal.status === 'kept') {
      return (
        <Box title={title} color={color} meta="kept">
          <p className="text-xs text-gray-400 dark:text-white/40 italic">Kept original — no change</p>
        </Box>
      )
    }

    // status === 'ready' → the before/after diff + accept/keep controls.
    return (
      <Box title={title} color={color} meta="proposed">
        {proposal.divergence && (
          <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2 py-1.5 rounded-lg">
            ⚠ Contradicts current text{proposal.divergence_reasoning ? `: ${proposal.divergence_reasoning}` : ''}
          </p>
        )}
        <DiffText original={proposal.original_body ?? ''} proposed={proposal.proposed_body ?? ''} />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => onKeep(placement)}
            disabled={busy}
            className="px-2 py-1 text-xs rounded border border-gray-500 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >Keep original</button>
          <button
            onClick={() => onAccept(placement)}
            disabled={busy}
            className="px-2 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
          >{busy ? 'Accepting…' : 'Accept edited'}</button>
          {cellError && <span className="text-xs text-red-400">{cellError}</span>}
        </div>
      </Box>
    )
  }

  // P4c-2b-iii: the PROPOSED CARDS block. Renders on EVERY status path (independent of narrative
  // status — a 'nochange' cell can still carry cards). Each tile is driven by card.handled:
  //   undefined  -> dashed "proposed" tile + [Add to page] / [Dismiss] controls
  //   'accepted' -> solid tile + green "Added to page" chip (no buttons)
  //   'dismissed'-> muted tile + "Dismissed" chip (no buttons)
  // The accept/dismiss WRITE is P4c-2b-ii (main process); this only wires the controls. A card
  // with no id (pre-2b data) can't be keyed for busy/error, so it stays read-only.
  const renderProposedCards = () => {
    const cards = proposal?.proposed_cards
    if (!Array.isArray(cards) || cards.length === 0) return null
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-white/[0.15] px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/50">Proposed cards</span>
          <span className="text-[10px] font-mono tabular-nums text-gray-400 dark:text-white/30">{cards.length}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cards.map((cd, i) => {
            const resolved = cd.handled === 'accepted' || cd.handled === 'dismissed'
            const thisBusy = !!cd.id && cardBusy === cd.id
            const thisErr = cardError && cardError.id === cd.id ? cardError.msg : null
            return (
              <div
                key={cd.id ?? i}
                className={`rounded-lg border border-l-2 px-3 py-2 ${
                  cd.handled === 'accepted'
                    ? 'border-emerald-200 dark:border-emerald-500/25 bg-emerald-50/40 dark:bg-emerald-500/[0.06]'
                    : cd.handled === 'dismissed'
                    ? 'border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.015] opacity-60'
                    : 'border-dashed border-gray-200 dark:border-white/[0.12] bg-gray-50/40 dark:bg-white/[0.02]'
                }`}
                style={{ borderLeftColor: color }}
              >
                <div className="text-sm font-bold leading-snug text-gray-900 dark:text-white/85">{cd.headline}</div>
                {cd.detail && <div className="text-[12px] leading-snug text-gray-600 dark:text-white/55 mt-0.5">{cd.detail}</div>}
                {cd.confidence && <div className="text-[10px] text-gray-400 dark:text-white/30 mt-1">confidence: {cd.confidence}</div>}

                {cd.handled === 'accepted' && (
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">✓ Added to page</div>
                )}
                {cd.handled === 'dismissed' && (
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-400 dark:text-white/40 italic">Dismissed</div>
                )}
                {!resolved && cd.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => onAcceptCard(placement, cd)}
                      disabled={thisBusy}
                      className="px-2 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                    >{thisBusy ? 'Adding…' : 'Add to page'}</button>
                    <button
                      onClick={() => onDismissCard(placement, cd)}
                      disabled={thisBusy}
                      className="px-2 py-1 text-xs rounded border border-gray-400 dark:border-white/[0.15] text-gray-700 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50"
                    >Dismiss</button>
                    {thisErr && <span className="text-xs text-red-400">{thisErr}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {renderNarrative()}
      {renderProposedCards()}
    </div>
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
  // P4a-2b: accept/keep in-flight + error, keyed by cellKey (pipeline_id) so the spinner and
  // the error text show only on the cell being acted on.
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<{ key: string; msg: string } | null>(null)
  // P4c-2b-iii: per-CARD accept/dismiss state, keyed on the card's uuid (not pipeline_id — cards
  // are finer-grained than cells). cardError carries the card id + message; evictState holds the
  // open eviction picker (null = closed) when a target cell is already at its 12-card ceiling.
  const [cardBusy, setCardBusy] = useState<string | null>(null)
  const [cardError, setCardError] = useState<{ id: string; msg: string } | null>(null)
  const [evictState, setEvictState] = useState<{ card: ProposedCard; placement: Placement; victims: CellCard[] } | null>(null)

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
  // (at least one geography has a 'ready' proposal), hasCards (P4c-2a: at least one
  // geography carries proposed_cards[] — INDEPENDENT of narrative status, so a 'nochange'
  // cell with cards still flags), and the placement count.
  const sectionState = useMemo(() => {
    const m: Record<string, { touched: boolean; ready: boolean; hasCards: boolean; count: number }> = {}
    for (const sec of SECTION_ORDER) m[sec] = { touched: false, ready: false, hasCards: false, count: 0 }
    for (const p of selected?.placements ?? []) {
      const sec = p.section ?? ''
      if (!sec || !(sec in m)) continue
      m[sec].touched = true
      m[sec].count++
      const prop = parseProposal(p.proposal_json)
      if (prop?.status === 'ready') m[sec].ready = true
      if (Array.isArray(prop?.proposed_cards) && prop.proposed_cards.length > 0) m[sec].hasCards = true
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
  //
  // P4c-2b-iii: this effect is keyed on `grouped`, which gets a FRESH reference on every
  // background reload (accept/dismiss/keep/poll all call load() -> setRows -> new array -> the
  // useMemo recomputes). Without a guard it re-lands the rail on `firstLandable` (Systems) after
  // every card/narrative action, yanking the user off the section they are reviewing. The ref
  // pins the landing to ONCE per source SELECTION: we only land when landedForRef !== the current
  // source id, and we set the ref only after a successful land (src present). A mere reload of the
  // SAME source is now a no-op here — the rail stays where the user left it.
  const landedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedArticleId) return
    if (landedForRef.current === selectedArticleId) return   // same source, just a reload reref — don't re-land
    const src = grouped.find(g => g.article_id === selectedArticleId)
    if (!src) return   // data not in yet; ref stays unset so we land once it arrives
    landedForRef.current = selectedArticleId
    const touched: Record<string, boolean> = {}, ready: Record<string, boolean> = {}, hasCards: Record<string, boolean> = {}
    for (const p of src.placements) {
      const sec = p.section ?? ''
      if (!sec) continue
      touched[sec] = true
      const prop = parseProposal(p.proposal_json)
      if (prop?.status === 'ready') ready[sec] = true
      // P4c-2a: a card-only cell (nochange narrative + proposed cards) is a valid landing target.
      if (Array.isArray(prop?.proposed_cards) && prop.proposed_cards.length > 0) hasCards[sec] = true
    }
    // First section worth landing on = a 'ready' edit OR proposed cards. Incident precedence
    // (below) is unchanged: the sentinel wins only when NO section is landable.
    const firstLandable = SECTION_ORDER.find(s => ready[s] || hasCards[s])
    let isIncident = false
    try { isIncident = resolveIncident(src.analysis_json ? JSON.parse(src.analysis_json) : {}).isIncident } catch { isIncident = false }
    setActiveSection(
      !firstLandable && isIncident
        ? INCIDENTS_VIEW
        : (firstLandable ?? SECTION_ORDER.find(s => touched[s]) ?? SECTION_ORDER[0]),
    )
    setShowFullSource(false)
    setShowArticleText(false)
  }, [selectedArticleId, grouped])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }

  // P4a-2b: accept a cell's proposed edit → ② acceptProposal (versioned write + change-record +
  // terminal flip). article_id comes from the SELECTED source and info_page IS pageId — neither
  // lives on Placement (it carries only pipeline_id/section/geography/proposal_json). section_key
  // is the placement's `section` (NS-2 column). On success, load() refetches; the proposal is now
  // 'accepted', so this cell's box hits the terminal branch and the diff collapses.
  const handleAccept = async (placement: Placement) => {
    const proposal = parseProposal(placement.proposal_json)
    if (!proposal || proposal.status !== 'ready') return
    const key = cellKey(placement)
    const articleId = selected?.article_id
    if (!articleId) { setActionError({ key, msg: 'No source selected' }); return }
    setActionError(null); setActionBusy(key)
    try {
      const res = await window.api.publication.acceptProposal({
        article_id: articleId,
        info_page: pageId,
        geography: placement.geography ?? '',
        section_key: placement.section ?? '',
        before_body: proposal.original_body ?? null,
        after_body: proposal.proposed_body ?? '',
        divergence: !!proposal.divergence,
        divergence_reasoning: proposal.divergence_reasoning ?? null,
      })
      if (!res?.ok) { setActionError({ key, msg: res?.error ?? 'Accept failed' }); return }
      await load({ background: true })   // silent refetch — no spinner remount / scroll-jump (see card handlers)
    } catch (e) {
      setActionError({ key, msg: e instanceof Error ? e.message : 'Accept failed' })
    } finally {
      setActionBusy(null)
    }
  }

  // Keep original → ② keepProposal (terminal flip only, no section write / no change-record).
  const handleKeep = async (placement: Placement) => {
    const key = cellKey(placement)
    const articleId = selected?.article_id
    if (!articleId) { setActionError({ key, msg: 'No source selected' }); return }
    setActionError(null); setActionBusy(key)
    try {
      const res = await window.api.publication.keepProposal({
        article_id: articleId,
        info_page: pageId,
        geography: placement.geography ?? '',
        section_key: placement.section ?? '',
      })
      if (!res?.ok) { setActionError({ key, msg: res?.error ?? 'Keep failed' }); return }
      await load({ background: true })   // silent refetch — no spinner remount / scroll-jump (see card handlers)
    } catch (e) {
      setActionError({ key, msg: e instanceof Error ? e.message : 'Keep failed' })
    } finally {
      setActionBusy(null)
    }
  }

  // P4c-2b-iii: accept a proposed card -> ② acceptCard (write to cards table + publication_changes
  // action='card' + per-card handled='accepted' flip). Mirrors handleAccept's threading:
  // article_id from the selected source, info_page IS pageId, geography/section from the placement.
  // If the target cell is at its 12-card ceiling the writer returns { full: true } (NOT an error) —
  // we then fetch the cell's live cards and open the eviction picker; the retry passes victim_id.
  const handleAcceptCard = async (placement: Placement, card: ProposedCard, victimId?: number) => {
    if (!card.id) return
    const articleId = selected?.article_id
    if (!articleId) { setCardError({ id: card.id, msg: 'No source selected' }); return }
    setCardError(null); setCardBusy(card.id)
    try {
      const res = await window.api.publication.acceptCard({
        article_id: articleId,
        info_page: pageId,
        geography: placement.geography ?? '',
        section_key: placement.section ?? '',
        card_id: card.id,
        headline: card.headline,
        detail: card.detail,
        confidence: card.confidence,
        victim_id: victimId,
      })
      if (res?.full) {
        // Cell full — load its live cards and open the picker. Do NOT surface as an error.
        const cells = await window.api.publication.getCellCards({
          geography: placement.geography ?? '',
          section_key: placement.section ?? '',
        })
        if (!cells?.ok) { setCardError({ id: card.id, msg: cells?.error ?? 'Could not load cards to replace' }); return }
        setEvictState({ card, placement, victims: cells.cards ?? [] })
        return
      }
      if (!res?.ok) { setCardError({ id: card.id, msg: res?.error ?? 'Accept failed' }); return }
      // Background reload (no spinner) so the tile flips to its terminal chip WITHOUT remounting
      // the canvas — the plain load() early-returns to the spinner, resetting scroll + jumping the
      // active section back to Systems (the P3 scroll-jump). {background:true} refetches silently.
      await load({ background: true })
    } catch (e) {
      setCardError({ id: card.id, msg: e instanceof Error ? e.message : 'Accept failed' })
    } finally {
      setCardBusy(null)
    }
  }

  // Dismiss a proposed card -> ② dismissCard (per-card handled='dismissed' flip only, no writes).
  const handleDismissCard = async (placement: Placement, card: ProposedCard) => {
    if (!card.id) return
    const articleId = selected?.article_id
    if (!articleId) { setCardError({ id: card.id, msg: 'No source selected' }); return }
    setCardError(null); setCardBusy(card.id)
    try {
      const res = await window.api.publication.dismissCard({
        article_id: articleId,
        info_page: pageId,
        geography: placement.geography ?? '',
        section_key: placement.section ?? '',
        card_id: card.id,
      })
      if (!res?.ok) { setCardError({ id: card.id, msg: res?.error ?? 'Dismiss failed' }); return }
      await load({ background: true })   // silent refetch — see handleAcceptCard (no scroll-jump)
    } catch (e) {
      setCardError({ id: card.id, msg: e instanceof Error ? e.message : 'Dismiss failed' })
    } finally {
      setCardBusy(null)
    }
  }

  // Eviction picker resolves -> close it, then retry the accept with the chosen victim's DB id.
  const handleEvictPick = async (victimId: number) => {
    if (!evictState) return
    const { card, placement } = evictState
    setEvictState(null)
    await handleAcceptCard(placement, card, victimId)
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

      {/* P4c-2b-iii: the EVICTION PICKER. Opens when acceptCard returns { full: true } — the
          target cell is at its 12-card ceiling, so the user must pick one live card to replace.
          Review-local state (evictState) reimplemented here, NOT imported from CardsBox (whose
          picker is tangled into its own grid state — same call we made for the incidents sentinel).
          Picking a victim retries the accept with victim_id (-> replaceCard); Cancel closes. */}
      {evictState && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => setEvictState(null)}>
          <div
            className="w-full max-w-2xl max-h-[80%] overflow-y-auto rounded-2xl border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-gray-900 shadow-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Cell is full — choose a card to replace</h3>
                <p className="text-xs text-gray-500 dark:text-white/50 mt-1">
                  This cell already has {evictState.victims.length} cards. Pick one to replace with{' '}
                  <span className="font-semibold text-gray-700 dark:text-white/80">“{evictState.card.headline}”</span>.
                </p>
              </div>
              <button
                onClick={() => setEvictState(null)}
                className="shrink-0 px-2 py-1 text-xs rounded border border-gray-300 dark:border-white/[0.15] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06]"
              >Cancel</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {evictState.victims.map(v => (
                <button
                  key={v.id}
                  onClick={() => handleEvictPick(v.id)}
                  className="text-left rounded-lg border border-gray-200 dark:border-white/[0.12] bg-gray-50/60 dark:bg-white/[0.02] px-3 py-2 hover:border-red-300 dark:hover:border-red-500/40 hover:bg-red-50/40 dark:hover:bg-red-500/[0.06] transition"
                >
                  <div className="text-sm font-bold leading-snug text-gray-900 dark:text-white/85">{v.headline}</div>
                  {v.detail && <div className="text-[12px] leading-snug text-gray-600 dark:text-white/55 mt-0.5">{v.detail}</div>}
                  {v.confidence && <div className="text-[10px] text-gray-400 dark:text-white/30 mt-1">confidence: {v.confidence}</div>}
                </button>
              ))}
            </div>
          </div>
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
            // Dimmed unless the source proposes a change here: a 'ready' narrative edit OR
            // (P4c-2a) proposed cards for this cell (a card-only 'nochange' cell still lights).
            const lit = st.touched && (st.ready || st.hasCards)
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
                    activeCells.map(p => {
                      const key = cellKey(p)
                      return (
                        <CellProposal
                          key={p.pipeline_id}
                          placement={p}
                          busy={actionBusy === key}
                          cellError={actionError?.key === key ? actionError.msg : null}
                          onAccept={handleAccept}
                          onKeep={handleKeep}
                          cardBusy={cardBusy}
                          cardError={cardError}
                          onAcceptCard={handleAcceptCard}
                          onDismissCard={handleDismissCard}
                        />
                      )
                    })
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
