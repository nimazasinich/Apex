# APEX Overview UI — Soft Green Reference Pass and Visual QA

## Scope

This pass remains limited to the existing Overview dashboard UI and its visual shell:

- CSS tokens, gradients, borders, shadows, typography, density, and responsive rules
- desktop application shell, sidebar, header, ticker strip, Watchlist, chart workspace,
  Positions, Order/Risk column, toolbox rail, and drawers
- Scanner, Market Movers, and Signal Pulse layout states
- viewport fitting and Playwright screenshot QA

No backend, provider router, proxy, cache, concurrency, market-data, account,
ML/decision-memory, or simulated-trading service was changed.

## UI guidance inspected

The implementation followed the project-local guidance in:

- `.claude/skills/apex-dashboard-screenshot-qa/SKILL.md`
- `ui-engineering-suite/SKILL.md`
- `ui-engineering-suite/references/design-system.md`
- `ui-engineering-suite/references/reference-calibration.md`
- `ui-engineering-suite/references/visual-qa.md`

## Acceptance baseline

- Primary compact desktop baseline: **1355 × 752 CSS pixels**
- The baseline is responsive and is **not hardcoded as the only supported size**.
- Ready selector: **`.apex-workspace`**
- Device scale factor: `1`
- Page-only PNG captures; no browser chrome, cropping, CSS zoom, global scale,
  screenshot scaling, or browser zoom manipulation

## Modified files

Primary source:

- `src/index.css`

The existing Overview state/layout structure used by the CSS remains in:

- `src/components/workspace/GeneralViews.tsx`
- `src/components/workspace/ToolboxDrawers.tsx`
- `src/components/workspace/WorkspaceShell.tsx`

Public branding and synchronized preview assets:

- `public/apex-logo.svg`
- `public/favicon.svg`
- `dist/apex-logo.svg`
- `dist/favicon.svg`
- `dist/assets/index-BTCpQaQ2.css`

QA and documentation:

- `_qa/visual/capture_overview.py`
- `_qa/visual/generate_visual_reports.py`
- `_qa/visual/states.json`
- `_qa/visual/matrix.json`
- `UPGRADE_UI.md`

## Final visual changes

1. Replaced the residual dark/glass appearance with a clean, bright desktop
   canvas based on white surfaces, quiet blue-gray borders, soft elevation, and
   restrained green ambient gradients.
2. Refined the green system to match the references more closely: lime-tinted
   active navigation, natural green positive values, smoother green action
   gradients, and subtle green focus/hover states.
3. The application logo is rendered from `/apex-logo.svg`, the public APEX mark,
   instead of the earlier purple square treatment.
4. Calibrated the 1355 × 752 geometry against the supplied references:
   sidebar, search field, header status block, ticker reserve, main panel start,
   panel bottoms, Watchlist, chart, Order/Risk column, rail, and drawer tracks.
5. When a drawer is open, the header status content now reserves the drawer
   width so the Paper/Demo badge, clock, connection indicator, icons, and avatar
   align with the reference composition rather than extending behind the drawer.
6. Scanner keeps Order and Risk visible. Movers and Signals remove those panels
   and expand the center workspace without overlaying the chart.
7. Reduced harsh contrast and heavy effects throughout. Cards use very light
   vertical gradients, thin borders, compact soft shadows, smooth focus rings,
   and consistent radii.
8. Improved sidebar vertical rhythm. Settings, Help, and the status card now sit
   at the same visual level as the references instead of being forced against
   the very bottom edge.
9. Desktop panel bottoms align at approximately `y = 722` in the 752-pixel
   baseline, leaving the intentional soft canvas margin shown in the references.
10. Tablet/mobile behavior remains deliberate: collapsed icon sidebar, contained
    horizontal content, bottom toolbox, and drawer bottom sheets.

## Primary 1355 × 752 measurements

Playwright `getBoundingClientRect()` values from the final captures:

