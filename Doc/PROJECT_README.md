# APEX Unified Terminal

**Current source version: 1.0.58.** The authoritative remediation/status report is [`APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md`](reports/final/APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md). Reports dated before 2026-08-13 are historical evidence unless explicitly carried forward there.

**Current source version:** `1.0.58`

APEX 1.0.58 preserves the complete v1.0.56 market-data, strategy, backtesting, multi-agent, Liquidity Hunter, account and execution-safety feature set while repairing Autopilot discoverability/controller ownership, runtime/build identity, launch-path ambiguity, browser-safe capability presentation, stale QA contracts and release-root hygiene. No source feature was intentionally removed.

## Current v1.0.58 remediation highlights

- Added a prominent global `AUTOPILOT` control backed by authoritative server phase, with explicit START/STOP ownership semantics and preserved page-local mirrors.
- Added source/build identity generation and stale-build rejection; service-worker identity is tied to the generated build ID.
- Added `RUN-APEX.bat` as the canonical launcher and moved old desktop/Claude launch material and v1.0.56 builds into `_archive` rather than deleting historical artifacts.
- Extracted provider capability truth into a browser-safe shared contract and surfaced PRIMARY / REALTIME EVIDENCE / PLANNED plus live/shadow/research authority in System Health.
- Strengthened Smart Autopilot, Backtesting, UI-completeness and release/root QA contracts while preserving fail-closed live-execution safety.
- Added a reproducible 18-dataset synthetic-market corpus (8,604 candles + 5,526 event rows) and a comprehensive 2,862-check simulation qualification gate.
- Closed an adversarial Risk Governor exposure-underreporting path by enforcing order/plan quantity, notional, entry and contract-multiplier consistency.
- Fixed high-price rolling-variance cancellation in replay and a KuCoin private WebSocket silence-watchdog bug that could postpone fail-closed recovery.
- See [`reports/final/APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md`](reports/final/APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md) for exact verification evidence and external qualification blockers.

## Preserved v1.0.56 highlights

- Added public KuCoin UTA funding-history and Futures open-interest history readers (`api.kucoin.com`) alongside the existing Binance USDⓈ-M context.
- Funding/OI evidence now keeps Binance and KuCoin histories isolated by source, prefers the two-venue primary pair when both are complete, surfaces cross-venue directional conflict, and caps confidence when only one primary venue is available.
- Kept KuCoin projected `nextFundingRate` out of the settled historical funding series to avoid mixing forecast and realized observations.
- Aligned the shared provider-priority contract so Binance and KuCoin are the first two providers for ticker, order book, candles, trades, funding, open interest, and instruments; existing tertiary providers remain available.

- Added a read-only KuCoin USDT-M Futures WebSocket adapter using a public token, trade stream, sequence-linked L2 updates, REST snapshot seeding, and fail-closed reseed after sequence gaps.
- Multi-exchange CVD now treats Binance USDⓈ-M Futures + KuCoin USDT-M Futures as the canonical primary realtime pair when both are healthy; Bybit remains available as a tertiary fallback without overriding the primary pair.

- Added a real Chromium/Playwright 1368×753 light-theme QA harness that bundles the current frontend source, exercises all 14 workspace routes, records browser/page errors, and captures key workspace screenshots. In restricted environments it can use an explicit QA-only transport bridge without changing production networking.
- Fixed Backtesting Run Builder horizontal overflow caused by hidden tooltip pseudo-elements extending scroll width; tooltips remain available and no Backtesting control was removed.
- Corrected Strategy Studio Dynamic Fusion light-theme surfaces that were falling back to dark colors because of undefined CSS tokens; the dark-theme override remains intact.
- Preserved the legacy 1368 fixture QA script under `qa:ui-1368:legacy-fixture`; the active `qa:ui-1368` command now runs the current-source real-browser harness.
- Package-backed TypeScript, Vitest and production build verification is supported by the restored Linux dependency set; browser verification can use a locally installed Chromium executable through `APEX_PLAYWRIGHT_EXECUTABLE`.
- Extended the capability-preservation gate through v1.0.56 covering all 14 workspace pages, 15 strategy identities, 110 HTTP routes, package scripts, QA scripts, environment keys and Liquidity Hunter feature-flag fields.
- Restored the visual project documentation artifact required by `docs:visual`; documentation refresh and local-link validation now complete successfully.
- Browser QA removes only the private runtime config file it generated itself, and only when that file did not exist before QA, preventing release-gate contamination without touching operator state.

## Preserved v1.0.53 safe-completion highlights

