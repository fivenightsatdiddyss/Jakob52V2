'use client'

import { useEffect, useRef } from 'react'

/**
 * CustomCursor
 * A purple ring with a small square in the center that follows the pointer.
 * Rendered once at the layout level so it's present on every page (calculator
 * gate + main view). The native cursor is hidden via `cursor: none` on body.
 *
 * Performance: uses a single rAF loop + transform (GPU-friendly). The dot
 * tracks 1:1; the ring eases toward the pointer for a fluid feel. Disabled on
 * touch / coarse-pointer devices and when the pointer leaves the window.
 */
export default function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Skip on touch devices — there's no mouse cursor to replace.
    const fine = window.matchMedia('(pointer: fine)').matches
    if (!fine) return

    const ring = ringRef.current
    const dot = dotRef.current
    if (!ring || !dot) return

    let mouseX = window.innerWidth / 2
    let mouseY = window.innerHeight / 2
    let ringX = mouseX
    let ringY = mouseY
    let raf = 0
    let visible = false

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
      // dot tracks 1:1 (no easing) so it feels glued to the pointer
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`
      if (!visible) {
        visible = true
        ring.style.opacity = '1'
        dot.style.opacity = '1'
      }
    }

    const onLeave = () => {
      visible = false
      ring.style.opacity = '0'
      dot.style.opacity = '0'
    }

    const onDown = () => ring.classList.add('cursor-press')
    const onUp = () => ring.classList.remove('cursor-press')

    // rAF loop eases the ring toward the pointer for a trailing fluid feel
    const tick = () => {
      ringX += (mouseX - ringX) * 0.22
      ringY += (mouseY - ringY) * 0.22
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    window.addEventListener('mousedown', onDown, { passive: true })
    window.addEventListener('mouseup', onUp, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999] hidden md:block">
      {/* Outer purple ring */}
      <div
        ref={ringRef}
        className="cursor-ring absolute left-0 top-0 h-8 w-8 rounded-full border-2 border-fuchsia-400/80 opacity-0 transition-[opacity,width,height,background-color] duration-150"
        style={{
          boxShadow:
            '0 0 12px 2px rgba(217,70,239,0.45), inset 0 0 8px 1px rgba(217,70,239,0.25)',
          willChange: 'transform, opacity',
        }}
      />
      {/* Center square */}
      <div
        ref={dotRef}
        className="absolute left-0 top-0 h-1.5 w-1.5 rounded-[2px] bg-fuchsia-300 opacity-0"
        style={{
          boxShadow: '0 0 8px 2px rgba(232,121,249,0.8)',
          willChange: 'transform, opacity',
        }}
      />
      <style jsx global>{`
        .cursor-ring.cursor-press {
          width: 1.5rem;
          height: 1.5rem;
          background-color: rgba(217, 70, 239, 0.18);
        }
      `}</style>
    </div>
  )
}
