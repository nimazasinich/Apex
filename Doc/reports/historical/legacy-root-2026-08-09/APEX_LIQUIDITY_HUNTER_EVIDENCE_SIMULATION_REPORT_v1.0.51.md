# APEX v1.0.51 — Liquidity Hunter Evidence, Historical Grading & Microstructure Simulation

**Release status:** shadow-only / non-authoritative  
**Base:** APEX v1.0.50 Liquidity Hunter Validation/Canary Safe  
**Version:** 1.0.51  
**Date:** 2026-08-07  
**Execution boundary:** no autonomous Liquidity Hunter execution; existing TradePlan, Risk Governor, kill-switch, manual confirmation, execution-intent persistence, testnet and reconciliation boundaries are preserved.

## 1. Scope

This release continues the evidence-first Liquidity Hunter implementation without introducing an order-authorizing path. It closes four research-infrastructure gaps:

1. optional predictive liquidation-topology ingestion from a verified provider interface;
2. event-time Deribit option gamma reconstruction and bounded historical option-flow import;
3. fee/funding-adjusted long-history Hyperliquid wallet grading with privacy and completeness gates;
4. deterministic event-level microstructure fill approximation executed through a persistent bounded Node worker-thread pool.

All provider integrations remain default-off. Provider-fixture/runtime QA was executed; live external-provider connectivity was not exercised in the delivery container.

---

## 2. Safety invariants

The release preserves the following hard boundaries:

```text
Liquidity Hunter shadowOnly: true
Liquidity Hunter authoritative: false
Autonomous live execution: false
Liquidity Hunter automatic promotion: false
Strategy optimizer automatic promotion: false
Browser read plane: read only
Provider integrations: default off
```

Additional invariants:

- no Liquidity Hunter execution route was added;
- the new microstructure simulator has no exchange, API-key, TradePlan or order-submission dependency;
- Layer 4 still cannot rescue deterministic Layer 1–3 rejection;
- predictive/alternative-data evidence reports `UNKNOWN`/`NOT_CONFIGURED` rather than fabricating neutral values;
- raw Hyperliquid wallet addresses never enter emitted history-grading events;
- Hyblock API keys never enter event payloads/log material;
- observed forced-liquidation prints cannot masquerade as a predictive liquidation map;
- externally supplied wallet payloads cannot self-declare trusted S/F grades.

---

## 3. Predictive liquidation topology provider

### Files

- `src/services/realtime/hyblockLiquidationTopologyFeed.ts`
- `src/services/liquidityHunter/edges/liquidationTopologyEdge.ts`
- `src/services/realtime/evidenceProviderManager.ts`

### Behavior

An optional Hyblock v2 provider adapter can ingest predictive liquidation heatmap buckets and normalize them into Liquidity Hunter topology evidence.

Runtime properties:

- official host allowlist only;
- server-side `x-api-key` use;
- bounded polling interval;
- bounded cluster count;
- provider timestamp and exchange coverage retained;
- methodology explicitly recorded as:

```text
HYBLOCK_PREDICTIVE_LIQUIDATION_HEATMAP_V2
```

The liquidation edge now accepts predictive topology only when `predictive: true` and the methodology is allowlisted. Plain observed liquidation events therefore cannot accidentally become topology PASS evidence.

### Configuration

```text
APEX_LIQUIDITY_HUNTER_HYBLOCK_LIQUIDATION_ENABLED=false
APEX_HYBLOCK_API_KEY=
APEX_HYBLOCK_API_BASE_URL=https://api.hyblockcapital.com/v2
```

No API key is shipped in the release.

---

## 4. Deribit event-time gamma reconstruction

### Files

- `src/services/realtime/deribitOptionMath.ts`
- `src/services/realtime/deribitOptionsPublicFeed.ts`
- `src/services/realtime/deribitOptionsHistoricalImporter.ts`
- `src/services/liquidityHunter/edges/optionsGammaEdge.ts`

### Improvement over v1.0.50

v1.0.50 combined recent option taker-flow with current ticker gamma. v1.0.51 instead prefers event-time reconstruction from the option trade's:

- instrument strike/expiry;
- trade timestamp;
- index/underlying price;
- trade IV.

The Black-Scholes spot-gamma calculation uses the observed trade IV with a zero-rate research proxy. Current ticker gamma remains only a lower-quality fallback when event IV is absent.

Primary methodology:

```text
DERIBIT_PUBLIC_TAKER_FLOW_EVENT_TIME_IV_GAMMA_PROXY
BLACK_SCHOLES_FROM_DERIBIT_TRADE_IV_ZERO_RATE
```

### Historical importer

