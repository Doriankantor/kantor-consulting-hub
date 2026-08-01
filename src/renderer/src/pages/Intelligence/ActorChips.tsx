// Actor-2: the actor-axis chip UI on the News card, under the geography row. Reads the Actor-1
// `actors` column ([{name,type}]), edits via the updateActors writer. Simpler than GeographyChips:
// a FLAT list, no subject/mentioned split, no sub-nesting. One new dimension — each actor has a
// TYPE, color-tinted via actorTypeClass (shared with the capability badges) and click-to-cycle.
// Every mutation emits the WHOLE actors array via onChange — never incremental.
import { useState } from 'react'
import { actorTypeClass } from './actorTypeClass'

export interface ActorChipsProps {
  actors: { name: string; type: string }[]
  aiUnconfirmed?: boolean                                   // amber "AI" badge until first edit this session
  onChange: (actors: { name: string; type: string }[]) => void
}

// Click-to-cycle order for the type dimension (matches actorTypeClass's four real families + unknown).
const TYPE_CYCLE = ['VNSA', 'state', 'extra-regional', 'commercial', 'unknown']
const nextType = (t: string): string => {
  const i = TYPE_CYCLE.findIndex(x => x.toLowerCase() === (t || '').toLowerCase())
  return TYPE_CYCLE[(i + 1) % TYPE_CYCLE.length]   // -1 (unknown/invalid) → index 0 → VNSA
}

const ACTOR_CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium'
const ADD_BTN = 'px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 dark:text-white/30 border border-dashed border-gray-300 dark:border-white/[0.15] hover:text-gray-600 dark:hover:text-white/60'
const INPUT = 'px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-transparent text-[11px] text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-28'
const AI_BADGE = 'ml-0.5 px-1 rounded bg-amber-200/70 dark:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-[8px] font-bold uppercase tracking-wide'

const XGlyph = () => (
  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
)

// trim / drop-empty / case-insensitive de-dupe by name.
function dedupe(arr: { name: string; type: string }[]): { name: string; type: string }[] {
  const seen = new Set<string>(), out: { name: string; type: string }[] = []
  for (const a of arr) {
    const name = String(a?.name ?? '').trim()
    if (!name) continue
    const k = name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); out.push({ name, type: a?.type || 'unknown' })
  }
  return out.slice(0, 20)   // cap ~20
}

export default function ActorChips({ actors, aiUnconfirmed, onChange }: ActorChipsProps) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')

  const commitAdd = (raw: string) => {
    const n = raw.trim()
    if (n) onChange(dedupe([...actors, { name: n, type: 'unknown' }]))
    setAdding(false); setValue('')
  }
  const remove = (name: string) => onChange(actors.filter(a => a.name.toLowerCase() !== name.toLowerCase()))
  const cycle = (name: string) => onChange(actors.map(a =>
    a.name.toLowerCase() === name.toLowerCase() ? { ...a, type: nextType(a.type) } : a))

  const aiBadge = aiUnconfirmed ? <span className={AI_BADGE} title="AI-extracted actors — edit to confirm">AI</span> : null

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

  // Empty → just the "+ actor" affordance (never a broken row).
  if (actors.length === 0) return addControl

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {actors.map(a => (
        <span key={a.name} className={`${ACTOR_CHIP} ${actorTypeClass(a.type)}`}>
          <button
            className="hover:underline"
            onClick={() => cycle(a.name)}
            title={`${a.type} — click to change type`}
          >
            {a.name}
          </button>
          <button onClick={() => remove(a.name)} className="opacity-60 hover:opacity-100" title={`Remove ${a.name}`}><XGlyph /></button>
        </span>
      ))}
      {addControl}
      {aiBadge}
    </span>
  )
}
