import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The corsproxy.io API key is read from the environment so it's never committed.
// Set CORSPROXY_KEY in .env (see .env.example).
const CORS_KEY = process.env.CORSPROXY_KEY || ''
const CORS_BASE = 'https://corsproxy.io/'

/** Build a corsproxy.io URL that a browser can fetch directly (resources). */
function corsUrl(u: string): string {
  return `${CORS_BASE}?key=${CORS_KEY}&url=${encodeURIComponent(u)}`
}

/** Build a same-origin proxy URL so link navigations stay proxied. */
function proxyUrl(u: string): string {
  return `/api/proxy?url=${encodeURIComponent(u)}`
}

/** Resolve a possibly-relative URL against the target page. */
function resolve(href: string, base: URL): string | null {
  try {
    // skip anchors, javascript:, mailto:, data:
    if (/^(#|javascript:|mailto:|tel:|data:|blob:)/i.test(href)) return null
    return new URL(href, base).href
  } catch {
    return null
  }
}

const RESOURCE_ATTRS = ['src', 'data-src', 'data-href', 'poster', 'data']
const RESOURCE_TAGS_FOR_HREF = new Set(['link']) // link[href] for stylesheets/icons

/** Rewrite url(...) references inside CSS to route through corsproxy. */
function rewriteCssUrls(css: string, base: URL): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q: string, raw: string) => {
    const abs = resolve(raw, base)
    if (!abs) return m
    return `url(${q}${corsUrl(abs)}${q})`
  })
}

/**
 * Rewrite an HTML document so that:
 *  - resources load through corsproxy.io (cross-origin, CORS-enabled)
 *  - link clicks navigate back through /api/proxy (stay proxied)
 *  - CSS url(...) inside <style> and inline styles route through corsproxy
 */
function rewriteHtml(html: string, target: URL): string {
  // 1. Drop existing <base> tags (we resolve everything ourselves)
  html = html.replace(/<base\b[^>]*>/gi, '')

  // 2. Walk every tag and rewrite its attributes
  html = html.replace(
    /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (full, tag: string, attrs: string) => {
      const tagLower = tag.toLowerCase()
      let nextAttrs = attrs

      // href handling
      nextAttrs = nextAttrs.replace(
        /(\bhref\s*=\s*)("|')([^"']*)\2/gi,
        (_m, eq: string, q: string, val: string) => {
          const abs = resolve(val, target)
          if (!abs) return `${eq}${q}${val}${q}`
          if (RESOURCE_TAGS_FOR_HREF.has(tagLower)) {
            // stylesheet / icon -> cors
            return `${eq}${q}${corsUrl(abs)}${q}`
          }
          // anchor links -> stay proxied
          return `${eq}${q}${proxyUrl(abs)}${q}`
        }
      )

      // resource src-like attrs
      for (const attr of RESOURCE_ATTRS) {
        const re = new RegExp(`(\\b${attr}\\s*=\\s*)("|')([^"']*)\\2`, 'gi')
        nextAttrs = nextAttrs.replace(re, (_m, eq: string, q: string, val: string) => {
          const abs = resolve(val, target)
          if (!abs) return `${eq}${q}${val}${q}`
          return `${eq}${q}${corsUrl(abs)}${q}`
        })
      }

      // srcset (comma-separated candidates: "url 1x, url 2x")
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
              return abs ? `${corsUrl(abs)}${desc.length ? ' ' + desc.join(' ') : ''}` : trimmed
            })
            .join(', ')
          return `${eq}${q}${rewritten}${q}`
        }
      )

      // inline style="...url(...)..."
      nextAttrs = nextAttrs.replace(
        /(\bstyle\s*=\s*)("|')([^"']*)\2/gi,
        (_m, eq: string, q: string, val: string) => {
          return `${eq}${q}${rewriteCssUrls(val, target)}${q}`
        }
      )

      return `<${tag}${nextAttrs}>`
    }
  )

  // 3. CSS url() inside <style> blocks
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, body, close) => {
    return `${open}${rewriteCssUrls(body as string, target)}${close}`
  })

  // 4. Inject a tiny script that intercepts dynamic <a> clicks & form submits,
  //    re-routing them through the proxy so in-page navigation stays cloaked.
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

/** Fetch a URL through corsproxy.io using browser-like headers (free tier requirement). */
async function fetchViaCors(targetUrl: string): Promise<{ status: number; body: string; contentType: string }> {
  const proxied = corsUrl(targetUrl)
  const res = await fetch(proxied, {
    headers: {
      Origin: 'http://localhost:3000',
      Referer: 'http://localhost:3000/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
    cache: 'no-store',
  })

  const body = await res.text()
  const contentType = res.headers.get('content-type') || 'text/html; charset=utf-8'
  return { status: res.status, body, contentType }
}

function errorPage(title: string, msg: string) {
  return new Response(
    `<html><body style="font-family:system-ui;background:#0a0518;color:#e9d5ff;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:2rem">
      <div>
        <h2 style="color:#f0abfc;margin:0 0 .5rem">${title}</h2>
        <p style="color:#c4b5fd;margin:0;word-break:break-word">${msg}</p>
      </div>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
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
    const { status, body, contentType } = await fetchViaCors(target.href)

    if (status >= 400) {
      return errorPage('relay error', `upstream returned ${status} for ${target.href}`)
    }

    const isHtml = /text\/html|application\/xhtml/i.test(contentType)
    if (!isHtml) {
      // non-HTML resource routed here by a link — pass it through
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const rewritten = rewriteHtml(body, target)
    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return errorPage('tunnel failed', (err as Error).message)
  }
}
