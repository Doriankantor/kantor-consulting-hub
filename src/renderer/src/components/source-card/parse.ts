// Shared parse helpers for the unified source-card model and the Intelligence tabs.
// Extracted VERBATIM from NewsTab.tsx (where they were module-private) so that
// SourceCore.fromIntelligenceSource and NewsTab parse a row byte-identically -- no drift.
//
// Moved HERE (rather than exported from NewsTab and imported back) to avoid a circular
// import: NewsTab -> SourceCard -> sourceCore would otherwise point back into NewsTab.

export function readTags(raw: string | null): string[] {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

// Geo-2: parse a JSON-string object {country: string[]} defensively -> {} on null/invalid.
export function safeParseObject(raw: string | null | undefined): Record<string, string[]> {
  try {
    const o = JSON.parse(raw || '{}')
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(o)) if (Array.isArray(v)) out[k] = v.map(String)
    return out
  } catch { return {} }
}

// Actor-2: parse the `actors` JSON-string column -> [{name,type}] defensively. Keeps only objects
// with a non-empty string name (trimmed); coerces type to string, default 'unknown'. -> [] on invalid.
export function safeParseObjectArray(raw: string | null | undefined): { name: string; type: string }[] {
  try {
    const a = JSON.parse(raw || '[]')
    if (!Array.isArray(a)) return []
    const out: { name: string; type: string }[] = []
    for (const item of a) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const name = typeof (item as any).name === 'string' ? (item as any).name.trim() : ''
      if (!name) continue
      const type = typeof (item as any).type === 'string' ? (item as any).type : 'unknown'
      out.push({ name, type })
    }
    return out
  } catch { return [] }
}

// Parse analysis_json defensively -> {} on null/invalid.
export function parseAnalysis(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : {} } catch { return {} }
}

// Plain text from TipTap HTML -- used to tell "empty notes" from real content.
export function notesText(html: string | null): string {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}
