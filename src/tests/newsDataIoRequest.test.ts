import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNewsDataIoRequestUrl } from '../services/providers/newsApiRequest';
import { formatNewsApiTransportError, mapNewsDataIoArticle } from '../services/providers/newsApiServerFetch';

describe('Newsdata.io provider migration', () => {
  it('uses the attached Newsdata.io latest endpoint and query-parameter authentication', () => {
    const url = buildNewsDataIoRequestUrl('secret-key', 'BTCUSDT', {
      language: 'en',
      pageSize: 7,
      domains: 'example.com',
      excludeDomains: 'noise.example',
    });
    expect(url.origin).toBe('https://newsdata.io');
    expect(url.pathname).toBe('/api/1/latest');
    expect(url.searchParams.get('apikey')).toBe('secret-key');
    expect(url.searchParams.get('q')).toContain('Bitcoin');
    expect(url.searchParams.get('size')).toBe('7');
    expect(url.searchParams.get('domain')).toBe('example.com');
    expect(url.searchParams.get('excludedomain')).toBe('noise.example');
  });

  it('maps the Newsdata.io result shape into the existing article contract', () => {
    expect(mapNewsDataIoArticle({
      title: 'Bitcoin update',
      description: 'Market context',
      link: 'https://example.com/bitcoin',
      pubDate: '2026-08-09 12:30:00',
      source_id: 'example',
    })).toMatchObject({
      title: 'Bitcoin update',
      description: 'Market context',
      url: 'https://example.com/bitcoin',
      publishedAt: '2026-08-09 12:30:00',
      source: 'example',
    });
  });

  it('reports Newsdata.io in transport failures', () => {
    expect(formatNewsApiTransportError('fetch failed')).toContain('newsdata.io unreachable');
  });

  it('keeps Newsdata.io on adaptive direct/proxy routing', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/providers/newsApiServerFetch.ts'), 'utf8');
    expect(source).not.toContain('proxyOnly: pool.poolSize > 0');
  });

  it('probes CoinMarketCap through the canonical v3 authenticated quotes client', () => {
    const request = readFileSync(join(process.cwd(), 'src/services/providers/coinMarketCapApiRequest.ts'), 'utf8');
    const probe = readFileSync(join(process.cwd(), 'src/services/supplementalKeyProbe.ts'), 'utf8');
    expect(request).toContain("COINMARKETCAP_QUOTES_PATH = '/v3/cryptocurrency/quotes/latest'");
    expect(request).toContain("url.searchParams.set('symbol', normalized.join(','))");
    expect(request).toContain("'X-CMC_PRO_API_KEY': secret");
    expect(probe).toContain("fetchCoinMarketCapQuotes(apiKey, ['BTC'], PROBE_TIMEOUT_MS)");
  });

  it('uses the approved market hierarchy before operator-entered CoinMarketCap', () => {
    const feed = readFileSync(join(process.cwd(), 'src/services/intelligenceFeedProbe.ts'), 'utf8');
    const market = readFileSync(join(process.cwd(), 'src/services/marketDataService.ts'), 'utf8');
    const env = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

    expect(feed).toContain("binanceTicker('BTCUSDT')");
    expect(feed).toContain("kucoinTicker('BTC-USDT')");
    expect(feed).toContain('fetchHfSpaceMarketPrices()');
    expect(feed).toContain("fetchCoinMarketCapQuotes(coinMarketCapKeys[index], ['BTC', 'ETH'], TIMEOUT_MS)");
    expect(market).toContain("source: 'binance'");
    expect(market).toContain("source: 'kucoin'");
    expect(market).toContain("source: 'hf_space_4'");
    expect(feed).not.toContain('api.coingecko.com');
    expect(feed).not.toContain('cryptoCompareKey');
    expect(feed).not.toContain('Massive.com');
    expect(env).not.toContain('COINMARKETCAP_API_KEY=');
    expect(env).not.toContain('COINMARKETCAP_KEY=');
  });

  it('loads the attached private provider pack server-side without returning secrets to browser code', () => {
    const source = readFileSync(join(process.cwd(), 'server.ts'), 'utf8');
    const clientSettings = readFileSync(join(process.cwd(), 'src/services/supplementalSettings.ts'), 'utf8');
    expect(source).toContain('loadBundledPrivateApiSeed()');
    expect(source).toContain('coinMarketCapKeys: [supplementalKeys.coinMarketCapKey, ...supplementalReserveKeys.coinMarketCapKey]');
    expect(source).toContain('process.env.COINMARKETCAP_KEY || process.env.CMC_API_KEY || DEFAULT_SUPPLEMENTAL_KEYS.coinMarketCapKey');
    expect(clientSettings).not.toMatch(/hf_[A-Za-z0-9]{20,}/);
    expect(clientSettings).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('routes supplemental intelligence through HF first, then attached public/keyed fallbacks', () => {
    const orchestrator = readFileSync(join(process.cwd(), 'src/services/supplementalOrchestrator.ts'), 'utf8');
    expect(orchestrator.indexOf('new HfSpacesNewsProvider()')).toBeLessThan(orchestrator.indexOf('new NewsAPIProvider'));
    expect(orchestrator.indexOf('new HfSpacesSentimentProvider()')).toBeLessThan(orchestrator.indexOf('new AlternativeMeSentimentProvider'));
    expect(orchestrator.indexOf('new AlternativeMeSentimentProvider')).toBeLessThan(orchestrator.indexOf('new HuggingFaceSentimentProvider'));
    expect(orchestrator.indexOf('new HfSpacesOnChainProvider()')).toBeLessThan(orchestrator.indexOf('new EtherscanProvider'));
    expect(orchestrator.indexOf('new EtherscanProvider')).toBeLessThan(orchestrator.indexOf('new ClankAppProvider'));
    expect(orchestrator).toContain('HuggingFace Reserve');
    expect(orchestrator).toContain('BscScan Reserve');
  });
});
