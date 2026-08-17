# Refrence.md — APEX Trading Engine Agent Navigation Reference

The filename is intentionally `Refrence.md` for compatibility with the
canonical project layout. Use this exact path when navigating the repository.

## MANDATORY MAINTENANCE RULE

Any agent or developer who changes any file, UI block, service, API route, component, hook, test, or project behavior **must update this `Refrence.md` file in the same session**.

This rule is mandatory.

Every update must include:

* The file changed.
* The exact block, anchor, or approximate line range changed.
* The reason for the change.
* Any new validation requirement.
* Any new known issue or resolved issue.
* Any new instruction future agents must follow.

If this file becomes stale, future free agents waste their limited budget reading entire files again. Prevent that.

---

# 0. Core Agent Rules

## 0.1 Main Rule

Do not start with a broad audit.

Do not read whole files unless explicitly required by a build/runtime error and no anchor is available.

Use this file first.

Open only the file and line range or search anchor listed for the task.

If a line range has shifted after edits, use the nearest anchor and read **maximum 80 lines around it**.

## 0.2 Forbidden Agent Behavior

Agents must not:

* Read the full `src/App.tsx`.
* Read all components.
* Search the entire project without a specific anchor.
* Re-audit backend when the task is UI-only.
* Re-audit UI when the task is API-only.
* Add fake/demo/synthetic data as a success path.
* Change trading calculations for visual convenience.
* Claim browser testing was done without screenshots or browser proof.
* Download Playwright Chromium if system Edge is available.
* Output screenshots over 1MB.

## 0.3 Required Agent Behavior

Agents must:

* Use the anchors in this file.
* Patch only the requested target area.
* Run validation after changes.
* Verify browser UI with Playwright + system Edge when UI is changed.
* Keep real data real.
* Report only the relevant result.

---

# 1. Current Project Status

## 1.0 Audit Refresh — 2026-08-10

This block is the current navigation/status refresh. The older `1.1 Known Valid State` and subsequent dated entries are retained as **historical accepted-state records**, not as the current line-number map.

Current audited source package:

```text
Version: 1.0.56
Workspace pages: 14
Runtime API operations discovered: 128
OpenAPI operations documented: 27 (21.1%)
Test inventory: 82 files / 313 tests
Strategy definitions: 14 (10 candidate/Core + 4 blocked research)
Multi-Agent/Multi-Trading source QA: 20/20 PASS
Multi-Agent runtime QA: 14/14 PASS
Smart Autopilot QA: 18/18 PASS
Strategy Studio reference QA: 25/25 PASS
Backtesting workspace QA: 25/25 PASS
Strategy optimization QA: 26/26 PASS
Maximal merge safety: 30/30 PASS
Unified safety runtime: 11/11 PASS
```

Current canonical navigation artifacts:

- `Doc/repository/PROJECT_STRUCTURE_2026-08-10.md`
- `Doc/repository/FILE_INDEX_2026-08-10.md` / `.json`
- `Doc/repository/API_ROUTE_INDEX_2026-08-10.md` / `.json`
- `Doc/reports/final/APEX_COMPREHENSIVE_PROJECT_AUDIT_2026-08-10.md`

**Important freshness rule:** `Doc/FUNCTION_INDEX.*` was regenerated for this snapshot with `npm run index:functions` and now indexes 3022 symbols across 546 files. Earlier audit notes about a stale Function Index are historical only and must be read as resolved in the current snapshot.

**Build proof boundary for this audit:** source/runtime contract verifiers above passed, but no fresh `npm ci`, full Vitest run, TypeScript build, or browser pixel-QA is claimed because the available internal npm mirror did not supply the locked Vitest artifact. Do not convert historical build/browser evidence below into a claim about this audit run.

**Security/release note:** the audited input contained three ignored local runtime config files at root. The audited delivery removes them and the source secret gate passes afterward. `server.ts` still persists these local settings to root paths; move that persistence out of the repository in a future hardening change.

## 1.1 Historical Known Valid State (2026-07-27)

**2026-07-27 consolidation:** Canonical root `C:\project\APEX-Trading-Engine`.
Prior copies compressed to `_archive_20260727_consolidated.zip`. Historical
documentation is compressed in `_archive_docs_historical_20260727.zip`.

Latest accepted state:

```text
TypeScript: pass
Build: pass
Tests: 226/226 pass (29 files)
Browser tool: Playwright with system Edge
Browser launch: chromium.launch({ channel: "msedge" })
Console errors during last measured layout pass: 0
Page errors during last measured layout pass: 0
KuCoin: live / reachable
Binance sentiment: may be unavailable
Fake/demo data: forbidden
Market-data coordinator: TTL + in-flight shared cache (Priority 1)
Server boundary: CORS allowlist + CSRF + optional operator token + SSRF guards (Priority 2)
Health contract: provider-aware READY/DEGRADED/UNAVAILABLE/NOT_CONFIGURED statuses (Priority 4)
Browser smoke: repository-relative `_qa/` artifacts with Edge/default resolution (Priority 5)
```

Deployment: Hugging Face Space `https://huggingface.co/spaces/Really-amin/crypto_learning_system`
(Docker SDK, app port 7860) exists as a separate deployment remote.

## 1.2 Resolved Issues

Do not re-diagnose these unless a new screenshot or browser measurement proves they returned.

### Right Sidebar Overlap

Previously:

```text
Right sidebar flex children were shrinking.
LevelHUD was clipped.
MetricIntegral / Level 2 spilled over SYS ARCHIVE.
Nested scrollbar appeared.
```

Resolved by:

```text
LevelHUD root received shrink-0.
level2JSX wrapper changed to shrink-0.
MetricIntegral flex/min-height behavior adjusted.
Right sidebar overlap measured as 0 after browser verification.
```

### Left Watchlist Overflow

Previously:

```text
Watchlist table was wider than panel.
Price overlapped Conf.
INFO column was clipped.
Header controls collided.
```

Resolved by:

```text
WatchlistPanel padding/header/columns compacted.
WatchlistCard price compacted.
Sparkline reduced.
INFO made compact/icon-only.
Watchlist overflow measured as 0.
```

### Tailwind Invalid Shades

Previously:

```text
Invalid Tailwind v4 shades produced missing CSS.
```

Resolved by:

```text
Invalid shades were replaced with valid Tailwind v4 values.
```

### SettingsPanel Scroll-Lock

Previously:

```text
SettingsPanel had ESC behavior but no body scroll-lock.
```

Resolved by:

```text
SettingsPanel scroll-lock added.
```

### `/api/health`

Current state:

```text
/api/health exists and returns JSON.
```

---

# 2. Standard Commands

## 2.1 Validation

Run after every code patch:

```bash
npx tsc --noEmit
npm run build
npm test
```

Required result:

```text
TypeScript: 0 errors
Build: success
Tests: 150/150 pass
```

## 2.2 Start Fresh Built Server

If `dist` is fresh:

```bash
node dist/server.cjs
```

or:

```bash
npm start
```

If port 3000 is busy:

```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

Only if needed:

```powershell
taskkill /IM node.exe /F
```

## 2.3 Browser Verification with System Edge

Do not download Chromium if system Edge is available.

Use:

```js
import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: "msedge",
  headless: true
});
```

Open:

```text
http://localhost:3000
```

Wait up to 90 seconds for either:

```text
dashboard rendered
or honest unavailable/degraded state
```

## 2.4 Screenshot Size Rule

All screenshots must be under 1MB.

Use JPEG:

```js
await page.screenshot({
  path: "_qa/right_sidebar_after.jpg",
  type: "jpeg",
  quality: 70
});
```

For large desktop screenshots, crop the component:

```js
await page.locator("aside").screenshot({
  path: "_qa/right_sidebar_after.jpg",
  type: "jpeg",
  quality: 70
});
```

Check size:

```powershell
(Get-Item "_qa\right_sidebar_after.jpg").Length
```

If over 1MB:

```text
Lower JPEG quality to 60–65 or crop the target component.
```

---

# 3. `src/App.tsx` Navigation Map

Line numbers are approximate. If they shift, use the nearest anchor and read max 80 lines around it.

## 3.1 App.tsx Major Blocks

| Purpose                          | File          | Approx Range | Anchor                                      |
| -------------------------------- | ------------- | -----------: | ------------------------------------------- |
| Imports / top config             | `src/App.tsx` |        1–120 | `import`, `scannerConfig`                   |
| Scenario helper                  | `src/App.tsx` |       70–140 | `deriveScenarioProbs`                       |
| Main state                       | `src/App.tsx` |      140–260 | `const [activeSignal`                       |
| Modal scroll-lock                | `src/App.tsx` |      250–280 | `isHelpOpen`, `isWatchlistModalOpen`        |
| Active signal reconciliation     | `src/App.tsx` |      680–715 | `watchlist`, `setFocusedTicker`             |
| Active Trade Corridor            | `src/App.tsx` |    1639–1757 | `const signalCardJSX = !activeSignal ? (`   |
| LevelHUD wrapper                 | `src/App.tsx` |    1758–1785 | `const levelHudJSX`                         |
| Level 2 / MetricIntegral wrapper | `src/App.tsx` |    1790–1845 | `const level2JSX`                           |
| Adaptive / SYS ARCHIVE wrapper   | `src/App.tsx` |    1850–1935 | `const heuristicsJSX`                       |
| Mobile layout                    | `src/App.tsx` |    2160–2240 | `md:hidden`                                 |
| Desktop layout                   | `src/App.tsx` |    2240–2320 | `md:flex`                                   |
| Right sidebar stack              | `src/App.tsx` |    2260–2320 | `levelHudJSX`, `level2JSX`, `heuristicsJSX` |

---

## 3.2 Active Trade Corridor / `signalCardJSX`

File:

```text
src/App.tsx
```

Approximate range:

```text
lines 1639–1757
```

Search only:

```bash
rg -n "const signalCardJSX|ACTIVE TRADE CORRIDOR|DOUBLE-TAP|RIGHT-CLICK|LONG-PRESS|J-ADJ|Fusion Score|BIAS CONF|TRADE RATE" src/App.tsx
```

This block controls:

```text
ACTIVE TRADE CORRIDOR
ticker
price
risk/donut metric
Fusion Score
Bias Confidence
Trade Rate
double-click / right-click / long-press actions
```

Current task relevance:

```text
Right sidebar UI clarity.
Ticker may be too large.
Donut/ring metric may be unclear.
Action affordances may be weak.
```

Allowed changes:

```text
Change text sizes.
Add visible action chips.
Add title / aria-label.
Clarify donut/risk metric label.
Improve visual hierarchy.
```

Forbidden changes:

```text
Do not change calculations.
Do not change data source.
Do not fake values.
Do not change backend/API.
```

---

## 3.3 LevelHUD Wrapper / `levelHudJSX`

File:

```text
src/App.tsx
```

Approximate range:

```text
lines 1758–1785
```

Search:

```bash
rg -n "const levelHudJSX|LevelHUD|onOpenDetail" src/App.tsx
```

Expected null-safe pattern:

```tsx
const levelHudJSX = activeSignal ? (
  <LevelHUD
    activeSignal={activeSignal}
    onOpenDetail={() => setOpenTicker(activeSignal.ticker)}
  />
) : null;
```

Never access `activeSignal.ticker` or `activeSignal.trackingState` without guard.

---

## 3.4 Level 2 / `level2JSX`

File:

```text
src/App.tsx
```

Approximate range:

```text
lines 1790–1845
```

Search:

```bash
rg -n "const level2JSX|MetricIntegral|LEVEL 2|DEEP DEPTH" src/App.tsx
```

Purpose:

```text
Level 2 Deep Depth Ledger / MetricIntegral.
```

Important resolved rule:

```text
Wrapper must not shrink.
Use shrink-0 where needed.
The right sidebar itself should scroll as one column.
```

---

## 3.5 Adaptive / `heuristicsJSX`

File:

```text
src/App.tsx
```

Approximate range:

```text
lines 1850–1935
```

Search:

```bash
rg -n "const heuristicsJSX|SYS ARCHIVE|AdaptiveHeuristics|memoryLogs" src/App.tsx
```

Purpose:

```text
Adaptive Heuristics / SYS ARCHIVE.
```

Do not allow it to be visually overlapped by Level 2.

If overlap returns, inspect right sidebar flex behavior first.

---

## 3.6 Desktop Layout

File:

```text
src/App.tsx
```

Approximate range:

```text
lines 2240–2320
```

Search:

```bash
rg -n "md:flex|levelHudJSX|level2JSX|heuristicsJSX|overflow-y-auto" src/App.tsx
```

Important right sidebar rule:

```tsx
className="... overflow-y-auto ... [&>*]:shrink-0"
```

or each direct card child should include:

```tsx
className="shrink-0 ..."
```

---

## 3.7 Modal / Overlay Area

Only inspect for modal-specific tasks.

Search:

```bash
rg -n "isHelpOpen|isWatchlistModalOpen|SettingsPanel|SignalDetailSheet|Escape|overflow" src/App.tsx
```

Current known status:

```text
Help / Watchlist: scroll-lock + ESC
SettingsPanel: ESC existed and scroll-lock was added
SignalDetailSheet: own ESC handler
```

---

## 3.8 ActiveSignal Null Guard

Previous crash:

```text
Cannot read properties of null (reading 'trackingState')
```

Search:

```bash
rg -n "activeSignal\.|trackingState" src/App.tsx
```

Rules:

```tsx
{activeSignal && (
  <Component activeSignal={activeSignal} />
)}
```

or:

```tsx
const activeTickerLabel = activeSignal?.ticker ?? "NO ACTIVE SIGNAL";
```

Forbidden:

```tsx
activeSignal.trackingState.isTracking
```

without guard.

---

# 4. Component Navigation Map

## 4.1 `src/components/LevelHUD.tsx`

Purpose:

```text
Execution Level Matrix card.
Shows entry, details, targets, stop, leverage, max risk.
```

Approximate ranges:

| Section             | Approx Range | Anchor                                    |
| ------------------- | -----------: | ----------------------------------------- |
| imports / interface |         1–10 | `interface LevelHUDProps`                 |
| helpers             |        10–20 | `fmtCompact`, `fmtPrecise`                |
| calculations        |        20–50 | `tp1`, `tp2`, `sl1`, `rrRatio`            |
| root card           |        50–65 | `return (`                                |
| header / R:R        |        55–80 | `Execution Level Matrix`, `R/R`           |
| SHORT ENTRY row     |       80–105 | `SHORT ENTRY`, `Details`                  |
| TP rows             |      105–150 | `TP1`, `TP2`                              |
| SL row              |      150–180 | `SL1`                                     |
| risk controls       |      180–220 | `Suggested leverage`, `Max position risk` |

Search only:

```bash
rg -n "SHORT ENTRY|DETAILS|TP1|TP2|SL1|SUGGESTED LEVERAGE|MAX POSITION RISK|Execution Level Matrix|R/R" src/components/LevelHUD.tsx
```

Current UI clarity issues:

```text
SHORT ENTRY price may truncate.
DETAILS relation may be unclear.
TP/SL hierarchy may be noisy.
```

Allowed patch:

```text
Use compact price formatting.
Use grid: auto / minmax(0, 1fr) / auto.
Make Details button obviously actionable.
Keep TP/SL rows label-left/value-right.
Keep R/R visually connected to matrix title.
```

---

## 4.2 `src/components/MetricIntegral.tsx`

Purpose:

```text
Level 2 / Deep Depth Ledger / order book display.
```

Search only:

```bash
rg -n "MetricIntegral|Level 2|Deep Depth|order book|overflow|min-h|flex-1" src/components/MetricIntegral.tsx
```

Resolved issue:

```text
When parent flex squeezed it, content spilled over SYS ARCHIVE.
```

Rule:

```text
Do not reintroduce forced flex-1/min-h-0 compression.
If content is taller, the parent sidebar scrolls.
```

---

## 4.3 `src/components/WatchlistPanel.tsx`

Purpose:

```text
Left watchlist panel.
```

Search only:

```bash
rg -n "table-fixed|REFRESH|Pairs Active|Active|colgroup|WATCHLIST" src/components/WatchlistPanel.tsx
```

Resolved issues:

```text
Header cramped.
Table wider than panel.
Price/conf overlap.
INFO clipping.
```

Allowed patch only if issue returns:

```text
Compact header.
Use "Active" instead of "Pairs Active".
Rebalance table columns.
Collapse/hide INFO.
No horizontal overflow.
```

---

## 4.4 `src/components/WatchlistCard.tsx`

Purpose:

```text
Individual watchlist row.
```

Search only:

```bash
rg -n "price|toLocaleString|sparkline|Info|confidence|ticker" src/components/WatchlistCard.tsx
```

Resolved issues:

```text
Price too wide.
Sparkline too wide.
INFO clipped.
```

Allowed patch only if issue returns:

```text
Compact price.
Use tabular-nums.
Use truncate.
Use icon-only info.
Reduce sparkline width.
```

---

## 4.5 `src/components/TradingChart.tsx`

Purpose:

```text
Center chart and candles.
```

Search only for chart-specific tasks:

```bash
rg -n "Candles Unavailable|LIVE|UNAVAILABLE|signal.levels|canvas|svg" src/components/TradingChart.tsx
```

Do not touch for right-sidebar UI work.

---

## 4.6 `src/components/SettingsPanel.tsx`

Purpose:

```text
Settings panel.
```

Search only for settings-specific tasks:

```bash
rg -n "Escape|keydown|isOpen|overflow|body.style|SettingsPanel" src/components/SettingsPanel.tsx
```

Known state:

```text
ESC existed.
Scroll-lock was added.
```

---

## 4.7 `src/components/AdaptiveHeuristics.tsx`

Purpose:

```text
Manual feedback and adaptive logs.
```

Search only:

```bash
rg -n "WIN|LOSS|BREAKEVEN|pnl|manual|feedback|memoryLogs|reset" src/components/AdaptiveHeuristics.tsx
```

Rules:

```text
No random P&L.
User-entered P&L only.
Feedback should post to /api/feedback if wired.
```

---

## 4.8 `src/components/LiveDataHealthPanel.tsx`

Purpose:

```text
Live provider health display.
```

Search only:

```bash
rg -n "LiveDataHealthPanel|UNAVAILABLE|LIVE|provider|ticker" src/components/LiveDataHealthPanel.tsx
```

Rule:

```text
Never fake live state.
```

---

# 5. Backend and Service Map

## 5.1 `server.ts`

Search only:

```bash
rg -n "/api/health|/api/feedback|/api/supplemental/health|kucoin|binance|catch-all|app.get" server.ts
```

Important routes:

```text
GET /api/health
POST /api/feedback
GET /api/supplemental/health
KuCoin proxy routes
Binance/sentiment routes
SPA catch-all
```

Route-order rule:

```text
API routes must be registered before SPA catch-all.
```

Wrong:

```text
/api/health returns index.html
```

Correct:

```text
/api/health returns JSON
```

---

## 5.2 `src/services/marketData.ts`

Search only:

```bash
rg -n "KuCoin|WebSocket|ticker|contracts|candles|EXCHANGE_UNREACHABLE|dataSource|marketDataCoordinator|MARKET_DATA_TTL" src/services/marketData.ts
rg -n "getOrFetch|makeCoordinatorKey|getDiagnostics" src/services/marketDataCoordinator.ts
```

Rule:

```text
No fake market data.
If unreachable, return honest unavailable.
Shared TTL/in-flight coordinator is mandatory for REST market fetches.
```

Related:

```text
src/services/marketDataCoordinator.ts
src/tests/marketDataCoordinator.test.ts
MarketDataService.invalidateMarketDataCache(ticker?)
MarketDataService.getCoordinatorDiagnostics()
```

---

## 5.3 `src/services/scannerCore.ts`

Search only:

```bash
rg -n "obiThreshold|volumeThreshold|minConfidence|SHORT_ONLY|confidence|scanner" src/services/scannerCore.ts
```

Do not touch unless scanner-specific task.

---

## 5.4 Supplemental / News / Sentiment / On-chain

Possible files:

```text
src/services/supplemental*
src/services/news*
src/services/sentiment*
src/services/onchain*
server.ts
```

Search only:

```bash
rg -n "NewsAPI|CryptoCompare|HuggingFace|Etherscan|BscScan|TronScan|CoinMarketCap|CoinGecko|NOT_CONFIGURED|UNAVAILABLE" src server.ts
```

Rule:

```text
Use real env keys if configured.
Never fake news/sentiment/on-chain as live.
```

---

# 6. Ready-Made Agent Tasks

## 6.1 Final UI Verification Only

```text
Use Reference.md.

Do not read source files.
Do not audit.

If server is not listening on port 3000, start fresh build:
node dist/server.cjs

Use Playwright with system Edge:
chromium.launch({ channel: "msedge" })

Open:
http://localhost:3000

Wait up to 90s for dashboard or honest unavailable state.

Capture screenshots under 1MB:
_qa/after_desktop.jpg
_qa/right_sidebar_after.jpg

Measure:
console errors
page errors
failed network requests
left watchlist overflow
right sidebar overlap
activeSignal trackingState crash
KuCoin live state
fake/demo data used yes/no

Report only:
screenshot paths + sizes, console errors, network errors, layout measurements, remaining blockers.
```

---

## 6.2 Right Sidebar UI Clarity Only

Target:

```text
ACTIVE TRADE CORRIDOR
EXECUTION LEVEL MATRIX
```

Files:

```text
src/App.tsx
src/components/LevelHUD.tsx
```

Prompt:

```text
Use Reference.md.

Only improve this specific right-sidebar UI section:
1. ACTIVE TRADE CORRIDOR card
2. EXECUTION LEVEL MATRIX card

Do not touch backend/API/env/data logic/watchlist/chart/scanner.

Open only:

src/App.tsx:
rg -n "const signalCardJSX|ACTIVE TRADE CORRIDOR|DOUBLE-TAP|RIGHT-CLICK|LONG-PRESS|J-ADJ|Fusion Score|BIAS CONF|TRADE RATE" src/App.tsx

src/components/LevelHUD.tsx:
rg -n "SHORT ENTRY|DETAILS|TP1|TP2|SL1|SUGGESTED LEVERAGE|MAX POSITION RISK|Execution Level Matrix|R/R" src/components/LevelHUD.tsx

Read max 80 lines around matches.

Patch:
- reduce ticker size
- clarify donut/ring as Risk Adj with readable value + caption
- add visible action chips: 2× Bind / RC Trend / Hold Touch
- add title/aria-label to active signal card
- make Details button clearly actionable
- prevent SHORT ENTRY price truncation
- keep TP/SL rows label-left/value-right
- keep screenshots under 1MB

Run:
npx tsc --noEmit
npm run build
npm test

Browser verify with Edge:
chromium.launch({ channel: "msedge" })

Screenshot:
_qa/right_sidebar_after.jpg
JPEG quality 70
must be <1MB

Report only:
files changed, screenshot path + size, console errors, remaining visual issues.
```

---

## 6.3 Watchlist Overflow Only

Files:

```text
src/components/WatchlistPanel.tsx
src/components/WatchlistCard.tsx
```

Prompt:

```text
Use Reference.md.

Only fix left Watchlist overflow. Do not touch other files.

Open only:

rg -n "table-fixed|REFRESH|Pairs Active|Active|colgroup|WATCHLIST" src/components/WatchlistPanel.tsx
rg -n "price|toLocaleString|sparkline|Info|confidence|ticker" src/components/WatchlistCard.tsx

Read max 80 lines around matches.

Fix:
- no horizontal overflow
- price/conf must not overlap
- INFO icon-only or hidden
- compact price format
- smaller sparkline
- header can wrap
- no fake data

Run:
npx tsc --noEmit
npm run build
npm test

Browser verify with Edge screenshot.
Report only measurements.
```

---

## 6.4 ActiveSignal Crash Only

File:

```text
src/App.tsx
```

Prompt:

```text
Browser crash:
Cannot read properties of null (reading 'trackingState')

Only fix activeSignal null guards.

Search:
rg -n "activeSignal\\.|trackingState" src/App.tsx

Do not read whole file.
Read max 80 lines around unsafe matches.

Fix:
- no activeSignal.trackingState without guard
- no activeSignal.ticker without guard in JSX
- wrap blocks with activeSignal ? (...) : fallback/null
- keep levelHudJSX guarded
- keep LiveDataHealthPanel guarded
- keep LevelHUD guarded

Run:
npx tsc --noEmit
npm run build
npm test

Browser verify:
no trackingState crash.
```

---

## 6.5 API Keys / Real Provider Check

Root file:

```text
api(3).txt
```

Prompt:

```text
Use Reference.md.

Use root file api(3).txt for available provider keys.
Do not print secrets.

Only inspect env names using:
rg -n "NEWS|HUGGING|CRYPTOCOMPARE|COINMARKETCAP|COINGECKO|ETHERSCAN|BSCSCAN|TRONSCAN|API_KEY" server.ts src

Create/update .env.local.
Update .env.example with placeholders.
Ensure .gitignore protects:
.env
.env.local
.env.*.local

Verify:
GET /api/health
GET /api/supplemental/health
POST /api/feedback
KuCoin route
News/sentiment/on-chain routes if present

Report provider status:
configured yes/no
real request attempted yes/no
result live/unavailable/not_configured/rate_limited/error

No key values in report.
```

---

# 7. Real Data Rules

## 7.1 Fake/Demo Ban

Forbidden:

```text
fake prices
random market values
synthetic signals unless explicitly labeled fallback
fake success for provider routes
fake sentiment/news/on-chain
```

Allowed statuses:

```text
UNAVAILABLE
NOT_CONFIGURED
RATE_LIMITED
EXCHANGE_UNREACHABLE
DEGRADED_LIVE
```

## 7.2 Unavailable Behavior

If provider is down:

```text
UI must not stay on spinner forever.
It must render honest unavailable/degraded state.
```

If KuCoin is live and Binance sentiment is unavailable:

```text
DATA_SOURCE: KUCOIN_LIVE_BINANCE_UNAVAILABLE
DEGRADED_LIVE badge
```

This is acceptable.

## 7.3 API Keys File

Root file:

```text
api(3).txt
```

Used for:

```text
NewsAPI
CryptoCompare
Hugging Face
CoinMarketCap
CoinGecko if present
Etherscan / BscScan
TronScan
```

Rules:

```text
Never print keys.
Never store secrets in localStorage.
Never commit .env.local.
```

---

# 8. Standard Final Report Format

Every agent must finish with:

```text
1. FILES CHANGED
- file:
- exact block/anchor:

2. VALIDATION
- TypeScript:
- Build:
- Tests:

3. BROWSER PROOF
- tool:
- screenshot path:
- screenshot size:
- console errors:
- page errors:
- failed network requests:

4. TARGET RESULT
- issue fixed yes/no:
- measurement before/after if available:

5. REAL DATA
- KuCoin:
- Binance sentiment:
- fake/demo data used: yes/no

6. REMAINING BLOCKERS
Only real blockers.
```

Do not include:

```text
broad source summary
file tree
package explanation
old diagnosis
"it should work"
"I inspected the code" without browser proof
future refactor ideas unrelated to current blocker
```

---

# Appendix A — Right Sidebar UI Clarity Patch Guide

## Target Area

```text
ACTIVE TRADE CORRIDOR
BTC-USDT
price
donut/ring
Fusion Score
Bias Conf
Trade Rate
DOUBLE-TAP / RIGHT-CLICK / LONG-PRESS
EXECUTION LEVEL MATRIX
SHORT ENTRY
DETAILS
TP1 / TP2 / SL1
Suggested leverage
Max position risk
```

## Problems

```text
BTC-USDT too large
Donut unclear
5.7% / J-ADJ unreadable
Interaction instructions hidden
Right-click affordance invisible
Details relation unclear
SHORT ENTRY value truncated
Important values not prioritized
```

## Files

```text
src/App.tsx
src/components/LevelHUD.tsx
```

## Exact Anchors

```bash
rg -n "const signalCardJSX|ACTIVE TRADE CORRIDOR|DOUBLE-TAP|RIGHT-CLICK|LONG-PRESS|J-ADJ|Fusion Score|BIAS CONF|TRADE RATE" src/App.tsx
rg -n "SHORT ENTRY|DETAILS|TP1|TP2|SL1|SUGGESTED LEVERAGE|MAX POSITION RISK|Execution Level Matrix|R/R" src/components/LevelHUD.tsx
```

## Required Visual Result

```text
User immediately sees ticker, direction, price, confidence.
Donut has label and meaning.
Action chips are visible.
Double-click/right-click/long-press are discoverable.
Details button is clearly actionable.
Entry/Targets/Stop/Risk are grouped.
Screenshot is under 1MB.
```

---

# Appendix B — QA Script Rules

Existing `_qa/*.mjs` scripts may be reused.

If a script uses:

```js
chromium.launch()
```

change only that launch line to:

```js
chromium.launch({ channel: "msedge", headless: true })
```

Required measurements:

```text
left watchlist overflow px
right sidebar overlap px
console errors
page errors
failed requests
screenshot path
screenshot size
```

---

# Appendix C — Emergency Minimal Prompt

Use this when the free agent budget is almost gone:

```text
Use Reference.md.

Do not audit.
Do not read whole files.

Current task only:
Right sidebar UI clarity.

Open only:
src/App.tsx around signalCardJSX
src/components/LevelHUD.tsx around SHORT ENTRY / DETAILS

Patch:
- reduce ticker size
- clarify donut as Risk Adj
- add action chips: 2× Bind / RC Trend / Hold Touch
- make Details button clearer
- prevent entry price truncation
- screenshots under 1MB

Run:
npx tsc --noEmit
npm run build
npm test

Verify with Edge Playwright:
channel msedge
right sidebar screenshot JPEG <1MB

Report only files changed, validation, screenshot path/size, console errors.
```

---

# Maintenance Log

## 2026-07-27 — Overview corridor tabs and entry-level UX

**Files changed**

- `ExecutionCorridorPanel.tsx` — tabbed right panel (Signal / Levels / Book / Feed / Archive).
- `LevelHUD.tsx` — compact typography, all 3 targets + 3 stops, live mark vs entry anchor.
- `SignalCard.tsx`, `MetricIntegral.tsx`, `LiveDataHealthPanel.tsx` — reduced font scale.
- `DesktopHeader.tsx` — removed redundant Watchlist button (LeftRail owns navigation).
- `ChartConfluenceStrip.tsx`, `ChartDeckPanel.tsx` — read-only 1M/5M/15M structure strip.
- `App.tsx` — WS ticks update mark price only; chart click sets entry + rebuilds ATR levels.
- `MobileCommandStack.tsx` — tabbed corridor; removed duplicate PORTAL watchlist button.

**Validation:** `npm run lint`, `npm test` 226/226.

---

## 2026-07-27 — Decision Memory export bridge

**Files changed**

- `src/utils/decisionMemoryExport.ts` — shared export payload builder and resolved-row counters.
- `src/services/decisionMemoryMirror.ts` — `exportAll()` for full mirror dumps.
- `server.ts` — `GET /api/decision-memory/export` read-only endpoint.
- `scripts/syncDecisionMemoryExport.mts`, `scripts/lib/decisionMemoryLoader.mts` —
  `loadMirrorDecisionLogs()` and `npm run export:decision-memory`.
- `src/App.tsx`, `src/components/CommandPanel.tsx` — export banner + Resolved stat.
- `src/constants/decisionMemoryPaths.ts` — updated export hint.
- `src/tests/decisionMemoryExport.test.ts`, `src/tests/decisionMemoryMirror.test.ts`.

**Validation:** `npm run lint`, `npm test` 226/226.

**Usage:** After scanner runs with mirror enabled, run `npm run export:decision-memory`
then `npm run validate:decision-export`. Browser IndexedDB export remains supported.

---

## 2026-07-27 — Phase E.4 load-matrix Ops integration

**Files changed**

- `src/services/operationsStatus.ts` — schema v4 adds `loadMatrixStress` evidence
  from `LOAD_MATRIX_100_SUMMARY.json` and `FAST_MINUTE_MATRIX_SUMMARY.json`;
  aggregate status and service degradation reasons for FAILED/MALFORMED/UNAVAILABLE.
- `server.ts` — passes `loadMatrix100Dir` and `loadMatrixFastDir` into
  `buildOperationsStatus()`.
- `src/components/OperationalHealthPanel.tsx` — Load Matrix Evidence panel;
  Decision Memory panel shows export path hint from `DECISION_MEMORY_EXPORT_HINT`.
- `src/constants/decisionMemoryPaths.ts` — shared export relative path and UI hint.
- `src/components/CommandPanel.tsx` — export instructions with
  `DECISION_MEMORY_EXPORT_REL_PATH`.
- `src/tests/operationsStatus.test.ts` — load-matrix parsing and aggregation tests.
- `scripts/smokeOperationsStatus.mts`, `scripts/auditOperationsPanel.mts` — load
  matrix dirs, `loadMatrixVisible` audit check; audit navigates via `#operations`.
- `package.json` — `validate:decision-export` alias for `ml:validate`.
- `Doc/PROJECT_UPGRADE_PLAN.md`, `README.md`, `Doc/README.md` — Phase E.4 docs.

**Anchors:**

- Contract builder: `parseLoadMatrixSummary()` / `aggregateLoadMatrixStatus()` in
  `src/services/operationsStatus.ts`
- UI evidence card: `Load Matrix Evidence` in
  `src/components/OperationalHealthPanel.tsx`
- Export hint: `DECISION_MEMORY_EXPORT_REL_PATH` in
  `src/constants/decisionMemoryPaths.ts`

**Validation:** `npm run lint`, `npm test` 223/223, `npm run smoke:operations-status`,
`npm run audit:operations-panel` PASS (Load Matrix Evidence visible).

**Safety:** Load-matrix evidence is synthetic and audit-only. No scanner,
lifecycle, or execution path was enabled.

---

## 2026-07-27 — UI component extraction and Overview polish

**Files changed**

- `src/utils/signalDisplay.ts` — scenario probabilities, price formatting, labels.
- `src/components/SignalCard.tsx`, `ChartView.tsx`, `ChartDeckPanel.tsx`,
  `OrderBookPanel.tsx`, `ExecutionCorridorPanel.tsx`, `RiskRegimesPanel.tsx`,
  `OverviewBanner.tsx`, `OverviewCommandDeck.tsx`, `DesktopHeader.tsx`,
  `MobileCommandStack.tsx`, `ApexLogo.tsx` — extracted from monolithic `App.tsx`.
- `src/App.tsx` — reduced to ~2,700 lines; uses extracted components.
- `src/components/LevelHUD.tsx` — clearer labels (Targets, Stops, Leverage, Max risk).
- `src/components/DesktopHeader.tsx` — progressive header overflow fixes; settings
  button title restored for UI audit selector.
- `src/index.css` — `.overview-command-deck`, `.overview-corridor-panel` layout.

**Validation:** `npm run lint`, `npm test` 221/221, `npm run audit:ui-synthetic`.

**Note:** Phases C, C2, and D are code complete; remaining gate is browser Decision
Memory export to `Doc/automation/ml_dataset/decision_memory_export_v1.json`.

---

## 2026-07-27 — Phase E.3 provider-routing degraded-mode hardening

**Files changed**

- `src/services/providerRoutingStress.ts` — pure failure-injection harness for
  timeout, geo block, rate limit, 5xx, malformed, unsupported symbol, proxy
  unavailable, all-routes-down, LKG degrade, cooldown, and recovery.
- `scripts/runProviderRoutingStress.mts` — writes versioned JSON/Markdown under
  `Doc/automation/provider_routing/` and exits non-zero on FAIL.
- `src/tests/providerRoutingStress.test.ts` — determinism, failure-mode coverage,
  no-fabrication, no-secrets, and Ops contract parsing tests.
- `src/services/operationsStatus.ts`, `server.ts` — schema v3 adds
  `providerRoutingStress` evidence and observed Ops states.
- `src/components/OperationalHealthPanel.tsx` — Provider Routing Evidence panel.
- `package.json`, README/Doc/PROJECT_UPGRADE_PLAN updates.

**Anchors:**

- Stress runner: `runProviderRoutingStress()` in
  `src/services/providerRoutingStress.ts`
- Shared status: `OperationsProviderRoutingStressSection` in
  `src/services/operationsStatus.ts`
- UI evidence card: `Provider Routing Evidence` in
  `src/components/OperationalHealthPanel.tsx`

**Validation:** `npm run stress:provider-routing` PASS (16/16 checks, 12
scenarios); `npm test` 201/201; shadow ML remains audit-only.

**Safety:** No live-trading or execution path was enabled. Synthetic routing
evidence never enters Decision Memory or ML training.

---

## 2026-07-27 — Phase E.1 contract-driven operations observability

**Files changed:**
- `src/services/operationsStatus.ts` — shared versioned operations contract, provider normalization, shadow ML report parsing, stale detection helpers
- `server.ts` — `GET /api/operations/status` returns shared contract; fail-closed unavailable shape on internal read errors
- `src/components/OperationalHealthPanel.tsx` — consumes shared contract, bounded polling, abort/sequence guards, explicit degraded/stale/NO_MODEL/INSUFFICIENT_DATA display
- `src/services/decisionMemoryMirror.ts` — truthful accepted/rejected/resolved stats for mirror observability
- `src/tests/operationsStatus.test.ts` — contract normalization and gate-behavior tests
- `scripts/smokeOperationsStatus.mts`, `scripts/auditOperationsPanel.mts` — smoke and browser Ops-tab audit scripts
- `Doc/PROJECT_UPGRADE_PLAN.md`, `README.md`, `Doc/README.md` — Phase E.1 documentation

**Anchors:**
- Contract builder: `buildOperationsStatus()` in `src/services/operationsStatus.ts`
- Backend endpoint: `GET /api/operations/status` in `server.ts`
- Frontend panel: `OperationalHealthPanel` Ops tab in `CommandPanel.tsx`

**Validation:** `npm run lint`, `npm test` 188/188, `npm run build`, `npm run smoke:operations-status`, `npm run stress:adaptive-learning`, `npm run docs:check`

**Safety:** Shadow ML remains `auditOnly: true`. No scanner, lifecycle, execution, or live-trading path was enabled.

---

## 2026-07-27 — Archive compression + canonical rename

**Files changed:**
- `_archive/` compressed to `_archive_20260727_consolidated.zip`; source deleted after verify
- `temp/` backups compressed to `temp_20260727.zip`; originals deleted
- Canonical copy at `C:\project\APEX-Trading-Engine`; legacy path has `CANONICAL_REDIRECT.md`
- `Doc/release-history/README.md`, `Doc/ARCHIVE_CHECKSUMS.json`, `RELEASE_MANIFEST.md` updated
- `package.json` name → `apex-trading-engine`

**Validation:** `npm run lint` 0 errors; `npm test` 129/129 at canonical path.

---

**Files changed:**
- Project root: archived 22 sprint `.md` files → `Doc/archive/sprints-2026-06-21/`
- `README.md`, `Doc/README.md`, `.kiro/steering/structure.md` — rewritten for current layout
- `Refrence.md` — test baseline 68→129; consolidation note in §1.1
- `Doc/CONSOLIDATION_MANIFEST.json`, `Doc/master/RELEASE_MANIFEST.md` — path/stale notices
- Retired duplicates → `temp/docs-retired_20260727/`; `audit/` → `Doc/audit/`

**Validation after cleanup:** run `npm run lint`, `npm test`, `npm run build`

**Instruction for future agents:** Do not restore sprint reports to project root. Use `Doc/README.md` index. Prior copies only in `_archive/`.

---

## 2026-07-27 — ML Signal Model Phase 0 data-methodology pass

**Files changed:**
- `src/services/mlFeatureExtractor.ts` — added pure ML feature allow-list extraction with leakage exclusions.
- `src/tests/mlFeatureExtractor.test.ts` — added determinism, missing-feature, and leakage tests.
- `scripts/exportDecisionDataset.mts` — added browser-export-driven DecisionMemory dataset/report generator.
- `Doc/automation/ML_SIGNAL_MODEL_METHODOLOGY.md` — documented label rules, feature allow-list, split strategy, and sample-size gate.
- `Doc/automation/ml_dataset/decision_dataset_v1.json` and `Doc/automation/ml_dataset/VALIDATION_REPORT_v1.md` — generated Phase 0 artifacts.
- `src/components/CommandPanel.tsx`, `src/App.tsx` — added Decision Memory JSON export for the offline script input path.

**Validation target:** run `npm run lint`, `npm test`, and `npm run build`.

**Instruction for future agents:** Do not implement Phase 1 training until `VALIDATION_REPORT_v1.md` passes the sample gate: at least 300 labeled feature-complete accepted rows and at least 30 rows in the minority class. The ML path remains shadow-first and must not influence `scannerCore.ts` or `adaptiveThresholdEngine.ts` in Phase 0.

---

## 2026-07-27 — Documentation direction cleanup

**Files changed:**
- `Doc/PROJECT_UPGRADE_PLAN.md` — added active phased roadmap for future upgrades.
- `Doc/README.md` — promoted the upgrade plan and demoted `Doc/master/` to historical/reference status.
- `README.md` — updated the verification baseline to 133/133 tests and linked the active upgrade roadmap.
- `Refrence.md` — updated current accepted test baseline to 133/133 and recorded this cleanup.
- Removed stale operational docs: `Doc/APEX_AIStudio_Prompt.md`, `Doc/IMPLEMENTATION_REPORT.md`, `Doc/CHANGES.md`.

**Validation:** `npm test` 133/133; `npm run build` pass.

**Instruction for future agents:** Use `Doc/PROJECT_UPGRADE_PLAN.md` as the central project plan and progress tracker. Historical documentation is in `_archive_docs_historical_20260727.zip`; do not recreate the deleted folders unless a task explicitly requires extraction.

---

## 2026-07-27 — Function Atlas indexing

**Files changed:**
- `scripts/generateFunctionIndex.mts` — added the `Apex Function Atlas` generator.
- `package.json` — added `npm run index:functions`.
- `Doc/FUNCTION_INDEX.md`, `Doc/FUNCTION_INDEX.json` — generated symbol index for fast function/file lookup.
- `README.md` and `Doc/README.md` — documented the new index process and outputs.

**Validation:** `npm run index:functions` generated 609 indexed symbols.

**Instruction for future agents:** Use `npm run index:functions` whenever function locations change or when the index drifts from the code. Search `Doc/FUNCTION_INDEX.md` first before opening large files.

---

## 2026-07-27 — Decision Memory durability and lifecycle linking

**Files changed:**
- `src/services/decisionMemoryMirror.ts` — optional server-side batch mirror with durable atomic snapshots and query indexes.
- `server.ts` — Decision Memory batch, query, and status endpoints.
- `src/services/decisionMemory.ts` — non-blocking browser-to-server batching and initial migration queue.
- `src/services/decisionOutcome.ts` — exact outcome attachment by `signalId`.
- `src/hooks/useSignalScanner.ts`, `src/hooks/useWatchlistTracking.ts`, `src/App.tsx`, `src/types.ts` — carried `signalId` from accepted decisions through lifecycle resolution.
- `scripts/exportDecisionDataset.mts`, `package.json` — Phase 0 validation can read the mirror snapshot; added `npm run ml:validate`.
- `Doc/automation/DECISION_MEMORY_DATA_CONTRACT.md`, `README.md`, `Doc/README.md` — documented active behavior and configuration.

**Validation:** `npm run lint` pass; `npm test` 137/137 pass; `npm run build` pass; `npm run ml:validate` correctly returned `INSUFFICIENT DATA`; built-server API probe returned HTTP 200 for mirror write, indexed query, and status.

**Instruction for future agents:** Treat browser IndexedDB as authoritative. The backend mirror is optional and non-blocking. Do not advance ML training until `VALIDATION_REPORT_v1.md` passes both sample-size and minority-class gates.

---

## 2026-07-27 — Historical documentation archive

**Files changed:**
- `_archive_docs_historical_20260727.zip` — archived 39 files from the retired `Doc/archive`, `Doc/master`, `Doc/source`, `Doc/visual`, `Doc/audit`, and `Doc/release-history` directories.
- `Doc/README.md`, `README.md`, `Doc/PROJECT_UPGRADE_PLAN.md`, `Refrence.md` — removed live references to deleted historical directories and pointed agents to the archive.

**Validation:** Archive contents were verified before deletion; `npm run index:docs` generated 33 current documentation files; `npm run docs:check` passed with no broken local Markdown links.

**Instruction for future agents:** Keep active documentation in `Doc/` root and `Doc/automation/`. Historical material must remain in the archive unless explicitly restored for inspection.

---

## 2026-07-27 — Direction-Divergence proposal compatibility review

**Files changed:**
- `Doc/automation/DIRECTION_DIVERGENCE_POSITION_DETECTOR.md` — recorded the APEX-compatible adaptation and explicit exclusions.
- `Doc/PROJECT_UPGRADE_PLAN.md` — added Phase C2 for shadow-only direction/divergence classification.
- `Doc/README.md` — added the active document to the automation index.

**Decision:** Keep the proposal's orthogonal order-direction/trend-alignment concept, futures-aware context, replay validation, and shadow rollout. Exclude HermesFace-3/Python imports, execution changes, automatic `BOTH` direction, contrarian acceptance, and automatic risk-sizing changes.

**Known blockers:** Current APEX does not persist all per-timeframe candle series in Decision Memory, does not have a validated ADX/DI contract, and has no qualifying browser export for outcome analysis.

**Instruction for future agents:** Implement Phase C2 as pure TypeScript and shadow-only. Preserve `SHORT_ONLY`, honest unavailable/degraded states, and paper/manual-only boundaries until separate validation and safety review approve any behavior change.

---

## 2026-07-27 — Central project plan

**Files changed:**
- `Doc/PROJECT_UPGRADE_PLAN.md` — promoted the existing upgrade roadmap to the single central project plan, added a progress overview, update protocol, next priority, and progress log.
- `README.md`, `Doc/README.md`, `Refrence.md` — identified the central plan as the authoritative progress tracker.

**Instruction for future agents:** Update `Doc/PROJECT_UPGRADE_PLAN.md` for every implementation, validation result, blocker, proposal decision, or scope change. Do not create parallel roadmap files.

---

## 2026-07-27 — Sardar agent README route

**Files changed:**
- `README.md` — added a project-root documentation route for Sardar agents, ordered from `Doc/README.md` through the central plan, navigation map, documentation index, function atlas, and automation contracts.
- `Refrence.md` — recorded the README navigation rule.

**Instruction for future agents:** Start at the root `README.md`, then follow the Sardar Agent Documentation Route. The central plan is authoritative for progress; the archive is historical only.

---

## 2026-07-27 — Direction-Divergence module implementation

**Files changed:**
- `src/services/directionDivergence.ts` — pure function module for timeframe direction, market-context aggregation, and direction/divergence classification.
- `src/tests/directionDivergence.test.ts` — trend, unavailable-data, symmetry, and completeness tests.
- `src/types.ts` — added the shadow classification contract and `SignalDecisionLog.directionDivergence`.
- `src/hooks/useSignalScanner.ts` — attaches classification metadata to decision rows without changing scanner gates or risk behavior.
- `Doc/PROJECT_UPGRADE_PLAN.md` — moved Phase C2 from `PLANNED` to `IN PROGRESS`.

**Validation:** `npm run lint` pass; `npm test` 141/141 pass; `npm run build` pass; Function Atlas refreshed to 641 symbols.

**Instruction for future agents:** Keep `directionDivergence.ts` pure and reusable. Treat its output as audit/shadow metadata until chronological outcome analysis and a separate safety review approve any behavior change.

---

## 2026-07-27 — Documentation inventory and link validation

**Files changed:**
- `scripts/generateDocumentationIndex.mts` — generates a categorized inventory of the live `Doc/` tree.
- `scripts/checkDocumentationLinks.mts` — validates local Markdown links across current and historical documentation.
- `Doc/DOCUMENTATION_INDEX.md`, `Doc/DOCUMENTATION_INDEX.json` — generated inventory of 72 documentation files.
- `README.md`, `Doc/README.md`, `Refrence.md`, `package.json` — documented the new index/check commands and clarified the canonical `Refrence.md` filename.

**Validation:** `npm run index:docs` generated the inventory; `npm run docs:check` checked 50 Markdown files with no broken local links.

**Instruction for future agents:** After adding, moving, or retiring documentation, run `npm run index:docs` followed by `npm run docs:check`. Keep `Doc/README.md` concise and use `Doc/DOCUMENTATION_INDEX.md` for the complete file inventory.

---

## 2026-07-27 — Direction-Divergence chronological outcome analysis (Phase C2)

**Files changed:**
- `src/services/directionDivergenceAnalysis.ts` — pure analysis module for category aggregation, chronological splits, exclusion rules, and sample-size gate evaluation.
- `scripts/analyzeDirectionDivergence.mts` — reads Decision Memory export (`APEX_DECISION_MEMORY_EXPORT`, then `Doc/automation/ml_dataset/decision_memory_export_v1.json`, then `temp/decision-memory-v1.json`) and writes analysis reports.
- `src/tests/directionDivergenceAnalysis.test.ts` — nine unit tests for aggregation, exclusions, splits, empty/insufficient data, and deterministic output.
- `package.json` — added `npm run analyze:direction-divergence`.
- `Doc/automation/direction_divergence/DIRECTION_DIVERGENCE_ANALYSIS_v1.md` and `.json` — generated shadow analysis artifacts.
- `Doc/PROJECT_UPGRADE_PLAN.md`, `README.md`, `Doc/README.md`, `Refrence.md` — documented Phase C2 analysis pipeline and updated test baseline.

**Anchors:**
- `directionDivergenceAnalysis.ts`: `analyzeDirectionDivergenceRows`, `chronologicalSplitRows`, `evaluateAnalysisGate`, `exclusionReasonForRow`
- `analyzeDirectionDivergence.mts`: `loadRawDecisionLogs`, `markdownReport`, `main`

**Validation:** `npm run lint` pass; `npm test` 150/150 pass; `npm run build` pass; `npm run analyze:direction-divergence` reports `INSUFFICIENT_DATA` (no export); `npm run index:functions` indexed 665 symbols; `npm run index:docs` and `npm run docs:check` pass.

**Instruction for future agents:** Keep direction-divergence analysis shadow-only. Do not change scanner gates, lifecycle, or execution based on category summaries. Re-run `npm run analyze:direction-divergence` after a real browser Decision Memory export is available; Phase C2 remains partially complete until the sample gate passes on real resolved accepted rows.

---

# End of Reference.md

---

## 2026-07-27 — Phase C rejected candidate replay path

**Files changed:**
- `src/services/rejectedCandidateReplay.ts` — pure replay eligibility, TP/SL geometry, delayed-outcome resolution, and batch attach helpers (shadow-only).
- `src/hooks/useRejectedCandidateReplay.ts` — live runtime hook that resolves rejected SHORT/LONG candidates against market context without changing scanner gates.
- `src/tests/rejectedCandidateReplay.test.ts` — eligibility, TP/SL resolution, batch replay, and attach tests.
- `scripts/replayRejectedCandidates.mts` — offline replay report generator under `Doc/automation/rejected_replay/`.
- `src/App.tsx` — wired `useRejectedCandidateReplay` and `attachReplayToDecisionMemory` (~lines 430–437, 1044–1051).
- `package.json` — added `npm run replay:rejected-candidates`.
- `Doc/PROJECT_UPGRADE_PLAN.md`, `README.md`, `Refrence.md` — Phase C replay checkbox marked complete.

**Validation:** run `npm run lint`, `npm test`, `npm run build`, `npm run replay:rejected-candidates`, `npm run index:functions`, `npm run index:docs`, `npm run docs:check`.

**Instruction for future agents:** Rejected replay outcomes are counterfactual labels for adaptive threshold learning and uplift research only. Do not mix them into supervised ML v1 training. Phase D shadow ML scaffolding is implemented; training remains blocked until `VALIDATION_REPORT_v1.md` passes on accepted rows.

---

## 2026-07-27 — Phase D shadow ML scaffolding

**Files changed**

- `src/services/mlDatasetPreparation.ts` — pure accepted WIN/LOSS dataset prep, exclusions, and chronological splits.
- `src/services/mlLogisticRegression.ts` — pure TypeScript logistic regression trainer and binary metrics.
- `src/services/shadowMlModel.ts` — auditable shadow model version file, checksum validation, and scoring.
- `src/services/shadowMlTraining.ts` — shadow training orchestration, split metrics, and walk-forward validation.
- `src/services/shadowMlComparison.ts` — rule-engine vs ML shadow disagreement logging.
- `scripts/lib/decisionMemoryLoader.mts` — shared Decision Memory export loader for ML scripts.
- `scripts/trainShadowMl.mts`, `scripts/shadowMlCompare.mts` — offline report generators under `Doc/automation/ml_shadow/`.
- `src/tests/mlDatasetPreparation.test.ts`, `mlLogisticRegression.test.ts`, `shadowMlModel.test.ts`, `shadowMlTraining.test.ts`, `shadowMlComparison.test.ts` — pure-module unit tests.
- `package.json` — added `npm run ml:train` and `npm run ml:shadow-compare`.
- `Doc/PROJECT_UPGRADE_PLAN.md`, `README.md`, `Doc/README.md`, `Refrence.md` — Phase D marked partial; scripts and artifacts documented.

**Validation:** run `npm run lint`, `npm test`, `npm run build`, `npm run ml:validate`, `npm run ml:train`, `npm run ml:shadow-compare`, `npm run index:functions`, `npm run index:docs`, `npm run docs:check`.

**Instruction for future agents:** Shadow ML is audit-only. Do not wire model output into `scannerCore.ts`, lifecycle, execution, position sizing, or stop placement. Re-run `npm run ml:train` and `npm run ml:shadow-compare` after a real browser Decision Memory export passes the Phase 0 gate.

---

## 2026-07-27 — Phase E.2 deterministic adaptive-stress evidence

**Files changed**

- `src/services/adaptiveLearningStress.ts` — pure seed-controlled adaptive
  pressure harness with explicit PASS/FAIL safety checks.
- `scripts/runAdaptiveLearningStress.mts` — writes versioned JSON/Markdown
  evidence under `Doc/automation/adaptive_learning/` and exits non-zero on
  failed invariants.
- `src/tests/adaptiveLearningStress.test.ts` — determinism, guardrail, seed
  variation, and invalid-input coverage.
- `src/services/operationsStatus.ts`, `server.ts` — schema v2 adds backend
  adaptive-stress evidence without exposing report internals or secrets.
- `src/components/OperationalHealthPanel.tsx` — frontend Ops panel consumes the
  shared adaptive-stress section.
- `scripts/smokeOperationsStatus.mts`, `scripts/auditOperationsPanel.mts` —
  process-isolated ports, fail-closed schema handling, browser wait on real UI
  readiness, and affected-panel screenshot evidence.

**Anchors:**

- Stress runner: `runAdaptiveLearningStress()` in
  `src/services/adaptiveLearningStress.ts`
- Shared status: `OperationsAdaptiveStressSection` and
  `parseAdaptiveStress()` in `src/services/operationsStatus.ts`
- UI evidence card: `Adaptive Stress Evidence` in
  `src/components/OperationalHealthPanel.tsx`

**Validation:** `npm run stress:adaptive-learning` PASS with seed 42, 5,400
candidates, and 12/12 safety checks; `npm run smoke:operations-status` HTTP
200/PASS with schema v2; `npm run audit:operations-panel` PASS with screenshot.

**Safety:** Synthetic stress evidence is not Decision Memory export or ML
training data. `ADAPTIVE_GUARDRAILS`, `ATLAS_PLUS_V2`, and `SHORT_ONLY` remain
the safe defaults. No scanner execution or live-trading path was enabled.

---

## 2026-07-27 — Hardening Priority 1 (market-data coordinator)

**Changed files:**

- `src/services/marketDataCoordinator.ts` (new) — TTL cache, in-flight share, invalidate/clear, diagnostics
- `src/services/marketData.ts` — KuCoin/Binance fetchers + `fetchFullMarketSnapshot` use shared coordinator; `MARKET_DATA_TTL`; `invalidateMarketDataCache`; `getCoordinatorDiagnostics`
- `src/tests/marketDataCoordinator.test.ts` (new) — 8 focused cases
- Docs: `Doc/PROJECT_UPGRADE_PLAN.md`, `Doc/CURSOR_SYSTEM_DEFICIENCY_REMEDIATION_PROMPT.md`, `README.md`, this file

**Behavior change:** Overlapping REST market requests for the same ticker/endpoint/timeframe/limit share one network call and reuse TTL-fresh values. Failures are not cached as success. Unavailable/partial snapshots remain honest. Hook/UI call sites unchanged. Right sidebar remains disabled.

**Validation:** `npm run lint`; `npm test` 209/209; `npm run build`; `npm run docs:check`.

**Next:** Keep the hardening evidence current; begin new work only for regressions
or the documented network-sensitive visual-layout follow-up.

---

## 2026-07-27 — Hardening Priorities 3–5

**Changed files:**

- `package.json`, `package-lock.json` — removed duplicate Vite declaration,
  fixed PostCSS, and pinned body-parser override
- `src/services/healthStatus.ts` (new) — provider/proxy/probe status derivation
- `src/services/providerHealth.ts` — configured-provider summary and BscScan
- `src/hooks/useWatchlistTracking.ts` — lifecycle stale budget uses
  `MAX_STALE_CONTEXT_TICKS`
- `src/services/proxyFetch.ts` — IPv4 DNS selection prefers the responsive
  Cloudflare address family and preserves TLS/SNI host routing
- `server.ts` — structured provider-aware `/api/health`
- `src/tests/healthStatus.test.ts` (new) — health and stale-budget tests
- `scripts/uiSyntheticAudit.mjs` — portable isolated-server Edge smoke audit
- `tests/visual-layout.mjs` — portable URL/browser/output handling
- `tsconfig.json` — strict typechecking enabled
- `README.md`, `Doc/PROJECT_UPGRADE_PLAN.md`,
  `Doc/CURSOR_SYSTEM_DEFICIENCY_REMEDIATION_PROMPT.md`, this file

**Validation:**

- `npm ci` pass
- `npx tsc --noEmit --strict` pass
- `npm run lint` pass
- `npm test` 28 files / 221 tests pass
- `npm run build` pass
- `npm audit --omit=dev` reports 0 vulnerabilities
- `npm run audit:ui-synthetic` pass: 10 pages, right sidebar disabled,
  four signal drawer tabs, zero non-synthetic console/page errors
- Artifacts are under `_qa/ui_audit/` and `_qa/visual-layout/`; all screenshots
  are below 1 MB

**Known issue:** live visual-layout probes can record an honest
`UNAVAILABLE`/degraded state when the exchange network is unreachable. The
synthetic browser audit remains the deterministic UI regression gate.

---

## 2026-07-27 — Overview deck UI compaction

**Changed:** `src/App.tsx` (header/footer/banner/scenarios), `src/components/TradingChart.tsx` (volume pane, close path, denser candles), `src/components/LeftRail.tsx`, `src/index.css`.

**Intent:** Lower chrome height, denser chart, cleaner command-deck dashboard. No trading/logic changes. Right sidebar remains disabled; left-rail navigation preserved.

**Validate:** `npm run lint`; refresh Overview page visually.

---

## 2026-07-27 — Overview unified command deck (UI session scope)

**Changed:** `src/App.tsx` (Overview split layout, signal card interaction chips, gauge compaction), `src/components/LevelHUD.tsx` (OPEN DETAILS affordance), `src/index.css` (`.overview-command-deck`, `.overview-corridor-panel`).

**Intent:** Desktop Overview is now the single primary trading session: chart + execution corridor (signal card, Level HUD, L2) side-by-side on xl+. Interaction affordances (2× Bind, RC Trend) are visible chips. No trading/logic changes. Secondary workspace pages unchanged.

**Validate:** `npm run lint`; open Overview at xl+ width; confirm corridor panel scrolls independently.

---

## 2026-07-27 — UI component extraction & layout unification

**Added:** `src/utils/signalDisplay.ts`, `src/components/SignalCard.tsx`, `ChartView.tsx`, `ChartDeckPanel.tsx`, `OrderBookPanel.tsx`, `ExecutionCorridorPanel.tsx`, `RiskRegimesPanel.tsx`, `OverviewBanner.tsx`, `OverviewCommandDeck.tsx`, `DesktopHeader.tsx`, `MobileCommandStack.tsx`, `ApexLogo.tsx`.

**Changed:** `src/App.tsx` (removed inline signal/chart/corridor/header/mobile JSX; uses extracted components), `src/components/LevelHUD.tsx` (Targets/Stops/Risk labels).

**Intent:** Session 1–4 UI roadmap — extract monolithic JSX, unify mobile/desktop shared components, fix header overflow (progressive hide below xl/2xl), polish Level HUD hierarchy. `deriveScenarioProbs` moved to `src/utils/signalDisplay.ts` (re-exported from `App.tsx`).

**Validate:** `npm run lint`; `npm test` (221/221); `npm run audit:ui-synthetic`; Overview corridor visible stacked below chart on md–lg, side-by-side on xl+.

---

## 2026-07-28 — Hugging Face Space deployment

**Files changed**

- Canonical runtime code: no changes were required for this deployment.
- Hugging Face Space `https://huggingface.co/spaces/Really-amin/crypto_learning_system`
  — prior Space content was replaced with a Docker SDK build of this project;
  `app_port` is 7860.
- The Space uses `HOST=0.0.0.0` and `PORT=7860`; `server.ts` already resolves
  `HOST` / `APEX_HOST` and `PORT` from the environment.
- Task 2 adds `src/services/decisionMemoryDatasetSync.ts` for periodic private
  Dataset backup and boot restore of the server-side Decision Memory mirror.

**Purpose:** Keep the scanner running continuously against real KuCoin data so
Decision Memory accumulates real accepted/rejected decisions and resolved
outcomes toward the Phase 0 ML gate (at least 300 resolved accepted rows and at
least 30 minority-class rows). The gate remains mandatory and must not be
weakened or bypassed.

**Validation:** The deployed Space was created from a separate staging checkout;
no canonical runtime-code validation was required for the deployment record
itself. Task 2 validation is recorded in its separate maintenance entry.

**Instruction for future agents:** Do not assume the Space and this canonical
local repository are in sync. The Space is a separate git remote
(`https://huggingface.co/spaces/Really-amin/crypto_learning_system`), pushed from
a local staging checkout, not from this repo directly. If the Space needs a code
update, make the changes here first, validate with `npx tsc --noEmit`,
`npm run build`, and `npm test`, then copy and push the validated state to the
Space checkout.

---

## 2026-07-28 — Decision Memory private Dataset durability backup

**Files changed**

- `src/services/decisionMemoryDatasetSync.ts` — fail-closed private Hugging Face
  Dataset upload/restore service using the shared Decision Memory export payload.
- `server.ts` — restores the Dataset backup before `listen`, then starts an
  unreferenced periodic sync timer when the mirror and Dataset configuration are
  enabled.
- `src/tests/decisionMemoryDatasetSync.test.ts` — unconfigured, empty, upload
  failure, deduplicating restore, and missing-file coverage with mocked Hub I/O.
- `.env.example` — server-only `HF_TOKEN`, `HF_DECISION_MEMORY_REPO`, and bounded
  `HF_DECISION_MEMORY_SYNC_INTERVAL_MS` configuration.
- `package.json`, `package-lock.json` — `@huggingface/hub` dependency.
- `Doc/automation/DECISION_MEMORY_DATA_CONTRACT.md` — backup-only authority and
  failure-behavior contract.

**Validation:** `npx tsc --noEmit` pass; `npm run build` pass; `npm test`
235/235 pass (30 files). `npm run docs:check` remains blocked by the pre-existing
README link to the intentionally absent real export
`Doc/automation/ml_dataset/decision_memory_export_v1.json`; no fake placeholder
was created and the Phase 0 data gate was not bypassed.

**Instruction for future agents:** This sync is a backup/restore mechanism for
the HF Space's ephemeral filesystem only. Browser IndexedDB remains authoritative
per `DECISION_MEMORY_DATA_CONTRACT.md`. Do not read from the HF Dataset as a
primary source in any script under `scripts/`.

---

## 2026-07-29 — Dashboard usability and mobile workspace repair

**Files changed**

- `src/components/CommandCenterPage.tsx` — limited the priority queue to the
  five rows the dashboard renders; removed synthesized fallback charts,
  confidence-derived countdowns, and static event times; corrected the
  decision window label to one hour; made the idle Scanner tile start the
  scanner instead of opening an empty queue.
- `src/components/MobileWorkspaceNav.tsx` — promoted Trading Desk to the
  primary phone navigation, moved Intelligence into More, and added keyboard
  focus containment/restoration to the More dialog.
- `src/components/SettingsPanel.tsx` — replaced the misleading
  `Trade enabled` authentication label with `Exchange authenticated`.
- `src/components/CommandPanel.tsx` — replaced `Live workspace` with the
  truthful `Research workspace` label.
- `src/components/ui.tsx` — made shared section titles semantic headings and
  exposed filter controls as pressed-button groups instead of incomplete tabs.
- `src/App.tsx` — added stable mobile shell/health-banner hooks so the fixed
  status and navigation bars no longer overlap content.
- `src/index.css` — raised muted-text contrast, restored semantic
  ready/positive/negative colors, and added a phone-only normal-flow layout.
  The Command Center now uses two readable KPI columns on phones, normal zoom,
  larger touch targets, and page scrolling. Trading Desk now stacks chart and
  controls in the document flow so safety/environment controls are reachable.
  Desktop Command Center geometry and the paper-only execution boundary are
  unchanged.

**Validation**

- `npm run lint`: pass.
- `npm run build`: pass; Vite, bundled server, and function index completed.
- Playwright with system Edge: HTTP 200 at `1672x941` and `390x844`; no console
  errors or page errors. Desktop stayed exactly viewport-contained. Mobile
  document height expanded to 2599px without horizontal overflow, Trading Desk
  controls scrolled into view, and the More dialog restored focus to its
  trigger after Escape.
- `npm test` with the process environment unchanged: 290/291 passed; the one
  failure is the existing `tests/intelligence.test.ts` assertion that evaluates
  `not.toContain(process.env.HUGGINGFACE_API_TOKEN)` when the variable is
  undefined, which becomes an impossible empty-string assertion.
- `HUGGINGFACE_API_TOKEN=test-placeholder-for-tests npm test`: 291/291 passed
  across 38 files. The placeholder was process-local and contained no secret.

**Browser evidence**

- `_qa/ui-fixed-desktop-1672x941.jpg`
- `_qa/ui-fixed-mobile-command-390x844.jpg`
- `_qa/ui-fixed-mobile-desk-controls-390x844.jpg`

**Instruction for future agents:** Keep scanner start manual, retain Paper as
the default, and do not replace unavailable telemetry with decorative or
synthetic dashboard history. Mobile pages should use one document scrollbar;
do not reintroduce `overflow-hidden` or the desktop `zoom` rule below 768px.

---

## 2026-07-29 — Desktop short-viewport overlap repair

**Files changed**

- `src/index.css` — added a desktop-only `@media (min-width: 1180px) and
  (max-height: 760px)` composition for the short Chrome viewport used by the
  desktop dashboard. The action row now has enough height for its CTA/readout,
  and the Safety/Regime tracks are tall enough for their ring, gates, sparkline,
  and telemetry cells. This does not change the mobile rules or trading logic.

**Validation**

- Exact reproduction at `1368 × 697` with system Edge: no horizontal overflow,
  no console/page errors, action content contained with `0px` overflow, and
  Safety/Regime cards no longer overlap. The Safety content was within a
  sub-pixel border rounding before the final 0.1rem adjustment.
- The supplied capture is `2715 × 1501`, which corresponds to a high-DPI
  desktop capture whose content viewport is the short-height desktop state
  above. The browser-extension “Download video from this page” strip is
  outside the app and can still cover the lowest pixels; it is not generated by
  the dashboard.

**Instruction for future agents:** When reviewing the desktop dashboard, test
both the canonical `1672 × 941` viewport and the short `1368 × 697` viewport.
Do not judge the short-height layout against mobile breakpoints.

---

## 2026-07-29 — Desktop Command Center metric and market-strip refinement

**Files changed**

- `src/components/CommandCenterPage.tsx` — made queue mini-charts line-only;
  added the missing average-confidence ring value; added a desktop-only
  `Most traded · 24h` market strip backed by ranked contract turnover; and
  placed the Timeline navigation CTA inside its card.
- `src/components/ui.tsx` — added the opt-in `area` switch to `Sparkline` so
  queue rows can use compact market-style lines without changing other charts.
- `src/App.tsx` — passes the ranked KuCoin contract feed to the desktop
  Command Center only after its first live response. The phone Command Center
  remains on its prior confidence market strip.
- `src/index.css` — refined desktop KPI alignment, compact colored icons,
  CTA dimensions/placement, queue row density, line treatment, and compact
  turnover tiles. The rules are scoped to desktop Command Center media queries.

**Data and validation**

- The market strip uses `RankedContract.turnover24hUsd`, sorted by the existing
  KuCoin active-contract feed. If that feed has not returned, it shows an
  explicit unavailable state rather than invented chart data.
- `npm run lint`: pass.
- `npx vite build`: pass after the final desktop track adjustment.
- Browser check at `1672 × 941`: no horizontal overflow or browser errors;
  the unavailable state was shown until a live turnover response is available,
  and the Safety/Regime cards were separated with contained telemetry.

---

## 2026-07-29 — Desktop Command Center information hierarchy pass

**Files changed**

- `src/components/CommandCenterPage.tsx` — limits the desktop priority queue
  and top performers to three actionable entries; replaces the turnover strip
  with a scoped Market Pulse built from real watched-futures L/S, taker flow,
  funding, feed, and scanner-breadth data; removes the non-temporal Pressure
  chart and duplicate market-navigation CTAs; and exposes OI expansion versus
  contraction in the Futures Regime card.
- `src/App.tsx` — enables the new Market Pulse only for the desktop Command
  Center; the mobile Command Center retains its prior market strip.
- `src/index.css` — gives the three-row queue a compact desktop grid, allocates
  sufficient space to Futures Regime, and styles the Market Pulse as contained
  information cells rather than chart tiles.

**Data and validation**

- Market Pulse labels `Watchlist breadth` explicitly: it is not presented as
  whole-market breadth. The dashboard does not fabricate Fear & Greed, market
  cap/dominance, or 24-hour winners/losers because those feeds are not present.
- `npx vite build`: pass after the final information-hierarchy change.
- Browser checks at `1672 × 941` and `1368 × 697`: no horizontal overflow or
  browser errors; desktop renders Market Pulse, three queue rows when data is
  available, and no remaining `Pressure` chart.

---

## 2026-07-29 - Desktop header and 3D APEX logo pass

**Files changed**

- `src/components/ApexLogo.tsx` - replaced the flat mark with a dimensional
  shield/portal SVG using per-instance gradients, status light, active sweep,
  and a `compact` versus `header` variant so the large treatment is reserved
  for the desktop header.
- `src/components/DesktopHeader.tsx` - wraps the logo in a dedicated
  `dh-brand-card` and opts into the header logo variant.
- `src/index.css` - gives the desktop header a cooler graphite/violet/cyan
  3D brand zone, larger left logo, stronger APEX PORTAL wordmark, compact
  fallback sizing for non-header logo uses, and a cyan/violet active sweep.

**Validation**

- `npx vite build`: pass.
- Browser QA at `1672 × 941` against `http://127.0.0.1:3000`: no horizontal
  overflow (`scrollWidth` equals viewport width), no console/page errors,
  header height `67px`, brand block `212px × 58px`, and logo mark `49px × 49px`.
- Screenshot captured at `_qa/header-desktop-1672.png` for visual review.

---

## 2026-07-29 - One-shade darker panel/background theme pass

**Files changed**

- `src/index.css` - darkened the workspace graphite/background token ramp by one
  shade, then matched the hand-authored desktop Command Center surfaces:
  desktop header, canonical panels/insets, metric tiles, action hero/readout,
  queue, market pulse, posture, regime, distribution, timeline, performers, and
  risk-band cards.
- `src/App.tsx` - darkened the application root gradient plus mobile and
  desktop workspace shell backgrounds so the whole app sits on a deeper
  graphite/obsidian base.

**Validation**

- `npx vite build`: pass.
- `npm run lint`: pass.
- Browser QA at `1672 × 941` against `http://127.0.0.1:3000`: no horizontal
  overflow, no console/page errors, Command Center visible, metric tile
  `255px × 106px`, queue card `916px × 336px`, posture card `636px × 137px`.
- Screenshot captured at `_qa/theme-darker-desktop-1672.png` for visual review.

---

## 2026-07-29 - Workspace 20% zoom-out adjustment

**Files changed**

- `src/index.css` - reduced the shared workspace zoom from `0.88` to `0.8`
  across the desktop workspace page shells so the pages sit at the requested
  20% zoom-out without changing their background colors.

**Validation**

- `npm run lint`: pass.
- `npx vite build`: pass.

---

## 2026-07-29 - Secondary workspace shells recolored to cool brand tones

**Files changed**

- `src/index.css` - retinted the non-overview workspace shells and related
  overlays away from crimson toward graphite/cyan/violet: Markets, Tracking,
  Signals, Trading Desk, the shared workspace page shells, the signal detail
  inspector, watchlist focus glow, and the glass accent surface.

**Validation**

- `npm run lint`: pass.
- `npx vite build`: pass.
- Browser QA at `1672 × 941` against `http://127.0.0.1:3000`: no horizontal
  overflow, no console/page errors, Signals page shell rendered with the new
  cool theme.
- Screenshot captured at `_qa/signals-cool-theme-1672-v3.png` for review.


## 2026-08-10 — Comprehensive architecture/index/security audit

**Changed documentation:** `Doc/architecture/Refrence.md`, `Doc/README.md`, `Doc/repository/PROJECT_STRUCTURE_2026-08-10.*`, `Doc/repository/FILE_INDEX_2026-08-10.*`, `Doc/repository/API_ROUTE_INDEX_2026-08-10.*`, `Doc/reports/final/APEX_COMPREHENSIVE_PROJECT_AUDIT_2026-08-10.md`, and regenerated `Doc/DOCUMENTATION_INDEX.*`.

**Reason:** establish a current agent-navigation baseline, full file/API indexes, architecture map, verification matrix and deficiency register after Strategy Studio + Smart Autopilot integration.

**Validation:** project-native source/runtime gates passed for Multi-Agent/Multi-Trading, Smart Autopilot, Strategy Studio, Backtesting, optimization, maximal-merge safety and unified safety. Test inventory is 82 files / 313 tests. The baseline source secret gate failed on three local config files; those files were removed from the audited delivery and the gate then passed.

**Known limitation:** fresh dependency install/build/full Vitest/browser validation was not reproduced in the audit sandbox because the internal registry mirror did not provide the locked Vitest artifact.

**Future-agent instruction:** start with the 2026-08-10 structure/file/API indexes and this refresh block. Treat the old `App.tsx` multi-thousand-line ranges as historical until the function atlas is regenerated.
