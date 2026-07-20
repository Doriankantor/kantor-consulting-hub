// ─────────────────────────────────────────────────────────────────────────────
// THE TO-DO PALETTE (slice A-1) — ported from docs/TodoDetailPanel_mockup.html:186
//
// ONE SOURCE OF TRUTH. A-1's data layer validates against these keys and A-2's
// picker + card bar render from them, so the set of legal colours is defined once.
//
// ★ THE STORED VALUE IS A KEY, NOT A COLOUR. `personal_todos.color` holds
// 'indigo' | 'red' | … — never a hex. Two reasons:
//   1. THEMING. The mockup's hexes are tuned for its light surface; several of them
//      (slate #6b6a78, indigo #5b5fc7) sit too close to the dark navy card to read.
//      A key can resolve differently per theme; a stored hex cannot.
//   2. NO MIGRATION. Retuning a swatch is an edit here, not an UPDATE across rows.
//
// Class strings are FULL LITERALS on purpose. Tailwind scans source text, so a
// composed string (`bg-${c}-500`) would be purged from the build. Never build these
// dynamically.
// ─────────────────────────────────────────────────────────────────────────────

export type TodoColorKey = 'indigo' | 'red' | 'amber' | 'green' | 'teal' | 'purple' | 'slate'

export interface TodoColor {
  key: TodoColorKey
  /** Picker tooltip / a11y label. */
  label: string
  /** The 5px card stripe (mockup `.card-bar`) and the picker swatch fill. */
  barClass: string
  /** Selected-swatch ring in the picker. */
  ringClass: string
  /** The mockup's light-mode hex. Kept for reference and for any canvas/SVG or
   *  inline-style consumer that cannot take a class. Rendering should prefer the
   *  classes above, which theme. */
  hex: string
}

/** ORDERED — the picker renders in this order, matching the mockup's row. */
export const TODO_COLORS: readonly TodoColor[] = [
  { key: 'indigo', label: 'Indigo', hex: '#5b5fc7', barClass: 'bg-indigo-500 dark:bg-indigo-400', ringClass: 'ring-indigo-500 dark:ring-indigo-400' },
  { key: 'red',    label: 'Red',    hex: '#e5484d', barClass: 'bg-red-500 dark:bg-red-400',       ringClass: 'ring-red-500 dark:ring-red-400' },
  { key: 'amber',  label: 'Amber',  hex: '#eaa000', barClass: 'bg-amber-500 dark:bg-amber-400',   ringClass: 'ring-amber-500 dark:ring-amber-400' },
  { key: 'green',  label: 'Green',  hex: '#2f9e44', barClass: 'bg-green-600 dark:bg-green-400',   ringClass: 'ring-green-600 dark:ring-green-400' },
  { key: 'teal',   label: 'Teal',   hex: '#0a7ea4', barClass: 'bg-cyan-600 dark:bg-cyan-400',     ringClass: 'ring-cyan-600 dark:ring-cyan-400' },
  { key: 'purple', label: 'Purple', hex: '#9c36b5', barClass: 'bg-purple-600 dark:bg-purple-400', ringClass: 'ring-purple-600 dark:ring-purple-400' },
  // The mockup's slate (#6b6a78) is a mid grey that vanishes against the dark card.
  // Dark mode lifts it well clear of the surface rather than matching the hex.
  { key: 'slate',  label: 'Slate',  hex: '#6b6a78', barClass: 'bg-slate-500 dark:bg-slate-300',   ringClass: 'ring-slate-500 dark:ring-slate-300' },
] as const

const BY_KEY = new Map<string, TodoColor>(TODO_COLORS.map(c => [c.key, c]))

/**
 * Key → colour. Returns null for null, '' and — deliberately — for ANY unknown key.
 *
 * Unknown is not a bug to shout about: the column is free-form TEXT with no CHECK
 * constraint (SQLite would need a table rewrite to add one), and a row written by a
 * future build with a wider palette will sync down to an older one. Degrading to
 * "no colour" keeps that row readable instead of crashing the list.
 */
export function resolveTodoColor(key: string | null | undefined): TodoColor | null {
  if (!key) return null
  return BY_KEY.get(key) ?? null
}

/** Guard for the write path, so an unknown key is never persisted from this side. */
export function isTodoColorKey(key: unknown): key is TodoColorKey {
  return typeof key === 'string' && BY_KEY.has(key)
}
