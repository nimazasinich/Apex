# APEX V19 — 1368×753 UI and Market-Data Hardening

## Release objective

V19 updates the uploaded project rather than replacing it. The existing APEX navigation, demo/live account modes, order ticket, chart engine, right-side toolbox rail, account views and backend services remain in place. The release fixes the desktop geometry around the required **1368×753 CSS-pixel viewport** and removes the main causes of an empty chart or delayed market data.

## User-visible changes

- The application now treats 1368×753 as its canonical desktop frame.
- The left navigation is fixed at 184px and the global header at 58px in the canonical frame.
- The Overview page fits in one viewport without document-level scrolling.
- The right-side context system is preserved as two real layout layers:
  - 286px order/risk context column.
  - 48px toolbox rail, with a 306px expandable drawer.
- Ticker cards are 58px high and remain readable at the reference resolution.
- The chart and the activity table share the available height predictably.
- Empty candle data no longer creates a featureless white canvas. A provider-aware loading/offline state shows the selected market, interval, source state and a Retry action.
- Metric cards have stronger individual boundaries and accent rails to make scanning easier.

## Market-data fixes

1. **KuCoin candle granularity corrected**
   - Futures kline granularity is now sent in seconds:
     - 1m = 60
     - 5m = 300
     - 15m = 900
     - 1h = 3600
     - 4h = 14400
     - 1d = 86400

2. **Concurrent request coalescing**
   - The initial Overview, sentiment, scanner and symbol requests no longer start duplicate provider chains.
   - Normal UI routes share an 80-market snapshot.
   - Candle requests for the same symbol/interval/limit share one in-flight promise.

3. **Fast Overview symbol route**
   - Overview requests candles without waiting for trading-only microstructure.
   - Trading requests opt into order-book and multi-timeframe microstructure.

4. **Verified stale-candle fallback**
   - A previously verified candle snapshot may be reused for up to 15 minutes during a transient provider outage.
   - The response is explicitly marked `degraded` and `stale`; the UI labels it `Cached`.
   - APEX still does not fabricate candles.

5. **Fallback universe filtering**
   - The tertiary market fallback is restricted to a verified crypto base-asset allowlist.
   - Non-crypto symbols can no longer enter the trading ticker strip through that fallback.

6. **No-store API responses**
   - `/api/*` responses now send no-cache headers so an old empty payload is not replayed by the browser, service worker or proxy.

7. **Standalone Vite API proxy**
   - Direct Vite sessions now proxy `/api` to `APEX_API_ORIGIN` (default `http://127.0.0.1:3000`).
   - The preferred command remains `npm run dev`, which serves frontend and backend on one origin.

8. **Route validation**
   - Unsupported chart intervals fall back to `1h`.
   - Candle limits are normalized and capped.
   - Candidate scanning is capped to a high-liquidity 6–24 symbol universe.

## Changed implementation files

- `src/App.tsx`
- `src/types.ts`
- `src/index.css`
- `src/components/PriceChart.tsx`
- `src/components/workspace/GeneralViews.tsx`
- `src/components/workspace/AccountViews.tsx`
- `src/services/apiQuery.ts`
- `src/services/marketDataService.ts`
- `src/services/apexNextMarketRoutes.ts`
- `server.ts`
- `.env.example`
- `package.json`
- `scripts/capture/*` canonical viewport defaults
- `scripts/qa/verifyV19Contract.mjs`
- `scripts/utilities/cleanBuild.mjs`

## Validation performed in the delivery environment

- `npm run qa:v19-contract`: **9/9 passed**.
- TypeScript parser/transpile check for all V19-touched TS/TSX/MTS files: passed.
- `src/index.css` parsed with `tinycss2`: no parse errors.
- ZIP integrity and SHA-256 are generated during packaging.

A dependency-backed Vite build was not run in the delivery container because the available package registry did not provide all locked packages. The project must be installed and built on the target machine with the commands below.

## Target-machine validation

```bash
npm ci
npm run qa:v19-contract
npm run build
npm run dev
```

Then run visual QA at the canonical viewport:

```bash
npm run qa:capture:1368
```

The capture defaults to 1368×753 and writes evidence under `_qa/diag`.
