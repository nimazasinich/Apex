# APEX Unified Terminal — Independent Audit

**Date:** 2026-08-08 · **Version audited:** 1.0.56-r2-merged · **Method:** direct code reading, no reliance on existing reports

This audit deliberately ignored the ~30 `APEX_*_REPORT.md` files at the repo root and the `QA/*.json` results, because the point was to establish whether their claims hold. Where a suspicion turned out to be unfounded, that is recorded too — three candidate findings were ruled out on inspection.

---

## Current State

Single-package React 19 + TypeScript + Vite frontend with a Node/Express backend in a single `server.ts`. Roughly 65,600 lines across 362 files in `src/`, plus 3,572 lines in `server.ts` and 16,075 lines across 122 files in `scripts/`. Market data flows Binance USDⓈ-M Futures → KuCoin Futures → Hugging Face Space fallback.

The codebase was assembled through many successive "safe merge" passes (v1.0.37 → v1.0.56), and the dominant structural problems are consequences of that history rather than of any single bad decision.

---

## What is actually sound

These were verified by reading the code, not inferred from documentation.

**No fabricated market data.** All nine `Math.random()` occurrences in non-test `src/` are legitimate: diagnostic IDs, feedback IDs, alert IDs, and retry jitter (`proxyFetch.ts:171`, `providerRouter.ts:173`). No synthetic prices, candles, or indicator values in production paths. For a trading terminal this is the single most important thing to get right, and it is right.

**Autonomous execution is genuinely disabled.** `server.ts:762` declares `autonomousExecutionAvailable: false as const` — a compile-time constant, not an environment flag, so it cannot be flipped by configuration or a stray `.env` value.

**Live order submission is properly gated.** `connectedExchange.ts:527` and `:611` both `throw new Error('execution_not_armed')`, and arming defaults closed via `executionArmed: input.enableTrading === true` (`connectedExchange.ts:187`). Unset means false.

**Risk telemetry is fail-honest.** `liveRiskTelemetry.ts:84` returns `null` when any component risk row is missing rather than substituting `0`. A missing value stays missing instead of silently becoming a safe-looking number — this is the correct and harder choice.

**A real test suite exists.** 76 files, 5,139 lines, 277 test cases. `tests/riskGovernor.test.ts` imports the actual `evaluateRiskGovernor` and `buildTradePlan` and asserts on real return values. `tradePlan`, `risk/sizing`, and `serverSecurity` have genuine coverage.

**Data quality tagging exists.** `VALID | MISSING | STALE | ESTIMATED` is defined at `src/types.ts:169-173` and referenced across 40 files.

### Ruled out on inspection

- **Submit route missing its arm check.** `server.ts:647` (cancel) checks `executionArmed` inline while `server.ts:619` (submit) does not, which looks like an asymmetric hole. It is not: the guard sits in the service layer for the submit path. Reporting this from the route alone would have been a false alarm.
- **`?? 0` price fallback in an order path.** `AccountViews.tsx:707` computes `selectedTicker?.lastPrice || draft.price || 0`, but line 708 immediately guards with `if (!maxNotional || !price) return;`. No division by zero, no zero-priced order.
- **Secrets leaking to the client.** No `apiSecret` / `passphrase` / `apiKey` reaches any `res.json` or `res.send` in `server.ts`.

---

## Issues Found

### Critical

**1. The project's own verification gate is currently failing.**

```
src/services/liveRiskTelemetry.ts(86,39): error TS18047: 'sum' is possibly 'null'.
```

`npm run verify` begins with `npm run lint`, so this one error blocks the entire 11-stage chain — including every safety contract check downstream. The error is *runtime-benign*: the `riskRows.some((value) => value == null)` guard on line 84 means the `?? 0` on line 86 is unreachable, so risk math is not wrong. But the gate cannot pass in this state, which means nothing downstream of it is being enforced right now.

Fix is a type narrowing, not a logic change:

```ts
const totalOpenRiskUsd = riskRows.some((value) => value == null)
  ? null
  : (riskRows as number[]).reduce((sum, value) => sum + value, 0);
```

### High

**2. Roughly 80% of the QA suite verifies text, not behavior.**

Of 60 scripts in `scripts/qa/`, 49 use `readFileSync` and 42 assert with `.includes(...)` against source read as a string. `verifyMaximalMergeSafety.mjs` — the top-level safety gate — is the clearest case:

```js
check('drawdown remains fail-honest unless explicitly reported',
  liveRiskTelemetry.includes('Only an exchange/account supplied drawdown measure is accepted'))
```

That asserts a *comment* is present. `verifyLiquidityHunterFoundation.mjs` checks that 46-odd file paths exist and contain expected substrings.

This fails in both directions. Gut a function while leaving its comment and the gate passes. Rename a variable with behavior fully intact and the gate fails. The suite measures whether the source still *looks* like it did when the check was written, which is a change-detector, not a test. Its practical effect is to make refactoring expensive while providing no real safety — the opposite of what a gate is for.

The 277 real vitest cases are where actual confidence comes from. The ~16,000 lines in `scripts/` are where the effort went.

**3. Two backtest cost models that disagree.**

`backtesting.ts:760-763`:

```ts
const feePct = 0.12;
const slippagePct = spreadPct;
const transactionCostPct = feePct + spreadPct + slippagePct + fundingPct;
```

`apexNextMarketRoutes.ts:1713`:

```ts
const roundTripCostPct = commissionPctPerSide * 2 + slippagePctPerSide * 2 + fundingPctEstimate;
```

The first hardcodes a 0.12% fee and models slippage as a spread proxy (so spread is effectively counted twice — defensible as "cross the spread on entry and exit," but implicit and undocumented). The second takes fees and slippage as validated parameters defaulting to 0.05 (`apiValidation.ts:202`). The same strategy will produce different P&L depending on which path evaluated it, and there is no single source of truth for what a trade costs.

