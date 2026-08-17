# 100-Run Load Matrix Result

Generated: 2026-06-21T04:22:22.850Z

## Overall

- Phases: 3
- Total runs: 300
- Total candidates evaluated: 1120000
- Total accepted: 9385
- Total rejected: 1110615
- Weighted win rate: 67.23%
- Total synthetic P&L: 7852.296R
- Average smart score across phases: 69.9/100
- Acceptance verdict: PASS

## Phase summaries

### 100× 5-minute load test

- Runs: 100
- Simulated minutes/run: 5
- Warmup minutes/run: 0
- Candidates: 160000
- Accepted: 1881
- Rejected: 158119
- Avg acceptance rate: 1.18%
- Avg win rate: 67.94%
- Median win rate: 66.67%
- 10th percentile win rate: 55.56%
- Worst win rate: 38.89%
- Best win rate: 90.00%
- Avg P&L/trade: 0.839R
- Avg net P&L/run: 15.843R
- Worst net P&L/run: -4.615R
- Avg smart score: 70.02/100
- Avg calibration gap: 23.46 percentage points
- Verdict: PASS

### 100× 15-minute load test

- Runs: 100
- Simulated minutes/run: 15
- Warmup minutes/run: 0
- Candidates: 480000
- Accepted: 3815
- Rejected: 476185
- Avg acceptance rate: 0.79%
- Avg win rate: 66.91%
- Median win rate: 67.57%
- 10th percentile win rate: 56.25%
- Worst win rate: 44.12%
- Best win rate: 85.00%
- Avg P&L/trade: 0.824R
- Avg net P&L/run: 31.832R
- Worst net P&L/run: 1.609R
- Avg smart score: 70.08/100
- Avg calibration gap: 24.50 percentage points
- Verdict: PASS

### 100× 5-minute warmup + 15-minute walk-forward test

- Runs: 100
- Simulated minutes/run: 15
- Warmup minutes/run: 5
- Candidates: 480000
- Accepted: 3689
- Rejected: 476311
- Avg acceptance rate: 0.77%
- Avg win rate: 66.64%
- Median win rate: 67.57%
- 10th percentile win rate: 56.10%
- Worst win rate: 48.65%
- Best win rate: 87.18%
- Avg P&L/trade: 0.832R
- Avg net P&L/run: 30.848R
- Worst net P&L/run: 10.861R
- Avg smart score: 69.6/100
- Avg calibration gap: 25.28 percentage points
- Verdict: PASS


## Interpretation

The engine is still highly selective by design. In this harness, low acceptance is not a bug; it means the scanner rejects most weak or trap-prone short candidates and only dispatches the highest-confidence candidate in a cycle. The key health metrics are positive expectancy, stable win rate across seeds, and bounded calibration gap.

## Next optimization target

The weakest remaining area is confidence calibration. Win rate remains materially below the average displayed confidence, so the next production step is regime-specific calibration from real DecisionMemory outcomes rather than further tightening raw gates.
