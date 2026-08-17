# APEX UI Redesign and Backend Integration Plan — V3

**Status:** Upgraded implementation source of truth  
**Target project:** `apex-unified-terminal`  
**Canonical desktop viewport:** **1368 × 753 CSS pixels**  
**Reference screenshots:** **1672 × 941 pixels**  
**Frontend:** React 19, TypeScript 5.8, Vite 6, Lucide React, Motion, Recharts, D3  
**Backend:** Express 4, account services, Demo/Live execution modes, KuCoin adapters, market-data aggregation, operations and decision-memory routes  
**Primary browser:** Chromium / Microsoft Edge on Windows  
**Browser zoom:** 100%

---

## 1. Decision

The attached screenshots define the visual composition, hierarchy, softness, density, and component relationships. They do **not** define the production viewport.

The production UI must be implemented at **1368 × 753**, with the screenshots first normalized into that viewport. The application must not:

- use the screenshots as raster backgrounds;
- stretch the screenshots non-uniformly;
- apply `transform: scale()` to the application shell;
- copy the screenshots' 1672 × 941 coordinates directly;
- shrink the complete UI to force it into the target viewport;
- fabricate financial values to make charts or cards appear populated.

The implementation must reproduce the same visual language with real React components, real layout rules, real loading states, and real backend data.

---

## 2. Reference normalization method

### 2.1 Measured source and target ratios

```text
Source screenshots: 1672 × 941
Target viewport:     1368 × 753

Horizontal ratio:    1368 / 1672 = 0.818182
Vertical ratio:       753 / 941 = 0.800213
```

The two ratios are not identical because the target viewport is proportionally wider.

A direct X/Y stretch would distort:

- circles and coin icons;
- gauges and donut charts;
- card corner radii;
- typography;
- spacing rhythm;
- logo proportions.

Therefore, the reference must be normalized with a **height-led scale**:

```text
Primary visual scale: 0.800213
Normalized source width at that scale: 1337.96px
Horizontal surplus in target viewport: 30.04px
```

The approximately **30px horizontal surplus** is not applied as image stretching. It is redistributed into flexible content columns and gutters.

### 2.2 Normalization rules

Use the following rules when translating any screenshot measurement:

1. **Vertical measurements**  
   `target = round(source × 0.800213)`

2. **Fixed-width visual objects**  
   Logo marks, icons, gauges, avatars, radii, and side panels also begin with the height-led factor.

3. **Flexible widths**  
   Tables, charts, card grids, and search fields consume the remaining width after fixed regions are established.

4. **Typography**  
   Never scale fonts with CSS transforms. Convert source appearance into the closest production token and maintain readable minimums.

5. **Controls**  
   A scaled control may be rounded upward to the nearest supported control token: `28`, `32`, `36`, or `40px`.

6. **Spacing**  
   A scaled spacing value is normalized to the spacing system: `2`, `4`, `6`, `8`, `10`, `12`, `16`, `20`, or `24px`.

7. **Borders**  
   Borders remain `1px`; they are not scaled below one CSS pixel.

8. **Charts**  
   Chart drawing areas are responsive. Axis labels, line widths, dots, and tooltip sizes use tokens rather than screenshot pixel scaling.

### 2.3 Measured visual bands from the screenshots

The following source ranges were measured across the eight screenshots and converted into canonical production values.

| Element | Source visual band | Raw scaled band | Canonical value |
|---|---:|---:|---:|
| Left sidebar | `220–226px` | `176–181px` | **180px** |
| Header | `60–64px` | `48–51px` | **52px** |
| Right context panel | `350–372px` | `280–298px` | **300px** |
| Main outer gutter | `14–18px` | `11–14px` | **12px** |
| Main/context gap | `13–16px` | `10–13px` | **12px** |
| Large card radius | `15–18px` | `12–14px` | **14px** |
| Standard control radius | `9–12px` | `7–10px` | **9px** |
| Navigation row | `43–48px` | `34–38px` | **38px** |
| Standard table row | `52–60px` | `42–48px` | **46px** |
| Compact table row | `46–52px` | `37–42px` | **40px** |
| KPI card height | `130–168px` | `104–134px` | page-specific |
| Context-panel inner padding | `14–18px` | `11–14px` | **12px** |

These values are the basis of the upgraded plan.

---

## 3. Canonical 1368 × 753 shell

