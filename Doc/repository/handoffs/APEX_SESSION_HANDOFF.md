AUTHORITATIVE SOURCE TO COPY FROM:
C:\Users\Dreammaker\AppData\Local\Claude-3p\local-agent-mode-sessions\b3b3a33d\00000000\local_f63803e6-27ea-4d54-a273-23ceab32e23e\outputs\APEX-unified-maximal-v1.0.56-r2-merged

NEXT SESSION RULE:
DO NOT DEVELOP AGAINST THE OLD C:\project SNAPSHOT.
FIRST COPY THIS ENTIRE TREE INTO THE NEW SESSION'S OWN WRITABLE WORKSPACE.

---

# APEX Session Handoff

Written 2026-08-11 12:22 UTC. Package version 1.0.56 (`APEX-unified-maximal-v1.0.56-r2-merged`).

This file is the durable continuity record for the next Claude session. Everything below was verified in the session that produced it, and every claim marked PROVEN has real command output behind it.

## 1. Which tree is real

The path at the top of this file is the only authoritative APEX source. It contains the newest source and all work completed in this session.

`C:\project\APEX-frontend-phase31\APEX-unified-maximal-v1.0.56-r2-merged-source\APEX-unified-maximal-v1.0.56-r2-merged` is **NOT authoritative**. It is a stale pre-lifecycle snapshot, and it remains non-authoritative unless it is explicitly synchronized from the authoritative tree at some later point. Do not develop against it, and do not treat anything found there as current.

The authoritative tree lives under a session-scoped outputs directory, so a later session cannot write into it. That is why the first action of the next session is a copy.

### Sample Windows copy command for the next session

```powershell
$src = 'C:\Users\Dreammaker\AppData\Local\Claude-3p\local-agent-mode-sessions\b3b3a33d\00000000\local_f63803e6-27ea-4d54-a273-23ceab32e23e\outputs\APEX-unified-maximal-v1.0.56-r2-merged'
$dst = '<NEW_SESSION_WRITABLE_OUTPUTS>\APEX-unified-maximal-v1.0.56-r2-merged'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
robocopy $src $dst /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ
if ($LASTEXITCODE -gt 7) {
    throw "APEX COPY FAILED: $LASTEXITCODE"
}
```

`robocopy` exit codes 0-7 are success (0 = nothing to copy, 1 = files copied, 2/4 = extras/mismatches present); 8 and above are real failures, which is why the guard is `-gt 7`.

### Verify the copy before switching to it

Do this before writing a single line of new code. If any check fails, stop and re-copy rather than proceeding on a partial tree.

Confirm the lifecycle work is actually present (a tree missing these markers is the old snapshot, not the current source):

```powershell
Set-Location $dst
foreach ($m in @('strategyValidationSubject','candidateSubject','validationReplayInputs','runAutopilotLifecycleRuntime','qa:autopilot-lifecycle-runtime')) {
  $hit = Select-String -Path .\src\**\*.ts, .\scripts\**\*.mjs, .\package.json -Pattern $m -List -ErrorAction SilentlyContinue
  "{0,-34} {1}" -f $m, $(if ($hit) { 'PRESENT' } else { 'MISSING — WRONG TREE' })
}
```

Then verify the critical lifecycle files and their hashes against the table below:

```powershell
Get-ChildItem @(
  'src\services\strategyValidationSubject.ts',
  'src\services\strategyPromotionGate.ts',
  'src\services\strategyValidation.ts',
  'src\services\apexNextMarketRoutes.ts',
  'src\types.ts',
  'src\tests\strategyValidationIdentity.test.ts',
  'src\tests\strategyPromotionGate.test.ts',
  'scripts\qa\runAutopilotLifecycleRuntime.mjs',
  'package.json'
) | ForEach-Object {
  $h = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower().Substring(0,16)
  $l = (Get-Content $_.FullName | Measure-Object -Line).Lines
  "{0,-58} {1,6}  {2}" -f $_.Name, $l, $h
}
```

| file | lines | sha256[0:16] |
|---|---|---|
| src/services/strategyValidationSubject.ts (NEW this session) | 281 | afd8793a2877860b |
| src/services/strategyPromotionGate.ts | 167 | 9b714f6a0ef3a751 |
| src/services/strategyValidation.ts | 107 | 3f2b59423dbf206a |
| src/services/apexNextMarketRoutes.ts | 3133 | d1e858443e3d5cc8 |
| src/types.ts | 1068 | bb1def6fb4ab148e |
| src/tests/strategyValidationIdentity.test.ts (NEW this session) | 358 | 303075b7d02a95f0 |
| src/tests/strategyPromotionGate.test.ts | 325 | be149301a2453081 |
| scripts/qa/runAutopilotLifecycleRuntime.mjs (NEW this session) | 318 | 1a83201a868ad976 |
| package.json | 167 | 88f0cf109ba47236 |

