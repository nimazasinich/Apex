/**
 * Supplemental API configuration slots + free public endpoints from Doc/api-config-complete__1_.txt
 * Mapped onto reserved Intelligence / Custom API Settings slots.
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

/** Keys that map 1:1 onto the Intelligence APIs supplemental store. */
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
  ];
}
