# APEX v1.0.56 — Heavy Load / Stress Verification Report

Date: 2026-08-10  
Target: `APEX_v1.0.56_FINAL_DELIVERY`  
Runtime: Node.js v22.16.0, Linux x64, 5 logical CPUs, ~5.9 GiB RAM, no swap.

## Executive result

The core computational paths tested under heavy load remained deterministic and did not expose a safety bypass:

- bespoke strategy replay engines: PASS under sustained and parallel load;
- Strategy Optimizer: PASS under 2,000 repeated 10,000-candle optimization cycles;
- Smart Autopilot planner / five-agent promotion council: PASS under 300,000 planner calls and 1,000,000 council decisions;
- Multi-Agent Research Council / paper multi-trade sizing: PASS under 250,000 heavy iterations;
- five-worker parallel backtesting: PASS, 24,000 replay runs total;
- source-only release secret gate: PASS;
- Liquidity Hunter core runtime: 12/12 PASS when its unavailable external package imports were supplied by a temporary test-only shim.

This report does **not** claim a full production HTTP/UI load test. The final source archive has no `dist/` build, and this sandbox's npm mirror returns HTTP 404 for the locked Vitest package, so `npm ci` and therefore a clean application build/server launch cannot be completed here.

## Installation / launch blocker

`npm ci --ignore-scripts` fails at the environment package mirror:

- package: `vitest@4.1.10`
- result: registry HTTP 404.

The normal release gate also reports that `dist/server.cjs` / `dist/index.html` are absent. The source-only secret/release scan succeeds.

Impact: the source package is testable through its dependency-independent QA/runtime paths, but it is not a self-contained executable production bundle as delivered.

## Heavy benchmark results

### Bespoke strategy replay engines

Workload:

- 5 strategy engines;
- LONG / SHORT / BOTH;
- 2 transaction-cost profiles;
- 14,400 total replay runs;
- 900 candles per run;
- deterministic signature checked for each of 30 strategy/direction/cost contexts.

Result:

- 14,400 / 14,400 completed;
- 542.3 replay runs/second;
- zero determinism mismatches;
- max RSS ~160.8 MiB;
- process RSS after run ~157 MiB.

### Five-worker parallel backtesting

Five simultaneous workers were run on the 5-core sandbox. Each worker performed 4,800 replay runs.

- aggregate runs: 24,000;
- 5/5 workers completed;
- all outputs deterministic;
- wall time: 19.43 s;
- total measured CPU utilization: ~397%;
- worker throughput range: 259.5–354.2 runs/s;
- per-worker RSS after run: ~150 MiB.

This is a good result for CPU saturation: throughput per worker falls under contention as expected, while result identity remains stable.

### Ten-worker oversubscription probe

Ten replay workers were launched simultaneously on 5 logical CPUs.

- all 10 workers produced valid deterministic JSON results;
- aggregate computed replays: 48,000;
- worker computation times: ~26.3–37.0 s;
- mean per-worker throughput: ~144.7 runs/s.

However, the outer QA shell did not terminate cleanly before the external 120-second tool timeout, even though all 10 computation result files were already complete. This looks like QA-harness/process-cleanup tail latency under oversubscription, not a replay determinism failure. It should be investigated separately before using this exact test harness in CI at very high worker counts.

### Strategy Optimizer

Workload:

- 2,000 complete optimization cycles;
- 10,000 candles per cycle fixture;
- 40 tried candidates per report;
- holdout / neighbor stability / overfit / cost-stress promotion gates active.

Result:

- deterministic winner across all 2,000 cycles;
- median latency: 7.879 ms;
- p95 latency: 9.338 ms;
- max latency: 26.712 ms;
- successive-halving evaluation reduction: 38.596%;
- final promotion remained a guarded eligibility decision; `automaticallyPromoted=false`;
- max RSS ~196.9 MiB.

The measured RSS increased during the long optimizer run. This was bounded in the test, but a soak test with GC telemetry is recommended to distinguish retained caches from normal V8 heap growth.

### Smart Autopilot

Workload:

- 300,000 multi-context planner calls;
- 1,000,000 five-agent promotion-council decisions;
- alternating robust-good and deliberately bad optimization reports.

Result:

- planner throughput: 53,729 ops/s;
- council throughput: 521,935 ops/s;
- good reports approved: 500,000 / 500,000;
- bad reports rejected: 500,000 / 500,000;
- bad reports produced 5 vetoes;
- zero determinism failures;
- max RSS ~145 MiB.

This specifically verifies that high call volume did not turn the promotion council fail-open.

### Multi-Agent / Paper Multi-Trading

