import { useEffect, useState } from 'react'

type DriveStatus = 'disconnected' | 'syncing' | 'synced' | 'error'

export default function SyncStatus() {
  const [status, setStatus] = useState<DriveStatus>('disconnected')

  useEffect(() => {
    window.api.drive.getStatus().then(s => setStatus(s as DriveStatus))
    window.api.drive.onStatusChange(s => setStatus(s as DriveStatus))
    const iv = setInterval(
      () => window.api.drive.getStatus().then(s => setStatus(s as DriveStatus)),
      15_000
    )
    return () => clearInterval(iv)
  }, [])

  if (status === 'disconnected') return null

  return (
    <div className="flex items-center gap-1.5 px-4 py-2">
      {status === 'syncing' && (
        <><span className="w-1.5 h-1.5 rounded-full bg-hub-gold animate-pulse shrink-0" />
        <span className="text-[10px] text-gray-400 dark:text-white/25">Syncing to Drive…</span></>
      )}
      {status === 'synced' && (
        <><span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
        <span className="text-[10px] text-gray-400 dark:text-white/25">Drive synced</span></>
      )}
      {status === 'error' && (
        <><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        <span className="text-[10px] text-gray-400 dark:text-white/25">Sync error</span></>
      )}
    </div>
  )
}
