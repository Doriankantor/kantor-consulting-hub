import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// THE STEP RAIL (slice 3b) — ported from docs/TodoStepRail.html
//
// PURE PRESENTATIONAL. It owns no data, fetches nothing, and knows nothing about
// where a step lives. Give it a steps array and callbacks. That is deliberate:
// 3b feeds it PERSONAL steps, slice 2.5 will feed it off-card assignment steps and
// slice 4 will feed it card checklists — three different backends, ONE component.
// Anything source-specific belongs in the caller, not here.
//
// DEVIATION FROM THE PROTOTYPE: the prototype hardcodes `--indigo` hex values. This
// uses the app's Tailwind tokens so it themes light/dark with everything else in 3a.
// ─────────────────────────────────────────────────────────────────────────────

export interface RailStep {
  id: string
  text: string
  checked: boolean
}

/** DONE COLLECTS LEFT — the completed steps slide to the front, which is what the
 *  FLIP animation below exists to make legible. Display order only; nothing is
 *  persisted, so this never fights a stored `position`. */
export const railOrder = (steps: RailStep[]): RailStep[] =>
  [...steps.filter(s => s.checked), ...steps.filter(s => !s.checked)]

/**
 * Live reduced-motion. The prototype evaluates this ONCE at module load, which is
 * fine for a page you reload; this renderer runs for days, so a mid-session
 * accessibility change would otherwise never take effect.
 *
 * EXPORTED (A-2 polish) so the detail panel's slide honours the same preference
 * from the same listener. Duplicating it would mean two matchMedia subscriptions
 * that could disagree mid-session.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = (e: MediaQueryListEvent): void => setReduced(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

interface StepRailProps {
  steps: RailStep[]
  /** 'all' shows every label, 'truncate' clips them, 'none' is dots only. */
  labelMode?: 'all' | 'truncate' | 'none'
  onToggle: (stepId: string) => void
}

