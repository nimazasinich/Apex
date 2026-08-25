# OverviewMarketSummary: stylesheet authored against an older markup contract (diagnosed 2026-08-23, NOT yet fixed)

Investigation of a reported Overview "UI regression" (screenshots not available to the agent — uploads dir was empty,
so all of this is source-level evidence only; **no runtime/visual claim is made**). Four reported symptoms, one root
cause family: `src/components/overview/OverviewWorkspace.css` still describes an EARLIER markup shape of
`src/components/overview/OverviewMarketSummary.tsx`. The component was reworked; the stylesheet was not.

## The four class-name / selector mismatches (all verified by grep, both directions)

1. **Coin icons overlap the symbol text — this is the "corrupted/garbled glyphs"**
   `OverviewWorkspace.css:244` `.apex-overview-market-tiles img, .apex-overview-market-tiles svg:first-child { grid-area: icon; }`
   `OverviewWorkspace.css:245` `.apex-overview-market-tiles > button > span { grid-area: sym; min-width:0; overflow:hidden; }`
   Tile button is `grid-template-columns: 16px minmax(0,1fr)` / `grid-template-areas: "icon sym" "icon pct" "spark spark"`.
   `CoinIcon` (`src/components/CoinIcon.tsx`) renders `<span class="apex-coin-icon">` as the direct grid child with the
   `<img>` **nested inside it**. Consequences:
   - the `img`/`svg` rule targets a non-grid-item -> **the `icon` area stays empty** (16px blank column);
   - `> button > span` matches **both** the `.apex-coin-icon` wrapper **and** the `<span><strong>SYM</strong><small>price</small></span>`
     label -> both land in `grid-area: sym` and **render stacked on top of each other**, then get `overflow:hidden` clipped.
   This is NOT the `?.`-unguarded-property class from `mem:frontend/pixel_qa_shell_crash`; it is a pure CSS/markup
   contract mismatch and it reproduces even when the PNG loads fine.
   Fix direction: target `.apex-overview-market-tiles > button > .apex-coin-icon { grid-area: icon }` and scope the
   label rule so it cannot also match the icon wrapper.

2. **Selected-market detail chart renders as a 58x24 thumbnail instead of a panel**
   JSX uses `className="apex-overview-summary-chart-wide"` (OverviewMarketSummary.tsx:68).
   CSS only defines `.apex-overview-summary-chart` (OverviewWorkspace.css:260-262: `min-height:48px; max-height:72px;
   height:100%` + `.apex-mini-sparkline{width:100%;height:100%}`). The `-wide` variant has **no rule anywhere**, and
   `.apex-overview-summary-chart` is now an **orphaned/dead rule** (zero JSX matches) — evidence of a rename.
   Without it the sparkline falls back to global `index.css:4838 .apex-mini-sparkline { width:58px; height:24px }`.

3. **Market Breadth bar is invisible**
   JSX `.apex-overview-breadth` / `.apex-overview-breadth-bar` with three `<i class="bullish|neutral|bearish">`
   carrying only inline `width: N%` (OverviewMarketSummary.tsx:77-83). **No CSS exists for any of these** in
   `src/**/*.css`. `<i>` is inline, so `width` is ignored, and there is no height/background -> zero-height, invisible.
   Only the three percent labels paint. Compare the Markets page, which works because it has a real rule:
   `reference-ui.css:1982 .apex-mkt2-breadth-bar { display:flex; height:8px; border-radius:999px; overflow:hidden }`
   plus `.seg.bullish/.neutral/.bearish` backgrounds. Overview needs its own equivalent.

4. **4th stat cell wraps to a second row**
   JSX `apex-overview-summary-stats apex-overview-summary-stats-4` renders 4 `<div>`s, but only the base
   `.apex-overview-summary-stats { grid-template-columns: repeat(3, minmax(0,1fr)) }` exists; `-stats-4` has no rule.

## Reported symptoms that are NOT defects
- **Header "APEX" is correct.** `WorkspaceShell.tsx:~250` renders `<BrandMark title="APEX"/><span>APEX</span>`.
  The string `APEX UNIFIED TERMINAL` exists **nowhere** in src or Doc (only an ASCII banner in `README.txt:2`).
