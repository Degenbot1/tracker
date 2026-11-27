'use client'
import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
export const THEME_KEY = 'lt.theme'

// Runs in <head> before paint so the stored theme applies without a flash.
export const THEME_BOOT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}`

export function currentTheme(): Theme {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(t: Theme) {
  if (t === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  try { localStorage.setItem(THEME_KEY, t) } catch {}
}

// Follows the <html data-theme> attribute, so canvas widgets can repaint.
export function useTheme(): Theme {
  const [t, setT] = useState<Theme>('dark')
  useEffect(() => {
    setT(currentTheme())
    const o = new MutationObserver(() => setT(currentTheme()))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => o.disconnect()
  }, [])
  return t
}

// Colours the chart canvas cannot read from CSS variables.
export function chartColors(t: Theme) {
  return t === 'light'
    ? { text: '#5c5c5c', grid: '#00000010', cross: '#00000040', label: '#202221', up: '#0e9f6e', down: '#e0475a', owned: '#c46d00', kol: '#7c4dff', burn: '#b5179e' }
    : { text: '#66666f', grid: '#ffffff08', cross: '#ffffff30', label: '#1c1c22', up: '#34d399', down: '#fb6a74', owned: '#f3a63b', kol: '#c4a1ff', burn: '#e58cff' }
}
