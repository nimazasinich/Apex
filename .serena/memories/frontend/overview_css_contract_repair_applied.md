# Overview CSS contract repair — APPLIED 2026-08-23

Supersedes the "diagnosed but not applied" status in `mem:frontend/overview_market_summary_css_contract`.
Evidence for the diagnosis is in `mem:frontend/overview_css_contract_runtime_proof`.

**All edits are in `src/components/overview/OverviewWorkspace.css` only.** No component, data, or
`CoinIcon.tsx` changes. `npm run lint` (tsc --noEmit) exit 0.

## The five edits

1. **Icon placement.** Replaced `.apex-overview-market-tiles img, ... svg:first-child { grid-area: icon }`
   (inert — the `<img>` is a grandchild) with
   `.apex-overview-market-tiles > button > .apex-coin-icon { grid-area: icon }`, and tightened the label rule
   to `> button > span:not(.apex-coin-icon)` so it no longer also matches the icon wrapper.
2. **`.apex-overview-summary-chart-wide`** added (the class the JSX actually emits).
3. **`.apex-overview-breadth` / `-bar` / `> i`** added, modelled on `.apex-mkt2-breadth-bar`
   (`reference-ui.css:1982`). Segments keyed by class name (`i.bullish/.neutral/.bearish`), **not**
   `:nth-child`, so reordering the JSX cannot silently remap the colours.
4. **`.apex-overview-summary-stats-4`** added `grid-template-columns: repeat(4, minmax(0,1fr))`. It has the
   **same specificity (0,1,0)** as the base `.apex-overview-summary-stats` rule, so it MUST stay physically
   after it in the file or the 3-column base wins.
5. **`.apex-overview-summary` row 3** changed `minmax(0, auto)` → `minmax(0, 1fr)`.

## Two traps worth remembering

**Do not give `-chart-wide` a fixed height.** The work order specified `height: 160px; min-height: 120px`.
Panel 2 is height-constrained by the Overview page grid at a measured **309px** at 1368x753, so a hard 160px
**overflowed its grid row and painted the sparkline on top of the stats and breadth rows** (chart spanned
y 216-376 while stats sat at y=291 and the bar at y=342). Fix was `height: 100%; min-height: 56px` plus the
row-3 `1fr` change, which lets the chart claim exactly the panel's real slack. Resulting chart: **471x63**.
Reaching the reference design's ~160px chart requires re-proportioning the Overview page grid — a layout
change, not a Panel-2 CSS change.

**Most of the work order's FIX 1A body would have been dead CSS.** `CoinIcon` sets
`display:inline-flex, alignItems, justifyContent, width, height, flex, borderRadius, overflow` inline on the
wrapper and `width:100%, height:100%, objectFit:contain, display:block` inline on the `<img>`. Inline styles
beat stylesheet rules without `!important`, so the specified `img { width:32px; height:32px }` could never
apply. Only `grid-area` (never set inline) was actually needed. **To enlarge the tile icon you must change
`size={16}` in `OverviewMarketSummary.tsx` and widen the `16px` grid column — CSS alone cannot do it.**

## Measured result at 1368x753 (real browser, rebuilt dist)

| | before | after |
|---|---|---|
| icon vs label overlap | 16x16 on all 4 tiles | **0** |
| icon `grid-area` | `sym` | `icon` |
| chart / sparkline | 471x28 / 58x24 | **471x63 / 471x63** |
| breadth bar | 471x**0**, segs inline & 0-wide | **471x8**, segs `block`, 117.8 / 14.1 / 212.1px, green/gray/red |
| stats grid | 3 tracks, rows y=[263,291] | **4 tracks, single row y=[291]** |
| panel 2 height | 309px | **309px (unchanged)** |
| page / main overflow | 0 / 0 | **0 / 0** |
| consecutive row overlaps | — | **none** |

## Still open

- The breadth bar visibly under-fills: segments sum to **344.1px of a 471.4px track (73%)**, the
  `sentimentBreadthOverlay` `neutralPct` bug documented in `mem:frontend/overview_css_contract_runtime_proof`.
  The CSS fix exposed it rather than caused it. Needs a data decision, not a CSS one.
- `operationsDiagnostics.ts:158-159` still has the **same unguarded-first-hop pattern**
  (`operations?.decisionMemory.stats?.total` — `.decisionMemory` is unguarded). Lines 155-157 were already
  fixed before this session. The work order asserted 158-159 "already have correct guards"; they do not.
  Left untouched per explicit instruction, but it is a latent crash of the identical class.
- Panel 3/4 crowding seen in the after-screenshot is **state-dependent and unrelated**: autopilot flipped
  `WAITING/ENABLED` -> `OFF/DISABLED`, which wraps panel 4's header and squeezes panel 3. No selector in this
  change set can reach panel 3 or 4.
