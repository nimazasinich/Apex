# APEX Project Structure — 2026-08-10

**Project version:** `1.0.56`  
**Audit basis:** cleaned Strategy Studio + Smart Autopilot source package  
**Companion indexes:** [`FILE_INDEX_2026-08-10.md`](./FILE_INDEX_2026-08-10.md) · [`API_ROUTE_INDEX_2026-08-10.md`](./API_ROUTE_INDEX_2026-08-10.md) · [`PROJECT_STRUCTURE_2026-08-10.json`](./PROJECT_STRUCTURE_2026-08-10.json)

## 1. Executive topology

```text
Browser / React 19
  src/main.tsx
    └─ src/App.tsx                       application state + route coordinator
       └─ WorkspaceShell                 global APEX shell
          ├─ Overview / Markets / Watchlist / Portfolio
          ├─ Trading / Orders / Positions
          ├─ Alerts / History / Analytics
          ├─ Backtesting Lab
          ├─ Strategy Studio
          ├─ Settings / Help
          └─ API clients / local persistence

Express server
  server.ts
    ├─ security middleware / CORS / mutation authorization / rate limits
    ├─ account + execution + operations + provider endpoints
    ├─ registerApexNextMarketRoutes(...)
    │  ├─ strategy registry / validation / fusion
    │  ├─ canonical backtesting
    │  ├─ robust strategy optimization
    │  ├─ Smart Autopilot
    │  ├─ multi-strategy research
    │  └─ paper multi-trade sizing
    ├─ Liquidity Hunter / supplemental intelligence / Telegram
    └─ Vite dev middleware or static production assets
```

## 2. Project surface

The **audited delivery surface index** contains **948 files** (see the index for the exact byte total), excluding the current-session `_qa/comprehensive-audit-2026-08-10/` evidence directory plus `FILE_INDEX_*` and `DOCUMENTATION_INDEX.*` to avoid recursive index hashing. The original input snapshot before audit remediation contained **948 files / 33,757,416 bytes**; metadata-only baseline indexes are retained with the raw audit evidence.

| Root area | Role |
|---|---|
| `src/` | React UI, contracts, domain services, strategy/backtest engines, tests |
| `server.ts` | Express/Vite server composition and several API families |
| `scripts/` | QA, gates, captures, stress tooling, indexing and utilities |
| `tests/` | integration/guardrail tests outside `src/tests` |
| `public/` | static runtime assets |
| `openapi/` | incremental API contract |
| `Doc/` | architecture, plans, reports, references, indexes and project governance |
| `QA/`, `_qa/` | generated/accepted QA evidence; repository contract treats these as ignored artifacts |
| `_archive/` | legacy deliverable/source overlay retained for historical recovery |
| `tools/`, `vendor/` | project-local tooling and vendored small utilities |
| `.github/`, `.claude/` | CI/agent-local configuration |

## 3. Frontend architecture

`src/main.tsx` initializes theme/global CSS, registers the service worker in production, and renders `App` inside the route error boundary. `src/App.tsx` is the workspace coordinator and maps **14 workspace pages**: Overview, Markets, Watchlist, Portfolio, Trading, Orders, Positions, Alerts, History, Analytics, Backtesting, Strategies, Settings, and Help. Trading, Backtesting, and Strategy Studio are lazy-loaded.

Static import analysis covered **379 source code files** and found **1,049 internal import edges**.

### Large frontend units

| File | LOC | Reverse imports |
|---|---:|---:|
| `src/components/workspace/AccountViews.tsx` | 1,356 | 5 |
| `src/pages/backtesting/BacktestingPage.tsx` | 1,053 | 1 |
| `src/components/PriceChart.tsx` | 876 | 1 |
| `src/pages/strategies/StrategyPage.tsx` | 832 | 2 |
| `src/components/workspace/MarketsPage.tsx` | 643 | 1 |
| `src/components/SymbolDetailDrawer.tsx` | 642 | 0 |
| `src/pages/backtesting/BacktestRunBuilder.tsx` | 511 | 2 |
| `src/components/primitives.tsx` | 428 | 12 |
| `src/pages/orders/OrdersPage.tsx` | 427 | 1 |
| `src/components/IntelligenceSourcesSettingsPanel.tsx` | 419 | 1 |

### Large stylesheets

| File | LOC | Bytes |
|---|---:|---:|
| `src/index.css` | 7,422 | 284,393 |
| `src/styles/reference-ui.css` | 4,170 | 180,594 |
| `src/pages/backtesting/BacktestingPage.css` | 3,927 | 145,535 |
| `src/styles/light-theme-workspace-refinement.css` | 3,773 | 160,365 |
| `src/pages/settings/SettingsPage.css` | 3,304 | 99,791 |
| `src/pages/strategies/StrategyPage.css` | 1,430 | 54,865 |
| `src/components/trading/TradingWorkspace.css` | 666 | 30,533 |
| `src/pages/history/HistoryPage.css` | 661 | 16,371 |
| `src/styles/workspace-shell.css` | 580 | 35,707 |
| `src/components/PriceChartEnhancements.css` | 431 | 10,659 |

The page-local Backtesting and Strategy Studio refactors remain in their existing routes rather than introducing parallel demo routes.

## 4. Backend and API architecture

