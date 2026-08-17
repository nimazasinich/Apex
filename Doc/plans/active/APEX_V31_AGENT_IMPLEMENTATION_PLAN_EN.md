# APEX V31 Consolidation and Feature-Recovery Implementation Plan

**Purpose:** Provide an implementation-ready plan for an autonomous coding agent.

**Source baseline:** `_deliverables.zip`, package version `1.0.22`.

**Reviewed comparison archive:** `APEX-ui-v20-updated.zip`, package version `1.0.20`.

**Target release:** `1.0.23` or the next available patch version.

## 1. Objective

Improve the current APEX application without replacing its active V20/V31 architecture. Recover useful capabilities from orphaned V3/APEX-NEXT files, correct confirmed runtime defects, split oversized active views into maintainable page modules, remove duplicates and mock implementations, harden the release workflow, and regenerate documentation from the final source tree.

The current runtime remains authoritative:

- `src/App.tsx`
- `src/components/workspace/WorkspaceShell.tsx`
- `src/components/workspace/ReferenceViews.tsx`
- `src/components/workspace/AccountViews.tsx`
- `src/pages/backtesting/BacktestingPage.tsx`
- `src/pages/strategies/StrategyPage.tsx`
- current services under `src/services/**`
- `server.ts` and `src/services/apexNextMarketRoutes.ts`

Legacy files are sources for selected UX or logic only. They must not replace the active runtime wholesale.


## 1.1 V20 comparison archive decision

A complete file-level comparison was performed against `APEX-ui-v20-updated.zip` before updating this plan.

Verified results:

- the V20 archive contains 423 ZIP entries and 365 clean relevant files;
- every clean V20 file already exists in the V31 baseline;
- there are zero V20-only clean files;
- 334 files are byte-identical;
- 31 common files differ;
- V20 registers 86 API routes and V31 registers 97;
- V20 has no route that is missing from V31;
- V20 contains 17 conventional test/spec files and V31 contains 26;
- the only V20 exported UI symbol absent under the same file is `MarketsView`, which was moved and superseded by `src/components/workspace/MarketsPage.tsx`.

Implementation decision:

1. Do not copy any V20 source file over the V31 baseline.
2. Do not restore the old inline Markets page, boolean timeframe-confluence helper, or shortcut replay implementation.
3. Treat V20 only as a historical regression reference.
4. If a future archive is reviewed, require a path, export, route, behavior, and test comparison before accepting any file.
5. A file qualifies for extraction only when it provides a capability missing from V31 and can be integrated without weakening current data honesty, canonical decision, TradePlan, Risk Governor, security, or QA contracts.

This comparison does not change the feature-recovery scope already defined below. The useful orphan V3 components identified in the main baseline remain the intended recovery sources; the separate V20 archive contributes no additional source code.

## 2. Non-negotiable engineering rules

1. Do not fabricate market, account, health, correlation, strategy, or performance data.
2. Do not treat APEX Score, ranking score, readiness score, or confidence as calibrated win probability.
3. Do not restore automatic backtest execution. A backtest must run only after an explicit user action.
4. Do not restore old account endpoints solely to make orphan V3 clients work. Use `/api/account/workspace` and `WorkspaceInsights` unless a genuinely new contract is required.
5. Do not bypass `TradePlan`, `validateTradePlanGeometry`, Risk Governor, order preview, confirmation, or server-side security checks.
6. All browser-side mutating `/api/*` requests must use `apiMutate` or the shared mutation-header utility.
7. Do not expose credentials to the browser, logs, generated documentation, screenshots, release ZIPs, or fixtures.
8. Do not delete a service until imports from `src/**`, `scripts/**`, QA scripts, tests, and package scripts have been checked.
9. Each migrated page must preserve honest loading, empty, degraded, unavailable, and error states.
10. Maintain the canonical 1368×753 desktop contract and reduced-motion behavior.
11. Never overwrite a current file with an older archive version unless a file-level comparison proves a missing capability and the import has explicit tests and acceptance criteria.

