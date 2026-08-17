# APEX V31 System Integration Upgrade — 1.0.30

## Scope

This pass treats Trading, Backtesting and Strategy Studio as one application system rather than three disconnected screens. It also addresses the CSS-minification warning and the oversized entry chunk shown in the 1.0.29 build log.

## Research basis

The implementation follows these external principles:

- React route modules are deferred with `lazy()` and displayed through a `Suspense` fallback.
- Vite/Rollup code splitting is driven by dynamic imports plus explicit vendor chunk grouping.
- Tailwind source detection is constrained to application source instead of scanning documentation and QA text.
- Historical replay uses closed-candle information and explicitly records no-lookahead policy.
- Commission, slippage, funding and fill assumptions belong in the replay engine/reality model, not as a second UI-only deduction.

Primary references used during the pass:

- React `lazy` and `Suspense`: `react.dev/reference/react/lazy`, `react.dev/reference/react/Suspense`
- Vite production build and Rollup chunking: `vite.dev/guide/build`, `rollupjs.org/configuration-options`
- Tailwind source detection: `tailwindcss.com/docs/detecting-classes-in-source-files`
- Trading strategy lookahead behavior: `tradingview.com/pine-script-docs/concepts/strategies/`
- Slippage and fill models: QuantConnect reality-modeling documentation

## Critical logic defect corrected

The previous Backtesting UI calculated a net result by subtracting commission, slippage and funding from `rMultiple × riskPct`. The backend strategy paths already incorporated transaction costs. This created a double-cost deduction and made UI output inconsistent with engine output.

The corrected path is now:

1. Backtesting UI submits commission, slippage and funding assumptions.
2. The backend clamps and combines them into one round-trip transaction-cost value.
3. Both bespoke strategy engines and scanner-preset adapters apply that value exactly once.
4. The backend returns the adjusted result plus the applied cost model.
5. The UI only scales the returned R multiple by the selected risk percentage.

## Backend changes

### Replay contract

`BacktestResult` now supports:

- per-side commission and slippage;
- funding estimate;
- total round-trip cost;
- `appliedByEngine` evidence;
- run ID and engine identifier;
- generated timestamp;
- closed-candle flag;
- no-lookahead policy;
- fill policy;
- deterministic flag;
- configuration fingerprint.

### Strategy engines

The scanner-preset adapter now rebuilds each trade from gross P&L and the selected transaction-cost model, then re-finalizes summary and equity metrics. Bespoke engine paths receive the same transaction-cost input.

### Strategy validation state

The strategy list/detail routes merge current process-local validation rank, holdout metrics and cost-stress status into strategy definitions. The Strategy frontend therefore reflects the backend’s latest validated state rather than maintaining a disconnected local badge.

## Frontend system coordination

### Shared context

`src/lib/workspaceContext.ts` stores the active:

- strategy ID and name;
- market symbol;
- LONG/SHORT direction;
- interval;
- latest replay run ID and key performance metrics.

This state is session-scoped, not a permanent credential or global account setting.

### Strategy Studio

- Own CSS remains page-scoped.
- Validation and replay requests use `AbortController` plus request-identity guards.
- Changing strategy or direction aborts stale work.
- Successful validation updates the displayed strategy state.
- Successful replay publishes evidence to the shared workspace context.
- Direct actions open the full Backtesting Lab or Trading Cockpit without losing selected context.

### Backtesting Lab

- Reads Strategy Studio context on entry.
- Sends the visible cost model to the backend.
- Publishes the completed replay to the system context.
- Displays run ID, engine, closed-candle policy and no-lookahead status.
- Adds coordinated navigation back to Strategy and forward to Trading.
- Does not fabricate results and does not apply transaction cost twice.

### Trading Cockpit

- Reads the selected strategy/direction/interval and latest replay evidence.
- Adds a compact System Link card beside existing market/risk intelligence.
- Provides direct navigation to Strategy and Backtesting.
- Preserves the 1.0.29 trendline, R1–R3, breakout and collapsible analysis dock.

## Build and CSS architecture

### Invalid `clean` CSS warning

Tailwind scans files as plain text. Documentation tokens such as `[clean:artifacts]` were interpreted as arbitrary utility candidates and emitted an invalid `clean:` CSS declaration. The Tailwind import is now scoped to `src/`, and the duplicate Tailwind import was removed from the legacy stylesheet.

### Route and CSS splitting

- Trading, Backtesting, Strategy and other heavy workspaces use React lazy imports.
- A lightweight Suspense fallback keeps the shell responsive.
- Backtesting and Strategy CSS are imported by their page modules instead of globally.
- Vite CSS code splitting is explicitly enabled.
- React, icons, chart libraries and Motion are assigned stable vendor chunks when present.
- The chunk warning threshold is set to 550 kB so future regressions remain visible instead of being hidden.

## Verification performed

- Backtesting workspace: 25/25
- Strategy library: passed
- Strategy integration: 19/19
- Consolidation integration: 15/15
- Reference UI: 24/24
- System integration: 12/12
- Changed TS/TSX syntax transpilation: passed
- Changed CSS PostCSS parse: passed

## Verification limitation

A new Vite production build, Vitest suite and TypeScript type-check were not completed in this container because dependency installation could not complete. The existing `node_modules` tree was incomplete, and the public-registry installation attempt timed out. Consequently:

- no new `dist/` folder is included;
- no post-change runtime screenshot is claimed;
- the target Windows checkout must run `npm ci` followed by `npm run verify` before release.

This limitation is recorded explicitly rather than treating static checks as a successful production build.
