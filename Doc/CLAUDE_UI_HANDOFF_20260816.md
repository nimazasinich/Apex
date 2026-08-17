# APEX UI Handoff — 2026-08-16

## Canonical project

```
C:\project\APEX-frontend-phase31\APEX-unified-maximal-v1.0.56-r2-merged-source\APEX-Unified-Terminal-v1.0.68-LATEST-PATCHED-SOURCE-20260815
```

This is the **native Windows** canonical source and the only tree to edit. A Linux/VM path may
appear as a mount of this same folder — it is a mount, not a copy, so edits land in one place.
Never edit a mirror, never adapt dependencies/`package.json`/lockfile/native packages for Linux.

Target viewport: **1368x753**. Current task is **UI refinement, NOT redesign**.

Companion memory: `Doc/CLAUDE_SCRIPTS_TOOLING_MEMORY.md` — consult it **before** writing any new
QA/capture/diagnostic/build script.

## Canonical QA path

Overflow/regression gate (starts its own server, real Chromium, 14 routes, 1368x753):

```
npm run build
npm run qa:ui-1368
```

Real screenshot evidence (does **not** start a server — start one first):

```
npm run build
npm start                     # node dist/server.cjs, port 3000
npm run qa:capture:1368       # tsx scripts/capture/capture-dashboard.mts
$env:ROUTE='/#/watchlist'; npm run qa:capture:1368
```

Output: `_qa\diag\<ISO-timestamp>\` — viewport + full-page PNGs, console/network logs.
Env: `ROUTE` (default `/#/overview`), `BASE_URL` (default `http://127.0.0.1:3000`),
`SCREENSHOT_OUT_DIR`, `VIEWPORT_WIDTH/HEIGHT`, `HEADLESS`, `CAPTURE_FULL_PAGE`, `CAPTURE_TOOL_STATES`.

**Native Windows Playwright is installed and works** — `qa:ui-1368` has driven real Chromium on
Windows to a green result. Do not repeat browser/environment debugging, and do not confuse a
session-tool gating error with a project or browser failure.

### The gate's known blind spot

`qa:ui-1368` asserts **document-level overflow only**. Text clipped inside a fixed-height
`overflow: hidden` box triggers nothing, so the gate can be green while the UI is visibly broken.
A green `qa:ui-1368` proves *no new layout regression*; it never proves a clipping fix renders.
Only capture PNGs prove that.

## Cascade facts (measured, do not re-derive)

Stylesheet order: `index.css` → `workspace-shell.css` → `reference-ui.css` → App-subtree component
CSS (`MarketsPage.css`, `OrdersPage.css`, `SettingsPage.css`, `WatchlistPage.css`,
`OverviewWorkspace.css`, all eagerly imported) → `interaction-polish.css` →
`light-theme-hardening.css` → **`light-theme-workspace-refinement.css` (LAST)** →
`TradingWorkspace.css`.

- Media queries add **no** specificity: a later top-level `!important` beats an earlier
  in-media `!important`.
- To beat a media-block `!important` at (0,3,0), refinement rules are prefixed
  `:root .apex-shell` → (0,4,1).
- An `overflow` axis computed as `visible` while the other axis is non-`visible` computes to
  `auto` → phantom scrollbars.
- Inline `<svg>` with a `viewBox` and no `preserveAspectRatio` defaults to `xMidYMid meet`: when
  CSS height disagrees with the viewBox the chart letterboxes and centres, leaving empty gutters.
  This is the cause of "excessive empty space", not padding.
- `text-overflow: ellipsis` on a shrinkable flex item with `min-width: 0` silently ellipsises data.
  An ellipsised **number** is a data-integrity defect: pin numeric elements to `flex: 0 0 auto`.
- Market symbols are **hyphenated** (`BTC-USDT`). `verifyUi1368.mjs:596` seeds
  `["BTC-USDT","ETH-USDT","SOL-USDT"]`. Compare against `symbol.replace('-USDT','')`, never
  against the raw symbol.

## DONE — batch 1 (built and gated: build id `17a86e276ecc`, `qa:ui-1368` PASS)

