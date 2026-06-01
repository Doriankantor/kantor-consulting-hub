// ============================================================================
// Learning layer for the Contested Skies relevance gate.
// ============================================================================
// Closes the feedback loop. The desktop app records the human editor's
// approve/reject verdict and mirrors it up to Supabase `cs_articles.status`
// (see src/main/ipc/index.ts → pushVerdictToSupabase). This module turns that
// accumulated history into TWO complementary calibration signals, both derived
// from the SAME cs_articles rows fetched ONCE per run:
//
//   1. Few-shot examples  — recent KEPT vs REJECTED titles are injected into the
//      Claude gate prompt as soft guidance for borderline calls.
//   2. Source/category weighting — deterministic, explainable score nudges based
//      on how often the editor has approved articles from a given outlet or in a
//      given category. No extra Claude tokens; pure arithmetic.
//
// Design rules:
//   • Fully BACKWARD-COMPATIBLE and FAIL-OPEN. If Supabase is unavailable or no
//     decisions exist yet, fetchCalibration() returns an inert object and the
//     gate behaves EXACTLY as it did before learning existed.
//   • CONSERVATIVE on purpose: a handful of decisions must not swing the gate.
//     Weighting only engages once a source/category has enough human verdicts to
//     be statistically meaningful, and the total swing is clamped to ±2 points.
//   • The hard gate (the three yes/no questions) is NEVER overridden — learning
//     only nudges scores that already cleared the gate (base score > 0).
// ============================================================================

// ── Tunables ────────────────────────────────────────────────────────────────
export const CALIBRATION_DAYS = 120       // how far back to read verdicts
export const MAX_DECISIONS = 500          // cap rows pulled from Supabase
export const MAX_EXAMPLES = 8             // few-shot examples per verdict class
export const MIN_SOURCE_SAMPLES = 4       // min verdicts before trusting a source rate
export const MIN_CATEGORY_SAMPLES = 6     // min verdicts before trusting a category rate
export const MAX_SWING = 2                // hard clamp on the total score adjustment

const truncate = (s, n = 120) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n)

// The inert result returned whenever there is nothing to learn from. Keeping a
// single shape means callers never need to null-check individual fields.
function emptyCalibration() {
  return { hasData: false, block: '', sourceStats: {}, categoryStats: {}, counts: { approved: 0, rejected: 0 } }
}

// Pull recent human verdicts from cs_articles and pre-compute everything the gate
// needs for one run. NEVER throws. Returns:
//   { hasData, block, sourceStats, categoryStats, counts:{approved,rejected} }
// `block` is a ready-to-inject prompt string ('' when there is no usable data).
export async function fetchCalibration(supabase, opts = {}) {
  if (!supabase) return emptyCalibration()

  const days = opts.days ?? CALIBRATION_DAYS
  const since = new Date(Date.now() - days * 864e5).toISOString()
  try {
    const { data, error } = await supabase
      .from('cs_articles')
      .select('title, source_name, primary_category, status, approved_at, created_at')
      .in('status', ['approved', 'rejected'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(opts.max ?? MAX_DECISIONS)
    if (error || !Array.isArray(data) || data.length === 0) return emptyCalibration()

    const approved = data.filter((r) => r.status === 'approved')
    const rejected = data.filter((r) => r.status === 'rejected')

    // Per-source and per-category tallies of approve vs reject.
    const sourceStats = {}
    const categoryStats = {}
    const tally = (map, key, verdict) => {
      if (!key) return
      const k = String(key)
      map[k] = map[k] || { approved: 0, rejected: 0 }
      map[k][verdict] += 1
    }
    for (const r of data) {
      tally(sourceStats, r.source_name, r.status)
      tally(categoryStats, r.primary_category, r.status)
    }

    // Few-shot examples: the most recent N of each verdict (title — source).
    const fmt = (rows) =>
      rows
        .slice(0, opts.maxExamples ?? MAX_EXAMPLES)
        .map((r) => `- "${truncate(r.title)}" (${truncate(r.source_name, 40) || 'unknown source'})`)
        .join('\n')

    const keptBlock = fmt(approved)
    const rejBlock = fmt(rejected)
    const block =
      keptBlock || rejBlock
        ? '\nHUMAN CALIBRATION — a human editor has reviewed past gate results. Use these as guidance for BORDERLINE calls only; do NOT use them to override the three yes/no gate questions:\n' +
          (keptBlock ? `\nArticles the editor KEPT (genuinely relevant LATAM drone intelligence):\n${keptBlock}\n` : '') +
          (rejBlock
            ? `\nArticles the editor REJECTED (off-topic or unwanted, even if drones are mentioned):\n${rejBlock}\n`
            : '')
        : ''

    return {
      hasData: true,
      block,
      sourceStats,
      categoryStats,
      counts: { approved: approved.length, rejected: rejected.length },
    }
  } catch {
    return emptyCalibration()
  }
}

// Deterministic, conservative score nudge from the editor's track record for this
// article's source and category. Only engages when the base score already cleared
// the hard gate (> 0) and there is enough sample size. Returns { score, note }.
//   • Source approval rate >= 0.75 (>= MIN_SOURCE_SAMPLES verdicts):   +1
//   • Source approval rate <= 0.25 (>= MIN_SOURCE_SAMPLES verdicts):   -2
//   • Category approval rate >= 0.80 (>= MIN_CATEGORY_SAMPLES):        +1
//   • Category approval rate <= 0.20 (>= MIN_CATEGORY_SAMPLES):        -1
// Total swing clamped to ±MAX_SWING; final score clamped to [0, 10].
export function applyLearning(parsed, { source } = {}, calibration) {
  const base = Number(parsed?.relevance_score)
  if (!calibration?.hasData || !Number.isFinite(base) || base <= 0) {
    return { score: base, note: null }
  }

  let delta = 0
  const notes = []

  const srcStat = source ? calibration.sourceStats[String(source)] : null
  if (srcStat) {
    const total = srcStat.approved + srcStat.rejected
    if (total >= MIN_SOURCE_SAMPLES) {
      const rate = srcStat.approved / total
      if (rate >= 0.75) { delta += 1; notes.push(`source +1 (kept ${srcStat.approved}/${total})`) }
      else if (rate <= 0.25) { delta -= 2; notes.push(`source -2 (rejected ${srcStat.rejected}/${total})`) }
    }
  }

  const catKey = parsed?.primary_category ? String(parsed.primary_category) : null
  const catStat = catKey ? calibration.categoryStats[catKey] : null
  if (catStat) {
    const total = catStat.approved + catStat.rejected
    if (total >= MIN_CATEGORY_SAMPLES) {
      const rate = catStat.approved / total
      if (rate >= 0.8) { delta += 1; notes.push(`category +1 (${catKey})`) }
      else if (rate <= 0.2) { delta -= 1; notes.push(`category -1 (${catKey})`) }
    }
  }

  delta = Math.max(-MAX_SWING, Math.min(MAX_SWING, delta))
  const score = Math.max(0, Math.min(10, base + delta))
  return { score, note: notes.length ? notes.join('; ') : null }
}
