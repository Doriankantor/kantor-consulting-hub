import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

// App-wide connection state. Main owns the online/offline verdict (derived from
// cloud call outcomes) and pushes changes over connection:changed; we mirror it
// here so the banner + the edit lockout + reconnect refetch can all read one flag.
interface ConnectionValue { online: boolean }

const ConnectionContext = createContext<ConnectionValue>({ online: true })

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let mounted = true
    window.api.connection.get().then(v => { if (mounted) setOnline(v) }).catch(() => {})
    window.api.connection.onChange((v) => { if (mounted) setOnline(v) })
    return () => { mounted = false; window.api.connection.removeChangeListeners() }
  }, [])

  return <ConnectionContext.Provider value={{ online }}>{children}</ConnectionContext.Provider>
}

export function useConnection(): ConnectionValue {
  return useContext(ConnectionContext)
}
