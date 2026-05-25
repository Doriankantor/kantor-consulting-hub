import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Theme = 'dark' | 'light' | 'system'
export type GradientTheme = 'purple' | 'midnight' | 'forest' | 'teal' | 'burgundy' | 'charcoal'

export const GRADIENT_PRESETS: { id: GradientTheme; label: string; from: string; via: string; to: string }[] = [
  { id: 'purple',   label: 'Purple / Indigo',  from: '#1e1b4b', via: '#312e81', to: '#1d4ed8' },
  { id: 'midnight', label: 'Midnight Blue',     from: '#020617', via: '#0f172a', to: '#1e3a5f' },
  { id: 'forest',   label: 'Forest Green',      from: '#052e16', via: '#14532d', to: '#166534' },
  { id: 'teal',     label: 'Deep Teal',          from: '#042f2e', via: '#134e4a', to: '#0f766e' },
  { id: 'burgundy', label: 'Burgundy Red',       from: '#3b0a1e', via: '#881337', to: '#9f1239' },
  { id: 'charcoal', label: 'Charcoal Dark',      from: '#111827', via: '#1f2937', to: '#374151' },
]

interface ThemeContextType {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  gradientTheme: GradientTheme
  setTheme: (t: Theme) => void
  setGradientTheme: (g: GradientTheme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)
const THEME_KEY    = 'kc-theme'
const GRADIENT_KEY = 'kc-gradient'

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyGradient(g: GradientTheme) {
  const root = document.documentElement
  if (g === 'purple') root.removeAttribute('data-gradient')
  else root.setAttribute('data-gradient', g)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    (localStorage.getItem(THEME_KEY) as Theme) ?? 'system'
  )
  const [gradientTheme, setGradientState] = useState<GradientTheme>(() =>
    (localStorage.getItem(GRADIENT_KEY) as GradientTheme) ?? 'purple'
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

  useEffect(() => {
    applyGradient(gradientTheme)
  }, [gradientTheme])

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
    applyGradient(g)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, gradientTheme, setGradientTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
