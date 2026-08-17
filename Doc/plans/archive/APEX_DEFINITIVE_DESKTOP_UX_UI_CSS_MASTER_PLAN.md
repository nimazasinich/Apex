# APEX Portal — Definitive Desktop UX/UI, CSS Architecture, and Full Grok Implementation Contract

**Version:** 3.0  
**Status:** Authoritative full-execution specification  
**Scope:** Desktop web application only  
**Primary project root:** `C:\project\APEX-frontend-phase2 (4)\apex-trading-engine`  
**Authoritative plan location after replacement:** `C:\project\APEX-frontend-phase2 (4)\apex-trading-engine\APEX_DEFINITIVE_DESKTOP_UX_UI_CSS_MASTER_PLAN.md`  
**Primary acceptance viewport:** `1672 × 941`  
**Secondary validation viewports:** `1440 × 900` and `1920 × 1080`  
**Target agent:** Grok 4.5 in Cursor  
**Product direction:** Professional AI-assisted crypto trading workstation  

---

# 0. How to use this file

This file is both:

1. the definitive product and engineering master plan; and
2. the full execution prompt for Grok 4.5.

Replace the older master-plan file with this document at:

```text
C:\project\APEX-frontend-phase2 (4)\apex-trading-engine\APEX_DEFINITIVE_DESKTOP_UX_UI_CSS_MASTER_PLAN.md
```

Then start a new Cursor/Grok session and send only:

```text
Read and execute the complete authoritative plan at:

C:\project\APEX-frontend-phase2 (4)\apex-trading-engine\APEX_DEFINITIVE_DESKTOP_UX_UI_CSS_MASTER_PLAN.md

You are authorized to implement the entire plan end to end. Follow every repository-audit, external-Chrome screenshot, visual-inspection, test, migration, and completion rule in the file. Continue automatically through all phases after each phase gate passes. Do not pause for routine approval. Stop only for a genuine blocker or a product decision that the plan cannot resolve.
```

Do not paste several older prompts into the same session. Do not ask the agent to merge old plans. This document supersedes all prior APEX UI/UX redesign prompts as the execution authority.

---

# 1. Grok operating contract

## 1.1 Role

You are the lead frontend architect, senior React/TypeScript engineer, CSS systems engineer, UX implementation owner, and visual QA reviewer for APEX Portal.

You are responsible for implementing this entire plan in the real repository, validating it in a real external Chrome browser, fixing defects discovered from screenshots, and delivering a working desktop application rather than another planning document.

## 1.2 Full implementation authorization

You are authorized to complete every phase in this document.

You do **not** need to request approval after each normal phase. Continue automatically when the current phase gate passes.

Stop only when:

- a required external service or dependency is unavailable and no safe local fallback exists;
- the repository contains a product-level conflict that this document cannot resolve;
- a destructive data migration would be required;
- a live-trading capability would be implied or enabled without an existing approved backend;
- the user’s uncommitted work would be overwritten;
- real external Chrome/Edge visual verification cannot be performed.

Do not stop merely to ask whether you should continue to the next listed phase.

## 1.3 Repository-first implementation rule

The repository may have changed since this plan was written. A requirement may already be implemented, partially implemented, implemented differently, outdated, or missing.

Before changing any feature, page, component, state owner, or CSS block:

1. inspect the current repository;
2. read the current relevant files;
3. inspect all usages and tests;
4. compare the real implementation with this plan;
5. classify the requirement as:
   - **Compliant**
   - **Partial**
   - **Outdated**
   - **Incorrect**
   - **Missing**
6. keep compliant implementations;
7. update partial, outdated, or incorrect implementations;
8. implement only genuinely missing functionality;
9. do not duplicate an implementation that already exists;
10. do not replace newer working business logic with an older assumption from this document.

Use the following audit format internally and in phase reports:

| Requirement | Current implementation | Status | Action |
|---|---|---|---|
| Example | Existing component/file | Compliant / Partial / Outdated / Incorrect / Missing | Keep / Update / Replace / Implement |

The plan is authoritative for product architecture, terminology, interaction rules, CSS semantics, dimensions, and acceptance criteria.

The current repository is authoritative for actual:

- file names;
- component APIs;
- service contracts;
- backend routes;
- data types;
- test structure;
- working business logic;
- current implementation state.

Map the plan onto the real codebase. Never invent file names or APIs without first verifying them.

## 1.4 Do not get trapped in planning

Do not create a new redesign plan, alternate architecture document, or competing master plan.

A short repository audit and implementation map are required, but they are the start of execution, not a replacement for execution.

After the audit:

- implement;
- run;
- open in Chrome;
- capture;
- inspect;
- fix;
- verify;
- continue.

## 1.5 Desktop-only scope

Desktop is the only product-design priority.

Do not redesign:

- mobile navigation;
- mobile sheets;
- mobile stacks;
- mobile breakpoints;
- phone layouts.

A minimal mobile compatibility adjustment is allowed only when required to keep TypeScript, tests, build, or existing runtime behavior working. Report such changes explicitly.

## 1.6 Preserve business logic and user work

Before modifying code:

- inspect `git status`;
- do not discard or overwrite unrelated changes;
- follow any repository backup rule already present;
- make timestamped backups under the project’s existing `temp/` convention before a risky overwrite if that convention exists;
- preserve APIs, data contracts, scanner logic, AI logic, and execution restrictions unless this plan explicitly changes their UI representation;
- do not enable Live execution;
- keep `liveEnabled: false` or the repository’s equivalent until an approved backend exists.

---

# 2. Current baseline and known defects

The following observations come from the prior repository audit and user-supplied desktop screenshots. They are a starting hypothesis only; verify the current repository before acting.

## 2.1 Known technical baseline

Previously observed:

- React 19, Vite 6, TypeScript;
- Express `server.ts`;
- Tailwind v4 through `@tailwindcss/vite`;
- a large monolithic `src/index.css`;
- workspace switching through `activePage` state rather than React Router;
- state concentrated in a large `App.tsx`;
- scattered local-storage preference helpers;
- no shared Right Command Rail;
- no shared Dock Host;
- multiple page-local drawer/panel systems;
- existing Playwright or screenshot tooling;
- current reference viewport convention of `1672 × 941`.

Verify all of this again.

## 2.2 Known critical UX defects

The current screenshots show that some contextual panels behave as blocking modals on initial page load.

### Tracking

Observed failure:

- Inspector is already open when Tracking loads;
- the underlying page is blurred or heavily obscured;
- the user cannot review the complete Tracking workspace without closing the panel.

### Queue

Observed failure:

- Ticket Detail opens on page load;
- it may display `NO TICKET SELECTED`;
- an empty panel occupies substantial width and blocks the Queue;
- no context panel should open without a valid selected signal.

