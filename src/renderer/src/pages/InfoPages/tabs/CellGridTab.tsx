import { useState, useEffect, useCallback, useMemo } from 'react'
import { SECTION_LABELS, sectionLabel } from '../../Intelligence/sectionLabels'
import { sectionColor } from '../../Intelligence/sectionColors'
import { Box } from './cellPrimitives'

interface Props {
  // publication tables are global CS data — no board/page column yet; pageId
  // accepted for tab-shape consistency, intentionally unused in P1.
  pageId: string
}

// P1b — read-only publication cell GRID. Consumes window.api.publication.getGrid()
// (the P1a cloud-direct read), shapes the four flat table arrays into cells keyed
// (geography x section_key), and renders the approved mockup layout: geography tabs
// across the top, a 9-section rail on the left, and a canvas of four content boxes.
// Read-only: no edit controls, no mutations — editing is P2. App palette (indigo/
// gray); the ONLY thing lifted from the mockup is the per-section accent color.

// Supplier-axis geographies — the documented §04/§05 re-index debt, bucketed
// separately so that debt is VISIBLE rather than mixed into the LATAM grid.
const SUPPLIER_AXIS_GEOS = new Set([
  'United States', 'China', 'GLOBAL', 'Ukraine', 'Israel', 'Lebanon', 'Syria', 'Turkey', 'Costa Rica',
])

// Loose row aliases — P1a returns untyped any[]; the columns we read are stable.
type Row = Record<string, any>

interface Cell {
  geography: string
  section_key: string
  narrative?: string
  cards: Row[]
  items: Row[]
  citations: Row[]
}

const SECTION_ORDER = Object.keys(SECTION_LABELS)   // canonical 9, in display order

// Slice 3: the incidents feed is a 10th rail entry but NOT a (geo x section) cell —
// it's a per-geography feed keyed on country. A sentinel activeSection value marks it,
// deliberately kept OUT of SECTION_ORDER so none of the section-cell machinery (getCell,
// the auto-jump-to-first-populated search) ever treats it as a real section.
const INCIDENTS_VIEW = '__incidents__'
const INCIDENTS_COLOR = '#f43f5e'   // rose-500 — distinct from the 9 section accents

const cellKey = (geography: string, section_key: string) => `${geography}|${section_key}`
// Sentinel-guarded: the incidents view has no SECTION_ORDER index, so give it a glyph
// rather than "00" (indexOf → -1). Real keys are unchanged.
const sectionNo = (key: string) => key === INCIDENTS_VIEW ? '⚠' : String(SECTION_ORDER.indexOf(key) + 1).padStart(2, '0')

// number of the four content types present in a cell (0–4)
function typeCount(c?: Cell): number {
  if (!c) return 0
  return (c.narrative ? 1 : 0) + (c.cards.length ? 1 : 0) + (c.items.length ? 1 : 0) + (c.citations.length ? 1 : 0)
}

// REGIONAL first, then everything else alphabetically.
function geoSort(a: string, b: string): number {
  if (a === 'REGIONAL') return -1
  if (b === 'REGIONAL') return 1
  return a.localeCompare(b)
}
const geoLabel = (g: string) => (g === 'REGIONAL' ? 'ALL LATAM' : g)