**4. Backtests model neither latency nor partial fills.**

Zero occurrences of `latency`, `partialFill`, or `partial_fill` in `backtesting.ts`. Fees, spread, and funding are present. Stops are evaluated intrabar against `bar.high`/`bar.low` (`backtesting.ts:749-754`), which resolves a stop and a target touched in the same bar by whichever is checked first rather than by actual sequence — this systematically favors whichever branch wins the tie. Combined with instant idealized fills, reported edge is optimistic by an unquantified margin.

**5. Two parallel HTTP API surfaces.**

`server.ts` registers 91 routes; `src/services/apexNextMarketRoutes.ts` registers a further 20 across 1,892 lines. Backtest cost logic lives in both (issue 3 is a symptom). Route ownership is not discoverable from structure, so the answer to "where is this endpoint handled" requires searching two files.

### Medium

**6. `server.ts` is a 3,572-line monolith** mixing routing, business logic, exchange calls, caching, and static/Vite serving. Every route change touches the same file, which makes review and blame-tracing harder than it needs to be.

**7. There is no linter.** `"lint": "tsc --noEmit"` is a typecheck. No ESLint, no formatter, no rules about empty catch blocks, floating promises, or unused code — categories that matter disproportionately in exchange-facing async code.

**8. The test gate measures quantity.** `scripts/gates/checkTestInventory.mjs` enforces `minimumFiles = 41` and `minimumTests = 161` (current: 76 / 277). A floor on counts can be satisfied by trivial assertions and says nothing about whether the risky paths are covered.

**9. ~30 root-level report files plus `QA/*.json` are stale clutter** describing merges from v1.0.37 onward. They read as current status but are historical, which is actively misleading to anyone new — and to any agent asked to work here.

---

## Implementation Plan

Ordered by value per unit of risk. Each step is independently shippable.

**Step 1 — unblock the gate.** Fix `liveRiskTelemetry.ts:86` with the narrowing above. Run `npm run lint` to confirm clean, then `npm run verify` to see what else was hidden behind the failure. *This must come first: until it passes, no other gate result is meaningful.* Rollback is a one-line revert.

**Step 2 — unify the cost model.** Extract one `transactionCost.ts` exporting a single `roundTripCostPct({ commissionPctPerSide, slippagePctPerSide, fundingPctEstimate, spreadPct })`. Have both `backtesting.ts` and `apexNextMarketRoutes.ts` call it. Characterize current behavior with a test *before* changing either path so any P&L shift is visible and intentional rather than discovered later. Expect reported performance to drop — that is the point.

**Step 3 — add latency and partial fills**, behind a flag, defaulting to the current cost-free behavior so historical comparisons stay valid. Promote once the two paths are reconciled. Also make the intrabar stop/target tie-break explicit and pessimistic (assume the stop hit first) rather than order-dependent.

**Step 4 — convert the highest-value text checks into behavioral tests.** Do not delete the 49 string-matchers wholesale; they encode intent worth keeping. For each, ask what behavior it was trying to protect and write a vitest case asserting that instead. Start with `verifyMaximalMergeSafety.mjs`, since it guards execution and risk. Retire each text check only once its behavioral replacement is green.

**Step 5 — add ESLint** with `@typescript-eslint`, `no-floating-promises`, and `no-empty` catch enabled. Introduce it reporting-only so it doesn't block, fix findings in batches, then promote to blocking.

**Step 6 — decompose `server.ts`** by concern (`routes/account`, `routes/execution`, `routes/market`), moving routes without editing their bodies so diffs stay reviewable. Merge the `apexNextMarketRoutes.ts` surface into the same structure. Do this last: it is the largest diff and the least urgent.

**Step 7 — archive the historical reports** into `Doc/history/` so the root reflects current state only.

---

## Validation

**Executed:**
- `npx tsc --noEmit` — 1 error, quoted verbatim above.
- Read `server.ts` routes 596-664, `liveRiskTelemetry.ts` 60-104, `AccountViews.tsx` 700-721, `backtesting.ts` 748-790, `verifyMaximalMergeSafety.mjs` 1-45, `verifyLiquidityHunterFoundation.mjs` 1-55, `checkTestInventory.mjs` 1-30, `tests/riskGovernor.test.ts` 1-25, `package.json` in full.
- Enumerated and categorized all 60 `scripts/qa/` files by assertion style; counted `readFileSync` / `.includes(` / `import` per file.
- Counted routes, test files, test cases, and LOC by directory.
- Grepped for `Math.random`, quality tags, silent numeric fallbacks, `executionArmed`, secret-to-client leaks, and backtest cost terms.

**Not executed:**
- **`npx vitest run` — the 277 tests were never run.** `node_modules` contains Windows-installed binaries and the audit shell is Linux, so `rollup` fails with `MODULE_NOT_FOUND` on its native module. Installing `@rollup/rollup-linux-x64-gnu` did not resolve it. **All statements about the test suite describe its source, not its results — some may be failing.** Run `npm run test:unit` locally to close this gap; it is the single most valuable follow-up.
- `npm run build`, `npm run verify`, and the ~60 QA scripts — not run (blocked by the same environment issue and by step 1).
- No browser or visual check. No screenshot taken, so nothing here describes rendered UI.
- Frontend state management, data-fetching patterns, `useEffect` cleanup, and accessibility were **not audited** — the six parallel audit agents failed on a model-routing error (`claude-sonnet-5` unavailable) and this pass was done manually, prioritizing execution safety, data integrity, and QA validity. Frontend architecture and a11y remain open.
- Indicator math was not reviewed for lookahead bias beyond the backtest stop logic. Worth a dedicated pass.
