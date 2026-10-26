// Slice 3: click-to-override CONFIDENCE pill on the source-card kicker (confidence ONLY --
// relevance is deferred to Slice 3b). Mirrors IncidentChip's editable/read shape:
//   - onChange PRESENT  -> an interactive pill. R1 REDESIGN: the pill BODY now opens a POPOVER
//     DROPDOWN (High / Medium / Low + "Use AI score") -- modeled on RelevancePill's RelevancePicker
//     -- REPLACING the old click-to-cycle. Any target level is ONE click; no intermediate values.
//     The click routes the chosen level through the host handler verbatim (NewsTab.handleConfidence
//     -> updateConfidence, which sets confidence_override=1). This component owns NO write path.
//   - onChange ABSENT   -> the flat read badge, BYTE-IDENTICAL to the card's original static
//     badge (same span, same classes), so read surfaces are unchanged.
// No type-keyed logic: the caller decides interactivity purely by passing (or omitting) onChange.
// The colour style is passed in (the card's confStyle) so there is one source of truth for the
// palette and the display value stays reactive -- on change the host re-renders with the new
// confidence and hands down the matching style.
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss'
import ProvenanceMark from './ProvenanceMark'

interface ConfidencePillProps {
  conf: string | null                            // display value (already lowercased: high | medium | low), or null = UNSET
  style: { bg: string; text: string; dot: string }  // the card's confStyle for `conf`
  onChange?: (v: string) => void                 // present => interactive; absent => read badge
  override?: boolean                             // confidence_override: human set this value; when true, wear the fuchsia human-identity treatment
}

// The explicit dropdown levels. Persisted LOWERCASE per the `confidence` column; each is a DIRECT
// set (no cycling), so every target state is exactly one click and never writes an intermediate level.
const LEVELS = ['high', 'medium', 'low'] as const

// Per-level dot colours -- the option rows + trigger show the tier dot. Byte-matches the dot half of
// SourceCard/NewsTab CONFIDENCE_COLORS (green/amber/red). Kept local so the picker can colour ALL
// three options; the trigger still uses the passed-in `style` for the CURRENT value.
const CONF_DOT: Record<string, string> = { high: 'bg-green-500', medium: 'bg-amber-500', low: 'bg-red-500' }

// Human-override identity (option B / option A mark), FUCHSIA -- mirrors RelevancePill's INDIGO
// HUMAN_PILL/H_MARK construction. Confidence keys its human-override treatment off the
// confidence_override BOOLEAN FLAG (core.confidenceOverride), whereas RelevancePill keys off VALUE
// PRESENCE (!!humanRel) because relevance has no override column. Different trigger, same visual
// intent (square H mark = a human set this). Fuchsia = confidence/assessment; indigo = relevance/feedback-loop.
// The ring LAYERS on top of the value colours (green/amber/red stay); the mark leads the existing dot.
const CONF_HUMAN_RING = 'ring-1 ring-fuchsia-300 dark:ring-fuchsia-400/40'