## 3. Delivery strategy

Implement the work in independent phases. Each phase should be a separate pull request or reversible commit group. Do not perform the final cleanup until all recovered features have passed their acceptance tests.

Recommended branch:

```text
feature/v31-consolidation-and-feature-recovery
```

Recommended commit order:

1. `chore(security): sanitize release inputs and establish baseline`
2. `fix(strategy): secure validation mutations and add direction selection`
3. `feat(backtesting): restore explicit long-short selection`
4. `feat(operations): add system health drawer`
5. `feat(analytics): integrate live correlation matrix`
6. `feat(trading): add canonical trade-plan risk-reward visualization`
7. `feat(journal): rebuild decision journal on canonical decision memory`
8. `refactor(pages): migrate selected V3 panels to current workspace contracts`
9. `refactor(ui): split reference views and consolidate styles`
10. `chore(cleanup): remove superseded and duplicate files`
11. `chore(release): enforce full verification and regenerate documentation`

---

# Phase 0 — Security, inventory, and reproducible baseline


## 0.0 Comparative archive intake gate

Before importing code from any alternate APEX archive:

1. Compare normalized file paths after excluding dependencies, build output, runtime logs, and generated artifacts.
2. Identify archive-only files, changed common files, exported symbols, registered routes, package scripts, and conventional tests.
3. Compare behavior, not only filenames or line counts.
4. Reject files that weaken current security, evidence-quality handling, canonical decision, TradePlan, Risk Governor, or execution reconciliation.
5. Produce a disposition manifest with one of: `IMPORT`, `PORT SELECTED LOGIC`, `REFERENCE ONLY`, or `REJECT`.
6. Do not include rejected source files in a recovery ZIP.

V20 gate result: `REJECT ALL SOURCE IMPORTS`; retain comparison evidence only.


## 0.1 Remove and rotate exposed secrets

Treat values contained in these files as compromised:

- `.env`
- `.env.txt`
- `.external-api-sources.config.json`
- `.kilo/router/secrets.local.env`
- any populated secret file under `.kilo/**`

Actions:

1. Revoke or rotate every populated token/API key.
2. Remove secret-bearing files from the deliverable and repository history where applicable.
3. Retain only safe templates:
   - `.env.example`
   - `.external-api-sources.config.example.json`
4. Confirm `.gitignore` covers local secret variants.
5. Update `scripts/gates/checkNoSecretsInRelease.mjs` if it does not inspect nested tool directories and generated archives.
6. Ensure `createReleaseArchive.mts` uses an allowlist rather than packaging the repository indiscriminately.

Acceptance criteria:

- `npm run release:gate` passes.
- A release ZIP contains no `.env`, credential JSON, private key, certificate key, router secret, or populated config file.
- Secret templates contain placeholders only.

## 0.2 Establish a clean baseline

Use a healthy npm registry and the committed lockfile:

```bash
npm ci
npm run lint
npm test
npm run build
npm run qa:v19-contract
npm run qa:v20-contract
npm run qa:backtesting-workspace
npm run qa:strategy-library
npm run qa:strategy-engines
npm run qa:strategy-integration
npm run qa:ui-1368
```

Store results under `QA/consolidation-baseline/`:

- command
- exit code
- timestamp
- summarized failure
- screenshot or report path where relevant

Do not modify application behavior merely to make a static string-check pass. Fix tests when they assert obsolete architecture; fix code when a valid contract fails.

---

# Phase 1 — Strategy validation and direction correctness

## 1.1 Secure Strategy Validation

**File:** `src/pages/strategies/StrategyPage.tsx`

Current defect: `runValidation()` sends a direct POST without the required `X-APEX-CSRF` mutation header.

Implementation:

1. Import `apiMutate` from `src/services/apiMutate.ts`.
2. Replace the direct validation `fetch()` call with:

```ts
const response = await apiMutate(
  `/api/strategies/${encodeURIComponent(selected.strategyId)}/validate`,
  {
    method: 'POST',
    body: JSON.stringify({ symbol, interval, direction, maxBars }),
  },
);
```

3. Do not manually duplicate CSRF headers in page code.
4. Preserve server error messages for `404`, `409`, `422`, and validation failures.
5. Add an abort or request identity guard so switching strategies cannot display a previous strategy’s result.

## 1.2 Add explicit Strategy direction selection

Current Strategy backtest and validation requests hard-code `LONG`.

Implementation:

1. Add `TradeDirection` state to `StrategyPage`.
2. Derive allowed directions from `selected.scannerConfigOverrides?.directionBias`:
   - `LONG_ONLY` → LONG only
   - `SHORT_ONLY` → SHORT only
   - `BOTH` or missing → LONG and SHORT
3. When the selected strategy changes:
   - keep the current direction if supported;
   - otherwise select the first allowed direction.
4. Add a segmented LONG/SHORT control near the selected strategy’s run controls.
5. Pass the selected direction to both:
   - `/api/market/backtest`
   - `/api/strategies/:strategyId/validate`
6. Include direction in result identity and stale-result detection.
7. Include direction in toast messages and exported result filenames where applicable.

Recommended reusable component:

```text
src/components/ui/DirectionSelector.tsx
```

Props:

```ts
interface DirectionSelectorProps {
  value: TradeDirection;
  allowed: TradeDirection[];
  disabled?: boolean;
  onChange: (value: TradeDirection) => void;
  ariaLabel: string;
}
```

## 1.3 Strategy tests

Add or update tests to verify:

- validation uses `apiMutate`/mutation headers;
- LONG and SHORT are sent correctly;
- unsupported directions are unavailable;
- changing strategy invalidates or marks old results stale;
- blocked strategies still cannot run;
- validation response status is displayed honestly.

Update:

- `scripts/qa/verifyStrategyIntegration.mjs`
- `scripts/qa/verifyStrategyLibrary.mjs`

Acceptance criteria:

- Strategy validation no longer returns `403 csrf_required` in a normal browser session.
- A BOTH strategy can run and validate in both directions.
- A one-direction strategy cannot submit an unsupported direction.

---

# Phase 2 — Restore LONG/SHORT selection in active Backtesting

**Source of useful behavior:** `src/components/BacktestingPage.tsx`

**Destination:** `src/pages/backtesting/BacktestingPage.tsx`

Do not replace the active Backtesting page. Port only the direction selector and related state behavior.

Implementation:

1. Change:

```ts
const [direction] = useState<TradeDirection>('LONG');
```

into:

```ts
const [direction, setDirection] = useState<TradeDirection>('LONG');
```

2. Recreate the two-button segmented selector from the legacy page using active CSS conventions.
3. Place it in the configuration panel beside Starting Capital or Strategy configuration.
4. Direction changes must:
   - update `currentConfig`;
   - mark the existing result stale;
   - not automatically run a new backtest;
   - update export filenames;
   - update run history labels.
5. Confirm query construction sends the selected direction.
6. Ensure trade/result visualizations do not assume LONG when interpreting labels or favorable movement.
7. Keep the explicit “Run Backtest” requirement.

Tests and QA:

- Add unit/static assertions for a writable direction state and both buttons.
- Update `scripts/qa/verifyBacktestingWorkspace.mjs` to require LONG and SHORT controls.
- Run one deterministic LONG and one deterministic SHORT engine smoke test.
- Capture the Backtesting page at 1368×753 in both directions.

Acceptance criteria:

- Direction changes do not start a request.
- Clicking Run sends the selected direction.
- Existing results display a stale indicator after direction changes.
- Exports contain the selected direction in metadata and filename.

---

# Phase 3 — System Health Drawer

**Source:** `src/components/SystemHealthModal.tsx`