`importDeribitOptionsHistory()` uses bounded public-history windows. If a response is saturated, the importer recursively subdivides the interval rather than silently accepting truncation. Historical open interest is left `null` unless it is actually available; it is not backfilled from future/current ticker state.

CLI:

```bash
npm run import:deribit-options-history -- --currency BTC --start-ms <epoch> --end-ms <epoch> --output <file.jsonl>
```

### Limitation

This remains a taker-flow/model proxy. It is **not** complete dealer-inventory GEX and is not authoritative for execution.

---

## 5. Hyperliquid long-history wallet grading

### Files

- `src/services/realtime/hyperliquidWalletHistoryGradingFeed.ts`
- `src/services/liquidityHunter/walletGrading.ts`
- `src/services/liquidityHunter/edges/whalePositioningEdge.ts`
- `src/services/liquidityHunter/edges/contrarianWalletEdge.ts`

### Data model

The grader uses public realized history from:

- fills;
- realized PnL;
- fees;
- funding;
- current position state.

It computes:

- net realized PnL after fees/funding;
- win rate;
- profit factor;
- realized-equity max drawdown;
- drawdown-to-gross-profit ratio;
- position-sizing coefficient of variation;
- trade count;
- observed history duration;
- completeness status.

### Completeness and anti-overclaiming

History is fetched in bounded windows. Saturated fill windows and saturated time-range funding responses are recursively subdivided. The public `userFillsByTime` 10,000-most-recent-fill ceiling is treated as an incompleteness condition rather than as complete history. If request budgets or provider limits prevent complete reconstruction, the wallet remains:

```text
UNRATED
```

Conservative minimum history/sample requirements are required before S/A/F classification can be emitted.

### Privacy and trust boundary

- raw configured wallet addresses are used only for outbound public API requests;
- emitted wallet IDs are SHA-256 pseudonyms;
- trusted declared grading is accepted only from the internal history-grader source plus exact methodology and grading version;
- observation-only or externally forged `S`/`F` declarations remain untrusted.

### Limitation

A public realized-history grade is not proof of institutional identity, future skill, or persistent alpha. It remains shadow evidence.

---

## 6. Event-level microstructure fill approximation

### Files

- `src/services/replay/microstructureFillSimulator.ts`
- `src/services/replay/liquidityHunterMicrostructureValidation.ts`
- `scripts/utilities/validateLiquidityHunterMicrostructure.mts`

### Model

The deterministic simulator supports:

- MARKET or LIMIT entry;
- explicit execution-venue/source isolation so trades from one venue cannot consume another venue's modeled queue;
- sequence-preserved replay events;
- displayed-book queue-ahead approximation;
- queue consumption from qualifying aggressor trades;
- partial fills;
- maker/taker fees;
- explicit latency;
- configured market slippage;
- spread/adverse quote execution;
- deterministic stop/target/expiry exits;
- conservative same-observation ordering where stop wins if a coarse event implies both stop and target.

Methodology:

```text
DETERMINISTIC_EVENT_LEVEL_QUEUE_APPROXIMATION_V1
```

The result explicitly reports:

```text
executionSimulation: true
```

but it is not matching-engine ground truth.

### Liquidity Hunter validation bridge

Only evaluations already marked `eligibleForManualConfirmation` are converted into research simulation candidates. The validator remains:

```text
shadowOnly: true
authoritative: false
executionDependency: false
```

CLI:

```bash
npm run validate:liquidity-hunter-microstructure -- --input <events.jsonl> --symbol BTC-USDT --execution-source binance-usdm-ws
```

If `--execution-source` is omitted, the validator resolves an eligible venue conservatively. Ambiguous mixed-venue evidence is not merged into a synthetic queue. The report format is `lh_microstructure_validation_v2` and records the selected execution source.

---

## 7. Persistent bounded worker-thread pool

v1.0.51 improves the first worker-thread batch implementation by keeping one Node `Worker` alive per bounded concurrency slot instead of spawning a new worker for every simulation candidate.

Properties:

- concurrency clamped to 1–8;
- one task at a time per worker;
- deterministic result ordering;
- per-task timeout;
- worker termination on batch completion;
- true CPU isolation from the main control-plane thread.

Executed synthetic CPU benchmark:

```text
64 simulation tasks
3302 events per task
1 worker median: 411.81 ms
4 workers median: 259.51 ms
observed median speedup: 1.59x
1-worker result workers: 1
4-worker result workers: 4
result status/net-output equivalence: PASS
```

Artifact:

`QA/liquidity-hunter-microstructure-worker-benchmark-v1.0.51.json`

This is a hardware/runtime-specific throughput observation, not a profitability claim or universal speed guarantee.

