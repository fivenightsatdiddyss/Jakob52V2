'use client'

import { useThemeStore } from './theme-store'
import BlackHoleBackground from './black-hole-bg'
import OceanBackground from './ocean-bg'
import HalloweenBackground from './halloween-bg'

/**
 * ThemedBackground — renders the active theme's background.
 * Used at the page level (in page.tsx) so the background shows on EVERY page:
 * the calculator gate AND the main view. The theme store is read here so a
 * theme change instantly swaps the background everywhere.
 */
export default function ThemedBackground() {
  const theme = useThemeStore((s) => s.theme)
  if (theme === 'ocean') return <OceanBackground />
  if (theme === 'halloween') return <HalloweenBackground />
  return <BlackHoleBackground />
}
