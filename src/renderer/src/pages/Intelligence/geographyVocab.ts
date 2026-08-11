// RENDERER MIRROR of the main-side country->region vocabulary.
// ============================================================================
// SOURCE OF TRUTH is the MAIN copy: src/main/geography.ts (COUNTRY_TO_REGION).
// Main and renderer do NOT share modules in this codebase (documented constraint --
// see src/main/constants.ts and the sectionLabels.ts convention), so this list is a
// HAND-MAINTAINED MIRROR. When COUNTRY_TO_REGION changes in geography.ts, update this
// file to match (region assignments, additions, the 9-region set). Regenerated once
// from the main map on 2026-08-09 (slice 2b Piece A); keep in sync by hand thereafter.
//
// 'REGIONAL' and 'GLOBAL' are NOT countries and are intentionally absent here -- the
// picker treats them as level SENTINELS (see GeographyChips.tsx), not typeahead
// candidates. Region for a picked country is DERIVED from this table.
// ============================================================================

export interface GeoCountry {
  name: string       // canonical country name (matches COUNTRY_TO_REGION key + normalizeCountry output)
  region: string     // one of the 9 regions
  isLatam: boolean   // region === 'LATAM' -- scopes the typeahead + colors the chip
}

export const GEO_COUNTRIES: GeoCountry[] = [
  // LATAM
  { name: "Mexico", region: "LATAM", isLatam: true },
  { name: "Guatemala", region: "LATAM", isLatam: true },
  { name: "Belize", region: "LATAM", isLatam: true },
  { name: "Honduras", region: "LATAM", isLatam: true },
  { name: "El Salvador", region: "LATAM", isLatam: true },
  { name: "Nicaragua", region: "LATAM", isLatam: true },
  { name: "Costa Rica", region: "LATAM", isLatam: true },
  { name: "Panama", region: "LATAM", isLatam: true },
  { name: "Cuba", region: "LATAM", isLatam: true },
  { name: "Haiti", region: "LATAM", isLatam: true },
  { name: "Dominican Republic", region: "LATAM", isLatam: true },
  { name: "Jamaica", region: "LATAM", isLatam: true },
  { name: "Trinidad And Tobago", region: "LATAM", isLatam: true },
  { name: "Bahamas", region: "LATAM", isLatam: true },
  { name: "Barbados", region: "LATAM", isLatam: true },
  { name: "Saint Lucia", region: "LATAM", isLatam: true },
  { name: "Grenada", region: "LATAM", isLatam: true },
  { name: "Saint Vincent And The Grenadines", region: "LATAM", isLatam: true },
  { name: "Antigua And Barbuda", region: "LATAM", isLatam: true },
  { name: "Saint Kitts And Nevis", region: "LATAM", isLatam: true },
  { name: "Dominica", region: "LATAM", isLatam: true },
  { name: "Colombia", region: "LATAM", isLatam: true },
  { name: "Venezuela", region: "LATAM", isLatam: true },
  { name: "Ecuador", region: "LATAM", isLatam: true },
  { name: "Peru", region: "LATAM", isLatam: true },
  { name: "Bolivia", region: "LATAM", isLatam: true },
  { name: "Brazil", region: "LATAM", isLatam: true },
  { name: "Paraguay", region: "LATAM", isLatam: true },
  { name: "Uruguay", region: "LATAM", isLatam: true },
  { name: "Argentina", region: "LATAM", isLatam: true },
  { name: "Chile", region: "LATAM", isLatam: true },
  { name: "Guyana", region: "LATAM", isLatam: true },
  { name: "Suriname", region: "LATAM", isLatam: true },
  // North America
  { name: "United States", region: "North America", isLatam: false },
  { name: "Canada", region: "North America", isLatam: false },
  // Europe
  { name: "Austria", region: "Europe", isLatam: false },
  { name: "Belgium", region: "Europe", isLatam: false },
  { name: "Bulgaria", region: "Europe", isLatam: false },
  { name: "Croatia", region: "Europe", isLatam: false },
  { name: "Cyprus", region: "Europe", isLatam: false },
  { name: "Czechia", region: "Europe", isLatam: false },
  { name: "Denmark", region: "Europe", isLatam: false },
  { name: "Estonia", region: "Europe", isLatam: false },
  { name: "Finland", region: "Europe", isLatam: false },
  { name: "France", region: "Europe", isLatam: false },
  { name: "Germany", region: "Europe", isLatam: false },
  { name: "Greece", region: "Europe", isLatam: false },
  { name: "Hungary", region: "Europe", isLatam: false },
  { name: "Ireland", region: "Europe", isLatam: false },
  { name: "Italy", region: "Europe", isLatam: false },
  { name: "Latvia", region: "Europe", isLatam: false },
  { name: "Lithuania", region: "Europe", isLatam: false },
  { name: "Luxembourg", region: "Europe", isLatam: false },
  { name: "Malta", region: "Europe", isLatam: false },
  { name: "Netherlands", region: "Europe", isLatam: false },
  { name: "Poland", region: "Europe", isLatam: false },
  { name: "Portugal", region: "Europe", isLatam: false },
  { name: "Romania", region: "Europe", isLatam: false },
  { name: "Slovakia", region: "Europe", isLatam: false },
  { name: "Slovenia", region: "Europe", isLatam: false },
  { name: "Spain", region: "Europe", isLatam: false },
  { name: "Sweden", region: "Europe", isLatam: false },
  { name: "United Kingdom", region: "Europe", isLatam: false },
  { name: "Norway", region: "Europe", isLatam: false },
  { name: "Switzerland", region: "Europe", isLatam: false },
  { name: "Iceland", region: "Europe", isLatam: false },
  { name: "Serbia", region: "Europe", isLatam: false },
  { name: "Bosnia And Herzegovina", region: "Europe", isLatam: false },
  { name: "North Macedonia", region: "Europe", isLatam: false },
  { name: "Albania", region: "Europe", isLatam: false },
  { name: "Montenegro", region: "Europe", isLatam: false },
  { name: "Kosovo", region: "Europe", isLatam: false },
  { name: "Ukraine", region: "Europe", isLatam: false },
  { name: "Belarus", region: "Europe", isLatam: false },
  { name: "Moldova", region: "Europe", isLatam: false },
  { name: "Liechtenstein", region: "Europe", isLatam: false },
  { name: "Monaco", region: "Europe", isLatam: false },
  { name: "Andorra", region: "Europe", isLatam: false },
  { name: "San Marino", region: "Europe", isLatam: false },
  { name: "Vatican City", region: "Europe", isLatam: false },
  // Russia
  { name: "Russia", region: "Russia", isLatam: false },
  // MENA
  { name: "Turkey", region: "MENA", isLatam: false },
  { name: "Egypt", region: "MENA", isLatam: false },
  { name: "Israel", region: "MENA", isLatam: false },
  { name: "Palestine", region: "MENA", isLatam: false },
  { name: "Jordan", region: "MENA", isLatam: false },
  { name: "Lebanon", region: "MENA", isLatam: false },
  { name: "Syria", region: "MENA", isLatam: false },
  { name: "Iraq", region: "MENA", isLatam: false },
  { name: "Iran", region: "MENA", isLatam: false },
  { name: "Saudi Arabia", region: "MENA", isLatam: false },
  { name: "Yemen", region: "MENA", isLatam: false },
  { name: "Oman", region: "MENA", isLatam: false },
  { name: "United Arab Emirates", region: "MENA", isLatam: false },
  { name: "Qatar", region: "MENA", isLatam: false },
  { name: "Bahrain", region: "MENA", isLatam: false },
  { name: "Kuwait", region: "MENA", isLatam: false },
  { name: "Libya", region: "MENA", isLatam: false },
  { name: "Tunisia", region: "MENA", isLatam: false },
  { name: "Algeria", region: "MENA", isLatam: false },
  { name: "Morocco", region: "MENA", isLatam: false },
  { name: "Sudan", region: "MENA", isLatam: false },
  { name: "Mauritania", region: "MENA", isLatam: false },
  { name: "Georgia", region: "MENA", isLatam: false },
  { name: "Armenia", region: "MENA", isLatam: false },
  { name: "Azerbaijan", region: "MENA", isLatam: false },
  // Sub-Saharan Africa
  { name: "Nigeria", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Ethiopia", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Kenya", region: "Sub-Saharan Africa", isLatam: false },
  { name: "South Africa", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Ghana", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Cote D'ivoire", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Chad", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Mali", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Niger", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Senegal", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Somalia", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Democratic Republic Of The Congo", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Uganda", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Tanzania", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Angola", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Mozambique", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Zambia", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Zimbabwe", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Cameroon", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Burkina Faso", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Benin", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Togo", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Guinea", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Guinea-bissau", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Sierra Leone", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Liberia", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Gambia", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Mauritius", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Madagascar", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Malawi", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Rwanda", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Burundi", region: "Sub-Saharan Africa", isLatam: false },
  { name: "South Sudan", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Eritrea", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Djibouti", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Central African Republic", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Republic Of The Congo", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Gabon", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Equatorial Guinea", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Botswana", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Namibia", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Lesotho", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Eswatini", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Comoros", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Seychelles", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Cape Verde", region: "Sub-Saharan Africa", isLatam: false },
  { name: "Sao Tome And Principe", region: "Sub-Saharan Africa", isLatam: false },
  // Asia
  { name: "China", region: "Asia", isLatam: false },
  { name: "Japan", region: "Asia", isLatam: false },
  { name: "South Korea", region: "Asia", isLatam: false },
  { name: "North Korea", region: "Asia", isLatam: false },
  { name: "Taiwan", region: "Asia", isLatam: false },
  { name: "Mongolia", region: "Asia", isLatam: false },
  { name: "India", region: "Asia", isLatam: false },
  { name: "Pakistan", region: "Asia", isLatam: false },
  { name: "Afghanistan", region: "Asia", isLatam: false },
  { name: "Bangladesh", region: "Asia", isLatam: false },
  { name: "Sri Lanka", region: "Asia", isLatam: false },
  { name: "Nepal", region: "Asia", isLatam: false },
  { name: "Bhutan", region: "Asia", isLatam: false },
  { name: "Maldives", region: "Asia", isLatam: false },
  { name: "Myanmar", region: "Asia", isLatam: false },
  { name: "Thailand", region: "Asia", isLatam: false },
  { name: "Vietnam", region: "Asia", isLatam: false },
  { name: "Cambodia", region: "Asia", isLatam: false },
  { name: "Laos", region: "Asia", isLatam: false },
  { name: "Malaysia", region: "Asia", isLatam: false },
  { name: "Singapore", region: "Asia", isLatam: false },
  { name: "Indonesia", region: "Asia", isLatam: false },
  { name: "Philippines", region: "Asia", isLatam: false },
  { name: "Brunei", region: "Asia", isLatam: false },
  { name: "Timor-leste", region: "Asia", isLatam: false },
  { name: "Kazakhstan", region: "Asia", isLatam: false },
  { name: "Uzbekistan", region: "Asia", isLatam: false },
  { name: "Turkmenistan", region: "Asia", isLatam: false },
  { name: "Kyrgyzstan", region: "Asia", isLatam: false },
  { name: "Tajikistan", region: "Asia", isLatam: false },
  // Oceania
  { name: "Australia", region: "Oceania", isLatam: false },
  { name: "New Zealand", region: "Oceania", isLatam: false },
  { name: "Papua New Guinea", region: "Oceania", isLatam: false },
  { name: "Fiji", region: "Oceania", isLatam: false },
  { name: "Solomon Islands", region: "Oceania", isLatam: false },
  { name: "Vanuatu", region: "Oceania", isLatam: false },
  { name: "Samoa", region: "Oceania", isLatam: false },
  { name: "Tonga", region: "Oceania", isLatam: false },
  { name: "Kiribati", region: "Oceania", isLatam: false },
  { name: "Micronesia", region: "Oceania", isLatam: false },
  { name: "Marshall Islands", region: "Oceania", isLatam: false },
  { name: "Palau", region: "Oceania", isLatam: false },
  { name: "Nauru", region: "Oceania", isLatam: false },
  { name: "Tuvalu", region: "Oceania", isLatam: false },
]

// case-insensitive name -> GeoCountry
const BY_LOWER: Record<string, GeoCountry> = {}
for (const c of GEO_COUNTRIES) BY_LOWER[c.name.toLowerCase()] = c

export function lookupCountry(name: string): GeoCountry | undefined {
  return BY_LOWER[name.trim().toLowerCase()]
}

// True only for a KNOWN LATAM country. Unknown/legacy free-text values return false
// (the chip falls back to the neutral style in that case -- see GeographyChips).
export function isLatamCountry(name: string): boolean {
  return lookupCountry(name)?.isLatam ?? false
}

// Slice Y1 region filter: classify a source's geography from its subject_countries. A value resolves
// LATAM-side (a region==='LATAM' country via lookupCountry, or the 'REGIONAL' sentinel) or
// extra-LATAM-side (any other known country, or the 'GLOBAL' sentinel); a value not in the vocab
// counts as neither. hasLatam/hasExtra can BOTH be true -- a genuinely mixed source. Shared by
// NewsTab (Intel) and AllSourcesTab (committed library) so the region predicate has one definition.
export function classifyGeo(subjectCountries: string[]): { hasLatam: boolean; hasExtra: boolean } {
  let hasLatam = false, hasExtra = false
  for (const v of subjectCountries) {
    const u = v.trim().toUpperCase()
    if (u === 'REGIONAL') { hasLatam = true; continue }
    if (u === 'GLOBAL')   { hasExtra = true; continue }
    const c = lookupCountry(v)
    if (!c) continue
    if (c.isLatam) hasLatam = true; else hasExtra = true
  }
  return { hasLatam, hasExtra }
}
