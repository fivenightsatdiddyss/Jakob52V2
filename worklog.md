# Jakob-52 Project Worklog

This file tracks work across all agents on the jakob-52 project.

## Project context

- Next.js 16 app at `/home/z/my-project`. Single user route: `src/app/page.tsx`.
- A "calculator gate" (`src/components/jakob/calculator-view.tsx`) unlocks the main view when the user computes `3+2+3=8`.
- Main view (`src/components/jakob/main-view.tsx`) has a black-hole canvas background (`src/components/jakob/black-hole-bg.tsx`), a floating "jakob 52" title, and a liquid-glass sidebar with categories: Settings, AI, Games, Chat, Proxy.
- Panels live in `src/components/jakob/panels/`.
- Liquid-glass CSS utilities (`.glass`, `.glass-strong`, `.glass-subtle`, `.glass-sheen`, `.text-glow`) are defined in `src/app/globals.css`.
- Proxy: real working HTML-rewriting proxy via corsproxy.io at `src/app/api/proxy/route.ts`.
- Games: 559 games from an external site, iframed in a player (`games-panel.tsx` + `games-data.ts`).
- Dev server runs on port 3000 (`bun run dev`, background). Lint: `bun run lint`.
- Gateway rule: any request to a non-3000 port MUST include `?XTransformPort=<port>` in the URL. WebSocket/socket.io client connects to `io("/?XTransformPort=<port>")` — NEVER a direct `http://localhost:port`.

## Active change set (in progress)

1. Fix black hole + stars visibility on home (opaque wrapper bg was covering the `-z-10` canvas).
2. Sidebar: remove "jakob-52 command deck" text, make it retractable/collapsible.
3. About:blank cloak: use an `srcdoc` iframe in a new window.
4. Chat: make it real-time online via a socket.io mini-service with live user count.
5. Movies: new sidebar category with Google Drive movies (preview iframes).

---

Task ID: 4
Agent: full-stack-developer (chat real-time)
Task: Make chat real-time with live user count via socket.io mini-service

Work Log:
- Read existing fake `chat-panel.tsx` (canned messages, fake "1284 members") and the `examples/websocket` demo to mirror the gateway contract (`path: "/"` + `?XTransformPort=<port>`).
- Created an independent bun project at `mini-services/chat-service/` with its own `package.json` (name `jakob-chat-service`, private, type module, `"dev": "bun --hot index.ts"`, dep `socket.io` ^4.8.1) and its own `node_modules`.
- Implemented `mini-services/chat-service/index.ts`:
  - socket.io server on a hardcoded PORT **3003** (no `process.env.PORT`).
  - CORS limited to `http://localhost:3000` with credentials.
  - In-memory `history` array capped at last 50 messages.
  - On `connection`: emit `presence` + `history` snapshot to the joiner, then broadcast `presence` to everyone.
  - `message` handler: validates + trims (text ≤500, user ≤24), assigns ISO timestamp + id, pushes to history, then `io.emit('message', msg)` to ALL clients (including sender).
  - `typing` handler: broadcasts `typing` `{user, typing}` and auto-clears after 2.5s; cleared on disconnect.
  - On `disconnect`: recompute `io.engine.clientsCount` and broadcast `presence`.
  - Logs `chat-service listening on :3003` on start.
