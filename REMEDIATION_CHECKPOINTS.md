# APEX Remediation Checkpoint Ledger

This ledger is the human-readable mirror of `REMEDIATION_CHECKPOINTS.json`. It records real source-archive checkpoints. The supplied archive contains no `.git` directory, so commit fields are explicitly `NOT_AVAILABLE_SOURCE_ARCHIVE`; source-tree hashes and ZIP SHA-256 values provide the available reproducible lineage.

## CP18 — Gap re-audit, release identity, and App Index

- Status: COMPLETED
- Started from artifact: `APEX-v2_0_17-ACADEMY-INTELLIGENCE-APPLIED.zip`
- Starting artifact SHA-256: `36e22cb8cbd584264da29bd4ae029a6847898b5e7693dd0d62ff1a6b6ce08ce7`
- Starting build ID: `apex-2.0.1-f74c0bbe625c`
- Starting commit: `NOT_AVAILABLE_SOURCE_ARCHIVE`
- Resulting commit: `NOT_AVAILABLE_SOURCE_ARCHIVE`
- Scope:
  - Replace the previous placeholder checkpoint scaffold with an auditable Markdown/JSON ledger.
  - Bind build identity to the actual supplied parent artifact.
  - Refresh and verify the App Index.
  - Run typecheck, build, release identity, source-secret, and CP16 acceptance gates.
- Files modified so far:
  - `REMEDIATION_CHECKPOINTS.md`
  - `REMEDIATION_CHECKPOINTS.json`
  - `scripts/utilities/generateBuildIdentity.mjs`
  - `scripts/qa/verifyCp16ReleaseIdentity.mjs`
  - `package.json`
  - `public/build-info.json` (generated)
  - `APP_INDEX/*` (generated)
- Resulting build ID: `apex-2.0.1-63f02e7c0bb2`
- Resulting source-tree SHA-256: `63f02e7c0bb2c8bcab669299222a040560eb39cbe44ea67c214f1c97b65d301b`
- Completed at: `2026-09-01T01:11:33Z`
- Gate results:
  - `npm run index:app`: PASS (exit 0 after replacing the IPC-dependent `tsx` CLI invocation with equivalent `node --import tsx` execution)
  - `npm run qa:app-index`: PASS (freshness; resolver 14/14; lineage 6/6; contract 41/41)
  - `npm run lint`: PASS (exit 0)
  - `npm run build`: PASS (exit 0; Vite, service-worker stamp, server bundle, function index)
  - `npm run check:version`: PASS (exit 0)
  - `npm run check:build-identity`: PASS (exit 0)
  - `npm run release:gate:source`: PASS (exit 0)
  - `node scripts/qa/verifyCp16ReleaseIdentity.mjs`: PASS (exit 0)
- Browser verification: NOT_IN_SCOPE_FOR_THIS_CHECKPOINT
- Checkpoint ZIP: `APEX-v2.0.1-CP18-IDENTITY-APP-INDEX.zip`
- Checkpoint ZIP SHA-256: `20fd074cd5a965e204350b84448f6bb313fc391d334e2a44f6624c6edca9510a` (recorded after packaging; also supplied as an external `.sha256` sidecar because a ZIP cannot contain its own final hash without changing that hash)
- Known limitations:
  - Git commit/dirty-tree evidence cannot be recovered from a source-only ZIP.
  - Clean-room `npm ci` and canonical browser verification are reserved for CP21.
  - The first App Index attempt failed because the source ZIP did not include dependencies; the final run used an exact-lockfile-matched dependency tree, and the temporary symlink was removed before packaging. Both failed and successful logs are retained under `_qa/remediation-gaps/CP18/`.

## CP19 — Truthfulness, persistence, provider-state, holdout, and Tabdeal wiring

- Status: COMPLETED
- Starting commit: `NOT_AVAILABLE_SOURCE_ARCHIVE`
- Resulting commit: `NOT_AVAILABLE_SOURCE_ARCHIVE`
- Starting source-tree SHA-256: `63f02e7c0bb2c8bcab669299222a040560eb39cbe44ea67c214f1c97b65d301b`
- Resulting build ID: `apex-2.0.1-3e5b5ebf958a`
- Resulting source-tree SHA-256: `3e5b5ebf958af2c5346e5d3ad3ac11e104b3bffebfef62fe631a0e37cba9b831`
- Completed at: `2026-09-01T01:32:51Z`
- Scope:
  - Added fail-closed LIVE eligibility and removed unconditional LIVE badges.
  - Wired all runtime provider capability states into Overview with observation age and reason.
  - Made Watchlist, Telegram, Help, and Strategy view-mode persistence failures observable without false success state.
  - Verified Alerts, Settings, Screener, Strategy bookmarks, and Backtesting presets/notes retain their existing failure handling.
  - Preserved Academy null/unmeasured semantics and added render/runtime regressions.
  - Reused one Tabdeal capability matrix in Orders, Positions, and Trading/Account views.
  - Re-audited production sealed-holdout entrypoints and preserved one-shot authorization.
  - Rejected malformed quote-only ticker identifiers and deduplicated the canonical universe at both service and browser boundaries, eliminating duplicate `-USDT` React keys.
  - Replaced row-count-only Decision Memory mirroring with 128 KiB byte-bounded batching while preserving the server's global JSON security limit.
  - Displayed the provider actually selected for the dashboard separately from real independent provider probes, including observation age and retained-data refresh errors.
  - Restored the verified HF routes already consumed by the intelligence layer to the executable fail-closed allow-list.
