# APEX v1.0.56 — Visual System Layers, File Layers, and Execution Map

**Status:** source-grounded architecture update for the current APEX v1.0.56 source-only delivery.

**Purpose:** make it possible to see, at a glance, which files belong to which architectural layer, which layer calls which layer, how market/intelligence data moves through the system, how Strategy/Backtesting/Smart Autopilot/Multi-Agent/Liquidity Hunter interact, and which capabilities are still not implemented.

> Important evidence rule: **implemented** means present in the current source tree. **Historical live evidence** comes from the previously supplied visual architecture document and is not treated as a fresh production verification of this source-only package. **Required Next** items below are explicitly not implemented today.

## 1. Current source snapshot

- Project version: `1.0.56`
- Files in inspected source tree (excluding node_modules/dist): **1125**
- Live code/style files outside historical documentation/QA archives: **551**
- Statically registered HTTP operations in `server.ts` + `src/services/apexNextMarketRoutes.ts`: **129**
- OpenAPI-described operations: **27**
- `server.ts`: **3,784 lines**
- `src/services/apexNextMarketRoutes.ts`: **2,350 lines**
- `src/services/marketDataService.ts`: **1,147 lines**
- `src/pages/backtesting/BacktestingPage.tsx`: **1,053 lines**
- `src/pages/strategies/StrategyPage.tsx`: **837 lines**
- Current delivery contains `dist/`: **NO**

## 2. Runtime layer stack (existing L0–L8 terminology)

```text
BROWSER
┌───────────────────────────────────────────────────────────────────────┐
│ L8  Frontend SPA                                                     │
│     main.tsx → App.tsx → WorkspaceShell → pages/components           │
└─────────────────────────────────┬─────────────────────────────────────┘
                                  │ same-origin HTTP / WebSocket
┌─────────────────────────────────▼─────────────────────────────────────┐
│ L0  Process bootstrap / env / port / startup                          │
├───────────────────────────────────────────────────────────────────────┤
│ L1  Express transport / security / CORS / auth / rate limiting / WS   │
├───────────────────────────────────────────────────────────────────────┤
│ L2  API route surface and domain composition                          │
├───────────────────────────────────────────────────────────────────────┤
│ L3  Provider / exchange connectivity / data acquisition               │
├───────────────────────────┬───────────────────────────────────────────┤
│ L4 Strategy / Backtest /  │ L5 Liquidity Hunter / Realtime / Edges    │
│    Optimizer / Autopilot  │                                            │
│    / Multi-Agent Research │                                            │
├───────────────────────────┴───────────────────────────────────────────┤
│ L6  Account / execution / risk / position protection                  │
├───────────────────────────────────────────────────────────────────────┤
│ L7  Persistence / decision memory / threshold governance              │
└─────────────────────────────────┬─────────────────────────────────────┘
                                  │ outbound HTTPS / filesystem
                                  ▼
EXTERNAL PROVIDERS + PRIVATE RUNTIME FILES
```

## 3. File Layer Atlas

The `F*` labels below are **documentation-only file zones**. They do not replace the runtime L0–L8 terminology; they exist so a developer can immediately map a path to its architectural responsibility.

| File zone | Responsibility | Primary paths | Runtime layer |
|---|---|---|---|
| **F0 — Bootstrap & Build** | root runtime/build entry points | `server.ts · package.json · vite.config.ts · tsconfig.json · index.html` | L0/L1 |
| **F1 — Frontend Composition** | browser entry and shared application state | `src/main.tsx · src/App.tsx · src/components/workspace/WorkspaceShell.tsx` | L8 |
| **F2 — Frontend Pages** | routed workspaces and page-local orchestration | `src/pages/*` | L8 |
| **F3 — UI Components / Styles / Assets** | reusable visual units and styling | `src/components/* · src/styles/* · src/assets/* · public/*` | L8 |
| **F4 — Client Libraries & Contracts** | browser helpers and realtime TypeScript contracts | `src/lib/* · src/contracts/realtime/* · src/config/*` | L8 ↔ L2 contracts |
| **F5 — HTTP / API Composition** | middleware, route registration, API composition roots | `server.ts · src/services/apexNextMarketRoutes.ts` | L1/L2 |
| **F6 — Provider & Market Data** | exchange clients, proxying, HF gateways, supplemental provider chain | `proxyFetch.ts · providerRouter.ts · marketDataService.ts · hfSpaceIntel.ts · hfSpacesClient.ts · providers/*` | L3 |
| **F7 — Research / Backtest / Autopilot** | strategies, replay, optimization, Smart Autopilot, multi-agent research | `strategyEngine/* · backtesting.ts · strategyOptimization.ts · smartAutopilot.ts · multiAgentResearchCouncil.ts` | L4 |
| **F8 — Liquidity Hunter / Realtime** | shadow research engine, realtime feeds, edge evidence, read plane | `src/services/liquidityHunter/* · src/services/realtime/* · src/services/readPlane/*` | L5 |
| **F9 — Execution / Risk / Account** | sessions, paper/testnet/live boundaries, protection state machines | `connectedExchange.ts · demoAccount.ts · execution/* · testnetExecution.ts · liveExecutionIntentStore.ts` | L6 |
| **F10 — Persistence & Governance** | decision memory, threshold profiles, private runtime state | `decisionMemoryMirror.ts · adaptiveThresholdGovernance.ts · edgeThresholdRegistry.ts · strategyOptimizationStore.ts` | L7 |
| **F11 — QA / Release / Documentation** | tests, source gates, build utilities, API spec, documentation | `src/tests/* · scripts/qa/* · scripts/gates/* · scripts/utilities/* · openapi/* · Doc/*` | cross-cutting |