- Added bounded, evidence-level adaptive threshold research for all 10 Liquidity Hunter edges. Threshold selection uses development observations only; the final holdout is evaluated after selection.
- Added a persistent manual-only edge-threshold governance store with explicit stage → Paper Canary evidence → approve/reject/rollback lifecycle. Baseline threshold `0` preserves existing edge behavior until an eligible candidate has purged walk-forward/holdout context, reproducibility + cost/latency + quality evidence, at least one resolved Paper Canary observation, source/feature-version consistency, Risk Governor compatibility, and explicit named-operator approval. Automatic promotion is not implemented.
- Dynamic Fusion now consumes the manually governed runtime threshold profile after edge/meta evaluation. Governance errors preserve the deterministic evidence decision and are surfaced as research metadata rather than manufacturing authority.
- Walk-forward validation now emits advisory per-edge threshold optimization reports joined to real forward candidate outcomes and records the dataset source set, feature version, purged walk-forward/holdout protocol, and dataset fingerprint. These reports cannot promote or authorize execution by themselves.
- Added strategy-to-Liquidity-Hunter edge metadata for the relevant existing strategies. Every current binding is optional and `SHADOW_ONLY`; unavailable edge data cannot disable an existing strategy and no edge is registered as an executable strategy.
- Added KuCoin Futures public historical-kline pagination as the secondary long-history path after Binance USDⓈ-M Futures. Long research windows now try Binance pagination first, KuCoin pagination second, then retain the existing verified fallback chain.
- Preserved the v1.0.52 Backtesting Lab and Strategy Studio sizing/clarity upgrades, shared symbol universe, 120-market support, Binance USDⓈ-M primary symbols, and KuCoin USDT-margined Futures normalization.
- Added an isolated QA runtime for threshold governance, mandatory promotion-evidence gating, strategy-edge metadata, KuCoin pagination/source ordering, holdout isolation, read-plane governance visibility, and safety invariants.
- No Liquidity Hunter execution route, autonomous order path, Risk Governor bypass, TradePlan bypass, kill-switch change or automatic promotion path was added.

## Preserved v1.0.52 research-completion highlights

- Default-off sentiment-velocity feed reuses the supplemental provider chain and emits normalized shadow-only `SENTIMENT_EVENT` updates only when the provider score actually changes.
- Deterministic historical-similarity meta evaluator uses a SHA-256-fingerprinted, `DEVELOPMENT`-only artifact; `HOLDOUT` examples are rejected from training input.
- Advisory research-readiness gate spans walk-forward holdout evidence and optional microstructure evidence and cannot authorize execution.
- Bounded unattended Paper Canary shadow-evaluation scheduler reuses the same server-held context as manual evaluation and has no order/TradePlan/execution dependency.

## Preserved v1.0.51 evidence/simulation highlights

- Added optional Hyblock v2 predictive liquidation-topology ingestion behind a default-off server-side API-key flag; only approved predictive methodology may produce topology evidence.
- Prevented observed liquidation prints from masquerading as predictive liquidation topology.
- Upgraded the Deribit option-flow proxy to reconstruct gamma at each trade timestamp from trade IV, strike, expiry and index price; current ticker gamma is only a lower-quality fallback.
- Added a bounded Deribit historical option-flow importer that recursively subdivides saturated windows instead of silently truncating history.
- Added conservative long-history Hyperliquid wallet grading using realized fills, fees, funding, drawdown, profit factor, win rate and sizing consistency. Incomplete histories remain `UNRATED`.
- Raw Hyperliquid wallet addresses are pseudonymized before grading events enter the central event bus/log; externally forged S/F declarations remain untrusted.
- Added a deterministic event-level microstructure fill approximation with displayed queue-ahead consumption, partial fills, latency, spread/slippage, maker/taker fees, stop/target/expiry exits and conservative same-observation ordering.
- Added a persistent bounded Node worker-thread pool for microstructure replay rather than spawning one worker per candidate.
- Executed synthetic CPU throughput evidence showed 64 × 3302-event simulations at 411.81 ms median with one worker vs 259.51 ms median with four workers across three measured repetitions (1.59× observed median speedup in this environment); outputs remained equivalent. This is not a profitability or universal performance claim.
- Added a side-effect-free microstructure-validation CLI and a Deribit historical-import CLI.
- Preserved purged/embargoed walk-forward validation, untouched final holdout, paper canary, deterministic event manifests, read-only WebSocket, Risk Governor, TradePlan and reconciliation boundaries.
- Strategy optimizer automatic promotion remains disabled and Liquidity Hunter remains `shadowOnly: true`, `authoritative: false`.
- Existing registered strategies, routes, parameter aliases and safety controls remain in place.
- External credibility-scored sentiment and Meta-RL inference remain provider/dataset-gated. Deribit GEX and wallet grading remain research evidence, not proof of dealer inventory or institutional identity.

## Preserved v1.0.47 platform highlights