### 3.1 Exact shell geometry

| Region | X | Y | Width | Height |
|---|---:|---:|---:|---:|
| Sidebar | `0` | `0` | **180px** | **753px** |
| Header | `180px` | `0` | **1188px** | **52px** |
| Page viewport | `180px` | `52px` | **1188px** | **701px** |
| Stage left/right padding | — | — | **12px each** | — |
| Stage top/bottom padding | — | — | — | **12px each** |
| Main/context gap | — | — | **12px** | — |
| Right context panel | `1056px` | `64px` | **300px** | **677px** |
| Main content | `192px` | `64px` | **852px** | **677px** |

Width equation:

```text
1368
- 180 sidebar
- 24 stage horizontal padding
- 12 main/context gap
- 300 context panel
= 852px main content
```

Height equation:

```text
753
- 52 header
- 24 stage vertical padding
= 677px usable page height
```

### 3.2 Root overflow contract

The desktop shell must never produce a browser-level scrollbar at the canonical viewport.

```css
html,
body,
#root {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  margin: 0;
  overflow: hidden;
}

.apex-shell {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.apex-stage {
  display: grid;
  grid-template-rows: 52px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.apex-stage-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
}

.apex-page-main,
.apex-context-panel {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
```

Only these regions may scroll:

- table bodies;
- long activity lists;
- right-panel internal content;
- settings form body when the viewport height is below the canonical height;
- drawers and modal bodies.

### 3.3 Sidebar geometry

| Element | Value |
|---|---:|
| Width | `180px` |
| Logo area | `52px` high |
| Logo mark | `30 × 30px` |
| Wordmark | `20px`, weight `800`, letter-spacing `0.12em` |
| Navigation inset | `10px` |
| Navigation row | `38px` |
| Navigation icon | `18px` |
| Icon/text gap | `10px` |
| Active row radius | `11px` |
| Main section gap | `2px` |
| Bottom status card | `156 × 74px` |
| Bottom inset | `10px` |

The active navigation item uses a low-opacity green surface, not a saturated gradient.

### 3.4 Header geometry

| Element | Value |
|---|---:|
| Height | `52px` |
| Horizontal padding | `12px` |
| Search field | `360 × 34px` |
| Search radius | `9px` |
| Mode badge | `104 × 32px` |
| Icon target | `32 × 32px` |
| Header icon | `17px` |
| Avatar | `30 × 30px` |
| Standard gap | `10px` |
| Compact gap | `6px` |

The search field supports:

- market symbol search;
- route navigation;
- recent searches;
- `Ctrl/Cmd + K`;
- arrow-key selection;
- Escape to close;
- Enter to navigate.

---

## 4. Layout families

The screenshots show three related but distinct layout families. They must share tokens and shell components but not be forced into one internal grid.

### 4.1 Data workspace

Pages:

- Watchlist
- Orders
- Positions
- Alerts
- History
- Analytics

Structure:

```text
Sidebar | Header
        | Main data canvas | Context panel
```

The right panel remains visible at 1368px because it is central to the approved visual composition.

### 4.2 Service workspace

Pages:

- Settings
- Help

The main 852px column may contain a local navigation rail or knowledge hierarchy. The global 300px context panel remains present.

### 4.3 Terminal workspace

Pages:

- Overview
- Trading
- Markets
- Portfolio, where relevant

The reference screenshots supplied in this turn mainly define the data and service workspaces. Terminal pages retain the same shell, tokens, and scale, while their chart/order geometry is handled independently.

---

## 5. Page-by-page canonical geometry

All page values below fit inside the **852 × 677px** main canvas and **300 × 677px** context panel.

## 5.1 Watchlist

### Main canvas

```text
Summary card row:       132px
Gap:                     10px
Category chip row:       34px
Gap:                     10px
Search/filter toolbar:   36px
Gap:                     10px
Watchlist table:        445px
Total:                  677px
```

Summary cards:

```text
Columns: 4
Gap: 10px
Card width: (852 - 30) / 4 = 205.5px
Production width: fluid minmax(0, 1fr)
Card height: 132px
```

Table:

- header: `34px`;
- rows: `46px`;
- footer: `34px`;
- internal vertical scrolling after eight visible rows;
- selected row: quiet green background and one-pixel green border;
- chart cells: SVG sparklines, never image snippets.

### Context panel: Asset Assistant

