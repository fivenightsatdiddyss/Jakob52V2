'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, PhoneOff, Phone, Users, Loader2, Radio, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getIceServers } from './ice-servers'

type Profile = { name: string; color: string; avatar: string }
type Peer = { id: string; user: string; color: string; avatar: string }
type RtcSignal = { id: string; from: string; type: 'offer' | 'answer' | 'ice'; data: unknown }

type VoicechatRoomProps = { profile: Profile; sessionId: string }

const POLL_INTERVAL_MS = 2000 // slower polling = less lag
const PRESENCE_KEEPALIVE_MS = 8000
const TALK_THRESHOLD = 0.08

/**
 * VoicechatRoom — audio-only WebRTC room.
 * Uses /api/chat (same as text chat) for presence + signaling.
 * Shows avatars with green ring when speaking (Web Audio API AnalyserNode).
 */
export default function VoicechatRoom({ profile, sessionId }: VoicechatRoomProps) {
  const [joined, setJoined] = useState(false)
  const joinedRef = useRef(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [micOn, setMicOn] = useState(true)
  const [connected, setConnected] = useState(false)
  const [talkingIds, setTalkingIds] = useState<Set<string>>(new Set())
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set())

  const localStreamRef = useRef<MediaStream | null>(null)
  const pcRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const knownPeersRef = useRef<Set<string>>(new Set())
  const profileRef = useRef(profile)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPresenceRef = useRef<number>(0)
  const mountedRef = useRef<boolean>(true)
  const iceServersRef = useRef<RTCIceServer[]>([])
  const analyserRef = useRef<Map<string, AnalyserNode>>(new Map())
  const rafRef = useRef<number>(0)
  const mutedPeersRef = useRef<Set<string>>(new Set())

  useEffect(() => { profileRef.current = profile }, [profile])
  useEffect(() => { mutedPeersRef.current = mutedPeers }, [mutedPeers])

  const postChat = useCallback((body: Record<string, unknown>) => {
    if (!mountedRef.current) return
    void fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {})
  }, [])

  const sendPresence = useCallback(() => {
    const p = profileRef.current
    postChat({ op: 'presence', sessionId, user: p.name, color: p.color, avatar: p.avatar, channel: 'voicechat' })
    lastPresenceRef.current = Date.now()
  }, [sessionId, postChat])

  const setupAnalyser = useCallback((stream: MediaStream, id: string) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      analyserRef.current.set(id, analyser)
    } catch { /* ignore */ }
  }, [])

  // audio level monitoring
  useEffect(() => {
    if (!joined) return
    const check = () => {
      const talking = new Set<string>()
      const localAnalyser = analyserRef.current.get('local')
      if (localAnalyser) {
        const data = new Uint8Array(localAnalyser.frequencyBinCount)
        localAnalyser.getByteFrequencyData(data)
        let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i]
        if (sum / data.length / 255 > TALK_THRESHOLD) talking.add('local')
      }
      for (const [id, analyser] of analyserRef.current) {
        if (id === 'local') continue
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i]
        if (sum / data.length / 255 > TALK_THRESHOLD) talking.add(id)
      }
      setTalkingIds(talking)
      rafRef.current = requestAnimationFrame(check)
    }
    rafRef.current = requestAnimationFrame(check)
    return () => cancelAnimationFrame(rafRef.current)
  }, [joined])

  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
    const stream = localStreamRef.current
    if (stream) { for (const track of stream.getTracks()) { try { pc.addTrack(track, stream) } catch {} } }
    pc.onicecandidate = (e) => {
      if (e.candidate) postChat({ op: 'rtcSignal', from: sessionId, to: peerId, type: 'ice', data: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => {
      const el = audioRefs.current.get(peerId)
      if (el && e.streams[0]) {
        el.srcObject = e.streams[0]
        el.play().catch(() => {})
        setupAnalyser(e.streams[0], peerId)
      }
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') { try { pc.restartIce() } catch {} }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { try { pc.close() } catch {} ; pcRef.current.delete(peerId) }
    }
    pcRef.current.set(peerId, pc)
    return pc
  }, [sessionId, postChat, setupAnalyser])

  const flushPendingIce = useCallback(async (peerId: string) => {
    const pc = pcRef.current.get(peerId)
    const pending = pendingIceRef.current.get(peerId)
    if (!pc || !pending) return
    for (const cand of pending) { try { await pc.addIceCandidate(new RTCIceCandidate(cand)) } catch {} }
    pendingIceRef.current.delete(peerId)
  }, [])

  const initiateConnection = useCallback(async (peerId: string) => {
    let pc = pcRef.current.get(peerId)
    if (!pc) pc = createPeerConnection(peerId)
    if (pc.signalingState !== 'stable') return
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false })
      await pc.setLocalDescription(offer)
      postChat({ op: 'rtcSignal', from: sessionId, to: peerId, type: 'offer', data: offer.toJSON ? offer.toJSON() : offer })
    } catch (err) { console.error('offer failed', err) }
  }, [sessionId, postChat, createPeerConnection])

  const poll = useCallback(async () => {
    if (!mountedRef.current || !joinedRef.current) return
    try {
      const res = await fetch(`/api/chat?channel=voicechat&sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`http ${res.status}`)
      const data = (await res.json()) as { roster?: Array<Peer & { channel?: string }>; rtcSignals?: RtcSignal[] }
      if (!mountedRef.current) return
      setConnected(true)

      const allRoster = Array.isArray(data.roster) ? data.roster : []
      const voicePeers = allRoster.filter((p) => p.id !== sessionId && p.channel === 'voicechat')
      setPeers(voicePeers)

      for (const p of voicePeers) {
        if (!knownPeersRef.current.has(p.id)) {
          knownPeersRef.current.add(p.id)
          if (sessionId < p.id) void initiateConnection(p.id)
        }
      }
      const currentIds = new Set(voicePeers.map((p) => p.id))
      for (const id of [...knownPeersRef.current]) {
        if (id !== sessionId && !currentIds.has(id)) {
          knownPeersRef.current.delete(id)
          const pc = pcRef.current.get(id)
          if (pc) { try { pc.close() } catch {} ; pcRef.current.delete(id) }
          pendingIceRef.current.delete(id)
          analyserRef.current.delete(id)
        }
      }

      const signals = Array.isArray(data.rtcSignals) ? data.rtcSignals : []
      for (const sig of signals) {
        const fromId = sig.from
        if (fromId === sessionId) continue
        let pc = pcRef.current.get(fromId)
        if (sig.type === 'offer') {
          if (!pc) pc = createPeerConnection(fromId)
          if (pc.signalingState !== 'stable') { try { await pc.setLocalDescription({ type: 'rollback' }) } catch {} }
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            postChat({ op: 'rtcSignal', from: sessionId, to: fromId, type: 'answer', data: answer.toJSON ? answer.toJSON() : answer })
            void flushPendingIce(fromId)
          } catch (err) { console.error('answer failed', err) }
        } else if (sig.type === 'answer') {
          if (!pc || pc.signalingState !== 'have-local-offer') continue
          try { await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit)); void flushPendingIce(fromId) } catch (err) { console.error('set answer failed', err) }
        } else if (sig.type === 'ice') {
          if (!pc) pc = createPeerConnection(fromId)
          if (pc.remoteDescription) { try { await pc.addIceCandidate(new RTCIceCandidate(sig.data as RTCIceCandidateInit)) } catch {} }
          else { const buf = pendingIceRef.current.get(fromId) || []; buf.push(sig.data as RTCIceCandidateInit); pendingIceRef.current.set(fromId, buf) }
        }
      }

      if (Date.now() - lastPresenceRef.current > PRESENCE_KEEPALIVE_MS) sendPresence()
    } catch { if (!mountedRef.current) return; setConnected(false) }
  }, [sessionId, joined, createPeerConnection, postChat, sendPresence, initiateConnection, flushPendingIce])

  const join = useCallback(async () => {
    setJoining(true)
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream
      setupAnalyser(stream, 'local')
      setJoined(true)
      joinedRef.current = true
      mountedRef.current = true
      // AWAIT TURN credentials before polling
      try {
        iceServersRef.current = await getIceServers()
      } catch {
        iceServersRef.current = [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:global.relay.metered.ca:443',
            username: '0061e8c46f003a057211190c',
            credential: 'tztJo1nb3m+DaCb8',
          },
        ]
      }
      sendPresence()
      void poll()
      pollTimerRef.current = setInterval(() => { void poll() }, POLL_INTERVAL_MS)
      toast.success('joined voice chat', { description: 'you are live' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed to access microphone'
      setError(msg)
      toast.error('could not join', { description: msg })
    } finally { setJoining(false) }
  }, [sendPresence, poll, setupAnalyser])

  const leave = useCallback(() => {
    for (const [, pc] of pcRef.current) { try { pc.close() } catch {} }
    pcRef.current.clear(); knownPeersRef.current.clear(); pendingIceRef.current.clear(); analyserRef.current.clear()
    const stream = localStreamRef.current
    if (stream) { for (const t of stream.getTracks()) t.stop(); localStreamRef.current = null }
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    postChat({ op: 'presence', sessionId, user: profileRef.current.name, color: profileRef.current.color, avatar: profileRef.current.avatar, channel: 'general' })
    setJoined(false); joinedRef.current = false; setPeers([]); setTalkingIds(new Set())
  }, [sessionId, postChat])

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const next = !micOn
    for (const track of stream.getAudioTracks()) track.enabled = next
    setMicOn(next)
  }, [micOn])

  const toggleMutePeer = useCallback((peerId: string) => {
    setMutedPeers((prev) => {
      const next = new Set(prev)
      if (next.has(peerId)) next.delete(peerId); else next.add(peerId)
      const el = audioRefs.current.get(peerId)
      if (el) el.muted = next.has(peerId)
      return next
    })
  }, [])

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

  if (!joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-500/30 to-teal-600/20 text-emerald-100">
          <Mic className="h-10 w-10" />
        </motion.div>
        <div>
          <h3 className="text-xl font-semibold text-white">voice chat</h3>
          <p className="mt-1 max-w-sm text-sm text-white/50">a public audio room. enable your mic to talk with anyone here. your avatar lights up green when you speak.</p>
        </div>
        {error && <div className="max-w-sm rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200">{error}</div>}
        <button onClick={join} disabled={joining}
          className="glass-sheen inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-emerald-500/60 to-teal-600/60 px-6 py-3 text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-60">
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
          {joining ? 'joining…' : 'join with microphone'}
        </button>
        <p className="text-[11px] text-white/30">you'll be asked to allow microphone access</p>
      </div>
    )
  }

  const totalInRoom = peers.length + 1
  const isLocalTalking = talkingIds.has('local')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
        <Mic className="h-5 w-5 text-emerald-300" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">voice chat</span>
            <span className={cn('inline-flex items-center gap-1 text-[10px]', connected ? 'text-emerald-300' : 'text-amber-300')}>
              {connected ? <><Radio className="h-2.5 w-2.5 animate-pulse" /> live</> : 'reconnecting…'}
            </span>
          </div>
          <p className="truncate text-xs text-white/45">
            <Users className="mr-1 inline h-3 w-3" />
            {totalInRoom} {totalInRoom === 1 ? 'person' : 'people'} · {talkingIds.size} speaking
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 glass-scroll">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <VoiceAvatar label={`${profile.name} (you)`} colorClass={profile.color} avatar={profile.avatar} talking={isLocalTalking} muted={!micOn} isLocal />
          <AnimatePresence mode="popLayout">
            {peers.map((p) => (
              <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.25 }}>
                <VoiceAvatar label={p.user} colorClass={p.color} avatar={p.avatar} talking={talkingIds.has(p.id)} muted={mutedPeers.has(p.id)} onToggleMute={() => toggleMutePeer(p.id)}
                  audioRefCallback={(el) => { if (el) audioRefs.current.set(p.id, el); else audioRefs.current.delete(p.id) }} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {peers.length === 0 && <div className="mt-6 text-center text-sm text-white/40">you're the only one here. share this page — others who join voice chat will connect automatically.</div>}
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-white/10 p-4">
        <button onClick={toggleMic} title={micOn ? 'mute' : 'unmute'}
          className={cn('grid h-12 w-12 place-items-center rounded-2xl transition-all', micOn ? 'glass-subtle text-white hover:bg-white/15' : 'bg-rose-500/30 text-rose-200 hover:bg-rose-500/40')}>
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button onClick={leave} title="leave call"
          className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-600/60 text-white transition-all hover:bg-rose-600">
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

function VoiceAvatar({ label, colorClass, avatar, talking, muted, isLocal, onToggleMute, audioRefCallback }: {
  label: string; colorClass: string; avatar: string; talking: boolean; muted?: boolean; isLocal?: boolean; onToggleMute?: () => void; audioRefCallback?: (el: HTMLAudioElement | null) => void
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn('relative grid h-20 w-20 place-items-center overflow-hidden rounded-full transition-all duration-200', talking ? 'ring-4 ring-emerald-400 shadow-[0_0_24px_4px_rgba(52,211,153,0.5)]' : 'ring-1 ring-white/10')}>
        {avatar.startsWith('data:') || avatar.startsWith('http') ? (
          <img src={avatar} alt={label} className="h-full w-full object-cover" />
        ) : avatar.length <= 4 && avatar.length > 0 ? (
          <div className="grid h-full w-full place-items-center bg-white/10 text-3xl">{avatar}</div>
        ) : (
          <div className={cn('grid h-full w-full place-items-center bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30 text-xl font-bold text-white', colorClass)}>
            {label.slice(0, 2).toUpperCase()}
          </div>
        )}
        {muted && <div className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full bg-rose-600 ring-2 ring-black/40"><MicOff className="h-3.5 w-3.5 text-white" /></div>}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={cn('max-w-[80px] truncate text-xs font-medium', talking ? 'text-emerald-300' : 'text-white/70')}>{label}</span>
        {!isLocal && onToggleMute && (
          <button onClick={onToggleMute} title={muted ? 'unmute' : 'mute'} className="grid h-5 w-5 place-items-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white">
            {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>
        )}
      </div>
      {!isLocal && audioRefCallback && <audio ref={audioRefCallback} autoPlay />}
    </div>
  )
}