### Desk

Observed failure:

- Execution opens as a modal-like overlay on page load;
- the chart is blurred and partially hidden;
- execution tools should not block the chart by default.

### Settings

Settings is intentionally a true modal. A backdrop is allowed there.

### Required principle

```text
Context tools are not modals.
```

Until the shared Dock Host exists:

- legacy context drawers must be closed by default;
- they may open only through an explicit valid interaction;
- empty or contextless panels must not open;
- no ordinary inspector, ticket, or execution panel may blur the entire workspace;
- no hidden or empty panel may reserve width.

After the Dock Host exists:

- Docked panels push the canvas;
- Floating panels overlay without a full-page modal backdrop;
- only true modals such as Settings may trap focus and blur/dim the application.

## 2.3 Known structural defects

Verify and address:

- Left Rail currently has too many destinations;
- Intel, Decisions, History, and Feed are likely separate page slots;
- Command repeats navigation links already represented in the rail;
- page-specific card and panel languages coexist;
- hard-coded colors and arbitrary Tailwind hex values exist;
- directional rose is sometimes used for non-directional error or chrome;
- micro-text below the accepted scale exists;
- layout and session state are mixed or duplicated;
- `focusedTicker` or selected-ticker state may have competing page-local copies;
- page-local panel open preferences may restore invalid states;
- empty panels may consume canvas width;
- no distinct `--color-system-critical` token may exist.

---

# 3. Product north star

APEX must become a disciplined desktop trading workstation combining the strongest qualities of TradingView, Bloomberg, and a professional risk console.

It must **not** feel like:

- an IDE;
- a long document;
- a decorative cyberpunk HUD;
- a stack of unrelated dashboard cards;
- a collection of page-specific themes;
- a modal-heavy workflow.

The final shell is:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Global Header: environment · feed · scanner · freshness · universe · CTA │
├──────┬───────────────────────────────────────────────┬────────────┬──────┤
│ Left │                                               │ Dock Host  │Right │
│ Rail │               Workspace Canvas                │ optional   │Rail  │
│      │                                               │ 300–400px  │48px  │
└──────┴───────────────────────────────────────────────┴────────────┴──────┘
```

- **Left Workspace Rail:** changes where the analyst works.
- **Center Workspace Canvas:** owns the page’s primary task.
- **Right Command Rail:** exposes tools that travel with the analyst.
- **Dock Host:** displays one full tool or two vertically split tools.
- **Floating Panel:** supports temporary comparison without shrinking the canvas.
- **Workspace-specific layout:** each workspace restores its own arrangement.
- **Shared session context:** focused ticker and selected objects remain consistent.

---

# 4. Canonical information architecture

## 4.1 Canonical workspace labels

| Order | Key | Label | Purpose |
|---:|---|---|---|
| 1 | `overview` | **Command** | Operational briefing, system state, highest-priority action |
| 2 | `desk` | **Desk** | Chart, thesis, levels, risk review, execution controls |
| 3 | `signals` | **Queue** | Signal triage and promotion |
| 4 | `tracking` | **Tracking** | Thesis lifecycle and paper exposure |
| 5 | `watchlist` | **Markets** | Universe discovery and management |
| 6 | `backtest` | **Lab** | Research and backtesting |
| 7 | `operations` | **Ops** | Feed, scanner, service, latency, dependency, and execution health |
| 8 | `settings` | **Settings** | Configuration; true modal or dedicated full settings surface |

Rules:

- Maximum eight permanent Left Rail destinations.
- Feed becomes part of Ops.
- Intel becomes primarily a Right Rail tool with an `Expand` action.
- Decisions and History become one Memory system with Active and Archive views.
- Command must not repeat Markets, Tracking, Decisions, or Insights as a second navigation row.
- Expanded rail mode may show group labels:
  - Trading
  - Research
  - System

## 4.2 Canonical object terminology

| Concept | Canonical term |
|---|---|
| Algorithmic opportunity/event | **Signal** |
| Notification requiring attention | **Alert** |
| Focused details surface | **Ticket** |
| Idea monitored through lifecycle | **Tracked Thesis** |
| Real paper/testnet/live exposure | **Position** |
| Recorded analyst action | **Decision** |
| Active and archived decisions UI | **Memory** |
| Full universe management page | **Markets** |
| Compact selected-market tool | **Watchlist** |
| Read-only context and evidence | **Intel** |

Do not use `Position` for an idea that has no exposure object. Do not use `Order` unless an actual order object exists.

## 4.3 Right Command Rail

Default primary tools:

1. Watchlist
2. Signals
3. Positions
4. Ticket

User-pinnable tools:

- Intel
- Memory

Overflow:

- Layout controls
- Reset Layout
- API/exchange connections
- diagnostics
- low-frequency utilities

API credentials must not occupy a permanent primary rail slot.

---

# 5. Global shell specification

## 5.1 Header

Keep only cross-application ambient information:

- APEX logo;
- active workspace title or compact context;
- Paper/Testnet/Live environment;
- feed connectivity;
- scanner state;
- universe count;
- data freshness;
- one explicit scanner action;
- notifications;
- account/profile menu.

Remove or relocate:

- duplicate Markets/Tracking/Decisions links;
- contextual ticket actions;
- large KPI cards;
- ambiguous `START`;
- low-frequency sound/help/settings chrome.

Use explicit scanner labels:

- `RUN SCAN`
- `START SCANNER`
- `RESUME SCANNER`
- `PAUSE SCANNER`

Scanner actions must never resemble order execution.

## 5.2 Canvas minimum widths

| Workspace | Minimum usable canvas |
|---|---:|
| Command | 900px |
| Desk chart area | 720px |
| Queue | 820px |
| Tracking | 820px |
| Markets | 860px |
| Lab | 900px |
| Ops | 820px |

The application must block, tab, close, or float a secondary tool rather than violate these minimums.

## 5.3 Shell dimensions

```css
:root {
  --header-height: 64px;
  --workspace-rail-width: 56px;
  --command-rail-width: 48px;

  --dock-width: 336px;
  --dock-width-min: 300px;
  --dock-width-max: 400px;

  --command-canvas-min: 900px;
  --desk-canvas-min: 720px;
}
```

```css
.apex-shell {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: var(--header-height) minmax(0, 1fr);
  background: var(--apex-bg-canvas);
  color: var(--apex-text-primary);
}

