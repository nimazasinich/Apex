# APEX V31 Verified UI and Backtesting Recovery — 1.0.28

## Scope

This release verifies every active workspace page at the canonical 1368×753 viewport and corrects confirmed Backtesting defects.

## Backtesting defects corrected

1. **Unsupported default interval:** the APEX Composite Scanner declares `15m`, `1h`, `4h`, and `1d`, while the page previously submitted `5m`. The default is now `15m`; unsupported intervals are visibly disabled per selected strategy.
2. **Unnecessary bulk-ticker dependency:** the replay route previously waited for the bulk ticker universe before requesting historical candles. A bulk ticker timeout could therefore abort an otherwise valid backtest. The route now normalizes the requested symbol directly and lets the historical provider/router validate it.
3. **Unobservable fast runs:** deterministic calculations can finish quickly. The page now exposes candles processed, scans evaluated, accepted candidates, server replay time, and total request time instead of implying that runtime duration proves whether work occurred.
4. **Zero-trade display:** completed runs with no qualifying trades state exactly how many bars were evaluated and explain that canonical gates rejected the candidates. No synthetic trade is generated.
5. **Empty metric correctness:** Profit Factor and Max Drawdown display an unavailable dash instead of infinity or negative zero when no trade exists.
6. **Default depth:** the page and route now default to 900 closed candles.

## Direct engine execution

The QA runner processes 900 deterministic 15-minute candles through both the baseline bracket engine and the canonical directional replay.

Latest recorded result:

- Baseline bracket engine: 900 candles, 33 trades, 24 wins, 9 losses.
- Canonical LONG replay: 900 candles, 834 gate rejections, no fabricated trades.
- Canonical SHORT replay: 900 candles, 834 gate rejections, no fabricated trades.
- Identical LONG inputs produced an identical trade/equity result on repeat.

The full machine-readable result is stored at `QA/backtesting-runtime/BACKTEST_RUNTIME_RESULT.json`.

## Visual verification

Every active page was rendered at 1368×753:

- Overview
- Markets
- Watchlist
- Portfolio
- Trading
- Orders
- Positions
- Strategies
- Alerts
- History
- Analytics
- Backtesting (before, running, populated result, actual zero-trade engine result)
- Settings
- Help

Evidence is stored under `QA/visual-verification-1368x753/` with hashes and browser console results.

## Verification completed

- Backtesting workspace QA: 25/25
- Reference UI QA: 24/24
- Consolidation QA: 15/15
- Strategy Library QA: passed
- Strategy Integration QA: passed
- Strategy Engines smoke test: passed
- TS/TSX syntax transpilation: 158 files, zero syntax errors
- CSS structure check: 19 files, zero brace errors
- Source-only release secret gate: passed

A complete dependency install/build was not claimed in this environment because the configured package registry was unavailable. The final archive excludes temporary proof-only dependency stubs and the screenshot compilation harness.
