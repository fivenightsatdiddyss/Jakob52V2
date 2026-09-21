'use client'

import { useEffect } from 'react'

/**
 * Storage shape for the panic key feature.
 * `key` is the value of `KeyboardEvent.key` (compared case-insensitively),
 * `url` is the redirect destination, `enabled` toggles the listener.
 */
type PanicConfig = { key: string; url: string; enabled: boolean }

const STORAGE_KEY = 'jakob52-panic'
const EVENT_NAME = 'jakob52-panic-change'

function readConfig(): PanicConfig {
  if (typeof window === 'undefined') return { key: '', url: '', enabled: false }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
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

/**
 * PanicKey
 *
 * Reads the panic-key config from `localStorage` on mount and installs a global
 * `keydown` listener on `window`. When the configured key is pressed (compared
 * case-insensitively via `e.key.toLowerCase()`) and the feature is enabled (and
 * the URL is non-empty), the browser is redirected to the configured URL — an
 * "emergency exit" out of the site.
 *
 * Re-reads the config on `storage` events (cross-tab) and the custom
 * `jakob52-panic-change` event (same-tab) so updates apply live without
 * remounting. Renders nothing.
 *
 * Mounted once at the layout level so the panic key works on every page
 * (calculator gate + main view).
 */
export default function PanicKey() {
  useEffect(() => {
    // Mutable closure variable — refreshed by the storage/custom-event handlers
    // so the keydown listener always sees the latest config without needing to
    // be re-registered.
    let cfg = readConfig()

    const onKey = (e: KeyboardEvent) => {
      if (!cfg.enabled) return
      if (!cfg.key || !cfg.url) return
      if (e.key.toLowerCase() === cfg.key.toLowerCase()) {
        e.preventDefault()
        e.stopPropagation()
        window.location.href = cfg.url
      }
    }
    const refresh = () => {
      cfg = readConfig()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('storage', refresh)
    window.addEventListener(EVENT_NAME, refresh)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('storage', refresh)
      window.removeEventListener(EVENT_NAME, refresh)
    }
  }, [])

  return null
}
