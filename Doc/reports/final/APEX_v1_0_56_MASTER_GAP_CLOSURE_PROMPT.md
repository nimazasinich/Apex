> **HISTORICAL STATUS LEDGER (v1.0.56 / 2026-08-10):** This file is preserved as audit evidence. For the current v1.0.57 source state, use [`APEX_V1_0_57_REMEDIATION_AND_DELIVERY.md`](APEX_V1_0_57_REMEDIATION_AND_DELIVERY.md). Do not treat rows below as current when the v1.0.57 report reclassifies them.

# APEX v1.0.56 — Master Project Gap-Closure Prompt

> ## Live Progress Tracker (updated 2026-08-10)
>
> This copy is being closed out incrementally, batch by batch. Batch 5 integrates the latest code-completion workspace after auditing the newly supplied `APEX_v1_0_56_project_delivery(1).zip`. Evidence is split across `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_batch1.md`, `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_batch4.md`, and `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_batch5_integration.md` inside the delivered project zip.
>
> **The full, authoritative, per-gap status table is the "Progress Ledger" section at the very bottom of this document.** Any agent or session picking this file up should read that table first, and update it (plus the matching inline `✅ STATUS:` callout under the relevant gap) immediately after closing anything — see the instructions at the top of that section.
>
> | Gap | Status | Batch |
> |---|---|---|
> | REL-01 — forbidden secret config in source | ✅ ALREADY RESOLVED | 1 |
> | REL-02 — `node_modules` shipped in source | ✅ ALREADY RESOLVED | 1 |
> | PERS-01 — secrets persisted to repo root | ✅ FIXED | 1 |
> | DOC-01 — current Function Index documentation | ✅ FIXED | 6 |
> | DATA-09 — KuCoin order-book multiplier normalization | ✅ ALREADY RESOLVED | 2 |
> | EXE-05 — production auth/TLS hardening | ✅ FIXED | 2 |
> | Batch 4 — release/provenance/root/OpenAPI | ✅ FIXED | 4 |
> | Batch 4 — Space-4/Space-2 provider truth hardening | ✅ FIXED | 4 |
> | Batch 4 — execution protection/crash recovery | ✅ FIXED | 4 |
> | Batch 4 — decision outcomes/persistence/governance | ✅ FIXED | 4 |
> | DATA-14 — dedicated BscScan key runtime wiring | ✅ FIXED | 4 |
> | DATA-15 — dead provider catalogs removed | ✅ FIXED | 4 |
> | STR-07 — supplemental fusion scope made explicit | ✅ FIXED (Branch A) | 4 |
> | DATA-12 — optional operator-provider live verification | ⛔ BLOCKED EXTERNALLY | 4 |
> | EXE-02 — private KuCoin WS live-provider proof | ⛔ BLOCKED EXTERNALLY | 4 |
> | QA-02 — latest visual rerun | ⚠️ DEFERRED WITH JUSTIFICATION | 4 |
> | DATA-08 — durable open-interest history | ✅ FIXED | 5 |
> | ML-02 — canonical ML dataset contract | ✅ FIXED | 5 |
> | ML-05 — DecisionMemory dataset mirror durability | ✅ FIXED | 5 |
> | STR-01/02 — historical L1/L2 microstructure source infrastructure | ⚠️ PARTIALLY RESOLVED | 5 |
> | STR-03/04 — simulation-only market-making infrastructure | ⚠️ PARTIALLY RESOLVED | 5 |
>
> Each closed gap is marked inline below with a `✅ STATUS:` callout directly under its priority line. Everything else in this document is unchanged from the original prompt and remains open.

---

## Role

You are the senior software architect, security engineer, trading-systems engineer, QA lead, and release engineer responsible for completing and hardening **APEX v1.0.56**.

Work directly from the current project source snapshot. Do not treat old reports, screenshots, generated documentation, prior assistant summaries, or comments as more authoritative than the current code.

Your task is to **systematically close every verified gap and incomplete area listed in this prompt without weakening any existing safety boundary, provider-truth rule, risk control, or fail-closed behavior**.

This is not a request to redesign the product from scratch. Preserve current behavior and contracts unless a change is explicitly required to close a documented gap.

---

# 1. Evidence and Truth Policy

Use the following evidence hierarchy:

1. **Current source code**
2. **Current automated tests / QA scripts**
3. **Current runtime behavior from a clean reproducible environment**
4. **Current generated indexes / manifests whose hashes match the source**
5. Historical reports and documentation only as supporting context

For every issue:

- Verify it in the current snapshot before modifying code.
- If the issue no longer exists, mark it `ALREADY RESOLVED` and do not change working code.
- If a finding cannot be reproduced, mark it `NOT REPRODUCED` with evidence.
- If completion depends on an external provider, exchange, credential, production dataset, or official API endpoint that is unavailable, mark it `BLOCKED EXTERNALLY`, preserve fail-closed behavior, and implement every source-side prerequisite that can be completed safely.
- Never convert an unavailable dependency into fake success.
- Never use synthetic, neutral, placeholder, interpolated, or guessed market data as production truth.
- Never label a feature `READY`, `LIVE`, `HEALTHY`, or `VERIFIED` unless the corresponding contract has actually been verified.

Maintain a gap ledger using:

- `FIXED`
- `ALREADY RESOLVED`
- `BLOCKED EXTERNALLY`
- `DEFERRED WITH JUSTIFICATION`
- `NOT REPRODUCED`

Every `FIXED` item must include:
- files changed,
- tests added/updated,
- commands executed,
- runtime evidence where applicable,
- remaining limitations.

---

# 2. Non-Negotiable Safety Constraints

The following existing boundaries must not be weakened.

## 2.1 Liquidity Hunter

Preserve:

- `shadowOnly: true`
- `authoritative: false`
- `automaticPromotionEnabled: false`
- `majorityVoteAllowed: false`
- `layer4MayRescueDeterministicFailure: false`
- execution modes restricted to `MANUAL` and `PAPER`
- explicit `DecisionBridge` authorization before execution
- explicit manual governance for threshold changes
- evidence TTL / freshness rejection
- fail-closed behavior when required evidence is unavailable

Do **not** solve incompleteness by enabling autonomous live execution.

## 2.2 Risk and Execution

Preserve:

- Risk Governor enforcement
- notional ceilings
- `APEX_RISK_*` limits
- kill switches
- server-side session TTL
- explicit execution confirmation
- idempotency / reconciliation semantics
- fail-closed behavior when market/account data is stale
- durable intent/order state where already implemented

Do not move these controls into the browser.

## 2.3 Provider Truth

Do not:

- promote a `PLANNED` provider to executable without a real adapter,
- silently change provider order,
- treat an unverified endpoint as trusted,
- substitute candle data for L2 history,
- fabricate funding/OI/order-book fields,
- convert `NOT_CONFIGURED` to neutral market evidence,
- hide degraded provenance.

Every returned dataset must retain truthful:
- source,
- freshness,
- degradation state,
- validation result,
- unit semantics.

## 2.4 Secrets

Never print, expose, commit, return, or log secret values.

If a forbidden local config contains credentials:
- migrate/remove the file from the source release,
- preserve the ability to configure the credential securely at runtime,
- state that credential rotation is an operator responsibility if real credentials were ever stored there.

---

# 3. Current Verified Baseline — Do Not Regress

The current snapshot already contains several strong protections. Treat these as regression gates.

## 3.1 Type and QA Baseline

The current snapshot has been observed to pass:

- TypeScript `tsc --noEmit`
- Maximal Merge Safety: **30 / 30**
- System Integration: **12 / 12**
- Liquidity Hunter Safe Completion: **29 / 29**

Any final implementation must preserve or improve these results.

## 3.2 Production Bundle Smoke Baseline

The existing `dist/server.cjs` production/static bundle can boot in the review environment.

Observed smoke behavior included:

- `/api/readiness` → `200`, ready
- `/api/strategies` → `200`
- `/api/operations/status` → `200`
- `/api/health` → `200`, server healthy while unavailable external providers are reported honestly
- `/` → `200 text/html`

Do not confuse this smoke result with full clean-build reproducibility or production readiness.

## 3.3 Current Function Index

The current `Doc/FUNCTION_INDEX.json` has been checked against the current indexed source/script/test files and is currently fresh.

Do **not** reopen the old “Function Atlas is stale” finding unless a new source change makes it stale again.

---

# 4. Priority Legend

Use:

- **P0 — Release blocker / security / truth violation**
- **P1 — Critical product completion / execution safety / reproducibility**
- **P2 — Major reliability / observability / data-quality / validation gap**
- **P3 — Maintainability / documentation / structural debt**
- **P4 — Planned capability / optional future enhancement**

---

# 5. Gap Register

---

## GAP REL-01 — Forbidden Secret-Bearing Config Exists in the Source Package
**Priority: P0**

> ✅ **STATUS: ALREADY RESOLVED** — verified 2026-08-10 (session batch 1). No `.external-api-sources.config.json` present in the delivered source tree (only the `.example.json` template); `.gitignore` and `scripts/utilities/createReleaseArchive.mts` already enforce the forbidden-file gate. See `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_batch1.md`. The durable runtime-location fix is tracked and closed separately under GAP PERS-01 below.

### Verified current condition

The source-only release gate currently fails because the project package contains:

`/.external-api-sources.config.json`

This path is explicitly forbidden by the release secret gate.

### Required work

1. Remove this file from the distributable source tree.
2. Ensure `.gitignore` and release tooling prevent recurrence.
3. Move external-provider credential persistence to a private runtime/user-data location.
4. Add migration logic if backward compatibility is required.
5. Set restrictive file permissions where supported.
6. Ensure no API response returns stored secrets.
7. Ensure logs redact secret values.
8. Re-run:
   - source-only secret gate,
   - full release gate,
   - repository hygiene checks.
9. Add a regression test proving forbidden local secret config files cannot enter the release artifact.

### Acceptance

- Source-only no-secrets gate passes.
- No secret-bearing runtime config file exists in the released source root.
- Provider configuration still works through the supported secure runtime path.
- No test snapshots contain real keys.

---

## GAP REL-02 — Source Archive Ships Platform-Specific `node_modules`
**Priority: P0**

> ✅ **STATUS: ALREADY RESOLVED** — verified 2026-08-10 (session batch 1) with real clean-environment evidence, not just a claim: from a fresh checkout on Linux, `npm ci` succeeded (317 packages, zero errors) and `npx tsc --noEmit -p tsconfig.json` returned **0 errors**. No `node_modules` shipped in the source archive. `npm run build` / `npm run verify` were not run in this batch — deferred to the QA-01 batch. See `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_batch1.md`.

### Verified current condition

The attached ZIP contains `node_modules`.

The bundled dependencies include Windows-native esbuild artifacts. In a Linux environment:

- the shipped `tsx`/esbuild path is not portable,
- `npm run build` cannot be trusted from the shipped dependency tree,
- direct `tsx` execution fails due a Windows/Linux binary mismatch.

This is a packaging/reproducibility failure, not evidence of a TypeScript source failure.

### Required work

1. Remove `node_modules` from the source release.
2. Define a clean installation process using the lockfile.
3. Verify on supported operating systems using clean environments.
4. Ensure package manager and Node versions match the declared engines.
5. Produce reproducible CI jobs for at least the supported production OS.
6. Add release checks that fail if `node_modules` is present in a source artifact.
7. Decide whether `dist/` is:
   - rebuilt from source during deployment, or
   - distributed as a separate build artifact.
8. Never use a developer-machine dependency directory as a release artifact.

### Acceptance

From a fresh checkout/source artifact:

```bash
npm ci
npm run typecheck
npm run build
npm run verify
```

must run without relying on pre-existing `node_modules`.

---

## GAP REL-03 — Source, Build, QA Evidence, and Runtime State Are Mixed in One Delivery
**Priority: P1**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Separated clean source, build/deploy, and QA/evidence artifacts via `scripts/utilities/createReleaseArchive.mts`; `scripts/gates/checkReleaseArtifacts.mjs` verifies separation. Batch 4 regenerates the artifacts from the latest workspace.

### Current condition

The package contains combinations of:

- source,
- `node_modules`,
- `dist`,
- QA/evidence directories,
- archives,
- temp/output directories,
- local configuration,
- generated indexes.

This makes provenance, portability, and release review unnecessarily ambiguous.

### Required work

Define separate artifacts:

### Artifact A — Clean Source Release
Must contain:
- source,
- package manifest,
- lockfile,
- build scripts,
- source documentation required to build,
- no runtime secrets,
- no `node_modules`,
- no temporary state.

### Artifact B — Build / Deploy Artifact
Must contain:
- compiled `dist`,
- version/build metadata,
- checksums,
- runtime dependency requirements,
- no source secrets.

### Artifact C — QA / Evidence Bundle
Must contain:
- reports,
- benchmark output,
- test evidence,
- screenshots if required,
- checksums and source/build identifier.

Add a machine-readable release manifest.

---

## GAP REL-04 — Build Provenance Is Incomplete
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Release manifest records application/runtime provenance and SHA-256 hashes for lockfile, source tree/artifact, dist tree/build artifact, OpenAPI, Function Index, API Route Index, and evidence artifact; unavailable Git commit provenance is reported as `unavailable`, never invented.

### Current condition

The archive does not provide enough immutable repository provenance to reconstruct commit ancestry from the package alone.

### Required work

Generate a build manifest containing, where available:

- application version,
- commit SHA,
- dirty-tree state,
- build timestamp,
- Node version,
- npm version,
- target OS/architecture,
- lockfile hash,
- source artifact hash,
- dist artifact hash,
- OpenAPI hash,
- Function Index hash,
- API Route Index hash.

If the build is not produced from a Git checkout, explicitly state `commit: unavailable` rather than inventing one.

Consider generating:
- SBOM,
- checksums,
- dependency audit evidence.

---

# 6. Repository and Documentation Governance

## GAP DOC-01 — Current Documentation Still Repeats Resolved Function-Index Findings
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 6 / 2026-08-10. `npm run index:functions` regenerated `Doc/FUNCTION_INDEX.*` to 3022 symbols across 546 files, current documentation no longer presents Function Index staleness as active, and `npm run docs:check` passes across 156 Markdown files. Historical reports remain preserved as historical evidence.

### Current condition

Some current documentation still states that the Function Index is stale or needs regeneration.

The current index has been verified against the current indexed source files and is fresh.

### Required work

Update:
- architecture/reference documentation,
- root documentation,
- audit summaries that present the old condition as current.

Keep the historical audit finding in historical reports, but mark it:
`Resolved in current snapshot`.

Do not rewrite historical evidence as though it never happened.

---

## GAP DOC-02 — Historical Audit State Is Mixed With Current State
**Priority: P2**

### Current condition

Older reports contain valid findings for the snapshot they audited, but some of those findings are no longer current.

Examples include:
- inability to fully build in that historical sandbox,
- stale Function Atlas state,
- older architecture/provider assumptions.

### Required work

Every report must identify:
- source snapshot/version,
- timestamp,
- evidence class,
- whether the finding is historical or current.

Create a current status table:

| Finding | Historical status | Current status | Evidence |
|---|---|---|---|

Do not delete historical reports.

---

## GAP DOC-03 — Root Contract Does Not Fully Match the Current Repository Layout
**Priority: P3**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Root contract and executable root gate now classify canonical source, generated QA/build roots, runtime-private state, `vendor/`, `.apex-data/`, and `test-results/`; `npm run check:root-contract` passes.

### Current condition

The actual root includes legitimate paths not fully represented by the existing root-governance documentation, while some documented naming expectations do not match the current package.

### Required work

Reconcile the root contract with actual intended repository structure.

Explicitly classify roots such as:
- `.github`
- `.claude`
- `.nvmrc`
- `.node-version`
- `openapi`
- `tools`
- `vendor`
- `_archive`
- QA/evidence directories

Also reconcile the README naming convention if the contract expects `README.md` but the root package uses another form.

Add a root-contract QA check.

---

## GAP DOC-04 — API Documentation Coverage Is Low
**Priority: P1**

> ✅ **STATUS: FIXED** — Batch 6 / 2026-08-10. OpenAPI coverage expanded to the current full runtime route set: 135/135 `/api/*` operations documented (100.0%); generated drift gate passes with no phantom operations and now defaults to a 100% coverage floor.

### Verified current condition

Current API route inventory contains:

- **135 literal `/api/*` operations**
- plus the SPA/static non-API serving path outside the OpenAPI contract

Current OpenAPI coverage is:

- **135 documented runtime operations**
- **100.0% coverage**
- **0 phantom OpenAPI operations**

### Required work

Expand OpenAPI coverage, prioritizing:

1. mutation routes,
2. account/session routes,
3. execution routes,
4. live/testnet validation and order routes,
5. external/provider settings,
6. operations/readiness/health,
7. persistence/decision-memory,
8. Liquidity Hunter governance,
9. backtesting/optimization.

For each operation document:

- method/path,
- auth requirements,
- CSRF/origin requirements,
- request schema,
- response schema,
- error schema,
- degradation states,
- status codes,
- side effects,
- idempotency expectations,
- provider/network dependencies.

Add CI coverage thresholds and prevent silent route/OpenAPI drift.

---

# 7. Clean Build and Full Verification

## GAP QA-01 — Full `npm run verify` Has Not Been Proven From a Clean Cross-Platform Install
**Priority: P1**

### Current condition

Selected source QA passes, and the bundled production server boots.

However, the shipped `node_modules` tree is platform-bound, so a full clean verification of the source package has not been established from the delivered dependency tree.

### Required work

In a clean supported environment:

```bash
rm -rf node_modules
npm ci
npm run verify
```

Capture:
- exact command,
- exit code,
- test counts,
- build artifacts,
- browser evidence,
- visual evidence,
- release-gate evidence.

Do not mark the project fully verified until this clean pipeline passes.

---

## GAP QA-02 — Full Browser / Visual Acceptance Must Be Re-Run After a Clean Build
**Priority: P2**

> ✅ **STATUS: DEFERRED WITH JUSTIFICATION** — Batch 4 / 2026-08-10. Workspace browser QA passed with 0 failures/page errors/console errors using system Chromium + project transport bridge. The latest visual rerun reached the app but terminated with a Playwright page/browser shutdown race; prior same-source UI report recorded 0 visual failures. Not marked FIXED in this batch.

### Required work

Run the project’s real browser/visual QA after clean build.

At minimum verify:

- target workspace size **1368×753**,
- overview,
- markets,
- watchlist,
- portfolio,
- trading,
- orders,
- positions,
- alerts,
- history,
- analytics,
- backtesting,
- strategies,
- settings,
- help.

For key screens verify:

- loading,
- empty,
- degraded,
- provider-unavailable,
- validation error,
- authorization error,
- stale-data state,
- success state.

Also verify:

- keyboard navigation,
- focus states,
- no clipped controls,
- responsive behavior,
- accessible labels,
- no misleading “live” state from unavailable data.

---

## GAP QA-03 — Full HTTP / WebSocket / Soak Validation Is Incomplete
**Priority: P2**

### Required work

Execute sustained tests for:

- HTTP route concurrency,
- proxy queue behavior,
- rate limits,
- operations status,
- readiness/drain behavior,
- WebSocket client connect/disconnect,
- repeated reconnect,
- sequence-gap recovery,
- snapshot reseed,
- browser cleanup,
- shutdown under load.

Record:
- p50/p95/p99 latency,
- error rate,
- RSS,
- heap,
- event-loop delay,
- active handles,
- queue depth,
- circuit-breaker state,
- reconnection counts.

---

## GAP QA-04 — Heavy-Load Harness Cleanup / Long Soak Evidence Is Incomplete
**Priority: P2**

### Historical/supporting evidence

Past stress evidence found that:
- extreme worker oversubscription can leave wrappers waiting,
- optimizer RSS increased during long loops,
- CPU-heavy concurrency requires bounded control.

These are not proof of a production leak by themselves.

### Required work

Run a controlled 30–60 minute soak with:
- explicit GC telemetry where available,
- heap snapshots before/after,
- active handle inventory,
- worker cleanup verification,
- bounded concurrency.

Fix actual leaks only if reproduced.

Also harden QA harness shutdown so test wrappers exit deterministically.

---

# 8. Provider / Data Hierarchy

## GAP DATA-01 — Bitget Adapter Is Planned, Not Executable
**Priority: P4 unless product requirements make it mandatory**

### Verified current condition

Provider capability registry marks Bitget:
- `registered: false`
- transport: `NONE`
- role: `PLANNED`

### Required work

Either:

### Option A — Keep Planned
- keep it visibly `PLANNED`,
- ensure it never enters executable priority,
- keep tests enforcing this.

### Option B — Implement
Only if explicitly required:
- official public REST/WS contracts,
- normalized symbols,
- tickers,
- candles,
- order book,
- trades/funding/OI as required,
- unit normalization,
- cadence validation,
- freshness validation,
- circuit/failover integration,
- QA,
- live provider verification.

Do not simply change `registered` to true.

---

## GAP DATA-02 — OKX Adapter Is Planned, Not Executable
**Priority: P4 unless product requirements make it mandatory**

Apply the same rules as Bitget.

---

## GAP DATA-03 — Bybit Is Evidence-Only, Not a Primary REST Market Fallback
**Priority: P4 / product-dependent**

### Verified current condition

Bybit is registered for realtime evidence categories such as:
- trades,
- order-book evidence,

but it is not part of the primary REST market fallback hierarchy.

### Required work

If Bybit is expected to become a primary market fallback, implement and verify:
- REST adapter,
- symbol normalization,
- ticker/candle/order-book contracts,
- quantity/unit semantics,
- freshness,
- rate limits,
- circuit behavior,
- source attribution,
- QA.

Otherwise document it clearly as `REALTIME_EVIDENCE` only.

---

## GAP DATA-04 — External Provider Live Verification Is Environment-Dependent
**Priority: P1 for production readiness**

### Current runtime condition

In the review sandbox, Binance/KuCoin public calls were unavailable/timed out while the application remained healthy and reported the condition honestly.

This proves degradation behavior, not live-provider correctness.

### Required work

Run provider validation from an approved environment where each intended provider is reachable.

Verify each actual contract used by APEX:

- ticker,
- candles,
- order book,
- funding,
- open interest,
- trades,
- instruments/contracts,
- historical pagination,
- WebSocket streams where applicable.

Capture:
- raw source provenance,
- latency,
- cadence,
- timestamps,
- freshness,
- units,
- pagination behavior,
- rate-limit response,
- failover behavior.

Do not disable geo/network error reporting to force a green status.

---

## GAP DATA-05 — Space-4 Freshness Metadata Is Not Candle Age
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Space-4 OHLCV freshness is derived from candle timestamps/cadence and local time in `parseHfSpace4Candles`; request/service freshness metadata is not used as candle age. Unit coverage rejects stale/cadence-invalid candles.

### Known provider limitation

Space-4 freshness-like metadata reflects request/service timing, not necessarily age of the underlying candle/event.

