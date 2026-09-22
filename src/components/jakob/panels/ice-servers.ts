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
  // Metered STUN
  { urls: 'stun:stun.relay.metered.ca:80' },
  // Google STUN (backup)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Metered TURN (relay — this is what makes connections work behind firewalls)
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: '0061e8c46f003a057211190c',
    credential: 'tztJo1nb3m+DaCb8',
  },
  {
    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
    username: '0061e8c46f003a057211190c',
    credential: 'tztJo1nb3m+DaCb8',
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: '0061e8c46f003a057211190c',
    credential: 'tztJo1nb3m+DaCb8',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: '0061e8c46f003a057211190c',
    credential: 'tztJo1nb3m+DaCb8',
  },
]

/** Returns the static ICE servers (no async fetch needed — simpler + more reliable). */
export async function getIceServers(): Promise<RTCIceServer[]> {
  return ICE_SERVERS
}
