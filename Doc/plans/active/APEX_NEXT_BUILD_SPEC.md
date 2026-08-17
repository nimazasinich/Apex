# APEX-NEXT — Full Build Specification for Google AI Studio

## HOW TO USE THIS DOCUMENT (read this first, every session)

This file is not a one-time prompt to skim and move past — it is **the persistent specification
of record for this project.** Treat it the way an engineering team treats a requirements doc that
sits in the repo, not a chat message that scrolls away.

1. **Before writing any code**, read this entire document once, top to bottom.
2. Section 2 contains a **Requirements Manifest** — a flat table of `REQ-###` items, each with a
   `Status` column. Copy that table into a file named `REQUIREMENTS_STATUS.md` in the project root
   as your first action, with every status set to `NOT STARTED`.
3. As you build, keep `REQUIREMENTS_STATUS.md` updated in real time: `NOT STARTED` →
   `IN PROGRESS` → `IMPLEMENTED`. A status may only become `IMPLEMENTED` if you can point to the
   actual file/function that satisfies it — not because it seems close enough.
4. **After every batch of changes**, re-read `REQUIREMENTS_STATUS.md` against this document and
   report, honestly, which `REQ-###` items are still not `IMPLEMENTED`. Then keep working. Do not
   declare the project "done" while any row is not `IMPLEMENTED` unless this document explicitly
   marks that row optional/stretch.
5. **Never pause the build to ask the operator for exchange API keys, secrets, or credentials.**
   Build entirely against public, no-key-required market data endpoints (see Section 3). Any
   credential field belongs only in the in-app Settings screen (Section 9), shipped empty, filled
   in later by the operator at their own discretion, never required for the app to run.
6. Gemini/Google API keys, if you use any Gemini feature at all, are handled automatically by AI
   Studio's server-side integration on deploy — do not build your own key-entry flow for that.
7. If any instruction in this document is genuinely ambiguous, make the most professional
   real-world trading-terminal decision, implement it, and write down the assumption you made next
   to the relevant `REQ-###` row in `REQUIREMENTS_STATUS.md`. Do not skip a requirement because it
   was underspecified — underspecification is not a reason to omit something, only a reason to
   record your interpretation.

The actual build instruction is the single sentence at the very end of this document, after all
context. Everything between here and there is the specification that instruction refers to.

---

## 1. Product vision

**APEX-NEXT** is a professional, single-viewport crypto-futures trading intelligence terminal —
built for a discretionary trader who wants one screen, open all day, that tells them: what's
moving, what the market's mood is, which symbols currently look tradeable **in either direction**
(long or short), and — for any symbol they care about — exactly where the key price levels are and
what a sized, risk-managed entry would look like. It is a **decision-support and paper-trading
tool**. It never places a real order in this build.

This is a ground-up build. Do not assume any prior codebase, any prior conversation, or any prior
partial implementation exists. Build the complete system described below as if starting from an
empty repository.

### 1.1 Scope target: 10x a baseline dashboard

A "baseline" version of this idea is just a watchlist with prices and a chart. This build must go
far beyond that baseline in every dimension listed in the Requirements Manifest — real multi-source
data, two-directional opportunity scanning with safety gating, an explainable per-symbol level and
confidence breakdown, a live position-sizing calculator, a decision journal with historical
calibration reporting, and a cohesive, no-scroll professional UI. Treat "does the minimum to look
like a dashboard" as a failure mode; treat "every requirement below is real, wired, tested, and
explainable" as the bar.

---

## 2. Requirements Manifest

Copy this table verbatim into `REQUIREMENTS_STATUS.md` and maintain it as described above.
Categories are grouped; IDs are stable — do not renumber as you go.

### 2.1 Data & backend integrity

