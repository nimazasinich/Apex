# CP28 HF2 — Binance / Smart Proxy recovery

## Problem reproduced from source inspection

The CP28 transport could report Binance unavailable both direct and through a local SOCKS proxy for two independent reasons:

1. SOCKS shorthand and `socks5://` routes used local DNS. When the workstation resolver cannot resolve or filters `fapi.binance.com`, the SOCKS request fails before the proxy can resolve the hostname. The proxy therefore looks broken even when its tunnel is healthy.
2. `/api/market/top-volume` gave the canonical Futures chain 6.5 seconds, while Binance ticker construction waited on a fan-out of per-symbol open-interest calls. Missing that window pushed the route into a sequential public-reference chain that could exceed the browser's 22-second timeout.

## HF2 changes

- SOCKS routes now normalize to `socks5h://` so DNS resolution happens through the proxy.
- Auto-discovered local SOCKS routes also use `socks5h://`.
- Transport diagnostics preserve top-level and nested network error codes/host/address details.
- The fixed Binance diagnostic probe now uses `/fapi/v1/time`.
- Binance ticker OI enrichment has a bounded aggregate budget. Completed OI values are kept; unfinished values are `NaN` (unavailable), never fabricated as zero.
- Missing Binance funding is also `NaN`, not a synthetic zero.
- `/api/market/top-volume` now bounds the reference-provider wait to 7 seconds after the existing 6.5-second Futures-first window, keeping the server response inside the browser's 22-second bootstrap timeout.
- Proxy diagnostics show the actual transport error string in the provider row instead of only `Failed`.

## Verification executed in this environment

- TypeScript syntax transpile check on all HF2-touched TS/TSX files: PASS (7/7).
- `node scripts/qa/verifyReferenceUiRedesign.mjs`: PASS (24/24).
- Targeted HF2 static contract checks: PASS.
- `scripts/qa/verifyMarket503ReferenceRecovery.mjs` still has one pre-existing stale assertion: it looks for provider-health projection strings in `apexNextMarketRoutes.ts`, while those strings now live in `systemHealthTelemetry.ts`. The underlying provider-health implementation is present; this QA script was already out of sync and was not rewritten merely to make the suite green.

## Not claimed

No real Binance/KuCoin upstream connectivity can be proven from this execution environment. Final Windows verification must include direct, Manual SOCKS5H, Manual HTTP CONNECT, and Auto-mode provider probes on the target machine.
