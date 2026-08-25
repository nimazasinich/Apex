# Pixel-QA "all 8 routes show RouteErrorBoundary" — RESOLVED 2026-08-23 (cause was App.tsx, not operationsDiagnostics)

Symptom (now fixed): `scripts/qa/runOfflinePixelGate.mjs` (offline `file://` build + deterministic fetch stub) captured all
8 routes (watchlist, orders, positions, alerts, history, analytics, settings, help) as **byte-identical 19,706-byte** PNGs
showing "Workspace could not be rendered". Artifact: `QA/profitability-structural-remediation/browser/pixel-qa.json`.

## Defect class: `?.` that guards only the FIRST hop
All members look like `a?.b.c` — the `?.` stops the null-check at `a`, then `.b.c` dereferences `undefined.c` and throws.
When such an expression sits in render (or in a **useEffect dependency array**, which React evaluates during render),
the throw is synchronous and lands in the OUTER RouteErrorBoundary (`main.tsx:27`, wraps `<App/>`) — so **every** route
shows one identical fallback, and that route-independence is the tell that the fault is above the router.

## The misdiagnosis that cost two investigation passes
`src/services/operationsDiagnostics.ts` / `summarizeOperationsDiagnostics` had three real members of the class
(`operations?.service.status`, `operations?.providers.summary.configuredProviders`, `.configuredHealthyProviders`).
They were declared THE root cause "exhaustively verified". Fixed them -> `tsc` 0, test:unit 130/756 0, rebuilt
(sourceHash 3a1670c3 -> 6fea6335) -> **symptom completely unchanged**: still 1 distinct hash across 8 PNGs, still
`TypeError: Cannot read properties of undefined (reading 'status')`.
**Lesson: a plausible unguarded chain is not evidence of causation. Attribute the stack frame BEFORE editing.**

## Frame attribution recipe (cheap, decisive — do this FIRST)
Rollup minifies identifiers but **preserves property names**, so slicing the bundle around the stack column names the
exact expression. `pixel-qa.json.consoleErrors` carries `dist/assets/index-<hash>.js:LINE:COL`:
```powershell
$m=[regex]::Match($err,'assets/(index-[^:]+\.js):(\d+):(\d+)')
$t=((Get-Content "dist\assets\$($m.Groups[1].Value)" -Raw) -split "`n")[[int]$m.Groups[2].Value-1]
$t.Substring([Math]::Max(0,[int]$m.Groups[3].Value-300),400)
```
Pass 1 gave `...if(!St(J))return;...8e3...},[J.status,J.mode,Ot])` -> grep `\.status,\s*\w+\.mode` -> one hit.
Widen/shift the window if it lands on neighbouring JSX instead of the culprit.

## FIX APPLIED (uncommitted, `src/App.tsx` + `src/services/operationsDiagnostics.ts` only)
`src/App.tsx:427-431` was the real cause. The `accountIsAvailable(connection)` guard sits INSIDE the effect callback
(deferred), so it cannot protect `[connection.status, connection.mode, refreshAccount]`, which React evaluates on every
render. `connection` starts as the local literal `INITIAL_CONNECTION` (App.tsx:56) — first paint is fine — and becomes
`undefined` only after a fetch resolves: the QA stub answers `/portfolio|account|balance/` with no `connection` key, so
`result.connection === undefined` -> `setConnection(undefined)` -> next render throws.
Two layers applied (user chose "both"):
1. Normalize at the boundary so `ConnectionState` is never actually `undefined` as its type already claims —
   `?? INITIAL_CONNECTION` on all four setter sites (App.tsx 362-364, 372, 388, 395-396). The two `getWorkspaceData`
   sites use a `const nextConnection = result.connection ?? INITIAL_CONNECTION` local so `connectionRef.current`
   (read by `accountIsAvailable` at App.tsx:350) is normalized in lockstep with the state.
2. `[connection?.status, connection?.mode, refreshAccount]` as defence in depth.

**Verified result:** 8 PNGs now have **8 distinct hashes**, 123,605-257,539 bytes (was one 19,706-byte hash);
`rootTextLength` 224 -> 2274; `reading 'status'` **ABSENT**. Orders capture visually shows full real UI (sidebar,
5 KPI cards, tab strip, filters, table headers, Order Assistant panel). `tsc --noEmit` 0, `build` 0, `test:unit`
130 files / 756 tests 0. Never fixed by adding fields to the QA stub — that would be fabricated data masking a real bug.

## STILL OPEN: same class, `overview` route (was masked by the App crash)
`src/components/workspace/GeneralViews.tsx` — `.providers` and `.health` unguarded after a guarded `.data`:
- line 98  `diagnostics?.health.data ?? null`
- line 100 `diagnostics?.operations.data?.providers.items ?? []`
- line 109 `diagnostics?.operations.data?.providers.items ?? []`
Now throws `TypeError: Cannot read properties of undefined (reading 'items')` -> `[APEX] Route render failure
{route: overview}`. `overview` is NOT among the 8 harness routes (it is the load-time route before hash navigation),
so the 8 captures are unaffected. Fix is `?.` on `.providers` / `.health` — awaiting authorization, not yet applied.
**Assume more members of this class exist; grep `\?\.\w+\.\w+` per file rather than trusting any "exhaustive sweep" claim.**

## Companion memory — read before citing this gate's exit code
`mem:qa/offline_pixel_gate_baseline_provenance` explains why this gate's process exit code is decided by `runtimeGatePassed` alone (not the pixel comparison), why all 8 routes verdict `review` and can never reach `pass` (baselines are downscaled 1672x941→1368x753 renders, not native captures), and confirms real UI is now rendering post-fix. Read it alongside this file, not instead of it.

## Related, deliberately untouched (needs explicit user authorization)
`runtimeGatePassed = rootTextLength >= 40 && pageErrors.length === 0` (harness line 98) is why 100%-broken routes
shipped green: a RouteErrorBoundary fallback is caught React state so `pageErrors` stays `[]`, and the fallback's own
text clears 40 chars. Pixel verdicts are separately `review` on all 8 vs the `Doc/reference/v20` baseline
(msSsim 0.55-0.62 after the fix, 0.68-0.74 while broken — the baseline itself now needs a look).

Contrary to an older handoff note, `src/tests/operationsDiagnostics.test.ts` DOES exist (5 tests). No unit test covers
the App.tsx dep-array path; a regression test asserting `summarize*` / App tolerate a `{}` payload would be cheap.

Run recipe: needs a fresh `npm run build` first (harness loads `dist/`, not live source), then
`set "APEX_PLAYWRIGHT_EXECUTABLE=%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe"`
+ `node scripts/qa/runOfflinePixelGate.mjs`. ~35s. Launch/poll per `mem:windows_gate_ops`.