export default function CellGridTab({ pageId }: Props) {
  void pageId   // intentionally unused (see Props comment)

  const [grid, setGrid] = useState<{ section_texts: Row[]; cards: Row[]; section_items: Row[]; section_citations: Row[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeGeo, setActiveGeo] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>(SECTION_ORDER[0])

  // Persisted, drag-resizable section-rail width (px). Lazy-init from localStorage,
  // clamped on read so a corrupt/out-of-range stored value can't break the rail.
  // Default 208 = today's w-52. Drag idiom ported from Workspace's archived drawer.
  const [railWidth, setRailWidth] = useState(() => {
    const v = parseInt(localStorage.getItem('infopages-cellgrid-rail-width') || '', 10)
    return Number.isFinite(v) ? Math.max(56, Math.min(v, 280)) : 208
  })
  const compact = railWidth < 120

  // Slice 3: incident feed for the active geography. Loaded lazily — only fetched while
  // the Incidents rail entry is selected, refetched when the geography changes under it.
  // Read-only; cloud-direct via getIncidents (which applies the same board gate as getGrid).
  const [incidents, setIncidents] = useState<Row[]>([])
  const [incLoading, setIncLoading] = useState(false)
  const [incError, setIncError] = useState<string | null>(null)

  // Foreground load (tab open) flips to the spinner; a background reload (post-write)
  // refetches WITHOUT touching `loading`, so the canvas subtree stays mounted and its
  // scrollTop survives. The {background:true} pattern — the write already succeeded, so
  // a background refetch failure is logged, not surfaced as a canvas-blanking error.
  const load = useCallback(async (opts?: { background?: boolean }) => {
    if (!opts?.background) setLoading(true)
    setError(null)
    try {
      setGrid(await window.api.publication.getGrid())
    } catch (e) {
      console.error(e)
      if (!opts?.background) setError('Could not load published content.')
    }
    if (!opts?.background) setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── shape the four flat arrays into a cell map + geography buckets ──────────
  const { cells, mainGeos, supplierGeos, total } = useMemo(() => {
    const cells = new Map<string, Cell>()
    if (!grid) return { cells, mainGeos: [] as string[], supplierGeos: [] as string[], total: 0 }

    const ensure = (geography: string, section_key: string): Cell => {
      const k = cellKey(geography, section_key)
      let c = cells.get(k)
      if (!c) { c = { geography, section_key, cards: [], items: [], citations: [] }; cells.set(k, c) }
      return c
    }
    for (const r of grid.section_texts) {
      const body = (r.body ?? '').toString()
      if (body.trim()) ensure(r.geography, r.section_key).narrative = body
    }
    for (const r of grid.cards)             ensure(r.geography, r.section_key).cards.push(r)
    for (const r of grid.section_items)     ensure(r.geography, r.section_key).items.push(r)
    for (const r of grid.section_citations) ensure(r.geography, r.section_key).citations.push(r)

    const geoSet = new Set<string>()
    for (const c of cells.values()) if (typeCount(c) > 0) geoSet.add(c.geography)
    const all = [...geoSet]
    const mainGeos = all.filter(g => !SUPPLIER_AXIS_GEOS.has(g)).sort(geoSort)
    const supplierGeos = all.filter(g => SUPPLIER_AXIS_GEOS.has(g)).sort(geoSort)
    return { cells, mainGeos, supplierGeos, total: cells.size }
  }, [grid])

  const getCell = useCallback((geo: string | null, sec: string): Cell | undefined =>
    (geo ? cells.get(cellKey(geo, sec)) : undefined), [cells])

  const popCount = useCallback((geo: string): number =>
    SECTION_ORDER.reduce((n, s) => n + (typeCount(cells.get(cellKey(geo, s))) > 0 ? 1 : 0), 0), [cells])

  // Initial selection once data lands: first geography (REGIONAL) + its first populated section.
  useEffect(() => {
    if (activeGeo || !mainGeos.length && !supplierGeos.length) return
    const geo = (mainGeos[0] ?? supplierGeos[0])
    setActiveGeo(geo)
    const first = SECTION_ORDER.find(s => typeCount(cells.get(cellKey(geo, s))) > 0) ?? SECTION_ORDER[0]
    setActiveSection(first)
  }, [activeGeo, mainGeos, supplierGeos, cells])

  // Slice 3: fetch the incident feed for a geography. Read-only, cloud-direct. Guards a
  // null geo. Returns a promise so Retry can await it; the effect owns staleness dropping.
  const loadIncidents = useCallback(async (geo: string | null) => {
    if (!geo) return
    setIncLoading(true); setIncError(null)
    try {
      setIncidents(await window.api.publication.getIncidents(geo) as Row[])
    } catch (e) {
      console.error(e)
      setIncError('Could not load incidents.')
    }
    setIncLoading(false)
  }, [])

  // Load (and reload on geo change) only while the Incidents view is open. The cancelled
  // flag drops a stale response if the geography changes mid-flight.
  useEffect(() => {
    if (activeSection !== INCIDENTS_VIEW || !activeGeo) return
    let cancelled = false
    setIncLoading(true); setIncError(null)
    window.api.publication.getIncidents(activeGeo)
      .then(rows => { if (!cancelled) setIncidents(rows as Row[]) })
      .catch(e => { console.error(e); if (!cancelled) setIncError('Could not load incidents.') })
      .finally(() => { if (!cancelled) setIncLoading(false) })
    return () => { cancelled = true }
  }, [activeSection, activeGeo])

  // Geo switch: if the current section is empty in the new geography, jump to that
  // geography's first populated section (never land on a blank cell after switching).
  function selectGeo(geo: string) {
    setActiveGeo(geo)
    // Slice 3: in the Incidents view, STAY on incidents across geo switches (the feed
    // refetches for the new geo) — EXCEPT supplier-axis geos, which have no incidents
    // entry, so bounce to a real section there.
    if (activeSection === INCIDENTS_VIEW) {
      if (SUPPLIER_AXIS_GEOS.has(geo)) {
        const first = SECTION_ORDER.find(s => typeCount(getCell(geo, s)) > 0) ?? SECTION_ORDER[0]
        setActiveSection(first)
      }
      return
    }
    if (typeCount(getCell(geo, activeSection)) === 0) {
      const first = SECTION_ORDER.find(s => typeCount(getCell(geo, s)) > 0)
      if (first) setActiveSection(first)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/></div>

  if (error) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-red-500 dark:text-red-400">{error}</p>
      <button onClick={() => load()} className="mt-2 text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition">Retry</button>
    </div>
  )

  if (total === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-gray-500 dark:text-white/40">No published content</p>
      <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Seeded page content appears here once available for this project</p>
    </div>
  )

  const activeCell = getCell(activeGeo, activeSection)
  // Slice 3: the Incidents rail entry shows only for LATAM geos + REGIONAL, never for the
  // supplier-axis geos (they're re-index debt with no incident home — per the feed decision).
  const incidentsVisible = activeGeo != null && !SUPPLIER_AXIS_GEOS.has(activeGeo)
  const isIncidentsView = activeSection === INCIDENTS_VIEW

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* A. GEOGRAPHY TAB BAR */}
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.06] flex flex-wrap items-center gap-1.5">
        {mainGeos.map(g => <GeoTab key={g} geo={g} active={g === activeGeo} count={popCount(g)} onClick={() => selectGeo(g)} />)}
        {supplierGeos.length > 0 && (
          <>
            <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-white/10" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-500/70 dark:text-amber-300/50 mr-0.5">supplier axis · pending re-index</span>
            {supplierGeos.map(g => <GeoTab key={g} geo={g} active={g === activeGeo} count={popCount(g)} onClick={() => selectGeo(g)} supplier />)}
          </>
        )}
      </div>

      {/* B. TWO-COLUMN FRAME */}
      <div className="flex-1 flex overflow-hidden">
        {/* C. SECTION RAIL — drag-resizable width (see railWidth) */}
        <div className="shrink-0 border-r border-gray-100 dark:border-white/[0.06] overflow-y-auto py-2" style={{ width: railWidth }}>
          {SECTION_ORDER.map(sec => {
            const c = getCell(activeGeo, sec)
            const n = typeCount(c)
            const active = sec === activeSection
            const color = sectionColor(sec)
            return (
              <button
                key={sec}
                onClick={() => setActiveSection(sec)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left border-l-2 transition ${compact ? 'justify-center' : ''} ${
                  active
                    ? 'bg-gray-50 dark:bg-white/[0.05] text-gray-900 dark:text-white'
                    : 'border-l-transparent text-gray-600 dark:text-white/60 hover:bg-gray-50/60 dark:hover:bg-white/[0.03]'
                } ${n === 0 ? 'opacity-40' : ''}`}
                style={active ? { borderLeftColor: color } : undefined}
                title={compact ? sectionLabel(sec) : undefined}
              >
                <span className="text-[10px] font-mono tabular-nums text-gray-400 dark:text-white/30">{sectionNo(sec)}</span>
                {!compact && <span className="flex-1 text-xs font-medium truncate">{sectionLabel(sec)}</span>}
                {!compact && n > 0 && <span className="text-[10px] text-gray-400 dark:text-white/30">{n}</span>}
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: n > 0 ? color : 'transparent', boxShadow: n > 0 ? undefined : 'inset 0 0 0 1px rgba(148,163,184,.4)' }} />
              </button>
            )
          })}

          {/* Slice 3: INCIDENTS — the 10th rail entry. A geography feed, not a (geo x
              section) cell, so it lives OUTSIDE the SECTION_ORDER map. Shown only for
              LATAM geos + REGIONAL; selecting it flips activeSection to the sentinel.
              Its count is the loaded feed length (only known while the view is open). */}
          {incidentsVisible && (
            <button
              onClick={() => setActiveSection(INCIDENTS_VIEW)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left border-l-2 mt-1 transition ${compact ? 'justify-center' : ''} ${
                isIncidentsView
                  ? 'bg-gray-50 dark:bg-white/[0.05] text-gray-900 dark:text-white'
                  : 'border-l-transparent text-gray-600 dark:text-white/60 hover:bg-gray-50/60 dark:hover:bg-white/[0.03]'
              }`}
              style={isIncidentsView ? { borderLeftColor: INCIDENTS_COLOR } : undefined}
              title={compact ? 'Incidents' : undefined}
            >
              <span className="text-[10px] leading-none" style={{ color: INCIDENTS_COLOR }}>⚠</span>
              {!compact && <span className="flex-1 text-xs font-medium truncate">Incidents</span>}
              {!compact && isIncidentsView && !incLoading && <span className="text-[10px] text-gray-400 dark:text-white/30">{incidents.length}</span>}
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: INCIDENTS_COLOR, opacity: isIncidentsView ? 1 : 0.5 }} />
            </button>
          )}
        </div>

        {/* Drag handle — resizes the rail; canvas (flex-1) reflows automatically.
            Ported from Workspace's archived-drawer resize, horizontal. Persists on
            release only (mouseup), not per-move, to avoid localStorage hammering. */}
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-indigo-400/30 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startW = railWidth
            const onMove = (ev: MouseEvent) => {
              const next = startW + (ev.clientX - startX)
              setRailWidth(Math.max(56, Math.min(next, 280)))
            }
            const onUp = () => {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp)
              // read-current-value setter: persist the final width without a stale closure
              setRailWidth(w => { localStorage.setItem('infopages-cellgrid-rail-width', String(w)); return w })
            }
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
          }}
        />

        {/* D. CANVAS */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isIncidentsView ? (
            <IncidentsFeed
              geoLabel={geoLabel(activeGeo ?? '')}
              rows={incidents}
              loading={incLoading}
              error={incError}
              onRetry={() => loadIncidents(activeGeo)}
            />
          ) : (
          <>
          {/* header */}
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-sm font-mono font-bold tabular-nums" style={{ color: sectionColor(activeSection) }}>{sectionNo(activeSection)}</span>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{sectionLabel(activeSection)}</h2>
            <span className="text-sm text-gray-400 dark:text-white/30">·</span>
            <span className="text-sm text-gray-500 dark:text-white/50">{geoLabel(activeGeo ?? '')}</span>
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/40">read-only</span>
          </div>

          {typeCount(activeCell) === 0 ? (
            <p className="text-sm text-gray-400 dark:text-white/30 py-8 text-center">No published content in this cell.</p>
          ) : (
            <div className="space-y-3">
              <SectionTextBox
                key={`text-${activeGeo}-${activeSection}`}
                body={activeCell?.narrative}
                color={sectionColor(activeSection)}
                geography={activeGeo ?? ''}
                sectionKey={activeSection}
                onSaved={() => load({ background: true })}
              />
              <CardsBox
                key={`cards-${activeGeo}-${activeSection}`}
                cards={activeCell?.cards ?? []}
                color={sectionColor(activeSection)}
                geography={activeGeo ?? ''}
                sectionKey={activeSection}
                onSaved={() => load({ background: true })}
              />
              <OutlineBox items={activeCell?.items ?? []} color={sectionColor(activeSection)} />
              <CitationsBox citations={activeCell?.citations ?? []} geography={activeGeo ?? ''} color={sectionColor(activeSection)} />
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── geography tab ─────────────────────────────────────────────────────────────
function GeoTab({ geo, active, count, onClick, supplier }: { geo: string; active: boolean; count: number; onClick: () => void; supplier?: boolean }) {
  const base = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition whitespace-nowrap'
  const cls = active
    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10'
    : supplier
      ? 'border-transparent text-amber-600/70 dark:text-amber-300/50 hover:bg-amber-50 dark:hover:bg-amber-500/[0.06]'
      : 'border-transparent text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.05]'
  return (
    <button onClick={onClick} className={`${base} ${cls}`}>
      {geoLabel(geo)}
      <span className={`text-[10px] ${active ? 'text-indigo-400 dark:text-indigo-300/70' : 'text-gray-400 dark:text-white/30'}`}>{count}</span>
    </button>
  )
}

// Box shell extracted to ./cellPrimitives (P4a-2a) — imported above, shared with the
// Pre-Commit Review diff view. Behavior unchanged.

// 1. NARRATIVE — prose, paragraphs split on blank lines. Omitted if absent.
// P2: editable (Head-gated server-side). Edit swaps prose → textarea; Save writes a
// NEW section_texts version via publication.writeSection, then re-loads the grid so
// the new version renders. Save failures (incl. the server's non-Head "Not authorized")
// surface inline — never silently swallowed. lang hardcoded 'en' (P1 English-only).
// The parent keys this box by cell, so switching cells remounts it and resets edit state.
function SectionTextBox({ body, color, geography, sectionKey, onSaved }: {
  body?: string; color: string; geography: string; sectionKey: string; onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit affordance only where narrative exists (adding text to an empty cell is a
  // later slice — this box is omitted entirely when the cell has no narrative).
  if (!body || !body.trim()) return null

  const startEdit = () => { setDraft(body); setError(null); setEditing(true) }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const res = await window.api.publication.writeSection({ geography, section_key: sectionKey, lang: 'en', body: draft })
      if (res.ok) { setEditing(false); onSaved() }
      else setError(res.error ?? 'Save failed.')
    } catch (e) {
      console.error(e)
      setError('Save failed.')
    }
    setSaving(false)
  }

  const editBtn = editing ? undefined : (
    <button
      onClick={startEdit}
      className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-gray-200 dark:border-white/[0.12] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
    >Edit</button>
  )

  const paragraphs = body.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  return (
    <Box title="Narrative" color={color} action={editBtn}>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={12}
            className="w-full text-[13px] leading-relaxed text-gray-800 dark:text-white/80 bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-y"
          />
          {error && <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white transition"
            >{saving ? 'Saving…' : 'Save'}</button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] disabled:opacity-50 transition"
            >Cancel</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {paragraphs.map((p, i) => <p key={i} className="text-[13px] leading-relaxed text-gray-700 dark:text-white/70">{p}</p>)}
        </div>
      )}
    </Box>
  )
}

// 2. CARDS — tile grid. "N of 12". Omitted if the cell has no cards.
// P3: editable (Head-gated server-side), the 12-slot replace flow. add / edit /
// delete / replace, each a cloud write via window.api.publication.*, then a grid
// reload so the new active set renders. Cards sort by dense `position` rank.
//
// The eviction flow: addCard on a full (12) cell returns { full:true } rather than
// erroring — we stash the typed-but-unsaved draft in `evict` and open a victim
// picker; choosing a card calls replaceCard(victimId, draft) so the user never
// re-types. Like SectionTextBox, adding the FIRST card to an all-empty cell is a
// later slice — the box is omitted when the cell has no cards, so Add appears only
// once a cell already has ≥1 card. All errors surface inline, never swallowed.
type CardDraft = { headline: string; detail: string; confidence: string }
const EMPTY_CARD_DRAFT: CardDraft = { headline: '', detail: '', confidence: '' }

function CardsBox({ cards, color, geography, sectionKey, onSaved }: {
  cards: Row[]; color: string; geography: string; sectionKey: string; onSaved: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState<CardDraft>(EMPTY_CARD_DRAFT)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<CardDraft>(EMPTY_CARD_DRAFT)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [evict, setEvict] = useState<CardDraft | null>(null)   // pending new card awaiting a victim pick
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // dense-position order (P3 makes position meaningful; read order was arbitrary)
  const sorted = [...cards].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (!sorted.length) return null

  const clean = (d: CardDraft) => ({
    headline: d.headline.trim(),
    detail: d.detail.trim() || undefined,
    confidence: d.confidence.trim() || undefined,
  })

  const submitAdd = async () => {
    if (!addDraft.headline.trim()) { setError('Headline is required.'); return }
    setBusy(true); setError(null)
    try {
      const res = await window.api.publication.addCard({ geography, section_key: sectionKey, ...clean(addDraft) })
      if (res.ok) { setAdding(false); setAddDraft(EMPTY_CARD_DRAFT); onSaved() }
      else if (res.full) { setEvict(addDraft); setAdding(false) }   // preserve the draft; open the picker
      else setError(res.error ?? 'Add failed.')
    } catch (e) { console.error(e); setError('Add failed.') }
    setBusy(false)
  }

  const submitEdit = async () => {
    if (editingId == null) return
    if (!editDraft.headline.trim()) { setError('Headline is required.'); return }
    setBusy(true); setError(null)
    try {
      const res = await window.api.publication.editCard({ id: editingId, ...clean(editDraft) })
      if (res.ok) { setEditingId(null); onSaved() }
      else setError(res.error ?? 'Edit failed.')
    } catch (e) { console.error(e); setError('Edit failed.') }
    setBusy(false)
  }

  const submitDelete = async (id: number) => {
    setBusy(true); setError(null)
    try {
      const res = await window.api.publication.deleteCard({ id })
      if (res.ok) { setConfirmDeleteId(null); onSaved() }
      else setError(res.error ?? 'Delete failed.')
    } catch (e) { console.error(e); setError('Delete failed.') }
    setBusy(false)
  }

  const submitReplace = async (victimId: number) => {
    if (!evict) return
    setBusy(true); setError(null)
    try {
      const res = await window.api.publication.replaceCard({ victimId, ...clean(evict) })
      if (res.ok) { setEvict(null); onSaved() }
      else setError(res.error ?? 'Replace failed.')
    } catch (e) { console.error(e); setError('Replace failed.') }
    setBusy(false)
  }

  // "Add card" header affordance — hidden while any inline flow is open.
  const addBtn = (adding || editingId != null || evict) ? undefined : (
    <button
      onClick={() => { setError(null); setAddDraft(EMPTY_CARD_DRAFT); setAdding(true) }}
      className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-gray-200 dark:border-white/[0.12] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
    >Add card</button>
  )

  return (
    <Box title="Figures" meta={`${sorted.length} of 12`} color={color} action={addBtn}>
      {/* EVICTION PICKER — full cell; pick a card to replace with the pending draft */}
      {evict ? (
        <div className="space-y-2">
          <p className="text-[12px] text-gray-600 dark:text-white/60">
            This cell has 12 cards. Choose one to replace with <span className="font-semibold text-gray-800 dark:text-white/80">“{evict.headline.trim() || '(untitled)'}”</span>:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sorted.map(cd => (
              <button
                key={cd.id}
                onClick={() => submitReplace(cd.id)}
                disabled={busy}
                className="text-left rounded-lg border border-l-2 border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] px-3 py-2 hover:border-red-300 dark:hover:border-red-400/40 hover:bg-red-50/40 dark:hover:bg-red-500/[0.06] disabled:opacity-50 transition"
                style={{ borderLeftColor: color }}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] font-mono tabular-nums text-gray-400 dark:text-white/30">{cd.position}</span>
                  <span className="text-sm font-bold leading-snug text-gray-900 dark:text-white/85">{cd.headline}</span>
                </div>
                {cd.detail && <div className="text-[12px] leading-snug text-gray-600 dark:text-white/55 mt-0.5">{cd.detail}</div>}
              </button>
            ))}
          </div>
          {error && <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>}
          <button
            onClick={() => { setEvict(null); setError(null) }}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] disabled:opacity-50 transition"
          >Cancel</button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sorted.map(cd => (
              <div key={cd.id} className="rounded-lg border border-l-2 border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] px-3 py-2" style={{ borderLeftColor: color }}>
                {editingId === cd.id ? (
                  <CardForm draft={editDraft} setDraft={setEditDraft} onSubmit={submitEdit} onCancel={() => { setEditingId(null); setError(null) }} busy={busy} submitLabel="Save" />
                ) : confirmDeleteId === cd.id ? (
                  <div className="space-y-1.5">
                    <div className="text-sm font-bold leading-snug text-gray-900 dark:text-white/85">{cd.headline}</div>
                    <p className="text-[12px] text-red-500 dark:text-red-400">Delete this card?</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => submitDelete(cd.id)} disabled={busy} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white transition">{busy ? '…' : 'Delete'}</button>
                      <button onClick={() => setConfirmDeleteId(null)} disabled={busy} className="text-xs font-medium px-2.5 py-1 rounded-lg text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] disabled:opacity-50 transition">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="group/card">
                    <div className="text-sm font-bold leading-snug text-gray-900 dark:text-white/85">{cd.headline}</div>
                    {cd.detail && <div className="text-[12px] leading-snug text-gray-600 dark:text-white/55 mt-0.5">{cd.detail}</div>}
                    {cd.confidence && <div className="text-[10px] text-gray-400 dark:text-white/30 mt-1">confidence: {cd.confidence}</div>}
                    <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover/card:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingId(cd.id); setEditDraft({ headline: cd.headline ?? '', detail: cd.detail ?? '', confidence: cd.confidence ?? '' }); setError(null) }}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-gray-200 dark:border-white/[0.12] text-gray-500 dark:text-white/50 hover:bg-white dark:hover:bg-white/[0.06] transition"
                      >Edit</button>
                      <button
                        onClick={() => { setConfirmDeleteId(cd.id); setError(null) }}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-gray-200 dark:border-white/[0.12] text-gray-500 dark:text-white/50 hover:bg-red-50 dark:hover:bg-red-500/[0.08] hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-400/30 transition"
                      >Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* inline ADD form */}
          {adding && (
            <div className="rounded-lg border border-dashed border-gray-200 dark:border-white/[0.1] px-3 py-2.5">
              <CardForm draft={addDraft} setDraft={setAddDraft} onSubmit={submitAdd} onCancel={() => { setAdding(false); setError(null) }} busy={busy} submitLabel="Add" />
            </div>
          )}

          {/* errors from add / edit / delete (eviction has its own inline error above) */}
          {error && !editingId && confirmDeleteId == null && <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>}
        </div>
      )}
    </Box>
  )
}

