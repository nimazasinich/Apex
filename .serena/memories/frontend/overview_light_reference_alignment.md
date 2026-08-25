# Overview page — light-reference alignment (2026-08-24)

Applied after `mem:frontend/overview_latency_and_activity_repair` (same session). tsc --noEmit exit 0, 12.78s.
**No build, no browser run** — the work order forbade `build`/`verify`/tests, so every geometry claim below is
UNVERIFIED by design. Do not promote any of it to PASS without a real render at 1368x753.

## Work-order claims that were WRONG (do not re-trust this prompt)

The "Pixel-Perfect Redesign Prompt" shipped a dark `--ov-*` hex palette while BOTH of its own reference screenshots
were light. User adjudicated: reference images are ground truth, `--apex-*` tokens stay, the `--ov-*` block is a stale
artifact. Four more of its seven "WHAT IS BROKEN" items were false — see the sibling memory. Two more found here:

- **"Panel numbers are absent."** Backwards. All 7 numbered panels already emit `<span class="apex-overview-section-num">N</span>`
  (Attention:43, Signals:35, Activity:195, ProviderHealth:18, AccountSummary:69, ExecutionSnapshot:16, MarketSummary:46).
  The *reference* is what lacks the badge — it prints plain "N.". `OverviewSystemHealthPanel.tsx` has no number at all.
- **"Add Top Rejection Reason to panel 3."** Already coded (`OverviewSignalsPanel.tsx:66`) along with a `View scanner`
  footer. Neither renders because **panel 3 is clipped**, not incomplete. This is the `qa:ui-1368` blind spot again:
  `.apex-overview-v2` is a fixed non-scrolling 1368x753 stage, every panel carries `overflow: hidden`, and
  `.apex-overview-signals` declared five `auto` rows + `align-content: start` — so content total could exceed the grid
  area and the last two children were silently cropped. **Never conclude "markup missing" from a screenshot on this page.**

## Fix for the clipping (the durable technique)

Give the panel's *absorbing* row `minmax(0, 1fr)` instead of `auto`, and put `min-height: 0; overflow: hidden` on the
item in it. That caps the panel's content total at its grid area and pushes shrink onto the row that can afford it
rather than onto the trailing children. Applied to `.apex-overview-signals` (row 3 = `.apex-overview-signal-highlight`).
`align-content` becomes irrelevant once one row is flexible.

## Panel 2 restructure — orphan-rule hazard

`OverviewMarketSummary.tsx` now renders `.apex-overview-summary-focus` = `minmax(0,1fr) minmax(0,172px)`:
hero column (eyebrow / CoinIcon+symbol / 22px price / change badge / chart in a `minmax(0,1fr)` row) beside
`.apex-overview-summary-statlist` (24h High, 24h Low, Volatility, Liquidity Score, Funding Bias as stacked rows).
Breadth and footer unchanged; both stay inside the `ticker ?` fragment so item→row mapping is unchanged.

- **`.apex-overview-summary-price` was already taken** by the orphaned `.apex-overview-summary-body` block
  (its `strong` rule forces 16px mono). New classes are `-hero` / `-hero-head` specifically to avoid inheriting it.
  `OverviewWorkspace.css` has THREE orphan families with no JSX match: `-summary-body`, `-summary-price`,
  `-summary-chart` — and now also `-summary-stats` / `-summary-stats-4`. Left in place per the file's own convention.
- The old `@container workspace-region (max-width: 900px)` block still collapses `-summary-body` / `-summary-stats`,
  which are now unreferenced, so a fresh `@container` rule for `-summary-focus` was appended after it.
- Chart still has **no fixed height** (`height:100%; min-height:56px` only) — a hard height here previously overflowed
  the row and painted the sparkline over the stats and breadth.

## Why all new CSS is appended, not merged

~14 of the new rules re-declare properties set earlier in the same file at IDENTICAL specificity, so **source order is
the mechanism**. Hoisting or "tidying" this block into the base rules silently reverts it and reintroduces the
`-stats-4` ordering trap. The block is self-documenting on this point; keep the warning if it is ever edited.

## Density pass (all UNVERIFIED)

`.apex-overview-v2` gap 7→6; status-cards gap 6→5, card padding 7px 9px→6px 8px; panel padding 7px 9px 8px→6px 8px 6px
on summary/signals/autopilot/providers/execution; summary + signals gap 5→4; funnel gap 4→3, `> div` padding 4px 6px→3px 5px,
`strong` 13→12px; decision-list and execution-grid `> div` padding 4px 6px→3px 5px; signal-highlight first child padding
5px 6px→4px 5px and `strong` 16→14px; signal-top button padding 5px 7px→4px 6px. Panel-number badge → text saves an 18px
column per header. Estimated ~15px recovered inside panel 3 — **estimate only, never measured**.

## Deliberately NOT done (blocked on absent data — do not "fill in")

Panel 3 delta chips (+12% / +3 / +1 / +8), Avg Slippage, Avg Latency. **CORRECTED 2026-08-24: Daily P&L, Open Risk AND Buying Power all DO exist** — `OverviewAccountSummary.tsx` already renders a full 3x3 of the nine reference fields via `dailyPnlFromInsights()` / `openRiskUsd()` (overviewModel) and `account.buyingPowerUsd`, including the margin-utilization progress bar. The earlier "blocked on absent data" claim was over-generalised from `OverviewKpiStrip.tsx`'s comment, and that file is DEAD CODE describing only its own gap. Never infer a live panel's data availability from the dead KpiStrip. No round-trip timing
instrumentation exists anywhere in the build; `OverviewKpiStrip.tsx` is dead code and its own comment already says so.
