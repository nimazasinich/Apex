# APEX Strategy Studio — Pixel-Level Implementation Specification

**Document version:** 1.0  
**Reference artifact:** `apex_strategy_studio_dashboard.png`  
**Purpose:** Implementation handoff for an engineering agent building the Strategy Studio screen in HTML/CSS/JavaScript or a component framework.  
**Reference raster size:** **1690 × 931 px**  
**Required application viewport:** **1368 × 753 CSS px**  
**Reference-to-target scale:** `0.80947×` horizontally and `0.80881×` vertically.

> The reference is a generated raster mockup, so some one-pixel edges and antialiased colors are approximate. This document converts the visual into a deterministic, implementation-ready design system. Use the target measurements below as the source of truth rather than scaling the raster at runtime.

---

## 1. Screen objective

The Strategy Studio is the strategy-management layer of APEX. It allows users to:

- browse composite strategy collections;
- inspect a selected strategy;
- understand the strategy’s logic and configuration;
- see performance metrics and an equity preview;
- compare, save, or manually backtest a strategy;
- review ranking, validation status, regime coverage, and current performance;
- open the deeper research book.

The screen must feel like part of the existing APEX trading product, not a separate microsite.

---

# 2. Coordinate system and master layout

All dimensions in this document are **CSS pixels at a 1368 × 753 viewport**.

## 2.1 Global frame

| Region | X | Y | Width | Height |
|---|---:|---:|---:|---:|
| Full viewport | 0 | 0 | 1368 | 753 |
| Primary sidebar | 0 | 0 | 170 | 753 |
| Top application bar | 170 | 0 | 1198 | 55 |
| Collections column | 170 | 55 | 222 | 698 |
| Strategy workspace | 392 | 55 | 667 | 698 |
| Insights column | 1059 | 55 | 309 | 698 |

### Main vertical separators

- Sidebar right divider: `x = 169px`, `1px`.
- Collections/workspace divider: `x = 391px`, `1px`.
- Workspace/insights divider: `x = 1058px`, `1px`.
- Header bottom divider: `y = 54px`, `1px`.

### Main background

- App background: `#FCFDFC`.
- Cards: `#FFFFFF`.
- No full-page gradients.
- No horizontal page scroll at 1368 px.

---

## 2.2 CSS grid recommendation

```css
.apex-shell {
  width: 100%;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 170px 222px minmax(0, 667px) 309px;
  grid-template-rows: 55px minmax(0, 1fr);
  background: var(--surface-app);
}

.primary-sidebar {
  grid-column: 1;
  grid-row: 1 / -1;
}

.topbar {
  grid-column: 2 / -1;
  grid-row: 1;
}

.collections-panel {
  grid-column: 2;
  grid-row: 2;
}

.strategy-workspace {
  grid-column: 3;
  grid-row: 2;
}

.insights-panel {
  grid-column: 4;
  grid-row: 2;
}
```

At widths between 1280 and 1439, the fixed values above should be preserved by reducing internal gaps and text density—not by introducing horizontal scrolling.

---

# 3. Design tokens

## 3.1 Color system

The following tokens normalize the colors visible in the mockup into reusable implementation colors.

```css
:root {
  /* Surfaces */
  --surface-app: #FCFDFC;
  --surface-sidebar: #FFFFFF;
  --surface-card: #FFFFFF;
  --surface-subtle: #F7F9F7;
  --surface-muted: #F3F6F4;
  --surface-green-soft: #EEF8EF;
  --surface-blue-soft: #EEF4FD;
  --surface-purple-soft: #F3F0FD;
  --surface-orange-soft: #FFF5E8;
  --surface-red-soft: #FFF0F2;

  /* Text */
  --text-primary: #10213B;
  --text-secondary: #5E6E83;
  --text-tertiary: #8794A6;
  --text-disabled: #A9B3C0;
  --text-inverse: #FFFFFF;

  /* Borders */
  --border-default: #DFE7E1;
  --border-subtle: #E9EEEA;
  --border-strong: #CAD6CC;
  --divider: #E7ECE8;

  /* Brand green */
  --green-700: #218B39;
  --green-600: #2DAA47;
  --green-500: #5FB764;
  --green-400: #81C981;
  --green-200: #BFE6C1;
  --green-100: #DDF2DF;
  --green-50: #EEF8EF;

  /* Semantic */
  --positive: #209A42;
  --negative: #E34C5E;
  --warning: #E89A29;
  --info: #4E89E8;
  --purple: #7C5FE4;
  --orange: #E49A36;

  /* Chart */
  --chart-green-line: #35A84B;
  --chart-green-fill-top: rgba(53, 168, 75, 0.22);
  --chart-green-fill-bottom: rgba(53, 168, 75, 0.02);
  --chart-blue-line: #4E89E8;
  --chart-red-line: #E75B68;
  --chart-grid: #E8EDE9;
  --chart-axis: #718096;

  /* Focus */
  --focus-ring: rgba(45, 170, 71, 0.26);
}
```