**Active integration point:** `ReferenceHelpView` in `src/components/workspace/ReferenceViews.tsx`

The legacy modal has useful data but obsolete styling. Rebuild it rather than importing it unchanged.

## 3.1 New component

Create:

```text
src/components/workspace/SystemHealthDrawer.tsx
```

Requirements:

- Use `SystemHealthReport` from `src/types.ts`.
- Fetch with `fetchJsonWithTimeout('/api/system/health')`.
- Show explicit loading, retry, error, and last-updated states.
- Display only fields returned by the server:
  - KuCoin state
  - Binance state
  - sentiment state
  - cache hit rate and query counts
  - server uptime
  - active candidate count
  - last scan timestamp
  - diagnostic events
- Use the current workspace primitives/tokens.
- Use `useDialogA11y` or equivalent focus trapping, Escape close, focus restoration, and `aria-modal` semantics.
- Poll only while open, at a conservative interval such as 30–60 seconds.
- Stop polling when closed or unmounted.

## 3.2 Help integration

1. Add local open/close state to the active Help page.
2. Convert the existing “View Status” text into a real button.
3. Open `SystemHealthDrawer` from that button.
4. Keep the compact status summary in the Help sidebar.
5. Optionally add a Diagnostics shortcut to `WorkspaceShell` only after the Help integration passes QA.

## 3.3 Backend honesty

Inspect `/api/system/health`. Improve metrics only when real counters are available. Do not invent cache statistics, successful feeds, or candidate counts to fill the UI.

Acceptance criteria:

- “View Status” is keyboard- and mouse-operable.
- The drawer renders real endpoint data and handles endpoint failure.
- No polling occurs while closed.
- Focus returns to the trigger after close.

---

# Phase 4 — Correlation Matrix in active Analytics

**Source:** `src/components/CorrelationMatrixCard.tsx`

**Endpoint:** `GET /api/market/correlation?limit=8`

Do not use the legacy component unchanged because it depends on old primitives and color tokens.

## 4.1 Extract reusable correlation view

Create:

```text
src/pages/analytics/components/CorrelationMatrix.tsx
```

Preserve:

- real API request;
- D3 heatmap rendering;
- responsive ResizeObserver behavior;
- Heatmap and Pairs views;
- symbol selection;
- correlation values and pair ranking.

Replace:

- legacy `SectionCard`, `Pill`, `FilterTabs`, and `StatusBadge` dependencies;
- hard-coded purple APEX-NEXT colors;
- untyped `any` errors;
- unconditional one-minute polling when the Analytics page is not visible.

Use:

- current V20/V31 CSS variables;
- `fetchJsonWithTimeout`;
- AbortController;
- accessible labels and table fallback.

## 4.2 Active Analytics integration

Short-term option:

- Extend `ReferenceAnalyticsView` and render the new component.

Preferred migration option:

- Adapt `src/pages/analytics/AnalyticsPage.tsx` to current props and make it the active page.

Expected props:

```ts
interface AnalyticsPageProps {
  account: ReferenceAccountProps;
  market: ReferenceMarketProps;
}
```

Data mapping:

- performance/account analytics → `account.insights?.analytics`;
- activities/history → `account.insights?.activities`;
- market context → current candidates and tickers;
- correlation → `/api/market/correlation`.

Clicking a symbol should call `market.onSelectSymbol(symbol)` and may navigate to Trading only if that behavior is explicitly passed by the parent.

Acceptance criteria:

- No synthetic matrix is shown.
- Empty or unavailable correlation data is clearly labeled.
- Heatmap is usable at 1368×753 and narrow widths.
- Selecting a symbol updates application context.

---

# Phase 5 — Canonical Risk/Reward visualization in Trading

**Sources for visual ideas:**

- `src/components/RiskRewardSlider.tsx`
- selected level/risk visuals from `src/components/SymbolDetailDrawer.tsx`

Do not port probability overrides, independent position sizing, or legacy journal coupling.

## 5.1 New read-only component

