# APEX v1.0.47 — Intelligent Threshold Optimization and Load Report

## Scope

This delivery extends the existing APEX backtesting, adaptive-threshold governance, strategy registry, validation, and evidence architecture in place. It does not create a second engine, bypass risk rules, fabricate strategy evidence, or present optimization as proof of perfection.

The optimizer searches for a robust bounded local optimum. A strategy can be improved only when its registered engine, required data, supported direction/interval, and numeric parameter or scanner-threshold surface are executable. Blocked strategies and unsupported prerequisites remain blocked.

## Implemented behavior

- Added a generic bounded optimizer for registered strategies.
- Numeric registry parameters are optimized for bespoke engines.
- Scanner-preset strategies can optimize policy-bounded scanner thresholds.
- Search is limited to at most ten fields and hard finite ranges.
- Candidate generation is deterministic and quantized.
- Successive halving screens candidates on progressively more expensive chronological windows.
- Final promotion requires untouched holdout improvement, positive holdout return, sufficient trades, bounded drawdown, profit factor, doubled-cost stress, neighbor stability, and bounded train/holdout divergence.
- Failed evaluations are not cached.
- Optimization has cancellation, timeout, workload limits, compute-route rate limiting, and identical-job coalescing.
- Promotion is exact to strategy + symbol + interval + direction.
- Explicit user parameters override promoted defaults.
- Backtest cache identity includes the optimization revision and effective scanner configuration.
- Multi-symbol Adaptive Portfolio promotion remains blocked until synchronized universe identities are persisted.

## Adaptive-learning interaction

The active optimization profile does not replace the whole live scanner configuration. It stores bounded threshold deltas and reapplies them over the latest Adaptive Governance state. This preserves ongoing adaptive learning while retaining the optimizer's calibrated offset.

Promotion and rollback are immutable revisions:

- `AUTOMATIC_OPTIMIZER` creates a new active revision.
- `ROLLBACK` creates another revision restoring a prior profile.
- Historical revisions are not silently rewritten.
- Profiles are stored atomically with restrictive file permissions.

## Strategy Studio integration

Strategy Studio now provides:

- `Auto Optimize` for the selected exact strategy context.
- Active profile revision and source.
- Automatic application of a safely promoted profile.
- A rollback control when a prior active revision exists.
- Latest robust utility delta, holdout utility delta, neighbor pass rate, candidate count, runtime, holdout P&L, and promotion blockers.

The UI explicitly states that optimization cannot prove a perfect strategy.

## Search-efficiency benchmark

Deterministic fixture: 2,500 candles, two numeric fields, 40 candidates, three repeated runs.

| Measure | Result |
| --- | ---: |
| Theoretical full-window evaluations | 171 |
| Completed window evaluations | 105 |
| Reduction from successive halving | **38.596%** |
| Median orchestration latency | **5.555 ms** |
| P95 orchestration latency | 19.755 ms |
| Deterministic winner | Yes |
| Promotion gates passed in stable fixture | Yes |

A separate anti-overfit runtime fixture deliberately reversed the apparent training edge in the untouched holdout. Promotion was correctly withheld for holdout deterioration, failed cost stress, and excessive overfit gap.

## Backtesting and learning load benchmark

Current-tree benchmark on Node v22.16.0:

| Workload | Result |
| --- | ---: |
| Canonical replay candles | 5,000 |
| Backtest iterations | 12 |
| Backtest median | **382.449 ms** |
| Backtest P95 | 398.263 ms |
| Backtest throughput | 2.616 runs/s |
| Duplicate request burst | 24 requests |
| Actual engine executions | **1** |
| Coalesced requests | **23** |
| Logistic rows/features | 10,000 / 9 |
| Logistic epochs | 900 |
| Logistic median | **328.043 ms** |
| Backtest deterministic | Yes |
| Learning deterministic | Yes |

Four-process load run:

- 16 canonical backtests and four 10,000-row learning runs completed in 5.456 seconds wall time.
- Per-worker backtest medians ranged from 387.954 to 405.256 ms.
- Per-worker learning times ranged from 331.812 to 338.095 ms.
- Four duplicate bursts produced four engine executions and 44 coalesced requests.
- All backtest and learning outputs remained deterministic.

The optimizer four-process run completed 12 deterministic optimizer runs in 0.472 seconds. Every worker retained the same winner and the same 38.596% search-evaluation reduction.

## Verification performed

Passed:

- 60 discovered test files / 215 declared test cases.
- Current source-contract pipeline.
- Legacy source-contract pipeline against the active architecture.
- Strategy optimization integration contract: 26/26.
- Merged SEC/UI contract: 31/31.
- Strategy-engine deterministic runtime smoke.
- Adaptive-governor runtime checks.
- Stable-promotion, holdout-reversal, adaptive-delta, persistence, and immutable rollback runtime fixtures.
- 332 TypeScript-family files isolated-transpiled with zero syntax failures.
- 32 JavaScript files parsed with zero syntax failures.
- Three GitHub workflow files parsed as YAML.
- 117 Markdown files checked with no broken local links.
- Version-identity gate and source-release secret gate.

## Verification limitation

`npm ci` could not complete because the configured package registry returned HTTP 404 for `vitest-4.1.10.tgz`. Consequently, this delivery does not claim a fresh package-backed `tsc --noEmit`, Vitest, Vite production build, browser, accessibility, or visual pass. The dependency-independent and deterministic runtime evidence above was executed against this exact source tree.
