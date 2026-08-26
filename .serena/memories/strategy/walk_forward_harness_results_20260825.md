# Walk-forward research harness — built and run 2026-08-25 (paper/simulated only)

Isolated research harness under `scripts/research/`. Touches **no** promotion contract, no
`strategyRegistry`, no `FUSION_COMPONENTS`. See `mem:strategy/promotion_gate` and
`mem:strategy/profitability_roadmap` for the surrounding policy.

## What exists and runs

- `lib/researchDataset.ts` — loaders; `loadDevelopment*` filter at `Date.UTC(2024,0,1)` and re-assert,
  throwing `HoldoutLeakageError`. The sealed 2024-01-01..2025-12-31 window (hash `e656624e…`) was
  **not read** by either study; both JSON payloads record `sealedHoldout.read = false`.
- `lib/universe.ts` — `loadDevelopmentUniverse()`. Extracted from the baseline runner so the two studies
  cannot drift. Cross-checks that all 10 symbols have identical bar count **and** identical `t` at every
  index, because cross-sectional and pair families index symbols positionally — one missing bar would
  silently compare one symbol's Tuesday against another's Monday for the rest of the run.
- `lib/indicators.ts` — causal primitives, `MaybeNumber = number | undefined`, `undefined` rather than
  padding where history is insufficient.
- `lib/strategyFamilies.ts` — 10 families, `FAMILY_HOURS_PER_BAR = 4`.
- `lib/riskSizing.ts` — sizing overlays (below).
- `lib/tradeMetrics.ts` — `buildTrades` / `summarizeTrades`.
- `runWalkForwardBaseline.mts` — unsized baseline.
- `runRiskAdjustedWalkForward.mts` — sizing study.
- `tests/research/walkForwardHarness.test.ts`.

Data: 10 symbols x 6570 four-hour bars, 2021-01-01T00:00Z .. 2023-12-31T20:00Z. Splits are **rolling**
(non-anchored): warmup 180 / train 1095 / test 365 / step 365 → 14 splits, 5110 OOS bars = 2.332 years,
185 tail bars dropped. Test windows tile exactly, so no OOS bar is double-counted.

Costs: 0.04% commission + 0.02% slippage + 0.01% funding per side, and every headline number is the
**2x stress** variant. `buildTrades` overrides `fundingIntervalBars` with
`fundingIntervalBarsFor(hoursPerBar) = max(1, round(8 / max(1, hoursPerBar)))`; the module default of 8
bars from `transactionCostModelFromPerSideAssumptions` would under-charge 4-hour bars **4x**.

## THE FINDING THAT MATTERS MOST: the mission gate is gameable

P&L is additive in percentage points, so a constant exposure multiplier `k` multiplies net return **and**
max drawdown by `k`. Profit factor and the sign of the return are scale-invariant; a drawdown cap is not.
Therefore `{trades >= 30, pf > 1, DD <= 15%}` is passable by **any** family with pf > 1 simply by holding
less. "Got it under the drawdown cap" is not a result unless the ratio moved.

The only scale-invariant quality metric is **Calmar = netReturnPct / maxDrawdownPct**. The studies report
Calmar plus `x@cap` (the multiplier that lands DD on 15) and `ann@cap` (annualised return at that
multiplier) precisely so a de-levering cannot masquerade as a drawdown fix. `runRiskAdjustedWalkForward`
also emits a `scaleInvariantCore` verdict (trades>=30 && pf>1 && stressed net>0 && base net>0) separate
from the mission verdict, and a `gates.scaleInvarianceWarning` string in the JSON.

Worked example: donchian unsized, Calmar 31.45/52.35 = 0.601. Rescaled to DD = 15 → +9.01% over 2.332
years ≈ **+3.86 points/year on a one-unit book**. Technically a PASS, not a viable strategy.

## Baseline (unsized), 14 fresh rolling splits, 2x costs

sha256 `749b0d68af6d2ec3876b5134a6e1692730886042e0de89554a672d70c2c34fc2`,
`QA/walk-forward-baseline/walk-forward-baseline-results.json`.

| family | trades | net(2x) | pf | maxDD |
|---|---|---|---|---|
| tsm | 2728 | +5.41% | 1.011 | 128.67 |
| donchian | 621 | +31.45% | 1.120 | 52.35 |
| volshock | 830 | -3.63% | 0.982 | 28.32 |
| squeeze | 581 | +5.10% | 1.033 | 38.12 |
| meanrev | 1303 | -189.22% | 0.588 | 200.76 |
| fundingcarry | 283 | -84.51% | 0.452 | 85.52 |
| oitrend | 2603 | -66.54% | 0.807 | 67.01 |
| xsmom | 1046 | -14.32% | 0.979 | 90.98 |
| resrev | 2056 | -326.20% | 0.716 | 335.62 |
| ratioarb | 568 | -78.97% | 0.700 | 85.03 |

**0/10 pass the 15-point DD gate; 0/10 pass the stricter 13-point repository gate.**

### CORRECTION to an inherited premise — do not re-inherit the old list
The handoff claimed **5** families "already clear cost-stress": TSM, Donchian, cross-sectional momentum,
volume-shock continuation, compression breakout. On fresh rolling splits only **3** do — tsm, donchian,
squeeze. **volshock (-3.63%, pf 0.982) and xsmom (-14.32%, pf 0.979) do not.** And the drawdowns are
2-9x the cap, not marginally over.

## Sizing study (mission step 2)

sha256 `d2f94fd6a0978cf9749e1d46c2524fe4f322c3226134d82d3ca0bbb83ebcb05d`,
`QA/walk-forward-baseline/walk-forward-risk-sizing-results.json`.

