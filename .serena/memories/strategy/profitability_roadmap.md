# Strategy Profitability Roadmap

Standing program definition for moving APEX strategies from "researched, shadow-only, none promoted" to "paper-trading profitable, promotion-eligible". Process/gate scaffolding only — no indicators or features are prescribed here; that judgment comes from reading actual strategy source each session, informed by the Phase 0 diagnosis.

## Non-negotiable invariants
- `shadowOnly: true` and `autonomousLiveExecutionEnabled: false` hold through the entire roadmap. Nothing here authorizes live execution. "Profitable" means profitable in **Paper Canary / paper trading**, never live.
  - These are literal types, not config flags: `shadowOnly: true` at `src/types.ts:63`, `src/contracts/commander/commanderOutcomeContracts.ts:53`, `src/contracts/realtime/liquidityHunterState.ts:86`, `as const` at ~25 service sites, and `safety: { shadowOnly: true, authoritative: false, executionAuthorized: false, autonomousLiveExecutionEnabled: false }` in the read-plane view model and WS gateway. Flipping requires contract edits that trip contract gates — never a one-line toggle.
- Sealed holdout evaluations are **one-shot**: once a strategy's holdout result is viewed, that holdout is burned and cannot be retuned against. A failed holdout means new data or a genuinely new strategy variant — never "adjust and re-run against the same holdout".
- No synthetic/lab data presented as live market data. No fake evidence, no fabricated PASS.
- Never weaken a promotion gate (or `checkNoSecretsInRelease.mjs`, or any other gate) to force a strategy through.

## Phase order — do not skip forward
0 diagnose → 1 verify the gate → 2 unblock nearest candidate → 3 broaden search → 4 Paper Canary bar → 5 decay monitoring.

## Phase 0 — diagnose before iterating
Never add new strategies before understanding why the existing ones failed. Per strategy: pull the real sealed-holdout result and promotion-gate report (actual numbers, not a summarized status), then classify the failure mode:
(a) genuinely unprofitable out-of-sample; (b) profitable but failed a NON-performance gate; (c) overfit in-sample, collapsed out-of-sample; (d) insufficient trade count for statistical confidence; (e) promotion gate never run to completion.
Only (b) and (e) can be pushed further without spending new sealed data — so the classification is what decides whether the next session is "unblock an existing candidate" or "Phase 1-2 for new candidates". Append dated classification blocks in the scoreboard below so this is never re-derived from scratch.

### Study scope — RESOLVED 2026-08-23, do not re-derive
The sealed study is a **26-row (strategy x dataset) matrix, not 26 strategies.** `promotion.evaluatedCount = runs.length = 26`, `passedCount = 0` in `QA/profitability-structural-remediation/structural-profitability-results.json` (generatedAt 2026-08-22T19:40:17Z, seal `e656624e...`). That count is the only on-disk origin of "26".
- 10 distinct core strategies x 3 datasets, minus the 4 pairs skipped by `supportedIntervals.includes(context.interval)` (study script :214). `CORE_STRATEGY_COUNT = 10` (`strategyRegistry.ts:10`); `listStrategyDefinitions({ coreOnly: true })` filters `isCore === true` (:530-533). `contexts` = BTC_1H 1h, BTC_4H 4h, ETH_1H 1h (study :33-37). Rows per dataset: BTC_1H 10, BTC_4H 6, ETH_1H 10.
- The 4 core strategies lacking `'4h'`: opening-range-vwap-rvol-breakout-v1 (:206), multi-timeframe-vwap-pullback-reacceleration-v1 (:266), liquidity-sweep-fvg-reversal-v1 (:296), news-sentiment-momentum-breakout-v1 (:358). Registry also holds 4 non-core `status: 'blocked'` definitions (:419-445) + `baselineStrategyDefinition` (:81) — none enter the study.
- One engine, one seal, one results file. `holdout-seal.json` (sealedAt 2026-08-22T19:33:13Z, 3 contexts, minHoldoutTrades 30) and the results JSON both carry `e656624e...`. No per-strategy holdout artifact exists and no separate 26-strategy engine exists.
- `minHoldoutTrades: 30` is enforced **per row**, not per strategy and not study-wide: `sample: holdoutMetrics.trades >= gatePolicy.minHoldoutTrades` (:226) sits inside the `contexts` x `definitions` double loop. One strategy can pass on one dataset and fail on another — regime-routed-ai-ensemble: 185 trades BTC_1H PASS, 28 BTC_4H FAIL.
- Bucket (d) is only **5 of 26 rows**: news-sentiment BTC_1H 19, news-sentiment ETH_1H 18, funding-basis-carry BTC_4H 13, whale-flow BTC_4H 9, regime-routed BTC_4H 28. 21/26 rows clear the sample gate — the study is not sample-starved.

