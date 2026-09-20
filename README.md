# jakob-52

A liquid-glass "command deck" web app built with Next.js 16 — a calculator gate that unlocks a black-hole-themed dashboard with AI, games, movies, real-time chat, a web proxy, and daily proxy links.

![jakob-52](https://z-cdn.chatglm.cn/z-ai/static/logo.svg)

## Features

- **Calculator gate** — the site loads as a calculator; entering `3 + 2 + 3 =` (equals 8) unlocks the real dashboard.
- **Black hole background** — a canvas starfield whose stars spiral into a gravitational singularity, with a glowing accretion disk and event horizon.
- **Liquid glass UI** — frosted-glass panels, sheened edges, smooth Framer Motion transitions throughout.
- **Retractable sidebar** with categories:
  - **Settings** — about:blank cloak, liquid-glass intensity, tab disguise (favicon + title presets: Canvas, Classroom, Docs, etc.), and a panic key (redirect on a key press).
  - **AI** — a glass chat deck.
  - **Games** — 559 games (pulled from an external library), each playable in a fullscreen iframe.
  - **Movies** — 121 movies streamed via Google Drive preview iframes, with real posters.
  - **Chat** — real-time chat powered by a socket.io mini-service, with custom profiles + avatars and a live online count.
  - **Links** — daily-rotating proxy service shortcuts.
  - **Proxy** — a working in-page web proxy (HTML-rewriting relay via corsproxy.io).
- **Home** — a floating "jakob 52" title (Blaka Hollow font, shiny), a Texas Central Time clock + FPS counter, and app shortcuts (YouTube, TikTok, Discord, GeForce NOW, …) that open through the proxy.
- **Custom cursor** — a purple ring with a square center on all pages.

## Tech stack

- **Framework:** Next.js 16 (App Router) + TypeScript 5
- **Styling:** Tailwind CSS 4 + shadcn/ui (New York)
- **Animation:** Framer Motion
- **Real-time:** socket.io (separate mini-service)
- **Database:** Prisma (SQLite)
- **Fonts:** Geist + Blaka Hollow (via `next/font/google`)

## Getting started

### 1. Install dependencies

```bash
bun install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | Prisma database URL (default `file:./dev.db`) |
| `CORSPROXY_KEY` | Your corsproxy.io API key — required for the Proxy and Links features |

### 3. Push the database schema

```bash
bun run db:push
```

### 4. Run the dev server

```bash
bun run dev
```

The app runs on http://localhost:3000.

### 5. (For chat) Start the socket.io mini-service

The real-time chat runs on a separate bun project:

```bash
cd mini-services/chat-service
bun install
bun run dev
```

This starts the chat service on port **3003**. The main app connects to it via `io('/?XTransformPort=3003')` — which expects a reverse-proxy gateway that forwards `?XTransformPort=<port>` to `localhost:<port>`. See `Caddyfile` for the gateway config.

## Gateway requirement

This project expects a Caddy-style gateway that forwards requests with `?XTransformPort=<port>` to `localhost:<port>`, and otherwise to `localhost:3000`. The gateway config is in `Caddyfile`. The chat service (port 3003) is reached through this gateway. If you're not using the gateway, you'll need to adjust the socket connection in `src/components/jakob/panels/chat-panel.tsx`.

## How the calculator gate works

The site loads as a calculator. The unlock code is the arithmetic expression `3 + 2 + 3`, which evaluates to `8`. Entering that and pressing `=` triggers the transition to the main dashboard. The about:blank cloak reopens the site with `#enter` in the URL to skip the gate.

## Project structure

```
src/
  app/
    api/proxy/route.ts    # corsproxy.io HTML-rewriting proxy
    layout.tsx            # fonts, custom cursor, disguise, panic key
    page.tsx              # gate (calculator) → main view switch
    globals.css           # liquid-glass utilities + animations
  components/
    jakob/
      black-hole-bg.tsx   # canvas starfield + CSS event horizon
      calculator-view.tsx # the gate
      main-view.tsx       # sidebar + floating hero + panels
      hud-overlay.tsx     # clock + FPS (home only)
      app-shortcuts.tsx   # home app tiles → proxy viewer
      custom-cursor.tsx   # purple ring + square cursor
      site-disguise.tsx   # favicon + title disguise
      panic-key.tsx       # redirect on key press
      panels/
        settings-panel.tsx
        ai-panel.tsx
        games-panel.tsx + games-data.ts
        movies-panel.tsx + movies-data.ts
        chat-panel.tsx
        links-panel.tsx + links-data.ts
        proxy-panel.tsx
mini-services/
  chat-service/           # socket.io server (port 3003)
prisma/
  schema.prisma
Caddyfile                 # gateway config
```

## License

Private project.
