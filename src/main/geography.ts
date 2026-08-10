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
// Consumers: routing (slice 2, ipc/index.ts) already imports resolvePlacementGeographies;
// getCountryUsageCounts (below) reads the local mirror for the geography picker's
// frequency ranking (slice 2b Piece A).
// ============================================================================

import { getDatabase } from './db'

// Tier-1 regions -- the FINAL 9-region set (locked 2026-08-09, slice 2b Piece B).
// GLOBAL is reserved for a future country/region -> Global aggregator page; it is a
// valid Region value with no seeded countries yet.
//
// RENAMES from the slice-1 seed: 'Middle East' -> 'MENA' (Middle East + North
// Africa folded together, per Dorian), and Russia stays a STANDALONE region (not
// folded into Europe or Asia). Nothing outside this module depended on the old
// 'Middle East' literal (grep-verified 2026-08-09: the only other occurrence is an
// unrelated search-query string in ipc/index.ts).
export type Region =
  | 'LATAM'
  | 'North America'
  | 'Europe'
  | 'MENA'
  | 'Sub-Saharan Africa'
  | 'Asia'
  | 'Russia'
  | 'Oceania'
  | 'GLOBAL'

// Canonical country -> region map. Keys are canonical English country names in
// the SAME normalized form normalizeCountry() produces (trimmed, single-spaced,
// TITLE-CASED PER WHITESPACE-WORD), so a normalized lookup key matches directly.
// That normalizer is deliberately dumb, which makes a few keys look odd but MATCH
// EXACTLY what a lookup produces (see the "NORMALIZER EDGE CASES" note below):
//   - "and"/"of"/"the" become "And"/"Of"/"The"  -> "Trinidad And Tobago"
//   - a hyphen/apostrophe is NOT a word boundary -> "Guinea-bissau", "Cote D'ivoire"
// For the human-facing common spellings that DON'T normalize to these keys
// ('Ivory Coast', 'USA', 'DRC', ...), see COUNTRY_ALIASES right below.
//
// THIS MAP IS MEANT TO GROW/BE CORRECTED: a region reassignment is ONE LINE here
// (plus the renderer mirror), no migration and no schema change -- region is a
// pure function of country. Boundary calls that Dorian locked are COMMENTED at
// their group so they are easy to find and override later.
//
// Coverage: UN member states + commonly-referenced territories (~197 rows).
export const COUNTRY_TO_REGION: Record<string, Region> = {
  // ---- LATAM (flat: all Latin America + the Caribbean, one tier) ------------
  // Per Dorian: MEXICO IS LATAM (not North America). The original slice-1 seed
  // (Colombia/Mexico/Brazil/Argentina/Venezuela + Bolivia) is preserved exactly.
  Mexico: 'LATAM',
  Guatemala: 'LATAM',
  Belize: 'LATAM',
  Honduras: 'LATAM',
  'El Salvador': 'LATAM',
  Nicaragua: 'LATAM',
  'Costa Rica': 'LATAM',
  Panama: 'LATAM',
  Cuba: 'LATAM',
  Haiti: 'LATAM',
  'Dominican Republic': 'LATAM',
  Jamaica: 'LATAM',
  'Trinidad And Tobago': 'LATAM',
  Bahamas: 'LATAM',
  Barbados: 'LATAM',
  'Saint Lucia': 'LATAM',
  Grenada: 'LATAM',
  'Saint Vincent And The Grenadines': 'LATAM',
  'Antigua And Barbuda': 'LATAM',
  'Saint Kitts And Nevis': 'LATAM',
  Dominica: 'LATAM',
  Colombia: 'LATAM',
  Venezuela: 'LATAM',
  Ecuador: 'LATAM',
  Peru: 'LATAM',
  Bolivia: 'LATAM',
  Brazil: 'LATAM',
  Paraguay: 'LATAM',
  Uruguay: 'LATAM',
  Argentina: 'LATAM',
  Chile: 'LATAM',
  Guyana: 'LATAM',
  Suriname: 'LATAM',

  // ---- NORTH AMERICA (US + Canada only; Mexico is LATAM above) --------------
  'United States': 'North America',
  Canada: 'North America',

  // ---- EUROPE (EU + UK/EFTA + Balkans + E. Europe + microstates) -----------
  // Per Dorian: CYPRUS -> Europe (not MENA). Romania -> Europe preserved exactly.
  Austria: 'Europe',
  Belgium: 'Europe',
  Bulgaria: 'Europe',
  Croatia: 'Europe',
  Cyprus: 'Europe',
  Czechia: 'Europe',
  Denmark: 'Europe',
  Estonia: 'Europe',
  Finland: 'Europe',
  France: 'Europe',
  Germany: 'Europe',
  Greece: 'Europe',
  Hungary: 'Europe',
  Ireland: 'Europe',
  Italy: 'Europe',
  Latvia: 'Europe',
  Lithuania: 'Europe',
  Luxembourg: 'Europe',
  Malta: 'Europe',
  Netherlands: 'Europe',
  Poland: 'Europe',
  Portugal: 'Europe',
  Romania: 'Europe',
  Slovakia: 'Europe',
  Slovenia: 'Europe',
  Spain: 'Europe',
  Sweden: 'Europe',
  'United Kingdom': 'Europe',
  Norway: 'Europe',
  Switzerland: 'Europe',
  Iceland: 'Europe',
  Serbia: 'Europe',
  'Bosnia And Herzegovina': 'Europe',   // NORMALIZER EDGE CASE: "and" -> "And"
  'North Macedonia': 'Europe',
  Albania: 'Europe',
  Montenegro: 'Europe',
  Kosovo: 'Europe',
  Ukraine: 'Europe',
  Belarus: 'Europe',
  Moldova: 'Europe',
  Liechtenstein: 'Europe',
  Monaco: 'Europe',
  Andorra: 'Europe',
  'San Marino': 'Europe',
  'Vatican City': 'Europe',

  // ---- RUSSIA (standalone region, per Dorian -- not Europe, not Asia) -------
  Russia: 'Russia',

  // ---- MENA (Middle East + North Africa + Caucasus, per Dorian) ------------
  // SOFT BOUNDARY (a): CAUCASUS. Georgia/Armenia/Azerbaijan are placed in MENA,
  //   but Georgia/Armenia could reasonably be Europe -- flagged, override here.
  // SOFT BOUNDARY (b): THE SAHEL LINE. Sudan/Mauritania are MENA (Arab League /
  //   North Africa); Chad/Mali/Niger sit just south and are Sub-Saharan below.
  Turkey: 'MENA',
  Egypt: 'MENA',
  Israel: 'MENA',
  Palestine: 'MENA',
  Jordan: 'MENA',
  Lebanon: 'MENA',
  Syria: 'MENA',
  Iraq: 'MENA',
  Iran: 'MENA',
  'Saudi Arabia': 'MENA',
  Yemen: 'MENA',
  Oman: 'MENA',
  'United Arab Emirates': 'MENA',
  Qatar: 'MENA',
  Bahrain: 'MENA',
  Kuwait: 'MENA',
  Libya: 'MENA',           // North Africa
  Tunisia: 'MENA',         // North Africa
  Algeria: 'MENA',         // North Africa
  Morocco: 'MENA',         // North Africa
  Sudan: 'MENA',           // North Africa / Arab League (soft boundary b)
  Mauritania: 'MENA',      // North Africa / Arab League (soft boundary b)
  Georgia: 'MENA',         // Caucasus (soft boundary a -- could be Europe)
  Armenia: 'MENA',         // Caucasus (soft boundary a -- could be Europe)
  Azerbaijan: 'MENA',      // Caucasus

  // ---- SUB-SAHARAN AFRICA (everything below the Sahara) --------------------
  // Chad/Mali/Niger are Sahelian but conventionally Sub-Saharan in this split.
  Nigeria: 'Sub-Saharan Africa',
  Ethiopia: 'Sub-Saharan Africa',
  Kenya: 'Sub-Saharan Africa',
  'South Africa': 'Sub-Saharan Africa',
  Ghana: 'Sub-Saharan Africa',
  "Cote D'ivoire": 'Sub-Saharan Africa',   // NORMALIZER EDGE CASE: "Cote d'Ivoire" -> "Cote D'ivoire"; alias 'Ivory Coast' below
  Chad: 'Sub-Saharan Africa',              // Sahel (soft boundary b -- Sub-Saharan here)
  Mali: 'Sub-Saharan Africa',              // Sahel (soft boundary b)
  Niger: 'Sub-Saharan Africa',             // Sahel (soft boundary b)
  Senegal: 'Sub-Saharan Africa',
  Somalia: 'Sub-Saharan Africa',
  'Democratic Republic Of The Congo': 'Sub-Saharan Africa',   // NORMALIZER: "of"/"the" -> "Of"/"The"; alias 'DRC' below
  Uganda: 'Sub-Saharan Africa',
  Tanzania: 'Sub-Saharan Africa',
  Angola: 'Sub-Saharan Africa',
  Mozambique: 'Sub-Saharan Africa',
  Zambia: 'Sub-Saharan Africa',
  Zimbabwe: 'Sub-Saharan Africa',
  Cameroon: 'Sub-Saharan Africa',
  'Burkina Faso': 'Sub-Saharan Africa',
  Benin: 'Sub-Saharan Africa',
  Togo: 'Sub-Saharan Africa',
  Guinea: 'Sub-Saharan Africa',
  'Guinea-bissau': 'Sub-Saharan Africa',   // NORMALIZER EDGE CASE: hyphen not a word boundary -> "Guinea-bissau"
  'Sierra Leone': 'Sub-Saharan Africa',
  Liberia: 'Sub-Saharan Africa',
  Gambia: 'Sub-Saharan Africa',            // alias 'The Gambia' below
  Mauritius: 'Sub-Saharan Africa',
  Madagascar: 'Sub-Saharan Africa',
  Malawi: 'Sub-Saharan Africa',
  Rwanda: 'Sub-Saharan Africa',
  Burundi: 'Sub-Saharan Africa',
  'South Sudan': 'Sub-Saharan Africa',
  Eritrea: 'Sub-Saharan Africa',
  Djibouti: 'Sub-Saharan Africa',
  'Central African Republic': 'Sub-Saharan Africa',
  'Republic Of The Congo': 'Sub-Saharan Africa',   // alias 'Congo' below (bare "Congo" -> this, per Dorian)
  Gabon: 'Sub-Saharan Africa',
  'Equatorial Guinea': 'Sub-Saharan Africa',
  Botswana: 'Sub-Saharan Africa',
  Namibia: 'Sub-Saharan Africa',
  Lesotho: 'Sub-Saharan Africa',
  Eswatini: 'Sub-Saharan Africa',          // alias 'Swaziland' below
  Comoros: 'Sub-Saharan Africa',
  Seychelles: 'Sub-Saharan Africa',
  'Cape Verde': 'Sub-Saharan Africa',      // alias 'Cabo Verde' below
  'Sao Tome And Principe': 'Sub-Saharan Africa',

  // ---- ASIA (Central + South + Southeast + East Asia) ----------------------
  // Per Dorian: CENTRAL ASIA -> Asia (the five -stans, below).
  China: 'Asia',
  Japan: 'Asia',
  'South Korea': 'Asia',
  'North Korea': 'Asia',
  Taiwan: 'Asia',
  Mongolia: 'Asia',
  India: 'Asia',
  Pakistan: 'Asia',
  Afghanistan: 'Asia',
  Bangladesh: 'Asia',
  'Sri Lanka': 'Asia',
  Nepal: 'Asia',
  Bhutan: 'Asia',
  Maldives: 'Asia',
  Myanmar: 'Asia',           // alias 'Burma' below
  Thailand: 'Asia',
  Vietnam: 'Asia',
  Cambodia: 'Asia',
  Laos: 'Asia',
  Malaysia: 'Asia',
  Singapore: 'Asia',
  Indonesia: 'Asia',
  Philippines: 'Asia',
  Brunei: 'Asia',
  'Timor-leste': 'Asia',     // NORMALIZER EDGE CASE: hyphen -> "Timor-leste"; alias 'East Timor' below
  Kazakhstan: 'Asia',        // Central Asia
  Uzbekistan: 'Asia',        // Central Asia
  Turkmenistan: 'Asia',      // Central Asia
  Kyrgyzstan: 'Asia',        // Central Asia
  Tajikistan: 'Asia',        // Central Asia

  // ---- OCEANIA (Australasia + Pacific island states) -----------------------
  Australia: 'Oceania',
  'New Zealand': 'Oceania',
  'Papua New Guinea': 'Oceania',
  Fiji: 'Oceania',
  'Solomon Islands': 'Oceania',
  Vanuatu: 'Oceania',
  Samoa: 'Oceania',
  Tonga: 'Oceania',
  Kiribati: 'Oceania',
  Micronesia: 'Oceania',
  'Marshall Islands': 'Oceania',
  Palau: 'Oceania',
  Nauru: 'Oceania',
  Tuvalu: 'Oceania',

  // GLOBAL: reserved aggregation level, no seeded countries.
}

