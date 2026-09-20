'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, Maximize2, Minimize2, ExternalLink, Loader2, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

type Shortcut = {
  name: string
  domain: string
  url: string
  /** tailwind gradient used for the tile's hover glow */
  gradient: string
}

// Quick-launch apps on the home page. Each opens the site through the in-app
// /api/proxy so it renders inside the site (cloaked behind the glass).
const SHORTCUTS: Shortcut[] = [
  { name: 'YouTube', domain: 'youtube.com', url: 'https://www.youtube.com', gradient: 'from-red-500/50 to-rose-600/40' },
  { name: 'TikTok', domain: 'tiktok.com', url: 'https://www.tiktok.com', gradient: 'from-fuchsia-500/50 to-cyan-500/40' },
  { name: 'Discord', domain: 'discord.com', url: 'https://discord.com/app', gradient: 'from-indigo-500/50 to-violet-600/40' },
  { name: 'GeForce NOW', domain: 'play.geforcenow.com', url: 'https://play.geforcenow.com', gradient: 'from-emerald-500/50 to-green-600/40' },
  { name: 'Netflix', domain: 'netflix.com', url: 'https://www.netflix.com', gradient: 'from-red-600/50 to-rose-700/40' },
  { name: 'Spotify', domain: 'spotify.com', url: 'https://open.spotify.com', gradient: 'from-green-500/50 to-emerald-600/40' },
  { name: 'Reddit', domain: 'reddit.com', url: 'https://www.reddit.com', gradient: 'from-orange-500/50 to-amber-600/40' },
  { name: 'Twitch', domain: 'twitch.tv', url: 'https://www.twitch.tv', gradient: 'from-violet-500/50 to-purple-600/40' },
  { name: 'Instagram', domain: 'instagram.com', url: 'https://www.instagram.com', gradient: 'from-pink-500/50 to-amber-500/40' },
  { name: 'X', domain: 'x.com', url: 'https://x.com', gradient: 'from-zinc-400/50 to-zinc-600/40' },
  { name: 'ChatGPT', domain: 'chatgpt.com', url: 'https://chatgpt.com', gradient: 'from-teal-500/50 to-emerald-600/40' },
  { name: 'GitHub', domain: 'github.com', url: 'https://github.com', gradient: 'from-zinc-500/50 to-zinc-700/40' },
]

function favicon(domain: string, sz = 128) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${sz}`
}

export default function AppShortcuts() {
  const [active, setActive] = useState<Shortcut | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [loading, setLoading] = useState(false)

  const open = useCallback((s: Shortcut) => {
    setActive(s)
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
      {/* Shortcuts row — sits below the floating hero subtitle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
        className="pointer-events-auto relative z-10 mt-2 flex flex-wrap items-center justify-center gap-2.5"
      >
        {SHORTCUTS.map((s, i) => (
          <motion.button
            key={s.name}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 + i * 0.04, duration: 0.35 }}
            whileHover={{ y: -4, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => open(s)}
            title={`open ${s.name}`}
            className="group flex flex-col items-center gap-1.5"
          >
            <div
              className={cn(
                'glass glass-sheen relative grid h-14 w-14 place-items-center overflow-hidden rounded-2xl transition-all sm:h-16 sm:w-16',
                'hover:shadow-[0_0_24px_4px_rgba(168,85,247,0.35)]'
              )}
            >
              <div
                className={cn(
                  'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity group-hover:opacity-100',
                  s.gradient
                )}
              />
              <img
                src={favicon(s.domain)}
                alt={s.name}
                width={36}
                height={36}
                className="relative h-8 w-8 rounded-lg object-contain sm:h-9 sm:w-9"
                loading="lazy"
              />
            </div>
            <span className="text-[10px] font-medium text-white/55 transition-colors group-hover:text-white/90 sm:text-xs">
              {s.name}
            </span>
          </motion.button>
        ))}
      </motion.div>

      {/* Proxy viewer modal */}
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
              <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/8">
                <img
                  src={favicon(active.domain, 64)}
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{active.name}</div>
                <div className="truncate text-[10px] text-white/40">routed · corsproxy relay</div>
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
                    <p className="text-sm text-white/60">routing {active.name}…</p>
                  </div>
                </div>
              )}
              <iframe
                key={iframeKey}
                src={`/api/proxy?url=${encodeURIComponent(active.url)}`}
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
    </>
  )
}