- The external-agent branch was compared file-by-file against the production branch; no active source file was lost.
- Shared drawer actions are now styled from the live `src/index.css`, while the unused `legacy-compat.css` duplicate was removed.
- Trading layout cascade conflicts were eliminated: both base and light-theme contracts now keep the cockpit single-column and leave drawer sizing to the dedicated docking layer.
- Strategy Studio no longer displays static performance evidence before a real replay or validation.
- Runnable strategies execute through the server Backtest API; infrastructure-blocked research models remain explicitly blocked.
- Walk-forward validation updates the active model with a real validation score and holdout metrics.
- Backtesting supports 500–5,000 closed candles, configurable holding windows, explicit costs, runtime audit, rejection diagnostics, and real charts.
- Successful zero-trade runs display a verified normalized market benchmark and the backend no-trade reason.
- Long research windows use server-side historical pagination instead of silently truncating to one provider page.
- Trading uses a chart-first right sidebar with Ticket, Orders, Positions, Depth, Trades, Strategy and Signals drawers.
- Orders, Positions and Strategy clicks remain inside Trading and request the matching right-side drawer rather than mounting panels inside the chart column.
- The chart column contains only the TradingView-style chart; subpanels are adjacent and never overlay it.
- Light-theme, design-token, interaction, attached-feature parity and 1368×753 contracts remain enabled.

## Quick start

```bash
npm ci
npm run dev
```

Production verification:

```bash
npm run verify
npm run verify:visual
npm run release:package
```

## Integrated platform capabilities

- Rich Trading workspace retained: real order-book depth, score factors, timeframe confluence, key levels, position context, and risk geometry.
- Strategy Studio, Backtesting, and Trading share the same symbol, timeframe, direction, strategy, and latest replay context.
- Adaptive request governor with priority reservation, bounded queues, circuit breaking, stale fallback, and authorization-safe cache identity.
- POST and other mutations are not cached or deduplicated by default.
- Markets favorites and the Watchlist route use one persistent source of truth.
- Settings for risk, leverage, theme, alert sound, and browser notifications affect runtime behavior.
- Functional Markets table/grid customization, row actions, filters, keyboard selection, and honest unsupported controls.
- Persistent Backtesting history and backend-applied commission, slippage, and funding assumptions without client-side double charging.
- Functional Help tutorials, support diagnostics, health status, Analytics controls, Portfolio range controls, and Overview scanner/signal navigation.
- Guarded account polling, browser-history navigation, accessible global search, skip navigation, route focus, and lazy-loaded heavy workspaces.
- Production-only service-worker registration with same-origin static asset caching; `/api/*` and all non-GET requests always bypass the cache.

## Main commands

| Script | Purpose |
|---|---|
| `npm run dev` | Start the server and live function-index watcher |
| `npm run dev:server` | Start `server.ts` without the index watcher |
| `npm run build` | Build browser and server bundles |
| `npm start` | Run `dist/server.cjs` |
| `npm run lint` | TypeScript project type-check |
| `npm test` | Vitest unit and integration suite |
| `npm run verify` | Build, tests, QA, documentation and release checks |
| `npm run verify:visual` | Canonical 1368×753 visual test |
| `npm run qa:adaptive-governor` | Governor priority/cache/circuit tests |
| `npm run qa:backtesting-workspace` | Backtesting workspace contract checks |
| `npm run qa:strategy-integration` | Strategy route and data integration checks |
| `npm run release:gate:source` | Source-only secret/archive/template scan |
| `npm run release:package` | Verification-gated release archive |
| `npm run qa:liquidity-hunter-evidence-simulation` | provider/grading/microstructure runtime QA |
| `npm run qa:liquidity-hunter-research-completion` | v1.0.52 sentiment/meta/readiness/Paper-Canary scheduler runtime QA |
| `npm run qa:liquidity-hunter-safe-completion` | v1.0.53 edge-threshold governance, strategy-edge metadata, KuCoin pagination and safety QA |
| `npm run manage:liquidity-hunter-thresholds -- <command>` | Manual-only stage/paper-canary/approve/reject/rollback CLI for validated edge-threshold reports |
| `npm run stress:liquidity-hunter-microstructure` | Bounded worker-thread microstructure throughput benchmark |
| `npm run validate:liquidity-hunter-microstructure` | Validate recorded Liquidity Hunter events with event-level fill approximation |
| `npm run import:deribit-options-history` | Import bounded public Deribit option-flow history |

## Project layout

| Path | Purpose |
|---|---|
| `src/` | React workspace, domain services, shared context and tests |
| `public/` | Manifest, PWA assets, service worker and coin icons |
| `scripts/` | Build, QA, capture, release and maintenance tooling |
| `tests/` | Integration and governance tests |
| `Doc/` | Plans, operating documentation and implementation reports |
| `QA/` | Current machine-readable validation evidence |
| `server.ts` | Express API, execution controls and Vite server entry |