.apex-shell__body {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns:
    var(--workspace-rail-width)
    minmax(var(--workspace-min-width), 1fr)
    auto
    var(--command-rail-width);
}
```

The Dock Host column must collapse completely when no docked tool is visible. An empty Dock Host must consume exactly zero canvas width.

---

# 6. Unified context-panel system

## 6.1 One infrastructure only

Adapt or absorb existing contextual surfaces such as:

- `InsightPanel`
- `SignalDetailSheet`
- `DeskExecutionPanel`
- `WatchlistPanel`
- `TrackingObservatoryPanel`
- `IntelligencePanel`
- decision/history detail drawers

Required infrastructure:

- `CommandRail`
- `DockHost`
- `DockPanel`
- `DockSplit`
- `PanelTabs`
- `FloatingPanel`
- `PanelHeader`
- `PanelEmptyState`

Do not build separate drawer systems for different pages.

## 6.2 Panel modes

```ts
type PanelMode = 'closed' | 'docked' | 'floating';
```

### Closed

- no visual footprint in the canvas;
- rail icon remains;
- badge may show unread/stale/armed/review-required state.

### Docked

- opens inside the shared Dock Host;
- pushes the canvas;
- never uses a full-page modal backdrop;
- width is clamped from 300px to 400px and never exceeds 32vw;
- supports one full panel or two vertically split panels;
- other open tools remain as tabs.

### Floating

- overlays the canvas without changing canvas width;
- one floating panel maximum in v1;
- draggable only by its header;
- constrained inside the application viewport;
- restored coordinates are clamped;
- no full-page modal backdrop;
- does not trap focus;
- respects Desk protected zones.

## 6.3 Dock single and split modes

```text
Single
┌──────────────────┐
│ Active panel     │
│                  │
└──────────────────┘
```

```text
Split
┌──────────────────┐
│ Primary panel    │ 60%
│                  │
├──────────────────┤ draggable divider
│ Secondary panel  │ 40%
│                  │
└──────────────────┘
```

Rules:

- maximum two simultaneously visible docked tools;
- both tools share one vertical column;
- default split ratio 60/40;
- minimum visible panel height 220px;
- split ratio persisted per workspace;
- if height is insufficient, secondary tool becomes a tab or the one allowed floating panel;
- no horizontal multi-column docking in v1.

## 6.4 Interaction rules

- closed rail icon click → open Docked;
- open rail icon click → focus panel/tab;
- active rail icon click again → close;
- explicit pin/unpin → Docked/Floating;
- `Esc` closes only the Floating Panel;
- Docked panels close through their own control;
- no double-click dependency;
- no arbitrary IDE-style pane creation;
- no nested scroll regions inside a panel body.

## 6.5 Mandatory initial-state rules

These rules directly correct the current screenshots:

- Tracking Inspector is closed on initial Tracking load.
- Queue Ticket is closed until a valid signal is selected.
- Desk Execution is not a blocking modal on initial Desk load.
- No empty Ticket, Inspector, Position, or Intel tool may auto-open.
- A stored open state without valid context is normalized to closed.
- Context panels never dim or blur the full page.
- Settings remains a true modal and may use a backdrop.
- No panel may reserve width while closed or empty.

## 6.6 Workspace defaults

| Workspace | Default tool layout |
|---|---|
| Command | Watchlist docked; Signals available; Ticket closed |
| Desk | Positions docked; Ticket opens when a valid symbol/thesis is armed |
| Queue | no Ticket until row selection; then Ticket docked |
| Tracking | Positions available; Ticket follows a valid selected thesis |
| Markets | tools closed by default to protect table width |
| Lab | Memory optional |
| Ops | all tools closed |
| Settings | modal; not Dock Host content by default |

---

# 7. State, migration, and synchronization

## 7.1 Separate layout from session state

```ts
interface CommandBoardLayoutV2 {
  version: 2;
  workspaces: Record<WorkspaceKey, {
    dockWidth: number;
    dockMode: 'single' | 'split';
    primaryTool: ToolKey | null;
    secondaryTool: ToolKey | null;
    openTabs: ToolKey[];
    splitRatio: number;
    floatingTool: ToolKey | null;
    floatingRect: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    pinnedTools: ToolKey[];
  }>;
  updatedAt: string;
}
```

Storage key:

```text
apex.commandBoard.layout.v2
```

```ts
interface WorkspaceSessionV1 {
  activeWorkspace: WorkspaceKey;
  focusedTicker: string | null;
  selectedSignalId: string | null;
  selectedPositionId: string | null;
  selectedDecisionId: string | null;
  activeTimeframe: string;
  updatedAt: string;
}
```

Storage key:

```text
apex.workspace.session.v1
```

`focusedTicker` must never be stored inside layout preference.

## 7.2 Single source of truth

All of these update the same session state:

- Command candidate click;
- Top Markets click;
- Markets table click;
- Watchlist click;
- Queue row selection;
- Tracking selection;
- Desk symbol change;
- Ticket symbol navigation.

Remove private competing selected-ticker copies unless they are controlled form drafts with explicit commit semantics.

## 7.3 Legacy preference migration

Audit every existing panel preference helper and local-storage key, including equivalents of:

- tracking inspector preferences;
- signals detail preferences;
- Desk execution preferences;
- Insight preferences;
- Archive and backtest ledger preferences;
- `openTicker`;
- page-local selected ticker;
- stale `isOpen` values.

Migration rules:

1. never rely on manually clearing localStorage;
2. validate stored tool keys;
3. reject open context panels that lack a valid selection;
4. clamp width, split ratio, and floating rectangles;
5. migrate valid preferences to `apex.commandBoard.layout.v2`;
6. remove or ignore obsolete visibility keys after a successful migration;
7. preserve unrelated preferences;
8. a migration failure falls back to safe workspace defaults;
9. safe default is a visible canvas, not an open blocking panel.

Test both:

- clean browser profile;
- legacy profile populated with old panel-open values.

---

# 8. CSS architecture

## 8.1 Ground the redesign in the current palette

Inspect the current `index.css` first. Keep the existing raw palette where present:

```css
@theme {
  --color-canvas: #07090e;
  --color-brand: #22d3ee;
  --color-long: #2dd4bf;
  --color-short: #fb7185;
  --color-signal-active: #f5b942;
  --color-analytics: #a78bfa;
}
```

Reuse the current surface tokens:

```css
--color-surface-low;
--color-surface-mid;
--color-surface-high;
```

Add when missing and contrast-tested:

```css
@theme {
  --color-system-critical: #ff3b4f;
}
```

Do not replace the palette with a new theme. The work is semantic discipline, token ownership, hierarchy, and consolidation.

## 8.2 Semantic aliases

```css
:root {
  color-scheme: dark;

  --apex-bg-canvas: var(--color-canvas);
  --apex-bg-surface-1: var(--color-surface-low);
  --apex-bg-surface-2: var(--color-surface-mid);
  --apex-bg-surface-3: var(--color-surface-high);

  --apex-text-primary: rgba(245, 247, 250, 0.96);
  --apex-text-secondary: rgba(214, 220, 228, 0.76);
  --apex-text-muted: rgba(177, 186, 198, 0.62);
  --apex-text-disabled: rgba(177, 186, 198, 0.38);

  --apex-border-subtle: rgba(174, 190, 208, 0.12);
  --apex-border-default: rgba(174, 190, 208, 0.20);
  --apex-border-strong: rgba(174, 190, 208, 0.32);

  --apex-interactive: var(--color-brand);
  --apex-direction-long: var(--color-long);
  --apex-direction-short: var(--color-short);
  --apex-analytics: var(--color-analytics);
  --apex-attention: var(--color-signal-active);
  --apex-system-critical: var(--color-system-critical);

  --apex-interactive-soft:
    color-mix(in srgb, var(--apex-interactive) 12%, transparent);
  --apex-long-soft:
    color-mix(in srgb, var(--apex-direction-long) 12%, transparent);
  --apex-short-soft:
    color-mix(in srgb, var(--apex-direction-short) 12%, transparent);
  --apex-analytics-soft:
    color-mix(in srgb, var(--apex-analytics) 12%, transparent);
  --apex-attention-soft:
    color-mix(in srgb, var(--apex-attention) 12%, transparent);
  --apex-critical-soft:
    color-mix(in srgb, var(--apex-system-critical) 12%, transparent);
}
```

Validate text and border opacity against the actual current surfaces before final acceptance.

## 8.3 Semantic usage contract

| Token | Allowed meaning | Prohibited use |
|---|---|---|
| Interactive cyan | focus, active navigation, links, primary CTA | confidence, bullish data, decoration |
| Long teal | long, bullish, gain | generic success or system health |
| Short rose | short, bearish, loss | service error, outage, invalid form |
| Analytics violet | confidence, evidence, model context | primary CTA or navigation |
| Attention amber | stale, blocked, warning, review required | decorative card emphasis |
| Critical red | service, feed, execution, infrastructure failure | bearish market direction |

## 8.4 CSS layer order

```css
@layer reset, tokens, base, primitives, shell, components, utilities, overrides;
```

Ownership:

- `reset`: normalization;
- `tokens`: raw and semantic properties;
- `base`: body, typography, links, focus;
- `primitives`: cards, tables, buttons, badges, states, forms;
- `shell`: header, rails, canvas, dock, floating;
- `components`: composed page components;
- `utilities`: narrowly approved helpers;
- `overrides`: temporary migration exceptions with removal comments.

A page stylesheet may compose primitives but may not bypass token ownership.

## 8.5 File organization

Preferred structure:

```text
src/styles/
  index.css
  tokens.css
  base.css
  primitives/
    surfaces.css
    typography.css
    buttons.css
    badges.css
    tables.css
    states.css
    forms.css
  shell/
    app-shell.css
    workspace-rail.css
    command-rail.css
    dock-host.css
    floating-panel.css
  pages/
    command.css
    desk.css
    queue.css
    tracking.css
    markets.css
    lab.css
    ops.css
  legacy/
    temporary-overrides.css
