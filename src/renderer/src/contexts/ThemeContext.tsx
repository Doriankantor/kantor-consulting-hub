import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Theme = 'dark' | 'light' | 'system'

// ── Dark gradient themes (applied in dark mode) ───────────────────────────────
export type GradientTheme = 'purple' | 'midnight' | 'forest' | 'teal' | 'burgundy' | 'charcoal'

export const GRADIENT_PRESETS: { id: GradientTheme; label: string; from: string; via: string; to: string }[] = [
  { id: 'purple',   label: 'Purple / Indigo',  from: '#1e1b4b', via: '#312e81', to: '#1d4ed8' },
  { id: 'midnight', label: 'Midnight Blue',     from: '#020617', via: '#0f172a', to: '#1e3a5f' },
  { id: 'forest',   label: 'Forest Green',      from: '#052e16', via: '#14532d', to: '#166534' },
  { id: 'teal',     label: 'Deep Teal',          from: '#042f2e', via: '#134e4a', to: '#0f766e' },
  { id: 'burgundy', label: 'Burgundy Red',       from: '#3b0a1e', via: '#881337', to: '#9f1239' },
  { id: 'charcoal', label: 'Charcoal Dark',      from: '#111827', via: '#1f2937', to: '#374151' },
]

// ── Light background themes (applied in light mode) ───────────────────────────
export type LightTheme = 'classic-light' | 'soft-blue' | 'warm-sand' | 'sky' | 'mint' | 'blush'

export const LIGHT_THEME_PRESETS: { id: LightTheme; label: string; start: string; end: string }[] = [
  { id: 'classic-light', label: 'Classic Light', start: '#EEF0F5', end: '#E5E8F0' },
  { id: 'soft-blue',     label: 'Soft Blue',     start: '#E3EDF9', end: '#D5E4F5' },
  { id: 'warm-sand',     label: 'Warm Sand',     start: '#F2EDE6', end: '#EBE4DA' },
  { id: 'sky',           label: 'Sky',           start: '#E8F1FA', end: '#DCE8F5' },
  { id: 'mint',          label: 'Mint',          start: '#E6F5EE', end: '#D8EEE3' },
  { id: 'blush',         label: 'Blush',         start: '#F9EEF0', end: '#F2E4E8' },
]

interface ThemeContextType {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  gradientTheme: GradientTheme
  lightTheme: LightTheme
  setTheme: (t: Theme) => void
  setGradientTheme: (g: GradientTheme) => void
  setLightTheme: (l: LightTheme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)
const THEME_KEY        = 'kc-theme'
const GRADIENT_KEY     = 'kc-gradient'
const LIGHT_THEME_KEY  = 'kc-light-theme'

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyDarkGradient(g: GradientTheme) {
  const root = document.documentElement
  if (g === 'purple') root.removeAttribute('data-gradient')
  else root.setAttribute('data-gradient', g)
}

function applyLightTheme(l: LightTheme) {
  const root = document.documentElement
  if (l === 'classic-light') root.removeAttribute('data-light-theme')
  else root.setAttribute('data-light-theme', l)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    (localStorage.getItem(THEME_KEY) as Theme) ?? 'system'
  )
  const [gradientTheme, setGradientState] = useState<GradientTheme>(() =>
    (localStorage.getItem(GRADIENT_KEY) as GradientTheme) ?? 'purple'
  )
  const [lightTheme, setLightState] = useState<LightTheme>(() =>
    (localStorage.getItem(LIGHT_THEME_KEY) as LightTheme) ?? 'classic-light'
  )

  const resolve = useCallback((t: Theme): 'dark' | 'light' =>
    t === 'system' ? getSystemTheme() : t
  , [])

  const resolvedTheme = resolve(theme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => { applyDarkGradient(gradientTheme) }, [gradientTheme])
  useEffect(() => { applyLightTheme(lightTheme) }, [lightTheme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const r = document.documentElement
      r.classList.remove('dark', 'light')
      r.classList.add(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  function setTheme(t: Theme) {
    setThemeState(t)
    localStorage.setItem(THEME_KEY, t)
  }

  function setGradientTheme(g: GradientTheme) {
    setGradientState(g)
    localStorage.setItem(GRADIENT_KEY, g)
    applyDarkGradient(g)
  }

  function setLightTheme(l: LightTheme) {
    setLightState(l)
    localStorage.setItem(LIGHT_THEME_KEY, l)
    applyLightTheme(l)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, gradientTheme, lightTheme, setGradientTheme, setLightTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
