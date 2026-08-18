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
}

// Click-to-cycle order. indexOf(-1) for an unknown value wraps to 0 -> 'high'.
const CYCLE = ['high', 'medium', 'low']
const nextConfidence = (c: string): string =>
  CYCLE[(CYCLE.indexOf((c || '').toLowerCase()) + 1) % CYCLE.length]

export default function ConfidencePill({ conf, style, onChange }: ConfidencePillProps) {
  // READ: byte-identical to the card's original static confidence badge. Only mounted when
  // confidence is SET -- the card guards read-only mounts on core.confidence -- so conf is non-null here.
  if (!onChange) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${style.bg} ${style.text}`}>
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
  return (
    <button
      type="button"
      onClick={() => onChange(nextConfidence(conf))}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase transition hover:ring-1 hover:ring-inset hover:ring-current/50 ${style.bg} ${style.text}`}
      title={`Confidence: ${conf} — click to change (overrides AI)`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {conf}
    </button>
  )
}
