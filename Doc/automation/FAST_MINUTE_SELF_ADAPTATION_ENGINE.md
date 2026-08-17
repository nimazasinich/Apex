# Fast Minute Self-Adaptation Engine

## Purpose

The dynamic threshold system now has two speeds:

1. **Fast controller** — reacts inside 1 to 5 minutes.
2. **Experience learner** — learns from longer DecisionMemory history and labelled outcomes.

This avoids the old problem where the system could be smart over 15–20 minutes but slow during the first few minutes of a new market regime.

## Fast inputs

The fast controller reads the same decision logs as the main learner, but slices them by time:

```text
oneMinuteLogs = decisions inside the last 60 seconds
fiveMinuteLogs = decisions inside the last 300 seconds
```

If one-minute data has enough samples, it becomes the active fast pressure signal.

## What it can change

The fast controller can adjust:

```text
obiThreshold
volumeThreshold
qStructThreshold
minConfidence
maxSqueezeRisk
minEvidenceAgreement
scoreWeights.microstructure
scoreWeights.liquidity
```

## What it is not allowed to do

It cannot:

- remove guardrails
- make unbounded threshold jumps
- disable risk rejection
- overpower the longer outcome-based learner
- inflate scoring weights without normalization

## Why this matters

Short opportunities can appear and disappear quickly. A static 15-minute learning window is too slow when the market suddenly changes into:

- squeeze risk
- thin book
- chop
- fast downtrend

The new controller lets the system become more defensive or slightly more permissive within a few scanner cycles.

## Recommended production mode

```text
ADAPTIVE_GUARDRAILS
```

This gives the engine fast self-adjustment while preserving safety floors.
