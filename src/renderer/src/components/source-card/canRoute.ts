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
  // TYPE EXEMPTION (the ONLY one besides content): social is EXEMPT from the AI-analysis gate --
  // social defaults to manual entry (AI read is deferred for social), so it routes on the
  // researcher's manual notes without requiring an AI pass. Scoped to social + aiAnalyzed ONLY;
  // do NOT generalize. The meter hides the AI dot for social so it isn't misleadingly shown lit.
  const aiAnalyzed = core.type === 'social' ? true : Object.keys(core.analysis.ai).length > 0
  const tags = core.thematicTags.length >= 1
  const confidence = core.confidenceOverride === true
  // Geography = human-confirmed AND a real placement. REGIONAL/GLOBAL sentinels live INSIDE
  // subject_countries, so a deliberate level choice makes it non-empty and passes; an
  // empty-but-confirmed row (all chips cleared) FAILS -- a placement is required, not just the flag.
  const geography = core.geographyConfirmed === 1 && core.subjectCountries.length > 0
  // Capstone slice 1 (was the 4b-2 TODO): incident is now a REAL, REQUIRED check on all four types.
  // The signal is the researcher's resolved decision — core.incident.human is true (confirm/force)
  // or false (not an incident) once they answer the IncidentChip; null means unanswered. Answering
  // EITHER way satisfies the gate (a deliberate decision was made); unanswered blocks routing. This
  // is NOT wired to AI-determination (rejected shortcut) — only the persisted human flag counts.
  const incident = core.incident.human !== null

  // Every check is now live, so `all` is the real gate — the card meter and every tab's route/approve
  // button read it (single source of truth). No interim subset any more.
  const all = content && aiAnalyzed && tags && confidence && geography && incident
  return { content, aiAnalyzed, tags, confidence, geography, incident, all }
}