- **"Providers"/"Logs" sidebar nav items never existed here.** `WorkspacePage` (WorkspaceShell.tsx:35-50) is exactly 15
  values (overview, markets, watchlist, screener, portfolio, trading, orders, positions, alerts, history, analytics,
  backtesting, strategies, settings, help) — no `providers`, no `logs`. `navGroups` (WorkspaceShell.tsx:68-102) is
  Monitor(Overview, Markets, Watchlist, Screener) / Trade(Trading, Orders, Positions, Portfolio) /
  Research(Strategies, Backtesting, Analytics) / Operations(Alerts, History) + Settings/Help in `.apex-sidebar-bottom`.
  `git log -S"label: 'Providers'"` and `-S"label: 'Logs'"` on that file return **zero commits**. Caveat: the repo is a
  single squashed commit (`90c1b0e`), so git proves "never in this repo", not "never in the product".
  Providers does exist on Overview as a *panel* (`OverviewProviderHealthPanel`), and 'logs' as a *tab* in
  `AccountViews.tsx:1602` — easy to mistake for nav items.
- **4th watched coin XRP vs AVAX is not a design difference.** Tiles are `tickers.slice(0, 4)` in feed order
  (OverviewMarketSummary.tsx:55); `src/lib/priceFeed.ts:12` includes `XRP-USDT`. Pure data ordering.

## Logical impossibility that dates the "current app" screenshot
`App.tsx:543` `selectedTicker = tickers.find(...) || tickers[0] || null`. The tiles need `tickers.length >= 4`, which
guarantees `tickers[0]`, which guarantees `ticker` is non-null, which forces the `{ticker ? ... : ...}` branch at
OverviewMarketSummary.tsx:66-89 to render chart+stats+breadth. So "4 tiles visible AND chart/breadth entirely absent"
**cannot come from this source as a data condition** — it is the CSS collapse above (chart shrunk to 58x24, breadth
zero-height), or the screenshot predates this source. Ask before assuming.

## Assets and build are NOT the problem
- All 25 PNGs present in **both** `public/crypto-icons/` and `dist/crypto-icons/` (incl. btc/eth/sol/xrp/avax).
- `vite.config.ts` sets **no `base`**, so `import.meta.env.BASE_URL === '/'` and `CoinIcon` requests `/crypto-icons/<a>.png`.
  Absolute root path => broken under `file://`/`about:blank` (a companion note on this exists, but no memory named `project_apex_qa_harness_assets` is present in this project's Serena graph — likely lives in the separate Claude Desktop project-memory system instead; re-file it here if recovered);
  fine under any HTTP server. Under file:// the `onError` fallback yields 2-letter initials at 9px in a 16px circle.
- `public/build-info.json` at diagnosis time: buildId `4b45b635-e8d5b87c`, sourceHash `e8d5b87c6613`,
  generatedAt `2026-08-23T20:59:51.668Z`, dirtyTree true — i.e. fresh, post-App.tsx-fix. **Build staleness ruled out.**
- No dev/preview server was listening (checked 5170-5179, 4173, 3000, 8080, 5050, 1420), so no runtime capture was possible.
- `Doc/reference/v20/` holds only 8 baselines (alerts, analytics, help, history, orders, positions, settings, watchlist)
  — **there is no `overview-*.png` baseline at all**, so the pixel gates never compared Overview. That is why every one
  of these four defects shipped through green visual gates.

## Still open, separate, unauthorized
`GeneralViews.tsx:98/100/109` `?.`-first-hop bugs (`.health`, `.providers`) per `mem:frontend/pixel_qa_shell_crash`.
Note `OverviewView` feeds `OverviewProviderHealthPanel` from line 108 `diagnostics?.operations.data?.providers.items`.
Route-level boundary is `App.tsx:626` (`<RouteErrorBoundary route={page}>` **inside** `<WorkspaceShell>`), so an
Overview page throw keeps sidebar+header and replaces only the body with "This workspace could not be rendered";
the outer boundary `main.tsx:27` is the one that blanks the whole screen. Useful for attributing future screenshots.
