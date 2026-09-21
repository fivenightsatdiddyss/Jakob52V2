'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Star, X, RefreshCw, Maximize2, Minimize2, ExternalLink, Loader2, Calendar } from 'lucide-react'
import { PROXY_LINKS, dailyFeatured, type ProxyLink } from './links-data'
import { cn } from '@/lib/utils'

export default function LinksPanel() {
  // Daily featured is computed inline — this panel only mounts client-side
  // when the user opens the Links tab, so there's no SSR/hydration concern.
  const [featured] = useState<ProxyLink[]>(() => dailyFeatured(3))
  const [active, setActive] = useState<ProxyLink | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [loading, setLoading] = useState(false)

  const open = useCallback((p: ProxyLink) => {
    setActive(p)
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

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto w-full max-w-5xl"
    >
      <header className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl glass-strong text-fuchsia-200">
          <Link2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Links</h2>
          <p className="text-sm text-white/45">
            daily rotating proxies · {PROXY_LINKS.length} services in range
          </p>
        </div>
        <span className="ml-auto hidden items-center gap-1.5 rounded-full glass-subtle px-3 py-1.5 text-xs text-white/55 sm:inline-flex">
          <Calendar className="h-3.5 w-3.5 text-fuchsia-300" />
          {today}
        </span>
      </header>

      {/* Daily featured */}
      <section className="mb-6">
        <div className="mb-3 flex items-center gap-2 px-1 text-xs uppercase tracking-widest text-white/40">
          <Star className="h-3.5 w-3.5 text-amber-300" />
          today's featured
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {featured.map((p, i) => (
            <motion.button
              key={p.name + i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              whileHover={{ y: -4 }}
              onClick={() => open(p)}
              className="glass glass-sheen group relative overflow-hidden rounded-3xl p-5 text-left"
            >
              <div
                className={cn(
                  'pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br opacity-50 blur-2xl transition-opacity group-hover:opacity-90',
                  p.gradient
                )}
              />
              <div className="relative flex items-center justify-between">
                <div
                  className={cn(
                    'grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-white',
                    p.gradient
                  )}
                >
                  <span className="text-lg font-black">{p.name[0]}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  <Star className="h-2.5 w-2.5 fill-amber-300" /> daily
                </span>
              </div>
              <h3 className="relative mt-4 text-lg font-bold text-white">{p.name}</h3>
              <p className="relative text-xs text-white/50">{p.tagline}</p>
              <div className="relative mt-3 text-[11px] text-fuchsia-300 opacity-0 transition-opacity group-hover:opacity-100">
                open →
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Full grid */}
      <section>
        <div className="mb-3 flex items-center gap-2 px-1 text-xs uppercase tracking-widest text-white/40">
          <Link2 className="h-3.5 w-3.5 text-fuchsia-300" />
          all services
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PROXY_LINKS.map((p, i) => (
            <motion.button
              key={p.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.3 }}
              whileHover={{ y: -3 }}
              onClick={() => open(p)}
              className="glass glass-sheen group relative flex items-center gap-3 overflow-hidden rounded-2xl p-3 text-left"
            >
              <div
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white',
                  p.gradient
                )}
              >
                <span className="text-sm font-black">{p.name[0]}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                <div className="truncate text-[10px] text-white/45">{p.tagline}</div>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Viewer modal */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'fixed inset-0 z-50 flex flex-col bg-[#04020a]/95 backdrop-blur-md',
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
                  'grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white',
                  active.gradient
                )}
              >
                <span className="text-sm font-black">{active.name[0]}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{active.name}</div>
                <div className="truncate text-[10px] text-white/40">{active.tagline}</div>
              </div>
              <a
                href={active.search}
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
                    <p className="text-sm text-white/60">routing {active.name}…</p>
                  </div>
                </div>
              )}
              <iframe
                key={iframeKey}
                src={`/api/proxy?url=${encodeURIComponent(active.search)}`}
                onLoad={() => setLoading(false)}
                className="h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
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
    </motion.div>
  )
}
