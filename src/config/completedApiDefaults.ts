/**
 * Browser-visible API configuration slots + public provider profiles.
 * Secret defaults are intentionally NOT embedded here: server.ts loads the attached
 * private API seed and Settings only receives configured/verified/count metadata.
 */
export const COMPLETED_API_DEFAULTS = {
  tronScanKey: '',
  bscScanKey: '',
  etherscanKey: '',
  coinMarketCapKey: '',
  /** Operator-entered Newsdata.io key; used only after the approved HF Spaces. */
  newsApiKey: '',
  huggingFaceToken: '',
} as const;

/** Safe client placeholders for the six managed server-side credential families. */
export const COMPLETED_SUPPLEMENTAL_DEFAULTS = {
  newsApiKey: COMPLETED_API_DEFAULTS.newsApiKey,
  coinMarketCapKey: COMPLETED_API_DEFAULTS.coinMarketCapKey,
  huggingFaceToken: COMPLETED_API_DEFAULTS.huggingFaceToken,
  etherscanKey: COMPLETED_API_DEFAULTS.etherscanKey,
  tronScanKey: COMPLETED_API_DEFAULTS.tronScanKey,
  bscScanKey: COMPLETED_API_DEFAULTS.bscScanKey,
} as const;

export type CompletedDefaultExternalSource = {
  id: string;
  enabled: boolean;
  category: 'news' | 'sentiment' | 'onchain' | 'exchange' | 'webhook' | 'custom';
  name: string;
  baseUrl: string;
  method: 'GET' | 'POST';
  authType: 'none' | 'bearer' | 'apiKeyHeader' | 'apiKeyQuery' | 'customHeader';
  authKeyName?: string;
  secret: string;
  parserHint?: string;
  notes?: string;
};

/** Keyless canonical source profiles. Operator-key providers live in Managed provider credentials. */
export function createCompletedDefaultExternalSources(): CompletedDefaultExternalSource[] {
  return [
    {
      id: 'default-hf-space-2-news',
      enabled: true,
      category: 'news',
      name: 'HF Space-2 · resources news',
      baseUrl: '/api/hf-space/intel/news',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'news',
      notes: 'Owner-managed fallback gateway — news after public market exchange tier where applicable',
    },
    {
      id: 'default-hf-space-2-sentiment',
      enabled: true,
      category: 'sentiment',
      name: 'HF Space-2 · crypto-dt-source F&G',
      baseUrl: '/api/hf-space/intel/sentiment',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'sentiment',
      notes: 'Owner-managed fallback gateway — sentiment',
    },
    {
      id: 'default-hf-space-4-sentiment',
      enabled: true,
      category: 'sentiment',
      name: 'HF Space-4 · global sentiment (proxy)',
      baseUrl: '/api/hf-space/intel/sentiment',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'sentiment',
      notes: 'Owner-managed fallback gateway — sentiment',
    },
    {
      id: 'default-hf-space-2-whales',
      enabled: true,
      category: 'onchain',
      name: 'HF Space-2 · whales',
      baseUrl: '/api/hf-space/intel/whales',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'whales',
      notes: 'Owner-managed fallback gateway — whale/on-chain',
    },
    {
      id: 'default-binance-futures-ticker',
      enabled: true,
      category: 'exchange',
      name: 'Binance Futures ticker',
      baseUrl: '/api/binance/ticker?symbol=BTCUSDT',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'market',
      notes: 'Co-primary market — USD-M futures (use BINANCE_PROXY_BASE_URL on server)',
    },
    {
      id: 'default-kucoin-futures-ticker',
      enabled: true,
      category: 'exchange',
      name: 'KuCoin Futures ticker',
      baseUrl: 'https://api-futures.kucoin.com/api/v1/ticker?symbol=XBTUSDTM',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'market',
      notes: 'Co-primary public market provider; no API key',
    },
    {
      id: 'default-hf-space-4-market',
      enabled: true,
      category: 'exchange',
      name: 'HF Space-4 · Short Hunter market',
      baseUrl: '/api/hf-space/short-hunter/market/BTC',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'market',
      notes: 'Approved fallback after Binance/KuCoin public Futures',
    },
    {
      id: 'default-hf-space-2-market',
      enabled: true,
      category: 'exchange',
      name: 'HF Space-2 · market rate',
      baseUrl: 'https://really-amin-datasourceforcryptocurrency-2.hf.space/api/service/rate?pair=BTC%2FUSDT',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'market',
      notes: 'Approved owner-managed datasource fallback',
    },
    {
      id: 'default-coingecko-market',
      enabled: true,
      category: 'exchange',
      name: 'CoinGecko · public market reference',
      baseUrl: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'market-reference',
      notes: 'Attached API pack · context/diagnostics only; never substitutes futures funding or open interest',
    },
    {
      id: 'default-coincap-market',
      enabled: true,
      category: 'exchange',
      name: 'CoinCap · public market reference',
      baseUrl: 'https://api.coincap.io/v2/assets/bitcoin',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'market-reference',
      notes: 'Attached API pack · context/diagnostics only',
    },
    {
      id: 'default-coinpaprika-market',
      enabled: true,
      category: 'exchange',
      name: 'CoinPaprika · public market reference',
      baseUrl: 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'market-reference',
      notes: 'Attached API pack · context/diagnostics only',
    },
    {
      id: 'default-alternative-me-sentiment',
      enabled: true,
      category: 'sentiment',
      name: 'Alternative.me · Fear & Greed',
      baseUrl: 'https://api.alternative.me/fng/?limit=1',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'sentiment',
      notes: 'Attached API pack · active smart sentiment fallback after owner-managed HF source',
    },
    {
      id: 'default-clankapp-whales',
      enabled: true,
      category: 'onchain',
      name: 'ClankApp · whale feed',
      baseUrl: 'https://clankapp.com/api/whales/recent',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'whales',
      notes: 'Attached API pack · active smart on-chain fallback after symbol-specific sources',
    },
    {
      id: 'default-reddit-crypto-news',
      enabled: true,
      category: 'news',
      name: 'Reddit · CryptoCurrency public JSON',
      baseUrl: 'https://www.reddit.com/r/CryptoCurrency/new.json?limit=25',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'news-reference',
      notes: 'Attached API pack · diagnostics/reference profile; not promoted to trading evidence by default',
    },
    {
      id: 'default-blockscout-ethereum',
      enabled: true,
      category: 'onchain',
      name: 'BlockScout · Ethereum public explorer',
      baseUrl: 'https://eth.blockscout.com/api',
      method: 'GET',
      authType: 'none',
      secret: '',
      parserHint: 'onchain-reference',
      notes: 'Attached API pack · keyless explorer standby profile',
    },
    {
      id: 'default-ethereum-public-rpc',
      enabled: false,
      category: 'onchain',
      name: 'PublicNode · Ethereum RPC',
      baseUrl: 'https://ethereum.publicnode.com',
      method: 'POST',
      authType: 'none',
      secret: '',
      parserHint: 'json-rpc',
      notes: 'Attached API pack · RPC standby profile',
    },
    {
      id: 'default-bsc-public-rpc',
      enabled: false,
      category: 'onchain',
      name: 'BSC · official public RPC',
      baseUrl: 'https://bsc-dataseed.binance.org',
      method: 'POST',
      authType: 'none',
      secret: '',
      parserHint: 'json-rpc',
      notes: 'Attached API pack · RPC standby profile',
    },
  ];
}