Create:

```text
src/components/trading/TradePlanRiskReward.tsx
```

Input:

```ts
interface TradePlanRiskRewardProps {
  plan: TradePlan;
  currentPrice?: number | null;
  compact?: boolean;
}
```

Behavior:

1. Validate the plan using `validateTradePlanGeometry` before rendering geometry.
2. Display:
   - direction;
   - entry range;
   - stop;
   - targets;
   - risk distance;
   - reward distance per target;
   - R multiple per target;
   - expiry when present.
3. Render a direction-aware scale:
   - LONG: stop below entry, targets above;
   - SHORT: stop above entry, targets below.
4. If geometry is invalid, show a blocked diagnostic instead of attempting to normalize or repair values silently.
5. Do not label score/confidence as probability.

## 5.2 Trading integration

Integrate into the active `TradingView`/order ticket using `tradePlanLong` and `tradePlanShort` already supplied by `App.tsx`.

Rules:

- Display the plan corresponding to the user-selected order direction.
- The component is informational; order submission remains governed by preview and confirmation.
- No local component may independently calculate executable size or bypass the existing server preview.

Acceptance criteria:

- Correct LONG and SHORT geometry.
- Invalid plans are blocked visibly.
- No order authority is moved into the visualization.

---

# Phase 6 — Rebuild Decision Journal on canonical Decision Memory

**UX source:** `src/components/DecisionJournalModal.tsx`

**Canonical data source:**

- `SignalDecisionLog` in `src/types.ts`
- `DecisionMemoryDB` in `src/services/decisionMemory.ts`

The legacy journal’s calibration model must not be retained.

## 6.1 Extend DecisionMemoryDB safely

Add methods such as:

```ts
get(id: string): Promise<SignalDecisionLog | null>
patch(id: string, changes: Partial<Pick<SignalDecisionLog, 'laterOutcome' | 'laterPnl'>>): Promise<void>
delete(id: string): Promise<void>
```

Requirements:

- work with IndexedDB and localStorage fallback;
- preserve existing fields;
- queue the updated row for backend mirror;
- never let mirror failure block local updates;
- validate `laterOutcome` values;
- accept `laterPnl` as R-multiple or clearly document its unit consistently.

## 6.2 New journal UI

Create:

```text
src/components/workspace/DecisionJournalDrawer.tsx
```

Features:

- list recent decision logs;
- filters for decision, direction, outcome, ticker, reason code, and date range;
- accepted/rejected counts;
- outcome editing for accepted decisions;
- optional outcome tagging for rejected decisions when replay resolves them;
- JSON and CSV export;
- clear, paginated or virtualized table for large datasets;
- refresh and empty/error states.

Replace the old Calibration tab with **Outcome Breakdown**:

- resolved wins/losses/breakevens/expired;
- acceptance rate;
- average `laterPnl`;
- breakdown by readiness tier, reason code, direction, or strategy/regime only when those fields exist;
- explicitly state that ranking score is not calibrated probability.

## 6.3 Access point

Add a “Decision Journal” shortcut to either:

- `WorkspaceShell` utility area, or
- Overview/Help operations actions.

Do not add a new full page unless product navigation requires it.

Tests:

- IndexedDB success path;
- localStorage fallback path;
- patch preserves untouched fields;
- mirror failure does not lose local updates;
- score is never rendered as predicted probability.

Acceptance criteria:

- Existing canonical decision rows appear without migration to a second store.
- Updating an outcome persists after reload.
- Export reflects active filters.
- No fabricated calibration report remains.

---

# Phase 7 — Recover selected V3 page capabilities

The orphan V3 pages are refactor sources, not drop-in replacements. They must be rewired to current props and `WorkspaceInsights`; do not revive their deleted endpoints by default.

Implement one page per commit.

## 7.1 Positions

**Source:** `src/pages/positions/PositionsPage.tsx`

Recover:

- allocation visualization;
- leverage distribution;
- liquidation-distance/gap panel.

