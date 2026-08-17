# Repository State After Release Freeze

**Recorded:** 2026-07-30 (pre-normalization baseline)  
**Purpose:** Snapshot before repository-completion housekeeping. The accepted UI release tag is unchanged.

## Git identity

| Field | Value |
|-------|-------|
| **Current branch** | `master` |
| **HEAD commit** | `c2fd1fa34f5169cac188d345a6365e260bee3ff6` |
| **HEAD message** | `docs(release): record desktop unification freeze commit and tag` |
| **Accepted UI release commit** | `9d13e5845ccb2783b91e0cd6553612a92a94cf25` |
| **Accepted UI release tag** | `desktop-visual-unification-v3.0.0` (annotated; **must not be moved**) |
| **Tag annotation** | Desktop visual unification accepted — fixtures, capture hygiene, gates PASS. Evidence: `_qa/v3_final_acceptance_2026-07-30_17-18-27/` |

## Integrity assessment

The working tree appeared clean on the **41 tracked paths** at release freeze, but **372 additional non-ignored paths** remained untracked, including essential application entry points (`server.ts`, `src/main.tsx`), the majority of `src/` components/hooks/services, most `scripts/`, tests, configuration, and documentation. A clean tracked working tree is **not** equivalent to a reproducible repository while required source remains untracked.

## Tracked files (41)

```
.gitignore
Doc/DESKTOP_VISUAL_UNIFICATION_FINAL_REPORT.md
package.json
scripts/accessibilitySmoke.spec.mts
scripts/buildContactSheet.mts
scripts/captureEmptyStates.mts
scripts/captureV3FinalAcceptance.mts
scripts/checkCssArbitraryColors.mjs
scripts/lib/captureServer.mts
scripts/recaptureIntel.mts
scripts/verifySplitDockHeaded.mts
scripts/verifyStep1Chrome.mts
scripts/workspaceGeometry.spec.mts
src/App.tsx
src/components/BacktestingPanel.tsx
src/components/CommandCenterPage.tsx
src/components/DockToolContent.tsx
src/components/IntelPage.tsx
src/components/IntelligencePanel.tsx
src/components/MarketsPage.tsx
src/components/MemoryPage.tsx
src/components/SettingsPanel.tsx
src/components/SignalsPage.tsx
src/components/TrackingPage.tsx
src/components/TradingDeskPage.tsx
src/components/WatchlistPanel.tsx
src/components/ui.tsx
src/components/workspace/CompactPositionsPanel.tsx
src/components/workspace/CompactTicketPanel.tsx
src/components/workspace/MarketsDataTable.tsx
src/components/workspace/MemoryArchiveTable.tsx
src/components/workspace/MemoryDecisionTable.tsx
src/components/workspace/SignalQueueTable.tsx
src/components/workspace/TrackingLifecycleTable.tsx
src/components/workspace/WorkspacePageTemplate.tsx
src/components/workspace/WorkspaceTableToolbar.tsx
src/index.css
src/qa/qaVisualMode.ts
src/qa/visualFixtures.ts
src/utils/signalRisk.ts
src/utils/trackingDisplay.ts
```

## Untracked non-ignored summary

| Category | Approx. count | Examples |
|----------|--------------:|----------|
| A — Application source | ~200 | `server.ts`, `src/main.tsx`, `src/hooks/`, `src/services/`, remaining `src/components/` |
| B — Configuration | ~10 | `index.html`, `tsconfig.json`, `vite.config.ts`, `package-lock.json`, `public/`, `.env.example` |
| C — Scripts | ~35 | Most `scripts/*.mts`, `scripts/subfinder/`, `scripts/qa/cleanupQaArtifacts.mts` |
| D — Tests | ~50 | `src/tests/*.test.ts`, `tests/` |
| E — Documentation | ~60 | `Doc/**`, root `APEX_*.md`, `README.md`, `Refrence.md` |
| F–K — Generated/local | remainder | `.tmp-*`, `Print-Screen/`, `qa/`, editor dirs, archives |

Full per-file audit: [`UNTRACKED_FILES_AUDIT.md`](UNTRACKED_FILES_AUDIT.md)

## Modified tracked files at snapshot (pre-baseline commit)

| Path | Nature |
|------|--------|
| `.gitignore` | Added `tmp/`, trace/webm ignores (housekeeping) |
| `package.json` | Added `qa:cleanup` scripts (pending commit 3) |
| `scripts/accessibilitySmoke.spec.mts` | QA cleanup hook (pending commit 3) |
| `scripts/captureEmptyStates.mts` | QA cleanup hook (pending commit 3) |
| `scripts/captureV3FinalAcceptance.mts` | Contact-sheet spawn + cleanup (pending commit 3) |
| `scripts/verifySplitDockHeaded.mts` | QA cleanup hook (pending commit 3) |

## Ignored paths (via `.gitignore`)

```
node_modules/
build/
dist/
coverage/
.DS_Store
*.log
.env*  (!.env.example allowed when tracked)
.telegram.config.json
.supplemental.config.json
.external-api-sources.config.json
_qa/
temp/
tmp/
screenshots/
logs/
playwright-report/
test-results/
**/trace.zip
**/*.webm
.tmp-testnet-store-*.json
*.rar
```

Additional local-only paths present on disk but not yet in `.gitignore` at snapshot: `.tmp-validation-store-*.json`, `Print-Screen/`, `qa/`, `Archived/`, `.cursor/`, `.vscode/`, `.kiro/`, `.agent-index/`, root screenshots/logs.

## `_qa` on disk (ignored)

Total size at snapshot: **~240.9 MB** across 48 top-level folders. Accepted evidence referenced by final report:

- `_qa/v3_final_acceptance_2026-07-30_17-18-27/` (accepted final run)
- `_qa/2026-07-30_17-22-00/` (latest contact-sheet run)
- `_qa/split_dock_headed_2026-07-30_17-16-38/`
- `_qa/a11y_smoke_2026-07-30_17-18-02/`
- `_qa/empty_states_2026-07-30_17-12-48/`

## Next steps (this normalization pass)

1. Track complete reproducible baseline → tag `repository-baseline-v3.0.0`
2. Organize documentation and scripts under `Doc/` and `scripts/` subfolders
3. Add QA retention + cleanup; prune superseded `_qa` artifacts
4. Document root contract and cleanup results

**Policy:** Do not move or recreate `desktop-visual-unification-v3.0.0`. Do not modify accepted UI implementation.
