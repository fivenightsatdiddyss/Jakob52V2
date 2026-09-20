# Task 5 — full-stack-developer (disguise + panic key)

## Task
Add two new Settings features to jakob-52:
1. **Tab Disguise** — change the browser tab's favicon + title to mimic another site (Canvas, Google Classroom, Docs, etc.).
2. **Panic Key** — redirect the browser to a chosen URL when a configured key is pressed anywhere on the site.

## Files

### Created
- `src/components/jakob/site-disguise.tsx` — `'use client'`, returns `null`. Reads `jakob52-disguise` from `localStorage` on mount and applies it (`document.title` + replaces all `<link rel="icon">/<link rel="shortcut icon">/<link rel="apple-touch-icon">` with a single new `<link rel="icon" href={favicon} data-jakob-disguise="true">`). Subscribes to `storage` (cross-tab) + the `jakob52-disguise-change` custom event (same-tab) and re-applies on each.
- `src/components/jakob/panic-key.tsx` — `'use client'`, returns `null`. Reads `jakob52-panic` from `localStorage` into a closure variable, registers a global `keydown` listener on `window`. When the configured `key` is pressed (compared case-insensitively via `e.key.toLowerCase()`) AND `enabled` is true AND `url` is non-empty → `window.location.href = url`. Re-reads the config on `storage` + the `jakob52-panic-change` custom event so updates apply live without remounting.

### Modified
- `src/app/layout.tsx` — added `import SiteDisguise` + `import PanicKey`, mounted both inside `<body>` immediately after `<CustomCursor />`.
- `src/components/jakob/panels/settings-panel.tsx` — added `useEffect`, `AnimatePresence`, `Eye`, `Zap`, `Input`, `cn` imports; added shared helpers (`DISGUISE_PRESETS`, `readDisguise`, `writeDisguise`, `readPanic`, `writePanic`); added two new section components `TabDisguiseSection` and `PanicKeySection`; mounted both between the About:Blank section and the Liquid Glass Intensity section.

## localStorage keys
- `jakob52-disguise` — `JSON.stringify({ id, title, favicon })` (id is one of the preset ids or `"custom"`).
- `jakob52-panic` — `JSON.stringify({ key, url, enabled })`.

## Custom event names (dispatched on `window` for same-tab live propagation)
- `jakob52-disguise-change`
- `jakob52-panic-change`

## Disguise presets
| id | name | title | favicon |
|----|------|-------|---------|
| `none` | None (Real) | jakob-52 | `https://z-cdn.chatglm.cn/z-ai/static/logo.svg` |
| `canvas` | Canvas | Dashboard | `…?domain=canvas.instructure.com&sz=64` |
| `classroom` | Classroom | Google Classroom | `…?domain=classroom.google.com&sz=64` |
| `docs` | Docs | Untitled document - Google Docs | `…?domain=docs.google.com&sz=64` |
| `slides` | Slides | Untitled presentation - Google Slides | `…?domain=slides.google.com&sz=64` |
| `drive` | Drive | My Drive - Google Drive | `…?domain=drive.google.com&sz=64` |
| `gmail` | Gmail | Inbox - someone@gmail.com - Gmail | `…?domain=mail.google.com&sz=64` |
| `khan` | Khan | Khan Academy | `…?domain=khanacademy.org&sz=64` |

(Google shared favicons CDN base: `https://www.google.com/s2/favicons`.) A `custom` id (user-provided title + favicon URL) is also supported.

## Settings UI summary
- **Tab Disguise section**: glass card, `Eye` icon, 4-col grid of preset buttons (favicon img + name; active one highlighted with a fuchsia border + glow), plus a collapsible "Custom" row with title + favicon URL inputs and an "Apply Custom" button. Active preset is read from localStorage on mount and re-synced on the `jakob52-disguise-change`/`storage` events. Clicking a preset writes to localStorage, dispatches the event, and shows a `sonner` toast.
- **Panic Key section**: glass card, `Zap` icon, two-column row → left = key-capture button ("Click to set key" → on click it listens for the next keydown in the capture phase and stores `e.key`; Escape cancels; current key shown as an uppercase `<kbd>`), right = enable/disable `Switch`. Below: a URL `Input` (placeholder `https://classroom.google.com`). A "Save" button writes to localStorage, dispatches the event, and toasts. The capture listener uses `e.preventDefault() + e.stopPropagation() + e.stopImmediatePropagation()` so re-binding a key that matches the OLD panic key doesn't trigger a redirect during capture.

## Lint
`cd /home/z/my-project && bun run lint` → **0 errors, 0 warnings**.

The `react-hooks/set-state-in-effect` rule fires only on the FIRST synchronous `setState` call in each effect body, so each effect keeps a single `// eslint-disable-next-line react-hooks/set-state-in-effect` directive on that first call (lines 195 and 376). All other `setState` calls (inside `if` blocks, inside event handler closures) don't trip the rule, and the now-unused disable directives were removed. Final lint is clean.

## How to test
1. Open the site via the gateway (port 81 externally), unlock the calculator gate with `3+2+3=8`.
2. Open the Settings panel — the two new sections appear right below the About:Blank cloak card and above the Liquid Glass Intensity card.
3. **Tab Disguise**: click "Canvas" → the browser tab's title becomes "Dashboard" and the favicon becomes the Canvas logo. Try other presets — each updates immediately. Refresh the page → the disguise persists (read from localStorage on mount). Pick "None (Real)" to revert. Try "Custom" → expand it, enter a title + favicon URL, click "Apply Custom" → the tab updates accordingly. Open a second tab → both tabs share the same disguise via the `storage` event.
4. **Panic Key**: click "Click to set key", press `p` → the button shows `P`. Type `https://classroom.google.com` in the URL field, flip the Switch to enabled, click "Save" → toast confirms. Press `p` anywhere on the site (including while typing in an input) → the browser immediately redirects to Google Classroom. To test the disable: flip the Switch off, Save, press `p` → nothing happens. To rebind the key to a key that's already the active panic key: click "Click to set key", press the active key → the capture listener's `stopImmediatePropagation()` prevents the redirect from firing during capture, and the key is updated.

## Constraints honored
- Only the 4 allowed files were touched (2 created, 2 modified).
- All localStorage access is guarded with `typeof window !== 'undefined'` (SSR-safe).
- `'use client'` directive at the top of each new file.
- `cn` from `@/lib/utils` used for conditional class merging.
- Existing shadcn components (Switch, Input, Button) reused; existing glass utilities (`.glass`, `.glass-sheen`, `.glass-subtle`) used.
- `sonner` toasts reused (already imported in the file).
- `react-hooks/set-state-in-effect` rule handled with targeted `eslint-disable-next-line` directives on the first synchronous `setState` in each on-mount effect.
