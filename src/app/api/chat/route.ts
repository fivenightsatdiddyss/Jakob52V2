import { NextRequest, NextResponse } from 'next/server'
import { getDeployStore, type Store } from '@netlify/blobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---- constants ----
const MAX_HISTORY = 50
const MAX_TEXT = 500
const MAX_USER = 24
const MAX_COLOR = 40
const MAX_AVATAR = 10000
const MAX_SESSION_ID = 64
const PRESENCE_TTL_MS = 15_000 // a session is "online" if seen in the last 15s
const TYPING_TTL_MS = 2_500 // typing indicator lives 2.5s unless refreshed

type ChatMsg = {
  id: string
  user: string
  text: string
  color: string
  avatar: string
  time: string // ISO string
  replyTo?: { id: string; user: string; text: string } | null
  reactions?: Record<string, string[]> // emoji -> [sessionId, ...]
}

type RosterEntry = {
  user: string
  color: string
  avatar: string
  lastSeen: number // epoch ms
  channel?: string // which channel this user is currently viewing
}

type TypingEntry = {
  user: string
  typingUntil: number // epoch ms
}

// ---- storage layer ----
// On Netlify, `process.env.NETLIFY` is set and `getDeployStore('chat')` returns
// a deploy-scoped Blob store backed by Netlify Blobs. In local `next dev`
// (no NETLIFY env, no Blobs context), we fall back to a module-level in-memory
// Map so the panel still works across browser tabs served by the same dev
// process.
let blobs: Store | null = null
try {
  // getDeployStore() reads the Netlify Blobs context from globalThis. It does
  // not throw when called outside Netlify, but reads/writes will fail, so we
  // gate the entire path on `process.env.NETLIFY` below.
  blobs = getDeployStore('chat')
} catch {
  blobs = null
}
const useBlobs = blobs !== null && !!process.env.NETLIFY

// Module-level in-memory fallback for local dev. Survives across HMR and
// across requests within the same `next dev` process, so two browser tabs
// hitting the same dev server share state.
const memStore = new Map<string, string>()

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  if (useBlobs && blobs) {
    try {
      const v = await blobs.get(key, { type: 'json' })
      return (v ?? fallback) as T
    } catch {
      return fallback
    }
  }
  const raw = memStore.get(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  if (useBlobs && blobs) {
    try {
      await blobs.setJSON(key, value)
    } catch {
      /* swallow — best-effort write */
    }
    return
  }
  memStore.set(key, JSON.stringify(value))
}

// ---- helpers ----
const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

const trim = (v: unknown, max: number): string => {
  const s = typeof v === 'string' ? v : String(v ?? '')
  return s.slice(0, max).trim()
}

const pruneRoster = (
  roster: Record<string, RosterEntry>,
  now: number,
): Record<string, RosterEntry> => {
  const out: Record<string, RosterEntry> = {}
  for (const [id, e] of Object.entries(roster)) {
    if (
      e &&
      typeof e.lastSeen === 'number' &&
      now - e.lastSeen < PRESENCE_TTL_MS
    ) {
      out[id] = e
    }
  }
  return out
}

const pruneTyping = (
  typing: Record<string, TypingEntry>,
  now: number,
): Record<string, TypingEntry> => {
  const out: Record<string, TypingEntry> = {}
  for (const [id, e] of Object.entries(typing)) {
    if (
      e &&
      typeof e.typingUntil === 'number' &&
      e.typingUntil > now
    ) {
      out[id] = e
    }
  }
  return out
}

const rosterToArray = (roster: Record<string, RosterEntry>) =>
  Object.entries(roster).map(([id, e]) => ({
    id,
    user: e.user,
    color: e.color,
    avatar: e.avatar,
  }))

const noStore = { 'cache-control': 'no-store' } as const

