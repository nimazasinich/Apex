# APEX Portal — Professional UX / Information Architecture Improvement Plan

**Document:** `Doc/UX_IA_IMPROVEMENT_PLAN_v1.md`  
**Date:** 2026-07-30  
**Scope:** Desktop left rail, header chrome, workspace pages, drawers/tabs, mobile nav  
**Evidence:** Runtime install + synthetic UI capture under `_qa/ux_capture/screenshots/` + source IA review  
**Audience:** Product, quant ops, frontend

> **Superseded for execution** by [`Doc/COMMAND_BOARD_DOCKING_REDESIGN_PLAN.md`](../active/COMMAND_BOARD_DOCKING_REDESIGN_PLAN.md), which folds this IA (naming, Feed→Ops, empty drawers, Desk tab flatten) into a dual-rail Command Board + docking system. Keep this file as the naming dictionary and P0/P1 findings reference.

---

## 1. Executive summary

APEX Portal is a **crypto futures decision cockpit** (KuCoin primary, Binance sentiment, paper-first execution). The product already has the right *domains* for a professional short-bias research terminal: Command Center, Markets, Tracking, Signal Queue, Trading Desk, Intelligence, Decision Memory, Operations.

What hurts operator speed is not missing features — it is **overlapping surfaces, inconsistent naming, nested tab stacks, and chrome that competes with the trade decision**.

This plan reorganizes menus, buttons, panels, and the sidebar into a **trader workflow IA** used by serious crypto desks:

> **Discover → Qualify → Inspect → Execute → Review → Govern**

Recommended delivery: three phases (naming + rail → panel consolidation → desk/settings depth), without changing the decision engine.

---

## 2. Current-state inventory (as observed)

### 2.1 Desktop shell

| Zone | Current role | Observation |
|------|--------------|-------------|
| Top header | Feed / Scanner / Decisions / Shorts / Bias + Universe + START | Strong global telemetry, but duplicates page-level CTAs and crowds primary actions |
| Left rail | 11 destinations + Settings footer, icon-only | Correct grouping idea; labels only on hover; Tracking vs Queue vs Desk order is good |
| Center canvas | One page at a time | Primary pages (Overview, Markets, Tracking, Signals, Desk) are rich; secondary CommandPanel pages need clearer identity |
| Right drawers | Insights / Execution / Ticket detail / Inspector | Useful, but often open empty (“No ticket selected”) and steal ~30% width |

### 2.2 Workspace pages

| Key | Rail label | Operator job |
|-----|------------|--------------|
| `overview` | Command center | Situation awareness + next action |
| `watchlist` | Markets | Universe / pressure discovery |
| `tracking` | Tracking | Lifecycle of promoted theses |
| `signals` | Signal queue | Review / accept / block candidates |
| `desk` | Trading desk | Chart + levels + paper execution |
| `intel` | Intelligence | News / NLP / on-chain context |
| `backtest` | Backtesting | Research lab |
| `decisions` | Decision memory | Ledger of accept/reject + outcomes |
| `history` | History | Archive of resolved signals |
| `operations` | Operations | Health, routing, guardrails |
| `feed` | Feed status | Data-channel telemetry |
| `settings` | Settings | Modal overlay (credentials, thresholds, Telegram, supplemental) |

### 2.3 Nested tabs (high cognitive load)

- **Settings:** Execution · Telegram · External sources · Supplemental  
- **Desk execution drawer:** PAPER / VALIDATION / LIVE × MANUAL / ASSISTED / AUTO × Signal / Book / Feed / Archive  
- **Signal detail:** Core Stats · 3×3 Matrix · Level Matrix · Risk Sizing  
- **Insights (Overview):** Risk · Regime · Distribution · Performers  

Screenshot evidence (primary surfaces): `_qa/ux_capture/screenshots/desktop-{overview,watchlist,tracking,signals,desk}.jpg`.

---

## 3. Professional crypto-trading UX diagnosis

### 3.1 What elite crypto terminals optimize for

Professional desks (Binance/Bybit-style terminals, TradingView+OMS hybrids, prop research stacks) optimize for:

1. **One primary decision surface** with chart + order/levels always visible once a symbol is armed.  
2. **Unambiguous vocabulary** (Markets ≠ Watchlist ≠ Universe; Queue ≠ Tracking).  
3. **Progressive disclosure** — depth on demand, not all matrices visible by default.  
4. **Risk before size before send** — capital/risk sizing adjacent to TP/SL, not buried in a fourth tab.  
5. **Ops/feeds out of the trade path** — system health is ambient until degraded.

