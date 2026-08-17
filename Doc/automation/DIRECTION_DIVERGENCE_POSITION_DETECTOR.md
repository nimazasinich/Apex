# APEX Direction-Divergence Position Detector

Status: planned, shadow-only

This document is the APEX-compatible adaptation of the attached
Direction-Divergence Position Detector proposal. The source proposal is useful
as a classification concept, but its HermesFace-3/Python/execution assumptions
do not describe this TypeScript APEX codebase.

## Compatibility decision

Keep:

- Separate `orderDirection` from market-trend alignment.
- Report a graded `alignmentScore`, `trendStrength`, and
  `timeframeAgreement`, rather than one opaque label.
- Use futures context already present in APEX: funding, open-interest change,
  and long/short sentiment when genuinely available.
- Validate by historical replay and shadow-mode logging before any behavior
  change.

Adapt:

- Implement pure TypeScript services beside `scannerCore.ts`.
- Use APEX's existing `ScanEvaluation.direction`, `MarketContext`, candle
  availability flags, and `SignalDecisionLog`.
- Start with the actual candle layers already fetched by the scanner:
  `1m`, `5m`, `15m`, and the available `4h` scan input. Do not claim
  `1h`/`1d` coverage until those feeds are added and freshness is verified.
- Store classification and risk suggestions as audit metadata first.

Do not import:

- HermesFace-3 or Python modules.
- A new execution layer.
- Automatic position sizing or stop changes in the first rollout.
- A default switch from `SHORT_ONLY` to `BOTH`.
- Contrarian trade acceptance based on guessed thresholds.
- Fabricated neutral values when a timeframe or futures provider is
  unavailable.

## APEX data mapping

| Proposal concept | APEX source or planned source |
|---|---|
| Order direction | `ScanEvaluation.direction` |
| Entry timeframe | Scanner configuration and signal metadata |
| Per-timeframe direction | New pure classifier over available candle series |
| Trend strength | New bounded score from real EMA/structure inputs; ADX only after a real implementation is available |
| Funding | `MarketContext.funding` and `fundingBiasScore` |
| Open-interest delta | `MarketContext.oiTrend` / `oiChangePercent` |
| Long/short ratio | `MarketContext.sentiment` when live or explicitly degraded |
| Classification audit | `SignalDecisionLog` and Decision Memory mirror |
| Validation | Existing replay/stress harnesses plus chronological outcome analysis |

## Planned classification contract

```ts
type DivergenceCategory =
  | 'WITH_TREND'
  | 'RANGE'
  | 'COUNTER_TREND'
  | 'UNAVAILABLE';

interface DirectionDivergenceClassification {
  orderDirection: 'SHORT' | 'LONG';
  alignmentScore: number;      // -1 counter-trend, +1 with-trend
  trendStrength: number;       // 0..1
  timeframeAgreement: number;  // 0..1, based only on available layers
  category: DivergenceCategory;
  dataCompleteness: number;    // 0..1
  dataSource: 'live' | 'degraded' | 'unavailable';
}
```

The classifier must return `UNAVAILABLE` when the minimum candle inputs are not
fresh and complete. It must not convert missing inputs into a neutral trend.

## Rollout gates

1. Shadow classification only. Existing scanner acceptance, lifecycle, and
   paper/manual-only boundaries remain unchanged.
2. Unit-test direction symmetry, missing-data behavior, timeframe agreement,
   and bounded scores.
3. Replay historical Decision Memory rows without changing their labels.
4. Log category, confidence, disagreement with the current rule engine, and
   later outcome.
5. Require a non-zero real export and chronological category-level analysis
   before considering any risk-profile suggestion.
6. Consider risk-profile suggestions only as non-binding audit output until a
   separate safety review approves them.

## Known blockers

- The current workspace has no browser Decision Memory export that satisfies
  the ML data gate.
- The scanner does not yet persist all per-timeframe candle series in the
  decision record.
- No validated ADX/DI implementation is currently part of the APEX contract.
- Live execution is outside the current APEX scope.
