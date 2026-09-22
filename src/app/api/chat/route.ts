import { NextRequest, NextResponse } from 'next/server'
import { getDeployStore, type Store } from '@netlify/blobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---- constants ----
const MAX_HISTORY = 50
const MAX_TEXT = 500
const MAX_IMAGE = 50000 // data URL for images (larger than text)
const MAX_USER = 24
const MAX_COLOR = 40
const MAX_AVATAR = 10000
const MAX_SESSION_ID = 64
const PRESENCE_TTL_MS = 15_000 // a session is "online" if seen in the last 15s
const TYPING_TTL_MS = 2_500 // typing indicator lives 2.5s unless refreshed
const ADMIN_PASSWORD = 'HJAK32'
const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const ADMIN_RATE_LIMIT = 10 // max admin actions per minute
const ADMIN_RATE_WINDOW = 60 * 1000

type ChatMsg = {
  id: string
  user: string
  text: string
  color: string
  avatar: string
  time: string // ISO string
  replyTo?: { id: string; user: string; text: string } | null
  reactions?: Record<string, string[]> // emoji -> [sessionId, ...]
  image?: string | null // data URL for image messages
  deleted?: boolean // soft-delete flag (admin)
}

type RosterEntry = {
  user: string
  color: string
  avatar: string
  lastSeen: number // epoch ms
  channel?: string // which channel this user is currently viewing
  isAdmin?: boolean
  timeoutUntil?: number // epoch ms — user can't send messages until this time
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
    isAdmin: e.isAdmin || false,
    timeoutUntil: e.timeoutUntil || 0,
    channel: e.channel || 'general',
  }))

const noStore = { 'cache-control': 'no-store' } as const

// admin rate limiting — in-memory per session
const adminActions = new Map<string, number[]>() // sessionId -> [timestamps]

// WebRTC signal type — for facetime/voicechat peer connections
type WebRtcSignal = {
  id: string
  from: string
  to: string
  type: 'offer' | 'answer' | 'ice'
  data: unknown
  t: number
}