`src/index.css`

- `--metric-card-min-h: 90px`
- compact shared metric-card tokens and hierarchy

`src/styles/reference-ui.css`

- `.apex-mkt2-stat-range-track` `opacity: .8`
- stronger track, marker and min/max readability

`src/components/CoinIcon.tsx`

- real local crypto logos via `public/crypto-icons`
- 25-entry manifest + aliases
- initials only as final fallback

`src/components/workspace/MarketsPage.tsx` + `MarketsPage.css`

- `apex-mkt2-num` / `-mid` / `-idx` alignment classes on the market table
- `display: flex` on `.symbol-cell` for this page root

`src/styles/light-theme-workspace-refinement.css`

- Orders KPI band 96px -> 76px (row track + grid + card), tighter card internals
- Orders empty-state visual scaled 0.72 as one composition
- Settings nav: separate rest / hover / active / pressed / focus-visible states

`src/pages/backtesting/BacktestingPage.css`

- evidence-rail density retuned; export card given room for its caption
- warnings/history lists made internally scrollable instead of clipped

Batch-1 validation: `npm run lint` / `tsc --noEmit` PASS, PostCSS parse PASS, 11 canonical
string/fs QA gates PASS, Windows `npm run build` PASS (`17a86e276ecc`), Windows `npm run qa:ui-1368`
PASS (failures 0, pageErrors 0, consoleErrors 0).

## DONE — batch 2 (source-verified only; NOT yet built, NOT yet gated, NOT yet captured)

### Coin logos rendered as empty circles — ROOT CAUSE FIXED

`src/index.css` ~lines 3792-3799. `.apex-coin-icon img` declared `opacity: 0`, revealed only by
`.apex-coin-icon.loaded img`. `CoinIcon.tsx:154` emits `apex-coin-icon has-logo` and **never**
`.loaded`, and the `<img>` inline style sets width/height/objectFit but not opacity — so every real
PNG painted fully transparent. Added:

```
.apex-coin-icon.loaded img,
.apex-coin-icon.has-logo img { opacity: 1; }
```

`index.css` is the only sheet declaring opacity on that selector, so this one rule repairs all 15
mount sites. `.loaded` was kept so nothing regresses. The batch-1 manifest work was necessary but
not sufficient — this CSS gate was the actual defect.

**CYS / HEMI still show monograms and that is correct.** 25 PNGs exist on disk, all 25 manifest
entries verified, and there is no `cys`/`hemi` artwork anywhere in the tree. The monogram is the
honest empty state; adding manifest entries without PNGs is what the file's own comment forbids.
Do not fabricate logos.

### Overview ticker strip

`src/styles/light-theme-workspace-refinement.css` (Overview block, ~line 4148). 66px cards in a
58px strip, plus a spec-mandated phantom vertical scrollbar, were truncating the percentage
("+0.07..."). Fix: `> button > em` pinned to `flex: 0 0 auto` so the **number** can never be
ellipsised; graceful degradation moved onto symbol/price; strip pinned `height: 58px`; chrome
reclaimed (sparkline 54→44, icon 28→26, gap 8→7, padding 10→9).

### Watchlist

`src/pages/watchlist/WatchlistPage.tsx` — lines 70, 176-177, 180, 198: `CoinIcon` mounted on the
summary asset, the table symbol cell and the Asset Assistant identity; duplicate-label suppression
rewritten to compare against the base symbol (the earlier `!== ticker.symbol` guard could never
fire against a hyphenated symbol), and `label` now holds only a genuine `displayName`.

`src/styles/light-theme-workspace-refinement.css` (Watchlist block, all selectors
`:root .apex-shell .apex-v3-watchlist-page ...`):

- Asset Assistant dead space was `preserveAspectRatio` letterboxing, not padding — sparkline
  `height: 97px !important; padding: 0 12px 4px !important` restores edge-to-edge fill. Row heights
  untouched, so the overflow gate cannot regress. Slack drops from ~38px vertical / ~35px per side
  to ~12px.
