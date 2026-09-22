'use client'

/**
 * ICE server configuration for WebRTC.
 *
 * Fetches fresh TURN credentials from Metered's REST API on each call using
 * the API key. This generates ephemeral credentials that are harder to abuse
 * than static ones. Falls back to the static credentials if the API is down.
 */

const METERED_API_KEY = '5313fa3b159612e6737c1c0beb66f5fa0a63'
const METERED_API_URL = 'https://studyixl.metered.live/api/v1/turn/credentials?apiKey=' + METERED_API_KEY

// Static fallback credentials (used if the API fetch fails)
const STATIC_ICE: RTCIceServer[] = [
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

// Cache so we only fetch once per session
let cachedServers: RTCIceServer[] | null = null

/**
 * Fetches fresh TURN credentials from Metered's REST API.
 * Falls back to static credentials if the API is unreachable.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cachedServers) return cachedServers

  try {
    const res = await fetch(METERED_API_URL)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        cachedServers = data as RTCIceServer[]
        return cachedServers
      }
    }
  } catch {
    // API unreachable — fall through to static
  }

  cachedServers = STATIC_ICE
  return cachedServers
}

/** Static fallback (used for the initial iceServersRef before the fetch completes) */
export const ICE_SERVERS = STATIC_ICE
