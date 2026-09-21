'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Link2,
  ChevronDown,
  X,
  RefreshCw,
  Maximize2,
  Minimize2,
  ExternalLink,
  Loader2,
  Calendar,
  Star,
  Copy,
  Check,
} from 'lucide-react'
import { DAILY_LINKS, formatDateLabel, isToday, type LinkSite } from './links-data'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function LinksPanel() {
  // expanded dates — today is open by default
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const today = DAILY_LINKS[0]?.date
    return new Set(today ? [today] : [])
  })

  const toggle = (date: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto w-full max-w-3xl"
    >
      <header className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl glass-strong text-fuchsia-200">
          <Link2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Links</h2>
          <p className="text-sm text-white/45">daily drops · click a date to expand</p>
        </div>
      </header>

      <div className="space-y-3">
        {DAILY_LINKS.map((drop) => {
          const isOpen = expanded.has(drop.date)
          const today = isToday(drop.date)
          return (
            <div key={drop.date} className="glass glass-sheen overflow-hidden rounded-3xl">
              {/* Date header — clickable dropdown */}
              <button
                onClick={() => toggle(drop.date)}
                className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-white/4"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500/40 to-violet-500/30 text-white">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {drop.label || formatDateLabel(drop.date)}
                    </span>
                    {today && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fuchsia-200">
                        <Star className="h-2.5 w-2.5 fill-fuchsia-300" />
                        today
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/40">
                    {drop.sites.length} {drop.sites.length === 1 ? 'site' : 'sites'}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 shrink-0 text-white/50 transition-transform',
                    isOpen && 'rotate-180'
                  )}
                />
              </button>

              {/* Expandable sites list */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 border-t border-white/8 p-4">
                      {drop.sites.map((site) => (
                        <SiteCard key={site.name} site={site} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {DAILY_LINKS.length === 0 && (
        <div className="glass glass-sheen grid place-items-center rounded-3xl py-20 text-center">
          <div>
            <Link2 className="mx-auto mb-3 h-10 w-10 text-white/20" />
            <p className="text-sm text-white/50">no links yet — check back tomorrow.</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/** A single site card with its name + all mirror links. */
function SiteCard({ site }: { site: LinkSite }) {
  const [active, setActive] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)

  const open = useCallback((url: string) => {
    setActive(url)
    setIframeKey((k) => k + 1)
    setLoading(true)
  }, [])

  const close = useCallback(() => {
    setActive(null)
    setFullscreen(false)
  }, [])

  const copy = (url: string) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(url)
      toast.success('copied to clipboard')
      setTimeout(() => setCopied(null), 1500)
    })
  }

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false)
        else close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, fullscreen, close])

  return (
    <>
      <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-lg font-black text-white',
              site.gradient
            )}
          >
            {site.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">{site.name}</h3>
            <p className="text-[11px] text-white/45">{site.tagline}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-medium text-white/50">
            {site.links.length} {site.links.length === 1 ? 'link' : 'links'}
          </span>
        </div>

        {/* Mirror links list */}
        <div className="space-y-1.5">
          {site.links.map((url, i) => (
            <div
              key={url + i}
              className="flex items-center gap-2 rounded-xl bg-black/20 p-2"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/8 text-[10px] font-bold text-white/50">
                {i + 1}
              </span>
              <code className="min-w-0 flex-1 truncate text-[11px] text-white/60">
                {url.replace(/^https?:\/\//, '')}
              </code>
              <button
                onClick={() => copy(url)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                title="copy link"
              >
                {copied === url ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => open(url)}
                className="glass-sheen inline-flex shrink-0 items-center gap-1 rounded-lg bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 px-2.5 py-1.5 text-[11px] font-medium text-white transition-transform hover:scale-105 active:scale-95"
                title="open in viewer"
              >
                <ExternalLink className="h-3 w-3" />
                open
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Viewer modal — portaled to document.body */}
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
                  site.gradient
                )}
              >
                {site.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{site.name}</div>
                <div className="truncate text-[10px] text-white/40">
                  {active.replace(/^https?:\/\//, '')}
                </div>
              </div>
              <a
                href={active}
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
                title="reload"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </button>
              <button
                onClick={() => setFullscreen((v) => !v)}
                className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="fullscreen"
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
                    <p className="text-sm text-white/60">loading {site.name}…</p>
                  </div>
                </div>
              )}
              <iframe
                key={iframeKey}
                src={`/api/proxy?url=${encodeURIComponent(active)}`}
                onLoad={() => setLoading(false)}
                className="h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                referrerPolicy="no-referrer"
                title={site.name}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      , document.body)}
    </>
  )
}
