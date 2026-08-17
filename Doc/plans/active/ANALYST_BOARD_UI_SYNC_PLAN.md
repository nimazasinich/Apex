# APEX Analyst Board — UI, Docking & Synchronization Plan

Status: **ACTIVE PLAN** (plan only — no implementation in this document)  
Date: 2026-07-30  
Scope: Full shell (left workspace rail + **right toolbox**), Command Center front-page redesign, color/proportion system, layout synchronization  
Evidence base:
- User-attached Command Center screenshot (FEED Offline / sparse Pulse / top-heavy stack)
- `_qa/ux_capture/`, `_qa/ui_audit/`, `_qa/visual-layout/`, `_qa/cc-visual/`, `_qa/analysis-pages-*`, `_qa/ui-baseline-*`, `_qa/zoom80-*`
- Prior docs: `COMMAND_BOARD_DOCKING_REDESIGN_PLAN.md`, `UX_IA_IMPROVEMENT_PLAN_v1.md`, `FRONTEND_MASTER_REDESIGN_PLAN.md`

**North star:** A professional crypto analyst board (TradingView / Bloomberg tool-dock mental model) — **not** Visual Studio. Chrome disappears behind data. Context travels with the analyst. The front page is a briefing, not a scrapbook of equal-weight cards.

---

## 1. What `_qa` and the attached front page prove

### 1.1 Attached Command Center (current failure mode)

From the attached screenshot, an analyst sees this in order — and none of it earns that order:

| Band | What it shows | Problem |
|------|---------------|---------|
| Header | FEED Offline, Scanner Idle, Bias Bearish, START | Status noise; Offline competes with Bearish for the same red urgency |
| Hero chrome | System Command + 5 text links (Start Scan / Markets / Tracking / Decisions / Insights) | Second navigation bar fighting the left rail |
| Metric row | 5 equal cards (Scanner, Live Markets, Review Ready, Decisions, Data Health UNAVAILABLE) | No hierarchy — UNAVAILABLE looks like any other tile |
| Next Action | Tall banner: Review AVAX-USDT + OPEN DESK | Correct idea, wrong proportion — too tall for its content; 15% confidence still reads “READY” |
| Priority Queue | ADA / FIL / AVAX rows | Best content on the page — buried below the banner |
| Pulse | Sentiment / Breadth / Taker / Feeds = Unavailable | Large empty real estate advertising broken feeds |
| Top 10 traded | BTC…XRP table | Third competing “markets” surface (header Universe + Pulse + table) |

**Proportion verdict:** Top-heavy KPI strip + oversized Next Action + hollow Pulse + orphan table. Vertical rhythm is “stack of similar gray slabs,” not a briefing.

**Color verdict:** Cyan, magenta/purple CTAs, amber risk, green/red P&L, and system-red Offline all fire at once. No 60/30/10 discipline.

**Sync verdict:** Nothing on this page is a dockable tool. Switch to Desk/Intel and Watchlist / Queue / Ticket context is gone. `_qa/visual-layout/final_report.json` also shows header overflow and `renderState: "unavailable"` — the board does not stay coherent under degraded data.

### 1.2 Broader `_qa` pattern

| Artifact | Lesson |
|----------|--------|
| `cc-visual/ref/target-reference.png` | Earlier “dense right column” Command Center still fixed everything in the canvas — no toolbox |
| `ui-baseline-desktop-*.png` | Empty states dominate; Priority Queue becomes a black void |
| `analysis-pages-*` / Ops / Intel | Same card chrome as trading; health red ≈ direction red |
| `signals-cool-theme-*` / `theme-darker-*` | Theme experiments prove color is treated as decoration, not a system |
| Mobile `ui-fixed-mobile-*` | Reflow only; not a phone-priority board |

---

## 2. Design principles (binding)

1. **One job per region.** Canvas = mode. Toolbox = persistent context. Header = ambient only.  
2. **One number, one home.** Confidence, data health, bias each appear as a primary widget once.  
3. **Degraded is designed.** Offline/Unavailable never inflate a full Pulse panel — collapse to a status chip that deep-links to Ops.  
4. **Proportion before decoration.** 8px grid; briefing uses a fixed vertical budget (see §5).  
5. **Color is meaning.** Direction/P&L, system health, and interactive accent are three separate families — never shared hues.  
6. **Sync is a product feature.** Layout + focused symbol + open tools survive page switch and reload.  
7. **Not an IDE.** No document tabs metaphor, no multi-document MDI chrome. Toolbox = trading terminal dock.

---

## 3. What should be where (spatial contract)

