# APEX ML Signal Model - Phase 0 Methodology

This document freezes the Phase 0 decisions before any model training exists.
Phase 0 is data labeling and validation only. It does not change
`scannerCore.ts`, `adaptiveThresholdEngine.ts`, or live trade gates.

## Label Rules

- Positive label: `laterOutcome === "WIN"`.
- Negative label: `laterOutcome === "LOSS"`.
- `BREAKEVEN`: excluded by default. It is not a clear win or loss for the
  first binary classifier. A later multiclass or regression model can revisit it.
- `EXPIRED`: excluded by default. Expired rows are unresolved, not realized
  failures.
- `UNKNOWN`: excluded. Labels are never imputed.
- Only `decision === "ACCEPTED"` rows with a resolved WIN/LOSS outcome are
  eligible for supervised v1 training.
- Rejected rows are logged separately by the app and remain useful for future
  counterfactual/uplift research, but they are not mixed into the v1 supervised
  label set because they do not have a realized accepted-trade outcome.

## Feature Allow-List

Feature extraction is implemented in `src/services/mlFeatureExtractor.ts`.
It uses an explicit allow-list and returns `null` if any required feature is
missing. It never silently fills a missing market signal with zero.

Allowed groups:

- Decision-time numeric scores: confidence, raw score, QStruct, squeeze risk,
  evidence agreement, liquidity quality, micro-price skew, funding bias,
  open-interest change, ATR expansion, and SMC scores.
- `scoringBreakdown.*` weighted sub-scores.
- `smartMoneyContext.*` numeric fields, plus stable boolean/one-hot context
  indicators.
- `gatesSnapshot.*` gate booleans and numeric gate readings.
- `configSnapshot.*` numeric scanner settings, score weights, and stable
  one-hot mode/preset indicators.
- `marketSnapshotSummary.*` numeric market snapshot fields plus stable
  one-hot data-source indicators.

Explicit exclusions:

- `laterOutcome` and `laterPnl`: labels produced after the decision.
- `id` and `cycleId`: identifiers that can cause memorization.
- `topContributors` and `topOpposingFactors`: explanation summaries derived
  from underlying numeric features.
- `reasonText`: free text and unstable rule-engine wording.
- `decision` and `reasonCode`: rule-engine outputs. The v1 model learns from
  market/context features for accepted rows rather than from final
  classification labels.

## Export Path

`DecisionMemoryDB` is browser IndexedDB-backed with a localStorage fallback.
Node scripts cannot read browser IndexedDB directly.

Use the app's Decision Memory panel export action to download a JSON file, then
place it at:

```text
Doc/automation/ml_dataset/decision_memory_export_v1.json
```

Alternatively, run the export script with:

```bash
APEX_DECISION_MEMORY_EXPORT=path/to/export.json npx tsx scripts/exportDecisionDataset.mts
```

The script also accepts either a raw array of `SignalDecisionLog` rows or an
object with `rows` or `decisionLogs`.

## Split Strategy

The dataset uses a chronological split by `timestamp`, never random shuffle:

- first 70%: train
- next 15%: validation
- most recent 15%: test

Random splitting is avoided because future market regimes must not leak into
training.

## Sample-Size Gate

Phase 1 must not start unless the Phase 0 validation report passes both gates:

- at least 300 labeled, feature-complete accepted rows
- at least 30 rows in the minority class

If either gate fails, the validation report must say:

```text
INSUFFICIENT DATA - do not proceed to Phase 1.
```

## Walk-Forward Strategy For Phase 4

Future retraining should be walk-forward:

1. Train on an older contiguous time window.
2. Validate on the next chronological segment.
3. Test on the newest untouched segment.
4. Freeze the model as `model_v{N}.json`.
5. Record every retrain or model swap with an audit log shaped like
   `AdaptiveThresholdAuditLog`.

No model should become a live gate without a separate shadow-mode approval phase.
