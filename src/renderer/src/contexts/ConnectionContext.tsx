import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'

// App-wide connection state. Main owns the online/offline verdict (derived from
// cloud call outcomes) and pushes changes over connection:changed; we mirror it
// here so the banner + the edit lockout + reconnect refetch can all read one flag.
//
// N-2a adds `notice`: a transient one-line message pushed from main over
// app:notice and rendered by the SAME app-wide banner. It lives here rather than
// in a new provider because some main-process failures have no in-flight IPC call
// to return through (three of the nine notification writers run on a 60s timer).
// This is the ONE shared surface for that — deliberately not an eighth per-page
// useState+setTimeout toast.
interface ConnectionValue { online: boolean; notice: string | null }

const ConnectionContext = createContext<ConnectionValue>({ online: true, notice: null })

const NOTICE_MS = 6000

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.connection.get().then(v => { if (mounted) setOnline(v) }).catch(() => {})
    window.api.connection.onChange((v) => { if (mounted) setOnline(v) })
    window.api.connection.onNotice((message) => {
      if (!mounted) return
      setNotice(message)
      // Restart the dismiss timer on each notice so a burst does not truncate the
      // last one; the ref keeps a re-render from stacking timers.
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      noticeTimer.current = setTimeout(() => { if (mounted) setNotice(null) }, NOTICE_MS)
    })
    return () => {
      mounted = false
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      window.api.connection.removeChangeListeners()
      window.api.connection.removeNoticeListeners()
    }
  }, [])

  return <ConnectionContext.Provider value={{ online, notice }}>{children}</ConnectionContext.Provider>
}

export function useConnection(): ConnectionValue {
  return useContext(ConnectionContext)
}
