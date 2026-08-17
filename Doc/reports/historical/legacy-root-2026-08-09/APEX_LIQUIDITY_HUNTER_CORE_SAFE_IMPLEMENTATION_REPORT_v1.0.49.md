# APEX v1.0.49 — Liquidity Hunter Core Safe Implementation Report

**Release:** `1.0.49`  
**Target tree:** `APEX-complete-integrated-v1.0.49-liquidity-hunter-core-safe`  
**Implementation mode:** additive, feature-preserving, shadow-first  
**Safety boundary:** Liquidity Hunter is non-authoritative and cannot autonomously execute live orders.

## 1. Delivery summary

This release completes the safe executable Liquidity Hunter **core** around the existing APEX platform rather than replacing the existing strategy, backtest, risk, TradePlan, or execution systems.

Implemented:

- ten evidence-only Liquidity Hunter edge evaluators;
- four ordered evaluation layers;
- a deterministic setup state machine;
- regime-aware Dynamic Fusion;
- quality/TTL/staleness enforcement;
- bounded realtime world state and series storage;
- sequence-aware order-book reconstruction;
- public Binance USDⓈ-M and Bybit linear WebSocket collectors behind default-off flags;
- public Funding/OI historical bootstrap;
- a worker-thread append-only event log;
- deterministic event-replay manifests and replay runner;
- a bounded read-only WebSocket read plane;
- Strategy Studio Liquidity Hunter shadow UI;
- a pure execution/position lifecycle state machine;
- strategy-optimizer purge/embargo isolation and explicit manual promotion;
- v1.0.48 replay-cache/indicator and adaptive-threshold improvements while preserving current compatibility contracts.

Not claimed as connected production capabilities:

- paid/verified liquidation heatmap provider;
- production taker-flow options GEX provider;
- long-duration Hyperliquid wallet discovery/grading feed;
- external credibility-scored sentiment provider;
- external Meta-RL/meta-model service;
- autonomous live Liquidity Hunter execution.

Those dependencies remain explicit `NOT_CONFIGURED`/`UNKNOWN` evidence instead of fabricated neutral data.

---

## 2. Safety architecture

### 2.1 Non-authoritative core

The Liquidity Hunter fusion policy is hard-limited to:

```text
shadowOnly: true
authoritative: false
automaticPromotionEnabled: false
majorityVoteAllowed: false
layer4MayRescueDeterministicFailure: false
executionModes: MANUAL | PAPER
```

The feature-flag loader rejects any attempt to disable shadow-only mode in this release. No Liquidity Hunter execution route was added.

### 2.2 Sweep direction and trade direction are separate

The architecture no longer conflates a downside sweep with a short trade. The contracts independently represent:

```ts
type SweepDirection = 'UP' | 'DOWN' | 'NONE';
type TradeBias = 'LONG' | 'SHORT' | 'BOTH' | 'NO_TRADE';
```

This prevents the earlier `SHORT_ONLY → downside sweep → LONG` contradiction.

### 2.3 Setup and execution lifecycles are separate

The setup state machine models:

```text
IDLE
→ MACRO_ELIGIBLE
→ TARGET_MAPPED
→ ARMED
→ MICRO_TRIGGERED
→ SHADOW_VALIDATING
→ READY_FOR_CONFIRMATION
→ EXPIRED | REJECTED
```

A separate pure execution-position state machine models:

```text
CREATED
→ RISK_AUTHORIZED
→ AWAITING_MANUAL_CONFIRMATION
→ SUBMITTING
→ ACKNOWLEDGED / PARTIALLY_FILLED / FILLED
→ PROTECTING
→ PROTECTED
→ CLOSING
→ CLOSED
```

with `UNKNOWN`, `RECONCILING`, and `FAILED` recovery states. This state machine is not wired to autonomous Liquidity Hunter execution.

---

## 3. Ten-edge implementation status