## 3.2 Gradient tokens

Only use gradients where they are clearly visible in the design.

```css
--gradient-primary-button:
  linear-gradient(90deg, #2DAA47 0%, #65BA67 100%);

--gradient-equity-fill:
  linear-gradient(180deg,
    rgba(53, 168, 75, 0.24) 0%,
    rgba(53, 168, 75, 0.03) 100%);

--gradient-score-gauge:
  linear-gradient(90deg,
    #D94249 0%,
    #E98B31 32%,
    #C9C83B 56%,
    #64B94E 78%,
    #218B39 100%);
```

## 3.3 Typography

Recommended font stack:

```css
font-family:
  Inter,
  ui-sans-serif,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Roboto,
  Helvetica,
  Arial,
  sans-serif;
```

| Role | Size | Line height | Weight | Color |
|---|---:|---:|---:|---|
| Page title | 22 px | 28 px | 700 | `--text-primary` |
| Section title | 14 px | 20 px | 700 | `--text-primary` |
| Card title | 12 px | 17 px | 650 | `--text-primary` |
| Body | 11 px | 16 px | 400 | `--text-secondary` |
| Navigation item | 11 px | 16 px | 600 | `--text-primary` |
| Metric value large | 18 px | 22 px | 700 | semantic |
| Metric label | 9 px | 13 px | 600 | `--text-secondary` |
| Caption | 9 px | 13 px | 400 | `--text-tertiary` |
| Badge | 8 px | 11 px | 600 | semantic |
| Button label | 10 px | 14 px | 600 | contextual |

### Letter spacing

- Titles: `-0.02em`.
- Buttons and labels: `0`.
- Uppercase metric/table headings, when used: `0.04em`.

---

## 3.4 Radius scale

```css
--radius-xs: 5px;
--radius-sm: 7px;
--radius-md: 9px;
--radius-lg: 11px;
--radius-xl: 14px;
--radius-pill: 999px;
```

Usage:

- Standard card: `9px`.
- Major selected-strategy card: `10px`.
- Navigation active state: `11px`.
- Badge: pill.
- Button: `7px`.
- Input: `8px`.

---

## 3.5 Border and elevation

```css
--shadow-card:
  0 1px 2px rgba(16, 33, 59, 0.025),
  0 4px 12px rgba(16, 33, 59, 0.025);

--shadow-hover:
  0 6px 18px rgba(16, 33, 59, 0.08);

--shadow-primary:
  0 5px 12px rgba(45, 170, 71, 0.18);
```

- Most cards: `1px solid var(--border-default)` plus `--shadow-card`.
- Internal subpanels: `1px solid var(--border-subtle)`, no shadow.
- Avoid dark or large drop shadows.
- Active green items use border color `--green-400`.

---

# 4. Spacing system

Use a 4 px base grid.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
```

### Standard rules

- Main-column horizontal padding: `16px`.
- Strategy workspace horizontal padding: `20px`.
- Right insights padding: `12px`.
- Card internal padding: `10–12px`.
- Card-to-card vertical gap: `10px`.
- Compact row gap: `6px`.
- Label-to-value gap: `3px`.
- Icon-to-label gap: `8px`.

---

# 5. Application shell

## 5.1 Primary sidebar

### Container

- Position: fixed or sticky left.
- Width: `170px`.
- Height: `753px`.
- Background: `#FFFFFF`.
- Right border: `1px solid --divider`.
- Padding: `0 8px 10px`.
- Content structure:
  1. Logo region.
  2. Primary navigation.
  3. Flexible spacer.
  4. Settings and Help.
  5. Connection card.

### Logo region

| Property | Value |
|---|---:|
| Height | 55 px |
| Left padding | 15 px |
| Logo mark size | 27 × 27 px |
| Gap mark/wordmark | 9 px |
| Wordmark height | 18 px |
| Vertical alignment | center |

- Do not recreate the APEX mark in CSS.
- Use the original vector or raster asset.
- Preserve aspect ratio and clear space.
- Logo group approximate target bounds: `x=20–112`, `y=15–38`.

### Navigation items

| Property | Value |
|---|---:|
| Item width | 154 px |
| Item height | 34 px |
| Left/right margin | 0/0 inside 8 px panel padding |
| Vertical gap | 3 px |
| Icon box | 18 × 18 px |
| Icon left | 11 px |
| Text left after icon | 10 px |
| Border radius | 11 px |

Default:

- Background transparent.
- Text `--text-primary`.
- Icon `#49637F`.

