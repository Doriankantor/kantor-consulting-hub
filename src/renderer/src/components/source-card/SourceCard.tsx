// The unified source-card FACE. S1 renders it READ-ONLY on News, byte-identical to the
// inline block NewsTab used to draw (NewsTab.tsx:1475-1651): image + header badge row +
// geography/actor axes + title + snippet + section proposal.
//
// S1 boundary ("card-face only"): the axes are INERT here (no-op onChange) -- editing lands
// in S2. The interactive project-row + gate-error, and the whole footer workbench + action
// row, stay in NewsTab; NewsTab injects the project-row + gate-error via {children}, which
// render inside this card's inner column exactly where they used to sit.
//
// Display constants + relevanceBadge + formatDate are duplicated here (not imported from
// NewsTab) so the card owns its own presentation and there is no card -> NewsTab dependency.
// They are copied VERBATIM from NewsTab; keep the two in sync until NewsTab drops its copies.
import type { ReactNode } from 'react'
import SectionProposalBadge from '../../pages/Intelligence/SectionProposalBadge'
import GeographyChips from '../../pages/Intelligence/GeographyChips'
import ActorChips from '../../pages/Intelligence/ActorChips'
import IncidentChip from './IncidentChip'
import { lookupCountry } from '../../pages/Intelligence/geographyVocab'
import type { SourceCore } from './sourceCore'

const CONFIDENCE_COLORS = {
  high:   { bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-400',   dot: 'bg-green-500' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-400',   dot: 'bg-amber-500' },
  low:    { bg: 'bg-red-100 dark:bg-red-900/30',       text: 'text-red-700 dark:text-red-400',       dot: 'bg-red-500' },
}

const STATUS_COLORS: Record<string, string> = {
  unreviewed: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300',
  approved:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  rejected:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  saved:      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  pushed:     'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
  imported:   'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
}

const STATUS_LABELS: Record<string, string> = {
  imported: 'Imported — needs confirmation',
}

// Short labels for the gate's proposed relevance type.
const REL_TYPE_LABELS: Record<string, string> = {
  'in-region': 'In-region',
  'supply-side': 'Supply-side',
  'precedent': 'Precedent',
  'escalation-signal': 'Escalation',
  'none': 'None',
}