- Files modified:
  - `src/lib/capabilityStatus.ts`
  - `src/lib/watchlistFavorites.ts`
  - `src/lib/tickerUniverse.ts`
  - `src/App.tsx`
  - `src/types.ts`
  - `src/services/marketDataService.ts`
  - `src/services/decisionMemory.ts`
  - `src/services/systemHealthTelemetry.ts`
  - `src/services/hfSpaceContracts.ts`
  - `src/services/telegram.ts`
  - `src/components/workspace/ToolboxDrawers.tsx`
  - `src/components/workspace/TradingToolbox.tsx`
  - `src/components/workspace/MarketsPage.tsx`
  - `src/components/workspace/AccountViews.tsx`
  - `src/components/account/TabdealAccountSurface.tsx`
  - `src/components/overview/OverviewProviderHealthPanel.tsx`
  - `src/components/overview/OverviewWorkspace.css`
  - `src/components/workspace/GeneralViews.tsx`
  - `src/components/TelegramSettingsPanel.tsx`
  - `src/pages/watchlist/WatchlistPage.tsx`
  - `src/pages/screener/ScreenerPage.tsx`
  - `src/pages/help/HelpPage.tsx`
  - `src/pages/strategies/StrategyPage.tsx`
  - `src/pages/strategies/StrategyModelWorkspace.tsx`
  - `src/tests/remediationTruthfulness.test.tsx`
  - `src/tests/overviewProviderPresentation.test.ts`
  - `src/tests/tickerUniverse.test.ts`
  - `src/tests/marketDataService.hfSpace.test.ts`
  - `src/tests/decisionMemoryPersistenceState.test.ts`
  - `scripts/qa/verifyCp11PersistenceBacktestUi.mjs`
  - `Doc/REMEDIATION_GAPS_1_6_AUDIT.md`
  - generated App Index, Function Index, build identity, and `dist/`
- Gate results:
  - `npm run lint`: PASS (exit 0)
  - targeted truthfulness/provider/dataflow/optimizer/workspace unit tests: PASS (30/30, exit 0)
  - `npm run qa:dataflow-hardening`: PASS (16/16, exit 0)
  - `npm run qa:strategy-optimization`: PASS (27/27, exit 0)
  - `node scripts/qa/verifyCp11PersistenceBacktestUi.mjs`: PASS (exit 0)
  - `node scripts/qa/verifyCp06SealedHoldout.mjs`: PASS (exit 0)
  - `npm run build`: PASS (exit 0)
  - `npm test`: PASS (154/154 files; 946 passed, 1 explicitly skipped)
  - final `npm run index:app` + `npm run index:app:check`: PASS (exit 0; exact final root hash stored in the generated `APP_INDEX` metadata to avoid a self-referential ledger hash)
  - `npm run check:build-identity`: PASS (exit 0)
- Browser verification: STATIC_REACT_RENDER_VERIFIED; CANONICAL_1368x753_DEFERRED_TO_CP21
- Checkpoint ZIP: `APEX-v2.0.1-CP19-TRUTHFULNESS-DATA-WIRING.zip`
- Checkpoint ZIP SHA-256: `dcb6673d2f4c525f4aa58e7f2e350dfcdc4e17fd6d038126bfb45335546ea0d6`
- Known limitations:
  - CP19 does not claim a live upstream integration check; Proxy/Telegram/provider probes are CP20 scope.
  - Canonical 1368×753 browser/pixel review and clean-room installation remain CP21 scope.
  - The first post-build App Index freshness check detected generated-file drift and failed; the index was regenerated after all build outputs, then freshness and identity both passed. Both logs are retained.

## CP20 — Production-grade Settings integrations

- Status: COMPLETED
- Starting source-tree SHA-256: `3e5b5ebf958af2c5346e5d3ad3ac11e104b3bffebfef62fe631a0e37cba9b831`
- Starting commit: `NOT_AVAILABLE_SOURCE_ARCHIVE`
- Resulting commit: `NOT_AVAILABLE_SOURCE_ARCHIVE`
- Resulting build ID: `apex-2.0.1-6aec7025e716`
- Resulting source-tree SHA-256: `6aec7025e716b3b4ed82bddcc5dd8d491579f5c3620cb5e7dbbc07a259fa73a8`
- Completed at: `2026-09-01T06:27:00Z`
- Scope:
  - Added a real fixed-target proxy draft probe without saving or activating the draft.
  - Preserved Auto direct-first, Manual proxy-only, and Off direct-only routing semantics; credential-bearing proxy URLs remain rejected.
  - Added explicit per-provider route, latency, error, pool health, loading state, and bounded secret-free connection history.
  - Made Telegram configuration write-first and atomic so persistence failure cannot activate an unsaved runtime draft.
  - Added Telegram delivery state, observed route/latency, real-test action, errors, and bounded history without returning the stored token.
  - Added live Intelligence feed state/source/snapshot visibility and aligned credential verification history with the same status vocabulary.
  - Added executable Settings browser coverage that navigates to API Management and Notifications, runs the non-mutating proxy draft probe, checks truthful status, and captures canonical viewport screenshots when a local browser exists.
  - Documented the new fixed-target probe in OpenAPI and restored route coverage to 154/154.
