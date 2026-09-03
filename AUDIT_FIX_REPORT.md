# APEX Audit Fix Report

Date: 2026-09-01
Status: CP26 non-final evidence checkpoint — BLOCKED_ENVIRONMENT

## Outcome

The CP20 Settings/provider remediation was recovered from its corrected archive and verified from a dependency-clean extraction. The application, API contract, source/runtime contracts, simulation gates, and release identity remain intact. No provider, feature, or safety denial was removed.

## Additional CP21 reliability fixes

- Generated timestamped evidence under `QA/` no longer invalidates App Index source freshness; executable QA source under `scripts/qa/` remains indexed and enforced.
- The root contract explicitly classifies the shipped remediation and handoff records while still rejecting unknown root entries.
- Required TypeScript npm gates use Node's `tsx` loader to avoid the host-blocked tsx IPC socket without changing assertions.
- Adaptive Governor's isolated runtime fixture now compiles the real proxy validator dependency.

## Verified PASS

- Corrected CP20 ZIP SHA-256 and extracted App Index SQLite byte/integrity verification.
- Clean-room `npm ci`, TypeScript lint, 154/154 Vitest files (946 pass, 1 explicit skip), production build, API 154/154 coverage, App Index resolver/lineage/contract, version/build identity, and source secret scan.
- Runtime core 8/8 leaf gates and runtime simulation 3/3 leaf gates, including 2946/2946 comprehensive synthetic assertions.
- Settings proxy persistence/restart, optional dependency, provider truthfulness, Telegram unconfigured/off truthfulness, Decision Memory batching, and duplicate-key regressions remain covered by the CP20/CP21 test inventory.

## Not claimed as PASS

- Canonical 1368×753 browser verification: the Playwright executable is absent and all five official Chromium downloads timed out. Both browser commands reported the explicit `environment_missing_playwright_browser` skip; no screenshot or browser PASS is claimed.
- Full runtime-safety suite: all non-network leaves passed, but the live-data Autopilot two-cycle run was interrupted when the environment cancelled the required external-network approval.

## Safety invariants retained

- Autonomous live execution remains disabled.
- Automatic venue failover remains disabled.
- KuCoin remains the primary/default executable venue.
- Tabdeal remains read-only/PAPER.
- No body-limit or security gate was weakened, and no unavailable provider is presented as healthy.

This report is deliberately non-final. A FINAL archive remains prohibited until a compatible Chromium executable and the required network access are available and both blocked gates execute successfully.

## CP26 continuation evidence

- CP25 was recovered with exact SHA-256 `bd058da133a8b736557d4b3f73f5b95fda668e891a842ca3b17e9ae14f2d1ab2` and a clean ZIP integrity result.
- A host dependency snapshot has the identical CP25 lockfile hash and a clean `npm ls`; it enabled real TypeScript, unit, runtime, build, and index gates without changing package expectations. It is not represented as a fresh `npm ci` and is excluded from the checkpoint.
- The real Autopilot server completed scheduler-owned cycles 0 and 1 with `SERVER_SCHEDULER` provenance, no overlapping cycle index, no execution authority, and no promotion without its own gate. The host cancelled the later provider request before manual validation and `STOP -> OFF`, so runtime-safety remains BLOCKED rather than PASS.
- The Lite artifact exposed an authentic root-contract defect: `LITE_TRANSFER_MANIFEST.md` was not classified. The manifest is now explicitly documented and classified while the unknown-root rejection rule remains unchanged.
- Clean extraction exposed a second packaging/index mismatch: App Index tracked `.apex-data` even though runtime/private state is correctly excluded from release archives. The generator now excludes every working/private root classified by the Root Contract, and App Index QA has a dedicated regression assertion.
- Current-environment PASS evidence includes TypeScript, 154/154 Vitest files (946 pass, one explicit skip), runtime-core 8/8, runtime-simulation 3/3 with 2946/2946 assertions, API 154/154, and App Index resolver/lineage/contract checks.
- The aggregate source-core command remains BLOCKED at a spawned loopback-server leaf because host network policy cancelled the socket operation; individually executed non-blocked leaves remain green. Canonical browser verification is still unavailable because no browser executable is present in this environment.
