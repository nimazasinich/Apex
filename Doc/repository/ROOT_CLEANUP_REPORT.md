# Root Cleanup Report

**Date:** 2026-07-30  
**Branch:** `master`  
**Final HEAD:** `e53c15f99743b9a3f640a645853fd9eca79f9026`

## 1. Accepted UI release (unchanged)

| Field | Value |
|-------|-------|
| Tag | `desktop-visual-unification-v3.0.0` |
| Commit | `9d13e5845ccb2783b91e0cd6553612a92a94cf25` |
| Status | **Not moved or recreated** |

## 2. Complete-repository baseline

| Field | Value |
|-------|-------|
| Tag | `repository-baseline-v3.0.0` |
| Commit | `b8faac7a0c98775d918b79c2ab54aed7b5f5f2fb` |
| Message | `chore(repo): track complete reproducible project baseline` |

## 3. Untracked-files audit

Pre-baseline: **372** untracked non-ignored paths; **41** tracked paths.  
Full audit: [`UNTRACKED_FILES_AUDIT.md`](UNTRACKED_FILES_AUDIT.md)  
State snapshot: [`REPOSITORY_STATE_AFTER_RELEASE_FREEZE.md`](REPOSITORY_STATE_AFTER_RELEASE_FREEZE.md)

## 4. Files newly tracked (baseline commit)

288 files added including:

- `server.ts`, `src/main.tsx`, full `src/` tree (components, hooks, services, tests)
- `scripts/` (capture, QA, gates, utilities, lib)
- `tests/`, `public/`, `index.html`, `tsconfig.json`, `vite.config.ts`, `package-lock.json`
- `README.md`, `Refrence.md` → later moved to `Doc/architecture/`
- `Doc/**` documentation and automation artifacts
- `.env.example` (template only — no secrets)

## 5. Files moved (organization commit `b52c4bb`)

### Documentation

| From | To |
|------|-----|
| Root `APEX_*.md` (3 files) | `Doc/plans/archive/` |
| `Refrence.md` | `Doc/architecture/Refrence.md` |
| `Doc/DESKTOP_VISUAL_UNIFICATION_FINAL_REPORT.md` | `Doc/reports/final/` |
| Active plans (5) | `Doc/plans/active/` |
| Superseded plans (2) | `Doc/plans/archive/` |
| `Doc/BEYOND_PROPOSAL_SHORT_INTELLIGENCE.md` | `Doc/reports/historical/` |
| Architecture docs (2 + api txt) | `Doc/architecture/` |

### Scripts

| Category | New location |
|----------|--------------|
| Capture / verify / contact sheet | `scripts/capture/` |
| Geometry / a11y specs | `scripts/qa/` |
| CSS gate | `scripts/gates/` |
| Indexers, stress, ML, dev runner | `scripts/utilities/` |
| Shared helpers | `scripts/lib/` (unchanged) |

## 6. Files removed

### Git tracking

- `.postman.json` — removed from index (local editor config; added to `.gitignore`)

### `_qa/` generated artifacts (24 folders total across dry-run + live cleanup)

Removed after dry-run validation:

- `2026-07-30_17-02-01`, `2026-07-30_17-05-28` (superseded contact sheets)
- `a11y_smoke_2026-07-30_16-37-56`, `a11y_smoke_2026-07-30_17-00-28`, `a11y_smoke_2026-07-30_17-18-02`
- `analysis-pages-ocean-v1` … `v7`, `analysis-pages-refresh`, `analysis-pages-refresh-final`
- `cc-visual`, `overview-layout`, `visual-layout`
- `phase0_baseline_20260730_165219`
- `split_dock_headed_2026-07-30_16-15-55`, `_16-46-07`, `_17-00-23`
- `v3_final_acceptance_2026-07-30_15-27-49`, `_15-46-23`, `_16-55-34`

## 7. Files retained (on disk, ignored)

| Path | Reason |
|------|--------|
| `_qa/` remaining folders | Accepted + protected evidence |
| `.tmp-*-store-*.json` | Runtime testnet/validation stores |
| `Print-Screen/`, `/qa/`, `Archived/` | Local screenshots/archives |
| `build_log.txt`, `cc-current-1672x941.png` | Ad-hoc local artifacts |
| `.env`, `*.config.json` | Secrets / local config |
| `node_modules/`, `dist/` | Dependencies / build output |

## 8. `_qa` size before and after

| Metric | Value |
|--------|-------|
| Before cleanup | **240.90 MB** (252,600,257 bytes) |
| After cleanup | **~127.10 MB** (133,274,317 bytes after subsequent a11y run) |
| Reclaimed | **~113.8 MB** |

Dry-run summary: [`Doc/qa/cleanup-dry-run-summary.txt`](../qa/cleanup-dry-run-summary.txt)

## 9. Protected QA evidence

Referenced by final report and retention policy:

- `_qa/v3_final_acceptance_2026-07-30_17-18-27/` — **accepted final run**
- `_qa/2026-07-30_17-22-00/` — latest contact-sheet run
- `_qa/split_dock_headed_2026-07-30_17-16-38/`
- `_qa/a11y_smoke_*` (latest successful)
- `_qa/empty_states_2026-07-30_17-12-48/`

Additional protected diagnostic retains (latest 3 per category): phase gates, step1 verifies, phase0 runs, `diag`, `ui_audit`, `ux_capture`.

## 10. Final root tree (tracked layout)

```
├── README.md
├── package.json / package-lock.json
├── index.html / server.ts
├── tsconfig.json / vite.config.ts
├── .gitignore / .env.example
├── src/
├── public/
├── scripts/{capture,qa,gates,lib,utilities,migrations}/
├── tests/
└── Doc/{architecture,plans,reports,repository,qa,automation,...}/
```

## 11. Validation results

| Check | Result |
|-------|--------|
| `npm run lint` | PASS |
| `npm test` | PASS (343 tests) |
| `npm run build` | PASS |
| `npm run gate:css-colors` | PASS |
| `npm run test:geometry` | PASS |
| `npm run test:a11y` | PASS |
| `npm run qa:cleanup:dry` | PASS (23 candidates identified) |

All `package.json` scripts resolve to tracked files under `scripts/`.

## 12. Cleanup commits

| Commit | Message |
|--------|---------|
| `b8faac7` | `chore(repo): track complete reproducible project baseline` |
| `b52c4bb` | `chore(repo): organize documentation and scripts` |
| `e53c15f` | `chore(qa): add retention and remove obsolete QA artifacts` |
| *(pending)* | `docs(repo): document root contract and cleanup results` |

## 13. Final Git status target

- No modified tracked files
- No staged files
- No legitimate application source untracked
- Only ignored generated/local artifacts outside Git

See also: [`ROOT_CONTRACT.md`](ROOT_CONTRACT.md)