- Files modified:
  - `server.ts`
  - `src/services/integrationHealthHistory.ts`
  - `src/services/proxyFetch.ts`
  - `src/services/proxySettings.ts`
  - `src/services/supplementalSettings.ts`
  - `src/services/telegram.ts`
  - `src/services/telegramConfigPersistence.ts`
  - `src/components/ProxySettingsPanel.tsx`
  - `src/components/ProxySettingsPanel.css`
  - `src/components/IntelligenceSourcesSettingsPanel.tsx`
  - `src/components/TelegramSettingsPanel.tsx`
  - `src/pages/settings/SettingsPage.css`
  - `src/tests/settingsIntegrationHealth.test.tsx`
  - `scripts/qa/runProxyFetchOptionalDependencyRuntime.mjs`
  - `scripts/qa/verifyProxySettingsRuntime.mts`
  - `scripts/qa/verifyWorkspaceRuntime.mts`
  - `scripts/qa/verifyCore10DynamicFusion.mjs`
  - `scripts/utilities/generateAppIndex.mjs`
  - `openapi/apex-api.v1.yaml`
  - `Doc/repository/API_ROUTE_INDEX_2026-08-10.*`
  - `Doc/REMEDIATION_GAPS_1_6_AUDIT.md`
  - generated App Index, Function Index, build identity, and `dist/`
- Gate results:
  - `npm run lint`: PASS (exit 0)
  - targeted Settings/Telegram/provider tests: PASS (7/7 files; 19/19 tests; exit 0)
  - `npm run qa:dataflow-hardening`: PASS (16/16; exit 0)
  - `npm run qa:proxy-fetch-optional-deps`: PASS (3/3; exit 0)
  - `node --import tsx scripts/qa/verifyProxySettingsRuntime.mts`: PASS (mutation guard, all three persisted modes across restart, invalid-draft rollback; exit 0)
  - `node scripts/qa/verifyCp11PersistenceBacktestUi.mjs`: PASS (exit 0)
  - API contract generation/check: PASS (154/154 runtime operations documented; exit 0)
  - `npm test`: PASS (154/154 files; 946 passed, 1 explicitly skipped; exit 0)
  - source contract suites before generated-index freshness: PASS; the stale-index terminal failure is resolved by the final App Index regeneration/check.
  - `npm run build`: PASS (exit 0; Vite, service-worker stamp, server bundle, Function Index)
  - `npm run index:app` + `npm run qa:app-index`: PASS (4511 symbols/820 files; freshness; resolver 14/14; lineage 6/6; contract 41/41)
  - `npm run check:build-identity`: PASS (exit 0)
  - `npm run check:version`: PASS (exit 0)
  - `npm run release:gate:source`: PASS (exit 0)
  - CP21 artifact extraction found `.qa-tmp` had been indexed before packaging and the packaged SQLite snapshot was inconsistent. The generator now excludes `.qa-tmp`; the index database is checkpointed/vacuumed and integrity-checked before corrected packaging.
  - loopback `POST /api/supplemental/proxy/test`: ROUTE PASS; upstream state honestly `DISCONNECTED` (0/4) because this execution environment blocked provider DNS/transport.
  - loopback `/api/telegram/status`: PASS; reported unconfigured/off with no fabricated test history.
- Browser verification: BLOCKED_ENVIRONMENT — executable 1368×753 Settings flow is present, but the local Playwright Chromium download timed out and the cloud browser blocked localhost with `ERR_BLOCKED_BY_CLIENT`; no browser PASS or screenshot is claimed.
- Checkpoint ZIP: `APEX-v2.0.1-CP20-SETTINGS-INTEGRATIONS.zip`
- Checkpoint ZIP SHA-256: recorded after packaging in the external `.sha256` sidecar and next ledger revision
- Known limitations:
  - Real upstream connectivity was unavailable in this restricted environment; the feature correctly reported `DISCONNECTED` rather than synthesizing a healthy state.
  - Canonical browser execution and dependency-clean installation remain the explicit CP21 gate and cannot be marked PASS until an executable browser/dependency source is available.

## CP21 — Canonical browser and clean-room final candidate

