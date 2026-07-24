# PhishGuard — Chrome Extension

## Load it (unpacked, for testing/demo)

1. Make sure the backend is running first: `cd phishguard-backend && npm start` (defaults to `http://localhost:3000`)
2. Open Chrome (or Edge) → go to `chrome://extensions`
3. Turn on **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select this `phishguard-extension` folder
5. The PhishGuard icon should appear in your toolbar

## First-time setup

1. Click the PhishGuard icon → enter your company's real domain (e.g. `yourcompany.com`) → **Save**
2. That's it — the domain is stored via `chrome.storage.sync`

## How to use it

- **Right-click any link** on a webpage → "Check with PhishGuard". Result appears next time you open the popup (and a badge color/notification fires immediately for risky links).
- **Paste a link manually** in the popup (for links copied from WhatsApp, SMS, etc. that aren't clickable on a page).

## What's implemented (must-haves from the project plan)

- [x] Right-click any link → "Check with PhishGuard"
- [x] Popup shows: hosting location, domain age, PhishTank match status, similarity score, AI verdict
- [x] User sets "my company domain" once in settings
- [x] Domain-similarity score vs company domain
- [x] Plain-English AI verdict

## What's NOT implemented yet (nice-to-haves / stretch goals)

- [ ] Auto-scan all links on page load (would need a content script — not built)
- [ ] Visual badge overlay directly next to each link on the page
- [ ] "Report this link" button
- [ ] Screenshot preview before clicking (urlscan.io already returns a screenshot URL in the backend response — `data.signals.urlscan.screenshotUrl` — just needs an `<img>` added to the popup to display it)
- [ ] Team/org mode for IT admins

## Known limitations / before demo day

- `host_permissions` in `manifest.json` is currently locked to `http://localhost:3000/*`. If you deploy the backend somewhere else (Render/Railway/Vercel), update both the `BACKEND_URL` constant in `background/background.js` AND the `host_permissions` entry in `manifest.json`, or link-checks will silently fail with a permissions error.
- The backend's RDAP / urlscan.io / Safe Browsing / Gemini calls were built and unit-tested with mocked responses but never hit the real network during development (sandboxed dev environment had restricted network access) — test the full flow live before the demo.
- PhishTank lookup currently uses a 3-entry sample dataset, not the real feed — see `phishguard-backend/src/services/phishTank.js` header comments for how to swap in the real one.
