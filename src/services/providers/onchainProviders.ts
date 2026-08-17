/**
 * On-Chain Providers: Etherscan, TronScan, BscScan, ClankApp
 * Real API access only. No mocking.
 *
 * All upstream calls go through smartFetchJson so they follow the same
 * direct/proxy routing as the rest of the engine — on restricted networks a
 * plain fetch() here silently timed out and left the panel empty.
 * NODE ONLY (proxyFetch requires undici).
 */

import {
  SupplementalProvider,
  ProviderConfig,
  OnChainResult,
  SupplementalDataSource,
  OnChainSignal,
} from './supplementalTypes';
import { describeUpstreamUnreachable, smartFetchJson } from '../proxyFetch';
import { getUsdUnitPrice } from './usdPricing';

/**
 * Fills in `amountUSD` for signals whose asset resolves to a known USD price.
 * Left as `undefined` (never $0 or a guess) when no price is available —
 * matches the "no fabrication" rule the rest of this file follows.
 */
async function attachUsdValues(signals: OnChainSignal[]): Promise<void> {
  const assets = Array.from(new Set(signals.map((s) => s.asset).filter(Boolean))) as string[];
  if (assets.length === 0) return;
  const priced = await Promise.all(assets.map(async (a) => [a, await getUsdUnitPrice(a)] as const));
  const priceMap = new Map(priced);
  for (const sig of signals) {
    const price = sig.asset ? priceMap.get(sig.asset) : undefined;
    if (typeof price === 'number') sig.amountUSD = sig.amount * price;
  }
}

/**
 * Etherscan `tokentx` rows carry the token's own decimals — WBTC is 8 and
 * USDT/USDC are 6, so a fixed 1e18 divisor mis-scales every amount by orders
 * of magnitude. Falls back to 18 only when the field is missing.
 */