```text
Header:                 44px
Asset identity/value:   70px
Range tabs:             36px
Price chart:           150px
Sentiment:             122px
Key facts:             134px
Tags:                   48px
Primary action:         38px
Secondary actions:      35px
Internal gaps/padding: remaining space
```

Selection of a table row updates the context panel without a page reload.

## 5.2 Orders

### Main canvas

```text
Page heading:            48px
Gap:                      8px
Summary cards:          108px
Gap:                     10px
Status tabs:             34px
Filter toolbar:          36px
Gap:                      8px
Orders table:           425px
Total:                  677px
```

Summary cards:

- five columns;
- `8px` gap;
- flexible widths;
- `108px` height;
- each card contains one metric, one helper line, and one compact sparkline.

Orders table:

- header: `34px`;
- row: `46px`;
- progress indicator height: `5px`;
- selected order row: green-tinted background;
- footer pagination: `38px`.

### Context panel: Order Assistant

```text
Panel header:            42px
Selected order:         172px
Fill progress:          126px
Execution quality:      124px
Quick actions:          164px
Live-data status:        49px
Total:                  677px
```

Do not implement fake modification. Until the backend supports an atomic order modification endpoint, the UI must explain that modification means cancel and recreate.

## 5.3 Positions

### Main canvas

```text
Page heading:            44px
Gap:                      8px
Summary cards:          104px
Gap:                     10px
Positions panel:        511px
Total:                  677px
```

Summary cards:

- five columns;
- `8px` gaps;
- `104px` height;
- numerical values use tabular numbers.

Positions table:

- toolbar/header area: `64px`;
- table header: `34px`;
- row: `54px`;
- total row: `40px`;
- bottom tip: `42px`.

### Context panel

```text
Exposure by Asset:      198px
Gap:                     10px
Leverage Distribution: 142px
Gap:                     10px
Account Risk:           317px
Total:                  677px
```

The risk gauge must be derived from real margin and liquidation inputs. If the inputs are unavailable, display the exact available values and an “Unable to calculate risk” state.

## 5.4 Alerts

### Main canvas

```text
Page heading:            44px
Gap:                      8px
Summary cards:          118px
Gap:                     10px
Alerts table:           497px
Total:                  677px
```

Summary cards:

- five columns;
- `8px` gaps;
- `118px` height.

Alerts table:

- toolbar: `46px`;
- header: `34px`;
- row: `54px`;
- footer/pagination: `38px`.

### Context panel

```text
Smart Alert Builder:    290px
Gap:                     10px
Recent Triggers:        150px
Gap:                     10px
Quick Templates:        217px
Total:                  677px
```

Creating an alert remains disabled or local-only until persistent alert routes are implemented.

## 5.5 History

### Main canvas

```text
Page heading:            44px
Gap:                      8px
Summary cards:          104px
Gap:                     10px
Activity type tabs:      34px
Filter toolbar:          38px
Gap:                      8px
History table:          431px
Total:                  677px
```

History table:

- header: `34px`;
- row: `48px`;
- pagination: `38px`;
- amount cell displays native amount and converted value only when both are available.

### Context panel

```text
Recent Timeline:        260px
Gap:                     10px
Export & Reports:       145px
Gap:                     10px
Activity Insights:      252px
Total:                  677px
```

The export actions must use real backend data and server-generated files where possible.

## 5.6 Analytics

### Main canvas

```text
Heading/filter row:      44px
Gap:                      8px
Metric cards:           124px
Gap:                     10px
Upper chart row:        218px
Gap:                     10px
Lower chart row:        263px
Total:                  677px
```

Metric cards:

- five columns;
- `8px` gaps;
- `124px` height.

Upper chart grid:

```text
Cumulative P&L:  506px
Gap:              10px
Allocation:      336px
```

Lower chart grid:

```text
Monthly performance:  506px
Gap:                    10px
P&L heatmap:           336px
```

### Context panel

The 300px panel contains:

1. Strategy insight message;
2. Best strategy;
3. Strategy needing attention;
4. Top performers;
5. Risk decomposition;
6. Full report action.

Analytics must not show calculated metrics until the required history window is complete.

## 5.7 Settings

### Main canvas

```text
Local navigation: 198px
Gap:              10px
Settings body:    644px
Total width:      852px
Height:           677px
```

Local navigation rows:

