# Task 4 — full-stack-developer (chat real-time)

## Summary
Made the jakob-52 Chat panel genuinely real-time. Replaced the fake/mock chat
(canned messages + fake "1284 members" count) with a live socket.io relay so
multiple browser tabs can chat with each other and the online count reflects
real connected sockets.

## Files
- Created `mini-services/chat-service/package.json` (independent bun project,
  name `jakob-chat-service`, type module, `"dev": "bun --hot index.ts"`,
  dep `socket.io` ^4.8.1).
- Created `mini-services/chat-service/index.ts` — socket.io server on a
  hardcoded PORT **3003**, CORS limited to `http://localhost:3000`,
  in-memory history (last 50), `presence` / `history` / `message` / `typing`
  events. Logs `chat-service listening on :3003`.
- Rewrote `src/components/jakob/panels/chat-panel.tsx` to use
  `socket.io-client`. Default export preserved. Liquid-glass aesthetic kept.
- Side-effect on main `package.json` / `bun.lock`: added `socket.io-client`.

## Port
**3003** (hardcoded — never `process.env.PORT`).

## Frontend socket connection string (EXACT)
```ts
const socket = io('/', {
  transports: ['websocket'],
  query: { XTransformPort: '3003' },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
})
```
CRITICAL: gateway requires `path: '/'` + `?XTransformPort=3003` in the query.
NEVER `io('http://localhost:3003')` — that bypasses Caddy.

## Events
- Server → client: `presence` `{online}`, `history` `ChatMsg[]`,
  `message` `{id,user,text,color,time}`, `typing` `{user,typing}`.
- Client → server: `message` `{user,text,color}`, `typing` `{user,typing}`.

## Lint
`bun run lint` is clean (0 errors, 0 warnings).

## How to test two tabs chatting
1. Confirm `mini-services/chat-service.log` shows `chat-service listening on :3003`.
2. Open the app in two browser tabs (preview panel + "Open in New Tab", or two
   browser windows). Pass the calculator gate (`3+2+3=8`) and click **Chat** in
   both tabs.
3. Both tabs should immediately show the green "● 1 online" / "● 2 online" pill
   in the header (the live count updates the moment the second tab connects).
4. Type a message in tab A and hit send. It should appear in BOTH tab A and
   tab B within ~1 frame, with the sender's per-tab `guest-XXXX` name and color.
5. Start typing in tab A (don't send) — tab B should show the "guest-XXXX is
   typing…" indicator with bouncing dots.
6. Close tab B — tab A's online count should drop back to 1 within a heartbeat
   (socket.io disconnect → server recomputes `io.engine.clientsCount` and
   broadcasts `presence`).
7. Stop the chat-service (`kill <pid>`) — both tabs should switch to the amber
   "reconnecting…" pill, keep their prior messages, and disable the input
   until the service is back up (auto-reconnect handles the rest).

## Caveats
- In-memory store only — history resets on service restart (per spec).
- No identity persistence; each tab gets its own random `guest-XXXX` + color.
- The service runs in the background; on sandbox restart re-run
  `(cd mini-services/chat-service && bun run dev > mini-services/chat-service.log 2>&1 &)`.
- Decorative channels other than `general` are intentionally disabled
  (single shared live room, as allowed by the spec).
