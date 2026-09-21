'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Send, Sparkles, User, Cpu, AlertTriangle, Loader2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

type Msg = { role: 'user' | 'ai'; text: string }
type ModelOption = {
  id: string
  label: string
  size: string
  desc: string
}

// WebLLM models — run entirely in-browser via WebGPU. No server, no API.
// The model downloads once on first load, then is cached by the browser.
const MODELS: ModelOption[] = [
  {
    id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    label: 'Llama 3.2 1B',
    size: '~700 MB',
    desc: 'recommended · best balance of quality + speed',
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen 2.5 0.5B',
    size: '~400 MB',
    desc: 'smaller + faster · lower quality',
  },
]

const SUGGESTIONS = [
  'Explain a black hole',
  'Write a haiku about glass',
  'Design a game idea',
  'Summarize jakob-52',
]

const SYSTEM_PROMPT =
  'You are the jakob-52 AI assistant. You live behind a liquid-glass interface orbiting a black hole. Answer concisely and helpfully. Keep responses under ~150 words unless asked for more.'

// Lazy-loaded engine (only created when the user clicks "load model").
// Uses the main-thread engine — Turbopack can't bundle the Web Worker URL
// from node_modules. Streaming keeps the UI responsive between tokens.
type Engine = {
  chat: {
    completions: {
      create: (opts: {
        messages: Array<{ role: string; content: string }>
        stream?: boolean
        temperature?: number
        max_tokens?: number
      }) => Promise<AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>>
    }
  }
  unload: () => Promise<void>
}

let enginePromise: Promise<Engine> | null = null
let loadedModelId: string | null = null

async function getEngine(
  modelId: string,
  onProgress: (p: number, text: string) => void,
): Promise<Engine> {
  if (enginePromise && loadedModelId === modelId) return enginePromise
  // If switching models, unload the old one first
  if (enginePromise) {
    try {
      const old = await enginePromise
      await old.unload()
    } catch {
      /* ignore */
    }
    enginePromise = null
  }

  const webllm = await import('@mlc-ai/web-llm')
  enginePromise = webllm
    .CreateMLCEngine(modelId, {
      initProgressCallback: (info: { progress: number; text: string }) => {
        onProgress(info.progress, info.text)
      },
    })
    .then((e: unknown) => e as Engine)
  loadedModelId = modelId
  return enginePromise
}

function checkWebGPU(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}

export default function AiPanel() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'ai',
      text: "Welcome to the jakob-52 AI deck. I run a real language model entirely in your browser — no server, no API. Click 'Load AI model' to download it once, then ask me anything.",
    },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)

  // model loading state
  const [webgpuOk] = useState(checkWebGPU)
  const [modelUnloaded, setModelUnloaded] = useState(true)
  const [loadingModel, setLoadingModel] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadText, setLoadText] = useState('')
  const [selectedModel, setSelectedModel] = useState(MODELS[0])

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  const loadModel = useCallback(async () => {
    setLoadingModel(true)
    setLoadProgress(0)
    setLoadText('Initializing WebGPU…')
    try {
      await getEngine(selectedModel.id, (p, text) => {
        setLoadProgress(Math.round(p * 100))
        setLoadText(text)
      })
      setModelUnloaded(false)
    } catch (err) {
      console.error('model load failed', err)
    } finally {
      setLoadingModel(false)
    }
  }, [selectedModel])

  const send = useCallback(
    async (text: string) => {
      const value = text.trim()
      if (!value || typing) return
      if (modelUnloaded) return

      setMessages((m) => [...m, { role: 'user', text: value }])
      setInput('')
      setTyping(true)

      // Build the conversation for the engine
      const conv = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
          .filter((m) => m.text !== messages[0].text) // skip the welcome message
          .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
        { role: 'user', content: value },
      ]

      try {
        const engine = await getEngine(selectedModel.id, () => {})
        const stream = await engine.chat.completions.create({
          messages: conv,
          stream: true,
          temperature: 0.7,
          max_tokens: 512,
        })

        let assistantText = ''
        // Add an empty AI message we'll fill as tokens stream in
        setMessages((m) => [...m, { role: 'ai', text: '' }])
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content || ''
          assistantText += delta
          // Update the last message progressively
          setMessages((m) => {
            const next = [...m]
            next[next.length - 1] = { role: 'ai', text: assistantText }
            return next
          })
        }
      } catch (err) {
        setMessages((m) => [
          ...m,
          { role: 'ai', text: `(error: ${(err as Error).message})` },
        ])
      } finally {
        setTyping(false)
      }
    },
    [messages, typing, modelUnloaded, selectedModel],
  )

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
          <p className="text-sm text-white/45">
            {modelUnloaded
              ? 'in-browser language model · no server'
              : `running ${selectedModel.label} locally`}
          </p>
        </div>
        {modelUnloaded ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full glass-subtle px-3 py-1 text-xs text-white/50">
            <Cpu className="h-3 w-3" />
            idle
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full glass-subtle px-3 py-1 text-xs text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]" />
            ready
          </span>
        )}
      </header>

      {/* Model load gate */}
      {modelUnloaded && (
        <div className="glass glass-sheen mb-4 rounded-3xl p-6">
          {!webgpuOk ? (
            <div className="flex items-start gap-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="font-semibold">WebGPU not available</p>
                <p className="mt-1 text-white/55">
                  The in-browser AI needs WebGPU, which is available in Chrome, Edge, and other Chromium browsers. Try opening this site in Chrome to use the AI.
                </p>
              </div>
            </div>
          ) : loadingModel ? (
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm text-white">
                <Loader2 className="h-4 w-4 animate-spin text-fuchsia-300" />
                <span className="font-medium">Loading {selectedModel.label}…</span>
                <span className="ml-auto font-mono tabular-nums text-fuchsia-200">
                  {loadProgress}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 transition-all"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
              <p className="mt-2 truncate text-[11px] text-white/40">{loadText}</p>
              <p className="mt-1 text-[11px] text-white/30">
                downloads once · cached for future visits
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center gap-2 text-sm text-white">
                <Cpu className="h-4 w-4 text-fuchsia-300" />
                <span className="font-medium">Load an AI model</span>
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModel(m)}
                    className={cn(
                      'rounded-2xl border p-3 text-left transition-all',
                      selectedModel.id === m.id
                        ? 'border-fuchsia-400/40 bg-fuchsia-500/10'
                        : 'border-white/8 bg-white/4 hover:bg-white/8',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">{m.label}</span>
                      <span className="text-[10px] text-white/40">{m.size}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-white/45">{m.desc}</p>
                  </button>
                ))}
              </div>
              <button
                onClick={loadModel}
                className="glass-sheen inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 px-5 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
              >
                <Zap className="h-4 w-4" />
                Load {selectedModel.label} ({selectedModel.size})
              </button>
              <p className="mt-2 text-center text-[11px] text-white/35">
                runs 100% in your browser · no data leaves your device
              </p>
            </div>
          )}
        </div>
      )}

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
      {modelUnloaded ? null : (
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
      )}

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
          placeholder={modelUnloaded ? 'load the model to start chatting…' : 'Message the AI…'}
          disabled={modelUnloaded || typing}
          className="glass-subtle flex-1 rounded-2xl border border-white/10 bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-fuchsia-400/40 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={modelUnloaded || typing || !input.trim()}
          className="glass-sheen grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 text-white transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {typing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
    </motion.div>
  )
}