Line counts are newline counts as reported by `wc -l`; PowerShell's `Measure-Object -Line` can differ by one on a file without a trailing newline. Treat the hash as authoritative and the line count as a sanity check.

## 2. Completed work — do not rebuild any of this

### Autopilot Priority 1 — real control (CLOSED)

The existing Autopilot UI drives the real server-side controller state machine `OFF | RESEARCHING | VALIDATING | WAITING | FAILED`. There is no parallel client-side controller and no cosmetic toggle. Routes:

- `GET /api/strategies/autopilot/status` — controller phase, scheduler state, latest cycle, safety block
- `POST /api/strategies/autopilot/control` — `{ action: 'START' | 'STOP' }`, anything else is 422
- `POST /api/strategies/autopilot/cycle` — one bounded research cycle

The client polls status, sends START/STOP through one shared mutate helper, degrades an unreachable server to an explicit UNREACHABLE/FAILED state rather than a healthy-looking OFF, and yields cadence to the server scheduler instead of double-driving cycles.

### Autopilot Priority 2 — closed forward loop (CLOSED)

validated profile → PAPER/SHADOW forward evaluation → simulated fills, costs and PnL → attribution to the exact strategy, profile and cycle → research-scoped outcome memory → next cycle consumes the aggregated forward evidence → improve, retain or demote → repeat. Everything in this loop is simulated: no exchange client, no order, no Risk Governor interaction, no execution authorization.

### Autopilot Priority 3 — candidate-validation identity (CLOSED, verified)

Root cause: `runStrategyDefinition` resolved profiles with `args.applyActiveOptimization === false ? null : strategyOptimizationStore.getActive(ctx)`. Because the flag was optional, *omitting* it meant "read whatever profile is currently promoted". The validation suite omitted it, so validation replayed the already-active profile B while the report read as a statement about the strategy — and the promotion gate, which checked only strategy id, version and recency, could authorize candidate A on B's evidence. It never looked like a failure; it looked like a passing gate.

Fix, as implemented:

- `src/services/strategyValidationSubject.ts` (new, pure — no clock, network, filesystem or store access) materializes a `StrategyValidationSubject` with kind `OPTIMIZATION_CANDIDATE | ACTIVE_PROFILE | DEFINITION_DEFAULTS`, and fingerprints it with a canonicalizing FNV-1a hash over `strategyId`, `strategyVersion`, `parameters` and `scannerConfig`. Provenance fields (`activeProfileRevision`, `sourceReportAt`) are recorded but deliberately excluded from the fingerprint, so the same candidate values reached from a different revision are still the same candidate.
- `validationReplayInputs()` returns `applyActiveOptimization: false` as a **literal type**, so TypeScript rejects any attempt to widen it back to a boolean. The store can no longer be consulted from inside a validation replay.
- The subject is pinned once per suite run. That also removes a race: previously a promotion landing mid-suite changed the profile under later slices, mixing two identities into one report.
- `src/services/strategyPromotionGate.ts` requires `candidateSubject` and blocks, in order, `validation_report_missing`, `validation_strategy_mismatch`, `validation_strategy_version_mismatch`, `validation_predates_optimization_report`, `validation_subject_missing`, `validation_subject_not_candidate`, `validation_subject_mismatch` — and only then computes `failedGates` / `validationPassed`. A missing or non-candidate subject is a blocker, never an implicit pass. The result carries `candidateFingerprint`, `validatedFingerprint` and `subjectMatched`.
- Both callers now share one candidate-specific runner. The automatic path passes `subject: candidateSubject` plus an explicit `baseline`; the manual `/validate` route snapshots `ACTIVE_PROFILE` when a profile exists and `DEFINITION_DEFAULTS` otherwise. Because `/validate` never names an `OPTIMIZATION_CANDIDATE`, a manual report can never satisfy the automatic-promotion gate.

### UI-01 / UI-02 / UI-03 (CLOSED WITH EVIDENCE — do not reopen)

Closed explicitly by the user in an earlier session. UI-01: the account path dropped `syncedAt`, so stale data rendered as live — fixed, with consumers wired to the corrected shape. UI-02/UI-03: provenance (source and age) surfaced for the sentiment, correlation and account surfaces, with `PriceChart` as the reference implementation for how provenance should look.