Sizing is a separate layer applied **at the entry bar only**, never re-marked mid-trade: re-levering every
bar would imply rebalancing turnover the cost model does not charge for. `Trade.exposureScale` records it
so a sized run can be audited against its unsized twin. `undefined` at the entry bar drops the trade
rather than taking it at an assumed size.

Two deliberately different overlays, to separate "held less" from "held differently":
- `volTarget` scale = targetVol/realizedVol, capped → equalises across symbols **and** de-levers on
  average. Measured mean scale 0.496 at target 0.75%/bar, 0.987 at 1.50.
- `riskParity` scale = cross-sectional median vol / own vol, capped → cross-sectional equalisation only,
  mean scale ~1.04, i.e. average gross exposure stays ≈ 1.

### Result: sizing does not survive being selected
Per-policy diagnostic rows look encouraging — volTarget0.75/90 lifts Calmar for donchian 0.601→0.743,
volshock -0.128→0.620, squeeze 0.134→0.685, and one single cell (volshock @ volTarget0.75/90, DD 11.28)
is the **only** mission PASS anywhere in the 10x5 matrix.

But those rows are a **hindsight artefact**. Folding the policy into the in-sample selection grid
(the one honest OOS number per family, `integrated`) gives:

| family | integrated Calmar | vs unsized | ann@cap |
|---|---|---|---|
| tsm | 0.701 | 0.042 | +4.51% |
| squeeze | 0.608 | 0.134 | +3.91% |
| donchian | **0.129** | 0.601 — **worse** | +0.83% |
| volshock | **-0.214** | -0.128 — **worse**, and negative | -1.38% |

**0/10 pass the mission gate as run. 3/10 pass the scale-invariant core: tsm, donchian, squeeze.**

### And the two apparent winners are single-window artefacts
Integrated per-split OOS contributions (2x costs), total vs total-excluding-largest-split:
- tsm: total **+44.81%**, split 0 alone (2021-08-01..2021-10-01, unsized, lookback 180) = **+81.87%**,
  the other 13 splits sum to **-37.06%**. 6/14 splits positive, median split **-0.11%**.
- donchian: total +5.00%, split 13 = +24.99%, remaining = **-19.99%**. 6/14 positive, median -0.75%.
- volshock: total -6.23%, best split +10.62%, remaining -16.85%. 7/14 positive.
- squeeze: total +16.76%, best split +11.19%, remaining **+5.57%**, 9/14 positive, median +1.55%.
  **DO NOT QUOTE THESE AS THE BASELINE — corrected 2026-08-25.** They sit in this *integrated/sized*
  section but do not match the unsized baseline artifact, and no script in the repo reproduces them
  (`runWalkForwardBaseline.mts` has no leave-out-best logic at all), so their provenance is
  **unconfirmed**. The likeliest explanation, not verified by re-running the sized study, is that a
  sized total was quoted against unsized per-family numbers. The unsized baseline artifact
  `QA/walk-forward-baseline/walk-forward-baseline-results.json`
  (sha256 4b11b31ed34f3989efbef2ea5d60739cda4392a117f02eda4894ee34ce28b319) says squeeze =
  **+5.10%** total, best split +11.19%, remaining **-6.09%**, 8/14 positive, median **+0.49%**,
  581 trades, pf 1.033, maxDD 38.12%, mission **false**. That artifact was reproduced
  **byte-identically** (all 14 per-split values, all 581 trades) by the control arm of
  `runLiquidationSqueezeStudy.mts`, so it is the ground truth. Consequence: squeeze does **not**
  survive deleting its best window — its ex-best is negative. It is only the *least negative*
  ex-best of the ten families. The discarded "+5.57% survivor" reading propagated into a task
  handoff as a false premise for the liquidation-conditioned study. Use +5.10% / -6.09% everywhere.

So on a one-unit book after 2x cost stress the honest ceiling of all 10 current families is roughly
**0.8-4.5%/year**. Corrected 2026-08-25: the claim that "only squeeze has a shape that is not
dominated by one lucky episode" does **not** hold on the unsized artifact. Squeeze's +5.10% total is
smaller than its own best split (+11.19%), so it too is dominated by one episode — remove that split
and it is **-6.09%**. Every one of the ten families has a negative ex-best at 2x costs. Squeeze was
chosen for refinement because its ex-best is the least negative, which is a much weaker basis than
"survivor" and should be stated that way.

## Selection-noise hazard this exposed
40 candidates (8 params x 5 policies) selected on ~1095 train bars is enough to make the aggregate beat
every fixed configuration by luck — tsm's integrated +44.81% exceeds all five of its fixed-policy rows,
including the two it selects from. Treat any future "improvement" that comes from widening a selection
grid as noise until it survives a leave-out-the-best-window check.

## Revalidation after these changes (Windows, 2026-08-25)
`tradeMetrics.ts` gained a required `Trade.exposureScale` field and the `trade()` fixture at
`tests/research/walkForwardHarness.test.ts:63` was patched to match. `sourceHash` covers
`['src','public','scripts','openapi']`, so any `scripts/research/*` edit invalidates build identity.
- `npx tsc --noEmit` exit 0 (50.6s)
- `npm run test:unit` PASS — 131 files / 784 tests
- `npm run build` PASS — built in 22.36s, build identity `v1.0.68 build 6b018392-d65801a5`
- `npm run check:version-identity` PASS, `npm run check:build-identity` PASS

## Not done yet
Mission step 3 (replacement families) and step 4 (the ONE-TIME sealed-holdout check). Note the "3
discarded families" framing is too narrow: meanrev, resrev, ratioarb are indeed worst, but fundingcarry
(-84.51%) and oitrend (-66.54%) are equally dead, so 5 of 10 need replacing, not 3.
