**Remaining tasks — APEX UI polish (detailed)**

---

**1. Drawer panel content overflow (right icon rail → Scanner / Watchlist / Movers / Signals)**

- `.apex-drawer-body` (`src/index.css`) is still set to `overflow: hidden !important`, same force-fit pattern I fixed for the order ticket — but I did **not** touch this one yet.
- Concrete overflow risk found in `src/components/workspace/ToolboxDrawers.tsx`:
  - `WatchlistDrawer` (line ~96) renders up to **20 rows** (`.slice(0, 20)`) using `.apex-watchlist-row`, which is 23–34px tall depending on breakpoint → 20 rows can need up to ~680px of vertical space.
  - The scanner/candidates table (line ~138) renders up to **10 rows** (`.slice(0, 10)`) at `.apex-drawer-table-row` min-height 28–30px, plus a head row and a meta/footer row.
  - On a 900px-tall viewport the drawer body has roughly 650–750px available (`.apex-drawer` runs from `top: 68px` to `bottom: 0`), so the 20-row watchlist case is borderline-to-clipped; on a 768px laptop screen it will clip for sure, and clipped content is invisible with `overflow:hidden` — no scrollbar hint, no indication more rows exist.
- Fix options to weigh:
  - **(a)** Same fix as the order ticket: switch `.apex-drawer-body` to `overflow-y: auto` with the shared thin scrollbar treatment (`scrollbar-width: thin; scrollbar-color: #cbd5df transparent; scroll-behavior: smooth;`). Lowest risk, consistent with the pattern already applied.
  - **(b)** Reduce `.slice(0, 20)` → `.slice(0, 8–10)` in `WatchlistDrawer` so it always fits without scroll, at the cost of showing fewer symbols.
  - Recommendation: (a), because trading terminals expect a scrollable watchlist rather than an artificially truncated one.
- Also check `.apex-scanner-rows { flex: 1; min-height: 0; }` (line ~5341 area) — this already has `flex:1/min-height:0`, which is the correct setup *for* scrolling, suggesting the intent was scrollable and `overflow:hidden !important` on the parent is what's actually blocking it. Worth confirming this is the real root cause before changing anything.

---

**2. Order ticket — functional QA beyond CSS (I only changed sizing/scroll, not behavior)**

