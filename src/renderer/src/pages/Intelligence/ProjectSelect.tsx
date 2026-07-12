import { useState, useRef, useEffect } from 'react'
import type { Board } from '../../types'
import { parseConfig, isPipelineLive } from './frameworkConfig'

interface Props {
  projects: Board[]
  selectedProjectId: string            // 'all' or an info-page board id
  onChange: (id: string) => void
}

// Slice 1 project scope selector. An ad-hoc dropdown (no Accordion/Select library
// in the codebase) so non-pipeline projects can render grayed with a "not yet
// collecting" hint while STAYING selectable — a native <select> can't reliably
// gray individual options cross-platform. Selection only sets container context +
// drives the framework panel; it does NOT filter the source list (that's Slice 3).
export default function ProjectSelect({ projects, selectedProjectId, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = selectedProjectId === 'all'
    ? null
    : projects.find(p => p.id === selectedProjectId) || null
  const selectedLive = selected ? isPipelineLive(parseConfig(selected.board_config)) : true

  function pick(id: string) {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 min-w-[200px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.07] text-sm text-gray-800 dark:text-white/85 transition"
      >
        <span className="flex-1 text-left truncate">{selected ? selected.name : 'All sources'}</span>
        {selected && !selectedLive && (
          <span className="text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400 shrink-0">view-only</span>
        )}
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          className={`shrink-0 text-gray-400 dark:text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 min-w-[240px] py-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] shadow-xl max-h-80 overflow-y-auto">
          {/* All sources — the default scope. */}
          <button
            onClick={() => pick('all')}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/[0.06] transition ${
              selectedProjectId === 'all' ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-800 dark:text-white/85'
            }`}
          >
            All sources
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-white/[0.06]" />
          {projects.map(p => {
            const live = isPipelineLive(parseConfig(p.board_config))
            const active = selectedProjectId === p.id
            return (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition ${
                  active ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${
                    live
                      ? (active ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-800 dark:text-white/85')
                      : 'text-gray-400 dark:text-white/40'
                  }`}>
                    {p.name}
                  </span>
                  {live
                    ? <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Collecting" />
                    : <span className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-white/35 shrink-0">not yet collecting</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