| ID | Requirement | Status |
|---|---|---|
| REQ-001 | Exactly one backend entrypoint file exists (e.g. `server.ts`), and it is the one actually referenced by every `package.json` script (`dev`, `build`, `start`). No orphaned duplicate server files. | NOT STARTED |
| REQ-002 | Exactly one `vite.config.ts` and one `tsconfig.json` exist. No duplicate/alternate config files anywhere in the repo. | NOT STARTED |
| REQ-003 | All third-party market-data calls (KuCoin, Binance, any sentiment/news source) happen server-side only. The browser never calls an external market-data API directly. | NOT STARTED |
| REQ-004 | Every backend response that carries market data includes an explicit `dataState` field: `live`, `degraded`, `not_configured`, or `unavailable`. No endpoint silently substitutes fabricated numbers on failure. | NOT STARTED |
| REQ-005 | Responses are cached server-side with TTLs appropriate to each endpoint's real update frequency, to respect public-API rate limits. | NOT STARTED |
| REQ-006 | `npm install` succeeds on a clean checkout with no `--legacy-peer-deps` / `--force` flag required — `package.json` and its lockfile are in sync. | NOT STARTED |
| REQ-007 | No dead/orphaned files anywhere in the repository — every file is either imported by something actually run, or is a config/doc file with a stated purpose. | NOT STARTED |

### 2.2 Primary dashboard (single screen, see Section 4 for layout law)

| ID | Requirement | Status |
|---|---|---|
| REQ-010 | **Top 10 by 24h volume/turnover** card: symbol, last price, 24h turnover, 24h % change, all from real KuCoin Futures data, sorted descending by turnover. | NOT STARTED |
| REQ-011 | **Top 10 gainers** and **Top 10 losers** in one card with a toggle, filtered to a configurable minimum-liquidity floor so illiquid symbols don't dominate. | NOT STARTED |
| REQ-012 | **Market sentiment gauge**, CoinMarketCap-style semicircular 0–100 gauge with 5 labeled zones, driven by a real, documented composite formula (see REQ-030). Shows an honest "not enough data" state when inputs are missing — never a fabricated midpoint. | NOT STARTED |
| REQ-013 | **Short candidates** list: top-10 ranked symbols whose current profile suggests a bearish setup, from a real, documented scoring function (Section 5). | NOT STARTED |
| REQ-014 | **Long candidates** list: top-10 ranked symbols whose current profile suggests a bullish setup, from the mirrored scoring function. Long and Short candidates must be equally prominent — this is a two-directional scanner, not a short-only tool. | NOT STARTED |
| REQ-015 | Both candidate lists show an honest empty state ("Run a scan to populate this list" + action button) before any scan has run — never placeholder/demo rows. | NOT STARTED |
| REQ-016 | **No-Trade Guard**: candidates that score well numerically but fail a safety check (abnormal squeeze risk, cross-timeframe contradiction, stale/degraded underlying data) are visibly flagged or excluded, with the specific reason surfaced on hover/detail. | NOT STARTED |
| REQ-017 | **Readiness tiers** on every candidate: `CONFIRMED` / `WATCHLIST` / `CAUTION` / `BLOCKED`, derived from the score + guard checks, shown as a colored badge. | NOT STARTED |
| REQ-018 | Compact market-health status strip: scanner state (idle/scanning), data-feed health, count of active candidates, last-scan timestamp. | NOT STARTED |

### 2.3 Symbol detail (double-click interaction)

| ID | Requirement | Status |
|---|---|---|
| REQ-020 | Double-clicking any symbol anywhere in the dashboard opens a slide-in side drawer (never a full route navigation) with that symbol's full detail. | NOT STARTED |
| REQ-021 | Detail computes and displays **3 resistance levels** and **3 support/failure levels** around current price, from a real, documented derivation method (swing structure, volume-profile nodes, or ATR-multiple bands — pick one, document it in code comments). | NOT STARTED |
| REQ-022 | Detail computes and displays a single **best-entry price**, from the same documented method. | NOT STARTED |
| REQ-023 | Levels are rendered as one strong visual — a vertical price ladder (entry centered, 3 levels above, 3 below, spacing proportional to real price distance) — not six stacked text rows. | NOT STARTED |
| REQ-024 | Detail shows a **confidence score** (0–100, ring/gauge) plus a short evidence list, each item tagged as supporting or contradicting the setup (e.g. "Order-book imbalance: bearish — supports", "Funding rate: neutral — neutral"). | NOT STARTED |
| REQ-025 | Detail shows risk/reward for the setup: distance to nearest levels in both price and R-multiple terms. | NOT STARTED |

