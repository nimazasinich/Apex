# APEX V20 — Visual Parity Remediation Plan
Status: DRAFT FOR EXECUTION · Owner: Elnaz · Scope: 8 v20 reference routes (`watchlist`, `orders`, `positions`, `alerts`, `history`, `analytics`, `settings`, `help`)
Source of findings: real `npm run dev` capture at the canonical 1368×753 viewport, pixel-diffed against `Doc/reference/v20/*.png`, cross-checked against `ReferenceViews.tsx` / `WorkspaceShell.tsx` source on 2026-08-03. Visual evidence: `Doc/qa/v20-parity-review/`.
Files in scope: `src/components/workspace/ReferenceViews.tsx`, `src/components/workspace/WorkspaceShell.tsx`, `src/index.css`, `server.ts`, `src/services/workspaceInsights.ts`
Baseline verification tool: `npm run qa:v20-contract` (23/23 structural checks pass — this plan adds a second, *visual*, layer on top of that structural contract)

---

## 0. How this plan was produced (read before executing)

> Screenshots referenced throughout this document (reference-vs-implementation, stacked) live in `Doc/qa/v20-parity-review/`. Open that folder alongside this plan — each finding below names the exact file to look at.

The previous V20 session (`Doc/release-history/v20/MERGE_REPORT.md`) could not install all dependencies and explicitly stated: *"Visual screenshots of the running V20 app were not captured in this environment."* I was able to do what that session couldn't:

1. `npm install` succeeded cleanly (the two packages listed as blockers — `why-is-node-running`, `@fontsource/inter` — installed with no issue here).
2. Started the real dev server (`npm run dev`) and navigated all 8 v20 routes in a real headless Chromium at the canonical **1368×753** viewport.
3. Pixel-diffed every route against its reference PNG.
4. Cross-checked every visual discrepancy against the actual JSX in `ReferenceViews.tsx` / `WorkspaceShell.tsx` to confirm whether it is a **missing/incorrect component** (a real gap) or **empty-state rendering** (a data-availability artifact of my sandbox, which has no network path to KuCoin/Binance — `qa/verifyV20ReferenceContract` and the component source confirm the tables are wired to real ticker/order/position feeds, not to mock data).

**This distinction matters and this plan is organized around it:**

- **Class A — Real code/markup gaps.** These exist regardless of what data is flowing. Confirmed by reading the component source, not just by looking at a screenshot. These are the priority of this plan.
- **Class B — Data-dependent appearance.** Tables/charts/gauges that rendered as honest empty states (`HonestEmpty`, `No matching assets`, `No open positions`, etc.) in my sandbox purely because outbound requests to KuCoin/Binance were blocked by network policy. On the actual dev machine (which has live market access), re-run the same capture step before assuming these are broken — most likely they are not.

Every task below is tagged **[A]** or **[B]** so nothing gets "fixed" that isn't actually broken, and nothing gets skipped that actually is.

---

## 1. What is already correct (do not touch)

Confirmed structurally correct on all 8 pages, keep as-is:

- Left nav width 184px, header height 56px, right context sidebar 280px (`--apex-sidebar-w`, CSS grid `minmax(0,1fr) 280px` in `src/index.css`).
- One `v20-context-sidebar` per page (8/8).
- Route components exist and are wired in `App.tsx` (`ReferenceWatchlistView`, `ReferenceOrdersView`, etc.).
- `GET /api/account/workspace` + `workspaceInsights.ts` normalizer exist and pass their runtime test.
- Metric-card grid, gauge/donut primitives (`HalfGauge`, `Donut`) present and rendering.
- Help route is reachable from the sidebar and interactive.
- TypeScript: `tsc --noEmit` is clean across the codebase.

---

## 2. Global (cross-page) fixes

### 2.1 Header icon cluster — missing Settings shortcut **[A — confirmed in source]**

`WorkspaceShell.tsx` renders only `<Bell/>` and `<Moon/>` in the top-right header icon row (plus the avatar). The reference design shows **four** icons: bell, moon, **gear/settings**, avatar. The `Settings` icon is imported and used for the *left-nav* item, but never duplicated into the header quick-access row.

**Task:** Add a `<Settings size={18}/>` icon button to the header icon cluster, wired to open the same target as the left-nav "Settings" item (or the `SettingsModal` if one is meant to open in-place).

**Files:** `src/components/workspace/WorkspaceShell.tsx` (icon row, near the existing `Bell`/`Moon` buttons).

**Acceptance:** Header icon row shows 4 icons in this order: bell → moon → settings → avatar, on every one of the 8 routes.

### 2.2 Trading-mode badge label mismatch **[A]**

Reference design: pill reads **"PAPER TRADING"**. Implementation renders **"DEMO TRADING"**. This is a copy/label difference, not a logic difference — the underlying mode is the same concept (non-live account).