- `46px` high;
- icon `18px`;
- active item uses a light neutral/green tint;
- no oversized decorative blocks.

Settings body sections:

- Account overview;
- Security and access;
- Appearance;
- Notifications;
- Trading preferences;
- API management;
- Connected devices.

Each section is a real form or status component, not a decorative mockup.

### Context panel

```text
Security Status:        294px
Gap:                     10px
Account Health:         170px
Gap:                     10px
Recommended Next Steps: 193px
Total:                  677px
```

Do not show a security score unless it is computed from real, documented inputs.

## 5.8 Help

### Main canvas

```text
Title and subtitle:      54px
Search:                  42px
Gap:                     12px
Topic cards:            132px
Gap:                     12px
FAQ:                    172px
Gap:                     12px
Tutorials:              241px
Total:                  677px
```

Topic cards:

- five columns;
- `8px` gaps;
- `132px` height;
- one icon, title, two lines of text, and a directional action.

Tutorial cards:

- four columns;
- thumbnail ratio `16:9`;
- image uses `object-fit: cover`;
- no image stretching.

### Context panel

```text
Contact Support:        264px
Gap:                     10px
System Status:          176px
Gap:                     10px
Announcements:          217px
Total:                  677px
```

All contact values and announcements must be configuration-driven.

---

## 6. Visual tokens

### 6.1 Color system

```css
:root {
  --apex-green-050: #F2FBF3;
  --apex-green-100: #E4F7E7;
  --apex-green-200: #C7ECCD;
  --apex-green-500: #2DBE45;
  --apex-green-600: #18A83A;
  --apex-green-700: #148531;

  --apex-red-050: #FFF3F4;
  --apex-red-500: #F04452;
  --apex-orange-500: #FB921A;
  --apex-blue-500: #2890EA;
  --apex-violet-500: #775CE6;
  --apex-teal-500: #12AFA1;

  --apex-ink-950: #091720;
  --apex-ink-900: #17233A;
  --apex-ink-700: #33425B;
  --apex-muted-600: #6E7C91;
  --apex-muted-400: #98A3B3;

  --apex-canvas: #F8FAF9;
  --apex-surface: #FFFFFF;
  --apex-surface-soft: #FBFCFB;
  --apex-surface-selected: #F1FAF2;
  --apex-border: #DDE7E1;
  --apex-divider: #EDF2EE;

  --apex-shadow-xs: 0 1px 2px rgba(9, 23, 32, 0.025);
  --apex-shadow-sm: 0 5px 18px rgba(9, 23, 32, 0.040);
  --apex-shadow-md: 0 12px 32px rgba(9, 23, 32, 0.060);
}
```

Usage rules:

- green is reserved for active, positive, connected, and primary actions;
- red is reserved for negative, sell, cancel, and error;
- orange is warning or partial state;
- violet and blue distinguish analytical categories;
- use white surfaces over a barely tinted canvas;
- avoid thick shadows and dark sidebars.

### 6.2 Typography

Preferred family:

```css
font-family: Inter, "Segoe UI", system-ui, sans-serif;
font-variant-numeric: tabular-nums;
```

Use JetBrains Mono only for IDs or dense technical values where it improves scanning.

| Role | Size | Weight | Line height |
|---|---:|---:|---:|
| Wordmark | `20px` | `800` | `1` |
| Page title | `20px` | `720` | `1.15` |
| Page subtitle | `11px` | `450` | `1.35` |
| Panel title | `12px` | `700` | `1.2` |
| Card label | `10px` | `650` | `1.2` |
| Body/table | `10.5px` | `500` | `1.3` |
| Table header | `9.5px` | `700` | `1.2` |
| Helper text | `9px` | `500` | `1.3` |
| Primary metric | `19–22px` | `720` | `1.05` |
| Numeric table value | `10.5px` | `600` | `1.2` |

### 6.3 Radius and spacing

```css
:root {
  --radius-xs: 6px;
  --radius-control: 9px;
  --radius-card: 12px;
  --radius-panel: 14px;
  --radius-drawer: 16px;

  --space-1: 2px;
  --space-2: 4px;
  --space-3: 6px;
  --space-4: 8px;
  --space-5: 10px;
  --space-6: 12px;
  --space-8: 16px;
  --space-10: 20px;
  --space-12: 24px;
}
```

### 6.4 Images, icons, and charts

