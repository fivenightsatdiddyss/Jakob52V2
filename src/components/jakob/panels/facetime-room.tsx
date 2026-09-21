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
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
}

const POLL_INTERVAL_MS = 1500
const PRESENCE_KEEPALIVE_MS = 8000
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

/**
 * FacetimeRoom — a public WebRTC video room (mesh topology).
 *
 * All connected users see + hear each other. No room codes. Signaling
 * (peer discovery + SDP/ICE exchange) goes through /api/facetime with polling;
 * the media itself flows peer-to-peer via WebRTC.
 *
 * Mute / camera-off toggle the local tracks (the stream stays connected).
 */
export default function FacetimeRoom({ profile, sessionId }: FacetimeRoomProps) {
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [connected, setConnected] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  // remote video elements keyed by peer sessionId
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  // RTCPeerConnections keyed by peer sessionId
  const pcRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  // known peer sessionIds (so we detect new peers)
  const knownPeersRef = useRef<Set<string>>(new Set())
  // profile ref (so polling callbacks see latest)
  const profileRef = useRef(profile)
  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPresenceRef = useRef<number>(0)
  const mountedRef = useRef<boolean>(true)

  // ---- POST helper ----
  const postSignal = useCallback((body: Record<string, unknown>) => {
    if (!mountedRef.current) return
    void fetch('/api/facetime', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      // add local tracks
      const stream = localStreamRef.current
      if (stream) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream)
        }
      }
      // ICE candidates → send to the remote peer via signaling
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
      // remote track → attach to a video element
      pc.ontrack = (e) => {
        const el = remoteVideoRefs.current.get(peerId)
        if (el && e.streams[0]) {
          el.srcObject = e.streams[0]
          el.play().catch(() => {})
        }
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          // best-effort: close + remove; the next poll will rediscover
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

  // ---- initiate a connection to a new peer (I'm the initiator) ----
  const initiateConnection = useCallback(
    async (peerId: string) => {
      let pc = pcRef.current.get(peerId)
      if (!pc) pc = createPeerConnection(peerId)
      if (pc.signalingState !== 'stable') return
      try {
        const offer = await pc.createOffer()
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
      const res = await fetch(`/api/facetime?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`http ${res.status}`)
      const data = (await res.json()) as { peers?: Peer[]; signals?: Signal[] }
      if (!mountedRef.current) return
      setConnected(true)

      const peerList = Array.isArray(data.peers) ? data.peers : []
      setPeers(peerList.filter((p) => p.id !== sessionId))

      // discover new peers + initiate connections
      // To avoid glare (both sides offering), the peer with the
      // lexicographically-smaller sessionId initiates.
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
          if (pc.signalingState !== 'stable') continue
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
          } catch (err) {
            console.error('answer failed', err)
          }
        } else if (sig.type === 'answer') {
          if (!pc) continue
          if (pc.signalingState !== 'have-local-offer') continue
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit))
          } catch (err) {
            console.error('set answer failed', err)
          }
        } else if (sig.type === 'ice') {
          if (!pc) {
            // ICE might arrive before the offer; create the pc so we can buffer
            pc = createPeerConnection(fromId)
          }
          try {
            await pc.addIceCandidate(new RTCIceCandidate(sig.data as RTCIceCandidateInit))
          } catch (err) {
            // candidates can arrive before remote description — ignore
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
  }, [sessionId, joined, createPeerConnection, postSignal, sendPresence, initiateConnection])

  // ---- join: get camera/mic, start polling ----
  const join = useCallback(async () => {
    setJoining(true)
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.play().catch(() => {})
      }
      setJoined(true)
      mountedRef.current = true
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
    // close peer connections
    for (const [, pc] of pcRef.current) {
      try {
        pc.close()
      } catch {
        /* ignore */
      }
    }
    pcRef.current.clear()
    knownPeersRef.current.clear()
    // stop local tracks
    const stream = localStreamRef.current
    if (stream) {
      for (const t of stream.getTracks()) t.stop()
      localStreamRef.current = null
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    // stop polling
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    // notify server
    postSignal({ op: 'leave', sessionId })
    setJoined(false)
    setPeers([])
  }, [sessionId, postSignal])

  // ---- toggle mic ----
  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const next = !micOn
    for (const track of stream.getAudioTracks()) {
      track.enabled = next
    }
    setMicOn(next)
  }, [micOn])

  // ---- toggle camera ----
  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const next = !camOn
    for (const track of stream.getVideoTracks()) {
      track.enabled = next
    }
    setCamOn(next)
  }, [camOn])

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
      if (stream) {
        for (const t of stream.getTracks()) t.stop()
      }
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
            a public video room. enable your camera + mic to talk with anyone here. no codes, no rooms — everyone in this channel sees + hears each other.
          </p>
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
          {joining ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Phone className="h-4 w-4" />
          )}
          {joining ? 'joining…' : 'join with camera + mic'}
        </button>
        <p className="text-[11px] text-white/30">
          you'll be asked to allow camera + microphone access
        </p>
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
            <span className="text-sm font-semibold text-white">facetime</span>
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
          {/* local video */}
          <VideoTile
            label={`${profile.name} (you)`}
            colorClass={profile.color}
            videoRef={localVideoRef}
            mirrored
            camOn={camOn}
            isLocal
          />
          {/* remote videos */}
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
            you're the only one here. share this page — others who open facetime will join automatically.
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
            micOn
              ? 'glass-subtle text-white hover:bg-white/15'
              : 'bg-rose-500/30 text-rose-200 hover:bg-rose-500/40',
          )}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          onClick={toggleCam}
          title={camOn ? 'stop camera' : 'start camera'}
          className={cn(
            'grid h-12 w-12 place-items-center rounded-2xl transition-all',
            camOn
              ? 'glass-subtle text-white hover:bg-white/15'
              : 'bg-rose-500/30 text-rose-200 hover:bg-rose-500/40',
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

/** A single video tile (local or remote). */
function VideoTile({
  label,
  colorClass,
  videoRef,
  videoRefCallback,
  mirrored,
  camOn,
  isLocal,
}: {
  label: string
  colorClass: string
  videoRef?: React.RefObject<HTMLVideoElement | null>
  videoRefCallback?: (el: HTMLVideoElement | null) => void
  mirrored?: boolean
  camOn?: boolean
  isLocal?: boolean
}) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/40">
      <video
        ref={videoRef || videoRefCallback}
        autoPlay
        playsInline
        muted={isLocal}
        className={cn('h-full w-full object-cover', mirrored && 'scale-x-[-1]')}
      />
      {/* label */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-sm">
        <span className={cn('text-xs font-semibold', colorClass)}>{label}</span>
        {isLocal && !camOn && (
          <VideoOff className="h-3 w-3 text-rose-300" />
        )}
      </div>
      {/* placeholder when no video */}
      {isLocal && !camOn && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-violet-900/40 to-fuchsia-900/30">
          <VideoOff className="h-8 w-8 text-white/30" />
        </div>
      )}
    </div>
  )
}
