import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STRATUS_PORT = '3004'
const STRATUS_BASE = `http://localhost:${STRATUS_PORT}`
const API_KEY = 'sk_live_jakob52_cloud'

/**
 * Proxy to the stratus cloud gaming API (mini-service on port 3004).
 * The frontend calls this with ?endpoint=createSession|startGame|embed|etc.
 */

export async function GET(req: NextRequest) {
  const endpoint = req.nextUrl.searchParams.get('endpoint') || ''
  const id = req.nextUrl.searchParams.get('id') || ''

  if (endpoint === 'embed') {
    const res = await fetch(`${STRATUS_BASE}/cloud/v1/embed?id=${encodeURIComponent(id)}`)
    const html = await res.text()
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  if (endpoint === 'getQueue') {
    const uuid = req.nextUrl.searchParams.get('uuid') || ''
    const res = await fetch(`${STRATUS_BASE}/cloud/v1/getQueue?uuid=${encodeURIComponent(uuid)}&api_key=${API_KEY}`)
    const data = await res.text()
    return new Response(data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  return NextResponse.json({ error: 'unknown endpoint' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const endpoint = req.nextUrl.searchParams.get('endpoint') || ''
  const body = await req.text()

  if (endpoint === 'createSession') {
    const res = await fetch(`${STRATUS_BASE}/cloud/v1/createSession`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    return new Response(res.body, {
      headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
    })
  }

  if (endpoint === 'startGame' || endpoint === 'pingSession' || endpoint === 'quitSession') {
    const res = await fetch(`${STRATUS_BASE}/cloud/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body,
    })
    const data = await res.text()
    return new Response(data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  return NextResponse.json({ error: 'unknown endpoint' }, { status: 400 })
}
