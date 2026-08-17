# APEX ML Signal Model - Phase 0 Validation Report v1

Generated: 2026-08-03T10:03:17.146Z

## Gate Verdict

**INSUFFICIENT DATA - do not proceed to Phase 1.**

Minimum sample-size gate:
- Required labeled rows after feature completeness: >= 300
- Required minority class rows: >= 30
- Actual complete rows: 0
- Actual minority class rows: 0

## Source

- Source file: not found
- Loader note: No Decision Memory export was found. Put a JSON export at Doc/automation/ml_dataset/decision_memory_export_v1.json or set APEX_DECISION_MEMORY_EXPORT.
- Node cannot read browser IndexedDB directly. Export from the UI, run `npm run export:decision-memory` after mirror sync, or set `APEX_DECISION_MEMORY_EXPORT`. Canonical path: `Doc/automation/ml_dataset/decision_memory_export_v1.json`.

## Label Methodology

- Positive label: `laterOutcome === "WIN"`.
- Negative label: `laterOutcome === "LOSS"`.
- `BREAKEVEN`: excluded by default because it is neither a clear win nor a clear loss for binary v1 training.
- `EXPIRED`: excluded by default because it is unresolved, not a realized failure.
- `UNKNOWN`: excluded; labels are never imputed.
- Rejected rows are excluded from supervised v1 training because they have no realized accepted-trade outcome.

## Row Counts

| Stage | Rows |
|---|---:|
| Total rows in | 0 |
| Rows after label filter | 0 |
| Rows after feature-completeness filter | 0 |
| Dropped for missing features | 0 |

## Class Balance

| Label | Count |
|---|---:|
| WIN | 0 |
| LOSS | 0 |
| WIN:LOSS ratio | n/a |

## Duplicate Checks

| Field | Duplicate value count |
|---|---:|
| id | 0 |
| cycleId | 0 |

## Time Range

- Complete dataset start: n/a
- Complete dataset end: n/a

## Chronological Split

Random splitting is not used. Rows are sorted by `timestamp`: first 70% train, next 15% validation, most recent 15% test.

| Split | Rows | Start | End |
|---|---:|---|---|
| train | 0 | n/a | n/a |
| validation | 0 | n/a | n/a |
| test | 0 | n/a | n/a |

## AdaptiveMarketRegime Counts

- n/a

## Feature Missing Rates and Distribution Summary

| Feature | Missing | Missing rate | Min | Median | Max |
|---|---:|---:|---:|---:|---:|
| log.confidence | 0 | n/a | n/a | n/a | n/a |
| log.rawScore | 0 | n/a | n/a | n/a | n/a |
| log.qStructDirectional | 0 | n/a | n/a | n/a | n/a |
| log.squeezeRiskScore | 0 | n/a | n/a | n/a | n/a |
| log.evidenceAgreementScore | 0 | n/a | n/a | n/a | n/a |
| log.liquidityQualityScore | 0 | n/a | n/a | n/a | n/a |
| log.microPriceSkewScore | 0 | n/a | n/a | n/a | n/a |
| log.fundingBiasScore | 0 | n/a | n/a | n/a | n/a |
| log.oiChangePercent | 0 | n/a | n/a | n/a | n/a |
| log.atrExpansionScore | 0 | n/a | n/a | n/a | n/a |
| log.smcDirectionalScore | 0 | n/a | n/a | n/a | n/a |
| log.smcContextScore | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.obi | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.qStruct | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.volume | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.funding | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.openInterest | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.atr | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.microstructure | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.liquidity | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.smc | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.weightedSum | 0 | n/a | n/a | n/a | n/a |
| scoringBreakdown.totalWeight | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.smcDirectionalScore | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.smcContextScore | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.smartMoneyBiasScore | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.flipSetupScore | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.chochSetupScore | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.continuationScore | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.ifcQualityScore | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.liquiditySweepScore | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.zoneFreshnessScore | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.unmitigatedZoneProximity | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.htfSupplyInControl | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.htfDemandInControl | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.setupModel.FLIP | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.setupModel.CHOCH | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.setupModel.CONTINUATION | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.setupModel.LIQUIDITY_SWEEP_REVERSAL | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.setupModel.NONE | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.controlSide.SUPPLY | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.controlSide.DEMAND | 0 | n/a | n/a | n/a | n/a |
| smartMoneyContext.controlSide.NEUTRAL | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.shortObi | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.shortVolume | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.shortQStruct | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.longObi | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.longVolume | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.longQStruct | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.obiThreshold | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.volumeThreshold | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.qStructThreshold | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.smoothedObi | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.smoothedVolDelta | 0 | n/a | n/a | n/a | n/a |
| gatesSnapshot.qStructDirectional | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.intervalMs | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.obiThreshold | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.volumeThreshold | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.qStructThreshold | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.fundingThreshold | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.oiExpansionThresholdPct | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.atrExpansionThreshold | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.maxSqueezeRisk | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.minEvidenceAgreement | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.minSmartMoneyScore | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.smcHardRejectThreshold | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.adaptiveLearningRate | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.adaptiveMinSamples | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.minConfidence | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.topRankSkip | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.minVolume24hUsd | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scoreWeights.obi | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scoreWeights.qStruct | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scoreWeights.volume | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scoreWeights.funding | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scoreWeights.openInterest | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scoreWeights.atr | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scoreWeights.microstructure | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scoreWeights.liquidity | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scoreWeights.smc | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.thresholdMode.MANUAL | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.thresholdMode.ADAPTIVE | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.thresholdMode.ADAPTIVE_GUARDRAILS | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.directionBias.SHORT_ONLY | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.directionBias.BOTH | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scorePreset.ATLAS_PROPOSAL | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scorePreset.ATLAS_PLUS_V2 | 0 | n/a | n/a | n/a | n/a |
| configSnapshot.scorePreset.CUSTOM | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.price | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.obi | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.netVolumeDelta | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.fundingRate | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.longShortRatio | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.takerBuySellRatio | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.spread | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.atr | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.dataSource.kucoin_live | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.dataSource.kucoin_plus_binance_live | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.dataSource.kucoin_live_binance_unavailable | 0 | n/a | n/a | n/a | n/a |
| marketSnapshotSummary.dataSource.unavailable | 0 | n/a | n/a | n/a | n/a |

## Phase 4 Walk-Forward Strategy Note

Future retraining should use walk-forward windows only: train on an older contiguous window, validate on the next chronological segment, test on the newest untouched segment, then advance the window. Model versions should be frozen as `model_v{N}.json`, and every retrain/swap should create an audit log comparable to `AdaptiveThresholdAuditLog`.