### Required work

Never use provider request latency as market-data freshness.

Compute freshness from:
- candle close/open timestamp,
- exchange event timestamp,
- expected interval,
- local receive timestamp.

Reject data that cannot prove acceptable age.

Add tests.

---

## GAP DATA-06 — Space-4 Funding Timestamp Semantics Are Insufficient for Scheduling
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. `parseSpace4Funding` accepts `nextFundingTime` only from the explicit verified field; generic `timePoint` is not reinterpreted as settlement time. Regression test passes.

### Known provider limitation

A mapped funding `timePoint` must not automatically be interpreted as the next funding settlement time.

### Required work

Separate:
- observation timestamp,
- funding effective time,
- next settlement time.

Do not schedule execution or strategy windows from an unverified mapped field.

Use the exchange’s verified contract for scheduling.

---

## GAP DATA-07 — Space-4 Funding History May Have Missing Timestamps
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Funding-history rows retain unknown timestamps as `null` and expose `historyTimestampsComplete=false`; missing timestamps are not fabricated. Unit coverage verifies the degraded/incomplete contract.

### Required work

If a funding-history row has no verifiable timestamp:
- do not place it into a chronological series as if time were known,
- do not infer ordering beyond what the source guarantees,
- expose degraded/incomplete state,
- add contract tests.

---

## GAP DATA-08 — Space-4 Open-Interest History Is Insufficient for OI Change Features
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 5 / 2026-08-10. Added durable `OpenInterestHistoryStore`, bounded `OpenInterestSampler`, restart recovery, retention/max-sample controls, gap/freshness detection, provenance/data-state labels, server startup sampling from verified current ticker OI, and `/api/market/open-interest-history` read endpoints. Verified with `src/tests/openInterestHistory.test.ts`, `npx tsc --noEmit`, and full `npx vitest run --reporter=dot` (99 files / 384 tests passing). Remaining limitation: live exchange OI quality still depends on reachable providers; no synthetic OI deltas are created from one current value.

### Current limitation

Observed OI history may be empty or insufficient.

### Required work

APEX must maintain its own verified OI time series if OI deltas/rates are required.

Implement:
- periodic sampling,
- timestamped storage,
- retention,
- gap handling,
- provenance,
- restart recovery,
- freshness checks.

Do not synthesize historical OI changes from one current value.

---

## GAP DATA-09 — KuCoin Order-Book Contract Quantities Require Multiplier-Aware Normalization
**Priority: P1**

> ✅ **STATUS: ALREADY RESOLVED** — verified 2026-08-10 (session batch 2). `src/services/marketDataService.ts::getOrderBook` already validates the multiplier (`Number.isFinite && > 0`) before conversion and fails closed to the next provider otherwise; `OrderBookResult.volumeUnit` (`'base_asset' | 'contracts_unknown'`) prevents USD depth from ever being fabricated when the multiplier is unknown, and this is test-covered in `src/tests/hfSpacesClient.test.ts`. No code change required. See `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_batch1.md`.

### Current truth rule

KuCoin futures depth sizes can represent contract counts.

USD/base depth requires contract multiplier normalization.

### Required work

Guarantee that:
- multiplier is verified before conversion,
- source units are retained,
- converted units are explicitly labeled,
- unknown multiplier cannot silently become USD depth.

For fallback payloads that lack a trustworthy multiplier:
- report degraded/unknown,
- set unusable derived liquidity metrics to unavailable,
- fail closed where the trading decision depends on them.

---

## GAP DATA-10 — Space-4 Batch Snapshot Latency Is Unsuitable for a Tight Scanner Cycle
**Priority: P2**

### Required work

Do not put a slow sequential fallback into a latency-critical hot path as if it had primary-provider performance.

Implement one or more of:
- bounded parallelization if provider permits,
- caching,
- stale-while-revalidate within verified TTL,
- background refresh,
- reduced fallback symbol set,
- explicit degraded cadence.

Measure actual cycle completion time.

---

## GAP DATA-11 — Space-2 Has a Strict Allowlist Because Many Endpoints Are Not Trustworthy for Trading
**Priority: P1 — preserve protection**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Added centralized strict executable HF Space allowlist in `src/services/hfSpaceContracts.ts`; low-level Space clients reject unapproved route/method combinations and tests enforce the allowlist.

### Required work

Keep strict allowlist/denylist validation.

Do not “complete” provider coverage by enabling unverified Space-2 routes.

For every enabled contract:
- verify cadence,
- schema,
- source,
- timestamp,
- empty-success behavior,
- market type,
- symbol semantics.

Space-2 generic OHLCV must not become a broad fallback unless independently verified.

---

## GAP DATA-12 — Optional Operator Providers Are Currently Unconfigured in the Reviewed Runtime
**Priority: Deployment completeness, not a source-code defect**
> ✅ **STATUS: BLOCKED EXTERNALLY** — Batch 4 / 2026-08-10. Source-side configuration/health UX now distinguishes optional operator-key providers, public exchanges, and owner-managed HF sources. Full live verification of all optional keyed providers still depends on reachable external APIs and operator credentials; no fake success is emitted.
**✅ STATUS: PARTIALLY RESOLVED (2026-08-10) — see verified condition below; new sub-gaps DATA-14 and DATA-15 spun out of this verification**

### Current condition

~~Operations status reported optional keyed providers as unconfigured.~~ (original finding)

**Re-verified 2026-08-10 with real operator keys populated in `.env`:** `NEWSAPI_KEY`, `HUGGING_FACE_TOKEN`/`HF_TOKEN`, `ETHERSCAN_KEY`, and `TRONSCAN_KEY` are now configured, and tracing the call graph confirms they are **not decorative** — `getSupplementalOrchestrator()` (`src/services/supplementalOrchestrator.ts`) reads them from `process.env`, fetches real data, and feeds three weighted evidence features (`news`, `sentiment`, `whaleFlow`) inside `evaluateStrategyFusion()` (`src/services/strategyFusion.ts`). With no key, each feature is correctly built as `quality: MISSING, available: false`; with a real key, `available: true` and the feature enters the fusion snapshot. `npm run dev`/`tsx server.ts` smoke-booted with these keys set and `/api/health` reported all five as `configured: true`.

`BSCSCAN_KEY` is the exception — see **DATA-14**, a distinct new defect, not just an unconfigured-optional-provider case.

### Required work

Improve deployment/config UX so the operator can clearly distinguish:

- owner-managed no-key HF gateway sources,
- exchange public providers,
- operator-key providers.

For each optional provider:
- configuration state,
- health state,
- last successful fetch,
- last failure,
- secret-redacted diagnostics.

Do not mark unconfigured optional providers as application failure if the feature is optional.

