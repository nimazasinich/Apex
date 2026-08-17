# APEX Unified Terminal v1.0.59 — Max-Power Simulation and Remediation Pass

**Status date:** 2026-08-13  
**Source version:** 1.0.59  
**Evidence class:** current source remediation / deterministic simulation / dependency-independent runtime verification  
**Supersedes for current-status purposes:** `APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md`.

## Executive status

v1.0.59 preserves the v1.0.58 application feature surface and extends the simulated qualification and clean-package reliability work. No live-execution authority was added, no exchange-order path was promoted, and no synthetic evidence is treated as live profitability, live market-data, credential, or production-canary evidence.

## New remediation in v1.0.59

| Area | Defect or gap found | Resolution |
|---|---|---|
| Optional network dependencies | `src/services/proxyFetch.ts` hard-imported `undici` and `socks-proxy-agent`, so dependency-light read-only runtimes could fail at module import before their assertions executed | Converted those dispatchers to lazy optional imports. Direct routes fall back to Node 22's built-in `fetch`; proxy routes fail over safely when optional dispatcher packages are absent. |
| Proxy fetch regression coverage | The optional-dependency fallback had no permanent project-owned QA gate | Added `scripts/qa/runProxyFetchOptionalDependencyRuntime.mjs` and `npm run qa:proxy-fetch-optional-deps`, using local-loopback only and no live network calls. Result: **3/3 PASS**. |
| Simulation breadth | v1.0.58 covered 18 synthetic datasets but did not include explicit thin-liquidity or funding/basis-squeeze regimes | Expanded the deterministic generator to **24 datasets** with thin-liquidity and funding-basis-squeeze regimes across BTC-USDT, ETH-USDT, and SOL-USDT. |
| Replay numeric precision | The expanded funding-basis simulation found one more rolling-standard-deviation precision failure for tiny windows on high-price/low-volatility data | Added an exact two-pass fallback for windows of length <= 8 while retaining the O(1) centered-prefix path for normal windows. |
| QA artifact identity | Several current QA scripts still wrote evidence files with historical `v1.0.47` or `v1.0.56` names | Updated current QA evidence writers to use the package version dynamically. Historical docs remain historical. |
| Function index generation | `generateFunctionIndex.mts` required local `typescript`, so a clean package without installed `node_modules` could not regenerate the function atlas even when global TypeScript was present | Added local-then-global TypeScript resolution, matching the deterministic runtime harnesses. |
| Documentation status | README and current-status pointers still referenced older remediation reports | Updated current status to v1.0.59 and regenerated documentation/function indexes. |

## Deterministic simulated market corpus

Generated under `QA/simulated-data/` with seed `11133528`:

- 3 symbols: BTC-USDT, ETH-USDT, SOL-USDT.
- 8 regimes per symbol: bull trend, bear trend, range, volatility shock, liquidity sweep, feed-gap recovery, thin liquidity, and funding-basis squeeze.
- **24 datasets** total.
- **11,484 candle rows**.
- **7,368 order-book/trade/quote event rows**.
- Manifest hashes make fixture drift detectable and regeneration reproducible.

## Comprehensive simulation result

`QA/comprehensive-simulation-v1.0.59.json` records:

- **2,946 / 2,946 checks passed**.
- Fixture integrity and deterministic regeneration.
- Candle sanitization.
- Indicator/reference equivalence.
- Adaptive learning behavior.
- Provider routing.
- 1,000 randomized microstructure cases.
- 250 adversarial Risk Governor / Trade Plan seeds.
- Multi-agent determinism.
- Paper sizing safety.

The report has `syntheticOnly: true` and `liveQualificationClaimed: false` by design.

## Parallel / worker-thread qualification

The current microstructure benchmark ran identical deterministic work in single-worker and four-worker modes:

- 64 tasks × 3 repetitions.
- Single-worker median: **1222.73 ms**.
- Four-worker median: **855.37 ms**.
- Observed median speedup on this host: **1.43×**.
- Single-worker and four-worker result status: identical.

This is CPU/runtime evidence only. It is not a profitability or execution-performance claim.

## Verification performed in this environment

Passed without the unavailable locked frontend test toolchain:

- Source/root/version/build/secret gates passed.
- Source/runtime verifier sweep: **all runnable dependency-independent gates executed in this pass passed**.
- Smart Autopilot source QA: **21/21 passed**.
- Liquidity Hunter foundation/core/public-feed/event-replay/two-tier/read-plane/validation/evidence/research/safe-completion runtimes passed.
- Unified safety runtime: **11/11 passed**.
- Supplemental BscScan runtime gate: **3/3 passed**.
- Proxy optional-dependency runtime: **3/3 passed**.
- Comprehensive simulation: **2,946/2,946 passed**.
- Official test inventory: **125 files / 688 declared tests**.
- Function index: **3,349 symbols across 635 indexed files**.
- API contract: **136/136 documented runtime operations**.
- Documentation link check: **164 Markdown files / zero broken local links** in the current documentation surface.
- Syntax scan: **579 TS-family files + 92 JS-family files / zero syntax errors**.

Machine-readable current evidence includes:

- `QA/comprehensive-simulation-v1.0.59.json`
- `QA/proxy-fetch-optional-dependency-v1.0.59.json`
- `QA/syntax-scan-v1.0.59.json`
- `QA/liquidity-hunter-*v1.0.59.json` current regenerated evidence files
- `public/build-info.json`

## Checks not honestly claimable here

This sandbox still cannot complete the locked npm dependency installation for the actual Vite/Vitest/React/Playwright stack. Therefore the following remain target-machine qualification steps rather than silently substituted passes:

```bash
npm ci
npm run verify
npm run qa:ui-1368
npm run qa:workspace-runtime
npm run qa:autopilot-lifecycle-runtime
npm run qa:liquidity-hunter-gap-closure
```

The Autopilot lifecycle and Liquidity Hunter gap-closure server runtimes intentionally require a dependency-complete server (`tsx`/Express/runtime deps) or an already-running target server. Their dependency preflight is truthful and fail-fast.

## External qualification still fail-closed

Simulation cannot manufacture:

- authenticated private-exchange WebSocket proof with permitted credentials;
- real provider/network reachability and rate-limit behavior;
- live or long-running Paper Canary outcome history;
- production HTTP/WebSocket soak and leak evidence;
- real historical L1/L2 latency/queue datasets;
- sufficient resolved-outcome history for ML calibration/promotion;
- operator-approved live/testnet canary evidence.

Those remain governed by manual confirmation, Risk Governor, Trade Plan, kill-switch, shadow/research-only isolation, and credential/environment gates.

## Launch guidance

`RUN-APEX.bat` remains the canonical Windows source launcher. A clean package must not ship a partial `node_modules`; the launcher validates the locked local runtime before trusting dependencies and refuses stale build identity.

On a dependency-capable Node 22+ target machine:

```bash
npm ci
npm run verify
npm run build
npm run check:build-identity
```

Do not promote simulated evidence into live-readiness metadata. Keep `liveQualificationClaimed` false until the corresponding real-world evidence is captured.