```

Do not force a risky physical split if the current build is safer with one `index.css`. In that case, preserve this conceptual layer order with clear section comments.

## 8.6 Spacing

```css
:root {
  --space-0: 0;
  --space-0-5: 4px;
  --space-1: 8px;
  --space-1-5: 12px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --space-5: 40px;
  --space-6: 48px;
}
```

Rules:

- 8px is the primary grid;
- 4px is allowed for compact internal alignment;
- page gaps normally 16px;
- card padding normally 16px or 24px;
- eliminate arbitrary layout values such as 13px, 19px, 27px, or 34px unless required by an external chart.

## 8.7 Typography

```css
:root {
  --font-ui: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-data: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  --text-label: 11px;
  --text-caption: 12px;
  --text-body: 13px;
  --text-body-strong: 14px;
  --text-data: 15px;
  --text-data-critical: 17px;
  --text-title: 20px;

  --line-tight: 1.2;
  --line-normal: 1.45;
  --line-reading: 1.6;
}
```

Rules:

- active interface text never below 11px;
- routine body/table text 13–14px;
- important values 14–16px;
- Entry/SL/TP/maximum-loss values 16–18px;
- page title 18–22px;
- restrict uppercase and wide letter spacing to short eyebrows;
- data font only for numeric and compact technical content;
- never shrink text to make a screenshot fit.

```css
.apex-numeric,
.apex-table td[data-numeric],
.apex-price,
.apex-pnl,
.apex-size,
.apex-time {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums lining-nums;
}
```

## 8.8 Geometry and elevation

```css
:root {
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  --shadow-dock: 0 18px 44px rgba(0, 0, 0, 0.38);
  --shadow-float: 0 24px 72px rgba(0, 0, 0, 0.52);
  --shadow-focus:
    0 0 0 1px color-mix(in srgb, var(--apex-interactive) 55%, transparent);
}
```

- use border and elevation ramps, not brightness jumps;
- no layered outer glow on normal cards;
- Hero may use one controlled accent treatment;
- focused cards use one cyan border treatment;
- do not combine gradient, glow, strong border, and inner outline on one normal component.

## 8.9 Dock Host CSS

```css
.apex-dock-host {
  width: clamp(
    var(--dock-width-min),
    min(var(--dock-width), 32vw),
    var(--dock-width-max)
  );
  min-width: 0;
  min-height: 0;
  display: grid;
  background: var(--apex-bg-surface-2);
  border-inline-start: 1px solid var(--apex-border-default);
  box-shadow: var(--shadow-dock);
}

.apex-dock-host[data-empty="true"] {
  width: 0;
  border: 0;
  box-shadow: none;
  overflow: hidden;
}

.apex-dock-host[data-mode="single"] {
  grid-template-rows: minmax(0, 1fr);
}

.apex-dock-host[data-mode="split"] {
  grid-template-rows:
    minmax(220px, var(--dock-primary-size, 60%))
    8px
    minmax(220px, 1fr);
}
```

## 8.10 Floating Panel CSS

```css
.apex-floating-panel {
  position: absolute;
  z-index: var(--z-floating-panel, 50);
  width: clamp(320px, 28vw, 460px);
  max-height: min(720px, calc(100% - 32px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--apex-bg-surface-3);
  border: 1px solid var(--apex-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-float);
}
```

No context Floating Panel may add:

- full-screen backdrop;
- full-page blur;
- modal focus trap.

## 8.11 Shared surfaces

```css
.apex-surface {
  min-width: 0;
  background: var(--apex-bg-surface-1);
  border: 1px solid var(--apex-border-subtle);
  border-radius: var(--radius-md);
}

.apex-surface[data-elevation="mid"] {
  background: var(--apex-bg-surface-2);
  border-color: var(--apex-border-default);
}

.apex-surface[data-elevation="high"] {
  background: var(--apex-bg-surface-3);
  border-color: var(--apex-border-strong);
}

.apex-surface[data-focused="true"] {
  border-color:
    color-mix(in srgb, var(--apex-interactive) 58%, transparent);
  box-shadow: var(--shadow-focus);
}
```

## 8.12 Tables

Queue, Markets, Tracking, Memory, and History use one foundation:

```css
.apex-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-body);
}

