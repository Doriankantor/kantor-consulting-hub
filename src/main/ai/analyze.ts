// ─────────────────────────────────────────────────────────────────────────────
// Shared, project-aware Claude analysis helper (Intelligence restructure — 2a).
//
// One reusable main-process function that the Intelligence AI features will call:
//   • 'relevance'  — interview/article text → relevance_score (0-10) + reasoning
//   • 'reconcile'  — document text + researcher notes → integrated summary + score
//
// This slice adds the helper ONLY. Existing AI call sites (classifyUnscoredArticles,
// rescoreUnscored, uploadDocument's inline analysis) are intentionally left as-is —
// they get migrated onto this helper in a later slice, not now.
//
// Design notes:
//   • Key handling is NOT reinvented — it reuses ipc's resolveAnthropicKey().
//   • Client construction + JSON extraction mirror the existing relevance-gate code.
//   • The function NEVER throws — it always resolves the {ok} union.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import { resolveAnthropicKey } from '../ipc'

// Current model. This matches the live relevance-gate / classify path, whose
// constant is GATE_MODEL = 'claude-haiku-4-5' in ipc/index.ts — a current Haiku 4.5
// id. We deliberately do NOT copy the stale 'claude-opus-4-5' string still present
// in the older bespoke call sites. Bump this SINGLE const (e.g. to 'claude-opus-4-8')
// if reconcile needs more headroom than Haiku provides.
const MODEL = 'claude-haiku-4-5'

export type AnalyzeTask = 'relevance' | 'reconcile'

export interface ProjectConfig {
  name?: string
  keywords?: string
  scope?: string
}

export interface AnalyzeOpts {
  task: AnalyzeTask
  text: string
  projectConfig?: ProjectConfig | null
  userNotes?: string | null
  // T7: the project's existing thematic vocabulary (threaded from the renderer's
  // already-loaded knownThematic). When present, the prompt nudges the model to
  // reuse these before coining new tags. Empty/absent → unchanged behaviour.
  existingTags?: string[]
  // Reconcile refinement: the source's EXISTING analysis_json.ai block (B1
  // structured extraction). When present, the reconcile prompt narrates FROM
  // the already-extracted capabilities[]/key_facts[] instead of re-deriving
  // them from raw text. Absent/empty → prompt unchanged (re-derives as before).
  priorAi?: Record<string, unknown> | null
}

export interface AnalyzeResult {
  relevance_score?: number
  relevance_reasoning?: string
  summary?: string
  suggested_tags?: string[]
  // Path-B B1: structured identifiers (extraction only; no UI yet). Populated on the
  // relevance/analyze path when the source explicitly states them — empty otherwise.
  article_type?: string
  capabilities?: Array<{ system: string; actor?: string; actor_type?: string; cost?: string; category?: string; relationship?: string }>
  key_facts?: Array<{ label: string; value: string }>
  // Restructure step 2 (slice A1): AI section-routing proposal. The model proposes
  // which of the nine page sections a source belongs in (one-to-many) plus an
  // acquisition-channel classification. Advisory only — the researcher confirms in
  // the New-sources UI (A2). Persisted to a NEW analysis_json.routing sibling, NOT
  // into .ai and NOT into info_page_sources.
  proposed_sections?: Array<{ section: string; confidence: 'high' | 'medium' | 'low' }>
  channel?: 'state-procurement' | 'commercial-retail' | 'n/a'
  routing_reasoning?: string
  // Restructure step 2 (Geo-1): geography axis — two bare-country-name lists (a DIFFERENT
  // axis from sections). subject_countries = what the story is ABOUT (generate placements);
  // mentioned_countries = named-but-peripheral (metadata). Persisted to the two
  // intelligence_sources COLUMNS via saveAiAnalysis, NOT into analysis_json, NOT scalar geography.
  subject_countries?: string[]
  mentioned_countries?: string[]
  // Restructure step 2 (Actor-1): actor axis — the named actors this document ENGAGES, each
  // typed. A DIFFERENT axis from geography/sections. Consolidated from capabilities[].actor +
  // prose. Persisted to the intelligence_sources `actors` COLUMN via saveAiAnalysis (JSON-string),
  // NOT into analysis_json, and NOT into the social actors_mentioned column.
  actors?: { name: string; type: string }[]
}

