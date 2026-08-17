# 20-Minute Synthetic Load Test + Hardening Result

Generated: 2026-06-21T03:37:36.424849Z

## What was tested

The engine was run through a **20-minute equivalent synthetic load test** using `APEX_AUDIT_CYCLES=200`.
Each cycle represents one scanner tick of roughly 6 seconds. A single 20-minute run therefore evaluates:

- 200 scan cycles
- 32 synthetic futures symbols per cycle
- 6,400 candidate evaluations per run

To reduce seed luck, the release test repeated that 20-minute run over **20 deterministic seeds**:

- total equivalent runtime: **400 minutes**
- total candidates: **128,000**
- accepted signals: **1,175**
- rejected candidates: **126,825**
- average acceptance rate: **0.92%**

## Single 20-minute run, seed 42

| Metric | Value |
|---|---:|
| Candidates | 6,400 |
| Accepted | 60 |
| Rejected | 6,340 |
| Acceptance rate | 0.94% |
| Win rate | 65.00% |
| Average P&L / trade | 0.830R |
| Net synthetic P&L | 49.818R |
| Average confidence | 91.08% |
| Calibration gap | 26.08% |
| Smart score | 69/100 |

## Robust 20-seed result

| Metric | Average | Median | Min | Max |
|---|---:|---:|---:|---:|
| Win rate | 64.86% | 63.79% | 55.74% | 82.46% |
| Avg P&L / trade | 0.765R | 0.788R | 0.391R | 1.230R |
| Net P&L / 20m run | 44.815R | 44.660R | 23.839R | 70.131R |
| Smart score | 68.9/100 | 68.0/100 | 64/100 | 78/100 |
| Confidence gap | 26.25% | 27.50% | 8.93% | 35.48% |

## Regime breakdown

| Regime | Trades | Win rate | Avg P&L |
|---|---:|---:|---:|
| chop | 37 | 43.24% | 0.195R |
| squeeze_risk | 14 | 35.71% | 0.012R |
| thin_book | 44 | 34.09% | -0.187R |
| trend_down | 1,080 | 67.13% | 0.831R |
| trend_up | 0 | 0.00% | 0.000R |


## Is the win rate acceptable?

**Synthetic answer: yes, but only after hardening.**

The first broad 20-minute-equivalent test before hardening averaged about **56.6% win rate** and had a weak minimum seed near **47%**. That was **not robust enough**.

After hardening the decision engine, the robust release run reached:

- average win rate: **64.86%**
- median win rate: **63.79%**
- worst seed win rate: **55.74%**
- average P&L per trade: **0.765R**
- every seed remained positive in net synthetic P&L.

For the synthetic harness, this is acceptable for a strict short-selection engine.

## What was hardened

The release version now adds stricter execution and regime filters:

1. **Hard QStruct safety floor**
   - Even if adaptive mode tries to loosen structure, SHORT candidates must keep stronger bearish multi-timeframe structure.

2. **Liquidity execution guard**
   - Low liquidity / thin book candidates are rejected before final confidence.
   - This reduced bad thin-book trades heavily.

3. **Conditional liquidity + squeeze guard**
   - Medium liquidity is only allowed when squeeze risk is also controlled.

4. **Microstructure confirmation guard**
   - SHORT candidates are rejected when micro-price leans against the short and evidence is not strong enough.

5. **Stricter production defaults**
   - `qStructThreshold: -0.30`
   - `minConfidence: 0.78`
   - `maxSqueezeRisk: 0.46`
   - `minEvidenceAgreement: 0.64`
   - stronger liquidity and microstructure weights.

## Remaining concern

The model is still **overconfident** as a probability estimator.
Average confidence is around **91.10%**, while average realized synthetic win rate is **64.86%**.

That does not mean the trade filter is bad; it means the confidence number should not yet be treated as a calibrated probability. The next optimization should recalibrate Platt parameters using real outcome data from `DecisionMemory`.

## Recommended next optimization

1. Collect real accepted/rejected decision logs for at least several market sessions.
2. Refit Platt calibration from actual outcomes.
3. Add regime-specific confidence calibration:
   - `TREND_DOWN`: less penalty, higher throughput
   - `THIN_BOOK`: heavy penalty or no-trade
   - `SQUEEZE_RISK`: no-trade unless structure and evidence are exceptional
   - `CHOP`: strict evidence agreement and lower size
4. Convert confidence display to two numbers:
   - `Model Confidence`
   - `Calibrated Win Probability`

## Verdict

The 20-minute synthetic load result is now acceptable for a guarded short engine, but it is not final proof of live profitability. The system is ready for paper/live-shadow testing with real exchange data and DecisionMemory outcome feedback.