### Two universal blockers dominate — the real Phase 0 unit
`fullStrategySemantics` fails **26/26** rows and `browserQa` fails **26/26**. No row can promote regardless of performance, so `passedCount: 0` carries almost no information about strategy quality.
- `browserQa` is one global object read once (`readBrowserQa()` :199) and stamped onto every row (:233). **Tooling blocker RESOLVED 2026-08-23** — the old `blocked_before_test` / "Playwright CDN TLS failure" / 0/0 record was a hand-authored artifact from a **Linux sandbox**, not a Windows failure, and is not reproducible here. The gate now really runs (0/0 → **0/8** comparisons executed) but FAILS substantively: the app shell throws under the offline stub harness and all 8 routes capture the same byte-identical error-boundary screen. Full mechanics, the 2 fixes, and a false-PASS `runtimeGatePassed` defect: `mem:strategy/promotion_gate` browserQa section. Still `false` in the sealed artifact — the study was deliberately NOT re-run, so the seal is intact.
- `semanticBlockers` is non-empty on all 26 rows (4 distinct sets, every one containing the LIVE_ONLY fusion string; extras: cross-asset universe identity, whale-flow proxy, funding basis/spread).
Consequence: **do not budget 26 or even 10 per-strategy diagnoses.** One structural diagnosis of these two gates covers all 26 rows; per-row performance triage only becomes meaningful after that.

## Phase 1 — verify the gate itself before blaming the strategies
- "None promoted across months of shadow work" is itself a signal worth checking.
- Get exact numeric criteria from source, never assume. Confirmed criteria, the nine gate flags, and gate topology: `mem:strategy/promotion_gate`.
- Deliberate deviation from the original program text: those criteria live in `mem:strategy/promotion_gate`, **not** in `mem:task_completion`. The study is standalone research with no `profitability`/`research:` entry in the package.json `verify` chain; filing it beside the release pipeline would wrongly imply it gates a release.
- Check for gate-side bugs: is the sealed-holdout evaluator wired to real, current historical data rather than stale/truncated series? Use `find_symbol` / `find_referencing_symbols` on the gate functions, not full-file reads.
- If the gate is stricter than what is statistically achievable given the strategy universe and data window, that is a legitimate finding — record it here as a standing note. Do NOT loosen the gate to compensate.

## Phase 2 — unblock the nearest candidate first
- Confirm what each named blocker actually requires against the real gate definition before assuming (e.g. "browser QA" can be a runner/launch failure rather than missing UI wiring).
- Close only gaps that do not touch the sealed holdout; non-holdout gate parts can be re-run freely without burning it.
- Goal: one real paper-eligible strategy as the calibration reference for everything else.
- CAUTION (2026-08-23, revised): the nearest row by gate distance is BTC_4H `volatility-squeeze-trend-volume-expansion-v1` — it fails ONLY the two universal blockers. It is NOT news-sentiment BTC_1H, which additionally fails an unfixable `sample` gate; do not spend a session on that one. Neither is promotable until `fullStrategySemantics` + `browserQa` are addressed, and both are blocked by the same LIVE_ONLY fusion mechanism. See the dated scoreboard blocks.

## Phase 3 — only then broaden the strategy search
Requires Phase 1-2 to have produced a trusted gate and >=1 promoted template.
- Prefer families adjacent to a proven edge (other variants or timeframes of the same signal) over unrelated new hypotheses: cheaper to validate, likelier to clear a calibrated gate.
- Exhaust walk-forward / in-sample robustness testing BEFORE requesting a sealed holdout. The holdout is the final check, not the debugging loop — one shot per strategy.
- Keep the scoreboard below current per strategy: hypothesis, in-sample PF/DD/trade count, holdout result once spent, gate outcome, failure classification.

## Phase 4 — Paper Canary is the real profitability bar
Sustained positive P&L under Paper Canary over a live paper window, not a good backtest/holdout number. Backtests and holdouts are necessary but not sufficient: regime shift, slippage/fee modelling gaps and execution-timing differences only surface in Paper Canary.
- Run under the portfolio governor for a defined minimum window. Define that window explicitly the first time this phase is reached (N trading days or M trades, whichever is more statistically meaningful) and record the chosen threshold here.
- Track paper-live performance separately from backtest/holdout performance. Divergence between them is diagnostic (fee/slippage modelling gap, look-ahead bias in the backtest) — never discard it as noise.
- Governor limits, to re-verify at that point and NOT the same number: `riskGovernor.ts` enforces <=0.75%/trade, 35% gross cap, 8% throttle, 12% hard shutdown; the "12.10% max DD" figure quoted for the Liquidity Hunter portfolio governor is an observed run value, not that constant.

