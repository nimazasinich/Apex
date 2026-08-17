# APEX Frontend — Master Desktop Redesign Plan
Status: **COMPLETE** (all phases + optional follow-ups shipped 2026-07-30) · Owner: Amin · Scope: **desktop only** — mobile/responsive is explicitly out of scope for this plan.
Supersedes execution priority of `COMMAND_CENTER_REDESIGN_PLAN.md` (that doc's §1–§12 detail stays valid as the reference for the Insight Panel pattern; this plan folds in its regression fix as Phase 0 and extends the same discipline to the other 11 pages).
Source of findings: direct read of `LeftRail.tsx`, `App.tsx` render switch, `server.ts` (57 confirmed `/api/*` routes), `src/services/*.ts`, `index.css` (lines ~7780-7817), `insightPanelPrefs.ts`, and direct inspection of `MarketsPage.tsx`, `ArchivePanel.tsx`, `RiskRegimesPanel.tsx`, `OrderBookPanel.tsx` on 2026-07-30. File sizes for the remaining pages were surveyed but not line-read — §4 marks which pages still need a confirm-in-code pass before any rewrite, per this project's standing rule (never assume, confirm in code first).

## 0. Why this plan exists

The Command Center redesign (Phases 1-6) shipped exactly per its own spec and all gates are green (`tsc`, 326/326 `vitest`, `vite build`). But the spec itself introduced a regression: `.workspace-command-center .cc-main__primary` hard-caps at `max-width: 920px` unconditionally (`index.css` ~line 7796), while the Insight Panel defaults to **closed** below 1440px (`insightPanelPrefs.ts`). On the most common desktop range (1366-1536px) this leaves a narrow centered column with dead space on both sides and the panel that held Risk/Regime/Distribution/Timeline/Performers hidden by default — which is exactly the "empty middle, unclear what's happening" feedback. That fix is Phase 0 below. The same "reclaim space but don't refill it" mistake must not repeat on the other 11 pages, so §1 makes it a standing rule, not a one-off patch.

## Phase 0 — Fix the reported regression (first, isolated commit, before anything else)

**`src/index.css` (~line 7796):** Replace the unconditional 920px cap with a fluid one at the base rule — `max-width: min(1200px, 100%)` — and only tighten to 920px inside a new `@media (min-width: 1600px)` block. Ultra-wide monitors keep the deliberate "breathing room" from §8 of the original plan; 1366-1536px laptops (the actual common case) use their real width instead of a fixed island.

**`src/services/insightPanelPrefs.ts`:** Lower the auto-open threshold from `min-width: 1440px` to `min-width: 1024px` (export shared `MIN_AUTO_OPEN_WIDTH = 1024`; rename `viewportMin1440` → `viewportAboveAutoOpenWidth`). **Done** — `CommandCenterPage.tsx` inherits via shared helper.

**`src/tests/insightPanel.test.ts`:** Assertion for `MIN_AUTO_OPEN_WIDTH === 1024` and default-open resolution. **Done.**

Gate before moving to Phase 1: `tsc --noEmit`, `vitest run`, `vite build` all green — **327/327 tests pass** (2026-07-30).

## 1. Cross-app design rules (binding for every page touched from here on)

These are the rules that would have caught the Phase 0 regression before it shipped. Apply them to any page redesigned in §4, not only Command Center:

- **No fixed-width islands below 1600px.** A primary content column may cap its width on very wide monitors for readability, but never on the 1280-1536px range that most desktop users actually have. Prefer `clamp()`/`min()` over a bare `max-width` that isn't gated by a wide-viewport media query.
- **Every "reclaimed" space needs a default-visible destination.** If a redesign moves content into a collapsible drawer/panel (the Insight Panel pattern), that panel's default-open threshold must match the "no fixed islands" floor above (≥1024px), not an arbitrary higher number picked for a different reason.
- **One canonical home per metric** (carried over from the original plan's §7) — applies to every page, not just Command Center. Before adding a new gauge/ring/badge anywhere, check whether the same number already has a home elsewhere on that page.
- **Empty-state is a designed state, not a leftover.** Any panel that can render with no data (no active signal, no tracked position, empty watchlist) needs an explicit empty-state layout already used elsewhere in the app (see `OrderBookPanel.tsx`'s "No book target" pattern) — never a blank div.
- **Reuse existing primitives.** `SectionCard`, `StatCell`, `MetricRing`, `GateRow`, `FilterTabs`, `ActionButton`, `StatusBadge`, `PageHeader` (all in `ui.tsx`) already cover the vast majority of layout needs across the app — a new one-off component is a signal to re-check whether an existing primitive fits first.

## 2. Backend capability inventory (confirmed routes in `server.ts`) → page ownership

57 `/api/*` routes were found, already grouped below by the page that should own (or already owns) each cluster. Most are already wired through a `src/services/*.ts` layer (`marketData.ts`, `exchangeClient.ts`, `decisionMemory.ts`, `intelligenceFeeds.ts`, `hfSpaceIntel.ts`, `testnetExecution.ts`, `telegram.ts`, `bootPhases.ts`, `supplementalSettings.ts`, `externalApiSources.ts`) — the gap to close during §4 is UI surface, not backend wiring.

| Route cluster | Backend paths | Page that should surface it |
|---|---|---|
| Security / boot | `/api/security/bootstrap` | Boot sequence (already wired, Phase 5 of Command Center plan) |
| Execution / testnet | `/api/execution/readiness`, `/validation/readiness`, `/validation/history`, `/validation/orders`, `/testnet/account`, `/testnet/orders`, `/testnet/orders/:id/cancel` | Trading Desk |
| Decision memory | `/api/decision-memory`, `/batch`, `/status`, `/export` | Decision memory (currently `ArchivePanel.tsx`) |
| Operations | `/api/operations/status` | Operations |
| Backtest | `/api/backtest/datasource/status`, `/fetch` | Backtesting |
| KuCoin market data | `/account-overview`, `/ticker`, `/level2`, `/candles`, `/funding`, `/contracts-active`, `/contracts/active`, `/contract`, `/trades`, `/bullet-public` | Markets, Trading Desk (charts/order book) |
| Binance supplemental | `/sentiment-ls`, `/sentiment-taker`, `/ticker`, `/depth`, `/klines`, `/premium-index`, `/open-interest` | Intelligence, Trading Desk |
| HF-space intel | `/status`, `/intel/news`, `/intel/sentiment`, `/intel/whales` | Intelligence |
| Supplemental config | `/config/status`, `/config`, `/config/defaults`, `/config/probe`, `/news`, `/sentiment`, `/onchain`, `/all`, `/health` | Intelligence, Settings |
| External sources | `/config/defaults`, `/status`, `/config`, `/test` | Settings |
| Intelligence feeds | `/api/intelligence/feeds` | Intelligence |
| Feedback / health | `/api/feedback`, `/api/health` | Feed status |
| Telegram | `/status`, `/config`, `/test`, `/send` | Settings (`TelegramSettings.tsx`) |

No route was found without an existing consumer in `src/services/`. The redesign work in §4 is therefore about **information architecture and visual polish per page**, not building new data plumbing — keep it that way; do not add speculative new endpoints as part of this plan.

## 3. Confirmed findings vs. still-to-confirm (honesty check before any rewrite)

**Phase 1 confirm-in-code pass completed 2026-07-30.** All 12 pages read against §1 design rules. Summary below; per-page detail in §4.

Cross-cutting (resolved 2026-07-30):
- **Rule 1 (width):** Command Center + Settings modal fluid below 1600px. Overlay `SignalDetailSheet` uses `max-w-[min(100%,480px)]`.
- **Rule 2 (collapsible ≥1024):** Insight, Desk execution (Alt+E), Archive log (Alt+A), Tracking inspector (Alt+I), Signals detail (Alt+S), Backtest ledger (Alt+L), Operations advanced stack — all default open ≥1024px with localStorage override.
- **Rule 3 (one metric home):** Deduped across Markets, Feed, History/Archive, Tracking/Signals, Desk corridor.
- **Rule 6 (nested scroll):** Tracking/Signals full-width L1 + drawer L2; Desk/Archive drawer single scroll owner.

Directly read and confirmed in earlier passes:
- `MarketsPage.tsx` (143 lines) — thin orchestrator; real surface is `WatchlistPanel.tsx`.
- `ArchivePanel.tsx` (88 lines) — Decision memory in **desk corridor**, not History page.
- `OrderBookPanel.tsx` / `RiskRegimesPanel.tsx` — embedded sub-widgets, not standalone pages.

## 4. Page-by-page plan (all 12 `WorkspacePageKey` values)

| # | Page (nav label) | Component(s) | Confirmed findings (Phase 1) | Phase 2+ action |
|---|---|---|---|---|
| 1 | Command center (`overview`) | `CommandCenterPage.tsx` + `InsightPanel.tsx` | Phase 0 shipped. L1/L2 split done. | None — maintenance only. |
| 2 | Markets (`watchlist`) | `MarketsPage.tsx` → `WatchlistPanel.tsx` | **Done (step 6):** hero badges demoted to non-numeric labels; metric rail remains canonical home. | Maintenance only. |
| 3 | Tracking (`tracking`) | `TrackingPage.tsx` + `TrackingObservatoryPanel.tsx` + `TrackingBottomDock.tsx` | **Done (follow-up):** full-width observatory; `DeskExecutionPanel` inspector drawer (Alt+I, ≥1024 default open) with embedded `SignalDetailSheet`. | Maintenance only. |
| 4 | Signal queue (`signals`) | `SignalsPage.tsx` + `SignalDetailSheet.tsx` | **Done:** full-width queue; `DeskExecutionPanel` detail drawer (Alt+S, ≥1024); embedded `SignalDetailSheet`. | Maintenance only. |
| 5 | Trading desk (`desk`) | `TradingDeskPage.tsx` + chart/order book/risk/level widgets | **Done (Phase 2 + follow-up):** Chart Layer 1; execution drawer; duplicate Decision/Entry KV removed; **Selected contract** KV removed (canonical home: corridor `SignalCard`). | Maintenance only. |
| 6 | Intelligence (`intel`) | `IntelligencePanel.tsx` | **Done:** HF Space status + live news/sentiment/whales feeds; hero registry/supplemental meta. | Maintenance only. |
| 7 | Backtesting (`backtest`) | `BacktestingPanel.tsx` | **Done (follow-up):** trade ledger moved to `DeskExecutionPanel` drawer (Alt+L); L1 summary stats only. | Maintenance only. |
| 8 | Decision memory (`decisions`) | `ArchivePanel.tsx` + `AdaptiveHeuristics.tsx` | **Done (Phase 2):** Layer 1 stat summary + LOG drawer (Alt+A). `AdaptiveHeuristics` in drawer with `scrollInParent` + `EmptyState`. History tab now owns chronicle; Archive owns logger. | Maintenance only. |
| 9 | History (`history`) | **`HistoryPage.tsx`** → `HistoryPanel.tsx` | **Done:** extracted page wrapper + panel; stats + chronicle. | Maintenance only. |
| 10 | Operations (`operations`) | `OperationalHealthPanel.tsx` | **Done (step 6):** advanced stack defaults open ≥1024px via `operationsAdvancedPrefs.ts`; adaptive audit link-only in Operations Contract. | Maintenance only. |
| 11 | Feed status (`feed`) | `LiveDataHealthPanel.tsx` + `CommandPanel` feed tab | **Done (step 6):** duplicate KV summary removed; `LiveDataHealthPanel` embedded is sole probe surface; `EmptyState` for total outage + no focused ticker. | Maintenance only. |
| 12 | Settings (`settings`) | `SettingsPanel.tsx` | Was modal with 7 custom tabs + `max-w-[1080px]` island. | **Done (Phase 2):** 4-group `FilterTabs` (Execution/testnet+scanner, Telegram, External, Supplemental); fluid width below 1600px. |

## 5. Execution order

| Order | Item | Why this order |
|---|---|---|
| 1 | Phase 0 fix (§Phase 0) | Smallest, isolated, directly resolves the reported complaint. Ship and verify alone before anything else. |
| 2 | Confirm-in-code pass on all "not yet read" pages in §3/§4 (`Tracking`, `Signal queue`, `Trading desk`, `Intelligence`, `Backtesting`, `History`, `Operations`, `Feed status`, `Settings`) | Per this project's standing rule — never redesign from a file-size guess. Produces a per-page findings doc the same way `COMMAND_CENTER_REDESIGN_PLAN.md` §0 did. |
| 3 | Settings split into internal tabs | Largest single-file risk in the app (90KB); isolate before touching smaller pages so a mistake here doesn't block unrelated work. |
| 4 | Trading desk Layer1/Layer2 split | Second-highest widget density; reuses the now-proven Insight-Panel-drawer pattern. |
| 5 | Decision memory Layer1/Layer2 split | Smaller, lower-risk repeat of the same pattern — good validation before declaring the pattern "standard." |
| 6 | Remaining pages (Tracking, Signal queue, Intelligence, Backtesting, History, Operations, Feed status) | Apply whatever the confirm-in-code pass in step 2 actually found — no changes speculated here without that read. |

Each numbered item ships as its own commit with `tsc --noEmit`, `vitest run`, `vite build` green before moving to the next — same gate discipline as the original Command Center plan.

## 6. Acceptance criteria

- [x] No primary content column is capped below its container width on any viewport under 1600px (§Phase 0, §1) — Command Center + Settings modal fixed.
- [x] Any collapsible panel introduced or already existing defaults open on ≥1024px viewports unless the user has explicitly closed it (localStorage override always wins) — Insight Panel via `MIN_AUTO_OPEN_WIDTH`.
- [x] No page has more than one live rendering of the same metric (§1's "one home per metric") — step 6 dedupe shipped per §4.
- [x] Every panel that can render with zero data has an explicit, designed empty state — Feed outage, History, Tracking/Signals inspector, Archive logger gaps closed in step 6.
- [x] `SettingsPanel.tsx` is split into an internal tab bar reusing `FilterTabs` rather than one long scroll — shipped Phase 2 step 3.
- [x] `tsc --noEmit`, `vitest run`, `vite build` all green (335+ tests, 2026-07-30).
- [x] No new backend endpoints introduced — this plan is UI/IA work only, per §2.
- [x] No mobile/responsive changes made under this plan (desktop-only scope, confirmed with the user).
