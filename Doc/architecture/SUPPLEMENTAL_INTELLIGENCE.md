# APEX Supplemental Intelligence System

## Overview

The APEX Trading Engine now includes real-world supplemental intelligence layers that augment core exchange market data with:

- **News**: Crypto news feeds from NewsAPI, CryptoCompare
- **Sentiment**: Market sentiment analysis via Hugging Face NLP models
- **On-Chain**: Whale transfers and exchange movements from Etherscan, TronScan

## Architecture

### Type System

All supplemental results follow a normalized shape:

```typescript
type SupplementalDataSource = 'live' | 'degraded' | 'unavailable' | 'not_configured';

interface SupplementalResult {
  category: 'news' | 'sentiment' | 'onchain';
  provider: string;
  symbol: string;
  data: unknown; // Type-specific data
  source: SupplementalDataSource;
  status: string;
  reason?: string;
  latencyMs: number;
  updatedAt: string;
}
```

### Providers

#### News Providers

- **NewsAPI** (`NEWSAPI_KEY`)
  - Free tier: 100 requests/day
  - Requires API key from https://newsapi.org/
  - Returns recent crypto news articles

- **CryptoCompare** (`CRYPTOCOMPARE_KEY`)
  - Free tier available
  - API key from https://www.cryptocompare.com/
  - Specialized crypto news feed

#### Sentiment Providers

- **HuggingFace** (`HUGGING_FACE_TOKEN`)
  - Free tier with inference API
  - Token from https://huggingface.co/
  - Uses `distilbert-base-uncased-finetuned-sst-2-english` model
  - Returns sentiment score (-1 to +1)

#### On-Chain Providers

- **Etherscan** (`ETHERSCAN_KEY`)
  - Free tier available
  - API key from https://etherscan.io/
  - Tracks Ethereum token transfers, whale movements

- **TronScan** (`TRONSCAN_KEY`)
  - Optional, for Tron network USDT tracking
  - Configured via environment variable

### Orchestrator

The `SupplementalOrchestrator` coordinates all providers:

```typescript
const orchestrator = getSupplementalOrchestrator();

// Fetch individual intelligence types
const news = await orchestrator.fetchNews('BTCUSDT');
const sentiment = await orchestrator.fetchSentiment('BTCUSDT');
const onchain = await orchestrator.fetchOnChain('ETHUSDT');

// Or fetch all in parallel
const all = await orchestrator.fetchAll('BTCUSDT');
// Returns { news, sentiment, onchain }
```

Features:
- **Graceful Fallbacks**: If a provider is unconfigured, returns `NOT_CONFIGURED` status
- **Caching**: 5-minute TTL cache for each data type
- **Parallel Fetching**: `fetchAll()` uses Promise.all for efficient retrieval
- **Health Tracking**: Monitors provider availability and rate limiting

## Setup

### 1. Environment Configuration

Copy `.env.example` to `.env` and add your API keys (server-side only):

```bash
# .env (never commit)
NEWSAPI_KEY=your_newsapi_key_here
CRYPTOCOMPARE_KEY=your_cryptocompare_key_here
HUGGING_FACE_TOKEN=your_hf_token_here
ETHERSCAN_KEY=your_etherscan_key_here
TRONSCAN_KEY=your_tronscan_key_here
```

All keys are **optional**. Missing keys return `NOT_CONFIGURED` status without blocking the app.

### 2. Server Initialization

The server automatically initializes the orchestrator on startup:

```typescript
// In server.ts
initializeSupplementalOrchestrator({
  newsApiKey: process.env.NEWSAPI_KEY,
  cryptoCompareKey: process.env.CRYPTOCOMPARE_KEY,
  huggingFaceToken: process.env.HUGGING_FACE_TOKEN,
  etherscanKey: process.env.ETHERSCAN_KEY,
  tronScanKey: process.env.TRONSCAN_KEY,
  timeout: Number(process.env.SUPPLEMENTAL_PROVIDER_TIMEOUT_MS || 8000),
});
```

### 3. Accessing from Frontend

Use the HTTP API endpoints (backend proxies to avoid CORS):

