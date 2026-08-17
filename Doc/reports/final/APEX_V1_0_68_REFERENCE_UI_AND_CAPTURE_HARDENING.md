# APEX Unified Terminal v1.0.68 — Reference UI and Trading Capture Hardening

**Version:** `1.0.68`  
**Scope:** Trading, Strategies, Backtesting reference UI; capture correctness; source QA alignment  
**Date:** 2026-08-14

## Objective

Bring the existing Trading, Strategy Studio, and Backtesting Lab routes closer to the supplied desktop reference images without rebuilding working product architecture or introducing fake market/account data.

## Implementation

### Trading

- Kept `AccountViews.tsx` as the route composition owner.
- Kept `PriceChart`, `OrderTicketPanel`, `MarketDepthPanel`, `TradingActivityPanel`, `InstrumentFacts`, and `TradingToolbox` rather than duplicating them.
- Preserved a visible chart-first cockpit with explicit chart, order-ticket, and market-depth columns.
- Preserved toolbox drawers for expanded/secondary workflows.
- Kept real provider-fed chart and depth data; no synthetic candle ladder was introduced.
- Raised the last two 9px Trading rail labels to 10px.

### Strategy Studio

- Kept the existing three-column library / model workspace / evidence rail composition.
- Kept real selection, filtering, bookmark/preset, parameter, direction, interval, validation, optimization, Dynamic Fusion, Liquidity Hunter, compare, details, and Backtesting handoff behavior.
- Retained research-only safety language and evidence qualification.
- Updated source contracts to the current reference action labels and geometry rather than retired UI wording.

### Backtesting Lab

- Kept the real replay endpoint and existing modular Backtesting components.
- Preserved editable direction, history, hold window, costs, evidence provenance, export, run cancellation, and identity-bound Trading handoff.
- Aligned the UI contract with the current smart-lab subtitle and supplied reference hierarchy.
- Kept the 5,000-bar option in its existing dedicated checkpoint/preset module.

### Capture correctness

`scripts/capture/capture-dashboard.mts` now waits on Trading until one of two truthful terminal states is reached:

1. a real `.apex-chart-svg` exists with usable geometry, or
2. `.apex-chart-feed-state` has settled out of loading.

This prevents a transient request-loading screenshot from being mistaken for an empty/failing Trading page while still allowing honest unavailable/degraded states to be captured.

## Data-path decision

The reported `ticker_universe_sync_failed` timeout was not treated as proof that the market API was broken. The current source still calls the existing `/api/market/top-volume` and `/api/market/symbol/:symbol` routes and preserves previously loaded ticker state on a refresh timeout. No local-only/mock ticker, candle, depth, order, position, or trade fallback was added.

## Verification executed

- TypeScript: **PASS** (`npm run lint`)
- Version identity: **PASS** (`1.0.68` across package/lock/manifest/service worker)
- Source-only secret release gate: **PASS**
- Native-independent QA verification scripts: **42/42 PASS**
- Trading modernization: **16/16 PASS**
- Strategy modernization: **22/22 PASS**
- Backtesting workspace: **25/25 PASS**
- Backtesting reference optimization: **19/19 PASS**
- Strategy Studio reference: **25/25 PASS**

## Not certified in this environment

The Linux runner cannot install the native optional packages needed by the Windows-oriented offline dependency set. Fresh Vite build, Vitest, Playwright runtime, and new visual-diff evidence are therefore not claimed here. The existing `dist/` and `public/build-info.json` predate the final current-source changes and must be regenerated before deployment.

## Known remaining UI debt

Strategy and Backtesting legacy dense CSS files still contain sub-10px declarations. The active reference work intentionally did not mass-rewrite hundreds of legacy declarations without fresh browser visual evidence. The audit emits a warning instead of falsely claiming complete typography accessibility remediation.
