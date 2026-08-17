# APEX Trading Logic Inventory and Integrated Flow — V3

## Purpose

This document records the current role, consumers, authority, and integration state of the trading modules after the incremental V3 upgrade. It is intended to prevent an offline or shadow-only capability from being presented as an active production capability.

## Current integrated flow

```text
Verified market data + independent timeframe feeds
  → live candidate baseline scoring (ROC behavior preserved)
  → canonical DecisionSnapshot v2
      ├─ baseline ranking/readiness
      ├─ advanced ATLAS evaluation in shadow mode
      ├─ Smart Money Context adapter and availability state
      ├─ feature-quality/completeness metadata
      └─ configured/effective scanner policy metadata
  → shared TradePlan v1
      ├─ entry range, stop and targets
      ├─ sizing and leverage
      ├─ fees, spread, slippage, funding and market impact
      ├─ expected net edge and net risk/reward
      └─ expiry and integrity validation
  → Risk Governor v1
      ├─ trade, portfolio and loss limits
      ├─ margin, concentration and leverage checks
      ├─ stale/degraded data and reconciliation checks
      └─ global/exchange/symbol/strategy kill switches
  → demo, testnet or connected-exchange adapter
      ├─ durable intent before submission
      ├─ unique client order ID
      ├─ uncertain-result reconciliation
      ├─ individual REST fill records when available
      └─ protection-order state tracking
```

## Replay flow

```text
PROXY_REPLAY
  candle history
  → explicitly ESTIMATED microstructure/funding/open-interest inputs
  → canonical DecisionSnapshot v2
  → TradePlan v1
  → Risk Governor v1
  → cost-aware simulated exit

PRODUCTION_INPUT
  candle history + recorded per-bar market inputs
  → critical-input availability validation
  → canonical DecisionSnapshot v2
  → TradePlan v1
  → Risk Governor v1
  → cost-aware simulated exit
```

Proxy and production-input results remain separately labelled. A production-input bar is counted as fully aligned only when its critical inputs are valid and derived SMC is available.

## Module classification

| Module | Classification | Current consumers | Authority |
|---|---|---|---|
| `src/lib/scoring.ts` | Live baseline / shared | Canonical adapter, candidate UI | Authoritative baseline ranking and readiness while shadow promotion gates remain incomplete |
| `src/services/scannerCore.ts` | Live shadow / replay advanced engine | Canonical adapter | Shadow evidence and gate evaluation; not independently authoritative for live orders |
| `src/services/canonicalDecisionAdapter.ts` | Shared integration adapter | Live candidate/symbol routes, proxy replay, production replay, audit logger | Authoritative decision contract; baseline still decides direction during migration |
| `src/services/smartMoneyContextAdapter.ts` | Shared adapter | Canonical live and replay paths | Provides derived context plus explicit availability; missing context is never neutral evidence |
| `src/services/smartMoneyContextEngine.ts` | Shared analysis engine | SMC adapter | Derived SMC implementation |
| `src/services/scannerConfigPolicy.ts` | Shared policy | Canonical adapter and replay | Authoritative effective-config normalization and QStruct bounds |
| `src/services/adaptiveThresholdEngine.ts` | Offline proposal engine | Adaptive governance | Produces bounded proposals only; never writes live config directly |
| `src/services/adaptiveThresholdGovernance.ts` | Operations governance | Server operations API, scanner config provider | Only manually approved revisions can become active; supports rejection and rollback |
| `src/services/tradePlan.ts` | Shared execution contract | Symbol route, existing order ticket, demo, live, replay | Authoritative plan geometry, costs, sizing and expiry validation |
| `src/services/riskGovernor.ts` | Shared safety policy | Demo, live, testnet and replay | Authoritative pre-submission risk result |
| `src/services/demoAccount.ts` | Paper execution | Existing account/order-ticket UI | Demo execution after shared plan/risk validation |
| `src/services/testnetExecution.ts` | Testnet/validation execution | Server testnet routes | Existing lifecycle preserved and extended with persistence/reconciliation/fill metadata |
| `src/services/connectedExchange.ts` | Connected live execution adapter | Existing account/order-ticket UI | Live submission only after preview, confirmation, plan and risk revalidation |
| `src/services/liveExecutionIntentStore.ts` | Execution persistence | Connected-exchange adapter | Durable live intent/reconciliation record |
| `src/services/backtesting.ts` | Proxy and production-input replay | Market backtest API | Uses canonical decision/plan/risk layers; proxy results are not production claims |
| `src/services/mlFeatureExtractor.ts` | Shared feature schema / shadow ML | Logger, ML training and governance | Existing versioned schema preserved; not a live decision authority |
| `src/services/mlGovernance.ts` | Offline/shadow governance | Operations API | Reports calibration/drift/promotion gates; never auto-promotes a model |
| `src/services/directionDivergenceAnalysis.ts` | Offline analytics | Tests/analysis utilities | Non-authoritative |
| `src/services/mathEngine.ts::detectStructuralZones` | Planned/offline | No live consumer | Non-authoritative until a separate reviewed integration task |

