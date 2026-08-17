// Slice 3b: relevance override pill on the source-card Zone A (the FOLD model). TWO DISTINCT
// values meet here: the AI gate score core.relevanceScore (0-10, the "REL n" badge) and a SEPARATE
// researcher override core.humanRel ('High' | 'Medium' | 'Low'), written by setHumanRelevance to
// analysis_json.human.relevance -- which DELIBERATELY never touches relevance_score. This component
// FOLDS them: when a human override is set it REPLACES the AI badge, but renders with a distinct
// provenance treatment (an indigo "override" family + an "H" marker + a tooltip surfacing the
// underlying AI score) so a human call is NEVER mistaken for AI output. When no override is set,
// the AI badge shows exactly as before (passed in verbatim as `aiNode`).
//
// Interactivity is gated purely on onChange presence (no type-keyed logic), mirroring ConfidencePill
// / IncidentChip. EDIT mode opens a POPOVER PICKER (High / Medium / Low / Use AI score) so any target
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

interface RelevancePillProps {
  aiNode: ReactNode                            // the card's existing three-state AI "REL n" badge, verbatim
  relevanceScore: number | null               // AI score -- surfaced in the override tooltip, NEVER written here
  humanRel?: string                            // researcher override: 'High' | 'Medium' | 'Low' | undefined
  onChange?: (value: string | null) => void    // present => interactive; null clears back to the AI score
}

// The explicit picker options. Each is a DIRECT set (no cycling), so every target state -- including
// clear-to-AI -- is exactly one click and never writes an intermediate level.
const HUMAN_OPTIONS = ['High', 'Medium', 'Low'] as const

// Human-override styling: DELIBERATELY distinct from the AI REL badge's green/amber/red tiers --
// one indigo "override" family + an H marker -- so provenance is unmistakable at every level.
const HUMAN_PILL = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ring-indigo-300 dark:ring-indigo-400/40 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
const H_MARK = 'inline-flex items-center justify-center w-3 h-3 rounded-sm bg-indigo-600 dark:bg-indigo-400 text-white dark:text-indigo-950 text-[8px] font-bold leading-none'

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
  humanRel?: string
  overrideTitle: string
  onChange: (value: string | null) => void
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

  // The ONLY write path: route the chosen value straight through onChange, then close. 'High' |
  // 'Medium' | 'Low' set that override directly; null clears back to the AI score (round-trips
  // through NewsTab's `v ?? ''` -> handleHumanRelevance's `value || null`). No intermediate writes.
  const choose = (value: string | null): void => {
    onChange(value)
    setOpen(false)
  }

  const hasOverride = !!humanRel
  const trigger: ReactNode = hasOverride ? (
    <>
      <span className={H_MARK} aria-hidden>H</span>
      {humanRel}
    </>
  ) : (
    aiNode
  )
  const triggerClass = hasOverride
    ? `${HUMAN_PILL} transition hover:ring-2`
    : 'inline-flex items-center rounded transition hover:ring-1 hover:ring-indigo-300 dark:hover:ring-indigo-400/40'
  const triggerTitle = hasOverride ? `${overrideTitle} — click to change` : 'AI relevance score — click to set a researcher override'

  const optionBase = 'flex items-center justify-between gap-3 w-full px-2 py-1 rounded text-[11px] text-left transition'
  const optionOn = 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold'
  const optionOff = 'text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
  const check = <span aria-hidden className="text-indigo-600 dark:text-indigo-300 text-[10px] leading-none">✓</span>

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="min-w-[168px] rounded-lg border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-900 shadow-xl p-1.5 flex flex-col gap-0.5"
        >
          <div className="px-2 pt-0.5 pb-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40">
            Relevance override
            <span className="ml-1 font-medium normal-case text-gray-400 dark:text-white/30">AI: REL {relevanceScore ?? '—'}</span>
          </div>
          {HUMAN_OPTIONS.map(opt => {
            const on = (humanRel ?? '').toLowerCase() === opt.toLowerCase()
            return (
              <button key={opt} type="button" onClick={() => choose(opt)} className={`${optionBase} ${on ? optionOn : optionOff}`}>
                <span className="inline-flex items-center gap-1">
                  <span className={H_MARK} aria-hidden>H</span>
                  {opt}
                </span>
                {on && check}
              </button>
            )
          })}
          <div className="my-0.5 border-t border-gray-100 dark:border-white/[0.08]" />
          <button type="button" onClick={() => choose(null)} className={`${optionBase} ${hasOverride ? optionOff : optionOn}`}>
            <span>Use AI score</span>
            {!hasOverride && check}
          </button>
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

  // READ mode (onChange absent) -- UNCHANGED. Folded: a human override shows the human category in
  // place of the AI badge, with the provenance marker + tooltip, non-interactive. No override: the
  // AI badge verbatim.
  if (!onChange) {
    if (humanRel) {
      return (
        <span className={HUMAN_PILL} title={overrideTitle}>
          <span className={H_MARK} aria-hidden>H</span>
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
