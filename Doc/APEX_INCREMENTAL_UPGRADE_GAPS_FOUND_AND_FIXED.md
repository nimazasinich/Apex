# APEX Incremental Trading Logic Upgrade — Gaps Found and Fixed

This note supplements `APEX_INCREMENTAL_UPGRADE_IMPLEMENTATION_REPORT_V3.md`. That
report stated a full `npm install`, Vite build, and Vitest run could not be
completed in its environment. That verification has now been completed, and it
surfaced two real defects, both fixed below.

## Verification now completed

- `npm install` — clean, 317 packages, no registry issues.
- `npx tsc --noEmit` — 0 errors (previously 1).
- `npx vitest run` — 18/18 test files, 62/62 tests passing (previously 17/18, 61/62).
- `npm run build` — Vite build and esbuild server bundle both succeed.

## Gap 1 — test-only type error (low severity)

`src/tests/decisionSnapshotLogger.test.ts`'s `mockSnapshot()` helper built a
`DecisionSnapshot` object but omitted four required fields (`calibratedProbability`,
`expectedNetEdge`, `modelUncertainty`, `featureCompletenessPct`, `mode`), relying on
a spread of `Partial<DecisionSnapshot>` overrides to (not actually) fill them in.
This didn't affect production code, only `tsc --noEmit` cleanliness.

**Fix:** added explicit defaults for all previously-missing required fields in the
mock's base object.

## Gap 2 — adaptive-threshold promotion guardrail could never pass (real defect)

This is the more important one: it sits in the newly-added
`src/services/adaptiveThresholdGovernance.ts`, in the safety guardrail meant to
block proposals with a disproportionately large field change
(`maxRelativeFieldChange`).

The guardrail computed relative change as `|after - before| / before` for every
changed field, including `scoreWeights.*`. Those weights are fractions of a
~1.0 normalized budget, so a field starting small (e.g. `liquidity: 0.05`) can
swing well past 100% "relative to itself" during ordinary renormalization, even
though the actual effect on the overall score is minor (e.g. `0.05 → 0.105`, a
~5% shift of the total weighting budget).

Left as-is, this meant **any** adaptive proposal that touched score weights —
which is most of them, since weight renormalization runs on every proposal —
would trip `field_change_exceeds_limit:scoreWeights.*` and be permanently
blocked from operator approval. The manual-approval adaptive-threshold feature
described in the implementation report would not have been usable in practice.
This was caught by the project's own `tests/adaptiveThresholdGovernance.test.ts`,
which was failing before this fix.

**Fix:** `scoreWeights.*` fields are now judged by absolute delta against the
shared ~1.0 weighting budget instead of relative-to-their-own-base. Non-weight
threshold fields (`minConfidence`, `qStructThreshold`, etc.) are unchanged and
still use relative-to-base comparison, which is the correct semantics for them.

## Not changed

No other files were modified. Scope was limited to the two defects above,
both confirmed by actually running the project's own verification tooling
rather than by inspection alone.
