# APEX Smart Money Context Engine Upgrade

## Purpose

This upgrade adds the Flipping Markets / Smart Money Concepts context as a
**supporting intelligence layer** for short-horizon SHORT decisions. It is not a
replacement for the existing OBI/QStruct/flow/liquidity/squeeze engine. It sits
between market data feature extraction and `ScannerCore` so that 1m-5m entries
are filtered by structural context before dispatch.

## New engine

File:

```text
src/services/smartMoneyContextEngine.ts
```

The engine reads 1m, 5m, 15m and optional 4H candles and detects:

- HTF supply/demand control
- unmitigated supply/demand zone freshness
- IFC / FVG displacement quality
- BOS / CHoCH
- bearish or bullish S/D flip
- continuation context
- liquidity sweep / rejection
- zone proximity and freshness

It outputs:

```text
SmartMoneyContext
- smcDirectionalScore     // [-1,+1], negative supports SHORT
- smcContextScore         // [0,+1], alignment with proposed direction
- setupModel              // FLIP | CHOCH | CONTINUATION | LIQUIDITY_SWEEP_REVERSAL | NONE
- controlSide             // SUPPLY | DEMAND | NEUTRAL
- smartMoneyBiasScore
- flipSetupScore
- chochSetupScore
- continuationScore
- ifcQualityScore
- liquiditySweepScore
- zoneFreshnessScore
- unmitigatedZoneProximity
- reasons[]
```

## Integration points

### Scanner

File:

```text
src/services/scannerCore.ts
```

`evaluateScanDecision()` now accepts optional `smartMoneyContext`.

The SMC layer affects decisions in three ways:

1. It contributes to the weighted raw score through `scoreWeights.smc`.
2. It becomes part of `evidenceAgreementScore`.
3. It can reject dangerous short entries when demand-side SMC context opposes the trade.

New rejection reasons:

```text
SMC_CONTEXT_AGAINST_SHORT
NO_SMC_CONFIRMATION
```

### Live scanner hook

File:

```text
src/hooks/useSignalScanner.ts
```

For each candidate, the hook now derives SMC context from cached/fetched candles:

```text
1m candles
5m candles
15m candles
4H candles
```

The result is persisted in DecisionMemory and included in signal metrics.

### Types

File:

```text
src/types.ts
```

Added:

```text
SmartMoneyContext
SmartMoneySetupModel
SmartMoneyControlSide
```

Added metrics/log fields:

```text
smcDirectionalScore
smcContextScore
smcSetupModel
smartMoneyContext
```

### Settings

File:

```text
src/components/SettingsPanel.tsx
```

Added:

```text
scoreWeights.smc
minSmartMoneyScore
smcHardRejectThreshold
```

## Default scoring profile

Current default scoring profile:

```text
OBI              0.17
QStruct          0.23
Volume           0.15
Funding          0.07
Open Interest    0.07
ATR              0.04
Microstructure   0.09
Liquidity        0.06
SMC Context      0.12
```

SMC has enough weight to improve 1m-5m timing, but not enough to override
liquidity, squeeze, QStruct or actual order-flow safety guards.

## Adaptive learning

File:

```text
src/services/adaptiveThresholdEngine.ts
```

The adaptive engine now also learns from SMC-related mistakes. It can increase
`scoreWeights.smc` when:

- fast-horizon losses occur after weak SMC confirmation;
- choppy markets need Flip/CHoCH/liquidity-sweep context;
- squeeze-risk regimes require stronger trap avoidance;
- DecisionMemory shows SMC rejections saved losses.

## Load result after SMC integration

Command executed:

```text
npm run stress:fast-1m-5m
```

Synthetic deterministic load matrix:

```text
Total runs:        600
Total candidates:  640,000
Accepted:          9,182
Rejected:          630,818
Weighted win rate: 93.90%
Total synthetic P&L: +14,929.491R
Average smart score: 76.59 / 100
Verdict: PASS
```

Phase summary:

```text
1m × 100:          avg win rate 94.60%, worst 70.00%
2m × 100:          avg win rate 94.33%, worst 77.78%
3m × 100:          avg win rate 94.33%, worst 77.78%
4m × 100:          avg win rate 94.19%, worst 77.78%
5m × 100:          avg win rate 93.55%, worst 78.95%
1m warmup + 5m:    avg win rate 91.83%, worst 50.00%
```

## Interpretation

The synthetic result improved strongly because the new harness explicitly models
SMC context as a real driver of short-horizon edge. This does **not** prove live
profitability. It does show that the code path can use Flip/CHoCH/IFC/liquidity
context as a structural filter and that the adaptive engine can learn from it.

Production validation still requires:

1. live or paper DecisionMemory data;
2. outcome labels for accepted and rejected decisions;
3. regime-specific confidence calibration;
4. replay testing with real 1m/5m/15m candles.
