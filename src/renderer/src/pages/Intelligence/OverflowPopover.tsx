// Slice 2b: the reusable overflow popover shared by the intel card zones. Behavior is
// PORTED from docs/unified-source-card-mockup.html (a "... +N" pill that opens a popover
// showing the full set grouped by sub-type, each group a label+count header over a chip
// wrap). Anchoring is ADAPTED to the codebase's portal pattern (TagPicker): the panel is
// createPortal'd to document.body with position:fixed computed from the pill's
// getBoundingClientRect -- NOT the mockup's absolute-in-card math, because the Slice-1
// zones have no position:relative and would clip an absolute child.
//
// Editability is decided by the CALLER, which pre-renders each group's chips (flat on a
// read mount, removable on an editable mount). This component is presentation-only: it
// owns the pill, the portal, positioning, and outside/Escape dismissal (shared
// usePopoverDismiss) -- it holds no chip logic and touches no write path.
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss'

export interface OverflowGroup {
  label: string
  count: number
  chips: React.ReactNode   // caller-rendered chips (already flat or removable per editability)
}

interface OverflowPopoverProps {
  count: number            // the "+N" hidden count shown on the pill
  pillClassName: string    // zone-accent styling for the pill (violet = entities, teal = geography)
  groups: OverflowGroup[]  // ordered, non-empty groups
}

export default function OverflowPopover({ count, pillClassName, groups }: OverflowPopoverProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = usePopoverDismiss(open, useCallback(() => setOpen(false), []))

  const openPanel = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, left: r.left })
    setOpen(true)
  }

  // After the panel mounts, clamp it inside the viewport using its REAL size: keep 8px off
  // the right/left edges, and flip above the pill if it would run off the bottom.
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
      className="min-w-[250px] max-w-[340px] rounded-lg border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-900 shadow-xl p-2 flex flex-col gap-2"
    >
      {groups.map(g => (
        <div key={g.label}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40">{g.label}</span>
            <span className="text-[9px] text-gray-400 dark:text-white/30">{g.count}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">{g.chips}</div>
        </div>
      ))}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // stopPropagation so usePopoverDismiss's document mousedown doesn't also fire on the
        // pill (which would close-then-reopen); the onClick below owns the toggle.
        onMouseDown={e => e.stopPropagation()}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={pillClassName}
        title={`Show all — ${count} more`}
      >
        <span aria-hidden className="tracking-tight leading-none">···</span> +{count}
      </button>
      {panel}
    </>
  )
}
