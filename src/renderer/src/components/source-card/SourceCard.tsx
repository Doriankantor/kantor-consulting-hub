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

export default function SourceCard({ core, children }: { core: SourceCore; children?: ReactNode }) {
  const conf = core.confidence || 'low'
  const confStyle = CONFIDENCE_COLORS[conf as keyof typeof CONFIDENCE_COLORS] || CONFIDENCE_COLORS.low

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
          {core.gateProcessed === 1 && core.relevanceScore == null ? (
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
          {/* Date */}
          <span className="text-xs text-gray-400 dark:text-white/30">{formatDate(core.publishedAt)}</span>

          {/* Geography — Geo-2 nested country + sub-geo chips (replaces the scalar editor).
              Slice X: the scalar source.geography column is no longer rendered as a fallback
              pill; an empty subject shows the picker's empty-state prompt instead.
              S1: INERT (no-op onChange) — editing lands in S2. */}
          <GeographyChips
            subject={core.subjectCountries}
            mentioned={core.mentionedCountries}
            subGeo={core.subGeographies}
            aiUnconfirmed={core.hasGeo}
            onChange={() => {}}
          />

          {/* Actors — Actor-2 flat typed chips (click-to-cycle type), under geography.
              S1: INERT (no-op onChange). */}
          <ActorChips
            actors={core.actors}
            aiUnconfirmed={core.hasActors}
            onChange={() => {}}
          />
        </div>

        {/* Title */}
        {core.url ? (
          <a href={core.url} target="_blank" rel="noopener noreferrer"
            className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition line-clamp-2">
            {core.title}
          </a>
        ) : (
          <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{core.title}</p>
        )}

        {/* Snippet */}
        {core.snippet && (
          <p className="text-xs text-gray-500 dark:text-white/50 mt-1 line-clamp-2">{core.snippet}</p>
        )}

        {/* A2: read-only AI section-routing proposal (own row, above PROJECT/TOPIC). */}
        {/* TODO: derive project abbrev when multi-project intel lands */}
        <SectionProposalBadge sections={core.proposedSections} projectAbbrev="CS" />

        {/* Host-injected interactive elements (News: project-row + gate-error). */}
        {children}
      </div>
    </div>
  )
}
