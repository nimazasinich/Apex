# APEX v1.0.54 — Verified UI Completion & Preservation Report

**Baseline:** APEX v1.0.53 Safe Completion  
**Release:** APEX v1.0.54 Verified UI Completion Safe  
**Primary objective:** close the remaining local code/QA gaps without removing features or weakening execution safety.

## Parallel workstreams completed

1. **Backtesting/UI track** — real-browser verification of the active Backtesting Lab at 1368×753 LIGHT theme; removed hidden tooltip overflow that caused Run Builder scroll width without removing tooltip content or controls.
2. **Strategy Studio track** — corrected Dynamic Fusion light-theme surfaces that were falling back to dark/undefined tokens; preserved the existing three-column layout and all strategy/evidence controls.
3. **Browser/QA track** — added a current-source Chromium/Playwright 1368×753 harness that checks all 14 routes, records page/console errors, verifies document overflow, verifies the Backtesting Run Builder has no internal scroll, and captures key screenshots.
4. **Capability-preservation track** — added an explicit v1.0.53→v1.0.54 gate covering pages, strategy identities, HTTP routes, package scripts, QA scripts, env keys, and Liquidity Hunter feature-flag fields.
5. **Release/documentation track** — restored the root visual project documentation artifact required by `docs:visual`, refreshed it to v1.0.54, and made QA remove only private runtime config that QA itself created.

## Capability preservation

Against the v1.0.53 capability baseline:

| Capability | v1.0.53 | v1.0.54 | Missing |
|---|---:|---:|---:|
| Workspace pages | 14 | 14 | 0 |
| Strategy identities | 15 | 15 | 0 |
| HTTP routes | 110 | 110 | 0 |
| Package scripts | 90 | 91 | 0 |
| QA script files | 50 | 52 | 0 |
| `.env.example` keys | 29 | 29 | 0 |
| Liquidity Hunter feature-flag fields | 19 | 19 | 0 |

No existing page, strategy identity, route, feature flag, or prior package/QA command was removed.

## Package-backed verification actually executed

The uploaded Linux npm cache was used for a fresh offline install. The user-supplied `@esbuild/linux-x64@0.25.12` tarball was restored into the QA-only `node_modules` after `npm ci`, because that optional Linux binary was not present in the uploaded cache. It is not bundled into the source release.

```text
npm ci --ignore-scripts --offline --cache <uploaded-cache>
PASS — 312 packages installed / 313 audited / 0 vulnerabilities

npm run lint
PASS — TypeScript 0 errors

npm run test
PASS — 69 test files / 248 tests / 0 failed

npm run build
PASS — Vite build + server.cjs + function index

npm run test:runtime
PASS

npm run test:browser
PASS — real /usr/bin/chromium, 14 routes, 1368×753, LIGHT theme, 0 page errors, 0 console errors

npm run test:visual
PASS — real /usr/bin/chromium, 14 routes, 1368×753, LIGHT theme

npm run docs:visual
PASS — 14 pages / 110 API routes / 346 source modules / 2667 indexed symbols

npm run docs:check
PASS — 131 Markdown files, 0 broken local links

node scripts/qa/verifyV1054CapabilityPreservation.mjs
PASS — 0 missing capabilities

npm run release:gate
PASS
```

The full constituent `check:source-contracts` suite also passed on the v1.0.54 tree before the final QA-cleanup/documentation-only changes. The newly added capability-preservation check was then executed separately and passed. A single monolithic `npm run verify` invocation was attempted, but the tool execution window timed out during the long Liquidity Hunter source-contract chain; this is not reported as a monolithic PASS. The constituent verification evidence above is the authoritative result.

## Real-browser evidence

Browser mode: `REAL_BROWSER_INLINE_BUNDLE_WITH_LOCAL_SERVER_TRANSPORT_BRIDGE`.

The transport bridge is QA-only and exists because the managed Chromium environment can block direct localhost browser navigation. The current frontend bundle is still built from source and rendered in real Chromium; local account/strategy/security requests reach the real Express server. Market data is a deterministic QA fixture only for visual verification and is explicitly marked degraded/non-authoritative.

Key measurements:

- Viewport: **1368×753 only**.
- Theme: **LIGHT**.
- All 14 workspace routes: document width exactly 1368, height exactly 753, no workspace recovery screen.
- Backtesting Run Builder: `400×620`, scroll size exactly `400×620` — no horizontal or vertical scroll.
- Strategy Studio grid: `228px 634px 286px`.
- Page errors: `0`.
- Relevant console errors: `0`.

Evidence is stored under `QA/v1.0.54-browser/`.

## Safety invariants

The following safety-critical production files were SHA-256 identical to v1.0.53:

- `src/services/connectedExchange.ts`
- `src/services/riskGovernor.ts`
- `src/services/tradePlan.ts`
- `src/services/liquidityHunter/featureFlags.ts`
- `src/services/liquidityHunter/fusionPolicy.ts`

Safety state remains:

```text
Liquidity Hunter          SHADOW_ONLY
Authoritative             false
Autonomous live execution false
Automatic promotion       false
New execution/order route 0
Risk Governor             preserved
TradePlan                 preserved
Kill switches             preserved
Manual confirmation       preserved
Reconciliation            preserved
```

## Remaining external boundary

The container still cannot resolve public exchange hosts (`fapi.binance.com`, `api-futures.kucoin.com`, `api.bybit.com`) because outbound DNS/network egress is blocked. Therefore no real live Paper Canary outcome is claimed in this release.

The code-side public-market hierarchy remains:

```text
Binance USDⓈ-M Futures
→ KuCoin USDT Futures
→ existing fallback chain
```

Live Paper Canary observation is now an external runtime-validation step, not a missing code component.

## Final status

**v1.0.54 is the current safe, package-tested, browser-verified code release for this environment.**

Remaining work is live-market observation/statistical evidence under real public exchange connectivity; no additional autonomous execution capability is required or enabled.