| Edge | Runtime evaluator | Data state in this release |
|---|---|---|
| Liquidation Topology | Implemented | Provider-gated; honest `NOT_CONFIGURED` without verified heatmap data |
| Whale Positioning | Implemented | Provider-gated; long-duration wallet feed not connected |
| Iceberg Absorption | Implemented | Shadow-capable from valid sequence-validated L2; Binance book can satisfy sequencing |
| Options Gamma | Implemented | Provider-gated; production options surface not connected |
| Multi-Exchange CVD | Implemented | Shadow-capable from public Binance + Bybit trades when feeds are enabled |
| Session Liquidity | Implemented | Diagnostic/shadow from existing deterministic candle/SMC context |
| Funding + OI | Implemented | Public server-side historical bootstrap available |
| Sentiment Velocity | Implemented | External credibility-scored source remains optional/provider-gated |
| Meta Model | Implemented | External model remains optional/provider-gated and non-authoritative |
| Contrarian Wallets | Implemented | Provider-gated; long-duration F-grade cohort data not connected |

No edge can submit an order or mutate a production threshold.

---

## 4. Four-layer state machine

### Layer 1 — Macro

Consumes Funding/OI, GEX, and optional sentiment evidence. Produces macro regime, expected sweep direction, and post-sweep trade bias.

### Layer 2 — Target

Consumes session/SMC and liquidation-topology evidence. Produces target-zone and expiry information.

### Layer 3 — Microstructure

Consumes target state, multi-exchange CVD, and sequence-valid iceberg/order-book evidence. Reversal and continuation triggers are explicit and distinct.

### Layer 4 — Shadow validation

Consumes whale, contrarian-wallet, and meta-model evidence. It may confirm, reduce, defer, reject, or remain unknown. It cannot rescue a deterministic Layer 1–3 failure.

The final setup can only become `READY_FOR_CONFIRMATION`; it cannot become an execution authorization.

---

## 5. Multi-threading and multi-tasking

### 5.1 Actual worker thread

`src/services/realtime/appendOnlyEventLog.ts` uses Node `worker_threads.Worker` for filesystem append/rotation/fsync work. The control-plane event loop does not execute `fsync` itself.

Durability acknowledgements remain explicit: the main thread awaits the writer's acknowledgement while expensive filesystem work executes in the worker.

### 5.2 Bounded concurrent tasks

The release uses concurrent read-only work where independent tasks can safely run together:

- ten edge evaluators via `Promise.allSettled`;
- Funding/OI context fetches concurrently;
- candle-context reads concurrently;
- independent public market-feed clients concurrently;
- replay checkpoint context derivation concurrently;
- bounded strategy-optimizer candidate evaluation.

Layer transitions remain sequential and deterministic after concurrent evidence collection. This preserves state-machine correctness while using multitasking for independent I/O/compute.

### 5.3 No unbounded fan-out

Queues, WebSocket clients, optimizer concurrency, candidate budgets, replay evaluation cadence, and realtime series are bounded. The read plane is capped at 10 updates/second.

---

## 6. Realtime data plane

### 6.1 Public collectors

Implemented default-off public collectors:

- Binance USDⓈ-M Futures public market data;
- Bybit linear public market data.

They normalize trades/order-book context into shared `MarketEvent` contracts.

### 6.2 Sequence policy

Binance depth bootstrap/deltas are sequence validated and rebuild on gaps.

Bybit order-book data is deliberately marked non-authoritative for iceberg evidence in this adapter because the implementation does not claim equivalent exact previous-update linkage. Bybit trades still contribute to multi-exchange CVD.

### 6.3 Loss policy

Authoritative `TRADE` events are lossless by default. Only non-authoritative sentiment events may be sampled under pressure, and sampling returns an explicit disposition rather than pretending delivery occurred.

### 6.4 Gap invalidation

A sequence gap immediately invalidates dependent world state, bounded realtime series, and order-book state. Dependent edges fail closed until recovery/reseed.