- `cd mini-services/chat-service && bun install` (22 packages, socket.io 4.8.3).
- Started the service in the background: `(bun run dev > mini-services/chat-service.log 2>&1 &)`. Verified log shows `chat-service listening on :3003`; PID running `bun --hot index.ts`.
- `cd /home/z/my-project && bun add socket.io-client` (installed socket.io-client@4.8.3 into the main project).
- Rewrote `src/components/jakob/panels/chat-panel.tsx`:
  - `'use client'`; default export preserved.
  - Connects with `io('/', { transports: ['websocket'], query: { XTransformPort: '3003' } })` — NEVER a direct localhost URL.
  - Single `useEffect` owns the socket lifecycle, with `socket.disconnect()` cleanup on unmount.
  - State: `messages`, `online` (default 0), `connected`, `input`, `typingUser`, plus a stable `guest-XXXX` name and a color from a palette (both via lazy `useState` initializers so they don't regenerate on re-render).
  - Subscribes to `connect`, `disconnect`, `presence`, `history`, `message`, `typing`. No synchronous setState in the effect body — all setState is inside socket event callbacks (the `react-hooks/set-state-in-effect` rule did not fire in this config, so no disable directives were needed).
  - Sending: `socket.emit('message', { user, text, color })`. Server broadcasts back to everyone including sender.
  - Live green "● N online" pill in the header (replaces the old fake "1284 drifting" count). Switches to an amber "reconnecting…" pill on disconnect.
  - Liquid-glass aesthetic preserved (uses `.glass`, `.glass-sheen`, `.glass-subtle`, `.glass-scroll` and `cn` from `@/lib/utils`).
  - Kept a polished decorative channel sidebar with `general` highlighted + marked "live"; other channels disabled with "(coming soon)" tooltips — all messages flow through the single shared `general` relay regardless.
  - Auto-scrolls to bottom on new messages.
  - Typing indicator with bouncing dots, shown for other users only.
  - Loading/empty state: "connecting to relay…" with pulsing radio icon until the socket connects; resilient — on disconnect keeps prior messages and shows "reconnecting…", input disabled until reconnected.
- Ran `bun run lint` — initially had 7 "unused eslint-disable" warnings (the rule wasn't firing); `--fix` removed them, then I rewrote the socket handler block cleanly (no leftover whitespace-only lines). Final `bun run lint` is clean (0 errors, 0 warnings).

Stage Summary:
- Files created:
  - `mini-services/chat-service/package.json`
  - `mini-services/chat-service/index.ts`
  - `mini-services/chat-service/node_modules/` (independent bun project, socket.io 4.8.3)
  - `mini-services/chat-service.log` (runtime log)
- Files modified:
  - `src/components/jakob/panels/chat-panel.tsx` (rewrote from fake/mock to real-time socket.io)
  - `package.json` + `bun.lock` (added `socket.io-client` to main project)
- Port used: **3003** (hardcoded in `mini-services/chat-service/index.ts`).
- How to connect (frontend): `io('/', { transports: ['websocket'], query: { XTransformPort: '3003' } })` — the Caddy gateway reads `XTransformPort=3003` from the query string and reverse-proxies to `localhost:3003`.
- Events: `presence` `{online}`, `history` `ChatMsg[]`, `message` `{id,user,text,color,time}`, `typing` `{user,typing}`. Client emits `message` `{user,text,color}` and `typing` `{user,typing}`.
- Caveats:
  - In-memory store only — message history resets when the service restarts (expected per task spec).
  - No persistence of identity; each browser tab gets its own `guest-XXXX` name and color.
  - The service runs in the background; if the sandbox restarts you'll need to re-run `(cd mini-services/chat-service && bun run dev > mini-services/chat-service.log 2>&1 &)`.
  - Decorative channels other than `general` are intentionally disabled (single shared live room).

---
Task ID: 1,2,3,5 (orchestrator)
Agent: main (Z.ai Code)
Task: Fix black hole visibility, retractable sidebar, about:blank srcdoc, Movies panel

Work Log:
- Diagnosed black hole invisibility: the opaque `bg-[#04020a]` on the page wrapper painted over the `-z-10` black-hole canvas. Removed that bg from `src/app/page.tsx` and forced a dark body backdrop (`#04020a`) in `globals.css` so the canvas now renders above the body and below content.
- Enhanced `black-hole-bg.tsx`: 540 stars, slow gradual pull that accelerates near the singularity, orbital drift that whips faster as stars fall in (angular-momentum spiral), brighter streaks near the photon ring. VLM-confirmed the black hole + accretion disk + spiraling stars are now visible.
- Sidebar (`main-view.tsx`): removed the "jakob-52 / command deck" brand text (kept just the orbit icon home button). Added a retractable/collapsible mode with a `collapsed` state, width transition (w-64 <-> w-[88px]), icon-only nav when collapsed, and collapse/expand toggle buttons.
- About:blank cloak (`settings-panel.tsx`): rewrote `openAboutBlankCloak` to open a new `about:blank` window containing a single `<iframe srcdoc="...">` whose srcdoc is a self-contained loader that mounts the real app in a nested iframe. Verified: new tab is `about:blank`, app loads inside (gate skipped via #enter).
- Movies: parsed the Google Drive list (121 unique titles, /view -> /preview) into `src/components/jakob/panels/movies-data.ts`. Built `movies-panel.tsx` (searchable grid + fullscreen-capable Google Drive preview iframe player). Added a "Movies" entry (Film icon) to the sidebar and mobile nav.
- Chat fix: the subagent's client used `io('/', {query:{XTransformPort}})` which kept the default `/socket.io/` path; rewired to the proven demo pattern `io('/?XTransformPort=3003', {transports:['websocket','polling']})` so the engine.io path is `/` (matches the gateway + server `path:'/'`). Verified through the gateway (port 81): two tabs sync live, online count updates 1<->2.

Stage Summary:
- Files changed: src/app/page.tsx, src/app/globals.css, src/components/jakob/black-hole-bg.tsx, src/components/jakob/main-view.tsx, src/components/jakob/panels/settings-panel.tsx, src/components/jakob/panels/chat-panel.tsx, new src/components/jakob/panels/movies-data.ts + movies-panel.tsx.
- The chat-service (Task 4) runs on port 3003; the chat only works when the page is served through the gateway on port 81 (the externally exposed port), because that is where the XTransformPort forwarding happens. Direct access to :3000 will show "reconnecting" since Next.js doesn't forward XTransformPort.
- `bun run lint` passes with 0 errors/warnings. All changes browser-verified.

---

Task ID: 6
Agent: full-stack-developer (chat profiles)
Task: Add profile customization + custom avatars to chat

Work Log:
- Read worklog to learn the chat-service architecture (port 3003, path `/`, CORS for localhost:3000, events presence/history/message/typing) and the gateway contract (`io('/?XTransformPort=3003')`, never a direct localhost URL).
- Extended `mini-services/chat-service/index.ts`:
  - Added `avatar: string` to `ChatMsg`; `message` payload now `{user,text,color,avatar}`, validated/truncated (`MAX_AVATAR=400`, `MAX_COLOR=40`). Avatar stored in history + broadcast on every message.
  - Added `Profile` type `{id,user,color,avatar}` and an in-memory `Map<socketId, Profile>` of connected profiles.
  - New `profile` event the client emits `{user,color,avatar}`: server trims/validates, stores it keyed by `socket.id`, then broadcasts an updated `roster` to everyone.
  - New `roster` event = `Profile[]`. On connect, the joiner receives `presence` + `history` + `roster` (snapshot of all online profiles). Roster is re-broadcast on every `profile` update and on every connect/disconnect.
  - On disconnect: clear typing timer, emit a final `typing:false` for the leaving user, delete their profile, broadcast `roster`, then broadcast `presence`.
  - Health endpoint also reports `profiles` count.
  - Kept `path: '/'`, port 3003, CORS for `http://localhost:3000`, MAX_HISTORY=50, MAX_TEXT=500, MAX_USER=24, 2.5s typing timeout, `bun --hot`.
- Restarted the service cleanly (killed PID holding :3003, relaunched in background). Log shows `chat-service listening on :3003`.
- Rewrote `src/components/jakob/panels/chat-panel.tsx` (default export preserved, `'use client'`, liquid-glass aesthetic + `cn` from `@/lib/utils` preserved):
  - Socket connection string UNCHANGED: `io('/?XTransformPort=3003', { transports:['websocket','polling'], reconnection:true, reconnectionAttempts:Infinity, reconnectionDelay:1000, reconnectionDelayMax:5000 })`.
  - Profile state `{name,color,avatar}` persisted to `localStorage` under `jakob52-chat-profile`. Default = `guest-NNNN` + random color from COLORS palette + `preset:0`. Loaded on mount via a guarded `useEffect` (SSR-safe `typeof window` check). If nothing stored, a fresh guest name + random color are generated and persisted on save.
  - `profileRef` mirrors the latest profile so the socket `connect` handler always emits the current profile (covers reconnects). A separate `useEffect([profile,profileLoaded])` re-emits `profile` whenever the user changes their identity, so the roster stays live.
  - Sending messages: `socket.emit('message', { user, text, color, avatar })` with the full profile; avatar rides every message.
  - Profile editor: pencil button in the sidebar footer (next to "you are ...") + a redundant mobile-only pencil in the header (sidebar is `hidden` on mobile). Opens a glass modal built with `framer-motion` `AnimatePresence`. Live preview at the top, then:
    - Display name input (max 24 chars).
    - Color picker = row of swatches from COLORS, click to select (check mark on active).
    - Avatar picker = segmented control with 3 tabs:
      1. **Preset** — 8-circle grid of gradients, avatar stored as `"preset:N"` (initial rendered on top).
      2. **Emoji** — 24-emoji palette (👾🦊🐙🦄🐲🌟🌌🚀🔮🎇🪐🤖🎉🍕🎮🎧📚⚡🔥💧🌈🐱🦉🐳), avatar stored as the raw emoji char.
      3. **Upload** — `<input type=file accept=image/*>`; on change, `FileReader` → `new Image` → canvas cover-crop + progressive downscale (sizes 64→48→40→32→28→24, qualities 0.7→0.5→0.35→0.25) until the JPEG data URL is ≤ 400 chars; rejected with a toast if it can't fit. Preview + "remove" link to revert to preset:0.
    - Save / Cancel buttons. Save persists to localStorage, emits `profile` immediately, closes modal, shows a `sonner` toast.
  - Avatar rendering for each message (and in the roster + sidebar footer): a shared `<Avatar>` component dispatches on the encoding:
    - `preset:N` → gradient circle (index → PRESET_GRADIENTS) with the user's initial.
    - single emoji (length ≤ 4 and not a URL) → emoji in a glassy circle.
    - `data:` or `http*` → `<img>` with `object-cover` in a circle.
    - fallback → initial in a plain circle.
    Sizes: `sm` (h-7 w-7) for roster/sidebar, `md` (h-9 w-9) for messages, `lg` (h-12 w-12) for editor preview. Replaces the old square initial block.
  - Roster / who's online: subscribes to `roster` event. In the channels sidebar, below the decorative channel list, a "ONLINE — N" section lists every connected user with their avatar (Avatar sm) + colored name, marked "(you)" for the local user. Uses framer-motion `layout` + AnimatePresence so entries slide in/out as people join/leave/rename.
  - Kept typing indicator, quick reactions, auto-scroll on new messages, presence pill (online count → "reconnecting…" on disconnect), general channel layout, decorative channels list (only `general` live).
  - Resilient: input disabled + amber pill while disconnected; messages retained across reconnects.
- Ran `bun run lint` — first pass had 3 "unused eslint-disable" warnings (the rules `@next/next/no-img-element` and `react-hooks/set-state-in-effect` weren't actually firing in this config). Removed the now-unused directives; final `bun run lint` is clean (0 errors, 0 warnings).

Stage Summary:
- Files modified (only these two, per constraints):
  - `mini-services/chat-service/index.ts` — added `avatar` to ChatMsg + Profile type + `profiles` Map + `profile` event + `roster` event; `message` payload now includes avatar; roster broadcast on connect/disconnect/profile-change; typing:false emitted for the leaving user on disconnect.
  - `src/components/jakob/panels/chat-panel.tsx` — full rewrite: localStorage-persisted profile, glass profile-editor modal with name/color/avatar (preset/emoji/upload) tabs, shared `<Avatar>` component dispatching on the encoding, online roster in the sidebar, full-profile `message` emits.
- Avatar encoding scheme (one string, ≤ ~400 chars):
  - `"preset:N"` (0 ≤ N < 8) → 8 fixed gradient presets, rendered with the user's initial. Default.
  - A raw emoji character (length ≤ 4, not a URL) → rendered large in a glassy circle.
  - A `data:image/jpeg;base64,...` URL (or any `http(s)://` URL) → rendered as an `<img>` with `object-cover`. Uploads are canvas-downscaled JPEGs ≤ 400 chars.
  - Fallback (empty / unrecognized) → initial in a plain circle.
- New socket events (server → client): `roster` `[{id,user,color,avatar}]` (sent on connect as snapshot, then re-broadcast on any change). New client → server event: `profile` `{user,color,avatar}` (sent on connect/reconnect and whenever the user saves a profile change). `message` payload extended with `avatar`. Existing `presence`/`history`/`typing` events unchanged.
- Service restart: clean. Killed the stale process holding :3003, relaunched in background; log shows `chat-service listening on :3003`. PID 7468.
- Lint: passes (0 errors, 0 warnings) after removing 3 unused disable directives.
- How two tabs see each other's custom avatars:
  1. Tab A opens chat → emits `profile` `{user:"guest-1234", color:"text-fuchsia-300", avatar:"preset:2"}` on connect. Server stores it, broadcasts `roster` to everyone.
  2. Tab B opens chat → server sends Tab B a `roster` snapshot (includes Tab A). Tab A receives an updated `roster` that now includes Tab B. Both sidebars show "ONLINE — 2" with each other's avatar + name.
  3. Tab B clicks the pencil, picks emoji 🦊, saves → emits `profile` with `avatar:"🦊"`. Server updates Tab B's profile + broadcasts `roster`. Tab A's sidebar instantly updates Tab B's avatar to 🦊.
  4. Tab A sends "hi" → message emit includes `avatar:"preset:2"`. Server broadcasts the message with avatar. Tab B renders Tab A's message with the preset-2 gradient circle + initial. Tab B replies with 🦊 emoji avatar; Tab A sees the 🦊 circle on Tab B's message.
  5. If either uploads an image, it's downscaled to a ≤400-char data URL; both tabs render it as a circular `<img>` on every message + in the roster.
- Caveats:
  - In-memory only — profiles + history reset when the chat-service restarts.
  - "mine" detection compares display names (`m.user === myName`), so if two users pick the same display name, both see "(you)" on each other's messages. Acceptable for a guest chat.
  - Upload avatar is JPEG-only after downscaling (to fit the 400-char cap); transparency is lost.
  - The chat only works when the page is served through the gateway (port 81 externally) where the `XTransformPort=3003` forwarding happens — direct access to :3000 shows "reconnecting".

---
Task ID: 1,2,3,4,5,7 (orchestrator)
Agent: main (Z.ai Code)
Task: Calculator title removal, custom cursor, clock+FPS HUD, games URL removal, Links panel, perf optimization

Work Log:
- Calculator: removed the "jakobs calculator test" title — the gate now shows only the calculator.
- Custom cursor: new `custom-cursor.tsx` (client) added to the root layout so it's on every page. A purple ring (border-fuchsia-400, glowing) with a small fuchsia square in the center. Ring eases toward the pointer via rAF; dot tracks 1:1. Hides on touch devices (pointer: fine matchMedia). Native cursor hidden via `cursor:none` on body in globals.css (fine-pointer only).
- HUD: new `hud-overlay.tsx` — fixed top-right glass pill showing Texas Central Time (America/Chicago, updates every second) + a live FPS counter (rAF-based, updates 4×/sec, color-coded green/amber/red). Mounted in the main view.
  - Fixed a cascade bug: `.glass-sheen { position: relative }` was overriding Tailwind's `fixed` on the HUD (same cascade layer, later source order). Wrapped the HUD and the mobile bottom nav in an outer `fixed` div (no glass-sheen) with the glass styling on an inner div. Verified the HUD is now `position:fixed` at top-right.
- Games: removed the URL/hostname from the player overlay header subtitle — it now shows only the type label (e.g. "web"/"unity"), not "web · hostname".
- Links: new sidebar category (Link2 icon) + `links-panel.tsx`. 12 proxy services (Bull-33, Xylora, Space, Triple T HD, Studyhub, Tung Tung, Strawberry, Voya, + Hyper/Nebula/Citrus/Aurora). A "today's featured" section rotates 3 proxies daily (day-of-year based, deterministic). Each card opens a player-style modal that loads the proxy through the existing /api/proxy (search URL via DuckDuckGo) in a sandboxed iframe, with new-tab/reload/fullscreen/close controls.
- Performance: optimized `black-hole-bg.tsx` — (1) cache the nebula backdrop (deep space + 2 radial gradients) to an offscreen canvas, blit once per frame instead of recreating 2 gradients 60×/sec; (2) removed per-star `shadowBlur` (the dominant cost) and replaced it with cheap additive (`globalCompositeOperation='lighter'`) glow halos; (3) capped DPR at 1.5 (halves pixel work on retina); (4) reduced star count 540→380. Same visual feel, much cheaper loop.
- Verified all changes end-to-end through the gateway (port 81): calculator has no title, HUD is fixed top-right showing live CT time + FPS, Links panel shows daily featured + grid and opens the proxy viewer, games player header has no URL, chat profiles + avatars sync across two tabs (set 🐱 jakob in tab1, 🚀 drifter in tab2 — both rosters updated live).

Stage Summary:
- Files changed: src/app/layout.tsx (added CustomCursor), src/app/globals.css (cursor:none + body bg), src/components/jakob/calculator-view.tsx (title removed), src/components/jakob/custom-cursor.tsx (new), src/components/jakob/hud-overlay.tsx (new), src/components/jakob/main-view.tsx (Links nav + HUD + mobile nav wrapper), src/components/jakob/panels/games-panel.tsx (URL removed from header), src/components/jakob/panels/links-data.ts (new), src/components/jakob/panels/links-panel.tsx (new), src/components/jakob/black-hole-bg.tsx (perf optimization).
- Chat profiles (Task 6) done by subagent — see that section.
- `bun run lint` passes (0 errors). All browser-verified through the gateway on :81.
- Note: the custom cursor only renders on fine-pointer (mouse) devices — it correctly disables itself on touch/headless. The FPS counter reads accurately on real desktops (headless rAF is throttled, so it reads low in automated tests).

---
Task ID: 5
Agent: full-stack-developer (disguise + panic key)
Task: Tab disguise (favicon+title) + panic key redirect

Work Log:
- Read worklog + `settings-panel.tsx` + `layout.tsx` + `custom-cursor.tsx` to mirror the existing patterns (client component on the layout, `'use client'`, SSR-guarded `localStorage`, `sonner` toasts, `.glass`/`.glass-sheen`/`.glass-subtle` utilities, `cn` from `@/lib/utils`).
- Created `src/components/jakob/site-disguise.tsx` (`'use client'`, default export `SiteDisguise`, returns `null`): on mount, reads `jakob52-disguise` from `localStorage` and applies it by setting `document.title` and replacing every existing `<link rel="icon">`, `<link rel="shortcut icon">`, and `<link rel="apple-touch-icon">` with a single new `<link rel="icon" href={favicon} data-jakob-disguise="true">`. Subscribes to the `storage` event (cross-tab) and a custom `jakob52-disguise-change` event (same-tab live propagation); both handlers re-read + re-apply. Cleanup removes both listeners.
- Created `src/components/jakob/panic-key.tsx` (`'use client'`, default export `PanicKey`, returns `null`): on mount, reads `jakob52-panic` from `localStorage` into a closure variable `cfg`, registers a global `keydown` listener on `window`. When `cfg.enabled && cfg.key && cfg.url` and `e.key.toLowerCase() === cfg.key.toLowerCase()`, calls `e.preventDefault()` + `e.stopPropagation()` + `window.location.href = cfg.url`. A `refresh` handler re-reads the config (so the keydown listener always sees the latest config without re-registering) — subscribed to the `storage` event (cross-tab) and the `jakob52-panic-change` event (same-tab). Cleanup removes all three listeners.
- Edited `src/app/layout.tsx`: added `import SiteDisguise from '@/components/jakob/site-disguise'` and `import PanicKey from '@/components/jakob/panic-key'`, mounted both inside `<body>` immediately after `<CustomCursor />` (and after `<Toaster />`).
- Edited `src/components/jakob/panels/settings-panel.tsx`:
  - Imports: added `useEffect` (already had `useState`), `AnimatePresence` (framer-motion), `Eye` + `Zap` (lucide-react), `Input` (`@/components/ui/input`), `cn` (`@/lib/utils`).
  - Added shared helpers above the `SettingsPanel` component: `DISGUISE_KEY`/`DISGUISE_EVENT` constants, `Disguise` type, `DISGUISE_PRESETS` array (8 presets: none/canvas/classroom/docs/slides/drive/gmail/khan — Google shared favicons CDN `https://www.google.com/s2/favicons?domain=…&sz=64` for the school sites, the real app logo for `none`), `readDisguise()` + `writeDisguise()` (writes + dispatches the `jakob52-disguise-change` event). Same pattern for panic: `PANIC_KEY`/`PANIC_EVENT`, `PanicConfig` type, `readPanic()` + `writePanic()`.
  - Added `TabDisguiseSection` component: `glass glass-sheen rounded-3xl p-6` card, `Eye` icon header, 4-col grid of preset buttons (each shows a favicon `<img>` + name; the active preset is highlighted with a fuchsia border + glow). A collapsible "Custom" row (AnimatePresence height animation) reveals two `Input`s (custom title + custom favicon URL) + an "Apply Custom" button. The active disguise is read from `localStorage` on mount and re-synced on the `jakob52-disguise-change`/`storage` events. Clicking a preset calls `writeDisguise()` (which dispatches the event → `SiteDisguise` re-applies instantly) + `setActive()` locally + `toast.success()`.
  - Added `PanicKeySection` component: `glass glass-sheen rounded-3xl p-6` card, `Zap` icon header. Two-column row: left = a key-capture button ("Click to set key" → on click, sets `capturing=true`; a separate `useEffect([capturing])` registers a `keydown` listener in the **capture phase** that calls `e.preventDefault() + e.stopPropagation() + e.stopImmediatePropagation()` so the global `PanicKey` listener never fires during capture, then `setKey(e.key)` + `setCapturing(false)`; Escape cancels). Shows the current key as an uppercase `<kbd>`. Right = an enable/disable `Switch`. Below: a URL `Input` (placeholder `https://classroom.google.com`). A "Save" button normalizes the URL (prepends `https://` if missing), writes via `writePanic()` (dispatches the event → `PanicKey` re-reads config), updates the local URL state, and toasts a summary ("Press "P" to redirect → …"). The local state is initialized from `localStorage` on mount + re-synced on `jakob52-panic-change`/`storage`.
  - Mounted `<TabDisguiseSection />` and `<PanicKeySection />` between the About:Blank cloak section and the Liquid Glass Intensity section.
- Ran `cd /home/z/my-project && bun run lint`. First pass had 10 "unused eslint-disable directive" warnings — the `react-hooks/set-state-in-effect` rule only fires on the FIRST synchronous `setState` call in each effect body (the others, whether inside `if` blocks or inside event-handler closures, don't trip it). Removed the now-unused disable directives, keeping exactly one per on-mount effect (on the first `setActive(d)` in `TabDisguiseSection` and on the first `setKey(cfg.key)` in `PanicKeySection`). Final `bun run lint`: **0 errors, 0 warnings**.
- Verified the dev server (`tail dev.log`) keeps serving `GET / 200` cleanly — no compile errors from the new files.

Stage Summary:
- Files created:
  - `src/components/jakob/site-disguise.tsx` (client component, returns `null`, mounts in root layout — applies disguise on mount + on `storage`/`jakob52-disguise-change` events)
  - `src/components/jakob/panic-key.tsx` (client component, returns `null`, mounts in root layout — global `keydown` listener redirects when the configured key is pressed)
- Files modified:
  - `src/app/layout.tsx` (added the two imports + mounts after `<CustomCursor />`)
  - `src/components/jakob/panels/settings-panel.tsx` (added `useEffect`/`AnimatePresence`/`Eye`/`Zap`/`Input`/`cn` imports; added shared `DISGUISE_*`/`PANIC_*` constants + helpers; added `TabDisguiseSection` + `PanicKeySection` components; mounted them between About:Blank and Liquid Glass Intensity)
- localStorage keys:
  - `jakob52-disguise` → `JSON.stringify({ id, title, favicon })`
  - `jakob52-panic` → `JSON.stringify({ key, url, enabled })`
- Custom event names (dispatched on `window` for same-tab live propagation; `storage` covers cross-tab):
  - `jakob52-disguise-change`
  - `jakob52-panic-change`
- Disguise presets (id → name / title / favicon source):
  - `none` → "None (Real)" / "jakob-52" / `https://z-cdn.chatglm.cn/z-ai/static/logo.svg` (real app — the default if nothing is stored)
  - `canvas` → "Canvas" / "Dashboard" / Google favicon CDN `?domain=canvas.instructure.com&sz=64`
  - `classroom` → "Classroom" / "Google Classroom" / `?domain=classroom.google.com&sz=64`
  - `docs` → "Docs" / "Untitled document - Google Docs" / `?domain=docs.google.com&sz=64`
  - `slides` → "Slides" / "Untitled presentation - Google Slides" / `?domain=slides.google.com&sz=64`
  - `drive` → "Drive" / "My Drive - Google Drive" / `?domain=drive.google.com&sz=64`
  - `gmail` → "Gmail" / "Inbox - someone@gmail.com - Gmail" / `?domain=mail.google.com&sz=64`
  - `khan` → "Khan" / "Khan Academy" / `?domain=khanacademy.org&sz=64`
  - `custom` (user-provided title + favicon URL) — entered via the "Custom" row in the settings UI; stored in the same `{ id:'custom', title, favicon }` shape.
- How to test (browser, via the gateway on port 81):
  1. Unlock the calculator gate with `3+2+3=8` → open the Settings panel. The two new sections appear right below the About:Blank cloak card and above the Liquid Glass Intensity card.
  2. Tab Disguise: click "Canvas" → the browser tab title becomes "Dashboard" and the favicon becomes the Canvas logo (visible in the browser tab + tab switcher). Try other presets — each updates immediately. Refresh → the disguise persists (read from localStorage on mount). Open a second browser tab → both tabs share the same disguise via the `storage` event. Pick "None (Real)" to revert. Try "Custom" → expand it, enter a title + favicon URL, click "Apply Custom" → the tab updates accordingly.
  3. Panic Key: click "Click to set key", press `p` → the button shows `P` (uppercase `<kbd>`). Type `https://classroom.google.com` in the URL field, flip the Switch to enabled, click "Save" → toast confirms. Press `p` anywhere on the site (including while typing in an input) → the browser immediately redirects to Google Classroom. Flip the Switch off, Save, press `p` → nothing happens (disabled). To rebind to a key that's already the active panic key: click "Click to set key", press the active key → the capture listener's `stopImmediatePropagation()` prevents the redirect from firing during capture, and the key is updated.
- Lint: `bun run lint` passes with **0 errors, 0 warnings**.


---
Task ID: 1,2,3,4 (orchestrator)
Agent: main (Z.ai Code)
Task: HUD home-only + fixed, Blaka Hollow shiny title, home app shortcuts, movie posters

Work Log:
- HUD fix: moved HudOverlay OUT of the motion.div (framer-motion's transform/will-change was creating a containing block that trapped `position: fixed`, making it scroll with content). Now rendered as a sibling of motion.div inside a fragment, and gated to `tab === 'home'` only. Also moved the mobile bottom nav out for the same reason. Verified: HUD shows only on home, hidden on all other tabs, and stays pinned.
- Blaka Hollow font: loaded via `next/font/google` (`Blaka_Hollow`, weight 400, display swap) in layout.tsx → sets `--font-blaka-hollow` CSS var. Added `.font-blaka` utility in globals.css using that var. Applied `font-blaka text-shiny` to the "jakob 52" title. NOTE: a CSS `@import url(...)` for the font broke the build (Tailwind v4 inlines tailwind before the font import, violating the CSS "@import must precede all rules" rule → 500 error). Switched to next/font which self-hosts and avoids the issue. Added `.text-shiny` utility: an animated linear-gradient (violet→white→violet) with background-clip:text, sweeping across the letters on a 4.5s loop for a continuous shine. VLM-confirmed the title is now an outline/hollow decorative font with a shiny gradient.
- Home app shortcuts: new `app-shortcuts.tsx` with 12 apps (YouTube, TikTok, Discord, GeForce NOW, Netflix, Spotify, Reddit, Twitch, Instagram, X, ChatGPT, GitHub). Each tile shows the app's favicon (via google.com/s2/favicons) on a glass tile with a brand-tinted hover glow. Clicking opens a proxy viewer modal that loads the site through /api/proxy (corsproxy relay) in a sandboxed iframe, with new-tab/reload/fullscreen/close. Mounted on the home tab below the hero. Verified: YouTube tile opened the proxied YouTube in the viewer.
- Movies posters: used the image-search skill (`z-ai image-search -q "MOVIE movie poster" --count 1 --no-rank --gl us`) to fetch a real poster for all 121 movies. First attempt with concurrency=5 hit a 429 rate limit (only 12 fetched); waited for cooldown then resumed sequentially with a 4.5s gap — got all 109 remaining (121/121 total). Wrote posters into movies-data.ts (added `poster` field). Updated movies-panel.tsx to render the poster as an <img> with the gradient+clapperboard fallback (and onError hides broken posters). VLM-confirmed the gallery now shows real film posters.
- Recovered the dev server after a CSS @import build break (next/font fix above).

Stage Summary:
- Files changed: src/app/layout.tsx (Blaka_Hollow next/font + disguise/panic mounts already by subagent), src/app/globals.css (.font-blaka + .text-shiny utilities, removed broken @import), src/components/jakob/main-view.tsx (HUD home-only + outside motion.div, mobile nav outside motion.div, AppShortcuts on home, font-blaka text-shiny title), src/components/jakob/app-shortcuts.tsx (NEW), src/components/jakob/panels/movies-data.ts (121 posters), src/components/jakob/panels/movies-panel.tsx (poster <img> + fallback).
- Tab disguise + panic key (Task 5) done by subagent — see that section.
- `bun run lint` passes (0 errors). All browser-verified through the gateway on :81.