```typescript
// Fetch news
const newsRes = await fetch('/api/supplemental/news?symbol=BTCUSDT');
const news = await newsRes.json();

// Fetch sentiment
const sentimentRes = await fetch('/api/supplemental/sentiment?symbol=BTCUSDT');
const sentiment = await sentimentRes.json();

// Fetch on-chain
const onchainRes = await fetch('/api/supplemental/onchain?symbol=ETHUSDT');
const onchain = await onchainRes.json();

// Fetch all in parallel
const allRes = await fetch('/api/supplemental/all?symbol=BTCUSDT');
const all = await allRes.json();

// Check health
const healthRes = await fetch('/api/supplemental/health');
const health = await healthRes.json();
```

## API Endpoints

### `GET /api/supplemental/news?symbol=BTCUSDT`

Fetch crypto news articles for a symbol.

**Response:**
```json
{
  "category": "news",
  "provider": "NewsAPI",
  "symbol": "BTCUSDT",
  "data": [
    {
      "title": "Bitcoin Hits New ATH",
      "description": "...",
      "url": "https://...",
      "source": "CoinDesk",
      "publishedAt": "2026-06-19T10:30:00Z"
    }
  ],
  "source": "live",
  "status": "OK",
  "latencyMs": 342,
  "updatedAt": "2026-06-19T10:30:42Z"
}
```

**Status Values:**
- `OK` - Data available
- `NOT_CONFIGURED` - API key not set
- `RATE_LIMITED` - Provider rate limit hit
- `UNAUTHORIZED` - Invalid API key
- `NO_RESULTS` - No news found
- `FETCH_FAILED` - Network error

### `GET /api/supplemental/sentiment?symbol=BTCUSDT`

Fetch market sentiment for a symbol.

**Response:**
```json
{
  "category": "sentiment",
  "provider": "HuggingFace",
  "symbol": "BTCUSDT",
  "data": {
    "value": 0.78,
    "label": "POSITIVE",
    "confidence": 0.95,
    "modelVersion": "distilbert-base-uncased-finetuned-sst-2-english"
  },
  "newsContext": ["Bitcoin market context..."],
  "source": "live",
  "status": "OK",
  "latencyMs": 845,
  "updatedAt": "2026-06-19T10:30:42Z"
}
```

**Sentiment Labels:**
- `POSITIVE` - value > 0
- `NEUTRAL` - value ≈ 0
- `NEGATIVE` - value < 0

### `GET /api/supplemental/onchain?symbol=ETHUSDT`

Fetch on-chain signals (whale transfers, exchange movements).

**Response:**
```json
{
  "category": "onchain",
  "provider": "Etherscan",
  "symbol": "ETHUSDT",
  "data": [
    {
      "type": "whale_transfer",
      "amount": 5000.5,
      "amountUSD": 10000000,
      "direction": "outbound",
      "chain": "ethereum",
      "blockNumber": 18234567,
      "transactionHash": "0x...",
      "timestamp": "2026-06-19T10:25:00Z"
    }
  ],
  "source": "live",
  "status": "OK",
  "latencyMs": 512,
  "updatedAt": "2026-06-19T10:30:42Z"
}
```

### `GET /api/supplemental/all?symbol=BTCUSDT`

