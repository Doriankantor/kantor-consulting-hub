// NS-1: interactive section confirm/trim on the New-Sources pipeline card. The editable
// evolution of A2's read-only SectionProposalBadge. Shows ALL NINE page sections as chips;
// the working "confirmed" set starts seeded from the AI's proposal (routing.proposed_sections)
// and becomes researcher-authoritative once touched. Every toggle emits the WHOLE confirmed
// array via onChange (whole-state). Writes go to analysis_json.routing.confirmed via the
// setRoutingConfirmed writer — NO info_page_sources / placement contact (that's NS-2).
import { SECTION_LABELS, sectionLabel } from '../../Intelligence/sectionLabels'

export interface SectionChipsProps {
  proposed: { section: string; confidence?: string }[]
  confirmed: string[] | null                       // null = researcher hasn't touched it → seed from proposed
  onChange: (confirmed: string[]) => void
}

// Selected (in the working set) → filled emerald "confirmed placement" style.
const CHIP_ON = 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-transparent'
// Available (not selected) → recessive ghost/outlined, click to add.
const CHIP_OFF = 'bg-transparent border border-slate-300 dark:border-white/15 text-slate-400 dark:text-white/35 hover:text-slate-600 dark:hover:text-white/60'
const CHIP_BASE = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition'
const LABEL = 'text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30'
// Tiny dot marking a section the AI proposed (so researcher-added vs AI-proposed is visible).
const PROPOSED_DOT = 'w-1 h-1 rounded-full bg-indigo-400 dark:bg-indigo-300'

export default function SectionChips({ proposed, confirmed, onChange }: SectionChipsProps) {
  // Working set: once the researcher has touched it, `confirmed` is authoritative (even if []);
  // before that (null), seed from the AI's proposal.
  const working = confirmed ?? proposed.map(p => p.section)
  const workingSet = new Set(working.map(s => s.toLowerCase()))
  const proposedSet = new Set(proposed.map(p => p.section.toLowerCase()))

  const toggle = (key: string) => {
    const k = key.toLowerCase()
    // Rebuild from the full nine in canonical order, honoring the toggle → stable ordering.
    const next = Object.keys(SECTION_LABELS).filter(sec => {
      const on = workingSet.has(sec)
      return sec === k ? !on : on
    })
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className={LABEL}>Section</span>
      {Object.keys(SECTION_LABELS).map(sec => {
        const on = workingSet.has(sec)
        const wasProposed = proposedSet.has(sec)
        return (
          <button
            key={sec}
            onClick={() => toggle(sec)}
            className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
            title={wasProposed ? 'AI-proposed — click to toggle' : 'Click to add to this project'}
          >
            {wasProposed && <span className={PROPOSED_DOT} aria-hidden />}
            {sectionLabel(sec)}
          </button>
        )
      })}
    </div>
  )
}
