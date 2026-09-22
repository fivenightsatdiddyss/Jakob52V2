'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessagesSquare,
  Send,
  Hash,
  Circle,
  Radio,
  Pencil,
  X,
  Upload,
  Sparkles,
  Smile,
  Image as ImageIcon,
  Check,
  Users,
  Video,
  CornerUpLeft,
  SmilePlus,
  Plus,
  Lock,
  Mic,
  Shield,
  Ban,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import FacetimeRoom from './facetime-room'
import VoicechatRoom from './voicechat-room'

type ChatMsg = {
  id: string
  user: string
  text: string
  color: string
  avatar: string
  time: string
  replyTo?: { id: string; user: string; text: string } | null
  reactions?: Record<string, string[]> // emoji -> [sessionId, ...]
  image?: string | null // data URL for image messages
  deleted?: boolean // soft-delete flag (admin)
}

type Profile = {
  name: string
  color: string
  avatar: string
}

type RosterEntry = {
  id: string
  user: string
  color: string
  avatar: string
  isAdmin?: boolean
  timeoutUntil?: number
}

type TypingEntry = {
  sessionId: string
  user: string
}

type PollResponse = {
  messages?: ChatMsg[]
  online?: number
  roster?: RosterEntry[]
  typing?: TypingEntry[]
  channelCounts?: Record<string, number>
}

// Channel list — general + random are live text channels; facetime is the
// public video room (renders the FacetimeRoom component instead of text).
const CHANNELS = [
  { id: 'general', name: 'general', topic: 'the live relay — open to all drifters', live: true, kind: 'text' as const },
  { id: 'random', name: 'random', topic: 'off-topic chaos', live: true, kind: 'text' as const },
  { id: 'voicechat', name: 'voicechat', topic: 'public audio room — talk with your voice', live: true, kind: 'voice' as const },
  { id: 'facetime', name: 'facetime', topic: 'public video room — camera + mic', live: true, kind: 'video' as const },
]

const QUICK = ['nice', 'lol', '+1', 'on it', '✦']

// Discord-style quick reactions
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🎉', '👎']

const COLORS = [
  'text-fuchsia-300',
  'text-sky-300',
  'text-amber-300',
  'text-emerald-300',
  'text-rose-300',
  'text-violet-300',
  'text-cyan-300',
  'text-orange-300',
]

// 8 gradient presets — avatar stored as "preset:N"
const PRESET_GRADIENTS = [
  'from-fuchsia-500 to-violet-600',
  'from-rose-500 to-orange-500',
  'from-sky-500 to-cyan-400',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-yellow-500',
  'from-pink-500 to-rose-600',
  'from-cyan-500 to-blue-500',
  'from-violet-500 to-purple-600',
]

const EMOJIS = [
  '👾', '🦊', '🐙', '🦄', '🐲', '🌟',
  '🌌', '🚀', '🔮', '🎇', '🪐', '🤖',
  '🎉', '🍕', '🎮', '🎧', '📚', '⚡',
  '🔥', '💧', '🌈', '🐱', '🦉', '🐳',
]

const LS_KEY = 'jakob52-chat-profile'
const SESSION_KEY = 'jakob52-chat-session'
const AVATAR_MAX = 10000 // chars — enough for a 64x64 JPEG data URL
const POLL_INTERVAL_MS = 1500
const PRESENCE_KEEPALIVE_MS = 10_000
const TYPING_THROTTLE_MS = 1000
const TYPING_CLIENT_TIMEOUT_MS = 3500
const CONNECT_STALE_MS = 5000
const OPTIMISTIC_PREFIX = 'local-'

const randomGuest = () => {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `guest-${n}`
}

const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]

const defaultProfile = (): Profile => ({
  name: '',
  color: pickColor(),
  avatar: 'preset:0',
})

const formatTime = (iso: string) => {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 'now'
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return 'now'
  }
}

const initialOf = (name: string) =>
  (name || '?').trim().slice(0, 1).toUpperCase() || '?'

// ---- avatar rendering helpers ----
const isUrl = (s: string) => s.startsWith('data:') || s.startsWith('http')

const isEmoji = (s: string) => s.length > 0 && s.length <= 4 && !isUrl(s)

const presetGradient = (avatar: string) => {
  const idx = Number.parseInt(avatar.slice('preset:'.length), 10)
  const safe = Number.isFinite(idx) ? idx : 0
  return PRESET_GRADIENTS[((safe % PRESET_GRADIENTS.length) + PRESET_GRADIENTS.length) % PRESET_GRADIENTS.length]
}

