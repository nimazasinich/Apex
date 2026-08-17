# APEX Project Handoff

# APEX v1.0.58 — Current Remediated Handoff

This section supersedes older handoff sections below where they conflict with the current tree. Historical sections remain intact as project history.

## Current implementation state

- Version: `1.0.58`.
- The full v1.0.56 feature set is preserved; no program feature was intentionally removed.
- A global, authoritative `AUTOPILOT` control is present in the workspace shell while Backtesting and Strategy keep their local Autopilot mirrors.
- Browser preference cannot silently stop an environment/operator-armed Autopilot controller; explicit operator actions control START/STOP and the UI reads the server phase.
- Build identity is generated from current source/build inputs and is visible in the shell; stale `dist` identity is rejected by the canonical `RUN-APEX.bat` launcher.
- Provider capability truth is shared through a browser-safe contract and System Health visibly distinguishes primary, realtime-evidence, planned, live-authority, shadow and research-only capabilities.
- The BscScan operator key now reaches every runtime orchestrator path with dedicated-key precedence and an explicit Etherscan V2 fallback contract.
- Legacy desktop/Claude launch tools and pre-v1.0.58 build/release artifacts are preserved under `_archive` instead of competing with the canonical terminal runtime.
- Liquidity Hunter, ML and advanced scanner authority remain fail-closed/shadow where their real-data or governance gates require it. Research/paper Autopilot does not grant live execution authority.

## Verification state

- All 34 dependency-independent runnable source verifiers, root/version/build-identity gates, repository-wide documentation-link validation and the source release secret scan pass in the 2026-08-13 remediation environment.
- TypeScript/TSX/MTS syntax transpile scan checked 559 files with zero syntax diagnostics; JavaScript/MJS/CJS syntax scan checked 125 files with zero syntax errors.
- Test inventory gate discovers 125 files / 688 declared tests; the dependency-free compatibility harness executes 693 assertions with zero assertion failures, with two React server-rendering files load-blocked by the absent React package.
- A dependency-complete `npm run verify` is not claimed in this environment because the locked npm install cannot retrieve/cache `vitest-4.1.10.tgz`. Run the commands in `Doc/reports/final/APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md` on the target Node 22+ machine.

## Current status authority

Use `Doc/reports/final/APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md`. The v1.0.56 and earlier sections below are historical snapshots.

---

# APEX v1.0.56 — Current Canonical Multi-Futures Context Handoff

This section supersedes older handoff sections below where they conflict with the current tree. Historical sections remain intact as project history.

## Current implementation state

- Version: `1.0.56`.
- Binance USDⓈ-M Futures + KuCoin USDT-M Futures are now aligned as the canonical first two public Futures providers across the active market-data hierarchy, realtime CVD, and Funding/Open-Interest macro context. Bybit/Bitget/OKX remain tertiary compatibility/fallback sources where already supported; no existing provider path was removed.
- KuCoin public UTA funding-history and Futures open-interest history are collected independently from Binance, normalized into source-isolated event series, and fused only after per-venue evaluation.
- Funding/OI evidence explicitly detects Binance↔KuCoin directional conflict. Two-source evidence is preferred; single-source degradation remains usable only with capped data quality rather than fabricated agreement.
- KuCoin current/projected funding is not retroactively mixed into settled funding history. Historical timestamps remain provider-derived and are not replaced with bootstrap time.
- Realtime Liquidity Hunter retains Binance + KuCoin as its primary trade/CVD pair, with KuCoin public-token WebSocket transport, sequence-validated L2 reconstruction, and isolated reseed after a gap.
- Legacy provider-priority metadata now also lists Binance then KuCoin first for ticker, order book, candles, trades, funding, open interest and instruments, preventing future routing code from drifting back to an older Binance/Bybit-first assumption.
- All v1.0.55 Backtesting/Strategy UI, symbol synchronization, 1368×753 Light-theme QA, research/paper-canary infrastructure, adaptive threshold governance, replay, microstructure simulation and manual/testnet safety boundaries remain preserved.
- No execution/order route was added. `connectedExchange`, `RiskGovernor`, `TradePlan`, Liquidity Hunter feature flags/fusion policy and Paper Canary execution boundary remain unchanged from v1.0.55.

## Verification state

- TypeScript package-backed lint/typecheck: PASS.
- Vitest inventory: 70 files / 250 tests after the provider-priority regression test; full suite must remain 100% passing before release packaging.
- Production build: PASS.
- Runtime/source-contract/Liquidity-Hunter gates: PASS.
- 1368×753 Light-theme real Chromium visual QA: PASS.
- Direct-origin Chromium navigation can be blocked by administrator browser policy in this host; the existing explicit `APEX_QA_TRANSPORT_BRIDGE=1` QA mode passes against the current frontend bundle plus real local API surface. This is a QA transport limitation, not a production network bypass.

## External boundary

- Live exchange/Paper Canary outcome observation still requires runtime egress to public Binance/KuCoin feeds. No synthetic fixture is reported as live profitability evidence.

---

# APEX v1.0.55 — Current Canonical Market-Data Completion Handoff

This section supersedes older handoff sections below where they conflict with the current tree. Historical sections remain intact as project history.

## Current implementation state