// Alias map for common non-canonical spellings that do NOT match normalizeCountry
// output. Keys are in normalizeCountry() form (title-cased per word); values are
// the canonical COUNTRY_TO_REGION key. resolveRegion() consults this AFTER
// normalization and BEFORE the region lookup. Not exhaustive by design -- only the
// forms that realistically appear in subject_countries / a researcher's typing.
export const COUNTRY_ALIASES: Record<string, string> = {
  // United States
  Usa: 'United States',
  Us: 'United States',
  'United States Of America': 'United States',
  America: 'United States',
  // United Kingdom
  Uk: 'United Kingdom',
  Britain: 'United Kingdom',
  'Great Britain': 'United Kingdom',
  // Gulf / MENA
  Uae: 'United Arab Emirates',
  Turkiye: 'Turkey',
  'Palestinian Territories': 'Palestine',
  // Europe
  'Czech Republic': 'Czechia',
  Macedonia: 'North Macedonia',
  'Holy See': 'Vatican City',
  Vatican: 'Vatican City',
  'Russian Federation': 'Russia',
  // Africa -- irregular normalizer forms + renames
  'Ivory Coast': "Cote D'ivoire",
  Drc: 'Democratic Republic Of The Congo',
  'Dr Congo': 'Democratic Republic Of The Congo',
  Congo: 'Republic Of The Congo',   // bare "Congo" -> Republic of the Congo (per Dorian)
  'The Gambia': 'Gambia',
  Swaziland: 'Eswatini',
  'Cabo Verde': 'Cape Verde',
  // Asia
  Burma: 'Myanmar',
  'East Timor': 'Timor-leste',
  'Republic Of Korea': 'South Korea',
  Dprk: 'North Korea',
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
  // PLACEMENT SENTINELS (slice 2b Piece A): 'REGIONAL' (today's LATAM aggregation
  // level) and 'GLOBAL' are VALID non-country geographies, not unmapped countries --
  // they pass through routing/resolution unchanged, as they always have. Match on the
  // raw upper-cased value (the stored form is upper-case; normalizeCountry would
  // title-case them to 'Regional'/'Global'). REGIONAL resolves to the LATAM region it
  // aggregates; GLOBAL is its own Region value. The stored country string stays the
  // sentinel itself (the deferred REGIONAL->LATAM rename is a separate future slice).
  const sentinel = country.trim().toUpperCase()
  if (sentinel === 'REGIONAL') return { region: 'LATAM', country: 'REGIONAL' }
  if (sentinel === 'GLOBAL') return { region: 'GLOBAL', country: 'GLOBAL' }
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

// Frequency of each country across the whole corpus, for the geography picker to
// rank its typeahead by (Piece A). Reads the LOCAL MIRROR (better-sqlite3): the
// subject_countries column is mirrored, so this is a cheap local read -- NOT a
// cloud call. Every row's subject_countries is a JSON string[]; each token is
// tallied under its normalizeCountry() form so 'mexico'/' Mexico ' aggregate into
// one 'Mexico' bucket. Tokens are NOT alias-resolved or region-filtered here --
// unmapped/aliased strings still count as themselves; the picker decides how to
// present them. Returns a plain { [country]: count } map; NO caching (Piece A owns
// caching). Malformed JSON rows are skipped, never thrown.
export function getCountryUsageCounts(): Record<string, number> {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT subject_countries FROM intelligence_sources
        WHERE subject_countries IS NOT NULL AND subject_countries != '' AND subject_countries != '[]'`
    )
    .all() as { subject_countries: string }[]

  const counts: Record<string, number> = {}
  for (const row of rows) {
    let list: unknown
    try {
      list = JSON.parse(row.subject_countries)
    } catch {
      continue // skip a malformed row rather than fail the whole tally
    }
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      if (typeof raw !== 'string' || raw.trim() === '') continue
      const key = normalizeCountry(raw)
      counts[key] = (counts[key] ?? 0) + 1
    }
  }
  return counts
}
