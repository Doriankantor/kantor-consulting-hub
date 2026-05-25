import { useState, useEffect } from 'react'

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready'

export default function UpdateBanner() {
  const [state, setState]       = useState<UpdateState>('idle')
  const [version, setVersion]   = useState<string | null>(null)
  const [percent, setPercent]   = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.api.updater.onAvailable(({ version: v }) => {
      setState('available')
      setVersion(v)
    })
    window.api.updater.onProgress(({ percent: p }) => {
      setState('downloading')
      setPercent(p)
    })
    window.api.updater.onReady(({ version: v }) => {
      setState('ready')
      setVersion(v)
      setDismissed(false) // re-surface if previously dismissed at an earlier stage
    })
  }, [])

  if (state === 'idle' || dismissed) return null

  // ── Ready to install ────────────────────────────────────────────────────
  if (state === 'ready') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-hub-gold/10 border-b border-hub-gold/20 text-sm shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-hub-gold shrink-0">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <span className="text-gray-700 dark:text-white/80 flex-1">
          Version <strong>{version}</strong> is ready — restart to install.
        </span>
        <button
          onClick={() => window.api.updater.install()}
          className="px-3 py-1 rounded-lg bg-hub-gold hover:bg-hub-gold-light text-white text-xs font-semibold transition shrink-0"
        >
          Restart &amp; update
        </button>
        <button
          onClick={() => setDismissed(true)}
          title="Dismiss (will install on next launch)"
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-white/60 transition shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    )
  }

  // ── Downloading ─────────────────────────────────────────────────────────
  if (state === 'downloading') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-blue-500/[0.06] border-b border-blue-500/10 text-sm shrink-0">
        <div className="w-3.5 h-3.5 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin shrink-0" />
        <span className="text-gray-600 dark:text-white/65 flex-1">
          Downloading v{version}…
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-24 h-1 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[11px] text-gray-400 dark:text-white/40 w-8 text-right">{percent}%</span>
        </div>
      </div>
    )
  }

  // ── Update available (download starting) ────────────────────────────────
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-500/[0.06] border-b border-blue-500/10 text-sm shrink-0">
      <div className="w-3.5 h-3.5 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin shrink-0" />
      <span className="text-gray-600 dark:text-white/65 flex-1">
        Version <strong>{version}</strong> available — downloading in the background…
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-white/60 transition shrink-0"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}