- Version: `1.0.55`.
- Binance USDⓈ-M Futures and KuCoin USDT-M Futures are now the canonical primary realtime public-data pair for Liquidity Hunter; Bybit remains optional/tertiary and no existing provider path was removed.
- KuCoin realtime integration is read-only and includes public-token discovery, trade events, sequence-validated L2 seeding/deltas, and fail-closed REST reseed on gaps.
- All v1.0.53 safe-completion capabilities are preserved: 14 workspace pages, registered strategy identities, market-data hierarchy, Backtesting/Strategy integration, Liquidity Hunter evidence/research layers, manual threshold governance, Risk Governor, TradePlan, kill switches, reconciliation and manual/testnet execution boundaries.
- The active 1368×753 UI QA path now runs a real Chromium/Playwright render of the current source bundle in LIGHT theme and covers all workspace routes; the previous fixture renderer remains available as `qa:ui-1368:legacy-fixture`.
- Backtesting Run Builder no longer gains horizontal scroll from hidden tooltip pseudo-elements; tooltip content and controls are preserved.
- Strategy Studio Dynamic Fusion uses valid light-theme surfaces instead of undefined-token dark fallbacks, with the existing dark-theme behavior preserved.
- Browser QA supports `APEX_PLAYWRIGHT_EXECUTABLE`; an explicit `APEX_QA_TRANSPORT_BRIDGE=1` mode exists only for restricted verification environments where administrator browser policy blocks localhost navigation. Production routing/networking is unchanged.
- Capability preservation is now an explicit v1.0.55 gate: 14/14 workspace pages, 15/15 strategy identities, 110/110 HTTP routes, and all v1.0.53 package/QA/env/Liquidity-Hunter flag inventory entries remain present.
- `docs:visual` is operational again because the visual project documentation artifact is present and refreshed for v1.0.55.
- QA-generated private external-source config is cleaned only when QA created it, so release verification no longer leaves private runtime state behind.
- Liquidity Hunter remains `shadowOnly: true`, `authoritative: false`; autonomous live execution and optimizer auto-promotion remain disabled. No new execution/order route is introduced.

## Remaining external verification boundary

- Real Paper Canary observation requires runtime network egress to public exchange feeds. A network-blocked environment must report zero live-feed evidence rather than substitute simulated profitability evidence.
- Direct-origin Playwright navigation may be blocked by host enterprise Chromium policy; this is distinct from application correctness and must be reported separately from transport-bridge browser QA.

---

# APEX v1.0.53 — Current Canonical Safe-Completion Handoff

This section supersedes older handoff sections below where they conflict with the current tree. Historical sections remain intact as project history.

## Current implementation state

- Version: `1.0.53`.
- The v1.0.52 Backtesting Lab, Strategy Studio UI clarity/sizing work, symbol synchronization, Binance USDⓈ-M Futures primary source, KuCoin USDT-margined Futures secondary source, and Hugging Face fallback chain are preserved.
- Liquidity Hunter remains `shadowOnly: true`, `authoritative: false`; autonomous live execution remains disabled.
- Ten evidence-only edges, four deterministic layers, Dynamic Fusion, event replay, microstructure simulation, research readiness, Paper Canary and the read-only WebSocket remain present.
- Edge-level threshold optimization is now bounded and advisory. Development observations select candidates; HOLDOUT observations are evaluated only after selection.
- Threshold governance is manual-only with stage → Paper Canary evidence → approve/reject/rollback persistence. Promotion now fails closed unless the proposal carries matching source-set/feature-version/dataset identity plus reproducibility, cost/latency stress, quality-concentration, Paper Canary, data-source-stability and Risk-Governor-compatibility evidence. Runtime behavior remains unchanged at baseline threshold `0` until a named operator approves the fully evidenced proposal. `automaticPromotionEnabled` remains `false`.
- Dynamic Fusion applies only the active manually governed evidence threshold after raw edge/meta evaluation; thresholds can filter an already-PASS edge but cannot resurrect failed/unavailable evidence. The read-only operations/WebSocket snapshot exposes threshold revision/proposal state without adding a write channel.
- Existing strategies now expose optional, shadow-only Liquidity Hunter context metadata. These bindings do not change strategy registration, status, execution authority or fallback behavior.
- Long historical validation now paginates Binance Futures first and KuCoin Futures second before the existing tertiary fallback.
- No new Liquidity Hunter execution/order route was introduced. Existing Risk Governor, TradePlan, kill switches, manual confirmation, execution-intent persistence and reconciliation remain the execution authority.

## Explicitly deferred / conditional

- A Liquidity Hunter-specific manual testnet execution route remains intentionally deferred because current safety policy forbids adding a new execution path in this phase. Existing generic manual/testnet execution remains preserved.
- Rust/Go feeder extraction and a Python sidecar remain conditional optimization steps; current evidence does not justify replacing the stable Node control plane.
- Live-market Paper Canary profitability/effectiveness still requires a network-capable environment and real public exchange data; no synthetic result is treated as production evidence.

---

# APEX v1.0.52 — Current Canonical Liquidity Hunter Research-Completion Handoff

This section supersedes older handoff sections below where they conflict with the current tree. Historical sections are retained as project history only.

## Current implementation state

- Version: `1.0.52`.
- Liquidity Hunter remains `shadowOnly: true`, `authoritative: false`; autonomous live execution remains disabled.
- Ten evidence-only edges, the four-layer setup state machine, Dynamic Fusion, deterministic event replay, paper canary and read-only WebSocket remain preserved.
- Sentiment velocity is now wired to the existing supplemental provider chain as changed-observation-only shadow evidence; unchanged provider scores are not re-emitted as synthetic velocity.
- A versioned SHA-256-fingerprinted historical-similarity meta evaluator is available behind the existing default-off Meta Model flag. It accepts `DEVELOPMENT` examples only and explicitly rejects `HOLDOUT` examples from model artifacts.
- A new advisory research-readiness gate can mark `PAPER_CANARY_OBSERVATION_ELIGIBLE` or `MANUAL_REVIEW_ELIGIBLE`, but remains `authoritative: false`, `automaticPromotionEnabled: false`, and `executionAuthorized: false`.
- Paper Canary can now run unattended through a bounded shadow-evaluation scheduler when explicitly enabled. The scheduler reuses the existing server-side candle/funding/OI/realtime context path and can only call the shadow fusion engine plus Paper Canary capture; it has no order/TradePlan/execution path.
- Optional Hyblock v2 predictive liquidation topology is implemented behind a default-off server-side API-key flag. Only approved predictive methodology is accepted by the topology edge.
- Deribit option gamma now prefers event-time reconstruction from trade IV/strike/expiry/index price. A bounded historical importer recursively subdivides saturated windows; historical OI is not fabricated.
- Hyperliquid long-history grading uses public realized fills plus fees/funding and conservative completeness/sample gates. Raw wallet addresses are pseudonymized before emitted grading evidence; incomplete history remains `UNRATED`.
- Event-level microstructure research simulation models queue-ahead consumption, partial fills, latency, spread/slippage, fees and protective exits. It is an approximation, not matching-engine ground truth.
- Microstructure batches run through a persistent bounded Node `worker_threads` pool (1–8 workers). A shipped three-repetition synthetic benchmark observed a 1.59× median throughput improvement from 1 to 4 workers in this delivery environment while preserving output equivalence.
- Existing strategy optimization keeps purge/embargo isolation and explicit manual promotion; automatic promotion remains disabled.
- Existing `TradePlan`, `RiskGovernor`, execution-intent persistence, testnet/manual controls, kill switches and reconciliation remain authoritative and were not bypassed.

