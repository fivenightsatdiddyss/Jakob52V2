'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Ghost,
  Eye,
  Zap,
  Settings as SettingsIcon,
  Sparkles,
  Volume2,
  Bell,
  Wand2,
  ExternalLink,
  ShieldCheck,
  Orbit,
  Waves,
  Ghost as GhostIcon,
  FileCode,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useThemeStore, type Theme } from '../theme-store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/**
 * Opens the current site cloaked behind an about:blank tab.
 *
 * The new window is pointed at about:blank (so the tab shows no title and no
 * URL). Into that window we write a single <iframe> whose content comes from an
 * `srcdoc` attribute — a self-contained loader document that itself hosts the
 * real jakob-52 app in a nested fullscreen iframe. Because the real URL lives
 * inside the srcdoc blob (not as a visible iframe src), the cloak is tighter
 * than a plain iframe and the tab stays on about:blank.
 *
 * We append #enter so the cloaked copy skips the calculator gate.
 */
function openAboutBlankCloak() {
  const url = `${window.location.origin}${window.location.pathname}#enter`

  // Inner loader document: fills the window and mounts the real app.
  const loader = `<!DOCTYPE html><html><head><meta charset="utf-8"><title></title><style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#04020a}iframe{border:0;width:100vw;height:100vh;display:block}</style></head><body><iframe src="${url}" allow="autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; gamepad; popups" allowfullscreen></iframe></body></html>`

  // Escape the loader so it can live safely inside an srcdoc="..." attribute.
  const srcdoc = loader.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

  const outer = `<!DOCTYPE html><html><head><title></title><style>html,body{margin:0;padding:0;height:100%;background:#04020a}iframe{border:0;width:100vw;height:100vh;display:block}</style></head><body><iframe srcdoc="${srcdoc}" allow="autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; gamepad; popups" allowfullscreen></iframe></body></html>`

  const win = window.open('about:blank', '_blank')
  if (!win) {
    toast.error('Popup blocked', {
      description: 'Allow popups for this site to use the about:blank cloak.',
    })
    return
  }
  try {
    win.document.open()
    win.document.write(outer)
    win.document.close()
    toast.success('Cloak deployed', {
      description: 'jakob-52 is running inside an about:blank tab.',
    })
    // Redirect the OLD tab (the one where the user clicked) to google.com
    // so there's only one visible jakob-52 tab (the cloaked one).
    setTimeout(() => {
      window.location.href = 'https://www.google.com'
    }, 500)
  } catch {
    // Fallback: navigate the new window straight to the app.
    win.location.href = url
  }
}

/**
 * Blob cloak — opens the site in a new tab whose URL is a blob: URL.
 * A blob: URL contains the entire HTML document inline, so the address bar
 * shows "blob:https://yoursite.com/uuid" instead of the real URL. The old
 * tab is redirected to google.com (same as the about:blank cloak).
 */
function openBlobCloak() {
  const url = `${window.location.origin}${window.location.pathname}#enter`

  // Build a self-contained HTML document that loads the real app in an iframe
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title></title><style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#04020a}iframe{border:0;width:100vw;height:100vh;display:block}</style></head><body><iframe src="${url}" allow="autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; gamepad; popups" allowfullscreen></iframe></body></html>`

  try {
    const blob = new Blob([doc], { type: 'text/html' })
    const blobUrl = URL.createObjectURL(blob)
    const win = window.open(blobUrl, '_blank')
    if (!win) {
      toast.error('Popup blocked', {
        description: 'Allow popups for this site to use the blob cloak.',
      })
      return
    }
    toast.success('Blob cloak deployed', {
      description: 'jakob-52 is running inside a blob: URL tab.',
    })
    // Redirect the old tab to google.com
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl) // clean up (the new tab has its own reference)
      window.location.href = 'https://www.google.com'
    }, 500)
  } catch {
    toast.error('Blob cloak failed', {
      description: 'Your browser may not support blob URLs.',
    })
  }
}

function ToggleRow({
  icon: Icon,
  title,
  desc,
  defaultOn,
}: {
  icon: React.ElementType
  title: string
  desc: string
  defaultOn?: boolean
}) {
  const [on, setOn] = useState(!!defaultOn)
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl glass-subtle p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-fuchsia-200">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-sm font-medium text-white/90">{title}</div>
          <div className="text-xs text-white/45">{desc}</div>
        </div>
      </div>
      <Switch checked={on} onCheckedChange={setOn} />
    </div>
  )
}

