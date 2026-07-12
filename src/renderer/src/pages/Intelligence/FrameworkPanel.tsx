import { useState } from 'react'
import type { Board } from '../../types'
import { parseConfig, isPipelineLive, splitKeywords } from './frameworkConfig'

// Slice 1 read-only data-gathering framework panel, bound to the selected
// info-page board's board_config. Collapsed = one-line summary; expanded = the
// full architecture (repo / live_url / status / pipeline / keywords). There are
// NO edit controls anywhere — the collection framework is edited via Claude Code
// per the locked design. Styled after InfoPages/InfoPageStatus.tsx for visual
// consistency; collapse is ad-hoc (useState + rotating chevron) since the
// codebase has no Accordion component.
export default function FrameworkPanel({ board }: { board: Board }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = parseConfig(board.board_config)
  const live = isPipelineLive(cfg)
  const keywords = splitKeywords(cfg.keywords)

  // One-line summary tokens (hosting · collection status · keyword count).
  const hostToken = cfg.live_url || cfg.repo || 'no hosting configured'
  const statusToken = live ? 'active pull' : 'not yet collecting'
  const kwToken = keywords.length
    ? `${keywords.length} keyword${keywords.length === 1 ? '' : 's'}`
    : 'no keywords configured'

  return (
    <div className="bg-white dark:bg-white/[0.04] rounded-xl border border-gray-100 dark:border-white/[0.06] overflow-hidden">
      {/* Collapsed summary — click to expand. */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03] transition"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${live ? 'bg-green-500' : 'bg-gray-300 dark:bg-white/20'}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 shrink-0">
          Framework
        </span>
        <span className="flex-1 text-xs text-gray-600 dark:text-white/60 truncate">
          {hostToken} · {statusToken} · {kwToken}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          className={`shrink-0 text-gray-400 dark:text-white/40 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded full architecture — read-only. */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-white/[0.06]">
          <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5 text-xs">
            <FieldRow label="Repo" value={cfg.repo} mono />
            <FieldRow label="Live URL" value={cfg.live_url} mono />
            <FieldRow label="Status" value={cfg.status} />
            <dt className="text-gray-400 dark:text-white/35">Pipeline</dt>
            <dd>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                live
                  ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/45'
              }`}>
                {live ? 'Active — collecting' : 'Inactive — not yet collecting'}
              </span>
            </dd>
          </dl>

          {/* Keywords — the collection config, shown read-only as chips. */}
          <div className="mt-3">
            <p className="text-gray-400 dark:text-white/35 text-xs mb-1">Keywords</p>
            {keywords.length ? (
              <div className="flex flex-wrap gap-1">
                {keywords.map((kw, i) => (
                  <span
                    key={`${kw}-${i}`}
                    className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-[11px] text-gray-600 dark:text-white/60"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 dark:text-white/30 italic">No keywords configured</p>
            )}
          </div>

          <p className="mt-3 text-[10px] text-gray-400 dark:text-white/30 flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="shrink-0">
              <path d="M4.5 5.5V4a1.5 1.5 0 013 0v1.5M3.5 5.5h5v4h-5z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Read-only · edited via Claude Code
          </p>
        </div>
      )}
    </div>
  )
}

// A single label/value row in the expanded architecture grid. Falls back to an
// em-dash when the field is empty (e.g. Immigration Undone's blank live_url).
function FieldRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  const has = !!value && value.trim() !== ''
  return (
    <>
      <dt className="text-gray-400 dark:text-white/35">{label}</dt>
      <dd className={`text-gray-700 dark:text-white/70 break-all ${mono ? 'font-mono text-[11px]' : ''} ${has ? '' : 'text-gray-300 dark:text-white/25'}`}>
        {has ? value : '—'}
      </dd>
    </>
  )
}
