/**
 * Best-effort USD unit pricing for on-chain whale signals.
 *
 * Owner-approved routing is inherited from marketDataService:
 * Binance public → KuCoin public → approved Hugging Face Spaces. Only when that
 * whole keyless chain fails may an operator-entered CoinMarketCap key be used.
 * No additional direct market aggregator is inserted in this module.
 */
import { getCandles } from '../marketDataService';
import { fetchCoinMarketCapQuotes } from './coinMarketCapApiRequest';

const MARKET_BASE_BY_ASSET: Record<string, string> = {
  WBTC: 'BTC',
  BTC: 'BTC',
  WETH: 'ETH',
  ETH: 'ETH',
  WBNB: 'BNB',
  BNB: 'BNB',
  LINK: 'LINK',
  UNI: 'UNI',
  AAVE: 'AAVE',
  PEPE: 'PEPE',
  SHIB: 'SHIB',
  CAKE: 'CAKE',
};

const STABLE_ASSETS = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD']);
const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; price: number }>();
let operatorCoinMarketCapKey = '';

/** Called by the server-side supplemental orchestrator; the secret is never exposed to UI code. */
export function configureUsdPricingFallback(input?: { coinMarketCapKey?: string }): void {
  operatorCoinMarketCapKey = input?.coinMarketCapKey?.trim() || '';
}

async function fetchFromPrimaryMarketChain(base: string): Promise<number | undefined> {
  try {
    // 1h is intentional: it allows both approved HF Spaces to participate in
    // marketDataService's fallback chain while remaining sufficiently fresh for
    // approximate USD valuation of whale-transfer amounts.
    const result = await getCandles(`${base}-USDT`, '1h', 2, 'background');
    const close = result.candles[result.candles.length - 1]?.close;
    return Number.isFinite(close) && Number(close) > 0 ? Number(close) : undefined;
  } catch {
    return undefined;
  }
}

async function fetchFromOperatorCoinMarketCap(base: string): Promise<number | undefined> {
  if (!operatorCoinMarketCapKey) return undefined;
  const result = await fetchCoinMarketCapQuotes(operatorCoinMarketCapKey, [base], 8_000);
  const price = result.quotes[base]?.usdPrice;
  return result.ok && Number.isFinite(price) && Number(price) > 0 ? Number(price) : undefined;
}

/**
 * Resolves a token symbol (e.g. WBTC) to a USD unit price. Returns undefined —
 * never a guess or $0 — when the symbol is unmapped or every approved provider
 * fails. Stablecoins resolve deterministically at $1 by asset definition.
 */
export async function getUsdUnitPrice(assetSymbol: string | undefined): Promise<number | undefined> {
  if (!assetSymbol) return undefined;
  const symbol = assetSymbol.toUpperCase();
  if (STABLE_ASSETS.has(symbol)) return 1;
  const base = MARKET_BASE_BY_ASSET[symbol];
  if (!base) return undefined;

  const cached = cache.get(base);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.price;

  const primary = await fetchFromPrimaryMarketChain(base);
  if (primary !== undefined) {
    cache.set(base, { at: Date.now(), price: primary });
    return primary;
  }

  const cmc = await fetchFromOperatorCoinMarketCap(base);
  if (cmc !== undefined) {
    cache.set(base, { at: Date.now(), price: cmc });
    return cmc;
  }

  return undefined;
}