// ---- GET: poll for new messages + presence (per-channel) ----
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get('since') || ''
  const channel = (req.nextUrl.searchParams.get('channel') || 'general').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'general'
  const now = Date.now()

  const [messages, roster, typing] = await Promise.all([
    readJSON<ChatMsg[]>(`messages:${channel}`, []),
    readJSON<Record<string, RosterEntry>>('roster', {}),
    readJSON<Record<string, TypingEntry>>('typing', {}),
  ])

  const safeMessages = Array.isArray(messages) ? messages : []
  const safeRoster =
    roster && typeof roster === 'object' ? roster : {}
  const safeTyping =
    typing && typeof typing === 'object' ? typing : {}

  const prunedRoster = pruneRoster(safeRoster, now)
  const prunedTyping = pruneTyping(safeTyping, now)

  // best-effort prune-writeback so the store doesn't grow unbounded
  if (
    Object.keys(prunedRoster).length !== Object.keys(safeRoster).length
  ) {
    void writeJSON('roster', prunedRoster)
  }
  if (
    Object.keys(prunedTyping).length !== Object.keys(safeTyping).length
  ) {
    void writeJSON('typing', prunedTyping)
  }

  const online = Object.keys(prunedRoster).length
  const rosterArr = rosterToArray(prunedRoster)
  const typingArr = Object.entries(prunedTyping).map(([id, e]) => ({
    sessionId: id,
    user: e.user,
  }))

  // per-channel online counts — how many users are currently viewing each channel
  const channelCounts: Record<string, number> = {}
  for (const entry of Object.values(prunedRoster)) {
    const ch = entry.channel || 'general'
    channelCounts[ch] = (channelCounts[ch] || 0) + 1
  }

  let filtered = safeMessages
  if (since) {
    const sinceDate = new Date(since)
    if (!Number.isNaN(sinceDate.getTime())) {
      filtered = safeMessages.filter((m) => {
        try {
          return new Date(m.time) > sinceDate
        } catch {
          return true
        }
      })
    }
  }

  return NextResponse.json(
    {
      messages: filtered,
      online,
      roster: rosterArr,
      typing: typingArr,
      channelCounts,
    },
    { headers: noStore },
  )
}

