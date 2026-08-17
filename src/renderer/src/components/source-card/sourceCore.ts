// The canonical, ROW-PURE source model behind the unified SourceCard.
//
// fromIntelligenceSource(row) does ALL the parsing NewsTab used to do inline in visible.map
// (NewsTab.tsx:1404-1445), so the card shell receives clean typed values -- never raw JSON
// strings. It reuses the SAME parse helpers (./parse) and the SAME resolvers
// (../../pages/Intelligence/resolveAnalysis) the tabs use, so behavior is byte-identical.
//
// ROW-PURE: no session/host state here. In particular the "aiUnconfirmed" amber cue is host
// session state (countriesTouched / actorsTouched) -- the model only exposes hasGeo / hasActors
// and the permanent geographyConfirmed flag; the shell/host layers any session logic (S2).
//
// status (review status) and a placement's stage stay SEPARATE. This slice needs only status
// (News); a later placement overlay carries stage.
import { readTags, safeParseObject, safeParseObjectArray, parseAnalysis, notesText } from './parse'
import { resolveCaps, resolveFacts, resolveIncident } from '../../pages/Intelligence/resolveAnalysis'
import type { ResolvedCap, ResolvedFact, ResolvedIncident } from '../../pages/Intelligence/resolveAnalysis'

export interface SourceCore {
  // ── identity ──
  id: string
  type: IntelligenceSource['type']
  title: string | null
  url: string | null
  snippet: string | null
  sourceName: string | null
  publishedAt: string | null
  language: string | null
  imageUrl: string | null            // thumbnail on the card face

  // ── header badges ──
  relevanceScore: number | null
  relevanceType: string | null
  status: IntelligenceSource['status']   // review status (NOT placement stage)
  confidence: 'high' | 'medium' | 'low' | null
  confidenceOverride: boolean            // confidence_override === 1: human-confirmed the confidence
  hasContent: boolean                    // shared `content` column non-empty (cross-type gate check)
  addedByName: string | null             // drives the origin badges + framework-fixed cue
  gateProcessed: number
  gateReasoning: string | null
  usedInPage: string | null
  usedInPageAt: string | null

  // ── geography ──
  subjectCountries: string[]
  mentionedCountries: string[]
  subGeographies: Record<string, string[]>
  hasGeo: boolean                        // lists non-empty
  geographyConfirmed: number             // permanent row flag: 0 = AI proposal, 1 = human-confirmed
  region: string | null                  // gate's scalar geography (canonical country, or REGIONAL/GLOBAL sentinel)

  // ── actors ──
  actors: { name: string; type: string }[]
  hasActors: boolean

  // ── analysis (parsed once) ──
  analysis: {
    ai: Record<string, any>
    human: Record<string, any>
    routing: Record<string, any>
    reconciled: Record<string, any> | undefined
  }
  proposedSections: { section: string; confidence?: 'high' | 'medium' | 'low' }[]
  humanRel: string | undefined
  articleType: string | undefined
  incident: ResolvedIncident
  caps: ResolvedCap[]
  facts: ResolvedFact[]
  suggestedTags: string[]
  reconciledSuggestedTags: string[]

  // ── tags ──
  thematicTags: string[]
  dispositionTags: string[]

  // ── notes ──
  intelNotesFilled: boolean
}

// Local mirror of resolveAnalysis's asObject guard (kept private; the resolvers export only fns).
function asObject(x: unknown): Record<string, any> {
  return (x && typeof x === 'object' && !Array.isArray(x)) ? (x as Record<string, any>) : {}
}
function stringArray(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string') : []
}

export function fromIntelligenceSource(row: IntelligenceSource): SourceCore {
  const analysis = parseAnalysis(row.analysis_json)
  const ai = asObject(analysis.ai)
  const human = asObject(analysis.human)
  const routing = asObject(analysis.routing)
  const reconciled = analysis.reconciled != null ? asObject(analysis.reconciled) : undefined

  const subjectCountries = readTags(row.subject_countries ?? null)
  const mentionedCountries = readTags(row.mentioned_countries ?? null)
  const actors = safeParseObjectArray(row.actors)

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    url: row.url,
    snippet: row.snippet,
    sourceName: row.source_name,
    publishedAt: row.published_at,
    language: row.language,
    imageUrl: row.image_url,

    relevanceScore: row.relevance_score,
    relevanceType: row.relevance_type,
    status: row.status,
    confidence: row.confidence,
    confidenceOverride: row.confidence_override === 1,
    hasContent: (row.content ?? '').trim().length > 0,
    addedByName: row.added_by_name,
    gateProcessed: row.gate_processed,
    gateReasoning: row.gate_reasoning,
    usedInPage: row.used_in_page,
    usedInPageAt: row.used_in_page_at,

    subjectCountries,
    mentionedCountries,
    subGeographies: safeParseObject(row.sub_geographies),
    hasGeo: subjectCountries.length > 0 || mentionedCountries.length > 0,
    geographyConfirmed: row.geography_confirmed,
    region: row.region,

    actors,
    hasActors: actors.length > 0,

    analysis: { ai, human, routing, reconciled },
    proposedSections: Array.isArray(routing.proposed_sections) ? routing.proposed_sections : [],
    humanRel: (human as { relevance?: string }).relevance,
    articleType: typeof ai.article_type === 'string' ? ai.article_type : undefined,
    incident: resolveIncident(analysis),
    caps: resolveCaps(analysis),
    facts: resolveFacts(analysis),
    suggestedTags: stringArray(ai.suggested_tags),
    reconciledSuggestedTags: reconciled ? stringArray(reconciled.suggested_tags) : [],

    thematicTags: readTags(row.thematic_tags),
    dispositionTags: readTags(row.disposition_tags),

    intelNotesFilled: notesText(row.intel_notes).length > 0,
  }
}
