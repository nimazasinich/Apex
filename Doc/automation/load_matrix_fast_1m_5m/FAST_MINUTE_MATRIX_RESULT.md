# 100-Run Fast 1–5 Minute Adaptive Matrix Result

Generated: 2026-06-21T05:18:19.821Z

## Overall

- Phases: 6
- Total runs: 600
- Total candidates evaluated: 640000
- Total accepted: 9182
- Total rejected: 630818
- Weighted win rate: 93.90%
- Total synthetic P&L: 14929.491R
- Average smart score across phases: 76.59/100
- Acceptance verdict: PASS

## Phase summaries

### 100× 1-minute fast-adaptive load test

- Runs: 100
- Simulated minutes/run: 1
- Warmup minutes/run: 0
- Candidates: 32000
- Accepted: 1000
- Rejected: 31000
- Avg acceptance rate: 3.13%
- Avg win rate: 94.60%
- Median win rate: 100.00%
- 10th percentile win rate: 80.00%
- Worst win rate: 70.00%
- Best win rate: 100.00%
- Avg P&L/trade: 1.646R
- Avg net P&L/run: 16.463R
- Worst net P&L/run: 7.856R
- Avg smart score: 69.88/100
- Avg calibration gap: 6.69 percentage points
- Verdict: PASS

### 100× 2-minute fast-adaptive load test

- Runs: 100
- Simulated minutes/run: 2
- Warmup minutes/run: 0
- Candidates: 64000
- Accepted: 1800
- Rejected: 62200
- Avg acceptance rate: 2.81%
- Avg win rate: 94.33%
- Median win rate: 94.44%
- 10th percentile win rate: 83.33%
- Worst win rate: 77.78%
- Best win rate: 100.00%
- Avg P&L/trade: 1.639R
- Avg net P&L/run: 29.494R
- Worst net P&L/run: 19.983R
- Avg smart score: 71.54/100
- Avg calibration gap: 5.62 percentage points
- Verdict: PASS

### 100× 3-minute fast-adaptive load test

- Runs: 100
- Simulated minutes/run: 3
- Warmup minutes/run: 0
- Candidates: 96000
- Accepted: 1800
- Rejected: 94200
- Avg acceptance rate: 1.88%
- Avg win rate: 94.33%
- Median win rate: 94.44%
- 10th percentile win rate: 83.33%
- Worst win rate: 77.78%
- Best win rate: 100.00%
- Avg P&L/trade: 1.639R
- Avg net P&L/run: 29.494R
- Worst net P&L/run: 19.983R
- Avg smart score: 76.54/100
- Avg calibration gap: 5.62 percentage points
- Verdict: PASS

### 100× 4-minute fast-adaptive load test

- Runs: 100
- Simulated minutes/run: 4
- Warmup minutes/run: 0
- Candidates: 128000
- Accepted: 1819
- Rejected: 126181
- Avg acceptance rate: 1.42%
- Avg win rate: 94.19%
- Median win rate: 94.44%
- 10th percentile win rate: 83.33%
- Worst win rate: 77.78%
- Best win rate: 100.00%
- Avg P&L/trade: 1.635R
- Avg net P&L/run: 29.716R
- Worst net P&L/run: 19.868R
- Avg smart score: 79.18/100
- Avg calibration gap: 5.58 percentage points
- Verdict: PASS

### 100× 5-minute fast-adaptive load test

- Runs: 100
- Simulated minutes/run: 5
- Warmup minutes/run: 0
- Candidates: 160000
- Accepted: 1872
- Rejected: 158128
- Avg acceptance rate: 1.17%
- Avg win rate: 93.55%
- Median win rate: 94.44%
- 10th percentile win rate: 84.21%
- Worst win rate: 78.95%
- Best win rate: 100.00%
- Avg P&L/trade: 1.615R
- Avg net P&L/run: 30.199R
- Worst net P&L/run: 19.152R
- Avg smart score: 80.19/100
- Avg calibration gap: 5.69 percentage points
- Verdict: PASS

### 100× 1-minute warmup + 5-minute walk-forward fast-adaptive test

- Runs: 100
- Simulated minutes/run: 5
- Warmup minutes/run: 1
- Candidates: 160000
- Accepted: 891
- Rejected: 159109
- Avg acceptance rate: 0.56%
- Avg win rate: 91.83%
- Median win rate: 100.00%
- 10th percentile win rate: 77.78%
- Worst win rate: 50.00%
- Best win rate: 100.00%
- Avg P&L/trade: 1.568R
- Avg net P&L/run: 13.928R
- Worst net P&L/run: 4.832R
- Avg smart score: 82.21/100
- Avg calibration gap: 8.34 percentage points
- Verdict: PASS


## Interpretation

The engine is still highly selective by design. In this harness, low acceptance is not a bug; it means the scanner rejects most weak or trap-prone short candidates and only dispatches the highest-confidence candidate in a cycle. The key health metrics are positive expectancy, stable win rate across seeds, and bounded calibration gap.

## Next optimization target

The weakest remaining area is confidence calibration. The fast-horizon run reduced the calibration gap materially, but the next production step is still regime-specific calibration from real DecisionMemory outcomes rather than further tightening raw gates.
