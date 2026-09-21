'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clapperboard, Search, X, Maximize2, Minimize2, Grid2x2, Loader2, RefreshCw, Play } from 'lucide-react'
import { MOVIES, type Movie } from './movies-data'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 48

// deterministic gradient per movie so cards feel distinct without posters
const GRADIENTS = [
  'from-violet-500 to-fuchsia-600',
  'from-fuchsia-500 to-rose-600',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-violet-600',
  'from-cyan-500 to-blue-600',
]

export default function MoviesPanel() {
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [active, setActive] = useState<Movie | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [iframeLoading, setIframeLoading] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return MOVIES
    return MOVIES.filter((m) => m.name.toLowerCase().includes(q))
  }, [query])

  // Reset pagination when the search changes (render-time state adjustment).
  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setVisible(PAGE_SIZE)
  }

  const shown = filtered.slice(0, visible)
  const hasMore = visible < filtered.length

  const openMovie = useCallback((m: Movie) => {
    setActive(m)
    setIframeKey((k) => k + 1)
    setIframeLoading(true)
  }, [])

  const closeMovie = useCallback(() => {
    setActive(null)
    setFullscreen(false)
  }, [])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false)
        else closeMovie()
      }
      if (e.key === 'f' || e.key === 'F') setFullscreen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, fullscreen, closeMovie])

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
          <Clapperboard className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Movies</h2>
          <p className="text-sm text-white/45">
            {MOVIES.length} titles in the vault · click to stream
          </p>
        </div>
      </header>

      {/* Search */}
      <div className="glass glass-sheen mb-4 flex items-center gap-2 rounded-2xl p-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/30 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`search ${MOVIES.length} movies…`}
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
      </div>

      <div className="mb-3 flex items-center justify-between px-1 text-xs text-white/40">
        <span>
          {filtered.length} {filtered.length === 1 ? 'movie' : 'movies'}
          {query && ` for "${query}"`}
        </span>
        {filtered.length > PAGE_SIZE && (
          <span className="inline-flex items-center gap-1">
            <Grid2x2 className="h-3 w-3" /> showing {shown.length}
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="glass glass-sheen grid place-items-center rounded-3xl py-20 text-center">
          <div>
            <Search className="mx-auto mb-3 h-10 w-10 text-white/20" />
            <p className="text-sm text-white/50">no movies match that search.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <AnimatePresence mode="popLayout">
            {shown.map((m, i) => (
              <motion.button
                key={m.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.01, 0.2) }}
                whileHover={{ y: -4 }}
                onClick={() => openMovie(m)}
                className="glass glass-sheen group relative aspect-[2/3] overflow-hidden rounded-2xl text-left"
              >
                {/* Gradient backdrop (always present — the poster sits on top) */}
                <div
                  className={cn(
                    'absolute inset-0 bg-gradient-to-br opacity-95 transition-opacity group-hover:opacity-100',
                    GRADIENTS[i % GRADIENTS.length]
                  )}
                />
                {/* Movie name centered — shows when the poster fails to load (the
                    poster img, if it loads, covers this) */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                  <Clapperboard className="h-8 w-8 text-white/20" />
                  <span className="text-sm font-bold leading-tight text-white/40">
                    {m.name}
                  </span>
                </div>
                {/* Real movie poster when available */}
                {m.poster ? (
                  <img
                    src={m.poster}
                    alt={m.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      // hide broken poster → gradient + movie name fallback shows
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <Clapperboard className="absolute left-2.5 top-2.5 h-4 w-4 text-white/40 drop-shadow" />
                <div className="absolute inset-x-0 bottom-0 p-2.5">
                  <h3 className="line-clamp-3 text-xs font-semibold leading-tight text-white">
                    {m.name}
                  </h3>
                </div>
                <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500/80 to-violet-600/80 text-white shadow-lg">
                    <Play className="h-5 w-5 translate-x-0.5" />
                  </div>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

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

      {/* Player overlay */}
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
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500/40 to-violet-500/30 text-white">
                <Clapperboard className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{active.name}</div>
                <div className="truncate text-[10px] text-white/40">streaming · google drive</div>
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
                onClick={() => setFullscreen((v) => !v)}
                className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="fullscreen (F)"
              >
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={closeMovie}
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
              {iframeLoading && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-[#04020a]">
                  <div className="text-center">
                    <Loader2 className="mx-auto mb-3 h-9 w-9 animate-spin text-fuchsia-300" />
                    <p className="text-sm text-white/60">loading {active.name}…</p>
                  </div>
                </div>
              )}
              <iframe
                key={iframeKey}
                src={active.preview}
                onLoad={() => setIframeLoading(false)}
                className="h-full w-full border-0 bg-black"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
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
    </motion.div>
  )
}