`server.ts` composes middleware and multiple endpoint families. The APEX-NEXT market/strategy/backtesting API cluster is primarily registered by `src/services/apexNextMarketRoutes.ts`.

Static route discovery found **128 unique method/path operations**. The current OpenAPI file documents **27**, or **21.1%**, with all documented operations matching a runtime route after parameter normalization. See the API index for all route locations.

### Large backend/service units

| File | LOC | Bytes |
|---|---:|---:|
| `server.ts` | 3,785 | 173,241 |
| `src/services/apexNextMarketRoutes.ts` | 2,350 | 111,245 |
| `src/services/operationsStatus.ts` | 1,058 | 34,238 |
| `src/services/marketDataService.ts` | 1,046 | 43,733 |
| `src/services/proxyFetch.ts` | 949 | 36,206 |
| `src/services/backtesting.ts` | 827 | 36,243 |
| `src/services/providers/onchainProviders.ts` | 800 | 29,474 |
| `src/services/strategyOptimization.ts` | 799 | 34,881 |
| `src/services/connectedExchange.ts` | 725 | 30,715 |
| `src/services/demoAccount.ts` | 553 | 27,303 |
| `src/services/strategyRegistry.ts` | 533 | 48,657 |
| `src/services/providers/publicExchangeClient.ts` | 524 | 19,319 |

## 5. Strategy, Backtesting and Smart Autopilot

`src/services/strategyRegistry.ts` contains **14 registered strategy definitions**: **10 candidate/Core strategies** and **4 blocked research strategies**. The active engines include scanner-preset and bespoke execution paths.

Smart Autopilot (`src/services/smartAutopilot.ts`) uses a bounded Strategy × Market × Timeframe × Direction planner. Its promotion council has five deterministic optimization agents:

1. `EVIDENCE`
2. `HOLDOUT`
3. `COST_STRESS`
4. `STABILITY`
5. `OVERFIT_GUARD`

Promotion is evidence-gated; it is not a guarantee of positive future performance.

The independent multi-strategy research council (`src/services/multiAgentResearchCouncil.ts`) uses five roles: `PERFORMANCE`, `RISK`, `CONFLICT`, `PORTFOLIO`, and `EXECUTION_GUARDIAN`. `src/services/execution/paperMultiTradeSizer.ts` produces non-executable paper sizing intents bound to plan fingerprints. Runtime QA confirms this path remains research/paper-only and cannot submit exchange orders.

## 6. State and persistence

Client state is split between React state and browser persistence (for example strategy bookmarks, Backtesting history/presets/notes, Smart Autopilot cycle state, settings and workspace context). Server-side local stores use JSON/event-log persistence for decision memory, adaptive/edge thresholds, strategy optimization revisions, testnet/paper canary state and related operational evidence.

A security issue in the baseline source package placed three local runtime config files directly at root. Their contents are not reproduced. The audited delivery removes them; `server.ts` still uses root paths for these local configurations, which is documented as a remediation item in the comprehensive audit.

## 7. QA and verification surface

The project exposes **103 npm scripts**, including **65 dedicated `scripts/qa` files**. The repository test inventory currently discovers **82 test files / 313 tests**.

Key source/runtime contracts executed in this audit:

| Contract | Result |
|---|---|
| Multi-Agent / Multi-Trading source | 20/20 PASS |
| Multi-Agent runtime | 14/14 PASS |
| Smart Autopilot | 18/18 PASS |
| Strategy Studio reference | 25/25 PASS |
| Backtesting workspace | 25/25 PASS |
| Backtesting reference/optimization | 19/19 PASS |
| Strategy optimization | 26/26 PASS |
| Core-10 Dynamic Fusion | 17/17 PASS |
| Research workspace | 15/15 PASS |
| Maximal merge safety | 30/30 PASS |
| Unified safety runtime | 11/11 PASS |
| Feature preservation | 13 prior strategies preserved |

## 8. Canonical navigation artifacts

Use these in this order for future repository work:

1. [`architecture/Refrence.md`](../architecture/Refrence.md) — agent navigation rules and latest audit refresh.
2. [`repository/PROJECT_STRUCTURE_2026-08-10.md`](./PROJECT_STRUCTURE_2026-08-10.md) — current subsystem topology.
3. [`repository/FILE_INDEX_2026-08-10.md`](./FILE_INDEX_2026-08-10.md) / JSON — full file-level source snapshot.
4. [`repository/API_ROUTE_INDEX_2026-08-10.md`](./API_ROUTE_INDEX_2026-08-10.md) / JSON — runtime API map and OpenAPI coverage.
5. [`../DOCUMENTATION_INDEX.md`](../DOCUMENTATION_INDEX.md) — all documentation.
6. [`../FUNCTION_INDEX.md`](../FUNCTION_INDEX.md) — current regenerated symbol atlas (3022 symbols across 546 files); historical staleness findings are resolved for this snapshot.

## 9. Architecture pressure points

The audit found three maintainability concentrations worth breaking down incrementally rather than rewriting:

- `server.ts` — 3,785 LOC.
- `src/services/apexNextMarketRoutes.ts` — 2,350 LOC.
- CSS is highly cumulative: `src/index.css` alone is 7,422 LOC, with several other 3k–4k LOC layers.

These are not proof of runtime defects, but they increase regression surface and make ownership/agent navigation harder. The comprehensive audit supplies recommended decomposition boundaries.
