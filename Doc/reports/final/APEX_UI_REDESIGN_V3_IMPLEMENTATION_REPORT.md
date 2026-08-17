# APEX UI Redesign V3 — Implementation Handoff

## Delivered scope

- Replaced the data/service workspace shell with the canonical 180px sidebar, 52px header, 12px padding/gap, 852px main canvas, and 300px context panel.
- Added isolated V3 tokens and workspace CSS while moving the historical stylesheet to `src/styles/legacy-compat.css`.
- Split Watchlist, Orders, Positions, Alerts, History, Analytics, Settings, and Help into dedicated page modules.
- Added global symbol/route search with Ctrl/Cmd+K, keyboard selection, Enter, and Escape behavior.
- Preserved the existing Overview, Markets, Portfolio, and Trading terminal workspaces.
- Kept Demo/Live state explicit and retained preview, confirmation, notional, and server-confirmed write safeguards.

## Backend integration

Added read-only endpoints used by the V3 pages:

- `GET /api/account/history`
- `GET /api/account/history?format=csv`
- `GET /api/account/analytics?range=7d|30d|90d`
- `GET /api/help/topics`
- `GET /api/help/announcements`

History and analytics are derived only from the active account snapshot. Missing or null numeric values remain null and are never silently converted to zero. Analytics remain unavailable until at least two P&L-bearing closed records exist.

## Data-state behavior

All V3 data regions implement loading, empty, error, or locked states. Existing valid data is retained during refresh, market requests are cancelled when superseded, and nonessential polling pauses while the browser tab is hidden.

## Verification added

- `tests/v3-contract-static.mjs`: dependency-free source/contract verification.
- `tests/v3-visual-layout.mjs`: Playwright geometry, no-scroll, route, DPR 1.0/1.25, screenshot, and page-error checks.
- TypeScript syntax transpilation was run across all TS/TSX source files.
- CSS brace/structure validation was run for V3 tokens, V3 workspace CSS, and legacy compatibility CSS.

## Environment limitation during this handoff

The execution environment's internal npm registry did not provide all locked packages (`vite` and a Vitest transitive package), and direct npm registry DNS access was unavailable. Therefore a fresh production bundle and browser-run Playwright evidence could not be generated here. The source integration and dependency-free checks passed; run `npm ci`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:v3:visual` in a normal npm-enabled environment for final runtime evidence.

## Security note

The handoff archive intentionally excludes runtime `.env` files and live external-source configuration. Use `.env.example` and re-enter secrets locally.
