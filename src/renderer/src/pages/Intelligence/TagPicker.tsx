import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Mirror the backend tag normalization for live previews (trim, lowercase, spaces→hyphens).
function normalizeTagClient(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

export interface TagPickerProps {
  label: string
  value: string[]
  known: string[]
  chipClass: string
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  onCreate: (name: string) => void
  onDelete?: (tag: string) => void
  isAdmin?: boolean
  forceOpen?: boolean
}

// ── TagPicker ──────────────────────────────────────────────────────────────────
// Portal-based dropdown — rendered at document.body root so it escapes any card
// stacking context (cards have `transition-all` which creates a new stacking
// context, trapping z-index and causing the panel to render under later cards).
//
// Key design decisions:
// • createPortal to document.body — panel is NEVER a child of the card DOM tree.
// • position:fixed computed from trigger's getBoundingClientRect — no clipping.
// • Solid bg-white/dark:bg-gray-900 on BOTH the panel AND every individual row,
//   so no card content can bleed through any row.
// • onMouseDown + e.preventDefault() on rows beats the outside-mousedown handler.
// • Panel stays open after row pick (multi-select); closes on outside click/Escape.
// • forceOpen: parent sets to true to auto-open the panel (used by approval gate).
export default function TagPicker({ label, value, known, chipClass, onAdd, onRemove, onCreate, onDelete, isAdmin, forceOpen }: TagPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const norm = normalizeTagClient(query)
  const available = known.filter(t => !value.includes(t))
  const matches = norm ? available.filter(t => t.includes(norm)) : available
  const exactExists = known.includes(norm)

  // Compute panel position from the trigger button, then open.
  function openPanel() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setPanelPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen(true)
  }

  // Phase 4: parent can force the panel open (e.g., on gate block).
  useEffect(() => {
    if (forceOpen) openPanel()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen])

  // Close on outside mousedown — must check BOTH the trigger area and the portal panel.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      const inTrigger = triggerRef.current?.contains(target)
      const inPanel   = panelRef.current?.contains(target)
      if (!inTrigger && !inPanel) { setOpen(false); setQuery('') }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: panelPos.top, left: panelPos.left, zIndex: 9999 }}
      className="w-56 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-900 shadow-xl p-1"
    >
      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && norm) {
            if (known.includes(norm)) { onAdd(norm); setQuery('') }
            else { onCreate(norm); setQuery(''); setOpen(false) }
          }
          if (e.key === 'Escape') { setOpen(false); setQuery('') }
        }}
        placeholder="Search or create…"
        className="w-full px-2 py-1 rounded text-[11px] border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-gray-900 text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 mb-1"
      />
      {/* Each row: solid bg on the whole row so no card content bleeds through.
          Admin gets a trash icon on the right to delete the tag from the registry. */}
      {matches.map(t => (
        <div
          key={t}
          className="flex items-center rounded bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 group"
        >
          <button
            onMouseDown={e => { e.preventDefault(); onAdd(t) }}
            className="flex-1 text-left px-2 py-1 text-[11px] text-gray-700 dark:text-white/80 cursor-pointer"
          >
            {t}
          </button>
          {isAdmin && onDelete && (
            <button
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onDelete(t) }}
              className="mr-1 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              title={`Delete "${t}" from registry`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 2.5h7M4 2.5V1.5h2v1M3.5 2.5l.5 6h3l.5-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      ))}
      {norm && !exactExists && (
        <button
          onMouseDown={e => { e.preventDefault(); onCreate(norm); setQuery(''); setOpen(false) }}
          className="block w-full text-left px-2 py-1 rounded text-[11px] font-medium bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 cursor-pointer"
        >
          + create &quot;{norm}&quot;
        </button>
      )}
      {matches.length === 0 && !norm && (
        <p className="px-2 py-1 text-[11px] bg-white dark:bg-gray-900 text-gray-400 dark:text-white/30">
          No tags yet — type to create one
        </p>
      )}
    </div>,
    document.body
  ) : null

  return (
    <div>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30 mr-0.5">{label}</span>
        {value.map(tag => (
          <span key={tag} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${chipClass}`}>
            {tag}
            <button
              onMouseDown={e => { e.preventDefault(); onRemove(tag) }}
              className="opacity-50 hover:opacity-100"
              title="Remove tag"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          </span>
        ))}
        <button
          ref={triggerRef}
          onClick={() => open ? (setOpen(false)) : openPanel()}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 dark:text-white/30 border border-dashed border-gray-300 dark:border-white/[0.15] hover:text-gray-600 dark:hover:text-white/60"
          title={`Add ${label.toLowerCase()} tag`}
        >
          + tag
        </button>
      </div>
      {panel}
    </div>
  )
}