## Confirmed audit findings and resolution state

### Separate live and replay algorithms

Resolved at the contract level: both live and replay now enter through `buildCanonicalDecision`. The advanced engine remains shadow-only in live operation by design; this is explicit rather than an accidental split.

### Disconnected SMC

Resolved for canonical live and replay paths. Replay only receives real SMC when the supplied timeframe candle sets are sufficient. Missing history produces an explicit availability state and cannot improve confidence.

### Proxy backtesting

Preserved and explicitly labelled. A separate production-input replay accepts recorded OBI/order-book, spread, micro-price, funding, open interest, sentiment and timeframe data. Critical missing production inputs reject the bar.

### False multi-timeframe confluence

Resolved for live scanning and symbol detail: 15-minute and 1-hour series are fetched independently. The requested chart interval is no longer reused as the 1-hour scoring series.

### Misnamed MACD

The original behavior is preserved as ROC momentum. A versioned real EMA 12/26/9 MACD runs as a shadow feature and records agreement/disagreement without silently changing the strategy.

### Missing evidence presented as neutral

Feature-quality states and usable-evidence weight normalization now prevent missing inputs from receiving a full neutral scoring weight. Readiness is guarded by feature completeness.

### QStruct and hidden replay overrides

Effective configuration is normalized with a two-sided QStruct clamp. Replay SMC caps remain versioned, visible and logged.

### Direction asymmetry

`LONG_ONLY`, `SHORT_ONLY`, and direction-specific SMC opposition are supported. Live scanning produces two ranked directional evaluations instead of silently preferring SHORT when both sides evaluate.

### Trade Plan and Risk Governor

The same plan contract is returned to and used by the existing order ticket, revalidated server-side, and consumed by demo/live/replay. Testnet manual orders receive central risk checks but remain allowed to operate without a generated plan only as supervised manual execution.

### Adaptive and ML governance

Adaptive output is a proposal, not an automatic mutation. Proposals are evidence-gated, persisted, manually approved through authenticated operations routes and reversible. ML remains shadow-only and reports calibration and drift separately from ranking score.

## UI integration policy

No new page was introduced. Existing candidate cards and the existing order ticket were extended without changing the program’s page scale or theme. Any future page must first be delivered as a design image and must not be implemented until approved.

## Known operational limitations

1. KuCoin private WebSocket order/fill streaming is not introduced in this version. REST reconciliation and durable intent recovery are implemented; private-stream integration remains a separate exchange-specific hardening task.
2. Protective orders are tracked as requested/attached-unverified because an exchange-side private stream or dedicated protection-order query is required to claim active protection with certainty.
3. Individual fills are persisted when the REST recent-fill endpoint returns identifiable records. Temporary fill-history lag does not override authoritative order state.
4. The advanced engine remains live shadow-only. Promotion requires measured parity, latency, outcome and safety evidence; it is not automatically enabled by this upgrade.
5. Calibrated probability remains `null` unless a governed calibrated model exists. Ranking score is not displayed or stored as win probability.
