import { NextRequest, NextResponse } from 'next/server'
import { getDeployStore, type Store } from '@netlify/blobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Facetime signaling store — backs public + private video rooms.
 *
 * WebRTC mesh topology: every peer connects directly to every other peer.
 * This route is the signaling channel (discovery + SDP offer/answer + ICE
 * candidate exchange). Media flows P2P once connected.
 *
 * Rooms:
 *  - Public room: roomId = 'public' (the default #facetime channel)
 *  - Private rooms: roomId = a 6-char code generated client-side, shared out-of-band
 *
 * Storage keys are namespaced by roomId so rooms are fully isolated.
 *  - peers:{roomId}    : Record<sessionId, { user, color, avatar, lastSeen }>
 *  - signals:{roomId}  : Signal[] (queue of undelivered signals addressed to specific peers)
 */

const PRESENCE_TTL_MS = 20_000
const SIGNAL_TTL_MS = 60_000
const MAX_USER = 24
const MAX_COLOR = 40
const MAX_AVATAR = 400
const MAX_SESSION_ID = 64
const MAX_ROOM_ID = 24
const MAX_SIGNALS = 500

let blobs: Store | null = null
try {
  blobs = getDeployStore('facetime')
} catch {
  blobs = null
}
const useBlobs = blobs !== null && !!process.env.NETLIFY

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
      /* best-effort */
    }
    return
  }
  memStore.set(key, JSON.stringify(value))
}

const trim = (v: unknown, max: number): string => {
  const s = typeof v === 'string' ? v : String(v ?? '')
  return s.slice(0, max).trim()
}

const sanitizeRoom = (v: unknown): string => {
  const s = typeof v === 'string' ? v : 'public'
  return s.replace(/[^a-z0-9-]/gi, '').slice(0, MAX_ROOM_ID).toLowerCase() || 'public'
}

type Peer = {
  user: string
  color: string
  avatar: string
  lastSeen: number
}

type Signal = {
  id: string
  from: string
  to: string
  type: 'offer' | 'answer' | 'ice'
  data: unknown
  t: number
}

const noStore = { 'cache-control': 'no-store' } as const

function prunePeers(peers: Record<string, Peer>, now: number): Record<string, Peer> {
  const out: Record<string, Peer> = {}
  for (const [id, p] of Object.entries(peers)) {
    if (p && typeof p.lastSeen === 'number' && now - p.lastSeen < PRESENCE_TTL_MS) {
      out[id] = p
    }
  }
  return out
}

function pruneSignals(signals: Signal[], now: number): Signal[] {
  return signals.filter((s) => s && typeof s.t === 'number' && now - s.t < SIGNAL_TTL_MS)
}

// ---- GET: poll for peers + signals addressed to me (in a room) ----
export async function GET(req: NextRequest) {
  const sessionId = (req.nextUrl.searchParams.get('sessionId') || '').slice(0, MAX_SESSION_ID)
  const roomId = sanitizeRoom(req.nextUrl.searchParams.get('room'))
  const now = Date.now()

  const [peers, signals] = await Promise.all([
    readJSON<Record<string, Peer>>(`peers:${roomId}`, {}),
    readJSON<Signal[]>(`signals:${roomId}`, []),
  ])

  const safePeers = peers && typeof peers === 'object' ? peers : {}
  const safeSignals = Array.isArray(signals) ? signals : []

  const prunedPeers = prunePeers(safePeers, now)
  const prunedSignals = pruneSignals(safeSignals, now)

  if (Object.keys(prunedPeers).length !== Object.keys(safePeers).length) {
    void writeJSON(`peers:${roomId}`, prunedPeers)
  }
  if (prunedSignals.length !== safeSignals.length) {
    void writeJSON(`signals:${roomId}`, prunedSignals)
  }

  // signals addressed to me; remove them from the queue so they aren't re-delivered
  const mySignals = prunedSignals.filter((s) => s.to === sessionId)
  if (mySignals.length > 0) {
    const remaining = prunedSignals.filter((s) => s.to !== sessionId)
    void writeJSON(`signals:${roomId}`, remaining)
  }

  const peersArr = Object.entries(prunedPeers).map(([id, p]) => ({
    id,
    user: p.user,
    color: p.color,
    avatar: p.avatar,
  }))

  return NextResponse.json(
    {
      peers: peersArr,
      signals: mySignals.map((s) => ({
        id: s.id,
        from: s.from,
        type: s.type,
        data: s.data,
      })),
    },
    { headers: noStore },
  )
}

// ---- POST: presence / leave / signal ----
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400, headers: noStore })
  }

  const op = (body as { op?: string } | null)?.op
  const now = Date.now()

  if (op === 'presence') {
    const b = body as {
      sessionId?: unknown
      room?: unknown
      user?: unknown
      color?: unknown
      avatar?: unknown
    }
    const sessionId = trim(b.sessionId, MAX_SESSION_ID)
    const roomId = sanitizeRoom(b.room)
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'missing sessionId' }, { status: 400, headers: noStore })
    }
    const user = trim(b.user, MAX_USER) || 'anon'
    const color = trim(b.color, MAX_COLOR)
    const avatar = trim(b.avatar, MAX_AVATAR)
    const peers = await readJSON<Record<string, Peer>>(`peers:${roomId}`, {})
    const safePeers = peers && typeof peers === 'object' ? peers : {}
    safePeers[sessionId] = { user, color, avatar, lastSeen: now }
    const pruned = prunePeers(safePeers, now)
    await writeJSON(`peers:${roomId}`, pruned)
    return NextResponse.json({ ok: true, room: roomId, peers: Object.keys(pruned).length }, { headers: noStore })
  }

  if (op === 'leave') {
    const b = body as { sessionId?: unknown; room?: unknown }
    const sessionId = trim(b.sessionId, MAX_SESSION_ID)
    const roomId = sanitizeRoom(b.room)
    if (sessionId) {
      const peers = await readJSON<Record<string, Peer>>(`peers:${roomId}`, {})
      const safePeers = peers && typeof peers === 'object' ? peers : {}
      delete safePeers[sessionId]
      const signals = await readJSON<Signal[]>(`signals:${roomId}`, [])
      const safeSignals = Array.isArray(signals) ? signals : []
      const remaining = safeSignals.filter((s) => s.from !== sessionId)
      await writeJSON(`peers:${roomId}`, safePeers)
      await writeJSON(`signals:${roomId}`, remaining)
    }
    return NextResponse.json({ ok: true }, { headers: noStore })
  }

  if (op === 'signal') {
    const b = body as {
      from?: unknown
      to?: unknown
      room?: unknown
      type?: unknown
      data?: unknown
    }
    const from = trim(b.from, MAX_SESSION_ID)
    const to = trim(b.to, MAX_SESSION_ID)
    const roomId = sanitizeRoom(b.room)
    const type = b.type === 'offer' || b.type === 'answer' || b.type === 'ice' ? b.type : null
    if (!from || !to || !type) {
      return NextResponse.json({ ok: false, error: 'missing from/to/type' }, { status: 400, headers: noStore })
    }
    const sig: Signal = {
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      from,
      to,
      type,
      data: b.data,
      t: now,
    }
    const signals = await readJSON<Signal[]>(`signals:${roomId}`, [])
    const safeSignals = Array.isArray(signals) ? signals : []
    const pruned = pruneSignals([...safeSignals, sig], now)
    const capped = pruned.slice(-MAX_SIGNALS)
    await writeJSON(`signals:${roomId}`, capped)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }

  return NextResponse.json({ ok: false, error: 'unknown op' }, { status: 400, headers: noStore })
}
