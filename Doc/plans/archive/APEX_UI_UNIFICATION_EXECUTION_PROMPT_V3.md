# APEX Portal — Complete Desktop UI Unification Execution Prompt

**Version:** 3.0  
**Audience:** Coding agent working directly inside the repository  
**Scope:** Desktop visual/component unification only  
**Primary acceptance viewport:** `1672 × 941`  
**Secondary validation viewports:** `1440 × 900` and `1920 × 1080`  
**Execution mode:** Continue automatically through all phases; stop only for a genuine blocker

---

## 0. Authoritative Project Context

### Project root

```text
C:\project\APEX-frontend-phase2 (4)\apex-trading-engine
```

### Authoritative architecture and interaction plan

```text
C:\project\APEX-frontend-phase2 (4)\apex-trading-engine\APEX_DEFINITIVE_DESKTOP_UX_UI_CSS_MASTER_PLAN.md
```

### Authoritative visual-unification plan

```text
C:\project\APEX-frontend-phase2 (4)\apex-trading-engine\APEX_UNIFIED_DESKTOP_UX_UI_MASTER_PLAN.md
```

Read both files before editing code.

The architecture plan controls:

- shell structure;
- navigation architecture;
- Left Workspace Rail;
- Right Command Rail;
- DockHost;
- layout persistence;
- session persistence;
- workspace ownership;
- contextual tool behavior;
- state synchronization;
- interaction architecture.

This document controls:

- visual-system implementation;
- component unification;
- page composition;
- typography;
- spacing;
- surfaces;
- cards;
- tables;
- page headers;
- responsive desktop behavior;
- Dock content responsiveness;
- screenshot acceptance;
- final release-quality visual verification.

Do not create another implementation plan.  
Do not return an audit-only response.  
Do not rewrite the architecture again.  
Continue from the current codebase and implement the work directly.

---

## 1. What Has Already Been Completed

The architecture work is real and should not be re-litigated.

The current application already contains or has substantially implemented:

- canonical Left Workspace Rail;
- Right Command Rail;
- DockHost;
- contextual panel routing;
- no automatic blocking drawers on initial workspace load;
- layout/session storage migration;
- `apex.commandBoard.layout.v2`;
- `apex.workspace.session.v1`;
- Queue/Tracking selection opening Ticket in the shared Dock;
- shared shell integration in `App.tsx`;
- working desktop route switching;
- successful lint/test/build gates in prior phases.

Do not roll back:

- current IA;
- current route mapping;
- current rails;
- DockHost;
- layout/session persistence;
- current menu ownership;
- current contextual-tool architecture.

The remaining failure is the visual/component layer.

---

## 2. Why the Current Result Is Rejected

The application still looks like multiple unrelated interfaces placed inside one shell.

The current screenshots reveal these release-blocking defects:

1. Command changes width and density unpredictably across desktop sizes.
2. At `1920 × 1080`, Command can remain too narrow and leave excessive dead space.
3. Command is still visually closer to a stack of cards than a professional command dashboard.
4. Desk retains a separate red/burgundy chrome.
5. Settings retains a separate burgundy visual system.
6. Lab, Ops, Intel, Memory, Markets, Queue, Tracking, Desk, and Command do not share one header geometry.
7. Some pages use large decorative page-header artwork and colored washes while others do not.
8. Cards use inconsistent radii, borders, gradients, shadows, brightness, and padding.
9. Tables use inconsistent row heights, type scales, action cells, confidence displays, and selected states.
10. Some pages are edge-to-edge, some are constrained, and some leave large unexplained empty regions.
11. Dock panels can become visually dominant when empty.
12. Split Dock content can become compressed, overlapping, or unreadable.
13. Memory content in Dock mode is too dense and wraps poorly.
14. Queue and other empty workspaces can become almost entirely blank.
15. Some screenshots have previously been marked accepted without actual visual inspection.
16. A completely blank screenshot has appeared and must be treated as a hard failure.
17. Page-specific accent themes are decorative rather than semantic.
18. Legacy terminal micro-text remains active in important surfaces.
19. The shell has changed, but many page interiors still use legacy visual systems.

These are not minor polish items. They are blockers for declaring the desktop UI complete.

---

