// Shared read-only helpers for the Intelligence data-gathering framework panel
// (Slice 1). An info-page board's `board_config` is a JSON string in the
// InfoPageConfig shape (repo / live_url / keywords / status / pipeline / …).
// These helpers are display-only — the framework is edited via Claude Code, per
// the locked design, so nothing here writes.

// Parse a board_config JSON string, mirroring InfoPages/index.tsx's parseConfig
// (empty object on missing/invalid input — never throws).
export function parseConfig(raw: string | null | undefined): InfoPageConfig {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

// A project is "live" for automated collection when its pipeline flag is true
// (only Contested Skies today). The other 3 info-page boards are view-only.
export function isPipelineLive(cfg: InfoPageConfig): boolean {
  return cfg.pipeline === true
}

// Split the comma-separated keywords string into a trimmed, non-empty list.
// Grayed projects (Hollow Border / The Stated Order) have empty keywords → [].
export function splitKeywords(keywords: string | undefined): string[] {
  if (!keywords) return []
  return keywords.split(',').map(k => k.trim()).filter(Boolean)
}
