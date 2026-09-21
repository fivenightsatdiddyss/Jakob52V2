'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import CalculatorView from '@/components/jakob/calculator-view'
import MainView from '@/components/jakob/main-view'
import ThemedBackground from '@/components/jakob/themed-background'

type View = 'gate' | 'main'

export default function Home() {
  const [view, setView] = useState<View>('gate')

  useEffect(() => {
    // The about:blank cloak reopens the site with #enter to skip the gate.
    if (typeof window !== 'undefined' && window.location.hash === '#enter') {
      // One-time sync with browser URL state on mount; setState is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView('main')
      // clean the hash so a refresh returns to the gate
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden text-white">
      {/* Themed background — renders on ALL pages (gate + main view) so the
          selected background shows everywhere, not just the settings page. */}
      <ThemedBackground />
      <AnimatePresence mode="wait">
        {view === 'gate' ? (
          <CalculatorView key="gate" onUnlock={() => setView('main')} />
        ) : (
          <MainView key="main" />
        )}
      </AnimatePresence>
    </div>
  )
}