/* ---------------------------------------------------------------
 * Tab Disguise + Panic Key — shared storage helpers
 * ------------------------------------------------------------- */

const DISGUISE_KEY = 'jakob52-disguise'
const DISGUISE_EVENT = 'jakob52-disguise-change'

type Disguise = { id: string; title: string; favicon: string }

// Preset list — IDs + values match the SiteDisguise layout component.
const DISGUISE_PRESETS: { id: string; name: string; title: string; favicon: string }[] = [
  { id: 'canvas',    name: 'Canvas',     title: 'Dashboard',                              favicon: 'https://www.google.com/s2/favicons?domain=canvas.instructure.com&sz=64' },
  { id: 'classroom', name: 'Classroom',  title: 'Google Classroom',                       favicon: 'https://www.google.com/s2/favicons?domain=classroom.google.com&sz=64' },
  { id: 'docs',      name: 'Docs',       title: 'Untitled document - Google Docs',        favicon: 'https://www.google.com/s2/favicons?domain=docs.google.com&sz=64' },
  { id: 'slides',    name: 'Slides',     title: 'Untitled presentation - Google Slides',  favicon: 'https://www.google.com/s2/favicons?domain=slides.google.com&sz=64' },
  { id: 'drive',     name: 'Drive',      title: 'My Drive - Google Drive',                favicon: 'https://www.google.com/s2/favicons?domain=drive.google.com&sz=64' },
  { id: 'gmail',     name: 'Gmail',      title: 'Inbox - someone@gmail.com - Gmail',      favicon: 'https://www.google.com/s2/favicons?domain=mail.google.com&sz=64' },
  { id: 'khan',      name: 'Khan',       title: 'Khan Academy',                           favicon: 'https://www.google.com/s2/favicons?domain=khanacademy.org&sz=64' },
  { id: 'none',      name: 'None (Real)', title: 'jakob-52',                              favicon: 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg' },
]

function readDisguise(): Disguise | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DISGUISE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Disguise>
    if (
      parsed &&
      typeof parsed.title === 'string' &&
      typeof parsed.favicon === 'string'
    ) {
      return {
        id: typeof parsed.id === 'string' ? parsed.id : 'custom',
        title: parsed.title,
        favicon: parsed.favicon,
      }
    }
  } catch {
    /* ignore corrupt JSON */
  }
  return null
}

function writeDisguise(d: Disguise) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISGUISE_KEY, JSON.stringify(d))
  } catch {
    /* ignore */
  }
  // Same-tab live propagation — SiteDisguise listens for this.
  window.dispatchEvent(new Event(DISGUISE_EVENT))
}

const PANIC_KEY = 'jakob52-panic'
const PANIC_EVENT = 'jakob52-panic-change'

type PanicConfig = { key: string; url: string; enabled: boolean }

function readPanic(): PanicConfig {
  if (typeof window === 'undefined') return { key: '', url: '', enabled: false }
  try {
    const raw = window.localStorage.getItem(PANIC_KEY)
    if (!raw) return { key: '', url: '', enabled: false }
    const parsed = JSON.parse(raw) as Partial<PanicConfig>
    return {
      key: typeof parsed.key === 'string' ? parsed.key : '',
      url: typeof parsed.url === 'string' ? parsed.url : '',
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : false,
    }
  } catch {
    return { key: '', url: '', enabled: false }
  }
}

function writePanic(cfg: PanicConfig) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PANIC_KEY, JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
  // Same-tab live propagation — PanicKey listens for this.
  window.dispatchEvent(new Event(PANIC_EVENT))
}

/* ---------------------------------------------------------------
 * Tab Disguise section
 * ------------------------------------------------------------- */

