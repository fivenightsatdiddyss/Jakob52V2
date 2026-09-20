'use client'

import { useEffect } from 'react'

/**
 * Storage shape for the tab disguise feature.
 * `id` is the preset id ("none" | "canvas" | ... | "custom"); `title` and
 * `favicon` are the actual values to apply to the document.
 */
type Disguise = { id: string; title: string; favicon: string }

const STORAGE_KEY = 'jakob52-disguise'
const EVENT_NAME = 'jakob52-disguise-change'

function readDisguise(): Disguise | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
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

function applyDisguise(d: Disguise | null) {
  if (typeof document === 'undefined') return
  if (!d) return
  try {
    document.title = d.title
    // Remove every existing icon link (Next.js injects one from metadata.icons;
    // we replace it so the disguise favicon wins).
    document
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
      .forEach((el) => el.parentNode?.removeChild(el))
    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = d.favicon
    // Mark it so other code could find/identify the disguise favicon later.
    link.setAttribute('data-jakob-disguise', 'true')
    document.head.appendChild(link)
  } catch {
    /* ignore */
  }
}

/**
 * SiteDisguise
 *
 * Reads the chosen tab disguise from `localStorage` on mount and applies it to
 * the document (title + favicon). Subscribes to `storage` events (so changes in
 * other tabs propagate) and to a custom `jakob52-disguise-change` event (so
 * same-tab changes apply instantly without remounting). Renders nothing.
 *
 * Mounted once at the layout level so it's always present.
 */
export default function SiteDisguise() {
  useEffect(() => {
    applyDisguise(readDisguise())
    const handler = () => applyDisguise(readDisguise())
    window.addEventListener('storage', handler)
    window.addEventListener(EVENT_NAME, handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener(EVENT_NAME, handler)
    }
  }, [])

  return null
}
