// ─────────────────────────────────────────────────────────────────────────────
// Shared, project-aware Claude analysis helper (Intelligence restructure — 2a).
//
// One reusable main-process function that the Intelligence AI features will call:
//   • 'summarize'  — social/URL text → concise summary + suggested tags
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
// if summarize/reconcile need more headroom than Haiku provides.
const MODEL = 'claude-haiku-4-5'

export type AnalyzeTask = 'summarize' | 'relevance' | 'reconcile'

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
}

export interface AnalyzeResult {
  relevance_score?: number
  relevance_reasoning?: string
  summary?: string
  suggested_tags?: string[]
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
    const { system, user } = buildPrompt(opts.task, text, opts.projectConfig, opts.userNotes)

    let raw = ''
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
      })
      raw = msg?.content?.[0]?.type === 'text' ? msg.content[0].text : ''
    } catch (e) {
      return { ok: false, error: `AI request failed: ${errMsg(e)}` }
    }

    // Robust JSON extraction — first '{' to last '}', same idiom as the gate.
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return { ok: false, error: 'AI response could not be parsed.' }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>
    } catch {
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

function buildPrompt(
  task: AnalyzeTask,
  text: string,
  projectConfig?: ProjectConfig | null,
  userNotes?: string | null,
): { system: string; user: string } {
  const system =
    'You are an intelligence analyst assistant for a security-focused consultancy. ' +
    'You judge and summarize source material against a specific monitoring project\'s ' +
    'collection framework. Respond with STRICT JSON ONLY — no prose, no markdown, no code fences.'

  const context = projectBlock(projectConfig)
  const body = text.slice(0, 8000) // cost/context cap, matches the doc-analysis path

  if (task === 'summarize') {
    return {
      system,
      user: `${context}

Summarize the following source for an analyst tracking this project. Be concise and factual.
Return ONLY JSON with exactly these keys:
{
  "summary": "<2-4 sentence summary>",
  "suggested_tags": ["<short topical tag>", "..."]
}

Source:
${body}`,
    }
  }

  if (task === 'reconcile') {
    const notes = (userNotes ?? '').trim()
    return {
      system,
      user: `${context}

A researcher reviewed the following source and added their own interpretation. Integrate the
researcher's notes into your analysis — weigh their interpretation, do not ignore it — and produce
a reconciled assessment for this project.
Return ONLY JSON with exactly these keys:
{
  "summary": "<reconciled 2-4 sentence summary that incorporates the researcher's notes>",
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

Assess how relevant the following source is to THIS project's framework.
Return ONLY JSON with exactly these keys:
{
  "relevance_score": <integer 0-10>,
  "relevance_reasoning": "<one or two sentences explaining the score against this project>",
  "suggested_tags": ["<short topical tag>", "..."]
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
  return out
}

function errMsg(e: unknown): string {
  return String((e as Error)?.message || e).slice(0, 200)
}
