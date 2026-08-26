# Short-horizon crypto literature review + prototype plan (2026-08-25)

Follow-on to `strategy/walk_forward_harness_results_20260825` (0/10 pass, only `squeeze` survives
leave-out-best-window). Purpose: find literature-backed candidates instead of hand-tuning more static rules.

## Retrieval constraints (matters for judging coverage)
- `WebSearch` is UNAVAILABLE on this gateway: `tool type 'web_search_20250305' is not supported for this model`.
- Subagent delegation returns `503 ... claude-sonnet-5 无可用渠道`. No fan-out possible.
- Everything below was retrieved directly via `mcp__workspace__web_fetch` against
  `https://export.arxiv.org/api/query?...` (must be https; `http` -> "Redirect was cancelled").
  API quirks: rewrites `A AND B AND C` as `A AND (B AND C)`; token `crypto` does NOT match
  `cryptocurrency`; `timeout_ms` max is 30000; two parallel first-calls abort, warm up with one.
- ABSTRACTS verified via the API record. FULL TEXTS NOT read -> sample windows / exact cost levels /
  exact Sharpe magnitudes are UNVERIFIED for every paper below. Label accordingly when citing.
- SSRN not retrieved (no IDs obtainable without a search engine). AQR's research index IS reachable
  (`https://www.aqr.com/Insights/Research`, HTTP 200) but currently lists tax-aware-investing and
  portfolio-level work, nothing intraday-crypto. Man AHL / Two Sigma not retrieved. The
  practitioner-research leg is therefore only PARTIALLY discharged.

## Tier 1 - mechanism-backed, relevant to our instrument/timeframe
- **2212.06888v6 Fundamentals of Perpetual Futures** (He, Manela, Ross, von Wachter; q-fin.PR; v6
  2024-08-21; CC-BY). No-arb perp prices in frictionless markets AND **bounds under trading costs** --
  the cost-bound is the valuable part: it defines a no-trade band instead of a tuned threshold. Crypto
  deviations larger than FX, comove across currencies, **diminish over time**. "An implied arbitrage
  strategy yields high Sharpe ratios."
  IMPORTANT: this is a *basis/deviation* trade (needs the spot leg). Our dead `fundingcarry`
  (-84.51%, Calmar -0.988) traded funding LEVEL directionally -- a different signal. fundingcarry's
  death is NOT evidence against this paper.
- **2102.04591 Liquidation, Leverage and Optimal Margin in Bitcoin Futures Markets** (Cheng, Deng,
  Wang, Yu; q-fin.TR; BitMEX BTC perps). Daily forced liquidations = **3.51% of outstanding (long)
  and 1.89% (short)**; liquidated traders averaged **60x leverage**. This is the economic mechanism
  behind compression-breakout / vol-shock continuation: mechanical, price-insensitive flow. Predicts
  LONG/SHORT ASYMMETRY (~1.9x). BitMEX-era, higher-leverage regime than 2021-2023, so magnitudes are
  likely smaller now.
- **2602.11708v1 AdaptiveTrend** (Bui & Nguyen; cs.CE; **NOT peer-reviewed**). 6h bars, 150+ pairs,
  2022-2024, claims Sharpe 2.41 / maxDD -12.7% / **Calmar 3.18** (~5x our best; sample overlaps our
  SEALED 2024 window). Treat numbers as unreplicated/optimistic. Useful MECHANISM only: trailing stop
  calibrated to the current volatility regime; rolling-Sharpe asset selection; asymmetric 70/30 L/S.

## Tier 2 - fixes our actual failure mode (selection noise), with a proof not a backtest
- **1604.03266 Online Learning of Portfolio Ensembles with Sector Exposure Regularization** (Uziel &
  El-Yaniv; cs.LG). Online convex optimization over an ensemble of strategies, "**logarithmic regret**
  with respect to the **best-in-hindsight ensemble**".
- Supporting OPS algorithmics: **2202.02765** (Zimmert, Agarwal, Kale; BISONS, polylog regret),
  **2210.00997v3** (Tsai, Cheng, Li; ALT 2023; mirror-descent regret bounds), **1206.4626** (Li & Hoi,
  OLMAR, ICML 2012), **1705.09800** (Uziel & El-Yaniv, growth-optimal under CVaR constraint).