// Inline field-name label so the pill self-identifies (CONF) alongside relevance's REL. Dimmed +
// tiny; the host pill is already `uppercase` so no uppercase needed here. Shows in every VALUE
// state (read + set); the UNSET affordance already spells out "confidence", so it is skipped there.
const FIELD_PREFIX = 'text-[9px] tracking-wide font-extrabold opacity-60'

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// EDIT-mode picker. Holds the popover hooks unconditionally (this component is only mounted when
// onChange is present). The trigger keeps the pill's folded appearance -- the value pill (with the
// AI->H leading mark) when confidence is SET, else the dashed "set confidence" affordance -- and
// opens the dropdown. Anchoring recipe COPIED from RelevancePill.RelevancePicker (createPortal +
// position:fixed from the trigger's getBoundingClientRect, viewport-clamped, usePopoverDismiss).
function ConfidencePicker({ conf, style, onChange, override }: {
  conf: string | null
  style: { bg: string; text: string; dot: string }
  onChange: (v: string) => void
  override?: boolean
}) {
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
  // OverflowPopover / RelevancePicker): 8px off the edges, flip above the trigger if it would run
  // off the bottom.
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

  // The ONLY write path: route the chosen level straight through onChange, then close. Every level
  // is a DIRECT set; "Use AI score" re-sends the CURRENT value (value unchanged, override 0->1 -> H),
  // identical to the leading AI-mark confirm.
  const choose = (value: string): void => {
    onChange(value)
    setOpen(false)
  }

  const optionBase = 'flex items-center justify-between gap-3 w-full px-2 py-1 rounded text-[11px] text-left transition'
  const optionOn = 'bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 font-semibold'
  const optionOff = 'text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
  const check = <span aria-hidden className="text-fuchsia-600 dark:text-fuchsia-300 text-[10px] leading-none">✓</span>

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="min-w-[168px] rounded-lg border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-900 shadow-xl p-1.5 flex flex-col gap-0.5"
        >
          <div className="px-2 pt-0.5 pb-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40">
            Confidence
            {conf && <span className="ml-1 font-medium normal-case text-gray-400 dark:text-white/30">AI: {capitalize(conf)}</span>}
          </div>
          {/* "Use AI score" — only when a value exists to confirm. Picks the CURRENT value unchanged
              (override 0->1 -> H), matching the leading AI-mark confirm. Omitted in the UNSET state. */}
          {conf && (
            <>
              <button type="button" onClick={() => choose(conf)} className={`${optionBase} ${optionOff}`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  Use AI score ({capitalize(conf)})
                </span>
              </button>
              <div className="my-0.5 border-t border-gray-100 dark:border-white/[0.08]" />
            </>
          )}
          {LEVELS.map(level => {
            const on = (conf ?? '').toLowerCase() === level
            return (
              <button key={level} type="button" onClick={() => choose(level)} className={`${optionBase} ${on ? optionOn : optionOff}`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${CONF_DOT[level]}`} />
                  {capitalize(level)}
                </span>
                {on && check}
              </button>
            )
          })}
        </div>,
        document.body,
      )
    : null

  // EDITABLE + UNSET (S5b-1): an editable mount whose row has no confidence yet (e.g. an interview a
  // researcher has not scored). Render a NEUTRAL "set confidence" affordance -- deliberately NOT a
  // red 'low'. R1: it now OPENS THE SAME DROPDOWN (no "Use AI score" line, since there is no AI value)
  // instead of auto-seeding 'high' -- the picker's explicit choice replaces the old first-click seed.
  // Uses its own muted (dashed) styling, so it ignores the passed `style` (which defaults to low).
  if (!conf) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => (open ? setOpen(false) : openPanel())}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border border-dashed border-gray-300 dark:border-white/20 text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/80 transition"
          title="Set confidence (overrides AI)"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-white/25" />
          confidence
        </button>
        {panel}
      </>
    )
  }

  // EDITABLE + SET: the pill wears the read badge's colours, now with two controls sharing the chrome:
  // (1) the LEADING mark slot -- an in-place AI->H swap. When AI/default-proposed and NOT yet
  //     human-confirmed (!override), that slot holds a one-click amber AI mark; clicking it writes the
  //     SAME value back (onChange(conf)) -> handleConfidence -> updateConfidence flips
  //     confidence_override 0->1 (value unchanged), and the optimistic patch swaps this mark for the
  //     fuchsia H immediately. It stops propagation so confirming never opens the dropdown. When
  //     override is true, layer the fuchsia ring on the chrome and lead with the H mark.
  // (2) the BODY button (CONF ● value) -- opens the dropdown picker (R1, replacing the old cycle).
  //     onMouseDown stopPropagation so usePopoverDismiss's document mousedown doesn't close-then-reopen.
  return (
    <>
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${style.bg} ${style.text} ${override ? CONF_HUMAN_RING : ''}`}
      >
        {override
          ? <ProvenanceMark kind="human" hue="fuchsia" />
          : (
            <span
              className="cursor-pointer"
              onClick={e => { e.stopPropagation(); onChange(conf) }}
              title="AI confidence — click to confirm"
            >
              <ProvenanceMark kind="ai" />
            </span>
          )}
        <button
          ref={triggerRef}
          type="button"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => (open ? setOpen(false) : openPanel())}
          className="inline-flex items-center gap-1 uppercase transition hover:opacity-80"
          title={`Confidence: ${conf} — click to change (overrides AI)`}
        >
          <span className={FIELD_PREFIX}>CONF</span>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {conf}
        </button>
      </span>
      {panel}
    </>
  )
}

export default function ConfidencePill({ conf, style, onChange, override }: ConfidencePillProps) {
  // READ: byte-identical to the card's original static confidence badge. Only mounted when
  // confidence is SET -- the card guards read-only mounts on core.confidence -- so conf is non-null here.
  if (!onChange) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${style.bg} ${style.text} ${override ? CONF_HUMAN_RING : ''}`}>
        {override && <ProvenanceMark kind="human" hue="fuchsia" />}
        <span className={FIELD_PREFIX}>CONF</span>
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        {conf}
      </span>
    )
  }

  // EDITABLE -- a one-click popover dropdown (no cycling, no intermediate writes). SET and UNSET
  // states both live in the picker; the AI-mark confirm-as-is is preserved inside the SET pill.
  return <ConfidencePicker conf={conf} style={style} onChange={onChange} override={override} />
}
