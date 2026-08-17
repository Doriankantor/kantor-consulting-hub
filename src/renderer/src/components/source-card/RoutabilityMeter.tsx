// Slice 4b-1: the compact six-dot routability meter for the card's Routing footer. Reads the
// SAME canRoute() the route button reads -- it only REFLECTS gate state, owns no logic of its
// own. One dot per check in ROUTE_CHECKS order: LIT (emerald) when the check passes, DIM (grey)
// when not. The incident dot is DIM this slice (canRoute hardcodes it false pending 4b-2).
//
//   - HOVER a dot -> a tooltip naming that check + its state.
//   - CLICK the dots -> a flyout listing all six checks with done/remaining state. Anchoring
//     reuses the Slice-2b popover infra (usePopoverDismiss + createPortal + position:fixed from
//     getBoundingClientRect), NOT reinvented. Click again / outside / Escape dismisses.
//
// Matches the card's pill visual language (small rounded dots, emerald = the Approve family).
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss'
import type { SourceCore } from './sourceCore'
import { canRoute, ROUTE_CHECKS } from './canRoute'

export default function RoutabilityMeter({ core }: { core: SourceCore }) {
  const gate = canRoute(core)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = usePopoverDismiss(open, useCallback(() => setOpen(false), []))

  const openPanel = (): void => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, left: r.left })
    setOpen(true)
  }

  // After the panel mounts, clamp inside the viewport using its REAL size (8px margins; flip above
  // the trigger if it would run off the bottom). Ported from OverflowPopover.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return
    const MARGIN = 8
    const r = triggerRef.current.getBoundingClientRect()
    const pw = panelRef.current.offsetWidth
    const ph = panelRef.current.offsetHeight
    let left = r.left
    if (left + pw > window.innerWidth - MARGIN) left = window.innerWidth - pw - MARGIN
    if (left < MARGIN) left = MARGIN
    let top = r.bottom + 6
    if (top + ph > window.innerHeight - MARGIN && r.top - ph - 6 >= MARGIN) top = r.top - ph - 6
    setPos({ top, left })
  }, [open, panelRef])

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="min-w-[190px] rounded-lg border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-900 shadow-xl p-2 flex flex-col gap-0.5"
    >
      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40 mb-1 px-0.5">
        Routability
      </div>
      {ROUTE_CHECKS.map(({ key, label }) => {
        const done = gate[key]
        // Incident is pending 4b-2 (hardcoded false) — mark it "coming soon", not a normal miss.
        const pending = key === 'incident'
        return (
          <div key={key} className="flex items-center gap-1.5 text-[11px] px-0.5 py-0.5">
            <span className={done ? 'text-emerald-500' : pending ? 'text-gray-300 dark:text-white/25' : 'text-gray-400 dark:text-white/30'}>
              {done ? '✓' : '○'}
            </span>
            <span className={done ? 'text-gray-700 dark:text-white/80' : 'text-gray-400 dark:text-white/40'}>
              {label}{pending ? ' (coming soon)' : ''}
            </span>
          </div>
        )
      })}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // stopPropagation so usePopoverDismiss's document mousedown doesn't also fire on the trigger
        // (close-then-reopen); the onClick below owns the toggle. Mirrors OverflowPopover.
        onMouseDown={e => e.stopPropagation()}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="inline-flex items-center gap-1 rounded px-0.5 py-0.5 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
        title={gate.all ? 'Routable — all six checks pass' : 'Routability — click for the checklist'}
      >
        {ROUTE_CHECKS.map(({ key, label }) => {
          const lit = gate[key]
          return (
            <span
              key={key}
              title={`${label}: ${lit ? 'ready' : key === 'incident' ? 'coming soon' : 'missing'}`}
              className={`w-2 h-2 rounded-full transition-colors ${
                lit ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/15'
              }`}
            />
          )
        })}
      </button>
      {panel}
    </>
  )
}