```text
┌──────────────────────────────── Header (ambient) ────────────────────────────────┐
│ Brand · Feed · Scanner · Bias · Universe · START/STOP · clock · help            │
├─────┬──────────────────────────────────────────────────────────────┬────────────┤
│ L   │                                                              │ RIGHT      │
│ E   │              WORKSPACE CANVAS                                │ TOOLBOX    │
│ F   │         (mode from left rail)                                │            │
│ T   │                                              ┌─────────────┐ │  ▣ Watch   │
│     │                                              │ Docked      │ │  ▣ Alerts  │
│ W   │                                              │ panel(s)    │ │  ▣ Pos.    │
│ O   │                                              └─────────────┘ │  ▣ Intel   │
│ R   │     ◇ optional floating tool windows                         │  ▣ Memory  │
│ K   │                                                              │  ▣ Ticket  │
│     │                                                              │  ⋯ Reset   │
└─────┴──────────────────────────────────────────────────────────────┴────────────┘
```

### 3.1 Left rail — workspace modes (open/closeable as a strip)

Collapsible to icons-only (~48px) or expanded with labels (~140px). Changes **where you are**.

| Order | Mode | Analyst job |
|------:|------|-------------|
| 1 | **Command** | Morning briefing / next action |
| 2 | **Desk** | Chart + levels + paper execution |
| 3 | **Queue** | Full signal triage |
| 4 | **Tracking** | Full lifecycle observatory |
| 5 | **Markets** | Manage/edit universe (not day-to-day scanning) |
| 6 | **Lab** | Backtest |
| 7 | **Ops** | System health (**Feed page merges here**) |
| footer | **Settings** | Credentials / thresholds / Telegram (modal OK) |

Intel / Decisions / History **prefer toolbox panels**; left pages become optional “expand to full” deep links.

### 3.2 Right toolbox — Command Board (the core ask)

Always-visible **~48px icon rail** on the right. Each icon opens a **tool panel** in one of three states:

| State | Behavior |
|-------|----------|
| **Docked** | Column immediately left of the toolbox; pushes canvas; drag-resize; min width ~280px |
| **Floating** | Draggable/resizable window; snap-to-edge; layers over canvas (Desk keep-clear over chart SL/TP) |
| **Closed** | Hidden; rail icon shows badge if dirty (new signal, health flip, ticket armed) |

**v1 rule:** at most **two** docked panels at once so the canvas never collapses.

| Tool | Content | Default |
|------|---------|---------|
| **Watchlist** | Compact markets table / pressure | Docked on Command |
| **Alerts** | Signaled / gate hits peek | Closed + badge |
| **Positions** | Tracked + paper thesis | Docked on Desk |
| **Intel** | News / sentiment / on-chain (calm read) | Closed |
| **Memory** | Accept/reject ledger + archive filters | Closed |
| **Ticket** | Thesis / Edge / Levels / Size for focused symbol | Opens when symbol armed |

**Interactions:** click icon → open/focus; double-click panel header → dock ↔ float; toolbox overflow → **Reset Layout**.

This is **not** Visual Studio: no solution explorer, no document well — only analyst tools.

### 3.3 Header — ambient only

Keep: Feed · Scanner · Bias · Universe · **one** START/STOP · clock.  
Remove or demote: duplicate Decisions/Shorts counters (live on Command metrics or Memory badge).  
Remove page-local “MARKETS / TRACKING / DECISIONS / INSIGHTS” link row from Command — left rail + toolbox own that.

---

## 4. Complete synchronization model

“Complete synchronization” means the board remembers the analyst’s workspace as a single state machine.

### 4.1 Persisted state (`apex.analystBoard.v1`)

```ts
{
  leftRail: { expanded: boolean },
  canvasMode: 'command' | 'desk' | 'queue' | 'tracking' | 'markets' | 'lab' | 'ops',
  focusedSymbol: string | null,
  tools: {
    watchlist: { mode: 'docked' | 'floating' | 'closed'; width: number; x?: number; y?: number },
    alerts:    { ... },
    positions: { ... },
    intel:     { ... },
    memory:    { ... },
    ticket:    { ... },
  },
  dockOrder: Array<'watchlist' | 'alerts' | 'positions' | 'intel' | 'memory' | 'ticket'>,
  commandBrief: { pulseExpanded: boolean },  // Pulse collapsed when feeds degraded
  updatedAt: string,
}
```

### 4.2 Sync rules

