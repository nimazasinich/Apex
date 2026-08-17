# APEX v1.0.50 — Liquidity Hunter Validation, Public Evidence Observation & Paper Canary

**Release status:** shadow-only / non-authoritative  
**Base:** APEX v1.0.49 Liquidity Hunter Core Safe  
**Version:** 1.0.50  
**Date:** 2026-08-07  
**Execution boundary:** no autonomous Liquidity Hunter execution; existing manual/testnet/live safety paths were not bypassed.

## 1. Scope

This release continues the v1.0.49 Liquidity Hunter implementation without replacing existing APEX strategy, risk, execution, backtesting, optimizer, or UI systems. The main goal is to make the next research cycle measurable and safer before adding any autonomous execution capability.

The release adds four capabilities:

1. credential-free public evidence observation for Deribit options and a configured Hyperliquid wallet watchlist;
2. purged/embargoed event-level walk-forward validation with a final untouched holdout;
3. deterministic forward signal-outcome analysis;
4. a research-only paper canary with no exchange or order-submission dependency.

All new functionality is default-off unless explicitly enabled.

---

## 2. Safety invariants preserved

The following invariants remain enforced:

- Liquidity Hunter remains `shadowOnly: true`.
- Liquidity Hunter remains `authoritative: false`.
- `autonomousLiveExecutionEnabled` remains hardcoded `false`.
- Liquidity Hunter has no POST/PUT/PATCH/DELETE execution route.
- Dynamic Fusion cannot authorize orders.
- Layer 4 cannot rescue a deterministic Layer 1–3 rejection.
- Strategy optimizer automatic promotion remains disabled.
- Optimizer promotion remains explicit/manual and revisioned.
- Purge/embargo isolation remains present in strategy optimization.
- Existing `TradePlan`, `RiskGovernor`, execution-intent persistence, testnet execution, and reconciliation controls remain in place.
- The new paper canary never creates a TradePlan and never calls an exchange.
- Public Hyperliquid observations cannot self-declare a trusted S/A/F grade.

---

## 3. New Deribit public option-flow proxy

### Files

- `src/services/realtime/deribitOptionsPublicFeed.ts`
- `src/services/realtime/evidenceProviderManager.ts`
- `src/services/liquidityHunter/edges/optionsGammaEdge.ts`

### Behavior

The collector uses credential-free public Deribit endpoints to obtain:

- recent option trades;
- taker direction;
- option instrument identity;
- current ticker gamma;
- current open interest;
- current underlying/index price.

Normalized events are published as `OPTION_TRADE` evidence using methodology:

```text
DERIBIT_PUBLIC_TRADE_PLUS_CURRENT_TICKER_GREEKS
```

### Critical limitation

This is **not** authoritative historical dealer-inventory reconstruction. Current ticker Greeks are sampled at collection time and combined with public recent trade direction. The downstream GEX edge therefore:

- remains shadow-only;
- explicitly records the proxy methodology;
- caps quality for this provider;
- exposes a conflict/reason stating that it is not authoritative inventory reconstruction.

### Security

Runtime endpoint overrides are restricted to official HTTPS Deribit hosts (`www.deribit.com` and `test.deribit.com`) under `/api/v2`.

Official API references used for this integration:

- `public/get_last_trades_by_currency`
- `public/ticker`

---

## 4. New Hyperliquid wallet observation collector

### Files

- `src/services/realtime/hyperliquidWalletObservationFeed.ts`
- `src/services/realtime/evidenceProviderManager.ts`
- `src/services/liquidityHunter/edges/whalePositioningEdge.ts`
- `src/services/liquidityHunter/edges/contrarianWalletEdge.ts`
- `src/services/liquidityHunter/walletGrading.ts`

### Behavior

The collector reads public Hyperliquid information only for an explicitly configured watchlist. It obtains current position direction/size/leverage and recent public fills.

It intentionally does **not** perform wallet grading.

Each emitted event is:

```text
grade: UNRATED
observationOnly: true
gradingReady: false
```

### Privacy boundary

Raw wallet addresses are SHA-256 pseudonymized before an event enters the central event bus or append-only log. Runtime/operations snapshots do not expose the configured raw watchlist.

### Anti-fabrication boundary

The wallet edges were hardened so that an observation-only event cannot become trusted evidence by declaring its own `S`, `A`, or `F` grade. Missing PnL/drawdown values also remain null and are not converted to zero.

A statistically valid long-duration fee/funding-adjusted grading pipeline is still required before S/F wallet evidence can become authoritative enough for strategy validation.

Official public API family used for the observer: Hyperliquid `/info` (`clearinghouseState`, `userFills`).

---

## 5. Event-level walk-forward validation

### Files

- `src/services/replay/liquidityHunterWalkForwardValidation.ts`
- `src/services/replay/liquidityHunterOutcomeAnalysis.ts`
- `scripts/utilities/validateLiquidityHunterRecording.mts`

### Validation topology

The validator creates chronological development folds plus one final untouched holdout.

Each scored validation window is isolated by a configurable purge interval. The final holdout also has a configurable embargo before it.

Default research policy:

```text
walk-forward folds: 3
holdout fraction: 20%
warmup: 60 min
purge: 5 min
embargo: 5 min
max concurrent folds: 2
analytical round-trip cost: 10 bps
forward horizons: 5m / 15m / 60m
```

All limits are bounded.

### Multi-tasking

Independent validation windows are evaluated through a bounded async worker pool. This provides safe multi-tasking without unbounded `Promise.all` fan-out.

### Determinism

The report includes:

