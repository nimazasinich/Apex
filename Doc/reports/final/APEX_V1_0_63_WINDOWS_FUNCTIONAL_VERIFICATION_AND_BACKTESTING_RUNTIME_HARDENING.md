# APEX Unified Terminal v1.0.63 — Windows functional verification and Backtesting runtime hardening

## Scope

This release continues from v1.0.62 and focuses on the previously blocked dependency-backed checks, Windows restore tooling, and Smart Backtesting runtime behavior.

## Dependency bundle inspection

The uploaded npm bundle contained 311 `.tgz` files plus `downloads-manifest.txt`. The manifest reported one failed optional Windows native package download:

```text
https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.62.4.tgz
```

The sandbox could seed npm from the uploaded tarballs and run TypeScript lint. Full Linux Vite/Vitest startup remained blocked because the bundle was Windows-oriented and did not include:

- `@esbuild/linux-x64`
- `@rollup/rollup-linux-x64-gnu`

## Fixes made

- Fixed `scripts/utilities/generateFunctionIndex.mts` so the dynamically loaded TypeScript runtime still has valid TypeScript namespace types under `tsc --noEmit`.
- Updated `src/tests/backtestingPageRegression.test.ts` so it supplies the new Backtesting Studio Smart Mode props required by `BacktestRunBuilder`.
- Hardened Smart Backtesting to run a bounded continuous loop, with safe stop, resume, checkpoint, max-runtime, max-iteration, provider-failure, and no-improvement stop conditions.
- Added deterministic Smart Backtesting synthetic fixtures for offline verification.
- Added Windows dependency restore and verification scripts.
- Updated documentation, indexes, version identity, build identity, and current-status evidence.

## Smart Backtesting behavior

Smart Mode remains the default. The Start button now starts a real bounded loop using the canonical `/api/market/backtest` flow with `X-APEX-Backtest-Source: smart`. Each iteration checkpoints:

- current phase
- iteration count
- best score/result
- latest score/result
- no-improvement count
- last change
- next action
- stop reason

The Smart loop does not call live trading/order endpoints.

## Synthetic data

Synthetic fixture data is explicitly marked as offline-only and not live market data. It covers:

- 500, 1000, 2000, 3000, and 5000 candle horizons
- trend, sideways, and volatile regimes
- partial-history/gap cases
- low-trade cases
- no-trade cases

## Verification performed

PASS:

- `npm ci --offline --ignore-scripts --no-audit --fund=false` with the uploaded tarball cache in this sandbox
- `npm run lint`
- `node scripts/qa/generateSmartBacktestingSyntheticFixtures.mjs`
- `node scripts/qa/verifySmartBacktestingRuntimeHardening.mjs`
- `node scripts/qa/generateComprehensiveSimulationData.mjs`
- `node scripts/qa/runComprehensiveSimulationRuntime.mjs` — 2,946/2,946
- Backtesting, Strategy, Trading, Smart Autopilot, feature preservation, research layout, system integration, and maximal-merge source QA scripts
- root, version, build identity, source secret, and test inventory gates
- documentation index, function index, API route index, and Markdown link checks

BLOCKED:

- `npm run build` in this Linux sandbox: missing `@esbuild/linux-x64` native optional package
- `npm test` in this Linux sandbox: missing `@rollup/rollup-linux-x64-gnu` native optional package
- Playwright browser verification: no browser cache uploaded and CDN DNS failed
- live exchange, authenticated execution, long-running canary, and real ML calibration

## Windows commands

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Restore-OfflineDependencies.ps1 -TarballZip .\apex-npm-tarballs.zip
.\scripts\windows\VERIFY-WINDOWS.cmd
```