// ---- GET: poll for new messages + presence + WebRTC signals (per-channel) ----
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get('since') || ''
  const channel = (req.nextUrl.searchParams.get('channel') || 'general').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'general'
  const sessionId = (req.nextUrl.searchParams.get('sessionId') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  const now = Date.now()

  // Read messages, roster, typing, AND WebRTC signals (if sessionId provided)
  const reads: Promise<unknown>[] = [
    readJSON<ChatMsg[]>(`messages:${channel}`, []),
    readJSON<Record<string, RosterEntry>>('roster', {}),
    readJSON<Record<string, TypingEntry>>('typing', {}),
  ]
  if (sessionId) {
    reads.push(readJSON<WebRtcSignal[]>(`rtc:${sessionId}`, []))
  }

  const [messages, roster, typing, mySignals] = await Promise.all(reads) as [
    ChatMsg[],
    Record<string, RosterEntry>,
    Record<string, TypingEntry>,
    WebRtcSignal[] | null,
  ]

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

  // Process + clear WebRTC signals addressed to this session (for facetime/voicechat)
  let rtcSignals: Array<{ id: string; from: string; type: string; data: unknown }> = []
  if (sessionId && mySignals && Array.isArray(mySignals) && mySignals.length > 0) {
    const now_ms = Date.now()
    rtcSignals = mySignals
      .filter((s) => s && typeof s.t === 'number' && now_ms - s.t < 60_000)
      .map((s) => ({ id: s.id, from: s.from, type: s.type, data: s.data }))
    // clear the queue (signals are consumed)
    void writeJSON(`rtc:${sessionId}`, [])
  }

  return NextResponse.json(
    {
      messages: filtered,
      online,
      roster: rosterArr,
      typing: typingArr,
      channelCounts,
      rtcSignals,
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
      sessionId?: unknown
      user?: unknown
      text?: unknown
      color?: unknown
      avatar?: unknown
      channel?: unknown
      replyTo?: unknown
      image?: unknown
    }
    const sessionId = trim(b.sessionId, MAX_SESSION_ID)
    const text = trim(b.text, MAX_TEXT)
    const user = trim(b.user, MAX_USER) || 'anon'
    const color = trim(b.color, MAX_COLOR)
    const avatar = trim(b.avatar, MAX_AVATAR)
    const channel = (typeof b.channel === 'string' ? b.channel : 'general').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'general'
    const image = typeof b.image === 'string' ? b.image.slice(0, MAX_IMAGE) : ''
    if (!text && !image) {
      return NextResponse.json(
        { ok: false, error: 'empty message' },
        { status: 400, headers: noStore },
      )
    }
    // timeout enforcement — check if the sender is timed out
    if (sessionId) {
      const roster = await readJSON<Record<string, RosterEntry>>('roster', {})
      const entry = roster[sessionId]
      if (entry?.timeoutUntil && entry.timeoutUntil > now) {
        const remaining = Math.ceil((entry.timeoutUntil - now) / 1000)
        return NextResponse.json(
          { ok: false, error: `You are timed out for ${remaining}s more.` },
          { status: 403, headers: noStore },
        )
      }
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
      image: image || null,
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

  // ---- admin: unlock with password ----
  if (op === 'adminUnlock') {
    const b = body as { sessionId?: unknown; password?: unknown }
    const sessionId = trim(b.sessionId, MAX_SESSION_ID)
    const password = trim(b.password, 100)
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'missing sessionId' }, { status: 400, headers: noStore })
    }
    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: 'wrong password' }, { status: 403, headers: noStore })
    }
    const roster = await readJSON<Record<string, RosterEntry>>('roster', {})
    const safeRoster = roster && typeof roster === 'object' ? roster : {}
    if (safeRoster[sessionId]) {
      safeRoster[sessionId].isAdmin = true
      await writeJSON('roster', safeRoster)
    }
    return NextResponse.json({ ok: true }, { headers: noStore })
  }

  // ---- admin: timeout a user (5 min) ----
  if (op === 'timeout') {
    const b = body as { sessionId?: unknown; targetSessionId?: unknown }
    const sessionId = trim(b.sessionId, MAX_SESSION_ID)
    const targetId = trim(b.targetSessionId, MAX_SESSION_ID)
    if (!sessionId || !targetId) {
      return NextResponse.json({ ok: false, error: 'missing sessionId' }, { status: 400, headers: noStore })
    }
    // verify caller is admin
    const roster = await readJSON<Record<string, RosterEntry>>('roster', {})
    if (!roster[sessionId]?.isAdmin) {
      return NextResponse.json({ ok: false, error: 'not admin' }, { status: 403, headers: noStore })
    }
    // rate limit
    const actions = adminActions.get(sessionId) || []
    const recent = actions.filter((t) => now - t < ADMIN_RATE_WINDOW)
    if (recent.length >= ADMIN_RATE_LIMIT) {
      return NextResponse.json({ ok: false, error: 'rate limited — too many admin actions' }, { status: 429, headers: noStore })
    }
    recent.push(now)
    adminActions.set(sessionId, recent)
    // set timeout
    if (roster[targetId]) {
      roster[targetId].timeoutUntil = now + TIMEOUT_MS
      await writeJSON('roster', roster)
    }
    return NextResponse.json({ ok: true }, { headers: noStore })
  }

  // ---- admin: delete a message (soft-delete, server-side) ----
  if (op === 'deleteMessage') {
    const b = body as { sessionId?: unknown; messageId?: unknown; channel?: unknown }
    const sessionId = trim(b.sessionId, MAX_SESSION_ID)
    const messageId = trim(b.messageId, 64)
    const channel = (typeof b.channel === 'string' ? b.channel : 'general').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'general'
    if (!sessionId || !messageId) {
      return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400, headers: noStore })
    }
    const roster = await readJSON<Record<string, RosterEntry>>('roster', {})
    if (!roster[sessionId]?.isAdmin) {
      return NextResponse.json({ ok: false, error: 'not admin' }, { status: 403, headers: noStore })
    }
    // rate limit
    const actions = adminActions.get(sessionId) || []
    const recent = actions.filter((t) => now - t < ADMIN_RATE_WINDOW)
    if (recent.length >= ADMIN_RATE_LIMIT) {
      return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429, headers: noStore })
    }
    recent.push(now)
    adminActions.set(sessionId, recent)
    // soft-delete
    const messages = await readJSON<ChatMsg[]>(`messages:${channel}`, [])
    const safeMessages = Array.isArray(messages) ? messages : []
    const idx = safeMessages.findIndex((m) => m.id === messageId)
    if (idx >= 0) {
      safeMessages[idx] = { ...safeMessages[idx], deleted: true, text: '', image: null }
      await writeJSON(`messages:${channel}`, safeMessages)
    }
    return NextResponse.json({ ok: true }, { headers: noStore })
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

  // ---- WebRTC signal: send an offer/answer/ICE to a specific peer ----
  // Used by facetime + voicechat for peer-to-peer connection setup.
  // The signal is stored in the RECIPIENT's queue (rtc:{recipientSessionId}).
  if (op === 'rtcSignal') {
    const b = body as {
      from?: unknown
      to?: unknown
      type?: unknown
      data?: unknown
    }
    const from = (typeof b.from === 'string' ? b.from : '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
    const to = (typeof b.to === 'string' ? b.to : '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
    const type = b.type === 'offer' || b.type === 'answer' || b.type === 'ice' ? b.type : null
    if (!from || !to || !type) {
      return NextResponse.json({ ok: false, error: 'missing from/to/type' }, { status: 400, headers: noStore })
    }
    const sig: WebRtcSignal = {
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      from,
      to,
      type,
      data: b.data,
      t: now,
    }
    // write to the recipient's signal queue
    const queue = await readJSON<WebRtcSignal[]>(`rtc:${to}`, [])
    const safeQueue = Array.isArray(queue) ? queue : []
    const next = [...safeQueue, sig].slice(-50) // cap at 50 signals
    await writeJSON(`rtc:${to}`, next)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }

  return NextResponse.json(
    { ok: false, error: 'unknown op' },
    { status: 400, headers: noStore },
  )
}
