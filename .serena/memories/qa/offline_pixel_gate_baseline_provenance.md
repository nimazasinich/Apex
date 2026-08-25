# Offline pixel gate: why it is permanently at `review`, and why exit 0 means almost nothing

Measured on Windows 2026-08-23 with build `4b45b635-415fe6a8`.

## The exit code is decided by ONE metric, not the pixel comparison

`scripts/qa/runOfflinePixelGate.mjs` last line:

```js
process.exitCode = runtimeGatePassed ? 0 : 1;
```

where `runtimeGatePassed = rootTextLength >= 40 && pageErrors.length === 0`.

`report.passed` (which *does* require `results.every(r => r.passed)`) and `pixelPassed` are written to
`QA/profitability-structural-remediation/browser/pixel-qa.json` and then **ignored** by the exit code.

Real observed run: `{ runtimeGatePassed: true, pixelPassed: 0, pixelTotal: 8, passed: false, pageErrors: 0 }`
→ **process exit 0.** Never report this script's exit 0 as a pixel PASS. Read `pixelPassed`/`passed` from the JSON.
Also beware: in `cmd /c ... && echo %errorlevel%` the value is stale without delayed expansion — it printed
`PIXEL_EXITCODE=0` on a run that actually threw.

## Why all 8 routes return `review` and can never reach `pass`

`Doc/reference/v20/scale-manifest.json` records the baselines' provenance:

```json
"sourceViewport": { "width": 1672, "height": 941 },
"targetViewport": { "width": 1368, "height": 753 },
"qaReferenceTransform": { "resize": {"width":1368,"height":770}, "centerCrop": {"top":8,"bottom":9,...} }
```

The 8 baselines are **1672x941 captures resized to 1368x770 then center-cropped to 753** — resampled
reference-design images, *not* native 1368x753 renders. The gate compares them against a native crisp
Chromium screenshot. Signatures of that mismatch, all 8 routes, `diffExitCode: 0` (tool healthy):

| metric | observed range |
|---|---|
| verdict | `review` on all 8 (never `fail`) |
| ms_ssim | 0.5517 - 0.6170 |
| edge_f1 | 0.1952 - 0.3224 |
| pct_pixels_changed | 7.90% - 12.51% |
| baseline PNG size | 726 KB - 944 KB |
| capture PNG size | 123 KB - 257 KB |

Low **edge_f1 (~0.2)** is the tell: downscaled baselines have softened anti-aliased edges, native renders have
crisp 1px edges. The ~6x PNG size gap is the same cause (interpolation destroys PNG compressibility).
Secondary contributor: baselines are dated 2026-08-17 and predate several authorized redesigns — sidebar density, metric cards, orders geometry, strategy compare, and the Overview command-center rework (no memory named `frontend/overview_command_center` exists in this project's Serena graph to cite; likely lives in the separate Claude Desktop project-memory system instead, or was never written — re-file it here if recovered).

**Do not "fix" this by lowering the diff thresholds.** The baseline set itself needs re-establishing natively.

## The manifest is documentation, not gate input

`runOfflinePixelGate.mjs` **never reads** `scale-manifest.json`. Gate scope is the hardcoded array:

```js
const routes = ['watchlist','orders','positions','alerts','history','analytics','settings','help'];
```

References resolve as `Doc/reference/v20/${route}-1368x753.png`. So adding an Overview baseline requires
**two** edits (`routes` array + manifest `pages` array), and any `overview-<timestamp>.png` filename is inert
because it can never match the `${route}-1368x753.png` lookup.

## Real UI is confirmed rendering (the 19,706-byte fallback is gone)

8 distinct captures in `QA/profitability-structural-remediation/browser/captures`, 123,515 - 257,503 bytes,
none identical: help 123515, positions 138092, alerts 139771, analytics 148985, settings 162591,
orders 170183, watchlist 207694, history 257503. `pageErrors: 0`.

## Operational notes

- Requires `APEX_PLAYWRIGHT_EXECUTABLE` = an existing Chromium binary or it throws at import time. Working
  path: `C:\Users\Dreammaker\AppData\Local\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe`
- Also needs a Python 3 (probes `python3`/`python`/`py -3`, override `APEX_PYTHON`) for
  `scripts/utilities/apex_visual_diff.py`.
- The working-tree modification to this script (Python probe + real `browser.version()` replacing a hardcoded
  version string and `archiveSha256`) is **pre-existing Windows portability work, not gate weakening** — it
  removes hardcoded values rather than adding them, and does not touch the exit-code line.
- `.playwright-browsers` IS explicitly classified in `scripts/gates/checkRootContract.mjs`, so it is safe at
  the repo root. `.playwright-mcp` is NOT — see `mem:local_agent_mode_tool_surface`.
