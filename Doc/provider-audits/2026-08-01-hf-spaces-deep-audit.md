# Hugging Face Spaces deep provider audit — 2026-08-01

## Decision

Binance USD-M and KuCoin Futures remain APEX's primary market-data providers.
Neither Hugging Face Space is an independent exchange source:

- `Datasourceforcryptocurrency-4` is a useful alternate transport/gateway. Its
  Short Hunter path currently selects KuCoin Futures first, then Binance, then
  non-exchange providers where the capability allows it.
- `Datasourceforcryptocurrency-2` is a large, mixed-quality aggregation app.
  It contains useful real-data endpoints, broken endpoints, misleading
  `success:true` empty responses, simplified indicators, and explicitly
  generated social/event data. It must be consumed through a strict allowlist,
  never as a generally trusted provider.

## Audited deployments

| Space | Hub revision | Last modified | Runtime | OpenAPI paths |
|---|---|---:|---|---:|
| `Datasourceforcryptocurrency-4` | `20e4c4c583007c0866ce9a1a41ddf2033322c8a9` | 2026-07-21 | Docker, CPU Basic, RUNNING | 107 |
| `Datasourceforcryptocurrency-2` | `b200b6057a4021a52e2d4c04ba24a15a90f0faa5` | 2026-06-07 | Docker, CPU Basic, RUNNING | 329 |

The Space-4 Docker entrypoint is `api_server_extended:app`. Space-2 starts
`hf_unified_server:app`. Both use one Uvicorn worker.

## Space-4 live results

### Approved uses

| Capability | Live result | Decision |
|---|---|---|
| OHLCV `1m/5m/15m` | Correct 60s/300s/900s cadence, real KuCoin futures candles | Approved tertiary fallback with cadence/freshness validation |
| Order book | Real `[price, size]` arrays; 20+20 by default and 100+100 with `limit=100` | Approved for OBI/microprice fallback; not yet for USD depth without contract multiplier |
| Funding current | Matches KuCoin current funding exactly | Approved current-value enrichment only |
| Open interest current | Matched KuCoin within ~0.03% in the earlier direct cross-check | Approved current contracts value only; history absent |
| Indicators | Calculated from the same real OHLCV; implementation is materially better than Space-2 | Optional only; APEX should normally calculate locally |
| Fear & Greed | Alternative.me public data | Approved optional enrichment |

### Latency and load

Controlled warm rounds, 30 seconds apart:

| Endpoint | Round 1 | Round 2 |
|---|---:|---:|
| Space-4 BTC order book | 1.356 s | 1.235 s |
| Space-4 BTC 1m OHLCV | 1.301 s | 1.247 s |
| Space-4 BTC 5m OHLCV | 1.309 s | 1.252 s |
| Space-4 BTC 15m OHLCV | 1.307 s | 1.243 s |

Earlier cold/wake probe evidence:

- order book: about 5.2 s cold vs about 1.1 s warm;
- full snapshot: about 8.1 s cold vs about 3.5 s warm.

A bounded 10-request concurrency probe (order book + 1m OHLCV for BTC, ETH,
SOL, XRP, DOGE) completed in 2.794 s wall time. All 10 returned HTTP 200,
`LIVE`, `REAL`, KuCoin data. DOGE returned 24 candles rather than 30 because
the exchange series had gaps; this is acceptable only when the consumer
validates cadence and minimum sample count.

The 3-symbol batch snapshot took 7.736 s and returned about 269 KB. The batch
implementation processes symbols sequentially, so it is not suitable for the
6-second scanner cycle.

### Important schema/semantic limitations

- `freshnessMs` is provider request latency, not candle age.
- The router's `fallbackUsed` is misleading for locally calculated indicators:
  it compares `indicator_engine` to the upstream KuCoin attempt.
- The KuCoin funding adapter maps `timePoint` into `nextFundingTime`; KuCoin's
  actual next settlement time is a different field/time. Do not schedule from
  this Space field.
- Funding history rows have null timestamps in the observed payload.
- Open-interest history is empty. APEX must maintain its own time series before
  calculating OI change.
- KuCoin order-book size is contract count. For USD depth use
  `price * size * contractMultiplier`; BTC's observed multiplier was `0.001`.
  OBI ratios are safe without the multiplier because it cancels within a book.

## Space-2 live results

### Allowlist

| Endpoint | Evidence | Allowed role |
|---|---|---|
| `/api/resources/news/latest` | Five current articles; valid CryptoSlate, Decrypt and Cointelegraph URLs; ~1.29–1.90 s warm | News enrichment/fallback |
| `/api/resources/sentiment/fear-greed` | Current Alternative.me value and timestamp | Sentiment enrichment |
| `/api/market/top` or `/api/coins/top` | Real CoinGecko top-market rows | Degraded spot-market discovery/UI only, never futures execution/scoring truth |
| `/api/trading/ohlcv/{symbol}?exchange=binance` | Real 1m Binance candles; correct cadence | Emergency alternate transport only; 1.6 s warm and up to 16.4 s cold observed |
| `/api/trading/orderbook/{symbol}?exchange=binance` | Real 20+20 Binance depth | Emergency alternate transport only; duplicates the primary provider |
| `/api/trading/volume` | Real Binance 24h quote volume | Optional enrichment only |
| `/api/resources/onchain/gas` | Returned a live-looking RPC-derived value | Not approved until independently cross-checked for chain/unit correctness |

