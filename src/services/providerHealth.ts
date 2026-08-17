/* Copied from apex-trading-engine/src/services/providerHealth.ts */

/**
 * Provider Health Tracking
 * Monitors provider availability, rate limiting, and errors
 */

import { ProviderHealth, SupplementalCategory } from './providers/supplementalTypes';

export class ProviderHealthTracker {
  private health = new Map<string, ProviderHealth>();
  private readonly rateLimitWindow = 60 * 1000; // 1 minute
  private readonly maxFailuresBeforeUnhealthy = 3;
  private readonly healthCheckInterval = 30 * 1000; // 30 seconds

  constructor() {
    // Initialize health tracking for known providers
    this._initializeProvider('NewsAPI', 'news');
    this._initializeProvider('CoinMarketCap', 'market');
    this._initializeProvider('HuggingFace', 'sentiment');
    this._initializeProvider('NewsSentiment', 'sentiment');
    this._initializeProvider('Etherscan', 'onchain');
    this._initializeProvider('TronScan', 'onchain');
    this._initializeProvider('BscScan', 'onchain');
  }

  private _initializeProvider(name: string, category: SupplementalCategory): void {
    this.health.set(name, {
      name,
      category,
      isConfigured: false,
      isHealthy: true,
      lastCheckTime: Date.now(),
      failureCount: 0,
    });
  }

  /**
   * Mark a provider as configured
   */
  markConfigured(name: string): void {
    const h = this.health.get(name);
    if (h) {
      h.isConfigured = true;
    }
  }

  /**
   * Record a successful fetch
   */
  recordSuccess(name: string): void {
    const h = this.health.get(name);
    if (h) {
      h.lastSuccessTime = Date.now();
      h.failureCount = 0;
      h.isHealthy = true;
      h.lastCheckTime = Date.now();
      h.rateLimitedUntil = undefined;
    }
  }

  /**
   * Record a failure
   */
  recordFailure(name: string, reason: string, isRateLimited = false): void {
    const h = this.health.get(name);
    if (h) {
      h.failureCount += 1;
      h.lastCheckTime = Date.now();
      h.reason = reason;
      
      if (isRateLimited) {
        // Back off for 5 minutes after rate limit
        h.rateLimitedUntil = Date.now() + 5 * 60 * 1000;
        h.isHealthy = false;
      } else if (h.failureCount >= this.maxFailuresBeforeUnhealthy) {
        h.isHealthy = false;
      }
    }
  }

  /**
   * Check if provider is rate limited
   */
  isRateLimited(name: string): boolean {
    const h = this.health.get(name);
    if (!h || !h.rateLimitedUntil) return false;
    
    if (Date.now() > h.rateLimitedUntil) {
      h.rateLimitedUntil = undefined;
      h.failureCount = 0;
      h.isHealthy = true;
      return false;
    }
    return true;
  }

  /**
   * Get health status for a provider
   */
  getHealth(name: string): ProviderHealth | undefined {
    return this.health.get(name);
  }

  /**
   * Get health status for all providers
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Get health status by category
   */
  getHealthByCategory(category: SupplementalCategory): ProviderHealth[] {
    return Array.from(this.health.values()).filter(h => h.category === category);
  }

  /**
   * Get human-readable status summary
   */
  getSummary(): {
    configuredProviders: number;
    configuredHealthyProviders: number;
    configuredUnhealthyProviders: number;
    unconfiguredProviders: number;
    healthyProviders: number;
    rateLimitedProviders: string[];
    unhealthyProviders: string[];
  } {
    const allHealth = this.getAllHealth();
    const configuredItems = allHealth.filter(h => h.isConfigured);
    const configured = configuredItems.length;
    const configuredHealthy = configuredItems.filter(h => h.isHealthy).length;
    const configuredUnhealthy = configuredItems.filter(h => !h.isHealthy).length;
    const healthy = allHealth.filter(h => h.isHealthy).length;
    const rateLimited = allHealth
      .filter(h => h.rateLimitedUntil && Date.now() < h.rateLimitedUntil)
      .map(h => h.name);
    const unhealthy = allHealth
      .filter(h => !h.isHealthy && (!h.rateLimitedUntil || Date.now() > h.rateLimitedUntil))
      .map(h => h.name);

    return {
      configuredProviders: configured,
      configuredHealthyProviders: configuredHealthy,
      configuredUnhealthyProviders: configuredUnhealthy,
      unconfiguredProviders: allHealth.length - configured,
      healthyProviders: healthy,
      rateLimitedProviders: rateLimited,
      unhealthyProviders: unhealthy,
    };
  }

  /**
   * Reset all health tracking
   */
  reset(): void {
    for (const h of this.health.values()) {
      h.failureCount = 0;
      h.isHealthy = true;
      h.lastCheckTime = Date.now();
      h.rateLimitedUntil = undefined;
      h.reason = undefined;
    }
  }
}

/**
 * Singleton instance
 */
let instance: ProviderHealthTracker | null = null;

export function getProviderHealthTracker(): ProviderHealthTracker {
  if (!instance) {
    instance = new ProviderHealthTracker();
  }
  return instance;
}