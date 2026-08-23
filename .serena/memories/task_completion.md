# Task Completion — Verify Pipeline

Definition of done = canonical aggregate gate `npm run verify`, in order:
lint → check:test-inventory → test:unit → build → test:runtime → check:source-contracts → test:browser → test:visual → docs:visual → docs:check → release:gate.

Release = `npm run release:package` = `verify` → createReleaseArchive.mts → release:verify-artifacts (checkReleaseArtifacts.mjs).

## Gate structure
Parent gates fan out to `qa:*` children (scripts/qa/*.mjs|.mts) and `check:*` gates (scripts/gates/*.mjs). Notable parents: test:runtime, check:source-contracts, verify:visual, qa:liquidity-hunter, qa:multi-agent-multi-trading.

## Failure workflow
Identify the exact failing child from real output → inspect only directly implicated files → make the smallest justified fix → rerun failing child, then rerun the parent.

## Consolidated revalidation (only if source/config/build inputs changed)
test:unit → build → check:version-identity → check:build-identity.

## Hard rules
No fake data / weakened fallbacks / lowered gates to pass. Source-only checks may NOT claim runtime/browser/visual/accessibility PASS. Do not rerun already-green suites without a real input change.
