# Task Completion — Verify Pipeline

Definition of done = canonical aggregate gate `npm run verify`, in order:
lint → check:test-inventory → test:unit → build → test:runtime → check:source-contracts → test:browser → test:visual → docs:visual → docs:check → release:gate.

Release = `npm run release:package` = `verify` → createReleaseArchive.mts → release:verify-artifacts (checkReleaseArtifacts.mjs).

## Gate structure
Parent gates fan out to `qa:*` children (scripts/qa/*.mjs|.mts) and `check:*` gates (scripts/gates/*.mjs). Notable parents: test:runtime, check:source-contracts, verify:visual, qa:liquidity-hunter, qa:multi-agent-multi-trading.

## Failure workflow
Identify the exact failing child from real output → inspect only directly implicated files → make the smallest justified fix → rerun failing child, then rerun the parent.

Before treating a failure as new, check the known recurring causes and how to interpret them — vendored dependency pins that regress on any `npm install`, package-lock `libc` blocks, docs-gate link mechanics, `check:root-contract` masking the two gates behind it, the flaky autopilot cycle-attribution assertion, the duplicated QA script, release-artifact identity, git hygiene: `mem:gate_hazards`.

## Consolidated revalidation (only if source/config/build inputs changed)
test:unit → build → check:version-identity → check:build-identity.

## verify:fast — dev loop only, never release evidence
`npm run verify:fast` = `node scripts/gates/verifyFast.mjs`. Helpers: `computeChangedScope.mjs` (changed files → changed scope) and `gateDependencyMap.mjs` (per-gate declared input subtrees + an `expensive` flag) — the gate dependency map is the whole basis of skipping.

Skip model: only gates flagged `expensive` are ever skippable; every cheap contract-string / allow-list gate runs on every invocation. Four overrides force a full run: no trusted baseline recorded, gate in `ALWAYS_RUN` (check:test-inventory, check:root-contract, check:api-contract, check:build-identity, release:gate), gate absent from the map (reported UNMAPPED), stale build identity. Non-executed gates print SKIPPED, never PASS. The runner parses the real `package.json` `verify` string at runtime, so a newly added unmapped gate degrades it to a no-skip run instead of being silently ignored.

Rules: it is NOT a canonical gate — never substitute it for, or cite it as evidence for, `verify` / `release:package`. Use it for doc/config iteration. When adding a gate to `verify`, update `gateDependencyMap.mjs` in the same change: over-inclusion is safe, under-inclusion is a correctness bug. `src/services/**` is the widest declared input subtree, so any change there fans out to the whole chain and saves nothing — do not promise a speedup for src changes. Why this is exempt from the no-orchestration-helpers prohibition: `mem:execution_environment`.

Post-build noise: `public/build-info.json` and `Doc/FUNCTION_INDEX.{json,md}` are dirty after every build by construction — never read them as real source changes.

## Strategy promotion is NOT part of this chain
The sealed-holdout profitability study and strategy promotion criteria are standalone research — no `profitability` / `research:` entry exists in the `verify` chain, so they never gate a release and must not be wired into it. Criteria and gate flags: `mem:strategy/promotion_gate`.

## Hard rules
No fake data / weakened fallbacks / lowered gates to pass. Source-only checks may NOT claim runtime/browser/visual/accessibility PASS. Do not rerun already-green suites without a real input change.
