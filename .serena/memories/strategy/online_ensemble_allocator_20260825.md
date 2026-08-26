# Candidate 2 — regret-bounded online ensemble allocator (Hedge over the grid). Study of 2026-08-25

**Verdict in one line: Hedge beat equal weighting in all 8 variants (best +20.03 points), and every arm still
FAILS the mission gate. The selection layer is not what makes this book unprofitable.**

Paper trading / virtual capital only. Sealed holdout (2024-01-01 →) not read; `assertNoHoldoutLeakage` ran over
every loaded series. No git commit made — user reviews the numbers first.

## Artifacts (regenerate, do not hand-edit)

- `scripts/research/runOnlineEnsembleStudy.mts` — the study runner (new).
- `scripts/research/lib/onlineAllocator.ts` — I/O-free Hedge implementation (new).
- `tests/research/onlineAllocator.test.ts` — 27 tests pinning the properties the regret claim rests on (new).
- `QA/walk-forward-baseline/online-ensemble-allocator-study.json`
  sha256 `f00a448eef0ac7ae4991e5002f3529b37645f25c42d5046611a082b04bb44f81`
- `QA/walk-forward-baseline/online-ensemble-allocator-research-log.json`
  sha256 `641970c3b43a9c58042a37c5e8cd6d8b4da13b04c09d9d0f9bd7be429f6d1554`
- Runtime 7.4s: `npx tsx scripts/research/runOnlineEnsembleStudy.mts`.

## Algorithm and what is actually guaranteed

Hedge / exponentially weighted average forecaster, NOT EXP3 — feedback here is full-information (the harness
already scores every grid cell on every split), so paying EXP3's `O(sqrt(T N log N))` for bandit feedback would be
strictly worse. Bound relied on: losses in [0,1], `w_t(i) ∝ exp(-eta * sum_{s<t} l_s(i))`, regret ≤ `ln N / eta +
eta T / 2`, and at `eta = sqrt(2 ln N / T)` → **`Regret ≤ sqrt(2 T ln N)`**. Freund & Schapire 1997 JCSS
55(1):119-139; Arora-Hazan-Kale 2012 Theory of Computing 8:121-164 Thm 2.3; Cesa-Bianchi & Lugosi 2006 Thm 2.2
for the sharper `sqrt((T/2) ln N)`. Sleeping/specialist experts: Freund-Schapire-Singer-Warmuth STOC'97 334-343,
Blum & Mansour JMLR 8:1307-1324.

Loss map with **pre-registered** cap: `l = clip(0.5 - r/(2R), 0, 1)`, **R = 15 points** = the mission gate's
max-drawdown cap, a constant that predates the study; same R at both granularities so neither arm gets a tuned
cap. Clipping compresses extremes toward equal weighting, so it biases AGAINST finding a Hedge advantage.

**Measured clipping: 26.63% / 26.28% per-split (material — disclosed, not buried), 0.033% per-bar.**

**The T=14 bound is vacuous and that is a reported number, not a footnote:** fixed eta bound 11.04 = **78.9%** of
the achievable loss range; anytime eta 15.62 = **111.6%**, i.e. formally vacuous. At T=5110 it drops to 4.1% and
5.8%. Realised regret held in all 8 variants (2.59–3.95 against bounds 11.04–298.85). Per-bar exists precisely
because per-split's guarantee is empty.

## Headline numbers (net @ 2x cost stress, 14 splits, bar-level DD/PF)

