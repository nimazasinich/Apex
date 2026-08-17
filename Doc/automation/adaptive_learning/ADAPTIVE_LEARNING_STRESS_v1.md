# Adaptive Learning Stress Report v1

- Generated: 2026-08-03T10:03:04.052Z
- Verdict: **PASS**
- Seed: 42
- Cycles: 900
- Candidates per cycle: 6
- Total candidates: 5400
- Accepted: 884
- Rejected: 4516
- Acceptance rate: 16.370%
- Synthetic P&L: 492.01934R

## Safety checks

| Check | Verdict | Actual | Expected |
|---|---|---:|---|
| guardrails_mode_preserved | PASS | ADAPTIVE_GUARDRAILS | ADAPTIVE_GUARDRAILS |
| short_only_preserved | PASS | SHORT_ONLY | SHORT_ONLY |
| confidence_guardrail_floor | PASS | 0.78 | 0.74 <= minConfidence <= 0.91 |
| obi_guardrail_bound | PASS | -0.15 | -0.40 <= obiThreshold <= -0.10 |
| qstruct_guardrail_bound | PASS | -0.3 | -0.52 <= qStructThreshold <= -0.30 |
| squeeze_guard_bound | PASS | 0.72 | 0.36 <= maxSqueezeRisk <= 0.86 |
| evidence_guard_bound | PASS | 0.5 | 0.32 <= minEvidenceAgreement <= 0.82 |
| weights_normalized | PASS | 1 | abs(sum(weights) - 1) <= 0.002 |
| weights_bounded | PASS | true | all weights between 0.01 and 0.60 |
| acceptance_controlled | PASS | 0.163704 | acceptanceRate <= 0.20 |
| profile_populated | PASS | 2000 | profile sampleSize > 0 with finite adjustment confidence |
| metrics_finite | PASS | true | all core metrics finite |

## Adaptive profile

- Sample size: 2000
- Market regime: TREND_DOWN
- Win rate: 0.6707317073170732
- Average P&L: 0.5654913095788234
- Missed winners: 1057
- Saved losses: 615
- Adjustment confidence: 1

## Safety boundary

This is deterministic synthetic stress evidence for adaptive guardrails only. It
does not train shadow ML, create Decision Memory export data, enable live
trading, or alter scanner/execution behavior.