| State | Main | Watchlist | Chart | Positions | Order | Risk | Rail | Drawer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Overview | 1163.56 × 626.28 | 170.05 × 596.28 | 788.80 × 429.75 | 788.80 × 158 | 175.47 × 596.28 | 175.47 × 153.41 | 46.14 × 672.28 | — |
| Scanner | 931.56 × 626.28 | 170.05 × 596.28 | 556.80 × 429.75 | 556.80 × 158 | 175.47 × 596.28 | 175.47 × 153.41 | 47.14 × 672.28 | 231 × 672.28 |
| Movers | 931.56 × 626.28 | 205.95 × 596.28 | 704.89 × 429.75 | 704.89 × 158 | hidden | hidden | 47.14 × 672.28 | 231 × 672.28 |
| Signals | 931.56 × 626.28 | 205.95 × 596.28 | 704.89 × 429.75 | 704.89 × 158 | hidden | hidden | 47.14 × 672.28 | 231 × 672.28 |

Additional calibrated baseline positions:

- Workspace: `0, 0, 1355 × 752`
- Sidebar width: `144.30`
- Header height: `49.72`
- Search: `x=159.47`, `width=325.19`
- Open-state trading badge: `x=743.77`
- Main panels begin at `y=125.72`
- Main panels and open drawers end at `y=722`
- Scanner drawer begins at `x=1124`

## State behavior validation

Automated checks passed:

- one drawer at a time
- correct active rail button
- Scanner keeps Order/Risk
- Movers hides Order/Risk
- Signals hides Order/Risk
- rail remains available after closing
- closing clears the active drawer and restores Order/Risk
- tool switching does not navigate or reload the Overview route

Machine-readable report: `_qa/visual/states.json`.

## Tested resolutions

Every state (`overview`, `scanner`, `movers`, `signals`) was captured in a fresh
browser context at:

- 1280 × 720
- 1355 × 752
- 1366 × 768
- 1440 × 900
- 1536 × 864
- 1600 × 900
- 1920 × 1080

Additional responsive captures:

- 768 × 1024 — Scanner bottom sheet
- 390 × 844 — Signal Pulse bottom sheet

Across the required desktop matrix:

- no document-level horizontal overflow
- no document-level vertical overflow
- `.apex-workspace` exactly matched each requested viewport
- generated PNG dimensions matched the CSS viewport at DPR 1
- no Playwright page errors
- all state behavior checks passed

Machine-readable report: `_qa/visual/matrix.json`.

## Final screenshots

Baseline:

- `_qa/visual/final-1355x752-overview.png`
- `_qa/visual/final-1355x752-scanner.png`
- `_qa/visual/final-1355x752-movers.png`
- `_qa/visual/final-1355x752-signals.png`
- `_qa/visual/final-1355x752-report.json`

Responsive:

- `_qa/visual/responsive-final-768x1024-scanner.png`
- `_qa/visual/responsive-final-390x844-signals.png`

Matrix naming:

- `_qa/visual/matrix-<width>x<height>-<state>.png`
- `_qa/visual/matrix-<width>x<height>-report.json`

## Functionality and data integrity

The intended model remains unchanged:

**real market data + virtual balance + simulated trading**

No real exchange execution was enabled. No live values were replaced with mock,
random, placeholder, or hardcoded trading data. Account balance, margin,
leverage, fees, realized/unrealized P&L, stop-loss, take-profit, and execution
services were not edited.

The isolated QA preview uses the existing static `dist` output because the local
package mirror could not restore the project dependencies. API routes therefore
return 404 in this preview, and screenshots honestly show degraded/locked empty
states instead of fabricated prices or candles. The source and production data
paths remain untouched.

## Remaining visual differences

- Populated prices, candles, positions, order values, and scanner/signal rows in
  the references cannot appear in the isolated static preview without the real
  API runtime; no data was fabricated to imitate them.
- The supplied references contain richer chart-toolbar and market-stat details
  than the current `PriceChart` component exposes. This pass intentionally
  stayed CSS-focused and did not add decorative nonfunctional controls.
- The references have unknown DPR/display scaling. Composition was calibrated
  from runtime CSS-pixel measurements rather than raw PNG dimensions.
