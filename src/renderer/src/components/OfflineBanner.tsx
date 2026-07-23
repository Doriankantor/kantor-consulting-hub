import { useConnection } from '../contexts/ConnectionContext'

// The SINGLE app-wide banner (replaces the per-page cloudError banners).
// Driven by the main-process connection state. When offline, reads serve the
// local mirror and editing is paused; this bar is the user-facing explanation.
//
// It ALSO renders the transient `notice` pushed from main over app:notice (N-2a
// — e.g. a notification that reached the local mirror but not the cloud). Offline
// takes priority: while offline, delivery failures are expected and the offline
// explanation is the more useful message.
export default function OfflineBanner() {
  const { online, notice } = useConnection()

  if (!online) {
    return (
      <div className="shrink-0 px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-700 dark:text-amber-300 text-[12px] font-medium flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        Offline — showing your last synced data. Editing is paused until you reconnect.
      </div>
    )
  }

  if (notice) {
    return (
      <div className="shrink-0 px-4 py-1.5 bg-rose-500/15 border-b border-rose-500/30 text-rose-700 dark:text-rose-300 text-[12px] font-medium flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
        {notice}
      </div>
    )
  }

  return null
}