// Renders an avatar circle based on the avatar encoding.
// size: 'sm' (28px sidebar/roster) | 'md' (36px messages) | 'lg' (48px editor preview)
function Avatar({
  avatar,
  name,
  size = 'md',
  className,
}: {
  avatar: string
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const dims =
    size === 'sm'
      ? 'h-7 w-7 text-xs'
      : size === 'lg'
        ? 'h-12 w-12 text-base'
        : 'h-9 w-9 text-sm'
  const initial = initialOf(name)

  if (avatar.startsWith('preset:')) {
    return (
      <div
        className={cn(
          'grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white shadow-inner',
          dims,
          presetGradient(avatar),
          className,
        )}
      >
        {initial}
      </div>
    )
  }

  if (isUrl(avatar)) {
    return (
      <img
        src={avatar}
        alt={name ? `${name} avatar` : 'avatar'}
        className={cn('shrink-0 rounded-full object-cover', dims, className)}
      />
    )
  }

  if (isEmoji(avatar)) {
    return (
      <div
        className={cn(
          'grid shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15',
          dims,
          className,
        )}
      >
        <span
          className={cn(
            'leading-none',
            size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg',
          )}
        >
          {avatar}
        </span>
      </div>
    )
  }

  // fallback → initial in a plain circle
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-white/10 font-bold text-white/80 ring-1 ring-inset ring-white/15',
        dims,
        className,
      )}
    >
      {initial}
    </div>
  )
}

// Downscale an image file to a small data URL (≤ AVATAR_MAX chars).
// Tries progressively smaller sizes / lower qualities until it fits.
const downscaleToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('not an image'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        const minDim = Math.min(img.width, img.height) || 1
        const sx = (img.width - minDim) / 2
        const sy = (img.height - minDim) / 2
        const sizes = [96, 72, 56, 48]
        const qualities = [0.8, 0.6, 0.4]
        for (const size of sizes) {
          for (const q of qualities) {
            const canvas = document.createElement('canvas')
            canvas.width = size
            canvas.height = size
            const ctx = canvas.getContext('2d')
            if (!ctx) continue
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)
            const url = canvas.toDataURL('image/jpeg', q)
            if (url.length <= AVATAR_MAX) {
              resolve(url)
              return
            }
          }
        }
        reject(new Error('too large'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })

export default function ChatPanel() {
  // profile — starts as a default; loaded from localStorage (or generated) on mount
  const [profile, setProfile] = useState<Profile>(defaultProfile)
  const [profileLoaded, setProfileLoaded] = useState(false)
  // keep a ref so polling/keepalive callbacks always see the latest profile
  const profileRef = useRef<Profile>(profile)
  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  // chat state — updated from poll responses (external subscription)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [online, setOnline] = useState(0)
  const [connected, setConnected] = useState(false)
  const [input, setInput] = useState('')
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>({})

  // profile editor modal state
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState('')
  const [draftAvatar, setDraftAvatar] = useState('')
  const [avatarMode, setAvatarMode] = useState<'preset' | 'emoji' | 'upload'>('preset')
  const [uploading, setUploading] = useState(false)

  // active channel — general + random are text; facetime is the video room
  const [activeChannel, setActiveChannel] = useState<string>('general')
  const activeChannelRef = useRef<string>('general')
  useEffect(() => {
    activeChannelRef.current = activeChannel
  }, [activeChannel])

  // private channels (text rooms joined by code) — persisted per-session
  const [privateRooms, setPrivateRooms] = useState<string[]>([])
  const [showRoomDialog, setShowRoomDialog] = useState(false)
  const [roomInput, setRoomInput] = useState('')
  // private facetime room (null = public)
  const [facetimeRoom, setFacetimeRoom] = useState<string>('public')

  // reply state — when set, shows a preview bar + sends with replyTo
  const [replyingTo, setReplyingTo] = useState<ChatMsg | null>(null)
  // reaction picker — which message's emoji picker is open
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null)
  // admin state
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminUnlock, setShowAdminUnlock] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  // image attachment (preview before sending)
  const [pendingImage, setPendingImage] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string>('')
  const lastMessageTimeRef = useRef<string>('')
  const lastPollSuccessRef = useRef<number>(0)
  const lastPresenceRef = useRef<number>(0)
  const typingThrottleRef = useRef<number>(0)
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef<boolean>(true)

  // ---- POST helper (best-effort, fire-and-forget) ----
  const postChat = (body: Record<string, unknown>) => {
    if (!mountedRef.current) return
    void fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      /* swallow — polling will reconcile */
    })
  }

  const sendPresence = (p: Profile) => {
    const sid = sessionIdRef.current
    if (!sid || !p.name) return
    postChat({
      op: 'presence',
      sessionId: sid,
      user: p.name,
      color: p.color,
      avatar: p.avatar,
      channel: activeChannelRef.current,
    })
    lastPresenceRef.current = Date.now()
  }

  // ---- load profile + session on mount, start polling ----
  useEffect(() => {
    if (typeof window === 'undefined') return
    mountedRef.current = true

    // load profile from localStorage (or generate a fresh guest)
    let loaded: Profile | null = null
    try {
      const raw = window.localStorage.getItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Profile>
        if (parsed && typeof parsed === 'object') {
          loaded = {
            name:
              typeof parsed.name === 'string'
                ? parsed.name.slice(0, 24).trim() || randomGuest()
                : randomGuest(),
            color:
              typeof parsed.color === 'string' && parsed.color
                ? parsed.color.slice(0, 40)
                : pickColor(),
            avatar:
              typeof parsed.avatar === 'string' && parsed.avatar
                ? parsed.avatar.slice(0, AVATAR_MAX)
                : 'preset:0',
          }
        }
      }
    } catch {
      loaded = null
    }
    if (!loaded) {
      loaded = { name: randomGuest(), color: pickColor(), avatar: 'preset:0' }
    }
    setProfile(loaded)
    profileRef.current = loaded
    setProfileLoaded(true)

    // stable session id — persists across refresh within the same browser tab
    let sid = ''
    try {
      sid = window.sessionStorage.getItem(SESSION_KEY) || ''
      if (!sid) {
        sid = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
        window.sessionStorage.setItem(SESSION_KEY, sid)
      }
    } catch {
      sid = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }
    sessionIdRef.current = sid

    // initial presence so the roster sees us immediately
    sendPresence(loaded)

    // ---- polling loop ----
    const poll = async () => {
      if (!mountedRef.current) return
      const sid2 = sessionIdRef.current
      const p = profileRef.current
      const since = lastMessageTimeRef.current
      try {
        const url = `/api/chat?since=${encodeURIComponent(since)}&channel=${encodeURIComponent(activeChannelRef.current)}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(`http ${res.status}`)
        const data = (await res.json()) as PollResponse
        if (!mountedRef.current) return
        lastPollSuccessRef.current = Date.now()
        setConnected(true)

        // merge messages — dedupe by id; replace optimistic local messages
        const newMsgs = Array.isArray(data.messages) ? data.messages : []
        if (newMsgs.length > 0) {
          setMessages((prev) => {
            const result = [...prev]
            for (const server of newMsgs) {
              if (result.some((m) => m.id === server.id)) continue
              const serverT = new Date(server.time).getTime()
              const localIdx = result.findIndex(
                (m) =>
                  m.id.startsWith(OPTIMISTIC_PREFIX) &&
                  m.user === server.user &&
                  m.text === server.text &&
                  Math.abs(new Date(m.time).getTime() - serverT) < 5000,
              )
              if (localIdx >= 0) result[localIdx] = server
              else result.push(server)
            }
            const latest = result[result.length - 1]
            if (latest) {
              const latestT = new Date(latest.time).getTime()
              const curT = new Date(lastMessageTimeRef.current).getTime()
              if (Number.isNaN(curT) || latestT > curT) {
                lastMessageTimeRef.current = latest.time
              }
            }
            return result.slice(-100)
          })
        }

        if (typeof data.online === 'number') setOnline(data.online)
        if (Array.isArray(data.roster)) setRoster(data.roster)
        if (data.channelCounts && typeof data.channelCounts === 'object') setChannelCounts(data.channelCounts)

        // typing indicator — only show someone else typing
        const typingArr = Array.isArray(data.typing) ? data.typing : []
        const other = typingArr.find((t) => t.sessionId !== sid2)
        setTypingUser(other ? other.user : null)
        if (other && typingClearRef.current == null) {
          typingClearRef.current = setTimeout(() => {
            setTypingUser(null)
            typingClearRef.current = null
          }, TYPING_CLIENT_TIMEOUT_MS)
        } else if (!other && typingClearRef.current) {
          clearTimeout(typingClearRef.current)
          typingClearRef.current = null
        }

        // presence keepalive — piggyback on the polling loop
        if (Date.now() - lastPresenceRef.current > PRESENCE_KEEPALIVE_MS) {
          sendPresence(p)
        }
      } catch {
        if (!mountedRef.current) return
        const stale = Date.now() - lastPollSuccessRef.current > CONNECT_STALE_MS
        setConnected(!stale)
      }
    }
    void poll()
    pollTimerRef.current = setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
      if (typingClearRef.current) clearTimeout(typingClearRef.current)
      typingClearRef.current = null
      // best-effort: clear typing indicator so others don't see us typing forever
      const sid2 = sessionIdRef.current
      const p = profileRef.current
      if (sid2 && p.name) {
        void fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            op: 'typing',
            sessionId: sid2,
            user: p.name,
            typing: false,
          }),
          keepalive: true,
        }).catch(() => {
          /* swallow */
        })
      }
    }
  }, [])

  // re-broadcast presence whenever the profile changes (so the roster
  // updates live with the new name/color/avatar)
  useEffect(() => {
    if (!profileLoaded) return
    sendPresence(profile)
  }, [profile, profileLoaded])

  // re-broadcast presence when the active channel changes (so per-channel
  // counts update immediately for everyone)
  useEffect(() => {
    if (!profileLoaded) return
    sendPresence(profile)
  }, [activeChannel, profileLoaded])

  // ---- auto-scroll on new message ----
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  // ---- profile editor helpers ----
  const openEditor = () => {
    setDraftName(profile.name)
    setDraftColor(profile.color)
    setDraftAvatar(profile.avatar)
    if (profile.avatar.startsWith('preset:')) setAvatarMode('preset')
    else if (isUrl(profile.avatar)) setAvatarMode('upload')
    else setAvatarMode('emoji')
    setEditing(true)
  }

  const saveProfile = () => {
    const name = draftName.trim().slice(0, 24) || randomGuest()
    const color = draftColor || pickColor()
    const avatar = draftAvatar || 'preset:0'
    const next: Profile = { name, color, avatar }
    setProfile(next)
    profileRef.current = next
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      /* ignore quota errors */
    }
    setEditing(false)
    toast.success('Profile saved', {
      description: `You are now ${name}`,
    })
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const url = await downscaleToDataUrl(file)
      setDraftAvatar(url)
      setAvatarMode('upload')
      toast.success('Avatar ready')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed'
      if (msg === 'too large') {
        toast.error("Couldn't shrink image enough", {
          description: 'Try a smaller or simpler image',
        })
      } else if (msg === 'not an image') {
        toast.error('Please choose an image file')
      } else {
        toast.error('Could not load image')
      }
    } finally {
      setUploading(false)
    }
  }

  // ---- messaging ----
  const send = () => {
    const value = input.trim().slice(0, 500)
    if (!value) return
    const p = profileRef.current
    if (!p.name) return
    // include replyTo if replying to a message
    const rt = replyingTo
      ? { id: replyingTo.id, user: replyingTo.user, text: replyingTo.text.slice(0, 200) }
      : null
    // optimistic append — the next poll will reconcile/replace with the server copy
    const optimistic: ChatMsg = {
      id: `${OPTIMISTIC_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      user: p.name,
      text: value,
      color: p.color,
      avatar: p.avatar,
      time: new Date().toISOString(),
      replyTo: rt,
      image: pendingImage,
    }
    setMessages((prev) => [...prev, optimistic])
    postChat({
      op: 'message',
      sessionId: sessionIdRef.current,
      user: p.name,
      text: value,
      color: p.color,
      avatar: p.avatar,
      channel: activeChannelRef.current,
      replyTo: rt,
      image: pendingImage,
    })
    // clear reply + image + typing indicator
    setReplyingTo(null)
    setPendingImage(null)
    if (typingClearRef.current) clearTimeout(typingClearRef.current)
    typingClearRef.current = null
    setTypingUser(null)
    const sid = sessionIdRef.current
    if (sid) {
      postChat({ op: 'typing', sessionId: sid, user: p.name, typing: false })
    }
    setInput('')
  }

  // ---- react to a message (toggle an emoji reaction) ----
  const reactToMessage = (messageId: string, emoji: string) => {
    const sid = sessionIdRef.current
    if (!sid) return
    postChat({
      op: 'react',
      messageId,
      sessionId: sid,
      emoji,
      channel: activeChannelRef.current,
    })
    // optimistic local update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m
        const reactions = { ...(m.reactions || {}) }
        const list = reactions[emoji] ? [...reactions[emoji]] : []
        const i = list.indexOf(sid)
        if (i >= 0) list.splice(i, 1)
        else list.push(sid)
        if (list.length > 0) reactions[emoji] = list
        else delete reactions[emoji]
        return { ...m, reactions: Object.keys(reactions).length > 0 ? reactions : undefined }
      }),
    )
    setReactPickerFor(null)
  }

  // ---- private chat room helpers ----
  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let out = ''
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
    return out
  }
  const createPrivateRoom = () => {
    const code = generateRoomCode()
    setPrivateRooms((r) => [...r, code])
    setActiveChannel(code)
    setMessages([])
    lastMessageTimeRef.current = ''
    setTypingUser(null)
    setShowRoomDialog(false)
    toast.success('private room created', { description: `code: ${code}` })
  }
  const joinPrivateRoom = () => {
    const code = roomInput.trim().toUpperCase()
    if (code.length < 4) {
      toast.error('invalid code', { description: 'enter at least 4 characters' })
      return
    }
    setPrivateRooms((r) => (r.includes(code) ? r : [...r, code]))
    setActiveChannel(code)
    setMessages([])
    lastMessageTimeRef.current = ''
    setTypingUser(null)
    setShowRoomDialog(false)
    setRoomInput('')
    toast.success(`joining room ${code}`)
  }

  // ---- admin functions ----
  const unlockAdmin = async () => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'adminUnlock', sessionId: sid, password: adminPassword }),
      })
      const data = await res.json()
      if (data.ok) {
        setIsAdmin(true)
        setShowAdminUnlock(false)
        setAdminPassword('')
        toast.success('Admin unlocked', { description: 'You now have admin powers.' })
      } else {
        toast.error('Wrong password')
      }
    } catch {
      toast.error('Failed to unlock admin')
    }
  }

  const timeoutUser = async (targetSessionId: string, targetName: string) => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'timeout', sessionId: sid, targetSessionId }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`Timed out ${targetName}`, { description: '5 minutes' })
      } else {
        toast.error(data.error || 'Failed to timeout')
      }
    } catch {
      toast.error('Failed to timeout')
    }
  }

  const deleteMessage = async (messageId: string) => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'deleteMessage', sessionId: sid, messageId, channel: activeChannelRef.current }),
      })
      const data = await res.json()
      if (data.ok) {
        // remove locally
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
        toast.success('Message deleted')
      } else {
        toast.error(data.error || 'Failed to delete')
      }
    } catch {
      toast.error('Failed to delete')
    }
  }

  // ---- image upload for chat messages ----
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        // downscale to max 400px wide
        const canvas = document.createElement('canvas')
        const maxW = 400
        const scale = Math.min(1, maxW / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        if (dataUrl.length > 50000) {
          toast.error('Image too large', { description: 'Try a smaller image' })
          return
        }
        setPendingImage(dataUrl)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    const p = profileRef.current
    const sid = sessionIdRef.current
    if (!sid || !p.name) return
    if (!e.target.value.trim()) return
    const now = Date.now()
    if (now - typingThrottleRef.current < TYPING_THROTTLE_MS) return
    typingThrottleRef.current = now
    postChat({ op: 'typing', sessionId: sid, user: p.name, typing: true })
  }

  const presencePill = connected ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
      <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400 animate-pulse" />
      {online} online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-400/30">
      <Radio className="h-3 w-3 animate-pulse" />
      reconnecting…
    </span>
  )

  const myName = profile.name

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto flex h-[78vh] w-full max-w-4xl overflow-hidden rounded-3xl glass glass-sheen"
    >
      {/* Channels sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/10 bg-black/20 sm:flex">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
          <MessagesSquare className="h-4.5 w-4.5 text-fuchsia-200" />
          <span className="text-sm font-semibold text-white">Channels</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 glass-scroll">
          {CHANNELS.map((r) => {
            const isActive = activeChannel === r.id
            return (
            <button
              key={r.id}
              disabled={!r.live}
              onClick={() => {
                if (!r.live || isActive) return
                setActiveChannel(r.id)
                // reset per-channel state so the new channel loads fresh
                setMessages([])
                lastMessageTimeRef.current = ''
                setTypingUser(null)
              }}
              title={r.live ? r.topic : 'Coming soon'}
              className={cn(
                'group mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                isActive
                  ? 'bg-gradient-to-br from-fuchsia-500/25 to-violet-500/15 text-white ring-1 ring-inset ring-fuchsia-400/30'
                  : r.live
                    ? 'text-white/60 hover:bg-white/8 hover:text-white'
                    : 'cursor-not-allowed text-white/35 hover:bg-transparent',
              )}
            >
              {r.kind === 'video' ? (
                <Video className="h-4 w-4 shrink-0 text-fuchsia-300" />
              ) : r.kind === 'voice' ? (
                <Mic className="h-4 w-4 shrink-0 text-emerald-300" />
              ) : (
                <Hash className="h-4 w-4 shrink-0 text-white/40" />
              )}
              <span className="flex-1 truncate">{r.name}</span>
              {(() => {
                const count = channelCounts[r.id] || 0
                if (count === 0) return null
                return (
                  <span className="shrink-0 rounded-full bg-white/8 px-1.5 text-[9px] font-bold tabular-nums text-white/50">
                    {count}
                  </span>
                )
              })()}
              {r.live ? (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                  <Circle className="h-1.5 w-1.5 fill-emerald-400 text-emerald-400" />
                  live
                </span>
              ) : null}
            </button>
            )
          })}

          {/* Private rooms section */}
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between px-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                private rooms
              </span>
              <button
                onClick={() => setShowRoomDialog(true)}
                className="grid h-5 w-5 place-items-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                title="create / join a private room"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {privateRooms.map((code) => (
              <button
                key={code}
                onClick={() => {
                  if (activeChannel === code) return
                  setActiveChannel(code)
                  setMessages([])
                  lastMessageTimeRef.current = ''
                  setTypingUser(null)
                }}
                className={cn(
                  'group mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                  activeChannel === code
                    ? 'bg-gradient-to-br from-fuchsia-500/25 to-violet-500/15 text-white ring-1 ring-inset ring-fuchsia-400/30'
                    : 'text-white/60 hover:bg-white/8 hover:text-white',
                )}
              >
                <Lock className="h-4 w-4 shrink-0 text-amber-300" />
                <span className="flex-1 truncate">{code}</span>
              </button>
            ))}
          </div>

          {/* Online roster */}
          <div className="mt-3 px-2">
            <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
              <Users className="h-3 w-3" />
              <span>online — {roster.length}</span>
            </div>
            <div className="space-y-1">
              <AnimatePresence initial={false}>
                {roster.map((p) => {
                  const me = p.user === myName && myName !== ''
                  return (
                    <motion.div
                      key={p.id}
                      layout
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/8"
                    >
                      <Avatar avatar={p.avatar} name={p.user} size="sm" />
                      <span
                        className={cn(
                          'flex-1 truncate text-xs',
                          me ? 'font-semibold' : 'font-medium',
                          p.color,
                        )}
                      >
                        {p.user}
                        {me ? (
                          <span className="ml-1 text-[10px] text-white/40">(you)</span>
                        ) : null}
                      </span>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {roster.length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-white/30">no one online</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* You + edit profile + admin */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2 rounded-xl glass-subtle px-2.5 py-2 text-xs text-white/60">
            <Avatar avatar={profile.avatar} name={profile.name || 'guest'} size="sm" />
            <span className="min-w-0 flex-1 truncate">
              you are{' '}
              <span className={cn('font-semibold', profile.color)}>
                {profile.name || '…'}
              </span>
              {isAdmin && (
                <span className="ml-1 text-[9px] font-bold text-fuchsia-300 [text-shadow:0_0_8px_rgba(217,70,239,0.8)]">
                  [ADMIN]
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={openEditor}
              title="Edit profile"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/12 hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Admin panel button */}
          {!isAdmin ? (
            <button
              type="button"
              onClick={() => setShowAdminUnlock(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/4 px-3 py-1.5 text-[11px] text-white/40 transition-colors hover:bg-white/8 hover:text-white/70"
            >
              <Shield className="h-3 w-3" />
              admin panel
            </button>
          ) : (
            <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-fuchsia-500/10 px-3 py-1.5 text-[11px] font-medium text-fuchsia-200 ring-1 ring-inset ring-fuchsia-400/20">
              <Shield className="h-3 w-3" />
              admin active
            </div>
          )}
        </div>
      </aside>

      {/* Conversation (text channels) OR FacetimeRoom (video) OR VoicechatRoom (audio) */}
      <div className="flex min-w-0 flex-1 flex-col">
        {activeChannel === 'facetime' ? (
          <FacetimeRoom
            profile={profile}
            sessionId={sessionIdRef.current}
            initialRoom={facetimeRoom}
          />
        ) : activeChannel === 'voicechat' ? (
          <VoicechatRoom
            profile={profile}
            sessionId={sessionIdRef.current}
          />
        ) : (
        <>
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          {activeChannel === 'facetime' ? (
            <Video className="h-5 w-5 text-fuchsia-300" />
          ) : (
            <Hash className="h-5 w-5 text-white/40" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{activeChannel}</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" /> live relay
              </span>
            </div>
            <p className="truncate text-xs text-white/45">
              {connected ? CHANNELS.find((c) => c.id === activeChannel)?.topic || 'live channel' : 'connecting to relay…'}
            </p>
          </div>
          {/* mobile: show edit profile since the sidebar is hidden */}
          <button
            type="button"
            onClick={openEditor}
            title="Edit profile"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl glass-subtle text-white/70 transition-colors hover:text-white sm:hidden"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {presencePill}
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4 glass-scroll">
          {!connected && messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/45">
              <Radio className="h-6 w-6 animate-pulse text-fuchsia-300" />
              <p className="text-sm">connecting to relay…</p>
              <p className="text-[11px] text-white/30">polling for messages</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => {
                const mine = m.user === myName && myName !== ''
                const mySession = sessionIdRef.current
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="group relative flex items-start gap-3"
                  >
                    <Avatar avatar={m.avatar} name={m.user} size="md" />
                    <div className="min-w-0 flex-1">
                      {/* reply preview */}
                      {m.replyTo ? (
                        <div className="mb-1 flex items-center gap-1.5 border-l-2 border-fuchsia-400/40 pl-2 text-[11px] text-white/40">
                          <CornerUpLeft className="h-3 w-3 shrink-0" />
                          <span className={cn('font-semibold', m.color)}>{m.replyTo.user}</span>
                          <span className="truncate">{m.replyTo.text || '(empty)'}</span>
                        </div>
                      ) : null}
                      <div className="flex items-baseline gap-2">
                        <span className={cn('text-sm font-semibold', m.color)}>
                          {m.user}
                          {mine ? <span className="ml-1 text-[10px] text-white/40">(you)</span> : null}
                        </span>
                        {/* [ADMIN] tag — check if this message's sender is an admin in the roster */}
                        {roster.find((r) => r.user === m.user)?.isAdmin && (
                          <span className="text-[8px] font-bold text-fuchsia-300 [text-shadow:0_0_6px_rgba(217,70,239,0.8)]">
                            [ADMIN]
                          </span>
                        )}
                        <span className="text-[10px] text-white/30">{formatTime(m.time)}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-white/80">
                        {m.deleted ? (
                          <span className="italic text-white/30">message deleted by admin</span>
                        ) : (
                          m.text
                        )}
                      </p>
                      {/* image attachment */}
                      {m.image && !m.deleted && (
                        <img
                          src={m.image}
                          alt="shared image"
                          className="mt-2 max-w-full rounded-xl border border-white/10"
                          style={{ maxHeight: '300px' }}
                          loading="lazy"
                        />
                      )}

                      {/* reactions */}
                      {m.reactions && Object.keys(m.reactions).length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {Object.entries(m.reactions).map(([emoji, sids]) => {
                            const reacted = sids.includes(mySession)
                            return (
                              <button
                                key={emoji}
                                onClick={() => reactToMessage(m.id, emoji)}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors',
                                  reacted
                                    ? 'bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-400/30'
                                    : 'bg-white/8 text-white/70 hover:bg-white/12',
                                )}
                              >
                                <span>{emoji}</span>
                                <span className="tabular-nums">{sids.length}</span>
                              </button>
                            )
                          })}
                        </div>
                      ) : null}

                      {/* hover action bar: reply + react */}
                      <div className="absolute -top-3 right-0 flex items-center gap-0.5 rounded-lg glass-strong glass-sheen p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => setReplyingTo(m)}
                          title="reply"
                          className="grid h-7 w-7 place-items-center rounded-md text-white/50 transition-colors hover:bg-white/12 hover:text-white"
                        >
                          <CornerUpLeft className="h-3.5 w-3.5" />
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setReactPickerFor(reactPickerFor === m.id ? null : m.id)}
                            title="react"
                            className="grid h-7 w-7 place-items-center rounded-md text-white/50 transition-colors hover:bg-white/12 hover:text-white"
                          >
                            <SmilePlus className="h-3.5 w-3.5" />
                          </button>
                          {/* emoji picker popover */}
                          {reactPickerFor === m.id ? (
                            <div className="absolute bottom-full right-0 mb-1 flex items-center gap-0.5 rounded-xl glass-strong glass-sheen p-1.5">
                              {REACTION_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => reactToMessage(m.id, emoji)}
                                  className="grid h-7 w-7 place-items-center rounded-md text-base transition-transform hover:scale-125 hover:bg-white/12"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {/* admin actions: timeout + delete (only for admins, not on own messages) */}
                        {isAdmin && m.user !== myName && !m.deleted && (
                          <>
                            <button
                              onClick={() => {
                                // find the sender's sessionId from roster
                                const target = roster.find((r) => r.user === m.user)
                                if (target) timeoutUser(target.id, target.user)
                                else toast.error('User not found in roster')
                              }}
                              title="time out for 5 minutes"
                              className="grid h-7 w-7 place-items-center rounded-md text-amber-400/60 transition-colors hover:bg-amber-500/20 hover:text-amber-300"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteMessage(m.id)}
                              title="delete message"
                              className="grid h-7 w-7 place-items-center rounded-md text-rose-400/60 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}

          {/* typing indicator */}
          <AnimatePresence>
            {typingUser && typingUser !== myName ? (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-2 pl-12 text-xs text-white/45"
              >
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50" />
                </span>
                <span>
                  <span className="font-semibold text-white/70">{typingUser}</span> is typing…
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Quick reactions */}
        <div className="flex flex-wrap gap-1.5 px-5 pb-2">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setInput(q)}
              className="rounded-full glass-subtle px-2.5 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/15 hover:text-white"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Reply preview bar — shows when replying to a message */}
        {replyingTo ? (
          <div className="mx-3 mb-1 flex items-center gap-2 rounded-xl glass-subtle px-3 py-2 text-xs">
            <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
            <div className="min-w-0 flex-1">
              <span className="text-white/40">replying to </span>
              <span className={cn('font-semibold', replyingTo.color)}>{replyingTo.user}</span>
              <p className="truncate text-white/50">{replyingTo.text}</p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/40 transition-colors hover:bg-white/12 hover:text-white"
              title="cancel reply"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex items-center gap-2 border-t border-white/10 p-3"
        >
          {/* image upload button */}
          <label
            title="send image"
            className={cn(
              'grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl transition-colors',
              'glass-subtle text-white/50 hover:bg-white/12 hover:text-white',
              !connected && 'pointer-events-none opacity-40',
            )}
          >
            <ImageIcon className="h-4.5 w-4.5" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!connected}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleImageUpload(f)
                e.target.value = ''
              }}
            />
          </label>
          <input
            value={input}
            onChange={onInputChange}
            maxLength={500}
            disabled={!connected}
            placeholder={connected ? `Message #${activeChannel}` : 'waiting for relay…'}
            className="glass-subtle flex-1 rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-fuchsia-400/40 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!connected || (!input.trim() && !pendingImage)}
            className="glass-sheen grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 text-white transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </form>

        {/* Pending image preview bar */}
        {pendingImage && (
          <div className="mx-3 mb-1 flex items-center gap-2 rounded-xl glass-subtle px-3 py-2 text-xs">
            <img src={pendingImage} alt="pending" className="h-12 w-12 rounded-lg object-cover" />
            <span className="flex-1 text-white/50">image ready to send</span>
            <button
              onClick={() => setPendingImage(null)}
              className="grid h-6 w-6 place-items-center rounded-md text-white/40 transition-colors hover:bg-white/12 hover:text-white"
              title="remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        </>
        )}
      </div>

      {/* Profile editor modal */}
      <AnimatePresence>
        {editing ? (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setEditing(false)}
          >
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-2xl glass glass-sheen p-5 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-fuchsia-200" />
                  <h2 className="text-sm font-semibold text-white">Edit profile</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* live preview */}
              <div className="mb-4 flex items-center gap-3 rounded-xl glass-subtle p-3">
                <Avatar avatar={draftAvatar} name={draftName || 'guest'} size="lg" />
                <div className="min-w-0">
                  <p className={cn('truncate text-sm font-semibold', draftColor || 'text-white')}>
                    {draftName || 'guest'}
                  </p>
                  <p className="text-[11px] text-white/40">preview</p>
                </div>
              </div>

              {/* display name */}
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Display name
              </label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value.slice(0, 24))}
                maxLength={24}
                placeholder="guest-1234"
                className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-fuchsia-400/40 focus:outline-none"
              />

              {/* color */}
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Color
              </label>
              <div className="mb-4 flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraftColor(c)}
                    className={cn(
                      'grid h-7 w-7 place-items-center rounded-full ring-2 transition-transform hover:scale-110',
                      c,
                      draftColor === c ? 'ring-white/80' : 'ring-transparent',
                    )}
                    title={c}
                  >
                    {draftColor === c ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                ))}
              </div>

              {/* avatar mode tabs */}
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Avatar
              </label>
              <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1">
                {([
                  { id: 'preset', label: 'Preset', Icon: Sparkles },
                  { id: 'emoji', label: 'Emoji', Icon: Smile },
                  { id: 'upload', label: 'Upload', Icon: Upload },
                ] as const).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAvatarMode(id)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors',
                      avatarMode === id
                        ? 'bg-white/15 text-white'
                        : 'text-white/55 hover:text-white',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* avatar picker body */}
              <div className="mb-4 min-h-[7rem]">
                {avatarMode === 'preset' ? (
                  <div className="grid grid-cols-8 gap-2">
                    {PRESET_GRADIENTS.map((g, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setDraftAvatar(`preset:${i}`)}
                        title={`Preset ${i + 1}`}
                        className={cn(
                          'grid aspect-square place-items-center rounded-full bg-gradient-to-br text-xs font-bold text-white transition-transform hover:scale-110',
                          g,
                          draftAvatar === `preset:${i}`
                            ? 'ring-2 ring-white/90 ring-offset-2 ring-offset-black/40'
                            : '',
                        )}
                      >
                        {initialOf(draftName)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {avatarMode === 'emoji' ? (
                  <div className="grid grid-cols-8 gap-1.5">
                    {EMOJIS.map((em, i) => (
                      <button
                        key={`${em}-${i}`}
                        type="button"
                        onClick={() => setDraftAvatar(em)}
                        className={cn(
                          'grid aspect-square place-items-center rounded-lg text-lg transition-colors hover:bg-white/12',
                          draftAvatar === em
                            ? 'bg-white/15 ring-2 ring-white/80'
                            : '',
                        )}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                ) : null}

                {avatarMode === 'upload' ? (
                  <div className="flex flex-col items-center gap-3">
                    <label
                      htmlFor="avatar-upload"
                      className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-5 text-center transition-colors hover:border-fuchsia-400/40 hover:bg-white/5"
                    >
                      {uploading ? (
                        <Radio className="h-5 w-5 animate-pulse text-fuchsia-300" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-white/50" />
                      )}
                      <span className="text-xs text-white/60">
                        {uploading ? 'shrinking…' : 'click to choose an image'}
                      </span>
                      <span className="text-[10px] text-white/30">
                        auto-downscaled to ≤{AVATAR_MAX} chars
                      </span>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void handleUpload(f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {isUrl(draftAvatar) ? (
                      <div className="flex items-center gap-2 text-xs text-white/60">
                        <Avatar avatar={draftAvatar} name={draftName} size="sm" />
                        <span>uploaded</span>
                        <button
                          type="button"
                          onClick={() => setDraftAvatar('preset:0')}
                          className="text-white/40 underline-offset-2 hover:text-white hover:underline"
                        >
                          remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 rounded-xl glass-subtle px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProfile}
                  className="flex-1 rounded-xl bg-gradient-to-br from-fuchsia-500/70 to-violet-600/70 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Admin unlock dialog */}
      <AnimatePresence>
        {showAdminUnlock ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
            onClick={() => setShowAdminUnlock(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl glass-strong glass-sheen p-6"
            >
              <div className="mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-fuchsia-300" />
                <h3 className="text-lg font-semibold text-white">Admin Panel</h3>
              </div>
              <p className="mb-4 text-xs text-white/50">
                Enter the admin password to unlock timeout + delete powers.
              </p>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') unlockAdmin() }}
                placeholder="password"
                autoFocus
                className="glass-subtle mb-3 w-full rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-fuchsia-400/40 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAdminUnlock(false)}
                  className="flex-1 rounded-xl bg-white/8 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/15"
                >
                  Cancel
                </button>
                <button
                  onClick={unlockAdmin}
                  className="glass-sheen flex-1 rounded-xl bg-gradient-to-br from-fuchsia-500/70 to-violet-600/70 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95"
                >
                  Unlock
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Private room dialog (create / join) */}
      <AnimatePresence>
        {showRoomDialog ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
            onClick={() => setShowRoomDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl glass-strong glass-sheen p-6"
            >
              <h3 className="text-lg font-semibold text-white">private rooms</h3>
              <p className="mt-1 text-xs text-white/50">
                create a private chat room (get a code) or join one with a code.
              </p>
              <div className="mt-4 space-y-3">
                <button
                  onClick={createPrivateRoom}
                  className="glass-sheen flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 px-4 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  create private chat room
                </button>
                <div className="flex items-center gap-2">
                  <input
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                    placeholder="ROOM CODE"
                    maxLength={8}
                    className="glass-subtle flex-1 rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-sm uppercase tracking-widest text-white placeholder:text-white/35 focus:border-fuchsia-400/40 focus:outline-none"
                  />
                  <button
                    onClick={joinPrivateRoom}
                    className="glass-sheen rounded-xl bg-white/8 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/15"
                  >
                    join
                  </button>
                </div>
                <button
                  onClick={() => {
                    setFacetimeRoom('public')
                    setActiveChannel('facetime')
                    setShowRoomDialog(false)
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/8 px-4 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/15"
                >
                  <Video className="h-4 w-4" />
                  public facetime
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}
