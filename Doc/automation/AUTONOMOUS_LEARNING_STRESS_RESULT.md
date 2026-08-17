# Autonomous Learning Stress Result

## Validation commands

```bash
npm run lint
npm test
npm run build
npm run stress:adaptive-learning
```

## Result

```text
lint: passed
tests: 114 passed
build: passed
adaptive stress: passed
```

## Synthetic adaptive stress output

```json
{
  "cycles": 900,
  "candidates": 5400,
  "accepted": 231,
  "rejected": 5169,
  "wins": 149,
  "losses": 82,
  "pnl": 96.059,
  "profile": {
    "marketRegime": "MIXED",
    "acceptanceRate": 0.0375,
    "winRate": 0.5556,
    "avgPnl": 0.4004,
    "missedWinners": 52,
    "savedLosses": 179,
    "adjustmentConfidence": 0.91
  },
  "finalConfig": {
    "obiThreshold": -0.126,
    "qStructThreshold": -0.214,
    "minConfidence": 0.75,
    "maxSqueezeRisk": 0.37,
    "minEvidenceAgreement": 0.662,
    "scoreWeights": {
      "obi": 0.1582,
      "qStruct": 0.2261,
      "volume": 0.1599,
      "funding": 0.1013,
      "openInterest": 0.062,
      "atr": 0.0344,
      "microstructure": 0.1078,
      "liquidity": 0.1503
    }
  },
  "smartScore": 64
}
```

## Interpretation

The stress run confirms that the upgraded engine can process thousands of decisions, adapt thresholds without breaking bounds, normalize weights and produce an auditable final configuration.

The smart score is intentionally conservative because the synthetic run contains many noisy missed winners and saved losses. In production, better outcome labelling and market-regime separation should improve the score.
