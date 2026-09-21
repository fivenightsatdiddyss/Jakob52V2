'use client'

import { create } from 'zustand'

export type Theme = 'space' | 'ocean' | 'halloween'
const LS_KEY = 'jakob52-theme'

interface ThemeStore {
  theme: Theme
  setTheme: (t: Theme) => void
  init: () => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'space',
  setTheme: (t) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LS_KEY, t)
      } catch {
        /* ignore */
      }
      document.documentElement.setAttribute('data-theme', t)
    }
    set({ theme: t })
  },
  init: () => {
    if (typeof window === 'undefined') return
    let t: Theme = 'space'
    try {
      const stored = window.localStorage.getItem(LS_KEY) as Theme | null
      if (stored === 'space' || stored === 'ocean' || stored === 'halloween') {
        t = stored
      }
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute('data-theme', t)
    set({ theme: t })
  },
}))