### 3.2 Critical issues found

| Severity | Issue | Trading impact |
|----------|-------|----------------|
| **P0** | Naming collision: Overview / Command Center / Command; Markets / Watchlist; Queue / Signal queue; Decisions / Decision memory | Slows onboarding; wrong page clicks under stress |
| **P0** | Desk right panel nests **3 tab rows** (env × mode × corridor) | Execution mistakes; missed readiness warnings |
| **P0** | Empty Layer-2 drawers remain open on Signals/Tracking | Wastes chart/table width; looks “broken” when idle |
| **P1** | Duplicate START SCAN (header + page empty states) | Unclear which control is authoritative |
| **P1** | Feed health appears in header, Feed page, corridor Feed tab, Overview health tile | Operators ignore true outages (alert fatigue) |
| **P1** | Settings is a “page” in the rail but a modal in App | Breaks browser back stack mental model |
| **P1** | Signals vs Tracking share nearly identical layout; difference is filter lock only | Feels like two copies of one tool |
| **P2** | Icon-only rail with 11 items | High error rate for infrequent pages (Intel, Backtest, Feed) |
| **P2** | Mobile buries Tracking under More while desktop promotes it | Workflow break on phone |
| **P2** | Tiny mono labels (7–10px) in sheets | Hard to read under time pressure |
| **P2** | Alt+I used by both Insights and Inspector | Shortcut conflict |

---

## 4. Target information architecture

### 4.1 Operator workflow (canonical)

```text
MARKETS ──► QUEUE ──► TRACKING ──► DESK ──► REVIEW
   │                      │          │         │
   └──────── INTEL ◄──────┘          │         └─► DECISIONS / HISTORY
                                     │
                               OPS / FEED / SETTINGS (system)
```

### 4.2 Proposed left-rail structure

Keep three groups, but **rename for trader language** and reduce cognitive load:

#### A. Trade (primary — always visible)

| Order | Key | Label | One-line purpose |
|------|-----|-------|------------------|
| 1 | `overview` | **Command** | Next action + risk posture |
| 2 | `watchlist` | **Markets** | Discover / rank pairs |
| 3 | `signals` | **Queue** | Review signaled candidates |
| 4 | `tracking` | **Tracking** | Live thesis lifecycle |
| 5 | `desk` | **Desk** | Chart + levels + paper send |

#### B. Research (secondary)

| Order | Key | Label | Notes |
|------|-----|-------|-------|
| 6 | `intel` | **Intel** | Keep |
| 7 | `backtest` | **Lab** | Shorter than “Backtesting” |
| 8 | `decisions` | **Memory** | Merge visual entry with History later |
| 9 | `history` | **Archive** | Or fold into Memory as a tab |

#### C. System (footer cluster)

| Order | Key | Label | Notes |
|------|-----|-------|-------|
| 10 | `operations` | **Ops** | Merge Feed as Ops tab |
| — | `feed` | *(remove as top-level)* | Become **Ops → Feeds** |
| 11 | `settings` | **Settings** | Prefer full page or consistent modal with `#/settings` |

**Rail UX upgrades**

- Expand rail on hover / `2xl` to show **text labels** (not only flyouts).  
- Active item: icon + short label + left marker (already good).  
- Badge dots: Queue count, Tracking active, Ops degraded.

### 4.3 Header redesign (ambient, not another dashboard)

Keep a single compact status strip:

| Left | Center | Right |
|------|--------|-------|
| Brand | Feed · Scanner · Bias (only) | Universe · **primary CTA** · clock · Settings/Help |

**Rules**

- One primary CTA: `START SCAN` / `STOP SCAN` (remove duplicate page-center twins except true empty states).  
- Move Decisions / Shorts counts into Command metrics (or a single “Session” popover).  
- If Feed ≠ Live, elevate Ops badge to warn tone and deep-link to Ops → Feeds.

### 4.4 Page-level panel arrangements

#### Command (Overview)

**Keep:** Next Action hero, Priority Queue, Data Health.  
**Demote:** Pulse + Top Markets into a single **Market Pulse** accordion or Insights drawer tab.  
**Insights drawer:** Default closed; open on risk gate fail or Alt+I.  
**Layout:** 12-col grid — Action (8) + Queue (8 full width) + Pulse (4 optional).

#### Markets

