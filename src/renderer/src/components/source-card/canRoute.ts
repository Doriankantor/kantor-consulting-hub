// Slice 4b: the ONE routability gate. Both the card's RoutabilityMeter and NewsTab's route
// button import THIS function -- there is a single definition of "routable", never two. Pure:
// derives six booleans from an already-built SourceCore, no side effects, no write path.
//
// The six checks mirror Gate 1 (Intel -> New Sources). Each reads a signal surfaced onto core
// (content + confidence_override in Slice 4a; geography_confirmed wired in 4a; incident/tags/ai
// already present). Only ONE check is type-aware -- content -- and that logic is quarantined inside
// hasSubstantiveContent below; every other check is a single cross-type predicate.
import type { SourceCore } from './sourceCore'
import { notesText } from './parse'

// The ONE deliberate type-aware exception in the gate. "Substantive" means something different per
// source type, so the threshold is keyed on type HERE and nowhere else -- canRoute and the meter call
// this uniformly and never branch on type themselves. Uses the SAME notesText() normalizer NewsTab's
// hasArticleText uses, so whitespace/markup collapse identically before measuring.
//   - article:   >= 200 chars  (a real paragraph, well past the ~52-char seeded GDELT snippet)
//   - interview: >= 10 words   (enough transcript to be a real exchange)
//   - social:    non-empty     (a single substantive line is a valid post)
//   - document:  non-empty     (a body just has to exist)
export function hasSubstantiveContent(type: SourceCore['type'], content: string | null): boolean {
  const text = notesText(content ?? null)
  switch (type) {
    case 'article':   return text.length >= 200
    case 'interview': return text.split(/\s+/).filter(Boolean).length >= 10
    case 'social':    return text.length >= 1
    case 'document':  return text.length >= 1
    default:          return text.length >= 1   // unknown type -> permissive non-empty (union is closed today)
  }
}

export interface RouteGate {
  content: boolean
  aiAnalyzed: boolean
  tags: boolean
  confidence: boolean
  geography: boolean
  incident: boolean
  all: boolean
}

// Fixed check order -- shared by the meter (dot order) and the button tooltip (missing list),
// so both surfaces name the six checks identically.
export const ROUTE_CHECKS: { key: Exclude<keyof RouteGate, 'all'>; label: string }[] = [
  { key: 'content',    label: 'Content' },
  { key: 'aiAnalyzed', label: 'AI analysis' },
  { key: 'tags',       label: 'Tags' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'geography',  label: 'Geography' },
  { key: 'incident',   label: 'Incident' },
]

export function canRoute(core: SourceCore): RouteGate {
  const content = hasSubstantiveContent(core.type, core.content)
  // AI analyzed = the AI block is populated. core.analysis.ai is always an object (asObject),
  // so a non-empty key set is the presence signal (=== !!analysis.ai from the audit).
  const aiAnalyzed = Object.keys(core.analysis.ai).length > 0
  const tags = core.thematicTags.length >= 1
  const confidence = core.confidenceOverride === true
  // Geography = human-confirmed AND a real placement. REGIONAL/GLOBAL sentinels live INSIDE
  // subject_countries, so a deliberate level choice makes it non-empty and passes; an
  // empty-but-confirmed row (all chips cleared) FAILS -- a placement is required, not just the flag.
  const geography = core.geographyConfirmed === 1 && core.subjectCountries.length > 0
  // TODO(4b-2): incident is HARDCODED false this slice — its dot renders DIM/pending. The gate/AI
  // does NOT pre-determine incident, so the "AI proposes, human confirms" model has nothing to
  // confirm; 4b-2 replaces "+ Mark as incident" with an explicit two-way "Incident? Yes/No" control
  // and lights this check when the researcher answers EITHER way (persisted human decision). Do NOT
  // wire this to AI-determination (rejected shortcut). The real signal is core.incident.human !== null.
  const incident = false

  // Because incident is hardcoded false, `all` can NEVER be true this slice — DO NOT gate the button
  // on `all` yet (NewsTab uses an interim 5-check gate; TODO(4b-2) flips it back to `all`).
  const all = content && aiAnalyzed && tags && confidence && geography && incident
  return { content, aiAnalyzed, tags, confidence, geography, incident, all }
}
