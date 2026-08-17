# APEX Unified Terminal — Current Status

Current version: **v1.0.68 — Reference UI parity and truthful Trading capture hardening**

## Status summary

v1.0.68 advances the v1.0.67 baseline without replacing the existing trading, strategy, backtesting, API, persistence, or safety architecture. The release makes the active **Trading**, **Strategies**, and **Backtesting** workspaces conform more closely to their supplied reference compositions, keeps the Trading cockpit visible in the light theme, and hardens visual capture so Trading screenshots wait for a settled real-data chart state instead of treating a transient loading skeleton as the final UI.

The market-data path remains production-oriented and truthful: `/api/market/top-volume` and `/api/market/symbol/:symbol` remain the source of ticker/candle/order-book data; no synthetic candle or order-book fallback was added. Empty Demo positions/orders/trades remain an honest empty account snapshot.

## v1.0.68 changes

- **Trading reference UI**: Preserved the existing chart, ticket, depth, activity, risk, and toolbox components while making the chart/ticket/depth cockpit the authoritative visible desktop composition. The order ticket component is defined once and reused by the visible cockpit and expanded toolbox view.
- **Strategy Studio reference UI**: Preserved the library/configuration/evidence three-column route, real handlers, validation state, Dynamic Fusion state, bookmark/preset flow, comparison, and Backtesting handoff. The supplied reference baseline is represented by the page-local `StrategyStudioReference.css` layer.
- **Backtesting Lab reference UI**: Preserved the real replay/evidence pipeline while aligning the run builder, coverage/credibility, performance, evidence tabs, and right rail with the supplied Backtesting Lab composition.
- **Trading visual-capture hardening**: `scripts/capture/capture-dashboard.mts` now waits for either usable real chart geometry or a settled non-loading feed state before capture. This does not fabricate or substitute market data.
- **Type safety**: Fixed the capture script's `page.evaluate` result typing. A fresh `tsc --noEmit` passes in the current source tree.
- **Source-contract alignment**: Updated stale QA assertions that still described retired hybrid execution-dock geometry or previous Strategy/Backtesting copy. The contracts now verify the active reference UI rather than contradictory historical layout assumptions.
- **Trading readability**: The two remaining 9px Trading rail labels were raised to 10px. Dense legacy Strategy/Backtesting CSS still contains sub-10px declarations; this is explicitly reported as remaining accessibility debt rather than claimed as remediated.

## Verification executed for this source tree

PASS:

- `npm run lint` (`tsc --noEmit`)
- `node scripts/gates/checkVersionIdentity.mjs`
- `node scripts/gates/checkNoSecretsInRelease.mjs --source-only`
- 42/42 native-independent `scripts/qa/verify*.mjs` source/runtime-contract checks that can run without Vite/Rollup native binaries
- Core reference contracts include:
  - Trading modernization: 16/16
  - Strategy modernization: 22/22
  - Backtesting workspace: 25/25
  - Backtesting reference optimization: 19/19
  - Strategy Studio reference: 25/25
  - Reference UI redesign: 24/24
  - Research workspace layout: 15/15
  - UI completeness: 16/16

## Verification not completed in this Linux runner

A fresh Vite production build, Vitest suite, Playwright browser run, and 1368 visual capture were **not completed here**. The uploaded offline dependency archive is Windows-oriented and does not contain the Linux native optional packages required by this runner (`@esbuild/linux-x64` and `@rollup/rollup-linux-x64-gnu`). The build attempt therefore stops before project bundling begins.

Because the current source changed after the last bundled production artifact, `public/build-info.json` / `dist/` are intentionally **not represented as a fresh v1.0.68 build of this source tree**. `node scripts/gates/checkBuildIdentity.mjs` correctly reports stale `buildId` / `sourceHash` until a fresh build is produced on a supported dependency installation.

The previously supplied build evidence (`b223f433077a`) is useful baseline evidence for the earlier live-data/light-theme fix, but it is **not re-certified as the build identity for the current reference-UI source changes**.

## Windows/offline restore

The returned project includes `apex-npm-tarballs.zip` for offline restore:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Restore-OfflineDependencies.ps1 -TarballZip .\apex-npm-tarballs.zip
```

The supplied dependency manifest contains one failed download entry for `@rollup/rollup-win32-x64-msvc@4.62.4`; if it is not already cached locally, allow npm network access for that optional native package before the final Windows build/visual pass.

## Promotion criteria

Before treating v1.0.68 as deployment-ready, run on the target Windows environment with complete native dependencies:

1. `npm ci`
2. `npm run lint`
3. `npm run test`
4. `npm run build`
5. `npm run qa:workspace-runtime`
6. `npm run qa:ui-1368`
7. `node scripts/gates/checkBuildIdentity.mjs`

Only after those complete should the regenerated `dist/` and `public/build-info.json` be treated as the production build for this source revision.
