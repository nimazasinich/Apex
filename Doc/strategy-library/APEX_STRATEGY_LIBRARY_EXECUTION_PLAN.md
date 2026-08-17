# APEX Composite Strategy Library — Executable Implementation Plan (v1)

**Status:** Ready for implementation
**Coordinates with:** `apex-unified-terminal` (the project delivered as `APEX_MARKETS_V2_FULL_PROJECT.zip`)
**Input document:** `APEX_COMPOSITE_CRYPTO_STRATEGY_LIBRARY_DEEP_RESEARCH.docx` (research edition, Aug 2026)
**This document's job:** turn that research into a numbered backlog that references real files, real types, and real endpoints already in the codebase, so it can be handed to Cursor (or worked through manually) one task at a time.

---

## 0. What changed from the research doc to this plan

The research document is excellent at *what* to build and *why each strategy earns its place*. It intentionally stayed silent on *how it plugs into APEX's actual code*, because it was written without direct codebase access. This plan closes that gap. Three things were discovered while grounding the doc against the real project that change the build order:

1. **APEX already has a working backtest engine — it just runs one hardcoded model.** `runApexReplayBacktestDirectional()` in `src/services/backtesting.ts`, called from `GET /api/market/backtest` in `src/services/apexNextMarketRoutes.ts`, replays real KuCoin candles against the live scanner's own composite score (`ScannerConfig` + `ScoringWeights`). It is not a toy — it already fetches real history, simulates entries/exits/stops/targets, and returns win rate, R-multiple, drawdown, and an equity curve. `BacktestResult` even already has an unused `strategy?: string` field, as if this was anticipated and never finished.
2. **The existing `ScoringWeights` shape (`obi`, `qStruct`, `volume`, `funding`, `openInterest`, `atr`, `microstructure`, `liquidity`, `smc`) already covers most of the "combined components" the research doc lists for the Wave‑1 strategies** (order-flow, structure, funding, volatility, liquidity). This means several Wave‑1 strategies do **not** need a new execution engine — they need a new *weight/threshold preset* over the engine that already exists. That is a materially smaller and safer first deliverable than "build a Strategy Registry from scratch," and it is where implementation should start.
3. **There is currently no strategy selector anywhere in the UI or API.** `BacktestingPage.tsx`'s `RunConfig` has no `strategyId` field, and the nav (`WorkspaceShell.tsx`) has no "Strategies" entry. This part of the research doc's Section 7 architecture is accurate and still has to be built from zero.

Everything below is organized around these three facts.

---

## 1. Fresh research addendum (verified this session, English sources, Aug 2026)

The research doc's 45 references were treated as still valid; the search below was to stress-test them against the most current public material and to specifically hunt for the "combined strategies traders/forums report short-term success with" angle the deep-research doc flagged as Tier D (anecdotal). Findings:

- **The 70–80% win-rate claims attached to ICT liquidity-sweep/FVG setups are still coming exclusively from vendor blogs and indicator-seller content** (LuxAlgo, TradeZella, ChartingLens, prop-firm education sites), not from independent or academic sources. One of those same 2026 guides explicitly warns readers to "be skeptical of anyone claiming 80%+" on opening-range breakouts, because such numbers usually ignore slippage — which is the research doc's own caution, now echoed by the vendor ecosystem itself. This does not upgrade Liquidity Sweep/FVG's evidence tier; it confirms it should stay Wave 2 / Experimental until APEX's own deterministic rules are tested.
- **A concrete, non-anecdotal reference point for breakout systems on crypto**: a 2026 ETH/USDT 4H Bollinger-breakout backtest (Nov 2025–May 2026, 21 trades) posted a 33% win rate but a ~4.9 payoff ratio (average winner ~5x average loser), for a 6-month net return in the ~95% range before the largest fakeout-driven losing streak (4 in a row) was priced in. This is a useful sanity-check magnitude for what the *Volatility Squeeze* and *ORB-VWAP* strategies should plausibly produce once implemented with realistic costs — not a target, but a "does our number look insane" check.
- **Realistic ORB win-rate expectation is 40–60%, not 70%+**, per multiple independent 2026 day-trading education sources; profitability comes from reward-to-risk on trend days, not hit rate. This should be encoded directly as a stated expectation on the APEX strategy card for ORB-VWAP so the ranking system isn't the only thing catching an inflated claim later.
- **Funding-basis carry has fresher 2026 numbers to calibrate against**: baseline single-exchange funding annualizes to roughly 11% (CoinGlass-sourced), typical delta-neutral funding-arb guides cite an 8–30% annualized range depending on venue and leverage, and one filtered cross-venue delta-neutral basket reported ~12.7% annualized with a 0.28% max drawdown over a 181-day window in H1 2026. These are useful as the "does the opportunity even clear costs" sanity bound for the Funding-Basis Carry strategy's `Opportunity` gate, not as a promise.
- **Regime detection has real, recent (2024–2026) academic support specific to Bitcoin**: Hidden Markov Model regime-switching research on BTC/ETH published in this window reports the HMM approach separating bull/bear/neutral phases more reliably than linear models, and a separate ensemble-HMM study on equities reports drawdowns cut by more than half in turbulent regimes versus a static approach. This strengthens (does not just repeat) the research doc's Adaptive Trend Portfolio regime layer and the later AI Ensemble's router — HMM-style regime classification, not just a fixed ADX/volatility threshold, is now the better-evidenced default for that layer.
- **NostalgiaForInfinity is still actively evolving** (X7 branch, 2.9k stars as of Feb 2026, new "signal protections" and a "derisking system" added in the same window), reinforcing the research doc's own warning: a rule set that changes every few weeks cannot be treated as a stable benchmark, and APEX should keep mining it for modular ideas only, on a snapshot-and-freeze basis, never as a live comparison target.
- **No new source was found that publishes an exact profitable live signal from a serious AI-first or prop trading operation.** This matches the original doc's "deep-search conclusion" exactly and closes that avenue — nothing changes in Section 12 of the original doc.