---

## 8. Provider/runtime management

`evidenceProviderManager.ts` now manages four optional evidence families:

1. Deribit public option flow;
2. Hyblock predictive liquidation topology;
3. Hyperliquid observation-only wallet feed;
4. Hyperliquid long-history grading feed.

New default-off flags:

```text
APEX_LIQUIDITY_HUNTER_HYBLOCK_LIQUIDATION_ENABLED=false
APEX_LIQUIDITY_HUNTER_HYPERLIQUID_WALLET_HISTORY_GRADING_ENABLED=false
```

Operations snapshots expose provider state/reasons without exposing secrets or raw wallet watchlists.

---

## 9. Multi-tasking and multi-threading model

This release deliberately separates concurrency types:

### Async bounded multi-tasking

Used for I/O-independent provider/history work and existing walk-forward folds. It is bounded; no unbounded fan-out is introduced.

### Node worker threads

Used for CPU/replay isolation in:

- durable event persistence worker from the earlier Liquidity Hunter core;
- event-level microstructure simulation worker pool in v1.0.51.

The main decision/control path does not wait on autonomous model mutation or an execution worker.

---

## 10. Executed QA

The following checks were actually executed in the delivery environment after the v1.0.51 changes:

### Liquidity Hunter/runtime

- Baseline preservation: **17/17 PASS**.
- Liquidity Hunter source contract: **40/40 PASS**.
- Foundation runtime: **25/25 PASS**.
- Core runtime: **11/11 PASS**.
- Public feed protocol runtime: **10/10 PASS**.
- Deterministic event replay: **9/9 PASS**.
- Read-only WebSocket runtime: **7/7 PASS**.
- Execution-position lifecycle runtime: **6/6 PASS**.
- Strategy optimizer safety runtime: **7/7 PASS**.
- Validation/public providers runtime: **20/20 PASS**.
- v1.0.51 evidence/simulation runtime: **23/23 PASS**.

### Cross-project regression

- Feature preservation: **PASS**.
- Strategy optimization integration: **26/26 PASS**.
- Core 10 Dynamic Fusion: **17/17 PASS**.
- System integration: **12/12 PASS**.
- Backtesting workspace: **25/25 PASS**.
- Merged Stage SEC/UI source contract: **31/31 PASS**.
- Agent-safe merge: **19/19 PASS**.

### Static/source integrity

- v1.0.50 preservation comparison: **795 baseline files / 811 current files / 0 baseline files missing / 16 additive files**.
- TypeScript-family syntax transpile: **410 files / 0 syntax failures**.
- Active `src/` + `server.ts` relative imports: **965 / 0 missing**.
- Express route literals: **110 / 110 unique / 0 duplicates**.
- Persistent worker-pool runtime test: **PASS**.
- Source-only secret/release gate: **PASS**.
- Version identity gate: **PASS**, all release surfaces report `1.0.51`.
- OpenAPI parse: **3.1.0 / info.version 1.0.51 / 11 paths**.

---

## 11. QA not claimed

A clean dependency installation was actually attempted with `npm ci --ignore-scripts`. The configured registry returned HTTP 404 for `vitest-4.1.10.tgz`. Therefore this release does **not** claim fresh success for:

- full package-backed `tsc --noEmit`;
- full Vitest suite;
- Vite production build;
- browser runtime QA;
- accessibility browser QA;
- visual screenshot/geometry QA.

Provider-fixture tests do not prove external API uptime, entitlement, latency, or vendor-data correctness.

---

## 12. Remaining evidence gaps

The next research phase should focus on actual recorded datasets and statistical validation, not additional execution autonomy:

1. collect real Hyblock topology history under the user's own server-side entitlement and validate coverage/staleness;
2. import bounded historical Deribit option flow and compare event-time gamma proxy stability by expiry/regime;
3. collect complete Hyperliquid wallet histories over long horizons and test grading persistence/out-of-sample behavior;
4. record sequence-correct multi-exchange L2/trade datasets;
5. run the microstructure simulator through purged walk-forward and untouched holdout datasets;
6. estimate sensitivity to queue-ahead fraction, latency, slippage, fees and missing events;
7. keep all resulting strategy/edge promotions manual and reversible.

---

## 13. Final release position

v1.0.51 advances APEX from signal-price-only forward analysis toward a reproducible event-level evidence/simulation stack. It adds real provider interfaces and a more realistic execution approximation without crossing the safety boundary into autonomous execution.

The correct interpretation is:

> **Better evidence and better simulation, not proof of alpha and not exchange-matching fidelity.**

No live Liquidity Hunter order path was added or enabled.
