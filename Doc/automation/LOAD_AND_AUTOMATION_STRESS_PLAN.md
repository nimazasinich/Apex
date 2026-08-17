# Load and Automation Stress Plan

## Goal

The scanner should stay quiet in the UI but strong under decision load. It must evaluate many candidates, store decisions, adapt safely and avoid flooding the user.

## Current load behavior

The scanner rotates through a small batch per tick. Decision logs store accepted and rejected candidates. The UI only shows a compact counter plus a separate Decision Memory panel.

## Added stress tool

Script:

```text
npm run stress:adaptive-learning
```

This runs a deterministic synthetic pressure test against the adaptive
threshold engine. The default seed is `42`; override it with
`APEX_STRESS_SEED`.

Environment overrides:

```text
CYCLES=900
CANDIDATES_PER_CYCLE=6
APEX_STRESS_SEED=42
```

Example:

```bash
CYCLES=1200 CANDIDATES_PER_CYCLE=8 npm run stress:adaptive-learning
```

## What the stress tool measures

```text
total candidates
accepted count
rejected count
win/loss count
synthetic P&L
market regime
acceptance rate
win rate
missed winners
saved losses
final config
smart score
```

## Passing expectations

A healthy synthetic run must emit a `PASS` verdict and show:

- no runtime errors
- no explosive threshold movement
- acceptance rate remains controlled
- weights remain normalized
- guardrails do not loosen below safety floors
- adaptive profile is populated
- final config stays inside bounds
- `ADAPTIVE_GUARDRAILS` and `SHORT_ONLY` remain unchanged
- all score weights remain bounded and normalized

Generated evidence:

```text
Doc/automation/adaptive_learning/ADAPTIVE_LEARNING_STRESS_v1.json
Doc/automation/adaptive_learning/ADAPTIVE_LEARNING_STRESS_v1.md
```

The command exits non-zero when any safety check fails. The operations-status
backend reads the JSON report and the frontend Ops tab displays its latest
verdict and metrics. This synthetic report is operational safety evidence only;
it must never be used as Decision Memory export or shadow-ML training data.

## UI expectations

The dashboard should not show every row. It should show only:

```text
Decision Counter
Accepted count
Rejected count
Total decisions
```

The full table should remain inside the Decision Memory panel.

## Future backend load plan

When an external database is added:

- insert decision logs in batches
- index by `timestamp`, `ticker`, `decision`, `reasonCode`
- prune or archive old local IndexedDB rows
- keep a rolling local cache for fast UI rendering
- compute heavy analytics server-side

## Safety note

The adaptive engine should be treated as an assistant to the strategy, not an unrestricted optimizer. It has guardrails because pure optimization can overfit to recent noise.
