export const COINMARKETCAP_BASE_URL = 'https://pro-api.coinmarketcap.com';
export const COINMARKETCAP_QUOTES_PATH = '/v3/cryptocurrency/quotes/latest';

export interface CoinMarketCapQuote {
  symbol: string;
  usdPrice: number | null;
}

export interface CoinMarketCapQuotesResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  apiCode: string | null;
  apiMessage: string | null;
  quotes: Record<string, CoinMarketCapQuote>;
  json: any;
  text: string;
}

function normalizedSymbols(symbols: string[]): string[] {
  return [...new Set(symbols
    .map((symbol) => symbol.trim().toUpperCase().replace(/[-_/]?(USDT|USD)$/u, ''))
    .filter(Boolean))];
}

export function buildCoinMarketCapQuotesUrl(symbols: string[], convert = 'USD'): URL {
  const normalized = normalizedSymbols(symbols);
  if (!normalized.length) throw new Error('CoinMarketCap requires at least one symbol');
  const url = new URL(COINMARKETCAP_QUOTES_PATH, COINMARKETCAP_BASE_URL);
  url.searchParams.set('symbol', normalized.join(','));
  url.searchParams.set('convert', convert.trim().toUpperCase() || 'USD');
  return url;
}

function extractQuoteRecord(data: any, symbol: string): any | null {
  if (!data) return null;
  const wanted = symbol.toUpperCase();

  if (Array.isArray(data)) {
    return data.find((item) => String(item?.symbol || '').toUpperCase() === wanted) ?? null;
  }

  if (typeof data === 'object') {
    const direct = data[wanted];
    if (Array.isArray(direct)) {
      return direct.find((item) => String(item?.symbol || '').toUpperCase() === wanted) ?? direct[0] ?? null;
    }
    if (direct && typeof direct === 'object') return direct;

    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        const found = value.find((item) => String(item?.symbol || '').toUpperCase() === wanted);
        if (found) return found;
      } else if (value && typeof value === 'object' && String((value as any).symbol || '').toUpperCase() === wanted) {
        return value;
      }
    }
  }

  return null;
}

function extractUsdPrice(record: any): number | null {
  const quote = record?.quote;
  const candidate = Array.isArray(quote)
    ? quote.find((item) => String(item?.symbol || item?.name || item?.currency || '').toUpperCase() === 'USD') ?? quote[0]
    : quote?.USD ?? quote?.usd ?? quote;
  const value = Number(candidate?.price);
  return Number.isFinite(value) ? value : null;
}

export async function fetchCoinMarketCapQuotes(
  apiKey: string,
  symbols: string[],
  timeoutMs = 12_000,
): Promise<CoinMarketCapQuotesResult> {
  const startedAt = Date.now();
  const secret = apiKey.trim();
  if (!secret) {
    return {
      ok: false,
      status: 0,
      latencyMs: 0,
      apiCode: 'EMPTY',
      apiMessage: 'CoinMarketCap API key is empty',
      quotes: {},
      json: null,
      text: '',
    };
  }

  const wanted = normalizedSymbols(symbols);
  const url = buildCoinMarketCapQuotesUrl(wanted);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': secret,
      },
    });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    const quotes: Record<string, CoinMarketCapQuote> = {};
    for (const symbol of wanted) {
      const record = extractQuoteRecord(json?.data, symbol);
      quotes[symbol] = { symbol, usdPrice: extractUsdPrice(record) };
    }

    const apiCodeRaw = json?.status?.error_code;
    const apiCode = apiCodeRaw == null || Number(apiCodeRaw) === 0 ? null : `CMC_${String(apiCodeRaw)}`;
    const apiMessage = String(json?.status?.error_message || json?.message || '').trim() || null;
    const hasQuote = Object.values(quotes).some((quote) => quote.usdPrice != null);

    return {
      ok: response.ok && !apiCode && hasQuote,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      apiCode,
      apiMessage,
      quotes,
      json,
      text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed';
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      apiCode: error instanceof DOMException && error.name === 'AbortError' ? 'TIMEOUT' : 'UNREACHABLE',
      apiMessage: message,
      quotes: {},
      json: null,
      text: '',
    };
  } finally {
    clearTimeout(timer);
  }
}
