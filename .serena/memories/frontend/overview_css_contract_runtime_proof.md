# Overview CSS contract mismatch — LIVE RUNTIME PROOF (2026-08-23)

Companion to `mem:frontend/overview_market_summary_css_contract` (the source-level dossier). That memory
inferred four defects from reading CSS + JSX. This one records the **measured** browser confirmation, so the
diagnosis never has to be re-derived or re-litigated as "just a theory".

## How it was captured

- `npm run start` (there is **no `preview` script**; `start` = `node dist/server.cjs`) launched detached,
  listening `127.0.0.1:3000` (port from `src/utils/cliConfig.ts:20-24` `resolvePort`, default 3000 — safely
  clear of gate ports 3210 / 4599 / 24678).
- Playwright → `http://127.0.0.1:3000/#/overview`, viewport resized to the canonical **1368x753**.
- Build was fresh: `public/build-info.json` sourceHash `e8d5b87c6613`, generatedAt 2026-08-23T20:59:51Z.
- `overviewMounted: true`, `routeError: false`, **console errors: 0**. Server log showed HTTP **304** for
  `/crypto-icons/{btc,eth,sol,xrp}.png` and the inter woff2.

## Measured values (all four defects confirmed as fact, not inference)

**1. Tile grid-area collision** — for every tile (BTC, ETH, ZEC, SOL):
```
iconGridArea (.apex-coin-icon) : "sym"     <-- should be "icon"
labelGridArea (> span)         : "sym"
imgGridArea (<img> grandchild) : "icon"    <-- inert; grid-area does not apply to grandchildren
iconRect / labelRect           : identical x, e.g. both x=568
collision                      : { ox:16, oy:16, overlapping:true }
imgLoaded                      : true (BTC/ETH/SOL)
```
The 16px `icon` column is empty and the PNG sits on top of `<strong>`+`<small>`. Screenshot shows the orange
BTC disc covering "BT" of "BTC" with only "C" peeking out. **Zero console errors + imgLoaded:true is the
final nail in the asset/font/icon-library coffin.**

**2. `.apex-overview-summary-chart-wide` has no rule** — measured `471 x 28`, inner
`.apex-mini-sparkline` = **58 x 24** (the global `src/index.css:4838` fallback). `minHeight:auto`,
`maxHeight:none`. Meanwhile `.apex-overview-summary-chart` (the tuned 48-72px full-width rule at
`OverviewWorkspace.css:260-262`) is **not present in the DOM at all** — `chartUnsuffixedPresentInDom: false`.
Confirmed orphan.

**3. `.apex-overview-breadth-bar` invisible** — measured `471 x 0`, `display:block`, `height:0px`,
`background: rgba(0,0,0,0)`. All three `<i>` segments: `display:inline`, `computedW:0`, `computedH:0`,
transparent — so the inline `style="width:25%"` is **ignored** because inline elements take no width.
Wrapper `.apex-overview-breadth` is also unstyled/plain-block, so the block-level bar div between the two
inline `<span>`s force-wraps them: "Bullish 25%" and "Bearish 45%" render on **separate lines** with nothing
between. There is no Neutral label in the markup at all (only `.bullish` and `.bearish` spans exist —
`OverviewMarketSummary.tsx:78,84`).

**4. `apex-overview-summary-stats-4` has no rule** — computed
`grid-template-columns: 157.133px 157.133px 157.133px` (3 tracks) for **4** cells; distinct row Y values
`[263, 291]` prove "Funding Bias" wrapped to a second row under column 1.

## NEW, separate defect found while measuring: breadth percentages do not sum to 100

`src/components/overview/overviewModel.ts:157-163` `sentimentBreadthOverlay` clamps only two of three fields:

```ts
if (zone === 'Extreme Greed' || zone === 'Greed')
  return { bullishPct: Math.max(b.bullishPct, 45), neutralPct: b.neutralPct, bearishPct: Math.min(b.bearishPct, 25) };
if (zone === 'Extreme Fear' || zone === 'Fear')
  return { bullishPct: Math.min(b.bullishPct, 25), neutralPct: b.neutralPct, bearishPct: Math.max(b.bearishPct, 45) };
```

`neutralPct` is passed through unchanged, so the invariant from `buildMarketBreadth` (three
`Math.round(n/total*100)` that sum to ~100) is broken by the overlay. Live values were **25 / 3 / 45 = 73%**.

**Consequence for the CSS fix:** simply making the bar visible will leave a **27% empty gap** on the track.
This is a *data* bug, not a CSS bug — fixing the stylesheet alone will expose it rather than hide it. Decide
explicitly whether to (a) ship the bar with the gap, (b) normalize the three values, or (c) let `neutral`
absorb the remainder. Do not silently "fix" it inside the CSS change. `MarketsPage.tsx:462-473`
(`.apex-mkt2-breadth-*`) uses a *different* local `pct()` helper and is unaffected by the overlay.

## Constraints reconfirmed
Fix belongs in `src/components/overview/OverviewWorkspace.css` only. Do **not** touch `CoinIcon.tsx`; the
`apex-coin-icon` class name is load-bearing for the harness `coinIcons` metric (see
`mem:frontend/overview_market_summary_css_contract` and the tile-collision auto-memory). Re-verify with
`npm run qa:ui-1368`. Remember `Doc/reference/v20/` has **no overview baseline**, so the visual gate cannot
catch a regression here — measure geometry explicitly instead of trusting a green gate.