export default function StepRail({ steps, labelMode = 'truncate', onToggle }: StepRailProps) {
  const ordered = useMemo(() => railOrder(steps), [steps])
  const reduced = useReducedMotion()
  const dotsRef = useRef<HTMLDivElement | null>(null)
  const prevRects = useRef<Map<string, DOMRect>>(new Map())

  /**
   * ORDER SIGNATURE — the guard that stops phantom replays.
   *
   * The layout effect has no dependency array, so it runs after EVERY render,
   * including renders nothing to do with the steps (a window focus/blur, a parent
   * state change, a refetch that returns identical data). On those renders the
   * stored rects can differ from the fresh ones — a hidden or resizing window
   * reports different geometry — so the naive dx check fired and REPLAYED the last
   * slide even though nothing moved.
   *
   * Comparing the ids AND their done-state tells us whether a reorder actually
   * happened. If it did not, we re-record the rects and animate nothing.
   */
  const orderSig = ordered.map(s => `${s.id}:${s.checked ? 1 : 0}`).join('|')
  const prevSig = useRef<string>(orderSig)

  // FLIP: measure after paint, animate the delta from the PREVIOUS position back to
  // zero. WAAPI (not CSS transitions) because the dots are reordered in the DOM —
  // a transition would have nothing to interpolate between.
  useLayoutEffect(() => {
    const el = dotsRef.current
    if (!el) return
    const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-dot]'))
    const reordered = prevSig.current !== orderSig

    if (!reduced && reordered) {
      for (const node of nodes) {
        const id = node.getAttribute('data-dot')
        if (!id) continue
        const now = node.getBoundingClientRect()
        const was = prevRects.current.get(id)
        if (!was) continue
        const dx = was.left - now.left
        if (Math.abs(dx) > 1) {
          node.animate(
            [{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }],
            { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)' },
          )
        }
      }
    }

    // Re-record on EVERY render, animation or not, so the next real reorder
    // measures against current geometry rather than a stale pre-resize frame.
    const next = new Map<string, DOMRect>()
    for (const node of nodes) {
      const id = node.getAttribute('data-dot')
      if (!id) continue
      const r = node.getBoundingClientRect()
      // A hidden window reports zero-size rects. Recording those would poison the
      // next comparison and produce a large bogus dx on return — keep the last
      // good measurement instead.
      if (r.width === 0 && r.height === 0) continue
      next.set(id, r)
    }
    if (next.size) prevRects.current = next
    prevSig.current = orderSig
  })

  // ★ ZERO STEPS ⇒ NO RAIL AT ALL. Not an empty bar, not a 0% track — nothing.
  // A to-do without steps must look exactly like it did before 3b.
  const n = ordered.length
  if (n === 0) return null

  const doneCount = steps.filter(s => s.checked).length
  // Matches the prototype: the fill spans dot centres, so one step is 0% or 100%
  // and the last dot sits at the end of the track rather than past it.
  const fill = doneCount === 0 ? 0 : n === 1 ? 100 : ((doneCount - 1) / (n - 1)) * 100

  return (
    // stopPropagation so toggling a dot never also triggers the card's own click
    // (expand/collapse) — the prototype does the same at the rail root.
    <div className="mt-2 select-none" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] tabular-nums text-gray-400 dark:text-white/40 shrink-0">
          {doneCount} of {n}
        </span>
        <div className="relative flex-1 min-w-0">
          {/* track — gray-300 / white-12%, both already used by 3a's controls.
              gray-200 (the first attempt) sits only ~2% off the gray-50/30 card and
              read as invisible in light mode. */}
          <div className="absolute left-0 top-[7px] h-[3px] w-full rounded-full bg-gray-300 dark:bg-white/[0.12]" />
          {/* fill */}
          <div
            className={`absolute left-0 top-[7px] h-[3px] rounded-full bg-indigo-500 ${reduced ? '' : 'transition-[width] duration-[450ms] ease-[cubic-bezier(.4,0,.2,1)]'}`}
            style={{ width: `${fill}%` }}
          />
          <div ref={dotsRef} className="relative flex items-start justify-between">
            {ordered.map(s => (
              <div key={s.id} data-dot={s.id} className="flex flex-col items-center min-w-0">
                <button
                  type="button"
                  title={s.text}
                  onClick={e => { e.stopPropagation(); onToggle(s.id) }}
                  // z-10 lifts the dot above the track so the line never crosses it.
                  // hover:scale-110 is the mockup's affordance (.dot:hover scale 1.12).
                  className={`relative z-10 w-[17px] h-[17px] rounded-full border-2 flex items-center justify-center transition-all duration-150 hover:scale-110 ${
                    s.checked
                      ? 'bg-indigo-500 border-indigo-500 shadow-sm shadow-indigo-500/30'
                      // ⚠ NOT a hardcoded hex. The prototype's dark fill (#1a1a1f)
                      // bled through here and read as a solid black blob against the
                      // card's translucent dark surface. These are the SAME tokens
                      // 3a's personal-toggle button uses, so the dot sits on the card
                      // the way every other control does.
                      : 'bg-gray-100 dark:bg-white/[0.08] border-gray-300 dark:border-white/30 hover:border-indigo-400'
                  }`}
                >
                  {s.checked && (
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                {labelMode !== 'none' && (
                  <span
                    title={s.text}
                    // TWO LINES, not a hard truncate — the mockup uses
                    // -webkit-line-clamp:2 at ~96-104px, which `line-clamp-2` gives
                    // natively in Tailwind 3.4. Long step text now wraps instead of
                    // being cut mid-word.
                    //
                    // DONE state follows the mockup: indigo + medium weight, NOT a
                    // grey strikethrough. The dot already encodes completion; a
                    // struck-out grey label made finished steps read as cancelled.
                    className={`mt-1.5 text-[10px] leading-[1.25] text-center line-clamp-2 break-words ${
                      labelMode === 'truncate' ? 'max-w-[84px]' : 'max-w-[96px]'
                    } ${
                      s.checked
                        ? 'text-indigo-500 dark:text-indigo-300 font-medium'
                        : 'text-gray-500 dark:text-white/55'
                    }`}
                  >
                    {s.text}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
