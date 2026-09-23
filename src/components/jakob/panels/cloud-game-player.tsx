'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Cloud, X, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type CloudGame = {
  name: string
  game_key: string
  image: string
}

const STRATUS_API = '/api/cloud-game'

type SessionState = 'idle' | 'creating' | 'queueing' | 'starting' | 'playing' | 'error'

/**
 * CloudGamePlayer — handles the full stratus API flow:
 * 1. POST /cloud/v1/createSession (NDJSON stream → get uuid)
 * 2. GET /cloud/v1/getQueue (poll if queued)
 * 3. POST /cloud/v1/startGame (get WebRTC credentials)
 * 4. GET /cloud/v1/embed?id=UUID (iframe the embed page)
 *
 * The API runs as a mini-service on port 3004, proxied through the gateway.
 */
export default function CloudGamePlayer({
  game,
  onClose,
}: {
  game: CloudGame
  onClose: () => void
}) {
  const [state, setState] = useState<SessionState>('idle')
  const [statusText, setStatusText] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const startSession = useCallback(async () => {
    setState('creating')
    setError(null)
    setStatusText('Creating session…')
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Step 1: createSession — NDJSON stream
      const res = await fetch(`${STRATUS_API}?endpoint=createSession`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game_key: game.game_key }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(err || `createSession failed (${res.status})`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let uuid: string | null = null
      let buffer = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const event = JSON.parse(line)
              if (event.status === 'creating_account') setStatusText('Creating account…')
              else if (event.status === 'account_ready') setStatusText('Account ready…')
              else if (event.status === 'requesting_game') setStatusText('Requesting game…')
              else if (event.status === 'queue') {
                setStatusText(`In queue — position ${event.queue_pos || '?'}`)
                setState('queueing')
              }
              else if (event.status === 'finished_queue') {
                uuid = event.uuid
                setSessionId(uuid)
                break
              }
            } catch {}
          }
          if (uuid) break
        }
      }

      if (!uuid) throw new Error('No session UUID received')

      // Step 2: startGame
      setState('starting')
      setStatusText('Starting game…')
      const startRes = await fetch(`${STRATUS_API}?endpoint=startGame`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uuid }),
        signal: controller.signal,
      })

      if (!startRes.ok) {
        const err = await startRes.text()
        throw new Error(err || `startGame failed (${startRes.status})`)
      }

      // Game is now active — show the embed iframe
      setState('playing')
      setStatusText('')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError((err as Error).message)
      setState('error')
    }
  }, [game.game_key])

  // Auto-start on mount
  useEffect(() => {
    startSession()
    return () => { abortRef.current?.abort() }
  }, [startSession])

  // Ping the session every 30s while playing (keeps it alive)
  useEffect(() => {
    if (state !== 'playing' || !sessionId) return
    const interval = setInterval(async () => {
      try {
        await fetch(`${STRATUS_API}?endpoint=pingSession`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uuid: sessionId }),
        })
      } catch {}
    }, 30000)
    return () => clearInterval(interval)
  }, [state, sessionId])

  const quitSession = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch(`${STRATUS_API}?endpoint=quitSession`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uuid: sessionId }),
        })
      } catch {}
    }
    onClose()
  }, [sessionId, onClose])

  const embedUrl = sessionId ? `${STRATUS_API}?endpoint=embed&id=${sessionId}` : null

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className={cn(
          'fixed inset-0 z-50 flex flex-col bg-[#04020a]/95 backdrop-blur-md',
          fullscreen ? 'p-0' : 'p-3 sm:p-6',
        )}
      >
        {/* Header */}
        <div className={cn('mb-2 flex items-center gap-2 rounded-2xl glass-strong glass-sheen p-2', fullscreen && 'mx-2 mt-2')}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500/40 to-blue-600/30 text-white">
            <Cloud className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{game.name}</div>
            <div className="truncate text-[10px] text-white/40">
              {state === 'playing' ? 'cloud · streaming' : statusText || state}
            </div>
          </div>
          <button
            onClick={quitSession}
            className="grid h-9 w-9 place-items-center rounded-xl bg-rose-600/60 text-white transition-colors hover:bg-rose-600"
            title="close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Content */}
        <div className={cn('relative flex-1 overflow-hidden rounded-2xl glass glass-sheen', fullscreen && 'rounded-none')}>
          {state !== 'playing' && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-[#04020a]">
              <div className="text-center">
                {state === 'error' ? (
                  <>
                    <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-rose-400" />
                    <p className="text-sm text-rose-200">{error}</p>
                    <button onClick={startSession} className="mt-4 rounded-xl bg-white/8 px-4 py-2 text-sm text-white hover:bg-white/15">
                      retry
                    </button>
                  </>
                ) : (
                  <>
                    <Loader2 className="mx-auto mb-3 h-9 w-9 animate-spin text-sky-300" />
                    <p className="text-sm text-white/60">{statusText || 'Loading…'}</p>
                    <p className="mt-1 text-[11px] text-white/30">cloud gaming · this may take a minute</p>
                  </>
                )}
              </div>
            </div>
          )}
          {embedUrl && state === 'playing' && (
            <iframe
              ref={iframeRef}
              src={embedUrl}
              className="h-full w-full border-0 bg-black"
              allow="autoplay; fullscreen; gamepad; encrypted-media"
              allowFullScreen
              referrerPolicy="no-referrer"
              title={game.name}
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