## 3. Verification state

### Phase 1 — fix identity + A-vs-B regression test: COMPLETE (PROVEN)

- Narrow typecheck over the changed file set: `tsc --noEmit -p tsconfig.identity.json` → `TSC_EXIT=0`, zero errors.
- `src/tests/strategyValidationIdentity.test.ts` (17 tests) + `src/tests/strategyPromotionGate.test.ts` (22 tests) → **39/39 passed**.
- The identity test runs active profile B against candidate A on a real registered scanner-preset strategy (`liquidity-sweep-fvg-reversal-v1`) and includes a genuine NEGATIVE CONTROL that replays the pre-fix merge expression through the real `normalizeStrategyParameterAliases` and proves it resolved to B. The assertions demonstrably detect the regression rather than passing vacuously. It also proves A's scanner config reaches the engine with B's deltas materially absent, and that the gate refuses B's evidence in three distinct shapes (wrong kind, relabelled fingerprint, missing subject).
- What that test does **not** prove: it does not replay real market history, because `runStrategyDefinition` is private to `registerApexNextMarketRoutes` and the suite needs 1,200 verified candles. Route wiring is pinned structurally instead, with the required `subject` field making the compiler the other half of the guard.

### Phase 2 — focused lifecycle regression set: COMPLETE (PROVEN)

```
Test Files  16 passed (16)
     Tests  171 passed (171)
  Duration  3.56s
```

Files: paperForwardEvaluator, researchOutcomeFeedback, autopilotControllerState, autopilotScheduler, autopilotControlWiring, autopilotIntegration, smartAutopilot, strategyPromotionGate, strategyValidationIdentity, strategyValidationRuntime, strategyOptimization, multiAgentResearchCouncil, multiAgentCouncilStore, multiStrategyResearchOrchestrator, fastAdaptiveShadowController, decisionMemoryPatch.

Repo-wide inventory gate (`node scripts/gates/checkTestInventory.mjs`): 111 test files / 598 tests discovered, exit 0.

### Phase 3 — REAL Windows runtime verification: INSTRUMENT BUILT, NOT YET RUN

`scripts/qa/runAutopilotLifecycleRuntime.mjs`, registered as `npm run qa:autopilot-lifecycle-runtime`. It is not a source-string check and not a unit test: it boots the actual server as a child process and drives the real HTTP surface.

Flow: `/api/health` → status reports OFF → control START arms → one live cycle with status polled concurrently at 750ms so phase transitions are observed as they happen → identity invariants on the returned promotion gates → `POST /api/strategies/:id/validate` subject kind → control STOP returns to OFF → unknown control action refused with 422.

23 checks. Exit code is non-zero on any FAIL. SKIPs (no executable context, insufficient verified history) are reported explicitly and never upgraded to a pass. Environment knobs: `APEX_RUNTIME_PORT` (default 4599), `APEX_RUNTIME_BASE_URL` (target an already-running server instead of booting one), `APEX_RUNTIME_BOOT_TIMEOUT_MS` (180000), `APEX_RUNTIME_CYCLE_TIMEOUT_MS` (900000), `APEX_RUNTIME_SYMBOL` (BTC-USDT).

The instrument itself was self-verified in the Linux sandbox against a route-contract stub, because the real server needs win32 `node_modules` and live market data. Healthy stub → 23/23 PASS, exit 0. Three injected defects each produced exactly one targeted FAIL and exit 1: a profile promoted while its gate was not authorized; `/validate` mislabelling itself `OPTIMIZATION_CANDIDATE`; the controller stuck in WAITING through a cycle. So the instrument fails closed rather than passing vacuously.

**The real Windows run against live market data has NOT happened.** No Windows-host output exists for it. Do not describe Phase 3 as passing.

## 4. Exact unfinished next step

On the Windows host, from the freshly copied writable tree, with network and the SOCKS5 proxy up:

```powershell
npm run qa:autopilot-lifecycle-runtime
```

Paste the real output. If the cycle SKIPs for want of an executable context or verified history, that is a real result to report as a SKIP, not a pass. Nothing else on the Autopilot lifecycle is pending.

Housekeeping: a stray `.writecheck` file sits at the tree root and should be deleted (it was never intended to ship).

## 5. Safety invariants — preserved, and must stay preserved

