# APEX Command Board — Docking System & Unified UI Redesign Plan

Status: **SUBORDINATE SPEC** · Owner: TBD · Scope: docking mechanics detail  
**Active plan:** [`Doc/ANALYST_BOARD_UI_SYNC_PLAN.md`](./ANALYST_BOARD_UI_SYNC_PLAN.md) (Command redesign + toolbox + sync + `_qa` acceptance)  
Supersedes execution priority of: `Doc/UX_IA_IMPROVEMENT_PLAN_v1.md` (IA findings folded in)  
Builds on (does not discard): `Doc/FRONTEND_MASTER_REDESIGN_PLAN.md` (COMPLETE — page L1/L2 discipline stays), `Doc/COMMAND_CENTER_REDESIGN_PLAN.md` (Insight Panel pattern becomes the seed of the dock shell)  
Evidence: `_qa/**`, user Command Center attachment, LeftRail / Desk / Ops / Intel / Decisions / History inspection (2026-07-30)

---

## 0. Analyst verdict (honest)

The **Command Rail + docked/floating panel** proposal is the right north star. It solves the single biggest gap the earlier IA plan only named: **no persistent context across pages**. Today, switching Command → Intel → Desk drops Watchlist, Queue, and ticket context; that is not how a crypto analyst works.

It also aligns with what the screenshots already prove:

| Surface | What the eye sees | Implication |
|---------|-------------------|-------------|
| Overview / Desk / Queue | Dense, competing cards + drawers | Need one canvas mode + tools that travel |
| Ops / Intel | Same card chrome as trading pages; health red ≈ P&L red | Need a distinct “status board” vs “trade ink” language |
| Decisions vs History | Same job (ledger), different empty density | One table system, two filter presets |
| Signal mobile drawer | Good sheet pattern (header + 4 tabs) | Reuse as floating/docked ticket panel |
| Left icon rail | Page switches only | Keep as **workspace modes**; do **not** replace with tool dock alone |

### What to keep from the docking proposal

- Right-edge tool rail (~48px), icon-only  
- Per-panel **Docked / Floating / Closed**  
- Layout persistence across page switches and reload  
- Watchlist primarily as a **panel**, full page = manage mode  
- 60/30/10 color discipline + one card/table language  
- Mobile = bottom tray + full-screen sheets (not fake docking)

### What to change / constrain (so it ships and stays safe)

1. **Do not delete the left rail.** APEX needs both rails:
   - **Left = Workspace modes** (Command, Markets-manage, Queue-manage, Tracking, Desk, Lab, Ops, Settings) — changes the canvas.
   - **Right = Command Board tools** (Watchlist, Alerts/Queue peek, Positions/Tracking peek, Intel, Memory, Ticket) — overlays or docks context without losing the canvas.
2. **Floating must never cover critical Desk chrome by default.** Floats snap to edges; Desk keeps a “keep clear” zone over chart SL/TP and the primary CTA. TradingView does this for a reason.
3. **Map tools to real APEX objects** (no vapor features in Phase 1–3):

| Proposed tool icon | APEX mapping | Notes |
|--------------------|--------------|-------|
| Watchlist | `WatchlistPanel` / Markets data | Day-to-day dock; full Markets page = edit/seed |
| Signals / Alerts | Signaled queue + push badges | Peek panel; full Queue page for triage |
| Positions & Orders | Tracking + paper readiness / corridor signal | Not a full OMS yet — name it **Positions** (paper lifecycle), not “Orders” until live send exists |
| Intel Feed | `IntelligencePanel` + Feed status strip | Merge “reading” surfaces |
| Decisions Log | Decision memory + History filters | One panel, tabs: Active / Archive |
| Notes | **Defer** | No first-class notes model in repo — Phase 7+ only |
| Settings | Keep modal / footer | Low-frequency; do not waste a prime rail slot |

4. **Reuse existing tokens first** (`--color-surface-*`, `--color-brand`, `--color-long`, `--color-short`, `--color-signal-active`). The 60/30/10 rule is **usage discipline + one critical/system red**, not a greenfield palette rewrite that fights Obsidian Crimson.
5. **Insight Panel / Desk drawers are the prototype.** `InsightPanel`, `DeskExecutionPanel`, and `SignalDetailSheet` already prove L2 drawers. The Command Board generalizes that pattern into a shared dock shell — do not invent a third drawer system beside them.

---

## 1. Design north star

**Bloomberg / TradingView desktop, not an IDE.**