Map to current account data. If the exchange snapshot does not provide a required value, show unavailable instead of estimating.

## 7.2 Alerts

**Source:** `src/pages/alerts/AlertsPage.tsx`

Recover:

- rule builder;
- templates;
- trigger context.

Adapt to the current `AlertRule` contract. Do not create unsupported indicator rule types. Templates must generate valid current rules only.

## 7.3 Orders

**Source:** `src/pages/orders/OrdersPage.tsx`

Recover:

- execution context;
- fill-quality summaries when the current account snapshot contains sufficient data.

Preserve current cancel and duplicate behaviors. Do not infer fill quality from missing data.

## 7.4 History

**Source:** `src/pages/history/HistoryPage.tsx`

Use:

- `WorkspaceInsights.activities`;
- current filtering and pagination;
- CSV export with ISO timestamps.

Do not call `/api/account/history`.

## 7.5 Analytics

**Source:** `src/pages/analytics/AnalyticsPage.tsx`

Use:

- `WorkspaceInsights.analytics`;
- current market candidates/tickers;
- the new Correlation Matrix;
- report download based only on displayed real data.

Do not call `/api/account/analytics`.

## 7.6 Watchlist, Settings, and Help

These are lower priority:

- Watchlist: recover the Asset Assistant panel only if it can consume current market data without hidden mock values.
- Settings: recover sectioned navigation/layout while preserving current secure account connection logic.
- Help: keep local/static help content initially; do not restore `/api/help/topics` or `/api/help/announcements` unless product requirements explicitly define managed content.

## 7.7 Active routing migration

For each successfully adapted page:

1. Export a page component from its `src/pages/<page>/` path.
2. Replace the corresponding `Reference*View` import/use in `src/App.tsx`.
3. Preserve the exact page ID/hash.
4. Remove the old function from `ReferenceViews.tsx` only after parity tests pass.
5. Move shared prop interfaces into a neutral file such as:

```text
src/pages/pageContracts.ts
```

Acceptance criteria per page:

- same route/hash;
- no new missing endpoint;
- no regression in existing actions;
- honest data states;
- 1368×753 layout acceptance;
- keyboard accessibility.

---

# Phase 8 — Split oversized active views and consolidate UI primitives

## 8.1 Split `ReferenceViews.tsx`

Final target:

```text
src/pages/watchlist/WatchlistPage.tsx
src/pages/orders/OrdersPage.tsx
src/pages/positions/PositionsPage.tsx
src/pages/alerts/AlertsPage.tsx
src/pages/history/HistoryPage.tsx
src/pages/analytics/AnalyticsPage.tsx
src/pages/settings/SettingsPage.tsx
src/pages/help/HelpPage.tsx
```

Move only one page at a time. Avoid a large mechanical rewrite that mixes visual, data, and behavior changes.

## 8.2 Consolidate primitives

Evaluate:

- `src/components/ui/WorkspacePrimitives.tsx`
- active reusable helpers in `ReferenceViews.tsx`
- active helpers in `AccountViews.tsx`

Promote stable primitives into:

```text
src/components/workspace/primitives/
```

Examples:

- page title/header;
- metric card;
- empty state;
- pagination;
- status pill;
- context-sidebar section;
- filter/search row.

Do not keep both old and new primitives indefinitely.

## 8.3 CSS consolidation

Current large stylesheets include:

- `src/index.css`
- `src/styles/v3-workspace.css`
- `src/styles/legacy-compat.css`
- page-specific Strategy and Backtesting CSS.

Procedure:

1. Build a class usage report from TSX and HTML.
2. Mark each rule as active, migration-only, or unused.
3. Move page-specific rules beside the active page where practical.
4. Remove unused legacy selectors only after screenshot comparison.
5. Preserve tokens, reduced motion, focus states, and canonical geometry.

Do not attempt a full design-system rewrite in the same release.

---