### File-zone dependency direction

```text
F1/F2/F3 Frontend UI
        │
        ▼
F4 Client libs + contracts
        │  same-origin /api + WS
        ▼
F5 HTTP/API composition
        │
        ├─────────────► F6 Provider & market-data acquisition ─────► External providers
        │
        ├─────────────► F7 Strategy / Backtest / Autopilot
        │                         │
        │                         └────► Multi-Agent research / Paper sizing
        │
        ├─────────────► F8 Liquidity Hunter / Realtime / Read plane
        │                         │
        │                         └────► decisionBridge
        │
        ├─────────────► F9 Execution / Account / Risk
        │
        └─────────────► F10 Persistence / Governance

F11 QA / Release / Documentation validates every zone but is not a runtime dependency.
```

## 4. Approved market and intelligence provider hierarchy

### 4.1 Market / price / candles / order book

```text
Request
  ↓
Binance Futures public REST (no user key)
  ↓ fail / unsupported / unavailable
KuCoin Futures public REST (no user key)
  ↓ fail / unsupported / unavailable
Owner-managed Hugging Face gateways
  ├─ Space-4: Datasourceforcryptocurrency-4
  └─ Space-2: Datasourceforcryptocurrency-2
  ↓ only where the requested contract can be represented truthfully
User-configured keyed provider
  └─ CoinMarketCap: final quote/USD-price fallback only
  ↓
UNAVAILABLE / NOT_CONFIGURED (never fabricate)
```

Primary implementation files:

- `src/services/marketDataService.ts`
- `src/services/providers/publicExchangeClient.ts`
- `src/services/proxyFetch.ts`
- `src/services/providerRouter.ts`
- `src/services/hfSpaceIntel.ts`
- `src/services/hfSpacesClient.ts`
- `src/services/providers/coinMarketCapApiRequest.ts`
- `src/services/providers/usdPricing.ts`

### 4.2 News

```text
HF Space-2 / HF Space-4
  ↓ if unavailable
User-entered Newsdata.io key
  ↓
NOT_CONFIGURED / provider failure
```

### 4.3 Sentiment

```text
HF Space-2 / HF Space-4
  ↓ if unavailable
User-entered Hugging Face inference token
  ↓
NOT_CONFIGURED / provider failure
```

### 4.4 On-chain / whale context

```text
HF Space-2 / HF Space-4
  ↓ if unavailable
User-entered explorer credentials
  ├─ Etherscan
  ├─ TronScan
  └─ BSC explorer / Etherscan V2 chain 56
  ↓
NOT_CONFIGURED / provider failure
```

`src/services/supplementalOrchestrator.ts` is the active ordered provider list for news/sentiment/on-chain. `src/services/intelligenceFeedProbe.ts` is the Settings/intelligence preview path and uses the approved market chain.

## 5. Frontend → backend execution paths

### 5.1 Market workspace

```text
App.tsx polling / page request
  → /api/market/*
  → apexNextMarketRoutes.ts
  → marketDataService.ts
  → publicExchangeClient / hfSpacesClient
  → normalize + provenance + DataState
  → JSON response
  → pages/components render LIVE / DEGRADED / UNAVAILABLE truthfully
```

### 5.2 Smart Autopilot — both Backtesting and Strategies

```text
SmartAutopilotMiniToggle
        │ same shared settings.autopilotEnabled state in App.tsx
        ├────────────► BacktestingPage.tsx
        └────────────► StrategyPage.tsx
                         │
                         └──────── every 5 minutes while client is armed
                                      ↓
                          POST /api/strategies/autopilot/cycle
                                      ↓
                          buildSmartAutopilotPlan()
                                      ↓
                     bounded optimizer workers (1..3)
                                      ↓
               optimizer + holdout + cost + stability evidence
                                      ↓
                    five-agent optimization promotion council
                                      ↓
                       robust candidate promotion only
                                      ↓
                       multi-strategy research replay
                                      ↓
                         Multi-Agent paper council
                                      ↓
                           paper plan receipt only
```