### Denylist and observed failures

| Endpoint/capability | Observation | Decision |
|---|---|---|
| `/api/new-sources/crypto-dt-source/klines?...interval=1m` | Returned 30 candles spaced 3,600,000 ms and still reported success | Reject |
| `/api/new-sources/prices/unified` | `success:false`, upstream HTTP 503 | Reject as current fallback |
| `/api/multi-source/prices` | `success:true` with `prices:[]` and `No specific handler` | Reject |
| `/api/multi-source/ohlc/BTC` | `success:true` with zero candles | Reject |
| `/api/ohlcv/BTC` | `success:false`, data unavailable | Reject |
| KuCoin trading OHLCV/order book routes | HTTP 500 (`Unsupported trading pair` / `NoneType`) for `BTCUSDT` | Reject |
| `/api/indicators/{coin}` MACD/EMA | Source uses last price vs price 26 bars ago and `signal=macd*0.9`; EMA is also simplified | Reject MACD/EMA; calculate locally |
| `/api/correlations` | Correlates price levels, not returns | Reject for trading signal/statistical inference |
| `/api/social/trending` | Generated placeholder/random data despite claiming Twitter/Reddit/Telegram/Discord | Hard reject |
| `/api/social/sentiment` | Generated random scores, counts and canned influencer handles | Hard reject |
| `/api/events` | Generated events with `example.com` URLs | Hard reject |
| `/api/service/whales` | Empty with `NO_WHALE_DATA` | Unavailable, not a fallback |
| `/api/new-sources/crypto-dt-source/news` | HTTP success but empty RSS data in the tested CoinDesk call | Do not prefer over `/api/resources/news/latest` |

Space-2's `/api/health` only proves that the FastAPI process is running. During
the audit it said `healthy` while `/api/new-sources/status` reported degraded
upstreams and several data routes were empty or broken. Provider-level and
payload-level validation is mandatory.

Space-2 also exposes mutation/order-looking APIs. APEX integration must use a
hard GET-only allowlist and must never proxy its POST/DELETE trading, worker,
cache-clear, import, model, watchlist, or order endpoints.

## APEX integration applied

`src/services/marketDataService.ts` now uses the verified Space-4 Short Hunter
OHLCV route as the third-tier candle fallback:

1. Binance USD-M Futures
2. KuCoin Futures
3. Space-4 `/api/short-hunter/ohlcv/{symbol}`

The parser rejects:

- false/unavailable/no-trade envelopes;
- stale Space cache older than 60 seconds;
- malformed OHLCV;
- mislabeled timeframe cadence (including Space-2's observed 1h-as-1m fault);
- stale or implausibly future timestamps.

Fallback candles remain `dataState: degraded`; they never become primary/live
exchange truth in APEX.

The approved implementation is now complete:

- `src/services/hfSpacesClient.ts` is the shared fail-closed client for both
  Spaces, with request timeouts, short-lived caches, failure cooldowns, payload
  validation and explicit Space-2/Space-4 source labels.
- live order books now route Binance -> KuCoin -> Space-4. Binance sizes are
  base quantities; KuCoin direct depth is normalized with the contract metadata
  multiplier. Space-4 contract counts keep `volumeUnit: contracts_unknown`, USD
  depth remains zero, and the result stays degraded/no-trade instead of being
  guessed.
- candidate and symbol routes no longer use fabricated depth. The symbol route
  exposes real OBI, micro-price, spread and multi-timeframe directional QStruct.
- Space-2's hard-coded `/api/market` fallback was removed. Its allowlist is now
  limited to verified 1h historical candles, DeFi protocols/yields, sentiment,
  news and fear/greed enrichment.
- synthetic institutional tickers and generated fallback candles were removed
  from the market route failure path. Complete provider failure now returns an
  empty/unavailable or guarded response.
- local proxy routes were added under `/api/hf-space/short-hunter/*` and
  `/api/hf-space/intel/*`; Binance and KuCoin remain the primary live sources.

## Verification

- Focused Vitest: 9/9 passed.
- Full configured Vitest run: 17 tests passed; one pre-existing suite failed to
  import the missing `src/components/TrackingObservatoryPanel` module.
- Production build: passed (Vite + bundled server + function index).
- Repository-wide `tsc --noEmit`: still fails on pre-existing missing modules,
  missing `SignalDecisionLog` exports, D3 typings, and other unrelated files.
  No new TypeScript error from this change appeared in that output.
- Runtime at `127.0.0.1:3000`: primary market source `binance`; BTC order-book
  metrics were live and candidate scanning returned HTTP 200. Forced provider
  failure tests selected Space-4 for tickers/order books and Space-2 for closed
  1h history, all marked degraded as designed.

## Evidence links

- Space-4 OpenAPI: <https://really-amin-datasourceforcryptocurrency-4.hf.space/openapi.json>
- Space-2 OpenAPI: <https://really-amin-datasourceforcryptocurrency-2.hf.space/openapi.json>
- Space-4 Hub: <https://huggingface.co/spaces/Really-amin/Datasourceforcryptocurrency-4>
- Space-2 Hub: <https://huggingface.co/spaces/Really-amin/Datasourceforcryptocurrency-2>
- Earlier unmodified BTC raw captures: `Doc/provider-audits/2026-08-01-hf-space4-btc/`