## 3. Non-Negotiable Process Rules

### 3.1 Version control safety

If the project root is not already a Git repository:

1. Create or verify a correct `.gitignore` first.
2. Run `git init`.
3. Commit the current working tree before visual changes.
4. Commit after every phase with a meaningful message.

Do not commit:

```text
node_modules/
dist/
build/
_qa/
temp/
screenshots/
logs/
.env
.env.*
*.log
coverage/
playwright-report/
test-results/
local databases
credentials
tokens
generated caches
```

If a phase produces no meaningful diff, do not claim that phase was implemented.

Lack of Git must not become an excuse to delay the UI work.

### 3.2 Clean runtime before screenshots

Before each screenshot run:

- confirm the intended application port;
- terminate only stale processes owned by the project on that port;
- do not kill unrelated Node or Chrome processes;
- confirm the app responds before launching capture;
- avoid capturing from a stale or partially broken server.

### 3.3 One visual direction only

Do not create palette variants such as:

- `ocean-v2`;
- `refined-v3`;
- `cool-theme`;
- `visual-v7`;
- multiple speculative redesign folders.

Choose one professional visual direction in Phase 1 and apply it everywhere.

### 3.4 No fake acceptance

Every screenshot must be opened and visually inspected.

For every final screenshot, record 2–4 concrete observations, including where applicable:

- header height compared with other pages;
- page padding;
- section gaps;
- card radius and border consistency;
- surface brightness;
- table density;
- Dock width and behavior;
- text clipping;
- overlap;
- semantic accent use;
- what visibly changed from baseline;
- why the page now belongs to the same product.

The following is invalid:

```text
Image opened: pending-agent
Accepted: yes
```

A page cannot be accepted until the final PNG has actually been opened and reviewed.

### 3.5 Controlled screenshot runs

For each phase:

- one baseline capture at phase start;
- one full result capture at phase end;
- page-specific recaptures only when a defect is found.

Do not repeatedly re-run the entire suite when only one page failed.

### 3.6 Continue automatically

Continue through the phases without waiting for routine approval.

Stop only for:

- an unresolved build/test failure;
- a missing required dependency that cannot be installed safely;
- a genuine product decision not answered by the authoritative plans;
- inability to launch or verify through external Chrome;
- a blocker that risks data loss or business-logic corruption.

---

## 4. Scope and Non-Goals

### In scope

- design tokens;
- app-wide theme;
- typography;
- spacing;
- page headers;
- content widths;
- responsive desktop grids;
- surfaces;
- cards;
- tables;
- empty/loading/error states;
- Dock visual design;
- compact Dock presentations;
- Settings visual redesign;
- Trading Desk visual redesign;
- Command dashboard visual rebuild;
- screenshot QA;
- contact-sheet comparison;
- accessibility and contrast smoke checks.

### Out of scope

Do not change unless required to fix a direct functional defect:

- IA;
- routing;
- workspace ownership;
- Left Rail destination structure;
- Right Rail tool ownership;
- DockHost architecture;
- layout/session storage contracts;
- scanner algorithms;
- data APIs;
- trading logic;
- live-execution behavior;
- backend services;
- mobile redesign.

---

## 5. Trader’s-Eye Diagnosis

### Command Center

- Four top metrics use unrelated visualization idioms.
- Confidence is not visually attached strongly enough to the trade idea it describes.
- Watchlist and Priority Queue can repeat similar ticker information without clear task separation.
- Sparklines are sometimes too small to communicate momentum.
- Wider viewports can add empty space instead of surfacing more decision-relevant information.
- Lower sections do not yet form a strong institutional dashboard composition.

### Trading Desk

- The chart is strong, but red/burgundy interface chrome makes Desk look like a separate product.
- An empty Positions Dock can carry too much visual weight.
- Ticket and Execution content must remain readable in narrow contextual width.
- Direction colors should communicate market meaning, not recolor the entire workspace.

### Queue and Tracking

- Table foundations are among the better existing patterns and should inform the shared DataTable.
- Empty states currently leave too much unstructured blank space.
- Split Dock content can overlap or become too dense.

### Markets

- Market direction styling is over-dominant.
- Table structure is usable but must share the canonical table foundation.
- The full page and docked Watchlist must have clearly different task roles.