function decodeTokenAmount(rawValue: unknown, rawDecimals: unknown): number {
  const decimals = Number(rawDecimals);
  const exponent = Number.isFinite(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 0;
  return value / 10 ** exponent;
}

/**
 * Publicly documented exchange hot/deposit wallets. A transfer *into* one is
 * sell pressure (inbound); *out of* one is accumulation (outbound). Anything
 * else is left as a plain whale transfer.
 */
const EXCHANGE_ADDRESSES = new Set(
  [
    '0x28c6c06298d514db089934071355e5743bf21d60', // Binance 14
    '0x21a31ee1afc51d94c2efccaa2092ad1028285549', // Binance 15
    '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', // Binance 16
    '0x56eddb7aa87536c09ccc2793473599fd21a8b17f', // Binance 17
    '0x9696f59e4d72e237be84ffd425dcad154bf96976', // Binance 18
    '0x4976a4a02f38326660d17bf34b431dc6e2eb2327', // Binance 20
    '0xf977814e90da44bfa03b6295a0616a897441acec', // Binance 8 (cold)
    '0x71660c4005ba85c37ccec55d0c4493e66fe775d3', // Coinbase 1
    '0x503828976d22510aad0201ac7ec88293211d23da', // Coinbase 2
    '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740', // Coinbase 3
    '0x3cd751e6b0078be393132286c442345e5dc49699', // Coinbase 4
    '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b', // OKX
    '0x236f9f97e0e62388479bf9e5ba4889e46b0273c3', // OKX 2
    '0x2910543af39aba0cd09dbb2d50200b3e800a63d2', // Kraken
    '0xfa52274dd61e1643d2205169732f29114bc240b3', // Kraken 4
    '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43', // Coinbase 10
  ].map((a) => a.toLowerCase()),
);

/**
 * One transaction can emit several identical Transfer events (routers split a
 * fill across pools), which showed the same hash and amount as separate whale
 * moves. Keep the largest transfer per hash.
 */
function dedupeByTransaction(signals: OnChainSignal[]): OnChainSignal[] {
  const best = new Map<string, OnChainSignal>();
  for (const sig of signals) {
    const prev = best.get(sig.transactionHash);
    if (!prev || sig.amount > prev.amount) best.set(sig.transactionHash, sig);
  }
  return [...best.values()];
}

function classifyTransfer(from: unknown, to: unknown): {
  type: 'exchange_deposit' | 'exchange_withdrawal' | 'whale_transfer';
  direction: 'inbound' | 'outbound';
} {
  const src = String(from ?? '').toLowerCase();
  const dst = String(to ?? '').toLowerCase();
  if (EXCHANGE_ADDRESSES.has(dst)) return { type: 'exchange_deposit', direction: 'inbound' };
  if (EXCHANGE_ADDRESSES.has(src)) return { type: 'exchange_withdrawal', direction: 'outbound' };
  return { type: 'whale_transfer', direction: 'outbound' };
}

/** Pure decoding helpers, exposed for unit tests (no network involved). */
export const __onchainInternals = { decodeTokenAmount, classifyTransfer, dedupeByTransaction };

/**
 * Etherscan on-chain provider
 * Tracks Ethereum transfers, contract interactions
 * https://etherscan.io/apis
 */
export class EtherscanProvider implements SupplementalProvider {
  name = 'Etherscan';
  category = 'onchain' as const;
  private apiKey: string | undefined;
  private timeout: number;

  constructor(config?: ProviderConfig) {
    this.apiKey = config?.apiKey;
    this.timeout = config?.timeout || 8000;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetch(symbol: string, timeoutMs?: number): Promise<OnChainResult> {
    const startTime = Date.now();
    const tmo = timeoutMs || this.timeout;

    if (!this.isConfigured()) {
      return {
        category: 'onchain',
        provider: this.name,
        symbol,
        data: [],
        source: 'not_configured',
        status: 'NOT_CONFIGURED',
        reason: 'Etherscan key not set',
        latencyMs: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    try {
      // Map symbol to Ethereum contract address
      const contractAddr = this._mapSymbolToContractAddress(symbol);
      if (!contractAddr) {
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: 'UNSUPPORTED_SYMBOL',
          reason: `Symbol ${symbol} not mapped to Ethereum contract`,
          latencyMs: 0,
          updatedAt: new Date().toISOString(),
        };
      }

      // Fetch recent token transfers (top 100) — official action is tokentx
      const url = new URL('https://api.etherscan.io/v2/api');
      url.searchParams.set('chainid', '1');
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'tokentx');
      url.searchParams.set('contractaddress', contractAddr);
      url.searchParams.set('sort', 'desc');
      const apiKey = this.apiKey!;
      url.searchParams.set('apikey', apiKey);
      url.searchParams.set('page', '1');
      url.searchParams.set('offset', '100');

      const response = await smartFetchJson(url.toString(), {
        timeoutMs: tmo,
        logKey: 'etherscan:tokentx',
      });
      const latency = Date.now() - startTime;

      if (response.status === 401 || response.status === 403) {
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: 'UNAUTHORIZED',
          reason: 'Etherscan key is invalid',
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      if (response.status === 429) {
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'degraded',
          status: 'RATE_LIMITED',
          reason: 'Etherscan rate limit exceeded',
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      if (!response.ok) {
        const unreachable = response.status === 0;
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: unreachable ? 'UNREACHABLE' : `HTTP_${response.status}`,
          reason: unreachable
            ? describeUpstreamUnreachable('api.etherscan.io', response.error)
            : `Etherscan returned HTTP ${response.status}`,
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      const json = response.json ?? {};

      if (json.status !== '1' || !json.result) {
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'degraded',
          status: 'NO_DATA',
          reason: 'Etherscan returned no transaction data',
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      // Largest recent transfers first — the panel only renders a handful.
      const rawSignals: OnChainSignal[] = (Array.isArray(json.result) ? json.result : [])
        .map((tx: any) => {
          const { type, direction } = classifyTransfer(tx.from, tx.to);
          return {
            type,
            amount: decodeTokenAmount(tx.value, tx.tokenDecimal),
            asset: typeof tx.tokenSymbol === 'string' ? tx.tokenSymbol : undefined,
            amountUSD: undefined,
            direction,
            chain: 'ethereum',
            blockNumber: parseInt(tx.blockNumber, 10),
            transactionHash: tx.hash,
            timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString(),
          } satisfies OnChainSignal;
        })
        .filter((sig: OnChainSignal) => sig.amount > 0 && sig.transactionHash);

      const signals = dedupeByTransaction(rawSignals)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 20);

      // Best-effort USD valuation so exchange-flow bias has real $ to sum —
      // a failed/unmapped price lookup leaves amountUSD undefined, it never
      // fabricates a value.
      await attachUsdValues(signals);

      return {
        category: 'onchain',
        provider: this.name,
        symbol,
        data: signals,
        source: signals.length > 0 ? 'live' : 'degraded',
        status: signals.length > 0 ? 'OK' : 'NO_WHALE_TRANSFERS',
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      const reason =
        err instanceof Error
          ? err.message.includes('abort')
            ? 'Request timeout'
            : err.message
          : 'Unknown error';

      return {
        category: 'onchain',
        provider: this.name,
        symbol,
        data: [],
        source: 'unavailable',
        status: 'FETCH_FAILED',
        reason,
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * ERC-20 contract whose transfers stand in for the traded symbol. BTC and ETH
   * have no native ERC-20, so the wrapped versions (WBTC / WETH) are used —
   * they are the venue where large on-chain BTC/ETH flow is visible.
   */
  private _mapSymbolToContractAddress(symbol: string): string | undefined {
    const map: Record<string, string> = {
      BTCUSDT: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC (8 decimals)
      XBTUSDTM: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
      ETHUSDT: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
      USDTUSDT: '0xdac17f958d2ee523a2206206994597c13d831ec7', // Tether
      USDCUSDT: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      LINKUSDT: '0x514910771af9ca656af840dff83e8264ecf986ca', // Chainlink
      UNIUSDT: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', // Uniswap
      AAVEUSDT: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', // Aave
      PEPEUSDT: '0x6982508145454ce325ddbe47a25d4ec3d2311933', // PEPE
      SHIBUSDT: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', // SHIB
    };
    return map[symbol.toUpperCase()];
  }
}

/**
 * TronScan on-chain provider
 * Tracks TRON network transfers, especially USDT
 * https://tronscan.org/#/api
 */
export class TronScanProvider implements SupplementalProvider {
  name = 'TronScan';
  category = 'onchain' as const;
  private apiKey: string | undefined;
  private timeout: number;

  constructor(config?: ProviderConfig) {
    this.apiKey = config?.apiKey;
    this.timeout = config?.timeout || 8000;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetch(symbol: string, timeoutMs?: number): Promise<OnChainResult> {
    const startTime = Date.now();
    const tmo = timeoutMs || this.timeout;

    if (!this.isConfigured()) {
      return {
        category: 'onchain',
        provider: this.name,
        symbol,
        data: [],
        source: 'not_configured',
        status: 'NOT_CONFIGURED',
        reason: 'TronScan API not configured',
        latencyMs: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    try {
      // TronScan API for token transfers
      // This is a simplified implementation
      const tokenAddr = this._mapSymbolToTokenAddress(symbol);
      if (!tokenAddr) {
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: 'UNSUPPORTED_SYMBOL',
          reason: `Symbol ${symbol} not available on TRON network`,
          latencyMs: 0,
          updatedAt: new Date().toISOString(),
        };
      }

      const url = `https://apilist.tronscanapi.com/api/token_trc20/transfers?limit=50&start=0&contract_address=${tokenAddr}`;

      const response = await smartFetchJson(url, {
        timeoutMs: tmo,
        logKey: 'tronscan:trc20transfers',
        headers: { 'TRON-PRO-API-KEY': this.apiKey! },
      });
      const latency = Date.now() - startTime;

      if (response.status === 401 || response.status === 403) {
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: 'UNAUTHORIZED',
          reason: 'TronScan access denied or API key invalid',
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      if (response.status === 429) {
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'degraded',
          status: 'RATE_LIMITED',
          reason: 'TronScan rate limit exceeded',
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      if (!response.ok) {
        const unreachable = response.status === 0;
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: unreachable ? 'UNREACHABLE' : `HTTP_${response.status}`,
          reason: unreachable
            ? describeUpstreamUnreachable('apilist.tronscanapi.com', response.error)
            : `TronScan returned HTTP ${response.status}`,
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      const json = response.json ?? {};
      const transfers = json.trc20_transfers || json.token_transfers || json.data || [];

      // Extract large transfers (whale context)
      const signals: OnChainSignal[] = (Array.isArray(transfers) ? transfers : [])
        .slice(0, 20)
        .filter((tx: any) => {
          const amount = parseFloat(tx.amount_str || tx.quant || tx.amount || '0');
          return amount > 1000000; // > 1M USDT
        })
        .map((tx: any) => ({
          type: 'exchange_deposit' as const,
          amount: parseFloat(tx.amount_str || tx.quant || tx.amount || '0'),
          asset: String(tx.tokenAbbr || tx.token_abbr || 'USDT').toUpperCase(),
          amountUSD: parseFloat(tx.amount_str || tx.quant || tx.amount || '0'), // Assuming USDT
          direction: 'inbound' as const,
          chain: 'tron',
          transactionHash: tx.transaction_id || tx.hash || '',
          timestamp: new Date((tx.block_ts || tx.timestamp || Date.now() / 1000) * 1000).toISOString(),
        }));

      return {
        category: 'onchain',
        provider: this.name,
        symbol,
        data: signals,
        source: signals.length > 0 ? 'live' : 'degraded',
        status: signals.length > 0 ? 'OK' : 'NO_WHALE_TRANSFERS',
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      const reason =
        err instanceof Error
          ? err.message.includes('abort')
            ? 'Request timeout'
            : err.message
          : 'Unknown error';

      return {
        category: 'onchain',
        provider: this.name,
        symbol,
        data: [],
        source: 'unavailable',
        status: 'FETCH_FAILED',
        reason,
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  private _mapSymbolToTokenAddress(symbol: string): string | undefined {
    const map: Record<string, string> = {
      USDTUSDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT on TRON
    };
    return map[symbol.toUpperCase()];
  }
}

/**
 * BscScan on-chain provider (BNB Smart Chain).
 *
 * Uses the Etherscan V2 unified API (api.etherscan.io/v2 with chainid=56), so a
 * single Etherscan key covers BSC as well — no separate bscscan.com key needed.
 * If a dedicated BscScan key is supplied it is used the same way. Modeled on the
 * Etherscan provider; same honest result states (no mocking, no fabrication).
 * https://docs.etherscan.io/etherscan-v2
 */
export class BscScanProvider implements SupplementalProvider {
  name = 'BscScan';
  category = 'onchain' as const;
  private apiKey: string | undefined;
  private timeout: number;

  constructor(config?: ProviderConfig) {
    this.apiKey = config?.apiKey;
    this.timeout = config?.timeout || 8000;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetch(symbol: string, timeoutMs?: number): Promise<OnChainResult> {
    const startTime = Date.now();
    const tmo = timeoutMs || this.timeout;

    if (!this.isConfigured()) {
      return {
        category: 'onchain', provider: this.name, symbol, data: [],
        source: 'not_configured', status: 'NOT_CONFIGURED',
        reason: 'BscScan key not set', latencyMs: 0, updatedAt: new Date().toISOString(),
      };
    }

    try {
      const contractAddr = this._mapSymbolToContractAddress(symbol);
      if (!contractAddr) {
        return {
          category: 'onchain', provider: this.name, symbol, data: [],
          source: 'unavailable', status: 'UNSUPPORTED_SYMBOL',
          reason: `Symbol ${symbol} not mapped to a BSC contract`,
          latencyMs: 0, updatedAt: new Date().toISOString(),
        };
      }

      // Etherscan V2 unified endpoint, BSC = chainid 56.
      const url = new URL('https://api.etherscan.io/v2/api');
      url.searchParams.set('chainid', '56');
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'tokentx');
      url.searchParams.set('contractaddress', contractAddr);
      url.searchParams.set('sort', 'desc');
      url.searchParams.set('page', '1');
      url.searchParams.set('offset', '100');
      url.searchParams.set('apikey', this.apiKey!);

      const response = await smartFetchJson(url.toString(), {
        timeoutMs: tmo,
        logKey: 'bscscan:tokentx',
      });
      const latency = Date.now() - startTime;

      if (response.status === 401 || response.status === 403) {
        return {
          category: 'onchain', provider: this.name, symbol, data: [],
          source: 'unavailable', status: 'UNAUTHORIZED',
          reason: 'BscScan/Etherscan key is invalid', latencyMs: latency, updatedAt: new Date().toISOString(),
        };
      }
      if (response.status === 429) {
        return {
          category: 'onchain', provider: this.name, symbol, data: [],
          source: 'degraded', status: 'RATE_LIMITED',
          reason: 'BscScan rate limit exceeded', latencyMs: latency, updatedAt: new Date().toISOString(),
        };
      }
      if (!response.ok) {
        const unreachable = response.status === 0;
        return {
          category: 'onchain', provider: this.name, symbol, data: [],
          source: 'unavailable',
          status: unreachable ? 'UNREACHABLE' : `HTTP_${response.status}`,
          reason: unreachable
            ? describeUpstreamUnreachable('api.etherscan.io', response.error)
            : `BscScan returned HTTP ${response.status}`,
          latencyMs: latency, updatedAt: new Date().toISOString(),
        };
      }

      const json = response.json ?? {};
      if (json.status !== '1' || !json.result) {
        return {
          category: 'onchain', provider: this.name, symbol, data: [],
          source: 'degraded', status: 'NO_DATA',
          reason: typeof json.message === 'string' ? json.message : 'BscScan returned no transaction data',
          latencyMs: latency, updatedAt: new Date().toISOString(),
        };
      }

      const rawSignals: OnChainSignal[] = (Array.isArray(json.result) ? json.result : [])
        .map((tx: any) => {
          const { type, direction } = classifyTransfer(tx.from, tx.to);
          return {
            type,
            amount: decodeTokenAmount(tx.value, tx.tokenDecimal),
            asset: typeof tx.tokenSymbol === 'string' ? tx.tokenSymbol : undefined,
            amountUSD: undefined,
            direction,
            chain: 'bsc',
            blockNumber: parseInt(tx.blockNumber, 10),
            transactionHash: tx.hash,
            timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString(),
          } satisfies OnChainSignal;
        })
        .filter((sig: OnChainSignal) => sig.amount > 0 && sig.transactionHash);

      const signals = dedupeByTransaction(rawSignals)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 20);

      await attachUsdValues(signals);

      return {
        category: 'onchain', provider: this.name, symbol, data: signals,
        source: signals.length > 0 ? 'live' : 'degraded',
        status: signals.length > 0 ? 'OK' : 'NO_WHALE_TRANSFERS',
        latencyMs: latency, updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      const reason = err instanceof Error
        ? (err.message.includes('abort') ? 'Request timeout' : err.message)
        : 'Unknown error';
      return {
        category: 'onchain', provider: this.name, symbol, data: [],
        source: 'unavailable', status: 'FETCH_FAILED',
        reason, latencyMs: latency, updatedAt: new Date().toISOString(),
      };
    }
  }

  private _mapSymbolToContractAddress(symbol: string): string | undefined {
    // BEP-20 contracts on BNB Smart Chain.
    const map: Record<string, string> = {
      BNBUSDT: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      USDTUSDT: '0x55d398326f99059fF775485246999027B3197955', // BSC-USDT
      BUSDUSDT: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
      CAKEUSDT: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // PancakeSwap CAKE
    };
    return map[symbol.toUpperCase()];
  }
}

/**
 * ClankApp whale-transfer provider
 * Free multi-chain whale feed — no API key required.
 * https://clankapp.com/api/
 *
 * Live shape (verified catalog): `{ amount, symbol, chain, hash, timestamp }[]`.
 * Direction / USD fields are mapped only when present on the row.
 */
export class ClankAppProvider implements SupplementalProvider {
  name = 'ClankApp';
  category = 'onchain' as const;
  private timeout: number;

  constructor(config?: ProviderConfig) {
    this.timeout = config?.timeout || 8000;
  }

  isConfigured(): boolean {
    return true; // Always available — free, no key
  }

  async fetch(symbol: string, timeoutMs?: number): Promise<OnChainResult> {
    const startTime = Date.now();
    const tmo = timeoutMs || this.timeout;

    try {
      const response = await smartFetchJson('https://clankapp.com/api/whales/recent', {
        timeoutMs: tmo,
        logKey: 'clankapp:whales',
      });
      const latency = Date.now() - startTime;

      if (response.status === 429) {
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'degraded',
          status: 'RATE_LIMITED',
          reason: 'ClankApp rate limit exceeded',
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      if (!response.ok) {
        const unreachable = response.status === 0;
        return {
          category: 'onchain',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: unreachable ? 'UNREACHABLE' : `HTTP_${response.status}`,
          reason: unreachable
            ? describeUpstreamUnreachable('clankapp.com', response.error)
            : `ClankApp returned HTTP ${response.status}`,
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      const json = response.json;
      const rows: any[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.whales)
            ? json.whales
            : [];

      const base = symbol.replace(/USDT$/i, '').toUpperCase();
      // Soft-filter when rows expose symbol/coin. ClankApp is a mixed multi-chain
      // feed with no query filter — if no row matches the requested base, return
      // the full recent set rather than fabricating an empty filtered result.
      const hasSymbolField = rows.some((r) => r?.symbol || r?.coin);
      const matched = hasSymbolField
        ? rows.filter((r) => {
            const rowSym = String(r.symbol || r.coin || '').toUpperCase().replace(/USDT$/i, '');
            return rowSym === base || rowSym.includes(base) || base.includes(rowSym);
          })
        : rows;
      const selected = matched.length > 0 ? matched : rows;

      const signals: OnChainSignal[] = selected.slice(0, 40).map((row: any) => {
        const amount = Number(row.amount ?? row.value ?? 0);
        const usdRaw = row.amountUSD ?? row.usd_value ?? row.value_usd ?? row.usd;
        const amountUSD = usdRaw != null && Number.isFinite(Number(usdRaw)) ? Number(usdRaw) : undefined;
        // Direction: use inbound/outbound-style fields when present; otherwise
        // default outbound (same conservative default as explorer providers).
        const dirRaw = String(row.direction || row.type || row.flow || '').toLowerCase();
        let direction: 'inbound' | 'outbound' = 'outbound';
        if (/in|deposit|receive|buy/.test(dirRaw)) direction = 'inbound';
        else if (/out|withdraw|send|sell/.test(dirRaw)) direction = 'outbound';

        const ts = row.timestamp ?? row.time ?? row.created_at;
        let timestamp: string;
        if (typeof ts === 'number') {
          timestamp = new Date(ts < 1e12 ? ts * 1000 : ts).toISOString();
        } else if (typeof ts === 'string' && /^\d+$/.test(ts)) {
          const n = parseInt(ts, 10);
          timestamp = new Date(n < 1e12 ? n * 1000 : n).toISOString();
        } else if (typeof ts === 'string' && ts.length > 0) {
          const parsed = new Date(ts);
          timestamp = Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
        } else {
          timestamp = new Date().toISOString();
        }

        return {
          type: 'whale_transfer' as const,
          amount: Number.isFinite(amount) ? amount : 0,
          asset: row.symbol || row.coin ? String(row.symbol || row.coin).toUpperCase() : undefined,
          amountUSD,
          direction,
          chain: String(row.chain || row.blockchain || row.network || 'unknown'),
          transactionHash: String(row.hash || row.txHash || row.transactionHash || row.txid || ''),
          timestamp,
        };
      }).filter((s) => s.transactionHash.length > 0 || s.amount > 0);

      return {
        category: 'onchain',
        provider: this.name,
        symbol,
        data: signals,
        source: signals.length > 0 ? 'live' : 'degraded',
        status: signals.length > 0 ? 'OK' : 'NO_WHALE_TRANSFERS',
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      const reason =
        err instanceof Error
          ? err.message.includes('abort')
            ? 'Request timeout'
            : err.message
          : 'Unknown error';
      return {
        category: 'onchain',
        provider: this.name,
        symbol,
        data: [],
        source: 'unavailable',
        status: 'FETCH_FAILED',
        reason,
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    }
  }
}