// Shared card add/edit form — headline required, detail + confidence optional.
function CardForm({ draft, setDraft, onSubmit, onCancel, busy, submitLabel }: {
  draft: CardDraft; setDraft: (d: CardDraft) => void; onSubmit: () => void; onCancel: () => void; busy: boolean; submitLabel: string
}) {
  const input = 'w-full text-[13px] text-gray-800 dark:text-white/80 bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.1] rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400'
  return (
    <div className="space-y-1.5">
      <input value={draft.headline} onChange={e => setDraft({ ...draft, headline: e.target.value })} placeholder="Headline (required)" className={`${input} font-semibold`} />
      <textarea value={draft.detail} onChange={e => setDraft({ ...draft, detail: e.target.value })} rows={2} placeholder="Detail (optional)" className={`${input} resize-y`} />
      <input value={draft.confidence} onChange={e => setDraft({ ...draft, confidence: e.target.value })} placeholder="Confidence (optional)" className={input} />
      <div className="flex items-center gap-2 pt-0.5">
        <button onClick={onSubmit} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white transition">{busy ? 'Saving…' : submitLabel}</button>
        <button onClick={onCancel} disabled={busy} className="text-xs font-medium px-3 py-1.5 rounded-lg text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] disabled:opacity-50 transition">Cancel</button>
      </div>
    </div>
  )
}