### Lab / Backtesting

- Decorative violet/cyan page styling creates a separate page identity.
- Header artwork consumes vertical space without delivering decision value.
- Memory in Dock mode requires a purpose-built compact version.

### Ops

- Teal/cyan page theming is too decorative.
- System status should use restrained traffic-light semantics, not an independent visual theme.

### Intel and Memory

- Expanded pages and docked tools must share the same content system but different density.
- Full-page compositions must not be squeezed into `336px` Dock panels.

### Settings

- Palette, tabs, cards, sliders, and typography remain disconnected from the rest of APEX.
- Settings should feel elevated, not unrelated.

---

## 6. Canonical Visual Direction

APEX must become one professional institutional crypto-trading workstation.

The base design language is:

- dark neutral graphite canvas;
- restrained metallic depth;
- subtle cyan interaction accent;
- disciplined semantic market colors;
- low visual noise;
- chart-first information density;
- minimal decorative glow;
- clear hierarchy;
- consistent geometry.

The product should feel closer to:

- TradingView discipline;
- Bloomberg workflow clarity;
- institutional risk dashboards;

and not like:

- an IDE;
- a gaming HUD;
- a page-by-page theme gallery;
- a decorative science-fiction interface.

---

## 7. Semantic Color Contract

Use these meanings exclusively:

| Color family | Exclusive purpose |
|---|---|
| Neutral graphite/zinc | canvas, surfaces, borders, inactive structure, text |
| Cyan | interaction, focus, active navigation, primary CTA |
| Teal | bullish, long, gain, positive directional outcome |
| Rose | bearish, short, loss, negative directional outcome |
| Violet | AI confidence, analytical evidence, model context |
| Amber | stale data, attention, warning, blocked review |
| System-critical red | infrastructure failure, execution failure, service outage |

Rules:

- Teal and rose are never decorative.
- Amber is not a generic highlight color.
- Violet is not used for navigation.
- Rose/short color is not used for system failure.
- Confidence does not inherit long/short direction color.
- No page receives its own dominant theme.
- Remove page-level violet, yellow, teal, cyan, or burgundy washes.

Prohibit new arbitrary colors:

```text
bg-[#...]
text-[#...]
border-[#...]
shadow-[#...]
fill-[#...]
stroke-[#...]
inline hexadecimal values
new uncontrolled glass-*
new uncontrolled glow-*
new uncontrolled neon-*
```

---

## 8. Shared Visual Foundations

Implement or complete these shared primitives before broad page migration:

- `WorkspaceCanvas`
- `PageHeader`
- `PageSection`
- `SurfaceCard`
- `MetricCard`
- `DataCard`
- `DataTable`
- `TableHeader`
- `TableRow`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `StatusBadge`
- `DirectionBadge`
- `ConfidenceBadge`
- `FreshnessBadge`
- `EnvironmentBadge`
- `PrimaryButton`
- `SecondaryButton`
- `IconButton`
- `DockPanel`
- `PanelHeader`
- `PanelTabs`
- `FloatingPanel`
- `ModalShell`
- `FormSection`

Shared primitives must own:

- color;
- typography;
- padding;
- radius;
- border;
- surface background;
- elevation;
- hover state;
- selected state;
- focus state;
- disabled state;
- loading state;
- empty state;
- error state.

Pages may control content and grid composition, but may not invent separate visual foundations.

Do not solve this by adding one giant override block at the end of `index.css`.

Migrate the real components to the shared system and retire obsolete visual implementations after their consumers are moved.

---

## 9. Surface Hierarchy

Use one app-wide surface model:

1. **Canvas** — global application background.
2. **Surface 1** — page section/container.
3. **Surface 2** — standard card.
4. **Surface 3** — focused/elevated contextual panel.
5. **Modal** — controlled highest elevation.

Standardize:

- one radius per level;
- one border opacity per level;
- one shadow treatment per level;
- consistent header/body padding;
- consistent selected/focused treatment.

Remove:

- random gradients;
- double borders;
- strong inner outlines;
- page-specific card backgrounds;
- unnecessary outer glow;
- multiple elevation cues on one card.

Only Hero, focus, warning, and critical states may receive stronger emphasis.

