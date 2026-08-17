# APEX Portal — Unified Desktop UX/UI Master Plan

**Version:** 1.0  
**Scope:** Desktop web application only  
**Primary reference viewport:** 1672 × 941  
**Product direction:** Professional AI-assisted crypto trading workstation  
**Plan type:** Architecture, interaction, visual-system, migration, and QA specification

---

## 0. Executive Decision

APEX should evolve into a **dual-rail, context-persistent trading workstation**:

- **Left Workspace Rail:** changes the analyst's working mode.
- **Center Workspace Canvas:** contains the current page and its primary task.
- **Right Command Rail:** opens contextual tools that travel across workspaces.
- **One Dock Host:** contains one active docked panel with tabbed access to other open tools.
- **Optional Floating Panel:** reserved for temporary comparison or secondary inspection.

The redesign must preserve the strongest existing product qualities—dark institutional aesthetic, chart-first Desk, Next Action workflow, queue-based triage, and visible system status—while removing visual noise, duplicate navigation, inconsistent naming, and page-scoped context loss.

The product should feel closer to **TradingView + Bloomberg workflow discipline**, not an IDE and not a decorative “sci-fi HUD.”

---

## 1. Primary Objectives

1. Preserve analyst context across page changes.
2. Make the Command dashboard readable within one desktop viewport.
3. Establish one visual and semantic language across all pages.
4. Reduce the number of top-level destinations and duplicate controls.
5. Make the Trading Desk chart remain usable when contextual panels are open.
6. Separate AI recommendations, risk validation, user approval, and execution.
7. Create one reusable panel, table, card, empty-state, and status system.
8. Ensure every implementation phase is verified by tests and viewed screenshots.

---

## 2. Current Product Problems

### 2.1 Structural problems

- Context is lost when moving between Command, Queue, Tracking, Markets, Intel, and Desk.
- The current left rail behaves as an icon list rather than a clearly grouped workspace system.
- Several functions appear both in the left rail and again as top-page navigation.
- Signal details, Insights, Desk drawers, and other contextual surfaces use different panel patterns.
- The Overview behaves like a vertically growing document rather than a bounded command board.

### 2.2 Visual problems

- Too many cards compete at the same visual weight.
- Card heights and row proportions are inconsistent.
- Cyan, teal, rose, amber, and violet are simultaneously active without strict semantic rules.
- Borders, glows, gradients, and uppercase micro-labels are overused.
- Critical data is often rendered at 7–10px, reducing scanability and accessibility.
- Legacy terminal components and newer design-system components look like different products.

### 2.3 Trading workflow problems

- The next action is visible, but surrounding cards compete with it.
- Confidence is shown without enough calibration, evidence, freshness, or invalidation context.
- Signal direction, signal quality, system health, and P&L sometimes reuse overlapping colors.
- The Trading Desk has excessive nested tabs and insufficient room for a complete execution review.
- Empty drawers and inspectors can occupy width without selected content.

---

## 3. Product Information Architecture

### 3.1 Canonical terminology

Every concept must have one primary name throughout routes, titles, tooltips, analytics, and documentation.

| Concept | Canonical label | Purpose |
|---|---|---|
| Main dashboard | **Command** | Current operational briefing and next action |
| Trading workspace | **Desk** | Chart, thesis, risk, and execution review |
| Signal triage | **Queue** | Review and prioritize active signals |
| Lifecycle monitoring | **Tracking** | Monitor tracked theses and paper positions |
| Universe management | **Markets** | Search, seed, filter, and manage symbols |
| Research | **Lab** | Backtests and strategy research |
| System monitoring | **Ops** | Feed, scanner, services, latency, and health |
| Contextual research | **Intel** | Read-only intelligence and supporting evidence |
| Decisions and records | **Memory** | Active decisions, journal, and archive |
| Configuration | **Settings** | Product, data, risk, alerts, connections, and execution controls |

### 3.2 Navigation principle

> **Left changes where the analyst works. Right changes what the analyst carries.**

