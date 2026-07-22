// Part B: pure resolution of AI-extracted KEY FACTS + SYSTEMS with human overrides
// (analysis.human.overrides) layered on top. No React, no IPC — just the merge logic
// shared by the EDITABLE review card (NewsTab) and the READ-ONLY pipeline card
// (PipelineSourceCard) so the two can never diverge.
//
// AI order is canonical: an override only SHADOWS a matching AI entry (by fact `label` /
// capability `system`). It never reorders, appends, or removes. New AI entries always
// appear; entries with no override pass through untouched (edited:false).

export interface ResolvedFact {
  label: string
  value: string        // resolved (override if present, else AI)
  aiValue?: string     // the AI's original — present only when edited
  edited: boolean
}

export interface ResolvedCap {
  key: string          // the AI's ORIGINAL `system` — the stable override key (survives a rename)
  system: string       // resolved (may be renamed by an override)
  actor?: string
  actor_type?: string
  cost?: string
  category?: string
  ai?: Record<string, any>   // untouched AI cap — present only when edited (provenance)
  edited: boolean
}

function asObject(x: unknown): Record<string, any> {
  return (x && typeof x === 'object' && !Array.isArray(x)) ? (x as Record<string, any>) : {}
}

// analysis.human.overrides.<bucket> — guarded at every rung (missing → {}).
function overrideBucket(analysis: any, bucket: 'key_facts' | 'capabilities'): Record<string, any> {
  return asObject(asObject(asObject(analysis?.human).overrides)[bucket])
}

export function resolveFacts(analysis: any): ResolvedFact[] {
  const aiFacts = Array.isArray(asObject(analysis?.ai).key_facts) ? asObject(analysis?.ai).key_facts : []
  const overrides = overrideBucket(analysis, 'key_facts')
  return (aiFacts as any[])
    .filter(f => f && typeof f === 'object')
    .map(f => {
      const label = String(f.label ?? '')
      const aiValue = String(f.value ?? '')
      const ov = overrides[label]
      if (ov && typeof ov === 'object' && typeof ov.value === 'string') {
        return { label, value: ov.value, aiValue, edited: true }
      }
      return { label, value: aiValue, edited: false }
    })
}

export function resolveCaps(analysis: any): ResolvedCap[] {
  const aiCaps = Array.isArray(asObject(analysis?.ai).capabilities) ? asObject(analysis?.ai).capabilities : []
  const overrides = overrideBucket(analysis, 'capabilities')
  return (aiCaps as any[])
    .filter(c => c && typeof c === 'object')
    .map(c => {
      const key = String(c.system ?? '')
      const ov = overrides[key]
      if (ov && typeof ov === 'object') {
        const { edited_at, ...ovFields } = ov as Record<string, any>   // drop bookkeeping
        const merged = { ...c, ...ovFields }
        return {
          key,
          system: String(merged.system ?? ''),
          actor: merged.actor, actor_type: merged.actor_type, cost: merged.cost, category: merged.category,
          ai: c, edited: true,
        }
      }
      return {
        key,
        system: String(c.system ?? ''),
        actor: c.actor, actor_type: c.actor_type, cost: c.cost, category: c.category,
        edited: false,
      }
    })
}