| Asset | Canonical size |
|---|---:|
| Sidebar logo mark | `30px` |
| Navigation icon | `18px` |
| Header icon | `17px` in `32px` target |
| Metric icon circle | `30px` |
| Table asset icon | `24px` |
| Assistant asset icon | `28px` |
| Empty-state icon | `28px` |
| Small status dot | `7px` |
| Tutorial thumbnail | `16:9` |

Rules:

- `object-fit: contain` for logos and crypto icons;
- `object-fit: cover` for tutorial thumbnails;
- SVG line width: `1.5px`;
- sparkline line width: `1.5px`;
- primary chart line width: `2px`;
- chart grid color: `#EDF2EE`;
- no rasterized charts.

---

## 7. Layering and motion

### 7.1 Z-index contract

| Layer | Z-index |
|---|---:|
| Canvas | `0` |
| Standard panels | `10` |
| Sticky table tools | `20` |
| Sidebar/header/context shell | `30` |
| Dropdown/popover | `40` |
| Drawer | `50` |
| Modal and confirmation | `60` |
| Toast | `70` |

No component may introduce arbitrary values such as `9999`.

### 7.2 Motion

```css
:root {
  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --ease-standard: cubic-bezier(.2, 0, 0, 1);
  --duration-fast: 120ms;
  --duration-normal: 190ms;
  --duration-drawer: 240ms;
  --duration-chart: 360ms;
}
```

Use motion for:

- selected row changes;
- tab indicators;
- dropdowns and drawers;
- chart updates;
- button press feedback.

Do not animate constantly changing numbers with bouncing, flashing, or pulsing effects.

---

## 8. Frontend architecture upgrade

The current project contains large view files and a long CSS history. The redesign must be migrated into a clear structure instead of adding another full-app override.

Recommended structure:

```text
src/
  app/
    AppRouter.tsx
    AppProviders.tsx
    shell/
      AppShell.tsx
      PrimarySidebar.tsx
      AppHeader.tsx
      ContextPanel.tsx
      shell.types.ts

  pages/
    watchlist/
    orders/
    positions/
    alerts/
    history/
    analytics/
    settings/
    help/

  features/
    market/
    account/
    orders/
    alerts/
    analytics/
    settings/
    help/
    system-status/

  components/
    ui/
      Button.tsx
      Card.tsx
      Tabs.tsx
      Field.tsx
      DataTable.tsx
      EmptyState.tsx
      StatusBadge.tsx
    charts/
    assets/

  services/
    apiClient.ts
    accountClient.ts
    marketClient.ts
    alertsClient.ts
    analyticsClient.ts
    helpClient.ts

  styles/
    tokens.css
    reset.css
    shell.css
    controls.css
    cards.css
    tables.css
    charts.css
    pages/
      watchlist.css
      orders.css
      positions.css
      alerts.css
      history.css
      analytics.css
      settings.css
      help.css
    legacy-compat.css
```

Migration rules:

1. `App.tsx` becomes routing and provider composition only.
2. Split `GeneralViews.tsx` into page modules.
3. Split `AccountViews.tsx` into Orders, Positions, History, and Analytics features.
4. Keep `WorkspaceShell.tsx` temporarily, then replace it with `AppShell`.
5. Move canonical shell geometry out of the existing large `index.css`.
6. Keep one temporary `legacy-compat.css`.
7. Remove migrated declarations from old files after each page passes visual QA.
8. Never append a third complete override layer.

---

## 9. Backend connection strategy

The user interface should be connected **progressively**, so layout defects and data defects are not mixed together.

### Phase A — Visual contract only

- create the shell;
- create page grids;
- use typed fixture objects;
- verify exact dimensions at 1368 × 753;
- verify loading, empty, error, and locked states;
- no write operations.

### Phase B — Read-only market data

Connect:

- `GET /api/market/top-volume`
- `GET /api/market/gainers-losers`
- `GET /api/market/correlation`
- `GET /api/market/sentiment`
- `GET /api/market/candidates`
- `GET /api/market/symbol/:symbol`
- `GET /api/market/majors`
- existing KuCoin/Binance candle and ticker routes where required.

Pages:

- Watchlist;
- Markets;
- Asset Assistant;
- parts of Analytics.

### Phase C — Read-only account data

Connect:

- `GET /api/account/connection`
- `GET /api/account/portfolio`
- `GET /api/operations/status`
- `GET /api/health`
- `GET /api/security/bootstrap`

