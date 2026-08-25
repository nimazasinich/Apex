# Overview panels 6/7/8 — latency lie + activity frame repair (2026-08-24)

`npm run lint` (tsc --noEmit) **exit 0, 14.63s** after all edits. No build/verify/test run this session
(explicitly out of scope), so **no runtime/visual claim is made**.

## The single root cause behind two reported "bugs"

`providerLatencyMs()` in `overviewModel.ts` never computed latency. It returned
`Date.now() - row.lastCheckTime` — **check age**. Confirmed by inspecting the type:
`OperationsProviderRow` has only `name, category, status, isConfigured, isHealthy, failureCount,
lastCheckTime, lastSuccessTime, rateLimitedUntil, reason, reasonCode`. **No timing field exists.**
`SystemHealthReport` likewise has none (`kucoinStatus, binanceStatus, sentimentStatus, cacheHitRatePct,
cacheTotalQueries, cacheHits, uptimeSeconds, lastErrorLog, activeCandidateCount, lastScanTimestamp`) —
which is why `buildExecutionSnapshot`'s `health` parameter was, and remains, unused.

**There is no round-trip latency instrumentation anywhere in this build.** Do not "restore" a latency
number without adding a real measurement first.

Symptom 1 — Provider / Data Health showed `5601384ms` on every row: that is ~93 min of check age, identical
across rows because one sweep timestamps them all.
Symptom 2 — Execution Snapshot "Avg Latency" showed `—`: `buildExecutionSnapshot` averaged those same ages
behind a `< 60_000` filter, so every value was discarded. **The latent bug was worse than the dash**: any
sweep under 60s old would have printed its age as "Avg Latency" — a plausible but fabricated figure.

## Edits applied

| File | Change |
|---|---|
| `overviewModel.ts` | `providerLatencyMs` → **`providerCheckAgeMs`** (truthful name) + new `formatCheckAge()` → `"12s" / "4m" / "1h 33m" / "2d 4h"` |
| `overviewModel.ts` | `buildExecutionSnapshot`: staleness-average deleted, `avgLatencyMs` now honestly `null` |
| `overviewModel.ts` | `sentimentBreadthOverlay` now routes through new `normalizeBreadth()` — neutral is the **remainder**, so the triple sums to 100 |
| `OverviewProviderHealthPanel.tsx` | column header `Latency` → **`Last Check`**, value via `formatCheckAge` |
| `OverviewActivityPanel.tsx` | rewritten (25 → 97 lines), see below |
| `AccountViews.tsx` | added `export` to `stringFrom` and `normalizeSymbol` (additive only; `HonestEmpty` untouched — it has 5 consumers) |
| `OverviewWorkspace.css` | appended `.apex-overview-activity-table` block, `--apex-*` tokens only |

Closes the "still open" breadth item in `mem:frontend/overview_css_contract_repair_applied` (segments summed
to 73% of the track because the overlay clamped bullish/bearish and passed `neutralPct` through untouched).

## Panel 6 rewrite

Real 7-column `<table>` (Time (UTC) · Type · Market · Side · Size · Price · Status) replacing
`ActivityTable`, which was never a table at all — it is a `div.apex-activity-list` of icon rows. **The frame
now stays mounted when a tab is empty**; the empty state is a `colSpan={7}` row, not a replacement for the
table. Per-tab mappers normalise positions / openOrders / recentTrades / insights.activities into one row
shape. Includes `epochMs()`, which scales anything `> 4e12` down by 1000 — some venue feeds report
`tradeTime` in **nanoseconds**, and formatting that raw would have recreated the exact bug class just fixed.

## Work-order claims that were WRONG — verify before acting on a similar prompt

1. **"Target is dark theme"** (`--ov-bg: #0d1117` etc). The attached reference screenshot is **light**.
   User confirmed light is ground truth; the `--ov-*` hex palette was discarded. This app has a real dual
   theme (`:root[data-apex-theme-resolved="dark"|"light"]`, `src/lib/theme.ts`,
   `src/styles/light-theme-hardening.css`) and `OverviewWorkspace.css` already resolves **133** `var(--apex-*)`
   references — a parallel hardcoded palette would have permanently broken light mode.
2. **"Panel number circles are absent, add them"** — they already exist
   (`span.apex-overview-section-num`, all 8 panels). The *reference* uses plain `N.` text instead.
3. **"Panel 2 shows Open Trading INSTEAD OF the market detail; different render states"** — false. Tiles,
   wide chart, all 4 stats and the breadth bar render whenever `ticker` is non-null; `Open Trading` lives in
   the `<footer>` **unconditionally**. Not a conditional bug. Nothing was changed here.
4. **"Execution Snapshot prop wiring is broken"** — wiring is correct:
   `GeneralViews.tsx:97-101` already passes `averageOrderFillPct(insights)`. Dashes are honest empties.

## Still blocked on absent data (do NOT fabricate)

- **Avg Slippage** — hardcoded `null`/`'—'`. `slippagePctPerSide` (`types.ts:428, 911`) is backtest *cost-model
  config*, not measured execution slippage. Using it would misreport a constant as a metric.
- **Avg Latency** — needs real instrumentation (see above).
- **Panel 3 deltas** (`+12% / +3 / +1 / +8` in the reference) — no period-over-period signal history exists.
- **Fill Rate** — real, but `—` whenever `insights.orders` is empty (demo with no orders).

## Gate-risk check performed

`grep` over `tests/` and `scripts/` for `providerLatencyMs`, `buildExecutionSnapshot`, `Avg Latency`,
`Provider / Data Health` returned **zero** matches, so the rename and the `Latency` → `Last Check` header
change break no asserted gate string. Re-check if a browser/visual gate is later written against panel 7.
