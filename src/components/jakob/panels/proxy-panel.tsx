'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Globe,
  Shield,
  Zap,
  Lock,
  RefreshCw,
  ArrowRight,
  Activity,
  Server,
  Home,
  ChevronLeft,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'

const REGIONS = [
  { id: 'orbit-1', name: 'Orbit Alpha', ping: 12, load: 22 },
  { id: 'orbit-2', name: 'Orbit Beta', ping: 28, load: 41 },
  { id: 'orbit-3', name: 'Orbit Gamma', ping: 47, load: 68 },
  { id: 'orbit-4', name: 'Deep Ring', ping: 91, load: 84 },
]

const QUICK_LINKS = [
  { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Black_hole' },
  { label: 'Example', url: 'https://example.com' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
  { label: 'MDN', url: 'https://developer.mozilla.org' },
]

function normalizeUrl(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  // add https:// if missing a scheme
  if (!/^https?:\/\//i.test(v)) {
    return `https://${v}`
  }
  try {
    // validate
    new URL(v)
    return v
  } catch {
    return null
  }
}

export default function ProxyPanel() {
  const [rawUrl, setRawUrl] = useState('')
  const [current, setCurrent] = useState<string | null>(null) // the url currently loaded
  const [history, setHistory] = useState<string[]>([])
  const [hIndex, setHIndex] = useState(-1)
  const [region, setRegion] = useState(REGIONS[0])
  const [shielded, setShielded] = useState(true)
  const [loading, setLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const navigate = (input: string) => {
    const url = normalizeUrl(input)
    if (!url) {
      toast.error('Enter a valid URL', { description: 'try example.com or https://site.com' })
      return
    }
    setLoading(true)
    setCurrent(url)
    setRawUrl(url)
    setHistory((h) => {
      const trimmed = h.slice(0, hIndex + 1)
      const next = [...trimmed, url]
      setHIndex(next.length - 1)
      return next
    })
    toast.success('Routing through ' + region.name, {
      description: 'tunneling via the corsproxy relay…',
    })
  }

  const reload = () => {
    if (!current) return
    setLoading(true)
    // force reload by toggling src through a key bump
    setReloadKey((k) => k + 1)
  }

  const goHome = () => {
    setCurrent(null)
    setRawUrl('')
  }

  const back = () => {
    if (hIndex <= 0) return
    const ni = hIndex - 1
    setHIndex(ni)
    const url = history[ni]
    setCurrent(url)
    setRawUrl(url)
    setLoading(true)
  }

  const forward = () => {
    if (hIndex >= history.length - 1) return
    const ni = hIndex + 1
    setHIndex(ni)
    const url = history[ni]
    setCurrent(url)
    setRawUrl(url)
    setLoading(true)
  }

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => setLoading(false), 1800)
    return () => clearTimeout(t)
  }, [loading, reloadKey])

  // proxy iframe src
  const proxySrc = current ? `/api/proxy?url=${encodeURIComponent(current)}` : null

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
          <Globe className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Proxy</h2>
          <p className="text-sm text-white/45">route the web around the hole · corsproxy relay</p>
        </div>
        <div className="ml-auto inline-flex items-center gap-2 rounded-full glass-subtle px-3 py-1.5 text-xs text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]" />
          relay up
        </div>
      </header>

      {/* Browser chrome */}
      <div className="glass glass-sheen overflow-hidden rounded-3xl">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-white/10 p-2.5">
          {/* nav buttons */}
          <button
            onClick={back}
            disabled={hIndex <= 0}
            className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            title="back"
          >
            <ChevronLeft className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={forward}
            disabled={hIndex >= history.length - 1}
            className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            title="forward"
          >
            <ChevronLeft className="h-4.5 w-4.5 rotate-180" />
          </button>
          <button
            onClick={reload}
            disabled={!current}
            className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            title="reload"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={goHome}
            className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="home"
          >
            <Home className="h-4.5 w-4.5" />
          </button>

          {/* URL bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              navigate(rawUrl)
            }}
            className="flex flex-1 items-center gap-2 rounded-xl bg-black/30 px-3 py-2"
          >
            <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
            <input
              value={rawUrl}
              onChange={(e) => setRawUrl(e.target.value)}
              placeholder="enter a destination url or search…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
            />
            {current && (
              <span className="hidden truncate text-[10px] text-white/30 sm:inline">
                via {region.name}
              </span>
            )}
          </form>

          <button
            onClick={() => {
              navigate(rawUrl)
            }}
            disabled={loading}
            className="glass-sheen inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            <span className="hidden sm:inline">{loading ? 'routing' : 'go'}</span>
          </button>
        </div>

        {/* Viewport */}
        <div className="relative h-[64vh] min-h-[420px] bg-[#04020a]">
          {!current ? (
            <ProxyHome onPick={navigate} />
          ) : (
            <>
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#04020a]/60 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-400" />
                    <p className="text-sm text-white/60">tunneling through {region.name}…</p>
                  </div>
                </div>
              )}
              <iframe
                key={reloadKey}
                ref={iframeRef}
                src={proxySrc || undefined}
                onLoad={() => setLoading(false)}
                className="h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox allow-presentation"
                referrerPolicy="no-referrer"
                title="proxied content"
              />
            </>
          )}
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-2.5">
          <span className="px-1 text-[10px] uppercase tracking-widest text-white/30">try</span>
          {QUICK_LINKS.map((q) => (
            <button
              key={q.url}
              onClick={() => navigate(q.url)}
              className="rounded-full glass-subtle px-3 py-1 text-xs text-white/65 transition-colors hover:bg-white/15 hover:text-white"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Region + status grid */}
      <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <section className="glass glass-sheen rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Server className="h-4 w-4 text-fuchsia-300" /> relay nodes
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {REGIONS.map((r) => {
              const selected = r.id === region.id
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    setRegion(r)
                    toast.success(`switched to ${r.name}`)
                  }}
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                    selected
                      ? 'border-fuchsia-400/40 bg-fuchsia-500/10'
                      : 'border-white/8 bg-white/4 hover:bg-white/8'
                  }`}
                >
                  <div
                    className={`grid h-8 w-8 place-items-center rounded-lg ${
                      selected
                        ? 'bg-gradient-to-br from-fuchsia-500/40 to-violet-500/30 text-white'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{r.name}</div>
                    <div className="text-[11px] text-white/40">{r.ping}ms · {r.load}% load</div>
                  </div>
                  {selected && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">active</span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        <section className="glass glass-sheen flex flex-col rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Activity className="h-4 w-4 text-emerald-300" /> tunnel status
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3">
            <Stat icon={Zap} label="throughput" value="1.2 Gb/s" tint="text-amber-300" />
            <Stat icon={Shield} label="shield" value={shielded ? 'on' : 'off'} tint="text-emerald-300" />
            <Stat icon={Server} label="node" value={region.name.split(' ')[1] ?? '—'} tint="text-sky-300" />
            <Stat icon={Lock} label="encryption" value="aes-256" tint="text-fuchsia-300" />
          </div>
          <button
            onClick={() => {
              setShielded((v) => !v)
              toast.success(`shield ${!shielded ? 'engaged' : 'disengaged'}`)
            }}
            className="glass-sheen mt-4 w-full rounded-2xl bg-white/8 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/14"
          >
            {shielded ? 'disengage shield' : 'engage shield'}
          </button>
        </section>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-white/30">
        <ExternalLink className="h-3 w-3" />
        powered by corsproxy.io · some sites with strict CSP may not render fully
      </p>
    </motion.div>
  )
}

function ProxyHome({ onPick }: { onPick: (url: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-fuchsia-100"
      >
        <Globe className="h-10 w-10" />
      </motion.div>
      <h3 className="text-xl font-semibold text-white">enter a destination above</h3>
      <p className="mt-2 max-w-md text-sm text-white/50">
        type any url into the address bar and hit go. the relay rewrites and serves the page through corsproxy so it renders right here, cloaked behind the glass.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {QUICK_LINKS.map((q) => (
          <button
            key={q.url}
            onClick={() => onPick(q.url)}
            className="rounded-full glass-subtle px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: React.ElementType
  label: string
  value: string
  tint: string
}) {
  return (
    <div className="rounded-2xl glass-subtle p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
        <Icon className={`h-3 w-3 ${tint}`} />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  )
}