### 2.4 Sentiment composite

| ID | Requirement | Status |
|---|---|---|
| REQ-030 | Composite sentiment score built from real available inputs (e.g. funding-rate skew, long/short ratio if sourceable, headline tone from a real news/sentiment source), weighted, documented in code, implemented as a pure/testable function. | NOT STARTED |
| REQ-031 | Each input source shown individually with its own `dataState`, so the composite is explainable, not a black box — an input that returned no real reading is skipped from the blend and shown as skipped, never zeroed. | NOT STARTED |

### 2.5 Position sizing / trading panel (Section 8 for full field spec)

| ID | Requirement | Status |
|---|---|---|
| REQ-040 | Editable **account risk amount** field (flat currency or % of account, user picks the mode). | NOT STARTED |
| REQ-041 | Editable **leverage** field (numeric input or slider) that live-recalculates position size and estimated liquidation distance. | NOT STARTED |
| REQ-042 | **Success probability** shown from the model, with a manual override the operator can set, clearly labeled model-estimated vs. user-adjusted. | NOT STARTED |
| REQ-043 | Editable stop-loss / take-profit fields, pre-filled from REQ-021/022, live-recalculating R-multiple and position size as edited. | NOT STARTED |
| REQ-044 | Read-only computed outputs: position size (base units + USD notional), risk-per-trade in USD, expected R-multiple, one-line plain-language summary. | NOT STARTED |
| REQ-045 | All sizing math lives in a pure, unit-tested module, not inline in JSX. | NOT STARTED |
| REQ-046 | No control in this panel ever sends an order to a real exchange. Labeled clearly as manual/paper sizing only. | NOT STARTED |

### 2.6 Navigation & layout (Section 4/7 for full spec)

| ID | Requirement | Status |
|---|---|---|
| REQ-050 | Main dashboard fits one viewport at 1440×900 and 1920×1080 with **no page scroll**. | NOT STARTED |
| REQ-051 | Left navigation rail: icon-only, collapsed by default, fixed width, flyout label on hover/click, never resizes main content. | NOT STARTED |
| REQ-052 | Right inspector rail: mirrors the left rail's collapsed behavior on the right edge; hosts the symbol detail (REQ-020) plus any other contextual panels. | NOT STARTED |
| REQ-053 | Expanded right panel uses a **vertical tab list** (stacked icon+label down one edge), not a horizontal tab row. | NOT STARTED |
| REQ-054 | No nested/double scrollbars anywhere; any single card that must internally scroll is the only scroll region inside it. | NOT STARTED |
| REQ-055 | Both rails are keyboard-accessible: `Esc` closes an expanded panel, focus moves sensibly on open. | NOT STARTED |

### 2.7 Design system

| ID | Requirement | Status |
|---|---|---|
| REQ-060 | One CSS token file implementing the Section 7.0 visual persona (dark palette: canvas + 2–3 surface elevations, one brand accent, one long/bullish color, one short/bearish color, one warning/neutral accent) used by every component — no exceptions. | NOT STARTED |
| REQ-061 | A shared component primitive library (`SectionCard`, `MetricTile`, `Pill`/badge, `StatusBadge`, `FilterTabs`, `EmptyState`, `ConfidenceRing`) — every screen built only from these, no one-off bespoke card styling. | NOT STARTED |
| REQ-062 | A single, reused type scale (4–6 sizes total) across the whole app. | NOT STARTED |
| REQ-063 | A single, reused empty/loading/error state pattern across the whole app. | NOT STARTED |

