// Daily link drops — grouped by date. Each day has a list of sites, each site
// has one or more mirror links. The panel renders each day as a collapsible
// dropdown.

export type LinkSite = {
  name: string
  /** one or more mirror URLs for the same site */
  links: string[]
  /** a short description / tagline */
  tagline: string
  /** tailwind gradient for the icon tile */
  gradient: string
}

export type DailyDrop = {
  /** ISO date string (YYYY-MM-DD) — used for sorting + the date label */
  date: string
  /** optional label override; otherwise derived from the date */
  label?: string
  sites: LinkSite[]
}

export const DAILY_LINKS: DailyDrop[] = [
  {
    date: new Date().toISOString().slice(0, 10), // today
    sites: [
      {
        name: 'Studyhub',
        tagline: 'study-shaped stealth browser',
        gradient: 'from-blue-500/40 to-cyan-600/30',
        links: [
          'https://studyroost.s3.amazonaws.com/index.html',
          'https://studyroost.s3.us-east-1.amazonaws.com/index.html',
          'https://studyroost.s3.dualstack.us-east-1.amazonaws.com/index.html',
          'https://studyhub.kiafinans.se/',
          'https://studyhub.gifga.com/',
        ],
      },
      {
        name: 'Tung Tung',
        tagline: 'rhythmic & relentless',
        gradient: 'from-rose-500/40 to-pink-600/30',
        links: [
          'https://s3.amazonaws.com/vcsa-yt/index.html',
          'https://vcsa-yt.s3.amazonaws.com/index.html',
          'https://vcsa-yt.s3-external-1.amazonaws.com/index.html',
          'https://ttbest.s3.us-east-1.amazonaws.com/index.html',
          'https://zoxh.s3.amazonaws.com/index.html',
        ],
      },
    ],
  },
]

/** Format an ISO date (YYYY-MM-DD) as a readable label. */
export function formatDateLabel(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

/** Is this date today? */
export function isToday(iso: string): boolean {
  return iso === new Date().toISOString().slice(0, 10)
}