| Event | Behavior |
|-------|----------|
| Switch left mode | Canvas changes; **tools stay** in docked/floating state |
| Refresh / reload | Restore `apex.analystBoard.v1` |
| Click symbol in Watchlist / Queue / Tracking | Set `focusedSymbol`; Ticket arms; Desk chart binds |
| Feed Offline / health UNAVAILABLE | Header chip + Ops badge; **auto-collapse** Pulse on Command; do not paint giant Unavailable panels |
| Reset Layout | Mode-specific defaults (Appendix B) |
| Settings modal | Does not wipe board layout |

Shared `focusedTicker` already exists in `App.tsx` — board tools must bind to it as the single source of truth.

---

## 5. Command Center — complete redesign (front page)

Goal: a **briefing**, readable in &lt;5 seconds. Everything else is one click into a tool or mode.

### 5.1 Vertical budget (desktop ≥1280px)

| Zone | Height budget | Content |
|------|---------------|---------|
| A. Status strip | ~40px | Mode title + IDLE/PAPER + **single** health chip (not 5 fat cards) |
| B. Next Action | ~96–112px | One headline, symbol, direction, entry, confidence, OPEN DESK / OPEN QUEUE |
| C. Priority Queue | flex (primary) | Dense rows — dominant surface |
| D. Secondary row | ~160px **or collapsed** | Either compact Top markets **or** Pulse — never both full-height when data is missing |

**Kill on Command canvas:**
- Five equal metric cards as the visual lead (demote to a compact 1-line status strip or 3 micro-stats max: Scanner · Review-ready · Health)
- Full-height Pulse when sentiment/feeds are Unavailable
- Duplicate Markets table when Watchlist tool is docked
- Insights as a page-local text button — Insights content moves to toolbox (Risk/Regime as Ticket or Intel sections) or a single dockable **Brief** tool later

### 5.2 Wireframe (target)

```text
┌─ Command ──────────────────────────────────────────┬─ Dock: Watchlist ─┬─Toolbox─┐
│ IDLE · PAPER · Health: Offline → Ops               │ BTC  …            │  W      │
│────────────────────────────────────────────────────│ ETH  …            │  A      │
│ NEXT  Review AVAX-USDT · SHORT · 6.497 · Conf 15%  │ AVAX ● focused    │  P      │
│       [Open Desk]  [Open Queue]                    │ …                 │  I      │
│────────────────────────────────────────────────────│                   │  M      │
│ PRIORITY QUEUE                                     │                   │  T      │
│  ADA   SHORT  conf████  risk  entry                │                   │         │
│  FIL   SHORT  conf████  risk  entry                │                   │         │
│  AVAX  SHORT  conf████  risk  entry  ← selected    │                   │         │
│────────────────────────────────────────────────────┤                   │         │
│ TOP MARKETS (compact 5-row)   or  (hidden if dock) │                   │         │
└────────────────────────────────────────────────────┴───────────────────┴─────────┘
```

### 5.3 Empty / degraded states (professional, not broken)

| Condition | UI |
|-----------|-----|
| No scanner run | Next Action = “Start scan to build queue” + primary START (header still owns global START) |
| Queue empty | Priority Queue empty-state with one CTA — not a giant black slab |
| Feeds offline | Health chip amber/critical; Pulse **collapsed**; Watchlist may show last-known with STALE tag |
| Low confidence “READY” | Do not badge READY if conf &lt; gate — show “Review (below gate)” |

### 5.4 Proportion rules for cards/tables

- One **SectionCard** elevation and border for all Command blocks  
- Queue rows: fixed row height (~44–48px), tabular numbers, confidence as one bar (not rainbow segments)  
- CTAs: one primary (brand accent), one secondary (ghost) — stop purple OPEN DESK vs teal START conflict; **one accent family**

---

## 6. Color harmony & balance (implement as a system)

Today’s screenshot fails because accents are decorative. Target **60 / 30 / 10**:

| Share | Role | Implementation direction |
|------:|------|--------------------------|
| 60% | Structure | Single graphite scale: canvas `surface-low`, cards `surface-mid`, docks `surface-high` — eliminate competing burgundy/near-black panel fills seen across `_qa` analysis pages |
| 30% | Data ink | One cool zinc for labels/values/grid; **tabular nums** for prices |
| 10% | Signal | Strict roles below |

| Signal family | Use | Do not use for |
|---------------|-----|----------------|
| Bullish green (`--color-long`) | LONG / up P&L only | Buttons, borders, health |
| Bearish rose (`--color-short`) | SHORT / down P&L only | Offline, delete, health |
| Brand cyan (`--color-brand`) | Active rail icon, focus ring, primary CTA | Direction tags |
| Attention amber (`--color-signal-active`) | Below-gate, stale, needs review | P&L |
| **System critical** (new token) | Feed offline, Ops unavailable | SHORT tags |

