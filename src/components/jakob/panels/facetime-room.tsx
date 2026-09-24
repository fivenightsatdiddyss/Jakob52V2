'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Phone,
  Users,
  Loader2,
  Radio,
  Copy,
  Check,
  DoorOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getIceServers, ICE_SERVERS } from './ice-servers'

type Profile = {
  name: string
  color: string
  avatar: string
}

type Peer = {
  id: string
  user: string
  color: string
  avatar: string
}

type RtcSignal = {
  id: string
  from: string
  type: 'offer' | 'answer' | 'ice'
  data: unknown
}

type FacetimeRoomProps = {
  profile: Profile
  sessionId: string
  initialRoom?: string
}

const POLL_INTERVAL_MS = 2000 // slower polling = less lag
const PRESENCE_KEEPALIVE_MS = 8000

/**
 * FacetimeRoom — uses /api/chat (the SAME API the text chat uses) for signaling.
 *
 * Presence: the user's channel is set to 'facetime' in the roster, so the
 * roster filtered by channel = facetime peers.
 *
 * Signaling: WebRTC offers/answers/ICE are sent via op:'rtcSignal' and
 * retrieved from the GET response's rtcSignals field.
 *
 * Media: flows P2P via WebRTC once the connection is established.
 */
export default function FacetimeRoom({ profile, sessionId, initialRoom = 'public' }: FacetimeRoomProps) {
  const [room, setRoom] = useState<string>(initialRoom)
  const [roomInput, setRoomInput] = useState('')
  const [showRoomDialog, setShowRoomDialog] = useState(false)
  const [joined, setJoined] = useState(false)
  const joinedRef = useRef(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [peerStates, setPeerStates] = useState<Record<string, string>>({})
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [connected, setConnected] = useState(false)
  const [copied, setCopied] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const pcRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const knownPeersRef = useRef<Set<string>>(new Set())
  const profileRef = useRef(profile)
  const roomRef = useRef(room)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPresenceRef = useRef<number>(0)
  const mountedRef = useRef<boolean>(true)
  // Hardcoded ICE servers (STUN + TURN) — no async fetch, no race condition.
  // These are always available the moment a peer connection is created.
  const iceServersRef = useRef<RTCIceServer[]>(ICE_SERVERS)

  useEffect(() => { profileRef.current = profile }, [profile])
  useEffect(() => { roomRef.current = room }, [room])

  // ---- POST helper (same as chat) ----
  const postChat = useCallback((body: Record<string, unknown>) => {
    if (!mountedRef.current) return
    void fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {})
  }, [])

  const sendPresence = useCallback(() => {
    const p = profileRef.current
    postChat({
      op: 'presence',
      sessionId,
      user: p.name,
      color: p.color,
      avatar: p.avatar,
      channel: 'facetime',
    })
    lastPresenceRef.current = Date.now()
  }, [sessionId, postChat])

  // ---- create a peer connection ----
  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
      const stream = localStreamRef.current
      if (stream) {
        for (const track of stream.getTracks()) {
          try { pc.addTrack(track, stream) } catch { /* already added */ }
        }
      }
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          postChat({ op: 'rtcSignal', from: sessionId, to: peerId, type: 'ice', data: e.candidate.toJSON() })
        }
      }
      pc.ontrack = (e) => {
        const el = remoteVideoRefs.current.get(peerId)
        if (el && e.streams[0]) {
          el.srcObject = e.streams[0]
          el.play().catch(() => {})
        }
      }
      pc.oniceconnectionstatechange = () => {
        setPeerStates((prev) => ({ ...prev, [peerId]: pc.iceConnectionState }))
        if (pc.iceConnectionState === 'failed') {
          try { pc.restartIce() } catch { /* ignore */ }
          // If still failed after restart, tear down and let the next poll rediscover
          setTimeout(() => {
            if (pc.iceConnectionState === 'failed') {
              try { pc.close() } catch {}
              pcRef.current.delete(peerId)
              knownPeersRef.current.delete(peerId)
              pendingIceRef.current.delete(peerId)
            }
          }, 5000)
        }
      }
      pc.onconnectionstatechange = () => {
        setPeerStates((prev) => ({ ...prev, [peerId]: pc.connectionState }))
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          try { pc.close() } catch { /* ignore */ }
          pcRef.current.delete(peerId)
        }
      }
      pcRef.current.set(peerId, pc)
      return pc
    },
    [sessionId, postChat],
  )

  const flushPendingIce = useCallback(async (peerId: string) => {
    const pc = pcRef.current.get(peerId)
    const pending = pendingIceRef.current.get(peerId)
    if (!pc || !pending) return
    for (const cand of pending) {
      try { await pc.addIceCandidate(new RTCIceCandidate(cand)) } catch { /* ignore */ }
    }
    pendingIceRef.current.delete(peerId)
  }, [])

  const initiateConnection = useCallback(
    async (peerId: string) => {
      let pc = pcRef.current.get(peerId)
      if (!pc) pc = createPeerConnection(peerId)
      if (pc.signalingState !== 'stable') return
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        await pc.setLocalDescription(offer)
        postChat({ op: 'rtcSignal', from: sessionId, to: peerId, type: 'offer', data: offer.toJSON ? offer.toJSON() : offer })
      } catch (err) {
        console.error('offer failed', err)
      }
    },
    [sessionId, postChat, createPeerConnection],
  )

  // ---- polling loop: same as chat, but also processes WebRTC signals ----
  const poll = useCallback(async () => {
    if (!mountedRef.current || !joinedRef.current) return
    try {
      // Use the SAME /api/chat endpoint that the text chat uses.
      // Pass sessionId so the server returns rtcSignals addressed to us.
      const res = await fetch(
        `/api/chat?channel=facetime&sessionId=${encodeURIComponent(sessionId)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) throw new Error(`http ${res.status}`)
      const data = (await res.json()) as {
        roster?: Array<Peer & { channel?: string }>
        rtcSignals?: RtcSignal[]
      }
      if (!mountedRef.current) return
      setConnected(true)

      // Filter roster to only peers in the facetime channel
      const allRoster = Array.isArray(data.roster) ? data.roster : []
      const facetimePeers = allRoster.filter((p) => p.id !== sessionId && p.channel === 'facetime')
      setPeers(facetimePeers)

      // Discover new peers + initiate connections (perfect-negotiation: lower sessionId initiates)
      for (const p of facetimePeers) {
        if (!knownPeersRef.current.has(p.id)) {
          knownPeersRef.current.add(p.id)
          if (sessionId < p.id) void initiateConnection(p.id)
        }
      }
      // Clean up departed peers
      const currentIds = new Set(facetimePeers.map((p) => p.id))
      for (const id of [...knownPeersRef.current]) {
        if (id !== sessionId && !currentIds.has(id)) {
          knownPeersRef.current.delete(id)
          const pc = pcRef.current.get(id)
          if (pc) { try { pc.close() } catch {} ; pcRef.current.delete(id) }
          pendingIceRef.current.delete(id)
        }
      }

      // Process incoming WebRTC signals (offers / answers / ICE)
      const signals = Array.isArray(data.rtcSignals) ? data.rtcSignals : []
      for (const sig of signals) {
        const fromId = sig.from
        if (fromId === sessionId) continue
        let pc = pcRef.current.get(fromId)

        if (sig.type === 'offer') {
          if (!pc) pc = createPeerConnection(fromId)
          if (pc.signalingState !== 'stable') {
            try { await pc.setLocalDescription({ type: 'rollback' }) } catch {}
          }
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            postChat({ op: 'rtcSignal', from: sessionId, to: fromId, type: 'answer', data: answer.toJSON ? answer.toJSON() : answer })
            void flushPendingIce(fromId)
          } catch (err) { console.error('answer failed', err) }
        } else if (sig.type === 'answer') {
          if (!pc || pc.signalingState !== 'have-local-offer') continue
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit))
            void flushPendingIce(fromId)
          } catch (err) { console.error('set answer failed', err) }
        } else if (sig.type === 'ice') {
          if (!pc) pc = createPeerConnection(fromId)
          if (pc.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(sig.data as RTCIceCandidateInit)) } catch {}
          } else {
            const buf = pendingIceRef.current.get(fromId) || []
            buf.push(sig.data as RTCIceCandidateInit)
            pendingIceRef.current.set(fromId, buf)
          }
        }
      }

      // Presence keepalive
      if (Date.now() - lastPresenceRef.current > PRESENCE_KEEPALIVE_MS) sendPresence()
    } catch {
      if (!mountedRef.current) return
      setConnected(false)
    }
  }, [sessionId, joined, createPeerConnection, postChat, sendPresence, initiateConnection, flushPendingIce])

  // ---- join: get camera/mic, start polling ----
  const join = useCallback(async () => {
    setJoining(true)
    setError(null)
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        setCamOn(false)
        toast('camera unavailable', { description: 'joined with audio only' })
      }
      localStreamRef.current = stream
      // IMPORTANT: set joined=true FIRST so the video element renders,
      // THEN attach the stream in a useEffect (the video ref isn't available
      // until after the joined view renders).
      setJoined(true)
      joinedRef.current = true
      mountedRef.current = true
      sendPresence()
      void poll()
      pollTimerRef.current = setInterval(() => { void poll() }, POLL_INTERVAL_MS)
      toast.success('joined the room', { description: 'you are live' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed to access camera/mic'
      setError(msg)
      toast.error('could not join', { description: msg })
    } finally {
      setJoining(false)
    }
  }, [sendPresence, poll])

  // Attach the local stream to the video element once it's rendered.
  // This runs after setJoined(true) causes the video element to mount.
  // Without this, the stream is captured but never displayed (black screen).
  useEffect(() => {
    if (!joined) return
    const stream = localStreamRef.current
    const el = localVideoRef.current
    if (stream && el) {
      el.srcObject = stream
      el.muted = true
      el.play().catch((err) => console.error('local video play failed:', err))
    }
  }, [joined])

  const leave = useCallback(() => {
    for (const [, pc] of pcRef.current) { try { pc.close() } catch {} }
    pcRef.current.clear()
    knownPeersRef.current.clear()
    pendingIceRef.current.clear()
    const stream = localStreamRef.current
    if (stream) { for (const t of stream.getTracks()) t.stop(); localStreamRef.current = null }
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    postChat({ op: 'presence', sessionId, user: profileRef.current.name, color: profileRef.current.color, avatar: profileRef.current.avatar, channel: 'general' })
    setJoined(false)
    joinedRef.current = false
    setPeers([])
    setPeerStates({})
  }, [sessionId, postChat])

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const next = !micOn
    for (const track of stream.getAudioTracks()) track.enabled = next
    setMicOn(next)
  }, [micOn])

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const next = !camOn
    for (const track of stream.getVideoTracks()) track.enabled = next
    setCamOn(next)
  }, [camOn])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      for (const [, pc] of pcRef.current) { try { pc.close() } catch {} }
      pcRef.current.clear()
      const stream = localStreamRef.current
      if (stream) for (const t of stream.getTracks()) t.stop()
    }
  }, [])

  // ---- not joined ----
  if (!joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-fuchsia-500/30 to-violet-600/20 text-fuchsia-100">
          <Video className="h-10 w-10" />
        </motion.div>
        <div>
          <h3 className="text-xl font-semibold text-white">facetime</h3>
          <p className="mt-1 max-w-sm text-sm text-white/50">
            a public video room. enable your camera + mic to talk with anyone here. no codes, no rooms — everyone in this channel sees + hears each other.
          </p>
        </div>
        {error && <div className="max-w-sm rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200">{error}</div>}
        <button onClick={join} disabled={joining}
          className="glass-sheen inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 px-6 py-3 text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-60">
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
          {joining ? 'joining…' : 'join with camera + mic'}
        </button>
        <p className="text-[11px] text-white/30">you'll be asked to allow camera + microphone access</p>
      </div>
    )
  }

  const totalInRoom = peers.length + 1

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
        <Video className="h-5 w-5 text-fuchsia-300" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">facetime</span>
            <span className={cn('inline-flex items-center gap-1 text-[10px]', connected ? 'text-emerald-300' : 'text-amber-300')}>
              {connected ? <><Radio className="h-2.5 w-2.5 animate-pulse" /> live</> : 'reconnecting…'}
            </span>
          </div>
          <p className="truncate text-xs text-white/45">
            <Users className="mr-1 inline h-3 w-3" />
            {totalInRoom} {totalInRoom === 1 ? 'person' : 'people'} in the room
          </p>
        </div>
      </div>

      {/* video grid */}
      <div className="flex-1 overflow-y-auto p-4 glass-scroll">
        <div className={cn('grid gap-3',
          totalInRoom <= 1 && 'grid-cols-1',
          totalInRoom === 2 && 'grid-cols-1 sm:grid-cols-2',
          totalInRoom >= 3 && totalInRoom <= 4 && 'grid-cols-2',
          totalInRoom >= 5 && 'grid-cols-2 lg:grid-cols-3',
        )}>
          {/* local video — always visible */}
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-sm">
              <span className={cn('text-xs font-semibold', profile.color)}>{profile.name} (you)</span>
              {!camOn && <VideoOff className="h-3 w-3 text-rose-300" />}
            </div>
            {!camOn && (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-violet-900/40 to-fuchsia-900/30">
                <VideoOff className="h-8 w-8 text-white/30" />
              </div>
            )}
          </div>
          {/* remote videos */}
          <AnimatePresence mode="popLayout">
            {peers.map((p) => {
              const state = peerStates[p.id] || 'new'
              const isLive = state === 'connected' || state === 'completed'
              return (
                <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.25 }}>
                  <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                    <video
                      ref={(el) => { if (el) remoteVideoRefs.current.set(p.id, el); else remoteVideoRefs.current.delete(p.id) }}
                      autoPlay playsInline className="h-full w-full object-cover"
                    />
                    {!isLive && (
                      <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-violet-900/40 to-fuchsia-900/30">
                        <div className="flex flex-col items-center gap-2">
                          <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15">
                            {p.avatar && p.avatar.startsWith('data:') ? (
                              <img src={p.avatar} alt="" className="h-full w-full object-cover" />
                            ) : p.avatar && p.avatar.length <= 4 && p.avatar.length > 0 ? (
                              <span className="text-2xl">{p.avatar}</span>
                            ) : (
                              <span className={cn('text-lg font-bold', p.color)}>{p.user.slice(0, 2).toUpperCase()}</span>
                            )}
                          </div>
                          <span className="text-[11px] text-white/50">
                            {state === 'new' || !state ? 'waiting…' : state === 'checking' ? 'connecting…' : state}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-sm">
                      <span className={cn('text-xs font-semibold', p.color)}>{p.user}</span>
                      {isLive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]" />}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
        {peers.length === 0 && (
          <div className="mt-6 text-center text-sm text-white/40">
            you're the only one here. share this page — others who open facetime will join automatically.
          </div>
        )}
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-3 border-t border-white/10 p-4">
        <button onClick={toggleMic} title={micOn ? 'mute' : 'unmute'}
          className={cn('grid h-12 w-12 place-items-center rounded-2xl transition-all', micOn ? 'glass-subtle text-white hover:bg-white/15' : 'bg-rose-500/30 text-rose-200 hover:bg-rose-500/40')}>
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button onClick={toggleCam} title={camOn ? 'stop camera' : 'start camera'}
          className={cn('grid h-12 w-12 place-items-center rounded-2xl transition-all', camOn ? 'glass-subtle text-white hover:bg-white/15' : 'bg-rose-500/30 text-rose-200 hover:bg-rose-500/40')}>
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>
        <button onClick={leave} title="leave call"
          className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-600/60 text-white transition-all hover:bg-rose-600">
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