### 2.8 Beyond-baseline capabilities (the "10x" scope — do not treat these as optional filler)

| ID | Requirement | Status |
|---|---|---|
| REQ-070 | **Decision journal**: every candidate the operator manually accepts or rejects (paper-only) is logged with a timestamp, the score/evidence at the time, and the operator's stated or inferred reason. Journal is browsable and filterable. | NOT STARTED |
| REQ-071 | **Outcome tracking**: accepted paper "trades" are tracked against their computed levels until they hit a target, a stop, or expire, and the closed outcome is archived. | NOT STARTED |
| REQ-072 | **Calibration report**: once enough closed outcomes exist, generate a report comparing the model's predicted success probability against realized outcomes (a real calibration curve, not a vanity chart), broken down by regime/readiness tier. | NOT STARTED |
| REQ-073 | **Multi-timeframe confluence view**: for any symbol, show whether the short/long signal agrees or conflicts across at least two timeframes (e.g. 15m and 1h), visually flagged when they disagree. | NOT STARTED |
| REQ-074 | **In-app alerting**: the operator can set a simple condition (e.g. "notify when a new CONFIRMED short candidate appears") and receive an in-app (and optionally browser push) notification — no email/SMS integration required. | NOT STARTED |
| REQ-075 | **Backtest/replay mode**: run the scoring/candidate logic against historical OHLCV data for a chosen symbol/date range and show what the scanner would have flagged, with the same readiness-tier and level logic used live — so the exact same code path is being validated, not a separate simulator. | NOT STARTED |
| REQ-076 | **Operations/system health page**: uptime of each data source, recent error/warning log, cache hit rates — a real diagnostics view, not decoration. | NOT STARTED |
| REQ-077 | The app is installable as a PWA (manifest + service worker for the app shell only — market data itself is never cached as if it were fresh). | NOT STARTED |

### 2.9 Settings

| ID | Requirement | Status |
|---|---|---|
| REQ-080 | Settings screen with empty, optional fields for a future exchange API key/secret/passphrase, persisted locally only, never required to run the app, permanently labeled "Not connected to execution — manual/paper trading only." | NOT STARTED |
| REQ-081 | Settings screen exposes the liquidity floor, alert conditions (REQ-074), and any other user-tunable thresholds referenced elsewhere in this document, rather than hardcoding them invisibly. | NOT STARTED |

### 2.10 Quality gates

| ID | Requirement | Status |
|---|---|---|
| REQ-090 | `tsc --noEmit` passes with zero errors at every checkpoint you report progress at, not just at the very end. | NOT STARTED |
| REQ-091 | `npm run build` succeeds using the single canonical entrypoint files (REQ-001/002). | NOT STARTED |
| REQ-092 | Vitest test suite covers, at minimum: level derivation (REQ-021/022), the long and short scoring functions (REQ-013/014), the sentiment composite (REQ-030), gainers/losers ranking/filtering (REQ-011), and the position-sizing math (REQ-045) — including edge cases where inputs are missing/zero, verifying the honest-empty-state behavior actually holds, not just that happy-path numbers look right. | NOT STARTED |
| REQ-093 | README documents exactly how to run the app locally and states, in one place, what is real (live data, real math) vs. explicitly out of scope (live order execution) — matching the actual shipped code, not an aspirational future state. | NOT STARTED |

---

## 3. Data architecture

- **Primary market data: KuCoin Futures public REST API** — no API key required for market data.
  Pull: active contracts list (symbol, last price, 24h turnover, 24h % change, 24h volume), order
  book, recent candles, funding rate, mark price, open interest.
- **Secondary data: Binance public REST API** for cross-checking or supplementary context where it
  adds real value (e.g. broader volume context, additional sentiment signal).