- Status: BLOCKED_ENVIRONMENT (non-final evidence checkpoint)
- Starting commit: `NOT_AVAILABLE_SOURCE_ARCHIVE`
- Resulting commit: `NOT_AVAILABLE_SOURCE_ARCHIVE`
- Starting source tree hash: `6aec7025e716b3b4ed82bddcc5dd8d491579f5c3620cb5e7dbbc07a259fa73a8`
- Resulting source tree hash: `ee6332c1bcafd48d79de1cb2649922d2c6b9895b164d992dfbf248606225fc7a`
- Resulting build ID: `apex-2.0.1-ee6332c1bcaf`
- Scope: clean-room verification, canonical 1368×753 browser attempt, QA-gate reliability fixes, and a non-final evidence ZIP while the browser gate remains unavailable.
- Reliability fixes:
  - App Index now excludes generated `QA/` evidence while continuing to index and execute the real `scripts/qa/` source, preventing timestamp-only evidence rewrites from invalidating the source hash.
  - root-contract now explicitly classifies the five shipped remediation/handoff files without weakening the unknown-root rejection rule.
  - required TypeScript npm gates use `node --import tsx`, avoiding the environment-blocked tsx IPC socket without changing test semantics.
  - Adaptive Governor's isolated fixture compiles the real `proxyConfig` validator beside `proxyFetch`.
- Gate results:
  - corrected CP20 ZIP SHA-256 verification: PASS (exit 0)
  - clean-room extraction plus App Index SQLite byte hash/integrity: PASS (exit 0; `integrity_check=ok`)
  - clean-room `npm ci`: PASS (432 packages; exit 0)
  - `npm run lint`: PASS (exit 0)
  - `npm test`: PASS (154/154 files; 946 passed; 1 explicitly skipped; exit 0)
  - `npm run build`: PASS (exit 0)
  - `npm run qa:suite:runtime-core`: PASS (8/8 leaf checks; exit 0)
  - `npm run qa:suite:runtime-simulation`: PASS (3/3 leaf checks; 2946/2946 comprehensive simulation assertions; exit 0)
  - `npm run qa:suite:source-core`: PASS (34/34 leaf checks; exit 0) after final index regeneration.
  - API contract: PASS (154/154; exit 0)
  - App Index: PASS (resolver 14/14; lineage 6/6; contract 41/41; generated `QA/` evidence excluded)
  - release source secret gate, build identity, and version identity: PASS (exit 0)
  - runtime-safety: unified safety, environment classifier, supplemental-key runtime, and proxy optional-dependency runtime PASS; live-data Autopilot lifecycle BLOCKED when external network approval was cancelled during the two-cycle run.
- Browser verification: BLOCKED_ENVIRONMENT — `npm run test:browser` and `npm run qa:ui-1368` reached the canonical executable gate but reported `environment_missing_playwright_browser`; five official Chromium download attempts each timed out after 30 seconds. No browser PASS or screenshot is claimed.
- Checkpoint ZIP: `APEX-v2.0.1-CP21-BLOCKED-BROWSER-EVIDENCE.zip` (non-final)
- Checkpoint ZIP SHA-256: recorded only in the external `.sha256` sidecar because embedding an archive's own digest is self-referential.
- Remaining unblock condition: provide a compatible Chromium executable (or `APEX_PLAYWRIGHT_EXECUTABLE`) and network access for the live-data Autopilot lifecycle; then rerun the canonical browser and runtime-safety gates before creating a FINAL archive.

## Policy

- No checkpoint may claim PASS without a recorded command and exit code.
- A blocked external dependency is recorded as BLOCKED with the exact reason; it is never rewritten as PASS.
- A final archive and `AUDIT_FIX_REPORT.md` are created only after CP21 passes the clean-room and canonical browser gates.
- Every completed checkpoint is packaged and hashed before work continues.


## CP22 — Phase 1 baseline recovery in current execution environment

- Status: BLOCKED_ENVIRONMENT
- Started from artifact: `APEX-v2.0.1-CP21-LITE-SOURCE-TRANSFER.zip`
- Starting artifact SHA-256: `98d754621c8d253994be82b284fd39e38ea9fd47a0b9196aa17b35feb50730a6`
- Authoritative build ID: `apex-2.0.1-ee6332c1bcaf`
- Completed at: `2026-09-01T18:52:57Z`
- Scope:
  - Verified the Lite archive and full evidence reference against their authoritative SHA-256 values.
  - Extracted the Lite archive into a fresh clean working directory.
  - Confirmed `src/`, `scripts/`, `tests/`, `openapi/`, `vendor/`, `package.json`, and `package-lock.json` are present.
  - Confirmed no private `.env`, runtime database, credentials, installed dependency tree, or cache was present in the Lite archive; `.env.example` is the documented non-secret template.
  - Attempted clean dependency installation without changing lockfile/package expectations.
