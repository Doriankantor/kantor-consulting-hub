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
${tagsReuse}Return ONLY JSON with exactly these keys:
{
  "summary": "<A substantive analytical paragraph (roughly 4-7 sentences) narrating what this source reports and what it means for THIS project. Narrate the situation and its significance. Do NOT re-list every figure — named systems, costs, and actors are catalogued separately in capabilities/key_facts below; reference them in prose but do not duplicate the full list.>",
  "relevance_score": <integer 0-10>,
  "relevance_reasoning": "<ONE or TWO sentences ONLY — the relevance verdict. Name the keyword/scope it matches, or why it falls outside the framework. This is the justification, NOT a summary. E.g. 'Relevant: describes UAS procurement by a state actor in the LATAM region.' or 'Not relevant: consumer drone photography, no security dimension.'>",
  "suggested_tags": ["<short topical tag>", "..."],
  "article_type": "<one of the article_type values above>",
  "capabilities": [ { "system": "<exact name>", "actor": "<if stated>", "actor_type": "VNSA|state|commercial|unknown", "cost": "<if stated>", "category": "<if determinable>", "relationship": "operates|acquired|supplies|develops|counters" } ],
  "key_facts": [ { "label": "<clear label>", "value": "<exact value from the source>" } ]
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
  return out
}

function errMsg(e: unknown): string {
  return String((e as Error)?.message || e).slice(0, 200)
}