- Chrome disappears behind data.  
- One permanent **right Command Rail**.  
- One permanent **left Workspace Rail** (existing LeftRail, renamed/relabeled).  
- Center = the active **workspace canvas** (Command briefing, Desk chart, Ops board, Lab, etc.).  
- Context tools travel with the analyst via the Command Board.

Operator workflow (unchanged from IA plan, now spatially enforced):

```text
LEFT MODE                 CENTER CANVAS              RIGHT TOOLS (persist)
─────────────             ─────────────              ─────────────────────
Command  ───────────────► briefing / next action  ◄── Watchlist, Alerts
Desk     ───────────────► chart + levels          ◄── Positions, Ticket
Ops      ───────────────► health board            ◄── (tools stay mounted)
Lab      ───────────────► backtest results        ◄── Memory peek
```

---

## 2. Shell architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│ Header (ambient): Feed · Scanner · Bias · Universe · START · ⋯   │
├────┬───────────────────────────────────────────────────┬─────────┤
│ L  │                                                   │ Command │
│ e  │              Workspace canvas                      │  Rail   │
│ f  │         (page mode from left rail)                 │  48px   │
│ t  │                                                   │         │
│    │   ┌──────────── docked stack (optional) ────────┐ │  W S P  │
│ W  │   │ Watchlist │ Positions │ …  (resizable)      │ │  I M T  │
│ o  │   └─────────────────────────────────────────────┘ │         │
│ r  │                                                   │         │
│ k  │   ◇ floating panels (optional, edge-snapped)      │         │
│    │                                                   │         │
└────┴───────────────────────────────────────────────────┴─────────┘
```

### 2.1 Left Workspace Rail (keep, clarify)

Canonical labels (from IA dictionary):

| Order | Key | Label | Role |
|------|-----|-------|------|
| 1 | `overview` | Command | Morning briefing / next action |
| 2 | `desk` | Desk | Chart-first trading canvas |
| 3 | `signals` | Queue | Full triage mode |
| 4 | `tracking` | Tracking | Full lifecycle mode |
| 5 | `watchlist` | Markets | Manage/edit universe (not day-to-day scan) |
| 6 | `backtest` | Lab | Research |
| 7 | `operations` | Ops | Status board (**Feed merged here**) |
| — | `intel` | — | Prefer right **Intel** tool; page optional or deep-link |
| — | `decisions` / `history` | — | Prefer right **Memory** tool; pages = expanded manage |
| footer | `settings` | Settings | Modal OK |

**Rule:** Left changes *where you are*. Right changes *what travels with you*.

### 2.2 Right Command Rail (new)

Icons (Phase 3 set):

1. **Watchlist**  
2. **Alerts** (signaled / gate hits)  
3. **Positions** (tracked + paper thesis)  
4. **Intel**  
5. **Memory** (decisions + archive filters)  
6. **Ticket** (active symbol detail — Levels / Edge / Size)  
7. Overflow: Reset Layout · (future Notes)

Badge dots: unread signals, degraded ops (when Feed unhealthy), ticket armed.

### 2.3 Panel states

| State | Behavior |
|-------|----------|
| **Docked** | Column left of the Command Rail; pushes canvas; width persisted; min-width floor (~280px); multiple docks stack horizontally or as tabs-in-one-column (v1: horizontal stack, max 2 docks to protect canvas) |
| **Floating** | Draggable + resizable; translucent scrim optional; snap guides; z-order above canvas, below modals |
| **Closed** | Hidden; badge if dirty |

Interactions:

- Click rail icon → cycle Closed → Docked (default) → focus existing  
- Double-click panel header → Docked ↔ Floating  
- Drag handle on dock edge to resize  
- **Reset Layout** restores default: Desk → Positions docked; elsewhere → Watchlist docked; Ticket closed until symbol armed  

### 2.4 Persistence (“complete synchronization”)

Store in `localStorage` (and later optional server profile):

```ts
apex.commandBoard.layout.v1 = {
  panels: {
    watchlist: { mode: 'docked' | 'floating' | 'closed', width, x?, y?, z? },
    alerts: { ... },
    positions: { ... },
    intel: { ... },
    memory: { ... },
    ticket: { ... },
  },
  dockOrder: string[],
  focusedSymbol: string | null,
  updatedAt: string,
}
```

**Must survive:** page switch (hash), refresh, settings modal open/close.  
**Must not reset** when left-rail navigates Command → Desk → Ops.

Focused symbol is shared: Watchlist row click, Queue row, Tracking row, and Ticket all bind the same `focusedTicker` (already in `App.tsx` — wire panels to it).

---

## 3. Color & elevation (60/30/10, grounded in existing tokens)

Extend usage; add only what is missing.

| Layer | Role | Token direction |
|-------|------|-----------------|
| **60% Base** | Canvas / panels / borders | Unify on `--color-surface-low/mid/high` only — kill ad-hoc near-black vs burgundy panel fills that fight each other (visible on Ops/Intel/History) |
| **30% Data ink** | Text, numbers, grid | One cool zinc scale for primary data; tabular figures for all prices/P&L |
| **10% Signal** | Meaning only | `--color-long` bullish · `--color-short` bearish direction/P&L · `--color-brand` interactive/active · `--color-signal-active` amber attention · **new** `--color-system-critical` for Ops/health only (must not equal `--color-short`) |

Elevation: docked/floating use **border + shadow ramp** on `surface-high`, not brightness jumps (matches COMMAND_CENTER Insight Panel lesson).

One card language + one table language reused on Decisions, History, Queue, Markets (FRONTEND_MASTER already pushed primitives in `ui.tsx` — enforce, don’t fork).

---

## 4. Page-by-page intent (canvas modes)

| Mode | Intent | What moves to Command Board |
|------|--------|-----------------------------|
| **Command** | Glanceable briefing: next action, top 3 queue hits, health chip | Watchlist + Alerts docked by default |
| **Desk** | Chart-first; execution secondary | Positions + Ticket docked; Book/Feed as Ticket/Positions sections — **flatten today’s 3-row tab stack** |
| **Queue** (full) | Sortable triage; confidence dominant | Ticket opens on row select; Watchlist optional |
| **Tracking** (full) | Timeline-style lifecycle rows | Positions panel mirrors selection |
| **Markets** (full) | Manage/seed/edit universe | Same Watchlist component as docked panel |
| **Ops** | Traffic-light status board, visually distinct | Tools stay; no trading tables |
| **Lab** | Config left / results right; same chart language as Desk | Memory peek optional |
| **Intel** | Prefer panel; calm read-only | Primary home = right Intel tool |
| **Memory** | Prefer panel; Active vs Archive tabs | Full pages optional expand |
| **Settings** | Low frequency; grouped Trading / Alerts / Data / Universe | Modal; not a rail tool |

---

## 5. Typography & grid

- Numeric font with `font-variant-numeric: tabular-nums` on all price/size/P&L cells (JetBrains Mono already in project — apply consistently).  
- 8px spacing grid.  
- 3-tier type: label (10–11px) / body (12–13px) / data-emphasis (14–16px for armed Entry/TP/SL).  
- Raise critical Desk levels above the current 7–10px mono soup.

---

## 6. Mobile

- Bottom **tool tray** = Command Rail analogue (Watchlist · Alerts · Positions · Desk · More).  
- Panels open as **full-screen sheets** (reuse SignalDetailSheet interaction patterns).  
- Hard cut for Command/Desk: top signal, active thesis, one chart — everything else one tap away.  
- Do not attempt multi-column docking on phone.

---

## 7. Delivery phases (realistic)

### Phase 0 — Preconditions (0.5d)

- Kill stale process on `:3000` or set `PORT` in `.env`; confirm Vite serves `/src/main.tsx`.  
- Freeze screenshot baseline under `_qa/ux_capture/`.  
- Document dual-rail contract in this file (done).

### Phase 1 — Token & type spec (1–2d, little/no product code)

- Token usage matrix (60/30/10 mapped to existing CSS variables + optional `--color-system-critical`).  
- Static reference sheet (one markdown + small HTML or Story-less section in Doc).  
- Type scale + spacing table.  
**Gate:** design review sign-off. No docking yet.

### Phase 2 — Dock shell (3–5d)

- `CommandRail` + `DockHost` + `FloatingPanel` primitives.  
- Empty panel frames with Docked/Floating/Closed + resize + double-click toggle.  
- Persistence `apex.commandBoard.layout.v1`.  
- Max 2 docked columns in v1.  
- Migrate **InsightPanel** behavior behind the same host API (adapter), so Command doesn’t keep a private drawer forever.  
**Gate:** empty Watchlist + empty Ticket panels dock/float/persist across Command↔Desk.

### Phase 3 — Migrate context tools (4–6d)

1. Watchlist → panel (Markets page becomes manage mode wrapping same component)  
2. Alerts → signaled peek (links to full Queue)  
3. Positions → tracking/paper thesis peek  
4. Ticket → `SignalDetailSheet` content in dock/float  
**Gate:** focused symbol sync; Desk chart remains usable with one dock open.

### Phase 4 — Reskin canvas modes (3–5d)

- Command, Desk, Ops to token system + hierarchy (Ops = traffic lights).  
- Flatten Desk env/mode/corridor into chips + collapsibles (IA Phase 3).  
- Empty drawers never steal width when nothing selected (IA P0).

### Phase 5 — Unify Memory tables (2–3d)

- Decisions + History → one table component, filter defaults only.  
- Memory panel tabs: Active / Archive.

### Phase 6 — Mobile tray + sheets (2–3d)

- Bottom tray; sheet panels; content cut for Command/Desk.

### Phase 7 — Optional

- Notes panel (only if product wants a model).  
- Server-synced layouts.  
- Third dock column / split dock tabs.

---

## 8. Risks & non-goals

| Risk | Mitigation |
|------|------------|
| Docking scope swallows product time | Phases 2–3 before cosmetic reskins; max 2 docks v1 |
| Floating covers SL/TP | Desk keep-clear zone; default dock not float on Desk |
| Dual drawers (Insight + Board) confuse | One host API; Insight becomes a Board panel or adapter |
| Left+right rails feel crowded | Left = modes (≤8), Right = tools (≤6); Feed not a left page |
| Palette rewrite thrash | Prefer token *discipline* over new hue set |
| Live OMS expectations | Positions ≠ Orders until live execution ships |

**Non-goals for this plan:** new scanner/decision APIs; live order entry redesign; mobile pixel-parity with desktop docks.

---

## 9. Success metrics

| Metric | Today | Target |
|--------|-------|--------|
| Context survives page switch | No | Watchlist/Positions/Ticket persist |
| Nested tab rows on Desk | 3 | ≤1 + collapsibles |
| Top-level left destinations | 12 | ≤8 (+ Feed merged into Ops) |
| Distinct names per concept | 2–4 | 1 canonical |
| Clicks cold → armed Desk | 4–6 | ≤3 |
| Empty Layer-2 open by default | Often | Never |

---

## 10. File touch map (implementation)

| Area | Files (expected) |
|------|------------------|
| Shell | `App.tsx`, new `CommandRail.tsx`, `DockHost.tsx`, `FloatingPanel.tsx`, `commandBoardLayout.ts` |
| Left rail labels | `LeftRail.tsx`, `MobileWorkspaceNav.tsx` |
| Panels | Adapt `WatchlistPanel`, `TrackingObservatoryPanel`, `IntelligencePanel`, `SignalDetailSheet`, Archive/History panels |
| Desk flatten | `TradingDeskPage.tsx`, `DeskExecutionPanel.tsx`, `ExecutionCorridorPanel.tsx` |
| Tokens | `index.css` `@theme` + Doc token sheet |
| Tests | layout persistence unit tests; Playwright dock persist across hash nav |

---

## 11. Relationship to prior docs

| Doc | Role now |
|-----|----------|
| `FRONTEND_MASTER_REDESIGN_PLAN.md` | COMPLETE — L1/L2 page rules remain binding |
| `COMMAND_CENTER_REDESIGN_PLAN.md` | Insight Panel = prototype for DockHost |
| `UX_IA_IMPROVEMENT_PLAN_v1.md` | Naming, Feed→Ops, empty-drawer rules absorbed here |
| **This doc** | **Active execution plan** for Command Board + docking |

---

## 12. Recommended next step

**Start Phase 1 (token/type spec)** in parallel with **Phase 0 port cleanup**, then Phase 2 dock shell with empty panels — do not jump to reskinning Overview cards before the shell exists. Without the shell, “Bloomberg chrome” is only paint; with the shell, every later page migration is mechanical.

---

## Appendix A — Screenshot evidence index

Primary: `_qa/ux_capture/screenshots/desktop-{overview,watchlist,tracking,signals,desk}.jpg`  
Secondary: `temp/ui_audit_*/screenshots/page-{intel,operations,decisions,history,backtest,feed,settings}.jpg`  
Ticket: `temp/ui_audit_*/screenshots/signal-drawer-*.jpg`

## Appendix B — Default layouts

**Command default:** Watchlist docked (320px), Alerts closed (badge only), Ticket closed.  
**Desk default:** Positions docked (360px), Ticket docked when symbol armed else closed, Watchlist closed.  
**Ops default:** all tools closed (status board owns attention).  
**Reset Layout:** restores mode-specific default above.