**Net effect on the shortlist:** no strategy changes evidence tier or priority wave based on this pass. The addendum's value is calibration numbers (used in Section 7 and Section 9 below) and one methodology upgrade (HMM-style regime detection over a fixed threshold).

---

## 2. Ground truth: what the current codebase already has

Read this before writing any code — it prevents re-building things that exist.

| Concern | Already exists at | Notes |
|---|---|---|
| Real KuCoin candle fetch for backtests | `fetchHistoricalCandlesForBacktest()` in `src/services/apexNextMarketRoutes.ts` | Used by the `/api/market/backtest` route; returns `{ candles, source, dataState }`. Reuse as-is. |
| Deterministic replay/backtest engine | `runApexReplayBacktestDirectional()`, `runApexReplayBacktest()`, `runApexProductionInputReplay()` in `src/services/backtesting.ts` | Wraps `runCanonicalReplay()`. Takes candles + `ScannerConfig` + direction + `maxBars`, returns `{ trades[], equityCurve[], summary }`. This is the harness every Wave‑1 strategy should target. |
| Composite scoring weights | `ScoringWeights` in `src/types.ts` (`obi`, `qStruct`, `volume`, `funding`, `openInterest`, `atr`, `microstructure`, `liquidity`, `smc`) | This is the existing "multi-alpha blend." Wave‑1 strategy presets are built by changing these weights + the threshold fields on `ScannerConfig`, not by writing a new scorer. |
| Threshold/gating config | `ScannerConfig` in `src/types.ts` (`obiThreshold`, `volumeThreshold`, `qStructThreshold`, `fundingThreshold`, `oiExpansionThresholdPct`, `atrExpansionThreshold`, `maxSqueezeRisk`, `minEvidenceAgreement`, `minSmartMoneyScore`, `smcHardRejectThreshold`, `scorePreset`, `directionBias`, `minVolume24hUsd`, …) | `scorePreset: 'ATLAS_PROPOSAL' \| 'ATLAS_PLUS_V2' \| 'CUSTOM'` already anticipates named presets — this is the exact mechanism to extend for named strategies. |
| Backtest REST endpoint | `GET /api/market/backtest` in `src/services/apexNextMarketRoutes.ts` (~line 688) | Query: `symbol`, `direction`, `interval`, `bars`, `maxBars`. No `strategy` param yet, despite `BacktestResult.strategy?: string` existing in the response type and going unset today. |
| Backtest result shape | `BacktestResult` in `src/types.ts` | Already has `timeline[]`, `equityCurve[]`, `historicalWinRatePct`, `avgRMultipleRealized`, `totalPnlPct`, `maxDrawdownPct`, `profitFactor`, `rejectionCounts`, `effectiveScoreWeights`, `configOverrides`. This is already close to the research doc's "Required backtest inputs/outputs" — extend it, don't replace it. |
| Backtest UI | `src/pages/backtesting/BacktestingPage.tsx` (`RunConfig`, `runBacktest()`, chart + trade table + diagnostics tabs) | No strategy selector. `RunConfig` needs one new field; `runBacktest()` needs one new query param. Everything else (charts, cost-adjusted trade math, diagnostics tabs) is reusable unchanged. |
| Live candidate scoring (long/short) | `CandidateScore` in `src/types.ts`, produced by the scanner and already flowing into `MarketsPage.tsx` (Live Setups panel), `GeneralViews.tsx` (Analytics), and `ReferenceWatchlistView` | This is the *live* counterpart of the composite scanner strategy — useful context, not something to duplicate. |
| App-level navigation | `WorkspacePage` union type + `navItems[]` in `src/components/workspace/WorkspaceShell.tsx`; `WORKSPACE_PAGES` set + `switch` in `src/App.tsx` | Adding a page is a 3-file change: add to the union type, add a `navItems` entry, add a `case` in the `App.tsx` switch. Same pattern used for every existing page. |

