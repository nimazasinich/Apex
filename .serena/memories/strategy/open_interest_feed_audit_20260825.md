# Open-interest feed audit — 2026-08-25 (verdict CONCERN, feed is usable)

Runner: `scripts/research/runOpenInterestFeedAudit.mts` → `QA/walk-forward-baseline/open-interest-feed-audit.json`.
Run on native Windows via `npx tsx`. Motivated by Giagkiozis & Said, *Reconciling Open Interest with
Traded Volume in Perpetual Swaps*, Ledger 9 (2024) 1–15, DOI 10.5195/ledger.2024.325.

Design: every consistency check runs **twice** — RAW (rows as stored) and SANITIZED (rows with
`oi<=0` or `oiUsd<=0` dropped). One spurious zero between two real values manufactures a false
flatline run, a false step discontinuity **and** a false volume-bound violation simultaneously, so a
single-pass audit cannot tell "untrustworthy feed" from "locatable outage". This two-pass design is
what produced every conclusion below; keep it if the audit is ever extended.

## Verdict: CONCERN, conditioning is justified

The feed is internally consistent to sub-basis-point precision and its large moves are real market
events. Every FAIL-grade signal in the raw pass traced to **one** archive defect.

## The one real defect: 12 archive-wide zero-OI hours

`oi: 0` at **identical timestamps on all ten symbols** — proof of an upstream outage encoded as a
zero, not per-instrument misreporting:
- 10-hour block `2022-03-07T16:00Z` → `2022-03-08T01:00Z`
- singletons `2023-11-11T22:00Z`, `2023-11-23T04:00Z`
- plus `2023-04-10T09:00Z` where `oi` is valid (106649.636) but `oiUsd` is 0 → 13 invalid rows total,
  12 with `oi=0`.

These zeros were the **entire** cause of: every flatline run (raw 9 repeated pairs / one 10h run per
symbol → sanitized **0**), and most volume-bound violations (raw 6–9 per symbol at ratios up to
22.8× → sanitized 0–3 at ratios ≤2.3×). Raw shared-by-all-symbols violation hours were 6; sanitized, 0.

### Fix applied (`scripts/research/lib/researchDataset.ts`)
`alignOpenInterestToCandles` guarded `Number.isFinite(point.oi)` — which **admits 0**. Now
`&& point.oi > 0`. Without this, an OI-change conditioner reads real→0 as −100% then 0→real as
+∞: a fabricated liquidation cascade landed on 2022-03-07, a genuinely volatile day, i.e. exactly
the pattern such a conditioner exists to detect. Effect: 4 four-hour bars per symbol (4380→4376).

### Trap found while fixing: never "just drop the bad rows"
Deleting the invalid rows and re-aligning reports **more** usable bars (4378) than the guard (4376),
because the as-of lookup then falls back to the previous hour, which sits exactly at the 1-hour
staleness bound and is therefore accepted. Row removal silently carries a stale value onto a bar
that had no observation. The `> 0` guard in the loader is strictly correct; row removal is not.
The audit JSON keeps both counts (`barsWithOpenInterest` vs `barsViaNaiveRowRemoval`) to show the leak.

### Consequence for the recorded `oitrend` baseline (not re-run)
Prior walk-forward numbers for `oitrend` (−29.95% integrated) were produced with zeros admitted, so
it traded on ±100% fabricated OI changes at up to 4 bars/symbol and for `windowBars` bars after each.
Not re-run: `oitrend` is slated for retirement and the effect is confined to 4 of 4380 bars.

## Residual real inconsistency: 2022-03-15 04:00–06:00Z

8 surviving |ΔOI| > volume violations across 4 symbols (BNB 3, XRP 3, DOGE 1, LTC 1) out of ~175,000
symbol-hours (0.005%), almost all at `2022-03-15T04:00/05:00/06:00Z`. Characterized, not assumed:
- candle volume that hour is **0.44–0.67× its own 48h median** (depressed, not a data-loss burst)
- price flat (BNB 366.91→366.70→366.36)
- OI makes a ~10% excursion that partly reverts the next hour
- direction **differs per symbol** (BNB up-then-down; XRP/DOGE/LTC down-then-up)

