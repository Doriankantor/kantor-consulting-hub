// ============================================================================
// Shared Claude categorization for the Contested Skies pipeline.
// ============================================================================
// One strict relevance gate + categorization prompt, used by BOTH the daily
// fetcher (fetch-intelligence.js) and the cleanup pass (cleanup-irrelevant.js)
// so the definition of "relevant" never drifts between them.
//
// The gate forces relevance_score = 0 unless the article is genuinely about
// drones / UAS / UAV systems in Latin America (drone content as the MAIN topic,
// not a passing mention). Anything scoring below RELEVANCE_THRESHOLD is dropped
// by the fetcher and rejected by the cleanup pass.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'

export const CLAUDE_MODEL = 'claude-haiku-4-5'
export const RELEVANCE_THRESHOLD = 5

// The only categories this database accepts (Latin American drone activity).
export const PRIMARY_CATEGORIES = [
  'offensive_use',       // attacks, strikes, criminal use
  'defensive_systems',   // C-UAS, interception, jamming
  'military_investment', // state procurement, budgets
  'private_investment',  // company funding, R&D
  'new_technology',      // new platforms, innovations
  'regulatory',          // laws, agreements, policy
  'criminal_vnsa',       // cartel, gang, VNSA activity
  'diplomatic',          // foreign suppliers, transfers
]

export function makeAnthropic(apiKey) {
  return apiKey ? new Anthropic({ apiKey }) : null
}

// Build the strict categorization prompt for a single article.
export function buildPrompt({ title, snippet, source }) {
  return `You are categorizing a news article for a Latin America drone/UAS intelligence database.

Article title: ${title || ''}
Article snippet: ${snippet || ''}
Source: ${source || 'Unknown'}

First determine if this article is ACTUALLY about drones, UAS, or UAV systems in Latin America.

Answer these questions:
1. Does the article primarily discuss drones, UAS, or UAV systems? (yes/no)
2. Does the article involve at least one Latin American country? (yes/no)
3. Is the drone/UAS content the main topic, not just a passing mention? (yes/no)

If ANY answer is "no", set relevance_score to 0. Only proceed with categorization if all three are "yes".

Valid primary categories for this database (Latin American drone activity only):
- offensive_use       (attacks, strikes, criminal use)
- defensive_systems   (C-UAS, interception, jamming)
- military_investment (state procurement, budgets)
- private_investment  (company funding, R&D)
- new_technology      (new platforms, innovations)
- regulatory          (laws, agreements, policy)
- criminal_vnsa       (cartel, gang, VNSA activity)
- diplomatic          (foreign suppliers, transfers)

If the article doesn't fit any of these categories for Latin American drone activity, set relevance_score to 0.

Respond ONLY with a JSON object, no other text:
{
  "q1_about_drones": "yes" | "no",
  "q2_latam_country": "yes" | "no",
  "q3_main_topic": "yes" | "no",
  "primary_category": one of [offensive_use, defensive_systems, military_investment, private_investment, new_technology, regulatory, criminal_vnsa, diplomatic],
  "confidence_suggestion": one of [high, medium, low],
  "confidence_reasoning": "brief explanation",
  "relevance_score": number between 0 and 10,
  "key_actors": ["list", "of", "actors", "mentioned"],
  "countries": ["list", "of", "Latin American countries", "mentioned"],
  "summary": "one sentence summary"
}`
}

// Categorize a single article with Claude. Returns the parsed object, or null on
// any API/parse failure (callers decide what to do with null). The strict gate is
// enforced here too: if Claude answered "no" to any of the three questions, the
// relevance_score is forced to 0 regardless of what the model wrote.
export async function categorize(anthropic, { title, snippet, source }) {
  if (!anthropic) return null
  const prompt = buildPrompt({ title, snippet, source })
  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (msg.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    // Strip ```json fences / extract the first {...} block.
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    const jsonStr = cleaned.startsWith('{')
      ? cleaned
      : cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonStr)

    // Hard-enforce the relevance gate.
    const gateFailed =
      String(parsed.q1_about_drones).toLowerCase() === 'no' ||
      String(parsed.q2_latam_country).toLowerCase() === 'no' ||
      String(parsed.q3_main_topic).toLowerCase() === 'no'
    if (gateFailed) parsed.relevance_score = 0

    // Reject categories that aren't in our allow-list.
    if (parsed.primary_category && !PRIMARY_CATEGORIES.includes(parsed.primary_category)) {
      parsed.relevance_score = Math.min(Number(parsed.relevance_score) || 0, RELEVANCE_THRESHOLD - 1)
    }
    return parsed
  } catch {
    return null
  }
}

// True when a categorization result means "keep it" (relevant enough to store).
export function isRelevant(cat) {
  if (!cat) return false
  const score = Number(cat.relevance_score)
  return Number.isFinite(score) && score >= RELEVANCE_THRESHOLD
}