**Conclusion:** APEX does not need a new backtesting engine for Wave 1. It needs (a) a strategy registry that maps a `strategyId` to either a `ScannerConfig`/`ScoringWeights` preset (cheap) or a small bespoke replay function (for strategies whose logic doesn't fit the existing scorer), (b) one new query param end to end, and (c) a new page. Wave 2–4 strategies genuinely need new engines, as the research doc already said — that part of its judgment is confirmed by this codebase read, not changed.

---

## 3. Architecture

### 3.1 Decision (confirmed, unchanged from the research doc)

Do not restructure `apex-unified-terminal`. Add a **Strategies** tab next to **Backtesting**, and connect it to the existing backtest engine through a strategy adapter layer. Strategy definitions, versions, and validation/ranking history are stored separately from the general app config.

### 3.2 New files

```
src/
  types.ts                                  # extend: add StrategyDefinition, StrategyRunResult,
                                             #         StrategyValidationReport, StrategyRankScore types
  services/
    strategyRegistry.ts                     # NEW — the 12 StrategyDefinition entries + lookups
    strategyEngine/
      replayHarness.ts                      # NEW — thin shared contract both engine kinds return
      scannerPresetAdapter.ts               # NEW — Wave-1 "preset over existing engine" adapter
      orbVwapBreakout.ts                    # NEW — Wave-1 bespoke engine (3.4)
      volatilitySqueezeExpansion.ts         # NEW — Wave-1 bespoke engine (3.5)
      vwapPullbackReacceleration.ts         # NEW — Wave-1 bespoke engine (3.6)
      adaptiveTrendPortfolio.ts             # NEW — Wave-1 bespoke engine (3.2), needs multi-symbol input
      liquiditySweepFvgReversal.ts          # NEW — Wave-2 bespoke engine (3.7)
      dynamicCointegrationBasket.ts         # NEW — Wave-2 bespoke engine (3.8), needs multi-symbol input
    strategyValidation.ts                   # NEW — walk-forward split, holdout, stability, cost-stress runner
    strategyRanking.ts                      # NEW — Section 9 scoring formula, conditional grouping
    apexNextMarketRoutes.ts                 # EXTEND — add `strategy` query param, add 2 new routes
  pages/
    strategies/
      StrategiesPage.tsx                    # NEW — library browser (cards, filters)
      StrategiesPage.css
      StrategyDetailPage.tsx                # NEW — plain-language logic, config form, Run Backtest button
      StrategyDetailPage.css
    backtesting/
      BacktestingPage.tsx                   # EXTEND — add strategyId to RunConfig + selector control
  components/
    workspace/
      WorkspaceShell.tsx                    # EXTEND — add 'strategies' to WorkspacePage union + navItems
  App.tsx                                    # EXTEND — add 'strategies' to WORKSPACE_PAGES + switch case
```

### 3.3 The adapter contract every strategy engine returns

This is the shape `runApexReplayBacktestDirectional()` already effectively produces — formalize it so both "preset" and "bespoke" strategies are interchangeable to the route handler:

```ts
// src/services/strategyEngine/replayHarness.ts
export interface StrategyReplayTrade {
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  outcome: 'TP' | 'SL' | 'TIMEOUT';
  pnlPct: number;
  barsHeld: number;
  rawScore?: number;
  confidence?: number;
  entryReason: string;
}

export interface StrategyReplaySummary {
  candles: number;
  trades: number;
  winRate: number;
  avgPnlPct: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  acceptedCandidates?: number;
  rejectedCandidates?: number;
  rejectionCounts?: Record<string, number>;
}

export interface StrategyReplayResult {
  trades: StrategyReplayTrade[];
  equityCurve: number[];
  summary: StrategyReplaySummary;
}

export interface StrategyRunContext {
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT' | 'BOTH';
  maxBars: number;
  candles: BacktestCandle[];        // from ../backtesting
  universeCandles?: Record<string, BacktestCandle[]>; // only for multi-symbol strategies (3.2, 3.8)
}

export type StrategyRunFn = (ctx: StrategyRunContext) => StrategyReplayResult;
```

`runApexReplayBacktestDirectional()`'s existing return value already matches `StrategyReplayResult` almost field-for-field — the scanner-preset adapter is a ~20-line wrapper, not a rewrite.

### 3.4 Strategy registry entry shape

Matches the research doc's Section 7 "Suggested strategy object" almost exactly; the only addition is `engine`, which is the piece the research doc correctly left unspecified because it required codebase access:

```ts
// src/types.ts — append
export type StrategyEvidenceTier = 'A' | 'B' | 'C' | 'D' | 'E';
export type StrategyWave = 'wave1-mvp' | 'wave2-formalized' | 'wave3-microstructure' | 'wave4-ai-research';
export type StrategyEngineKind = 'scanner-preset' | 'bespoke';

export interface StrategyDefinition {
  strategyId: string;              // stable slug, e.g. 'crypto-multi-alpha-ls-v1'
  version: number;
  name: string;
  summary: string;                 // one-sentence thesis
  evidenceTier: StrategyEvidenceTier[];
  wave: StrategyWave;
  status: 'candidate' | 'validated' | 'deprecated';
  longShort: 'LONG' | 'SHORT' | 'BOTH';
  supportedIntervals: BacktestInterval[];
  dataRequirements: string[];      // human-readable, shown on the strategy card
  engine: StrategyEngineKind;
  // for engine: 'scanner-preset'
  scoreWeights?: Partial<ScoringWeights>;
  scannerConfigOverrides?: Partial<ScannerConfig>;
  // for engine: 'bespoke'
  runFn?: string;                  // key into a server-side function map (not serialized to client)
  regimeRules: string[];
  setupRules: string[];
  triggerRules: string[];
  riskRules: string[];
  exitRules: string[];
  noTradeRules: string[];
  parameters: Array<{ key: string; label: string; default: number | string; min?: number; max?: number; reason: string }>;
  sourceReferences: string[];      // R-codes from Section 12 of this document
  knownFailureModes: string[];
}
```

---

## 4. Backend routing changes

### 4.1 Extend the existing route (non-breaking)

`src/services/apexNextMarketRoutes.ts`, `GET /api/market/backtest`:

- Add `strategy` query param, default `'apex-composite-scanner-v1'` (this **is** today's behavior — zero regression for the existing Backtesting page while the Strategies tab doesn't exist yet).
- Look up the `StrategyDefinition` from `strategyRegistry.ts`.
- If `engine === 'scanner-preset'`: build `ScannerConfig` as `{ ...activeScannerConfig(), ...def.scannerConfigOverrides, scoreWeights: { ...activeScannerConfig().scoreWeights, ...def.scoreWeights }, scorePreset: 'CUSTOM' }`, then call `runApexReplayBacktestDirectional()` exactly as today.
- If `engine === 'bespoke'`: dispatch to the matching function in `strategyEngine/*.ts` via a small `Record<string, StrategyRunFn>` map, passing the same `StrategyRunContext`.
- Add `strategy: def.strategyId` and `strategyVersion: def.version` into the JSON response (the field already exists on `BacktestResult`, just unset — start setting it).

### 4.2 Two new routes

```
GET  /api/strategies                 → StrategyDefinition[] (client-safe subset, no runFn key)
GET  /api/strategies/:strategyId     → single StrategyDefinition + latest StrategyRankScore if one exists
POST /api/strategies/:strategyId/validate
                                      → runs the Section 9 validation sequence, returns StrategyValidationReport
                                      → manual trigger only, matches "No automatic execution" rule below
```

### 4.3 Explicit non-negotiable from the research doc, now as an implementation rule

> A backtest or validation run starts **only** when the user presses **Run Backtest** or **Run Validation**. Changing strategy, symbol, timeframe, or a parameter must visually mark the last result stale (`lastRunConfigKey !== runConfigKey(currentConfig)` — this pattern **already exists** in `BacktestingPage.tsx`; reuse it verbatim for the Strategies page).

---

## 5. Strategy library v1 — implementation-ready spec

Condensed from the research doc's Section 3, with the engine assignment from Section 3.3 above and the Aug‑2026 calibration numbers from Section 1 where relevant. Full rule prose, failure modes, and research citations stay in the original `.docx` — link to it from each strategy's detail page rather than duplicating the essay text in code comments.

| # | Strategy | Wave | Engine | Key `ScoreWeights`/params to set | Realistic first-pass expectation |
|---|---|---|---|---|---|
| 3.1 | Crypto Multi-Alpha Long/Short Stack | 1 | `scanner-preset` | Raise `funding` + `obi` + `qStruct`, keep `atr` moderate; `scorePreset: 'CUSTOM'` | Highest-confidence blueprint; benchmark against the existing live scanner's own historical numbers first, since they share a scorer family. |
| 3.2 | Adaptive Long/Short Trend Portfolio | 1 | `bespoke` (multi-symbol) | Rolling-Sharpe asset selection is **not** in `ScoringWeights` — needs its own selection pass over `universeCandles` | Needs a symbol universe, not a single-symbol replay — biggest Wave‑1 scope item. |
| 3.3 | Funding-Basis Carry w/ Directional & Liquidity Filters | 1 | `scanner-preset` (opportunity gate) + small bespoke `Opportunity` pre-filter | Dominant weight on `funding`; `fundingThreshold` raised; add a hard filter: expected funding − (fee+spread+slippage) > 0 | Use the 8–30% annualized / ~11% baseline range from Section 1 as the "does this even clear costs" sanity check on the `Opportunity` gate. |
| 3.4 | Opening-Range VWAP Relative-Volume Breakout | 1 | `bespoke` | Session window, RVOL threshold, ATR expansion threshold, VWAP slope | Target 40–60% win rate per Section 1, not higher — encode this as the card's stated expectation. |
| 3.5 | Volatility Squeeze Trend-Volume Expansion | 1 | `bespoke` | Bollinger-width percentile, Keltner envelope, HTF trend filter, volume expansion threshold | Use the ~33% win rate / ~4.9 payoff-ratio ETH breakout reference from Section 1 as the sanity-check magnitude, not a target. |
| 3.6 | Multi-Timeframe VWAP Pullback Reacceleration | 1 | `bespoke` | HTF VWAP bias, EMA stack, ADX/chop filter, reacceleration trigger | Most latency/spread-sensitive Wave‑1 strategy — flag 1‑minute results as indicative only until real fee/slippage stress passes. |
| 3.7 | Liquidity Sweep, Structure Shift, Imbalance Reversal | 2 | `bespoke` | Deterministic swing/displacement/FVG definitions — this is the hardest part, see note below | Ship labeled **Experimental**. Section 1 confirms the only public win-rate claims (70–80%) come from vendor marketing, not evidence — do not surface those numbers anywhere in APEX's own UI. |
| 3.8 | Dynamic Cointegration Basket w/ Execution Filters | 2 | `bespoke` (multi-symbol) | Rolling cointegration test, OU half-life, z-score threshold, bid/ask execution model | Needs Level-1 bid/ask, not just candles — confirm data availability before starting. |
| 3.9 | L2 Order-Flow Liquidity-State Scalper | 3 | `bespoke` | Requires full L2 book + trade prints | Blocked until APEX has an L2 data source. Do not attempt with candle proxies. |
| 3.10 | Cross-Exchange Market Making w/ Instant Hedge | 3 | `bespoke` | Requires two live exchange connections + inventory manager | Operational project, not a backtest-only strategy — needs its own execution-safety review before Wave 3 starts. |
| 3.11 | Funding-Aware Avellaneda Market Maker | 3 | `bespoke` | Requires production-grade order-book/fill simulation | Do not start before 3.9/3.10 infrastructure exists. |
| 3.12 | Regime-Routed AI Ensemble w/ Alternative Data | 4 | `bespoke` (router + agent pool) | HMM-style regime classifier (see Section 1 addendum) feeding a pool of Wave‑1/2 engines as candidate agents | Router selects among *already-validated* strategies from this same registry — the ensemble is built on top of Wave 1–2, not from scratch. |

**Rule inherited unchanged from the research doc:** every strategy above still needs an explicit no-trade state, explicit long/short logic where the instrument allows it, bounded parameter ranges with a stated reason per parameter, and out-of-sample testing before its `status` can move from `candidate` to `validated`. The `StrategyDefinition.parameters[].reason` field in Section 3.4 exists specifically to enforce "a reason for every parameter" at the type level.

### Note on 3.7 (Liquidity Sweep / FVG)

This is the strategy most likely to be rewritten after first contact with real code. "Liquidity pool," "displacement," and "fair value gap" need exact, versioned numeric definitions before a single line of detection code is written (e.g., FVG = a 3-candle gap of size ≥ `k × ATR(n)`; sweep = wick beyond a prior swing by ≥ `m × ATR(n)` with close back inside within `j` bars). Write those definitions as a short internal spec and get sign-off before implementation — this is exactly the step the research doc warns is usually skipped, which is why forum win-rate claims for this family are unreliable in the first place.

---

## 6. Validation & ranking — mapped to existing fields

The research doc's Section 5 (validation sequence, minimum pass gates) and Section 6 (ranking weights) are implementation-ready as written; this section only maps them onto `BacktestResult`/`StrategyReplaySummary` fields that already exist, so `strategyValidation.ts` and `strategyRanking.ts` aren't guessing at a schema.

### 6.1 `StrategyValidationReport` (new type, `src/types.ts`)

```ts
export interface StrategyValidationReport {
  strategyId: string;
  strategyVersion: number;
  runAt: number;
  windows: Array<{ label: string; from: number; to: number; result: BacktestResult }>; // walk-forward slices
  holdout: { from: number; to: number; result: BacktestResult };                       // untouched final window
  stability: { neighborRuns: Array<{ paramDelta: Record<string, number>; totalPnlPct: number }>; passed: boolean };
  costStress: { feeMultiplier: number; slippageMultiplier: number; result: BacktestResult; passed: boolean };
  gates: {
    data: boolean; sample: boolean; outOfSample: boolean; drawdown: boolean;
    stability: boolean; costResilience: boolean; regime: boolean; reproducibility: boolean;
  };
  passedAllGates: boolean;
}
```

Every field on the right of `gates` maps directly to the research doc's Section 5 "Minimum pass gates" table — implement each gate as a pure function taking one or more `BacktestResult`s, e.g. `gateDrawdown(holdoutResult, riskProfileLimit)`.

### 6.2 `StrategyRankScore` (new type)

```ts
export interface StrategyRankScore {
  strategyId: string;
  strategyVersion: number;
  comparableGroup: { symbolGroup: string; timeframe: string; regime: string }; // never a single universal leaderboard
  components: {
    outOfSampleReturn: number;   // weight 0.18
    drawdownTailLoss: number;    // weight 0.14
    walkForwardConsistency: number; // weight 0.14
    profitFactorQuality: number; // weight 0.10
    sortinoQuality: number;      // weight 0.08
    parameterStability: number;  // weight 0.10
    costLatencyResilience: number; // weight 0.08
    regimeCoverage: number;      // weight 0.06
    sampleAdequacy: number;      // weight 0.06
    diversificationValue: number; // weight 0.06
  };
  penalties: string[];          // reason codes from Section 6.2 of the research doc
  score: number;                // weighted sum after penalties, 0-100
}
```

`comparableGroup` is what stops APEX from ever showing "one universal leaderboard" — enforce it by making `strategyRanking.ts`'s public function signature `rankStrategies(group: ComparableGroup): StrategyRankScore[]`, with no ungrouped variant exposed at all.

---

## 7. Frontend changes

### 7.1 Navigation (3-file change, same pattern as every existing page)

1. `src/components/workspace/WorkspaceShell.tsx` — add `'strategies'` to the `WorkspacePage` union and one `navItems` entry (icon suggestion: `Layers3`, already imported elsewhere in the codebase for a similar "stacked/composite" meaning), placed immediately before `'backtesting'` so the flow reads Strategies → Backtesting.
2. `src/App.tsx` — add `'strategies'` to `WORKSPACE_PAGES` and one `case 'strategies': content = <StrategiesPage {...marketProps} />; break;` alongside the existing `case 'backtesting'`.
3. `src/pages/strategies/StrategiesPage.tsx` — new page, `marketProps`-compatible signature like `MarketsPage`/`ReferenceWatchlistView`.

### 7.2 `StrategiesPage.tsx` — library browser

Per the research doc's Section 7 user flow and strategy-card field list, built from the `StrategyDefinition[]` returned by `GET /api/strategies`:

- Filter row: regime, horizon, long/short, evidence tier, wave, data requirement — client-side filter over the already-fetched list (small dataset, no need for server-side filtering).
- Card fields: name + one-sentence thesis, composite component count/categories, Long/Short/Both, evidence tier badge, wave badge, latest conditional score (if a `StrategyRankScore` exists for a default comparable group), last backtest date, "Open Strategy" and "Run Backtest" actions.
- No leaderboard sort by default — sort by wave, then name, until the user picks a specific comparable group.

### 7.3 `StrategyDetailPage.tsx`

- Plain-language rendering of `regimeRules[]` / `setupRules[]` / `triggerRules[]` / `riskRules[]` / `exitRules[]` / `noTradeRules[]` as a readable rule list (reuse the `apex-candidate-row`/`apex-panel` visual language already used on Markets/Analytics — no new design system needed).
- Config form: symbol/universe, timeframe, period, risk profile, Auto/Guided/Advanced — Guided pre-fills `parameters[].default` with the stated reason shown as help text; Advanced unlocks the bounded min/max range.
- "Run Backtest" button posts to the same `runBacktest()` pattern as `BacktestingPage.tsx`, with `strategy: strategyId` added to the query string.
- Results panel reuses `BacktestingPage.tsx`'s chart/trade-table/diagnostics components directly (extract them into shared components under `src/components/backtest/` in the same pass, since both pages need identical rendering — do this extraction *before* building `StrategyDetailPage.tsx`, not after, to avoid duplicating ~400 lines).

### 7.4 `BacktestingPage.tsx` changes

- `RunConfig` gains `strategyId: string`, default `'apex-composite-scanner-v1'`.
- One new control: a strategy selector (defaults to the current scanner, so existing users see no behavior change until they pick something else).
- `runConfigKey()` already serializes the whole `RunConfig` object — adding the field automatically makes strategy changes trigger the existing "stale result" marking with zero extra code.

---

## 8. Phased delivery plan

Waves match the research doc's Section 4 exactly; each wave is broken into file-level tasks here so it can be worked as a checklist.

### Wave 1 — deterministic MVP (target: ship first)

**1a. Plumbing (no new strategies yet — proves the pipe works)**
- [ ] Add `StrategyDefinition`, `StrategyReplayResult`, `StrategyValidationReport`, `StrategyRankScore` types to `src/types.ts`.
- [ ] Create `src/services/strategyEngine/replayHarness.ts` with the contract from Section 3.3.
- [ ] Create `src/services/strategyRegistry.ts` with exactly **one** entry: `apex-composite-scanner-v1`, `engine: 'scanner-preset'`, `scoreWeights: {}` (i.e. today's behavior, unchanged) — this is the regression guard.
- [ ] Extend `GET /api/market/backtest` with the `strategy` param + registry lookup + response `strategy`/`strategyVersion` fields, defaulting to the single existing entry.
- [ ] Add `GET /api/strategies` and `GET /api/strategies/:strategyId` (both return the one entry).
- [ ] Verify: existing `BacktestingPage.tsx` behavior is byte-for-byte identical with no UI changes yet. This is the checkpoint before touching any UI.

**1b. First two scanner-preset strategies (cheapest possible real strategies)**
- [ ] Add `crypto-multi-alpha-ls-v1` (3.1) and `funding-basis-carry-v1` (3.3) as `scanner-preset` entries with the weight overrides from Section 5.
- [ ] Extract shared backtest chart/table/diagnostics components from `BacktestingPage.tsx` into `src/components/backtest/`.
- [ ] Build `StrategiesPage.tsx` + nav wiring (Section 7.1–7.2).
- [ ] Build `StrategyDetailPage.tsx` (Section 7.3), wired to the two live strategies.
- [ ] Add `strategyId` selector to `BacktestingPage.tsx` (Section 7.4).
- [ ] Manual QA: run both strategies against 2–3 symbols, confirm distinct trade sets from the default scanner preset (if the numbers are identical, the weight overrides aren't taking effect — check `scorePreset: 'CUSTOM'` is actually being set).

**1c. Bespoke Wave‑1 engines (new logic, in priority order)**
- [ ] `orbVwapBreakout.ts` (3.4) — smallest bespoke engine, good first bespoke build.
- [ ] `volatilitySqueezeExpansion.ts` (3.5)
- [ ] `vwapPullbackReacceleration.ts` (3.6)
- [ ] `adaptiveTrendPortfolio.ts` (3.2) — do last in Wave 1; it's the only one needing a multi-symbol `universeCandles` input, which requires extending `fetchHistoricalCandlesForBacktest()` to accept a symbol list. Build the single-symbol engines first so the multi-symbol data-fetch extension only has to happen once, informed by real usage.
- [ ] Register all four in `strategyRegistry.ts`.

**1d. Validation & ranking (do after 1c, once there's more than one bespoke strategy to compare)**
- [ ] `src/services/strategyValidation.ts` — implement the 11-step sequence from the research doc's Section 5 as composable functions; wire `POST /api/strategies/:strategyId/validate`.
- [ ] `src/services/strategyRanking.ts` — implement Section 6's weighted score + automatic penalties; expose read-only via `GET /api/strategies/:strategyId`.
- [ ] Add the validation/ranking summary to `StrategyDetailPage.tsx` (gate pass/fail badges, score breakdown).
- [ ] Set `status: 'validated'` only when `passedAllGates === true` — never manually.

**Wave 1 exit criterion:** six strategies registered (3.1–3.6), each with at least one completed validation report, each explorable and runnable from `StrategiesPage.tsx` end to end, `BacktestingPage.tsx` unaffected for users who never touch the new selector.

### Wave 2 — formalized discretionary / relative value

- [ ] Write and get sign-off on the exact numeric definitions for sweep/displacement/FVG (see Section 5 note on 3.7) before writing `liquiditySweepFvgReversal.ts`.
- [ ] Build `liquiditySweepFvgReversal.ts`, ship with `status: 'candidate'` and an explicit "Experimental — public evidence for this family is anecdotal" banner on its detail page (data from Section 1's addendum backs this framing).
- [ ] Confirm bid/ask (not just candle) data availability before starting `dynamicCointegrationBasket.ts`; if unavailable, this strategy stays specified-but-unbuilt and the registry entry is marked `status: 'candidate'` with a blocking note rather than skipped silently.

### Wave 3 — microstructure

- [ ] Infrastructure prerequisite check (L2 book source, second exchange connection, fill/latency simulation) — none of 3.9/3.10/3.11 should be started until this is confirmed, per the research doc's own "do not fake with candle proxies" rule.

### Wave 4 — AI research

- [ ] Only start once at least 4–5 Wave‑1/2 strategies are `status: 'validated'`, since 3.12's router is explicitly designed to select among already-validated strategies from this same registry, not to be trained standalone.
- [ ] Regime classifier: implement as HMM-based per the Section 1 addendum, not a fixed ADX/volatility threshold.

---

## 9. Acceptance checklist (per strategy, before `status: 'validated'`)

Directly enforces the research doc's Section 5 gates and Final Research Decisions:

- [ ] Deterministic rules exist as versioned code + a written rule spec (`regimeRules`…`noTradeRules` populated, not empty arrays).
- [ ] Backtested with realistic fees/spread/slippage/funding (`configOverrides` on `BacktestResult` shows the assumptions actually used, not defaults silently substituted).
- [ ] Walk-forward + untouched final holdout both present in the `StrategyValidationReport`.
- [ ] Parameter-neighborhood stability check passed.
- [ ] Cost-stress run passed at worse-than-base fee/slippage.
- [ ] Performance segmented by at least bull/bear/range regime.
- [ ] Feature ablation run for every "combined component" claimed in Section 5 of this document — if removing a component doesn't measurably hurt the score, either drop the component or document why it's kept anyway.
- [ ] Number of tried variants recorded (not just the winning parameter set).
- [ ] Reproducible: same version + same data + same assumptions → same numbers, checked once.
- [ ] Strategy card never displays a win rate or return figure without the matching drawdown and cost-resilience figures next to it — this is a UI rule, not just a data rule, and directly follows from the research doc's "Do not promise" decision and this document's Section 1 finding that inflated win-rate claims are the industry's most common failure mode.

---

## 10. Risk, cost, and guardrails (carried forward, unchanged in substance)

- No automatic order execution in v1. A validated strategy can be selected as *context* on the Trading page; it does not place orders.
- AI (Wave 4) may route, forecast, or tune parameters within the bounds `strategyRegistry.ts` defines — it can never override `riskRules[]` or `noTradeRules[]`, which remain deterministic and outside model control.
- Every figure surfaced in the product — win rate, return, "successful strategy" language — must be APEX's own out-of-sample result, never a reproduced third-party claim (including the anecdotal forum/vendor numbers surfaced during this session's research, none of which should appear in-product).
- Short positions, funding-based strategies, and cross-exchange strategies each carry the specific failure modes already listed per-strategy in the research doc's Section 3 — copy those `knownFailureModes[]` verbatim into each `StrategyDefinition` rather than re-deriving them, since they were already vetted.

---

## 11. References

**From the original research document** (see the source `.docx` for full citation list `[R1]`–`[R45]`): Robot Wealth crypto-alpha series, BIS crypto-carry research, perpetual-futures pricing papers, order-flow and L2 liquidity-state research, EarnHFT, opening-range/squeeze/VWAP-pullback community sources, XTX/Wintermute/GSR public material, Robert Carver, Ernest Chan, Hummingbot documentation, NostalgiaForInfinity, AdaptiveTrend research, dynamic-cointegration pairs-trading research, walk-forward and backtest-overfitting literature, Quantpedia crypto research, Man AHL trend research.

**Added this session (Aug 2026 addendum, Section 1):**
- ChartingLens — Opening Range Breakout Strategy: The Complete 2026 Day Trading Guide (40–60% realistic ORB win-rate framing; skepticism toward 80%+ claims). `chartinglens.com/blog/opening-range-breakout-strategy`
- Coinquant — Breakout Trading Strategy: Does It Work on Crypto? (Backtested) (ETH/USDT 4H breakout, Nov 2025–May 2026, concrete win-rate/payoff-ratio reference point). `coinquant.ai/blog/breakout-trading-strategy-does-it-work-on-crypto-backtested`
- Alphaex Capital — Funding Rate Arbitrage Basics, 2026 Strategy Guide (baseline ~11% annualized funding, CoinGlass-sourced). `alphaexcapital.com/.../funding-rate-arbitrage-basics`
- 1Token — TradFi Perpetual Arbitrage (filtered delta-neutral basket, ~12.7% annualized, 0.28% max drawdown, H1 2026). `blog.1token.tech/tradfi-perpetual-arbitrage`
- Academia.edu — Markov and Hidden Markov Models for Regime Detection in Cryptocurrency Markets: Evidence from Bitcoin (2024–2026) (HMM regime-switching framework for BTC/ETH). `academia.edu/165182244`
- PickMyTrade — Regime Detection: Measuring Market Regime Shifts, 2026 Guide (ensemble-HMM drawdown reduction reference). `blog.pickmytrade.trade/regime-detection-measuring-market-regime-shifts-2026`
- Alexbobes — Freqtrade & NostalgiaForInfinity: Setup Guide 2026 (X7 branch status, "signal protections," "derisking system," Feb 2026 snapshot). `alexbobes.com/crypto/automated-crypto-trading-with-freqtrade-and-nostalgiaforinfinity`
- LuxAlgo / TradeZella / ChartingLens ICT guides (2025–2026) — cited only as evidence that liquidity-sweep/FVG win-rate claims remain vendor-sourced, not as strategy evidence. `luxalgo.com`, `tradezella.com`, `chartinglens.com`

---

*This plan is product and engineering planning material, not investment advice. No strategy in this library may be marketed as profitable or validated until it independently passes the gates in Section 9 inside APEX's own execution environment.*