| arm | net@2x | base | maxDD | pf | calmar | splits+ | ex-best | gate |
|---|---|---|---|---|---|---|---|---|
| hedge-anytime-split-nocash | -45.38% | -9.40% | 53.18 | 0.784 | -0.853 | 5/14 | -49.28% | FAIL |
| hedge-anytime-split-cash | -44.86% | -9.37% | 52.52 | 0.784 | -0.854 | 5/14 | -48.72% | FAIL |
| hedge-fixed-split-nocash | -46.72% | -10.65% | 54.12 | 0.776 | -0.863 | 5/14 | -50.87% | FAIL |
| hedge-fixed-split-cash | -46.19% | -10.60% | 53.46 | 0.776 | -0.864 | 5/14 | -50.29% | FAIL |
| hedge-anytime-bar-nocash | -62.74% | -18.77% | 66.78 | 0.764 | -0.940 | 3/14 | -71.41% | FAIL |
| hedge-anytime-bar-cash | -62.50% | -18.71% | 66.50 | 0.764 | -0.940 | 3/14 | -71.17% | FAIL |
| hedge-fixed-bar-nocash | -64.10% | -20.05% | 66.95 | 0.759 | -0.958 | 3/14 | -72.77% | FAIL |
| hedge-fixed-bar-cash | -63.85% | -19.98% | 66.67 | 0.759 | -0.958 | 3/14 | -72.51% | FAIL |
| control-equal-weight-nocash | -65.40% | -26.23% | 71.65 | 0.660 | -0.913 | 1/14 | -66.32% | FAIL |
| control-equal-weight-cash | -64.54% | -25.88% | 70.71 | 0.660 | -0.913 | 1/14 | -65.45% | FAIL |
| control-ftl-split | -66.02% | -17.40% | 71.28 | 0.829 | -0.926 | 4/14 | -79.94% | FAIL |
| control-ftl-bar | -44.25% | +4.50% | 50.75 | 0.890 | -0.872 | 4/14 | -54.12% | FAIL |
| control-best-fixed-hindsight | +66.26% | +111.17% | 73.56 | 1.192 | 0.901 | 6/14 | -12.10% | FAIL |
| control-argmax-pool | +67.97% | +90.11% | 25.45 | 1.361 | 2.671 | 4/14 | -13.90% | FAIL |
| control-argmax-per-family | -72.41% | -38.17% | 72.72 | 0.712 | -0.996 | 0/14 | -71.64% | FAIL |
| control-cash | 0.00% | 0.00% | 0.00 | n/a | n/a | 0/14 | 0.00% | FAIL |

Both pool compositions reported, neither promoted to "the" number: withoutCash best Hedge -45.38% vs equal
weighting -65.40% (**+20.03**); withCash -44.86% vs -64.54% (**+19.68**). Adding a cash expert to a 78-cell pool
moves it ~0.5 points — it is 1/79th of the simplex, not a risk switch.

`selectionVersusBestFixed` is **negative for every Hedge arm**: -111.13 to -130.37 points against the +66.26%
hindsight best-fixed. Only `control-argmax-pool` is positive (+1.71), and it beats best-fixed legitimately
because switching cells across splits can exceed any single fixed cell.

**Every arm fails DSR.** Deflated Sharpe is 0.0000 for all 16 arms at 86 trials, including `control-argmax-pool`
(observed Sharpe 0.221, PSR 0.8815, benchmark 1.7208) and `control-best-fixed-hindsight` (0.174, PSR 0.7584).
Sensitivity at 92 trials: also 0.0000 everywhere.

## Trial accounting — the correction the user demanded, and its limit

Rule implemented: **one trial per parameter combination in every family grid, plus one per allocator variant.
Family names are not trials.** `sum(family.grid.length)` over `STRATEGY_FAMILIES` = **78**
(tsm 8, donchian 6, volshock 8, squeeze 8, meanrev 6, fundingcarry 6, oitrend 6, xsmom 12, resrev 12, ratioarb 6),
plus **8** allocator variants (2 eta x 2 granularity x 2 pool) = **86 declared, 86 usable on both bases**.
Sensitivity set = 92 (also charging the 6 non-Hedge selection procedures).

Two facts worth keeping:
- The repo's only pre-existing `deflatedSharpe(` call site, `runLiquidationSqueezeStudy.mts:818`, **already**
  counted grid cells: `arms[*].deflated.trials` = 8/32/32/32/64 = each arm's `fixedConfigurations.length`. The
  precedent already was the rule.
- `fixedConfigurations[]` is NOT an export of `strategyFamilies.ts` — it is built inside the squeeze runner
  (declared ~L393, built ~L762). In `strategyFamilies.ts` the enumeration is `family.grid: readonly ParamValues[]`.
- **Limitation (recorded in the artifact as `trialAccounting.knownLimitation`):** DSR's penalty depends on both
  `trials` and `trialSharpeStdDev`, and `expectedMaximumSharpe` scales with the stdDev. Adjacent grid cells share
  most of their trades, so raising the count can *shrink* the spread. The correction is a **floor** on the
  selection-bias penalty, not a ceiling — which is why leave-out-the-best-split is reported for every arm as an
  assumption-free check.

## Two real defects found by self-audit — both fixed, both worth remembering

