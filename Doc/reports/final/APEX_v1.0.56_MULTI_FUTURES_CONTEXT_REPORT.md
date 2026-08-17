# APEX v1.0.56 — Multi-Futures Context Completion Report

## Scope

This delivery continues from APEX v1.0.55 and closes the remaining code-side market-data consistency gap around the user's canonical public Futures pair: **Binance USDⓈ-M Futures + KuCoin USDT-M Futures**. Work was split across parallel review tracks for market data, Liquidity Hunter evidence, regression/capability preservation, browser/UI QA, and execution-safety verification.

No live/autonomous execution capability was added.

## Implemented in v1.0.56

### 1. Binance + KuCoin Funding/Open-Interest context

- Added KuCoin public UTA funding-history reader.
- Added KuCoin public UTA Futures open-interest history reader.
- Funding/OI bootstrap now fetches Binance and KuCoin concurrently with `Promise.allSettled`.
- Each venue is normalized into its own source series rather than merging provider rows prematurely.
- Bootstrap diagnostics report aggregate availability, per-source availability, and whether the canonical Binance+KuCoin pair is simultaneously available.
- KuCoin projected/current-next funding is not inserted into settled historical funding observations.

### 2. Pair-aware Funding/OI edge

- `FUNDING_OI` evaluates venue histories independently before fusion.
- When Binance and KuCoin are both valid, the edge requires directional agreement and records `primaryPairActive: true`.
- Cross-venue funding-direction disagreement is surfaced explicitly as `primary_futures_funding_direction_conflict`.
- If only one canonical venue is available, the previous single-source semantics remain available but evidence quality is capped rather than pretending that two-source confirmation exists.

### 3. Canonical public-provider priority alignment

The shared provider-priority contract now starts with:

```text
Binance → KuCoin → tertiary providers
```

for:

- ticker
- order book
- candles
- trades
- funding
- open interest
- instruments

Binance-only sentiment endpoints remain Binance-only. Existing Bybit/Bitget/OKX paths were not removed.

### 4. Preserved realtime primary pair

The v1.0.55 realtime work is preserved:

- Binance USD-M public WebSocket
- KuCoin USDT-M public-token WebSocket
- KuCoin trade normalization
- sequence-validated KuCoin L2 bootstrap/deltas
- fail-closed L2 reseed after a sequence gap
- Binance + KuCoin as the canonical primary Multi-Exchange CVD pair
- Bybit retained as optional/tertiary evidence

### 5. Regression coverage

Added/extended coverage for:

- independent Binance and KuCoin Funding/OI series
- primary-pair Funding/OI evidence
- KuCoin realtime trade/L2 sequencing
- Binance+KuCoin CVD source isolation
- public-provider priority contract

## Capability preservation

The explicit preservation gate reports:

```text
Workspace pages:                  14 / 14, missing 0
Registered strategy identities:   15 / 15, missing 0
HTTP routes:                     110 / 110, missing 0
Package scripts:                  missing 0
QA scripts:                       missing 0
Environment keys:                 missing 0
Liquidity Hunter feature flags:   missing 0
```

File-level comparison against v1.0.55 (excluding generated build/runtime directories):

```text
Baseline files: 878
Current files:  886
Removed files:    0
Added files:      8
```

No baseline source file was removed.

## Execution-safety preservation

The following safety-critical files are byte-identical to v1.0.55:

```text
src/services/connectedExchange.ts
src/services/riskGovernor.ts
src/services/tradePlan.ts
src/services/liquidityHunter/featureFlags.ts
src/services/liquidityHunter/fusionPolicy.ts
src/services/liquidityHunter/paperCanary.ts
```

Safety state remains:

```text
Liquidity Hunter:                 SHADOW_ONLY
Authoritative:                    false
Autonomous live execution:        disabled
Optimizer auto-promotion:         disabled
Paper Canary order submission:    false
New Liquidity Hunter order route: none
```

## Actual verification performed

### TypeScript

```text
npm run lint
→ PASS
→ tsc --noEmit
→ 0 errors
```

### Unit tests

```text
npm run test:unit
→ PASS
→ 70 test files passed
→ 250 / 250 tests passed
```

### Production build

```text
npm run build
→ PASS
→ Vite production build completed
→ server.cjs completed
→ service worker stamped v1.0.56-a3d534f0a28b
→ function index: 2693 symbols / 472 files
```

One non-fatal Vite warning remains: `AccountViews.tsx` is both statically and dynamically imported, so that dynamic import does not create a separate chunk. It does not fail the build.

### Runtime QA

```text
npm run test:runtime
→ PASS
```

### Source contracts

```text
npm run check:source-contracts
→ PASS
```

Selected Liquidity Hunter results include:

```text
Foundation source contract:          52 / 52 PASS
Foundation runtime:                  26 / 26 PASS
Core runtime:                        12 / 12 PASS
Public feeds runtime:                17 / 17 PASS
Event replay runtime:                 9 / 9 PASS
Read plane:                           7 / 7 PASS
Execution-position FSM:               6 / 6 PASS
Optimizer safety:                     7 / 7 PASS
Validation/providers:                20 / 20 PASS
Evidence/microstructure:             23 / 23 PASS
Research completion:                 23 / 23 PASS
Safe completion:                     29 / 29 PASS
```

### Browser / visual QA

The host Chromium has an administrator policy that blocks direct navigation to the local APEX origin with `ERR_BLOCKED_BY_ADMINISTRATOR`. This is an environment/browser policy and was not bypassed in production code.

The existing explicit QA-only transport bridge was therefore used for `test:browser`:

```text
APEX_PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium
APEX_QA_TRANSPORT_BRIDGE=1
npm run test:browser
→ PASS
→ failures: 0
→ pageErrors: 0
→ consoleErrors: 0
```

The real 1368×753 LIGHT-theme Chromium visual harness also ran directly:

```text
APEX_PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium npm run test:visual
→ PASS
→ failures: 0
→ pageErrors: 0
→ consoleErrors: 0
```

### Documentation

```text
npm run docs:visual
→ PASS
→ 14 pages / 110 API routes / 348 source modules / 2693 indexed symbols

npm run docs:check
→ PASS
→ no broken local links
```

### Release gate

```text
npm run release:gate
→ PASS
→ package/lock/manifest/service-worker identity synchronized at 1.0.56
→ recursive secret/archive scan PASS
→ fresh dist check PASS
```

### Full chained `npm run verify`

A single chained run was also attempted with the QA transport bridge. It progressed through lint, test inventory, unit tests, build, runtime QA, source contracts and deep Liquidity Hunter checks, but the outer command reached the execution-environment wall-clock timeout while entering the event-replay section. The event-replay command was immediately run standalone and passed 9/9. Therefore this report does **not** label the one-shot `npm run verify` invocation itself as PASS; the constituent gates listed above are the commands actually observed passing.

## Remaining external boundary

The remaining meaningful validation item is not a missing code component: a genuine live Paper Canary outcome requires runtime egress to public exchange WebSocket/REST feeds. No synthetic fixture is reported as live-market profitability evidence.

The application remains intentionally paper/manual-first. Autonomous live execution is not part of this release.