# Phase 9 — Cleanup after successful migrations

Delete only after import graph, tests, QA scripts, and runtime checks pass.

## 9.1 Exact or near duplicates

- Delete `src/pages/components/workspace/AccountViews.tsx` after verifying byte parity.
- Diff `src/pages/pages/strategies/StrategyPage.css` against the active Strategy CSS, transfer any unique required rules, then delete it.

## 9.2 Superseded mock/legacy UI

Archive first, then delete in a later commit if release QA passes:

- `src/pages/StrategyStudioPage.tsx`
- `src/pages/StrategiesPage.tsx`
- `src/pages/StrategyDetailPage.tsx`
- `src/components/BacktestModal.tsx`
- `src/components/BacktestingPage.tsx` after direction-port parity
- `src/app/shell/AppShell.tsx`
- `src/components/NavBar.tsx` after Journal/Diagnostics shortcuts are recovered
- `src/components/SettingsModal.tsx`
- `src/components/workspace/SettingsView.tsx`
- legacy dashboard component cluster after Correlation, Health, Journal, and Risk/Reward migration

## 9.3 Disconnected client

`src/services/workspaceClient.ts` must not remain as an invalid alternate contract.

After all V3 pages are migrated:

- delete it if no valid consumers remain; or
- reduce it to wrappers around current endpoints if a shared client adds real value.

Do not leave methods for nonexistent endpoints.

## 9.4 Preserve script/QA/ML services

Do not remove services used by package scripts, including:

- adaptive learning stress;
- provider routing stress;
- direction divergence analysis;
- rejected candidate replay;
- ML dataset/training/comparison;
- replay harnesses;
- strategy engines and governance services.

---

# Phase 10 — Release verification and documentation regeneration

## 10.1 Add a full verification command

Add to `package.json`:

```json
{
  "scripts": {
    "verify": "npm run lint && npm test && npm run build && npm run qa:v19-contract && npm run qa:v20-contract && npm run qa:backtesting-workspace && npm run qa:strategy-library && npm run qa:strategy-engines && npm run qa:strategy-integration && npm run docs:check && npm run release:gate"
  }
}
```

If `qa:ui-1368` is reliable in CI, add it to a separate `verify:visual` job because it requires Python/browser availability.

Update `release:package` so a package cannot be created before full verification succeeds.

## 10.2 Add consolidation-specific QA

Create:

```text
scripts/qa/verifyConsolidationIntegration.mjs
```

It should verify at minimum:

- Strategy mutation uses the shared mutation helper;
- Strategy and Backtesting expose both directions where permitted;
- no active code imports deleted mock pages;
- active Help has a real System Health trigger;
- active Analytics includes the correlation component;
- Decision Journal uses `DecisionMemoryDB`;
- no active V3 page calls deleted account/help endpoints;
- no direct browser POST to `/api/*` remains outside approved helpers;
- duplicate paths are absent after cleanup.

Static QA is supplemental. It does not replace runtime tests.

## 10.3 Runtime smoke matrix

Start the real Express application, not a static file server, then verify:

```text
GET  /api/health
GET  /api/system/health
GET  /api/market/top-volume
GET  /api/market/correlation?limit=8
GET  /api/strategies
GET  /api/strategies/:strategyId
POST /api/strategies/:strategyId/validate
GET  /api/market/backtest?...direction=LONG
GET  /api/market/backtest?...direction=SHORT
GET  /api/account/workspace
POST /api/decision-memory/batch
```

Expected error states for missing exchange credentials must be valid governed responses, not route 404s.

## 10.4 Regenerate documentation

After source cleanup and successful verification:

```bash
npm run index:functions
npm run index:docs
npm run docs:check
npm run repo:audit
```

Update the visual HTML documentation to reflect the generated truth:

- current package version;
- 14 active pages;
- current API route count;
- Strategy Studio status as implemented, with any experimental engines labeled accurately;
- actual module/test counts using documented inclusion rules;
- active component mappings, not legacy dashboard names;
- recovered System Health, Correlation, direction selection, Journal, and Trading R/R features;
- distinction between production, shadow/governed, and planned systems.

