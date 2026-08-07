// Shared incident-card primitives (extracted from CellGridTab in Slice 4 so the same card
// renders in BOTH Page Content's incident feed and Pre-Commit Review's incident proposal —
// one source of truth, same rationale that put Box in cellPrimitives). Pure move from the
// Slice-3 originals; no behavior change.
//
// Read-only display only: date/title/location/actor(+type)/system/casualties/verification/
// summary. No accept/edit/delete controls. Rows are the loose incidents-table shape (the
// getIncidents / getIncidentBySource return), so the card is keyed on a permissive record.

type IncidentRow = Record<string, any>

// Incident accent — rose-500, distinct from the 9 section accents. Exported so a rail entry
// can tint its sentinel marker to match the card.
export const INCIDENTS_COLOR = '#f43f5e'

// verification is a CHECK'd enum on the incidents table (single-source | corroborated |
// disputed). Badge color per value; unknown/absent falls back to single-source styling.
const VERIFICATION_STYLE: Record<string, string> = {
  corroborated: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  disputed:     'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'single-source': 'bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/50',
}

function VerificationBadge({ value }: { value: string | null }) {
  const v = (value || 'single-source').toLowerCase()
  const cls = VERIFICATION_STYLE[v] ?? VERIFICATION_STYLE['single-source']
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{v}</span>
}

// A single attribute chip — mirrors OutlineBox's attr-chip visual language.
function IncChip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/50">
      <span className="text-gray-400 dark:text-white/30">{k}:</span>{v}
    </span>
  )
}

export function IncidentCard({ inc }: { inc: IncidentRow }) {
  const actor = inc.actor
    ? String(inc.actor) + (inc.actor_type ? ` (${inc.actor_type})` : '')
    : null
  return (
    <div className="rounded-lg border border-l-2 border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] px-3.5 py-3" style={{ borderLeftColor: INCIDENTS_COLOR }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] font-mono tabular-nums text-gray-400 dark:text-white/40">{inc.event_date}</span>
        {inc.title && <span className="text-sm font-bold leading-snug text-gray-900 dark:text-white/85">{inc.title}</span>}
        <span className="ml-auto"><VerificationBadge value={inc.verification} /></span>
      </div>
      {inc.location && <div className="text-[12px] text-gray-500 dark:text-white/50 mt-1">📍 {inc.location}</div>}
      {inc.summary && <p className="text-[13px] leading-relaxed text-gray-700 dark:text-white/70 mt-1.5">{inc.summary}</p>}
      {(actor || inc.system || inc.casualties != null) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {actor && <IncChip k="actor" v={actor} />}
          {inc.system && <IncChip k="system" v={String(inc.system)} />}
          {inc.casualties != null && <IncChip k="casualties" v={String(inc.casualties)} />}
        </div>
      )}
    </div>
  )
}
