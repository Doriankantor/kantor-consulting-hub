// A2: read-only "CS SECTION" proposal badge on the News card. Display ONLY — no
// interactivity, no confirm/trim, no writes. Renders the AI section-routing proposal
// (analysis_json.routing.proposed_sections, written by slice A1) as recessive ghost
// chips, deliberately distinct from the filled-indigo category pills and the green
// topic tags so it reads clearly as an AI suggestion the researcher hasn't acted on.
import { sectionLabel } from './sectionLabels'

export interface SectionProposalBadgeProps {
  sections: { section: string; confidence?: 'high' | 'medium' | 'low' }[]
  projectAbbrev: string
}

// Tiny uppercase label — mirrors the "PROJECT" / "TOPIC" label style on this card verbatim.
const LABEL = 'text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30'
// Ghost/outlined chip base: transparent bg, thin border, muted slate text. Recessive.
const CHIP_BASE = 'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-transparent'

export default function SectionProposalBadge({ sections, projectAbbrev }: SectionProposalBadgeProps) {
  // Older sources analyzed before A1 have no routing block → render nothing.
  if (!Array.isArray(sections) || sections.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className={LABEL}>{projectAbbrev} Section</span>
      {sections.map((s, i) => {
        // Confidence by WEIGHT, not color: high → solid border + normal muted text;
        // medium/low → dashed border + dimmer text. No separate colored badge.
        const strong = s.confidence === 'high'
        const weight = strong
          ? 'border-solid border-slate-300 dark:border-white/20 text-slate-500 dark:text-white/50'
          : 'border-dashed border-slate-300 dark:border-white/15 text-slate-400 dark:text-white/35'
        return (
          <span key={`${s.section}-${i}`} className={`${CHIP_BASE} border ${weight}`}>
            {sectionLabel(s.section)}
          </span>
        )
      })}
    </div>
  )
}