### 6.5 Timestamp policy

Live events reject unreasonable future/past skew. Historical bootstrap and replay events are explicitly tagged and retain their historical timestamps rather than being fabricated as current data.

---

## 7. Event persistence and deterministic replay

### Event log

The append-only log uses restrictive permissions and worker-thread durability.

### Dataset manifests

Event replay manifests include SHA-256 identity, source/symbol/time metadata, event counts, and quality information. Manifest verification detects tampering.

### Replay determinism

The replay runner:

- stable-sorts source events;
- converts ingestion kind to `REPLAY`;
- uses deterministic ID generation;
- uses event time instead of wall-clock time for historical TTL/series behavior;
- recreates world state, sequence guards, order-book state, edge evaluations, layers, and fusion;
- remains shadow-only and cannot authorize execution.

---

## 8. Read plane and UI

### Read-only WebSocket

The server exposes a bounded read-only Liquidity Hunter WebSocket channel:

```text
/ws/liquidity-hunter?symbol=BTC-USDT
```

Properties:

- same-origin browser enforcement;
- maximum 64 clients;
- maximum 10 fps;
- sequenced snapshots/patches;
- heartbeat/ping-pong;
- backpressure limit;
- client commands rejected;
- no execution authority in payloads.

### Strategy Studio

Strategy Studio can run server-side shadow evaluation and display:

- four layer states;
- fusion score;
- sweep direction;
- post-sweep bias;
- trigger classification;
- Layer 4 result;
- manual-candidate state;
- explicit shadow/non-authoritative warning.

---

## 9. Strategy optimizer remediation

The project audit identified two governance/validation regressions in the newer optimizer. Both were corrected.

### 9.1 Automatic promotion disabled

- optimizer input now defaults `autoPromote` to `false`;
- Strategy Studio requests `false`;
- optimizer route never implicitly promotes;
- reviewed candidate promotion is a separate explicit action;
- stale review protection requires the exact latest report identity;
- profile history and rollback are preserved.

### 9.2 Purge/embargo restored

Chronological optimization now records and applies purge and embargo gaps around validation/holdout boundaries. The default derives from the configured holding horizon where passed by the route.

The newer optimizer search architecture is retained:

- Halton low-discrepancy candidates;
- successive halving;
- leader/local refinement;
- bounded concurrency;
- request coalescing;
- cancellation/timeouts;
- cost stress;
- neighbor stability;
- profile revisions/rollback.

---

## 10. Preservation of existing APEX systems

This release does not replace:

- strategy registry;
- existing bespoke/scanner strategy engines;
- existing backtest route;
- canonical decision adapter;
- TradePlan;
- Risk Governor;
- adaptive-threshold governance;
- provider router/fallback chain;
- execution-intent persistence;
- testnet/live reconciliation;
- Strategy Studio or Backtesting workspace.

The Liquidity Hunter core is additive and shadow-only.

---

## 11. Actually executed QA

The following checks were executed against this exact v1.0.49 tree after the implementation changes.

| Check | Result |
|---|---|
| Liquidity Hunter core runtime | **11/11 PASS** |
| Liquidity Hunter foundation runtime | **25/25 PASS** |
| Public-feed protocol runtime | **10/10 PASS** |
| Event-replay runtime | **9/9 PASS** |
| Read-plane WebSocket runtime | **7/7 PASS** |
| Execution-position state runtime | **6/6 PASS** |
| Strategy optimizer safety runtime | **7/7 PASS** |
| Liquidity Hunter baseline preservation | **17/17 PASS** |
| Liquidity Hunter source contract | **31/31 PASS** |
| Strategy optimization integration | **26/26 PASS** |
| Feature preservation | **PASS** |
| Core 10 Dynamic Fusion | **17/17 PASS** |
| Strategy-engine deterministic smoke | **PASS** |
| Adaptive governor | **PASS** |
| System integration | **12/12 PASS** |
| Backtesting workspace | **25/25 PASS** |
| Merged Stage SEC/UI source contract | **31/31 PASS** |
| Agent-safe merge | **19/19 PASS** |
| Attached feature parity | **15/15 PASS** |
| Trading submenu relocation | **11/11 PASS** |

