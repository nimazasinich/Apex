# APEX Unified Terminal v1.0.58 — Simulation Qualification and Remediation

**Status date:** 2026-08-13  
**Source version:** 1.0.58  
**Evidence class:** current source remediation / deterministic simulation / dependency-independent runtime verification  
**Supersedes for current-status purposes:** `APEX_V1_0_57_REMEDIATION_AND_DELIVERY.md`. The v1.0.57 report remains historical release evidence.

## Executive status

v1.0.58 preserves the complete existing application feature surface and extends the v1.0.57 remediation with deterministic synthetic-market qualification and three material correctness/safety fixes discovered by adversarial testing. No live-execution authority was added and no safety boundary was weakened.

The qualification generated reproducible market regimes and exercised strategy/replay, microstructure, multi-agent, provider-routing, Trade Plan, paper-sizing and Risk Governor logic. Synthetic evidence is explicitly research/test evidence only; it is not live profitability, exchange-connectivity, model-calibration or production-canary evidence.

## Material defects fixed in v1.0.58

| Area | Defect found | Resolution |
|---|---|---|
| Execution risk geometry | An automated order could present a quantity materially larger than the approved Trade Plan while retaining the plan's smaller declared notional/risk values | `RiskGovernor` now validates finite positive order geometry and verifies `quantity × contractMultiplier × entryPrice` against declared notional before approval; invalid leverage or inconsistent exposure is rejected |
| Trade Plan integrity | A malformed plan could contain internally inconsistent quantity/position/risk fields | Trade Plan validation now rejects inconsistent base quantity, position USD and risk amount relationships before the plan can be treated as valid |
| Derivatives sizing | Exposure validation needed contract-unit awareness to avoid rejecting valid derivatives or accepting underreported notional | Risk intents accept an explicit contract multiplier; connected exchange/demo paths provide the correct multiplier for contract-unit sizing |
| Replay numerics | O(1) rolling standard deviation used `E[x²] - E[x]²`, producing cancellation error for high-priced instruments with small variance/windows | Replay variance now uses fixed-anchor centered prefix sums, preserving O(1) complexity while restoring high-price numerical stability |
| KuCoin private WebSocket safety | Each outbound ping reset the silence watchdog; because ping interval was shorter than timeout, a dead socket could postpone its own timeout indefinitely | Only inbound traffic clears the outstanding heartbeat deadline. Outbound pings no longer perpetually defer fail-closed degradation/reconciliation |
| BscScan runtime evidence | Dedicated-key wiring had source tests but runtime verification could be confused by module-cache leakage in a compatibility harness | Added an isolated-process supplemental-key runtime gate verifying dedicated BscScan precedence, Etherscan fallback and no phantom no-key provider |
| QA runtime diagnostics | Missing local `tsx` caused an unhandled child-process error or a misleading server-start timeout | Autopilot and Liquidity Hunter server-runtime scripts now preflight the locked `tsx` binary and fail immediately with an actionable dependency error |
| Qualification repeatability | Prior simulation evidence was distributed across specialized scripts | Added a seeded, reproducible 18-dataset synthetic corpus and one comprehensive simulation runtime covering ten correctness/safety categories |

## Deterministic simulated market corpus

Generated under `QA/simulated-data/` with seed `11133528`:

- 3 symbols: BTC-USDT, ETH-USDT, SOL-USDT.
- 6 regimes per symbol: bull trend, bear trend, range, volatility shock, liquidity sweep and feed-gap recovery.
- 18 datasets total.
- 8,604 candle rows.
- 5,526 order-book/trade/quote event rows.
- Manifest hashes make fixture drift detectable and regeneration reproducible.

The generator and qualification runner are part of the project:

```bash
npm run qa:generate-simulation-data
npm run qa:comprehensive-simulation
```

## Comprehensive simulation result

`QA/comprehensive-simulation-v1.0.58.json` records:

- **2,862 / 2,862 checks passed**.
- Fixture integrity and deterministic regeneration.
- Candle sanitization.
- Indicator/reference equivalence.
- Adaptive learning behavior.
- Provider routing.
- 1,000 randomized microstructure cases.
- 250 adversarial risk-plan seeds.
- Trade Plan integrity.
- Multi-agent determinism.
- Paper sizing safety.

This evidence has `syntheticOnly: true` and `liveQualificationClaimed: false` by design.

## Parallel / worker-thread qualification

The microstructure benchmark ran identical deterministic work in single-worker and four-worker modes:

- 64 tasks × 3 repetitions.
- Single-worker median: 2171.45 ms.
- Four-worker median: 1255.24 ms.
- Observed median speedup on this host: **1.73×**.
- Parallel and single-worker result status: identical.

The speedup is hardware/runtime dependent and is not a trading-performance claim.

## Verification performed in this remediation environment

### Passed without the unavailable locked frontend test toolchain

- Source-contract verifiers: **34/34 passed**.
- Deterministic runtime/benchmark scripts that can execute without starting the Vite/tsx server: **19/19 passed**.
- Comprehensive synthetic qualification: **2,862/2,862 passed**.
- Supplemental BscScan runtime gate: **3/3 passed**.
- Private KuCoin order-stream regression tests under deterministic fake timers: all **6/6 passed**, including the silent-socket watchdog case.
- Dependency-free compatibility harness: **693 assertions passed, 0 assertion failures** across 125 discovered test files; 2 React server-rendering files were load-blocked solely because the actual React package is unavailable.
- Official test inventory gate: **125 files / 688 declared tests**.
- Root contract: passed.
- Version identity: package, lock, manifest and service worker synchronized at `1.0.58`.
- Source-only secret/archive/template scan: passed.
- TypeScript/TSX/MTS syntax transpile scan: **559 files / 0 syntax diagnostics**.
- JavaScript/MJS/CJS syntax scan: **125 files / 0 syntax errors**.

Machine-readable summaries are stored in:

- `QA/comprehensive-simulation-v1.0.58.json`
- `QA/dependency-free-compatibility-v1.0.58.json`
- `QA/remediation-runtime-sweep-v1.0.58.json`

### Dependency-complete checks not honestly claimable in this sandbox

The clean locked dependency installation cannot be completed here because the required npm artifacts are not reachable/cached. Consequently this environment cannot honestly claim execution of the actual locked Vitest/Vite/React/Playwright stack.

The following remain target-machine qualification steps rather than silently substituted passes:

```bash
npm ci
npm run verify
npm run qa:ui-1368
npm run qa:autopilot-lifecycle-runtime
npm run qa:liquidity-hunter-gap-closure
```

Two React server-rendering regression files are specifically blocked by the absent `react` package in the compatibility environment. The source/UI contracts covering those pages pass, but this report does not relabel that as a real React runtime execution.

## External qualification that remains fail-closed

Simulation cannot manufacture the following evidence:

- authenticated private-exchange WebSocket proof with permitted credentials;
- real provider/network reachability and rate-limit behavior;
- live or long-running Paper Canary outcome history;
- production-like HTTP/WebSocket soak and leak evidence;
- real historical L1/L2 latency/queue datasets;
- sufficiently large resolved-outcome datasets for ML calibration/promotion;
- operator-approved live/testnet canary evidence.

Those capabilities remain subject to their existing governance, manual confirmation, Risk Governor, Trade Plan, kill-switch and shadow/research-only boundaries. Autopilot remains research/paper oriented and does not grant autonomous live-execution authority.

## Release/launch guidance

`RUN-APEX.bat` remains the canonical Windows source launcher. A clean delivery must not ship a partial `node_modules/`; the launcher requires the locked local `tsx` binary before considering dependencies installed, regenerates build identity and refuses to treat stale `dist` output as current.

After the final source tree is placed on a dependency-capable Node 22+ machine:

```bash
npm ci
npm run verify
npm run build
npm run check:build-identity
```

Do not promote simulated evidence into live-readiness metadata. Keep `liveQualificationClaimed` false until the corresponding real-world evidence is captured.
