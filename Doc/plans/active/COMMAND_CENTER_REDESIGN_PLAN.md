# Command Center Redesign — Information Architecture, Wiring & Visual System
Status: IMPLEMENTED (Phases 1–6 + §7/§8 polish) · Owner: Amin · Scope: `overview` page (Command Center) + shared boot sequence
Source of findings: direct read of `CommandCenterPage.tsx`, `BootSplash.tsx`, `LeftRail.tsx`, `CommandPanel.tsx`, `ui.tsx`, `index.css` on 2026-07-29.

## 0. Problem statement (confirmed in code, not assumed)

1. **Confidence value duplicated 4×** on one page (`CommandCenterPage.tsx`):
   - Metric rail → `MetricTile "Avg. confidence"` (line ~515)
   - Action Hero → `ConfidenceRing caption="Conf"/"Best"` (line ~600/620)
   - Risk posture card → `MetricRing` (line ~752)
   - Side-trio "Confidence" card → `MetricRing` again (line ~815)
2. **Squeeze/risk duplicated 2×**: `GateRow "Squeeze"` in Action Hero (line ~609) and again in Risk posture gates (line ~768).
3. **Six unrelated concern areas permanently rendered** in `cc-main__side`: Risk posture, Regime, Confidence spread, Risk ladder, Timeline, Performers — always visible regardless of relevance, competing for the same vertical space as the actual decision-making UI (Priority queue).
4. **`BootSplash.tsx` shows fabricated status text**, not real system state — `STATUS_LINES` is a fixed array driven only by `elapsedSec`, unrelated to proxy/exchange/provider health.
5. **`LeftRail.tsx` is page navigation only** — there is no existing secondary/collapsible content panel. It must be built new.

## 1. Design principles

- **One number, one home.** Every metric (confidence, squeeze, risk) has exactly one canonical widget on the primary canvas. Everywhere else it may be *referenced* (small inline chip) but never *re-rendered as its own gauge*.
- **Two layers, not one wall.** Layer 1 = decision-critical, always visible. Layer 2 = context/analytics, opened on demand via a collapsible Insight Panel.
- **Reuse the existing palette.** No new hues invented — `--color-brand` (cyan), `--color-long` (teal), `--color-short` (rose), `--color-signal-active` (amber), and the existing `accent="violet"` used for analytics cards are already a cohesive, premium graphite/cyan palette. We extend usage, we don't replace it.
- **Breathing room over density.** Increase whitespace between SectionCards, reduce simultaneous gauges from ~9 to ~4 on the primary canvas.


## 2. Visual system (extends existing tokens — no new palette)

| Token (existing, reused) | Hex / value | New usage in this redesign |
|---|---|---|
| `--color-brand` | `#22D3EE` cyan | Primary CTA, active nav marker, Insight Panel toggle icon (active state) |
| `--color-long` | `#2DD4BF` teal | Positive confidence states, LONG direction |
| `--color-short` | `#FB7185` rose | SHORT direction, negative risk states |
| `--color-signal-active` | `#F5B942` amber | "attention" badges (e.g. panel has unread regime shift) |
| `--color-surface-low/mid/high` | `#0B0E14 / #11151B / #171C24` | Elevation stack: canvas → SectionCard → Insight Panel drawer (drawer sits on `surface-high`, one step above cards, so it visually "lifts" over the page) |
| `accent="violet"` (existing `SectionCard` prop, already used for the Confidence spread card) | `#A78BFA` | Becomes the **dedicated Insight Panel accent** — every relocated widget inside the drawer keeps this violet accent so the user learns "violet = secondary analytics", cyan/rose stay reserved for primary trading decisions |

No new CSS variables are required. This keeps the change **surgical** per your standing rule — only new component-level classes (`.insight-panel`, `.insight-panel__tabs`, etc.) get added to `index.css`, nothing in `@theme` changes.

## 3. Page / Tab map — where every piece of UI lives

Workspace pages come from two existing type unions: `CommandTabKey` (`CommandPanel.tsx`) and `WorkspacePageKey` (`LeftRail.tsx`, extends it with `watchlist | signals | desk`).