- Gate results:
  - `sha256sum APEX-v2.0.1-CP21-LITE-SOURCE-TRANSFER.zip`: PASS (exit 0; exact expected SHA-256).
  - `sha256sum APEX-v2.0.1-CP21-BLOCKED-BROWSER-EVIDENCE.zip`: PASS (exit 0; exact expected SHA-256).
  - `unzip -t` on both authoritative archives: PASS (exit 0).
  - Required/forbidden baseline content inspection: PASS (exit 0).
  - `npm ci`: BLOCKED_ENVIRONMENT (registry DNS resolution unavailable; process made no install progress and was terminated after the execution timeout).
  - `npm ci --offline --cache /root/.npm`: BLOCKED_ENVIRONMENT (exit 1; cache missing locked tarballs, first explicit miss `wcwidth@1.0.1`).
  - Direct registry probe: BLOCKED_ENVIRONMENT (`curl` exit 6 for DNS; explicit Cloudflare A-record probe exit 7 for outbound connection).
  - `npm run lint`, `npm test`, `npm run build`, `npm run check:version`, `npm run check:build-identity`, `npm run release:gate:source`: NOT_RUN_BLOCKED_DEPENDENCY in this Phase; previous CP21 evidence is not substituted for a new PASS.
- Known limitations:
  - This environment cannot currently retrieve the exact lockfile packages from the npm registry.
  - A FINAL archive is prohibited while the clean install and its dependent gates remain unavailable.
- Checkpoint ZIP: `APEX-v2.0.1-CP22-BLOCKED-NPM-EGRESS.zip`
- Checkpoint ZIP SHA-256: recorded in the external sidecar created after packaging.


## CP23 — Phase 2 browser environment recovery

- Status: COMPLETED
- Starting checkpoint: `APEX-v2.0.1-CP22-BLOCKED-NPM-EGRESS.zip`
- Authoritative build ID: `apex-2.0.1-ee6332c1bcaf`
- Completed at: `2026-09-01T18:53:39Z`
- Scope:
  - Inspected system browser locations after the Playwright-managed cache was absent.
  - Located and verified `/usr/bin/chromium`.
  - Verified Python Playwright is installed and can launch the system Chromium executable without downloading a browser.
  - Proved exact `1368x753` viewport launch and captured a capability screenshot.
- Browser environment evidence:
  - Executable: `/usr/bin/chromium` (runtime-only path; not committed to source).
  - Chromium version: `144.0.7559.96`.
  - Python Playwright version: `1.57.0`.
  - Browser installation: NOT_REQUIRED; compatible system Chromium already present.
  - Playwright launch probe: PASS (exit 0).
  - Verified viewport: `1368x753`.
  - Screenshot: `_qa/current/phase2/chromium-capability-1368x753.png` (actual dimensions 1368x753).
- Known limitations:
  - Node package dependencies remain unavailable because Phase 1 npm registry egress is blocked; this does not invalidate the browser executable proof, but it prevents running the repository's Node Playwright scripts unchanged.
- Checkpoint ZIP: `APEX-v2.0.1-CP23-BROWSER-ENVIRONMENT-READY.zip`
- Checkpoint ZIP SHA-256: recorded in the external sidecar created after packaging.


## CP24 — Phase 3 canonical UI verification

- Status: BLOCKED_ENVIRONMENT
- Starting checkpoint: `APEX-v2.0.1-CP23-BROWSER-ENVIRONMENT-READY.zip`
- Authoritative build ID: `apex-2.0.1-ee6332c1bcaf`
- Completed at: `2026-09-01T18:58:59Z`
- Scope:
  - Attempted to launch the exact CP21 production server from the authoritative evidence archive without substituting mocks or shims.
  - Proved host-side loopback HTTP reachability and separately tested real Chromium navigation at the exact `1368x753` viewport.
  - Tested direct production `file://` navigation and retained a diagnostic-only production-asset rendering attempt for manual inspection.
- Gate results:
  - `node <CP21-evidence>/dist/server.cjs`: BLOCKED_ENVIRONMENT (exit 1; exact external module `dotenv/config` unavailable because dependency installation is blocked; no shim introduced).
  - `curl http://127.0.0.1:4175/`: PASS (exit 0; loopback static server reachable from host).
  - Python Playwright navigation to `http://127.0.0.1:4175/`: BLOCKED_ENVIRONMENT (exit 1; `net::ERR_BLOCKED_BY_ADMINISTRATOR`).
  - Python Playwright navigation to exact production `file:///.../dist/index.html`: BLOCKED_ENVIRONMENT (exit 1; `net::ERR_BLOCKED_BY_ADMINISTRATOR`).
  - Diagnostic intercepted-asset screenshot: INSPECTED_NOT_CANONICAL; actual 1368x753 image is blank and has a localStorage access page error, so it is explicitly rejected as UI PASS evidence.
  - `npm run test:browser`: NOT_RUN_BLOCKED_DEPENDENCY.
  - `npm run qa:ui-1368`: NOT_RUN_BLOCKED_DEPENDENCY.
  - Canonical Overview/Settings screenshots and console/same-origin cleanliness: NOT_PROVEN; no screenshot or synthetic flow is substituted for mandatory evidence.
