// Slice 2b: DATA-DRIVEN actor grouping for the overflow popover. The mockup grouped
// actors by a name-regex only because its mock data was bare strings; our actors carry a
// real `type` field (the TYPE_CYCLE families), so we group by that instead. Fixed display
// order; empty groups are skipped (as the mockup skipped empties). Any actor whose type is
// not one of the five known families falls into "Unknown" (defensive), never dropped.

// Slice B step 2a: actors carry an `origin` provenance field; group buckets preserve it so the
// overflow-popover chips render the same per-chip AI/H mark as the inline chips.
type Actor = { name: string; type: string; origin: 'ai' | 'human' }

export interface ActorGroup {
  label: string
  actors: Actor[]
}

// type value (lower-case) -> display label, in fixed render order.
const GROUP_ORDER: { type: string; label: string }[] = [
  { type: 'vnsa', label: 'VNSAs' },
  { type: 'state', label: 'State forces' },
  { type: 'commercial', label: 'Industry' },
  { type: 'extra-regional', label: 'Extra-regional' },
  { type: 'unknown', label: 'Unknown' },
]

export function groupActors(actors: Actor[]): ActorGroup[] {
  const buckets = new Map<string, Actor[]>()
  for (const g of GROUP_ORDER) buckets.set(g.type, [])
  for (const a of actors) {
    const key = (a?.type || '').toLowerCase()
    ;(buckets.get(key) ?? buckets.get('unknown')!).push(a)   // unknown/invalid -> Unknown
  }
  return GROUP_ORDER
    .map(g => ({ label: g.label, actors: buckets.get(g.type)! }))
    .filter(g => g.actors.length > 0)
}
