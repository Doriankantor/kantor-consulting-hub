import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'uptodate'

interface UpdateContextValue {
  state: UpdateState
  version: string | null
  percent: number
  lastChecked: number | null
  autoInstall: boolean
  releaseNotes: string | null
  dismissed: boolean
  checkNow: () => Promise<void>
  downloadNow: () => void
  setAutoInstall: (val: boolean) => void
  dismiss: () => void
}

const UpdateContext = createContext<UpdateContextValue>({
  state: 'idle', version: null, percent: 0, lastChecked: null,
  autoInstall: true, releaseNotes: null, dismissed: false,
  checkNow: async () => {}, downloadNow: () => {},
  setAutoInstall: () => {}, dismiss: () => {},
})

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [state,        setState]        = useState<UpdateState>('idle')
  const [version,      setVersion]      = useState<string | null>(null)
  const [percent,      setPercent]      = useState(0)
  const [lastChecked,  setLastChecked]  = useState<number | null>(null)
  const [autoInstall,  setAutoInstallS] = useState(true)
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null)
  const [dismissed,    setDismissed]    = useState(false)

  // Load persisted settings on mount
  useEffect(() => {
    window.api.updater.getLastChecked().then(ts => { if (ts) setLastChecked(ts) }).catch(() => {})
    window.api.updater.getAutoInstall().then(val => setAutoInstallS(val)).catch(() => {})
  }, [])

  // Subscribe to main-process updater events (register once)
  useEffect(() => {
    window.api.updater.onChecking(() => setState('checking'))

    window.api.updater.onAvailable(({ version: v, releaseNotes: rn }) => {
      setVersion(v)
      setReleaseNotes(typeof rn === 'string' ? rn : null)
      setLastChecked(Date.now())
      // Respect 24-hour "Later" suppression
      const until = parseInt(localStorage.getItem('updater_dismissed_until') ?? '0')
      setDismissed(Date.now() < until)
      setState('available')
    })

    window.api.updater.onNotAvailable(() => {
      setLastChecked(Date.now())
      setState('uptodate')
    })

    window.api.updater.onProgress(({ percent: p }) => {
      setState('downloading')
      setPercent(p)
    })

    window.api.updater.onReady(({ version: v }) => {
      setVersion(v)
      setDismissed(false)  // always surface "Restart" even if "Later" was clicked before
      setState('ready')
    })

    window.api.updater.onError(() => {
      // Reset to idle on any error (catches stuck downloads too)
      setState('idle')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Trigger first update check 5 s after the user logs in (provider only mounts post-login)
  useEffect(() => {
    const t = setTimeout(() => {
      window.api.updater.checkNow().catch(() => {})
    }, 5000)
    return () => clearTimeout(t)
  }, [])

  const checkNow = useCallback(async () => {
    setState('checking')
    try { await window.api.updater.checkNow() } catch {}
  }, [])

  const downloadNow = useCallback(() => {
    setState('downloading')
    window.api.updater.downloadNow().catch(() => {})
  }, [])

  const dismiss = useCallback(() => {
    // If the banner is for an available update (not yet downloading), suppress for 24 h
    if (state === 'available') {
      localStorage.setItem('updater_dismissed_until', String(Date.now() + 24 * 60 * 60 * 1000))
    }
    setDismissed(true)
  }, [state])

  const setAutoInstall = useCallback((val: boolean) => {
    setAutoInstallS(val)
    window.api.updater.setAutoInstall(val).catch(() => {})
  }, [])

  return (
    <UpdateContext.Provider value={{
      state, version, percent, lastChecked, autoInstall, releaseNotes, dismissed,
      checkNow, downloadNow, setAutoInstall, dismiss,
    }}>
      {children}
    </UpdateContext.Provider>
  )
}

export function useUpdate() {
  return useContext(UpdateContext)
}