---

## 10. Typography System

Use one hierarchy:

| Role | Size |
|---|---:|
| Eyebrow | 11px |
| Caption | 12px |
| Body | 13px |
| Body strong | 14px |
| Standard data | 15px |
| Critical data | 17px |
| Page title | 20px |

Rules:

- Normal UI copy uses the UI font.
- Prices, percentages, symbols, timestamps, IDs, and aligned numbers use data/monospace font.
- Numeric data uses tabular figures.
- Uppercase and letter spacing are restricted to short technical eyebrows and compact labels.
- Explanatory body text must not use tiny terminal-style monospace.
- Do not render active interface text below `11px`.
- Do not shrink typography to force viewport fit.

---

## 11. Global Spacing and Geometry

Use:

- base grid: `8px`;
- compact internal increments: `4px`;
- default page padding: `16px`;
- default section gap: `16px`;
- consistent card padding;
- consistent page-header geometry;
- consistent rail alignment.

Avoid:

- arbitrary one-off gaps;
- mixed card radii;
- inconsistent table cell padding;
- large empty margins at wide viewports;
- global scaling hacks.

---

## 12. Unified Page Header

All full-page workspaces must use one `PageHeader` foundation.

It must support:

- icon;
- eyebrow/category;
- title;
- one-line description;
- status badges;
- one primary action;
- optional secondary action.

Standardize:

- total height;
- horizontal padding;
- vertical padding;
- icon size;
- title baseline;
- subtitle baseline;
- badge alignment;
- action alignment;
- bottom border;
- background;
- spacing.

Apply to:

- Command;
- Desk;
- Queue;
- Tracking;
- Markets;
- Lab;
- Ops;
- Intel expanded view;
- Memory expanded view.

Remove decorative page-header artwork and page-specific colored washes.

Settings uses the same typography and surface language in its modal header.

---

## 13. Global Width and Responsive Desktop System

### `1440 × 900`

- preserve hierarchy;
- reflow secondary regions;
- maintain readable typography;
- no horizontal page scrolling;
- no overlapping actions;
- no clipped Dock content.

### `1672 × 941`

- primary acceptance viewport;
- use available width efficiently;
- standard `16px` page padding;
- standard `16px` section gap;
- decision-critical content remains visible;
- no excessive blank regions.

### `1920 × 1080`

- Command, charts, tables, and grids expand;
- additional width benefits content before chrome;
- do not retain a narrow `1000–1200px` layout inside a large canvas;
- do not increase Dock beyond its approved maximum simply to fill space.

Never use:

- `transform: scale(...)`;
- CSS `zoom`;
- browser zoom manipulation;
- screenshot scaling;
- globally reduced fonts;
- fixed widths copied from one viewport.

Use adaptive grids and reflow rules.

---

## 14. Right Rail and Dock Visual Contract

### Right Command Rail

Keep the current architecture, but visually align it with the Left Rail.

Standardize:

- rail width;
- button dimensions;
- icon dimensions;
- vertical spacing;
- badge placement;
- active state;
- focus state;
- tooltip style;
- borders;
- background;
- bottom overflow control.

No unexplained icon is accepted without a tooltip/accessible name.

### Dock width

Do not make Dock continuously scale with the viewport.

Use:

- default: `336px`;
- minimum: `300px`;
- maximum: `400px`;
- hard maximum: `32vw`;
- closed Dock width: exactly `0px`.

Additional desktop width should primarily benefit the Workspace Canvas.

### Dock visual language

All contextual tools use:

- shared panel header;
- shared close/pin/split controls;
- shared tabs;
- consistent panel padding;
- compact contextual density;
- one body scroll container;
- no nested scrollbars;
- no duplicated page title;
- no independent panel theme.

An empty Dock panel must not look heavier than the workspace.

---

## 15. Split Dock Responsiveness

When two tools are visible:

- they are vertically stacked;
- default split ratio is `60/40`;
- each panel remains at least `220px` high;
- each panel uses a dedicated compact layout;
- panel headers remain visible;
- one scroll container per panel body;
- no nested scrollbars;
- no overlapping text or controls;
- no side-by-side tools inside the Dock.

Test at:

- `300px` Dock width;
- `336px` Dock width;
- `400px` Dock width;
- single-panel mode;
- vertical split mode.

Ticket tabs must remain readable. When four full labels do not fit, use one of:

- approved short labels;
- horizontally scrollable tabs;
- compact segmented selector;
- overflow menu.

Do not squeeze labels into overlap.

---

## 16. Compact Dock Presentations

### Ticket Dock

Ticket Dock must prioritize:

- symbol;
- direction;
- lifecycle;
- price;
- confidence;
- risk;
- key metrics;
- invalidation;
- primary handoff/action.

Do not render a wide-page layout inside `336px`.

### Positions Dock

- compact list;
- clear selected state;
- concise empty state;
- no giant blank region;
- exposure/status visible where available.

### Memory Dock

Create a dedicated compact presentation.

Include:

- Active/Archive selector;
- essential counts;
- compact gate/progress state;
- short rows or compact empty state;
- Expand action;
- Export action only where usable.

Long explanatory text belongs in the expanded page.

### Intel Dock

- concise ticker-bound evidence;
- source freshness;
- conflict indicator;
- Expand action;
- no full-page hero treatment.

---

## 17. Command Center Rebuild

Command is the highest-priority page.

Required adaptive 12-column composition:

1. Unified PageHeader
2. Four compact status metrics
3. Dominant Next Action Hero
4. Strategy Queue
5. Focused Intel
6. Top Markets
7. Market Pulse
8. Portfolio Risk / Regime

### Four top metrics

Use one consistent metric-card idiom.

Do not use unrelated ring/sparkline/gauge/plain-text styles without semantic reason.

Each card must share:

- geometry;
- title placement;
- value placement;
- supporting text;
- footer/progress treatment;
- semantic accent rules.

### Hero

The Hero is the only dominant zone.

It must visually connect:

- action;
- symbol;
- direction;
- thesis;
- confidence;
- calibration;
- freshness;
- invalidation;
- risk;
- expected risk/reward;
- primary CTA;
- secondary CTA.

Confidence must visibly belong to this idea rather than float as a disconnected gauge.

### Strategy Queue vs Watchlist

Do not duplicate the same purpose.

- **Strategy Queue:** priority, lifecycle, confidence, risk, freshness, actionability.
- **Watchlist:** monitored assets, direction, price/market state, concise monitoring status.

### Sparklines

If retained, make them legible and add timeframe context.

If the available width makes them decorative, replace them with a clearer compact representation.

### Responsive behavior

At `1672 × 941`:

- Hero remains dominant;
- key decision zones are visible;
- no excessive blank region;
- Watchlist Dock can open without destroying hierarchy.

At `1920 × 1080`:

- use wider multi-column layout;
- Queue, Intel, Markets, Pulse, and Risk benefit from width;
- do not retain narrow vertical stacking.

At `1440 × 900`:

- secondary regions may stack;
- typography stays readable;
- focal hierarchy remains intact.

Remove decorative Hero/page artwork that does not carry information.

---

## 18. Trading Desk Redesign

Desk must remain chart-first.

Remove the separate red/burgundy application chrome.

Use neutral graphite for:

- page background;
- chart frame;
- controls;
- tabs;
- toolbar;
- Dock;
- execution surfaces.

Reserve teal/rose for:

- candles;
- long/short badges;
- P&L;
- Entry;
- Stop Loss;
- Take Profit;
- directional risk values.

Required:

- minimum usable chart workspace: `720px`;
- chart remains visually dominant;
- Dock remains subordinate;
- empty Positions state is compact and calm;
- Ticket remains readable at `300–400px`;
- protected chart controls remain visible;
- Entry/SL/TP and execution-critical data receive clear emphasis;
- no blocking overlay;
- no full-page blur;
- no entire-interface direction color theme.

---

## 19. Queue and Tracking

### Shared DataTable

Both pages must use the canonical table system.

Standardize:

- page header;
- summary metrics;
- table header;
- row height;
- symbol cell;
- direction badge;
- state badge;
- price/mark alignment;
- confidence display;
- age/freshness;
- action cell;
- hover/selected state.

### Empty states

Do not leave a tiny message in a nearly empty full-height canvas.

Use a bounded `EmptyState` section with:

- clear title;
- short explanation;
- primary recovery action;
- optional secondary configuration action;
- restrained supporting information;
- intentional vertical rhythm;
- reasonable maximum width.

### Selection behavior

- selecting a valid row updates shared session state;
- Ticket opens with valid content;
- no empty Ticket opens automatically;
- split Dock remains usable;
- returning to initial state does not leave hidden width.

---

## 20. Markets

Markets must use the shared page-header, metric-card, table, badge, and surface systems.

Remove page-level rose dominance.

Direction colors remain semantic at row/data level.

Clarify roles:

- Markets page: universe discovery and management;
- Watchlist Dock: compact monitored subset and quick context.

Use the same underlying asset-list/table primitives where appropriate without duplicating task meaning.

---

## 21. Lab / Backtesting

Remove decorative violet/cyan page theming.

Use the shared:

- PageHeader;
- SurfaceCard;
- field/control system;
- status badges;
- EmptyState;
- results layout.

Recommended composition:

- configuration/source region;
- runtime/source status;
- backtest action;
- result region using Desk-compatible chart language when results exist.

Memory Dock must use its compact presentation.

---

## 22. Ops

Ops should use a restrained systems-status language.

Use semantic state colors only:

- healthy;
- monitored;
- degraded;
- critical;
- unavailable;
- stale.

Do not use a decorative teal page identity.

Unify:

- PageHeader;
- status cards;
- provider rows;
- diagnostics section;
- Feed integration;
- Empty/Error/Loading states;
- table/list density.

Ops should look operationally distinct through content structure, not through a separate design theme.

---

## 23. Intel and Memory Expanded Views

Expanded views use the same full-page visual language as other workspaces.

### Intel

- no decorative cyan hero;
- ticker-bound evidence hierarchy;
- source freshness;
- conflict visibility;
- loading/degraded states;
- clear relationship to compact Dock Intel.

### Memory

- Active and Archive presets;
- shared table foundation;
- filters;
- row selection;
- details;
- export where supported;
- empty/loading/stale/error states;
- clear relationship to compact Dock Memory.

Do not maintain separate visual systems for current decisions and archive/history.

---

## 24. Settings Unification

Settings may remain a true modal.

Replace the burgundy visual system with the shared APEX theme.

Use:

- graphite modal surface;
- shared modal header;
- shared tabs;
- shared cards;
- shared field labels;
- shared inputs;
- shared sliders;
- shared buttons;
- shared badges;
- shared scrollbar;
- shared focus state.

Color rules:

- cyan: interaction;
- amber: warning/review;
- system red: destructive/critical only;
- teal/rose only when the setting itself represents directional trading semantics.

Settings should look elevated, not unrelated.

---

## 25. Unified DataTable Contract

Migrate Markets, Queue, Tracking, Memory, archive/history, applicable Ops lists, and applicable Lab results.

Standardize:

- standard row: approximately `44px`;
- compact row: approximately `36px` only when justified;
- table body: `13–14px`;
- labels: minimum `11px`;
- important numeric data: `14–16px`;
- tabular numeric figures;
- header height;
- cell padding;
- separators;
- sticky header behavior;
- hover;
- focus;
- selected state;
- action cell;
- empty/loading/error state;
- confidence presentation;
- direction presentation;
- status presentation.

Do not retain page-specific table styling simply because it currently renders.

---

## 26. Blank-Screen Failure Rule

A completely blank or shell-less screenshot is an automatic failure.

The capture runner must detect:

- missing application shell;
- missing expected page root;
- missing active workspace;
- blank canvas;
- unresolved Suspense/loading state;
- body with no meaningful rendered content;
- unexpected navigation reset;
- page crash;
- failed lazy chunk.

On failure:

1. mark the page `Failed`;
2. save a diagnostic screenshot;
3. record URL;
4. record active workspace key;
5. record expected selector;
6. record visible heading;
7. record console errors;
8. record failed requests;
9. reload and retry that page once;
10. do not accept the phase if retry remains blank.

Do not rerun the entire screenshot suite for one failed page.

---

## 27. External Chrome Acceptance

Final visual evidence must use a real externally installed Google Chrome browser in headed mode.

Preferred Playwright launch:

```ts
chromium.launch({
  channel: 'chrome',
  headless: false,
});
```

Cursor internal browser, embedded preview, editor webview, or miniature browser is not accepted.

### Primary acceptance

```text
Viewport: 1672 × 941
DPR: 1
Browser zoom: 100%
fullPage: false
PNG metadata: exactly 1672 × 941
```

Verify from inside the page:

```ts
{
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
  visualViewportWidth: window.visualViewport?.width,
  visualViewportHeight: window.visualViewport?.height,
}
```

### Secondary validation

- `1440 × 900`
- `1920 × 1080`

### Per-page loop

After changing each page:

1. start/reuse the real application server;
2. launch external Chrome;
3. navigate through the actual UI;
4. verify the correct workspace key;
5. wait for a page-specific root selector;
6. confirm loading/Suspense is gone;
7. capture screenshot;
8. read actual PNG dimensions;
9. open the PNG;
10. compare with previously completed pages;
11. inspect width, spacing, header, cards, tables, typography, surfaces, and colors;
12. inspect console errors;
13. inspect failed network requests;
14. test modified interactions;
15. fix defects;
16. reload and capture replacement;
17. repeat until accepted.

Do not accept a page merely because a screenshot file exists.

---

## 28. Required Screenshot States

### Command

- Dock closed;
- Watchlist docked;
- Ticket with valid focused ticker;
- `1440 × 900`;
- `1672 × 941`;
- `1920 × 1080`.

### Desk

- Dock closed;
- Positions docked;
- Ticket docked;
- Positions + Ticket split;
- explicit Execution review;
- compact empty Positions state.

### Queue

- populated table;
- proper empty state;
- valid selected Ticket.

### Tracking

- Dock closed;
- Positions open;
- Ticket open;
- split mode;
- empty/lifecycle state.

### Markets

- Dock closed;
- Watchlist docked.

### Lab

- default state;
- Memory Dock open.

### Ops

- contextual tools closed;
- healthy state;
- degraded state;
- critical/unavailable state where supported.

### Intel

- expanded view;
- compact Dock view.

### Memory

- Active;
- Archive;
- expanded view;
- compact Dock view;
- empty state.

### Settings

- modal open;
- focus state;
- scrolling content;
- close/restore behavior.

---

## 29. Contact Sheet Gate

Create one final contact sheet containing the final `1672 × 941` screenshots of:

- Command, Dock closed;
- Command, Watchlist docked;
- Desk, Dock closed;
- Desk, Ticket docked;
- Queue;
- Tracking;
- Tracking split Dock;
- Markets;
- Lab;
- Ops;
- Intel;
- Memory;
- Settings.

Save to:

```text
_qa/<timestamp>/visual-unification/contact-sheet-1672x941.png
```

Open and inspect it.

Reject completion if it reveals:

- different page-header heights;
- different title scales;
- different page margins;
- different card radii;
- inconsistent surface brightness;
- inconsistent table density;
- independent page color themes;
- inconsistent Dock styling;
- unreadable compact content;
- excessive blank regions;
- a page that still looks like another application.

Write concrete observations about the contact sheet.

---

## 30. Implementation Phases

Perform in this order, with one real Git commit per phase.

### Phase 1 — Shared tokens and primitives

Implement:

- semantic colors;
- surface hierarchy;
- type scale;
- spacing grid;
- radii;
- borders;
- shadows;
- buttons;
- badges;
- shared PageHeader;
- shared Card primitives;
- shared DataTable;
- shared Empty/Loading/Error states;
- shared Dock/Modal visual primitives.

Gate:

- reference pages compile;
- no new arbitrary colors;
- token reference is inspectable;
- meaningful diff exists.

Commit example:

```text
feat(ui): establish unified desktop visual tokens and primitives
```

### Phase 2 — Command Center rebuild

Implement the full adaptive dashboard composition and width behavior.

Gate:

- one clear Hero;
- consistent metric cards;
- Watchlist and Queue have distinct roles;
- `1440/1672/1920` verified;
- no excessive dead space;
- Dock-open state remains usable.

Commit example:

```text
feat(command): rebuild command center with adaptive unified dashboard grid
```

### Phase 3 — Shared header/card/table rollout

Migrate:

