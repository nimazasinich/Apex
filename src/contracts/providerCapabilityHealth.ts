/** Capability-specific runtime health. A connectivity probe never implies data capability health. */
export type CapabilityHealthState =
  | 'OK'
  | 'DEGRADED'
  | 'FAIL'
  | 'NOT_CONFIGURED'
  | 'NEVER_PROBED'
  | 'NOT_SUPPORTED';

export interface CapabilityHealthObservation {
  state: CapabilityHealthState;
  observedAt: number | null;
  reason?: string | null;
}

export interface RuntimeProviderCapabilityHealth {
  provider: 'kucoin' | 'binance' | 'tabdeal' | 'supplemental';
  capabilities: Record<string, CapabilityHealthObservation>;
}

interface ConnectivityProbe {
  status: 'live' | 'degraded' | 'not_configured' | 'unavailable';
  reason: string | null;
}

function connectivity(probe: ConnectivityProbe, observedAt: number): CapabilityHealthObservation {
  if (probe.status === 'live') return { state: 'OK', observedAt, reason: null };
  if (probe.status === 'degraded') return { state: 'DEGRADED', observedAt, reason: probe.reason };
  if (probe.status === 'not_configured') return { state: 'NOT_CONFIGURED', observedAt, reason: probe.reason };
  return { state: 'FAIL', observedAt, reason: probe.reason };
}

const neverProbed = (reason = 'Capability was not probed by this health request.'): CapabilityHealthObservation => ({
  state: 'NEVER_PROBED', observedAt: null, reason,
});
const notSupported = (reason: string): CapabilityHealthObservation => ({ state: 'NOT_SUPPORTED', observedAt: null, reason });

export function buildRuntimeProviderCapabilityHealth(args: {
  checkedAt: number;
  kucoin: ConnectivityProbe;
  binance: ConnectivityProbe;
  supplementalConfigured: boolean;
}): RuntimeProviderCapabilityHealth[] {
  return [
    {
      provider: 'kucoin',
      capabilities: {
        connectivity: connectivity(args.kucoin, args.checkedAt),
        futuresTickers: neverProbed(),
        candles: neverProbed(),
        funding: neverProbed(),
        orderbook: neverProbed(),
        accountSnapshot: neverProbed('Private account capability is not exercised by the public system-health probe.'),
      },
    },
    {
      provider: 'binance',
      capabilities: {
        connectivity: connectivity(args.binance, args.checkedAt),
        futuresTickers: neverProbed(),
        candles: neverProbed(),
        funding: neverProbed(),
        orderbook: neverProbed(),
      },
    },
    {
      provider: 'tabdeal',
      capabilities: {
        connectivity: neverProbed('Tabdeal connectivity is not inferred from KuCoin/Binance public probes.'),
        accountSnapshot: neverProbed('Account health requires an authenticated Tabdeal account read.'),
        positions: neverProbed('Position health requires an authenticated Tabdeal position read.'),
        orders: neverProbed('Order health requires an authenticated Tabdeal order read.'),
        historicalKlines: notSupported('No Tabdeal FAPI historical-kline endpoint is documented by the adapter capability matrix.'),
        fundingHistory: notSupported('No Tabdeal FAPI funding-rate feed/history endpoint is documented by the adapter capability matrix.'),
      },
    },
    {
      provider: 'supplemental',
      capabilities: {
        sentiment: args.supplementalConfigured
          ? neverProbed('Configured providers are not called merely to make /api/system/health look healthy.')
          : { state: 'NOT_CONFIGURED', observedAt: null, reason: 'No sentiment provider is configured.' },
      },
    },
  ];
}
