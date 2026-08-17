# APEX Unified Terminal v1.0.57 — Remediation and Delivery Status

**Status date:** 2026-08-13  
**Source version:** 1.0.57  
**Evidence class:** current source remediation / dependency-independent verification  
**Supersedes for current-status purposes:** `APEX_v1_0_56_MASTER_GAP_CLOSURE_PROMPT.md` and the 2026-08-10 comprehensive audit. Those files remain historical evidence.

## Executive status

This release closes the concrete source/package defects found during the 2026-08-13 remediation pass while preserving the existing research, strategy, backtesting, multi-agent, Liquidity Hunter, account, execution-safety and evidence features.

The release deliberately does **not** convert missing external evidence into fake readiness. Anything that requires live exchange credentials, reachable third-party providers, a long-running paper canary, real historical L1/L2 datasets, or a sufficiently large resolved-outcome ML dataset remains fail-closed or shadow/research-only.

## Defects fixed in v1.0.57

| Area | Defect | Resolution |
|---|---|---|
| Autopilot UX | No product-level Autopilot control; only tiny page-local `Smart Auto` toggles | Added prominent global `AUTOPILOT` control to `WorkspaceShell`; page-local controls remain as mirrors and are labeled `Autopilot` |
| Autopilot truth | Local browser preference could reconcile the server in both directions | Boot preference may opt in, but cannot auto-stop an ENV/operator-armed controller; explicit user actions issue START/STOP |
| Autopilot QA | Source QA did not require the global control or lifecycle runtime in the runtime gate | Strengthened Smart Autopilot QA and added lifecycle runtime to `test:runtime` |
| Runtime identity | Multiple stale launchers/builds could be mistaken for the current app | Added one root launcher `RUN-APEX.bat`; legacy Claude/ProjectHub launch material is preserved under `_archive` |
| Stale build launch | Existing `dist/server.cjs` could start even when source changed | Launcher refreshes build identity and rebuilds unless `dist/build-info.json` exactly matches the current source identity |
| Partial dependency install | Interrupted `npm ci` could leave `node_modules/` present and trick launch logic | Delivery excludes `node_modules`; launcher requires the locked `tsx` binary before treating dependencies as installed |
| Build provenance | Service-worker identity used a non-unique `source` build marker | Added generated build identity; service-worker stamping consumes the current build ID |
| Build provenance | A Git commit alone could hide a dirty working tree | Dirty Git builds combine commit identity with source hash; non-Git deliveries use a deterministic source hash |
| Build provenance | Build identity omitted important build inputs | Identity now covers source, server, scripts, OpenAPI and relevant TypeScript/Vite/HTML/package inputs |
| Provider capability UI | Capability presentation depended on server-only `providerRouter`, which reads `process.env` | Extracted dependency-neutral `src/contracts/providerCapabilities.ts`; browser capability presentation is safe |
| Capability truth | Planned/shadow/live authority existed in registries but was not visibly surfaced | System Health now shows declared provider and decision-module capability status without promoting planned/shadow features |
| Strategy evidence | Pending strategy evidence wording did not state performance was unverified | Pending evidence explicitly states it is not presented as verified performance |
| Replay typing | Adaptive trend replay used a narrower intersection annotation than the shared replay contract | Normalized replay array to `Array<ReturnType<typeof simulateBracketTrade>>` |
| Backtesting QA | Several source verifiers asserted implementation details in obsolete files after refactors | QA now follows `useBacktestingOptimization`, preset projection, and Evidence Hero ownership while retaining the same behavior requirements |
| Repository root | Current terminal source and unrelated desktop toolkit/old executable material were mixed at root | Root contract now passes; legacy material is preserved in `_archive/legacy-root-extras` |
| Release confusion | Old v1.0.56 `dist` and `_release` sat beside v1.0.57 source | Preserved as `_archive/pre-v1.0.57-dist` and `_archive/pre-v1.0.57-release`; they are no longer canonical runtime targets |
| Supplemental provider wiring | Dedicated BscScan key could be accepted by Settings without reaching every runtime construction path | `BSCSCAN_KEY` and saved `bscScanKey` now propagate into `BscScanProvider`, prefer the dedicated key, deliberately fall back to Etherscan V2 only when absent, and are protected by Vitest plus dependency-independent QA |
| Documentation tooling | Generated Markdown links broke on filenames containing parentheses | Documentation index now encodes unsafe path characters; link checker decodes targets before filesystem validation |

## Current interpretation of the historical open-gap ledger

The v1.0.56 ledger mixed code work, desired future products, operational evidence, safety gates and maintainability debt. The current classification is:

### Source-complete or intentionally resolved by design

