'use client'

import { useEffect, useRef } from 'react'

type Star = {
  x: number
  y: number
  z: number // depth 0..1 (used for size + parallax)
  baseAngle: number
  radius: number
  speed: number
  twinkle: number
  hue: number
}

/**
 * BlackHoleBackground
 * A full-screen canvas that renders:
 *  - a deep-space nebula gradient
 *  - a swirling starfield whose stars are gently pulled toward a central
 *    singularity (gravitational lensing flavor)
 *  - layered CSS for the event horizon + glowing accretion disk
 */
export default function BlackHoleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let cx = 0
    let cy = 0
    // Cap DPR at 1.5 — retina rendering doubles the pixel work for little visual
    // gain on a dark starfield, and this is the single biggest perf lever here.
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const stars: Star[] = []
    const STAR_COUNT = 380
    // Offscreen canvas caching the static nebula backdrop (deep space + two
    // radial gradient blooms). Recreated only on resize, then blitted each
    // frame — avoids recreating gradients 60×/sec.
    const bgCanvas = document.createElement('canvas')
    const bgCtx = bgCanvas.getContext('2d')

    const initStars = () => {
      stars.length = 0
      for (let i = 0; i < STAR_COUNT; i++) {
        const baseAngle = Math.random() * Math.PI * 2
        const radius = Math.random() * Math.max(width, height) * 0.7 + 40
        stars.push({
          x: cx + Math.cos(baseAngle) * radius,
          y: cy + Math.sin(baseAngle) * radius,
          z: Math.random(),
          baseAngle,
          radius,
          speed: 0.06 + Math.random() * 0.22,
          twinkle: Math.random() * Math.PI * 2,
          hue: 220 + Math.random() * 80, // blue -> violet -> magenta
        })
      }
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      cx = width * 0.5
      cy = height * 0.5
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Rebuild the cached backdrop at the same resolution.
      bgCanvas.width = width * dpr
      bgCanvas.height = height * dpr
      if (bgCtx) {
        bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        bgCtx.fillStyle = '#04020a'
        bgCtx.fillRect(0, 0, width, height)
        const nebula = bgCtx.createRadialGradient(
          cx, cy, 0, cx, cy, Math.max(width, height) * 0.65,
        )
        nebula.addColorStop(0, 'rgba(70, 30, 120, 0.32)')
        nebula.addColorStop(0.35, 'rgba(40, 15, 80, 0.18)')
        nebula.addColorStop(1, 'rgba(2, 1, 8, 0)')
        bgCtx.fillStyle = nebula
        bgCtx.fillRect(0, 0, width, height)
        const off = bgCtx.createRadialGradient(
          width * 0.78, height * 0.28, 0, width * 0.78, height * 0.28, width * 0.5,
        )
        off.addColorStop(0, 'rgba(120, 40, 160, 0.16)')
        off.addColorStop(1, 'rgba(2, 1, 8, 0)')
        bgCtx.fillStyle = off
        bgCtx.fillRect(0, 0, width, height)
      }
      initStars()
    }

    resize()
    window.addEventListener('resize', resize)

    let t = 0
    const render = () => {
      t += 0.016

      // Blit the cached nebula backdrop (deep space + two gradient blooms) —
      // one drawImage instead of recreating two radial gradients per frame.
      if (bgCtx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(bgCanvas, 0, 0)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      } else {
        ctx.fillStyle = '#04020a'
        ctx.fillRect(0, 0, width, height)
      }

      // Stars: additive blending for a cheap glow WITHOUT per-star shadowBlur
      // (shadowBlur was the dominant cost — removing it is the single biggest win).
      ctx.globalCompositeOperation = 'lighter'
      const maxR = Math.max(width, height) * 0.75
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        const proximity = Math.max(0, Math.min(1, 1 - s.radius / maxR))
        s.baseAngle += (0.0016 + proximity * proximity * 0.05) * s.speed
        const pull = 0.035 + Math.pow(proximity, 1.7) * 1.6
        s.radius -= pull * (0.5 + s.z * 0.6)

        if (s.radius < 16) {
          const a = Math.random() * Math.PI * 2
          s.baseAngle = a
          s.radius = maxR * (0.7 + Math.random() * 0.3)
          s.z = Math.random()
          s.hue = 220 + Math.random() * 80
        }

        s.x = cx + Math.cos(s.baseAngle) * s.radius
        s.y = cy + Math.sin(s.baseAngle) * s.radius
        s.twinkle += 0.05

        const size = 0.4 + s.z * 1.8
        const twinkleAlpha = 0.55 + Math.sin(s.twinkle) * 0.35
        const alpha = twinkleAlpha * (0.4 + s.z * 0.6)

        const near = Math.max(0, 1 - s.radius / 300)
        const r = Math.round(200 + near * 55)
        const g = Math.round(190 + near * 30 - near * 80)
        const b = Math.round(255 - near * 120)

        // Soft glow halo (one extra arc, no shadowBlur) for brighter stars.
        if (s.z > 0.55 || near > 0.3) {
          ctx.beginPath()
          ctx.arc(s.x, s.y, size * 2.6, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.18})`
          ctx.fill()
        }

        // Core star point
        ctx.beginPath()
        ctx.arc(s.x, s.y, size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
        ctx.fill()

        // Streak for fast-falling stars near the hole
        if (near > 0.5) {
          const tangent = s.baseAngle + Math.PI / 2
          const len = near * 30
          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(s.x - Math.cos(tangent) * len, s.y - Math.sin(tangent) * len)
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`
          ctx.lineWidth = size * 0.9
          ctx.stroke()
        }
      }
      ctx.globalCompositeOperation = 'source-over'

      rafRef.current = requestAnimationFrame(render)
    }
    render()

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Accretion disk — outer glowing ring */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin-slow"
        style={{
          width: 'min(78vmin, 760px)',
          height: 'min(78vmin, 760px)',
          borderRadius: '9999px',
          background:
            'conic-gradient(from 0deg, rgba(255,180,90,0) 0deg, rgba(255,150,80,0.0) 40deg, rgba(255,170,90,0.55) 110deg, rgba(255,220,160,0.9) 180deg, rgba(190,120,255,0.55) 250deg, rgba(120,80,255,0.15) 320deg, rgba(255,180,90,0) 360deg)',
          maskImage:
            'radial-gradient(closest-side, transparent 56%, black 60%, black 86%, transparent 96%)',
          WebkitMaskImage:
            'radial-gradient(closest-side, transparent 56%, black 60%, black 86%, transparent 96%)',
          filter: 'blur(10px)',
          opacity: 0.9,
        }}
      />
      {/* Inner hotter ring, spinning the opposite way */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin-reverse-slow"
        style={{
          width: 'min(58vmin, 560px)',
          height: 'min(58vmin, 560px)',
          borderRadius: '9999px',
          background:
            'conic-gradient(from 120deg, rgba(255,240,200,0) 0deg, rgba(255,200,120,0.85) 90deg, rgba(255,255,240,0.95) 180deg, rgba(255,170,90,0.7) 270deg, rgba(255,240,200,0) 360deg)',
          maskImage:
            'radial-gradient(closest-side, transparent 60%, black 64%, black 82%, transparent 94%)',
          WebkitMaskImage:
            'radial-gradient(closest-side, transparent 60%, black 64%, black 82%, transparent 94%)',
          filter: 'blur(6px)',
          opacity: 0.85,
        }}
      />

      {/* Event horizon — pure black sphere with a thin photon ring */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 'min(40vmin, 380px)',
          height: 'min(40vmin, 380px)',
          borderRadius: '9999px',
          background:
            'radial-gradient(circle at 50% 45%, #000 62%, rgba(0,0,0,0.92) 78%, rgba(0,0,0,0) 100%)',
          boxShadow:
            '0 0 60px 8px rgba(0,0,0,0.95), 0 0 120px 30px rgba(80,30,140,0.25)',
        }}
      />
      {/* Photon ring highlight */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-accretion-pulse"
        style={{
          width: 'min(42vmin, 400px)',
          height: 'min(42vmin, 400px)',
          borderRadius: '9999px',
          border: '1.5px solid rgba(255, 220, 180, 0.55)',
          boxShadow:
            'inset 0 0 22px 4px rgba(255, 200, 140, 0.35), 0 0 30px 6px rgba(255, 180, 120, 0.25)',
        }}
      />

      {/* Vignette to deepen edges */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 40%, rgba(2,1,8,0.55) 80%, rgba(2,1,8,0.9) 100%)',
        }}
      />
    </div>
  )
}