export type AnalyzeResponse =
  | { ok: true; result: AnalyzeResult }
  | { ok: false; error: string }

export async function analyzeWithClaude(opts: AnalyzeOpts): Promise<AnalyzeResponse> {
  try {
    const text = (opts?.text ?? '').trim()
    if (!text) return { ok: false, error: 'No text provided to analyze.' }

    // Reuse existing key handling (user pref → global setting → admin account).
    const apiKey = resolveAnthropicKey()
    if (!apiKey) return { ok: false, error: 'No Anthropic API key configured.' }

    const client = new Anthropic({ apiKey })
    const { system, user } = buildPrompt(opts.task, text, opts.projectConfig, opts.userNotes, opts.existingTags, opts.priorAi)

    let raw = ''
    try {
      // max_tokens 4096: B1's structured output (capabilities[] + key_facts[]) is larger
      // than the old summary/tags-only response and was truncating at 1024 → parse fail.
      // timeout 60s: a stalled request can't hang the spinner forever (SDK default is ~10min).
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      }, { timeout: 60000 })
      raw = msg?.content?.[0]?.type === 'text' ? msg.content[0].text : ''
    } catch (e) {
      const m = errMsg(e)
      console.warn('[analyze] API error:', m)
      const timedOut = /timed?\s*out|timeout|ETIMEDOUT|aborted/i.test(m)
      return { ok: false, error: timedOut ? 'AI request timed out' : `AI request failed: ${m}` }
    }

    // Robust JSON extraction — first '{' to last '}', same idiom as the gate.
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      console.warn('[analyze] JSON parse failed (no JSON object in response). Raw:', raw.slice(0, 500))
      return { ok: false, error: 'AI response could not be parsed.' }
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>
    } catch {
      console.warn('[analyze] JSON parse failed (invalid/truncated JSON). Raw:', raw.slice(0, 500))
      return { ok: false, error: 'AI response could not be parsed.' }
    }

    return { ok: true, result: normalizeResult(parsed) }
  } catch (e) {
    // Absolute backstop — the helper must never throw to its caller.
    return { ok: false, error: errMsg(e) }
  }
}

// ── Prompt construction ──────────────────────────────────────────────────────

// A project-aware context block so relevance/summary is judged against THIS
// project's collection framework (name + keywords + scope), not generically.
function projectBlock(pc?: ProjectConfig | null): string {
  const parts: string[] = []
  if (pc?.name) parts.push(`Project: ${pc.name}`)
  if (pc?.scope) parts.push(`Scope / editorial framing: ${pc.scope}`)
  if (pc?.keywords) parts.push(`Collection keywords: ${pc.keywords}`)
  return parts.length
    ? parts.join('\n')
    : 'No specific project framework was provided — assess against general security-intelligence relevance.'
}

// T7: an existing-vocabulary block that nudges the model to REUSE the project's
// current thematic tags before coining near-duplicates. Empty string when the
// project has no vocabulary yet (new project) — leaves the prompt unchanged.
function tagReuseBlock(existingTags?: string[]): string {
  const tags = (existingTags ?? []).filter(Boolean)
  if (!tags.length) return ''
  return `EXISTING PROJECT TAGS (reuse these where they fit):
${tags.join(', ')}

When suggesting thematic tags, PREFER reusing tags from the existing list above when one accurately captures a concept in the source. Only propose a NEW tag when none of the existing tags fit. Match the existing tags' style (lowercase, hyphenated). Return 3-6 tags total.

`
}

