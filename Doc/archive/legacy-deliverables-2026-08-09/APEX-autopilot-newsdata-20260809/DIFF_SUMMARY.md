# APEX Autopilot + Newsdata.io Patch Summary

Target checkout: `APEX-unified-maximal-v1.0.56-r2-merged`

Patch size: 21 files, 317 insertions, 72 deletions.

## File-by-file diff

- `src/types.ts:493` adds the required `TerminalSettings.autopilotEnabled` boolean.
- `src/lib/storage.ts:24,61-68,77-78` defaults Autopilot to off and migrates/saves it fail-closed: only the literal boolean `true` enables it.
- `src/pages/settings/SettingsPage.tsx:110-117,267` includes Autopilot in the unsaved-change comparison and adds the Trading preferences checkbox.
- `src/App.tsx:536-537` passes the live global preference into both Strategy Studio and Backtesting Lab.
- `src/pages/strategies/StrategyPage.tsx:66-93,142-144,226-234,419-504` accepts the preference, adds in-flight/automatic-run tracking, sends `autoPromote` only for Autopilot runs, reports promoted results, and schedules immediate plus five-minute runs. Effect cleanup aborts obsolete automatic requests so a changed context can restart without overlap.
- `src/pages/strategies/StrategyEvidenceRail.tsx:109,123,132-143` labels automatic profiles truthfully, distinguishes an already auto-promoted report from a manually eligible candidate, states the evidence gates, and prevents duplicate manual promotion of an already promoted report.
- `src/pages/backtesting/BacktestingPage.tsx:6-7,29-36,116-170,316-361,582-584` adds optimization wiring to the Backtesting page, uses the current strategy/symbol/direction/interval/cost configuration, guards overlap, re-runs on configuration changes and every five minutes, and exposes the last success/failure time.
- `src/pages/backtesting/BacktestingPage.css:42,79-93` adds a dedicated grid row and active/error/disabled banner styling without increasing the coordinator beyond its 750-line source contract.
- `src/services/strategyOptimization.ts:749-753` replaces the obsolete “automatic promotion ignored” warning with an accurate request-mode warning while preserving every eligibility gate.
- `src/services/strategyOptimizationStore.ts:25,45-54,153,179` adds the `AUTOMATIC_PROMOTION` provenance value and allows the guarded route to persist that source explicitly; manual promotion remains the method default.
- `src/services/apexNextMarketRoutes.ts:1529,1561-1566,1577-1581` passes the validated `autoPromote` request through, promotes only when `report.promotion.eligible` is true, records completion, and returns an accurate response note. The existing multi-symbol portfolio blocker still runs before this gate.
- `src/services/supplementalKeyProbe.ts:11-14,91-117,216` removes the Massive.com misuse and probes CryptoCompare at `min-api.cryptocompare.com/data/price` with both documented authentication forms: query `api_key` and the `Authorization: Apikey` header.
- `src/services/providers/newsApiRequest.ts:317-334` adds the specified `https://newsdata.io/api/1/news` builder, query-parameter `apikey`, and compatible query mappings (`q`, `language`, `size`, category/country/domain filters).
- `src/services/providers/newsApiServerFetch.ts:1-10,21-28,47-55,64-69,87-115` switches the smart server fetch to Newsdata.io, restores adaptive direct/proxy routing, maps `results`, `link`, `pubDate`, and `source_id`, recognizes `status: success`, and changes transport errors/log grouping. Existing crypto relevance filtering, newsroom filtering, staged top-up, deduplication, and sentiment tagging are unchanged.
- `server.ts:2760,3606-3610` keeps the CryptoCompare slot provider-specific instead of substituting `MASSIVE_API_KEY`, and updates the startup diagnostic to describe adaptive supplemental-provider routing accurately. Saved configuration remains authoritative and is not overwritten.
- `src/tests/autopilotIntegration.test.ts:1-31` adds source-contract coverage for persistence, both schedulers, overlap guards, and the eligibility gate.
- `src/tests/newsDataIoRequest.test.ts:1-61` verifies endpoint/auth/query construction, response-field mapping, Newsdata.io transport messaging, adaptive routing, both CryptoCompare authentication forms, and provider-specific environment-key initialization.
- `src/tests/strategyOptimization.test.ts:85-90,135-137` updates warning expectations and verifies automatic promotion provenance persistence.
- `src/tests/workspaceUi.test.ts:63` updates the valid settings fixture for the new required field.
- `scripts/qa/runStrategyOptimizationSafetyRuntime.mjs:23` updates the optimizer-core assertion: the core determines eligibility while the route owns persistence.
- `scripts/qa/verifyLiquidityHunterFoundation.mjs:196` replaces the obsolete “route never auto-promotes” assertion with an exact evidence-gated route assertion; Liquidity Hunter automatic promotion remains separately disabled.

## Safety boundaries preserved

- Autopilot defaults to disabled.
- Promotion requires the existing untouched-holdout, cost-stress, drawdown, sample-size, neighbor-stability, overfit, and isolation gates.
- The adaptive multi-symbol portfolio remains blocked from automatic promotion until universe identity is available.
- No live-order, exchange-submission, or Liquidity Hunter autonomous-execution path was added or enabled.
- Strategy and Backtesting automatic requests are overlap-guarded and abort obsolete contexts.

## Verification evidence

- `npm run lint` — passed.
- Focused Vitest set — 5 files, 20 tests passed.
- Focused provider/Autopilot Vitest set — 2 files, 9 tests passed after the final credential-initialization fix.
- Full `npm test` — 81 files, 308 tests passed.
- `npm run qa:strategy-optimization` — 26/26 passed.
- `npm run qa:merged-stage-ui` — 31/31 passed; Backtesting coordinator is 740 lines (limit 750).
- `node scripts/qa/runStrategyOptimizationSafetyRuntime.mjs` — 7/7 passed.
- `npm run qa:backtesting-workspace` — 25/25 passed.
- `npm run qa:strategy-backtest-production` — 1/1 passed.
- `npm run build` — passed; Vite and server bundle completed. One pre-existing Vite advisory remains: `AccountViews.tsx` is both dynamically and statically imported.
- `git apply --check APEX-autopilot-newsdata.patch` against the captured pre-change source — passed.
- Local browser smoke test — passed: the Trading preferences Autopilot checkbox rendered enabled for interaction and unchecked by default; Backtesting rendered the disabled status banner; Strategy Studio rendered `Run Smart Optimization`; browser console contained no errors or warnings. Autopilot was not enabled, so no optimization or promotion mutation was triggered.

## Applying elsewhere

From the root of the matching v1.0.56-r2 source tree:

```powershell
git apply --check .\APEX-autopilot-newsdata.patch
git apply .\APEX-autopilot-newsdata.patch
npm run lint
npm test
npm run build
```

The `source-overlay` directory contains the same 21 final files for environments where applying a patch is inconvenient.

## Credentialed provider verification

- Newsdata.io: `OK`, 1,127 matching results, approximately 2.2 seconds. This succeeded after removing the forced unhealthy-proxy-only path.
- CryptoCompare: `UNAUTHORIZED`. The upstream was reachable, but rejected the stored credential. Control requests confirmed that the upstream returns the same “API key required” response for absent and invalid credentials. The server no longer substitutes `MASSIVE_API_KEY` into the CryptoCompare slot; the remaining blocker is the already-saved credential, which was deliberately not overwritten.
- No credential values were printed, copied, or included in the delivery.
