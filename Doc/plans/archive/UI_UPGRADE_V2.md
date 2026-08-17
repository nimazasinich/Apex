# APEX UI – Soft Green Upgrade V2

This update coordinates the Overview, Markets, Portfolio, Trading, Watchlist, Analytics and Toolbox surfaces around the supplied APEX references.

## Main improvements

- Softer green visual system, clearer spacing, smoother gradients, refined shadows and more consistent rounded panels.
- Reusable, color-graded SVG gauges for portfolio health, risk overview, sentiment and trading risk context.
- Real cryptocurrency icon resolver with asset-symbol normalization, two remote icon sources, lazy loading and a deterministic fallback.
- Expanded market-universe request to 120 futures markets. Market rows are compact, searchable and filterable.
- Richer ticker strips, smaller coin rows, improved winners/losers lists and coordinated market-side panels.
- Improved metric cards with green, blue, violet, amber and rose accents.
- Locale-aware number entry for order price, quantity, leverage, take-profit and stop-loss fields. Both `67,842.50` and `67.842,50` formats are accepted.
- Reworked right-side order ticket with Order/Alerts tabs, Buy/Sell, Limit/Market/Stop choices, allocation slider, margin mode, time-in-force and indicative order value.
- Trading page now uses the shared live candle chart, instrument metrics, setup intelligence, risk context and positions.
- Wide market requests fetch open interest only for the highest-liquidity 40 contracts while retaining live price, volume and funding data for the full returned list.

## Key files

- `src/lib/marketPresentation.ts`
- `src/components/CoinIcon.tsx`
- `src/components/ColoredGauge.tsx`
- `src/components/FormattedNumberInput.tsx`
- `src/components/PriceChart.tsx`
- `src/components/workspace/GeneralViews.tsx`
- `src/components/workspace/AccountViews.tsx`
- `src/components/workspace/ToolboxDrawers.tsx`
- `src/components/WatchlistPanel.tsx`
- `src/services/apexNextMarketRoutes.ts`
- `src/services/marketDataService.ts`
- `src/index.css`

## Validation performed

- All 90 frontend TypeScript/TSX source files passed syntax transpilation.
- Modified frontend modules passed a semantic TypeScript check with local dependency declarations.
- Modified market-service modules passed the same semantic check with Node type declarations.
- `src/index.css` parsed with zero CSS syntax errors.

A full dependency install/build could not be run in the sandbox because the configured package registry did not contain some locked packages. The original `package-lock.json` is preserved; run `npm ci`, `npm run lint`, and `npm run build` in the normal project environment.
