# Validation scope split — BASE_REPLAY vs FULL_STRATEGY (2026-08-24)

## Why this exists
The ">=10 profitable strategies" goal is **arithmetically unreachable** by any honest route (see
`mem:strategy/profitability_roadmap` for the full derivation). `CORE_STRATEGY_COUNT = 10` in
`src/services/strategyRegistry.ts`, and the 4 non-core definitions are `status: 'blocked'`, so ">=10 promoted"
demands a 100% pass rate with zero spare candidates.

## The structural blocker (measured, not inferred)
`strategyValidationCapability()` (strategyRegistry.ts:569-581) filters fusion components for
`weight > 0 && dataMode === 'LIVE_ONLY'` and returns `scope: 'BASE_REPLAY'` when any exist.
**All 10 core strategies weight all 5 LIVE_ONLY components (`funding`, `openInterest`, `sentiment`, `news`,
`whaleFlow`) above zero** — totals range ~0.26 (multi-timeframe-vwap-pullback) to ~0.52 (whale-flow-sentiment).
So `fullStrategySemantics` fails **26/26 rows structurally**, before any performance question is asked.

The three exits are all barred and must stay barred:
1. Flipping `dataMode` — relabels RSS / fear-greed / top-trader *proxies* as live evidence = provenance fraud.
2. Zeroing live-only weights — deletes the flagged components and guts theses (funding-basis-carry's funding
   weight is 0.25; zeroing it removes the strategy's entire edge).
3. Acquiring timestamp-aligned live history — **does not exist**: Whale Alert unauthenticated-rejects, and the
   bookTicker archive ends 2023 against a 2024-25 holdout window.

## What was actually implemented (user-chosen option: "split the promotion claim into two scopes")
Only ONE file changed: `scripts/research/runStructuralProfitabilityStudy.mts`. **Purely additive.**
- New `PERFORMANCE_GATE_KEYS` (sample, return, profitFactor, drawdown, costStress, riskPolicy,
  distinctTradeSequence) and `PROVENANCE_GATE_KEYS` (fullStrategySemantics).
- `scopedVerdicts()` emits `replayScopePromotable` (all non-provenance gates) and `performanceGatesPassed`.
- Rows gain 4 fields: `validationScope`, `unvalidatedLiveOnly`, `replayScopePromotable`,
  `performanceGatesPassed`. Summary gains `replayScopePromotion` + `performanceDiagnostic` blocks, each
  carrying an explicit `scopeMeaning` string that disclaims promotion/execution authorization.
- **UNCHANGED verbatim** and verified: `fullStrategySemantics: semanticBlockers.length === 0`,
  `promoted: Object.values(gates).every(Boolean)`, every `minProfitFactor` threshold, and the top-level
  `verdict` expression. `src/services/strategyPromotionGate.ts` was **not touched** — its documented contract
  ("no new validation vocabulary, no I/O, can only ever NARROW promotion") is preserved.

Additive-only proof: seal `e656624eca550227175d7d58a3fdbfe601994258f2f87a9a42406d55e9ea328e` INTACT; 0 diffs
across all 15 pre-existing fields on all 26 rows; promotion block and verdict byte-identical.

## Measured outcome — the split moves the count 0 -> 1, NOT 0 -> 10
- `promoted`: **0 / 26**
- `replayScopePromotion`: **0 / 26** — still blocked because `browserQa` fails 26/26
- `performanceDiagnostic`: **1 / 26** — `volatility-squeeze-trend-volume-expansion-v1` BTC_4H
  (32 trades, +3.2796%, PF 1.429, DD 2.2877%)

Gate failure tally over 26 rows: fullStrategySemantics 26, browserQa 26, costStress 22, return 18,
profitFactor 18, sample 5, distinctTradeSequence 3. Only 8/26 net-positive; 2 survive cost stress.

## HAZARD — `browserQa` is a global UI object stamped onto every strategy row
`browserQa` is a single global pixel-QA verdict copied identically onto all 26 rows; it has nothing to do with
any strategy's economics, yet it alone now holds `replayScopePromotable` at 0 instead of 1. Removing it from a
strategy-level verdict was **NOT authorized** and must not be done unilaterally — surface it as a decision.

## HAZARD — never retune against the sealed holdout
The requested "edit -> re-score -> repeat" loop, run against the sealed holdout, *manufactures* overfit
strategies and burns seal `e656624e...`. The seal SHA-256 is the burn detector. Refuse the loop; iterate on the
development window only, and spend the holdout once.

## Build-identity attribution (2026-08-24)
`sourceHash` hashes `['src','public','scripts','openapi']`, so a `scripts/research/*` edit legitimately
invalidates build identity. But `check:build-identity` was **already failing before this session's edit**: the
recorded verified id `4aa0088ade0f` is 12 hex chars with no dash = the *clean-tree* form
(`commit && !dirtyTree -> commit`), while disk read `4b45b635-1ca343b8`, the *dirty* form at a different
commit. Only a build rewrites `dist/build-info.json`, so the commit had moved and the tree had gone dirty
independently. Cleared by `npm run build`; new id `4b45b635-12b7dba2` / sourceHash `12b7dba2f8b9`, with
`check:build-identity` and `check:version-identity` both exit 0.

Corollary worth remembering: do **not** trust a python/manual replication of `generateBuildIdentity.mjs` for
attribution — my replication predicted `d9a6f3521de1` where the real generator produced `12b7dba2f8b9`. Use
build-info.json's own recorded values and the clean-vs-dirty id *format* instead.