Remaining work after the 2026-08-10 re-verification: the `/api/health` "configured" flag (driven by `server.ts`'s own tracker) and the real fetch-capability of `supplementalOrchestrator.ts` are two independent code paths that happen to agree for News/HF/Etherscan/TronScan but silently disagree for BscScan (DATA-14). Unify these into a single source of truth so "configured" in health output always means "will actually be used."

---

## GAP DATA-14 — BscScan Operator Key Is Accepted and Reported Configured, but Never Reaches the Runtime Fetch Path
**Priority: P2 — silent dead credential, misleading health status**
> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. `getSupplementalOrchestrator()` now passes `process.env.BSCSCAN_KEY`; dedicated BSC key wins over `ETHERSCAN_KEY`, with deliberate tested fallback to Etherscan V2 chainid 56. BscScan health configuration now uses the same effective-key semantics.
**✅ STATUS: VERIFIED / NOT YET FIXED (found 2026-08-10) — root cause identified, fix not yet applied**

### Verified current condition

`server.ts` reads `process.env.BSCSCAN_KEY`, stores it in its supplemental-keys config object, and `healthTracker.markConfigured('BscScan')` fires whenever it is non-empty — so `/api/health` truthfully reports the env var is *present*, but this is where the trail ends.

`getSupplementalOrchestrator()` — the actual singleton that performs on-chain fetches — is initialized as:

```ts
instance = new SupplementalOrchestrator({
  newsApiKey: process.env.NEWSAPI_KEY,
  huggingFaceToken: process.env.HUGGING_FACE_TOKEN,
  etherscanKey: process.env.ETHERSCAN_KEY,
  tronScanKey: process.env.TRONSCAN_KEY,
});
```

`bscScanKey` is never passed, even though `SupplementalOrchestrator`'s constructor and `BscScanProvider` both support it. Internally, BSC chain data is instead fetched via Etherscan's V2 multi-chain endpoint (chainid 56) using a fallback:

```ts
const bscKey = config?.bscScanKey || config?.etherscanKey;
if (bscKey) this.onchainProviders.push(new BscScanProvider({ apiKey: bscKey, timeout }));
```

Net effect: an operator-supplied `BSCSCAN_KEY` is silently discarded. BSC on-chain evidence still gets fetched (as long as `ETHERSCAN_KEY` is set), just never with the dedicated key the operator provided — and `/api/health` reporting `configured: true` for BscScan is misleading, since that flag does not reflect what the fetch path actually uses.

### Required work

- Wire `bscScanKey: process.env.BSCSCAN_KEY` into the `getSupplementalOrchestrator()` default/env-based initialization in `src/services/supplementalOrchestrator.ts`, matching the pattern already used for the other three keys.
- Add a regression test asserting that when `BSCSCAN_KEY` is set, `SupplementalOrchestrator`'s BSC provider is constructed with that key rather than falling back silently to `etherscanKey`.
- Decide and document intended behavior for the fallback case (no dedicated `BSCSCAN_KEY`, only `ETHERSCAN_KEY` present) — current silent-fallback-to-Etherscan-key behavior is reasonable, but should be an explicit, tested, documented contract rather than an accidental byproduct of the same bug that skips the dedicated key entirely.
- Align `/api/health`'s "configured" definition with actual fetch-path capability (see DATA-12 remaining work) so this class of drift cannot recur for other providers.

### Acceptance

- `BSCSCAN_KEY` set in env → `SupplementalOrchestrator`'s internal BSC provider is verifiably constructed with that key (unit test, not just env presence).
- Regression test fails on the current source (proving it reproduces the bug) and passes after the fix.
- `tsc --noEmit` and full `vitest run` remain green.

---

## GAP DATA-15 — Duplicate, Unused Provider-Catalog Modules With an Internal Naming Inconsistency
**Priority: P4 — dead code, no runtime effect, but misleading to future maintainers**
> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Removed both duplicate dead catalogs (`src/services/providers/intelligenceSources.ts`, `src/lib/providerCatalog.ts`) and their stale env-name metadata. Repository search confirms no remaining references.
**✅ STATUS: VERIFIED (found 2026-08-10) — confirmed dead, not yet removed or documented**

### Verified current condition

`src/services/providers/intelligenceSources.ts` and `src/lib/providerCatalog.ts` both define a metadata-only catalog of the same supplemental providers (news/sentiment/on-chain), each with its own `requiredEnv` list. Neither file is imported anywhere in the codebase outside itself (`grep -rn` for both across `src/` and `server.ts` returns no external consumers) — both are fully dead code at runtime.

They also disagree with the real, active code path: `intelligenceSources.ts` lists `requiredEnv: ['BSCSCAN_API_KEY']` for BscScan, which does not match the actual env var (`BSCSCAN_KEY`) used anywhere else in the project (`server.ts`, `.env.example`). Because neither file executes, this mismatch has no runtime impact today — but it is exactly the kind of stale, unreferenced metadata that misleads a future contributor (or a coding agent) into "fixing" the wrong file, or asserting a provider is wired up based on catalog metadata that nothing actually reads.

### Required work

Choose one, per the project's own standing rule (STR-06) against pretending unused code is an active feature:
- **Remove** both files if no planned feature depends on them, or
- **Wire one of them in** as the actual single source of provider metadata (deduplicating the two), correcting the `BSCSCAN_API_KEY` → `BSCSCAN_KEY` mismatch as part of that consolidation, or
- If kept for a documented future purpose, mark them clearly as unused/planned in a file-level comment and exclude them from any "coverage" or "wired providers" claims in documentation.

### Acceptance

- No remaining unreferenced duplicate provider catalog, or the surviving one is demonstrably imported and used.
- No lingering `BSCSCAN_API_KEY` vs `BSCSCAN_KEY` (or equivalent) naming mismatch between whatever catalog remains and the actual env-reading code.

---

## GAP DATA-13 — Supplemental Sentiment “Neutral” Sentinel Is a Contract-Hardening Risk
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Unavailable sentiment now carries `valid:false`; Strategy Fusion requires `valid===true` and rejects unavailable/not-configured evidence instead of consuming a neutral-shaped sentinel. Full unit suite passes.

### Current risk

An unavailable/not-configured sentiment result can carry a numeric neutral-like payload while its status/source correctly indicate non-availability.

Existing consumers may gate correctly, but the payload shape can be misused by future code.

### Required work

Harden the contract so unavailable evidence cannot be mistaken for real neutral evidence.

Preferred designs:
- `data: null` when unavailable, or
- explicit `valid: false`, plus mandatory consumer gating.

Add tests proving:
- no score is generated from unavailable sentiment,
- UI does not display it as real market sentiment,
- fusion does not treat it as neutral evidence.

---

# 9. Liquidity Hunter Completion

## GAP LH-01 — Liquidity Hunter Core Is Disabled by Default
**Priority: Intentional safety state**

### Verified current configuration

The default configuration keeps the Liquidity Hunter core disabled.

This is not a bug.

### Required completion path

If the product goal is to validate Liquidity Hunter:

1. Enable only in a controlled shadow environment.
2. Keep `shadowOnly=true`.
3. Enable event recording.
4. Verify realtime feed contracts.
5. Gather sufficient evidence.
6. Run paper canary.
7. Run shadow evaluation.
8. Review threshold governance.
9. Produce an evidence report.

Do not enable autonomous live execution.

---

## GAP LH-02 — Realtime Public Feed Set Is Disabled by Default
**Priority: P2 for shadow validation**

Potential feeds include:
- Binance,
- KuCoin,
- Bybit,
- Deribit,
- Hyperliquid,
- Hyblock,
- sentiment velocity.

### Required work

For each feed:
- explicit feature flag,
- health status,
- reconnect policy,
- sequence handling,
- snapshot reseed,
- stale detection,
- event recording,
- shutdown cleanup.

Enable only feeds with validated contracts.

---

## GAP LH-03 — Four Edge Families Are Not Configured
**Priority: P2 for complete evidence coverage**

Current incomplete evidence families include:

- liquidation topology,
- whale positioning,
- options gamma,
- contrarian wallets.

### Required work

#### Liquidation topology
Requires:
- verified Hyblock or approved equivalent,
- credential/configuration,
- freshness,
- topology schema validation.

#### Whale positioning
Requires:
- Hyperliquid observation/history,
- fee/funding-aware grading,
- sufficient history.

#### Options gamma
Requires:
- Deribit options flow/greeks/OI,
- timestamp/freshness guarantees,
- methodology documentation.

#### Contrarian wallets
Requires:
- long-duration wallet grading,
- survivorship controls,
- outcome labels.

Do not fabricate missing evidence.

---

## GAP LH-04 — Shadow-Only Edge Families Need Real Validation Data
**Priority: P2**

Shadow-only areas include capabilities such as:
- iceberg absorption,
- multi-exchange CVD,
- sentiment velocity,
- meta model.

### Required work

Collect:
- source events,
- edge outputs,
- forward outcomes,
- hit/miss rates,
- calibration,
- regime breakdown,
- stale/failure behavior.

A shadow edge must remain non-authoritative until evidence supports explicit manual promotion.

---

## GAP LH-05 — Paper Canary Has No Meaningful Production Evidence Yet
**Priority: P2**

### Required work

Run paper canary for a sufficient period.

Track:
- signal count,
- accepted/rejected setup count,
- forward returns,
- adverse/favorable excursion,
- timing,
- provider degradation,
- regime,
- edge contributions.

Paper canary must remain a measurement system, not a hidden execution route.

---

## GAP LH-06 — Threshold Governance Has Little or No Operational Revision History
**Priority: P2**

### Required work

Exercise the full lifecycle:

1. propose,
2. review,
3. approve/reject,
4. activate,
5. audit,
6. rollback.

Store:
- author/operator,
- previous value,
- proposed value,
- reason,
- evidence,
- timestamp,
- revision,
- affected symbols/regimes.

No auto-apply.

---

## GAP LH-07 — Meta Model Is Not Ready for Authority
**Priority: P1 safety**

### Required work

Keep DEVELOPMENT/shadow status until the ML/data requirements in Section 11 are complete.

The model must never bypass deterministic fusion failures.

---

# 10. Testnet and Live Execution

## GAP EXE-01 — KuCoin Futures Testnet Is Deliberately Blocked in Source
**Priority: P1 product incompleteness / intentional safety blocker**

### Verified current condition

The current testnet endpoint approval function is effectively deny-by-default.

The code does not accept an unverified KuCoin Futures Testnet REST hostname.

Therefore manual testnet readiness cannot become genuinely ready simply through environment configuration.

### Required work

Choose one:

### Option A — Keep Blocked
If no independently verified official Futures testnet endpoint exists:
- keep readiness blocked,
- expose clear reason,
- document limitation.

### Option B — Implement Verified Testnet
Only after official endpoint verification:
- hard-code/programmatically validate approved hostname,
- prohibit arbitrary operator endpoint override,
- verify authentication,
- verify order-test/create/cancel/query behavior,
- verify symbol/contract mapping,
- add integration tests,
- add environment safety checks.

Do not remove the allowlist just to make the UI green.

---

## GAP EXE-02 — No Primary Private KuCoin Order/Fill WebSocket Is Proven
**Priority: P1**

> ✅ **STATUS: BLOCKED EXTERNALLY** — Batch 4 / 2026-08-10. Implemented a server-only authenticated KuCoin private order/fill WebSocket read/reconciliation plane with reconnect/degradation handling and REST reconciliation fallback; source tests pass. Live authenticated provider verification remains blocked without a safe KuCoin private-account environment.

### Current execution architecture

REST reconciliation exists.

However, production-grade exchange state should not depend only on polling/reconciliation if a verified private order/fill stream is available.

### Required work

If supported by the official exchange contract, implement:

- authenticated private WS token/session,
- order updates,
- fills,
- cancel updates,
- protective-order updates,
- reconnect,
- token refresh,
- sequence/order guarantees,
- resubscription,
- REST reconciliation fallback.

REST remains the recovery authority after uncertainty.

---

## GAP EXE-03 — Protective Orders Can Remain `ATTACHED_UNVERIFIED`
**Priority: P1**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Protective-order coordinator now uses REQUESTED/SUBMITTED/ACKNOWLEDGED/ACTIVE_VERIFIED/REJECTED/UNKNOWN/RECONCILING lifecycle; acknowledged-but-unverified protection reports zero protected quantity and uncertainty fails closed. Focused tests pass.

### Required work

A protective-order request is not equivalent to confirmed exchange protection.

Add a verification lifecycle:

- REQUESTED
- SUBMITTED
- ACKNOWLEDGED
- ACTIVE_VERIFIED
- REJECTED
- UNKNOWN
- RECONCILING

Verify with exchange evidence before presenting protection as active.

If verification is unavailable:
- show `UNVERIFIED`,
- fail closed for workflows that require guaranteed protection.

---

## GAP EXE-04 — Real Crash/Restart/Idempotency Evidence Is Incomplete
**Priority: P1**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Added crash/restart/idempotency recovery tests covering persist-before-submit, submit-before-ack, duplicate client order identity, partial fill, cancel race, and restart reconciliation using a safe isolated validation store. No real-capital destructive test was run.

### Required work

Against a safe validation/test environment, verify:

- crash after intent persist but before submit,
- crash after submit before acknowledgement,
- duplicate retry,
- partial fill,
- cancel race,
- reconnect,
- protective-order retry,
- restart reconciliation,
- client-order-id idempotency.

No real-capital destructive tests.

---

## GAP EXE-05 — Production Authentication Profile Needs Explicit Hardening
**Priority: P1 deployment**

> ✅ **STATUS: FIXED** — 2026-08-10 (session batch 2). Added an explicit `DeploymentProfile` (`local | lan | production`) via `resolveDeploymentProfile()` in `src/services/serverSecurity.ts`; `local` (default) preserves prior behavior exactly. `production` now hard-requires an operator token (503 if missing) and TLS on every mutating request (403 if the request is not secure), enforced in `assertMutationAllowed()` and wired through `server.ts`. `/api/security/bootstrap` now reports `deploymentProfile`/`tlsRequired`/`hardeningSatisfied`. Verified: clean `npm ci`, `tsc --noEmit` → 0 errors, `vitest run src/tests/serverSecurity.test.ts` → 17/17 passing (10 pre-existing + 7 new covering all four production-profile branches). `lan` profile is currently a named placeholder with no additional enforcement (no concrete rule was specified for it). Actual TLS termination (certificate/reverse proxy) remains an operator/infra task. See `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_batch1.md`.

### Current condition

The reviewed runtime can operate with the operator token unset, relying on local/same-origin request protections.

That is appropriate only for a constrained local deployment profile.

### Required work

Define explicit profiles:

- local desktop,
- trusted LAN if supported,
- production/remote.

For production/remote:
- require strong operator authentication,
- require TLS at deployment boundary,
- preserve origin/CSRF checks,
- reject insecure configuration.

Expose security posture in diagnostics without revealing secrets.

---

# 11. Decision Memory, Outcomes, Adaptive Learning, and Shadow ML

## GAP ML-01 — Decision Memory Has No Resolved Outcome Dataset
**Priority: P1 for ML/calibration**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Decision outcome resolution now persists outcome timestamp, horizon, return definition, entry/exit references, fee/funding availability, provenance, and explicit unresolved reasons without label/cost imputation. Focused and full unit tests pass.

### Observed runtime condition

Decision memory contained accepted/rejected decisions, but resolved outcomes were effectively absent.

### Required work

Implement a reliable outcome-resolution pipeline.

Each eligible decision must eventually be linked to:

- outcome timestamp,
- WIN/LOSS/other allowed label,
- return definition,
- horizon,
- entry/exit reference,
- fees,
- funding if applicable,
- provenance,
- reason if unresolved.

No label imputation.

---

## GAP ML-02 — Canonical ML Training Dataset Is Missing / Insufficient
**Priority: P1**

> ✅ **STATUS: FIXED** — Batch 5 / 2026-08-10. Added canonical ML dataset preparation/validation with schema/feature versioning, chronological 70/15/15 splits, accepted binary outcomes only, feature completeness filtering, feature provenance, leakage-feature exclusion, SHA-256 row integrity, and preserved 300-row / 30-minority-class gates. Verified with `src/tests/mlDatasetCanonical.test.ts`, `npx tsc --noEmit`, and full `npx vitest run --reporter=dot` (99 files / 384 tests passing). Remaining limitation: actual model training still remains blocked until enough real resolved outcomes exist; thresholds were not lowered.

### Current training requirement

Training requires at least:
- 300 complete labeled rows,
- 30 minority-class rows.

Current complete training data is insufficient.

### Required work

Build a canonical export pipeline from resolved decision memory.

Validate:
- schema version,
- no leakage,
- completeness,
- label balance,
- chronological order,
- feature provenance.

Do not lower thresholds merely to force training.

---

## GAP ML-03 — Shadow Model Artifact Is Missing
**Priority: P2**

### Required work

After dataset requirements are met:

- chronological split,
- 70/15/15 or current approved contract,
- walk-forward validation,
- versioned feature schema,
- versioned model artifact,
- checksum,
- training metadata,
- calibration metrics,
- drift baseline.

Keep model DEVELOPMENT/shadow-only.

---

## GAP ML-04 — No Meaningful Shadow Comparison Can Run Without a Model
**Priority: P2**

### Required work

Once a valid model exists:
- score shadow rows,
- compare model vs deterministic system,
- log disagreements,
- calibration,
- precision/recall by regime if applicable,
- reliability curves,
- failure cases.

No automatic promotion.

---

## GAP ML-05 — Dataset Mirror Is Unconfigured
**Priority: Optional / deployment**

> ✅ **STATUS: FIXED** — Batch 5 / 2026-08-10. Added optional DecisionMemory dataset backup/restore durability with `HF_TOKEN`/`HUGGING_FACE_TOKEN` alias support, `HF_DECISION_MEMORY_REPO` configuration gating, SKIPPED vs ERROR vs EMPTY vs SYNCED states, retry/backoff, checksum-based idempotency persisted across restarts, restore checksum validation, and token redaction. Verified with `src/tests/decisionMemoryDatasetSync.test.ts`, `npx tsc --noEmit`, and full `npx vitest run --reporter=dot` (99 files / 384 tests passing). Remaining limitation: real Hugging Face dataset upload/restore was not live-verified in this sandbox; operator credentials/repo are deployment inputs.

### Current condition

Decision-memory dataset synchronization is skipped when required repository/token configuration is absent.

### Required work

Decide whether production truth is:

- local durable storage only,
- external dataset mirror,
- both.

If external sync is supported:
- secure credentials,
- retry/backoff,
- idempotency,
- checksum/version,
- no secret leakage,
- clear SKIPPED vs FAILED state.

---

## GAP ML-06 — Adaptive Threshold Audit Evidence Is Session-Local
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Adaptive-threshold governance revisions are durable server-side rather than session-local only, retaining actor/evidence/revision/rollback linkage while preserving manual approval and no auto-apply.

### Required work

If adaptive threshold governance is intended to be auditable across restarts, persist revision/audit events server-side.

Required fields:
- revision,
- old/new values,
- actor,
- evidence,
- decision,
- timestamp,
- rollback linkage.

Do not rely on client-session history as the only governance record.

---

## GAP ML-07 — Confidence Calibration Still Lacks Real Outcome Evidence
**Priority: P1**

### Required work

Use real resolved decision outcomes to calibrate:

- confidence bins,
- regime-specific reliability,
- over/under-confidence,
- expected vs realized success,
- drift.

Synthetic stress results may validate code behavior but must not be presented as production calibration evidence.

---

# 12. Strategy and Research Completion

## GAP STR-01 — Dynamic Cointegration Basket Strategy Is Blocked by Missing Historical L1 Bid/Ask Contract
**Priority: P2 / research**

> ⚠️ **STATUS: PARTIALLY RESOLVED** — Batch 5 / 2026-08-10. Added `src/services/research/historicalMicrostructure.ts` L1 quote storage/validation with bid, ask, venue, timestamp, spread, symbol normalization, gap/cadence checks, and no candle substitution. Verified with `src/tests/historicalMicrostructure.test.ts` and full unit suite. Remaining limitation: strategy remains blocked until real historical L1 datasets are ingested and replay/backtest validation is run against production-like data.

### Required work

Do not unblock with candles.

Implement a real historical L1 contract including:
- bid,
- ask,
- timestamp,
- venue,
- spread,
- symbol normalization,
- gap/freshness rules.

Then add replay/backtest support.

---

## GAP STR-02 — L2 Liquidity-State Scalper Is Blocked by Missing Historical L2
**Priority: P2 / research**

> ⚠️ **STATUS: PARTIALLY RESOLVED** — Batch 5 / 2026-08-10. Added L2 snapshot/delta ingestion, sequence validation, book reconstruction, corruption/gap rejection, source units, and multiplier-required normalization for contract-count depth. Verified with `src/tests/historicalMicrostructure.test.ts` and full unit suite. Remaining limitation: strategy remains blocked until real historical L2 feeds/datasets and replay reconstruction are validated at scale.

### Required work

Build a real historical L2 data pipeline:

- snapshots,
- deltas,
- sequence IDs,
- timestamp,
- depth,
- venue,
- contract multiplier/units,
- replay reconstruction,
- corruption/gap detection.

Do not approximate with OHLCV.

---

## GAP STR-03 — Cross-Exchange Market Making Requires Two Verified Live Venues and Fill/Latency Simulation
**Priority: P2 / research**

> ⚠️ **STATUS: PARTIALLY RESOLVED** — Batch 5 / 2026-08-10. Added simulation-only cross-venue market-making infrastructure with synchronized top-of-book inputs, queue approximation, maker/taker fees, hedge latency, slippage limits, inventory caps, venue outage/degradation behavior, and explicit `executionAuthorized: false`. Verified with `src/tests/marketMakingSimulator.test.ts` and full unit suite. Remaining limitation: still requires two live verified venues and calibrated fill/latency data before research can be promoted.

### Required work

Before unblocking:
- two independently verified exchange connections,
- synchronized timestamps,
- latency model,
- queue model,
- fill simulator,
- maker/taker fees,
- cancel latency,
- partial fills,
- inventory state,
- venue outage/degradation logic.

---

## GAP STR-04 — Funding-Aware Avellaneda Market Maker Lacks Production-Grade Order-Book / Fill Simulation
**Priority: P2 / research**

> ⚠️ **STATUS: PARTIALLY RESOLVED** — Batch 5 / 2026-08-10. Added simulation-only funding-aware Avellaneda quote/inventory model with funding skew, fees, cancel latency, queue approximation, inventory risk limits, finite-metric checks, and explicit `executionAuthorized: false`. Verified with `src/tests/marketMakingSimulator.test.ts` and full unit suite. Remaining limitation: still blocked until real order-book/fill calibration and live venue evidence exist.

Implement:
- calibrated order arrival/fill assumptions,
- L2 queue position,
- spread dynamics,
- inventory risk,
- funding timing,
- fees,
- latency,
- cancellation behavior.

Remain blocked until validated.

---

## GAP STR-05 — Advanced Scanner Core Is Shadow/Replay, Not Live Authority
**Priority: Intentional safety gate**

### Required work

If promotion is desired, do not flip a boolean.

Require:
- replay evidence,
- live shadow evidence,
- DecisionMemory outcomes,
- calibration,
- regression comparison to baseline,
- governance approval,
- rollback plan.

Otherwise keep current status and document it clearly.

---

## GAP STR-06 — `MathEngine.detectStructuralZones` Has No Operational Consumer
**Priority: P3 / P4**

> ✅ **STATUS: ALREADY RESOLVED** — Batch 4 / 2026-08-10. `MathEngine.detectStructuralZones` is explicitly registered as `PLANNED` with `consumers: []` in `tradingModuleRegistry.ts`; it is not presented as active runtime behavior.

### Required work

Choose one:

- integrate it into a documented, tested evidence flow, or
- keep it explicitly `PLANNED`, or
- remove it if truly dead and no contract depends on it.

Do not pretend unused code is an active feature.

---

## GAP STR-07 — News/Sentiment/On-Chain Fusion Evidence Is Wired Only Into the Strategy-Fusion Preview Endpoint, Not Confirmed in the Live Short Hunter Signal Pipeline
**Priority: P2 — scope clarification with real product impact**
> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Branch A selected deliberately: supplemental News/sentiment/on-chain evidence remains Strategy-Fusion/intelligence scope and is explicitly documented as non-authoritative for the live Short Hunter candidate/scoring pipeline. This avoids silently changing live trading authority without shadow evidence.
**✅ STATUS: VERIFIED (found 2026-08-10) — confirmed as currently scoped; not yet extended or explicitly documented as intentional**

### Verified current condition

`evaluateStrategyFusion()` (`src/services/strategyFusion.ts`) is the only consumer of the `news`/`sentiment`/`whaleFlow` evidence features described in DATA-12. Its only caller in the entire codebase is the `/api/strategies/:strategyId/...` fusion-preview route inside `src/services/apexNextMarketRoutes.ts` (`grep -rn "evaluateStrategyFusion"` returns exactly one call site plus the definition).

No reference to `strategyFusion` (or `evaluateStrategyFusion`) was found in the 13-stage Short Hunter candidate/scanner pipeline, `signalLifecycleTracker.ts`, `canonicalDecisionAdapter.ts`, or any other file that produces the live signals shown in the Command Center dashboard. In other words: a real, correctly-wired news/sentiment/on-chain evidence pipeline exists and is genuinely used by the app — but only inside a separate strategy-lab "fusion preview / optimization" feature, not (as currently verified) inside the primary live signal-generation path that operators actually watch.

This distinction matters for anyone assuming that adding operator API keys (NewsAPI/HF/Etherscan/TronScan) directly improves live Short Hunter signal quality today — verified evidence says it does not, until this gap is closed one way or the other.

### Required work

Either:
- **Confirm and document** that this separation is intentional (e.g., the fusion/backtest lab is deliberately isolated from the live scanner for now), updating operator-facing docs so the keys' actual current scope is not overstated, or
- **Extend** the live Short Hunter candidate/scoring pipeline to also consume `getSupplementalOrchestrator()` evidence through the same `news`/`sentiment`/`whaleFlow` feature contract, with the same `MISSING`/`available` gating already proven correct in `strategyFusion.ts`, plus tests proving the live pipeline degrades gracefully when supplemental providers are unconfigured.

Do not claim in documentation or UI that operator-configured news/sentiment/on-chain keys enhance live trading signals unless that path is verified end-to-end, per the Evidence and Truth Policy in Section 1.

### Acceptance

- Either an explicit, documented scope boundary exists (fusion-preview only, by design), or
- The live signal pipeline demonstrably consumes the same evidence features, with a passing test showing a live candidate's score changes when supplemental evidence is present vs. `MISSING`.

---

# 13. Architecture and Maintainability

## GAP ARC-01 — `server.ts` Is an Oversized Composition Root
**Priority: P3**

### Current condition

`server.ts` contains substantial:
- bootstrap,
- middleware,
- routes,
- account/execution orchestration,
- health/operations,
- provider/config surfaces,
- persistence wiring.

### Required work

Refactor incrementally into domain route modules and composition helpers.

Constraints:
- no endpoint behavior changes,
- no middleware ordering regressions,
- no security bypass,
- no hidden auth differences,
- no lifecycle/shutdown regression.

Add route-index comparison before/after.

---

## GAP ARC-02 — `apexNextMarketRoutes.ts` Is an Oversized Domain Composition File
**Priority: P3**

### Required work

Split by domain, for example:

- market/scanner,
- strategies,
- backtesting,
- optimization,
- autopilot/research council,
- Liquidity Hunter.

Preserve:
- exported route behavior,
- route order where meaningful,
- middleware inheritance,
- response contracts.

---

## GAP ARC-03 — Large Provider / Operations Modules Need Narrower Ownership
**Priority: P3**

Candidates include:
- `marketDataService.ts`
- `operationsStatus.ts`
- `proxyFetch.ts`
- large provider collections
- large backtesting/optimization modules

Refactor only after tests capture current behavior.

Prefer:
- explicit contracts,
- small pure validators,
- source-specific adapters,
- transport separated from semantic validation,
- orchestration separated from normalization.

---

## GAP ARC-04 — Static Import Cycles Exist
**Priority: P3**

### Current observed cycles

One larger SCC involves modules including:
- math engine,
- scanner policy/core,
- smart-money context,
- shared types.

Another small cycle involves:
- account client,
- workspace insights.

These are not proof of runtime recursion, and some edges may be type-only.

### Required work

Remove avoidable cycles by:
- extracting shared type contracts,
- using `import type`,
- moving pure interfaces/enums to dependency-neutral modules.

Do not perform a risky rewrite solely for graph aesthetics.

---

## GAP ARC-05 — Large Frontend Components and CSS Layers Create UI Maintenance Risk
**Priority: P3**

### Required work

Refactor large views only after screenshot/visual regression baselines exist.

Targets include large:
- account views,
- backtesting page,
- price chart,
- strategy page,
- markets/symbol-detail areas,
- global/theme CSS files.

Goals:
- smaller page sections,
- clearer layout primitives,
- scoped style ownership,
- fewer cascade overrides,
- preserve backend behavior,
- preserve 1368×753 target visual hierarchy.

---

# 14. Frontend Product-State Completeness

## GAP UI-01 — Every Data-Driven Page Needs Explicit Degraded-State UX
**Priority: P2**

For every backend-dependent view, explicitly distinguish:

- loading,
- live,
- cached/degraded,
- unavailable,
- not configured,
- stale,
- authorization required,
- empty valid dataset,
- actual error.

Do not map all of these to one generic spinner or empty state.

---

## GAP UI-02 — Provider Provenance Must Be Visible Where It Changes Decision Quality
**Priority: P2**

For relevant market/intelligence surfaces, expose non-secret metadata such as:

- source,
- degraded state,
- freshness age,
- last update,
- fallback tier where useful.

Do not overload the UI, but never imply primary/live truth when the backend returned degraded fallback data.

---

## GAP UI-03 — Planned / Shadow / Blocked Features Must Be Visually Distinct From Active Features
**Priority: P2**

Examples:
- Bitget/OKX planned providers,
- advanced scanner shadow mode,
- blocked L1/L2/MM research strategies,
- shadow ML,
- Liquidity Hunter edges not configured,
- testnet blocked by endpoint verification.

Use explicit status labels.

---

# 15. Operations and Observability

## GAP OPS-01 — Provider Health Must Distinguish Configuration, Reachability, and Contract Validity
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Provider health/operations telemetry now preserves distinct reason classes for configuration, network/DNS, HTTP rejection, schema/contract invalidity, stale data, rate limit, circuit-open, and healthy states with machine-readable codes.

Do not collapse these states:

- not configured,
- disabled,
- DNS/network unavailable,
- HTTP rejected,
- schema invalid,
- stale,
- rate limited,
- circuit open,
- healthy.

Operations status should preserve machine-readable reason codes.

---

## GAP OPS-02 — Clean Production Readiness Needs Dependency-Level Evidence
**Priority: P1**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Production readiness now exposes dependency-level evidence for HTTP acceptance, primary market data, persistence, account/execution connectivity, Liquidity Hunter, and optional supplemental sources instead of hiding partial degradation behind one boolean.

A server can be `ready` while optional dependencies are degraded.

Define explicit production criteria for:

- HTTP server,
- primary market data,
- execution connectivity,
- account freshness,
- persistence,
- Liquidity Hunter if enabled,
- optional supplemental sources.

Do not make one boolean hide partial degradation.

---

## GAP OPS-03 — Runtime Security Posture Should Be Observable
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Runtime security posture exposes safe non-secret indicators for deployment profile, operator auth requirement/configuration, TLS expectation, mutation/origin protections, kill-switch state, and live-execution enablement.

Expose safe, non-secret indicators:

- operator auth required/configured,
- allowed deployment mode,
- HTTPS expectation,
- mutation auth enabled,
- CSRF/origin policy active,
- kill-switch state,
- live execution enabled/disabled.

Never return credentials.

---

# 16. Persistence and Governance

## GAP PERS-01 — Runtime Secret/Config Persistence Should Not Use Repository Root
**Priority: P0/P1**

> ✅ **STATUS: FIXED** — 2026-08-10 (session batch 1). Added `resolvePrivateDataDir()` / `resolvePrivateConfigPath()` to `src/services/privateConfigFile.ts`: resolution order is `APEX_PRIVATE_DATA_DIR` env override → `%APPDATA%\APEX\private` (Windows) → `~/.apex/private` (other OSes) → `<cwd>/.apex-private-data` as a last resort only. All three `*_CONFIG_PATH` constants in `server.ts` (`.supplemental.config.json`, `.external-api-sources.config.json`, `.telegram.config.json`) now resolve outside the repo root, with automatic one-time migration of any legacy file found at the old repo-root path (existing operator config/keys are preserved, not reset). File permissions (`0700` dir / `0600` file) and atomic writes were already correct and are unchanged. Verified: `tsc --noEmit` → 0 errors; manual migration smoke test confirmed legacy-file migration + correct permissions end-to-end. Not yet executed on an actual Windows host in this session (container is Linux) — recommend a one-time manual check that `%APPDATA%\APEX\private\` is populated after first Windows run. See `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_batch1.md`.

### Required work

Move local mutable runtime state to a dedicated private data directory.

Suggested conceptual structure:

```text
.apex-data/
  config/
  secrets/
  state/
  decision-memory/
  execution/
  governance/
  logs/
```

The actual location may use an OS-specific user-data directory.

Requirements:
- migration,
- safe permissions,
- atomic writes,
- corruption handling,
- backup/recovery where appropriate,
- no release inclusion.

---

## GAP PERS-02 — Flat JSON Persistence Needs Explicit Durability Guarantees
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Added shared durable JSON persistence with atomic writes, lock/concurrency handling, schema/version validation, backup/recovery hooks and tests; execution/governance/decision-memory stores are wrapped without weakening existing contracts.

The absence of a database is not itself a defect.

However, every state file that matters to execution/governance must define:

- atomic write behavior,
- file locking/concurrency policy,
- corruption recovery,
- schema version,
- migration,
- backup/rollback,
- maximum size/compaction.

Prioritize:
- order/intent state,
- decision memory,
- threshold governance.

---

# 17. Route / Contract Accuracy

## GAP API-01 — Route Counts and Architecture Documentation Must Use Current Source Truth
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Generated API Route Index now reports the current literal source truth (128 `/api/*` operations) and CI/source-contract checking detects route-index drift.

Current literal count in this snapshot:

- `server.ts`: 107 registrations
- `apexNextMarketRoutes.ts`: 22 registrations
- total: 129
- `/api/*`: 128
- SPA catch-all: 1

Update generated docs/HTML/MD whenever this changes.

Do not keep an unqualified historical `150+` claim if current literal source evidence says otherwise.

Automate route-count verification in CI.

---

## GAP API-02 — Contract Tests Need to Cover Provider Degradation and Error Envelopes
**Priority: P2**

> ✅ **STATUS: FIXED** — Batch 4 / 2026-08-10. Added provider-degradation/error-envelope contract coverage across primary/fallback/stale/unavailable/schema/timeout/rate-limit/auth/not-configured/circuit states; client/server types preserve truthful degradation.

For major APIs, add tests for:

- primary success,
- fallback success,
- stale fallback,
- no providers,
- schema rejection,
- timeout,
- rate limit,
- auth failure,
- provider not configured,
- circuit open.

Ensure UI/client types handle each state.

---

# 18. Required Provider Hierarchy Truth

Preserve the current distinction that **there is no universal provider fallback chain**.

Document and test separate hierarchies for:

## Market Tickers
Primary public exchange tiers, then only validated composite HF fallback, then fail closed.

## Candles
Verified current hierarchy must remain contract-aware:
- Binance,
- KuCoin,
- Space-4 where contract-valid,
- only explicitly verified Space-2 historical contract(s),
- bounded verified stale cache,
- fail closed.

## Order Book
Must preserve unit validation and multiplier rules.

## Long Historical Windows
Must use explicit pagination and closed-candle validation.

## News
Owner-approved HF gateways before operator-entered provider credentials.

## Sentiment
Do not promote missing data to neutral evidence.

## On-chain / Whale Data
Do not use unrelated hard-coded addresses to manufacture a result.

Every hierarchy must have automated tests that fail if an unregistered/planned provider silently enters executable priority.

---

# 19. Required Completion Order

Implement in this order unless a dependency requires otherwise.

## Phase 1 — Release Safety and Reproducibility
1. Remove forbidden secret config.
2. Move runtime secret persistence.
3. Remove `node_modules` from source release.
4. Define source/build/evidence artifacts.
5. Clean `npm ci`.
6. Full verify.

## Phase 2 — Documentation and Contract Truth
7. Fix stale current-state docs.
8. Regenerate/verify API route index.
9. Expand OpenAPI.
10. Reconcile root contract.
11. Add release manifest/provenance.

## Phase 3 — Provider/Data Reliability
12. Live-verify primary providers in reachable environment.
13. Harden timestamp/freshness/unit semantics.
14. Implement OI history if required.
15. Harden unavailable sentiment contract.
16. Maintain strict HF allowlist.
17. Keep planned providers non-executable unless implemented.

## Phase 4 — Execution Completion
18. Resolve official KuCoin Futures testnet availability.
19. Add private order/fill WS if officially supported.
20. Verify protective-order state.
21. Run safe crash/restart/idempotency integration tests.
22. Harden production auth profile.

## Phase 5 — Liquidity Hunter Evidence
23. Controlled shadow enablement.
24. Feed verification.
25. Configure missing evidence providers.
26. Event recording.
27. Paper canary.
28. Threshold governance history.
29. Shadow validation report.

## Phase 6 — ML / Calibration
30. Resolve DecisionMemory outcomes.
31. Build canonical labeled dataset.
32. Meet minimum dataset thresholds.
33. Train versioned shadow model.
34. Walk-forward validation.
35. Calibration / drift / reliability.
36. Keep non-authoritative until manual approval.

## Phase 7 — Blocked Research Strategies
37. Historical L1.
38. Historical L2.
39. Fill/latency/queue simulator.
40. Cross-exchange synchronization.
41. Re-evaluate blocked strategies.

## Phase 8 — Maintainability / UI
42. Split oversized route/composition modules.
43. Reduce import cycles.
44. Refactor large UI/CSS areas with visual regression protection.
45. Finish explicit degraded-state UX.

## Phase 9 — Final Reliability
46. HTTP soak.
47. WebSocket soak.
48. memory/heap soak.
49. shutdown/drain tests.
50. clean release artifact generation.

---

# 20. Required Acceptance Suite

A completion claim is invalid unless the relevant commands run in a **clean environment**.

At minimum:

```bash
npm ci
npm run typecheck
npm run build
npm run verify
```

Also execute all current project-specific safety suites, including the equivalents of:

- Maximal Merge Safety
- System Integration
- Liquidity Hunter Safe Completion
- source-contract checks
- release no-secrets gate
- route-index checks
- docs checks
- browser tests
- visual tests
- release gate

If any command is unavailable or blocked:
- state exactly why,
- do not replace it with a weaker result silently.

---

# 21. Runtime Acceptance

From the freshly built application:

Verify:

```text
/api/readiness
/api/health
/api/operations/status
/api/strategies
/
```

Then validate:

- primary market-data success where network permits,
- degraded provider behavior,
- configured optional provider behavior,
- account/session lifecycle,
- safe mutation auth,
- backtest,
- strategy routes,
- Liquidity Hunter disabled baseline,
- Liquidity Hunter shadow mode if intentionally enabled,
- WebSocket connect/reconnect,
- graceful shutdown.

Capture exact status and reason codes.

---

# 22. Definition of Done

The project is not “complete” merely because it compiles.

The gap-closure effort is complete only when:

- [ ] no forbidden secrets/local secret files are in the source artifact,
- [ ] source release is cross-platform and contains no shipped `node_modules`,
- [ ] clean `npm ci` succeeds,
- [ ] full build succeeds,
- [ ] full verification succeeds,
- [ ] release gates pass,
- [ ] current docs reflect current source truth,
- [ ] OpenAPI coverage has been materially expanded with critical mutation/execution routes covered,
- [ ] provider hierarchies match executable capability truth,
- [ ] planned providers are not presented as active,
- [ ] market data never silently becomes synthetic/neutral truth,
- [ ] live provider contracts have been verified from an appropriate network or remain explicitly blocked,
- [ ] testnet remains blocked unless an official verified endpoint exists,
- [ ] private execution state has push/reconciliation hardening if supported,
- [ ] protective-order state is verified before being presented as active,
- [ ] crash/restart/idempotency behavior is integration-tested,
- [ ] Liquidity Hunter safety policy is unchanged,
- [ ] Liquidity Hunter evidence gaps are either validated in shadow mode or explicitly marked NOT_CONFIGURED,
- [ ] DecisionMemory outcomes are resolvable and durable,
- [ ] ML remains shadow-only until real labeled data and calibration requirements are met,
- [ ] blocked microstructure/MM strategies remain blocked until real L1/L2/fill prerequisites exist,
- [ ] browser states clearly distinguish live/degraded/stale/unavailable/not-configured,
- [ ] long-duration load/WS/memory tests are complete,
- [ ] source/build/evidence artifacts are separated and checksummed,
- [ ] final gap ledger contains no silent omissions.

---

# 23. Explicit “Do Not Do” List

Do not:

- enable autonomous live trading to claim completion,
- weaken `DecisionBridge`,
- weaken Risk Governor,
- disable kill switches,
- lower evidence thresholds merely to get green tests,
- make Layer 4 rescue deterministic Liquidity Hunter failure,
- enable automatic threshold promotion,
- turn Bitget/OKX from `PLANNED` to active without adapters,
- place Bybit into primary REST priority without verified implementation,
- use unverified HF endpoints,
- use request latency as candle freshness,
- infer missing timestamps,
- fabricate OI history,
- treat contract counts as USD depth without multiplier,
- replace missing sentiment with real “neutral” evidence,
- use OHLCV as a proxy for missing L2 history,
- unblock L2/market-making research without real microstructure data,
- accept an arbitrary testnet hostname,
- expose secrets in logs, routes, generated docs, test snapshots, or prompts,
- treat synthetic stress datasets as production ML proof,
- rewrite historical reports to hide old failures,
- claim a full clean build based only on the existing `dist/server.cjs`,
- claim external provider health based only on local server health.

---

# 24. Findings That Are Already Resolved — Do Not Re-Fix Without Regression Evidence

The following old findings should not be carried forward automatically.

## RESOLVED-01 — Function Atlas / Function Index Staleness

Current `Doc/FUNCTION_INDEX.json` has been checked against the present indexed files and matches the current source snapshot.

Only regenerate it after source changes, then verify hashes again.

## RESOLVED-02 — Core Source Type Safety in the Reviewed Snapshot

Current TypeScript no-emit checking passes in the reviewed source snapshot.

Do not introduce unrelated type rewrites.

## RESOLVED-03 — Existing Safety QA Baseline

Current safety/integration suites have passed in review:

- 30/30 maximal merge safety,
- 12/12 system integration,
- 29/29 Liquidity Hunter safe completion.

These are baseline protections, not open issues.

---

# 25. Final Deliverables Required From the Coding Agent

Produce all of the following:

1. **Updated source code**
2. **Updated automated tests**
3. **Updated OpenAPI**
4. **Updated architecture/current-state documentation**
5. **Updated API route index**
6. **Updated Function Index if source changed**
7. **Clean source release artifact**
8. **Separate build artifact**
9. **Separate QA/evidence artifact**
10. **Build/release manifest with hashes**
11. **Final gap ledger**
12. **Final verification report**
13. **Runtime smoke report**
14. **Provider validation report**
15. **Security/release-hygiene report**
16. **Remaining externally blocked items**

The final gap ledger must contain, for every gap ID in this prompt:

```text
ID:
Final status:
Root cause:
Files changed:
Tests added/updated:
Verification command:
Verification result:
Runtime evidence:
Remaining limitation:
```

---

# 26. Final Reporting Standard

At the end, provide a concise executive summary containing:

- total gaps reviewed,
- fixed count,
- already-resolved count,
- externally blocked count,
- deferred count,
- release blockers remaining,
- production-readiness blockers remaining,
- safety controls verified unchanged.

Use precise language.

Do not use:
- “probably fixed,”
- “should work,”
- “looks good,”
- “production ready”

without executable evidence.

If something cannot be verified, say:

`NOT VERIFIED — <specific reason>`

If external infrastructure prevents completion, say:

`BLOCKED EXTERNALLY — <dependency and exact required evidence>`

---

# Primary Mission

Bring APEX v1.0.56 from its current **source-verified, safety-conscious but partially incomplete state** to a **cleanly reproducible, fully documented, strongly tested, truth-preserving release**.

Complete real missing infrastructure and evidence.

Do not manufacture completeness by weakening safety, provider validation, execution authorization, or data-quality contracts.
-e 
---

## Batch 4 — Latest Modified Workspace Delivery (2026-08-10)

This batch reconciles the current modified source tree immediately before delivery. It does **not** claim all 68 gaps are complete. Claims below are backed by current executable evidence:

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx vitest run` → **94 test files / 370 tests passed**.
- `npm run build` → production Vite + `dist/server.cjs` build completed successfully; Function Index regenerated to **2,948 symbols across 537 files**.
- `npm run qa:multi-agent-multi-trading` → **20/20 source + 14/14 runtime PASS**; paper/research-only execution boundaries preserved.
- `npm run qa:system-integration` → **12/12 PASS**.
- `npm run qa:maximal-merge-safety` → **30/30 PASS**.
- `npm run qa:liquidity-hunter-safe-completion` → **29/29 PASS** with shadow/non-authoritative/manual-governance constraints preserved.
- `npm run check:api-contract` → **128 runtime API routes / 68 OpenAPI operations (53.1%)**, no phantom OpenAPI routes.
- `npm run check:root-contract` → PASS after classifying generated `.apex-data/` and `test-results/` as non-source roots.
- `npm run docs:check` → **149 Markdown files**, no broken local links.
- `npm run release:gate:source` → PASS; no secret-bearing runtime files in the source release.
- Workspace browser functional QA using `/usr/bin/chromium` + project transport bridge reported **0 failures / 0 page errors / 0 console errors**. The latest visual rerun hit a Playwright page/browser shutdown race after rendering; therefore QA-02 remains deferred rather than being over-claimed.

Batch 4 also closes DATA-14 and DATA-15 and chooses STR-07 **Branch A** deliberately: supplemental fusion remains a Strategy-Fusion/intelligence feature and is not silently promoted into live Short Hunter scoring.

## Batch 5 incoming ZIP integration note

The uploaded `APEX_v1_0_56_project_delivery(1).zip` was audited and was not used as a wholesale replacement because it was a smaller/divergent snapshot and would regress current verified Batch 4/5 work. See `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_batch5_integration.md`.


## Batch 6 — Max-Power Documentation/API Contract Pass (2026-08-10)

This batch does not claim that all remaining execution, provider, ML, Liquidity Hunter, UI, architecture and soak gaps are complete. It closes the parts that are locally fixable without fabricating live-provider or long-soak evidence:

- DOC-01: regenerated `Doc/FUNCTION_INDEX.*` with `npm run index:functions` to **3022 symbols across 546 files** and removed current-doc claims that the Function Index is still stale.
- DOC-04: expanded `openapi/apex-api.v1.yaml` to the full current runtime route set: **135/135 `/api/*` operations documented (100.0%)**.
- Hardened `scripts/utilities/generateApiRouteIndex.mts` so `check:api-contract` now defaults to a **100% OpenAPI coverage floor**, preventing silent route/documentation drift.
- Updated visual architecture documentation, API route index, Function Index, and current-vs-historical wording without deleting historical evidence.

Verification evidence captured in `Doc/reports/final/GAP_CLOSURE_SESSION_2026-08-10_all_gaps_max_power.md`.

## Progress Ledger — Update This Table Every Time a Gap Is Closed

**Instructions for any agent/session working on this document:**

- Before starting work, read this table to see what is already closed — do not re-verify or re-fix an item already marked `FIXED` or `ALREADY RESOLVED` unless a source change makes it stale again.
- When you finish a gap, update its row here: set **Status** to `FIXED`, `ALREADY RESOLVED`, `BLOCKED EXTERNALLY`, `DEFERRED WITH JUSTIFICATION`, or `NOT REPRODUCED`; set **Batch/Date**; set **Evidence** to the report file (or a one-line pointer) that backs the claim.
- Also add/update the matching `✅ STATUS:` callout directly under that gap's `**Priority:**` line earlier in this document — the table and the inline callouts must always agree.
- Update the summary counts at the very top of this table (Total / Done / Remaining / % Complete) after every batch.
- Never mark something `FIXED` without evidence (files changed, tests run, command output). Never flip a `FIXED`/`ALREADY RESOLVED` row back to open without explaining why in Evidence.

### Summary

- **Total gaps:** 68 (65 original + DATA-14, DATA-15, STR-07)
- **Done (FIXED or ALREADY RESOLVED):** 32
- **Blocked externally:** 2 explicitly classified in Batch 4 (DATA-12, EXE-02)
- **Deferred with justification:** 1 explicitly classified in Batch 4 (QA-02)
- **Partially resolved source infrastructure:** 4 (STR-01 through STR-04)
- **Remaining/open:** 36
- **% complete (FIXED or ALREADY RESOLVED):** 47.1%
- **Last updated:** 2026-08-10 (batch 6 max-power documentation/API contract pass)

### Full Gap Table

| Gap | Title | Status | Batch / Date | Evidence |
|---|---|---|---|---|
| REL-01 | Forbidden Secret-Bearing Config Exists in the Source Package | ✅ ALREADY RESOLVED | Batch 1 / 2026-08-10 | GAP_CLOSURE_SESSION_2026-08-10_batch1.md |
| REL-02 | Source Archive Ships Platform-Specific `node_modules` | ✅ ALREADY RESOLVED | Batch 1 / 2026-08-10 | GAP_CLOSURE_SESSION_2026-08-10_batch1.md — clean `npm ci` + `tsc --noEmit` 0 errors |
| REL-03 | Source, Build, QA Evidence, and Runtime State Are Mixed in One Delivery | ✅ FIXED | Batch 4 / 2026-08-10 | Separated source/build/evidence artifacts + artifact gate; batch4 report |
| REL-04 | Build Provenance Is Incomplete | ✅ FIXED | Batch 4 / 2026-08-10 | release-manifest.json with provenance + SHA-256 hashes |
| DOC-01 | Current Documentation Still Repeats Resolved Function-Index Findings | ✅ FIXED | Batch 6 / 2026-08-10 | Function Index regenerated to 3022 symbols across 546 files; stale current-doc statements corrected; docs link check passes |
| DOC-02 | Historical Audit State Is Mixed With Current State | ⬜ NOT STARTED | — | — |
| DOC-03 | Root Contract Does Not Fully Match the Current Repository Layout | ✅ FIXED | Batch 4 / 2026-08-10 | Root contract + executable root gate pass |
| DOC-04 | API Documentation Coverage Is Low | ✅ FIXED | Batch 6 / 2026-08-10 | OpenAPI expanded to 135/135 runtime operations (100.0%); route drift gate default floor raised to 100% |
| QA-01 | Full `npm run verify` Has Not Been Proven From a Clean Cross-Platform Install | ⬜ NOT STARTED | — | — |
| QA-02 | Full Browser / Visual Acceptance Must Be Re-Run After a Clean Build | ⚠️ DEFERRED WITH JUSTIFICATION | Batch 4 / 2026-08-10 | Browser functional QA passed; latest visual rerun hit Playwright shutdown race |
| QA-03 | Full HTTP / WebSocket / Soak Validation Is Incomplete | ⬜ NOT STARTED | — | — |
| QA-04 | Heavy-Load Harness Cleanup / Long Soak Evidence Is Incomplete | ⬜ NOT STARTED | — | — |
| DATA-01 | Bitget Adapter Is Planned, Not Executable | ⬜ NOT STARTED | — | — |
| DATA-02 | OKX Adapter Is Planned, Not Executable | ⬜ NOT STARTED | — | — |
| DATA-03 | Bybit Is Evidence-Only, Not a Primary REST Market Fallback | ⬜ NOT STARTED | — | — |
| DATA-04 | External Provider Live Verification Is Environment-Dependent | ⬜ NOT STARTED | — | — |
| DATA-05 | Space-4 Freshness Metadata Is Not Candle Age | ✅ FIXED | Batch 4 / 2026-08-10 | Candle timestamp/cadence freshness validation + tests |
| DATA-06 | Space-4 Funding Timestamp Semantics Are Insufficient for Scheduling | ✅ FIXED | Batch 4 / 2026-08-10 | Explicit nextFundingTime semantics + regression test |
| DATA-07 | Space-4 Funding History May Have Missing Timestamps | ✅ FIXED | Batch 4 / 2026-08-10 | Missing funding timestamps stay null/incomplete + test |
| DATA-08 | Space-4 Open-Interest History Is Insufficient for OI Change Features | ✅ FIXED | Batch 5 / 2026-08-10 | `openInterestHistory.ts` + server sampler/endpoints + `openInterestHistory.test.ts`; full unit suite 99/99 files, 384/384 tests |
| DATA-09 | KuCoin Order-Book Contract Quantities Require Multiplier-Aware Normalization | ✅ ALREADY RESOLVED | Batch 2 / 2026-08-10 | GAP_CLOSURE_SESSION_2026-08-10_batch1.md (batch 2 section) |
| DATA-10 | Space-4 Batch Snapshot Latency Is Unsuitable for a Tight Scanner Cycle | ⬜ NOT STARTED | — | — |
| DATA-11 | Space-2 Has a Strict Allowlist Because Many Endpoints Are Not Trustworthy for Trading | ✅ FIXED | Batch 4 / 2026-08-10 | Central HF executable-contract allowlist + tests |
| DATA-12 | Optional Operator Providers Are Currently Unconfigured in the Reviewed Runtime | ⛔ BLOCKED EXTERNALLY | Batch 4 / 2026-08-10 | Source UX/config semantics improved; full optional-provider live proof requires reachable external APIs |
| DATA-13 | Supplemental Sentiment “Neutral” Sentinel Is a Contract-Hardening Risk | ✅ FIXED | Batch 4 / 2026-08-10 | valid:false unavailable sentiment + fusion gating tests |
| DATA-14 | BscScan Operator Key Is Accepted/Reported Configured but Never Reaches the Runtime Fetch Path (new) | ✅ FIXED | Batch 4 / 2026-08-10 | BSCSCAN_KEY env wiring + dedicated/fallback regression tests |
| DATA-15 | Duplicate, Unused Provider-Catalog Modules With an Internal Naming Inconsistency (new) | ✅ FIXED | Batch 4 / 2026-08-10 | Dead duplicate catalogs deleted; zero remaining references |
| LH-01 | Liquidity Hunter Core Is Disabled by Default | ⬜ NOT STARTED | — | — |
| LH-02 | Realtime Public Feed Set Is Disabled by Default | ⬜ NOT STARTED | — | — |
| LH-03 | Four Edge Families Are Not Configured | ⬜ NOT STARTED | — | — |
| LH-04 | Shadow-Only Edge Families Need Real Validation Data | ⬜ NOT STARTED | — | — |
| LH-05 | Paper Canary Has No Meaningful Production Evidence Yet | ⬜ NOT STARTED | — | — |
| LH-06 | Threshold Governance Has Little or No Operational Revision History | ⬜ NOT STARTED | — | — |
| LH-07 | Meta Model Is Not Ready for Authority | ⬜ NOT STARTED | — | — |
| EXE-01 | KuCoin Futures Testnet Is Deliberately Blocked in Source | ⬜ NOT STARTED | — | — |
| EXE-02 | No Primary Private KuCoin Order/Fill WebSocket Is Proven | ⛔ BLOCKED EXTERNALLY | Batch 4 / 2026-08-10 | Private WS read/reconcile plane implemented/tested; live authenticated provider proof unavailable |
| EXE-03 | Protective Orders Can Remain `ATTACHED_UNVERIFIED` | ✅ FIXED | Batch 4 / 2026-08-10 | Verified protection lifecycle + fail-closed tests |
| EXE-04 | Real Crash/Restart/Idempotency Evidence Is Incomplete | ✅ FIXED | Batch 4 / 2026-08-10 | Crash/restart/idempotency isolated validation tests |
| EXE-05 | Production Authentication Profile Needs Explicit Hardening | ✅ FIXED | Batch 2 / 2026-08-10 | GAP_CLOSURE_SESSION_2026-08-10_batch1.md (batch 2 section) — 17/17 tests passing |
| ML-01 | Decision Memory Has No Resolved Outcome Dataset | ✅ FIXED | Batch 4 / 2026-08-10 | Durable decision outcome resolution metadata + tests |
| ML-02 | Canonical ML Training Dataset Is Missing / Insufficient | ✅ FIXED | Batch 5 / 2026-08-10 | `mlDatasetPreparation.ts` canonical contract + `mlDatasetCanonical.test.ts`; real data threshold preserved |
| ML-03 | Shadow Model Artifact Is Missing | ⬜ NOT STARTED | — | — |
| ML-04 | No Meaningful Shadow Comparison Can Run Without a Model | ⬜ NOT STARTED | — | — |
| ML-05 | Dataset Mirror Is Unconfigured | ✅ FIXED | Batch 5 / 2026-08-10 | `decisionMemoryDatasetSync.ts` retry/checksum/idempotent mirror + tests; live HF upload not verified |
| ML-06 | Adaptive Threshold Audit Evidence Is Session-Local | ✅ FIXED | Batch 4 / 2026-08-10 | Server-side durable governance revision history |
| ML-07 | Confidence Calibration Still Lacks Real Outcome Evidence | ⬜ NOT STARTED | — | — |
| STR-01 | Dynamic Cointegration Basket Strategy Is Blocked by Missing Historical L1 Bid/Ask Contract | ⚠️ PARTIALLY RESOLVED | Batch 5 / 2026-08-10 | Historical L1 bid/ask contract implemented; remains blocked pending real dataset/replay evidence |
| STR-02 | L2 Liquidity-State Scalper Is Blocked by Missing Historical L2 | ⚠️ PARTIALLY RESOLVED | Batch 5 / 2026-08-10 | Historical L2 snapshot/delta store + sequence/multiplier checks implemented; real dataset validation pending |
| STR-03 | Cross-Exchange Market Making Requires Two Verified Live Venues and Fill/Latency Simulation | ⚠️ PARTIALLY RESOLVED | Batch 5 / 2026-08-10 | Simulation-only cross-venue MM implemented with fees/latency/inventory; live two-venue evidence pending |
| STR-04 | Funding-Aware Avellaneda Market Maker Lacks Production-Grade Order-Book / Fill Simulation | ⚠️ PARTIALLY RESOLVED | Batch 5 / 2026-08-10 | Simulation-only funding-aware Avellaneda model implemented; real fill/order-book calibration pending |
| STR-05 | Advanced Scanner Core Is Shadow/Replay, Not Live Authority | ⬜ NOT STARTED | — | — |
| STR-06 | `MathEngine.detectStructuralZones` Has No Operational Consumer | ✅ ALREADY RESOLVED | Batch 4 / 2026-08-10 | Explicit PLANNED registry entry with no consumers |
| STR-07 | News/Sentiment/On-Chain Fusion Evidence Isolated to the Strategy-Fusion Preview Endpoint, Not Confirmed in the Live Signal Pipeline (new) | ✅ FIXED | Batch 4 / 2026-08-10 | Branch A: operator docs explicitly separate fusion lab from live Short Hunter authority |
| ARC-01 | `server.ts` Is an Oversized Composition Root | ⬜ NOT STARTED | — | — |
| ARC-02 | `apexNextMarketRoutes.ts` Is an Oversized Domain Composition File | ⬜ NOT STARTED | — | — |
| ARC-03 | Large Provider / Operations Modules Need Narrower Ownership | ⬜ NOT STARTED | — | — |
| ARC-04 | Static Import Cycles Exist | ⬜ NOT STARTED | — | — |
| ARC-05 | Large Frontend Components and CSS Layers Create UI Maintenance Risk | ⬜ NOT STARTED | — | — |
| UI-01 | Every Data-Driven Page Needs Explicit Degraded-State UX | ⬜ NOT STARTED | — | — |
| UI-02 | Provider Provenance Must Be Visible Where It Changes Decision Quality | ⬜ NOT STARTED | — | — |
| UI-03 | Planned / Shadow / Blocked Features Must Be Visually Distinct From Active Features | ⬜ NOT STARTED | — | — |
| OPS-01 | Provider Health Must Distinguish Configuration, Reachability, and Contract Validity | ✅ FIXED | Batch 4 / 2026-08-10 | Machine-readable provider failure reason classes + tests |
| OPS-02 | Clean Production Readiness Needs Dependency-Level Evidence | ✅ FIXED | Batch 4 / 2026-08-10 | Dependency-level production readiness + tests |
| OPS-03 | Runtime Security Posture Should Be Observable | ✅ FIXED | Batch 4 / 2026-08-10 | Safe runtime security posture + tests |
| PERS-01 | Runtime Secret/Config Persistence Should Not Use Repository Root | ✅ FIXED | Batch 1 / 2026-08-10 | GAP_CLOSURE_SESSION_2026-08-10_batch1.md — privateConfigFile.ts + server.ts |
| PERS-02 | Flat JSON Persistence Needs Explicit Durability Guarantees | ✅ FIXED | Batch 4 / 2026-08-10 | Durable JSON helper/store wrapping + durability tests |
| API-01 | Route Counts and Architecture Documentation Must Use Current Source Truth | ✅ FIXED | Batch 4 / 2026-08-10 | 128-route generated index + drift check |
| API-02 | Contract Tests Need to Cover Provider Degradation and Error Envelopes | ✅ FIXED | Batch 4 / 2026-08-10 | Provider degradation/error-envelope contract tests |
