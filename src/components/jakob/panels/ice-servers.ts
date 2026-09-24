'use client'

// Hardcoded ICE servers from Metered — no async fetch needed.
// This eliminates the race condition where peer connections were created
// before TURN credentials were available.
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'stun:stun.l.google.com:19302' },
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

export async function getIceServers(): Promise<RTCIceServer[]> {
  return ICE_SERVERS
}
