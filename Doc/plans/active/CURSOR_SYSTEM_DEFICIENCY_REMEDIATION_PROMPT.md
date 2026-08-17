# Cursor Prompt — APEX System Deficiency Remediation

Use this document as the implementation prompt for Cursor (or another coding
agent). It is based on the verified system audit from 2026-07-27.

## Context

Repository root:

```text
C:\project\APEX-Trading-Engine
```

The current application is a local React/Vite dashboard with an Express
backend. KuCoin Futures is the primary market-data provider; Binance Futures
provides optional sentiment data. The application must remain paper/manual
only. Do not enable live trading, submit orders, or weaken fail-closed behavior.

## Verified baseline

- `npm run lint` passes.
- `npm test` passes 28 files / 221 tests (includes Priority 1–4 hardening tests).
- `npm run build` passes.
- Operations smoke and documentation-link checks pass.
- `/api/health` currently reports KuCoin `LIVE` when the server is reachable.
- `/api/health` currently reports Binance sentiment `DEGRADED`; its direct
  checks may time out depending on network path.
- The proxy pool is currently empty (`poolSize: 0`).
- Hardening Priority 1 (shared market-data coordinator) is implemented.
- Hardening Priority 2 (server-boundary security) is implemented.
- Hardening Priority 3 (dependency/build hygiene) is implemented; audit is
  clean.
- Hardening Priority 4 (health/lifecycle observability) is implemented.
- Hardening Priority 5 (portable browser verification) is implemented.
  Start a new session only for regressions or the documented network-sensitive
  visual-layout follow-up.

## Objective

Harden the system without redesigning completed functionality. Fix the
deficiencies below incrementally, preserve honest `live`, `degraded`,
`unavailable`, and `not_configured` states, and keep the right sidebar disabled.

## Priority 1 — Consolidate market-data polling

Status: `COMPLETE` (2026-07-27)

Implemented via `src/services/marketDataCoordinator.ts` and wiring in
`src/services/marketData.ts`. Existing consumers
(`useMarketData`, `useSignalScanner`, `useWatchlistTracking`,
`LiveDataHealthPanel`, `MetricIntegral`, `App`) keep calling
`MarketDataService` / `KuCoinService`; overlapping requests now share TTL
entries and in-flight promises. Snapshot assembly is also coordinator-cached
(2s TTL). WebSocket candle reuse in `fetchFullMarketSnapshot` is preserved.
Diagnostics: `getMarketDataCoordinatorDiagnostics()` /
`MarketDataService.getCoordinatorDiagnostics()`.

Focused tests: `src/tests/marketDataCoordinator.test.ts`.

Historical note — the pre-fix implementation duplicated provider requests across:

- `src/services/marketData.ts`
- `src/hooks/useMarketData.ts`
- `src/hooks/useWatchlistTracking.ts`
- `src/hooks/useSignalScanner.ts`
- `src/components/LiveDataHealthPanel.tsx`
- `src/components/MetricIntegral.tsx`

`fetchFullMarketSnapshot()` can issue up to nine requests per ticker. Watchlist,
tracking, health, L2, and scanner loops then fetch overlapping data again.

Implement a shared, bounded market-data coordinator/cache:

1. Deduplicate identical requests by ticker, endpoint, and timeframe.
2. Reuse recent values within explicit TTLs.
3. Share in-flight promises so concurrent consumers do not fan out.
4. Preserve WebSocket candle reuse.
5. Keep scanner readiness fail-closed when required fields are missing.
6. Expose request counts, cache age, and stale/degraded state for diagnostics.
7. Do not silently convert unavailable data into valid market values.

Add tests for deduplication, TTL expiry, concurrent consumers, provider
timeouts, and partial snapshots.

## Priority 2 — Secure the server boundary

Status: `COMPLETE` (2026-07-27)

Implemented via `src/services/serverSecurity.ts`, `server.ts` middleware, and
`src/services/apiMutate.ts`. Mutating `/api` POST routes require allowlisted
Origin/Referer (+ `X-APEX-CSRF: 1` for browser origins) and, when configured,
`X-APEX-Operator-Token`. `/api/external-sources/test` blocks private/loopback
SSRF targets (DNS-resolved) unless listed in `APEX_SSRF_ALLOWLIST`.

Relevant code is in `server.ts`.

Historical requirements (kept for audit trail):

1. Replace wildcard CORS with an explicit local-origin allowlist. Make the
   allowed origins configurable for a deliberate deployment.
2. Add authentication or a local operator token for mutating and
   credential-bearing routes, including:
   - `/api/decision-memory/batch`
   - `/api/backtest/datasource/fetch`
   - `/api/kucoin/account-overview`
   - `/api/kucoin/bullet-public`
   - `/api/supplemental/config`
   - `/api/external-sources/config`
   - `/api/external-sources/test`
   - `/api/feedback`
   - `/api/telegram/config`
   - `/api/telegram/test`
   - `/api/telegram/send`
