// Slice A (CONFIRM-PROVENANCE arc): the ONE shared provenance mark. Two idioms, lifted VERBATIM
// from the five hand-copied originals -- the square human "H" mark (RelevancePill H_MARK indigo /
// ConfidencePill CONF_H_MARK fuchsia / IncidentChip FORCED_H_MARK rose) and the amber "AI" badge
// (GeographyChips + ActorChips AI_BADGE, byte-identical to each other). PURE REFACTOR: every emitted
// className, inner text and attribute is byte-for-byte identical to its original. This slice adds NO
// confirm action, NO new hue, NO gate/behavior/visual change (those are Slices B/D).
//
// TAILWIND NOTE: hues live in a LITERAL lookup map holding COMPLETE class strings -- never
// interpolated as `bg-${hue}-600` fragments, which Tailwind's scanner cannot see and would purge.
// All three human hues + the full amber literal appear verbatim below.

// Human "H" mark. Invariant frame; only the color block varies by hue. Split PRE/HUE/POST in the
// ORIGINAL class order so the joined string is byte-identical to each original H_MARK constant:
//   `inline-flex items-center justify-center w-3 h-3 rounded-sm <hue> text-[8px] font-bold leading-none`
const HUMAN_FRAME_PRE = 'inline-flex items-center justify-center w-3 h-3 rounded-sm'
const HUMAN_FRAME_POST = 'text-[8px] font-bold leading-none'
const HUMAN_HUE = {
  indigo: 'bg-indigo-600 dark:bg-indigo-400 text-white dark:text-indigo-950',
  fuchsia: 'bg-fuchsia-600 dark:bg-fuchsia-400 text-white dark:text-fuchsia-950',
  rose: 'bg-rose-600 dark:bg-rose-400 text-white dark:text-rose-950',
  // Slice B: geography's human-confirmed hue -- TEAL, matching Zone B's teal accent
  // (border-teal-200 / text-teal-600). Full literal class strings so Tailwind's scanner keeps them.
  teal: 'bg-teal-600 dark:bg-teal-400 text-white dark:text-teal-950',
  // Slice B step 2a: actors' human-provenance hue -- VIOLET, matching Zone C (engaged entities).
  // Full literal class strings so Tailwind's scanner keeps them.
  violet: 'bg-violet-600 dark:bg-violet-400 text-white dark:text-violet-950',
} as const

type HumanHue = keyof typeof HUMAN_HUE

// Amber "AI" badge -- byte-identical to the AI_BADGE literal in GeographyChips + ActorChips.
const AI_BADGE = 'ml-0.5 px-1 rounded bg-amber-200/70 dark:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-[8px] font-bold uppercase tracking-wide'

export interface ProvenanceMarkProps {
  kind: 'human' | 'ai'
  hue?: HumanHue    // human only; the AI badge is always amber. Defaults to indigo.
  title?: string    // AI badges carry a site-specific title. Human marks are aria-hidden with no title.
}

// kind="human" -> `<span className aria-hidden>H</span>` (no title, matching every original H_MARK site).
// kind="ai"    -> `<span className title>AI</span>` (site title, no aria-hidden, matching AI_BADGE).
export default function ProvenanceMark({ kind, hue = 'indigo', title }: ProvenanceMarkProps) {
  if (kind === 'ai') {
    return <span className={AI_BADGE} title={title}>AI</span>
  }
  return (
    <span className={`${HUMAN_FRAME_PRE} ${HUMAN_HUE[hue]} ${HUMAN_FRAME_POST}`} aria-hidden>H</span>
  )
}
