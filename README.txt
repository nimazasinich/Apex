================================================================================
  APEX UNIFIED TERMINAL
  Version 1.0.68
  Supervised crypto trading, research and backtesting terminal
================================================================================

APEX is a local-first, supervised trading and research terminal. It pairs a
React 19 / Vite frontend with a Node.js / Express / TypeScript backend that
serves live market data, research and backtesting tools, paper trading, and
manually supervised live order preparation.

APEX is NOT an autonomous trading bot. Autonomous live order execution is
disabled in this build. Any live order requires an in-memory exchange session,
explicit arming, a preview confirmation, Risk Governor approval, and order
reconciliation. The Autopilot, optimizer, Liquidity Hunter and ML subsystems
run in shadow / paper / research mode only and cannot place live orders.

--------------------------------------------------------------------------------
REQUIREMENTS
--------------------------------------------------------------------------------
  - Windows 10 / 11 x64 (primary release target); other Node platforms work too
  - Node.js 22.x and npm 10.x  (see .nvmrc / .node-version)
  - A modern Chromium-based browser for the terminal UI

--------------------------------------------------------------------------------
QUICK START
--------------------------------------------------------------------------------
Install dependencies and start the integrated dev server:

  npm ci
  npm run dev

Then open the printed local URL (default http://127.0.0.1:3000).

On Windows you can also double-click the canonical launcher:

  RUN-APEX.bat

--------------------------------------------------------------------------------
PRODUCTION BUILD
--------------------------------------------------------------------------------
  npm run build      Build the browser and server bundles into dist/
  npm start          Run the built server (dist/server.cjs)

--------------------------------------------------------------------------------
VERIFICATION AND RELEASE
--------------------------------------------------------------------------------
  npm run verify           Lint, unit tests, build, runtime/source-contract,
                           browser and visual QA, documentation and release gates
  npm run verify:visual    Canonical 1368x753 visual verification
  npm run release:package  Verification-gated release archive (writes _release/)

--------------------------------------------------------------------------------
SAFETY AND NETWORK POSTURE
--------------------------------------------------------------------------------
  - The server binds to 127.0.0.1 by default.
  - Production mutations and private reads fail closed without TLS plus an
    operator token.
  - Browser-supplied exchange credentials are held only in short-lived server
    memory behind HttpOnly cookies; they are never written to the release.
  - Market data is sourced Binance USD-M -> KuCoin Futures -> verified Hugging
    Face Space fallback, with explicit live / degraded / stale / unavailable
    states. No synthetic production candles or order books are used.

--------------------------------------------------------------------------------
PROJECT LAYOUT
--------------------------------------------------------------------------------
  src/       React workspaces, domain services, shared context and tests
  public/    Manifest, PWA assets, service worker and coin icons
  server.ts  Express API, execution controls and Vite server entry
  scripts/   Build, QA, capture, release and maintenance tooling
  tests/     Integration and governance tests
  Doc/       Plans, operating documentation and implementation reports
  QA/        Machine-readable validation evidence
  openapi/   REST API specification

--------------------------------------------------------------------------------
DOCUMENTATION
--------------------------------------------------------------------------------
  - Doc/PROJECT_README.md    Feature history and capability overview
  - openapi/                 REST API operations
  - QA/                      Current validation evidence

APEX preserves prior-version features; see Doc/PROJECT_README.md for the full
version history. This build carries the v1.0.58 feature set forward and adds
reliability, QA and release-hygiene remediation (durable Decision Memory
capacity handling, dark-theme Positions contrast, a dedicated Decision Memory
route module, circular-dependency elimination and an import-cycle gate).
================================================================================