Fetch all supplemental intelligence in parallel.

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "news": { /* NewsResult */ },
  "sentiment": { /* SentimentResult */ },
  "onchain": { /* OnChainResult */ },
  "fetchedAt": "2026-06-19T10:30:42Z"
}
```

### `GET /api/supplemental/health`

Check which providers are configured and their health status.

**Response:**
```json
{
  "providers": {
    "news": [
      { "name": "NewsAPI", "configured": true },
      { "name": "CryptoCompare", "configured": false }
    ],
    "sentiment": [
      { "name": "HuggingFace", "configured": true },
      { "name": "NewsSentiment", "configured": true }
    ],
    "onchain": [
      { "name": "Etherscan", "configured": false },
      { "name": "TronScan", "configured": false }
    ]
  },
  "health": {
    "configuredProviders": 2,
    "healthyProviders": 2,
    "rateLimitedProviders": [],
    "unhealthyProviders": []
  },
  "trackedAt": "2026-06-19T10:30:42Z"
}
```

## Security Guarantees

1. **No Frontend Secrets**
   - API keys are server-side only (.env)
   - Never passed to browser/frontend code
   - Tests verify no key leakage in responses

2. **Graceful Degradation**
   - Missing keys return `NOT_CONFIGURED` (200 OK)
   - App continues functioning without supplemental data
   - Scanner relies on core exchange data, not supplemental

3. **Rate Limiting**
   - Providers report `RATE_LIMITED` status
   - Health tracker backs off for 5 minutes
   - Application continues with degraded intelligence

## Testing

Run tests to verify security and resilience:

```bash
npm test
# or
npm run test:watch
```

Test coverage includes:
- ✓ API keys not exposed in responses
- ✓ Missing keys return NOT_CONFIGURED
- ✓ Provider failures return typed results
- ✓ Sentiment values normalized (-1 to +1)
- ✓ Scanner continues without supplemental data
- ✓ Health tracking works correctly
- ✓ Parallel fetching is efficient

## Known Limitations

### Rate Limits (without paid subscription)

- **NewsAPI**: 100 requests/day (free tier)
- **CryptoCompare**: Free tier available, paid tiers higher
- **Hugging Face**: Free inference API available
- **Etherscan**: 5 calls/second (free tier)

### Unsupported Symbols

- Etherscan: Only tracks Ethereum tokens (ETHUSDT, USDCUSDT)
- TronScan: Only tracks TRON network tokens (USDTUSDT on TRON)

### Provider Status

- **CoinMarketCap**: NOT RECOMMENDED (rate limits)
- **CoinGecko**: Can be added if needed (low priority)

## Integration with Scanner

The scanner can optionally use supplemental intelligence:

```typescript
// In scanner evaluation
const supplemental = await orchestrator.fetchAll(symbol);

// Only use if available, don't block on it
if (supplemental.sentiment.source === 'live') {
  const sentimentBoost = supplemental.sentiment.data.value * 0.1;
  confidence += sentimentBoost;
}
```

The scanner continues with full functionality even if supplemental data is unavailable.

## Future Enhancements

- [ ] Cache Redis for distributed deployments
- [ ] Webhook feeds for real-time news
- [ ] Custom sentiment models fine-tuned on crypto data
- [ ] Aggregated whale tracking across chains
- [ ] On-chain social sentiment (blockchain activity)
- [ ] Integration with Telegram/Discord signals

## Troubleshooting

### "NOT_CONFIGURED" for all providers

Check `.env` file exists and API keys are set:
```bash
cat .env | grep -E "NEWSAPI|HUGGING_FACE|ETHERSCAN"
```

### Rate limiting (429 status)

Wait 5+ minutes before retrying. Check provider's quota:
- NewsAPI: https://newsapi.org/account
- Hugging Face: https://huggingface.co/settings/tokens

### Timeout errors

Increase `SUPPLEMENTAL_PROVIDER_TIMEOUT_MS`:
```bash
export SUPPLEMENTAL_PROVIDER_TIMEOUT_MS=15000
npm run dev
```

## Files Created

```
src/services/
├── providers/
│   ├── supplementalTypes.ts      # Type definitions
│   ├── newsProviders.ts          # NewsAPI, CryptoCompare
│   ├── sentimentProviders.ts     # HuggingFace sentiment
│   └── onchainProviders.ts       # Etherscan, TronScan
├── supplementalOrchestrator.ts   # Main coordinator
└── providerHealth.ts             # Health tracking

src/tests/
└── supplemental.test.ts          # Comprehensive tests

.env.example                       # Template with all variables
```


## Live Signal Pipeline Scope

Supplemental News, sentiment, and on-chain evidence is currently consumed by Strategy Fusion preview/lab surfaces, not by the live Short Hunter scanner/candidate-ranking pipeline. Configuring supplemental provider keys does not change live signal scores in this release. Unavailable evidence remains unavailable/MISSING, and any future integration requires explicit shadow-first validation and governance.
