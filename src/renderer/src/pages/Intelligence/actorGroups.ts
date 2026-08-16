// Slice 2b: DATA-DRIVEN actor grouping for the overflow popover. The mockup grouped
// actors by a name-regex only because its mock data was bare strings; our actors carry a
// real `type` field (the TYPE_CYCLE families), so we group by that instead. Fixed display
// order; empty groups are skipped (as the mockup skipped empties). Any actor whose type is
// not one of the five known families falls into "Unknown" (defensive), never dropped.

export interface ActorGroup {
  label: string
  actors: { name: string; type: string }[]
}

// type value (lower-case) -> display label, in fixed render order.
const GROUP_ORDER: { type: string; label: string }[] = [
  { type: 'vnsa', label: 'VNSAs' },
  { type: 'state', label: 'State forces' },
  { type: 'commercial', label: 'Industry' },
  { type: 'extra-regional', label: 'Extra-regional' },
  { type: 'unknown', label: 'Unknown' },
]

export function groupActors(actors: { name: string; type: string }[]): ActorGroup[] {
  const buckets = new Map<string, { name: string; type: string }[]>()
  for (const g of GROUP_ORDER) buckets.set(g.type, [])
  for (const a of actors) {
    const key = (a?.type || '').toLowerCase()
    ;(buckets.get(key) ?? buckets.get('unknown')!).push(a)   // unknown/invalid -> Unknown
  }
  return GROUP_ORDER
    .map(g => ({ label: g.label, actors: buckets.get(g.type)! }))
    .filter(g => g.actors.length > 0)
}