- **Sentiment/news**: use whatever free, public, reliably-available source you can integrate for a
  real composite (funding-rate skew and long/short ratio from the exchange itself are legitimate,
  genuinely-available inputs even with no external news API; add a real news/headline source only
  if you can integrate one without requiring the operator to supply a key up front). If no external
  news source is wired, the composite still works from the exchange-derived inputs — it must never
  fall back to a fabricated number.
- Backend owns all of this. It normalizes every symbol to one internal format (e.g. `BTC-USDT`)
  used consistently everywhere in the frontend, caches per REQ-005, and always returns a
  `dataState` per REQ-004.

---

## 4. Layout law: no page scroll

The primary dashboard (Section 2.2) must occupy exactly one viewport at 1440×900 and 1920×1080,
period — no outer page scrollbar. Techniques:

- Fixed-height app shell: a fixed top status bar, a `flex: 1` main content region containing the
  dashboard grid, no page-level overflow.
- Prioritize which widgets earn primary-screen real estate over shrinking fonts below ~10-11px to
  force-fit content — move secondary detail behind the double-click drawer instead.
- A specific card's internal list may scroll internally if it has more rows than fit (e.g. a
  50-row table) — but that is the only scroll region inside it (REQ-054), and the outer page still
  never scrolls.
- Below desktop/tablet-landscape widths, a vertically-scrolling single-column mobile fallback is
  expected and acceptable — the no-scroll law applies to the primary desktop dashboard.

---

## 5. Two-directional candidate scoring (REQ-013/014/016/017)

Implement one pure, unit-tested scoring module used by both directions (mirrored logic, not two
unrelated implementations). Suggested real inputs, all derivable from data already pulled per
Section 3:

- Momentum/trend: RSI, MACD line vs. signal, position within Bollinger Bands.
- Order flow: order-book imbalance (bid vs. ask depth skew), recent volume trend.
- Funding/carry: current funding rate and its recent trend (elevated positive funding leans short
  bias context; elevated negative leans long bias context).
- Structure: simple higher-high/lower-low or swing-structure classification from recent candles.
- Liquidity: 24h turnover, to filter out illiquid noise.

Combine into a single score per symbol per direction. Apply the **No-Trade Guard** (REQ-016) as a
second pass over the scored list: flag/exclude candidates with abnormal squeeze risk (e.g. thin
order-book depth relative to recent volatility), contradicting signals across the two directions
or across timeframes (REQ-073), or any input reading `degraded`/`unavailable`. Map the final
score + guard result to a **readiness tier** (REQ-017): `CONFIRMED` (strong score, guard clean),
`WATCHLIST` (moderate score, guard clean), `CAUTION` (strong score, guard flagged a concern),
`BLOCKED` (guard hard-failed, e.g. data unavailable or contradiction).

---

## 6. Level & entry derivation (REQ-021/022)

Pick one real, documented method and apply it consistently for both resistance/support-level sets:

- **Swing-structure method**: recent local highs/lows over a lookback window, ranked by how many
  times price reacted at each level.
- or **ATR-multiple bands**: entry ± 1×/2×/3× ATR(14) as the three levels each direction.
- or **Volume-profile nodes**: high-volume price nodes above/below current price from recent
  candle+volume data.

Whichever you choose, implement it as a pure function taking price/candle data in and returning
`{ entry, resistances: [r1, r2, r3], supports: [s1, s2, s3] }`, and reuse this exact function for
both the live dashboard detail view and the backtest mode (REQ-075) — the whole point of REQ-075
is validating this same code path against history, not building a second parallel implementation.

---

## 7. Design system detail (REQ-060/061/062/063)

### 7.0 Visual persona (fixed identity — anchor every design decision to this, not to a generic description)

**"Bloomberg Terminal precision meets TradingView/Hyperliquid modern polish."** This is the one
named aesthetic for the entire application — every screen, every component, every empty state
traces back to it. Do not drift toward a generic SaaS-dashboard look (light, airy, rounded,
pastel) and do not invent a second "vibe" for any individual screen. Concretely:

- Near-black canvas (not pure `#000000`), with layered dark surfaces for card elevation.
- One electric cyan/blue as the single brand/interactive accent.
- Teal for long/bullish, rose for short/bearish — applied identically everywhere a direction
  appears (price change, candidate direction, level ladder tiers, everything).
- Dense, information-rich layouts — this is a terminal for a working trader, not a marketing
  page — but every card still has real internal breathing room; density and clarity are not in
  tension if spacing is deliberate.
- Sharp, precise typography (a monospace or semi-condensed sans for numbers/tickers reads as more
  "terminal" than a soft rounded font) — pick one directional choice and apply it everywhere
  numbers appear.

If any two screens in the finished app could plausibly belong to two different products, that is
a defect against this section — fix it before moving on, don't leave it as a known issue.

### 7.1 Palette & primitives

Dark, professional trading-terminal palette, defined once as CSS custom properties (or a Tailwind
`@theme` block):

- Near-black canvas background, 2–3 surface elevation levels for card layering (avoid a flat
  single-surface look and avoid pure black).
- One accent color for brand/primary interactive elements.
- One semantic long/bullish color and one short/bearish color, applied identically everywhere a
  direction is shown — price change, candidate direction, level tiers, everything.
- One warning/neutral accent for anything else needing emphasis.
- 4–6 font sizes total, reused everywhere.
- Shared primitives per REQ-061, used by every screen — no per-screen bespoke styling, no inline
  hex colors, no ad-hoc "glass" utility classes invented per component.

---

## 8. Trading/position-sizing panel field spec (REQ-040 through 046)

Inside the symbol detail drawer, an editable calculator:

- **Account risk amount** — currency value or % of account (user toggles mode).
- **Leverage** — numeric/slider input; recalculates position size and estimated liquidation
  distance live.
- **Success probability** — model-estimated value shown by default, with a manual override field
  clearly marked "user-adjusted" once touched.
- **Stop-loss / take-profit** — pre-filled from Section 6's computed levels, editable; R-multiple
  and position size recompute live as they're edited.
- **Computed outputs** (read-only): position size in base-asset units and USD notional, risk in
  USD, expected R-multiple, and a one-line plain-language summary (e.g. "Risking $120 (1.2% of
  account) at 5x leverage for a 1:2.4 R setup").
- All math in one pure, unit-tested module (REQ-045). No control here ever sends an order (REQ-046).

---

## 9. Settings screen (REQ-080/081)

- Empty, optional KuCoin API key/secret/passphrase fields, persisted locally, labeled clearly as
  reserved for a future automated-trading capability that does not exist in this build. A
  permanent badge elsewhere in the UI (e.g. the settings entry point itself) reads "Not connected
  to execution — manual/paper trading only" for as long as no order-execution code exists.
- Exposes the tunable thresholds used elsewhere: liquidity floor for gainers/losers and candidate
  filtering, alert conditions, any scoring weight you want operator-adjustable rather than
  invisible/hardcoded.
- Do not gate app startup on any of these fields being filled in.

---

## 10. Definition of done

The build is done when every row in `REQUIREMENTS_STATUS.md` reads `IMPLEMENTED` with a real
file/function backing it, `tsc --noEmit` / `npm run build` / `npx vitest run` all succeed from a
clean `npm install`, and a fresh load of the app at 1440×900 shows the full dashboard from Section
2.2 with real live data and no page scroll. Anything less is not done — say so explicitly and keep
going rather than presenting a partial build as complete.

---

## Now build it

Using everything specified above as the complete, authoritative requirements for this project:
create `REQUIREMENTS_STATUS.md` from Section 2, then build the full application — backend, data
layer, scoring/level engines, and every dashboard/detail/settings screen — from scratch, in
working, runnable, tested code. Do not ask me for any exchange API keys or credentials at any
point; leave those fields empty in Settings for me to fill in later. Work through the Requirements
Manifest systematically, report which `REQ-###` items are still not `IMPLEMENTED` after each
batch of work, and keep going until every row is `IMPLEMENTED`.
