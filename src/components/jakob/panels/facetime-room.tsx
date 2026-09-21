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
import { getIceServers } from './ice-servers'

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

type Signal = {
  id: string
  from: string
  type: 'offer' | 'answer' | 'ice'
  data: unknown
}

type FacetimeRoomProps = {
  profile: Profile
  sessionId: string
  /** room id — 'public' for the main #facetime channel, or a 6-char code for private rooms */
  initialRoom?: string
}

const POLL_INTERVAL_MS = 1200
const PRESENCE_KEEPALIVE_MS = 8000

/** Generate a random 6-char room code. */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no confusing chars (0/O, 1/I)
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

/**
 * FacetimeRoom — a WebRTC video room (mesh topology).
 *
 * Supports a public room (the #facetime channel) and private rooms (join by
 * 6-char code). Signaling goes through /api/facetime with polling; media flows
 * P2P via WebRTC.
 *
 * Fixes vs the old version:
 *  - ICE candidates that arrive before the remote description are BUFFERED and
 *    applied once setRemoteDescription completes (the old version dropped them,
 *    which broke connections on mobile/slow networks).
 *  - Local video uses playsInline + muted + autoplay so it renders on iOS Safari.
 *  - getUserMedia constraints are mobile-friendly (facingMode: 'user', and a
 *    fallback to audio-only if video fails).
 *  - Renegotiation handling: if a peer's connection isn't in the right state
 *    when a signal arrives, we reset and retry instead of silently failing.
 */
