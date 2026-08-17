import type { InProcessEventBus } from './inProcessEventBus';
import { DeribitOptionsPublicFeed } from './deribitOptionsPublicFeed';
import { HyblockLiquidationTopologyFeed } from './hyblockLiquidationTopologyFeed';
import { HyperliquidWalletObservationFeed } from './hyperliquidWalletObservationFeed';
import { HyperliquidWalletHistoryGradingFeed } from './hyperliquidWalletHistoryGradingFeed';
import { SentimentVelocityFeed } from './sentimentVelocityFeed';
import type { PublicFeedSnapshot } from './publicFeedTypes';

export interface EvidenceProviderManagerOptions {
  deribitOptionsEnabled: boolean;
  hyblockLiquidationEnabled: boolean;
  hyperliquidWalletObserverEnabled: boolean;
  hyperliquidWalletHistoryGradingEnabled: boolean;
  sentimentVelocityEnabled: boolean;
  symbols: string[];
  hyperliquidWallets?: string[];
  eventBus: InProcessEventBus;
  deribitFetchJson?: (url: string) => Promise<unknown>;
  deribitBaseUrl?: string;
  deribitPollIntervalMs?: number;
  hyblockApiKey?: string;
  hyblockFetchJson?: (url: string, headers: Record<string, string>) => Promise<unknown>;
  hyblockBaseUrl?: string;
  hyblockExchange?: string;
  hyblockLookback?: string;
  hyblockPollIntervalMs?: number;
  hyperliquidFetchJson?: (url: string, body: unknown) => Promise<unknown>;
  hyperliquidPollIntervalMs?: number;
  hyperliquidConcurrency?: number;
  hyperliquidHistoryPollIntervalMs?: number;
  hyperliquidHistoryLookbackDays?: number;
  hyperliquidHistoryConcurrency?: number;
  sentimentFetch?: ConstructorParameters<typeof SentimentVelocityFeed>[0]['fetchSentiment'];
  sentimentPollIntervalMs?: number;
  sentimentConcurrency?: number;
}

export interface EvidenceProviderManagerSnapshot {
  providers: PublicFeedSnapshot[];
}

/**
 * Provider manager for optional evidence sources that are not part of the core
 * Binance/KuCoin/Bybit market feeds. All providers remain shadow-only inputs and cannot
 * authorize execution.
 */
export class EvidenceProviderManager {
  private readonly deribitOptions: DeribitOptionsPublicFeed;
  private readonly hyblockLiquidation: HyblockLiquidationTopologyFeed;
  private readonly hyperliquidWalletObserver: HyperliquidWalletObservationFeed;
  private readonly hyperliquidWalletHistory: HyperliquidWalletHistoryGradingFeed;
  private readonly sentimentVelocity: SentimentVelocityFeed;

  constructor(options: EvidenceProviderManagerOptions) {
    this.deribitOptions = new DeribitOptionsPublicFeed({
      enabled: options.deribitOptionsEnabled,
      symbols: options.symbols,
      eventBus: options.eventBus,
      fetchJson: options.deribitFetchJson,
      baseUrl: options.deribitBaseUrl,
      pollIntervalMs: options.deribitPollIntervalMs,
    });
    this.hyblockLiquidation = new HyblockLiquidationTopologyFeed({
      enabled: options.hyblockLiquidationEnabled,
      apiKey: options.hyblockApiKey,
      symbols: options.symbols,
      eventBus: options.eventBus,
      fetchJson: options.hyblockFetchJson,
      baseUrl: options.hyblockBaseUrl,
      exchange: options.hyblockExchange,
      lookback: options.hyblockLookback,
      pollIntervalMs: options.hyblockPollIntervalMs,
    });
    this.hyperliquidWalletObserver = new HyperliquidWalletObservationFeed({
      enabled: options.hyperliquidWalletObserverEnabled,
      symbols: options.symbols,
      wallets: options.hyperliquidWallets ?? [],
      eventBus: options.eventBus,
      fetchJson: options.hyperliquidFetchJson,
      pollIntervalMs: options.hyperliquidPollIntervalMs,
      concurrency: options.hyperliquidConcurrency,
    });
    this.hyperliquidWalletHistory = new HyperliquidWalletHistoryGradingFeed({
      enabled: options.hyperliquidWalletHistoryGradingEnabled,
      symbols: options.symbols,
      wallets: options.hyperliquidWallets ?? [],
      eventBus: options.eventBus,
      fetchJson: options.hyperliquidFetchJson,
      pollIntervalMs: options.hyperliquidHistoryPollIntervalMs,
      lookbackDays: options.hyperliquidHistoryLookbackDays,
      concurrency: options.hyperliquidHistoryConcurrency,
    });
    this.sentimentVelocity = new SentimentVelocityFeed({
      enabled: options.sentimentVelocityEnabled,
      symbols: options.symbols,
      eventBus: options.eventBus,
      fetchSentiment: options.sentimentFetch,
      pollIntervalMs: options.sentimentPollIntervalMs,
      concurrency: options.sentimentConcurrency,
    });
  }

  start(): void {
    this.deribitOptions.start();
    this.hyblockLiquidation.start();
    this.hyperliquidWalletObserver.start();
    this.hyperliquidWalletHistory.start();
    this.sentimentVelocity.start();
  }

  async stop(): Promise<void> {
    await Promise.allSettled([
      this.deribitOptions.stop(),
      this.hyblockLiquidation.stop(),
      this.hyperliquidWalletObserver.stop(),
      this.hyperliquidWalletHistory.stop(),
      this.sentimentVelocity.stop(),
    ]);
  }

  snapshot(): EvidenceProviderManagerSnapshot {
    return {
      providers: [
        this.deribitOptions.snapshot(),
        this.hyblockLiquidation.snapshot(),
        this.hyperliquidWalletObserver.snapshot(),
        this.hyperliquidWalletHistory.snapshot(),
        this.sentimentVelocity.snapshot(),
      ],
    };
  }
}