Pages:

- Orders;
- Positions;
- History summary;
- Settings status;
- Help system status.

### Phase D — Existing safe write flows

Connect:

- `POST /api/account/mode`
- `POST /api/account/demo/reset`
- `POST /api/account/orders/preview`
- `POST /api/account/orders`
- `POST /api/account/orders/:id/cancel`
- `POST /api/account/connect`
- `DELETE /api/account/connection`

Rules:

- retain Demo/Live labels;
- retain server-side preview;
- retain confirmation requirements;
- remain fail-closed;
- show exact backend errors;
- never assume success before the response returns.

### Phase E — New backend capabilities

Add only when the page requires them.

| Endpoint | Purpose |
|---|---|
| `GET /api/account/history?cursor=&type=&from=&to=` | Paginated account activity |
| `GET /api/account/analytics?range=7d|30d|90d` | Server-derived P&L and risk metrics |
| `GET /api/alerts` | Persistent alerts |
| `POST /api/alerts` | Create an alert |
| `PATCH /api/alerts/:id` | Edit or toggle an alert |
| `DELETE /api/alerts/:id` | Delete an alert |
| `GET /api/help/topics` | Configurable help topics |
| `GET /api/help/announcements` | Configurable announcements |
| `GET /api/settings/profile` | Profile/settings state, if not already available |
| `PATCH /api/settings/profile` | Persist supported settings |

Do not add endpoints solely to populate decorative cards.

### 9.1 Page-to-data map

| Page | Existing source | Additional source |
|---|---|---|
| Watchlist | market routes | optional persisted watchlist |
| Orders | account portfolio/orders | pagination endpoint if snapshot is limited |
| Positions | account portfolio | none initially |
| Alerts | local state initially | persistent alert CRUD |
| History | account snapshot | paginated history |
| Analytics | account snapshot + market data | server analytics series |
| Settings | connection/security/status | settings persistence |
| Help | health/operations | topics and announcements |

### 9.2 Typed view models

Missing values must be `null`, not `0`.

Required models:

```ts
type Availability = "loading" | "ready" | "empty" | "error" | "locked";

interface MetricVM<T> {
  value: T | null;
  availability: Availability;
  updatedAt?: string;
  source?: string;
}

interface OrderVM { /* normalized order fields */ }
interface PositionVM { /* normalized position fields */ }
interface ActivityVM { /* normalized activity fields */ }
interface MarketRowVM { /* normalized market fields */ }
interface AssetAssistantVM { /* selected asset context */ }
interface RiskSummaryVM { /* derived, documented risk fields */ }
interface AnalyticsVM { /* time series and availability */ }
```

---

## 10. Data freshness and request behavior

| Data | Recommended refresh |
|---|---:|
| Market ticker cards | `15s` |
| Selected asset quote | `5–10s` |
| 1-minute candle data | minimum `15s` |
| Larger candle intervals | `30–60s` |
| Account snapshot | `8s` while visible |
| Health and operations | `30s` |
| Alerts | `15–30s` when server-backed |
| Help topics/settings | on demand |
| Announcements | `5m` |

Implementation rules:

- pause nonessential polling when the browser tab is hidden;
- abort stale requests when symbol, range, or page changes;
- preserve previous valid data during a refresh;
- show stale-data status when the freshness threshold is exceeded;
- do not replace a failed numeric request with zero;
- centralize request cancellation and error normalization.

---

## 11. State design

Every data-driven component must implement:

### Loading

- preserve final dimensions;
- use low-contrast skeletons;
- avoid layout shifts.

### Empty

- state what is missing;
- distinguish “no records” from “source unavailable”;
- offer one relevant next action.

### Error

- plain-language error;
- Retry action;
- technical details logged separately;
- no fabricated fallback values.

### Locked

- explain Demo/Live or connection requirements;
- preserve page geometry;
- link to the relevant Settings section.

---

## 12. Responsive behavior

The canonical target is 1368 × 753. Other widths use breakpoint-specific layouts rather than global scaling.

| Width | Sidebar | Context panel | Main behavior |
|---:|---:|---:|---|
| `>=1600px` | `192px` | `320px` | More chart/table width |
| `1440–1599px` | `184px` | `308px` | Comfortable desktop |
| `1368–1439px` | **`180px`** | **`300px`** | Canonical layout |
| `1280–1367px` | `172px` | `284px` | Compact gaps/cards |
| `1120–1279px` | `72px` icon rail | `300px` overlay | Main content preserved |
| `<1120px` | `64px` icon rail | overlay/bottom sheet | Functional fallback |

