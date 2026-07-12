---
name: verify
description: Verify Vylos IDE UI changes end-to-end by driving the Next.js app in headless Chrome via CDP.
---

# Verifying Vylos IDE changes

Vylos is Next.js (static export) + Electron. For UI changes, the Next.js dev server in a browser is an accurate surface — Electron only adds the shell (fs/terminal IPC, window chrome).

## Recipe that works (no sudo, no Playwright installed)

1. **Auth gate**: `app/page.tsx` returns `<Onboarding />` unless a real Supabase session exists (`isAuthenticated` is not persisted — it comes from a live session). To reach the main UI headlessly, temporarily disable that gate (`if (false && (...))`) and **revert after**.
2. **Server**: `npx next dev -p 3005` (background, log to scratchpad).
3. **Browser**: `google-chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<scratchpad>/chrome-profile about:blank`. Machine has `/usr/bin/google-chrome`; no playwright/puppeteer in the repo.
4. **Driver**: plain Node CDP script. A `ws` client is available at `node_modules/next/dist/compiled/ws`. Get the page target from `http://127.0.0.1:9333/json/list`, then use `Page.navigate`, `Runtime.evaluate` (click via `document.querySelector(...).click()` — React handles native clicks fine), and `Page.captureScreenshot`.

## Gotchas

- Many labels render CSS-`uppercase`; `innerText` reflects rendered case — use case-insensitive regexes when asserting on text.
- To set a React-controlled `<input>`, use the native value setter + `dispatchEvent(new Event('input', {bubbles:true}))`.
- Zustand persist keys in localStorage: `vylos-courses` (course progress), `vylos-roadmap` (AI roadmap), `vylos-auth` (onboarding flag only). `localStorage.clear()` + reload gives a fresh state.
- Full Electron launch (only when the shell itself changed): `ELECTRON_DISABLE_SANDBOX=1 npm run electron:dev` — no sudo available, chrome-sandbox is not setuid; re-confirm the flag with the user in a fresh session.
