import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * AI chat API — uses the Requesty API (OpenAI-compatible).
 * The API key is stored in .env as REQUESTY_API_KEY (never committed).
 * Model: google/gemma-4-31b-it
 */

const REQUESTY_URL = 'https://router.requesty.ai/v1/chat/completions'
const MODEL = 'google/gemma-4-31b-it'
const SYSTEM_PROMPT =
  'You are the jakob-52 AI assistant. You live behind a liquid-glass interface orbiting a black hole. Answer concisely and helpfully. Keep responses under ~200 words unless asked for more.'

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
    return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 })
  }

  try {
    const conv = [
      { role: 'system', content: SYSTEM_PROMPT },
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
