'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Send, Sparkles, User, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Msg = { role: 'user' | 'ai'; text: string }

const SUGGESTIONS = [
  'Explain a black hole',
  'Write a haiku about glass',
  'Design a game idea',
  'Summarize jakob-52',
]

export default function AiPanel() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'ai',
      text: "Welcome to the jakob-52 AI deck. I'm a real language model running server-side — ask me anything.",
    },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  const send = useCallback(async (text: string) => {
    const value = text.trim()
    if (!value || typing) return

    setMessages((m) => [...m, { role: 'user', text: value }])
    setInput('')
    setTyping(true)

    // Add an empty AI message we'll fill as tokens stream in
    setMessages((m) => [...m, { role: 'ai', text: '' }])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages.filter((m) => m.text), { role: 'user', content: value }],
        }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`http ${res.status}`)

      const data = (await res.json()) as { text?: string; error?: string }
      const reply = data.text || data.error || '(no response)'

      setMessages((m) => {
        const next = [...m]
        next[next.length - 1] = { role: 'ai', text: reply }
        return next
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setMessages((m) => {
        const next = [...m]
        next[next.length - 1] = { role: 'ai', text: `(error: ${(err as Error).message})` }
        return next
      })
    } finally {
      setTyping(false)
      abortRef.current = null
    }
  }, [messages, typing])

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto flex h-[78vh] w-full max-w-3xl flex-col"
    >
      <header className="mb-4 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl glass-strong text-fuchsia-200">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">AI</h2>
          <p className="text-sm text-white/45">the mind behind the glass · server-side LLM</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full glass-subtle px-3 py-1 text-xs text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]" />
          online
        </span>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="glass glass-sheen flex-1 overflow-y-auto rounded-3xl p-5 glass-scroll"
      >
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                className={`flex items-end gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-sky-500/40 to-cyan-500/30 text-sky-100'
                      : 'bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30 text-fuchsia-100'
                  }`}
                >
                  {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={`max-w-[78%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-gradient-to-br from-sky-500/25 to-cyan-500/15 text-sky-50'
                      : 'rounded-bl-sm glass-subtle text-white/85'
                  }`}
                >
                  {m.text || (m.role === 'ai' && typing ? '…' : '\u00A0')}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {typing && messages[messages.length - 1]?.text === '' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-end gap-2.5"
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30 text-fuchsia-100">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex gap-1 rounded-2xl rounded-bl-sm glass-subtle px-4 py-3.5">
                {[0, 1, 2].map((d) => (
                  <motion.span
                    key={d}
                    className="h-1.5 w-1.5 rounded-full bg-fuchsia-200/70"
                    animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Suggestions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => !typing && send(s)}
            disabled={typing}
            className="rounded-full glass-subtle px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-40"
          >
            <Sparkles className="mr-1 inline h-3 w-3 text-fuchsia-300" />
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the AI…"
          disabled={typing}
          className="glass-subtle flex-1 rounded-2xl border border-white/10 bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-fuchsia-400/40 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={typing || !input.trim()}
          className="glass-sheen grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 text-white transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {typing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
    </motion.div>
  )
}