function TabDisguiseSection() {
  const [active, setActive] = useState<Disguise | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customFavicon, setCustomFavicon] = useState('')

  useEffect(() => {
    const d = readDisguise()
    // One-time sync with localStorage on mount; setState is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(d)
    if (d && d.id === 'custom') {
      setCustomTitle(d.title)
      setCustomFavicon(d.favicon)
    }
    const handler = () => {
      const next = readDisguise()
      setActive(next)
      if (next && next.id === 'custom') {
        setCustomTitle(next.title)
        setCustomFavicon(next.favicon)
      }
    }
    window.addEventListener(DISGUISE_EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(DISGUISE_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  const selectPreset = (preset: (typeof DISGUISE_PRESETS)[number]) => {
    const d: Disguise = { id: preset.id, title: preset.title, favicon: preset.favicon }
    writeDisguise(d)
    setActive(d)
    setCustomOpen(false)
    toast.success(`Tab disguised as ${preset.name}`, {
      description: `Title → "${preset.title}"`,
    })
  }

  const applyCustom = () => {
    const title = customTitle.trim()
    const favicon = customFavicon.trim()
    if (!title || !favicon) {
      toast.error('Enter both a title and a favicon URL')
      return
    }
    const d: Disguise = { id: 'custom', title, favicon }
    writeDisguise(d)
    setActive(d)
    toast.success('Custom disguise applied', {
      description: `Title → "${title}"`,
    })
  }

  const customActive = active?.id === 'custom'

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.5 }}
      className="glass glass-sheen mb-6 rounded-3xl p-6"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-fuchsia-200">
          <Eye className="h-4.5 w-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Tab Disguise</h3>
          <p className="text-xs text-white/45">
            camouflage the browser tab — title + favicon mimic another site.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {DISGUISE_PRESETS.map((preset) => {
          const isActive = active?.id === preset.id && active?.title === preset.title
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => selectPreset(preset)}
              className={cn(
                'group flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all',
                isActive
                  ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-white shadow-[0_0_0_1px_rgba(217,70,239,0.35)]'
                  : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:bg-white/10',
              )}
            >
              <img
                src={preset.favicon}
                alt=""
                className="h-6 w-6 rounded"
                loading="lazy"
              />
              <span className="text-[11px] font-medium leading-tight">{preset.name}</span>
            </button>
          )
        })}
      </div>

      {/* Custom disguise */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-2xl border p-3 text-left transition-all',
            customActive
              ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-white'
              : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:bg-white/10',
          )}
        >
          <div className="flex items-center gap-2">
            {customActive && active?.favicon ? (
              <img src={active.favicon} alt="" className="h-6 w-6 rounded" />
            ) : (
              <div className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[10px] font-bold text-white/60">
                ?
              </div>
            )}
            <div>
              <div className="text-xs font-medium text-white/90">
                Custom{customActive ? ' · active' : ''}
              </div>
              <div className="text-[10px] text-white/45">
                {customActive && active ? active.title : 'set your own title + favicon'}
              </div>
            </div>
          </div>
          <span className="text-xs text-white/40">
            {customOpen ? '▲' : '▼'}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {customOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                <Input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Custom title (e.g. Math Homework)"
                  className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
                />
                <Input
                  value={customFavicon}
                  onChange={(e) => setCustomFavicon(e.target.value)}
                  placeholder="Favicon URL (https://…)"
                  className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
                />
                <div className="flex justify-end sm:col-span-2">
                  <Button
                    type="button"
                    onClick={applyCustom}
                    className="glass-sheen rounded-xl bg-gradient-to-br from-fuchsia-500/70 to-violet-600/70 px-5 text-white hover:from-fuchsia-500 hover:to-violet-600"
                  >
                    Apply Custom
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

/* ---------------------------------------------------------------
 * Panic Key section
 * ------------------------------------------------------------- */

function PanicKeySection() {
  const [key, setKey] = useState('')
  const [url, setUrl] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    const cfg = readPanic()
    // One-time sync with localStorage on mount; setState is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKey(cfg.key)
    setUrl(cfg.url)
    setEnabled(cfg.enabled)
    const handler = () => {
      const next = readPanic()
      setKey(next.key)
      setUrl(next.url)
      setEnabled(next.enabled)
    }
    window.addEventListener(PANIC_EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(PANIC_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  // Key-capture mode: listen for the next keydown (capture phase, so we beat
  // the global PanicKey listener and stop the redirect from firing while the
  // user is configuring a new key).
  useEffect(() => {
    if (!capturing) return
    const onCapture = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        setCapturing(false)
        return
      }
      setKey(e.key)
      setCapturing(false)
    }
    window.addEventListener('keydown', onCapture, { capture: true })
    return () => window.removeEventListener('keydown', onCapture, { capture: true })
  }, [capturing])

  const save = () => {
    const trimmedUrl = url.trim()
    if (!key) {
      toast.error('Pick a key first')
      return
    }
    if (!trimmedUrl) {
      toast.error('Enter a redirect URL')
      return
    }
    let normalized = trimmedUrl
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`
    }
    const cfg: PanicConfig = { key, url: normalized, enabled }
    writePanic(cfg)
    setUrl(normalized)
    toast.success('Panic key saved', {
      description: enabled
        ? `Press "${key.length === 1 ? key.toUpperCase() : key}" to redirect → ${normalized}`
        : 'Saved (currently disabled)',
    })
  }

  const displayKey = key.length === 1 ? key.toUpperCase() : key

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5 }}
      className="glass glass-sheen mb-6 rounded-3xl p-6"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-amber-200">
          <Zap className="h-4.5 w-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Panic Key</h3>
          <p className="text-xs text-white/45">
            press your chosen key anywhere on the site to instantly redirect to a safe URL.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Key capture */}
        <div className="rounded-2xl glass-subtle p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-white/45">
            Panic key
          </div>
          <button
            type="button"
            onClick={() => setCapturing(true)}
            className={cn(
              'flex h-[42px] w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-all',
              capturing
                ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                : key
                  ? 'border-fuchsia-400/40 bg-fuchsia-500/10 text-white'
                  : 'border-white/15 bg-white/5 text-white/60 hover:bg-white/10',
            )}
          >
            {capturing ? (
              <>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-300" />
                press any key…
              </>
            ) : key ? (
              <kbd className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs uppercase">
                {displayKey}
              </kbd>
            ) : (
              'Click to set key'
            )}
          </button>
        </div>

        {/* Enable */}
        <div className="rounded-2xl glass-subtle p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-white/45">
            Enabled
          </div>
          <div className="flex h-[42px] items-center justify-between gap-3">
            <span className="text-xs text-white/55">
              {enabled ? 'active — key will redirect' : 'disabled'}
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      </div>

      {/* URL */}
      <div className="mt-3">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-white/45">
          Redirect destination
        </div>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://classroom.google.com"
          className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
        />
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        <span className="hidden text-[11px] text-white/40 sm:inline">
          {key && enabled && url.trim() ? (
            <>
              press{' '}
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono uppercase">
                {displayKey}
              </kbd>{' '}
              to redirect
            </>
          ) : null}
        </span>
        <Button
          type="button"
          onClick={save}
          className="glass-sheen rounded-xl bg-gradient-to-br from-amber-500/70 to-fuchsia-600/70 px-5 text-white hover:from-amber-500 hover:to-fuchsia-600"
        >
          <Zap className="mr-2 h-4 w-4" />
          Save
        </Button>
      </div>
    </motion.section>
  )
}

/**
 * BackgroundSection — choose the site-wide background theme.
 * Each theme also remaps the accent colors (purple → blue/orange) via CSS
 * variables in globals.css.
 */
function BackgroundSection() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const options: { id: Theme; label: string; desc: string; icon: React.ElementType; gradient: string }[] = [
    { id: 'space', label: 'Space', desc: 'black hole + starfield · purple', icon: Orbit, gradient: 'from-violet-500/40 to-fuchsia-500/30' },
    { id: 'ocean', label: 'Ocean', desc: 'fluid water + coral · blue & sand', icon: Waves, gradient: 'from-sky-500/40 to-cyan-500/30' },
    { id: 'halloween', label: 'Halloween', desc: 'glowing pumpkin · orange & green', icon: GhostIcon, gradient: 'from-orange-500/40 to-green-500/30' },
  ]

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.5 }}
      className="glass glass-sheen mb-6 rounded-3xl p-6"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-fuchsia-200">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Background</h3>
          <p className="text-xs text-white/45">changes the whole site's vibe + colors.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => {
          const active = theme === o.id
          return (
            <button
              key={o.id}
              onClick={() => {
                setTheme(o.id)
                toast.success(`background: ${o.label}`)
              }}
              className={cn(
                'relative overflow-hidden rounded-2xl border p-4 text-left transition-all',
                active
                  ? 'border-fuchsia-400/40 bg-fuchsia-500/10 ring-1 ring-inset ring-fuchsia-400/30'
                  : 'border-white/8 bg-white/4 hover:bg-white/8',
              )}
            >
              <div
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white',
                  o.gradient,
                )}
              >
                <o.icon className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-white">{o.label}</h4>
              <p className="mt-0.5 text-[11px] text-white/45">{o.desc}</p>
              {active && (
                <span className="absolute right-3 top-3 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                  active
                </span>
              )}
            </button>
          )
        })}
      </div>
    </motion.section>
  )
}

export default function SettingsPanel() {
  const [glassIntensity, setGlassIntensity] = useState(70)
  const [motionReduce, setMotionReduce] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto w-full max-w-3xl"
    >
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl glass-strong text-fuchsia-200">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Settings</h2>
          <p className="text-sm text-white/45">tune the glass, cloak the tab.</p>
        </div>
      </header>

      {/* About:Blank cloak — the hero feature */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.5 }}
        className="glass glass-sheen relative mb-6 overflow-hidden rounded-3xl p-6"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.35), transparent 70%)' }}
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30 text-white">
              <Ghost className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">About:Blank Cloak</h3>
                <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-200">
                  signature
                </span>
              </div>
              <p className="mt-1 max-w-md text-sm text-white/55">
                Spins up a new tab pointed at <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-fuchsia-200">about:blank</code> with jakob-52 hidden inside a fullscreen iframe. The tab shows no title and no URL — perfect for low-profile browsing.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-white/40">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> no history footprint
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5 text-fuchsia-300" /> opens in new tab
                </span>
              </div>
            </div>
          </div>
          <Button
            onClick={openAboutBlankCloak}
            className="glass-sheen shrink-0 rounded-xl bg-gradient-to-br from-fuchsia-500/70 to-violet-600/70 px-5 text-white hover:from-fuchsia-500 hover:to-violet-600"
          >
            <Ghost className="mr-2 h-4 w-4" />
            Open in About:Blank
          </Button>
        </div>
      </motion.section>

      {/* Blob cloak — opens the site in a blob: URL tab */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.5 }}
        className="glass glass-sheen relative mb-6 overflow-hidden rounded-3xl p-6"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.25), transparent 70%)' }}
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/40 to-teal-500/30 text-white">
              <FileCode className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">Blob Cloak</h3>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
                  stealth
                </span>
              </div>
              <p className="mt-1 max-w-md text-sm text-white/55">
                Opens the site in a new tab with a <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-emerald-200">blob:</code> URL — the address bar shows a blob reference instead of the real URL. The old tab redirects to Google.
              </p>
            </div>
          </div>
          <Button
            onClick={openBlobCloak}
            className="glass-sheen shrink-0 rounded-xl bg-gradient-to-br from-emerald-500/70 to-teal-600/70 px-5 text-white hover:from-emerald-500 hover:to-teal-600"
          >
            <FileCode className="mr-2 h-4 w-4" />
            Open in Blob URL
          </Button>
        </div>
      </motion.section>

      {/* Tab Disguise — favicon + title camouflage */}
      <TabDisguiseSection />

      {/* Panic Key — instant redirect on a keypress */}
      <PanicKeySection />

      {/* Background theme — space / ocean / halloween */}
      <BackgroundSection />

      {/* Liquid glass intensity */}
      <section className="glass glass-sheen mb-6 rounded-3xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-fuchsia-200">
            <Wand2 className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Liquid Glass Intensity</h3>
            <p className="text-xs text-white/45">how much the surfaces refract their surroundings.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Sparkles className="h-4 w-4 text-white/40" />
          <Slider
            value={[glassIntensity]}
            onValueChange={(v) => setGlassIntensity(v[0])}
            min={0}
            max={100}
            step={1}
            className="flex-1"
          />
          <span className="w-10 text-right text-sm tabular-nums text-white/70">
            {glassIntensity}%
          </span>
        </div>
        <div
          className="mt-4 h-16 w-full rounded-2xl border border-white/10 transition-all"
          style={{
            backdropFilter: `blur(${4 + glassIntensity / 4}px) saturate(${120 + glassIntensity * 1.2}%)`,
            background: `linear-gradient(135deg, rgba(168,85,247,${0.05 + glassIntensity / 600}), rgba(255,255,255,${0.04 + glassIntensity / 800}))`,
          }}
        />
      </section>

      {/* Secondary toggles */}
      <section className="grid gap-3 sm:grid-cols-2">
        <ToggleRow
          icon={Sparkles}
          title="Ambient Animations"
          desc="starfield drift, accretion spin, floating titles"
          defaultOn
        />
        <ToggleRow
          icon={Volume2}
          title="Spatial Sound"
          desc="subtle audio cues on interaction"
        />
        <ToggleRow
          icon={Bell}
          title="Notifications"
          desc="system toasts for key events"
          defaultOn
        />
        <div className="flex items-center justify-between gap-4 rounded-2xl glass-subtle p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-fuchsia-200">
              <Wand2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-sm font-medium text-white/90">Reduce Motion</div>
              <div className="text-xs text-white/45">calm the cosmos for accessibility</div>
            </div>
          </div>
          <Switch checked={motionReduce} onCheckedChange={setMotionReduce} />
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-white/30">
        jakob-52 · settings · more features landing soon
      </p>
    </motion.div>
  )
}