Elevation: docks/floats lift via **border + shadow ramp**, not brighter gray fills.

Every badge/table/card uses the shared primitives in `ui.tsx` — Decisions and History must match Queue row language.

---

## 7. Other canvas modes (what stays after tools move)

| Mode | Canvas keeps | Moves to toolbox |
|------|--------------|------------------|
| Desk | Chart + slim execution chips/levels | Positions, Ticket, Watchlist optional |
| Queue | Full triage table | Ticket on select; Watchlist optional |
| Tracking | Timeline/lifecycle table | Positions mirrors selection |
| Markets | Manage/seed/edit | Same Watchlist component as dock tool |
| Lab | Config + results chart | Memory optional |
| Ops | Traffic-light health board | Tools usually closed |
| Settings | Modal groups: Trading / Alerts / Data / Universe | — |

Desk specifically: flatten today’s env × mode × corridor **three tab rows** into chips + collapsible Book/Feed (already specified in docking plan).

---

## 8. Mobile (sync-aware, not reflow-only)

- Bottom **tool tray** = toolbox analogue  
- Tools open as **full-screen sheets**  
- Command mobile cut: Next Action + top 3 queue rows + health chip — Pulse/Markets behind tray  
- Persist same `apex.analystBoard.v1` keys (sheet instead of dock)

---

## 9. Delivery phases (plan → build order)

| Phase | Deliverable | Exit criteria |
|------:|-------------|---------------|
| **0** | Port hygiene (`:3000` / Vite); freeze `_qa` baselines | `/src/main.tsx` serves; screenshot set dated |
| **1** | Token + type + spacing spec (Doc + CSS variable matrix) | 60/30/10 roles agreed; system-critical distinct from SHORT |
| **2** | Right toolbox shell: dock / float / close / resize / persist | Empty Watchlist + Ticket persist across Command↔Desk |
| **3** | Migrate Watchlist, Alerts, Positions, Ticket into toolbox | `focusedSymbol` syncs all four |
| **4** | **Command Center full redesign** per §5 | Attached-screenshot failure modes gone (no hollow Pulse, no 5-card lead, queue primary) |
| **5** | Desk flatten + Ops traffic-light reskin | ≤1 visible tab row on Desk; Ops ≠ trading chrome |
| **6** | Memory table unify (Decisions + History) | One table, two filters |
| **7** | Mobile tray + sheets | Same sync keys |

**Do not** reskin random analysis pages before Phases 2–4 — paint without the toolbox will recreate `_qa/theme-*` churn.

---

## 10. Acceptance checklist (analyst expectations from `_qa`)

- [ ] Front page readable in 5 seconds: next action + queue, not a card museum  
- [ ] Offline/Unavailable never owns a full band  
- [ ] Right toolbox present; tools dock/undock/float/close  
- [ ] Layout + focused symbol survive mode switch and reload  
- [ ] One primary accent; SHORT red ≠ Offline red  
- [ ] Watchlist day-to-day lives in the toolbox, not only as a full page  
- [ ] Header does not overflow (`visual-layout` overflowers = 0)  
- [ ] Left rail collapsible; labels available when expanded  
- [ ] Reset Layout restores sane defaults  

---

## Appendix A — Default layouts

**Command:** Watchlist docked (320px); others closed; Ticket closed until row select.  
**Desk:** Positions docked (360px); Ticket docked when symbol armed; Watchlist closed.  
**Ops:** all tools closed.  
**Queue / Tracking:** Ticket opens on selection; Watchlist optional.

## Appendix B — Relationship to other Doc plans

| Doc | Role |
|-----|------|
| **This file** | Active plan for analyst board, toolbox, sync, Command redesign |
| `COMMAND_BOARD_DOCKING_REDESIGN_PLAN.md` | Mechanical docking detail — subordinate to this |
| `UX_IA_IMPROVEMENT_PLAN_v1.md` | Naming dictionary reference |
| `FRONTEND_MASTER_REDESIGN_PLAN.md` | COMPLETE L1/L2 rules — still binding |

## Appendix C — Evidence index

- User Command Center attachment (Offline / proportion failure)  
- `_qa/cc-visual/ref/target-reference.png`  
- `_qa/ui-baseline-desktop-1672x941.png`  
- `_qa/ux_capture/screenshots/desktop-*.jpg`  
- `_qa/visual-layout/final_report.json`  
- `_qa/analysis-pages-ocean-v7/`, `_qa/analysis-pages-refresh-final/`
