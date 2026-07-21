// Slice 4: the compact one-line summary shown on a COLLAPSED intel card (Social /
// Documents / Interviews) in place of the full compose panel. Purely presentational
// — no data fetching, no logic beyond rendering the chips it's handed. Each chip only
// appears when its flag is true / value present. Styling mirrors SuggestedTagChip and
// the tabs' header confidence pill so a collapsed card reads consistently.
//
// The confidence map is duplicated here (small, three rows) to keep the component
// dependency-free — Interviews has no CONFIDENCE_COLORS of its own, so importing one
// tab's copy would couple the three files. Values match SocialTab/DocumentsTab exactly.
const CONFIDENCE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  high:   { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  low:    { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-400',     dot: 'bg-red-500' },
}

const CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium'

export interface CondensedSummaryProps {
  hasNotes: boolean
  analyzed: boolean
  reconciled: boolean
  tagCount: number
  confidence?: string | null
}

export default function CondensedSummary({ hasNotes, analyzed, reconciled, tagCount, confidence }: CondensedSummaryProps) {
  const conf = confidence ? CONFIDENCE_COLORS[confidence] : undefined
  // Nothing to show → render nothing (keeps a truly-empty collapsed card clean).
  if (!hasNotes && !analyzed && !reconciled && tagCount <= 0 && !conf) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {hasNotes && (
        <span className={`${CHIP} bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`}>
          <span aria-hidden>●</span>Notes
        </span>
      )}
      {analyzed && (
        <span className={`${CHIP} bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300`}>
          <span aria-hidden>✦</span>AI
        </span>
      )}
      {reconciled && (
        <span className={`${CHIP} bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300`}>
          <span aria-hidden>⟲</span>Reconciled
        </span>
      )}
      {tagCount > 0 && (
        <span className={`${CHIP} bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/50`}>
          #{tagCount} tag{tagCount === 1 ? '' : 's'}
        </span>
      )}
      {conf && (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${conf.bg} ${conf.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
          {confidence}
        </span>
      )}
    </div>
  )
}