- WHY THIS IS THE #1 FIND: our failure was not "no family works", it was that **choosing** among 40
  candidates on 1095 training bars fit noise -- tsm's integrated aggregate beat every fixed config it
  selected from, and donchian's integrated Calmar 0.129 was WORSE than its own unsized 0.601, i.e.
  selection destroyed value. A regret-bounded allocator never has to pick a winner.
- HARD CAVEAT: OPS literature is long-only, wealth-multiplicative, equity datasets (NYSE/DJIA), and
  mostly **cost-free**. The GUARANTEE transfers; the reported returns do NOT. Use the allocator, ignore
  their P&L.

## Tier 3 - regime detection, including the negative results
- **2007.14874** (Oelschlager & Adam; stat.ME; DAX + S&P 500, daily). Plain HMMs cannot capture short-
  and long-term trends together, "which can lead to a **misinterpretation of short-term price
  fluctuations as changes in the long-term trend**". Implication: a 2-state HMM on 4h returns will
  thrash. Any regime layer must be hierarchical / two-timescale.
- **2401.03393v2** (Koch et al.) NEGATIVE: for BTC variance, "persistent simple GARCH models may even
  outperform Markov-Switching GARCH models". Regime machinery is not automatically better.
- **1910.05555** (Sebastian & Gebbie; HS-FP flexible-probability regime conditioning) NEGATIVE: low PBO
  but "results are inconsistent when training windows are varied, the Sharpe ratio is seen to be
  inflated, and the method does not demonstrate statistically significant out-performance on a gross
  and net basis".
- **2309.00875v3** (Fanelli, Fontana, Rotondi; q-fin.GN). Regime-switching mean-reverting cointegration
  spread with **online filter-based parameter estimation**; profitable under conservative costs and
  across periods **only** for strategies involving Shanghai crude; the mature Brent/WTI/Dubai triple
  gave NO profitable opportunities. Read-across: our `ratioarb` (-0.885) dying on liquid crypto majors
  is the Brent/WTI outcome. The edge was market SEGMENTATION, not sophistication. We have no
  Shanghai-analogue -> argument AGAINST reviving ratioarb.
- **2311.10739v1** (Mahmoudi) MSM-VAR two-regime BTC is **monthly** -> not transferable to 4h.

## Tier 4 - cost realism + overfitting control (validates our own harness)
- **2512.22476v3 AutoQuant** (Deng; **PEER-REVIEWED**, Expert Systems with Applications 2026,
  DOI 10.1016/j.eswa.2026.133924; BTC/ETH/SOL/AVAX perps). "**fee-only and zero-cost backtests
  materially inflate apparent performance relative to fully costed runs with funding and slippage**";
  "**two-stage screening does not guarantee higher returns**; it more often surfaces lower-drawdown or
  less extreme alternatives." Excludes market impact/capacity. Same instrument class as ours ->
  independent confirmation of BOTH our cost stance and our exact selection pathology.
- **2606.00071v1** (Baquero; q-fin.GN survey of peer-reviewed BTC prediction evidence). "At
  short-to-medium horizons, no peer-reviewed study has shown robust superiority over the naive baseline
  across multiple market regimes"; "**daily predictability is real but does not extend to hourly or
  monthly horizons, and may not survive transaction costs**." Proposed standards: walk-forward,
  multi-regime holdout, naive-baseline comparison, **inclusion of zero in hyperparameter grids**,
  Diebold-Mariano testing. CALIBRATION: 0/10 at 4h is the EXPECTED result, not a harness bug.
- **2212.07288 Smoothing volatility targeting** (Bernardi, Bianchi, Bianco; econ.EM). "smoothing
  volatility targeting helps to **regularise the extreme leverage/turnover that results from commonly
  used realised variance estimates** ... important implications for both the risk-adjusted returns and
  the mean-variance efficiency of volatility-managed portfolios, **once transaction costs are factored
  in**." Lands directly on our step-2 result (raw rolling-std volTarget, mean scale 0.496, maxScale 3
  clipping, helped only in hindsight-selected cells). Our entry-bar-only application already avoids the
  worst turnover problem -- the un-taken half of the fix is SMOOTHING THE ESTIMATOR.