Active Strategies item:

- Background `linear-gradient(90deg, #F1FAF1, #EAF7EB)`.
- Border `1px solid #A9DCAA`.
- Text `--text-primary`.
- Icon `--green-700`.
- No heavy shadow.

Hover:

- Background `#F7FAF7`.
- Transition `120ms ease-out`.

### Bottom connection card

| Property | Value |
|---|---:|
| X | 8 px |
| Width | 154 px |
| Height | 70 px |
| Bottom | 10 px |
| Padding | 10 px |
| Radius | 10 px |

Content:

- Green dot: `7px`.
- “Market Data”: `9px`, secondary.
- “Connected”: `10px`, 600, positive.
- “Demo execution · real data”: `8px`, tertiary.
- Vertical line spacing: 3–4 px.

---

## 5.2 Top application bar

### Container

- X: `170px`.
- Y: `0`.
- Width: `1198px`.
- Height: `55px`.
- Background: `rgba(255,255,255,0.97)`.
- Border-bottom: `1px solid --divider`.
- Display: flex.
- Align-items: center.
- Padding: `0 18px`.

### Search field

| Property | Value |
|---|---:|
| Width | 470 px |
| Height | 36 px |
| Left | 182 px absolute viewport |
| Radius | 10 px |
| Background | `#FFFFFF` |
| Border | `1px solid #DCE5DF` |
| Inner padding | 12 px |
| Icon | 15 px |
| Shortcut pill | 25 × 18 px |

Placeholder:

- Size: `10px`.
- Color: `--text-tertiary`.

Search focus:

- Border: `--green-500`.
- Shadow: `0 0 0 3px var(--focus-ring)`.

### Header right cluster

Order:

1. Demo Trading button.
2. UTC time.
3. Connection indicator.
4. Bell.
5. Theme.
6. Avatar.

Recommended gaps:

- Demo to time: `16px`.
- Time to status: `12px`.
- Status to icons: `13px`.
- Icon-to-icon: `10px`.
- Avatar left gap: `12px`.

Demo Trading:

- `94 × 31px`.
- Border `1px solid --green-500`.
- Radius `7px`.
- Text `9px`, `600`, `--green-700`.
- Background white.

Avatar:

- `31 × 31px`.
- Background `--green-50`.
- Border `1px solid --green-200`.
- Text `10px`, `--green-700`.

---

# 6. Collections column

## 6.1 Panel container

- X: `170px`.
- Width: `222px`.
- Top: `55px`.
- Height: `698px`.
- Background: `#FFFFFF`.
- Border-right: `1px solid --divider`.
- Padding: `15px 15px 12px`.

## 6.2 Header

- “Collections”: `14px / 20px`, 700.
- Top position: `73px`.
- Subtitle: `9px / 14px`, secondary.
- Gap title/subtitle: `2px`.
- Gap subtitle/list: `10px`.

## 6.3 Collection buttons

Target dimensions:

- Width: `192px`.
- Height: `39px`.
- Gap: `6px`.
- Padding: `0 10px`.
- Radius: `8px`.
- Border: `1px solid --border-default`.
- Background: `#FFFFFF`.

Content:

- Icon circle/box: `17px`.
- Label: `10px`, 600.
- Count pill: minimum `25 × 18px`.
- Count background: `#F2F5F3`.
- Count text: `8px`, 600.

Active “High Conviction”:

- Border: `1px solid --green-500`.
- Background: `#FAFEFA`.
- Icon: `--green-700`.
- Count background: `--green-50`.
- Optional inner shadow: `inset 3px 0 0 #66BE6C`.

Hover:

- Transform: `translateY(-1px)`.
- Border: `--green-200`.
- Transition: `140ms`.

## 6.4 Quick Filters card

- Width: `192px`.
- Height: `105px`.
- Margin-top: `14px`.
- Padding: `11px`.
- Radius: `9px`.

Title row:

- Funnel icon: `16px`.
- Title: `11px`, 650.

Chips:

- First row begins `12px` below title.
- Row gap: `7px`.
- Chip gap: `5px`.
- Height: `21px`.
- Horizontal padding: `8px`.
- Radius: pill.
- Font: `8px`, 600.

Chip colors:

| Chip | Background | Text |
|---|---|---|
| Trending | `#EEF8EF` | `#278A3A` |
| Volatile | `#FFF0F2` | `#D94D5C` |
| Long/Short | `#F3F0FD` | `#7058D2` |
| Composite | `#FFF5E8` | `#C77B16` |
| AI-Assisted | `#EEF4FD` | `#3D75C8` |

## 6.5 Research Book card

- Width: `192px`.
- Height: `116px`.
- Margin-top: `14px`.
- Padding: `12px`.
- Radius: `9px`.