.apex-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 36px;
  padding-inline: var(--space-1-5);
  color: var(--apex-text-muted);
  background: var(--apex-bg-surface-2);
  border-block-end: 1px solid var(--apex-border-default);
  text-align: start;
  font-size: var(--text-label);
}

.apex-table td {
  height: 44px;
  padding-inline: var(--space-1-5);
  border-block-end: 1px solid var(--apex-border-subtle);
}

.apex-table tbody tr:hover {
  background: var(--apex-interactive-soft);
}

.apex-table tbody tr[aria-selected="true"] {
  background:
    color-mix(in srgb, var(--apex-interactive) 10%, transparent);
  box-shadow: inset 2px 0 0 var(--apex-interactive);
}
```

## 8.13 States

All data surfaces support:

- loading;
- empty;
- stale;
- degraded;
- error;
- permission-blocked;
- unavailable.

Visual meaning:

- Empty → neutral with real next action;
- Stale → amber;
- service error → critical red;
- bearish market movement → short rose.

Never display a blank panel without explanation.

## 8.14 Focus and motion

```css
:where(button, a, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--apex-interactive);
  outline-offset: 2px;
}
```

- Dock tabs use tab semantics;
- split divider is keyboard-adjustable;
- modal traps focus;
- Docked/Floating context panels do not trap the full app;
- respect `prefers-reduced-motion`;
- do not animate prices with repeated glow pulses.

## 8.15 Prohibited CSS

Do not introduce:

```text
bg-[#...]
text-[#...]
border-[#...]
shadow-[#...]
fill-[#...]
stroke-[#...]
inline hex colors
new uncontrolled glass-*
new uncontrolled neon-*
new uncontrolled glow-*
new uncontrolled terminal-*
CSS zoom
transform: scale(...) on workspace roots
```

Create a CI check with a shrinking temporary legacy allowlist. Do not block the first migration because old files already contain violations; block **new** violations and reduce the allowlist phase by phase.

---

# 9. Command dashboard specification

## 9.1 Objective

The analyst should understand:

1. Is the system healthy?
2. What changed?
3. What is the highest-priority opportunity or risk?
4. Why is it recommended?
5. What should be reviewed next?
6. Where should the analyst act?

## 9.2 Board budget at 1672 × 941

| Region | Target size |
|---|---:|
| Global Header | 64px |
| Page Header | 48px |
| Compact Status Strip | 80px |
| Hero / Next Action | 128px |
| Primary content row | 248px minimum |
| Secondary content row | 208px minimum |
| Board gap | 16px |
| Compact internal gap | 8px |

Do not force content into this budget by shrinking active text. Move secondary detail into Ticket or Intel, use controlled scrolling where appropriate, or allow gentle page scrolling.

## 9.3 Board grid

```text
┌──────────────────────────────────────────────────────────────┐
│ Command · session · environment · RUN SCAN                  │
├──────────────────────────────────────────────────────────────┤
│ Scanner | Coverage | Review Ready | Data Health             │
├──────────────────────────────────────────────────────────────┤
│ HERO: Next Action · thesis · confidence · risk · CTA        │
├─────────────────────────────────────┬────────────────────────┤
│ Strategy / Priority Queue           │ Focused Intel / News   │
├───────────────────┬─────────────────┼────────────────────────┤
│ Top Markets       │ Market Pulse    │ Portfolio Risk/Regime  │
└───────────────────┴─────────────────┴────────────────────────┘
```

```css
.command-board {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-areas:
    "head head head head head head head head head head head head"
    "stat stat stat stat stat stat stat stat stat stat stat stat"
    "hero hero hero hero hero hero hero hero hero hero hero hero"
    "queue queue queue queue queue queue queue queue intel intel intel intel"
    "market market market market pulse pulse pulse pulse risk risk risk risk";
  grid-template-rows:
    48px
    80px
    128px
    minmax(248px, auto)
    minmax(208px, auto);
  gap: var(--space-2);
  padding: var(--space-2);
}
```

## 9.4 Required changes

- remove duplicate Markets, Tracking, Decisions, and Insights navigation;
- use exactly four compact status metrics:
  - Scanner
  - Coverage
  - Review Ready
  - Data Health
- remove duplicate Decisions KPI from the board;
- Hero is the only dominant region;
- confidence uses violet;
- direction uses small directional treatment;
- system health uses system tokens;
- top 3–5 candidates;
- `VIEW ALL` opens Queue;
- row click updates session focus and opens Ticket;
- Intel is bound to focused ticker;
- every sparkline declares timeframe;
- unsupported metrics use honest unavailable states.

## 9.5 Command initial screenshot state

At initial load:

- no blocking panel;
- Watchlist may be Docked only if the persisted/default layout leaves at least 900px of canvas;
- no page blur;
- no modal backdrop;
- Hero and Queue remain readable;
- no content clipped below the viewport merely because a tool opened.

---

# 10. Page-by-page implementation specification

## 10.1 Desk

Objective: chart-first risk-controlled execution workspace.

Requirements:

- neutral chart background;
- chart remains visually dominant;
- initial page load must not show a blocking Execution modal;
- Positions may be Docked by default;
- Ticket opens only with valid armed context;
- Entry/SL/TP/quantity/max-loss/R:R use 16–18px where critical;
- flatten nested environment/mode/corridor tabs to one primary tab row plus collapsible sections;
- Paper/Testnet/Live are visually distinct;
- keep Live disabled if backend is not approved;
- Floating Panel cannot cover protected chart or CTA regions;
- explicit labels:
  - `REVIEW PAPER ORDER`
  - `PLACE TESTNET ORDER`
  - `REVIEW LIVE ORDER`

Before any execution-like submission show:

- side;
- order type;
- quantity;
- position size;
- account risk;
- maximum loss;
- entry;
- stop;
- targets;
- R:R;
- leverage;
- fees;
- slippage;
- liquidation price where applicable;
- available balance;
- freshness;
- execution readiness.

## 10.2 Queue

Objective: full signal triage.

Requirements:

- page initially loads with no Ticket unless a valid selection is restored;
- never show a blocking `NO TICKET SELECTED` panel;
- sortable shared DataTable;
- columns:
  - symbol
  - direction
  - confidence
  - calibration
  - risk
  - freshness
  - lifecycle
  - expected value or R:R where available
  - action
- row selection updates session state and opens Ticket;
- empty state explains scan rules;
- CTAs:
  - `RUN SCAN`
  - `EDIT RULES`

## 10.3 Tracking

Objective: thesis lifecycle and valid exposure monitoring.

Requirements:

- page initially loads fully visible;
- no Inspector auto-open without a valid selection;
- lifecycle rows or timeline;
- avoid duplicate Ticket summaries;
- detail structure:
  - Summary
  - Evidence
  - Risk
  - Execution
  - Activity
- `Tracking` names the lifecycle page;
- `Positions` names actual exposure tool;
- selecting a valid thesis updates Ticket/Positions.

## 10.4 Markets

Objective: universe discovery and management.

Requirements:

- shared table/row primitive with compact Watchlist;
- search, filters, add/remove, reorder, thresholds, saved views;
- timeframe shown on each sparkline;
- market-quality columns where current data supports them;
- no separate visual theme;
- full management table receives width priority;
- Right tools closed by default if needed.

## 10.5 Lab

Objective: research and backtesting.

Requirements:

- configuration left, results right;
- reuse Desk chart language;
- distinguish in-sample and out-of-sample;
- Memory optional for comparison;
- no separate purple “research app” theme;
- preserve existing backend and allowlist restrictions.

## 10.6 Ops

Objective: system status board.

Requirements:

- owns Feed status;
- all context tools closed by default;
- no long/short teal/rose semantics;
- use neutral, success, attention, and system-critical;
- cover feed, scanner, latency, dependencies, API health, execution readiness;
- compact connection indicator remains in Header;
- degraded and unavailable states are clear.

## 10.7 Intel

Objective: calm read-only decision context.

Requirements:

- primary form is Dockable;
- full-page expansion exists for deep review;
- source, time, relevance, confidence, and conflict;
- no trading CTA styling;
- no independent polling revision that disagrees with the focused page.

## 10.8 Memory

Objective: decisions and history in one system.

Requirements:

- one shared table;
- presets:
  - Active
  - Archive
- filters, review, export, expanded view;
- Decisions and History no longer require separate permanent Left Rail destinations;
- use the same table density as Queue and Markets.

## 10.9 Settings

Settings is a true modal or a deliberate full-settings surface.

Split:

Quick Settings:

- density;
- sound;
- appearance if supported;
- shortcuts;
- simple notifications.

Full Settings:

- risk limits;
- execution safeguards;
- exchange/API connections;
- scanner rules;
- universe;
- alert rules;
- providers;
- model controls;
- layout defaults.

Modal requirements:

- backdrop allowed;
- focus trap required;
- Escape and close control;
- no content clipped;
- internal scroll clearly visible;
- must fit the primary viewport without artificial scaling.

---

# 11. AI trust and execution responsibility

The interface must show:

```text
AI recommends
      ↓
Risk engine validates
      ↓
User reviews and approves
      ↓
Execution service submits
```

AI recommendation content, where supported:

- action;
- direction;
- confidence;
- calibration;
- expected value;
- R:R;
- age;
- horizon;
- supporting evidence;
- conflicting evidence;
- invalidation;
- freshness;
- model/version;
- automation allowed/blocked reason.

Do not present an isolated confidence percentage as decision authority.

Risk status and AI confidence must be separate visual concepts.

---

# 12. Mandatory real external Chrome verification

This section is non-negotiable.

## 12.1 Browser requirement

Final visual acceptance must use a real system-installed external desktop browser in headed mode.

Preferred:

1. Google Chrome
2. Microsoft Edge if Chrome is unavailable

With Playwright, use an installed channel:

```ts
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false
});
```

Fallback:

```ts
const browser = await chromium.launch({
  channel: 'msedge',
  headless: false
});
```

Do not use as final evidence:

- Cursor embedded browser;
- Cursor internal preview;
- editor webview;
- a miniature browser pane;
- a headless-only visual judgment;
- a screenshot rendered by an internal scaled preview.

If external Chrome/Edge cannot be launched, stop and report the blocker.

## 12.2 Primary viewport

Primary acceptance:

```text
1672 × 941
devicePixelRatio = 1
browser zoom = 100%
fullPage = false
```

Set the actual page viewport:

```ts
await page.setViewportSize({
  width: 1672,
  height: 941
});
```

Validate inside the page:

```ts
const viewport = await page.evaluate(() => ({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
  visualViewportWidth: window.visualViewport?.width ?? null,
  visualViewportHeight: window.visualViewport?.height ?? null,
  documentClientWidth: document.documentElement.clientWidth,
  documentScrollWidth: document.documentElement.scrollWidth
}));
```

Acceptance requires:

- `innerWidth === 1672`
- `innerHeight === 941`
- `devicePixelRatio === 1`
- visual viewport matches;
- screenshot metadata is exactly 1672 × 941;
- no horizontal overflow.

Also validate final changed pages at:

- 1440 × 900
- 1920 × 1080

The 1672 × 941 image is the primary design approval artifact.

## 12.3 No false fitting

Never make the page appear correct by:

- browser zoom other than 100%;
- CSS `zoom`;
- `transform: scale(...)` on workspace roots;
- reducing global font size;
- scaling screenshots afterward;
- cropping the acceptance screenshot;
- taking the primary screenshot at a wider viewport;
- hiding required content;
- compressing critical values below the approved type scale.

Fix the actual grid, spacing, wrapping, dimensions, and overflow.

## 12.4 Prove that Chrome is external and headed

At the start of each phase that changes rendered UI:

- open real Chrome visibly;
- record browser channel and executable;
- record `headless: false`;
- capture one OS/window-level proof image if tooling permits;
- primary page screenshots must still be exact viewport screenshots.

## 12.5 Navigate through the real UI

For each workspace:

- use the real Left Rail click or actual supported workspace mechanism;
- do not merely inject component markup;
- confirm the active workspace key;
- wait for a page-specific heading/root selector;
- do not rely only on `networkidle`;
- wait for Suspense/loading transitions to finish;
- wait for fonts and animations to settle;
- confirm correct content before capture.

## 12.6 Screenshot and fix loop for every changed page

After changing a page:

1. run relevant typecheck/tests;
2. start the real application;
3. launch external Chrome in headed mode;
4. set exact viewport;
5. navigate through real UI;
6. wait for page-specific selector;
7. confirm correct page loaded;
8. confirm no unresolved loading state;
9. confirm no invalid panel auto-open;
10. capture screenshot;
11. read actual PNG metadata;
12. open the image file and visually inspect it;
13. inspect console errors/warnings;
14. inspect failed requests;
15. collect measured element dimensions;
16. identify every defect;
17. fix the defects;
18. reload;
19. capture a replacement;
20. open and inspect again;
21. repeat until accepted;
22. only then move to the next page.

A generated image is not “inspected” until it is actually opened and reviewed.

## 12.7 Mandatory visual checklist

For every final page screenshot inspect:

### Rendering

- correct workspace;
- no blank canvas;
- no previous workspace still visible;
- no duplicated tree;
- no unresolved spinner/skeleton;
- no crash;
- no missing lazy chunk;
- no unexpected modal/drawer.

### Panel behavior

- no blocking context overlay on initial load;
- no page blur from a context panel;
- no empty Ticket/Inspector;
- no closed panel reserving width;
- Docked panel pushes canvas;
- Floating Panel does not act like a modal;
- Settings modal behavior remains intentional.

### Dimensions

- exact screenshot size;
- Header and Rail geometry;
- Dock width;
- canvas minimum;
- Desk chart minimum;
- no horizontal overflow;
- no off-screen Floating Panel;
- no clipped content;
- no overlapping text/icons;
- no panel over protected Desk controls.

### Visual system

- one clear hierarchy;
- restrained glow;
- correct semantic colors;
- readable typography;
- tabular numeric alignment;
- 8px grid consistency;
- no artificial scaling;
- no page-specific palette.

### Interaction

Where changed, test:

- Left Rail;
- Right Rail;
- Dock open/close;
- split mode;
- divider resizing;
- Floating open/drag/close;
- Escape behavior;
- persistence after refresh;
- clean and legacy storage;
- row selection;
- focused ticker sync;
- Ticket context;
- empty/loading/error states;
- keyboard focus.

## 12.8 Required screenshots per page

Store under:

```text
C:\project\APEX-frontend-phase2 (4)\apex-trading-engine\_qa\<timestamp>\<phase>\
```

Required when relevant:

```text
desktop-<workspace>-before-1672x941.png
desktop-<workspace>-after-1672x941.png
desktop-<workspace>-initial-panel-closed-1672x941.png
desktop-<workspace>-dock-open-1672x941.png
desktop-<workspace>-split-dock-1672x941.png
desktop-<workspace>-floating-1672x941.png
desktop-<workspace>-empty-state-1672x941.png
desktop-<workspace>-error-state-1672x941.png
desktop-<workspace>-1440x900.png
desktop-<workspace>-1920x1080.png
```

Do not overwrite prior evidence.

## 12.9 Dimension instrumentation

Use current selectors or add non-visual `data-testid` attributes where necessary.

Recommended:

```text
desktop-header
left-workspace-rail
right-command-rail
workspace-canvas
dock-host
desk-chart
workspace-command
workspace-desk
workspace-queue
workspace-tracking
workspace-markets
workspace-lab
workspace-ops
```

Collect:

- viewport;
- document scroll/client sizes;
- body scroll/client sizes;
- Header rectangle;
- rail rectangles;
- Dock rectangle;
- canvas rectangle;
- chart rectangle;
- Floating Panel rectangle;
- split panel heights.

## 12.10 Visual acceptance truth rule

Do not label a page `OK` when:

- a context panel blocks or blurs the page;
- the panel is empty;
- the user must close a panel to see the workspace;
- content is clipped;
- screenshot dimensions are inferred only from the filename;
- screenshot was not opened;
- browser was an embedded editor preview;
- tests passed but the page was not inspected;
- the page fits only due to zoom/scale.

Use:

- **Accepted**
- **Incomplete**
- **Blocked**

Never use “mostly complete.”

---

# 13. Testing and build contract

Use actual repository scripts after verifying `package.json`.

Expected commands may include:

```bash
npm run lint
npm test
npm run build
```

Also run targeted tests for each changed subsystem.

Required tests:

- layout/session state separation;
- legacy preference migration;
- invalid stored panel state;
- no Ticket without valid signal;
- no Tracking Inspector without valid selection;
- Desk initial state;
- Dock width clamp;
- split ratio clamp;
- Floating rectangle clamp;
- workspace-specific restore;
- Reset Layout;
- focused ticker synchronization;
- empty Dock consumes no width;
- keyboard and Escape behavior;
- semantic color CI gate.

Do not:

- increase timeouts silently;
- delete failing tests to obtain green status;
- claim a pass without command output;
- ignore a failure without documenting whether it is pre-existing, deterministic, flaky, or relevant.

At the end of every phase:

- TypeScript/lint;
- relevant unit tests;
- production build;
- affected page interaction tests;
- external Chrome screenshots;
- screenshot inspection;
- console/network report.

At final release candidate:

- full test suite;
- production build;
- all primary pages at all validation widths;
- accessibility smoke tests;
- layout migration tests;
- screenshot regression suite.

---

# 14. Reusable component contract

Create or adapt shared primitives:

- `AppShell`
- `WorkspaceRail`
- `CommandRail`
- `DockHost`
- `DockPanel`
- `DockSplit`
- `FloatingPanel`
- `PanelTabs`
- `PageHeader`
- `StatusStrip`
- `HeroAction`
- `DataCard`
- `MetricCard`
- `DataTable`
- `CompactAssetList`
- `EmptyState`
- `ErrorState`
- `LoadingState`
- `FreshnessBadge`
- `EnvironmentBadge`
- `DirectionBadge`
- `ConfidenceBadge`
- `AIRecommendationCard`
- `RiskSummary`
- `ExecutionReview`

Rules:

- extend current `ui.tsx` primitives where appropriate;
- do not create duplicate primitive systems;
- shared primitives own padding, typography, border, radius, and state semantics;
- pages own content composition and grid placement;
- a page cannot fork a primitive merely to use another decorative color;
- retire or absorb legacy shells after migration.

---

# 15. End-to-end implementation roadmap

Continue automatically through the phases when each gate passes.

## Phase 0 — Re-baseline and boot-state correction

1. inspect current code and screenshot tooling;
2. capture reliable current pages in external Chrome;
3. classify current panel startup behavior;
4. fix invalid legacy auto-open behavior before architecture work;
5. add preference normalization tests;
6. confirm Settings remains intentional modal;
7. capture clean-profile and legacy-profile evidence.

Gate:

- every current workspace loads fully;
- no empty context panel blocks initial view;
- real Chrome screenshots opened and inspected;
- baseline documented.

## Phase 1 — Canonical IA and session ownership

1. define canonical workspace/tool/object types;
2. reduce Left Rail destinations;
3. remove duplicate Command navigation;
4. consolidate Feed ownership into Ops;
5. define Intel/Memory expanded routes without permanent rail duplication;
6. identify and remove competing focus/session copies;
7. introduce session state service/store without changing business data.

Gate:

- labels and ownership are consistent;
- pages still load in Chrome;
- no selection divergence.

## Phase 2 — CSS tokens and shared primitives

1. audit current `index.css`;
2. preserve compliant existing tokens;
3. add semantic aliases and system-critical;
4. add spacing, type, geometry, motion, and shell tokens;
5. adapt shared cards, tables, badges, buttons, states;
6. add arbitrary-color CI gate with temporary allowlist;
7. migrate only the areas required for the next shell phase.

Gate:

- token reference verified;
- no new arbitrary color;
- shared primitives render correctly at all widths.

## Phase 3 — Shared desktop shell

1. extract or create AppShell;
2. update Left Rail;
3. simplify Header;
4. create Right Command Rail chrome;
5. add canvas minimum-width enforcement;
6. mount across all desktop workspaces;
7. keep Dock column at zero width when empty.

Gate:

- Command, Desk, Queue, Tracking, Markets, Lab, and Ops share one shell;
- each loads correctly in external Chrome;
- screenshots inspected.

## Phase 4 — Dock Host v1

1. implement Closed/Docked/Floating;
2. single and vertical Split modes;
3. one Floating Panel;
4. resize and clamping;
5. layout v2 persistence;
6. workspace-specific defaults;
7. legacy migration;
8. Reset Layout;
9. keyboard behavior;
10. no backdrop on context panels.

Gate:

- Watchlist and Ticket persist appropriately;
- clean and legacy storage pass;
- canvas/chart minimums pass;
- initial pages are never blocked.

## Phase 5 — Context tool migration

Migrate in this order:

1. Watchlist
2. Signals
3. Positions
4. Ticket
5. Intel
6. Memory
7. Desk execution content where it belongs

For each tool:

- remove or adapt old shell;
- preserve content/business logic;
- use shared PanelHeader/EmptyState;
- remove old open-state owner only after migration;
- verify every host workspace in Chrome.

Gate:

- no page-local blocking drawer remains;
- all context tools use one host;
- no empty panel consumes width.

## Phase 6 — Command board

Implement the complete Command specification and verify:

- initial state;
- Watchlist Docked;
- Ticket opened from candidate;
- split mode;
- 1440/1672/1920;
- no micro-text;
- no duplicate navigation.

Gate:

- one clear focal point;
- decision-critical content usable at 1672 × 941.

## Phase 7 — Desk

Implement chart-first layout, simplified controls, protected zones, execution review, environment separation, and panel behavior.

Verify:

- initial Desk with no blocking overlay;
- Positions Docked;
- valid Ticket;
- split;
- Floating safe zone;
- Paper/Testnet/Live labels;
- chart ≥720px.

Gate:

- visual, risk, and execution-safety acceptance.

## Phase 8 — Queue and Tracking

Implement shared tables/lifecycle, valid-selection Ticket behavior, Positions integration, empty states, and no startup blocking panels.

Gate:

- complete initial page visible;
- context opens only with valid selection;
- shared state consistent.

## Phase 9 — Markets, Lab, Ops, Intel, Memory, Settings

Implement each page sequentially. Do not modify all pages and inspect only one.

For each page:

1. inspect;
2. implement;
3. run;
4. open in Chrome;
5. screenshot;
6. inspect;
7. fix;
8. repeat;
9. accept;
10. move to the next.

Gate:

- every page uses shared shell, primitives, and semantics.

## Phase 10 — Hardening and release candidate

- keyboard navigation;
- focus management;
- contrast;
- reduced motion;
- performance;
- error boundaries;
- stale data;
- state migrations;
- screenshot regression suite;
- remove/shrink legacy CSS allowlist;
- final full-suite validation.

Gate:

- desktop release candidate accepted.

---

# 16. Required phase and page report

Maintain a concise progress report under the phase’s `_qa` folder. Do not create another design plan.

For each changed page:

| Field | Result |
|---|---|
| Workspace | |
| Workspace key | |
| Main component | |
| Requirements audited | |
| Already compliant | |
| Updated | |
| Newly implemented | |
| Files changed | |
| Navigation method | |
| Page selector | |
| External browser/channel | |
| Headed mode | |
| Browser zoom | |
| Viewport | |
| DPR | |
| Screenshot filename | |
| Actual screenshot dimensions | |
| Canvas width | |
| Dock width | |
| Chart width if relevant | |
| Horizontal overflow | |
| Initial panel state | |
| Interactions tested | |
| Console errors | |
| Network failures | |
| Defects discovered | |
| Fix iterations | |
| Final status | Accepted / Incomplete / Blocked |

Phase report:

1. audit findings;
2. implementation summary;
3. exact files changed;
4. components created/adapted/retired;
5. CSS/token changes;
6. state/migration changes;
7. commands and actual results;
8. screenshot folder;
9. images opened and inspected;
10. known limitations;
11. next phase automatically started or blocker.

---

# 17. Final acceptance criteria

## Architecture

- Left Rail ≤8 destinations.
- Right Rail has four default tools and up to two pinned tools.
- One shared Dock Host.
- One or two vertically split tools.
- No empty Dock width.
- One controlled Floating Panel.
- Workspace-specific layouts.
- Layout survives navigation and refresh.
- Context tools never behave like blocking modals.

## State

- layout and session state separate;
- one focused ticker;
- valid selection required for context-dependent tools;
- legacy preferences migrate safely;
- invalid layouts fall back visibly and safely.

## Command

- Hero only dominant region;
- duplicate navigation removed;
- four status metrics;
- 8px grid;
- usable at primary viewport;
- no active text under 11px.

## Desk

- chart ≥720px;
- no startup blocking Execution overlay;
- one primary tab row;
- valid Positions/Ticket split;
- protected zones;
- maximum loss and environment visible.

## CSS

- current raw palette preserved;
- semantic aliases used;
- directional colors only directional;
- critical red distinct;
- body/table text ≥13px;
- critical data ≥14px;
- focus visible;
- no new arbitrary hex or uncontrolled glass classes;
- no root scaling.

## QA

Every changed page has:

- external Chrome/Edge headed verification;
- exact 1672 × 941 primary screenshot;
- PNG metadata validation;
- screenshot opened and inspected;
- 1440 and 1920 validation;
- console/network review;
- interactions tested;
- relevant tests and build passing;
- no unresolved visual defect marked as accepted.

---

# 18. Start now

Perform these steps without asking for routine approval:

1. confirm project-root access;
2. read this complete file;
3. inspect `git status`;
4. inspect the current repository and implementation state;
5. verify real external Chrome can launch in headed mode;
6. verify exact 1672 × 941 page viewport;
7. re-capture the current baseline;
8. correct legacy auto-open blocking panel behavior;
9. continue through the complete roadmap automatically;
10. stop only for a genuine blocker defined in Section 1.2.

Do not answer with another proposed plan.

Begin implementation.