3. Add CSRF protection for browser-originated mutations.
4. Add request size and rate limits appropriate to each route.
5. Protect `/api/external-sources/test` against SSRF:
   - reject loopback, private, link-local, multicast, and metadata IP ranges;
   - validate redirects, DNS results, and resolved addresses;
   - allow an explicit operator-approved allowlist for private services.
6. Keep secrets server-side and never return secret values in responses.
7. Add `.supplemental.config.json` and
   `.external-api-sources.config.json` to `.gitignore`; document secure
   production secret storage.
8. Preserve the current localhost default, but allow a deliberate
   environment-configured host for controlled deployment.

The `.env` file contains an old comment referring to `APEX_CONNECT_FAMILY`;
do not treat that comment as an active configuration feature. Verify the
actual `proxyFetch` implementation and document the IPv4 routing behavior
that is really in use.

Add route tests proving unauthorized mutations are rejected, allowed local
requests still work, secrets are not echoed, and SSRF targets are blocked.

## Priority 3 — Dependency and build hygiene

Status: `COMPLETE` (2026-07-27)

Implemented: duplicate Vite declaration removed, fixed `postcss` added, and
`body-parser` pinned through an override. `npm audit --omit=dev` reports zero
vulnerabilities.

Resolve the vulnerabilities reported by:

```bash
npm audit --omit=dev
```

The current report includes a high-severity `postcss` issue and a low-severity
`body-parser` issue. Upgrade to fixed versions, remove duplicate dependency
declarations where appropriate, and verify:

```bash
npm ci
npm run lint
npm test
npm run build
npm audit --omit=dev
```

Do not use a broad upgrade that changes unrelated runtime behavior.

## Priority 4 — Correct health and lifecycle observability

Status: `COMPLETE` (2026-07-27)

Implemented via `src/services/healthStatus.ts`, structured `/api/health`
fields, provider-health summary corrections, and
`MAX_STALE_CONTEXT_TICKS` telemetry wiring. Focused tests are in
`src/tests/healthStatus.test.ts`.

1. Make `/api/health` distinguish:
   - server readiness;
   - KuCoin core readiness;
   - Binance sentiment readiness;
   - supplemental provider configuration and health;
   - proxy-pool availability.
2. Clearly label direct-probe results versus proxy-routed application results.
3. Do not report supplemental `ready` merely because an orchestrator object
   exists.
4. Use `MAX_STALE_CONTEXT_TICKS` from `lifecycleCore.ts` as the single source
   of truth for stale-budget telemetry and Telegram payloads.
5. Add tests for degraded Binance, missing supplemental keys, empty proxy pool,
   and stale-budget reporting.

## Priority 5 — Verification coverage

Status: `COMPLETE` (2026-07-27)

Implemented portable Edge/default browser resolution, repository-relative
`_qa/` artifacts, isolated-server startup, and UI smoke coverage. The green
synthetic audit is written to `_qa/ui_audit/ui_click_audit_result.json`.
Live visual-layout output remains an honest diagnostic when exchange
connectivity is unavailable.

Make browser verification runnable from this repository on Windows and in CI:

1. Remove hardcoded paths from `scripts/uiSyntheticAudit.mjs` and
   `tests/visual-layout.mjs`.
2. Resolve the browser executable from configuration or Playwright defaults.
3. Write artifacts under a repository-relative `_qa/` directory.
4. Add a smoke path covering every left-rail page, signal detail drawer tabs,
   disabled right sidebar, settings flows, and console/page errors.
5. Strengthen TypeScript checks incrementally (`strict`, unused checks, and
   indexed-access checks) without masking existing runtime errors.

## Capability note

Backtesting is currently explicitly SHORT-only in
`src/services/backtesting.ts` and `src/components/BacktestingPanel.tsx`.
Do not expand it to LONG or BOTH directions unless that is separately approved;
if it remains intentional, document it as a product limitation.

## Safety and scope constraints

- Do not enable live trading or place exchange orders.
- Do not fabricate prices, candles, sentiment, or readiness.
- Do not remove paper/manual-only guards.
- Do not rewrite unrelated UI pages or archived documentation.
- Prefer narrow, reversible changes with focused tests.
- Update the central project plan and relevant documentation after each
  completed priority.

## Completion criteria

The work is complete only when:

1. All selected deficiencies have focused tests.
2. `npm run lint`, `npm test`, and `npm run build` pass.
3. `npm audit --omit=dev` has no unresolved high-severity issue.
4. Browser smoke artifacts are generated under the current repository.
5. `/api/health` reports provider-specific, truthful readiness.
6. A short implementation report lists changed files, evidence, and any
   intentionally deferred items.
