// Geo-2 Part B: nested country + sub-geo chip UI on the News card. Reads the Geo-1/Geo-2
// columns (subject_countries / mentioned_countries / sub_geographies), edits via the Part A
// updateCountries writer. Inline-edit idiom mirrors the scalar geography chip (click → input →
// Enter commits / Escape cancels). SUBJECT = filled emerald (generates placements, nests sub-geo);
// MENTIONED = ghost/outlined (metadata, no nesting). The scalar geography value survives here as a
// read-through fallback for pre-Geo-1 sources. Every mutation emits the WHOLE {subject, mentioned,
// subGeo} via onChange — never incremental.
import { useState } from 'react'

export interface GeographyChipsProps {
  subject: string[]
  mentioned: string[]
  subGeo: Record<string, string[]>
  scalarFallback?: string | null      // source.geography — shown only when both lists are empty
  aiUnconfirmed?: boolean             // amber "AI" badge until the researcher first edits this session
  onChange: (subject: string[], mentioned: string[], subGeo: Record<string, string[]>) => void
}

// ── shared styles (emerald axis family; ghost reuses SectionProposalBadge's language) ─────────
const SUBJECT_CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
const MENTIONED_CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-transparent border border-slate-300 dark:border-white/15 text-slate-500 dark:text-white/50'
const ADD_BTN = 'px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 dark:text-white/30 border border-dashed border-gray-300 dark:border-white/[0.15] hover:text-gray-600 dark:hover:text-white/60'
const INPUT = 'px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-transparent text-[11px] text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-24'
const AI_BADGE = 'ml-0.5 px-1 rounded bg-amber-200/70 dark:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-[8px] font-bold uppercase tracking-wide'

const Pin = () => (
  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
    <path d="M5 .8C3 .8 1.6 2.2 1.6 4.1c0 2.3 3.4 5.1 3.4 5.1s3.4-2.8 3.4-5.1C8.4 2.2 7 .8 5 .8z" stroke="currentColor" strokeWidth="1" />
    <circle cx="5" cy="4" r="1.1" fill="currentColor" />
  </svg>
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

type EditState = { mode: 'country' | 'mentioned' | 'sub'; country?: string; value: string } | null

export default function GeographyChips({ subject, mentioned, subGeo, scalarFallback, aiUnconfirmed, onChange }: GeographyChipsProps) {
  const [edit, setEdit] = useState<EditState>(null)
  const close = () => setEdit(null)

  // ── whole-state mutations (each rebuilds all three and emits) ───────────────────────────────
  const addSubject = (name: string) => {
    const n = name.trim(); if (!n) { close(); return }
    onChange(dedupe([...subject, n]), without(mentioned, n), subGeo); close()
  }
  const addMentioned = (name: string) => {
    const n = name.trim(); if (!n) { close(); return }
    const nextSub = without(subject, n)
    const nextSubGeo = { ...subGeo }; delete nextSubGeo[n]  // if it was a subject, drop its sub-geo
    // also handle case-difference key removal
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

  // inline input shared by every add path — commit on Enter, cancel on Escape.
  const inlineInput = (placeholder: string, onCommit: (v: string) => void) => (
    <input
      autoFocus
      value={edit?.value ?? ''}
      onChange={e => setEdit(s => (s ? { ...s, value: e.target.value } : s))}
      onKeyDown={e => { if (e.key === 'Enter') onCommit(edit?.value ?? ''); if (e.key === 'Escape') close() }}
      onBlur={() => onCommit(edit?.value ?? '')}
      placeholder={placeholder}
      className={INPUT}
    />
  )

  const aiBadge = aiUnconfirmed ? <span className={AI_BADGE} title="AI-proposed geography — edit to confirm">AI</span> : null
  const isEmpty = subject.length === 0 && mentioned.length === 0

  // ── EMPTY STATE ─────────────────────────────────────────────────────────────────────────────
  if (isEmpty) {
    // Starting a list from the "+ country" affordance.
    if (edit?.mode === 'country') {
      return <span className="inline-flex items-center gap-1">{inlineInput('Country…', addSubject)}</span>
    }
    if (scalarFallback) {
      // Read-through of the gate-set scalar (pre-Geo-1 sources look identical to today) + start-a-list.
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className={SUBJECT_CHIP} title="Gate-set geography (read-only here — edit moved to the country lists)">
            <Pin />{scalarFallback}
          </span>
          <button className={ADD_BTN} onClick={() => setEdit({ mode: 'country', value: '' })} title="Add subject country">+ country</button>
        </span>
      )
    }
    return (
      <button className={ADD_BTN} onClick={() => setEdit({ mode: 'country', value: '' })} title="Add geography">+ geography</button>
    )
  }

  // ── LIST STATE ──────────────────────────────────────────────────────────────────────────────
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {subject.map(country => {
        const subs = subGeo[country] ?? []
        const editingSub = edit?.mode === 'sub' && edit.country === country
        return (
          <span key={`s-${country}`} className={SUBJECT_CHIP}>
            <Pin />
            <button
              className="hover:underline"
              onClick={() => setEdit({ mode: 'sub', country, value: '' })}
              title={`Add a sub-area to ${country}`}
            >
              {country}
            </button>
            {subs.length > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600/80 dark:text-emerald-300/70">
                <span aria-hidden>▸</span>
                {subs.map(area => (
                  <span key={area} className="inline-flex items-center gap-0.5">
                    {area}
                    <button onClick={() => removeSub(country, area)} className="opacity-60 hover:opacity-100" title={`Remove ${area}`}><XGlyph /></button>
                  </span>
                ))}
              </span>
            )}
            {editingSub && <span className="ml-1">{inlineInput('Area…', v => addSub(country, v))}</span>}
            <button onClick={() => removeCountry(country, 'subject')} className="ml-0.5 opacity-60 hover:opacity-100" title={`Remove ${country}`}><XGlyph /></button>
          </span>
        )
      })}

      {mentioned.map(country => (
        <span key={`m-${country}`} className={MENTIONED_CHIP} title="Mentioned (metadata only — does not generate placements)">
          {country}
          <button onClick={() => removeCountry(country, 'mentioned')} className="opacity-60 hover:opacity-100" title={`Remove ${country}`}><XGlyph /></button>
        </span>
      ))}

      {/* + country (→ subject, the common case) */}
      {edit?.mode === 'country'
        ? inlineInput('Country…', addSubject)
        : <button className={ADD_BTN} onClick={() => setEdit({ mode: 'country', value: '' })} title="Add subject country">+ country</button>}

      {/* + mentioned (secondary) */}
      {edit?.mode === 'mentioned'
        ? inlineInput('Mentioned…', addMentioned)
        : <button className={`${ADD_BTN} opacity-70`} onClick={() => setEdit({ mode: 'mentioned', value: '' })} title="Add mentioned country (metadata)">+ mentioned</button>}

      {aiBadge}
    </span>
  )
}
