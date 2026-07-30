// Canonical nine page-section keys → display labels (restructure step 2).
// The AI section-routing proposal (analysis_json.routing.proposed_sections, written by
// slice A1's analyze.ts) stores lowercase section KEYS; the UI shows these labels.
// Note: keys are NOT always their own label — `legal` displays as "Regulatory".
export const SECTION_LABELS: Record<string, string> = {
  systems: 'Systems',
  vnsa: 'VNSA',
  industry: 'Industry',
  external: 'External',
  supply: 'Supply',
  investment: 'Investment',
  legal: 'Regulatory',
  civilian: 'Civilian',
  logistics: 'Logistics',
}

// Display label for a section key; unknown keys fall through to the raw key so an
// unexpected value still renders something readable rather than blank.
export function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key
}