Workload:

- 250,000 council evaluations;
- 16 research jobs per council;
- 250,000 paper multi-position sizing passes.

Result:

- council throughput: 11,436.5 ops/s;
- paper sizing throughput: 81,338.9 ops/s;
- deterministic council and sizing fingerprints remained stable;
- paper plan retained four approved entries;
- max RSS ~145.4 MiB.

Safety flags remained:

- `researchOnly=true`;
- `paperOnly=true`;
- `executionAuthorized=false`;
- `automaticOrderSubmission=false`;
- `autonomousLiveExecutionEnabled=false`;
- `riskGovernorBypassAllowed=false`;
- `manualConfirmationRequired=true`.

### Mixed oversubscription

A mixed 15-process probe combined five backtest workers, five Multi-Agent benchmark workers, and five Optimizer workers on only five logical CPUs.

Completed before the outer 180-second tool timeout:

- Multi-Agent workers: 5/5, 250,000 total council iterations;
- Optimizer workers: 5/5, 2,000 total optimizer cycles, all deterministic;
- backtest workers: two result files completed before the wrapper was killed; other backtest processes were terminated with the wrapper.

Under this artificial 3x CPU oversubscription, Multi-Agent throughput fell to roughly 1.6k–1.7k council ops/s per worker and optimizer p95 rose to roughly 74–100 ms. This is expected contention/backpressure behavior, but it shows that concurrency should be bounded rather than allowing arbitrary CPU-heavy worker fan-out.

## Runtime contract checks

A parallel baseline batch passed the major dependency-independent source/runtime contracts, including:

- Backtesting workspace;
- Backtesting reference optimization;
- Strategy optimization integration;
- Smart Autopilot;
- Multi-Agent / Multi-Trading source contract;
- Multi-Agent runtime (14/14);
- Unified Safety runtime (11/11);
- Maximal Merge Safety;
- Strategy Studio reference;
- Feature Preservation;
- Strategy Optimizer safety runtime (7/7);
- Execution position state machine (6/6);
- Two-tier replay/read-plane runtime (8/8);
- Core10 Dynamic Fusion.

Liquidity Hunter core initially could not import `undici` because dependencies cannot be installed in this environment. With a temporary test-only module shim for the unavailable import, the deterministic core runtime completed 12/12 checks. This is not a substitute for a real package install and should not be treated as production dependency validation.

## Findings / deficiencies

### P0/P1 — Production launch not verified from this archive

The archive does not contain a fresh `dist/` and cannot obtain all locked dependencies from the current sandbox registry. Full application launch, HTTP concurrency, WebSocket/provider load, React interaction load, and browser memory behavior therefore remain unverified in this environment.

Recommended acceptance step on a machine with a healthy npm registry:

1. `npm ci`
2. `npm run verify`
3. `npm run build`
4. start `dist/server.cjs`
5. load-test API endpoints with bounded concurrency;
6. run browser soak at 1368×753 with Smart Autopilot enabled in research/paper mode.

### P1 — Bound CPU-heavy concurrency

At 5 workers / 5 CPUs the replay engine remains healthy. At 2x–3x CPU oversubscription, latency increases sharply and the QA wrapper showed long shutdown/cleanup tail behavior. Backtest/optimizer execution should therefore stay behind the project's bounded-concurrency/coalescing controls rather than spawning unbounded worker processes.

### P2 — Optimizer soak-memory follow-up

The 2,000-cycle optimizer run remained stable, but RSS/heap grew during the run. A 30–60 minute soak with `--trace-gc` or periodic heap snapshots is recommended before calling memory behavior production-proven.

### P2 — QA harness shutdown under extreme oversubscription

The 10-worker replay probe produced all ten deterministic result files but the wrapper process did not exit before the external timeout. The engine computation itself completed; the shutdown/temporary-file cleanup path of the stress harness should be hardened if this test becomes part of CI.

## Verdict

**Core engine verdict: PASS under heavy computational load.**

The tested strategy replay, optimizer, Smart Autopilot decision council, Multi-Agent research council, paper sizing, and safety state machines behaved deterministically under substantial sustained and parallel workloads. No live-execution safety bypass was observed.

**Whole-application production verdict: NOT YET FULLY VERIFIED.**

The remaining blocker is environmental/build-level: no fresh `dist/` exists in the delivery and the sandbox registry cannot install the locked dependency set. A real clean build + HTTP/browser load test on a dependency-complete machine is still required before calling the entire APEX application production-load-verified.

Raw evidence is stored under:

`_qa/accepted/load-stress-2026-08-10/`