**Keep:** Pressure summary cards + table.  
**Rename** internal “WatchlistPanel” language in UI to **Markets table**.  
**Filters:** ALL / SHORT / LONG / TRACKING stay.  
**Remove** redundant “FULL PORTAL” unless it uniquely unlocks columns; otherwise fold into table density toggle.

#### Queue + Tracking (unify chrome)

Shared shell: **Observatory** with mode switch:

- Mode A: **Signaled** (Queue)  
- Mode B: **Tracked** (Tracking)  

Detail drawer opens **only when a row is selected**; when none selected, reclaim full width for the table.

Ticket tabs rename for traders:

| Current | Proposed |
|---------|----------|
| Core Stats | Thesis |
| 3×3 Matrix | Edge |
| Level Matrix | Levels |
| Risk Sizing | Size |

Default tab: **Levels** when confidence ≥ gate; else **Thesis**.

#### Desk

**Chart owns the center.** Execution becomes a **single right column** with staged sections (not three tab bars):

1. **Environment chip** (Paper / Validation / Live) — segmented control, one row  
2. **Mode chip** (Manual / Assisted / Auto) — one row  
3. **Always-visible:** Active thesis summary + Entry / TP / SL ladder  
4. **Collapsible:** Book · Feed · Archive (corridor)

Readiness warnings stay **above** the ladder, never below fold.

#### Ops (merge Feed)

Tabs: **Health · Routing · Feeds · Stress evidence**  
Remove top-level Feed page from the rail.

#### Settings

Split conceptually (even if one modal):

1. **Trading** — credentials, sandbox/live, scanner thresholds  
2. **Alerts** — Telegram  
3. **Data** — external + supplemental intel keys  
4. **Universe** — watchlist CRUD (move out of Supplemental buried section)

---

## 5. Button & control hierarchy

| Priority | Control | Placement |
|----------|---------|-----------|
| Primary | START / STOP SCAN | Header only |
| Primary | OPEN DESK / REVIEW DESK | Next Action + row actions |
| Secondary | Promote / Track / Block | Queue row + detail footer |
| Secondary | Overlay detail | Detail footer only (not duplicate entry points) |
| Tertiary | Refresh, Full portal, Insights | Local page chrome |
| Destructive | Clear decision memory | Settings / Memory with confirm |

Color semantics (crypto desk standard):

- **Teal/cyan** = live / go / accepted  
- **Rose/red** = short / risk / stop / reject (do **not** use red for primary START)  
- **Amber** = degraded / readiness unknown  
- Status pills ≠ clickable buttons (Tracking/SHORT badges should not look like CTAs)

---

## 6. Mobile arrangement

Primary bottom bar (5 slots):

1. Command  
2. Markets  
3. Queue  
4. Desk  
5. More  

Move **Tracking** into primary bar (replace Markets or use 5+More with Tracking in More but add badge). Recommended primary set:

`Command · Queue · Desk · Tracking · More`

More sheet groups:

- Research: Intel, Lab, Memory, Archive  
- System: Ops, Settings  

---

## 7. Phased delivery plan

### Phase 0 — Evidence & freeze (0.5 day)

- Keep `_qa/ux_capture/` as baseline.  
- Add Playwright capture for Settings tabs + Desk corridor after rail labels stabilize.  
- Freeze decision-engine APIs; UI-only changes.

### Phase 1 — Naming & navigation (2–3 days) — **highest ROI**

1. Unify labels across LeftRail, MobileWorkspaceNav, page heroes, Overview CTAs.  
2. Expand rail labels at `xl+`.  
3. Collapse Feed into Ops.  
4. Fix Settings mental model (rail opens `#/settings`; document as overlay or convert to page).  
5. Resolve Alt+I conflict.

**Exit criteria:** New operator can map all rail icons to jobs without hover.

### Phase 2 — Panel consolidation (3–5 days)

1. Auto-collapse empty Layer-2 drawers.  
2. Shared Observatory shell for Queue/Tracking.  
3. Command page density pass (Pulse/Movers demotion).  
4. Header CTA single-source.  
5. Ticket tab rename + default-tab rules.

**Exit criteria:** Signals with no selection uses full width; Desk shows ladder without hunting tabs.

### Phase 3 — Desk & Settings depth (4–6 days)

1. Flatten Desk tab stack into chips + collapsibles.  
2. Re-group Settings (Trading / Alerts / Data / Universe).  
3. Typography pass: raise critical prices/levels to ≥12px; keep mono for IDs only.  
4. Mobile Tracking promotion + more-sheet regroup.

