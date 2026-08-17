# Root Cleanup — 2026-08-10

This cleanup applies the repository's existing `Doc/repository/ROOT_CONTRACT.md` to the v1.0.56 Strategy Studio + Smart Autopilot merged source tree.

## Policy applied

- Runtime/build/config entry files remain at repository root.
- Current project documentation lives under `Doc/`.
- Superseded implementation reports/plans are archived under `Doc/reports/historical/` or `Doc/plans/archive/`.
- Generated QA logs, JSON evidence and screenshots live under `_qa/` rather than root.
- Exact duplicate root files are removed when a canonical copy already exists.
- Test fixtures needed by QA scripts live under `tests/fixtures/`.
- The visual documentation generator now writes to `Doc/generated/` so future runs do not repopulate the root.

## Cleanup groups

- Current handoff: `Doc/handoff/`
- Current/final implementation reports: `Doc/reports/final/`
- Historical root reports: `Doc/reports/historical/legacy-root-2026-08-09/`
- Archived plans/specs: `Doc/plans/archive/legacy-root-2026-08-09/`
- Backtesting visual reference: `Doc/references/backtesting/`
- Generated visual documentation: `Doc/generated/`
- Accepted QA evidence: `_qa/accepted/`
- Archived transient root QA/Codex/screenshots: `_qa/archive/root-cleanup-2026-08-10/`
- Strategy historical candle fixture: `tests/fixtures/strategy/historical-candles.json`
- Superseded delivery overlays: `_archive/legacy-deliverables-2026-08-09/`

## Functional safeguards

- `scripts/qa/compareStrategyFillBias.mjs` now points at the relocated historical candle fixture.
- `scripts/utilities/updateVisualProjectDocumentation.mjs` and `cleanGeneratedArtifacts.mjs` now use `Doc/generated/`.
- No source under `src/`, runtime server contracts, trading logic, Smart Autopilot logic, or multi-agent/multi-trading logic was moved.

See `ROOT_CLEANUP_2026-08-10.json` for the exact move/delete manifest.