### 3.3 Left Workspace Rail

Recommended order:

1. Command
2. Desk
3. Queue
4. Tracking
5. Markets
6. Lab
7. Ops
8. Settings

Rules:

- Use icon + tooltip in collapsed mode.
- Support an expanded labeled mode for onboarding and lower-frequency users.
- Group items visually into Trading, Research, and System sections.
- Remove duplicate page navigation from the Command page header.
- Intel and Memory should be primarily contextual tools, with optional full-page “Expand” views.
- Feed becomes part of Ops instead of remaining a separate top-level destination.

---

## 4. Desktop Shell Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Global Header: environment · connectivity · scanner · universe · CTA │
├──────┬──────────────────────────────────────────────┬──────────┬─────┤
│ Left │                                              │ Dock Host│Right│
│ Rail │              Workspace Canvas                │ 320–360px│Rail │
│      │                                              │ optional │48px │
└──────┴──────────────────────────────────────────────┴──────────┴─────┘
```

### 4.1 Global Header

Keep only ambient, cross-application information:

- APEX logo
- Active workspace name
- Environment: Paper / Testnet / Live
- Feed and market-data status
- Scanner state
- Universe count
- Data freshness
- Global scanner action
- Notifications
- Account/profile menu

Move these out of the global header:

- Markets / Tracking / Decisions links
- Sound, Help, and low-frequency preferences
- Large metric cards
- Contextual signal actions

Rename ambiguous `START` actions:

- `RUN SCAN`
- `START SCANNER`
- `RESUME SCANNER`

The label must never be confused with order execution.

### 4.2 Workspace Canvas

- Owns the primary page task.
- Never becomes narrower than the page-specific minimum width.
- Reflows when one docked panel opens.
- Does not reflow when a floating panel opens.
- Keeps page state while tools open, close, dock, or float.

### 4.3 Right Command Rail

Primary tools:

1. Watchlist
2. Signals
3. Positions
4. Ticket

Overflow tools:

- Intel
- Memory
- Layout controls
- API / exchange connections
- Reset Layout

Rationale: the permanent rail must contain high-frequency trading tools, not every available feature.

---

## 5. Unified Command Board Panel System

### 5.1 One shared infrastructure

Create one shared panel system and migrate all contextual surfaces into it:

- `InsightPanel`
- `SignalDetailSheet`
- `DeskExecutionPanel`
- `WatchlistPanel`
- `TrackingObservatoryPanel`
- `IntelligencePanel`
- Decision/history detail surfaces

Do not maintain separate drawer systems for Command, Desk, and Signals.

### 5.2 Panel modes

```ts
type PanelMode = 'closed' | 'docked' | 'floating';
```

#### Closed

- Hidden from the workspace.
- Rail icon remains visible.
- Badge may indicate unread, stale, armed, or degraded status.

#### Docked

- Opens in one right-side Dock Host.
- Pushes the canvas instead of covering it.
- Default width: 336px.
- Allowed range: 300–400px.
- Other open tools appear as tabs in the same Dock Host.
- Only one docked panel is expanded at a time in v1.

#### Floating

- Opens above the canvas without changing canvas width.
- Intended for temporary comparison.
- Draggable by the panel header.
- Constrained to the application viewport.
- Cannot cover protected Desk controls by default.
- Only one floating panel is allowed in v1.

### 5.3 Interaction model

- Click a closed tool icon → open it docked.
- Click an already open tool icon → focus its tab/panel.
- Click the active icon again → close it.
- Pin/unpin control → Docked ↔ Floating.
- `Esc` closes only the topmost floating panel.
- Docked panels close only through their own close control.
- No double-click-only interactions.
- No arbitrary split panes or freeform IDE docking.
- No nested scrollbars.

### 5.4 Desktop width protection

- Minimum Command canvas width: 900px.
- Minimum Desk chart workspace width: 720px.
- Maximum docked width: 32% of the viewport.
- Below the minimum canvas width, opening another tool must replace the current dock tab or open floating.
- Two side-by-side dock columns are out of scope for v1.

### 5.5 Workspace-specific default layouts

| Workspace | Default tools |
|---|---|
| Command | Watchlist docked; Signals closed; Ticket closed |
| Desk | Positions docked; Ticket opens when a symbol is armed |
| Queue | Ticket opens on selected row; Watchlist optional |
| Tracking | Positions docked; Ticket follows selected thesis |
| Markets | Watchlist docked in manage mode or closed when full table needs width |
| Lab | Memory optional; other tools closed |
| Ops | All tools closed by default |

---

## 6. State and Synchronization Architecture

### 6.1 Separate preference state from session state

#### Layout preference

```ts
apex.commandBoard.layout.v1 = {
  workspaces: {
    command: { activeTool, dockWidth, floatingTool, floatingRect },
    desk: { activeTool, dockWidth, floatingTool, floatingRect },
    queue: { ... },
    tracking: { ... },
    markets: { ... },
    lab: { ... },
    ops: { ... }
  },
  updatedAt
};
```

#### Workspace session state

```ts
apex.workspace.session.v1 = {
  activeWorkspace,
  focusedTicker,
  selectedSignalId,
  selectedPositionId,
  selectedDecisionId,
  activeTimeframe,
  updatedAt
};
```

Do not store `focusedTicker` inside the layout object.

### 6.2 Single source of truth

The following interactions must update the same shared state:

- Command candidate click
- Markets row click
- Watchlist row click
- Queue row selection
- Tracking thesis selection
- Desk symbol change
- Ticket selection

No page or panel may keep a private competing copy of the current symbol.

### 6.3 Shared data timing

- Board cards and panels use the same query/cache layer.
- They must not use separate polling timers for the same resource.
- Display `lastUpdatedAt`, freshness status, and degraded states consistently.
- A panel and page must never show different confidence or price values for the same revision.

---

## 7. Command Dashboard Redesign

The current Command dashboard is retained and structurally recomposed rather than replaced.

### 7.1 Dashboard goal

The analyst should understand, in this order:

1. Is the system and data healthy?
2. What changed?
3. What is the highest-priority opportunity or risk?
4. Why is it recommended?
5. What should be reviewed next?
6. Where should the analyst act?

### 7.2 Command board zones

```text
┌──────────────────────────────────────────────────────────────┐
│ Page title + session context + scanner CTA                   │
├──────────────────────────────────────────────────────────────┤
│ Compact status strip: Scanner | Coverage | Review | Health  │
├──────────────────────────────────────────────────────────────┤
│ HERO: Next Action + signal thesis + confidence + risk       │
├─────────────────────────────────────┬────────────────────────┤
│ Strategy / Priority Queue           │ News / Focused Intel   │
├───────────────────┬─────────────────┼────────────────────────┤
│ Top Markets       │ Market Pulse    │ Risk / Regime          │
└───────────────────┴─────────────────┴────────────────────────┘
```

### 7.3 Zone definitions

#### A. Page header

Contains:

- `Command`
- Session/context summary
- Environment badge
- One primary scanner CTA

Remove duplicate links to Markets, Tracking, Decisions, and Insights.

#### B. Compact status strip

Four compact metrics:

1. Scanner state
2. Market coverage
3. Review-ready count
4. Data health/freshness

`Decisions · 1h` moves to Memory/Activity rather than consuming a permanent dashboard tile.

#### C. Hero / Next Action

The single visually dominant zone.

Required content:

- Recommended action
- Symbol and direction
- Brief thesis
- Confidence and calibration label
- Signal age
- Primary invalidation condition
- Risk class
- Expected risk/reward
- Primary CTA: `OPEN DESK`
- Secondary CTA: `REVIEW IN QUEUE`

The Hero is the only dashboard area allowed to use a prominent brand glow.

#### D. Strategy Queue

- Top 3–5 candidates, not an oversized full queue.
- Sort by actionable priority, not confidence alone.
- Show symbol, direction, confidence, risk, freshness, and lifecycle state.
- Selecting a row updates `focusedTicker` and opens Ticket.
- `VIEW ALL` opens Queue workspace.

#### E. News / Focused Intel

- Bound to the currently focused ticker.
- Display only concise, decision-relevant evidence.
- Include source time, sentiment, and conflict indicator.
- Full details open in Intel.

#### F. Top Markets

- Compact market table or ranked list.
- Include timeframe labels for sparklines.
- Use one shared table/list primitive with Markets and Watchlist.

#### G. Market Pulse

- Market breadth
- Regime
- Volatility state
- Funding/open-interest anomaly summary where available

#### H. Risk / Regime

- Portfolio exposure
- Daily P&L or paper P&L
- Drawdown
- Risk capacity used
- Execution readiness
- System safety state

### 7.4 Viewport behavior

At 1672 × 941:

- All decision-critical zones must be visible.
- Secondary detail may require gentle vertical scroll.
- Text must not be reduced below the type scale to force everything into one screen.
- Fixed viewport fit is a hierarchy objective, not a reason to compress data into unreadable density.

---

## 8. Visual System

### 8.1 Color semantics

| Color family | Exclusive purpose |
|---|---|
| Neutral graphite | Canvas, surfaces, borders |
| Cyan | Brand, active navigation, focus, primary interaction |
| Teal | Bullish, long, gain, positive directional outcome |
| Rose | Bearish, short, loss, negative directional outcome |
| Violet | AI confidence, evidence, analytical context |
| Amber | Attention, stale data, blocked gate, review required |
| System critical red | Infrastructure error, execution failure, service outage |

Rules:

- Teal and rose are never decorative.
- Amber is never used simply to make a card more visible.
- System-critical red must not be identical to short-direction rose.
- Confidence must not inherit direction color.

### 8.2 Surface hierarchy

- Hero: `surface-high`
- Primary work cards: `surface-mid`
- Secondary/reference cards: `surface-low`
- Focused state: one cyan border treatment
- No card-specific random gradients or near-black variants

### 8.3 Typography

- Labels: 11–12px
- Body and table text: 13–14px
- Important data: 14–16px
- Armed Entry / TP / SL: 16–18px
- Page title: 18–22px
- Use tabular figures for prices, P&L, sizes, and timestamps.
- Restrict uppercase and letter spacing to small section eyebrows, not all interface text.
- Retire active 7–10px terminal text.

### 8.4 Spacing and geometry

- Base spacing grid: 8px
- Compact internal spacing may use 4px increments.
- Shared card radii and border thickness.
- Card heights follow defined row units where appropriate, but content determines minimum height.
- Avoid excessive glows, double borders, and inner outlines.

### 8.5 Enforcement

- Prohibit new arbitrary hex colors outside design tokens.
- Prohibit new one-off glass/background classes.
- Add Stylelint or CI grep enforcement.
- Add a visual token reference page.
- Add contrast checks for active text and status states.

---

## 9. AI Trust and Decision Architecture

Every AI recommendation should separate four layers:

1. **AI recommends**
2. **Risk engine validates**
3. **User approves**
4. **Execution service submits**

### 9.1 AI Recommendation content

- Recommended action
- Direction
- Confidence
- Calibration label
- Expected value
- Risk/reward
- Signal age and horizon
- Supporting evidence
- Conflicting evidence
- Invalidation condition
- Data freshness
- Model/version identifier
- Reason automation is or is not allowed

### 9.2 Confidence language

Do not present confidence as an isolated percentage.

Example:

> Moderate-confidence short candidate. Order-book imbalance supports the thesis, but confidence remains below the automated execution threshold.

### 9.3 Safety requirements

- Paper, Testnet, and Live must be visually and behaviorally distinct.
- Live cannot be a normal tab beside Paper.
- Display maximum loss, size, fees, slippage, leverage, and liquidation risk before submission.
- Require explicit review for Live execution.

---

## 10. Page-by-Page Migration

### 10.1 Command

- Apply the new board hierarchy.
- Remove duplicate navigation.
- Keep one Hero.
- Move secondary cards into contextual tools.

### 10.2 Desk

- Preserve chart-first layout.
- Keep chart background neutral.
- Flatten nested navigation to one tab row plus collapsible sections.
- Dock Positions by default.
- Open Ticket when a symbol is armed.
- Add Desk protected zones so floating panels do not obscure SL/TP or submission controls.

### 10.3 Queue

- Full sortable triage table.
- Selecting a row updates focused ticker and Ticket.
- Confidence, risk, freshness, and lifecycle remain visible without opening details.
- Empty state explains scan rules and offers `RUN SCAN` and `EDIT RULES`.

### 10.4 Tracking

- Use lifecycle-oriented rows/timeline.
- Remove duplicate ticket summaries.
- Use Summary, Evidence, Risk, Execution, and Activity tabs.
- Positions panel mirrors the selected tracked thesis.

### 10.5 Markets

- Becomes universe management and discovery.
- Reuses the exact same data/list component as docked Watchlist.
- Add timeframe labels and market-quality columns.

### 10.6 Lab

- Configuration left, results right.
- Reuse Desk chart language.
- Memory may open as an optional contextual tool.

### 10.7 Ops

- Distinct traffic-light status-board language.
- No trading-table visual styling.
- Feed, scanner, latency, services, and degraded dependencies live here.
- Right-side tools closed by default.

### 10.8 Intel and Memory

- Primary form: right-side contextual tools.
- Include an `Expand` action for full-page reading or filtering.
- Decisions and History share one table system with different default filters.

### 10.9 Settings

Split into:

- **Quick Settings modal:** density, sound, theme, shortcuts, simple notifications.
- **Full Settings workspace:** risk limits, execution safeguards, exchange connections, scanner rules, universe, alerts, data providers, and model controls.

---

## 11. Reusable Component System

Required primitives:

- `AppShell`
- `WorkspaceRail`
- `CommandRail`
- `DockHost`
- `DockPanel`
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
- `AIRecommendationCard`
- `RiskSummary`
- `ExecutionReview`

Every migration must retire or adapt an existing duplicate implementation.

---

## 12. Delivery Roadmap

### Phase 0 — Baseline and runtime stability

- Confirm all desktop routes render.
- Freeze reference screenshots at 1672 × 941 and at one narrower desktop width.
- Record current route, drawer, and empty-state behavior.
- Confirm test/build commands.

**Gate:** all target pages produce viewed screenshots.

### Phase 1 — Canonical IA and object model

- Finalize workspace labels.
- Finalize tool labels.
- Define Signal vs Alert vs Ticket.
- Define Tracking vs Position vs Thesis.
- Define Decision vs Memory vs History.
- Define page vs panel ownership.

**Gate:** naming and ownership review approved.

### Phase 2 — Tokens and reusable primitives

- Color semantics
- Type scale
- Spacing grid
- Card/table/panel language
- Empty/error/loading patterns
- CI color enforcement

**Gate:** reference sheet reviewed; no new arbitrary colors.

### Phase 3 — Shell and navigation cleanup

- Clarify Left Workspace Rail.
- Remove duplicate Command-page navigation.
- Simplify Global Header.
- Add Right Command Rail shell.

**Gate:** shell works across all desktop routes.

### Phase 4 — Dock Host v1

- Closed / Docked / Floating modes
- One docked column
- Tabbed open tools
- One floating panel
- Resize and persistence
- Workspace-specific defaults
- Reset Layout

**Gate:** Watchlist and empty Ticket persist across Command ↔ Desk ↔ Ops without reducing Desk below minimum width.

### Phase 5 — Context tool migration

1. Watchlist
2. Signals
3. Positions
4. Ticket
5. Intel
6. Memory

**Gate:** all tools use the shared host; old drawers are removed or adapted.

### Phase 6 — Command board rebuild

- Compact status strip
- Hero Next Action
- Strategy Queue
- News/Intel
- Top Markets
- Market Pulse
- Risk/Regime

**Gate:** one clear focal point; all decision-critical content visible at reference viewport.

### Phase 7 — Desk simplification and execution safety

- Flatten nested tabs
- Neutral chart treatment
- Complete order review
- Environment guardrails
- Protected chart/action zones

**Gate:** chart width, execution clarity, and safety tests pass.

### Phase 8 — Remaining workspace unification

- Queue
- Tracking
- Markets
- Lab
- Ops
- Intel/Memory expanded views
- Settings split

**Gate:** one visual language across all pages.

### Phase 9 — Hardening and performance

- Keyboard navigation
- Focus management
- Contrast audit
- Rendering/performance profiling
- Error boundaries
- Stale-data behavior
- Screenshot regression suite

**Gate:** release candidate accepted.

---

## 13. Acceptance Criteria

### Architecture

- Left Rail contains no more than 8 top-level workspaces.
- Right Rail contains 4 primary tools plus Overflow.
- One shared panel host is used across the product.
- No empty dock consumes canvas width.
- Tool layout survives route changes and refresh.
- Each workspace restores its own layout.

### Dashboard

- The Hero is the only dominant visual zone.
- Critical information is visible at 1672 × 941.
- Duplicate top navigation is removed.
- Status cards are compact and below the global header.
- Dashboard content does not depend on unreadably small type.

### Desk

- Minimum usable chart workspace width is at least 720px.
- No more than one primary tab row remains.
- Floating panels do not cover protected SL/TP or primary execution controls.
- Environment and maximum-loss information are visible before execution.

### Visual system

- Teal/rose are used only for directional semantics.
- Amber appears only for attention states.
- System-critical red is distinct from short-direction rose.
- Routine body/table text is at least 13px.
- Critical data is at least 14px.
- Active text and controls meet WCAG AA contrast.
- CI rejects new arbitrary colors and unapproved visual classes.

### State and data

- `focusedTicker` is identical across page and panel surfaces.
- Shared resources use one cache/polling owner.
- Data freshness is consistently displayed.
- No selected object silently resets on workspace navigation.

### QA

Every phase touching rendered UI must pass:

- TypeScript check
- Unit tests
- Production build
- Interaction tests
- Viewed Playwright screenshots
- Before/after comparison at reference viewport

No phase may be marked complete based only on code changes.

---

## 14. Risks and Controls

| Risk | Control |
|---|---|
| Docking consumes too much engineering time | One Dock Host, one docked panel, one float in v1 |
| Product becomes an IDE | No arbitrary split panes or freeform docking |
| Canvas becomes too narrow | Enforced minimum widths and 32% dock cap |
| Header becomes overloaded | Ambient status only; metrics remain below header |
| New shell preserves old visual inconsistency | Token phase precedes page migration |
| Context states diverge | Single source of truth and shared polling |
| Settings pollute trading rail | Keep low-frequency tools in Overflow/full Settings |
| “No scroll” causes micro-text | Fit decision-critical content, allow gentle secondary scroll |
| Live execution expectations exceed current capability | Name paper lifecycle honestly; preserve execution guardrails |

---

## 15. Explicit Non-Goals for v1

- Mobile redesign
- Arbitrary IDE-style docking
- Multiple dock columns
- Multiple simultaneous floating panels
- Server-synchronized layouts
- New scanner algorithms
- New trading APIs
- Autonomous live order execution
- Notes system without an existing first-class data model
- Cosmetic page reskins that do not retire inconsistent components

---

## 16. Recommended Immediate Next Step

Begin with **Phase 1: Canonical IA and object model**, then complete **Phase 2: Tokens and reusable primitives** before building the Dock Host.

Do not rebuild the Command cards first. Without the shared shell, state model, and visual primitives, dashboard work will create another page-specific implementation that must be migrated again.

The first demonstrable milestone should be:

> A clarified desktop shell where Command, Desk, and Ops share the same Left Rail and Right Command Rail; Watchlist can open in one docked host; route changes preserve the layout; and the Desk chart remains above its minimum usable width.

