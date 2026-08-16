# QA Evidence Retention Policy

**Scope:** Generated artifacts under `_qa/` (gitignored). This policy and `scripts/qa/cleanupQaArtifacts.mts` are tracked source. It governs evidence retention; it is not itself proof that a browser, visual, accessibility, or release gate passed.

## Principles

1. **Keep the current accepted final evidence** — paths referenced by `Doc/reports/final/DESKTOP_VISUAL_UNIFICATION_FINAL_REPORT.md` and successor final reports.
2. **Never remove the previous accepted evidence** until a newer run of the same category completes successfully.
3. **Keep no more than the latest 3 ordinary diagnostic runs** per category (`phase_gate`, `step1`, `phase0`, uncategorized diagnostic).
4. **Remove non-protected diagnostic runs older than 7 days** when eligible.
5. **Warn when `_qa` exceeds 1 GB**; log the largest folders and protected set.
6. **Offer cleanup when `_qa` exceeds 2 GB** — but never delete protected evidence solely to meet a size limit.
7. **Integrate cleanup only after a successful replacement capture** — capture scripts call `runQaCleanup()` on success; failed captures preserve diagnostics and skip destructive cleanup.

## Protected categories

The newest successful run in each category is protected:

| Category | Folder prefix | Success signal |
|---|---|---|
| Final acceptance | `v3_final_acceptance_*` | `reports/final_acceptance_report.json` — zero application errors and captures present |
| Contact sheet | `YYYY-MM-DD_HH-MM-SS` | `visual-unification/contact-sheet-manifest.json` |
| Split dock | `split_dock_headed_*` | `reports/split_dock_report.json` — no failures |
| Accessibility | `a11y_smoke_*` | `a11y_report.json` — no failures |
| Empty states | `empty_states_*` | `reports/empty_states_report.json` — captures accepted and no application errors |

## Explicit document references

The cleanup implementation parses `_qa/...` paths from:

- `Doc/reports/final/DESKTOP_VISUAL_UNIFICATION_FINAL_REPORT.md`
- `Doc/repository/ROOT_CLEANUP_REPORT.md`

Any top-level evidence folder referenced there is protected regardless of age.

## Commands

| Command | Action |
|---|---|
| `npm run qa:cleanup:dry` | List eligible deletion candidates without changing files |
| `npm run qa:cleanup` | Delete eligible superseded artifacts inside `_qa/` only |

Both commands are wired to the tracked `scripts/qa/cleanupQaArtifacts.mts` implementation. The implementation refuses targets outside the project `_qa/` directory.

## Failure behavior

When a capture or gate run fails:

- preserve its diagnostic folder for investigation;
- preserve the previous accepted run for that category;
- do not auto-run destructive cleanup from the failed script.

## Size thresholds

| Variable | Default | Behavior |
|---|---:|---|
| `QA_SIZE_WARN_BYTES` | 1 GB | Print a size report and protected set |
| `QA_SIZE_CLEANUP_BYTES` | 2 GB | Warn if cleanup cannot reduce the directory without touching protected evidence |

## Adding new evidence

1. Run the appropriate capture script.
2. Verify the run completed successfully and inspect its report.
3. Update the applicable final report when the run becomes the accepted baseline.
4. Let successful capture scripts run retention cleanup, or preview manually with `npm run qa:cleanup:dry`.
5. Never copy transient `_qa/` output into tracked `QA/` and present it as current evidence without recording the exact command, environment, and result identity.
