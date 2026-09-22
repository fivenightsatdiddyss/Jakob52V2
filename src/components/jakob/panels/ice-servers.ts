'use client'

/**
 * ICE server configuration for WebRTC.
 *
 * Uses multiple STUN servers (for NAT discovery) + free TURN servers (for
 * relay when direct P2P fails, e.g. behind school/corporate firewalls).
 *
 * The TURN servers are free public ones. If they go down, STUN-only connections
 * will still work for users on standard home networks.
 */

export const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers (NAT discovery) — very reliable
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // OpenRelay free TURN servers (relay for strict NATs/firewalls)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

/** Returns the static ICE servers (no async fetch needed — simpler + more reliable). */
export async function getIceServers(): Promise<RTCIceServer[]> {
  return ICE_SERVERS
}
