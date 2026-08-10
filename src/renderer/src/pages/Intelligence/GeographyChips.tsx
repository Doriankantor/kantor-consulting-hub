// Geo slice 2b Piece A: the GEOGRAPHY PICKER. Upgrades the Geo-2 country-chip UI into a
// scoped, frequency-ranked, pick-from-list picker. STORAGE MODEL (Option S, locked): every
// value lives in subject_countries[] -- countries AND the level sentinels 'REGIONAL' (the
// LATAM aggregation level; DISPLAYED as "LATAM") and 'GLOBAL'. The onChange contract is
// UNCHANGED (subject, mentioned, subGeo), so the sole current mount (Intel NewsTab card) is
// unaffected; New Sources (PipelineSourceCard) mounts the same component in slice A2.
//
// Chip kinds are distinguished BY VALUE and colored: LATAM country = clay, non-LATAM country =
// blue, 'REGIONAL'/'GLOBAL' sentinel = violet accent (globe), mentioned = neutral ghost.
// SUBJECT generates placements + nests sub-areas; MENTIONED is metadata (no nesting, no color).
// The scalar geography value survives as a read-through fallback for pre-Geo-1 sources. Every
// mutation emits the WHOLE {subject, mentioned, subGeo} via onChange -- never incremental.
//
// Region for a picked country is DERIVED from the RENDERER vocab mirror (geographyVocab.ts);
// main and renderer do not share modules, so that file is a hand-synced copy of geography.ts.
import { useState } from 'react'
import { GEO_COUNTRIES, lookupCountry } from './geographyVocab'

export interface GeographyChipsProps {
  subject: string[]
  mentioned: string[]
  subGeo: Record<string, string[]>
  aiUnconfirmed?: boolean             // amber "AI" badge until the researcher first edits this session
  onChange: (subject: string[], mentioned: string[], subGeo: Record<string, string[]>) => void
}

// ── chip styles ───────────────────────────────────────────────────────────────────────────────
// Country chips are colored by scope. Clay ≈ #FAECE7/#712B13/#F0997B (LATAM), blue ≈
// #E6F1FB/#0C447C/#85B7EB (extra-LATAM); dark mode uses the app's orange/blue token families.
const CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border'
const CLAY_CHIP     = `${CHIP} bg-[#FAECE7] dark:bg-orange-500/10 text-[#712B13] dark:text-orange-200 border-[#F0997B] dark:border-orange-500/30`
const BLUE_CHIP     = `${CHIP} bg-[#E6F1FB] dark:bg-blue-500/10 text-[#0C447C] dark:text-blue-200 border-[#85B7EB] dark:border-blue-500/30`
const ACCENT_CHIP   = `${CHIP} bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-500/30`
// Legacy/unknown subject value (not in the vocab) → the original neutral emerald, so pre-existing
// free-text geographies still render sensibly.
const SUBJECT_CHIP  = `${CHIP} bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-transparent`
const MENTIONED_CHIP = `${CHIP} bg-transparent border-slate-300 dark:border-white/15 text-slate-500 dark:text-white/50`
const ADD_BTN = 'px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 dark:text-white/30 border border-dashed border-gray-300 dark:border-white/[0.15] hover:text-gray-600 dark:hover:text-white/60'
const INPUT = 'px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-transparent text-[11px] text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-32'
const AI_BADGE = 'ml-0.5 px-1 rounded bg-amber-200/70 dark:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-[8px] font-bold uppercase tracking-wide'
const HINT = 'text-[9px] text-gray-400 dark:text-white/30'
const ROW_LABEL = 'text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30'

// segmented scope toggle
const SEG = 'px-2 py-0.5 text-[10px] font-medium transition'
const SEG_LATAM_ON = 'bg-[#FAECE7] dark:bg-orange-500/15 text-[#712B13] dark:text-orange-200'
const SEG_EXTRA_ON = 'bg-[#E6F1FB] dark:bg-blue-500/15 text-[#0C447C] dark:text-blue-200'
const SEG_OFF = 'bg-transparent text-gray-400 dark:text-white/35 hover:text-gray-600 dark:hover:text-white/60'

// level toggles (aggregation row)
const LVL_BASE = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition border'
const LVL_ON = 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-500/40'
const LVL_OFF = 'bg-transparent text-violet-500 dark:text-violet-300/70 border-violet-300/60 dark:border-violet-500/25 hover:bg-violet-50 dark:hover:bg-violet-500/10'
const LVL_DISABLED = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-dashed border-gray-300 dark:border-white/15 text-gray-400 dark:text-white/25 opacity-50 cursor-not-allowed'

const MAX_SUGGESTIONS = 5

