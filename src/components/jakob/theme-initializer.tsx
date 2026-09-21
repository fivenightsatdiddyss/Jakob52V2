'use client'

import { useEffect } from 'react'
import { useThemeStore } from './theme-store'

/**
 * ThemeInitializer — reads the saved theme from localStorage on mount and
 * sets the `data-theme` attribute on <html>. Renders nothing.
 */
export default function ThemeInitializer() {
  const init = useThemeStore((s) => s.init)
  useEffect(() => {
    init()
  }, [init])
  return null
}