Elements:

- Icon + title row.
- Main copy top gap: `12px`.
- “12 Deep Research Models”: `13px`, 700.
- Supporting line: `9px`, secondary.
- Open Book button:
  - Width: `118px`.
  - Height: `25px`.
  - Margin-top: `10px`.
  - Background white.
  - Border green.
  - Radius `6px`.
  - Text `9px`, 600.

---

# 7. Strategy workspace

## 7.1 Workspace container

- X: `392px`.
- Width: `667px`.
- Top: `55px`.
- Height: `698px`.
- Padding: `17px 20px 0`.
- Background: `--surface-app`.
- Overflow: hidden at the page level.
- The Model Shelf may use a local horizontal carousel.

## 7.2 Page heading

Target bounds:

- X: `412px`.
- Y: `72px`.
- Title: “Strategy Studio”.
- Font: `22px`, 700, line-height `28px`.
- Subtitle: `10px`, 400, secondary.
- Subtitle top gap: `1px`.

## 7.3 Summary cards

Row starts approximately at:

- X: `412px`.
- Y: `126px`.
- Width available: `627px`.
- Gap: `9px`.
- Four cards, each approximately `150px × 51px`.

Each card:

- Padding: `9px 10px`.
- Radius: `9px`.
- Border: `1px solid --border-default`.
- Display flex, vertical center.
- Icon background circle: `31px`.
- Icon: `17px`.
- Text gap: `9px`.
- Main label/value: `11px`, 650.
- Supporting text: `9px`, secondary.

---

# 8. Featured strategy card

## 8.1 Outer card

| Property | Value |
|---|---:|
| X | 412 px |
| Y | 188 px |
| Width | 627 px |
| Height | 422 px |
| Padding | 11 px |
| Radius | 10 px |
| Border | 1 px |
| Background | white |

The card is divided into:

1. Header and tags.
2. Metrics row.
3. Core Logic and Equity Curve.
4. Configuration strip.
5. Action row.

## 8.2 Strategy header

Header height: approximately `50px`.

Left icon:

- Circle `27 × 27px`.
- Background `--green-50`.
- Icon `15px`, green.

Title:

- `12px`, 700.
- Line-height `17px`.

Description:

- `9px`, secondary.
- Maximum width `420px`.
- Two lines maximum.
- Truncate with ellipsis on narrow screens.

Right controls:

- Validated badge: `63 × 23px`.
- Overflow icon button: `23 × 23px`.
- Gap: `6px`.

Validated badge:

- Background `--green-50`.
- Text `--green-700`.
- Border `1px solid --green-100`.
- Shield icon `12px`.
- Font `8px`, 650.

## 8.3 Strategy tags

- Top gap: `8px`.
- Height: `18px`.
- Gap: `5px`.
- Font: `7.5–8px`, 600.
- Horizontal padding: `7px`.

Do not allow tags to wrap at 1368 px.

## 8.4 Metrics row

- Top: approximately `276px` viewport.
- Five equal metric cards.
- Row width: `607px`.
- Gap: `7px`.
- Card width: approximately `116px`.
- Height: `64px`.
- Padding: `9px 10px`.
- Radius: `8px`.

Metric content:

- Label: `8px`, secondary.
- Value: `17px`, 700.
- Sparkline:
  - Width `54px`.
  - Height `18px`.
  - Position bottom-right.
  - Stroke `1.5px`.
  - No point markers in idle state.

Semantic values:

- APEX Score: green.
- Win Rate: primary text.
- Net Return: positive.
- Max Drawdown: negative.
- Profit Factor: info blue.

## 8.5 Core Logic panel

- X within card: `11px`.
- Width: `260px`.
- Height: `141px`.
- Radius: `8px`.
- Border: subtle.
- Padding: `9px`.

Title:

- `9px`, 700.
- Bottom gap: `18px`.

Workflow:

- Six nodes in one row.
- Node center-to-center distance: approximately `39px`.
- Circle: `31px`.
- Icon: `16px`.
- Connector:
  - 1 px dashed or dotted.
  - Color `#D9E1DB`.
  - Centered behind nodes.
- Labels:
  - Width around `39px`.
  - Font `7px`, 600.
  - Line-height `10px`.
  - Center aligned.
  - Top gap `7px`.

Node semantic mapping:

| Node | Color |
|---|---|
| Regime Filter | Green |
| Opening Range | Blue |
| Volume Confirmation | Purple |
| Risk Engine | Orange |
| Backtest Engine | Red |
| Ranking Engine | Green |

## 8.6 Equity Curve panel

- Width: `337px`.
- Height: `141px`.
- Radius: `8px`.
- Border: subtle.
- Padding: `9px`.

Header:

- “Equity Curve”: `9px`, 700.
- “(Backtest)”: `8px`, secondary.
- Info icon `11px`.

Plot dimensions:

- Chart viewport approximately `310 × 108px`.
- Left plot padding: `10px`.
- Right axis width: `31px`.
- Top padding: `17px`.
- Bottom axis area: `17px`.

Grid:

- Horizontal grid lines only by default.
- Stroke `--chart-grid`.
- Dashed `2 3`.
- Four or five y bands.

Line:

- Stroke `--chart-green-line`.
- Width `1.7px`.
- Fill area with `--gradient-equity-fill`.
- Rounded joins and caps.

Data markers:

- Radius `3.5px`.
- White center or fill.
- 2 px green ring.
- Labels use `7px` text.

Hover interaction:

- Vertical crosshair.
- Tooltip with date and equity.
- Marker radius expands to `5px`.
- Tooltip appears in `90–120ms`.

## 8.7 Configuration strip

- Height: `56px`.
- Top gap: `8px`.
- Border: `1px solid --border-subtle`.
- Radius: `8px`.
- Padding: `0 9px 8px`.

Section label:

- Small green dot `3px`.
- “Configuration”: `8px`, 650.
- Height `18px`.

Five cells:

| Cell | Approx. width |
|---|---:|
| Market | 119 px |
| Timeframe | 95 px |
| Regime | 127 px |
| Risk | 119 px |
| Evidence | 129 px |

Cell separation:

- `1px solid --divider`.
- Horizontal padding `9px`.

Label:

- `7.5px`, tertiary.

Value:

- `9px`, 650.
- Icon `15px`.
- Icon-value gap `7px`.

## 8.8 Action row

- Top gap: `10px`.
- Height: `29px`.
- Four buttons.
- Gap: `8px`.

Widths:

| Button | Width |
|---|---:|
| View Details | 131 px |
| Compare | 131 px |
| Run Backtest | 146 px |
| Save Strategy | 158 px |

Standard secondary button:

- Background white.
- Border `1px solid --border-default`.
- Radius `7px`.
- Icon `13px`.
- Text `9px`, 600.

Primary Run Backtest:

- Gradient `--gradient-primary-button`.
- Color white.
- Border none.
- Shadow `--shadow-primary`.
- Play icon `12px`.
- The backtest must start only after this button is pressed.

Button hover:

- Secondary: background `#F8FAF8`, border strong.
- Primary: brightness `1.03`, translateY `-1px`.
- Duration `120ms`.

Button active:

- TranslateY `0`.
- Scale `0.99`.
- Shadow reduced.

---

# 9. Model Shelf

## 9.1 Container

- X: `412px`.
- Y: `628px`.
- Width: `627px`.
- Height: `125px`.
- Border: `1px solid --border-default`.
- Radius: `9px`.
- Background white.
- Overflow hidden.

## 9.2 Header

- Height: `28px`.
- Padding: `0 12px`.
- “Model Shelf”: `10px`, 700.
- Supporting copy: `8px`, secondary.
- Gap: `14px`.

## 9.3 Carousel

- Horizontal padding: `32px` to allow arrow controls.
- Card gap: `7px`.
- Four cards visible.
- Each card approximately `143 × 82px`.

Compact model card:

- Padding `8px`.
- Radius `8px`.
- Border subtle.
- Background white.
- Title one line, `8.5px`, 650.
- Two metrics, each:
  - label `7px`;
  - value `11px`, 700.
- Sparkline `50 × 20px`.
- Status badge at bottom.
- Badge height `15px`.

Carousel arrows:

- `22 × 28px`.
- Positioned at vertical center.
- Background white.
- Border default.
- Radius `6px`.
- Disabled state opacity `0.35`.

Keyboard support:

- Arrow Left/Right moves one card.
- Home/End jump.
- Focus remains visible.

---

# 10. Insights column

## 10.1 Container

- X: `1059px`.
- Width: `309px`.
- Top: `55px`.
- Height: `698px`.
- Padding: `14px 12px 10px`.
- Background: `--surface-app`.

All cards:

- Width: `285px`.
- Background white.
- Border default.
- Radius `9px`.
- Padding `11px`.
- Vertical gap `10px`.

## 10.2 Top Ranked

- Height: `161px`.
- Title row height `22px`.
- Trophy icon `14px`, orange.
- Chevron action `13px`.

Ranking row:

- Height `24px`.
- Number chip `17 × 17px`.
- Strategy name `8.5px`, 600.
- Score pill `29 × 18px`.
- Score text `8px`, green.
- Divider between rows.

Hover:

- Background `#F8FBF8`.
- Right chevron becomes visible.

## 10.3 Validation Mix

- Height: `126px`.
- Title: `11px`, 700.

Donut:

- Outer diameter `82px`.
- Stroke width `9px`.
- Segments:
  - Validated 40% green.
  - Candidate 40% blue.
  - Experimental 20% orange.
- Segment gap around `2deg`.
- Center:
  - `10`: `16px`, 700.
  - `Models`: `8px`, secondary.

Legend:

- Three rows.
- Dot `7px`.
- Label `8px`.
- Value aligned right, `8px`, 600.

## 10.4 Regime Coverage

- Height: `105px`.
- Three rows.
- Label width `64px`.
- Track width approximately `154px`.
- Track height `6px`.
- Radius pill.
- Percentage width `32px`.

Values in reference:

- Trending: 78%, green.
- Volatile: 52%, blue.
- Range-Bound: 35%, orange.

Animate bars from 0 to value only on initial mount, `550ms`, ease-out.

## 10.5 Best Today

- Height: `95px`.
- Title row includes small green achievement icon.
- Highlight row:
  - Circular icon `34px`.
  - Strategy name `8.5px`, 650.
  - Caption “Daily Return”: `7px`.
  - Return `+2.34%`: `12px`, 700, positive.

## 10.6 APEX Score Guide

- Height: `132px`.
- Title row `20px`.
- Gauge:
  - Width `160px`.
  - Height `79px`.
  - Arc thickness `10px`.
  - Start angle about `200deg`.
  - End angle about `-20deg`.
- Value:
  - `72`: `27px`, 700, green.
  - “Good”: `12px`, 650, green.
- End labels:
  - 0 and 100 at `8px`, secondary.
- Marker:
  - `10px` outer green circle.
  - `4px` white center.

---

# 11. Icons

Use one consistent icon set such as Lucide, Phosphor, or custom APEX icons.

Recommended stroke characteristics:

- Stroke width: `1.8`.
- Rounded caps and joins.
- Default icon color: `#4B6480`.
- Active green icon: `--green-700`.

Do not mix filled Material icons with thin outline icons.

Icon sizes:

| Context | Size |
|---|---:|
| Sidebar | 18 px |
| Header action | 17 px |
| Card header | 15 px |
| Small badge | 11–12 px |
| Workflow node | 16 px |
| Metric decoration | 12–14 px |

---

# 12. Motion and animation specification

All motion must be functional and restrained.

## 12.1 Global motion tokens

```css
:root {
  --duration-fast: 120ms;
  --duration-standard: 180ms;
  --duration-medium: 280ms;
  --duration-chart: 550ms;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

## 12.2 Page entrance

On first mount:

1. App shell is visible immediately.
2. Workspace cards fade and move up by `4px`.
3. Stagger:
   - summary cards: 25 ms;
   - selected strategy card: 80 ms after title;
   - insight cards: 35 ms between cards;
   - model shelf: last.
4. Total entrance should complete within `420ms`.

```css
@keyframes card-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

## 12.3 Chart animation

- Equity line uses stroke-dashoffset reveal for `550ms`.
- Area fill fades in over `300ms`, starting after `120ms`.
- Metric sparklines reveal over `300ms`.
- Do not replay continuously.
- On data refresh, crossfade old/new series for `180ms`.

## 12.4 Buttons

- Hover: `translateY(-1px)`.
- Active: `scale(0.99)`.
- Disabled: no transform; opacity `0.52`.
- Primary backtest loading:
  - replace play icon with 14 px spinner;
  - label “Running Backtest…”;
  - button remains disabled;
  - no automatic execution on page load or parameter change.

## 12.5 Cards

- Hoverable cards rise `1px`.
- Shadow transitions to `--shadow-hover`.
- Do not animate every static metrics card.

## 12.6 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

# 13. Interaction behavior

## 13.1 Collection selection

Selecting a collection:

- updates active border/background;
- filters the Model Shelf and strategy selection;
- does not run a backtest;
- preserves any unsaved comparison state;
- announces the new collection through an `aria-live="polite"` region.

## 13.2 Quick filters

- Multi-select.
- Each chip toggles with click or Space.
- Active state increases border contrast and shows a small checkmark.
- Results update immediately because filtering is not backtesting.

## 13.3 Strategy selection

Selecting a strategy from Top Ranked or Model Shelf:

- updates the featured card;
- updates metrics, tags, configuration, chart, and score;
- uses a short `140ms` crossfade;
- does not start a test.

## 13.4 Run Backtest

Required flow:

1. User clicks **Run Backtest**.
2. Validate symbol, timeframe, risk, and data availability.
3. Show confirmation summary if costs or leverage are high.
4. Set status to queued/running.
5. Display progress or indeterminate loading.
6. Replace results only when complete.
7. On completion, update score/rank/history.
8. On failure, preserve prior result and show an error.

Changing configuration after a completed run:

- marks results as stale;
- button text may become “Run Updated Backtest”;
- old results remain visible with a stale badge.

## 13.5 Compare

- Opens a side sheet or modal.
- Maximum 3 strategies.
- Focus trapped.
- Escape closes.
- Main viewport should not horizontally scroll.

## 13.6 Save Strategy

- Saves strategy ID + version + user preset.
- Shows a lightweight toast:
  - height about `40px`;
  - duration `2400ms`;
  - not blocking.

---

# 14. Recommended HTML structure

```html
<div class="apex-shell">
  <aside class="primary-sidebar">...</aside>

  <header class="topbar">...</header>

  <aside class="collections-panel">
    <section class="collections-list">...</section>
    <section class="quick-filters">...</section>
    <section class="research-book-card">...</section>
  </aside>

  <main class="strategy-workspace">
    <header class="workspace-heading">...</header>
    <section class="strategy-summary-row">...</section>

    <article class="featured-strategy">
      <header class="strategy-header">...</header>
      <div class="strategy-tags">...</div>
      <section class="metric-grid">...</section>

      <div class="strategy-visual-row">
        <section class="core-logic-panel">...</section>
        <section class="equity-panel">...</section>
      </div>

      <section class="configuration-strip">...</section>
      <footer class="strategy-actions">...</footer>
    </article>

    <section class="model-shelf">...</section>
  </main>

  <aside class="insights-panel">
    <section class="top-ranked-card">...</section>
    <section class="validation-mix-card">...</section>
    <section class="regime-coverage-card">...</section>
    <section class="best-today-card">...</section>
    <section class="score-guide-card">...</section>
  </aside>
</div>
```

---

# 15. Suggested CSS component architecture

```text
styles/
├── tokens.css
├── reset.css
├── shell.css
├── sidebar.css
├── topbar.css
├── collections.css
├── strategy-card.css
├── charts.css
├── model-shelf.css
├── insights.css
├── controls.css
├── motion.css
└── responsive.css
```

Component names should be semantic, not coordinate-based. Avoid names such as `.left-box-2`.

---

# 16. Suggested JavaScript state

```js
const strategyStudioState = {
  activeCollection: "high-conviction",
  activeStrategyId: "opening-range-momentum-breakout",
  activeFilters: ["trending", "long-short", "composite"],
  selectedMarket: "BTC-USDT",
  selectedTimeframe: "5m",
  selectedRegime: "trending",
  selectedRisk: "aggressive",
  evidenceLevel: "validated",
  backtestStatus: "idle", // idle | stale | queued | running | complete | failed
  selectedCompareIds: [],
  savedStrategyIds: [],
  reducedMotion: false
};
```

Never derive “backtestStatus = running” from field changes. Only the explicit Run Backtest action may initiate it.

---

# 17. Responsive behavior

## 17.1 Desktop, 1368 px and above

- Use the exact four-column layout.
- All insight cards visible.
- Four Model Shelf cards visible.
- No browser-level horizontal scroll.

## 17.2 Compact desktop, 1180–1367 px

- Sidebar: `164px`.
- Collections panel: `205px`.
- Insights: `285px`.
- Central workspace: flexible.
- Reduce:
  - main gaps by 2 px;
  - summary card supporting text;
  - model shelf to 3 cards.
- Keep Run Backtest visible.

## 17.3 Tablet, 900–1179 px

- Sidebar collapses to icon rail, `64px`.
- Collections becomes a drawer or horizontal collection selector.
- Insights moves below the selected strategy.
- Core Logic and Equity Curve stack vertically.
- Model Shelf uses horizontal scrolling.
- Topbar search becomes flexible.

## 17.4 Mobile, below 900 px

This page is data dense. Use a purpose-built mobile arrangement:

1. Mobile header.
2. Strategy selector.
3. Metrics 2-column grid.
4. Run Backtest sticky action.
5. Chart.
6. Core logic accordion.
7. Rankings and insights accordion.

Do not simply shrink the desktop page.

---

# 18. Accessibility

## 18.1 Contrast

Minimum:

- Normal text: 4.5:1.
- Large text: 3:1.
- Non-text controls: 3:1.

Do not rely only on green/red:

- Add `+` and `−`.
- Add labels such as Positive, Negative, Validated, Experimental.
- Use icons or patterns in charts where required.

## 18.2 Keyboard

All controls must be reachable in logical order:

1. Search.
2. Header actions.
3. Sidebar.
4. Collections.
5. Filters.
6. Featured strategy actions.
7. Model Shelf.
8. Insights.

Focus style:

```css
:focus-visible {
  outline: 2px solid var(--green-600);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--focus-ring);
}
```

## 18.3 Chart accessibility

Each chart needs:

- accessible name;
- textual summary;
- data table or downloadable data;
- keyboard-accessible selected point when possible.

Example:

```html
<figure aria-labelledby="equity-title">
  <h3 id="equity-title">Equity Curve — Opening Range Momentum Breakout</h3>
  <canvas aria-describedby="equity-summary"></canvas>
  <p id="equity-summary">
    Equity rises from 100,000 USDT to 124,800 USDT over the displayed period,
    with several moderate pullbacks.
  </p>
</figure>
```

---

# 19. Loading, empty, stale, and error states

## Loading

- Skeleton cards preserve final dimensions.
- Use shimmer only at low contrast.
- Backtest spinner appears only after explicit execution.

## Empty strategy result

Text:

> No completed backtest is available for this strategy and configuration.

Action:

> Run Backtest

## Stale result

Badge:

> Configuration changed

Supporting text:

> The displayed results belong to the previous configuration.

Primary action:

> Run Updated Backtest

## Error

Preserve old data and show:

- concise error;
- retry button;
- technical details disclosure;
- no destructive layout shift.

---

# 20. Data formatting

- Money: `124,800 USDT` or `$124.8K`, never mixed in the same metric row.
- Percent: one or two decimals according to context.
- Positive values: include `+`.
- Negative values: use a true minus sign if supported.
- Timeframe: `5m`, `15m`, `1h`.
- Score: integer `0–100`.
- Dates in charts: abbreviated and locale aware.

---

# 21. Performance requirements

- Initial CSS and core screen JS should remain lightweight.
- Lazy-load full research book and comparison tools.
- Charts should use Canvas or optimized SVG.
- Avoid animating layout properties.
- Use `transform` and `opacity`.
- Use `ResizeObserver` to resize charts.
- Debounce search/filter queries by `120–180ms`.
- Avoid rerendering all insight cards on chart hover.

Target:

- Largest Contentful Paint under 2.5 s on a typical desktop.
- Interaction to Next Paint under 200 ms for filter and collection actions.
- No cumulative layout shift from icons, charts, or font loading.

---

# 22. Engineering acceptance checklist

## Visual

- [ ] Viewport matches 1368 × 753 without horizontal scrolling.
- [ ] Sidebar width is 170 px.
- [ ] Topbar height is 55 px.
- [ ] Collections, workspace, and insights align to the master grid.
- [ ] Original APEX logo asset is unchanged.
- [ ] Cards use consistent 8–10 px radii.
- [ ] Primary green and semantic colors follow tokens.
- [ ] Selected Strategies navigation item matches the mockup.
- [ ] Run Backtest is visually dominant but not oversized.
- [ ] Equity and score visuals match the green APEX language.
- [ ] Right column remains fully visible.

## Functional

- [ ] Changing configuration never starts a backtest.
- [ ] Backtesting starts only from explicit Run Backtest interaction.
- [ ] Strategy selection updates the page without reload.
- [ ] Compare supports up to three strategies.
- [ ] Saved state is visible.
- [ ] Rankings are clickable.
- [ ] Filters work independently and in combination.
- [ ] Stale results are clearly marked.
- [ ] Loading and failure states preserve layout.

## Accessibility

- [ ] Complete keyboard navigation.
- [ ] Visible focus state.
- [ ] Chart alternatives provided.
- [ ] Green/red information is redundant with text or icons.
- [ ] Reduced-motion preference is respected.
- [ ] Tooltips are accessible and dismissible.

## Responsive

- [ ] Exact desktop layout at 1368 px.
- [ ] Compact desktop does not clip controls.
- [ ] Tablet moves insights below content.
- [ ] Mobile uses an intentional stacked design.
- [ ] Model Shelf has accessible local scrolling.

---

# 23. Pixel comparison tolerance

For automated visual-regression testing at **1368 × 753**:

- Major column positions: tolerance `±2px`.
- Card dimensions: tolerance `±2px`.
- Internal padding: tolerance `±2px`.
- Typography baseline: tolerance `±2px`.
- Border color: delta-E tolerance suitable for antialiasing.
- Chart data shape should be tested semantically, not pixel-perfectly.
- Browser font rasterization differences must not fail the build by themselves.

Recommended screenshot browsers:

- Chromium at device scale factor 1.
- Firefox as secondary.
- Use fixed seed data and disable animation before capture.

---

# 24. Final implementation priority

1. App shell and master grid.
2. Sidebar and topbar.
3. Featured strategy card and manual Run Backtest behavior.
4. Equity chart and metrics.
5. Collections and filtering.
6. Insights column.
7. Model Shelf.
8. Motion and polish.
9. Responsive modes.
10. Visual regression and accessibility audit.

The engineering agent should treat this specification—not the raw raster—as the authoritative implementation contract.
