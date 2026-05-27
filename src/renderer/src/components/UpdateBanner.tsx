import { useUpdate } from '../contexts/UpdateContext'

export default function UpdateBanner() {
  const { state, version, dismissed, dismiss } = useUpdate()

  // Nothing to show
  if (dismissed || state === 'idle' || state === 'checking' || state === 'uptodate') return null

  // Opens Terminal and runs the install script — bypasses macOS Gatekeeper
  const installViaTerminal = () => window.api.updater.openTerminalUpdate()

  // ── Ready to install ────────────────────────────────────────────────────
  if (state === 'ready') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-hub-gold/10 border-b border-hub-gold/20 text-sm shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-hub-gold shrink-0">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <span className="text-gray-700 dark:text-white/80 flex-1">
          <strong>v{version}</strong> ready — Terminal will open and install it, then the app will relaunch.
        </span>
        <button
          onClick={installViaTerminal}
          className="px-3 py-1 rounded-lg bg-hub-gold hover:bg-hub-gold-light text-white text-xs font-semibold transition shrink-0"
        >
          Install now
        </button>
        <button
          onClick={dismiss}
          title="Dismiss"
          className="px-3 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] text-xs text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition shrink-0"
        >
          Later
        </button>
      </div>
    )
  }

  // ── Download error — show as a plain update prompt, no "failed" wording ──
  if (state === 'error') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-indigo-500/[0.07] border-b border-indigo-500/[0.12] text-sm shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-indigo-500 shrink-0">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M7 4.5v3M7 9v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <span className="text-gray-700 dark:text-white/80 flex-1">
          {version ? <><strong>v{version}</strong> is available — </> : 'An update is available — '}
          please click here to open Terminal to complete the update.
        </span>
        <button
          onClick={installViaTerminal}
          className="px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold transition shrink-0"
        >
          Open Terminal
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

  // ── Update available — skip download, go straight to Terminal ───────────
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-indigo-500/[0.07] border-b border-indigo-500/[0.12] text-sm shrink-0">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-indigo-500 shrink-0">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M7 4.5v3M7 9v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      <span className="text-gray-700 dark:text-white/80 flex-1">
        <strong>v{version}</strong> is available — Terminal will open and install it automatically.
      </span>
      <button
        onClick={installViaTerminal}
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