- replay dataset manifest;
- deterministic replay fingerprints;
- chronological window definitions;
- edge availability/quality summaries;
- layer pass rates;
- setup counts;
- forward-outcome summaries;
- SHA-256 report fingerprint.

Identical event data and policy produced identical fingerprints in executed QA.

### Governance

Validation reports hardcode:

```text
shadowOnly: true
authoritative: false
automaticPromotionEnabled: false
```

They cannot promote thresholds or authorize execution.

---

## 6. Forward signal-outcome analysis

`liquidityHunterOutcomeAnalysis.ts` evaluates what happened after a manual-confirmation candidate using observed market prices.

It calculates, by configured horizon:

- gross directional return;
- analytical cost-adjusted return;
- MFE;
- MAE;
- deterministic invalidation touch;
- 1R touch;
- 2R touch;
- whether 1R/2R occurred before invalidation.

This is intentionally labeled:

```text
methodology: SIGNAL_PRICE_FORWARD_OUTCOME
executionSimulation: false
```

It is **not** an exchange fill simulator and does not claim queue position, partial-fill, spread, or latency realism.

---

## 7. Research-only paper canary

### File

- `src/services/liquidityHunter/paperCanary.ts`

### Route

```text
GET /api/liquidity-hunter/paper-canary
```

The canary may capture a setup only if it is already marked `eligibleForManualConfirmation` by the shadow engine and a valid signal price/invalidation is available.

It then observes subsequent `TRADE`/`QUOTE` events and tracks:

- OPEN;
- INVALIDATED;
- HIT_2R;
- EXPIRED;
- 1R timestamp;
- MFE/MAE;
- last observed price.

Safety fields are explicit:

```text
executionDependency: false
orderSubmissionAllowed: false
```

Persistence is local, atomic, bounded, and uses restrictive file permissions.

---

## 8. Configuration added

All new provider/canary capabilities default off.

```text
APEX_LIQUIDITY_HUNTER_DERIBIT_OPTIONS_ENABLED=false
APEX_LIQUIDITY_HUNTER_HYPERLIQUID_WALLET_OBSERVER_ENABLED=false
APEX_LIQUIDITY_HUNTER_PAPER_CANARY=false
```

Optional bounded settings are documented in `.env.example`.

No environment setting can enable autonomous Liquidity Hunter live execution.

---

## 9. Executed verification

The following checks were actually executed against the v1.0.50 source tree.

### Liquidity Hunter suite

- Baseline preservation: **17/17 PASS**
- Liquidity Hunter source contract: **36/36 PASS**
- Realtime foundation runtime: **25/25 PASS**
- Four-layer core runtime: **11/11 PASS**
- Binance/Bybit public-feed protocol runtime: **10/10 PASS**
- Deterministic event replay: **9/9 PASS**
- Read-only WebSocket runtime: **7/7 PASS**
- Execution-position FSM runtime: **6/6 PASS**
- Strategy optimizer safety runtime: **7/7 PASS**
- Deribit/Hyperliquid/validation/paper-canary runtime: **20/20 PASS**

### Wider regression checks

- Feature-preservation runtime contract: **PASS** (13 historical strategy identities preserved; 19 checks printed)
- Strategy optimization integration: **26/26 PASS**
- Core 10 Dynamic Fusion contract: **17/17 PASS**
- System integration: **12/12 PASS**
- Backtesting workspace contract: **25/25 PASS**
- Merged Stage SEC/UI source contract: **31/31 PASS**
- Agent-safe merge contract: **19/19 PASS**

### Static/integrity checks

- TypeScript/TSX/MTS syntax transpilation: **395 files / 0 syntax failures**
- Active source relative imports: **921 / 0 missing**
- Express route literals: **110 / 110 unique / 0 duplicates**
- OpenAPI YAML parse: **PASS**, version `1.0.50`, paper-canary route present
- Version identity gate: **PASS**
- Source-only secret/release gate: **PASS**
- Comparison against v1.0.49 archive: **783 old files preserved / 0 missing** before adding this report

---

## 10. Verification blocked / not claimed

A fresh dependency install was attempted:

```text
npm ci --ignore-scripts
```

It failed because the configured package registry returned HTTP 404 for:

```text
vitest-4.1.10.tgz
```

Therefore this delivery does **not** claim fresh success for:

- package-backed `tsc --noEmit`;
- full Vitest suite;
- production Vite build;
- Playwright/browser runtime;
- accessibility browser testing;
- visual screenshot/geometry testing.

The new recorded-event CLI was not executed directly through `tsx` because dependencies could not be installed; its underlying validation modules were executed through the source-transpiled QA harness.

No real exchange order submission was run.

No live wallet grading, live Meta-RL, paid liquidation heatmap, or authoritative dealer-inventory GEX validation is claimed.

---

## 11. Remaining provider-gated work

The next safe provider work remains:

1. verified liquidation-topology source with provenance and TTL;
2. authoritative/reconstructed options GEX dataset suitable for historical replay;
3. long-duration Hyperliquid wallet performance dataset with fees/funding and regime coverage;
4. credibility-scored sentiment source with timestamped history;
5. external meta-model sidecar with model/feature/dataset versioning;
6. microstructure fill simulator using event-level L2, spread, queue approximation, latency, fees, funding, partial fills, and adverse selection.

These should be added in shadow/research mode first and must pass the same holdout/cost/stability gates before any testnet canary is considered.

---

## 12. Final safety position

APEX v1.0.50 is a validation and evidence-observation release, not an autonomous execution release.

The system can now collect additional public evidence, measure Liquidity Hunter candidates across isolated event-level windows, and track paper outcomes without pretending those observations are validated alpha or real fills.

**Autonomous live execution remains disabled.**