- Summary cards: 111px of content in a 100px `overflow: hidden` track was guillotining
  `<small>{detail}</small>`. Reclaimed 13px of chrome and pinned line-heights so the budget is
  deterministic (99px worst case, 97px without a `displayName`). Hierarchy is now
  value 17px > identity 10px > detail 9px.
- Table: replaced the 708px fixed widths with percentages summing 100%
  (4 / 21 / 12 / 11 / 14 / 12 / 12 / 14) and added real alignment — `.number` was defined in zero
  stylesheets. `:nth-child` is safe here because all 8 Watchlist columns always render, unlike
  Markets where `visibleColumns` shifts indices.

Layout owner for reference: `src/pages/watchlist/WatchlistPage.css` line 526 is the 1368x753 media
block (rows `252px 100px 146px 38px 96px !important`, `gap: 8px`, `overflow-y: hidden !important`).

Batch-2 verification performed: file reread from the Windows path; 4319 lines; braces 653/653;
comments 53/53; LF only, no CRLF; all gate-asserted strings intact
(`getTickerSparkline(ticker)` x2, `getTickerSparkline(selected)` x1, `Added to watchlist`,
`Removed from watchlist`, `props.onOpenTrading()`, `opened in Trading`,
`apex-v3-watchlist-main` x4, `var(--apex-surface)` / `var(--apex-surface-soft)` x14).

## PENDING

1. **Visual verification of batch 2 is the next action.** Build, start, capture Overview and
   Watchlist at 1368x753, then read the PNGs from `_qa\diag\<timestamp>\`. Confirm: real logos
   actually paint, the Overview percentage is complete, summary-card `detail` text is visible, the
   Asset Assistant sparkline fills its card, and the table columns balance.
2. Re-run `npm run qa:ui-1368` after the build — batch 2 has never been gated.
3. Confirm `CoinIcon` is visibly rendered (not merely mounted in source) on every required surface.
4. **Latent bug, reported and deliberately not fixed:** the Watchlist context rail's five row tracks
   are positional. When `selectedCandidate` is null the signal-intelligence `<details>` is absent, so
   `.context-actions-card` lands in the 38px row 4 while needing ~74px — silently clipped by
   `overflow-y: hidden`. Needs a non-positional fix, not another height tweak.

## Identity gates are stale

Build id moved `4aa0088ade0f` → `17a86e276ecc`, and batch-2 source changes landed **after** that
build. Before any release attempt, do one consolidated revalidation:

```
npm run test:unit
npm run build
npm run check:version-identity
npm run check:build-identity
```

Already verified earlier on Windows (batch-1 state): `npm run test:unit` PASS
(125 test files / 701 tests), `npm run build` PASS, `npm run check:build-identity` PASS.

Remaining canonical gates, in order: `npm run test:runtime`, `npm run check:source-contracts`,
`npm run test:browser`, `npm run test:visual`, `npm run verify:visual`. Then inspect the actual
`package.json` `verify` script once and run `npm run verify` and `npm run release:package`.

## Safety rules

- **No redesign.** Minimal, targeted edits only.
- **No fake data**, no weaker fallbacks, no lowered gates to make checks pass. Missing market data
  gets an intentional empty state (`—`, `DataState`, monogram), never an invented value.
- **No blind port kills.** Use `scripts/utilities/portTakeover.mts`.
  `KILL-ALL-NODE-PROCESSES.bat` kills every `node.exe` and is emergency-only.
- **No unnecessary new scripts.** Read `Doc/CLAUDE_SCRIPTS_TOOLING_MEMORY.md` and reuse the
  narrowest existing `scripts/` tool; prefer the `package.json` npm alias.
- No custom preflight runners, helper orchestration scripts, curated gate subsets, or intermediate
  status/task Markdown files. Use the canonical npm scripts directly.
- Do not rerun completed setup/build/test work unless a real source/config/build change requires it.
- Never claim runtime / browser / visual / accessibility PASS from source-only checks.
- Never claim a fix is done until the canonical Windows source is reread and the changed lines shown.
- Preserve unrelated user files and changes.
