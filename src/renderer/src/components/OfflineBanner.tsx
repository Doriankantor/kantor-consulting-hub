import { useConnection } from '../contexts/ConnectionContext'

// The SINGLE app-wide offline banner (replaces the per-page cloudError banners).
// Driven by the main-process connection state. When offline, reads serve the
// local mirror and editing is paused; this bar is the user-facing explanation.
export default function OfflineBanner() {
  const { online } = useConnection()
  if (online) return null
  return (
    <div className="shrink-0 px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-700 dark:text-amber-300 text-[12px] font-medium flex items-center justify-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
      Offline — showing your last synced data. Editing is paused until you reconnect.
    </div>
  )
}