Height rules:

| Height | Behavior |
|---:|---|
| `>=753px` | canonical geometry |
| `700–752px` | reduce internal gaps by `2px`; context sections scroll |
| `640–699px` | compact heading/KPI heights; tables scroll internally |
| `<640px` | functional fallback, not pixel-comparison target |

Never hide the right context panel at the canonical target.

---

## 13. Accessibility

1. Visible focus on every interactive element.
2. Minimum target `32 × 32px`.
3. Primary buttons at least `34px` high.
4. Table headers are semantic and announce sort state.
5. Positive/negative state uses text or icons in addition to color.
6. Drawers and modals trap focus and restore it after close.
7. Escape closes temporary surfaces.
8. Charts and gauges expose text equivalents.
9. Tooltips are keyboard reachable.
10. Respect reduced motion and Windows high-contrast mode.

---

## 14. Visual QA and acceptance tests

### 14.1 Required viewport tests

```text
1368 × 753, DPR 1.0, browser zoom 100%
1368 × 753, DPR 1.25, browser zoom 100%
1440 × 900
1280 × 720
```

### 14.2 No-scroll assertions

At 1368 × 753:

```js
document.documentElement.scrollWidth === 1368
document.documentElement.scrollHeight === 753
document.body.scrollWidth === 1368
document.body.scrollHeight === 753
```

The shell must not overflow by even one CSS pixel.

### 14.3 Geometry tolerance

| Element | Tolerance |
|---|---:|
| Sidebar width | `±1px` |
| Header height | `±1px` |
| Context width | `±1px` |
| Main/context gap | `±1px` |
| Major panel bounds | `±2px` |
| Internal card/row heights | `±2px` |
| Icon size | `±1px` |

### 14.4 Visual-diff process

1. Capture each page at 1368 × 753.
2. Compare against the normalized reference composition.
3. Use an opacity overlay at 50%.
4. Correct shell geometry before typography.
5. Correct major panels before card internals.
6. Correct typography before micro-spacing.
7. Correct colors and shadows last.
8. Re-run overflow and keyboard tests after each page.

The expected result is compositional equivalence, not a raster-perfect copy of anti-aliasing.

---

## 15. Implementation order

### Milestone 1 — Scale and shell

- add tokens;
- implement `180 / 52 / 300` shell;
- add screenshot harness;
- add overflow tests;
- verify all eight empty page canvases.

### Milestone 2 — Shared components

- card;
- metric card;
- table;
- toolbar;
- tabs;
- status badge;
- context section;
- chart frame;
- empty/error/locked state.

### Milestone 3 — Watchlist and Positions

These pages validate:

- row selection;
- asset context updates;
- summary cards;
- tables;
- gauges and donuts.

### Milestone 4 — Orders and History

These pages validate:

- account data normalization;
- progress cells;
- timelines;
- pagination;
- export flows.

### Milestone 5 — Alerts and Analytics

These pages validate:

- forms;
- chart composition;
- heatmaps;
- availability rules;
- new backend endpoints.

### Milestone 6 — Settings and Help

These pages validate:

- local navigation;
- configuration persistence;
- status integration;
- knowledge search;
- announcements.

### Milestone 7 — Write flows and hardening

- order preview/submit/cancel;
- persistent alerts;
- settings writes;
- keyboard and screen-reader review;
- reduced-motion review;
- 1368 × 753 final visual regression.

---

## 16. Definition of done

The redesign is complete only when:

1. All eight pages match the normalized screenshot composition at 1368 × 753.
2. The sidebar is `180px`, header is `52px`, and context panel is `300px`.
3. There is no browser-level scrollbar at the canonical viewport.
4. No screenshot is used as a production UI surface.
5. Images and icons retain their aspect ratios.
6. Every financial value has a documented backend or derived source.
7. Missing values never silently become zero.
8. Demo and Live modes remain explicit and safe.
9. All new write operations are server-confirmed.
10. Tables, charts, forms, drawers, and modals are keyboard usable.
11. The old CSS override cascade is reduced rather than expanded.
12. Playwright screenshots and overflow tests pass for every route.
