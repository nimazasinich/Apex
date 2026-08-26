# Liquidation-conditioned squeeze study — candidate 1 REJECTED (2026-08-25)

Artifacts (all in `QA/walk-forward-baseline/`), all embedded digests re-verified this session:
`liquidation-squeeze-study.json` content 9fd856f9 · `liquidation-squeeze-research-log.json` a5256670 ·
`walk-forward-baseline-results.json` 749b0d68 · `walk-forward-risk-sizing-results.json` d2f94fd6.

## Result: every conditioned arm lost to the control on the SAME splits

| arm | splits | net@2x | ex-best | vs control (same splits) | doNothing | DSR |
|---|---|---|---|---|---|---|
| A-control (unconditioned squeeze) | 14/14 | +5.10% | **-6.09%** | — | 14/14 | 0.090 |
| B symmetric OI buildup | 8/14 | -28.33% | -29.79% | **-13.07** | 2/8 | 2.2e-06 |
| C asymmetric long/short OI | 8/14 | -26.66% | -29.34% | **-11.39** | 2/8 | 3.5e-06 |
| D trailing exit (AdaptiveTrend mech.) | 14/14 | -0.80% | -11.99% | **-5.90** | 11/14 | 0.008 |
| E combined | 8/14 | -26.66% | -29.34% | **-11.39** | 2/8 | 3.8e-07 |

Control-on-same-splits for B/C/E = -15.26% (splits 6..13 only), so the conditioner is judged inside a
regime where the base family already loses. That weakens but does not reverse the negative: an addition
meant to *select the better subset* of the same signals still has to lose less than taking all of them.

Reads:
- **Cheng et al. leverage/liquidation mechanism does not transfer.** It was actively selected (only 2/8
  splits chose the zero-effect cell), so this is a real negative, not a no-op.
- **Chen/Ma/Nie asymmetry not confirmed.** C beat B by just 1.67 points and both lost heavily. The
  citation itself stayed UNVERIFIED (no arXiv hit, SSRN unreachable) and carried no weight.
- **AdaptiveTrend trailing exit was rejected by our own training search** in 11 of 14 splits, and again
  inside E's 64-cell grid — E's numbers are byte-identical to C because the search set `trailAtr=0`.
  E collapsing onto C is the cleanest possible evidence the exit adds nothing here.
- OI conditioning can only score 8/14 splits: `oiBuildupRank(atr20)` coverage is 64.1%, first fully
  covered 2022-01-28T04:00Z (see `mem:strategy/open_interest_feed_audit_20260825`). Reported as a gap,
  never averaged in as zero.

## The finding that reframes everything: selection, not signal, is the defect

`selectionVersusBestFixed` is negative for **all five arms, control included**:
A +5.10 vs best fixed +41.42 (-36.32) · B -28.33 vs +16.61 · C/E -26.66 vs +16.61 · D -0.80 vs +41.42.
Per-split argmax re-selection is destroying value, exactly the tsm/donchian pathology. (Best-fixed is
chosen with hindsight over the whole OOS span, so it is an unreachable upper bound, not a target — but a
36-point gap still says the adaptivity is noise.) `MIN_TRAIN_TRADES = 10` in all three runners
(`runWalkForwardBaseline`, `runRiskAdjustedWalkForward`, `runLiquidationSqueezeStudy`) is mechanically
consistent with this: a 10-trade in-sample Sharpe has enormous standard error.
**This is the trigger condition for candidate 2 (regret-bounded online ensemble allocator).**

## HAZARD — the arm-conflation trap that produced a false report

Two artifacts both carry `families[id='squeeze']` over the same 14 splits. They are NOT interchangeable:

- **unsized baseline**: 581 trades, +5.10%, pf 1.033, maxDD 38.12, ex-best **-6.09%**, 8/14 positive, median +0.49
- **sized/integrated**: 545 trades, +16.76%, pf 1.133, maxDD 27.58, calmar 0.608, ex-best **+5.57%**, 9/14 positive, median **+1.23**

Both recomputed from the per-split arrays this session; both are correct about different things. The trap:
the sizing search selects policy `none` for splits 0-4, so **the first five per-split numbers are exactly
identical** (11.19, -4.08, 9.04, 9.05, -2.85). A spot check on early splits cannot tell the arms apart.
Also `runWalkForwardBaseline.mts` has **no leave-out-best logic at all**, so any ex-best figure can only
have come from the sizing study — that is the fastest way to detect the conflation.
Separately, the once-reported sized median "+1.55%" is not a median; it is split 13's value. True median +1.23.

Squeeze never passed the mission gate in either arm (DD 38.12 / 27.58 vs the 15-pt cap, 13-pt repo cap).
Defensible claim: `scaleInvariantCore` PASS in the sized arm; mission+repository FAIL in both; and ex-best
it is the **least negative** of the ten families, not a survivor.

The OI zero-guard fix does not touch these squeeze numbers: `compressionBreakout` has `requires: []` and
reads no OI. It does affect `oitrend`, which is still un-rerun (family slated for retirement).

## Artifact digest semantics (not a mismatch — stop re-investigating)

`integrity.contentSha256` = sha256 of `JSON.stringify(payload, null, 2)` computed **before** the integrity
block is attached. The file bytes additionally contain that block plus a trailing newline, so `sha256sum`
on the file legitimately differs and always will — a file cannot contain its own file-bytes hash.
File-bytes vs embedded: 4b11b31e/749b0d68, 79461919/d2f94fd6, 161012d9/9fd856f9.
**Real gap:** `open-interest-feed-audit.json` carries no embedded digest at all; `runOpenInterestFeedAudit.mts`
should adopt the same `body → digest → withIntegrity` pattern as the other four runners.

`scripts/research/` holds **16** files, not 19 (11 under `lib/`, 5 runners) — verified by `find`.