const Pin = () => (
  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
    <path d="M5 .8C3 .8 1.6 2.2 1.6 4.1c0 2.3 3.4 5.1 3.4 5.1s3.4-2.8 3.4-5.1C8.4 2.2 7 .8 5 .8z" stroke="currentColor" strokeWidth="1" />
    <circle cx="5" cy="4" r="1.1" fill="currentColor" />
  </svg>
)
const Globe = () => (
  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1" />
    <path d="M1 5h8M5 1c1.6 1.2 1.6 6.8 0 8M5 1C3.4 2.2 3.4 7.8 5 9" stroke="currentColor" strokeWidth="0.8" />
  </svg>
)
const Check = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M2 5.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const XGlyph = () => (
  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
)

// trim / drop-empty / case-insensitive de-dupe within a list.
function dedupe(arr: string[]): string[] {
  const seen = new Set<string>(), out: string[] = []
  for (const raw of arr) {
    const s = String(raw ?? '').trim()
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); out.push(s)
  }
  return out
}
const without = (arr: string[], name: string): string[] => arr.filter(x => x.toLowerCase() !== name.trim().toLowerCase())

// Level sentinels: stored UPPER-CASE in subject[]; 'REGIONAL' DISPLAYS as "LATAM".
type Sentinel = 'REGIONAL' | 'GLOBAL'
const asSentinel = (v: string): Sentinel | null => {
  const u = v.trim().toUpperCase()
  return u === 'REGIONAL' ? 'REGIONAL' : u === 'GLOBAL' ? 'GLOBAL' : null
}
const sentinelLabel = (s: Sentinel): string => (s === 'REGIONAL' ? 'LATAM' : 'Global')
// Country chip color: known LATAM → clay, known non-LATAM → blue, unknown/legacy → neutral emerald.
function countryChipClass(name: string): string {
  const c = lookupCountry(name)
  if (!c) return SUBJECT_CHIP
  return c.isLatam ? CLAY_CHIP : BLUE_CHIP
}

// Decision B: derive the scope toggle's INITIAL side from the source's existing subject chips.
// All-LATAM (LATAM countries and/or the REGIONAL sentinel) → 'latam'; all-extra-LATAM (non-LATAM
// countries and/or the GLOBAL sentinel) → 'extra'; a mix of both sides → 'both' (both segments lit);
// EMPTY subject, or only values not in the vocab → null (NEUTRAL — neither segment lit, typeahead
// disabled until the user picks a side). Pure; consumed ONCE via lazy useState init, so a user's
// later click owns the toggle and is never re-clobbered on re-render. A value not in geographyVocab
// counts as NEITHER side (ignored), so an unknown value alongside real ones doesn't block derivation.
function deriveInitialScope(subject: string[]): 'latam' | 'extra' | 'both' | null {
  let hasLatam = false, hasExtra = false
  for (const value of subject) {
    const sent = asSentinel(value)
    if (sent === 'REGIONAL') { hasLatam = true; continue }   // REGIONAL sentinel counts LATAM-side
    if (sent === 'GLOBAL')   { hasExtra = true; continue }   // GLOBAL sentinel counts extra-LATAM-side
    const c = lookupCountry(value)
    if (!c) continue                                         // not in vocab → counts as neither
    if (c.isLatam) hasLatam = true; else hasExtra = true
  }
  if (hasLatam && hasExtra) return 'both'
  if (hasLatam) return 'latam'
  if (hasExtra) return 'extra'
  return null                                 // empty, or only unresolvable values → neutral
}

type EditState = { mode: 'sub'; country: string; value: string } | { mode: 'mentioned'; value: string } | null

