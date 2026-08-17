# APEX Rejected Candidate Replay Report v1

Generated: 2026-08-03T10:03:17.754Z

## Gate Verdict

**NO_REJECTED_ROWS**

This report is shadow-only. Replay outcomes label rejected candidates for counterfactual analysis and adaptive threshold learning. They are not mixed into supervised ML v1 labels.

## Source

- Source file: not found
- Loader note: No Decision Memory export was found. Put a JSON export at Doc/automation/ml_dataset/decision_memory_export_v1.json, temp/decision-memory-v1.json, or set APEX_DECISION_MEMORY_EXPORT.
- Observations file: none (live browser replay fills these during runtime)
- Node cannot read browser IndexedDB directly. Export Decision Memory from the UI for offline replay.

## Rejected Row Summary

| Metric | Count |
|---|---:|
| Total rejected rows | 0 |
| Replay-eligible (unknown outcome) | 0 |
| Already resolved | 0 |
| Ineligible | 0 |
| Resolved in this run | 0 |

## Ineligibility Reasons

- none

## Notes

- Live runtime replay uses the same TP/SL geometry as accepted signals via `MathEngine.buildLevels`.
- Rejected replay outcomes remain separate from accepted lifecycle outcomes and ML v1 supervised labels.
- Provide `APEX_REPLAY_OBSERVATIONS=path/to/observations.json` for offline batch resolution.
