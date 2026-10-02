'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings,
  Gamepad2,
  Film,
  LayoutGrid,
  MessagesSquare,
  Link2,
  Globe,
} from 'lucide-react'
import SettingsPanel from './panels/settings-panel'
import AiPanel from './panels/ai-panel'
import GamesPanel from './panels/games-panel'
import MoviesPanel from './panels/movies-panel'
import AppsPanel from './panels/apps-panel'
import ChatPanel from './panels/chat-panel'
import ProxyPanel from './panels/proxy-panel'
import LinksPanel from './panels/links-panel'
import { cn } from '@/lib/utils'

type Tab = 'home' | 'settings' | 'ai' | 'games' | 'movies' | 'apps' | 'chat' | 'proxy' | 'links'

const NAV: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'apps', label: 'Apps', icon: LayoutGrid },
  { id: 'chat', label: 'Chat', icon: MessagesSquare },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'proxy', label: 'Proxy', icon: Globe },
]

// Rising dots for the home background
const DOTS = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  size: 2 + Math.random() * 5,
  duration: 8 + Math.random() * 12,
  delay: Math.random() * 15,
  opacity: 0.1 + Math.random() * 0.3,
}))

export default function MainView() {
  const [tab, setTab] = useState<Tab>('home')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative min-h-screen w-full bg-black"
    >
      {/* Top liquid glass nav bar */}
      <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
        <nav className="flex items-center gap-1 rounded-2xl glass-strong glass-sheen px-2 py-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'group relative grid h-11 w-11 place-items-center rounded-xl transition-all',
                tab === item.id
                  ? 'bg-gradient-to-br from-white/20 to-white/5 text-white'
                  : 'text-white/40 hover:bg-white/8 hover:text-white/80',
              )}
            >
              <item.icon className="h-5 w-5" />
              {/* Hover label */}
              <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {item.label}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="relative z-10 px-4 pb-28 pt-24 sm:px-6 md:pb-10 md:pr-10">
        <AnimatePresence mode="wait">
          {tab === 'home' ? (
            <HomeView key="home" onNavigate={setTab} />
          ) : (
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="mx-auto w-full max-w-5xl"
            >
              {tab === 'settings' && <SettingsPanel />}
              {tab === 'ai' && <AiPanel />}
              {tab === 'games' && <GamesPanel />}
              {tab === 'movies' && <MoviesPanel />}
              {tab === 'apps' && <AppsPanel />}
              {tab === 'chat' && <ChatPanel />}
              {tab === 'links' && <LinksPanel />}
              {tab === 'proxy' && <ProxyPanel />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function HomeView({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [time, setTime] = useState('--:--:--')
  const [fps, setFps] = useState(60)
  const frames = useMemo(() => ({ count: 0, last: 0 }), [])

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    })
    const tick = () => setTime(fmt.format(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      frames.count++
      const now = performance.now()
      if (now - frames.last >= 250) {
        setFps(Math.min(Math.round((frames.count * 1000) / (now - frames.last)), 240))
        frames.count = 0
        frames.last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [frames])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex min-h-[calc(100vh-120px)] flex-col items-center justify-center"
    >
      {/* Rising dots background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {DOTS.map((dot) => (
          <motion.div
            key={dot.id}
            className="absolute rounded-full bg-white"
            style={{
              left: `${dot.left}%`,
              width: dot.size,
              height: dot.size,
              opacity: dot.opacity,
            }}
            animate={{
              y: ['100vh', '-10vh'],
              scale: [1, 0.2],
              opacity: [dot.opacity, 0],
            }}
            transition={{
              duration: dot.duration,
              repeat: Infinity,
              delay: dot.delay,
              ease: 'linear',
            }}
          />
        ))}
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-6xl font-bold tracking-tight text-white sm:text-8xl"
        >
          jakob-52
        </motion.h1>

        {/* Time + FPS */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="flex items-center gap-6 text-sm text-white/40"
        >
          <span className="font-mono tabular-nums">{time} CT</span>
          <span className="font-mono tabular-nums text-emerald-400/60">{fps} fps</span>
        </motion.div>

        {/* Quick nav shortcuts */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="mt-4 flex flex-wrap items-center justify-center gap-2"
        >
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="group flex items-center gap-2 rounded-full glass-subtle px-4 py-2 text-sm text-white/50 transition-all hover:bg-white/10 hover:text-white"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </motion.div>
      </div>
    </motion.div>
  )
}
