// Slice 3b: relevance override pill on the source-card Zone A (the FOLD model). TWO DISTINCT
// values meet here: the AI gate score core.relevanceScore (0-10, the "REL n" badge) and a SEPARATE
// researcher override core.humanRel, written by setHumanRelevance to
// analysis_json.human.relevance -- which DELIBERATELY never touches relevance_score. This component
// FOLDS them: when a human override is set it REPLACES the AI badge, but renders with a distinct
// provenance treatment (an indigo "override" family + an "H" marker + a tooltip surfacing the
// underlying AI score) so a human call is NEVER mistaken for AI output. When no override is set,
// the AI badge shows exactly as before (passed in verbatim as `aiNode`).
//
// Slice R2: the human override is NUMERIC 1-10, on the AI's OWN relevance_score scale, so "AI said 8,
// the researcher says 5" is directly comparable (and the AI column stays untouched for that pairing).
// Legacy rows hold a category string in human.relevance; sourceCore degrades those to undefined, so
// this component only ever sees a number or nothing -- no migration, no word in a numeric slot.
//
// Interactivity is gated purely on onChange presence (no type-keyed logic), mirroring ConfidencePill
// / IncidentChip. EDIT mode opens a POPOVER PICKER (Use AI score / 1-10 / Clear) so any target
// state is ONE click and clearing an override never transits through intermediate values -- the click
// ONLY ever routes through onChange (-> NewsTab.handleHumanRelevance -> setHumanRelevance); this
// component holds no write path and never writes relevance_score. The picker mirrors the codebase's
// Slice-2b popover anchoring (OverflowPopover / TagPicker): createPortal + position:fixed computed
// from the trigger's getBoundingClientRect, viewport-clamped, dismissed via the shared
// usePopoverDismiss hook.
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss'
import ProvenanceMark from './ProvenanceMark'

interface RelevancePillProps {
  aiNode: ReactNode                            // the card's existing three-state AI "REL n" badge, verbatim
  relevanceScore: number | null               // AI score -- surfaced in the override tooltip, NEVER written here
  humanRel?: number                            // Slice R2: researcher override, NUMERIC 1-10 (AI scale) | undefined
  onChange?: (value: number | null) => void    // present => interactive; null clears back to the AI score
}

// The explicit picker options: the AI's own 1-10 scale. Each is a DIRECT set (no cycling), so every
// target state -- including clear-to-AI -- is exactly one click and never writes an intermediate value.
const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

// Human-override styling: DELIBERATELY distinct from the AI REL badge's green/amber/red tiers --
// one indigo "override" family + an H marker -- so provenance is unmistakable at every level.
const HUMAN_PILL = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ring-indigo-300 dark:ring-indigo-400/40 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'

// Inline field-name label for the HUMAN-OVERRIDE state only: the AI-score badge (aiNode) already
// renders literal "REL" (SourceCard's REL n badge), but the override pill shows a bare number with
// no field name -- so it reads "H REL 6". `uppercase` is added because HUMAN_PILL is NOT uppercase.
const REL_PREFIX = 'text-[9px] tracking-wide font-extrabold opacity-60 uppercase'

