import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * AI chat API — combines Keenable web search with Requesty LLM.
 *
 * Flow:
 * 1. If the user's question seems to need current/web info, search via Keenable
 * 2. Send the conversation + search results to Requesty LLM
 * 3. Return the LLM's answer
 *
 * Falls back gracefully if either API is unavailable.
 */

const REQUESTY_URL = 'https://router.requesty.ai/v1/chat/completions'
const KEENABLE_URL = 'https://api.keenable.ai/v1/search'
const MODEL = 'google/gemma-4-31b-it'
const SYSTEM_PROMPT =
  'You are the jakob-52 AI assistant. You live behind a liquid-glass interface orbiting a black hole. Answer concisely and helpfully. Keep responses under ~200 words unless asked for more. If web search results are provided, use them to answer the question.'

/** Detect if a question might need web search */
function needsWebSearch(text: string): boolean {
  const lower = text.toLowerCase()
  const triggers = [
    'latest', 'recent', 'news', 'today', 'current', '2024', '2025', '2026',
    'weather', 'price', 'score', 'happening', 'update', 'who won', 'who is',
    'what is the', 'how much', 'stock', 'release date', 'when did', 'when will',
  ]
  return triggers.some((t) => lower.includes(t))
}

/** Search the web via Keenable */
async function webSearch(query: string): Promise<string> {
  const key = process.env.KEENABLE_API_KEY
  if (!key) return ''
  try {
    const res = await fetch(KEENABLE_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    if (!data.results || !Array.isArray(data.results)) return ''
    const results = data.results.slice(0, 3).map((r: { title?: string; url?: string; snippet?: string }) =>
      `[${r.title || 'Untitled'}](${r.url || ''}): ${r.snippet || ''}`,
    ).join('\n')
    return results ? `\n\nWeb search results for "${query}":\n${results}` : ''
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const { messages } = body as { messages?: Array<{ role: string; content: string }> }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'missing messages' }, { status: 400 })
  }

  const apiKey = process.env.REQUESTY_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      text: 'AI is not configured. The admin needs to set the REQUESTY_API_KEY environment variable on the hosting provider (Netlify → Site settings → Environment variables).',
    })
  }

  try {
    const lastMessage = messages[messages.length - 1]
    const userQuery = lastMessage?.content || ''

    // Optionally search the web for current info
    let searchContext = ''
    if (needsWebSearch(userQuery)) {
      searchContext = await webSearch(userQuery)
    }

    const systemContent = searchContext
      ? `${SYSTEM_PROMPT}\n${searchContext}`
      : SYSTEM_PROMPT

    const conv = [
      { role: 'system', content: systemContent },
      ...messages.map((m) => ({
        role: m.role === 'ai' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
        content: m.content,
      })),
    ]

    const res = await fetch(REQUESTY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: conv,
        temperature: 0.7,
        max_tokens: 512,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Requesty error:', res.status, errText)
      return NextResponse.json(
        { error: `AI request failed (${res.status})` },
        { status: 502 },
      )
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || '(no response)'

    return NextResponse.json({ text: content })
  } catch (err) {
    console.error('AI error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI failed' },
      { status: 500 },
    )
  }
}
