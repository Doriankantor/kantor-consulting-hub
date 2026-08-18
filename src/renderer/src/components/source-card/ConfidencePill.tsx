// Slice 3: click-to-override CONFIDENCE pill on the source-card kicker (confidence ONLY --
// relevance is deferred to Slice 3b). Mirrors IncidentChip's editable/read shape:
//   - onChange PRESENT  -> an interactive button that CYCLES high -> medium -> low -> high
//     (the simplest idiom, matching ActorChips' click-to-cycle type control). The click routes
//     the new value through the host handler verbatim (NewsTab.handleConfidence -> updateConfidence,
//     which sets confidence_override=1). This component owns NO write path.
//   - onChange ABSENT   -> the flat read badge, BYTE-IDENTICAL to the card's original static
//     badge (same span, same classes), so read surfaces are unchanged.
// No type-keyed logic: the caller decides interactivity purely by passing (or omitting) onChange.
// The colour style is passed in (the card's confStyle) so there is one source of truth for the
// palette and the display value stays reactive -- on cycle the host re-renders with the new
// confidence and hands down the matching style.

interface ConfidencePillProps {
  conf: string | null                            // display value (already lowercased: high | medium | low), or null = UNSET
  style: { bg: string; text: string; dot: string }  // the card's confStyle for `conf`
  onChange?: (v: string) => void                 // present => interactive; absent => read badge
  override?: boolean                             // confidence_override: human set this value; when true, wear the fuchsia human-identity treatment
}

// Click-to-cycle order. indexOf(-1) for an unknown value wraps to 0 -> 'high'.
const CYCLE = ['high', 'medium', 'low']
const nextConfidence = (c: string): string =>
  CYCLE[(CYCLE.indexOf((c || '').toLowerCase()) + 1) % CYCLE.length]

// Human-override identity (option B / option A mark), FUCHSIA -- mirrors RelevancePill's INDIGO
// HUMAN_PILL/H_MARK construction. Confidence keys its human-override treatment off the
// confidence_override BOOLEAN FLAG (core.confidenceOverride), whereas RelevancePill keys off VALUE
// PRESENCE (!!humanRel) because relevance has no override column. Different trigger, same visual
// intent (square H mark = a human set this). Fuchsia = confidence/assessment; indigo = relevance/feedback-loop.
// The ring LAYERS on top of the value colours (green/amber/red stay); the mark leads the existing dot.
const CONF_HUMAN_RING = 'ring-1 ring-fuchsia-300 dark:ring-fuchsia-400/40'
const CONF_H_MARK = 'inline-flex items-center justify-center w-3 h-3 rounded-sm bg-fuchsia-600 dark:bg-fuchsia-400 text-white dark:text-fuchsia-950 text-[8px] font-bold leading-none'

// Inline field-name label so the pill self-identifies (CONF) alongside relevance's REL. Dimmed +
// tiny; the host pill is already `uppercase` so no uppercase needed here. Shows in every VALUE
// state (read + set); the UNSET affordance already spells out "confidence", so it is skipped there.
const FIELD_PREFIX = 'text-[9px] tracking-wide font-extrabold opacity-60'

export default function ConfidencePill({ conf, style, onChange, override }: ConfidencePillProps) {
  // READ: byte-identical to the card's original static confidence badge. Only mounted when
  // confidence is SET -- the card guards read-only mounts on core.confidence -- so conf is non-null here.
  if (!onChange) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${style.bg} ${style.text} ${override ? CONF_HUMAN_RING : ''}`}>
        {override && <span className={CONF_H_MARK} aria-hidden>H</span>}
        <span className={FIELD_PREFIX}>CONF</span>
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        {conf}
      </span>
    )
  }

  // EDITABLE + UNSET (S5b-1): an editable mount whose row has no confidence yet (e.g. an interview a
  // researcher has not scored). Render a NEUTRAL "set confidence" affordance -- deliberately NOT a
  // red 'low'. That spurious AI-defaulted LOW is exactly what B2 removed; we only ever surface a
  // level a human actually picked. First click seeds 'high' (CYCLE[0]); thereafter it cycles like
  // any set pill. Uses its own muted (dashed) styling, so it ignores the passed `style` (which
  // defaults to the low palette for a null conf).
  if (!conf) {
    return (
      <button
        type="button"
        onClick={() => onChange('high')}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border border-dashed border-gray-300 dark:border-white/20 text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/80 transition"
        title="Set confidence (overrides AI)"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-white/25" />
        confidence
      </button>
    )
  }

  // EDITABLE + SET: same visual as the read badge, now a button that cycles the value on click.
  // When override is true, layer the fuchsia ring ON TOP of the value colours and lead with the H mark.
  return (
    <button
      type="button"
      onClick={() => onChange(nextConfidence(conf))}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase transition hover:ring-1 hover:ring-inset hover:ring-current/50 ${style.bg} ${style.text} ${override ? CONF_HUMAN_RING : ''}`}
      title={`Confidence: ${conf} — click to change (overrides AI)`}
    >
      {override && <span className={CONF_H_MARK} aria-hidden>H</span>}
      <span className={FIELD_PREFIX}>CONF</span>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {conf}
    </button>
  )
}
