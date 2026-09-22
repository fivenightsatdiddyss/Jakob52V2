import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * AI chat API — uses the z-ai-web-dev-sdk LLM (server-side).
 * No 3rd-party API key needed — the SDK handles auth.
 * Returns the full response (non-streaming for reliability).
 */

const SYSTEM_PROMPT =
  'You are the jakob-52 AI assistant. You live behind a liquid-glass interface orbiting a black hole. Answer concisely and helpfully. Keep responses under ~200 words unless asked for more.'

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
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

  try {
    const zai = await getZAI()

    const conv = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role === 'ai' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
        content: m.content,
      })),
    ]

    const response = await zai.chat.completions.create({
      messages: conv,
      stream: false,
      temperature: 0.7,
      max_tokens: 512,
    })

    const content = response.choices?.[0]?.message?.content || '(no response)'

    return NextResponse.json({ text: content })
  } catch (err) {
    console.error('AI error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI failed' },
      { status: 500 },
    )
  }
}