- Overfitting toolkit: **2008.09481** (da Costa & Gebbie; CSCV, probabilistic + **deflated** Sharpe),
  **1905.05023** (Koshiyama & Firoozye; covariance penalties, 1300+ assets), **2209.05559v6** (Gort et
  al.; PBO as a hypothesis test used to REJECT overfitted DRL agents -- but their test window is only
  2022-05-01..2022-06-27, so their positive claims are weak), **1408.1159** (Carr & Lopez de Prado).

## Data-integrity finding that bears on a dead family
- **2310.14973v2** (Giagkiozis & Said; **Ledger Vol 9 (2024) 1-15**, DOI 10.5195/ledger.2024.325).
  Tick-by-tick, 7 exchanges, two 2023 periods: BTC perp **open interest is systematically misquoted**
  by some of the largest derivatives exchanges -- some report wholly implausible OI, others delay
  forced-trade (liquidation) messages. Our `oitrend` was the WORST family (Calmar -0.996). AUDIT THE OI
  FEED before rebuilding any OI family. This is a data-quality hypothesis, NOT a proven explanation.

## Other verified sources (lower priority)
- **2411.06327v2** (Chi, Chu, Hao; econ.EM). BTC/ETH/USDT 2017-2023 at **1-6 hour** frequencies: USDT
  net inflows to exchanges positively predict BTC/ETH returns; ETH net inflows negatively predict ETH
  returns and volatility. RIGHT timeframe -- but we have NO on-chain flow data on disk -> data
  acquisition project, not a prototype.
- **2208.09968v3** (Poh, Roberts, Zohren; q-fin.TR). Top-10 crypto by mcap, cross-sectional momentum
  via Fused Encoder Networks, ~3x Sharpe over classical momentum, "continues outperforming baselines
  even after accounting for the high transaction costs." Same universe SHAPE as ours; but our `xsmom`
  is dead (-0.820) and this is heavy ML.
- **2306.17095v2 / Chaos 33, 083146 (2023)** (Watorek, Skupien, Kwapien, Drozdz). 10-second data
  2020-2022: three enhanced-activity phases matching Asian/European/US sessions, surges at 15-minute
  and full-hour marks, bursts coinciding with **NFP, CPI, Fed** statements; internal dynamics
  substantially random (Marchenko-Pastur). Implementable from TIMESTAMPS ALONE, zero new data -- but it
  documents ACTIVITY/VOLATILITY recurrence, not direction. Honest use: a conditioner, never a signal.
- **2510.14435v4** (Borri, Liu, Tsyvinski, Wu). Seven stylized facts; cross-section summarized by a
  small factor set; **jumps frequent and large**.
- **2108.11921v1 / 1802.03708v8** (Guo, Hardle, Tao). Dynamic covariate-assisted spectral clustering;
  claims an inter-crypto momentum portfolio earns **1.08% DAILY** -- implausible, near-certainly gross
  and on illiquid names. Mechanism (lead-lag community structure) is implementable from OHLCV.
- **1811.07860v2** (Kakushadze; Algorithmic Finance 7(3-4) 2018, 87-104). Daily cross-section, source
  code provided, stat arb "subject to efficient executions and shorting."
- **2512.08124v1** (Yang; IJCNN 2025, DOI 10.1109/IJCNN64981.2025.11228268). Daily NN ranking,
  2020-05..2023-11, Sharpe 1.01, +64.26%/yr, "robust to the increase of transaction fee."
- **2608.09576v1** (Konczal & Poloczanski). BTC/ETH ETPs on Xetra/Nasdaq Stockholm, 1-minute bars,
  2024-01..2025-12 (NOTE: overlaps our sealed window). Momentum-reversal / no-recovery / cross-venue
  anomalies predictable 1 bar ahead, AUC up to 0.82; short-term volatility and drawdown measures beat
  microstructure variables in permutation importance. AUC != net-of-cost P&L.