export default function FacetimeRoom({ profile, sessionId, initialRoom = 'public' }: FacetimeRoomProps) {
  const [room, setRoom] = useState<string>(initialRoom)
  const [roomInput, setRoomInput] = useState('')
  const [showRoomDialog, setShowRoomDialog] = useState(false)
  const [joined, setJoined] = useState(false)
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
  // buffered ICE candidates per peer (applied after setRemoteDescription)
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const knownPeersRef = useRef<Set<string>>(new Set())
  const profileRef = useRef(profile)
  const roomRef = useRef(room)
  useEffect(() => {
    profileRef.current = profile
  }, [profile])
  useEffect(() => {
    roomRef.current = room
  }, [room])

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPresenceRef = useRef<number>(0)
  const mountedRef = useRef<boolean>(true)
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ])

  // ---- POST helper ----
  const postSignal = useCallback((body: Record<string, unknown>) => {
    if (!mountedRef.current) return
    void fetch('/api/facetime', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, room: roomRef.current }),
      keepalive: true,
    }).catch(() => {})
  }, [])

  const sendPresence = useCallback(() => {
    const p = profileRef.current
    postSignal({
      op: 'presence',
      sessionId,
      user: p.name,
      color: p.color,
      avatar: p.avatar,
    })
    lastPresenceRef.current = Date.now()
  }, [sessionId, postSignal])

  // ---- create a peer connection for a remote peer ----
  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
      const stream = localStreamRef.current
      if (stream) {
        for (const track of stream.getTracks()) {
          try {
            pc.addTrack(track, stream)
          } catch {
            /* track may already be added */
          }
        }
      }
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          postSignal({
            op: 'signal',
            from: sessionId,
            to: peerId,
            type: 'ice',
            data: e.candidate.toJSON(),
          })
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
        const state = pc.iceConnectionState
        setPeerStates((prev) => ({ ...prev, [peerId]: state }))
        if (state === 'failed' || state === 'disconnected') {
          // try to restart ICE
          try {
            pc.restartIce()
          } catch {
            /* ignore */
          }
        }
      }
      pc.onconnectionstatechange = () => {
        setPeerStates((prev) => ({ ...prev, [peerId]: pc.connectionState }))
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          try {
            pc.close()
          } catch {
            /* ignore */
          }
          pcRef.current.delete(peerId)
        }
      }
      pcRef.current.set(peerId, pc)
      return pc
    },
    [sessionId, postSignal],
  )

  // ---- apply buffered ICE candidates after setRemoteDescription ----
  const flushPendingIce = useCallback(async (peerId: string) => {
    const pc = pcRef.current.get(peerId)
    const pending = pendingIceRef.current.get(peerId)
    if (!pc || !pending) return
    for (const cand of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand))
      } catch {
        /* ignore */
      }
    }
    pendingIceRef.current.delete(peerId)
  }, [])

  // ---- initiate a connection to a new peer (I'm the initiator) ----
  const initiateConnection = useCallback(
    async (peerId: string) => {
      let pc = pcRef.current.get(peerId)
      if (!pc) pc = createPeerConnection(peerId)
      if (pc.signalingState !== 'stable') return
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        await pc.setLocalDescription(offer)
        postSignal({
          op: 'signal',
          from: sessionId,
          to: peerId,
          type: 'offer',
          data: offer.toJSON ? offer.toJSON() : offer,
        })
      } catch (err) {
        console.error('offer failed', err)
      }
    },
    [sessionId, postSignal, createPeerConnection],
  )

  // ---- polling loop: discover peers + process incoming signals ----
  const poll = useCallback(async () => {
    if (!mountedRef.current || !joined) return
    try {
      const r = roomRef.current
      const res = await fetch(
        `/api/facetime?sessionId=${encodeURIComponent(sessionId)}&room=${encodeURIComponent(r)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) throw new Error(`http ${res.status}`)
      const data = (await res.json()) as { peers?: Peer[]; signals?: Signal[] }
      if (!mountedRef.current) return
      setConnected(true)

      const peerList = Array.isArray(data.peers) ? data.peers : []
      setPeers(peerList.filter((p) => p.id !== sessionId))

      // discover new peers + initiate connections (perfect-negation style)
      for (const p of peerList) {
        if (p.id === sessionId) continue
        if (!knownPeersRef.current.has(p.id)) {
          knownPeersRef.current.add(p.id)
          if (sessionId < p.id) {
            void initiateConnection(p.id)
          }
        }
      }
      // clean up departed peers
      const currentIds = new Set(peerList.map((p) => p.id))
      for (const id of [...knownPeersRef.current]) {
        if (id !== sessionId && !currentIds.has(id)) {
          knownPeersRef.current.delete(id)
          const pc = pcRef.current.get(id)
          if (pc) {
            try {
              pc.close()
            } catch {
              /* ignore */
            }
            pcRef.current.delete(id)
          }
          pendingIceRef.current.delete(id)
        }
      }

      // process incoming signals (offers / answers / ICE)
      const signals = Array.isArray(data.signals) ? data.signals : []
      for (const sig of signals) {
        const fromId = sig.from
        if (fromId === sessionId) continue
        let pc = pcRef.current.get(fromId)

        if (sig.type === 'offer') {
          if (!pc) pc = createPeerConnection(fromId)
          // If we're not stable (e.g. glare), reset and accept the incoming offer
          if (pc.signalingState !== 'stable') {
            try {
              await pc.setLocalDescription({ type: 'rollback' })
            } catch {
              /* ignore */
            }
          }
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            postSignal({
              op: 'signal',
              from: sessionId,
              to: fromId,
              type: 'answer',
              data: answer.toJSON ? answer.toJSON() : answer,
            })
            // apply any buffered ICE for this peer
            void flushPendingIce(fromId)
          } catch (err) {
            console.error('answer failed', err)
          }
        } else if (sig.type === 'answer') {
          if (!pc) continue
          if (pc.signalingState !== 'have-local-offer') continue
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit))
            void flushPendingIce(fromId)
          } catch (err) {
            console.error('set answer failed', err)
          }
        } else if (sig.type === 'ice') {
          if (!pc) {
            // ICE may arrive before the offer; create the pc + buffer
            pc = createPeerConnection(fromId)
          }
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(sig.data as RTCIceCandidateInit))
            } catch {
              /* ignore */
            }
          } else {
            // buffer until setRemoteDescription completes
            const buf = pendingIceRef.current.get(fromId) || []
            buf.push(sig.data as RTCIceCandidateInit)
            pendingIceRef.current.set(fromId, buf)
          }
        }
      }

      // presence keepalive
      if (Date.now() - lastPresenceRef.current > PRESENCE_KEEPALIVE_MS) {
        sendPresence()
      }
    } catch {
      if (!mountedRef.current) return
      setConnected(false)
    }
  }, [sessionId, joined, createPeerConnection, postSignal, sendPresence, initiateConnection, flushPendingIce])

  // ---- join: get camera/mic, start polling ----
  const join = useCallback(async () => {
    setJoining(true)
    setError(null)
    try {
      // Mobile-friendly constraints: prefer front camera, fall back to audio-only
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        })
      } catch {
        // video failed — try audio-only
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        setCamOn(false)
        toast('camera unavailable', { description: 'joined with audio only' })
      }
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        // iOS Safari requires muted + playsInline for autoplay
        localVideoRef.current.muted = true
        localVideoRef.current.play().catch(() => {})
      }
      setJoined(true)
      mountedRef.current = true
      // Fetch fresh TURN credentials (async, non-blocking — uses STUN until ready)
      getIceServers().then((servers) => { iceServersRef.current = servers }).catch(() => {})
      sendPresence()
      void poll()
      pollTimerRef.current = setInterval(() => {
        void poll()
      }, POLL_INTERVAL_MS)
      toast.success('joined the room', { description: 'you are live' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed to access camera/mic'
      setError(msg)
      toast.error('could not join', { description: msg })
    } finally {
      setJoining(false)
    }
  }, [sendPresence, poll])

  // ---- leave: stop all tracks, close all PCs, notify server ----
  const leave = useCallback(() => {
    for (const [, pc] of pcRef.current) {
      try {
        pc.close()
      } catch {
        /* ignore */
      }
    }
    pcRef.current.clear()
    knownPeersRef.current.clear()
    pendingIceRef.current.clear()
    const stream = localStreamRef.current
    if (stream) {
      for (const t of stream.getTracks()) t.stop()
      localStreamRef.current = null
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    postSignal({ op: 'leave', sessionId })
    setJoined(false)
    setPeers([])
  }, [sessionId, postSignal])

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

  // ---- create / join a private room ----
  const createPrivateRoom = useCallback(() => {
    const code = generateRoomCode()
    setRoom(code)
    setShowRoomDialog(false)
    toast.success('private room created', { description: `code: ${code}` })
  }, [])

  const joinPrivateRoom = useCallback(() => {
    const code = roomInput.trim().toUpperCase()
    if (code.length < 4) {
      toast.error('invalid code', { description: 'enter at least 4 characters' })
      return
    }
    setRoom(code)
    setShowRoomDialog(false)
    toast.success(`joining room ${code}`)
  }, [roomInput])

  const copyRoomCode = useCallback(() => {
    navigator.clipboard?.writeText(room).then(() => {
      setCopied(true)
      toast.success('room code copied')
      setTimeout(() => setCopied(false), 1500)
    })
  }, [room])

  // ---- cleanup on unmount ----
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
      for (const [, pc] of pcRef.current) {
        try {
          pc.close()
        } catch {
          /* ignore */
        }
      }
      pcRef.current.clear()
      const stream = localStreamRef.current
      if (stream) for (const t of stream.getTracks()) t.stop()
      postSignal({ op: 'leave', sessionId })
    }
  }, [sessionId, postSignal])

  // ---- not joined yet: show the join gate ----
  if (!joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-fuchsia-500/30 to-violet-600/20 text-fuchsia-100"
        >
          <Video className="h-10 w-10" />
        </motion.div>
        <div>
          <h3 className="text-xl font-semibold text-white">facetime</h3>
          <p className="mt-1 max-w-sm text-sm text-white/50">
            {room === 'public'
              ? 'the public video room. enable your camera + mic to talk with anyone here.'
              : `private room ${room}. share the code so others can join.`}
          </p>
        </div>

        {/* Room switcher */}
        <div className="flex items-center gap-2 text-xs text-white/50">
          {room === 'public' ? (
            <span className="rounded-full bg-white/8 px-3 py-1">public room</span>
          ) : (
            <button
              onClick={copyRoomCode}
              className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/15 px-3 py-1 text-fuchsia-200 ring-1 ring-inset ring-fuchsia-400/30"
              title="copy code"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              room {room}
            </button>
          )}
          <button
            onClick={() => setShowRoomDialog(true)}
            className="inline-flex items-center gap-1 rounded-full glass-subtle px-3 py-1 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            <DoorOpen className="h-3 w-3" />
            {room === 'public' ? 'private room' : 'switch room'}
          </button>
        </div>

        {error && (
          <div className="max-w-sm rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
        <button
          onClick={join}
          disabled={joining}
          className="glass-sheen inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 px-6 py-3 text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
        >
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
          {joining ? 'joining…' : 'join with camera + mic'}
        </button>
        <p className="text-[11px] text-white/30">
          you'll be asked to allow camera + microphone access
        </p>

        {/* Room dialog */}
        <AnimatePresence>
          {showRoomDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
              onClick={() => setShowRoomDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-3xl glass-strong glass-sheen p-6"
              >
                <h3 className="text-lg font-semibold text-white">video rooms</h3>
                <p className="mt-1 text-xs text-white/50">
                  create a private room (get a code) or join one with a code.
                </p>
                <div className="mt-4 space-y-3">
                  <button
                    onClick={createPrivateRoom}
                    className="glass-sheen flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-fuchsia-500/60 to-violet-600/60 px-4 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
                  >
                    <DoorOpen className="h-4 w-4" />
                    create private room
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
                      setRoom('public')
                      setShowRoomDialog(false)
                    }}
                    className="w-full rounded-xl px-4 py-2 text-xs text-white/50 transition-colors hover:bg-white/8 hover:text-white"
                  >
                    use public room
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ---- joined: show the video grid + controls ----
  const peerCount = peers.length
  const totalInRoom = peerCount + 1

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
        <Video className="h-5 w-5 text-fuchsia-300" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {room === 'public' ? 'facetime' : `room ${room}`}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px]',
                connected ? 'text-emerald-300' : 'text-amber-300',
              )}
            >
              {connected ? (
                <>
                  <Radio className="h-2.5 w-2.5 animate-pulse" /> live
                </>
              ) : (
                'reconnecting…'
              )}
            </span>
          </div>
          <p className="truncate text-xs text-white/45">
            <Users className="mr-1 inline h-3 w-3" />
            {totalInRoom} {totalInRoom === 1 ? 'person' : 'people'} in the room
          </p>
        </div>
        {/* copy room code (private rooms) */}
        {room !== 'public' && (
          <button
            onClick={copyRoomCode}
            className="inline-flex items-center gap-1.5 rounded-xl glass-subtle px-2.5 py-1.5 text-[11px] text-fuchsia-200 transition-colors hover:bg-white/15"
            title="copy room code"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {room}
          </button>
        )}
      </div>

      {/* video grid */}
      <div className="flex-1 overflow-y-auto p-4 glass-scroll">
        <div
          className={cn(
            'grid gap-3',
            totalInRoom <= 1 && 'grid-cols-1',
            totalInRoom === 2 && 'grid-cols-1 sm:grid-cols-2',
            totalInRoom >= 3 && totalInRoom <= 4 && 'grid-cols-2',
            totalInRoom >= 5 && 'grid-cols-2 lg:grid-cols-3',
          )}
        >
          <VideoTile
            label={`${profile.name} (you)`}
            colorClass={profile.color}
            videoRef={localVideoRef}
            mirrored
            camOn={camOn}
            isLocal
          />
          <AnimatePresence mode="popLayout">
            {peers.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25 }}
              >
                <VideoTile
                  label={p.user}
                  colorClass={p.color}
                  avatar={p.avatar}
                  connectionState={peerStates[p.id] || 'new'}
                  videoRefCallback={(el) => {
                    if (el) remoteVideoRefs.current.set(p.id, el)
                    else remoteVideoRefs.current.delete(p.id)
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {peerCount === 0 && (
          <div className="mt-6 text-center text-sm text-white/40">
            {room === 'public'
              ? "you're the only one here. share this page — others who open facetime will join automatically."
              : `share the room code ${room} so others can join.`}
          </div>
        )}
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-3 border-t border-white/10 p-4">
        <button
          onClick={toggleMic}
          title={micOn ? 'mute' : 'unmute'}
          className={cn(
            'grid h-12 w-12 place-items-center rounded-2xl transition-all',
            micOn ? 'glass-subtle text-white hover:bg-white/15' : 'bg-rose-500/30 text-rose-200 hover:bg-rose-500/40',
          )}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          onClick={toggleCam}
          title={camOn ? 'stop camera' : 'start camera'}
          className={cn(
            'grid h-12 w-12 place-items-center rounded-2xl transition-all',
            camOn ? 'glass-subtle text-white hover:bg-white/15' : 'bg-rose-500/30 text-rose-200 hover:bg-rose-500/40',
          )}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>
        <button
          onClick={leave}
          title="leave call"
          className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-600/60 text-white transition-all hover:bg-rose-600"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

function VideoTile({
  label,
  colorClass,
  videoRef,
  videoRefCallback,
  mirrored,
  camOn,
  isLocal,
  avatar,
  connectionState,
}: {
  label: string
  colorClass: string
  videoRef?: React.RefObject<HTMLVideoElement | null>
  videoRefCallback?: (el: HTMLVideoElement | null) => void
  mirrored?: boolean
  camOn?: boolean
  isLocal?: boolean
  avatar?: string
  connectionState?: string
}) {
  const isLive = connectionState === 'connected' || connectionState === 'completed'
  const isConnecting =
    !isLocal &&
    !isLive &&
    connectionState !== 'failed' &&
    connectionState !== 'closed'

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/40">
      <video
        ref={videoRef || videoRefCallback}
        autoPlay
        playsInline
        muted={isLocal}
        className={cn('h-full w-full object-cover', mirrored && 'scale-x-[-1]')}
      />
      {/* Connecting overlay — shows avatar + status while the peer connection establishes */}
      {isConnecting && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-violet-900/40 to-fuchsia-900/30">
          <div className="flex flex-col items-center gap-2">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15">
              {avatar && avatar.startsWith('data:') ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : avatar && avatar.length <= 4 && avatar.length > 0 ? (
                <span className="text-2xl">{avatar}</span>
              ) : (
                <span className={cn('text-lg font-bold', colorClass)}>
                  {label.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-[11px] text-white/50">
              {connectionState === 'new' || !connectionState
                ? 'waiting…'
                : connectionState === 'checking'
                  ? 'connecting…'
                  : connectionState}
            </span>
          </div>
        </div>
      )}
      {/* Failed overlay */}
      {connectionState === 'failed' && (
        <div className="absolute inset-0 grid place-items-center bg-rose-950/40">
          <span className="text-xs text-rose-300">connection failed · retrying…</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-sm">
        <span className={cn('text-xs font-semibold', colorClass)}>{label}</span>
        {isLocal && !camOn && <VideoOff className="h-3 w-3 text-rose-300" />}
        {!isLocal && isLive && (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]" />
        )}
      </div>
      {isLocal && !camOn && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-violet-900/40 to-fuchsia-900/30">
          <VideoOff className="h-8 w-8 text-white/30" />
        </div>
      )}
    </div>
  )
}