// 3. OUTLINE — items grouped by heading; label + status chip + detail + attr chips.
function OutlineBox({ items, color }: { items: Row[]; color: string }) {
  if (!items.length) return null
  const groups: [string, Row[]][] = []
  const idx = new Map<string, Row[]>()
  for (const it of items) {
    const h = (it.heading ?? '').toString() || '—'
    if (!idx.has(h)) { const arr: Row[] = []; idx.set(h, arr); groups.push([h, arr]) }
    idx.get(h)!.push(it)
  }
  return (
    <Box title="Outline" meta={`${items.length} items`} color={color}>
      <div className="space-y-3">
        {groups.map(([heading, list], gi) => (
          <div key={gi}>
            {heading !== '—' && <div className="text-[11px] font-semibold text-gray-500 dark:text-white/50 mb-1.5">{heading}</div>}
            <ul className="space-y-2 pl-2 border-l border-gray-100 dark:border-white/[0.06]">
              {list.map((it, i) => (
                <li key={i} className="text-[13px] leading-snug">
                  <span className="font-semibold text-gray-900 dark:text-white/85">{it.label}</span>
                  {it.status && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/50 align-middle">{it.status}</span>}
                  {it.detail && <span className="text-gray-500 dark:text-white/45"> — {it.detail}</span>}
                  {it.attrs && Object.keys(it.attrs).length > 0 && (
                    <span className="inline-flex flex-wrap gap-1 mt-1">
                      {Object.entries(it.attrs as Record<string, unknown>).map(([k, v]) => (
                        <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/50">
                          <span className="text-gray-400 dark:text-white/30">{k}:</span>{String(v)}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Box>
  )
}

// 4. CITATIONS — REGIONAL-only in the seed. Non-REGIONAL cells get a one-line note
// (citations are section-level). REGIONAL with none → omitted.
function CitationsBox({ citations, geography, color }: { citations: Row[]; geography: string; color: string }) {
  const isRegional = geography === 'REGIONAL'
  if (!citations.length) {
    if (isRegional) return null
    return (
      <Box title="Sources" color={color}>
        <p className="text-[12px] text-gray-400 dark:text-white/30">Citations are section-level, stored at REGIONAL only.</p>
      </Box>
    )
  }
  return (
    <Box title="Sources" meta={`${citations.length}`} color={color}>
      <ul className="space-y-1.5">
        {citations.map((ct, i) => (
          <li key={i} className="text-[12px] leading-snug text-gray-500 dark:text-white/45">
            {ct.what}
            {ct.where_ref && <span className="text-gray-400 dark:text-white/30"> · {ct.where_ref}</span>}
          </li>
        ))}
      </ul>
    </Box>
  )
}

// ── Slice 3: INCIDENTS FEED (read-only) ───────────────────────────────────────
// The 10th container rendered in the canvas when the Incidents rail entry is selected.
// A per-geography chronological feed (event_date desc) of the incidents table's rows.
// Read-only: no edit / accept / delete controls (routing incidents is a later slice).
// Verification is a CHECK'd enum on the table (single-source | corroborated | disputed).
const VERIFICATION_STYLE: Record<string, string> = {
  corroborated: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  disputed:     'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'single-source': 'bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/50',
}

function VerificationBadge({ value }: { value: string | null }) {
  const v = (value || 'single-source').toLowerCase()
  const cls = VERIFICATION_STYLE[v] ?? VERIFICATION_STYLE['single-source']
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{v}</span>
}

// A single attribute chip — mirrors OutlineBox's attr-chip visual language.
function IncChip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/50">
      <span className="text-gray-400 dark:text-white/30">{k}:</span>{v}
    </span>
  )
}

function IncidentCard({ inc }: { inc: Row }) {
  const actor = inc.actor
    ? String(inc.actor) + (inc.actor_type ? ` (${inc.actor_type})` : '')
    : null
  return (
    <div className="rounded-lg border border-l-2 border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] px-3.5 py-3" style={{ borderLeftColor: INCIDENTS_COLOR }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] font-mono tabular-nums text-gray-400 dark:text-white/40">{inc.event_date}</span>
        {inc.title && <span className="text-sm font-bold leading-snug text-gray-900 dark:text-white/85">{inc.title}</span>}
        <span className="ml-auto"><VerificationBadge value={inc.verification} /></span>
      </div>
      {inc.location && <div className="text-[12px] text-gray-500 dark:text-white/50 mt-1">📍 {inc.location}</div>}
      {inc.summary && <p className="text-[13px] leading-relaxed text-gray-700 dark:text-white/70 mt-1.5">{inc.summary}</p>}
      {(actor || inc.system || inc.casualties != null) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {actor && <IncChip k="actor" v={actor} />}
          {inc.system && <IncChip k="system" v={String(inc.system)} />}
          {inc.casualties != null && <IncChip k="casualties" v={String(inc.casualties)} />}
        </div>
      )}
    </div>
  )
}

function IncidentsFeed({ geoLabel, rows, loading, error, onRetry }: {
  geoLabel: string; rows: Row[]; loading: boolean; error: string | null; onRetry: () => void
}) {
  return (
    <>
      {/* header — mirrors the section-cell header, with the incident accent + glyph */}
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-sm font-bold" style={{ color: INCIDENTS_COLOR }}>⚠</span>
        <h2 className="text-base font-bold text-gray-900 dark:text-white">Incidents</h2>
        <span className="text-sm text-gray-400 dark:text-white/30">·</span>
        <span className="text-sm text-gray-500 dark:text-white/50">{geoLabel}</span>
        {!loading && !error && <span className="text-[11px] text-gray-400 dark:text-white/30">{rows.length}</span>}
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/40">read-only</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"/></div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-red-500 dark:text-red-400">{error}</p>
          <button onClick={onRetry} className="mt-2 text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition">Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-white/30 py-8 text-center">No incidents recorded for this geography.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(inc => <IncidentCard key={String(inc.id)} inc={inc} />)}
        </div>
      )}
    </>
  )
}