- Evidence:
  - `_qa/current/phase3/PHASE3_BLOCKER_EVIDENCE.md`
  - `_qa/current/phase3/01-production-server.log`
  - `_qa/current/phase3/02-localhost-curl-headers.txt`
  - `_qa/current/phase3/03-playwright-localhost.log`
  - `_qa/current/phase3/04-playwright-file.log`
  - `_qa/current/phase3-partial/intercepted-asset-browser-observation.json`
  - `_qa/current/phase3-partial/overview-intercepted-assets-1368x753.png` (diagnostic only, manually inspected and rejected)
- Checkpoint ZIP: `APEX-v2.0.1-CP24-BLOCKED-CANONICAL-BROWSER-RUNTIME.zip`
- Checkpoint ZIP SHA-256: recorded in the external sidecar created after packaging.


## CP25 — Phase 4 runtime safety

- Status: BLOCKED_ENVIRONMENT
- Starting checkpoint: `APEX-v2.0.1-CP24-BLOCKED-CANONICAL-BROWSER-RUNTIME.zip`
- Authoritative build ID: `apex-2.0.1-ee6332c1bcaf`
- Completed at: `2026-09-01T19:01:16Z`
- Gate results:
  - `npm run qa:suite:runtime-safety`: BLOCKED_ENVIRONMENT (exit 1; suite stops at mandatory lifecycle dependency `tsx`).
  - `npm run qa:unified-safety-runtime`: PASS (exit 0; 11/11).
  - `npm run qa:autopilot-lifecycle-environment`: PASS (exit 0).
  - `npm run qa:autopilot-lifecycle-runtime`: BLOCKED_ENVIRONMENT (exit 1; `qa_dependency_missing:tsx` before authentic server boot).
  - `npm run qa:supplemental-key-runtime`: PASS (exit 0; 3/3; no network I/O performed).
  - `npm run qa:proxy-fetch-optional-deps`: PASS after creating the intentionally absent generated `QA/` output directory (exit 0; 3/3; local-loopback-only).
  - approved provider probe `https://api-futures.kucoin.com/api/v1/timestamp`: BLOCKED_ENVIRONMENT (curl exit 6; DNS resolution unavailable; HTTP 000).
  - approved provider probe `https://fapi.binance.com/fapi/v1/time`: BLOCKED_ENVIRONMENT (curl exit 6; DNS resolution unavailable; HTTP 000).
- Mandatory lifecycle status:
  - Two genuine scheduler-owned cycles, live research/validation evidence, exact promotion gate attribution, and STOP-to-OFF on the authentic runtime are NOT_PROVEN. No mandatory skip is upgraded to PASS.
  - No SSRF rule, middleware, provider allowlist, safety denial, or execution authority was changed.
- Evidence: `_qa/current/phase4/PHASE4_RUNTIME_SAFETY_EVIDENCE.md` and per-command logs/exit-code files.
- Checkpoint ZIP: `APEX-v2.0.1-CP25-BLOCKED-RUNTIME-SAFETY-EGRESS.zip`
- Checkpoint ZIP SHA-256: recorded in the external sidecar created after packaging.


## CP26 — Dependency recovery, two-cycle runtime evidence, and Lite root-contract repair

- Status: BLOCKED_ENVIRONMENT (non-final checkpoint)
- Starting checkpoint: `APEX-v2.0.1-CP25-BLOCKED-RUNTIME-SAFETY-EGRESS.zip`
- Starting checkpoint SHA-256: `bd058da133a8b736557d4b3f73f5b95fda668e891a842ca3b17e9ae14f2d1ab2`
- Starting build ID: `apex-2.0.1-ee6332c1bcaf`
- Resulting build ID: `apex-2.0.1-8910c3c6be00`
- Resulting source-tree SHA-256: `8910c3c6be00fb958387d8fcca7ae845120dcc04c144ab47d72e7945ffe557fa`
- Completed at: `2026-09-01T21:08:17Z`
- Scope:
  - Recovered CP25 from its persistent artifact and verified its SHA-256 and ZIP integrity.
  - Located a host dependency snapshot whose `package-lock.json` SHA-256 exactly matches CP25 (`7f0ce2bfe37817b669d5840b310dc782c9a9f7f2a0ea496af3509da2717ec9d2`) and whose `npm ls --all --omit=optional` reports no problems.
  - Used that exact-lockfile dependency snapshot only as a temporary runtime link; it is not packaged and is not represented as a fresh `npm ci` result.
  - Ran the authentic Autopilot lifecycle far enough to complete two scheduler-owned cycles before the host cancelled the later provider/network request.
  - Fixed the Lite-transfer root-contract regression by explicitly classifying and documenting `LITE_TRANSFER_MANIFEST.md`; unknown root entries remain rejected.
- Files modified:
  - `scripts/gates/checkRootContract.mjs`
  - `scripts/utilities/generateAppIndex.mjs`
  - `scripts/qa/verifyAppIndex.mjs`
  - `Doc/repository/ROOT_CONTRACT.md`
  - `REMEDIATION_CHECKPOINTS.md`
  - `REMEDIATION_CHECKPOINTS.json`
  - `AUDIT_FIX_REPORT.md`
  - `QA/cp26-current-environment-verification-v2.0.1.json`
