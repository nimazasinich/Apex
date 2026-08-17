# APEX V31 Lightweight Cleanup Report — 1.0.25

**Baseline:** `1.0.24 Reference UI + Project Hub`  
**Result:** `1.0.25 Lightweight Source`

## Size reduction

| Metric | Before | After cleanup | Change |
|---|---:|---:|---:|
| Files | 505 | 313 | −193 |
| Uncompressed source size | 39.48 MiB | 7.09 MiB | −32.38 MiB (82.0%) |

`APEXProjectHub.exe` was retained intentionally. At 3.75 MiB, it is now the largest single file and represents roughly half of the lightweight project size.

## Removed categories

| Category | Files | Removed size |
|---|---:|---:|
| large visual/reference evidence | 40 | 25.93 MiB |
| generated automation/audit output | 46 | 3.69 MiB |
| regenerated index/report output | 7 | 2.01 MiB |
| duplicate or superseded project file | 28 | 0.41 MiB |
| historical/archive documentation | 32 | 0.22 MiB |
| generated QA evidence | 32 | 0.10 MiB |
| legacy/unreferenced test tooling | 8 | 0.02 MiB |

## Legacy test removals

- `scripts/qa/verifyV19Contract.mjs`
- `scripts/qa/verifyV20ReferenceContract.mjs`
- `tests/v3-contract-static.mjs`
- `tests/v3-visual-layout.mjs`
- `tests/visual-layout.mjs`
- temporary `_qa_*` diagnostic scripts under `scripts/qa/`

These files were not part of the current Vitest suite or the active V31 verification chain. The current Backtesting, Strategy Library, Strategy Engine, Strategy Integration, Consolidation and Reference UI checks remain.

## Large/generated material removed

- supplied UI reference PNGs and V20 parity screenshots;
- generated QA screenshots, logs, fixtures and JSON evidence;
- load-matrix datasets, automation reports and provider-audit snapshots;
- release-history images and archived UI plans;
- `.agent-index/`, generated function/documentation indexes and visual HTML documentation;
- duplicate root strategy/design specifications.

## Prevention of package regrowth

- `createReleaseArchive.mts` now filters historical/generated documentation and all documentation image files;
- `npm run clean:artifacts` removes regenerated local QA and indexing output;
- `npm run release:gate:source` verifies source-only deliveries without requiring a prebuilt `dist/`;
- generated indexes and visual documentation are ignored by Git.

## Verification performed

- JavaScript syntax check: passed;
- TypeScript/TSX parse-only check: passed for 213 files;
- package script target check: passed;
- Backtesting workspace QA: 21/21 passed;
- Strategy Library QA: passed;
- Strategy engine smoke: passed;
- Strategy Integration QA: passed;
- Consolidation QA: 15/15 passed;
- Reference UI QA: 15/15 passed after converting the old “attachments included” assertion into a lightweight “attachments excluded” assertion;
- source-only secret/release scan: passed.

Full semantic TypeScript checking, Vitest and production build still require `npm ci` on a machine with registry access.

## Full deletion list

See [`APEX_V31_LIGHTWEIGHT_CLEANUP_1.0.25.json`](APEX_V31_LIGHTWEIGHT_CLEANUP_1.0.25.json).