// EDIT-mode picker. Holds the popover hooks unconditionally (this component is only mounted when
// onChange is present). The trigger keeps the folded appearance -- the human pill (H marker +
// provenance tooltip) when an override is set, else the AI badge verbatim -- and opens the picker.
function RelevancePicker({
  aiNode,
  relevanceScore,
  humanRel,
  overrideTitle,
  onChange,
}: {
  aiNode: ReactNode
  relevanceScore: number | null
  humanRel?: number
  overrideTitle: string
  onChange: (value: number | null) => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = usePopoverDismiss(open, useCallback(() => setOpen(false), []))

  const openPanel = (): void => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, left: r.left })
    setOpen(true)
  }

  // After the panel mounts, clamp it inside the viewport using its REAL size (same recipe as
  // OverflowPopover): 8px off the edges, flip above the trigger if it would run off the bottom.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return
    const MARGIN = 8
    const r = triggerRef.current.getBoundingClientRect()
    const pw = panelRef.current.offsetWidth
    const ph = panelRef.current.offsetHeight
    let left = r.left
    if (left + pw > window.innerWidth - MARGIN) left = window.innerWidth - pw - MARGIN
    if (left < MARGIN) left = MARGIN
    let top = r.bottom + 6
    if (top + ph > window.innerHeight - MARGIN && r.top - ph - 6 >= MARGIN) top = r.top - ph - 6
    setPos({ top, left })
  }, [open, panelRef])

  // The ONLY write path: route the chosen value straight through onChange, then close. A number 1-10
  // sets that override directly; null clears back to the AI score (handed to the handler as a real
  // null now -- Slice R2 dropped the old empty-string round-trip). No intermediate writes.
  const choose = (value: number | null): void => {
    onChange(value)
    setOpen(false)
  }

  // Slice R2: an explicit null test, NOT truthiness -- a confirmed AI score of 0 is a real override
  // and must not read as "unset" (which would silently hide the H pill and show the AI badge).
  const hasOverride = typeof humanRel === 'number'
  // CONFIRM-PROVENANCE Slice B: a true in-place AI->H swap in the pill's LEADING slot. Overridden ->
  // indigo H as the first child inside HUMAN_PILL (below). AI-scored & NOT overridden -> aiNode, which
  // leads with the amber AI mark INSIDE the REL-score badge's border (that mark is rendered where aiNode
  // is built, in SourceCard, so it sits in the byte-identical leading position the H occupies here).
  // Slice R2: that amber mark is now also CONFIRM-AS-IS (click -> human.relevance = the AI score ->
  // indigo H), wired where aiNode is built in SourceCard and stopPropagation'd there so it does not
  // also open this picker. The pill BODY still opens the 1-10 picker; the mark alone confirms.
  const trigger: ReactNode = hasOverride ? (
    <>
      <ProvenanceMark kind="human" hue="indigo" />
      <span className={REL_PREFIX}>REL</span>
      {humanRel}
    </>
  ) : (
    aiNode
  )
  const triggerClass = hasOverride
    ? `${HUMAN_PILL} transition hover:ring-2`
    : 'inline-flex items-center rounded transition hover:ring-1 hover:ring-indigo-300 dark:hover:ring-indigo-400/40'
  const triggerTitle = hasOverride ? `${overrideTitle} — click to change` : 'AI relevance score — click to set a researcher score (1-10)'

  const optionBase = 'flex items-center justify-between gap-3 w-full px-2 py-1 rounded text-[11px] text-left transition'
  const optionOff = 'text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
  // Slice R2: the 1-10 scale as a 5-across grid (two tidy rows) rather than ten stacked rows -- the
  // list idiom survives for the Use-AI-score / Clear actions, which are commands, not scale values.
  const cellBase = 'h-6 rounded text-[11px] font-semibold tabular-nums transition'
  const cellOn = 'bg-indigo-600 text-white dark:bg-indigo-500'
  const cellOff = 'text-gray-700 dark:text-white/70 bg-gray-50 dark:bg-white/[0.04] hover:bg-gray-100 dark:hover:bg-white/[0.08]'

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="min-w-[176px] rounded-lg border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-900 shadow-xl p-1.5 flex flex-col gap-0.5"
        >
          <div className="px-2 pt-0.5 pb-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40">
            Relevance override
            <span className="ml-1 font-medium normal-case text-gray-400 dark:text-white/30">AI: REL {relevanceScore ?? '—'}</span>
          </div>
          {/* Confirm-as-is, the same action the trigger's amber AI mark performs -- SETS the AI number
              as the human value (it does NOT clear). Omitted when the AI never scored this row. */}
          {relevanceScore != null && (
            <>
              <button type="button" onClick={() => choose(relevanceScore)} className={`${optionBase} ${optionOff}`}>
                <span className="inline-flex items-center gap-1">
                  <ProvenanceMark kind="human" hue="indigo" />
                  Use AI score ({relevanceScore})
                </span>
              </button>
              <div className="my-0.5 border-t border-gray-100 dark:border-white/[0.08]" />
            </>
          )}
          <div className="grid grid-cols-5 gap-1 px-0.5 py-0.5">
            {SCORES.map(n => {
              const on = humanRel === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => choose(n)}
                  className={`${cellBase} ${on ? cellOn : cellOff}`}
                  title={`Researcher relevance ${n} of 10`}
                >
                  {n}
                </button>
              )
            })}
          </div>
          {/* Clear is subordinate and only meaningful while an override exists: with the numeric scale
              "Use AI score" now SETS a value, so clearing back to un-overridden needs its own action. */}
          {hasOverride && (
            <>
              <div className="my-0.5 border-t border-gray-100 dark:border-white/[0.08]" />
              <button type="button" onClick={() => choose(null)} className={`${optionBase} ${optionOff}`}>
                <span className="text-gray-500 dark:text-white/50">Clear override</span>
                <span aria-hidden className="text-gray-400 dark:text-white/30 text-[10px] leading-none">×</span>
              </button>
            </>
          )}
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // stopPropagation so usePopoverDismiss's document mousedown doesn't also fire on the
        // trigger (which would close-then-reopen); the onClick below owns the toggle.
        onMouseDown={e => e.stopPropagation()}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={triggerClass}
        title={triggerTitle}
      >
        {trigger}
      </button>
      {panel}
    </>
  )
}

export default function RelevancePill({ aiNode, relevanceScore, humanRel, onChange }: RelevancePillProps) {
  const overrideTitle = `Researcher override — AI scored REL ${relevanceScore ?? '—'}`

  // READ mode (onChange absent). Folded: a human override shows the human NUMBER in place of the AI
  // badge, with the indigo H provenance marker + tooltip, non-interactive. No override: the AI badge
  // verbatim -- it already leads with the amber AI mark inside its border (built in SourceCard).
  // Slice R2: explicit null test, so a confirmed score of 0 still reads as an override.
  if (!onChange) {
    if (typeof humanRel === 'number') {
      return (
        <span className={HUMAN_PILL} title={overrideTitle}>
          <ProvenanceMark kind="human" hue="indigo" />
          <span className={REL_PREFIX}>REL</span>
          {humanRel}
        </span>
      )
    }
    return <>{aiNode}</>
  }

  // EDIT mode -- a one-click popover picker (no cycling, no intermediate writes).
  return (
    <RelevancePicker
      aiNode={aiNode}
      relevanceScore={relevanceScore}
      humanRel={humanRel}
      overrideTitle={overrideTitle}
      onChange={onChange}
    />
  )
}