Current server safety response explicitly states:

- `researchOnly: true`
- `paperOnly: true`
- `executionAuthorized: false`
- `automaticOrderSubmission: false`
- `autonomousLiveExecutionEnabled: false`
- `riskGovernorBypassAllowed: false`
- `manualConfirmationRequired: true`

### 5.3 Backtesting

```text
BacktestingPage
  → BacktestRunBuilder / configuration state
  → POST backtest / optimization routes
  → historical-candle acquisition
  → strategyDefinition + replay engine
  → transaction-cost model
  → result/evidence/fingerprint
  → UI Evidence Area / Notes / History / Export
```

### 5.4 Strategy Studio

```text
Strategy Library
  → selected strategy
  → Configuration parameters
  → Dynamic Fusion / Evidence
  → Validation / Smart Optimization / Liquidity Hunter research
  → Send to Backtesting
```

## 6. Strategy research and promotion layers

```text
StrategyDefinition
  ↓
Historical data identity
  ↓
Backtest replay
  ↓
Optimizer: coarse search → refinement
  ↓
Train / validation / untouched holdout
  ↓
Cost stress + drawdown + trade sample + neighbor stability + overfit gap
  ↓
Smart Autopilot 5-agent council
  ├─ EVIDENCE
  ├─ HOLDOUT
  ├─ COST_STRESS
  ├─ STABILITY
  └─ OVERFIT_GUARD
  ↓ approved only
Active optimization profile revision
  ↓
Multi-Strategy Research
  ↓
Multi-Agent Paper Council
  ↓
Paper sizing / paper plan receipt
```

The Strategy/Backtesting research pipeline and Liquidity Hunter are separate research engines. They converge at controlled decision/execution boundaries rather than sharing hidden mutable state.

## 7. Liquidity Hunter

```text
Public feeds / provider managers
  ↓
Event log → Event bus → Series store → Order book rebuild → World state
  ↓
EvidenceProviderManager + governed edge thresholds
  ↓
4-layer fusion (strict order)
  1. Macro
  2. Target
  3. Microstructure
  4. Shadow validator (cannot rescue deterministic failure)
  ↓
Setup state machine
  ↓
decisionBridge authorization
  ↓
MANUAL / PAPER execution boundary
```

Current policy remains shadow-only and non-authoritative.

## 8. Execution / risk / persistence

```text
Research decision
  ↓
Execution authorization boundary
  ↓
Risk ceilings + kill switches + freshness checks
  ↓
Demo / validation / testnet / explicitly unlocked live path
  ↓
Execution state machine + protection coordinator
  ↓
Persist / reconcile state
```

Persistence is primarily flat JSON. Private runtime configuration writes are atomic and restrictive, but several configuration paths still target the project working directory; see Required Next below.

## 9. API and contract surface

- Statically registered operations: **129**
- OpenAPI-described operations: **27**
- Frontend realtime contracts: `src/contracts/realtime/*`
- Route composition roots: `server.ts`, `src/services/apexNextMarketRoutes.ts`

The current OpenAPI file is therefore a partial contract, not a complete representation of the live route surface.

## 10. QA / release layer

`package.json` defines a broad `npm run verify` chain:

```text
lint/typecheck
→ test inventory
→ Vitest unit suite
→ production build
→ runtime QA
→ source-contract QA
→ browser QA
→ visual QA
→ visual documentation generation
→ documentation link checks
→ release secret gate
```

The current source-only delivery contains no `dist/`; production launch verification must be performed after a fresh build from this exact tree.

## 11. Implementation status

### Implemented in current source
- **Provider hierarchy for market data** — Binance public → KuCoin public → owner-managed HF Space-4 / Space-2 → operator-entered CoinMarketCap as the final quote fallback.
- **Supplemental intelligence hierarchy** — HF Spaces first; user-entered Newsdata.io / Hugging Face inference / Etherscan / TronScan / BSC explorer credentials are later tiers.
- **Smart Autopilot on both pages** — src/App.tsx passes the same persisted autopilotEnabled state and setter to BacktestingPage and StrategyPage; both pages call /api/strategies/autopilot/cycle.
- **Five-agent optimizer promotion gate** — Smart Autopilot uses EVIDENCE, HOLDOUT, COST_STRESS, STABILITY and OVERFIT_GUARD assessments before automatic promotion.
- **Multi-strategy paper council** — Autopilot replays successful contexts through multi-strategy research and a paper-only multi-agent portfolio council.
- **Liquidity Hunter safety boundary** — Shadow-only, non-authoritative, manual/paper execution policy with an explicit decision bridge before execution.
- **No fabricated fallback values** — Provider and pricing code returns unavailable/not-configured states instead of inventing missing market values.
- **Manual Liquidity Hunter testnet confirmation UI** — `StrategyEvidenceRail.tsx` contains a real confirmation dialog and submits only after the explicit confirmation phrase; the previous “missing frontend confirmation” gap is closed.
- **Componentized Backtesting evidence UI** — `BacktestingPage.tsx` composes `BacktestRunBuilder`, `BacktestEvidenceHero`, `BacktestEvidenceTabs`, metric/runtime panels and preset controls rather than rendering a raw JSON result surface. The stale regression fixture now supplies the current preset props.

