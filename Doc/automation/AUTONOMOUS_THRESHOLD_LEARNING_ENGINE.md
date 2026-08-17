# APEX Autonomous Threshold Learning Engine

## Purpose

The scanner should not rely on static thresholds forever. Static values are only safe initial conditions. In production the engine must learn from accepted trades, rejected candidates, outcome labels, missed winners and saved losses.

The upgraded `AdaptiveThresholdEngine` now operates as a controlled autonomous tuning layer. It keeps the dashboard quiet, pushes the scanner under enough load to learn, and becomes stricter or more flexible according to realised performance.

## Core idea

The flow is:

```text
DecisionMemoryDB
→ recent accepted/rejected decisions
→ resolved outcomes and P&L
→ regime classification
→ mistake profile
→ safe threshold/weight adjustment
→ audit log
→ ScannerConfig update
→ next scan cycle
```

The engine never makes a large jump. Each cycle is bounded by max step limits and hard min/max guardrails.

## What the engine learns from

### Accepted decisions

Accepted decisions tell the system what it actually traded. Once later outcomes arrive, the engine measures:

- win rate
- average P&L
- accepted losses
- harmful accepted losses
- loss-side squeeze risk
- loss-side evidence agreement
- loss-side liquidity quality
- weak factors inside `scoringBreakdown`

If accepted outcomes are weak, the model tightens:

- `minConfidence` increases
- `minEvidenceAgreement` increases
- `maxSqueezeRisk` decreases
- `qStructThreshold` becomes stricter
- liquidity and microstructure weights increase

### Rejected decisions

Rejected decisions are not discarded. They are stored and can later be labelled by replay, simulation, manual review or delayed outcome tracking.

The engine separates:

- missed winners: rejected candidates that later would have worked
- saved losses: rejected candidates that later would have failed

If missed winners are too frequent, the exact rejection rule is loosened slightly. If saved losses dominate, the filter is reinforced.

### Mistake-based examples

```text
Accepted losses with high squeeze risk
→ maxSqueezeRisk decreases
→ liquidity and microstructure weights increase

Accepted losses with weak evidence agreement
→ minEvidenceAgreement increases
→ QStruct weight increases

Rejected HIGH_SQUEEZE_RISK candidates later become winners
→ maxSqueezeRisk increases slightly

Rejected LOW_CONFIDENCE candidates later become winners
→ minConfidence decreases only in plain ADAPTIVE mode

Rejected decisions mostly become losses
→ current filters are protecting the engine
→ keep or strengthen those filters
```

## Regime classification

The engine classifies recent decision memory into a regime:

- `TREND_DOWN`
- `SQUEEZE_RISK`
- `THIN_BOOK`
- `CHOP`
- `MIXED`
- `UNKNOWN`

Each regime changes tuning behavior.

### SQUEEZE_RISK

The engine reduces `maxSqueezeRisk` and increases liquidity/microstructure weights.

### THIN_BOOK

The engine increases liquidity weight, raises confidence requirements and lowers squeeze tolerance.

### CHOP

The engine requires stronger evidence agreement and clearer QStruct alignment.

### TREND_DOWN

The engine leans slightly more into structure and signed volume. If outcomes are strong, it can reduce friction very slightly while respecting guardrails.

## Safety guardrails

The system has multiple protections:

- `MANUAL` mode disables all automatic tuning
- `ADAPTIVE_GUARDRAILS` prevents unsafe loosening
- every numeric threshold has hard bounds
- every cycle has max step limits
- scoring weights are normalized after updates
- every change writes an audit log with reason and confidence
- heuristic adjustment remains clamped separately

## New exported functions

```ts
summarizeAdaptiveExperience(logs, minSamples)
deriveAdaptiveScannerConfig(config, logs)
```

`deriveAdaptiveScannerConfig()` returns:

```ts
{
  nextConfig,
  audit?,
  profile?
}
```

The profile includes:

```text
marketRegime
confidenceInAdjustment
accepted / rejected counts
acceptanceRate
resolvedAccepted
winRate
avgPnl
harmfulAcceptedLosses
missedWinners
savedLosses
falseSqueezeRejects
falseEvidenceRejects
falseConfidenceRejects
```

## Production recommendation

Default mode should remain:

```text
ADAPTIVE_GUARDRAILS
```

This gives automatic learning while preventing excessive loosening.
