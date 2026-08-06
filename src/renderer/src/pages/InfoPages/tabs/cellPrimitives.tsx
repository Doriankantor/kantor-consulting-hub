import { type ReactNode } from 'react'

// ── shared box shell ──────────────────────────────────────────────────────────
// Extracted verbatim from CellGridTab.tsx (P4a-2a) so the Pre-Commit Review diff
// view can frame each cell identically to the read grid. Pure presentational shell —
// no grid coupling, no behavior change from the original.
//
// `action` is an optional right-aligned header slot (CellGridTab's P2 Narrative Edit
// button; the review view's future accept/reject controls); read-only callers pass none.
export function Box({ title, meta, color, action, children }: {
  title: string; meta?: string; color: string; action?: ReactNode; children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02]">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-gray-100 dark:border-white/[0.05]">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/50">{title}</span>
        {(meta || action) && (
          <div className="ml-auto flex items-center gap-2">
            {meta && <span className="text-[10px] text-gray-400 dark:text-white/30">{meta}</span>}
            {action}
          </div>
        )}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  )
}