- **DATA-01 / DATA-02:** Bitget and OKX remain explicitly `PLANNED`, unregistered and absent from executable provider priority. This is the accepted safe “keep planned” branch; names are not treated as implementations.
- **DATA-03:** Bybit remains an implemented WebSocket `REALTIME_EVIDENCE` provider, not falsely advertised as a REST primary fallback.
- **DATA-10:** the old Space-4 batch-snapshot hot-path concern is not an active executable scanner path; current market fallbacks use category-specific calls with caching/degraded semantics.
- **LH-01:** Liquidity Hunter default-off is intentional and explicitly documented as not a bug.
- **LH-02:** public-feed infrastructure has flags, feed health, reconnect behavior, sequence guards, reseed/staleness handling, recording and shutdown cleanup; feeds remain opt-in pending environment validation.
- **EXE-01:** unverified KuCoin Futures testnet endpoints remain deny-by-default. This is a safety resolution, not missing implementation.
- **STR-05:** advanced scanner remains shadow/replay by deliberate governance; it is visibly classified and cannot silently become live authority.
- **UI-03:** planned/shadow/research/live-authority distinctions are now rendered in System Health and strategy capability surfaces.
- Existing UI-01/UI-02 infrastructure (explicit data states, account freshness, market feed status and provenance chips) is preserved and extended; no degraded payload is promoted to a live claim by the shared provenance helpers.

### Source infrastructure exists; real-world evidence is still required

These are not honest candidates for “FIXED” solely by editing code:

- **QA-01 / QA-02:** clean dependency-backed full verify and browser/visual qualification.
- **QA-03 / QA-04:** sustained HTTP/WebSocket/heavy-load soak evidence and leak reproduction.
- **DATA-04 / DATA-12:** live external-provider verification and operator credentials.
- **LH-03 / LH-04 / LH-05 / LH-06 / LH-07:** edge-provider configuration, real forward outcomes, paper-canary history, exercised governance revisions and meta-model evidence.
- **EXE-02:** authenticated private-exchange WebSocket proof in a permitted environment.
- **ML-03 / ML-04 / ML-07:** model artifact/comparison/calibration require the canonical dataset gate to pass on real resolved outcomes. Training and shadow-comparison implementations already fail closed when data/model is absent.
- **STR-01 / STR-02 / STR-03 / STR-04:** source contracts/simulators exist; real L1/L2/two-venue/fill-latency datasets and production-like validation remain required before promotion.

### Maintainability debt, not missing runtime functionality

- **ARC-01 / ARC-02 / ARC-03 / ARC-05:** large composition/modules remain refactoring targets. Wholesale splitting without a dependency-complete regression run would create more risk than value. v1.0.57 performs a low-risk ownership improvement by extracting browser-safe provider capability truth.
- **ARC-04:** avoidable shared-contract coupling was reduced by moving provider capability declarations into `src/contracts/`; a full static-cycle cleanup remains a maintenance task rather than a release-readiness claim.
- **DOC-02:** this report is the authoritative current-status layer. Historical reports remain preserved and are explicitly identified as historical by current documentation entry points.

## Verification performed in the remediation environment

### Passed

- Root contract: `31` current root entries classified.
- Version identity: package, lock, manifest and service worker synchronized at `1.0.57`.
- Build identity freshness gate: passed.
- Source-only release secret/archive/template scan: passed.
- Test inventory discovery: `125` files / `684` tests, above gate floors.
- Generated function atlas: `3325` symbols across `630` source/script/test files.
- API route index/OpenAPI parity: `136/136` runtime routes documented (`100.0%`).
- Repository-wide documentation link check: `527` Markdown files, `0` broken local links.
- TypeScript/TSX syntax transpile check: `559` files, `0` syntax errors.
- JavaScript module syntax check: `75` files, `0` syntax errors.
- Dependency-independent `verify*.mjs` source contracts: `34/34` runnable verifiers passed; Smart Autopilot `21/21`, maximal merge safety `30/30`, merged Stage UI `31/31`, Backtesting workspace `25/25`, Backtesting optimization `19/19`, System Integration `12/12`, UI Completion R2 `16/16`, and the remaining source verifiers passed.

### Environment-blocked, not claimed

The locked npm dependency install cannot be completed in this execution environment. An offline clean install fails specifically because the locked Vitest artifact is not cached:

```text
ENOTCACHED ... vitest-4.1.10.tgz ... cache mode is 'only-if-cached'
```

The earlier online install attempt stalled at the package-manager/network layer. Therefore the following are **not** falsely claimed as executed here:

- `npm run lint` full project type-resolution check,
- Vitest unit/integration suite,
- Vite production build,
- API-index TSX gate,
- browser/Playwright 1368×753 acceptance (`verifyUi1368.mjs` cannot import Vite without the locked dependencies),
- Autopilot server lifecycle runtime requiring the dependency-complete server,
- full `npm run verify`.

`RUN-APEX.bat` performs a locked `npm ci` and builds current source on a normal Node 22+ machine, and refuses to trust a stale `dist` identity.

## Target-machine qualification commands

```bash
npm ci --no-audit --no-fund
npm run verify
npm run qa:autopilot-lifecycle-runtime
npm run release:package
```

For live/provider qualification, run only in an approved environment with the required credentials and preserve the existing fail-closed safety policy. Do not bypass provider/testnet allowlists or enable autonomous live execution merely to obtain a green status.

## Delivery contract

- Canonical source version: **1.0.57**.
- Canonical launcher: **`RUN-APEX.bat`**.
- `node_modules` is intentionally not shipped.
- Current source does not ship a prebuilt v1.0.57 `dist` because that build could not be dependency-verified in this environment.
- Historical builds/tools are retained under `_archive` for provenance and feature-history preservation, not as launch targets.
- Autonomous live execution remains disabled by the project’s safety contract; research/paper/autopilot controls do not implicitly grant execution authority.