The strategy-engine smoke uses deterministic synthetic fixtures. Its PnL values are QA fixture outputs only and are not profitability claims.

---

## 12. Dependency/build limitation

A fresh dependency installation was attempted with:

```text
npm ci --ignore-scripts
```

It failed because the configured package registry returned HTTP 404 for:

```text
vitest-4.1.10.tgz
```

Therefore this report does **not** claim fresh success for:

- full package-backed `tsc --noEmit`;
- repository Vitest suite;
- Vite production build;
- browser runtime suite;
- accessibility browser suite;
- visual screenshot/geometry suite.

Source/runtime QA that does not require the unavailable dependency tree was executed as listed above.

A direct credential-free live WebSocket connectivity probe was also attempted from this delivery container against the configured Binance USDⓈ-M and Bybit public endpoints. Both returned a generic WebSocket network error in this environment, so live exchange connectivity is **not** claimed as verified. Protocol-level adapter behavior is covered by the deterministic 10/10 public-feed runtime fixture instead.

Additional static/runtime integrity checks on the final tree:

- OpenAPI YAML parse: PASS (`1.0.49`).
- TypeScript-family syntax transpile: 387 files / 0 syntax errors.
- Active relative imports: 897 checked / 0 missing.
- Route literals: 109 / 109 unique method+path pairs / 0 duplicates.
- CSS brace parse: PASS.
- Files removed relative to the supplied v1.0.47 foundation archive: 0.

---

## 13. External-data limitations

The release deliberately does not fabricate provider-dependent evidence.

Still provider-gated:

1. **Liquidation topology:** a latent liquidation heatmap requires a verified provider/dataset; executed liquidations alone are not equivalent.
2. **Options GEX:** the evaluator exists, but a complete production taker-flow/Greeks surface is not connected.
3. **Wallet grading:** evaluators exist, but a statistically adequate long-duration Hyperliquid cohort feed is not connected.
4. **Credibility-weighted sentiment:** evaluator exists; a verified source/author credibility dataset is not connected.
5. **Meta model:** evaluator contract exists; no external model is allowed to become authoritative.

These are data dependencies, not silently simulated features.

---

## 14. What this release does not guarantee

This release does not guarantee:

- profitability;
- a perfect strategy;
- zero crashes;
- zero latency;
- exchange availability;
- lossless behavior outside the explicitly protected event classes;
- correctness of external providers not exercised in this environment.

The architecture is designed for deterministic, auditable, fail-closed behavior under known dependencies, not guaranteed financial outcomes.

---

## 15. Final safety position

```text
Liquidity Hunter strategy core: IMPLEMENTED IN SHADOW MODE
Ten edge evaluators: IMPLEMENTED
Four-layer state machine: IMPLEMENTED
Dynamic Fusion: IMPLEMENTED / NON-AUTHORITATIVE
Public Binance/Bybit feeds: IMPLEMENTED / DEFAULT OFF
Event replay: IMPLEMENTED / DETERMINISTIC
Read plane: IMPLEMENTED / READ ONLY
Strategy optimizer promotion: MANUAL ONLY
Execution-position lifecycle: IMPLEMENTED AS PURE STATE MACHINE
Autonomous Liquidity Hunter live execution: NOT ENABLED
Risk Governor / TradePlan / existing reconciliation: PRESERVED
```

The next production step is not to unlock live trading. It is to connect and validate the remaining provider-gated evidence sources, collect event datasets, run event-level walk-forward/holdout validation, and only then evaluate paper/manual-testnet canaries.