// Relevance-score badge color tiers: 7-10 green, 4-6 amber, 0-3 red, null gray.
function relevanceBadge(score: number | null): { label: string; cls: string } {
  if (score == null) return { label: '—', cls: 'bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/40' }
  if (score >= 7) return { label: String(score), cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' }
  if (score >= 4) return { label: String(score), cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' }
  return { label: String(score), cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return ''
  try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return dateStr }
}

// S2 interactivity (decision A: card stays pure, host owns session state). When an onXChange
// prop is present the matching axis is EDITABLE and calls the host's handler verbatim (the
// handler owns success/failure + touched-Set population); when absent the axis renders INERT
// (no-op onChange) exactly like S1, so future read-only mounts keep working. The amber "AI"
// cue is host-driven: geoTouched/actorsTouched come from NewsTab's session Sets, so touching
// a card's geography/actors this session clears its cue. With no touched prop (read-only
// mount) the cue falls back to list-present (core.hasGeo/hasActors) -- S1 behavior.
interface SourceCardProps {
  core: SourceCore
  children?: ReactNode
  onCountriesChange?: (subject: string[], mentioned: string[], subGeo: Record<string, string[]>) => void
  onActorsChange?: (actors: { name: string; type: string }[]) => void
  onIncidentChange?: (value: boolean) => void
  geoTouched?: boolean
  actorsTouched?: boolean
}

export default function SourceCard({
  core,
  children,
  onCountriesChange,
  onActorsChange,
  onIncidentChange,
  geoTouched,
  actorsTouched,
}: SourceCardProps) {
  const conf = core.confidence || 'low'
  const confStyle = CONFIDENCE_COLORS[conf as keyof typeof CONFIDENCE_COLORS] || CONFIDENCE_COLORS.low

  // Amber cue = list-present AND not yet touched this session. geoTouched undefined (read-only
  // mount) => !undefined = true => cue falls back to core.hasGeo. Restores "clears on touch".
  const geoAiUnconfirmed = core.hasGeo && !geoTouched
  const actorsAiUnconfirmed = core.hasActors && !actorsTouched

  // Geo-population affordance: gated-but-unanalyzed cards have empty subject_countries but a
  // scalar in core.region (the gate set it). Surface that scalar as a one-click-confirm chip so
  // the researcher can promote it into the real subject list. SNAP region through the renderer's
  // canonical vocab (lookupCountry, the same table GeographyChips uses) so we NEVER show or confirm
  // a non-country: a real country resolves to its clean canonical name; the REGIONAL/GLOBAL
  // sentinels and pre-retune free-text junk ('Middle East (Iran/Hormuz)', 'N/A') are absent from
  // the vocab -> undefined -> null -> no chip. Shown ONLY when subject is empty, region snaps to a
  // real country, and this is an editable mount (onCountriesChange present). The click routes
  // through the S2 handler verbatim; nothing is written to the DB until the researcher clicks. A
  // later full-text Analyze-with-AI overwrites the list wholesale -- the gate scalar is a placeholder.
  const gateSuggestion = lookupCountry(core.region ?? '')?.name ?? null
  const showGateGeoChip = !!onCountriesChange && core.subjectCountries.length === 0 && gateSuggestion !== null

  return (
    <div className="flex items-start gap-3">
      {core.imageUrl && (
        <img
          src={core.imageUrl}
          alt=""
          className="w-16 h-12 rounded-lg object-cover shrink-0 border border-gray-100 dark:border-white/[0.06]"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {/* Confidence badge */}
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${confStyle.bg} ${confStyle.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${confStyle.dot}`} />
            {conf}
          </span>
          {/* Relevance-score badge.
              gate_processed=1 + NULL score = tombstoned (failed to score) → gray "scoring failed".
              gate_processed=0 + NULL score = not yet gated → gray "REL —". */}
          {/* Never-gated rows (Social/Docs/Interviews: gate_processed=0, no score) render NO
              relevance badge — a "REL —" here would falsely imply the gate ran. Data-driven,
              not type-keyed: News is always gate_processed=1 so it never enters this branch,
              and the 'scoring failed' + 'REL n' branches below stay byte-identical. */}
          {core.gateProcessed !== 1 && core.relevanceScore == null ? null : core.gateProcessed === 1 && core.relevanceScore == null ? (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/30"
              title={core.gateReasoning || 'Scoring failed — could not classify this article'}
            >
              scoring failed
            </span>
          ) : ((() => {
            const rb = relevanceBadge(core.relevanceScore)
            return (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${rb.cls}`}
                title="Colombia relevance score (0–10)"
              >
                <span className="opacity-60 font-medium">REL</span>{rb.label}
              </span>
            )
          })())}
          {/* Relevance-type badge */}
          {core.relevanceType && core.relevanceType !== 'none' && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300"
              title="Why this matters (gate classification)"
            >
              {REL_TYPE_LABELS[core.relevanceType] || core.relevanceType}
            </span>
          )}
          {/* Status badge */}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${core.status === 'imported' ? '' : 'uppercase'} ${STATUS_COLORS[core.status] || STATUS_COLORS.unreviewed}`}>
            {STATUS_LABELS[core.status] || core.status}
          </span>
          {/* Language badge — ES / EN / PT visibility only, no filter */}
          {core.language && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                core.language === 'es' ? 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300' :
                core.language === 'pt' ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300' :
                'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
              }`}
              title={`Article language: ${core.language.toUpperCase()}`}
            >
              {core.language.toUpperCase()}
            </span>
          )}
          {/* Origin badges */}
          {core.addedByName === 'Contested Skies Pipeline' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">Pipeline</span>
          )}
          {core.addedByName === 'Imported from Contested Skies' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40">from Contested Skies</span>
          )}
          {core.addedByName === 'Kantor Framework' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300" title="Fixed authoritative framework reference — not graded">Framework — fixed</span>
          )}
          {core.addedByName === 'Contested Skies Archive' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40">Source archive</span>
          )}
          {core.usedInPage && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
              title={core.usedInPageAt ? `Published ${formatDate(core.usedInPageAt)}` : undefined}>
              Published — used in {core.usedInPage}
            </span>
          )}
          {/* Source name */}
          {core.sourceName && (
            <span className="text-xs text-gray-500 dark:text-white/40 font-medium">{core.sourceName}</span>
          )}
          {/* Date. S6: render only when publishedAt is set (data-driven, like language/snippet
              above). Social/News carry published_at -> renders as before; Documents leave it
              null (the header shows added_at instead) -> the empty span is suppressed. */}
          {core.publishedAt && (
            <span className="text-xs text-gray-400 dark:text-white/30">{formatDate(core.publishedAt)}</span>
          )}

          {/* Geo-population: soft "from gate" suggestion chip in the empty geography state.
              Click promotes the gate's scalar country into subject_countries via the S2 handler
              (mentioned + subGeo passed through unchanged). Once subject is non-empty the condition
              falls false and this disappears, replaced by the normal confirmed-country chip. */}
          {showGateGeoChip && (
            <button
              onClick={() => onCountriesChange?.([gateSuggestion], core.mentionedCountries, core.subGeographies)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-amber-300 dark:border-amber-500/30 bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-500/25 transition"
              title={`Gate proposed "${gateSuggestion}" from the title/snippet -- click to confirm as a subject country`}
            >
              <span className="font-semibold">+ {gateSuggestion}</span>
              <span className="opacity-70 text-[8px] uppercase tracking-wide">from gate</span>
            </button>
          )}

          {/* Geography — Geo-2 nested country + sub-geo chips (replaces the scalar editor).
              Slice X: the scalar source.geography column is no longer rendered as a fallback
              pill; an empty subject shows the picker's empty-state prompt instead.
              S2: EDITABLE when onCountriesChange is present; inert (no-op) otherwise.
              S5: GeographyChips always renders its full picker (no self-suppress), so on a
              read-only mount with no geography (Social/Docs/Interviews) it would show an inert
              editor. Guard: render only when the lists carry data OR this is an editable mount
              (real onCountriesChange). Keys on data/handler, never type -> empty-editable News
              still shows the picker; read-only-empty Social suppresses it. */}
          {(core.subjectCountries.length > 0 || core.mentionedCountries.length > 0 || Object.keys(core.subGeographies).length > 0 || onCountriesChange) && (
            <GeographyChips
              subject={core.subjectCountries}
              mentioned={core.mentionedCountries}
              subGeo={core.subGeographies}
              aiUnconfirmed={geoAiUnconfirmed}
              onChange={onCountriesChange ?? (() => {})}
            />
          )}

          {/* Actors — Actor-2 flat typed chips (click-to-cycle type), under geography.
              S2: EDITABLE when onActorsChange is present; inert (no-op) otherwise.
              S5: ActorChips renders a "+ actor" affordance when empty (not nothing), so guard
              the same way as geography -- data present OR editable mount. */}
          {(core.actors.length > 0 || onActorsChange) && (
            <ActorChips
              actors={core.actors}
              aiUnconfirmed={actorsAiUnconfirmed}
              onChange={onActorsChange ?? (() => {})}
            />
          )}
        </div>

        {/* Title. S5: render the block only when there IS a title (Social/Docs/Interviews rows
            can have title=null -> an empty <a>/<p> otherwise); link only when title AND url are
            both present, else plain text. Data-driven: News rows always carry a title, so this
            renders identically for them. */}
        {core.title && (
          core.url ? (
            <a href={core.url} target="_blank" rel="noopener noreferrer"
              className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition line-clamp-2">
              {core.title}
            </a>
          ) : (
            <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{core.title}</p>
          )
        )}

        {/* Snippet */}
        {core.snippet && (
          <p className="text-xs text-gray-500 dark:text-white/50 mt-1 line-clamp-2">{core.snippet}</p>
        )}

        {/* A2: read-only AI section-routing proposal (own row, above PROJECT/TOPIC). */}
        {/* TODO: derive project abbrev when multi-project intel lands */}
        <SectionProposalBadge sections={core.proposedSections} projectAbbrev="CS" />

        {/* S4: incident confirm/adjust (three-state: confirm / not-an-incident / unset). Displays
            the human-else-AI resolved state (core.incident) exactly as New Sources does. EDITABLE
            when onIncidentChange is present; when absent (read-only mount) shows the read-only
            badge only for a resolved incident -- mirrors PipelineSourceCard's branch. No News-side
            enforcement: unset is a valid, non-blocking state (that requirement stays on New Sources). */}
        {onIncidentChange ? (
          <IncidentChip resolved={core.incident} onChange={onIncidentChange} />
        ) : core.incident.isIncident && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">Incident</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              ⚠ Incident{core.incident.state === 'forced' ? ' · added' : ''}
            </span>
          </div>
        )}

        {/* Host-injected interactive elements (News: project-row + gate-error). */}
        {children}
      </div>
    </div>
  )
}
