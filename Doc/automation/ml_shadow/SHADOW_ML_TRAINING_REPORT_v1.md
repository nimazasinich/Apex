# APEX Shadow ML Training Report v1

Generated: 2026-08-03T10:03:18.108Z

## Gate Verdict

**INSUFFICIENT_DATA — training skipped; shadow model file not updated.**

Dataset gate:
- Required complete labeled rows: >= 300
- Required minority class rows: >= 30
- Actual complete rows: 0
- Actual minority class rows: 0
- Dataset gate status: INSUFFICIENT_DATA
- Training status: INSUFFICIENT_DATA

## Source

- Source file: not found
- Loader note: No Decision Memory export was found. Put a JSON export at Doc/automation/ml_dataset/decision_memory_export_v1.json or set APEX_DECISION_MEMORY_EXPORT.
- Model file: not written

## Rule Baseline

| Metric | Value |
|---|---:|
| Sample count | 0 |
| Win rate | n/a |
| Always-accept accuracy | n/a |

## Chronological Split Metrics

_No split metrics because training was skipped._

## Walk-Forward Validation

_Walk-forward folds were not produced because the dataset was too small or training was skipped._

## Known Limitations

- Supervised ML v1 uses only accepted WIN/LOSS rows with feature-complete decision-time inputs.
- Rejected candidates, UNKNOWN, EXPIRED, and BREAKEVEN outcomes are never imputed.
- Chronological splits are deterministic; random splitting is not used.
- Shadow ML output must not become a live scanner or execution gate without separate approval.
- Shadow ML training never writes into scannerCore.ts, adaptiveThresholdEngine.ts, or live execution gates.
- Walk-forward metrics are descriptive until a separate safety review approves any behavior change.