- Gate results:
  - CP25 SHA-256 comparison: PASS (exact expected hash).
  - CP25 `unzip -t`: PASS.
  - exact-lockfile dependency snapshot verification: PASS (`package-lock.json` byte hash equal; `npm ls` exit 0; resolved `tsx`, `dotenv`, Playwright, TypeScript, and Vitest versions match the lockfile).
  - `npm run lint`: PASS (exit 0).
  - `npm test`: PASS (154/154 files; 946 passed; 1 explicit skip; exit 0).
  - `npm run qa:suite:runtime-core`: PASS (8/8 leaf checks; exit 0).
  - `npm run qa:suite:runtime-simulation`: PASS (3/3 leaf checks; 2946/2946 assertions; exit 0).
  - `npm run qa:autopilot-lifecycle-runtime`: BLOCKED_ENVIRONMENT after authentic Cycle N and Cycle N+1 completed. Both were `SERVER_SCHEDULER` cycles with indices 0 and 1, no overlapping index, no unauthorized promotion, and the literal execution denial intact. The host then cancelled the provider/network approval before manual `/validate`, `STOP -> OFF`, and the harness exit code could be recorded; no full PASS is claimed.
  - other runtime-safety leaves: PASS (`qa:unified-safety-runtime` 11/11, lifecycle environment classifier, supplemental key runtime 3/3, proxy optional dependencies 3/3).
  - `npm run qa:suite:source-core`: BLOCKED_ENVIRONMENT at the loopback-server leaf `qa:liquidity-hunter-gap-closure`; the host cancelled network approval for the loopback socket. All other source-core leaf commands reached exit 0 when run collectively or independently; the aggregate suite is not claimed as PASS.
  - root contract after repair: PASS (41 root entries explicitly classified; unknown-entry rejection retained).
  - final production build: PASS (exit 0; build ID `apex-2.0.1-8910c3c6be00`).
  - API contract: PASS (154/154; exit 0).
  - App Index: PASS (1536 files; 4511 symbols; resolver 14/14; lineage 6/6; contract 42/42; runtime/private working roots excluded; exit 0).
  - version, build identity, and source-secret gate: PASS (exit 0).
  - SQLite normalization/integrity: PASS (`journal_mode=delete`; `integrity_check=ok`; no WAL/SHM retained).
- Remaining blockers:
  - A fresh `npm ci` still cannot use registry egress in this environment; the exact dependency snapshot is valid for execution but not substituted for clean-install evidence.
  - No Chromium/Chrome executable is present in this execution environment, so canonical `1368x753` browser evidence remains unavailable.
  - Host policy cancels required provider egress and some spawned loopback-server runs. Manual `/validate`, lifecycle `STOP -> OFF`, the complete runtime-safety exit code, and the canonical UI flow therefore remain unproven.
- Checkpoint ZIP: `APEX-v2.0.1-CP26-BLOCKED-BROWSER-RUNTIME-POLICY.zip`
- Checkpoint ZIP SHA-256: recorded in the external sidecar created after packaging.

## CP27 — CP26 + CP22 Settings/Browser/Test/Font merge

- Status: MERGED_SOURCE_COMPLETE_REVERIFY_REQUIRED (source-complete merge; not release-verified FINAL)
- Starting checkpoint: `APEX-v2.0.1-CP26-BLOCKED-BROWSER-RUNTIME-POLICY.zip`
- Starting build ID: `apex-2.0.1-8910c3c6be00`
- Merge completed at: `2026-09-01T23:51:18Z`
- Scope:
  - Kept CP26 authoritative App Index private/runtime-root exclusions, Root Contract/LITE transfer policy, runtime/release hardening, API contract, and safety invariants.
  - Overlaid the six Work Agent CP22→CP26 port files for Settings, Vite, browser runtime QA, and screenshot capture.
  - Closed the remaining independent-audit gaps: all five Settings nav rules now use eight columns; the exact CP22 Phase 3.6 Settings visual hierarchy block is restored; the Smart Proxy fail-closed section header is restored; runtime QA uses a Smart-Proxy-scoped locator and separate canonical API/Smart-Proxy screenshots.
  - Preserved `autonomousLiveExecutionEnabled: false`, `automaticVenueFailoverEnabled: false`, KuCoin primary/default execution, Tabdeal read-only/PAPER semantics, Risk Governor authority, and Liquidity Hunter shadow/research-only semantics.
- Changed merge surfaces:
  - `src/pages/settings/SettingsPage.tsx`
  - `src/pages/settings/SettingsPage.css`
  - `src/components/IntelligenceSourcesSettingsPanel.tsx`
  - `vite.config.ts`
  - `scripts/qa/verifyWorkspaceRuntime.mts`
  - `scripts/capture/captureWorkspaceScreens.mts`
  - `Doc/CP27_MERGE_MANIFEST.md`
  - `REMEDIATION_CHECKPOINTS.md` / `.json`
  - `QA/cp27-merge-evidence/*`
