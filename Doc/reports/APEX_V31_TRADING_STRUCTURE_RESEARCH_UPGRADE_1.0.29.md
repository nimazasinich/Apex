# APEX V31 Trading Structure Research Upgrade — 1.0.29

## Scope

This release refines only the Trading chart's automatic structure analysis and its visual dock. It does not alter exchange routing, order execution, account state, or market-data fetching.

## Research-grounded decisions

- Trend lines are built from confirmed pivots and projected as extended support/resistance rays.
- Resistance is rendered as a zone rather than an exact one-pixel price.
- Breakout confirmation uses closing prices beyond the zone, volatility-adjusted ATR buffers, candle quality, and volume confirmation.
- Consecutive close requirements are configurable. TradingView Auto Trendlines uses multiple consecutive closes and defaults to three bars; APEX preserves a conservative three-bar mode while offering softer profiles.
- Expanding volume strengthens a resistance break; low-volume breaks remain lower quality.
- A broken resistance remains visible for retest/role-reversal analysis rather than disappearing immediately.

## User-selectable analysis profiles

### Aggressive — default

Designed for the requested higher-risk tolerance:

- Pivot window: 2 left / 2 right
- Minimum trendline touches: 2
- Wider trend/zone tolerance
- Breakout buffer: max(0.08 ATR, 0.08% close)
- Minimum volume ratio: 1.05x
- Minimum close position: 58%
- Minimum body ratio: 30%
- Confirmation: 1 close on 15m and slower; 2 closes on 1m/5m

### Balanced

- Pivot window: 3 / 3
- Minimum trendline touches: 3
- Breakout buffer: max(0.15 ATR, 0.15% close)
- Minimum volume ratio: 1.25x
- Confirmation: 2 closes

### Conservative

- Pivot window: 4 / 4
- Minimum trendline touches: 3
- Breakout buffer: max(0.22 ATR, 0.22% close)
- Minimum volume ratio: 1.45x
- Confirmation: 3 closes

These numeric thresholds are APEX engineering defaults inspired by the cited concepts; they are not universal market rules and should be calibrated through backtesting.

## Visual changes

- Automatic trendline toggle
- R1/R2/R3 zone toggle
- Breakout zone toggle
- Collapsible overlay dock that does not alter page columns
- Levels, Risk, and Setup tabs
- Aggressive/Balanced/Conservative selector
- APEX green, blue, red, border, ink, and canvas variables used instead of isolated hard-coded theme colors
- Calibrated model likelihood is shown only when the canonical decision model actually provides it; otherwise the UI shows setup quality, not a fabricated probability

## Files changed

- `src/components/PriceChart.tsx`
- `src/components/priceChartAutoStructure.ts`
- `src/components/PriceChartEnhancements.css`
- `src/components/workspace/AccountViews.tsx`
- `src/tests/priceChartAutoStructure.test.ts`

## Visual proof

- `QA/trading-analysis-dock/preview.png`
- `QA/trading-analysis-dock/preview.html`

The preview is a 1368×753 deterministic UI composition demonstrating the dock and overlays. It is not presented as a live exchange screenshot.