// ---- POST: message / presence / typing ----
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid json' },
      { status: 400, headers: noStore },
    )
  }

  const op = (body as { op?: string } | null)?.op
  const now = Date.now()

  if (op === 'message') {
    const b = body as {
      user?: unknown
      text?: unknown
      color?: unknown
      avatar?: unknown
      channel?: unknown
      replyTo?: unknown
    }
    const text = trim(b.text, MAX_TEXT)
    const user = trim(b.user, MAX_USER) || 'anon'
    const color = trim(b.color, MAX_COLOR)
    const avatar = trim(b.avatar, MAX_AVATAR)
    const channel = (typeof b.channel === 'string' ? b.channel : 'general').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'general'
    if (!text) {
      return NextResponse.json(
        { ok: false, error: 'empty text' },
        { status: 400, headers: noStore },
      )
    }
    // replyTo: { id, user, text } — validate shape
    let replyTo: { id: string; user: string; text: string } | null = null
    if (b.replyTo && typeof b.replyTo === 'object') {
      const r = b.replyTo as { id?: unknown; user?: unknown; text?: unknown }
      if (typeof r.id === 'string' && typeof r.user === 'string') {
        replyTo = {
          id: r.id.slice(0, 64),
          user: r.user.slice(0, MAX_USER),
          text: trim(r.text, 200),
        }
      }
    }
    const msg: ChatMsg = {
      id: generateId(),
      user,
      text,
      color,
      avatar,
      time: new Date(now).toISOString(),
      replyTo,
    }
    const messages = await readJSON<ChatMsg[]>(`messages:${channel}`, [])
    const safeMessages = Array.isArray(messages) ? messages : []
    const next = [...safeMessages, msg].slice(-MAX_HISTORY)
    await writeJSON(`messages:${channel}`, next)
    return NextResponse.json(
      { ok: true, message: msg },
      { headers: noStore },
    )
  }

  // ---- react: toggle an emoji reaction on a message ----
  if (op === 'react') {
    const b = body as {
      messageId?: unknown
      sessionId?: unknown
      emoji?: unknown
      channel?: unknown
    }
    const messageId = trim(b.messageId, 64)
    const sessionId = trim(b.sessionId, MAX_SESSION_ID)
    const emoji = typeof b.emoji === 'string' ? b.emoji.slice(0, 10).trim() : ''
    const channel = (typeof b.channel === 'string' ? b.channel : 'general').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'general'
    if (!messageId || !sessionId || !emoji) {
      return NextResponse.json(
        { ok: false, error: 'missing messageId/sessionId/emoji' },
        { status: 400, headers: noStore },
      )
    }
    const messages = await readJSON<ChatMsg[]>(`messages:${channel}`, [])
    const safeMessages = Array.isArray(messages) ? messages : []
    const idx = safeMessages.findIndex((m) => m.id === messageId)
    if (idx < 0) {
      return NextResponse.json(
        { ok: false, error: 'message not found' },
        { status: 404, headers: noStore },
      )
    }
    const msg = safeMessages[idx]
    const reactions = msg.reactions ? { ...msg.reactions } : {}
    const list = reactions[emoji] ? [...reactions[emoji]] : []
    const i = list.indexOf(sessionId)
    if (i >= 0) list.splice(i, 1) // toggle off
    else list.push(sessionId) // toggle on
    if (list.length > 0) reactions[emoji] = list
    else delete reactions[emoji]
    msg.reactions = Object.keys(reactions).length > 0 ? reactions : undefined
    safeMessages[idx] = msg
    await writeJSON(`messages:${channel}`, safeMessages)
    return NextResponse.json(
      { ok: true, message: msg },
      { headers: noStore },
    )
  }

  if (op === 'presence') {
    const b = body as {
      sessionId?: unknown
      user?: unknown
      color?: unknown
      avatar?: unknown
      channel?: unknown
    }
    const sessionId = trim(b.sessionId, MAX_SESSION_ID)
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'missing sessionId' },
        { status: 400, headers: noStore },
      )
    }
    const user = trim(b.user, MAX_USER) || 'anon'
    const color = trim(b.color, MAX_COLOR)
    const avatar = trim(b.avatar, MAX_AVATAR)
    const channel = (typeof b.channel === 'string' ? b.channel : 'general').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'general'
    const roster = await readJSON<Record<string, RosterEntry>>(
      'roster',
      {},
    )
    const safeRoster =
      roster && typeof roster === 'object' ? roster : {}
    safeRoster[sessionId] = { user, color, avatar, lastSeen: now, channel }
    const pruned = pruneRoster(safeRoster, now)
    await writeJSON('roster', pruned)
    return NextResponse.json(
      {
        ok: true,
        online: Object.keys(pruned).length,
        roster: rosterToArray(pruned),
      },
      { headers: noStore },
    )
  }

  if (op === 'typing') {
    const b = body as {
      sessionId?: unknown
      user?: unknown
      typing?: unknown
    }
    const sessionId = trim(b.sessionId, MAX_SESSION_ID)
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'missing sessionId' },
        { status: 400, headers: noStore },
      )
    }
    const user = trim(b.user, MAX_USER) || 'anon'
    const isTyping = b.typing === true
    const typingMap = await readJSON<Record<string, TypingEntry>>(
      'typing',
      {},
    )
    const safeTyping =
      typingMap && typeof typingMap === 'object' ? typingMap : {}
    if (isTyping) {
      safeTyping[sessionId] = { user, typingUntil: now + TYPING_TTL_MS }
    } else {
      delete safeTyping[sessionId]
    }
    const pruned = pruneTyping(safeTyping, now)
    await writeJSON('typing', pruned)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }

  return NextResponse.json(
    { ok: false, error: 'unknown op' },
    { status: 400, headers: noStore },
  )
}
