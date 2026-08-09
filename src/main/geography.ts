// ============================================================================
// GEOGRAPHY VOCABULARY -- MAIN-PROCESS COPY (canonical country -> region map)
// ============================================================================
// This is the MAIN copy of the geography vocabulary. Following the same
// convention as the 9-section list (src/main/ai/analyze.ts <-> the renderer's
// src/renderer/src/pages/Intelligence/sectionLabels.ts), a RENDERER MIRROR of
// this vocabulary will live beside sectionLabels.ts and MUST be kept in sync by
// hand -- there is no shared module across the main/renderer process boundary in
// this codebase (see src/main/constants.ts, which notes the renderer keeps its
// own separate copies). When you add a country here, add it to the renderer
// mirror too. (The renderer mirror is a later slice; it does not exist yet.)
//
// MODEL (locked 2026-08-09):
//   - REGION IS DERIVED FROM COUNTRY, NEVER STORED. There is no region column.
//     Placement geography strings store the COUNTRY NAME (decision A); the region
//     is computed at read time via COUNTRY_TO_REGION / resolveRegion.
//   - Geography is a two-level tree: REGION -> optional COUNTRY. LATAM is the
//     focus region; every other tier-1 region is "extra-LATAM". A country's cell
//     springs up when its first source routes to it -- the map is the POSSIBLE
//     structure, not the populated one.
//
// This module is a PURE ADDITION: nothing imports it yet. Routing (slice 2) will
// be the first consumer. It adds no call sites and changes no existing behavior.
// ============================================================================

// Tier-1 regions. GLOBAL is reserved now for a future country/region -> Global
// aggregator page; it is a valid Region value with no seeded countries yet.
export type Region =
  | 'LATAM'
  | 'North America'
  | 'Europe'
  | 'Middle East'
  | 'Russia'
  | 'Asia'
  | 'GLOBAL'

// Canonical country -> region map. Keys are canonical English country names in
// the SAME normalized form normalizeCountry() produces (trimmed, single-spaced,
// title-cased), so a normalized lookup key matches directly.
//
// THIS MAP IS MEANT TO GROW: adding a country is ONE LINE here (plus the renderer
// mirror), no migration and no schema change -- region is a pure function of
// country. The other tier-1 regions (North America, Middle East, Russia, Asia,
// GLOBAL) are valid Region values that currently have few or no seeded countries;
// they populate as real sources arrive.
export const COUNTRY_TO_REGION: Record<string, Region> = {
  // LATAM -- the focus region. Colombia/Mexico/Brazil/Argentina/Venezuela have
  // live grid cells today; Bolivia appears in subject_countries with no seeded
  // cell yet -- it is a valid LATAM country the tree accommodates, and its cell
  // springs up when its first source routes.
  Colombia: 'LATAM',
  Mexico: 'LATAM',
  Brazil: 'LATAM',
  Argentina: 'LATAM',
  Venezuela: 'LATAM',
  Bolivia: 'LATAM',

  // Europe -- Romania is the one live EXTRA-LATAM subject_country today, the
  // first real proof the tree spans beyond LATAM.
  Romania: 'Europe',

  // North America / Middle East / Russia / Asia / GLOBAL: valid regions, no
  // seeded countries yet. Add one line each as sources arrive.
}

// Optional alias map for later canonicalization (e.g. 'Usa' -> 'United States',
// 'Uae' -> 'United Arab Emirates'). SEEDED EMPTY on purpose: this is a real
// alias table, not the match-normalizer, and inventing entries today would be
// guessing. Keys, when added, should be in normalizeCountry() form; values are
// the canonical country name used as a COUNTRY_TO_REGION key. resolveRegion()
// consults this after normalization and before the region lookup.
export const COUNTRY_ALIASES: Record<string, string> = {
  // 'Usa': 'United States',
}

// Today's LATAM-regional synthesis cell. FUTURE NORMALIZATION (not now): this
// literal will be renamed to 'LATAM' once the tree generalizes; every existing
// cell and placement currently says 'REGIONAL', so the rename is deferred.
export const REGIONAL_SENTINEL = 'REGIONAL'

// Minimal MATCH-normalization -- NOT an alias map. Trim, collapse internal
// whitespace, and title-case each whitespace-separated word so 'mexico' and
// ' Mexico ' both match the canonical 'Mexico'. Intentionally simple; real
// aliases belong in COUNTRY_ALIASES.
export function normalizeCountry(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) =>
      word.length === 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(' ')
}

// Resolve a single country string to its region. Normalizes, applies any alias,
// then looks up COUNTRY_TO_REGION. Returns { region, country: canonicalName } on
// a hit, or { unmapped: true, input: raw } on a miss. NEVER silently coerces an
// unmapped country to a region -- surfacing misses is a hard requirement of the
// model, so callers can flag "unmapped" instead of losing the country.
export function resolveRegion(
  country: string
): { region: Region; country: string } | { unmapped: true; input: string } {
  const normalized = normalizeCountry(country)
  const canonical = COUNTRY_ALIASES[normalized] ?? normalized
  const region = COUNTRY_TO_REGION[canonical]
  if (region === undefined) {
    return { unmapped: true, input: country }
  }
  return { region, country: canonical }
}

// Resolve a source's subject_countries into placement geography strings.
//   geographies -- deduped canonical COUNTRY-NAME strings to write as placement
//                  geography (decision A: store the country, derive the region).
//   unmapped    -- inputs that matched no region, surfaced and NEVER dropped.
//
// GATE, NOT FALLBACK (model locked 2026-08-09, slice 2b): if subjectCountries
// yields NO resolved countries, geographies stays EMPTY -- it is NEVER coerced to
// [REGIONAL]. Emptiness is caught DOWNSTREAM by the advance-to-review geography
// gate (a source must carry >=1 geography to advance, parallel to the >=1 section
// gate); a source with no geography is BLOCKED, not silently defaulted. When
// countries DO resolve, REGIONAL is still NOT auto-added -- per the locked model
// REGIONAL is a deliberate selection, not an implied addition. Unmapped inputs are
// surfaced in unmapped[] and never dropped; an unmapped-only source resolves to
// empty geographies + its misses, so a human must map/select a real geography
// before it can advance.
// NOTE: routeToNew keeps its OWN ['REGIONAL'] default param for the route-time
// seed path, so removing the fallback here does NOT change routing (see 2a).
export function resolvePlacementGeographies(subjectCountries: string[]): {
  geographies: string[]
  unmapped: string[]
} {
  const geographies: string[] = []
  const unmapped: string[] = []
  const seen = new Set<string>()

  for (const raw of subjectCountries) {
    const resolved = resolveRegion(raw)
    if ('unmapped' in resolved) {
      unmapped.push(resolved.input)
      continue
    }
    if (!seen.has(resolved.country)) {
      seen.add(resolved.country)
      geographies.push(resolved.country)
    }
  }

  // Empty resolve -> empty geographies (blocked by the advance-to-review gate),
  // never coerced to REGIONAL. Unmapped misses are already surfaced above.
  return { geographies, unmapped }
}