// Reconcile refinement: an already-extracted-structure block. The specifics were
// extracted verbatim on the relevance pass (B1) — reconcile should REFERENCE them,
// not re-derive them from prose. Empty string when there's no prior structure
// (e.g. researcher reconciles without ever running Analyze) — prompt unchanged.
function priorStructureBlock(priorAi?: Record<string, unknown> | null): string {
  if (!priorAi || typeof priorAi !== 'object') return ''
  const articleType = typeof (priorAi as any).article_type === 'string' ? (priorAi as any).article_type.trim() : ''
  const caps = Array.isArray((priorAi as any).capabilities) ? (priorAi as any).capabilities : []
  const facts = Array.isArray((priorAi as any).key_facts) ? (priorAi as any).key_facts : []
  if (!articleType && !caps.length && !facts.length) return ''
  const lines: string[] = []
  if (articleType) lines.push(`Article type: ${articleType}`)
  if (caps.length) {
    lines.push('Systems / capabilities already extracted (VERBATIM from this source):')
    for (const c of caps) {
      if (!c || typeof c !== 'object') continue
      const parts = [String((c as any).system ?? '').trim()].filter(Boolean)
      for (const k of ['actor', 'actor_type', 'cost', 'category', 'relationship']) {
        const v = (c as any)[k]
        if (v != null && String(v).trim()) parts.push(`${k}: ${String(v).trim()}`)
      }
      if (parts.length) lines.push(`- ${parts.join(' | ')}`)
    }
  }
  if (facts.length) {
    lines.push('Key facts already extracted (VERBATIM from this source):')
    for (const f of facts) {
      if (!f || typeof f !== 'object') continue
      const label = String((f as any).label ?? '').trim()
      const value = String((f as any).value ?? '').trim()
      if (label && value) lines.push(`- ${label}: ${value}`)
    }
  }
  if (!lines.length) return ''
  return `ALREADY-EXTRACTED STRUCTURE FOR THIS SOURCE (do not re-derive; narrate FROM this):
${lines.join('\n')}

These specifics were extracted verbatim from the source in a prior pass and are
already catalogued and displayed separately. Write your reconciled narrative so it
REFERENCES these precisely — use the exact system names, actors and figures above
rather than abstracting them into generic descriptions. Do NOT re-list the full
catalogue in the prose. Do NOT invent specifics that are not above or in the source.

`
}

