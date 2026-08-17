# Market Data Recovery — V19

## Browser request model

## Development server topology

- Preferred: `npm run dev` runs Express and Vite middleware on the same origin.
- Standalone Vite: `/api` is proxied to `APEX_API_ORIGIN`, defaulting to `http://127.0.0.1:3000`. The backend must already be running.
- Do not use a standalone `npx vite` session without either the backend or the configured proxy target.


The frontend runs three independent synchronization paths:

1. **Ticker universe** — every 12 seconds.
2. **Sentiment and candidate intelligence** — every 30 seconds.
3. **Selected symbol candles** — on symbol, interval, retry or Overview/Trading context change.

Each path has its own loading/error state. A slow candidate scan can no longer block the ticker strip or selected chart.

## Backend provider chain

### Tickers

1. Binance USDⓈ-M futures
2. KuCoin futures
3. Verified HF Space crypto allowlist fallback

### Candles

1. Binance futures klines
2. KuCoin futures klines
3. Verified Space-4 OHLCV
4. Verified Space-2 1-hour history only
5. Last verified in-memory snapshot, if fresh enough

## API behavior

### `GET /api/market/top-volume?limit=80`

Returns the display universe quickly from the shared cached provider snapshot.

### `GET /api/market/symbol/:symbol`

Supported query fields:

- `interval`: `1m | 5m | 15m | 1h | 4h | 1d`
- `limit`: 30–300
- `includeMicrostructure`: `0 | 1`

Overview uses `includeMicrostructure=0` to prioritize chart availability. Trading uses `includeMicrostructure=1` to obtain order-book, spread, OBI, micro-price and multi-timeframe structure.

The response includes:

```json
{
  "candles": [],
  "candleFeed": {
    "source": "binance | kucoin | hf_space_4 | hf_space_2 | none",
    "dataState": "live | degraded | unavailable",
    "stale": false,
    "ageMs": 0,
    "error": null
  }
}
```

## Failure policy

- Never generate synthetic candles.
- Keep ticker prices visible when candles fail.
- Expose source and data state to the UI.
- Permit a Retry action.
- Serve a recent verified snapshot only within `APEX_MAX_STALE_CANDLE_AGE_MS`.
- Do not let an intelligence scan monopolize provider capacity.