## Phase 5 — decay monitoring, once >=1 strategy is paper-profitable
Markets regime-shift; a promoted strategy can stop working. Standing rule: monitor rolling PF/DD against the strategy's original validation numbers and define a demotion trigger (rolling PF below X over Y trades) before anything is trusted long-term. "Promoted once, trusted forever" is a silent data-integrity failure.

## Scoreboard / dated classification blocks

### 2026-08-23 — BTC 1h news momentum (`news-sentiment-momentum-breakout-v1`, `BTC_1H`)
Classification: **(d) insufficient sample + a non-performance semantics guardrail + (e) browser QA never run.** Not bucket (b) alone.
- Sealed holdout: 19 trades, +1.326%, PF 1.3485, DD 1.262%. REJECT flags `sample:false` (19 < pre-registered 30), `fullStrategySemantics:false` (intentional LIVE_ONLY fusion guardrail), `browserQa:false` (runner never launched). Mechanism detail and why no honest fix exists: `mem:strategy/promotion_gate`.
- Only `browserQa` is tooling-fixable, and clearing it still leaves two REJECT flags. `sample` can only be cleared by new sealed data.
- **Unverified figures from the originating brief — do not propagate:** "+2.92%, PF 1.4109, 33 trades" and "blocked on full semantics + browser QA, not on performance". `1.4109` appears in no artifact under `QA/**` or `Doc/**` (only as an incidental digit substring inside price/volume fixtures). "0/26 promoted" is now RESOLVED, not missing: it is `promotion.passedCount 0` / `evaluatedCount 26` of the strategy x dataset matrix — see the resolved Phase 0 scope block. There is exactly one holdout engine (`scripts/research/runStructuralProfitabilityStudy.mts`) and no 26-strategy "Profitability Research" engine; stop looking for one.
- Provenance of the brief's numbers, likely but unconfirmed: "+2.92%, PF 1.4109, 33 trades, blocked on full semantics + browser QA, not on performance" near-matches the BTC_4H volatility-squeeze row (+3.2796%, PF 1.429, 32 trades, exactly those two blockers), NOT this news-momentum row. The row identification is verified from the sealed artifact; the exact figures are not on disk, so the mapping stays a hypothesis.

### 2026-08-23 — nearest candidate corrected: BTC_4H `volatility-squeeze-trend-volume-expansion-v1`
Classification: **(b) profitable but blocked on non-performance gates.** The ONLY row of 26 whose failures reduce to the two universal blockers — every performance gate passes, and it needs no new sealed data.
- Holdout: 32 trades (clears the 30 floor), net +3.2796%, PF 1.429, DD 2.2877%. Cost-stress: net +1.7861%, PF 1.2172 (PASS). `riskPolicy` PASS. Fails only `fullStrategySemantics` + `browserQa`.
- `distinctTradeSequence` does not apply: that key is added only for the 5 native-scanner IDs (:245-258), so non-scanner rows carry 8 gate keys and `Object.values(gates).every(Boolean)` never requires it. Two gate-key shapes exist in the artifact (9 keys / 8 keys) — do not assume nine flags on every row.
- Not honestly promotable today either: `browserQa` is a tooling fix, but `fullStrategySemantics` needs timestamp-aligned LIVE_ONLY fusion evidence for all five weighted components, which the committed report's interpretation constraints deny from the available proxies. What changed is the Phase 2 *target*, not the verdict.

### 2026-08-23 — browserQa universal blocker: TOOLING FIXED + VERIFIED, gate now honestly FAILS
Scope: the 26/26 `browserQa` blocker only. Chosen scope was "fix + run gate, leave seal" — the study was **not** re-run, so `holdoutSealSha256` is untouched and all 26 rows still carry `browserQa:false`.
- **Fixed (verified):** `scripts/qa/runOfflinePixelGate.mjs` had two real Windows defects — `spawnSync('python3',…)` against a 0-byte MS Store alias stub (exit 9009), and hardcoded browser version/`archiveSha256` provenance. Both corrected via Serena edits. Result: pixel comparisons went **0/0 → 0/8 actually executed**, all `diffExitCode: 0`.
- **The old blocker was misattributed:** the `blocked_before_test` artifact was hand-authored in a Linux sandbox (proved by `<base href="file:///workspace/scratch/…">` in its sibling `offline-index.html`). Chromium 151.0.7922.34 launches fine on Windows. No CDN download, cert config, or browser install is needed. **Do not re-open this as an environment limitation.**
- **Now a real FAIL, not missing evidence:** 8/8 routes `verdict: review`, edgeF1 0.027–0.056, all captures byte-identical (19,706 B) showing `RouteErrorBoundary`; `TypeError: Cannot read properties of undefined (reading 'status')` in the application shell. Bucket reclassification: browserQa moves **(e) never run → (b) runs and fails on a non-performance defect**.
- **Consequence for the program:** browserQa is no longer the "highest-leverage tooling fix" — that is spent. What remains is a substantive harness-or-app question, and it is **not** a promotion unlock: `fullStrategySemantics` still fails 26/26 and is not honestly fixable, so no row becomes promotable even with a green browserQa. Do not budget a session on browserQa expecting a promotion.
- **Known false PASS — do not cite `runtimeGatePassed` from this runner as runtime evidence.** It reported `true` on a completely unrendered app, and the process exits 0. See `mem:strategy/promotion_gate`.

