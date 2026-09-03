import { describe, expect, it } from 'vitest';
import { buildRuntimeProviderCapabilityHealth } from '../contracts/providerCapabilityHealth';

describe('capability-specific provider health', () => {
  it('does not promote connectivity into unprobed market capabilities', () => {
    const rows = buildRuntimeProviderCapabilityHealth({
      checkedAt: 1000,
      kucoin: { status: 'live', reason: null },
      binance: { status: 'live', reason: null },
      supplementalConfigured: true,
    });
    const kucoin = rows.find((row) => row.provider === 'kucoin')!;
    expect(kucoin.capabilities.connectivity.state).toBe('OK');
    expect(kucoin.capabilities.candles.state).toBe('NEVER_PROBED');
    expect(kucoin.capabilities.funding.state).toBe('NEVER_PROBED');
    expect(kucoin.capabilities.orderbook.state).toBe('NEVER_PROBED');
  });

  it('keeps unsupported Tabdeal market-history capabilities explicit', () => {
    const rows = buildRuntimeProviderCapabilityHealth({
      checkedAt: 1000,
      kucoin: { status: 'unavailable', reason: 'offline' },
      binance: { status: 'unavailable', reason: 'offline' },
      supplementalConfigured: false,
    });
    const tabdeal = rows.find((row) => row.provider === 'tabdeal')!;
    expect(tabdeal.capabilities.historicalKlines.state).toBe('NOT_SUPPORTED');
    expect(tabdeal.capabilities.fundingHistory.state).toBe('NOT_SUPPORTED');
  });
});
