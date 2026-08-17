import type { InProcessEventBus } from './inProcessEventBus';
import { BinanceUsdmPublicFeed } from './binanceUsdmPublicFeed';
import { BybitLinearPublicFeed } from './bybitLinearPublicFeed';
import { KuCoinFuturesPublicFeed } from './kucoinFuturesPublicFeed';
import { normalizeCanonicalSymbols, type PublicFeedSnapshot } from './publicFeedTypes';

export interface PublicFeedManagerOptions {
  enabled: boolean;
  binanceEnabled: boolean;
  kucoinEnabled: boolean;
  bybitEnabled: boolean;
  symbols: string[];
  eventBus: InProcessEventBus;
}

export interface PublicFeedManagerSnapshot {
  enabled: boolean;
  symbols: string[];
  feeds: PublicFeedSnapshot[];
}

export class PublicFeedManager {
  private readonly symbols: string[];
  private readonly binance: BinanceUsdmPublicFeed;
  private readonly kucoin: KuCoinFuturesPublicFeed;
  private readonly bybit: BybitLinearPublicFeed;
  private readonly enabled: boolean;

  constructor(options: PublicFeedManagerOptions) {
    this.symbols = normalizeCanonicalSymbols(options.symbols);
    this.enabled = options.enabled && this.symbols.length > 0;
    this.binance = new BinanceUsdmPublicFeed({
      enabled: this.enabled && options.binanceEnabled,
      symbols: this.symbols,
      eventBus: options.eventBus,
      restBase: process.env.BINANCE_PROXY_BASE_URL || process.env.BINANCE_FUTURES_BASE || undefined,
    });
    this.kucoin = new KuCoinFuturesPublicFeed({
      enabled: this.enabled && options.kucoinEnabled,
      symbols: this.symbols,
      eventBus: options.eventBus,
    });
    this.bybit = new BybitLinearPublicFeed({
      enabled: this.enabled && options.bybitEnabled,
      symbols: this.symbols,
      eventBus: options.eventBus,
    });
  }

  start(): void {
    if (!this.enabled) return;
    this.binance.start();
    this.kucoin.start();
    this.bybit.start();
  }

  async stop(): Promise<void> {
    await Promise.allSettled([this.binance.stop(), this.kucoin.stop(), this.bybit.stop()]);
  }

  snapshot(): PublicFeedManagerSnapshot {
    return {
      enabled: this.enabled,
      symbols: [...this.symbols],
      feeds: [this.binance.snapshot(), this.kucoin.snapshot(), this.bybit.snapshot()],
    };
  }
}
