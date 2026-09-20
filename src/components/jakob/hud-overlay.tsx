'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, Gauge } from 'lucide-react'

/**
 * HudOverlay
 * A fixed top-right glass pill showing the current Texas Central Time
 * (America/Chicago) and a live FPS counter. Mounted once in the main view so
 * it floats above every tab.
 *
 * FPS is computed from rAF delta times and updated ~4×/sec to avoid churning
 * the DOM. The clock ticks every second.
 */
export default function HudOverlay() {
  const [time, setTime] = useState('--:--:--')
  const [dateLabel, setDateLabel] = useState('')
  const [fps, setFps] = useState(60)

  useEffect(() => {
    // Texas Central Time = America/Chicago (the configured session tz).
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
    const dayFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    const tick = () => {
      const now = new Date()
      setTime(fmt.format(now))
      setDateLabel(dayFmt.format(now))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // FPS — accumulate frame deltas, update the readout a few times a second.
  const frames = useRef(0)
  const lastFpsT = useRef(performance.now())
  const raf = useRef(0)

  useEffect(() => {
    const loop = () => {
      frames.current += 1
      const now = performance.now()
      const elapsed = now - lastFpsT.current
      if (elapsed >= 250) {
        const v = Math.round((frames.current * 1000) / elapsed)
        setFps(Math.min(v, 240))
        frames.current = 0
        lastFpsT.current = now
      }
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const fpsColor =
    fps >= 55 ? 'text-emerald-300' : fps >= 30 ? 'text-amber-300' : 'text-rose-300'

  return (
    // Outer wrapper carries the fixed positioning (no .glass-sheen here, since
    // .glass-sheen sets `position: relative` and would override `fixed`).
    <div className="pointer-events-none fixed right-4 top-4 z-40">
      <div className="flex items-center gap-2 rounded-2xl glass-strong glass-sheen px-3 py-2 text-xs sm:right-6 sm:top-6">
        <div className="flex items-center gap-2 border-r border-white/10 pr-2.5">
          <Clock className="h-3.5 w-3.5 text-fuchsia-300" />
          <div className="leading-tight">
            <div className="font-mono font-semibold tabular-nums text-white">{time}</div>
            <div className="text-[9px] uppercase tracking-wider text-white/40">
              {dateLabel} · CT
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5" title="frames per second">
          <Gauge className={`h-3.5 w-3.5 ${fpsColor}`} />
          <span className={`font-mono font-semibold tabular-nums ${fpsColor}`}>{fps}</span>
          <span className="text-[9px] uppercase tracking-wider text-white/40">fps</span>
        </div>
      </div>
    </div>
  )
}
