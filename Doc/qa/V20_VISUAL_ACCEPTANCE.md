# V20 Visual Acceptance Contract

**Status:** Structural contract restored from the audited baseline and reconciled with the current split-page implementation. This file defines acceptance criteria; it does not certify that current browser or visual QA has passed.

## Required viewport

- Browser viewport: `1368 × 753 CSS px`
- Browser zoom: `100%`
- Canonical screenshot scale: device scale factor 1
- Windows display scaling should be checked at 100% and 125%, while preserving the same CSS viewport for the canonical capture

## Routes

Capture these active routes after starting the backend:

```text
#/watchlist
#/orders
#/positions
#/alerts
#/history
#/analytics
#/settings
#/help
```

## Acceptance conditions

1. The canonical desktop shell preserves the 184 px left-navigation contract and 56 px header contract at the target viewport.
2. Each route exposes its active page-specific 280 px context area at the target viewport.
3. Metric cards preserve the established compact geometry and readable icon, boundary, and semantic-state treatment.
4. Tables retain compact rows, stable headers, and internal scrolling without page-wide horizontal overflow.
5. Gauges, donuts, progress indicators, and sparklines render only from supported normalized data.
6. Empty, loading, stale, partial, locked, disconnected, and error states remain inside the same page geometry.
7. Reference screenshots remain QA inputs only and are never used as page backgrounds.
8. Controls that mutate account or configuration state continue to use protected backend routes and honest confirmation/error states.
9. Keyboard navigation, focus visibility, reduced motion, light/dark themes, zoom, and small-screen fallback remain functional.
10. A structural source-contract pass is not sufficient for visual acceptance; the built application must also be captured and reviewed.

## Automated structural contract

```bash
npm run qa:v20-contract
```

This verifies the eight route/reference identities, active split-page routing, page-specific context rails, normalized workspace endpoint, shared primitives, target geometry, central stylesheet loading, and absence of screenshot-as-background behavior.

## Browser and visual evidence

A release claiming V20 visual acceptance must additionally record:

- Node/npm and browser versions;
- the exact build/commit/archive identity;
- 1368×753 screenshots for all eight routes;
- application console/network errors;
- accessibility results;
- manual review of overflow, focus, long text, empty/loading/error states, and both themes.

No historical screenshot index or pixel-diff summary may be treated as current evidence unless its referenced image files are present and the archive identity matches the tested tree.

## Data-truthfulness deviations from reference mockups

- **Watchlist Asset Assistant facts:** market cap, circulating supply, max supply, rank, and all-time high are not available from the current futures ticker contract. Do not fabricate them. Display only supported fields until a governed metadata provider is added.
- **Watchlist tags:** category chips may use the existing `assetSets` mapping. They must not be described as external token metadata.
- **Sparklines:** do not synthesize historical price paths from 24-hour summary values. Render provider-supplied time-series points or an honest unavailable state.
- **Live-data values:** mockup numbers are not expected to equal live/demo data. Differences in values are acceptable; missing structure or misleading placeholders are not.

## Open reference differences requiring product confirmation

The current shell still renders `DEMO TRADING` and formats the clock as `HH:MM:SS UTC`. The historical V20 reference uses `PAPER TRADING` and `UTC HH:MM:SS`. These remain explicit product/visual decisions, not silently accepted parity. Do not change account semantics or time formatting solely to reduce a screenshot diff without an approved product decision and route-level regression coverage.
