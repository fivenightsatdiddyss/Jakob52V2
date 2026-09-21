// Curated list of unblocker / proxy services surfaced in the Links panel.
// Each has a vibe color (Tailwind gradient) and a short tagline.
// "daily" rotation picks a few featured ones per day based on the day-of-year.

export type ProxyLink = {
  name: string
  tagline: string
  gradient: string
  // A search URL used to discover/access the proxy through the in-site viewer.
  // (These brands rotate domains frequently, so we route through a search.)
  search: string
}

export const PROXY_LINKS: ProxyLink[] = [
  {
    name: 'Bull-33',
    tagline: 'the bull pen — games & apps',
    gradient: 'from-amber-500/40 to-orange-600/30',
    search: 'https://duckduckgo.com/?q=Bull-33+unblocked+games',
  },
  {
    name: 'Xylora',
    tagline: 'clean ui, deep catalog',
    gradient: 'from-violet-500/40 to-fuchsia-600/30',
    search: 'https://duckduckgo.com/?q=Xylora+proxy+unblocked',
  },
  {
    name: 'Space',
    tagline: 'drift through the void',
    gradient: 'from-sky-500/40 to-indigo-600/30',
    search: 'https://duckduckgo.com/?q=Space+unblocked+proxy',
  },
  {
    name: 'Triple T HD',
    tagline: 'high-def arcade',
    gradient: 'from-emerald-500/40 to-teal-600/30',
    search: 'https://duckduckgo.com/?q=Triple+T+HD+unblocked',
  },
  {
    name: 'Studyhub',
    tagline: 'school-shaped stealth',
    gradient: 'from-blue-500/40 to-cyan-600/30',
    search: 'https://duckduckgo.com/?q=Studyhub+unblocked',
  },
  {
    name: 'Tung Tung',
    tagline: 'rhythmic & relentless',
    gradient: 'from-rose-500/40 to-pink-600/30',
    search: 'https://duckduckgo.com/?q=Tung+Tung+unblocked+games',
  },
  {
    name: 'Strawberry',
    tagline: 'sweet & simple',
    gradient: 'from-red-500/40 to-rose-600/30',
    search: 'https://duckduckgo.com/?q=Strawberry+proxy+unblocked',
  },
  {
    name: 'Voya',
    tagline: 'voyage anywhere',
    gradient: 'from-cyan-500/40 to-blue-600/30',
    search: 'https://duckduckgo.com/?q=Voya+unblocked+proxy',
  },
  {
    name: 'Hyper',
    tagline: 'overclocked relay',
    gradient: 'from-fuchsia-500/40 to-purple-600/30',
    search: 'https://duckduckgo.com/?q=Hyper+unblocked+games',
  },
  {
    name: 'Nebula',
    tagline: 'clouded & quiet',
    gradient: 'from-indigo-500/40 to-violet-600/30',
    search: 'https://duckduckgo.com/?q=Nebula+unblocked+proxy',
  },
  {
    name: 'Citrus',
    tagline: 'fresh & zesty',
    gradient: 'from-yellow-500/40 to-amber-600/30',
    search: 'https://duckduckgo.com/?q=Citrus+unblocked+games',
  },
  {
    name: 'Aurora',
    tagline: 'polar glow relay',
    gradient: 'from-teal-500/40 to-emerald-600/30',
    search: 'https://duckduckgo.com/?q=Aurora+unblocked+proxy',
  },
]

/** Day-of-year (0-based) used for deterministic daily rotation. */
function dayOfYear(d = new Date()): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  const diff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start
  return Math.floor(diff / 86400000)
}

/** Return N featured proxies for "today" (deterministic, rotates daily). */
export function dailyFeatured(count = 3): ProxyLink[] {
  const base = dayOfYear()
  const out: ProxyLink[] = []
  for (let i = 0; i < count; i++) {
    out.push(PROXY_LINKS[(base + i) % PROXY_LINKS.length])
  }
  return out
}