- Desk;
- Queue;
- Tracking;
- Markets;
- Lab;
- Ops;
- Intel;
- Memory.

Remove decorative page themes and legacy header systems.

Gate:

- all full pages share one header geometry;
- tables share one foundation;
- Desk chart remains dominant;
- split Dock is readable;
- no page-specific visual theme remains.

Commit example:

```text
feat(ui): unify workspace headers surfaces tables and contextual panels
```

### Phase 4 — Settings unification

Migrate Settings to shared modal/form visual language.

Gate:

- no burgundy independent theme;
- tabs, cards, forms, sliders, and badges match APEX;
- warning/destructive colors are semantic;
- scrolling and focus states verified.

Commit example:

```text
feat(settings): align control atelier with unified apex design system
```

### Phase 5 — Responsive, accessibility, and final gate

Verify:

- `1440 × 900`;
- `1672 × 941`;
- `1920 × 1080`;
- Dock widths `300/336/400`;
- split Dock;
- empty states;
- contrast;
- keyboard/focus smoke behavior;
- contact sheet.

Run final tests and produce final report.

Commit example:

```text
chore(ui): complete responsive visual acceptance and desktop hardening
```

---

## 31. Final Test Gate

Run:

```text
npm run lint
npm test
npm run build
```

Also run or add where available:

- CSS arbitrary-color gate;
- accessibility smoke tests;
- interaction tests;
- layout persistence tests;
- migration tests;
- screenshot suite;
- blank-screen detection;
- Dock responsive tests.

All newly introduced failures must be resolved.

A known unrelated baseline exception may be documented only with evidence that it is pre-existing and non-deterministic.

---

## 32. Final Acceptance Conditions

Do not declare completion until all are true:

- every page looks like one product;
- all full-page headers share one geometry;
- cards share one surface system;
- tables share one density and interaction system;
- typography is consistent;
- semantic colors are disciplined;
- Desk no longer uses separate red/burgundy chrome;
- Settings no longer uses separate burgundy chrome;
- Lab/Ops/Intel/Memory no longer use page-specific decorative themes;
- Command adapts intelligently at `1440`, `1672`, and `1920`;
- additional width surfaces useful content rather than blank space;
- Dock remains bounded and subordinate;
- split Dock content remains readable at `300px`;
- Memory Dock uses compact presentation;
- empty Queue/Tracking states look intentional;
- no blank screenshots exist;
- no clipping or overlap exists;
- no horizontal page overflow exists;
- Chrome screenshots were actually opened and inspected;
- final contact sheet is visually coherent;
- lint passes;
- tests pass;
- production build passes;
- no new console errors exist;
- no new relevant network failures exist.

---

## 33. Final Report Format

Return one final Markdown report containing:

1. Architecture preserved
2. Visual-system summary
3. Tokens added/updated
4. Shared primitives created/updated
5. Legacy visual systems retired
6. Page-by-page migration summary
7. Command responsive behavior
8. Desk redesign summary
9. Settings redesign summary
10. DataTable unification
11. Dock compact-layout behavior
12. Empty/loading/error-state behavior
13. Files added
14. Files modified
15. Files removed
16. Git commits by phase
17. Tests and exact results
18. Chrome channel
19. Viewport/DPR/zoom evidence
20. Screenshot folder
21. Contact-sheet path
22. Concrete visual observations per page
23. Console/network results
24. Accessibility findings
25. Remaining deviations
26. Release-readiness verdict

Use one of:

```text
DESKTOP VISUAL UNIFICATION FULLY IMPLEMENTED
DESKTOP VISUAL UNIFICATION IMPLEMENTED WITH EXPLICIT DEVIATIONS
DESKTOP VISUAL UNIFICATION INCOMPLETE
```

Do not use `FULLY IMPLEMENTED` while any required item remains transitional or visually inconsistent.

---

## 34. Immediate Execution Instruction

Begin now from the current codebase.

Do not roll back the current IA or architecture.

Do not produce another planning-only document.

Start with Phase 1 shared tokens and primitives, then rebuild Command, migrate the remaining pages, unify Settings, and complete the final responsive/contact-sheet gate.

Continue automatically after every successful phase.

Stop only for a genuine blocker as defined in this document.
