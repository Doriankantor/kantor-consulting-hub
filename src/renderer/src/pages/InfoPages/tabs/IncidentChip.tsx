// NS Slice 2: incident-flag confirm control on the New-Sources pipeline card — the incident
// analogue of SectionChips. Same chip idiom (filled emerald = on, ghost/outlined = off, an
// indigo dot marks what the AI proposed). Three researcher-reachable states, driven by
// resolveIncident (human-over-AI):
//   confirmed    — AI flagged it and the researcher agrees (or hasn't touched it)
//   not-incident — the researcher overrode it OFF (suppress)
//   forced       — AI did NOT flag it, the researcher turned it ON
//   none         — AI didn't flag it and nobody touched it (default, recessive)
// Every click emits the human override value (true = confirm/force, false = not an incident);
// null is reserved for the writer's clear path and isn't produced here. Persistence goes to
// analysis_json.human.incident via setIncidentFlag — NO info_page_sources / placement contact.
import { ResolvedIncident } from '../../Intelligence/resolveAnalysis'

export interface IncidentChipProps {
  resolved: ResolvedIncident
  onChange: (value: boolean) => void   // true = confirm/force, false = not an incident
}

// Match SectionChips exactly so the two controls read as one visual language.
const CHIP_ON = 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-transparent'
const CHIP_OFF = 'bg-transparent border border-slate-300 dark:border-white/15 text-slate-400 dark:text-white/35 hover:text-slate-600 dark:hover:text-white/60'
const CHIP_BASE = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition'
const LABEL = 'text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30'
const PROPOSED_DOT = 'w-1 h-1 rounded-full bg-indigo-400 dark:bg-indigo-300'

export default function IncidentChip({ resolved, onChange }: IncidentChipProps) {
  const { aiFlagged, human, isIncident, state } = resolved
  // "Engaged" = the AI flagged it OR the researcher has touched it → show the full segmented
  // pair so they can flip freely. Otherwise a single recessive "Mark as incident" affordance.
  const engaged = aiFlagged || human !== null

  if (!engaged) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className={LABEL}>Incident</span>
        <button
          onClick={() => onChange(true)}
          className={`${CHIP_BASE} ${CHIP_OFF}`}
          title="AI did not flag this as an incident — click to mark it one (forces incident generation)"
        >
          + Mark as incident
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className={LABEL}>Incident</span>
      <button
        onClick={() => onChange(true)}
        className={`${CHIP_BASE} ${isIncident ? CHIP_ON : CHIP_OFF}`}
        title={aiFlagged ? 'AI-flagged incident — click to confirm' : 'Marked as incident by researcher — click to keep'}
      >
        {aiFlagged && <span className={PROPOSED_DOT} aria-hidden />}
        ⚠ Incident{state === 'forced' ? ' · added' : ''}
      </button>
      <button
        onClick={() => onChange(false)}
        className={`${CHIP_BASE} ${state === 'not-incident' ? CHIP_ON : CHIP_OFF}`}
        title="Mark this source as NOT an incident (suppresses incident generation)"
      >
        Not an incident
      </button>
    </div>
  )
}
