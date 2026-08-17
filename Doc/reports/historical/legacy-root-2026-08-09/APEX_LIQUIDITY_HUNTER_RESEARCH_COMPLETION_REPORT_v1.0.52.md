# APEX v1.0.52 — Liquidity Hunter Research Completion Safe

## Release status

**Version:** `1.0.52`  
**Base:** user-supplied, independently package-verified APEX v1.0.51 archive  
**Scope:** additive completion of the remaining code-side Liquidity Hunter research loop.  
**Execution posture:** `SHADOW_ONLY`, non-authoritative, no autonomous live order path.

This release does **not** claim that the Liquidity Hunter strategy has demonstrated profitable edge in live markets. It completes the code path needed to collect and evaluate that evidence safely. Final package-backed verification and live Paper Canary observation still require an environment with working npm/package and exchange/browser network access.

## What v1.0.52 adds

### 1. Sentiment-velocity evidence bridge

Added `src/services/realtime/sentimentVelocityFeed.ts`.

- Reuses the existing APEX supplemental sentiment provider chain instead of creating a duplicate sentiment subsystem.
- Publishes normalized `SENTIMENT_EVENT` rows only when the provider score/config fingerprint changes.
- Bounds credibility to provider confidence.
- Is default-off and shadow-only.
- Is now gated by `APEX_LIQUIDITY_HUNTER_ENABLED`; enabling sentiment alone cannot start the research feed while the Liquidity Hunter core is disabled.

### 2. Development-only historical-similarity meta evaluator

Added `src/services/liquidityHunter/historicalSimilarityMetaModel.ts`.

- Deterministic, versioned nearest-neighbor meta evidence.
- SHA-256 fingerprints training examples.
- Rejects `HOLDOUT` examples from training.
- Only positive resolved historical outcomes may reinforce the historical trade direction; losing/unresolved examples cannot strengthen a failed direction.
- Runs only as a second-pass shadow validator after the nine independent non-meta edges.
- Is default-off, requires an explicit artifact path, and is now gated by the Liquidity Hunter core enable flag.

This is intentionally not described as Meta-RL. It is a safer local shadow research model until a properly governed external model/dataset is available.

### 3. Advisory research-readiness gate

Added `src/services/liquidityHunter/researchReadiness.ts`.

Possible states:

- `NOT_READY`
- `PAPER_CANARY_OBSERVATION_ELIGIBLE`
- `MANUAL_REVIEW_ELIGIBLE`

The gate consumes walk-forward/holdout evidence and optional microstructure simulation evidence. It cannot promote thresholds, create a TradePlan, authorize execution, or submit an order.

`scripts/utilities/validateLiquidityHunterRecording.mts` now writes this advisory research-readiness result into validation output.

### 4. Unattended Paper Canary shadow evaluation

Added `src/services/liquidityHunter/shadowEvaluationScheduler.ts`.

Previously, Paper Canary could capture a setup only when the manual shadow-evaluation POST route was called. v1.0.52 closes that research gap:

- When Paper Canary is explicitly enabled, a bounded scheduler evaluates configured symbols automatically.
- It reuses the existing server-side public candle/funding/OI/realtime context path.
- Background requests use background priority so they do not compete with interactive UI work.
- Scheduler concurrency is bounded to 1–4 workers.
- Duplicate setup IDs do not inflate capture metrics.
- The scheduler has `executionDependency: false` and `orderSubmissionAllowed: false` by contract.
- It creates no TradePlan and has no Risk Governor/order/exchange submission dependency.

### 5. Paper Canary persistence fail-closed start

The unattended scheduler starts only after persisted Paper Canary state initializes successfully.

If the Paper Canary persistence store is corrupt/unreadable:

- operations status becomes degraded,
- reason includes `paper_canary_persistence_unavailable`,
- unattended shadow evaluation does not start.

The regression QA injects corruption only into an isolated temporary file, never the normal project/event-log path.

### 6. Repeated Funding/OI context refresh regression protection

The scheduler refreshes public funding/open-interest context repeatedly. A regression check now performs two identical normalized REST-context refreshes and confirms that the bounded realtime series remains populated after the second refresh. This protects unattended scheduling from silently losing Layer-1 context during repeated polls.

The central in-process event bus does not permanently deduplicate deterministic event IDs, so refresh events are re-materialized after the series replacement as intended.

## Preserved systems

No existing executable strategy identity was removed or replaced. The v1.0.51 Strategy Registry, Strategy Studio, Backtesting Lab, market-data routing, adaptive threshold governance, Risk Governor, TradePlan validation, connected-exchange confirmation flow, reconciliation, testnet/manual execution controls, kill switches, and existing Liquidity Hunter providers remain present.

The capability comparison against the supplied v1.0.51 tree reports:

- Workspace pages: **14 → 14**, missing **0**
- Registered strategy identities: **15 → 15**, missing **0**
- HTTP route literals: **110 → 110**, missing **0**, added routes **0**
- Liquidity Hunter feature-flag names: **18 → 18**, missing **0**
- Package scripts: **87 → 88**, missing **0**
- Baseline files missing from working source tree: **0**
- Added package script: `qa:liquidity-hunter-research-completion`

See `QA/v1.0.52-capability-preservation.json` for the explicit inventory.

## Safety invariants

The following remain hard requirements in source and runtime QA:

```text
Liquidity Hunter             SHADOW_ONLY
Authoritative                false
Autonomous live execution    false
Automatic threshold promotion false
Paper Canary execution dependency false
Paper Canary order submission allowed false
Shadow scheduler execution dependency false
Shadow scheduler order submission allowed false
New Liquidity Hunter execution/order routes 0
```

No v1.0.52 change weakens the existing Risk Governor, TradePlan checks, manual confirmation, kill switches, execution-intent persistence, reconciliation, or testnet/manual execution boundaries.

## Source/runtime verification actually executed in this delivery environment

The following commands/scripts were actually run against the final v1.0.52 source and exited successfully:

| Verification | Result |
|---|---:|
| Liquidity Hunter baseline | 17/17 PASS |
| Liquidity Hunter source contract | 50/50 PASS |
| Liquidity Hunter foundation runtime | 25/25 PASS |
| Liquidity Hunter core runtime | 12/12 PASS |
| Public feed protocol runtime | 10/10 PASS |
| Deterministic event replay | 9/9 PASS |
| Read-only WebSocket/read plane | 7/7 PASS |
| Execution-position FSM | 6/6 PASS |
| Strategy optimizer safety | 7/7 PASS |
| Validation/providers runtime | 20/20 PASS |
| Evidence/microstructure simulation | 23/23 PASS |
| Research-completion runtime | **23/23 PASS** |
| Core 10 Dynamic Fusion | 17/17 PASS |
| Feature preservation runtime | PASS (13 prior strategies) |
| System integration | 12/12 PASS |
| Backtesting workspace | 25/25 PASS |
| Merged SEC/UI source contract | 31/31 PASS |
| Agent-safe merge | 19/19 PASS |
| Light-theme source contract | 32/32 PASS |
| Workspace light-polish source contract | 15/15 PASS |
| Trading drawer docking source contract | 13/13 PASS |
| Version identity | PASS — `1.0.52` |
| Source-only secret/release scan | PASS |

The legacy standalone `scripts/qa/verifyStrategyBacktestProduction.mjs` remains an orphaned source-string checker and is not referenced by any npm script. Its old UI/source-literal expectations are not used as a release gate; the active `qa:strategy-backtest-production` command is the Vitest suite `src/tests/strategyBacktestProduction.test.ts`. Production code was not altered merely to satisfy the orphaned checker.

## Static source integrity

A dependency-independent TypeScript-family syntax/import/route scan was rerun after the final source changes:

```text
TypeScript-family files      414
Syntax diagnostics           0
Relative imports             1071
Missing relative imports     0
HTTP route literals          110
Unique HTTP routes           110
Duplicate HTTP routes        0
Workspace pages              14
Strategy identities          15
```

See `QA/v1.0.52-static-integrity.json`.

## Dependency graph preservation

The v1.0.51 and v1.0.52 lockfiles contain the same package-key inventory:

```text
Lockfile packages            413 → 413
Package-key set equal        true
Root dependencies            17 → 17, identical
Root devDependencies         12 → 12, identical
```

Only the release version/scripts required by this release were changed; no dependency was added to implement the research-completion path.

## Package-backed verification status for v1.0.52

A fresh install was genuinely attempted in this delivery environment:

```text
Node: v22.16.0
npm:  10.9.2

npm ci --ignore-scripts
→ FAIL, exit 1
→ E404 for vitest-4.1.10.tgz
→ registry:
  https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/
```

No `node_modules` directory was left in the release tree.

Because dependency installation failed here, this report does **not** claim package-backed v1.0.52 PASS for:

- `npx tsc --noEmit`
- full Vitest inventory
- `npm run build`
- full `npm run verify`
- Playwright browser/a11y/visual verification

The supplied v1.0.51 baseline was independently package-verified in another environment with 0 TypeScript errors, 245/245 tests passing and a successful build. That baseline evidence is not silently promoted to v1.0.52; the new version must be rerun package-backed after extraction in the network-capable environment.

## Browser and live Paper Canary status

No browser-based PASS or live-market Paper Canary result is fabricated for v1.0.52 in this environment.

The final external verification still requires:

1. `npm ci --ignore-scripts`
2. `npx tsc --noEmit`
3. `npm run test`
4. `npm run build`
5. `npm run verify`
6. Chromium/Playwright verification in **LIGHT theme at 1368×753**
7. Temporary enablement of Liquidity Hunter public feeds + Paper Canary while keeping all execution flags off
8. Observation that real Binance/Bybit events increase `acceptedEvents`
9. Honest reporting of Paper Canary `open`/`resolved` records, including the valid zero-result case

Unlike v1.0.51, v1.0.52 no longer requires repeated manual calls to `/api/liquidity-hunter/shadow/evaluate` to create Paper Canary candidates: the explicitly enabled, bounded shadow scheduler performs that research evaluation automatically.

## Release packaging note

The source archive intentionally excludes `node_modules`, transient `.apex-data`, test-result directories, and the existing `dist/` directory. The `dist/` contents in the working source tree were produced from v1.0.51 and would be stale for v1.0.52; shipping them as current compiled output would be misleading. Build fresh after dependency installation:

```bash
npm ci --ignore-scripts
npm run build
```

## Final status

**Code-side Liquidity Hunter research-completion path: COMPLETE for v1.0.52.**

**Statistical/live-market validation: NOT COMPLETE and not claimed.**

**Package/browser verification for v1.0.52: external environment required.**

The correct next action is verification and real Paper Canary observation, not additional live-execution development.