**Exit criteria:** Paper trade path Command → Queue → Desk ≤ 3 clicks with symbol armed.

### Phase 4 — Hardening

- Visual regression against `_qa/ux_capture/`.  
- Ops degraded deep-link tests.  
- Accessibility: rail `aria-current`, drawer focus traps already present — extend to new chips.

---

## 8. Proposed file touch list (implementation map)

| Area | Primary files |
|------|----------------|
| Rail / mobile | `src/components/LeftRail.tsx`, `MobileWorkspaceNav.tsx` |
| Shell / routing | `src/App.tsx`, `DesktopHeader.tsx` |
| Command | `CommandCenterPage.tsx`, `InsightPanel.tsx`, `TopMoversCard.tsx` |
| Markets | `MarketsPage.tsx`, `WatchlistPanel.tsx` |
| Queue / Tracking | `SignalsPage.tsx`, `TrackingPage.tsx`, `TrackingObservatoryPanel.tsx` |
| Desk | `TradingDeskPage.tsx`, `DeskExecutionPanel.tsx`, `ExecutionCorridorPanel.tsx` |
| Ticket | `SignalDetailSheet.tsx` |
| Ops / Feed | `CommandPanel.tsx`, `OperationalHealthPanel.tsx`, `LiveDataHealthPanel.tsx` |
| Settings | `SettingsPanel.tsx` |

No backend contract changes required for Phases 1–2.

---

## 9. Success metrics

| Metric | Baseline (qualitative) | Target |
|--------|------------------------|--------|
| Clicks to armed Desk from cold start | 4–6 + tab hunting | ≤ 3 |
| Distinct names per concept | 2–4 variants | 1 canonical |
| Top-level nav destinations | 12 | ≤ 10 (Feed merged) |
| Empty drawer open by default | Yes on Queue/Tracking | No |
| Nested tab rows on Desk | 3 | ≤ 1 visible + collapsibles |
| Operator train time (internal) | High | < 15 min to trade path |

---

## 10. Risks & constraints

- **Do not** change scanner/decision semantics while reshaping chrome.  
- Obsidian Crimson visual language stays; this is IA/layout, not a rebrand.  
- Live exchange credentials and Telegram remain Settings-gated.  
- Paper-first / Live-disabled posture must remain visually obvious on Desk.  
- Hash boot always resets to Overview — preserve unless product explicitly wants deep links on cold start.

---

## 11. Recommended immediate next step

Implement **Phase 1 only** as a focused MR:

1. Canonical labels dictionary (single source of truth).  
2. Left rail text labels + Feed→Ops merge.  
3. Header single START/STOP.  
4. Empty-drawer auto-hide.

This delivers the largest clarity gain for crypto operators with the lowest risk to the quant engine.

---

## Appendix A — Screenshot index

| File | Surface |
|------|---------|
| `_qa/ux_capture/screenshots/desktop-overview.jpg` | Command Center |
| `_qa/ux_capture/screenshots/desktop-watchlist.jpg` | Markets |
| `_qa/ux_capture/screenshots/desktop-tracking.jpg` | Tracking + Inspector |
| `_qa/ux_capture/screenshots/desktop-signals.jpg` | Signal Queue + empty Layer 2 |
| `_qa/ux_capture/screenshots/desktop-desk.jpg` | Trading Desk + execution stack |
| `_qa/ux_capture/screenshots/desktop-*.jpg` | Secondary pages / settings (re-capture after Phase 1) |

Capture tooling: `scripts/captureWorkspaceScreens.mts`, `scripts/captureSecondaryPages.mts`.

## Appendix B — Canonical naming dictionary (Phase 1)

| Concept | Canonical UI string | Forbidden variants |
|---------|---------------------|--------------------|
| Home | Command | Overview, Command Center, Command overview |
| Universe table | Markets | Watchlist (UI), Market Explorer (subtitle OK) |
| Review list | Queue | Signal queue, SIGNAL QUEUE, Ticket list |
| Lifecycle | Tracking | Observatory (subtitle OK) |
| Execution | Desk | Trading desk (title OK once) |
| Ledger | Memory | Decision memory, Decisions (header chip OK) |
| Archive | Archive | History |
| System health | Ops | Operations, Feed status (as page) |
| Corridor | Levels / Book / Feeds | Trade corridor / Execution corridor dual names |
