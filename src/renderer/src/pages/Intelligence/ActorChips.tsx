// Actor-2: the actor-axis chip UI on the News card, under the geography row. Reads the Actor-1
// `actors` column ([{name,type}]), edits via the updateActors writer. Simpler than GeographyChips:
// a FLAT list, no subject/mentioned split, no sub-nesting. One new dimension — each actor has a
// TYPE, color-tinted via actorTypeClass (shared with the capability badges) and click-to-cycle.
// Every mutation emits the WHOLE actors array via onChange — never incremental.
import { useState } from 'react'
import { actorTypeClass } from './actorTypeClass'
import OverflowPopover from './OverflowPopover'
import { groupActors } from './actorGroups'
import ProvenanceMark from '../../components/source-card/ProvenanceMark'

// Slice B step 2a: an actor carries its provenance origin ('ai' by default; 'human' once a researcher
// adds or edits it). It rides inside the existing `actors` JSON (parse.ts preserves it, updateActors
// JSON.stringifies the whole array), so there is NO schema/IPC change.
type Actor = { name: string; type: string; origin: 'ai' | 'human' }

export interface ActorChipsProps {
  actors: Actor[]
  aiUnconfirmed?: boolean                                   // (unused since 2a: provenance is per-chip now; kept harmless)
  editable: boolean                                         // Slice 2b: read mounts get flat chips (no ×/cycle/add)
  onChange: (actors: Actor[]) => void
}

const MAX_INLINE = 5   // Slice 2b: chips beyond this collapse behind the "... +N" popover

// Click-to-cycle order for the type dimension (matches actorTypeClass's four real families + unknown).
const TYPE_CYCLE = ['VNSA', 'state', 'extra-regional', 'commercial', 'unknown']
const nextType = (t: string): string => {
  const i = TYPE_CYCLE.findIndex(x => x.toLowerCase() === (t || '').toLowerCase())
  return TYPE_CYCLE[(i + 1) % TYPE_CYCLE.length]   // -1 (unknown/invalid) → index 0 → VNSA
}

const ACTOR_CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium'
// "... +N" overflow pill in the Zone C (engaged entities) violet accent.
const MORE_PILL = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-500/25 transition'
const ADD_BTN = 'px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 dark:text-white/30 border border-dashed border-gray-300 dark:border-white/[0.15] hover:text-gray-600 dark:hover:text-white/60'
const INPUT = 'px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-transparent text-[11px] text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-28'

const XGlyph = () => (
  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
)

// trim / drop-empty / case-insensitive de-dupe by name. Preserves each actor's origin (2a).
function dedupe(arr: Actor[]): Actor[] {
  const seen = new Set<string>(), out: Actor[] = []
  for (const a of arr) {
    const name = String(a?.name ?? '').trim()
    if (!name) continue
    const k = name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); out.push({ name, type: a?.type || 'unknown', origin: a?.origin === 'human' ? 'human' : 'ai' })
  }
  return out
}

export default function ActorChips({ actors, aiUnconfirmed, editable, onChange }: ActorChipsProps) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')

  const commitAdd = (raw: string) => {
    const n = raw.trim()
    if (n) onChange(dedupe([...actors, { name: n, type: 'unknown', origin: 'human' }]))   // 2a: a human added it
    setAdding(false); setValue('')
  }
  const remove = (name: string) => onChange(actors.filter(a => a.name.toLowerCase() !== name.toLowerCase()))
  const cycle = (name: string) => onChange(actors.map(a =>
    a.name.toLowerCase() === name.toLowerCase() ? { ...a, type: nextType(a.type), origin: 'human' } : a))   // 2a: a human edit = human provenance

  // One chip. Handlers (cycle/remove) are the same verbatim ones; `editable` only decides
  // whether the name cycles the type and whether the × remove control renders (flat on read).
  // Slice B step 2a: each chip LEADS with its provenance mark -- violet H once a human added/edited
  // it (origin==='human'), else the amber AI mark (AI-extracted / pre-2a actors default to 'ai').
  const renderChip = (a: Actor) => (
    <span key={a.name} className={`${ACTOR_CHIP} ${actorTypeClass(a.type)}`}>
      {a.origin === 'human' ? <ProvenanceMark kind="human" hue="violet" /> : <ProvenanceMark kind="ai" />}
      {editable ? (
        <button className="hover:underline" onClick={() => cycle(a.name)} title={`${a.type} — click to change type`}>{a.name}</button>
      ) : (
        <span title={a.type}>{a.name}</span>
      )}
      {editable && (
        <button onClick={() => remove(a.name)} className="opacity-60 hover:opacity-100" title={`Remove ${a.name}`}><XGlyph /></button>
      )}
    </span>
  )

  const addControl = adding ? (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commitAdd(value); if (e.key === 'Escape') { setAdding(false); setValue('') } }}
      onBlur={() => commitAdd(value)}
      placeholder="Actor…"
      className={INPUT}
    />
  ) : (
    <button className={ADD_BTN} onClick={() => setAdding(true)} title="Add actor">+ actor</button>
  )

  // Empty → just the "+ actor" affordance when editable (never a broken row); nothing on read.
  if (actors.length === 0) return editable ? addControl : null

  // Slice 2b: cap the inline row at MAX_INLINE; the rest live behind a "... +N" pill that
  // opens a popover with ALL actors grouped by type. Chips render identically in both places.
  const overflow = actors.length - MAX_INLINE

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {actors.slice(0, MAX_INLINE).map(renderChip)}
      {overflow > 0 && (
        <OverflowPopover
          count={overflow}
          pillClassName={MORE_PILL}
          groups={groupActors(actors).map(g => ({ label: g.label, count: g.actors.length, chips: g.actors.map(renderChip) }))}
        />
      )}
      {editable && addControl}
    </span>
  )
}