| Page (`WorkspacePageKey`) | Nav location (`LeftRail` group) | What changes in this plan |
|---|---|---|
| `overview` (Command Center) | Trading workspace | **Primary target.** Layer 1/Layer 2 split described below. |
| `watchlist` (Markets) | Trading workspace | Unchanged in this phase. Candidate for the same Insight Panel pattern later (noted in §8). |
| `tracking` | Trading workspace | Unchanged. |
| `signals` (Signal queue) | Trading workspace | Unchanged. |
| `desk` (Trading Desk) | Trading workspace | Unchanged. |
| `intel`, `backtest`, `decisions`, `history` | Analysis workspace | Unchanged. |
| `operations`, `feed` | System workspace | Unchanged. |
| `settings` | footer | Unchanged. |

**Everything in this plan happens inside the `overview` page**, rendered by `CommandCenterPage.tsx`, mounted from `App.tsx` wherever `activePage === 'overview'`. The boot-sequence change (`BootSplash.tsx`) is global (renders before any page mounts), not page-specific.


## 4. Layer 1 — Primary canvas (always visible, `cc-main__primary`)

No structural change to the left column. It stays: **Topbar → Metric rail → Action Hero → Priority queue → Top markets**. Only the metric rail loses its duplicate.

| Component | File | Keeps / Changes | Data wiring (props already on `CommandCenterPage`) |
|---|---|---|---|
| Topbar badges | `CommandCenterPage.tsx` ~L451 | Unchanged | `isScanning`, `liveDataHealth` |
| Metric rail | `CommandCenterPage.tsx` ~L484 | **Remove** `MetricTile "Avg. confidence"` (L515-523). Rail becomes 5 tiles: Scanner, Live markets, Review ready, Decisions·1h, Data health. | `stats.live`, `stats.reviewReady`, `decisionTotal`, `liveDataHealth` |
| Action Hero | `CommandCenterPage.tsx` ~L565 | **Canonical confidence home.** `ConfidenceRing` here stays exactly as-is — this is the ONE place confidence is rendered as a ring. | `activeConfidence`, `stats.topConfidence` |
| Priority queue | `CommandCenterPage.tsx` ~L680 (`SectionCard "Priority queue"`) | Unchanged | `priority`, `onOpenDesk` |
| Top markets / Pulse | `CommandCenterPage.tsx` ~L710 (`SectionCard`) | Unchanged | `topMarkets`, `showMarketPulse`, `regime` |

## 5. Layer 2 — New collapsible Insight Panel (replaces `cc-main__side`)

**New file:** `src/components/InsightPanel.tsx`

