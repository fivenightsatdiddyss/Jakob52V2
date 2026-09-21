'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutGrid, X, RefreshCw, Maximize2, Minimize2, Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

type App = {
  name: string
  url: string
  desc: string
  gradient: string
}

const APPS: App[] = [
  {
    name: 'Blender',
    url: 'https://metal.6d5ef1fdb68c5ab10b7c90f1796f711153.apexflightacademy.com/tools/blender/index.html',
    desc: '3D creation suite · in-browser',
    gradient: 'from-orange-500/40 to-amber-600/30',
  },
  {
    name: 'Firefox',
    url: 'https://metal.6d5ef1fdb68c5ab10b7c90f1796f711153.apexflightacademy.com/tools/firefox/index.html',
    desc: 'a browser within the browser',
    gradient: 'from-sky-500/40 to-blue-600/30',
  },
  {
    name: 'Soundboard',
    url: 'https://metal.6d5ef1fdb68c5ab10b7c90f1796f711153.apexflightacademy.com/games/30dolar/index.html',
    desc: 'sound clips & effects',
    gradient: 'from-fuchsia-500/40 to-violet-600/30',
  },
]

export default function AppsPanel() {
  const [active, setActive] = useState<App | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [loading, setLoading] = useState(false)

  const open = useCallback((a: App) => {
    setActive(a)
    setIframeKey((k) => k + 1)
    setLoading(true)
  }, [])

  const close = useCallback(() => {
    setActive(null)
    setFullscreen(false)
  }, [])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false)
        else close()
      }
      if (e.key === 'f' || e.key === 'F') setFullscreen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, fullscreen, close])

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mx-auto w-full max-w-5xl"
      >
        <header className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl glass-strong text-fuchsia-200">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Apps</h2>
            <p className="text-sm text-white/45">{APPS.length} tools · click to launch</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {APPS.map((a, i) => (
            <motion.button
              key={a.name}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              whileHover={{ y: -5 }}
              onClick={() => open(a)}
              className="glass glass-sheen group relative overflow-hidden rounded-3xl p-6 text-left"
            >
              <div
                className={cn(
                  'pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-50 blur-2xl transition-opacity group-hover:opacity-100',
                  a.gradient
                )}
              />
              <div className="relative">
                <div
                  className={cn(
                    'grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br text-2xl font-black text-white',
                    a.gradient
                  )}
                >
                  {a.name[0]}
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">{a.name}</h3>
                <p className="text-xs text-white/50">{a.desc}</p>
                <div className="mt-4 text-[11px] text-fuchsia-300 opacity-0 transition-opacity group-hover:opacity-100">
                  launch →
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* App player overlay — portaled to document.body to escape stacking contexts */}
      {typeof document !== 'undefined' && createPortal(
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'fixed inset-0 z-[100] flex flex-col bg-[#04020a]/95 backdrop-blur-md',
              fullscreen ? 'p-0' : 'p-3 sm:p-6'
            )}
          >
            <div
              className={cn(
                'mb-2 flex items-center gap-2 rounded-2xl glass-strong glass-sheen p-2',
                fullscreen && 'mx-2 mt-2'
              )}
            >
              <div
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-black text-white',
                  active.gradient
                )}
              >
                {active.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{active.name}</div>
                <div className="truncate text-[10px] text-white/40">{active.desc}</div>
              </div>
              <a
                href={active.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-1.5 rounded-xl bg-white/8 px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 sm:inline-flex"
                title="open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                new tab
              </a>
              <button
                onClick={() => {
                  setIframeKey((k) => k + 1)
                  setLoading(true)
                }}
                className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="reload (R)"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </button>
              <button
                onClick={() => setFullscreen((v) => !v)}
                className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="fullscreen (F)"
              >
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={close}
                className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white/70 transition-colors hover:bg-rose-500/30 hover:text-white"
                title="close (Esc)"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div
              className={cn(
                'relative flex-1 overflow-hidden rounded-2xl glass glass-sheen',
                fullscreen && 'rounded-none'
              )}
            >
              {loading && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-[#04020a]">
                  <div className="text-center">
                    <Loader2 className="mx-auto mb-3 h-9 w-9 animate-spin text-fuchsia-300" />
                    <p className="text-sm text-white/60">launching {active.name}…</p>
                  </div>
                </div>
              )}
              <iframe
                key={iframeKey}
                src={active.url}
                onLoad={() => setLoading(false)}
                className="h-full w-full border-0 bg-black"
                allow="autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; gamepad; cross-origin-isolated"
                allowFullScreen
                referrerPolicy="no-referrer"
                title={active.name}
              />
            </div>

            {!fullscreen && (
              <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-white/30">
                <span><kbd className="rounded bg-white/10 px-1">Esc</kbd> close</span>
                <span><kbd className="rounded bg-white/10 px-1">F</kbd> fullscreen</span>
                <span><kbd className="rounded bg-white/10 px-1">R</kbd> reload</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      , document.body)}
    </>
  )
}
