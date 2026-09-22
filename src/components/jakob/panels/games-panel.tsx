'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Gamepad2, Search, X, Maximize2, Minimize2, Grid2x2, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { GAMES, type Game } from './games-data'
import { GN_MATH_GAMES } from './gnmath-data'
import { cn } from '@/lib/utils'

type Provider = 'html5' | 'gnmath'

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'html5', label: 'HTML5' },
  { id: 'gnmath', label: 'GN-MATH' },
]

const TYPE_LABEL: Record<string, string> = {
  iframe: 'web',
  unity: 'unity',
  proxy: 'proxied',
  unityframe: 'unity',
}

const FILTERS = [
  { id: 'all', label: 'all' },
  { id: 'iframe', label: 'web' },
  { id: 'unity', label: 'unity' },
  { id: 'proxy', label: 'proxied' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

const PAGE_SIZE = 48

export default function GamesPanel() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [provider, setProvider] = useState<Provider>('html5')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [active, setActive] = useState<Game | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [iframeLoading, setIframeLoading] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Toggle real browser fullscreen (Fullscreen API) on the overlay container.
  const toggleBrowserFullscreen = useCallback(async () => {
    const el = overlayRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      // fallback: toggle CSS-only fullscreen if the API is unavailable
      setFullscreen((v) => !v)
    }
  }, [])

  // Open the game in a new about:blank tab (cloaked) with the game in a
  // fullscreen srcdoc iframe.
  const openInAboutBlank = useCallback((g: Game) => {
    const loader = `<!DOCTYPE html><html><head><meta charset="utf-8"><title></title><style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000}iframe{border:0;width:100vw;height:100vh;display:block}</style></head><body><iframe src="${g.url}" allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write; encrypted-media; payment; web-share; cross-origin-isolated" allowfullscreen></iframe></body></html>`
    const srcdoc = loader.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    const outer = `<!DOCTYPE html><html><head><title></title><style>html,body{margin:0;padding:0;height:100%;background:#000}iframe{border:0;width:100vw;height:100vh;display:block}</style></head><body><iframe srcdoc="${srcdoc}" allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write; encrypted-media; payment; web-share; cross-origin-isolated" allowfullscreen></iframe></body></html>`
    const win = window.open('about:blank', '_blank')
    if (!win) return
    try {
      win.document.open()
      win.document.write(outer)
      win.document.close()
    } catch {
      win.location.href = g.url
    }
  }, [])

  // Normalize GN-MATH games to the Game shape (all 'iframe' type)
  const gnmathNormalized: Game[] = useMemo(
    () => GN_MATH_GAMES.map((g) => ({ name: g.name, url: g.url, thumb: g.thumb, type: 'iframe' as const })),
    [],
  )

  const activeGames = provider === 'html5' ? GAMES : gnmathNormalized

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activeGames.filter((g) => {
      if (provider === 'html5' && filter !== 'all' && g.type !== filter && !(filter === 'unity' && g.type === 'unityframe')) {
        return false
      }
      if (!q) return true
      return g.name.toLowerCase().includes(q)
    })
  }, [query, filter, provider, activeGames])

  // Reset pagination when the search key changes — done during render
  // (React's recommended pattern) to avoid a cascading setState in an effect.
  const searchKey = query + '|' + filter + '|' + provider
  const [lastSearchKey, setLastSearchKey] = useState(searchKey)
  if (searchKey !== lastSearchKey) {
    setLastSearchKey(searchKey)
    setVisible(PAGE_SIZE)
  }

  const shown = filtered.slice(0, visible)
  const hasMore = visible < filtered.length

  const openGame = useCallback((g: Game) => {
    setActive(g)
    setIframeKey((k) => k + 1)
    setIframeLoading(true)
  }, [])

  const closeGame = useCallback(() => {
    setActive(null)
    setFullscreen(false)
  }, [])

  // esc to close, F for fullscreen (real browser fullscreen via Fullscreen API)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // if in browser fullscreen, Esc exits fullscreen (browser handles it)
        // but also handle CSS-fullscreen fallback
        if (fullscreen && !document.fullscreenElement) setFullscreen(false)
        else if (!document.fullscreenElement) closeGame()
      }
      if (e.key === 'f' || e.key === 'F') {
        void toggleBrowserFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, fullscreen, closeGame, toggleBrowserFullscreen])

  // Keep `fullscreen` state in sync with the browser's fullscreen API so the
  // UI (padding, icon) updates when the user enters/exits fullscreen via Esc.
  useEffect(() => {
    const onFsChange = () => {
      setFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

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
          <Gamepad2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Games</h2>
          <p className="text-sm text-white/45">
            {activeGames.length} titles · {provider === 'html5' ? 'HTML5' : 'GN-MATH'} provider
          </p>
        </div>
        {/* Provider toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-2xl glass-subtle p-1">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={cn(
                'rounded-xl px-3 py-1.5 text-xs font-medium transition-all',
                provider === p.id
                  ? 'bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 text-white'
                  : 'text-white/55 hover:text-white',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* Search + filters */}
      <div className="glass glass-sheen mb-4 flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/30 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`search ${activeGames.length} games…`}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-white/40 transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto glass-scroll">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition-all',
                filter === f.id
                  ? 'bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/12 hover:text-white'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <div className="mb-3 flex items-center justify-between px-1 text-xs text-white/40">
        <span>
          {filtered.length} {filtered.length === 1 ? 'game' : 'games'}
          {query && ` for "${query}"`}
        </span>
        {filtered.length > PAGE_SIZE && (
          <span className="inline-flex items-center gap-1">
            <Grid2x2 className="h-3 w-3" /> showing {shown.length}
          </span>
        )}
      </div>

      {/* Gallery */}
      {shown.length === 0 ? (
        <div className="glass glass-sheen grid place-items-center rounded-3xl py-20 text-center">
          <div>
            <Search className="mx-auto mb-3 h-10 w-10 text-white/20" />
            <p className="text-sm text-white/50">no games match that search.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <AnimatePresence mode="popLayout">
            {shown.map((g, i) => (
              <motion.button
                key={g.url + g.name}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.01, 0.2) }}
                whileHover={{ y: -4 }}
                onClick={() => openGame(g)}
                className="glass glass-sheen group relative aspect-[3/4] overflow-hidden rounded-2xl text-left"
              >
                <GameThumb game={g} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <span className="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/70 backdrop-blur-sm">
                  {TYPE_LABEL[g.type] || g.type}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-2.5">
                  <h3 className="line-clamp-2 text-xs font-semibold leading-tight text-white">
                    {g.name}
                  </h3>
                </div>
                <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500/80 to-violet-600/80 text-white shadow-lg">
                    <Maximize2 className="h-5 w-5" />
                  </div>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="glass-sheen rounded-2xl bg-white/8 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15"
          >
            load more · {filtered.length - visible} remaining
          </button>
        </div>
      )}

      {/* Game player overlay */}
      <AnimatePresence>
        {active && (
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'fixed inset-0 z-50 flex flex-col bg-[#04020a]/95 backdrop-blur-md',
              fullscreen && 'p-0',
              !fullscreen && 'p-3 sm:p-6'
            )}
          >
            {/* Player chrome */}
            <div
              className={cn(
                'mb-2 flex items-center gap-2 rounded-2xl glass-strong glass-sheen p-2',
                fullscreen && 'mx-2 mt-2'
              )}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500/40 to-violet-500/30 text-white">
                <Gamepad2 className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{active.name}</div>
                <div className="truncate text-[10px] text-white/40">
                  {TYPE_LABEL[active.type]}
                </div>
              </div>
              <button
                onClick={() => {
                  setIframeKey((k) => k + 1)
                  setIframeLoading(true)
                }}
                className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="reload (R)"
              >
                <RefreshCw className={cn('h-4 w-4', iframeLoading && 'animate-spin')} />
              </button>
              <button
                onClick={() => openInAboutBlank(active)}
                className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="open in about:blank"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
              <button
                onClick={toggleBrowserFullscreen}
                className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="fullscreen (F)"
              >
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={closeGame}
                className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white/70 transition-colors hover:bg-rose-500/30 hover:text-white"
                title="close (Esc)"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Iframe */}
            <div
              className={cn(
                'relative flex-1 overflow-hidden rounded-2xl glass glass-sheen',
                fullscreen && 'rounded-none'
              )}
            >
              {iframeLoading && (
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
                onLoad={() => setIframeLoading(false)}
                className="h-full w-full border-0 bg-black"
                allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write; encrypted-media; payment; web-share; cross-origin-isolated"
                allowFullScreen
                referrerPolicy="no-referrer"
                title={active.name}
              />
            </div>

            {/* Footer hint */}
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

/** Thumbnail with fallback + lazy load. */
function GameThumb({ game }: { game: Game }) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (error || !game.thumb) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-violet-900/40 to-fuchsia-900/30">
        <Gamepad2 className="h-8 w-8 text-white/30" />
      </div>
    )
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-violet-900/30 to-fuchsia-900/20" />
      )}
      <img
        src={game.thumb}
        alt={game.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-105',
          !loaded && 'opacity-0',
          loaded && 'opacity-100'
        )}
      />
    </>
  )
}
