# Liquidity Hunter Foundation Implementation

## Scope

This delivery implements only the safe first package from the Multi-Layer Liquidity Hunter plan: baseline preservation, versioned realtime contracts, default-off feature flags, an evidence-only edge catalog, and an in-process recording/world-state foundation. It does not connect a live provider, change strategy decisions, promote thresholds, submit orders, or enable autonomous execution.

## Added foundations

- Versioned realtime event, evidence, threshold, setup, execution-state, and WebSocket contracts.
- Ten-edge catalog with explicit dependencies, TTLs, layers, and honest availability states.
- Shadow-only fusion policy with no majority-vote authority and no automatic promotion.
- Bounded in-process event bus with event-class overflow policies.
- Append-only JSONL event log with atomic rotation and flush-on-shutdown.
- Sequence guard, materialized quality-tagged world state, snapshot coordinator, and realtime health summary.
- Read-only operations endpoint: `GET /api/operations/liquidity-hunter`.
- Operations-status integration exposing feature flags and unavailable/not-configured states.
- Baseline and foundation QA contracts plus deterministic runtime smoke.

## Safety boundary

Every new capability is disabled by default. The runtime may allocate its bounded local foundation, but it receives no external events unless later adapters are explicitly implemented and enabled. The foundation cannot submit an order, mutate a strategy, approve risk, or promote a threshold. Existing scanner, strategy, backtest, manual, paper, testnet, and execution-intent paths remain authoritative and independent.

## Deferred by design

The following plan stages are not implemented in this package: exchange realtime adapters, sequence-correct live L2 reconstruction, multi-exchange CVD, iceberg detection, liquidation-provider integration, options GEX, wallet grading, sentiment velocity, meta-model sidecar, four-layer setup execution, read-plane WebSocket UI, event-level authoritative replay, and manual testnet canary. Those stages require their own fixtures, providers, credentials, performance evidence, and promotion gates.

## Verification commands

```bash
npm run qa:liquidity-hunter-baseline
npm run qa:liquidity-hunter-foundation
npm run qa:liquidity-hunter-runtime
npm run qa:liquidity-hunter
```

The package-backed full pipeline still requires a registry that can install the pinned dependencies.