- Current-session verified gates:
  - static CP27 merge assertions: PASS, 16/16.
  - `npm run check:root-contract`: PASS after keeping the merge manifest under `Doc/` rather than weakening root policy.
  - `npm run check:version`: PASS.
  - `npm run release:gate:source`: PASS.
  - canonical API route check: PASS, 154 runtime / 154 documented routes.
  - Function Index regeneration: PASS, 4511 symbols across 820 files.
  - App Index generate/check: PASS; 1537 files / 4511 symbols; resolver 14/14; lineage 6/6; contract 42/42.
  - App Index SQLite finalization: PASS; `journal_mode=delete`, `integrity_check=ok`, no WAL/SHM.
  - `npm run qa:unified-safety-runtime`: PASS, 11/11.
  - `npm run qa:smart-autopilot`: PASS, 21/21 source QA.
  - `npm run qa:suite:runtime-simulation`: PASS, 3/3 leaf checks and 2946/2946 assertions.
  - `npm run qa:suite:source-core`: INCOMPLETE_HOST_TIMEOUT; host 300s limit interrupted at `qa:liquidity-hunter-gap-closure` after preceding displayed leaf checks passed.
  - `npm run qa:liquidity-hunter-gap-closure`: BLOCKED_ENVIRONMENT (`server_start_timeout` because local `tsx` dependency is unavailable in this execution environment).
  - `npm run check:build-identity`: EXPECTED_FAIL_CLOSED because CP26/Work-Agent build outputs predate the final CP27 source corrections; no CP27 build identity was fabricated.
- Windows/operator evidence retained verbatim under `QA/cp27-merge-evidence/`:
  - locked dependency restore: PASS; 429 packages; `package-lock.json` SHA-256 remained `7F0CE2BFE37817B669D5840B310DC782C9A9F7F2A0EA496AF3509DA2717EC9D2`; Windows-native esbuild and Rollup loaders PASS.
  - targeted TSX suites: PASS, 2/2 files and 10/10 tests.
  - full Vitest run: NOT PASS — 156 files total, 155 passed / 1 failed; 957 tests total, 955 passed / 1 skipped / 1 failed; the only failure was the known `dataflowHardening` archive test timing out at 30000 ms.
  - Work Agent pre-final-gap build: PASS at build ID `apex-2.0.1-b616f97edc8e`; 0 inline `data:font` URLs and 92 emitted font files. This build predates the final CP27 CSS/header/browser-QA corrections and is retained only as historical evidence, not CP27 build identity.
- Remaining mandatory re-verification:
  - fresh production build from the exact CP27 source and `check:build-identity` PASS;
  - full Vitest PASS for the exact CP27 source (the known load timeout must not be silently upgraded to PASS);
  - canonical `1368x753` browser QA against the exact CP27 source;
  - complete mandatory runtime-safety/Autopilot lifecycle exit including final validation and `STOP -> OFF`.
- Final merged-source artifact name: `APEX-v2.0.1-CP27-FINAL-MERGED-SOURCE-WINDOWS-EVIDENCE.zip` (SHA-256 stored in the external sidecar).
- Packaging policy:
  - stale CP26/Work-Agent `dist/` is intentionally excluded from the CP27 source artifact.
  - `node_modules`, `.apex-data`, `.apex-private-data`, browser caches, temp/runtime state, and other release-forbidden working roots remain excluded.
  - The delivered archive is the final **merged-source + evidence** artifact for this merge, not a claim that every mandatory release/runtime gate passed.



### CP27 Settings UX enhancement addendum

- Status: SOURCE_COMPLETE_REVERIFY_REQUIRED
- Completed at: `2026-09-02T00:16:10Z`
- Files changed: `src/pages/settings/SettingsPage.tsx`, `src/pages/settings/SettingsPage.css`, `Doc/CP27_MERGE_MANIFEST.md`, and evidence metadata under `QA/cp27-merge-evidence/`.
- UX scope: section-aware control-center header; clearer labeled tab hierarchy; stronger active/hover/focus treatment; improved card/form/API/Smart-Proxy presentation; responsive tab rail; dark-mode and reduced-motion refinement.
- Static verification: TypeScript syntax/transpile PASS; PostCSS parse PASS; zero Settings-nav `repeat(7, ...)`; five `repeat(8, ...)` rules retained.
- External runtime evidence: `.apex-data.zip` SHA-256 `405399cb0962324ac26689d16ee8a49d2f48315847566b3a9dc943cbf7c47a39`; intentionally not embedded because `.apex-data` is runtime/private state.
- Safety: no execution authority, failover authority, provider routing semantics, credential storage, promotion authority, Risk Governor, or holdout policy changed.
- Mandatory status: fresh exact-source build/browser/full-test/runtime-lifecycle re-verification is still required; no historical build is reclassified as proof for this enhanced source state.
- Enhanced merged-source artifact: `APEX-v2.0.1-CP27-UX-ENHANCED-MERGED-SOURCE-WINDOWS-EVIDENCE.zip`; SHA-256 stored externally.
