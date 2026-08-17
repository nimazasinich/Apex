# APEX Shadow ML Comparison Report v1

Generated: 2026-08-03T10:03:18.440Z

## Gate Verdict

**NO_MODEL — comparison skipped until a valid shadow model file exists.**

- Comparison status: NO_MODEL
- Complete labeled rows in export: 0
- Model id: n/a

## Source

- Source file: not found
- Loader note: No Decision Memory export was found. Put a JSON export at Doc/automation/ml_dataset/decision_memory_export_v1.json or set APEX_DECISION_MEMORY_EXPORT.
- Model file: not found

## Model Validation

- No shadow ML model file was available.

## Summary

| Metric | Value |
|---|---:|
| Rows scored | 0 |
| Rows skipped (incomplete features) | 0 |
| Agreement count | 0 |
| Disagreement count | 0 |
| ML reject / rule accept | 0 |
| ML accept / rule reject | 0 |
| Disagreements with LOSS outcome | 0 |
| Disagreements with WIN outcome | 0 |
| Average confidence on disagreements | n/a |

## Disagreement Preview

_No disagreements were logged._

## Known Limitations

- Shadow ML comparison is audit-only and does not change scanner gates, lifecycle, or execution.
- Rule baseline uses the recorded decision status; ML uses the frozen shadow model file.
- Rows with incomplete features are skipped rather than imputed.
- Outcome counts are descriptive and are only available for rows with resolved accepted outcomes.