Replaces the always-rendered `<aside className="cc-main__side">` block (`CommandCenterPage.tsx` L742-937) with a collapsible drawer that slides in from the right edge of the workspace (not a page — a panel layered above `cc-board`, `position: fixed`/`sticky` within the workspace shell so it doesn't push page content on toggle).

### 5a. Trigger
A single icon button (`PanelRight` from lucide-react) added to `cc-topbar__actions`, next to the existing MARKETS/TRACKING/DECISIONS buttons:
```tsx
<ActionButton size="sm" variant="ghost" onClick={onToggleInsightPanel}>
  <PanelRight className="h-3 w-3" /> INSIGHTS
</ActionButton>
```
Badge dot (amber, `--color-signal-active`) appears on this button when `regime` data changed since last open — gives a reason to open it without forcing it open.

### 5b. Internal structure — tabs, not a stacked scroll
Instead of stacking all 5 relocated widgets vertically (the current crowding problem), the panel has its **own internal tab bar** (reuses the existing `FilterTabs` component already imported in `CommandPanel.tsx` — do not build a new tab primitive):

| Tab (inside Insight Panel) | Content moved from (current `CommandCenterPage.tsx` lines) | Data wiring |
|---|---|---|
| **Risk** (default open tab) | Risk posture card (L744-773) + Risk ladder (L831-873, only when `showMarketPulse`) | `activeConfidence`, `minConfidence`, `stats.avgSqueeze`, `avgRisk`, `successBands`, `failureBands` |
| **Regime** | Regime card (L775-803) | `regime.avgFunding`, `regime.avgLongShort`, `regime.avgTakerFlow`, `regime.oiExpanding/oiContracting` |
| **Distribution** | Confidence spread card (L807-829) | `stats.avgConfidence`, `distribution.buckets` |
| **Timeline** | Event timeline (L875-889, only when `!showMarketPulse`) | `eventTimeline` |
| **Performers** | Performers card (L891-916) | `topPerformers`, `onOpenMarkets` |

Each tab keeps its existing `SectionCard`/`MetricRing`/`GateRow` sub-components verbatim (copy-move, not rewrite) — this is a **relocation refactor**, not a rebuild, so no new bugs are introduced into working chart/metric logic.

### 5c. Component contract
```tsx
interface InsightPanelProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: 'risk' | 'regime' | 'distribution' | 'timeline' | 'performers';
  // all data props below are the exact same ones CommandCenterPage already computes
  activeConfidence: number;
  minConfidence: number;
  stats: DashboardStats; // existing internal type in CommandCenterPage.tsx
  regime: RegimeSummary;
  distribution: ConfidenceDistribution;
  eventTimeline: TimelineEvent[];
  topPerformers: WatchlistEntry[];
  showMarketPulse?: boolean;
  onOpenMarkets?: () => void;
}
```
`CommandCenterPage.tsx` keeps owning all state/computation (`stats`, `regime`, `distribution`, etc. — already memoized there); `InsightPanel` is a pure presentational component. This avoids duplicating business logic and matches your standing rule "pure testable logic stays separate from rendering."

### 5d. Open/close state & persistence
- Local state in `CommandCenterPage.tsx`: `const [insightOpen, setInsightOpen] = useState(...)`.
- Initial value read from `localStorage.getItem('cc.insightPanelOpen')`; default **closed on first-ever load**, default **open on viewports ≥ 1440px** afterward (so it doesn't feel hidden, but doesn't crowd narrower windows).
- On toggle, write back to `localStorage` so the choice persists across sessions — matches the "user-friendly" requirement without needing a backend flag.


## 6. Motion & interaction spec

- **Animation:** drawer translates in from `translateX(24px)` + `opacity:0` → `translateX(0)` + `opacity:1`, 180ms `cubic-bezier(0.16, 1, 0.3, 1)` (same easing family already used by `.boot-lite__ring`/`.boot-lite__bar` in `index.css` — reuse, don't invent a second motion language).
- **Width:** 360px on desktop (≥1440px), full-width overlay with backdrop-blur on narrower viewports (<1024px) so it never squeezes the primary canvas into an unreadable column.
- **Keyboard:** `Esc` closes; `Alt+I` toggles (documented in a tooltip on the trigger button).
- **Focus management:** on open, focus moves to the tab bar's active tab (accessibility parity with existing `role="tablist"` pattern already used by `FilterTabs`).
- **No nested internal scrollbars** inside the drawer body per your existing standing rule — each tab's content must fit without a second scroll container; if a tab's content overflows, that's a signal to trim/paginate the data, not to add scroll.

## 7. Deduplication map (before → after)

| Metric | Before (4 renders) | After (1 canonical + 0 duplicates) |
|---|---|---|
| Confidence | Metric rail tile, Action Hero ring, Risk posture ring, Confidence-spread ring | **Only** Action Hero `ConfidenceRing`. Risk posture tab shows the *gate threshold* (`minConfidence`) as text, not a second ring. Distribution tab shows the *histogram* (`distribution.buckets`) — genuinely different information (spread, not the average again) — so it stays, but its ring center now reads "Spread" instead of repeating "Overall {pct}". |
| Squeeze / risk | Action Hero `GateRow`, Risk posture `GateRow` | **Only** Action Hero `GateRow "Squeeze"` stays on Layer 1. Risk posture tab's squeeze row is removed; the Risk ladder (success/failure bands) already gives the fuller picture inside the same tab, so nothing is lost. |

## 8. Spacing / density rules (applies to Layer 1 after Layer 2 is extracted)

Removing the always-on aside frees ~360px of horizontal space back to the primary canvas. Use it for **breathing room, not more widgets**:
- `cc-main__primary` max-width caps at 920px (centered) instead of stretching full-bleed — prevents the Priority queue rows from becoming uncomfortably wide.
- Gap between SectionCards increases from current dense stacking to `24px` (currently tighter in `.cc-main`).
- Metric rail tiles go from 6 → 5 items, each gets slightly more internal padding since one fewer competes for the row.

This same drawer pattern (Insight Panel) is the template to reuse later on `watchlist`/`tracking` pages if they show the same crowding — not in this phase, but the component is written generically enough (`InsightPanelProps` takes arbitrary tab content) to support that without rework.

## 9. Real boot sequence (`BootSplash.tsx`)

Replace the fixed `STATUS_LINES`/`elapsedSec` fabrication with real phase state, sourced from `App.tsx`'s existing init sequence (proxy check → KuCoin WS connect → provider-chain health → watchlist hydrate — these steps already exist in your init code, they're just not surfaced):

```tsx
type BootPhase = { key: string; label: string; status: 'pending' | 'active' | 'ok' | 'degraded' | 'failed' };
interface BootSplashProps {
  phases: BootPhase[];        // replaces STATUS_LINES
  elapsedSec: number;         // kept, only for the stall→"Enter workspace" fallback
  onEnterDegraded: () => void;
  onRetry: () => void;
}
```
Each phase renders its real status word (`OK`/`DEGRADED`/`CONNECTING`) instead of a decorative sentence — honest data states, matching your standing rule of never fabricating status. `stalled` fallback logic (L20) is unchanged.


## 10. File-by-file changeset (execution order)

| Order | File | Change | Risk |
|---|---|---|---|
| 1 | `CommandCenterPage.tsx` | Remove duplicate confidence/squeeze renders (§7). No new component yet — smallest possible first diff, independently testable. | Low |
| 2 | `src/components/InsightPanel.tsx` (new) | Create component per §5c, move the 5 relocated card blocks into it verbatim. | Medium |
| 3 | `CommandCenterPage.tsx` | Delete `<aside className="cc-main__side">` block, mount `<InsightPanel />`, add topbar toggle button + `insightOpen` state + localStorage persistence. | Medium |
| 4 | `index.css` | Add `.insight-panel`, `.insight-panel__tabs`, `.insight-panel__backdrop` classes only (no `@theme` edits). | Low |
| 5 | `App.tsx` + `BootSplash.tsx` | Wire real `BootPhase[]` from existing init sequence (§9). Touches the app bootstrap path — highest blast radius, do last and in isolation. | Medium-High |
| 6 | `tests/` | Update/add vitest coverage: InsightPanel tab switching, localStorage persistence, BootSplash phase rendering. | - |

Each numbered step is a separate, independently buildable commit — `tsc && vitest && build` green before moving to the next, per your standing gate rule. Step 5 can be deferred to its own session without blocking 1-4.

## 11. Acceptance criteria

- [x] No metric/value is rendered by more than one gauge/ring on the `overview` page at the same time.
- [x] Insight Panel opens/closes without layout shift or reflow of Layer 1 content.
- [x] Insight Panel state persists across a page reload (localStorage).
- [x] All 5 relocated widgets render identical data to before the move (visual diff via `scripts/apex_visual_diff.py`, already in the repo, or `_qa/` screenshot comparison — reuse existing tooling rather than inventing a new visual-check step).
- [x] `BootSplash` never shows a status word that doesn't reflect an actual init-sequence result.
- [x] `tsc`, `vitest`, and `build` all green after each numbered step in §10.
- [x] No nested scrollbars introduced (existing project-wide rule).

## 12. Cursor handoff

This phase's execution has since been superseded by `Doc/FRONTEND_MASTER_REDESIGN_PLAN.md` and its companion `.cursor/rules/frontend-master-redesign.md` — that is now the source of truth for any further work in this area.