export default function GeographyChips({ subject, mentioned, subGeo, aiUnconfirmed, onChange }: GeographyChipsProps) {
  const [edit, setEdit] = useState<EditState>(null)
  // Initial side derived from the source's existing subject chips (Decision B); 'both' = mixed card
  // (both segments lit, unscoped search), null = neutral empty card (no side lit, typeahead disabled
  // until a side is picked). Lazy init → derived ONCE from the mount-time subject set; user clicks
  // take over afterward and are never re-derived away.
  const [scope, setScope] = useState<'latam' | 'extra' | 'both' | null>(() => deriveInitialScope(subject))   // scopes ONLY the typeahead candidate list
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)                          // typeahead dropdown visibility
  const [counts, setCounts] = useState<Record<string, number> | null>(null)  // cached once per open, never per keystroke
  const close = () => setEdit(null)

  // Frequency counts for the typeahead ranking. Loaded LAZILY on first typeahead focus (not on
  // mount) so a card the researcher never touches costs nothing; cached for the component's life.
  const ensureCounts = () => {
    if (counts !== null) return
    setCounts({})   // mark "loading" so we don't fire twice
    window.api.infoPages.getCountryUsageCounts()
      .then(r => setCounts(r?.ok ? r.counts : {}))
      .catch(() => setCounts({}))
  }

  // ── whole-state mutations (each rebuilds all three and emits) ───────────────────────────────
  const pickCountry = (name: string) => {
    onChange(dedupe([...subject, name]), without(mentioned, name), subGeo)
    setQuery(''); setOpen(false)
  }
  const addMentioned = (name: string) => {
    const n = name.trim(); if (!n) { close(); return }
    const nextSub = without(subject, n)
    const nextSubGeo = { ...subGeo }
    for (const k of Object.keys(nextSubGeo)) if (k.toLowerCase() === n.toLowerCase()) delete nextSubGeo[k]
    onChange(nextSub, dedupe([...mentioned, n]), nextSubGeo); close()
  }
  const removeCountry = (name: string, list: 'subject' | 'mentioned') => {
    if (list === 'subject') {
      const nextSubGeo = { ...subGeo }
      for (const k of Object.keys(nextSubGeo)) if (k.toLowerCase() === name.toLowerCase()) delete nextSubGeo[k]
      onChange(without(subject, name), mentioned, nextSubGeo)
    } else {
      onChange(subject, without(mentioned, name), subGeo)
    }
  }
  const addSub = (country: string, area: string) => {
    const a = area.trim(); if (!a) { close(); return }
    const cur = subGeo[country] ?? []
    onChange(subject, mentioned, { ...subGeo, [country]: dedupe([...cur, a]) }); close()
  }
  const removeSub = (country: string, area: string) => {
    const nextArr = without(subGeo[country] ?? [], area)
    const next = { ...subGeo }
    if (nextArr.length) next[country] = nextArr; else delete next[country]
    onChange(subject, mentioned, next)
  }
  // Level toggle: add/remove a sentinel value in subject[]. STORAGE stays the sentinel string.
  const hasSentinel = (s: Sentinel): boolean => subject.some(v => asSentinel(v) === s)
  const toggleSentinel = (s: Sentinel) => {
    if (hasSentinel(s)) onChange(subject.filter(v => asSentinel(v) !== s), mentioned, subGeo)
    else onChange(dedupe([...subject, s]), without(mentioned, s), subGeo)
  }

  // inline input (sub-area + mentioned) — commit on Enter, cancel on Escape.
  const inlineInput = (placeholder: string, onCommit: (v: string) => void) => (
    <input
      autoFocus
      value={edit && 'value' in edit ? edit.value : ''}
      onChange={e => setEdit(s => (s ? { ...s, value: e.target.value } : s))}
      onKeyDown={e => { if (e.key === 'Enter') onCommit(edit && 'value' in edit ? edit.value : ''); if (e.key === 'Escape') close() }}
      onBlur={() => onCommit(edit && 'value' in edit ? edit.value : '')}
      placeholder={placeholder}
      className={INPUT}
    />
  )

  // ── typeahead candidates: active-scope countries, substring match, not-already-picked, freq-ranked ─
  const q = query.trim().toLowerCase()
  const selectedLower = new Set(subject.map(s => s.toLowerCase()))
  const suggestions = (q === '' || scope === null)
    ? []                                            // null = no scope chosen → input disabled, no list
    : GEO_COUNTRIES
        // 'both' searches ALL countries; a single side filters to it. (null never reaches here.)
        .filter(c => (scope === 'both' ? true : c.isLatam === (scope === 'latam')))
        .filter(c => c.name.toLowerCase().includes(q))
        .filter(c => !selectedLower.has(c.name.toLowerCase()))
        .map(c => ({ name: c.name, count: counts?.[c.name] ?? 0 }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, MAX_SUGGESTIONS)
  const useLabel = (n: number) => (n === 0 ? 'new' : `${n} use${n === 1 ? '' : 's'}`)

  const aiBadge = aiUnconfirmed ? <span className={AI_BADGE} title="AI-proposed geography — edit to confirm">AI</span> : null
  const regionalOn = hasSentinel('REGIONAL')

  return (
    <div className="inline-flex flex-col gap-1 align-top">
      {/* ── CHIPS ROW (all kinds intermixed, colored by kind) ─────────────────────────────────── */}
      {/* Slice X: the scalar `geography` column is never rendered here anymore — an empty subject
          shows the empty-state picker (disabled typeahead prompt), not a stale scalar pill. */}
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {subject.map(value => {
          const sent = asSentinel(value)
          if (sent) {
            // level sentinel — accent chip, globe, NOT sub-drillable
            return (
              <span key={`x-${value}`} className={ACCENT_CHIP} title={`${sentinelLabel(sent)} level (stored as ${sent})`}>
                <Globe />{sentinelLabel(sent)}
                <button onClick={() => removeCountry(value, 'subject')} className="ml-0.5 opacity-60 hover:opacity-100" title={`Remove ${sentinelLabel(sent)}`}><XGlyph /></button>
              </span>
            )
          }
          const subs = subGeo[value] ?? []
          const editingSub = edit?.mode === 'sub' && edit.country === value
          return (
            <span key={`s-${value}`} className={countryChipClass(value)}>
              <Pin />
              <button className="hover:underline" onClick={() => setEdit({ mode: 'sub', country: value, value: '' })} title={`Add a sub-area to ${value}`}>
                {value}
              </button>
              {subs.length > 0 && (
                <span className="inline-flex items-center gap-1 opacity-80">
                  <span aria-hidden>▸</span>
                  {subs.map(area => (
                    <span key={area} className="inline-flex items-center gap-0.5">
                      {area}
                      <button onClick={() => removeSub(value, area)} className="opacity-60 hover:opacity-100" title={`Remove ${area}`}><XGlyph /></button>
                    </span>
                  ))}
                </span>
              )}
              {editingSub && <span className="ml-1">{inlineInput('Area…', v => addSub(value, v))}</span>}
              <button onClick={() => removeCountry(value, 'subject')} className="ml-0.5 opacity-60 hover:opacity-100" title={`Remove ${value}`}><XGlyph /></button>
            </span>
          )
        })}

        {mentioned.map(country => (
          <span key={`m-${country}`} className={MENTIONED_CHIP} title="Mentioned (metadata only — does not generate placements)">
            {country}
            <button onClick={() => removeCountry(country, 'mentioned')} className="opacity-60 hover:opacity-100" title={`Remove ${country}`}><XGlyph /></button>
          </span>
        ))}
        {aiBadge}
      </span>

      {/* ── SCOPE TOGGLE + hint ───────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-gray-200 dark:border-white/15 overflow-hidden">
          <button onClick={() => setScope('latam')} className={`${SEG} ${scope === 'latam' || scope === 'both' ? SEG_LATAM_ON : SEG_OFF}`}>LATAM</button>
          <button onClick={() => setScope('extra')} className={`${SEG} ${scope === 'extra' || scope === 'both' ? SEG_EXTRA_ON : SEG_OFF} border-l border-gray-200 dark:border-white/15`}>extra-LATAM</button>
        </div>
        <span className={HINT}>scope for the search</span>
      </div>

      {/* ── TYPEAHEAD (pick-from-list only) + mentioned add ───────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <input
            value={query}
            disabled={scope === null}   // neutral empty card: no scope chosen → typeahead locked
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => { ensureCounts(); setOpen(true) }}
            onBlur={() => setOpen(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' && suggestions.length) { e.preventDefault(); pickCountry(suggestions[0].name) }
              if (e.key === 'Escape') { setQuery(''); setOpen(false) }
            }}
            placeholder={scope === null ? 'Select LATAM or extra-LATAM first' : scope === 'latam' ? 'Add LATAM country…' : 'Add country…'}
            className={`${INPUT} ${scope === null ? 'opacity-50 cursor-not-allowed !w-56' : ''}`}
          />
          {open && q !== '' && (
            <div className="absolute left-0 top-full mt-0.5 z-20 min-w-[170px] max-h-56 overflow-y-auto rounded-md border border-gray-200 dark:border-white/15 bg-white dark:bg-gray-900 shadow-lg py-0.5">
              {suggestions.length === 0 ? (
                <div className="px-2 py-1 text-[10px] text-gray-400 dark:text-white/30 italic">no match — pick from the list</div>
              ) : suggestions.map(s => (
                <button
                  key={s.name}
                  onMouseDown={e => e.preventDefault()}   // keep input focus so onBlur doesn't pre-empt the click
                  onClick={() => pickCountry(s.name)}
                  className="w-full flex items-center justify-between gap-3 px-2 py-1 text-left text-[11px] text-gray-700 dark:text-white/80 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                >
                  <span>{s.name}</span>
                  <span className="text-[9px] text-gray-400 dark:text-white/35 shrink-0">{useLabel(s.count)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {edit?.mode === 'mentioned'
          ? inlineInput('Mentioned…', addMentioned)
          : <button className={`${ADD_BTN} opacity-70`} onClick={() => setEdit({ mode: 'mentioned', value: '' })} title="Add mentioned country (metadata)">+ mentioned</button>}
      </div>

      {/* ── LEVELS ROW (aggregation toggles) ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={ROW_LABEL}>levels:</span>
        <button
          onClick={() => toggleSentinel('REGIONAL')}
          className={`${LVL_BASE} ${regionalOn ? LVL_ON : LVL_OFF}`}
          title={regionalOn ? 'LATAM (regional) level — click to remove' : 'Add LATAM (regional) level placement'}
        >
          <Globe />LATAM{regionalOn && <Check />}
        </button>
        <button disabled className={LVL_DISABLED} title="other regions coming soon">+ region</button>
        <button disabled className={LVL_DISABLED} title="global coming soon">+ Global</button>
      </div>
    </div>
  )
}