Do not manually hard-code counts that can be generated.

---

# Test plan

## Unit tests

1. `apiMutate` adds mutation headers and preserves caller headers.
2. Strategy direction restrictions follow `directionBias`.
3. Backtesting config identity includes direction.
4. Risk/Reward geometry handles LONG and SHORT.
5. Invalid TradePlan geometry is rejected.
6. DecisionMemory patch/update preserves rows and fallback behavior.
7. Alert templates create valid current `AlertRule` objects.
8. Correlation formatting and empty-state logic.

## Integration tests

1. Strategy validation succeeds with CSRF protection enabled.
2. LONG and SHORT backtests call the same canonical replay route.
3. Health drawer handles live, degraded, unavailable, timeout, and malformed-response cases.
4. Correlation page handles live and unavailable endpoint states.
5. Decision Journal persists outcome changes across reload.
6. Each migrated page consumes `WorkspaceInsights` rather than deleted V3 endpoints.

## Visual tests

Capture at minimum:

- Backtesting LONG;
- Backtesting SHORT;
- Strategy LONG/SHORT selector;
- Analytics with correlation heatmap;
- System Health Drawer;
- Trading R/R for LONG and SHORT;
- Decision Journal populated and empty;
- migrated Positions and Alerts pages.

Viewports:

- canonical `1368×753`;
- one narrow responsive viewport;
- light and dark themes where supported.

## Accessibility tests

- all drawers trap focus and restore it;
- Escape closes overlays;
- segmented controls expose selected state;
- heatmap has a textual/table alternative;
- color is not the sole indicator;
- reduced motion disables decorative animation;
- no clickable `<a>` without href or handler remains.

## Security tests

- no secret-bearing files in release archive;
- no credentials in browser bundle;
- all mutating API calls include shared CSRF headers;
- no unsafe HTML injection in logs, help content, or error messages;
- exports contain user data only after explicit action.

---

# Global definition of done

The project is ready for release only when all conditions below are true:

1. Exposed credentials have been rotated and removed from deliverables.
2. `npm ci`, lint, tests, build, core QA, Strategy QA, and release gate pass from a clean checkout.
3. Strategy Validation succeeds without a CSRF error.
4. Strategy and Backtesting support explicit direction selection correctly.
5. System Health, Correlation Matrix, canonical Risk/Reward, and Decision Journal are connected to real current contracts.
6. Migrated V3 pages use `WorkspaceInsights` and current APIs; no active code calls deleted endpoints.
7. No ranking score is presented as calibrated probability.
8. No backtest starts automatically.
9. Duplicates and confirmed superseded mocks are removed or isolated outside the release package.
10. Release packaging is allowlisted and verification-gated.
11. Documentation indexes and visual documentation are regenerated after the final code state.
12. Canonical 1368×753 and accessibility checks pass.

# Rollback strategy

- Keep each phase independently revertible.
- Do not delete source files in the same commit that introduces their replacement; delete them after one successful verification cycle.
- For page migrations, retain the previous active component behind a temporary local feature flag only during development; remove the flag before release.
- If a recovered panel lacks trustworthy data, ship the rest of the phase and leave that panel disabled with a documented reason rather than filling it with estimates.

# Final implementation priority

0. Enforce the comparative archive intake gate; do not import the reviewed V20 source.
1. Security cleanup and baseline.
2. Strategy CSRF fix.
3. LONG/SHORT in Strategy and Backtesting.
4. System Health Drawer.
5. Correlation Matrix.
6. Trading Risk/Reward visualization.
7. Decision Journal rewrite.
8. Positions and Alerts panel recovery.
9. History, Analytics, Orders, Watchlist, Settings, and Help page splitting.
10. Legacy cleanup, release hardening, and documentation regeneration.