## Current release documentation

- [`APEX v1.0.58 remediation and delivery status`](reports/final/APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md)
- [`Current-vs-historical report index`](reports/CURRENT_STATUS.md)
- [`PROJECT_HANDOFF.md`](handoff/PROJECT_HANDOFF.md)

### Preserved historical implementation evidence

- [`APEX_LIQUIDITY_HUNTER_RESEARCH_COMPLETION_REPORT_v1.0.52.md`](reports/historical/legacy-root-2026-08-09/APEX_LIQUIDITY_HUNTER_RESEARCH_COMPLETION_REPORT_v1.0.52.md)
- [`APEX_LIQUIDITY_HUNTER_EVIDENCE_SIMULATION_REPORT_v1.0.51.md`](reports/historical/legacy-root-2026-08-09/APEX_LIQUIDITY_HUNTER_EVIDENCE_SIMULATION_REPORT_v1.0.51.md)
- [`APEX_LIQUIDITY_HUNTER_VALIDATION_CANARY_REPORT_v1.0.50.md`](reports/historical/legacy-root-2026-08-09/APEX_LIQUIDITY_HUNTER_VALIDATION_CANARY_REPORT_v1.0.50.md)
- [`APEX_LIQUIDITY_HUNTER_CORE_SAFE_IMPLEMENTATION_REPORT_v1.0.49.md`](reports/historical/legacy-root-2026-08-09/APEX_LIQUIDITY_HUNTER_CORE_SAFE_IMPLEMENTATION_REPORT_v1.0.49.md)
- [`APEX_TRADING_SUBMENU_RELOCATION_REPORT_v1.0.47_FA.md`](reports/historical/legacy-root-2026-08-09/APEX_TRADING_SUBMENU_RELOCATION_REPORT_v1.0.47_FA.md)
- [`APEX_AGENT_SAFE_MERGE_REPORT_v1.0.46_FA.md`](reports/historical/legacy-root-2026-08-09/APEX_AGENT_SAFE_MERGE_REPORT_v1.0.46_FA.md)
- [`APEX_STRATEGY_BACKTEST_PRODUCTION_REPORT_v1.0.45_FA.md`](reports/historical/legacy-root-2026-08-09/APEX_STRATEGY_BACKTEST_PRODUCTION_REPORT_v1.0.45_FA.md)
- Historical QA evidence artifact for v1.0.47 was generated under the local root QA output tree by the `qa:agent-safe-merge` gate; that tree is intentionally excluded from clean source control.
- `Smart Autopilot accepted runtime evidence` — was `_qa/accepted/smart-autopilot/SMART_AUTOPILOT_RUNTIME_EVIDENCE.json`; the `_qa/` tree is not part of this repository and the artifact is not present, so this is recorded as a historical reference rather than a link. Current strategy-optimizer evidence lives under `QA/`.
- `Strategy Studio final regression` — was `_qa/accepted/strategy-studio/APEX_STRATEGY_STUDIO_FINAL_REGRESSION.log`; likewise absent, and no equivalent `.log` exists under `QA/`.

Historical implementation reports remain in the repository as development history rather than current release claims.

## 2026-08-10 comprehensive project audit

Historical architecture/indexing baseline (use the v1.0.58 remediation report for current status):

- [`Comprehensive project audit`](reports/final/APEX_COMPREHENSIVE_PROJECT_AUDIT_2026-08-10.md)
- [`Project structure map`](repository/PROJECT_STRUCTURE_2026-08-10.md)
- [`Canonical file index`](repository/FILE_INDEX_2026-08-10.md)
- [`API route index`](repository/API_ROUTE_INDEX_2026-08-10.md)
- [`Documentation index`](DOCUMENTATION_INDEX.md)

The audit records the Smart Autopilot/Multi-Agent/Multi-Trading state and deficiencies observed on its 2026-08-10 snapshot; current status is carried by the v1.0.58 report.

## Validation note

The v1.0.53 safe-completion capabilities are preserved through the current v1.0.58 source line, including the later Strategy Studio, Backtesting, Smart Autopilot and multi-agent/paper-research additions. The repository defines TypeScript, Vitest, production-build, runtime/source-contract and 1368×753 browser gates. In the 2026-08-10 comprehensive audit, the dependency-independent source/runtime contracts passed, but a fresh `npm ci` / full build / full Vitest / fresh browser pass was not claimed because the available internal npm mirror did not provide the locked Vitest artifact. Live Binance/KuCoin/Bybit Paper Canary observation still requires runtime network egress and is never inferred from fixtures.