1. **Selection cost model.** `runWalkForwardBaseline.mts` scores its train window at **BASE** costs and declares
   `costModelUsedForSelection: 'base'` (L254 / L404). Scoring selection at stressed costs made the argmax control
   a *different mechanism* from the published one (picks diverged on 3/14–8/14 splits per family). Fixed: train
   window scored with `BASE_COSTS`; out-of-sample stays stressed.
2. **Availability gating was stricter than the rule.** Treating `partial` as asleep also diverged from the
   published baseline, which applied **no** availability filter to eligibility (`candidatesEligible` counts only
   the `MIN_TRAIN_TRADES` floor). Fixed: **only `unavailable` puts an expert to sleep**; `partial` stays awake and
   is counted. Measured: 6 partial and 30 unavailable split-expert pairs.

A permanent `publishedBaselineCrossCheck` block now recomputes every family's argmax aggregate at full weight and
compares it to `walk-forward-baseline-results.json`, so this class of drift cannot pass silently again.
**Result: 10/10 families reproduce exactly on the splits this study keeps awake.**

**oitrend is the one family with a whole-history difference, and it is fully explained, not drift.** OI coverage is
4376 of 6570 bars, so splits 0–4 have no usable OI. The published run still selected and booked splits 3 and 4
(-8.24% and -7.59%, total **-15.83%**); this study drops them under the no-fabrication rule. On the 9 splits both
runs traded, picks are **9/9 identical** and the aggregate matches to `delta 0.000000` (-50.71% both). The
cross-check therefore judges agreement on awake splits and names the dropped splits and their published
contribution explicitly — do not "fix" this back to a whole-history comparison.

## Accounting conventions that make these numbers non-comparable to the baseline's

- **Bar-level PF and drawdown.** A continuously reweighted book has no round trips, so PF/DD come from the
  portfolio per-bar series and are suffixed `...BarLevel`. NOT comparable to the trade-level figures in
  `walk-forward-baseline-results.json`.
- **P&L booking.** An expert's round return is the net P&L of trades that *closed* in that round, so the allocator
  learns about an expert only when it closes — this understates the per-bar arm rather than flattering it.
- **Exposure.** Weights sum to 1 over the awake set, so gross exposure stays ~1 unit and the DD cap cannot be
  passed by de-levering (see `mem:strategy/promotion_gate` — the cap is scale-passable, Calmar is the only
  scale-invariant metric).
- **Information set.** The allocator sees every completed round strictly before the current one — a superset of
  argmax's 1095-bar train window, and no future bar.

## Where the weight actually went

`hedge-anytime-split-nocash` weightByFamily: oitrend 0.206, xsmom 0.160, squeeze 0.135, tsm 0.127, volshock 0.103,
donchian 0.094, fundingcarry 0.061, meanrev 0.040, ratioarb 0.039, resrev 0.034. The top 6 individual cells are all
oitrend — Hedge concentrates on the family that is *asleep for 5 of 14 splits*, because losing rounds it sat out
never counted against it. That is correct specialist behaviour, and it is also why oitrend's -66.54% published
aggregate does not translate into a proportional drag here.

## Compatibility gates after this work (Windows native, 2026-08-25)

`npx tsc --noEmit` clean · `npm run test:unit` **132 files / 811 tests PASS** · `npm run build` PASS (22.23s) ·
`npm run check:version-identity` PASS (1.0.68 across package/lock/manifest/SW) · `npm run check:build-identity`
PASS. `sourceHash` covers `['src','public','scripts','openapi']`, so any `scripts/research/*` edit invalidates
build identity and requires a rebuild.

## What this means for the roadmap

The `selectionVersusBestFixed` gap that motivated candidate 2 is **not** closable by a better selection rule.
Hedge beat both naive controls and still lost ~112 points to hindsight best-fixed, and the drawdown barely moved
(53 vs 72 points) — because the drawdown is in the signals. See `mem:strategy/profitability_roadmap`: the next
move is replacing the 5 dead families (meanrev -189.22%, resrev -326.20%, ratioarb -78.97%, fundingcarry -84.51%,
oitrend -66.54%), not re-weighting them. Candidate 3 (funding/basis deviation with a cost-derived no-trade band)
stays in reserve, triggered if squeeze weakens in a different vol regime or the funding `mark` gap is resolved.
