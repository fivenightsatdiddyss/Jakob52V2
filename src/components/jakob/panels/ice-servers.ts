'use client'

/**
 * Fetches fresh TURN server credentials from Metered's free TURN API.
 * The free tier allows 1GB/month of relay traffic — enough for testing.
 * Falls back to static OpenRelay TURN servers if the API is unreachable.
 *
 * This runs client-side (in the browser) so it works from any origin.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  const stun: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]

  // Try to fetch ephemeral TURN credentials from Metered's free API
  try {
    const res = await fetch('https://turn.metered.ca/api/v1/turn/credential?expirySeconds=3600', {
      method: 'GET',
      // Use no-cors mode as fallback — if the API supports CORS, great; if not,
      // we'll fall through to the static servers below.
    })
    if (res.ok) {
      const data = await res.json()
      if (data && Array.isArray(data.iceServers)) {
        return [...stun, ...data.iceServers]
      }
      // Some responses use a different shape
      if (data && data.username && data.password && data.uris) {
        return [
          ...stun,
          ...data.uris.map((u: string) => ({
            urls: u,
            username: data.username,
            credential: data.password,
          })),
        ]
      }
    }
  } catch {
    // API unreachable — fall through to static servers
  }

  // Fallback: static free TURN servers (OpenRelay — may be unreliable)
  return [
    ...stun,
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
}
