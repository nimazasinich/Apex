# APEX App Index — Code Cartography

Generated: 2026-09-02T17:13:33.730Z

This map distinguishes **dependency edges** from **actual liveness**. A file can be imported by another file and still be dead when neither is transitively reachable from a valid root.

## Summary

- Repository files mapped: 1579
- Code files: 844
- Function Atlas symbols linked: 4560
- AST top-level declarations: 8004
- Module exports indexed: 2674
- Advisory unused-export candidates: 856
- Total mapped LOC: 522125
- Parse-error files: 0
- Production-runtime files: 401
- Production type-only files: 15
- Test/tool-only files: 336
- Source-contract-only files: 5
- Dead files (dead-island + orphan): 85
- Dead islands: 73
- Runtime cycles/SCCs (>1 file): 0
- Unresolved imports: 2 (static=0, dynamic=2)
- Probable/fuzzy resolutions: 0 (never hard liveness proof)
- Case-mismatch fallback resolutions: 0
- Absolute runtime imports (portability risks): 0
- Dead classification trusted: true
- History snapshot: 22
- Root hash: `4e0409d9185edda3d1899fe734d6ee762a862dfa41000d4ddd4a7f64d98d4c79`

## Production Roots

- `server.ts`
- `index.html`
- `src/main.tsx`

## Query Recipes

- `npm run index:app:file -- src/services/foo.ts` — layer, symbols, deps, reverse deps, reachability proof and history.
- `npm run index:app:folder -- src/services` — recursive folder map and status counts.
- `npm run index:app:dead` — dead islands; imported-by-dead does **not** count as live.
- `npm run index:app:history -- src/services/foo.ts` — snapshot/path history from SQLite.
- `npm run index:app:why -- src/services/foo.ts` — shortest liveness proof, roots, dead-island/cycle evidence and dependency context.
- `npm run index:app:symbol -- "pattern"` — symbol lookup through the map.

## Largest Dead Islands

| Island | Files | Example |
|---|---:|---|
| dead-001 | 12 | `scripts/research/lib/deflatedSharpe.ts` |
| dead-002 | 2 | `scripts/capture/buildContactSheet.mts` |
| dead-003 | 1 | `scripts/_audit_freshmount.mts` |
| dead-004 | 1 | `scripts/_audit_theme_watchlist.mts` |
| dead-005 | 1 | `scripts/_audit_walkthrough.mts` |
| dead-006 | 1 | `scripts/_audit_watchlist2.mts` |
| dead-007 | 1 | `scripts/capture/capture-all-pages.mts` |
| dead-008 | 1 | `scripts/capture/captureAllPages.mts` |
| dead-009 | 1 | `scripts/capture/captureAllPagesV2.mts` |
| dead-010 | 1 | `scripts/capture/captureEmptyStates.mts` |
| dead-011 | 1 | `scripts/capture/captureLive3000.mts` |
| dead-012 | 1 | `scripts/capture/captureSecondaryPages.mts` |
| dead-013 | 1 | `scripts/capture/captureV3PhaseGate.mts` |
| dead-014 | 1 | `scripts/capture/captureWorkspaceScreens.mts` |
| dead-015 | 1 | `scripts/capture/claudeCapture.mts` |
| dead-016 | 1 | `scripts/capture/claudeCaptureDrawer.mts` |
| dead-017 | 1 | `scripts/capture/claudeMetrics.mts` |
| dead-018 | 1 | `scripts/capture/diagScreenshot.mts` |
| dead-019 | 1 | `scripts/capture/diagScreenshotDev.mts` |
| dead-020 | 1 | `scripts/capture/recaptureIntel.mts` |
| dead-021 | 1 | `scripts/capture/verifySplitDockHeaded.mts` |
| dead-022 | 1 | `scripts/capture/verifyStep1Chrome.mts` |
| dead-023 | 1 | `scripts/gates/checkCssArbitraryColors.mjs` |
| dead-024 | 1 | `scripts/gates/runAutopilotLifecycleRuntime.mjs` |
| dead-025 | 1 | `scripts/qa/_qa_cdp_matched.mts` |
| dead-026 | 1 | `scripts/qa/_qa_metric_audit.mts` |
| dead-027 | 1 | `scripts/qa/_qa_range_probe.mts` |
| dead-028 | 1 | `scripts/qa/compareStrategyFillBias.mjs` |
| dead-029 | 1 | `scripts/qa/fieldProbeProxy.mjs` |
| dead-030 | 1 | `scripts/qa/runOfflinePixelGate.mjs` |

## Runtime Dependency Cycles

| Cycle | Files |
|---|---:|

## Layers

| Layer | Files |
|---|---:|
| `application/service` | 237 |
| `application/source` | 89 |
| `backend/entrypoint` | 1 |
| `contract/openapi` | 1 |
| `documentation` | 291 |
| `frontend/component` | 60 |
| `frontend/entrypoint` | 1 |
| `frontend/hook` | 1 |
| `frontend/html-entrypoint` | 1 |
| `frontend/page` | 78 |
| `frontend/public-asset` | 326 |
| `integration/exchange` | 9 |
| `integration/provider` | 11 |
| `repository/automation` | 7 |
| `repository/cartography` | 4 |
| `repository/other` | 23 |
| `repository/root` | 9 |
| `research/agent` | 16 |
| `research/study` | 18 |
| `tooling/script` | 98 |
| `vendor` | 2 |
| `verification/qa` | 130 |
| `verification/test` | 166 |

See `APP_INDEX/TREE.md` for the complete folder/file hierarchy, `APP_INDEX/APP_GRAPH.dot` for the file graph, `APP_INDEX/LAYER_GRAPH.mmd` for the layer graph, and `APP_INDEX/APP_MAP.json` for machine-readable detail.

