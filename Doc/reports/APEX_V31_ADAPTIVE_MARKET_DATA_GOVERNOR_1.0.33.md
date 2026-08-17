# APEX V31 — Adaptive Market-Data Governor 1.0.33

## Problem reproduced from runtime logs
The previous global FIFO governor allowed background scanner and provider-fallback requests to consume all shared slots. This produced repeated states such as:

- `active=4 waiting=60`
- `queue_full`
- `queue_timeout` after roughly 15 seconds
- repeated Binance and KuCoin timeout warnings
- historical backtest requests waiting behind scanner OHLCV work
- repeated calls to providers that were already failing

Increasing only `PROXY_MAX_CONCURRENCY` or `PROXY_MAX_QUEUE` delayed the failure but did not remove the priority inversion or request storm.

## Changes

### 1. Priority-aware governor
`src/services/proxyFetch.ts` now uses three traffic classes:

- `critical`: historical backtests and execution-sensitive requests
- `interactive`: chart candles, order books, and user-facing refreshes
- `background`: scanner enrichment, bulk ticker/funding, open interest, and HF fallback discovery

Interactive capacity is reserved so background scanning cannot occupy every slot. Background traffic has a separate concurrency ceiling and a small queue. Excess background requests are shed immediately as `backpressure` instead of sitting in a 60-item queue for 15 seconds.

### 2. Whole-request deadline
Queue time is now included in the request timeout budget. A request can no longer wait for the queue timeout and then receive a second full network timeout.

### 3. Provider circuit breaker
Repeated transport failures or invalid JSON open a short provider-group circuit. While the circuit is open, redundant calls are skipped. Critical requests receive controlled probe opportunities.

### 4. Verified stale-cache fallback
When a provider is temporarily unavailable, a recently successful response may be served inside a short grace window. The response is explicitly marked `stale` and downstream market state is changed to `degraded`; it is not presented as fresh live data.

### 5. Reduced request fan-out
- Binance open-interest enrichment was reduced from 40 parallel calls to a maximum of 16 calls with concurrency 3.
- Candidate enrichment is processed with symbol concurrency 3 instead of an unbounded `Promise.all`.
- Correlation candle loading is also bounded to concurrency 3.
- The normal UI candidate refresh now uses `includeShadow=0`; shadow enrichment remains available when explicitly requested.
- Candidate responses are cached briefly to prevent repeated full scans.

### 6. Explicit traffic classification
Priority is propagated through:

- `exchangeClient.ts`
- `marketDataService.ts`
- `hfSpacesClient.ts`
- `apexNextMarketRoutes.ts`

Historical replay traffic is critical, chart traffic is interactive, and scanner/bulk provider work is background.

## New default controls

```env
PROXY_MAX_CONCURRENCY=6
PROXY_RESERVED_INTERACTIVE=2
PROXY_BACKGROUND_CONCURRENCY=4
PROXY_MAX_QUEUE=80
PROXY_BACKGROUND_MAX_QUEUE=12
PROXY_QUEUE_TIMEOUT_CRITICAL_MS=8000
PROXY_QUEUE_TIMEOUT_INTERACTIVE_MS=5000
PROXY_QUEUE_TIMEOUT_BACKGROUND_MS=1250
CACHE_STALE_GRACE_MS=45000
UPSTREAM_CIRCUIT_FAILURE_THRESHOLD=3
UPSTREAM_CIRCUIT_BASE_MS=20000
UPSTREAM_CIRCUIT_MAX_MS=120000
```

The legacy `PROXY_QUEUE_TIMEOUT_MS` is intentionally ignored by the new priority governor.

## Validation

- TypeScript syntax/transpile validation: 6 changed TS/TSX files passed.
- Adaptive governor runtime QA:
  - critical reservation: passed
  - background backpressure: passed
  - circuit breaker: passed
  - stale-cache fallback: passed
  - critical request completed in approximately 81 ms while background work was saturated
- System integration QA: 12/12 passed.
- Reference UI QA: 24/24 passed.
- Source secret gate: passed.

The adaptive governor runtime test is included at:

`QA/adaptive-governor/VALIDATION_RESULT.json`