**Task:** Either (a) rename the label to "PAPER TRADING" to match the reference exactly, or (b) if "Demo" vs "Paper" is an intentional product decision that postdates the reference mockups, explicitly confirm that decision and note it as an intentional deviation in `Doc/qa/V20_VISUAL_ACCEPTANCE.md` so it stops showing up as a diff in future QA passes. Do not leave it as a silent, undocumented mismatch.

**Files:** wherever the trading-mode pill is rendered in `WorkspaceShell.tsx` (search for `DEMO TRADING`).

### 2.3 Clock format **[A]**

Reference: `UTC 14:32:18` (label first). Implementation: `10:50:05 UTC` (label last). Small, but it's a one-line fix and it's on every page, so it's worth doing once, globally.

**Task:** Swap format to `UTC HH:MM:SS` to match reference typography/order.

**Files:** clock render in `WorkspaceShell.tsx` header.

### 2.4 Market Data status pill **[B — re-verify on live network]**

Reference always shows green "Market Data Connected." My captures show orange "Market Data Degraded" because KuCoin/Binance endpoints were unreachable from the sandbox. This is very likely correct behavior once run with real network access — **do not "fix" this by hardcoding a status**; just re-verify it goes green under normal operating conditions, and confirm the degraded state itself looks right (color/copy) since it's a real, needed state for outages.

---

## 3. Per-page plan

### 3.1 Watchlist — diff 9.0%

**[A] Missing "+" custom-tab button.** The reference filter row (`All / Favorites / Major Coins / DeFi / Layer 1 / AI`) ends with a `+` button to add a custom tab. The current implementation hard-maps a fixed 6-item array with no trailing add-button, even though the `Plus` icon is already imported in this file (used elsewhere).
`Files:` `ReferenceViews.tsx`, watchlist filter-chip row (`v20-chip-row`).

