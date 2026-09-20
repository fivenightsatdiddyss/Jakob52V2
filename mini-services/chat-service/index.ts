import { createServer } from 'http'
import { Server } from 'socket.io'

// ---- constants ----
const PORT = 3003 // FIXED port — do not use process.env.PORT
const MAX_HISTORY = 50
const MAX_TEXT = 500
const MAX_USER = 24
const MAX_COLOR = 40
const MAX_AVATAR = 400
const TYPING_TIMEOUT_MS = 2500

type ChatMsg = {
  id: string
  user: string
  text: string
  color: string
  avatar: string
  time: string
}

type Profile = {
  id: string // socket id, server-assigned
  user: string
  color: string
  avatar: string
}

type RosterPayload = Profile[]

type PresencePayload = { online: number }

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

const trim = (v: unknown, max: number): string => {
  const s = typeof v === 'string' ? v : String(v ?? '')
  return s.slice(0, max).trim()
}

const httpServer = createServer((req, res) => {
  // tiny health-check endpoint so anyone can ping the relay
  if (req.url && req.url.startsWith('/health')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        online: io.engine.clientsCount,
        history: history.length,
        profiles: profiles.size,
      }),
    )
    return
  }
  res.writeHead(404)
  res.end('not found')
})

const io = new Server(httpServer, {
  // DO NOT change the path — the gateway uses path `/` to route
  path: '/',
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ---- in-memory store ----
const history: ChatMsg[] = []
// per-socket profile of connected users (id = socket.id)
const profiles = new Map<string, Profile>()
// per-socket typing state, so we can broadcast "stop" once on disconnect
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()

const presence = (): PresencePayload => ({ online: io.engine.clientsCount })

const broadcastPresence = () => {
  io.emit('presence', presence())
}

const roster = (): RosterPayload => Array.from(profiles.values())

const broadcastRoster = () => {
  io.emit('roster', roster())
}

io.on('connection', (socket) => {
  console.log(`[chat] connect ${socket.id} — online=${io.engine.clientsCount}`)

  // 1. greet the joining client with current presence + recent history + roster
  socket.emit('presence', presence())
  socket.emit('history', history.slice(-MAX_HISTORY))
  socket.emit('roster', roster())

  // 2. broadcast updated presence to everyone
  broadcastPresence()

  // 3. handle profile updates (sent on connect + whenever profile changes)
  socket.on('profile', (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return
    const r = raw as { user?: unknown; color?: unknown; avatar?: unknown }

    const user = trim(r.user, MAX_USER) || 'anonymous'
    const color = trim(r.color, MAX_COLOR) || 'text-white'
    const avatar = trim(r.avatar, MAX_AVATAR) || 'preset:0'

    profiles.set(socket.id, { id: socket.id, user, color, avatar })
    broadcastRoster()
  })

  // 4. handle incoming messages
  socket.on('message', (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return
    const r = raw as {
      user?: unknown
      text?: unknown
      color?: unknown
      avatar?: unknown
    }

    const text = trim(r.text, MAX_TEXT)
    const user = trim(r.user, MAX_USER) || 'anonymous'
    const color = trim(r.color, MAX_COLOR) || 'text-white'
    const avatar = trim(r.avatar, MAX_AVATAR) || 'preset:0'

    if (!text) return

    const msg: ChatMsg = {
      id: generateId(),
      user,
      text,
      color,
      avatar,
      time: new Date().toISOString(),
    }

    history.push(msg)
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY)
    }

    // broadcast to ALL clients (including sender) so everyone sees the same flow
    io.emit('message', msg)
  })

  // 5. typing indicator (optional nicety)
  socket.on('typing', (raw: unknown) => {
    const user = trim(raw, MAX_USER)
    if (!user) return

    // clear any existing timer for this socket
    const prev = typingTimers.get(socket.id)
    if (prev) clearTimeout(prev)

    io.emit('typing', { user, typing: true })

    const timer = setTimeout(() => {
      io.emit('typing', { user, typing: false })
      typingTimers.delete(socket.id)
    }, TYPING_TIMEOUT_MS)
    typingTimers.set(socket.id, timer)
  })

  // 6. disconnect → recompute presence + clean typing + drop profile + roster
  socket.on('disconnect', () => {
    console.log(`[chat] disconnect ${socket.id} — online=${io.engine.clientsCount}`)
    const prev = typingTimers.get(socket.id)
    if (prev) {
      clearTimeout(prev)
      typingTimers.delete(socket.id)
    }
    // try to find the user for a graceful "stop typing" broadcast
    const leavingProfile = profiles.get(socket.id)
    if (leavingProfile) {
      io.emit('typing', { user: leavingProfile.user, typing: false })
    }
    profiles.delete(socket.id)
    broadcastRoster()
    broadcastPresence()
  })

  socket.on('error', (err) => {
    console.error(`[chat] socket error ${socket.id}:`, err)
  })
})

httpServer.listen(PORT, () => {
  console.log(`chat-service listening on :${PORT}`)
})