function buildPrompt(
  task: AnalyzeTask,
  text: string,
  projectConfig?: ProjectConfig | null,
  userNotes?: string | null,
  existingTags?: string[],
  priorAi?: Record<string, unknown> | null,
): { system: string; user: string } {
  const system =
    'You are an intelligence analyst assistant for a security-focused consultancy. ' +
    'You judge and summarize source material against a specific monitoring project\'s ' +
    'collection framework. Respond with STRICT JSON ONLY — no prose, no markdown, no code fences.'

  const context = projectBlock(projectConfig)
  const body = text.slice(0, 8000) // cost/context cap, matches the doc-analysis path
  const tagsReuse = tagReuseBlock(existingTags) // T7: '' when no existing vocabulary
  const priorStructure = priorStructureBlock(priorAi) // '' when no prior extraction

  if (task === 'reconcile') {
    const notes = (userNotes ?? '').trim()
    return {
      system,
      user: `${context}

A researcher reviewed the following source and added their own interpretation. Integrate the
researcher's notes into your analysis — weigh their interpretation, do not ignore it — and produce
a reconciled assessment for this project.
${priorStructure}${tagsReuse}Return ONLY JSON with exactly these keys:
{
  "summary": "<A substantive reconciled analytical paragraph (roughly 4-7 sentences) that integrates the researcher's notes with your analysis. Narrate the situation and its significance for THIS project. Where structure was already extracted above, REFERENCE those exact system names / actors / figures rather than abstracting them — but do NOT re-list the full catalogue.>",
  "relevance_score": <integer 0-10 for this project's relevance>,
  "relevance_reasoning": "<one or two sentences>",
  "suggested_tags": ["<short topical tag>", "..."]
}

Researcher notes:
${notes || '(none provided)'}

Source:
${body}`,
    }
  }

  // task === 'relevance'
  return {
    system,
    user: `${context}

Assess how relevant the following source is to THIS project's framework. You MUST always justify
the score in relation to this project — even when the source is highly relevant OR clearly
irrelevant, state the project-specific reason (which of the project's keywords/scope it matches,
or exactly why it falls outside the framework).

CRITICAL — Only report what the source actually states. Never infer, estimate, guess, or invent any identifier. If the source doesn't provide something, omit it — do NOT pad the summary with "unknown"/"not specified" for missing fields. Fabricated intelligence is worse than missing intelligence; accuracy about what's known matters more than completeness. Never estimate casualty numbers or name a system/actor the source doesn't.

Write your analytical narrative into the "summary" field below (NOT into relevance_reasoning, which is the short relevance verdict). Where the source clearly provides them, weave these identifiers into that summary:
- Always when stated: event date (distinct from publish date), location (as specific as given: country > region > city), central actors, and why it matters for the project (contested-airspace significance).
- For incident/attack articles: UAS system used, weaponization/payload (or ISR-only), perpetrator and target, casualties (exact figures only), and whether it's a novel/first-documented tactic.
- For legal/regulatory/policy articles: jurisdiction, the measure (ban/restriction/licensing/counter-UAS authority/airspace rule), its status (proposed/passed/enacted), what it regulates, and effective date/timeline.
- For procurement/acquisition articles: acquirer, system acquired (and quantity if stated), supplier/origin, and deal type (purchase/transfer/domestic production/smuggled).
- For counter-UAS, tech-development, industry/supplier, or airspace-governance articles: the relevant specifics the source provides (who, what system/capability, against what, effectiveness or significance).

This is guidance, not a checklist to fill — extract the identifiers that fit THIS article's nature, only what the source supports. Most of the value is in the summary prose; structured identifiers enrich it when present.

Also extract STRUCTURED IDENTIFIERS as JSON fields (separate from the prose summary):

"article_type": one of "incident" | "regulatory" | "procurement" | "counter-uas" | "innovation" | "legal" | "governance" | "other" — classify the article's primary nature.

"capabilities": an array of drone/counter-drone SYSTEMS the source describes, with WHO is associated with each. Populate ONLY when the source names or clearly describes specific systems (typical for incident/procurement/innovation/counter-uas articles; usually empty for pure regulatory/legal articles). Each entry:
  { "system": exact named platform/product VERBATIM (e.g. "SkyFend counter-drone jammer", "QR-07S3 Digital Eagle anti-drone gun", "Mohajer-6") — NOT a category,
    "actor": the group/entity associated (e.g. "CJNG", "Sinaloa Cartel") if stated,
    "actor_type": "VNSA" | "state" | "commercial" | "unknown" — only classify if determinable from the source; use "unknown" if unclear,
    "cost": exact figure if stated (e.g. "$100,000", "$20,000/unit"), else omit,
    "category": e.g. "C-UAS", "strike-UAS", "ISR-UAS", "payload" if determinable,
    "relationship": "operates" | "acquired" | "supplies" | "develops" | "counters" — the actor's relationship to the system }

"key_facts": an array of { "label", "value" } capturing the type-appropriate specifics that DON'T fit capabilities — for regulatory: jurisdiction/measure/status/effective-date; for legal/LOAC: framework/concern/actors; for governance: parties/dispute/jurisdiction; plus event dates, locations, casualties (exact figures), etc. Use clear labels.

CRITICAL for all structured fields: report ONLY what the source explicitly states. NEVER invent a system name, actor, cost, figure, or classification. If the source doesn't describe systems, return "capabilities": []. If nothing fits key_facts, return "key_facts": []. Empty is correct and expected — fabricated structured data is far worse than empty fields. Preserve names and numbers VERBATIM; never abstract them.

SECTION ROUTING. Propose which of these NINE page sections the source belongs in. Judge by what each section MEASURES, not by keywords. A source usually touches MORE THAN ONE.
  systems    — the drone / counter-drone systems themselves: platforms, ranges, payloads, C-UAS performance, state-held military UAS. (C-UAS and state-platform sources DEFAULT here.)
  vnsa       — violent NON-STATE actors using/holding UAS (cartels, FARC/ELN/CJNG, armed groups).
  industry   — innovation, domestic development, manufacturing, the technology base.
  external   — EXTRA-REGIONAL actors: foreign states/suppliers (Iran, China, Russia, Europe) as suppliers, aligners, or threats.
  supply     — supply chains & transfers: how systems/technology move (transfers, channels, exports).
  investment — money: procurement buys, budgets, investment signals, acquisitions.
  legal      — regulation, governance, legal frameworks, compliance, reorganizations, deregulation.
  civilian   — civilian/commercial impact: civilian casualties/targets, airport & airspace security, UTM, commercial use, civilian compliance.
  logistics  — ILLICIT logistics: contraband delivery, prison drops, ground routes, interdictions/seizures.

ROUTING RULES:
- Return a SET (one-to-many). Most sources touch 2+ sections.
- A country being named does NOT by itself select a section — geography is a separate axis. Do not route to a section just because a place is mentioned.
- If the source describes a dated/located UAS EVENT, set channel appropriately AND still place it in the section(s) it substantiates (usually vnsa if a non-state actor, systems if a state actor).
- A source's actor_type=VNSA is strong evidence FOR proposing vnsa, but PROPOSE it — do not treat it as automatic. The researcher confirms.
- external vs supply: use channel. State procurement/transfer leans external+supply; commercial/retail export leans supply.

CHANNEL: classify the source's acquisition/transfer nature as exactly one of:
  "state-procurement"  (a state acquires/transfers, or a military/government buy),
  "commercial-retail"  (commercial/retail/export/civilian purchase),
  "n/a"                (no acquisition/transfer dimension).

GEOGRAPHY (two separate lists — this is a DIFFERENT axis from sections).
  subject_countries  — countries the story is genuinely ABOUT: where the event happened, whose
                       capability/actors/policy is the subject. ONLY these will generate page
                       placements. Usually 1, sometimes 2.
  mentioned_countries — countries NAMED but peripheral: a supplier referenced in passing, a
                       comparison, a country whose official merely commented. Metadata only.
RULES:
- Use BARE country names, normalized and in English: "Colombia", "Mexico", "Venezuela", "Iran",
  "China", "United States". NOT codes, NOT adjectives ("Colombian"→"Colombia"), NOT sub-regions
  (a department/city/border goes to its COUNTRY here; sub-geography is handled elsewhere).
- A country belongs in AT MOST ONE list. If it's the subject, it is NOT also "mentioned".
- Example: a FARC drone attack in Cauca that mentions Iranian-supplied parts →
  subject_countries: ["Colombia"], mentioned_countries: ["Iran"].
- Example: Venezuela fields Iranian Mohajer-6 drones → subject_countries: ["Venezuela"],
  mentioned_countries: ["Iran"]  (Venezuela is the subject; Iran is the supplier mentioned).
- If genuinely unsure whether a country is subject or mentioned, prefer subject only when the
  story is substantively about events/actors IN that country; otherwise mentioned.

ACTORS. List every named actor the document ENGAGES — not only incident perpetrators. This axis is
"which actors is this document about / dealing with," which matters as much for ANALYTICAL pieces as
for incidents.
  - INCIDENT article: the perpetrator, the target, and any responder named (all are engaged actors).
  - ANALYTICAL / think-tank article (e.g. on VNSAs challenging state authority): list BOTH the VNSAs
    discussed AND the state actors responding/countering/investing — even with no single "perpetrator."
Consolidate from BOTH the structured capabilities AND the prose (summary/key_facts) — an actor named
only in prose (e.g. a responding unit, a state agency, a group referenced in analysis) still counts.
Each entry = { "name": "<canonical short name>", "type": "<one of: VNSA | state | extra-regional | commercial>" }:
  - VNSA — armed groups, cartels, guerrillas, criminal orgs (FARC/EMC, ELN, CJNG, Comando Vermelho…).
  - state — governments, militaries, ministries, state agencies (Colombian state, Venezuelan Air Force,
    a Ministry of Security…). Name the specific state actor where the text does.
  - extra-regional — foreign states/backers/suppliers outside LATAM (Iran, China, Russia, the US as
    an external actor).
  - commercial — companies, manufacturers, vendors (a drone maker, a defense contractor).
Keep DISTINCT groups distinct (don't merge ELN and FARC; don't collapse different cartels). Use a
canonical short name. If the same actor appears twice, list once.

THEMATIC TAGS (suggested_tags). DO NOT suggest country, region, or place names as thematic tags
(no "colombia", "brazil", "ukraine", "russia", "latam", "europe", "cauca", etc.). Geography is
captured separately in subject_countries / mentioned_countries — never as a thematic tag. Thematic
tags describe WHAT KIND of thing the source is (weaponized-drone, counter-uas, technology-transfer,
regulation), not WHERE it happened.
${tagsReuse}Return ONLY JSON with exactly these keys:
{
  "summary": "<A substantive analytical paragraph (roughly 4-7 sentences) narrating what this source reports and what it means for THIS project. Narrate the situation and its significance. Do NOT re-list every figure — named systems, costs, and actors are catalogued separately in capabilities/key_facts below; reference them in prose but do not duplicate the full list.>",
  "relevance_score": <integer 0-10>,
  "relevance_reasoning": "<ONE or TWO sentences ONLY — the relevance verdict. Name the keyword/scope it matches, or why it falls outside the framework. This is the justification, NOT a summary. E.g. 'Relevant: describes UAS procurement by a state actor in the LATAM region.' or 'Not relevant: consumer drone photography, no security dimension.'>",
  "suggested_tags": ["<short topical tag>", "..."],
  "article_type": "<one of the article_type values above>",
  "capabilities": [ { "system": "<exact name>", "actor": "<if stated>", "actor_type": "VNSA|state|commercial|unknown", "cost": "<if stated>", "category": "<if determinable>", "relationship": "operates|acquired|supplies|develops|counters" } ],
  "key_facts": [ { "label": "<clear label>", "value": "<exact value from the source>" } ],
  "proposed_sections": [ { "section": "<one of: systems|vnsa|industry|external|supply|investment|legal|civilian|logistics>", "confidence": "high|medium|low" } ],
  "channel": "state-procurement | commercial-retail | n/a",
  "routing_reasoning": "<ONE short sentence — why these sections. Do NOT write a paragraph per section.>",
  "subject_countries": [ "<bare country name>" ],
  "mentioned_countries": [ "<bare country name>" ],
  "actors": [ { "name": "<actor>", "type": "VNSA | state | extra-regional | commercial" } ]
}

Source:
${body}`,
  }
}

