import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Self-contained web proxy.
 *
 * Fetches the target URL directly (server-side, no CORS issues), then:
 *  - For HTML: strips frame-busting headers (X-Frame-Options, CSP), rewrites
 *    resource URLs (img/script/css/link/srcset) and link hrefs to route back
 *    through this function, rewrites CSS url() inside <style> and inline styles,
 *    and injects a click/form interceptor so in-page navigation stays proxied.
 *  - For CSS: rewrites url() references to route through this function.
 *  - For other resources (images, scripts, fonts, etc.): passes the body
 *    through with the original Content-Type.
 *
 * No 3rd-party service (corsproxy.io) is used — the function does all fetching.
 * Works on Netlify serverless (each request is one invocation).
 */

/** Build a same-origin proxy URL so resources + link navigations stay proxied. */
function proxyUrl(u: string): string {
  return `/api/proxy?url=${encodeURIComponent(u)}`
}

/** Resolve a possibly-relative URL against the target page. */
function resolve(href: string, base: URL): string | null {
  try {
    if (/^(#|javascript:|mailto:|tel:|data:|blob:)/i.test(href)) return null
    return new URL(href, base).href
  } catch {
    return null
  }
}

const RESOURCE_ATTRS = ['src', 'data-src', 'data-href', 'poster', 'data']
const RESOURCE_TAGS_FOR_HREF = new Set(['link'])

/** Rewrite url(...) references inside CSS to route through this proxy. */
function rewriteCssUrls(css: string, base: URL): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q: string, raw: string) => {
    const abs = resolve(raw, base)
    if (!abs) return m
    return `url(${q}${proxyUrl(abs)}${q})`
  })
}

/** Rewrite an HTML document so resources + navigation route through /api/proxy. */
function rewriteHtml(html: string, target: URL): string {
  // Drop existing <base> tags (we resolve everything ourselves)
  html = html.replace(/<base\b[^>]*>/gi, '')

  // Walk every tag and rewrite its attributes
  html = html.replace(
    /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (_full, tag: string, attrs: string) => {
      const tagLower = tag.toLowerCase()
      let nextAttrs = attrs

      // href: link tags → proxy (resource); anchor tags → proxy (navigation)
      nextAttrs = nextAttrs.replace(
        /(\bhref\s*=\s*)("|')([^"']*)\2/gi,
        (_m, eq: string, q: string, val: string) => {
          const abs = resolve(val, target)
          if (!abs) return `${eq}${q}${val}${q}`
          return `${eq}${q}${proxyUrl(abs)}${q}`
        },
      )

      // resource src-like attrs → proxy
      for (const attr of RESOURCE_ATTRS) {
        const re = new RegExp(`(\\b${attr}\\s*=\\s*)("|')([^"']*)\\2`, 'gi')
        nextAttrs = nextAttrs.replace(re, (_m, eq: string, q: string, val: string) => {
          const abs = resolve(val, target)
          if (!abs) return `${eq}${q}${val}${q}`
          return `${eq}${q}${proxyUrl(abs)}${q}`
        })
      }

      // srcset → rewrite each candidate
      nextAttrs = nextAttrs.replace(
        /(\bsrcset\s*=\s*)("|')([^"']*)\2/gi,
        (_m, eq: string, q: string, val: string) => {
          const rewritten = val
            .split(',')
            .map((part) => {
              const trimmed = part.trim()
              if (!trimmed) return trimmed
              const [url, ...desc] = trimmed.split(/\s+/)
              const abs = resolve(url, target)
              return abs ? `${proxyUrl(abs)}${desc.length ? ' ' + desc.join(' ') : ''}` : trimmed
            })
            .join(', ')
          return `${eq}${q}${rewritten}${q}`
        },
      )

      // inline style url(...) → proxy
      nextAttrs = nextAttrs.replace(
        /(\bstyle\s*=\s*)("|')([^"']*)\2/gi,
        (_m, eq: string, q: string, val: string) => {
          return `${eq}${q}${rewriteCssUrls(val, target)}${q}`
        },
      )

      // CSS <style> blocks
      void tagLower
      return `<${tag}${nextAttrs}>`
    },
  )

  // CSS url() inside <style> blocks
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, body, close) => {
    return `${open}${rewriteCssUrls(body as string, target)}${close}`
  })

  // Inject a click/form interceptor so dynamic navigation stays proxied
  const interceptor = `<script>(function(){
    var T=${JSON.stringify(target.href)};
    function abs(u){try{return new URL(u,new URL(T)).href}catch(e){return null}}
    function px(u){return '/api/proxy?url='+encodeURIComponent(u)}
    document.addEventListener('click',function(e){
      var a=e.target.closest&&e.target.closest('a[href]');
      if(!a)return;
      var h=a.getAttribute('href');
      if(!h||/^(#|javascript:|mailto:|tel:|data:|blob:)/i.test(h))return;
      var u=abs(h);if(!u)return;
      a.setAttribute('href',px(u));
    },true);
    document.addEventListener('submit',function(e){
      var f=e.target;if(!f||!f.action)return;
      var u=abs(f.getAttribute('action')||f.action);if(!u)return;
      f.setAttribute('action',px(u));
    },true);
  })();</script>`

  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${interceptor}</head>`)
  } else {
    html = interceptor + html
  }

  return html
}

/** Fetch a URL directly (server-side). Returns text + metadata. */
async function fetchDirect(targetUrl: string): Promise<{
  status: number
  body: string
  contentType: string
  finalUrl: string
}> {
  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    cache: 'no-store',
  })

  const body = await res.text()
  const contentType = res.headers.get('content-type') || 'text/html; charset=utf-8'
  // res.url is the final URL after redirects — use it as the base for relative resolution
  return { status: res.status, body, contentType, finalUrl: res.url || targetUrl }
}

function errorPage(title: string, msg: string) {
  return new Response(
    `<html><body style="font-family:system-ui;background:#0a0518;color:#e9d5ff;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:2rem">
      <div>
        <h2 style="color:#f0abfc;margin:0 0 .5rem">${title}</h2>
        <p style="color:#c4b5fd;margin:0;word-break:break-word">${msg}</p>
      </div>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return new Response('missing url', { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return new Response('invalid url', { status: 400 })
  }

  if (!/^https?:$/.test(target.protocol)) {
    return new Response('unsupported scheme', { status: 400 })
  }

  try {
    const { status, body, contentType, finalUrl } = await fetchDirect(target.href)

    if (status >= 400) {
      return errorPage('relay error', `upstream returned ${status} for ${target.href}`)
    }

    // Use the final URL (after redirects) as the base for relative resolution
    const base = new URL(finalUrl)
    const isHtml = /text\/html|application\/xhtml/i.test(contentType)
    const isCss = /text\/css/i.test(contentType)

    if (isHtml) {
      const rewritten = rewriteHtml(body, base)
      return new Response(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          // Allow framing by our own app (strip any upstream X-Frame-Options/CSP)
          'X-Frame-Options': 'SAMEORIGIN',
          'Content-Security-Policy': '',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (isCss) {
      const rewritten = rewriteCssUrls(body, base)
      return new Response(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'text/css; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      })
    }

    // Non-HTML/CSS resource (image, script, font, etc.) — pass through as-is
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return errorPage('tunnel failed', (err as Error).message)
  }
}
