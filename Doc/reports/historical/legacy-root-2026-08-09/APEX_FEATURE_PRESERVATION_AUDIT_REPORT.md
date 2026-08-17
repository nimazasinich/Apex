# APEX v1.0.47 — Feature Preservation and Regression Audit

## Scope

Compared the Core 10 Dynamic Fusion delivery against:

1. `APEX-complete-integrated-v1.0.47-intelligent-threshold-optimized.zip` — immediate predecessor.
2. `APEX-complete-integrated-v1.0.47-fully-integrated-latest.zip` — earlier full-integration baseline.

The audit treats source, routes, imports, runtime contracts, and executed checks as authority. Presence of a file alone is not considered behavioral proof.

## Preservation result

- Every one of the 696 files from the immediate predecessor remains present.
- No previous package script was removed.
- No previous Express route was removed.
- No previously exported symbol from the changed core service files was removed.
- All 13 previously registered strategy identities remain registered.
- Core 10 adds two strategies and a dynamic-fusion preview route without deleting prior strategy identities or routes.
- All 740 actual relative imports across active source/server files resolve to existing files.

## Regressions found and fixed

The initial Core 10 delivery had three compatibility regressions in `strategyRegistry.ts`:

1. `opening-range-vwap-rvol-breakout-v1` no longer exposed the previous `atrStopMultiplier` control even though the engine still consumed it.
2. `volatility-squeeze-trend-volume-expansion-v1` no longer exposed `widthLookback` or `atrStopMultiplier`. It exposed `squeezeLookback`, but the engine read `widthLookback`, making the new control ineffective.
3. `regime-routed-ai-ensemble-v1` dropped the previously supported `1d` interval even though its deterministic runner is interval-agnostic.

Corrections:

- Restored both ATR stop controls.
- Restored `widthLookback` as the canonical squeeze parameter.
- Retained `squeezeLookback` as a backward-compatible alias for profiles created by the Core 10 build.
- Normalized aliases in Strategy Studio, fusion preview, active optimization profiles, replay execution, and replay cache identity.
- Restored `1d` for the regime router.
- Added a runtime feature-preservation gate and a Vitest regression file.

## Executed evidence

Passed:

- Feature-preservation runtime contract: 19 checks.
- Test inventory: 65 files / 227 declared cases.
- Merged Stage SEC/UI contract: 31/31.
- Agent-safe integration: 19/19.
- Core 10 fusion contract: 17/17.
- Strategy optimizer integration: 26/26.
- All current source-contract suites.
- All legacy source-contract suites against the current architecture.
- Strategy-engine deterministic runtime smoke.
- Adaptive governor runtime smoke.
- Core 10 fusion load benchmark.
- Isolated TypeScript-family transpile: 340 files / 0 syntax failures.
- JavaScript syntax checks.
- All three GitHub workflow YAML files parsed.
- Source-only release/security gate.
- Version identity gate.
- 119 Markdown files / 0 broken local links.
- Active source import graph: 740 relative imports / 0 missing targets.

Core 10 benchmark in this final tree:

- 500 fusion evaluations: median approximately 0.170 ms, p95 approximately 0.397 ms.
- 12 regime-router evaluations: median approximately 5.19 ms, p95 approximately 12.87 ms.
- Outputs remained deterministic.

## Not executed

`npm ci` is blocked by the configured package registry returning HTTP 404 for `vitest-4.1.10.tgz`. Consequently, the following are not claimed as passed in this environment:

- semantic `tsc --noEmit`;
- package-backed Vitest execution;
- production Vite build;
- browser runtime tests;
- accessibility browser tests;
- visual screenshot/geometry tests.

The CI workflows retain these gates for an environment with working dependency access.

## Final position

No previous feature is intentionally removed. The three confirmed compatibility regressions were repaired and are now protected by executable source/runtime checks. The project is source- and deterministic-runtime-consistent under the available environment, but full browser/build approval remains gated by a successful package installation.
