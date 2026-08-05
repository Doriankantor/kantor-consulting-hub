// Per-section accent colors — the ONE thing lifted from the Contested Skies page's
// visual language into the app. Sourced from the live page's P.CATS[].h (the
// authoritative section palette), read from info-pages/contested-skies/index.html.
// Sibling of sectionLabels.ts; keyed by the same nine section keys.
//
// Used only as a small accent (rail left-border, header number, box accent dot) on
// top of the app's normal indigo/gray Tailwind surfaces — NOT a theme swap.
export const SECTION_COLORS: Record<string, string> = {
  systems:    '#d4ff3a',
  vnsa:       '#f45f78',
  industry:   '#3ad4ff',
  external:   '#ffab3a',
  supply:     '#b18cff',
  investment: '#5ee6a8',
  legal:      '#7aa6ff',
  civilian:   '#ffe14d',
  logistics:  '#e889c4',
}

// Accent hex for a section key; unknown keys fall back to a neutral gray so an
// unexpected value still renders a valid color rather than undefined.
export function sectionColor(key: string): string {
  return SECTION_COLORS[key] ?? '#94a3b8'
}
