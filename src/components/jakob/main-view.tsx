'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings,
  Bot,
  Gamepad2,
  MessagesSquare,
  Globe,
  Film,
  Link2,
  Orbit,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import BlackHoleBackground from './black-hole-bg'
import SettingsPanel from './panels/settings-panel'
import AiPanel from './panels/ai-panel'
import GamesPanel from './panels/games-panel'
import MoviesPanel from './panels/movies-panel'
import ChatPanel from './panels/chat-panel'
import ProxyPanel from './panels/proxy-panel'
import LinksPanel from './panels/links-panel'
import HudOverlay from './hud-overlay'
import AppShortcuts from './app-shortcuts'
import { cn } from '@/lib/utils'

type Tab = 'home' | 'settings' | 'ai' | 'games' | 'movies' | 'chat' | 'proxy' | 'links'

const NAV: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'chat', label: 'Chat', icon: MessagesSquare },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'proxy', label: 'Proxy', icon: Globe },
]

export default function MainView() {
  const [tab, setTab] = useState<Tab>('home')
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      {/* HUD (clock + FPS) — rendered OUTSIDE the motion.div so `position: fixed`
          isn't trapped by framer-motion's transform/will-change containing block.
          Only shown on the home tab. */}
      {tab === 'home' && <HudOverlay />}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative flex min-h-screen w-full"
      >
        <BlackHoleBackground />

        {/* Desktop sidebar (retractable) */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col p-4 transition-all duration-300 ease-out md:flex',
          collapsed ? 'w-[88px]' : 'w-64'
        )}
      >
        <div className="glass glass-sheen flex h-full flex-col rounded-3xl p-4">
          {/* Brand + collapse toggle */}
          <div className={cn('mb-4 flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
            <button
              onClick={() => setTab('home')}
              className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500/50 to-fuchsia-500/40 text-white transition-transform hover:scale-105"
              title="home"
            >
              <Orbit className="h-5 w-5" />
            </button>
            {!collapsed && (
              <button
                onClick={() => setCollapsed(true)}
                className="grid h-9 w-9 place-items-center rounded-xl text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                title="collapse"
              >
                <PanelLeftClose className="h-4.5 w-4.5" />
              </button>
            )}
          </div>

          {/* Home shortcut */}
          <NavButton
            item={{ id: 'home', label: 'Home', icon: Home }}
            active={tab === 'home'}
            onClick={() => setTab('home')}
            collapsed={collapsed}
          />

          <div className="my-3 flex items-center gap-2 px-3">
            <div className="h-px flex-1 bg-white/10" />
            {!collapsed && (
              <span className="text-[9px] uppercase tracking-widest text-white/30">categories</span>
            )}
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Categories */}
          <nav className="flex flex-1 flex-col gap-1.5">
            {NAV.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={tab === item.id}
                onClick={() => setTab(item.id)}
                collapsed={collapsed}
              />
            ))}
          </nav>

          {/* Expand button when collapsed */}
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="mt-3 grid h-10 w-10 place-items-center self-center rounded-xl text-white/45 transition-colors hover:bg-white/10 hover:text-white"
              title="expand"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )}

          {/* Footer status */}
          {!collapsed && (
            <div className="mt-4 rounded-2xl glass-subtle p-3">
              <div className="flex items-center gap-2 text-[11px] text-white/60">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                orbit stable
              </div>
              <div className="mt-1 text-[10px] text-white/35">signal locked · 52 AU</div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="relative flex min-h-screen flex-1 flex-col px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pl-8 md:pr-10">
        {/* Mobile top bar */}
        <div className="mb-5 flex items-center justify-between md:hidden">
          <button onClick={() => setTab('home')} className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500/50 to-fuchsia-500/40 text-white">
              <Orbit className="h-4.5 w-4.5" />
            </div>
            <span className="text-sm font-bold text-white">jakob-52</span>
          </button>
          <span className="rounded-full glass-subtle px-3 py-1 text-[10px] uppercase tracking-widest text-white/50">
            deck
          </span>
        </div>

        {/* Floating hero (always present, dims when a panel is open) */}
        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex flex-col items-center justify-center transition-all duration-700',
            tab !== 'home' ? 'opacity-15 blur-[1px] scale-95' : 'opacity-100'
          )}
        >
          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="select-none text-center"
          >
            <motion.span
              animate={{ y: [0, -22, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              className="block"
            >
              <span className="font-blaka text-shiny block text-7xl tracking-wide text-glow sm:text-8xl md:text-9xl">
                jakob 52
              </span>
            </motion.span>
          </motion.h1>
          <motion.p
            animate={{ y: [0, -22, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            className="mt-4 text-center text-xs uppercase tracking-[0.5em] text-white/40 sm:text-sm"
          >
            beyond the event horizon
          </motion.p>
        </div>

        {/* Active panel */}
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <AnimatePresence mode="wait">
            {tab === 'home' ? (
              <motion.div
                key="home-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-6"
              >
                <AppShortcuts />
                <p className="pointer-events-none text-center text-xs text-white/40">
                  choose a category to dive in
                </p>
              </motion.div>
            ) : (
              <div className="w-full">
                {tab === 'settings' && <SettingsPanel />}
                {tab === 'ai' && <AiPanel />}
                {tab === 'games' && <GamesPanel />}
                {tab === 'movies' && <MoviesPanel />}
                {tab === 'chat' && <ChatPanel />}
                {tab === 'links' && <LinksPanel />}
                {tab === 'proxy' && <ProxyPanel />}
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>
      </motion.div>

      {/* Mobile bottom nav — rendered OUTSIDE the motion.div (alongside the HUD)
          so `position: fixed` + transform isn't trapped by framer-motion's
          transform/will-change containing block. Wrapper carries `fixed`
          (not .glass-sheen, which sets position:relative and would override fixed). */}
      <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 md:hidden">
        <nav className="flex max-w-[94vw] items-center gap-1 overflow-x-auto rounded-2xl glass-strong glass-sheen p-1.5 glass-scroll">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-all',
                tab === item.id
                  ? 'bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 text-white'
                  : 'text-white/55 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}

function NavButton({
  item,
  active,
  onClick,
  collapsed,
}: {
  item: { id: Tab; label: string; icon: React.ElementType }
  active: boolean
  onClick: () => void
  collapsed: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex items-center rounded-2xl text-sm font-medium transition-all',
        collapsed ? 'h-11 w-11 justify-center' : 'gap-3 px-3 py-2.5',
        active ? 'text-white' : 'text-white/55 hover:bg-white/6 hover:text-white/90'
      )}
    >
      {active && (
        <motion.div
          layoutId="nav-active"
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-fuchsia-500/25 to-violet-500/15"
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
      <item.icon
        className={cn(
          'relative transition-colors',
          collapsed ? 'h-5 w-5' : 'h-4.5 w-4.5',
          active ? 'text-fuchsia-200' : 'text-white/55 group-hover:text-white/90'
        )}
      />
      {!collapsed && <span className="relative">{item.label}</span>}
    </button>
  )
}
