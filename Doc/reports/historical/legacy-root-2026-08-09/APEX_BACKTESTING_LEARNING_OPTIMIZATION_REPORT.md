# APEX Backtesting and Learning Load Optimization Report

## Scope

The canonical v1.0.47 tree was profiled and optimized in place. Strategy rules, risk policy, replay semantics, public routes, evidence labels, and the established Stage UI/SEC architecture were preserved.

## Implemented

- Parsed and normalized replay candles once per run.
- Reused engine/core candle representations, prefix-volume sums, and a bounded rolling 15-minute proxy window.
- Removed repeated window `map`/`filter`/`reduce` allocations in replay hot paths.
- Loaded the risk-governor policy once per replay.
- Flattened Logistic Regression training data into typed arrays and reused gradient storage.
- Combined ML feature completeness and vector extraction into one scan.
- Added a bounded deterministic replay cache with in-flight request coalescing, TTL/LRU limits, full OHLCV/config hashing, failure exclusion, and explicit bypass for the multi-symbol adaptive portfolio strategy.
- Exposed replay-cache evidence in the Backtesting runtime panel.
- Added `npm run stress:backtesting-learning`.

## Measured results

| Workload | Before mean | After mean | Improvement |
|---|---:|---:|---:|
| Canonical replay, 5,000 candles | 473.6 ms | 395.0 ms | 16.62% |
| Canonical replay, 10,000 candles | 947.1 ms | 780.0 ms | 17.64% |
| Logistic training, 10k rows × 900 epochs | 454.5 ms | 339.7 ms | 25.25% |
| ML dataset preparation, 10,000 rows | 718.6 ms | 295.7 ms | 58.86% |

Two-worker throughput improved from 2.50 to 2.85 replay jobs/s and from 3.57 to 4.66 learning jobs/s. At four workers the host was CPU-saturated; replay throughput still increased from 3.95 to 4.13 jobs/s and learning from 6.48 to 7.55 jobs/s.

Twenty-four identical concurrent replay requests produced one engine execution, one MISS, and 23 COALESCED responses. A subsequent HIT returned in 0.0074 ms. Full 5,000-candle identity hashing averaged 5.84 ms and detects changes to interior candles.

## Correctness evidence

- 14 replay parity comparisons passed across LONG/SHORT, sorted/unsorted inputs, 80/900/5,000 candles, and the short-momentum engine.
- Maximum Logistic coefficient delta: 4.879e-19; intercept delta: 0.
- 59 discovered test files / 209 declared test cases.
- 328 TypeScript-family files transpiled with zero syntax diagnostics.
- Current and legacy source-contract suites passed.
- Deterministic strategy-engine and adaptive-governor runtime checks passed.

## Resource trade-off

Peak RSS for six sequential 5,000-candle runs increased by approximately 6.23 MiB, while retained heap after forced GC decreased slightly. The bounded rolling proxy window was used instead of retaining all generated 15-minute proxy objects. The endpoint cache is capped at 48 entries and 30 seconds.

## Not executed

`npm ci` failed because the configured registry returned HTTP 404 for `vitest-4.1.10.tgz`. Full semantic `tsc --noEmit`, Vitest, production build, browser, accessibility, and visual QA are not claimed.