// ── Output normalization ─────────────────────────────────────────────────────

// Coerce the parsed model output into the AnalyzeResult shape defensively — clamp
// the score, cap string lengths, and sanitize the tag list. Missing keys are just
// omitted (each task only populates the keys it asked for).
function normalizeResult(parsed: Record<string, unknown>): AnalyzeResult {
  const out: AnalyzeResult = {}

  if (parsed.relevance_score !== undefined && parsed.relevance_score !== null) {
    const s = Number(parsed.relevance_score)
    if (Number.isFinite(s)) out.relevance_score = Math.max(0, Math.min(10, Math.round(s)))
  }
  if (parsed.relevance_reasoning != null) {
    out.relevance_reasoning = String(parsed.relevance_reasoning).slice(0, 1000)
  }
  if (parsed.summary != null) {
    out.summary = String(parsed.summary).slice(0, 4000)
  }
  if (Array.isArray(parsed.suggested_tags)) {
    out.suggested_tags = parsed.suggested_tags
      .map(t => String(t).trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 20)
  }
  // Path-B B1: structured identifiers — pass through with light validation. Missing
  // arrays default to []; the model is told empty is correct when nothing is stated.
  if (typeof parsed.article_type === 'string' && parsed.article_type.trim()) {
    out.article_type = parsed.article_type.trim().slice(0, 40)
  }
  if (Array.isArray(parsed.capabilities)) {
    out.capabilities = (parsed.capabilities as unknown[])
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as any).system === 'string' && !!(c as any).system.trim())
      .map(c => {
        const cap: { system: string; actor?: string; actor_type?: string; cost?: string; category?: string; relationship?: string } = {
          system: String((c as any).system).trim().slice(0, 200),
        }
        for (const k of ['actor', 'actor_type', 'cost', 'category', 'relationship'] as const) {
          const v = (c as any)[k]
          if (v != null && String(v).trim()) cap[k] = String(v).trim().slice(0, 200)
        }
        return cap
      })
      .slice(0, 20)
  } else {
    out.capabilities = []
  }
  if (Array.isArray(parsed.key_facts)) {
    out.key_facts = (parsed.key_facts as unknown[])
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && typeof (f as any).label === 'string' && typeof (f as any).value === 'string' && !!(f as any).label.trim() && !!(f as any).value.trim())
      .map(f => ({ label: String((f as any).label).trim().slice(0, 100), value: String((f as any).value).trim().slice(0, 500) }))
      .slice(0, 30)
  } else {
    out.key_facts = []
  }
  // Restructure A1: section-routing proposal — validate defensively, never throw.
  const VALID_SECTIONS = new Set(['systems', 'vnsa', 'industry', 'external', 'supply', 'investment', 'legal', 'civilian', 'logistics'])
  const VALID_CONF = new Set(['high', 'medium', 'low'])
  const VALID_CHANNEL = new Set(['state-procurement', 'commercial-retail', 'n/a'])
  if (Array.isArray(parsed.proposed_sections)) {
    const seen = new Set<string>()
    out.proposed_sections = (parsed.proposed_sections as unknown[])
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).section === 'string')
      .map(p => ({ section: String((p as any).section).trim().toLowerCase(), confidence: String((p as any).confidence ?? '').trim().toLowerCase() }))
      .filter(p => VALID_SECTIONS.has(p.section))
      .map(p => ({ section: p.section, confidence: (VALID_CONF.has(p.confidence) ? p.confidence : 'medium') as 'high' | 'medium' | 'low' }))
      .filter(p => { if (seen.has(p.section)) return false; seen.add(p.section); return true })
      .slice(0, 9)
  } else {
    out.proposed_sections = []
  }
  if (typeof parsed.channel === 'string' && VALID_CHANNEL.has(parsed.channel.trim().toLowerCase())) {
    out.channel = parsed.channel.trim().toLowerCase() as 'state-procurement' | 'commercial-retail' | 'n/a'
  } else {
    out.channel = 'n/a'
  }
  if (parsed.routing_reasoning != null) {
    out.routing_reasoning = String(parsed.routing_reasoning).trim().slice(0, 600)
  } else {
    out.routing_reasoning = ''
  }
  // Geo-1: two bare-country-name lists. Clean strings, de-dupe case-insensitively within each
  // list, cap at 12, then enforce mutual exclusion (subject wins over mentioned). No canonical
  // country dictionary in v1 — just trimmed strings. Never throws; absent/invalid → [].
  const cleanCountryList = (v: unknown): string[] => {
    if (!Array.isArray(v)) return []
    const seen = new Set<string>(), out2: string[] = []
    for (const raw of v) {
      const s = String(raw ?? '').trim().slice(0, 60)
      if (!s) continue
      const key = s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key); out2.push(s)
      if (out2.length >= 12) break
    }
    return out2
  }
  const subj = cleanCountryList(parsed.subject_countries)
  const subjKeys = new Set(subj.map(s => s.toLowerCase()))
  // Mutual exclusion: a country in subject_countries is removed from mentioned_countries.
  const mentioned = cleanCountryList(parsed.mentioned_countries).filter(m => !subjKeys.has(m.toLowerCase()))
  out.subject_countries = subj
  out.mentioned_countries = mentioned
  // Actor-1: named actors, each typed. Fail-safe never-throw. Each item must be an object with a
  // non-empty string name (trim). type is lowercase-compared to the four valid values; a match keeps
  // the canonical cased value, anything missing/invalid becomes 'unknown' (we KEEP the actor — a named
  // actor with a bad type is recoverable; a dropped one is invisible). De-dupe by name (case-insensitive),
  // cap at 20. Absent/invalid → [].
  const VALID_ACTOR_TYPE = new Map<string, string>([
    ['vnsa', 'VNSA'], ['state', 'state'], ['extra-regional', 'extra-regional'], ['commercial', 'commercial'],
  ])
  if (Array.isArray(parsed.actors)) {
    const seenActors = new Set<string>()
    out.actors = (parsed.actors as unknown[])
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map(a => ({ name: String((a as any).name ?? '').trim().slice(0, 120), type: String((a as any).type ?? '').trim().toLowerCase() }))
      .filter(a => a.name.length > 0)
      .map(a => ({ name: a.name, type: VALID_ACTOR_TYPE.get(a.type) ?? 'unknown' }))
      .filter(a => { const k = a.name.toLowerCase(); if (seenActors.has(k)) return false; seenActors.add(k); return true })
      .slice(0, 20)
  } else {
    out.actors = []
  }
  return out
}

function errMsg(e: unknown): string {
  return String((e as Error)?.message || e).slice(0, 200)
}
