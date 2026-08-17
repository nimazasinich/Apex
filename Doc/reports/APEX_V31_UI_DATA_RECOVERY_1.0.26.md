# APEX V31 UI and Market-Data Recovery Report — 1.0.26

## Scope

This recovery corrects regressions visible in the supplied runtime screenshots after the 1.0.25 lightweight delivery. It does not replace the active page modules or fabricate market/account values.

## Confirmed causes

### 1. Workspace page styles were present but never loaded

`src/styles/v3-workspace.css` contains the active styling for Settings, Help, History, Alerts and Watchlist, but it was not imported by the browser entry point. Those pages therefore rendered as nearly raw document flow even though their TSX structure was intact.

### 2. Loading the stylesheet after the active shell would create a second regression

The stylesheet also contains legacy shell rules. It is now imported **before** `src/index.css`, so its page-specific classes are available while the current shell and Reference UI rules retain cascade authority.

### 3. Backtesting controls exceeded the setup-column width

Starting Capital, Direction and the three Risk Profile options were placed in one narrow row. The setup grid now uses two rows: capital/direction on the first row and Risk Profile across the second row, with a single-column responsive fallback.

### 4. Local proxy configuration disappeared with the secret-safe `.env` removal

The earlier local runtime relied on a loopback SOCKS5 route at `127.0.0.1:10808`. Release hardening correctly removed populated `.env` files, but the non-secret proxy behavior was lost with them. Direct Binance/KuCoin requests then exhausted their short timeout budgets on restricted networks.

## Applied fixes

- Loaded `v3-workspace.css` before the active `index.css` cascade.
- Preserved the current Portfolio, Orders, Positions and Analytics Reference UI layouts.
- Added collision-free Backtesting setup areas for capital, direction and risk profile.
- Defaulted server-side proxy routing to safe local auto mode.
- Auto-probed `socks5://127.0.0.1:10808` when no explicit proxy is configured.
- Added `APEX_AUTO_LOCAL_PROXY_SCHEME=socks5|http|both` and port controls.
- Kept direct transport available when the local listener is absent.
- Increased public bulk/candle provider budgets to realistic, bounded and configurable values:
  - `MARKET_BULK_TIMEOUT_MS=8000`
  - `MARKET_CANDLE_TIMEOUT_MS=9000`
- Kept all unavailable/degraded states honest; no synthetic market data was added.
- Added regression checks for stylesheet ordering, page-class coverage, Backtesting geometry, local SOCKS recovery and provider timeout configuration.

## Verification performed

- Backtesting workspace QA: 21/21
- Strategy Library QA: passed
- Strategy Engines smoke QA: passed
- Strategy Integration QA: passed
- Consolidation QA: 15/15
- Reference UI regression QA: 20/20
- Source release/secret gate: passed
- JavaScript/MJS syntax checking: passed
- TypeScript/TSX syntax parse: 213 files passed
- CSS parse: 13 files passed

## Verification boundary

A full browser screenshot run and production build were not executed in this environment because the dependency registry/browser runtime was unavailable. The delivered source must still be run on the target Windows system with its normal dependency tree. Market-data success additionally depends on an actually running local proxy or unrestricted direct network access.

## Windows runtime guidance

For the previously used local SOCKS endpoint, no populated `.env` is required. The default is now:

```text
APEX_AUTO_LOCAL_PROXY=true
APEX_AUTO_LOCAL_PROXY_PORT=10808
APEX_AUTO_LOCAL_PROXY_SCHEME=socks5
PROXY_MODE=auto
```

For an HTTP CONNECT listener instead:

```text
APEX_AUTO_LOCAL_PROXY_SCHEME=http
```

To disable local probing and use direct transport only:

```text
APEX_AUTO_LOCAL_PROXY=false
```