### 2026-08-24 — "get >=10 strategies promoted" is ARITHMETICALLY IMPOSSIBLE, not merely hard. Measured, do not re-derive.
A brief asked for ">=10 demonstrably profitable strategies clearing `strategyPromotionGate`", with explicit no-fake-data / no-gate-lowering constraints. Those two halves are mutually unsatisfiable. Three measured reasons:
1. **The core universe IS 10.** `CORE_STRATEGY_COUNT = 10` (`strategyRegistry.ts:11`); coreRank 1..10 verified. ">=10 passing" therefore demands a **100% pass rate**, with no 11th candidate — the 4 non-core definitions are `status: 'blocked'`. Any such brief is asking for perfection across the whole library.
2. **`fullStrategySemantics` fails 10/10 strategies by construction.** Measured this session: **every one of the 10 core strategies weights ALL FIVE LIVE_ONLY components with weight > 0** (funding, openInterest, sentiment, news, whaleFlow). Lowest live-only totals ~0.26 (multi-tf-vwap), highest ~0.52 (whale-flow). So `strategyValidationCapability()` (:569-581, filter `weight > 0 && dataMode === 'LIVE_ONLY'`) returns `BASE_REPLAY` for all 10 — never `FULL_STRATEGY`. Only three exits exist and all are barred: flip `dataMode` (= relabelling RSS/fear-greed/top-trader proxies as live model evidence — provenance fraud), zero the live-only weights (= deleting the very components the gate flags, and it guts theses like funding-basis-carry whose `funding` weight is 0.25), or buy timestamp-aligned live history (does not exist: Whale Alert unauthenticated-rejects, bookTicker archive ends 2023 vs a 2024-25 holdout).
3. **Genuine performance is bad, not borderline.** Failure tally over the 26 rows: `fullStrategySemantics` 26, `browserQa` 26, **`costStress` 22**, `return` 18, `profitFactor` 18, `sample` 5, `distinctTradeSequence` 3. Only 8/26 rows are net-positive at all, and of those only **2** survive cost stress. **Exactly ONE (strategy x dataset) pair clears every performance gate: `volatility-squeeze-trend-volume-expansion-v1` on BTC_4H.** One of ten.
**`costStress` (22/26) is the real highest-leverage performance blocker** — most strategies are ~breakeven gross and die on fees/slippage. That is honest engineering work (selectivity, hold time, taker->maker, fewer better trades), unlike the two universal blockers.
**Do not run the edit->rerun-holdout->compare loop such a brief describes.** Repeatedly re-scoring edits against the sealed holdout *is* retuning on it: it manufactures 10 holdout-overfit strategies and burns seal `e656624e…` (still INTACT as of 2026-08-24 — verified `holdout-seal.json.integrity.contentSha256` == `results.holdoutSealSha256`). Robustness work belongs on the **development** window; the holdout stays one-shot.
Also: a single session of Paper Canary / testnet forward-running has **no statistical power** — Phase 4 needs weeks and dozens of trades. Forward validation can be *started* in a session, never *concluded*.

### Phase 0 outstanding — not yet classified
Liquidity Hunter (15-stage shadow-only pipeline, 10 edge types) and Strategy Commander Phase 0-2 (opportunity discovery, parliament shadow, intelligence consensus): shadow-only and unpromoted, with no per-strategy holdout/gate classification recorded yet.

## Cross-references
- Confirmed promotion criteria, the nine gate flags, why the current nearest candidate is not promotable, and the honestly-labelled data gaps: `mem:strategy/promotion_gate`
- Canonical verify/release pipeline that this research chain is deliberately NOT part of: `mem:task_completion`
- Windows-only execution, tool division, prohibitions, Serena usage rules: `mem:execution_environment`
- Gate-mechanics traps to rule out before blaming a strategy: `mem:gate_hazards`
- Project invariants and top-level source map: `mem:core`