## Provider/evidence caveats

- Hyblock requires the user's own server-side API key and is default off. Provider-fixture QA was executed; live Hyblock connectivity was not exercised here.
- Deribit event-time GEX remains a taker-flow/model proxy, not complete dealer inventory.
- Hyperliquid public-history grades are behavior classifications, not proof of institutional identity or future alpha.
- Sentiment remains credibility/provider-gated and default off. The local meta evaluator is development-artifact-gated and shadow-only; no Meta-RL auto-training or automatic threshold promotion is enabled.
- Microstructure simulation is deterministic queue approximation, not exchange matching-engine truth.

## Safety state

```text
Liquidity Hunter: SHADOW ONLY / NON-AUTHORITATIVE
Autonomous live execution: DISABLED
Strategy optimizer automatic promotion: DISABLED
External evidence providers: DEFAULT OFF
Browser read plane: READ ONLY
Risk Governor / TradePlan / execution-intent persistence: PRESERVED
```

## Executed QA in this delivery environment

- Liquidity Hunter baseline preservation: 17/17 PASS.
- Liquidity Hunter source contract: current v1.0.52 source/runtime result is recorded in the release report.
- Liquidity Hunter foundation runtime: 25/25 PASS.
- Liquidity Hunter core runtime: 11/11 PASS.
- Public feed protocol runtime: 10/10 PASS.
- Deterministic event replay runtime: 9/9 PASS.
- Read-plane WebSocket runtime: 7/7 PASS.
- Execution-position lifecycle runtime: 6/6 PASS.
- Strategy optimizer safety runtime: 7/7 PASS.
- Liquidity Hunter validation/providers runtime: 20/20 PASS.
- Liquidity Hunter research-completion runtime: current v1.0.52 result is recorded in the release report.
- Feature preservation: PASS.
- Strategy optimization integration: 26/26 PASS.
- Core 10 Dynamic Fusion: 17/17 PASS.
- System integration: 12/12 PASS.
- Backtesting workspace: 25/25 PASS.
- Merged Stage SEC/UI source contract: 31/31 PASS.
- Agent-safe merge: 19/19 PASS.
- v1.0.50 preservation comparison: 795 baseline files / 811 current files / 0 baseline files missing / 16 additive files.
- TypeScript-family syntax transpile: 410 files / 0 syntax failures.
- Active source/server relative imports: 965 / 0 missing.
- Express route literals: 110 unique method/path pairs / 0 duplicates.
- Source-only secret/release gate: PASS.
- Version identity gate: PASS (`1.0.52`).
- OpenAPI release identity: 3.1.0 / version 1.0.52.

The uploaded v1.0.51 baseline was package-verified in a network-capable environment. For v1.0.52, this delivery container currently returns HTTP 404 for `vitest-4.1.10.tgz`, so package-backed `tsc`/Vitest/Vite/browser verification must be repeated in the target environment; no such PASS is inferred here.

---

## Project paths

Working path used in this session:

```text
/mnt/data/apex_ui_v1037
```

Original Windows path:

```text
C:\project\APEX-frontend-phase31\APEX-Crypto-Trading-Terminal-Corrected
```

## Repository and safety state

- Git repository in this sanitized delivery working copy: absent.
- Earlier handoff records a safety baseline commit before reference integration: `da8993e`.
- Reference subsystem integration commit: `57c39f6`.
- Existing architecture and all earlier Settings/Positions visual work were preserved.
- Final delivery is generated from a sanitized staging copy; runtime credentials and generated artifacts are excluded.

## Completed in this session

- Added multi-timeframe Direction Divergence classification in shadow mode.
- Added deterministic Signal Lifecycle state machine and browser tracker.
- Added Signal ID generation and exact Decision Memory outcome linking.
- Added Telegram connection/settings UI and lifecycle notifications.
- Added Supplemental Intelligence provider and Custom External Source management UI.
- Added Level Ladder and Execution Corridor to the existing Trading workspace.
- Added lifecycle/divergence observability to Watchlist.
- Added targeted unit tests for all new pure subsystems.
- Did not replace or duplicate existing Strategy Engines because the current Strategy Library is more advanced than the reference archives.

Full implementation details:

```text
REFERENCE_SUBSYSTEM_INTEGRATION_REPORT.md
```

## Changed files

```text
src/App.tsx
src/components/workspace/AccountViews.tsx
src/pages/settings/SettingsPage.css
src/pages/settings/SettingsPage.tsx
src/pages/watchlist/WatchlistPage.css
src/pages/watchlist/WatchlistPage.tsx
src/services/apexNextMarketRoutes.ts
src/services/shadowComparisonPersistence.ts
src/types.ts
```

## Added files