### Required Next — NOT IMPLEMENTED YET

The following items are intentionally shown in the visual architecture as **planned / required**, not as current behavior:
1. **Persistent server-side Smart Autopilot scheduler** — Current endpoint reports scheduler.mode = CLIENT_OPT_IN and serverBackgroundLoop = false. The 5-minute loop is page/session driven. Implement a durable, bounded server-side scheduler if Autopilot must continue when the browser workspace is closed.
2. **Synchronized multi-symbol universe identity** — apexNextMarketRoutes.ts explicitly blocks automatic promotion for portfolio-style optimization until synchronized universe identities are persisted.
3. **Single provider-policy registry** — The approved hierarchy is implemented but spread across marketDataService.ts, intelligenceFeedProbe.ts, supplementalOrchestrator.ts, usdPricing.ts, hfSpaceIntel.ts and hfSpacesClient.ts. A single typed policy registry should own domain × provider priority, capability and failure semantics.
4. **Private runtime configuration directory** — Supplemental, external-source and Telegram secrets are still persisted under process.cwd() as .supplemental.config.json, .external-api-sources.config.json and .telegram.config.json. Move them to a dedicated private user-data/runtime directory.
5. **Complete OpenAPI coverage** — Resolved in the current snapshot: route inventory reports 135 runtime `/api/*` operations and OpenAPI documents 135/135 (100.0%). The API drift gate now enforces a 100% coverage floor.
6. **Route/composition decomposition** — server.ts is 3,784 lines and apexNextMarketRoutes.ts is 2,350 lines. Split by bounded domains while preserving middleware ordering and route contracts.
7. **Fresh production build + boot + load verification** — Fresh `npm run build` output exists for this exact tree. Browser/visual and long HTTP/WebSocket soak remain separate verification items where Playwright/runtime infrastructure is available.
8. **Architecture drift automation** — Generate the file-layer map, route inventory, provider hierarchy and implementation-status matrix from source metadata during CI so the visual document cannot silently drift from code.

### Intentionally NOT implemented by current safety policy

These are not missing features to casually turn on; they are explicit safety boundaries:
- **Autonomous live order submission from Smart Autopilot** — Intentionally disabled in the current safety model; researchOnly/paperOnly are true and executionAuthorized/automaticOrderSubmission/autonomousLiveExecutionEnabled are false.
- **Risk-governor bypass** — Must remain impossible unless the safety architecture is deliberately redesigned and independently reviewed.
- **Synthetic market/evidence fallbacks** — Must remain unimplemented. Missing provider data must remain UNAVAILABLE / NOT_CONFIGURED / DEGRADED with provenance.

## 12. Reading rule for future maintainers

When code and documentation disagree:

1. Treat `src/`, `server.ts`, `package.json`, and current route registrations as implementation truth.
2. Treat historical `Doc/`, `_archive/`, `_qa/`, and `QA/` evidence as historical evidence, not live behavior.
3. Do not convert a proposed box in the visual document into an “implemented” state until the real source path, tests, build, and runtime verification exist.
4. Preserve the no-fabricated-data rule across every provider and research path.


## 13. Integrated complete-architecture audit overlay

The submitted visual architecture artifact is preserved at `Doc/architecture/APEX_v1.0.56_ARCHITECTURE_COMPLETE_SUBMITTED.html` and is integrated into the canonical interactive page under **Deep Audit**.

The submitted artifact is treated as an audit source, not automatically as current implementation truth. Current-source reconciliation closes or rejects several older findings: the current scanner is OBI/QStruct/Smart-Money aware, `smartMoneyContextEngine.ts` has live importers, Backtesting displays replay mode, and the current strategy registry does not expose hardcoded Sharpe/win-rate/drawdown metrics. Runtime-only observations remain marked for fresh verification.

See `Doc/architecture/APEX_ARCHITECTURE_COMPLETE_INTEGRATION.md` for the finding-by-finding reconciliation.