- No automatic LIVE promotion. Adaptive live approval remains manual.
- No real-order authority anywhere in the Autopilot path.
- Risk Governor preserved. DecisionBridge preserved. No bypass path, not even for testing.
- Execution authorization is fail-closed.
- Research evidence and research memory stay isolated from the LIVE adaptive-governance and decision-memory mirror.
- Every Autopilot response carries the literal denial: `researchOnly: true`, `paperOnly: true`, `executionAuthorized: false`, `automaticOrderSubmission: false`, `autonomousLiveExecutionEnabled: false`, `riskGovernorBypassAllowed: false`, `manualConfirmationRequired: true`.
- Never fabricate market data; quality tags (VALID / ESTIMATED / MISSING / STALE) must survive to the UI.
- Do not expose secrets. Do not modify provider routing to solve a presentation problem. Do not promote Bitget or OKX. The SOCKS5 proxy on 127.0.0.1:10808 is intentional — no proxy troubleshooting loops.
- Never claim a build, test, runtime check or browser check passed without real pasted output.

## 6. Files created or edited in this session

New:

- `src/services/strategyValidationSubject.ts` — the subject/fingerprint keystone
- `src/tests/strategyValidationIdentity.test.ts` — the A-vs-B regression test
- `scripts/qa/runAutopilotLifecycleRuntime.mjs` — the Phase 3 runtime verifier

Edited:

- `src/services/strategyPromotionGate.ts` — requires `candidateSubject`; identity blockers before any verdict
- `src/services/strategyValidation.ts` — `ValidationInputs` carries `subject` and `baseline`; report emits both
- `src/types.ts` — `StrategyValidationReport.subject` plus the honest holdout-only `baseline`
- `src/services/apexNextMarketRoutes.ts` — imports `definitionDefaultsSubject`; `/validate` states its subject explicitly (~line 2899); the automatic path builds one `candidateSubject` used for both validating and promoting (~line 767)
- `src/tests/strategyPromotionGate.test.ts` — repaired for the new required fields, plus four identity cases (22 tests)
- `package.json` — added `qa:autopilot-lifecycle-runtime` (additive only; `verify` and the release gates were deliberately left untouched, since the runtime verifier needs network and minutes)

## 7. Environment lessons

The Windows source tree is authoritative. All builds, tests, runtime execution and browser QA belong on the Windows host; the standing directive persists until the user sends exactly `REVOKE WINDOWS-HOST-ONLY DIRECTIVE`.

Do not restart old audits. These are intentionally halted, not forgotten: QA-DARK-TRADING-01 (its approved rail-clipping CSS patch for `TradingWorkspace.css` is deliberately still unapplied), QA-READY-01, QA-WIRING-01, QA-GEOMETRY-1368-01, CI-WINDOWS-01, CI-RELEASE-PRIV-01, CI-TIMEOUT-01, CI-PLAYWRIGHT-DUP-01, CI-SBOM-01, DOC-02, QA-03.

Do not rebuild completed lifecycle work. Do not trust the old `C:\project` snapshot.

Sandbox notes, if a Linux sandbox is available again:

- vitest **does** run there via a scratch harness — copy `src`, `scripts` and `server.ts` into a fresh directory and `npm install vitest@4.1.10 vite@6.4.3 express@4.21.2 undici@6.27.0 socks-proxy-agent@10.1.0 dotenv@17.2.3`. `scripts/` is required because `server.ts` imports `./scripts/utilities/portTakeover.mts`.
- Never copy `vite.config.ts` or `vitest.config.ts` into the harness.
- `--reporter=basic` is invalid in vitest 4.
- Build harnesses under `$HOME`, not `/tmp`; a workspace restart wiped `/tmp` mid-session.
- For tsc, copy the project's **real** `tsconfig.json` and extend it with `include: []` plus an explicit `files` list (mirroring the existing `tsconfig.ui02.json` precedent). Do not hand-write compiler options — inventing `verbatimModuleSyntax` produced 58 phantom errors in files that were never touched. Install `typescript@5.8.3`, `@types/node`, `@types/express@4.17.21` and `@huggingface/hub@2.14.2`, and invoke `./node_modules/.bin/tsc`; bare `npx tsc` fetches the unrelated `tsc@2.0.4` package.
- Mid-session the shared auto-mode safety classifier returned "temporarily unavailable" for every mutating MCP call, which blocked Windows execution and browser QA outright. desktop-commander only became available at the very end of the session. Expect that failure mode and switch channels early instead of retrying.

## 8. Instruction for the next session

Copy the ENTIRE authoritative project into your own writable workspace first. Verify the markers and hashes in section 1 against the copy. Only then continue — and the first substantive action is the Phase 3 Windows runtime run in section 4, not more source development.