```text
src/components/IntelligenceSourcesSettingsPanel.tsx
src/components/TelegramSettingsPanel.tsx
src/components/trading/ExecutionCorridorPanel.tsx
src/components/trading/ExecutionIntelligence.css
src/components/trading/ExecutionIntelligence.tsx
src/components/trading/LevelLadderPanel.tsx
src/services/decisionOutcome.ts
src/services/directionDivergence.ts
src/services/externalApiSources.ts
src/services/lifecycleCore.ts
src/services/signalLifecycleTracker.ts
src/services/supplementalSettings.ts
src/services/telegram.ts
src/tests/decisionOutcome.test.ts
src/tests/directionDivergence.test.ts
src/tests/lifecycleCore.test.ts
src/tests/signalId.test.ts
src/tests/signalLifecycleTracker.test.ts
src/tests/telegram.test.ts
src/utils/signalId.ts
REFERENCE_SUBSYSTEM_INTEGRATION_REPORT.md
```

## Validation status

```text
git diff --check: PASS
Changed TS/TSX syntax transpile: PASS (26 files, 0 syntax errors)
Changed CSS parse: PASS
Hardcoded-secret pattern scan on changed sources: PASS
Manual pure subsystem assertions: PASS
Lifecycle tracker integration flow: PASS
qa:strategy-library: PASS
qa:strategy-engines: PASS
qa:strategy-integration: PASS
```

Known baseline QA findings not introduced here:

```text
qa:backtesting-workspace: 24/25 — stale Settings width expectation
qa:reference-ui: PASS after removing the proven-unreachable legacy v3-workspace.css and updating its static contract test
qa:consolidation: disconnected/duplicate baseline paths
```

Not executable in this container because dependencies are absent and the configured registry returns 404 for required packages:

```text
npx tsc --noEmit
npm test
npm run build
```

## Security / delivery state

The final archive excludes:

```text
.env
.env.txt
runtime *.config.json secrets
.git
node_modules
dist
coverage
.vite
playwright-report
test-results
historical ZIP archives
old logs and generated screenshots
```

Examples and source files remain included.

## Exact next verification task

On a machine with working npm registry access:

```cmd
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

Then verify Settings, Watchlist, and Trading in forced Light/Dark at the 1368×753 baseline, and confirm Telegram/Supplemental credential writes against the intended backend environment.

---

# Trading Engine Utility Integration — v1.0.35

## Completed

- Extracted only compatible utilities from `APEX-Trading-Engine.zip`; no legacy Strategy Engine or UI was substituted.
- Added bounded online statistics: Welford normalization, EWMA, OI trend tracking, per-symbol LRU state.
- Wired smoothed OBI only into lifecycle observability; scanner gates, score calculations, financial calculations, and execution remain unchanged.
- Added a 1m/5m fast adaptive controller in strict shadow-only mode.
- Added `GET /api/operations/adaptive-thresholds/fast-shadow`; its response is always non-applied.
- Added opt-in KuCoin public streaming primitives with L2 sequence validation, duplicate/gap handling, crossed-book fail-closed behavior, reconnect, and REST reseed support.
- Added `GET /api/operations/market-streaming`.
- Added a credential-free Postman collection without live order submission.
- Added focused unit and hardening tests plus `qa:trading-engine-utilities` in the main `verify` chain.
- Bumped package version to `1.0.35`.

## Exact files added

```text
APEX_TRADING_ENGINE_UTILITY_INTEGRATION_REPORT_FA.md
scripts/qa/verifyTradingEngineUtilities.mts
src/services/fastAdaptiveShadowController.ts
src/services/kucoinStreaming.ts
src/services/onlineStatistics.ts
src/tests/fastAdaptiveShadowController.test.ts
src/tests/kucoinStreaming.test.ts
src/tests/onlineStatistics.test.ts
src/tests/tradingEngineCoreHardening.test.ts
tools/postman/APEX-Unified-Terminal.postman_collection.json
vendor/yallist-3.1.1.tgz
```

## Exact files modified

```text
.env.example
package.json
package-lock.json
server.ts
src/services/apexNextMarketRoutes.ts
PROJECT_HANDOFF.md
```

## Validation

```text
git diff --check: PASS
Strict custom TypeScript check for new services: PASS
Changed TS/MTS syntax transpile: PASS (10 files)
Trading utility QA runner: PASS (9 check groups)
Postman JSON parse: PASS
Source-only release secret gate: PASS
```

Full dependency-based commands could not run because the configured npm registry returned:

```text
404 Not Found: why-is-node-running-2.3.0.tgz
```

## Safety state

```text
KuCoin streaming default: disabled
Fast adaptive controller: shadow-only
Fast adaptive recommendation auto-apply: false
Streaming dependency for execution: false
Real-order Postman request: absent
```

## Exact next task

On a machine with working npm registry access, run:

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

Then enable KuCoin streaming only in Demo/Shadow mode and verify disconnect, sequence-gap, REST reseed, reconnect, and browser lifecycle cleanup.

---

# Operations Observability & Runtime QA — v1.0.36

## Completed

- Expanded the existing System Health drawer into a partial-failure-safe operational control plane.
- Aggregated system health, operations status, fast adaptive shadow, streaming capability and online market statistics.
- Preserved last-known values for individual failed diagnostic endpoints instead of blanking the whole drawer.
- Added explicit Shadow-only and execution-independent labels; no adaptive recommendation can be auto-applied from the UI.
- Added `GET /api/operations/market-statistics?limit=12` for bounded EWMA/Welford observability.
- Added deterministic recent-symbol ordering in `SymbolStatisticsRegistry` using an internal monotonic touch order.
- Added a unified Playwright runtime QA runner for fresh mounts, responsive geometry, 1368×753 baseline, effective 200% zoom, theme persistence and Watchlist persistence.
- Added the new QA runner to `verify:visual`.
- Added the market-statistics request to the safe Postman collection.
- Bumped package version to `1.0.36`.

## Exact files added

```text
APEX_OPERATIONS_OBSERVABILITY_RUNTIME_QA_REPORT_FA.md
scripts/qa/verifyWorkspaceRuntime.mts
src/services/operationsDiagnostics.ts
src/tests/operationsDiagnostics.test.ts
```

## Exact files modified

```text
package.json
package-lock.json
server.ts
PROJECT_HANDOFF.md
scripts/qa/verifyTradingEngineUtilities.mts
src/components/workspace/OperationsDrawers.css
src/components/workspace/SystemHealthDrawer.tsx
src/services/onlineStatistics.ts
src/tests/onlineStatistics.test.ts
tools/postman/APEX-Unified-Terminal.postman_collection.json
```

## Validation

```text
git diff --check: PASS
Strict custom TypeScript check for new client/service logic: PASS
Changed TS/TSX/MTS syntax transpile: PASS
Manual emitted-JS operational assertions: PASS
CSS parse: PASS
Postman JSON parse: PASS
Source-only release secret gate: PASS
```

Full npm dependency-based checks remain blocked in this container because the registry cannot retrieve the existing `why-is-node-running` package.

## Safety state

```text
Fast adaptive auto-apply: false
Streaming default: disabled
Streaming execution dependency: false
Online statistics execution dependency: false
Order path changed: no
Scanner gates changed: no
Financial calculations changed: no
```

## Exact next task

On a machine with working dependency access, run:

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

Then open the Operations/System Health drawer at 1368×753 in forced Light and Dark modes and verify partial endpoint failures, retained last-known values, adaptive-shadow rows and market-statistics rows during an active scanner session.


---

# UI Interaction & Feedback Polish — v1.0.37

## Completed

- Activated the canonical `.apex-shell.apex-workspace` styling contract for the current workspace root.
- Added a global, accessible feedback center with success, warning, error and informational states, action links, dismissal and automatic cleanup.
- Added a persisted Light/Dark theme toggle to the workspace header.
- Improved global search with Home/End navigation, hover synchronization, explicit clear action and accessible active-result semantics.
- Made both header and sidebar Market Data status surfaces open System Health details.
- Added consistent focus-visible, hover, active, selected-row and reduced-motion behavior across the workspace.
- Refined Watchlist, Orders, Positions, Alerts, History, Settings and Help interactions without changing API contracts, calculations, order payloads or localStorage keys.
- Added real row selection and keyboard interaction, safe action transfer to Trading, filter clearing, CSV export feedback, copy feedback, alert edit/reset flows, Settings unsaved-state handling and Help diagnostics copy/refresh flows.
- Preserved every Positions table column and replaced the misleading Daily P&L label with the exact Account Unrealized snapshot metric.
- Removed the proven-unreachable legacy `src/styles/v3-workspace.css`; the current split page styles and canonical shell stylesheet remain the only active sources.
- Updated the V3 static contract test to read the active split styles and current WorkspaceShell/API contracts.
- Added `qa:ui-interaction-polish` and included it in the main verification chain.
- Bumped package version to `1.0.37`.

## Exact files added

```text
scripts/qa/verifyUiInteractionPolish.mjs
src/components/ui/WorkspaceFeedbackCenter.css
src/components/ui/WorkspaceFeedbackCenter.tsx
src/lib/workspaceFeedback.ts
src/styles/interaction-polish.css
APEX_UI_INTERACTION_POLISH_REPORT_v1.0.37.md
```

## Exact files modified

```text
package.json
package-lock.json
src/App.tsx
src/components/workspace/WorkspaceShell.tsx
src/main.tsx
src/pages/alerts/AlertsPage.tsx
src/pages/help/HelpPage.tsx
src/pages/history/HistoryPage.tsx
src/pages/orders/OrdersPage.tsx
src/pages/pageTypes.ts
src/pages/positions/PositionsPage.tsx
src/pages/settings/SettingsPage.tsx
src/pages/watchlist/WatchlistPage.tsx
src/styles/workspace-shell.css
tests/v3-contract-static.mjs
PROJECT_HANDOFF.md
```

## Removed dead source

```text
src/styles/v3-workspace.css
```

Repository-wide search confirmed that the removed file was not imported by the active application. The obsolete static test was migrated to the current split styles before removal.

## Validation

```text
TypeScript isolated syntax transpile: PASS (209 TS/TSX/MTS files)
UI interaction static QA: PASS (28/28)
Reference UI QA: PASS (24/24)
V3 static contract: PASS
Strategy Library QA: PASS
Strategy Engines QA: PASS
Strategy Integration QA: PASS
Adaptive Governor QA: PASS
System Integration QA: PASS (12/12)
CSS structural validation: PASS (26 files)
Package JSON parse: PASS
Source-only release secret gate: PASS
```

Known baseline findings not introduced by this UI pass:

```text
qa:backtesting-workspace: 24/25 — pre-existing Settings-column placement expectation
qa:consolidation: pre-existing disconnected workspace client and duplicate-path findings
```

Full dependency-backed `tsc`, Vitest, production build and Playwright visual runtime were not executable in this container because the supplied dependency tree is incomplete and the configured registry previously returned 404 for a required package. No runtime screenshot result is claimed for this release.

## Exact next verification task

On a machine with working registry access:

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

Then inspect Watchlist, Orders, Positions, Alerts, History, Settings and Help at 1368×753 in forced Light and Dark modes, including keyboard-only navigation and effective 200% zoom.

# UI Design Token Runtime Fix — v1.0.38

## Root cause fixed

`src/styles/tokens.css` was present but not imported by `src/index.css`. Active Help, Settings, Alerts, Positions, Orders and Watchlist styles referenced APEX custom properties that therefore did not exist at runtime. This caused transparent icon tint backgrounds, inherited dark colors and missing semantic borders.

## Exact implementation

- Added `@import "./styles/tokens.css";` once, directly after the Tailwind import and before `@layer` rules.
- Added missing active palette levels `--apex-green-300`, `--apex-green-400` and `--apex-green-800`.
- Added semantic aliases `--apex-positive`, `--apex-negative`, `--apex-focus` and `--apex-soft`.
- Added `scripts/qa/verifyDesignTokens.mjs` and the `qa:design-tokens` package script.
- Inserted `qa:design-tokens` into the main `verify` chain.
- Extended Playwright workspace QA to verify computed design tokens, icon tint backgrounds, icon colors and highlight borders in Light and Dark at 1368×753.
- Updated package and lockfile versions to `1.0.38`.

## Files modified

```text
src/index.css
src/styles/tokens.css
scripts/qa/verifyWorkspaceRuntime.mts
package.json
package-lock.json
PROJECT_HANDOFF.md
```

## Files added

```text
scripts/qa/verifyDesignTokens.mjs
APEX_UI_TOKEN_FIX_REPORT_v1.0.38.md
QA/design-token-contract-v1.0.38.json
```

## Validation

```text
Design token contract: PASS (5/5)
Reference UI QA: PASS (24/24)
UI interaction QA: PASS (28/28)
Strategy Library QA: PASS
Strategy Engines QA: PASS
Strategy Integration QA: PASS
Adaptive Governor QA: PASS
System Integration QA: PASS (12/12)
TypeScript isolated syntax transpile: PASS (274 TS/TSX/MTS/CTS files)
CSS structure: PASS (26 files)
Undefined APEX variables: 0
Package version consistency: PASS
Source-only secret gate: PASS
```

`npm ci` was attempted, but this container's registry returned 404 for `why-is-node-running@2.3.0`. Full dependency-backed TypeScript, Vitest, production build and browser runtime execution therefore remain the first verification step on a machine with working registry access.

---

# Safe V20 UI Completeness Merge — v1.0.40

## Source comparison

Compared the active v1.0.38 project against the attached archive:

```text
APEX-complete-operations-observability-v1.0.39-v20bext.zip
```

The attached project contained useful theme/completeness details but older page-level interaction implementations. No page TSX tree was replaced wholesale.

## Completed safe merge

- Added global Dark-mode APEX token overrides while preserving the v1.0.38 Light tokens and missing-token fixes.
- Applied theme-aware V20 surfaces to the active reference UI stylesheet.
- Applied theme-aware surfaces to active Help and Watchlist styles.
- Added a dedicated Settings shortcut to the workspace header without removing the existing account/avatar navigation.
- Extracted four local Help tutorial thumbnails from the attached visual reference and connected them to the active interactive Tutorial buttons.
- Corrected the Help Tutorial CSS selector from the obsolete `article` target to `.apex-v3-tutorial-card`.
- Added `qa:ui-theme-merge` and included it in the primary `verify` chain.
- Extended runtime QA with forced-Dark surface checks for Help, Watchlist, Orders, Positions and Settings, plus Help thumbnail rendering at 1368×753.
- Bumped package and lockfile version to `1.0.40`.

## Exact files added

```text
public/tutorial-thumbnails/getting-started.png
public/tutorial-thumbnails/first-trade.png
public/tutorial-thumbnails/portfolio.png
public/tutorial-thumbnails/security.png
scripts/qa/verifyUiThemeMerge.mjs
APEX_SAFE_UI_MERGE_REPORT_v1.0.40.md
QA/ui-safe-merge-v1.0.40.json
```

## Exact implementation files modified

```text
package.json
package-lock.json
scripts/qa/verifyWorkspaceRuntime.mts
src/components/workspace/WorkspaceShell.tsx
src/pages/help/HelpPage.css
src/pages/help/HelpPage.tsx
src/pages/watchlist/WatchlistPage.css
src/styles/reference-ui.css
src/styles/tokens.css
PROJECT_HANDOFF.md
```

Generated QA result JSON files were refreshed by the static validation runs.

## Deliberately not merged

- Older page-level TSX replacements for WorkspaceShell, Alerts, Help, History, Orders, Positions, Settings and Watchlist.
- Dead/unimported `src/styles/v3-workspace.css`.
- The visually referenced Watchlist Custom tab, because no complete persistence/behavior contract was available.
- Any route, API payload, localStorage key, financial calculation, scanner gate, strategy engine or order execution change.

## Validation

```text
Design Token Contract: PASS (5/5)
UI Theme Merge Contract: PASS (11/11)
Reference UI QA: PASS (24/24)
UI Interaction QA: PASS (28/28)
Strategy Library QA: PASS
Strategy Engines QA: PASS
Strategy Integration QA: PASS
Adaptive Governor QA: PASS
System Integration QA: PASS (12/12)
Changed TypeScript isolated syntax transpile: PASS
Changed CSS structural validation: PASS
Source-only release secret gate: PASS
```

Full dependency-backed TypeScript, Vitest, production build and Playwright runtime were not executed because dependency installation failed with a registry 404 for `why-is-node-running@2.3.0`.

## Exact next verification task

On a machine with working dependency access:

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

Then inspect Help, Watchlist, Orders, Positions and Settings in forced Light and Dark modes at 1368×753, and confirm the Help Tutorial thumbnails, explicit Settings shortcut and non-white Dark surfaces.

---

# Light Theme Release Hardening — v1.0.41

## Completed

- Centralized global UI stylesheet order in `src/main.tsx`.
- Removed duplicate shell/reference CSS imports from active components.
- Added `src/styles/light-theme-hardening.css`, scoped only to resolved Light mode.
- Hardened canvas, surfaces, borders, semantic text, selected rows, controls, focus states and legacy muted copy.
- Replaced the black legacy avatar fill with the APEX green-tint identity in Light mode.
- Added `prefers-contrast: more` and `forced-colors` support.
- Removed external Google Font requests and switched to bundled Inter/JetBrains Mono dependencies.
- Fixed the undefined Backtesting token `--bt-surface-soft`.
- Bumped Service Worker cache name to `apex-next-shell-v1.0.41`.
- Removed proven-unreachable `ReferenceViews.tsx`, `workspaceClient.ts` and duplicate Strategy CSS.
- Updated function indexes after dead-source removal.
- Added `qa:light-theme` and wired it into `verify`.
- Extended browser QA to all 14 routes in forced Light mode at 1368×753.
- Fixed the duplicate-loop syntax defect in `verifyWorkspaceRuntime.mts`.
- Bumped package and lockfile version to `1.0.41`.

## Validation

```text
Design Token Contract: PASS (5/5)
Light Theme Contract: PASS (32/32)
UI Theme Merge Contract: PASS (11/11)
Reference UI Redesign: PASS (24/24)
UI Interaction Polish: PASS (28/28)
System Integration: PASS (12/12)
Backtesting Workspace: PASS (25/25)
Consolidation Integration: PASS (15/15)
V20 Reference Contract: PASS (33/33)
V19 Contract: PASS (10/10)
Strategy Library / Integration / Engines: PASS
Adaptive Governor: PASS
TypeScript isolated syntax transpile: PASS (272 files, 0 errors)
CSS parse: PASS (26 files, 0 errors)
Source-only secret gate: PASS
```

## Environment limitation

`npm ci` was attempted, but the internal registry returned 404 for `why-is-node-running@2.3.0`. Full dependency-backed TypeScript, Vitest, production build and Playwright runtime remain mandatory on a machine with working registry access.

## Exact next release gate

```bash
npm ci
npx tsc --noEmit
npm test
npm run build
npm run verify
npm run verify:visual
```

---

## 2026-08-06 — Attached v1.0.40 parity merge → v1.0.43

Compared the complete attached `APEX-complete-ui-safe-merge-v1.0.40` source tree against v1.0.42 and merged every active, safe capability that was missing.

Completed:

- restored active `TradingToolbox.tsx` with Depth, Trades, System Link and Signals drawers;
- restored Trading activity tabs for Positions, Orders and Depth;
- restored `DrawerShell` export;
- restored Strategy primary-card clipping fix;
- restored the integrity-verified locked `vendor/yallist-3.1.1.tgz` required by `package-lock.json`;
- added `trading-toolbox-integration.css` and retained all Light Theme hardening;
- added `qa:attached-feature-parity` to the main verification chain;
- advanced package and service-worker cache to `1.0.43`.

Intentionally not merged:

- dead `ReferenceViews.tsx` monolith;
- unused `workspaceClient.ts` targeting absent server routes;
- duplicate nested Strategy stylesheet;
- opaque Windows executable and generated agent index.

Validation completed:

- attached parity: 15/15;
- workspace light polish: 15/15;
- light theme: 32/32;
- design token, UI merge, reference UI, interaction, V20, backtesting, strategy, consolidation, governor and system-integration static gates passed;
- 267 TypeScript-family files transpiled with zero syntax errors;
- 28 CSS files parsed with zero errors;
- source secret gate passed.

Runtime limitation:

- full `npm ci` remains blocked by the environment's internal npm gateway returning 404 for public packages such as `why-is-node-running`; the prior project-local missing-yallist failure is fixed.

Exact next gate on a machine with normal npm registry access:

```bash
npm ci
npm run lint
npm test
npm run build
npm run verify
npm run verify:visual
```

## 2026-08-06 — Trading chart-first drawer docking → v1.0.44

- removed the redundant Trading instrument summary panel above the chart;
- moved the complete Order Ticket and Risk Overview into the right Trading Toolbox;
- expanded the Trading Toolbox from four to five functional drawers: Order, Depth, Trades, System, Signals;
- added dock/undock support with persisted dock preference;
- kept drawers closed by default so the chart loads at maximum width;
- converted the Trading cockpit to a single chart-first column;
- preserved Positions / Orders / Depth activity tabs below the chart;
- added visible toolbox labels and dashboard-scale rail buttons;
- added `qa:trading-drawer-docking` release contract;
- advanced package and service-worker cache to `1.0.44`.

## 2026-08-06 — Strategy and Backtesting production hardening → v1.0.45

- removed static/fake Strategy metrics, sparkline paths and fixed equity preview;
- made Strategy actions reachable with a responsive, independently scrolling workspace;
- connected Strategy runs to the real `/api/market/backtest` route and validation to `/api/strategies/:strategyId/validate`;
- synchronized completed validation score and holdout evidence back into Strategy UI state;
- increased default replay history to 2,000 closed candles and exposed 500–5,000-bar controls;
- exposed 12–240-bar Max Hold controls;
- added server-side Binance Futures history pagination for research horizons up to 5,000 closed candles;
- added actual market benchmark curves and explicit no-trade diagnostics when a valid replay resolves no trades;
- added response diagnostics, runtime audit and market-curve contracts;
- applied declared Strategy Detail parameter overrides to scanner-preset engines with whitelist and bounds enforcement;
- expanded walk-forward validation to 2,400 candles with a 1,200-candle minimum;
- fixed invalid default bar parsing and added fail-safe bounded integer parsing;
- added `qa:strategy-backtest-production` to the main verification chain;
- advanced package and service-worker cache to `1.0.45`.

Validation completed:

- Strategy/Backtest Production: 21/21;
- Backtesting Workspace: 25/25;
- Strategy Integration, Library and Engine Smoke: PASS;
- System Integration: 12/12;
- Light Theme: 32/32;
- V19/V20, UI interaction, reference UI, consolidation and parity gates: PASS;
- 274 TypeScript-family files transpiled with zero syntax errors;
- source-only secret gate: PASS.

Environment limitation:

- full dependency installation stopped because the internal registry returned 404 for `vitest@4.1.10`; full TypeScript type-check, Vitest, Vite build and Playwright remain mandatory in the deployment environment.


## 2026-08-06 — External-agent audit and safe merge → v1.0.46

- compared the attached external-agent project against the production v1.0.45 tree at file and SHA-256 level;
- confirmed that the attached project had no unique active source module absent from production; its only source-only extra was the unused `src/styles/legacy-compat.css`;
- retained the production implementation of dock persistence, accessible drawer actions, Strategy Studio, Backtesting diagnostics, historical pagination, and server cost modeling because those implementations are newer and more complete;
- selectively merged the useful live stylesheet correction into `src/index.css`, including shared drawer action alignment and dock-button states;
- removed the unimported duplicate `legacy-compat.css` to prevent future edits landing in a dead file;
- removed stale fixed-order-column and deleted-instrument selectors from the active Trading CSS cascade;
- added `qa:agent-safe-merge` and machine-readable comparison evidence;
- advanced package and service-worker cache to `1.0.46`.

## 2026-08-06 — Trading submenu relocation → v1.0.47

- Removed the embedded Positions / Orders / Depth activity panel from the Trading chart column.
- Added dedicated Trading toolbox drawers for Orders and Positions while retaining Ticket, Depth, Trades, Strategy and Signals.
- Added a shared Trading toolbox request event so Orders, Positions and Strategies navigation opens the corresponding drawer when Trading is active.
- Changed both pinned and unpinned drawer states to use an adjacent right-side column; drawers no longer use absolute positioning over the chart.
- Reduced toolbox rail button height so all seven tools fit the canonical 1368×753 workspace.
- Unpinned drawers close with Escape or an outside click; pinned drawers remain open until explicitly closed.
- Added `qa:trading-submenu-relocation` and advanced package/service-worker cache versions to `1.0.47`.


## 2026-08-07 — Liquidity Hunter shadow core + optimizer safety → v1.0.49

- Preserved the v1.0.47 Liquidity Hunter foundation and ported the v1.0.48 replay-cache/adaptive-threshold improvements into the canonical tree.
- Implemented ten Liquidity Hunter edge evaluators, four deterministic setup layers, regime-aware Dynamic Fusion, freshness enforcement, and a separate setup-state lifecycle.
- Kept the Liquidity Hunter core `shadowOnly: true`, `authoritative: false`, `automaticPromotionEnabled: false`, with no order-authorizing dependency.
- Added a dedicated Node worker thread for append-only realtime event persistence; main-thread event processing waits on durable acknowledgements without performing filesystem fsync itself.
- Made TRADE events lossless by default, kept only sentiment sampleable, added explicit publish dispositions, bounded realtime series, shared order-book sequence families, and immediate invalidation on sequence gaps.
- Added normalized market payload contracts and order-book reconstruction foundations for future real L2 adapters.
- Hardened strategy optimization with purge/embargo isolation and explicit manual promotion. Legacy `autoPromote` requests are ignored and stale reviewed reports cannot be promoted.
- Added `/api/liquidity-hunter/state/:symbol` and `/api/liquidity-hunter/shadow/evaluate`; the latter concurrently resolves server-side candle context and cannot submit orders or promote thresholds.
- Added standalone deterministic QA for the Liquidity Hunter core and optimizer governance.
- Updated OpenAPI, environment documentation, package/service-worker identity, and release documentation to `1.0.49`.
- Production options GEX, liquidation-topology providers, Hyperliquid wallet feeds, external sentiment/meta-model feeds, and a read-only websocket transport are not claimed as connected until verified provider integrations exist.
- Autonomous live execution remains disabled; existing manual/live preview, Risk Governor, execution-intent persistence, and reconciliation controls were not bypassed.


## 2026-08-07 — Event validation + public evidence observation + paper canary → v1.0.50

- Preserved the v1.0.49 Liquidity Hunter core, optimizer safety controls, Risk Governor, TradePlan, execution-intent persistence, and all registered strategy identities.
- Added a credential-free Deribit public options collector using official public recent-option trades and current ticker Greeks/open interest. This is explicitly a shadow proxy rather than reconstructed historical dealer inventory, and downstream data quality is capped.
- Restricted Deribit endpoint overrides to official HTTPS Deribit hosts.
- Added a public Hyperliquid wallet watchlist observer. Raw wallet addresses are pseudonymized before events enter the central bus/log; the collector publishes `UNRATED` observations only and cannot create S/A/F grading evidence without audited long-history metrics.
- Fixed wallet-grade parsing so missing PnL/drawdown fields remain null rather than being coerced to zero.
- Added purged/embargoed event-level walk-forward validation with a final untouched holdout and bounded concurrent fold evaluation.
- Added deterministic signal-price forward-outcome analysis (MFE/MAE, invalidation, 1R/2R, analytical cost haircut) that explicitly does not simulate fills.
- Added a research-only paper canary with local atomic persistence. It observes eligible manual-confirmation setups and market prices but has no exchange dependency and no order-submission capability.
- Added a side-effect-free recorded-event validation CLI and machine-readable QA evidence.
- Autonomous live execution, automatic strategy promotion, and Liquidity Hunter order authorization remain disabled.


## 2026-08-07 — Predictive evidence + historical grading + microstructure simulation → v1.0.51

- Added optional Hyblock v2 predictive liquidation-topology ingestion behind a default-off server-side key and official-host allowlist.
- Hardened liquidation evidence so observed liquidation prints cannot masquerade as predictive topology.
- Replaced the preferred Deribit current-ticker-gamma proxy with event-time gamma reconstruction from trade IV, strike, expiry and observed index price; retained current ticker gamma only as a lower-quality fallback.
- Added bounded historical Deribit option-flow import with recursive saturated-window subdivision and no fabricated historical open interest.
- Added fee/funding-adjusted long-history Hyperliquid wallet grading with completeness, sample-length, drawdown, profit-factor and sizing-consistency gates; incomplete histories remain `UNRATED`.
- Added internal grading provenance and hardened whale/F-grade edges against externally forged declared grades.
- Added deterministic event-level microstructure fill approximation with queue-ahead consumption, partial fills, explicit latency, spread/slippage, fees and conservative protective exits.
- Upgraded microstructure batching to a persistent bounded Node worker-thread pool.
- Added microstructure validation and Deribit historical-import CLIs plus machine-readable QA artifacts.
- Autonomous Liquidity Hunter execution, automatic threshold promotion and direct order authorization remain disabled.