A market-wide deleveraging would move all symbols the same way on *elevated* volume. This is a
reporting artefact on the OI side. Both feeds are individually plausible; they are mutually
inconsistent, and the bound says the OI side is the impossible one.

**Design rule derived from this (not tuned):** condition on ΔOI only when |ΔOI| ≤ that hour's base
volume. Arithmetically impossible changes fail closed. Free, principled, no fabrication.

## What passes cleanly

- **Grid:** 0 off-hour-boundary and 0 non-increasing stamps, all 10 symbols.
- **Coverage:** ≥99.96% of each file's own span. Only SOL (2 gaps, 1h), AVAX (4 gaps, longest 4h, all
  on 2023-02-07), LTC (1 gap, 1h) have holes at all.
- **Notional cross-check:** `oiUsd/oi` vs the same-instant candle open — median deviation
  **0.38–1.81 bp**, p99 5–12 bp. This independently validates both columns. Only outlier: SOL 5.2%
  at 2022-11-09T21:00Z, the peak of the FTX collapse, where an intra-hour mark/open gap is expected.
- **Jumps are real events, not artefacts.** No |Δln oi| > 0.5 anywhere. The six >25% hourly jumps sit
  on identifiable news: XRP +0.367 on 2023-07-13 (Ripple ruling), DOGE +0.299 on 2023-04-03 (Twitter
  logo), SOL +0.293 on 2022-11-08 (FTX), LINK +0.297 on 2023-07-20. Majors are quietest (BTC 3 hours
  >10%, ETH 7); alts noisier (DOGE 34). Only 6 spike-then-revert pairs total across all symbols.

## Ratio columns: mostly unusable, and this constrains the design

Present-share by quarter (BTC; identical shape on all symbols):

| quarter | topAccountRatio | topPositionRatio | accountRatio | takerRatio |
|---|---|---|---|---|
| 2022Q1 | 1.1% | 1.1% | 79.4% | 1.1% |
| 2022Q2 | 30.9% | 30.9% | 100% | 57.1% |
| 2022Q3 | 0.0% | 0.0% | 100% | 100% |
| 2022Q4 | 18.8% | 18.8% | 100% | 100% |
| 2023 (all) | 100% | 100% | 100% | 100% |

`topAccountRatio`/`topPositionRatio` have a **2800-hour contiguous null run** from 2022-01-31 and are
43.6% null overall — usable only from **2023-01-01**. `takerRatio` usable from **2022-07-01**.
`accountRatio` usable from **2022-01-19T14:00Z** (2.6% null, all at the very start).

So the natural proxies for Cheng et al.'s leverage/liquidation mechanism and for Chen–Ma–Nie's
long/short asymmetry are the *least* available fields. A conditioner resting on `topPositionRatio`
would silently have only one year of the two-year OI window. Build on `oi` (99.93% present) plus
funding (spans 2021+), with `accountRatio` at most secondary.

## Coverage limit that shapes the comparison (unchanged, now quantified)

OI file starts 2022-01-01; candles start 2021-01-01. On the 4-hour family grid: **4376 of 6570 bars**
carry usable OI, spanning 2022-01-01T00:00Z → 2023-12-31T20:00Z. Any OI-conditioned variant therefore
has ~2/3 the bars of a candle-only family, so it must be compared against the unconditioned squeeze
**re-run on the same shorter window**, not against the recorded 2021-start figures, and the split
count (fewer than 14 under warmup 180 / train 1095 / test 365 / step 365) must be stated explicitly.

## Single-venue limitation (cannot be fixed with this archive)

Source is Binance USDⓈ-M daily metrics archives only (`data.binance.vision`), per-day zip sha256 in
each envelope's `provenance`. The cross-venue divergence half of Giagkiozis & Said is **not testable**
here; only internal consistency is. Do not claim the feed is validated against other venues.