- **End-to-end order flow**: `review()` → `previewOrder(draft)` → confirmation-phrase input → `submit()` → `submitLiveOrder(preview.id, confirmation)` in `AccountViews.tsx` (lines ~430–450). This calls real service functions (`marketDataService`/`exchangeClient`/`accountClient` presumably) that I have not exercised — needs a live or demo KuCoin connection to confirm the preview→confirm→submit round-trip still works after the layout changes (should be unaffected since I didn't touch JSX/logic, but worth a real click-through).
- **`FormattedNumberInput` at the new 32px height** (was 29px): confirm the stepper buttons (`.apex-number-steppers button`, 18×18px, unchanged) still vertically center correctly inside the taller input, and that the suffix label (`.apex-number-suffix`, font bumped 6.2px→7.5px) doesn't wrap or overlap the input value at narrow widths.
- **Allocation slider sync**: `applyAllocation(percentage)` sets `--allocation` as an inline style var consumed by the CSS gradient track (`.apex-allocation-control > input`, line ~3210: `linear-gradient(90deg, #2fc14a 0 var(--allocation, 0%), ...)`). I changed the 0/25/50/75/100% buttons' `min-height` from 18px→22px and font 6.5px→8px but didn't touch the slider track itself — should still work, but worth a visual click-through to confirm the % buttons and the track stay vertically aligned as a group now that they're slightly taller.
- **Advanced options accordion**: `apex-advanced-options` uses `animation: apex-v9-accordion .18s var(--apex-ease) both;` — untouched, but now sits inside a scrollable panel (Overview context) instead of a clipped one, so confirm the accordion opening doesn't cause a jarring scroll-jump when it pushes content below the fold.
- **Locked-state / demo vs live toggle**: `.apex-ticket-lock` and the `LOCKED`/`DEMO`/`LIVE` badge — not touched, but re-verify readability now that surrounding label font sizes changed (8.5px vs the old 7.2px) — check nothing looks visually mismatched next to the badge which uses a different, larger font.

---

**3. Cross-page consistency sweep — same duplication pattern likely exists elsewhere**

I only consolidated `.apex-metric-card` (8 redefinitions) and `.apex-order-ticket` (~25 redefinitions) into shared CSS custom properties. Grep counts show these are **not the only offenders**:

| Selector family | Occurrences in `src/index.css` |
|---|---|
| `.apex-watchlist-row` | 54 |
| `.apex-table` | 49 |
| `.apex-panel` | 30 |

- `.apex-watchlist-row` in particular is suspicious given it appears in both the main sidebar watchlist and the drawer's `WatchlistDrawer` — same risk of one page's compact override silently winning globally over another page's roomier one, exactly like the order-ticket bug I found.
- Recommended approach: repeat the same method — for each family, dump every top-level rule with its enclosing `@media` context (I used a small Python brace-depth script for this), identify which declarations are unconditional (`GLOBAL`) vs legitimately breakpoint-scoped, and collapse the unconditional duplicates into shared tokens the way I did for `--metric-card-*` and the order-ticket sizing.

- **Remaining illegible-text audit**: after my fixes, there are still ~17 places under 7px font-size app-wide (outside the order ticket/risk overview I already fixed), including:
  - `.apex-risk-donut span` (lines 1114, 2637) — 6.5px, appears twice (duplicate definition, same bug pattern)
  - `.apex-tier-pill` (line 2737) — 6.8px
  - `.apex-market-table-panel .symbol-cell small` (line 3142) — 6.8px
  - `.apex-watchlist-symbol-wrap > small` (line 4983) — 5.5px (smallest one left in the file)
  - `.apex-live-setups > div small` (line 5514) — 6.5px
  - `.apex-portfolio-chart-foot` (line 5545) — 6.8px
  - `.apex-summary-metrics span` (line 5601) — 5.8px
  - `.apex-depth-price span` / `.apex-depth-axis` (lines 5627, 5656) — 6.5px each
  - `.apex-market-facts span` (line 6319) — 6.2px, marked `!important`
  
  These weren't in scope for "the right sidebar" so I left them, but they're the same class of legibility issue and worth the same treatment if the goal is app-wide polish.

---

**4. Coin icon reliability — deeper fixes beyond the CDN/timeout patch**

- **Expand the local bundle**: `LOCAL_ICON_ASSETS` in `src/lib/marketPresentation.ts` only covers 11 symbols (`ada, avax, bnb, btc, doge, dot, eth, link, matic, sol, xrp`) sourced from `public/crypto-icons/*.png` (32×32 PNGs pinned from `spothq/cryptocurrency-icons` per the folder's `README.md`). Every other traded pair depends entirely on the 3 remaining external CDN hops at runtime. If the trading universe includes commonly-scanned coins outside this list (which it almost certainly does, given `TopVolumeTable`, `CandidatesCard`, scanner results, etc.), most icons on the platform are still network-dependent. This needs actual new icon binary assets added to `public/crypto-icons/` — I didn't do this because I can't source verified brand-icon files through my available tools in this session.
- **Shared load-result cache**: right now every `<CoinIcon symbol="BTC" />` instance (one in the watchlist, one in the market strip, one in the drawer, etc.) independently runs its own source cascade and its own 2.8s timeout — there's no shared memory of "BTC already resolved to source index 1" between mounted instances. A simple module-level `Map<string, number>` (symbol → working source index) read/written in `CoinIcon.tsx` would let the second and subsequent instances of the same symbol skip straight to the known-good source instead of re-running the fallback chain (and re-triggering a redundant network request that the browser may or may not have cached, depending on cache headers from `cdn.jsdelivr.net` / `static.coinstats.app`).
- **No verification the 3 remaining CDNs are actually reachable from the deployed environment.** I could not test `cdn.jsdelivr.net` or `static.coinstats.app` from this sandbox (network egress here is restricted to a fixed allow-list that doesn't include either domain), and my `web_fetch` tool refused to probe them directly (it only fetches URLs that already appeared in a prior search result). Given your infrastructure work is specifically around VPN/proxy access from Iran, it's worth explicitly confirming these two domains resolve and load quickly from your actual user base's network path — if they're throttled or blocked there, the timeout fix will mask it (fallback to the letter-badge) but every icon will take the full 2.8s to give up first, which will feel slow even though it "works."

---

**5. Build verification — I could not run a real build**

- `npm install` failed immediately in this sandbox:
  ```
  npm error enoent ENOENT: no such file or directory, open '/home/claude/work/project/vendor/yallist-3.1.1.tgz'
  ```
  The project references a local vendored tarball dependency (`vendor/yallist-3.1.1.tgz`) that wasn't present in the zip you uploaded (or wasn't included in `APEX-ui-merged-v11-complete.zip`). This means I could not run `npm run build`, `npm run lint` (`tsc --noEmit`), or `npm test` (`vitest run`) at all — every check I did was static (brace-balance counting, a `tinycss2` CSS parse, manual read-through of the two TSX/TS diffs).
- Please run, in your actual environment:
  - `npm install` (confirm the vendor tarball resolves there)
  - `npm run lint` — TypeScript compile check, would catch anything wrong in `CoinIcon.tsx`'s new `useRef`/timeout logic
  - `npm run build` — full Vite + Tailwind v4 build, would catch any CSS custom-property or `color-mix()` compatibility issues in the target browsers
  - `npm run test` — the existing Vitest suite (129/129 baseline per your project notes) to confirm nothing broke functionally

---

**6. Accessibility / reduced-motion pass — needs a real interaction check, not just a read-through**

- The `prefers-reduced-motion: reduce` block I added at the end of `src/index.css` uses a broad `*, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }`. This is a common pattern but it's blunt — it will also flatten:
  - The coin-icon loading shimmer (`apex-icon-shimmer` keyframes) to effectively instant, which is fine.
  - Price-flash / flicker indicators if any exist elsewhere in the app (I did not specifically search for a "price tick flash" animation — worth checking `PriceChart.tsx` / `TopVolumeTable.tsx` for anything like `.flash-up` / `.flash-down` classes that rely on a *visible* transition to communicate a live price change; killing that transition entirely could make the app feel like updates aren't happening for reduced-motion users, even though data is still updating).
- Recommend: grep for `@keyframes` and `transition` inside any price/ticker-flash related classes, and decide per-case whether reduced-motion should shorten the animation (still visible, just faster) vs. fully disable it — rather than the current one-size-fits-all `.001ms` override.