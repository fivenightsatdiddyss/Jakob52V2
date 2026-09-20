'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Send, Sparkles, User } from 'lucide-react'

type Msg = { role: 'user' | 'ai'; text: string }

const SUGGESTIONS = [
  'Explain a black hole',
  'Write a haiku about glass',
  'Design a game idea',
  'Summarize jakob-52',
]

const CANNED: Record<string, string> = {
  'explain a black hole':
    'A black hole is a region where gravity is so intense that nothing—not even light—can escape. Its boundary, the event horizon, surrounds a singularity of infinite density. Around it, infalling gas forms a glowing accretion disk.',
  'write a haiku about glass':
    'Liquid light made still—\nedges catch the moving world,\nfragile, infinite.',
  'design a game idea':
    'Orbital Drift: pilot a shard of glass around a black hole, slingshotting between stars while dodging the accretion disk. Each gravity assist charges your cloak. Survive long enough to bend space itself.',
  'summarize jakob-52':
    'jakob-52 is a liquid-glass command surface orbiting a singularity—calculator gate, AI assistant, arcade, chat and proxy, all behind one shimmering interface.',
}

function reply(input: string): string {
  const key = input.trim().toLowerCase()
  if (CANNED[key]) return CANNED[key]
  if (key.includes('hello') || key.includes('hi'))
    return "Hey. I'm the jakob-52 assistant. Ask me anything—or try a suggestion below."
  if (key.includes('who') || key.includes('jakob'))
    return 'jakob-52 is the signal on the other side of the gate. You found the code; now you\'re orbiting it.'
  return "That's an interesting prompt. In the full build I'd route this to the LLM skill and stream a real answer back through this glass. For now, the cosmos nods thoughtfully."
}

export default function AiPanel() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'ai',
      text: 'Welcome to the jakob-52 AI deck. I live behind the glass. Ask me anything, or tap a suggestion to begin.',
    },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  const send = (text: string) => {
    const value = text.trim()
    if (!value || typing) return
    setMessages((m) => [...m, { role: 'user', text: value }])
    setInput('')
    setTyping(true)
    const answer = reply(value)
    setTimeout(() => {
      setTyping(false)
      setMessages((m) => [...m, { role: 'ai', text: answer }])
    }, 900 + Math.random() * 600)
  }

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
          <p className="text-sm text-white/45">the mind behind the glass.</p>
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
                  {m.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {typing && (
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
            onClick={() => send(s)}
            className="rounded-full glass-subtle px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/15 hover:text-white"
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
          className="glass-subtle flex-1 rounded-2xl border border-white/10 bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-fuchsia-400/40 focus:outline-none"
        />
        <button
          type="submit"
          className="glass-sheen grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 text-white transition-transform hover:scale-105 active:scale-95"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </motion.div>
  )
}
