import { useUpdate } from '../contexts/UpdateContext'

export default function UpdateBanner() {
  const { state, version, percent, dismissed, downloadNow, dismiss } = useUpdate()

  // Nothing to show
  if (dismissed || state === 'idle' || state === 'checking' || state === 'uptodate') return null

  // ── Ready to install ────────────────────────────────────────────────────
  if (state === 'ready') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-hub-gold/10 border-b border-hub-gold/20 text-sm shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-hub-gold shrink-0">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <span className="text-gray-700 dark:text-white/80 flex-1">
          Update ready — restart to install <strong>v{version}</strong>.
        </span>
        <button
          onClick={() => window.api.updater.install()}
          className="px-3 py-1 rounded-lg bg-hub-gold hover:bg-hub-gold-light text-white text-xs font-semibold transition shrink-0"
        >
          Restart now
        </button>
        <button
          onClick={dismiss}
          title="Dismiss — update installs on next restart"
          className="px-3 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-xs text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition shrink-0"
        >
          Later
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
          <div className="w-28 h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[11px] text-gray-400 dark:text-white/40 w-8 text-right tabular-nums">{percent}%</span>
        </div>
      </div>
    )
  }

  // ── Update available — prompt user ──────────────────────────────────────
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-indigo-500/[0.07] border-b border-indigo-500/[0.12] text-sm shrink-0">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-indigo-500 shrink-0">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M7 4.5v3M7 9v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      <span className="text-gray-700 dark:text-white/80 flex-1">
        A new version of Kantor Consulting Hub is available — <strong>v{version}</strong>
      </span>
      <button
        onClick={downloadNow}
        className="px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold transition shrink-0"
      >
        Update now
      </button>
      <button
        onClick={dismiss}
        className="px-3 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-xs text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition shrink-0"
      >
        Later
      </button>
    </div>
  )
}