- **2603.09164v1** (Sepper). Slippage-at-Risk from order-book microstructure; Hyperliquid, incl. the
  2025-10-10 liquidation cascade. Relevant later for capacity/slippage realism, not for signal.
- NOTE: arXiv's intraday-crypto-momentum literature is genuinely THIN (`abs:intraday AND
  abs:cryptocurrency AND abs:momentum` -> only 2 total results). The scarcity is itself informative.

## Prototype plan (ordered, decided)
1. **Regret-bounded online ensemble allocator replacing in-sample argmax selection.** FIRST because it
   attacks the MEASURED failure. Exponentiated-gradient / Hedge weights over
   {squeeze, tsm, donchian} x policies, updated on realized net-of-cost per-bar P&L; learning rate set
   ONLY on each split's training portion; weights carried through the test window without refitting.
   MANDATORY control arms: (a) equal-weight 1/N over the same pool, (b) current in-sample argmax. If EG
   does not beat 1/N, report that -- 1/N-beats-optimization is a known outcome and an honest negative.
2. **Liquidation-flow-conditioned squeeze with vol-regime-calibrated exits + long/short asymmetry.**
   squeeze has the least-negative leave-out-best-window result of the ten families (unsized baseline
   artifact, 2x costs: total **+5.10%**, best split +11.19%, remaining **-6.09%**, 8/14 positive,
   median **+0.49%**, mission false on a 38.12-point drawdown) and Cheng et al. supply its mechanism.
   NOTE, corrected 2026-08-25: an earlier version of this line called squeeze "the only
   leave-out-best-window survivor (total +16.76% ... remaining +5.57%, 9/14 positive, median +1.55%)".
   Those figures do not match the baseline artifact, no repo script reproduces them, and their
   provenance is unconfirmed; see `mem:strategy/walk_forward_harness_results_20260825`. No family
   survives deleting its best window at 2x costs. Three independently
   testable changes: (i) require vol compression AND a rising-leverage/OI condition -- ONLY after
   auditing the OI feed per Giagkiozis & Said; (ii) trailing exit scaled to current realized vol rather
   than a fixed multiple; (iii) asymmetric long/short thresholds per the 1.9x liquidation asymmetry.
   Each must beat unchanged squeeze on the same 14 splits at 2x cost with per-split breakdown.
3. **Funding/basis deviation with an explicit no-arb cost band** (2212.06888). Third despite being the
   most credible published edge, because it needs the SPOT leg (harness change: we trade perp direction
   only) and "deviations diminish over time" means 2021-2023 may already be past the good part. It is
   the proper replacement for fundingcarry -- entry condition derived from a no-arb bound under costs,
   not a tuned threshold.

DEPRIORITIZED with reasons: reviving `ratioarb` (Fanelli et al.: the edge lived in the SEGMENTED
market; we have no segmented leg); on-chain flow (data we don't have); Fused Encoder / DRL (xsmom dead
at -0.820; Gort et al. show DRL agents mostly fail PBO); intraday seasonality as a standalone signal
(activity, not direction).

## Harness upgrades the literature says to make (all cheap)
- **Include zero in every parameter grid** (Baquero) -- every family must compete against "don't trade".
  Our current grids do NOT force this.
- **Deflated / probabilistic Sharpe or CSCV** on the selection step (da Costa & Gebbie). We currently
  have NO multiple-testing correction across the 40 candidates.
- **Diebold-Mariano**-style significance on per-split differences instead of eyeballing aggregates.
- **Smoothed** realized-vol estimator for any sizing overlay (Bernardi et al.), not raw rolling std.
- KEEP the leave-out-best-window check as a standing gate. Nothing in the literature replaces it, and
  it is what caught tsm.

## Unchanged constraints
Sealed 2024-2025 holdout (hash `e656624e`) stays sealed to the very end. `squeeze` stays in the
portfolio. Same 14 rolling splits / 2x cost stress / per-split breakdown. Paper trading only. Isolated
research harness under `scripts/research/` -- no touching `strategyRegistry`, `FUSION_COMPONENTS`, or
promotion contracts.