**[A] Right panel default state.** Reference "Asset Assistant" panel opens with an asset pre-selected (ETH) and shows: timeframe tabs (1H/1D/1W/1M/1Y/ALL) above the price chart, a Market Sentiment gauge, a "Key Facts" list (Market Cap, 24h Volume, Circulating Supply, Max Supply, Rank, All-Time High), a "Tags" chip row, and three CTAs (Trade / Set Price Alert / View Asset Details). Implementation currently opens on "Select an asset" with only the sentiment gauge and two CTAs (Trade Asset, Set Price Alert) visible — **Key Facts, Tags, timeframe tabs, and "View Asset Details" are not rendering in the no-selection state.**
**Task:** Decide whether the panel should default to the top-ranked/favorited symbol on load (matching the reference's implied behavior) instead of a blank "select an asset" state, and confirm Key Facts / Tags / View Asset Details render once a symbol *is* selected (click a row and re-check — if they already work post-selection, this is just a default-state issue, not a missing-feature issue).
`Files:` Asset Assistant panel section of `ReferenceViews.tsx`.

**[B] Empty table ("No matching assets").** Table markup, columns, sparkline components, and pagination are all present and correctly wired to `pageData.items` (live ticker feed) — confirmed in source. Re-verify with live KuCoin access before treating this as a bug.

### 3.2 Orders — diff 8.4%

Structurally the closest page to the reference. No Class-A findings beyond the two global header issues (§2.1–2.3).

**[B]** All 5 metric cards and the table are empty purely because there is no live order history in this environment. Re-verify against a demo/live account with real order activity.

### 3.3 Positions — diff 9.6%

No page-specific Class-A findings beyond globals. Donut ("Exposure by Asset"), leverage-distribution bars, and the "Account Risk" gauge are present and structurally match; they render at zero/neutral purely for lack of open positions in this sandbox.

**[B]** Re-verify donut and leverage bars populate correctly once there is real position data.

### 3.4 Alerts — diff 11.5%

Structurally strong match (metric cards, table, "Alert Builder" context panel with alert-type/condition/instrument fields, Quick Templates, Recent Triggers all present and correctly wired per source). No Class-A findings identified beyond globals.

**[B]** Two real alerts render correctly with toggle switches and delete icons — this page is closest to "already working," the diff is mostly color/weight from unrelated live values.

### 3.5 History — diff 9.2%

Structurally matches (metric cards, activity table with 8 tab filters, "Recent Activity Timeline," "Export & Reports," "Activity Insights" with per-category bars). No Class-A findings beyond globals.

**[B]** Empty timeline/table purely from lack of account activity in this sandbox.

### 3.6 Analytics — diff 11.9% (needs a closer pass)

**[A] Chart/heatmap fidelity.** The lower half of the reference page shows a fully populated **P&L Heatmap** (5-week × weekday grid with red→green cell coloring) and a **Monthly Performance** bar chart with 6 months of green/red bars. In the implementation, "Monthly Performance" shows an honest empty state ("No monthly history") and the "P&L Heatmap" card renders as an empty/skeleton block with no grid at all — not even an empty-grid frame with axis labels. Compare this to the Watchlist/Orders empty states, which do show table headers and structure even with zero rows.
**Task:** Give the P&L Heatmap card the same "structured empty state" treatment as the tables elsewhere (render the week/weekday grid frame with neutral-colored cells and a "0" legend, rather than a blank card) so it reads as "no data yet" instead of "not implemented." Same treatment for Monthly Performance's bar-chart axes.
`Files:` Analytics section of `ReferenceViews.tsx` (`P&L Heatmap`, `Monthly Performance` blocks).

**[B]** Metric cards (Total P&L, Win Rate, Profit Factor, Sharpe Ratio, Total Trades) and Cumulative P&L line/Asset Allocation donut are correctly wired to real trade/analytics data and are empty only for lack of trade history.

### 3.7 Settings — diff 8.1%

Closest page to reference along with Orders. Right-hand context sidebar correctly mirrors the left settings-category list with matching icons. No Class-A findings beyond globals (header icon cluster affects this page too).

### 3.8 Help — diff 13.1% (largest gap, needs a closer pass)

**[A] Tutorial cards use flat color placeholders instead of thumbnail imagery.** Reference "Featured Tutorials" shows 4 cards with real screenshot-style background imagery (a dark trading-terminal screenshot, a light dashboard screenshot, etc.) behind the play button and duration badge. Implementation renders the same 4 cards but with flat solid/gradient color fills (dark green, pale green, pale green, dark teal) and no underlying imagery — visually reads as an unfinished placeholder rather than a styled state.
**Task:** Either source/generate lightweight static preview images for each of the 4 tutorials (they can be simple in-app screenshots, don't need to be real video frames) and use them as card backgrounds, or — if no video assets exist yet — intentionally redesign the placeholder as a clean branded pattern (not required to match the reference photo-for-photo) and document that decision so it isn't flagged as a defect again.
`Files:` Help page tutorial-card block in `ReferenceViews.tsx`; new static assets under `public/`.

**[A] Minor copy differences.** "Fratured Tutorials" (reference has a typo — do **not** copy that typo) vs "Featured Tutorials" (implementation is already correct here — no action needed, noting only so nobody "fixes" this to match the reference's typo).

**[B]** System Status card shows `unknown` / `not_configured` values — these are live health-endpoint fields; re-verify once the app runs with real backend/network access rather than the sandbox.

---

## 4. Execution order (priority)

1. **Global header fixes (§2.1–2.3)** — small, high-visibility, touches all 8 pages at once. Do this first.
2. **Analytics heatmap/monthly-performance empty-state treatment (§3.6)** — currently the least "finished-looking" empty state in the app.
3. **Help tutorial thumbnails (§3.8)** — second-largest visual gap and purely cosmetic/asset work, no logic risk.
4. **Watchlist "+" custom tab + Asset Assistant default-selection behavior (§3.1)** — small scope, clear acceptance criteria.
5. **Re-run the full capture+diff pass from a machine with live KuCoin/Binance network access**, to reclassify every remaining Class-B item as either "confirmed fine" or "actually broken." Do not sign off on Orders/Positions/History/Alerts/Settings/Watchlist-table fidelity until this step happens — this plan cannot verify those from this sandbox.

---

## 5. Verification method (repeatable)

This is the process I used and it should become the standard QA step for every future V20 change, not a one-off:

```bash
# 1. Structural contract (fast, no server needed)
npm run qa:v20-contract

# 2. Start the app
npm run dev &

# 3. Capture all 8 routes at the canonical viewport (headless Chromium, 1368x753)
#    — see /home/claude scripts used in this session for a ready-made
#      Playwright capture script hitting #/watchlist … #/help
#      and writing PNGs to compare against Doc/reference/v20/*.

# 4. Pixel-diff each capture against Doc/reference/v20/<page>-1368x753.png
#    (numpy mean-abs-diff + %-pixels-changed is sufficient; treat >15%
#     as "needs a manual look", not as an automatic failure, since live
#     data values will never match the mockup's invented numbers).
```

**Target after this plan is executed:** every page's diff should be attributable *only* to live data values differing from the mockup's invented numbers — not to missing UI elements. Re-score all 8 pages after Phase 1–4 above and confirm no page has a Class-A item left open.

---

## 6. Summary table

| Page | Diff | Class-A items found | Class-B (re-verify on live data) |
|---|---|---|---|
| Watchlist | 9.0% | Missing "+" tab button; Asset Assistant default-selection state incomplete | Empty ticker table |
| Orders | 8.4% | None page-specific | Empty order metrics/table |
| Positions | 9.6% | None page-specific | Empty positions/exposure/leverage |
| Alerts | 11.5% | None page-specific | — (already close to fully working) |
| History | 9.2% | None page-specific | Empty activity table/timeline |
| Analytics | 11.9% | Heatmap & monthly-performance empty states look unfinished | Metric cards / cumulative P&L |
| Settings | 8.1% | None page-specific | — |
| Help | 13.1% | Tutorial cards lack thumbnail imagery | System status live fields |
| **All pages** | — | **Header missing Settings icon; "PAPER" vs "DEMO" label; clock format** | Market Data connection status |
