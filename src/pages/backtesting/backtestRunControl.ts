import type { TradeDirection } from '../../types';

export type BacktestRunRequest = {
  configKey: string;
  strategyId: string;
  symbol: string;
  direction: TradeDirection;
  interval: string;
  bars: number;
  maxHoldBars: number;
  commissionPct: number;
  slippagePct: number;
  fundingPct: number;
  parameters?: Record<string, number | string>;
};

export type BacktestConfigIdentity = Omit<BacktestRunRequest, 'configKey'>;

function orderedParameters(parameters: Record<string, number | string> | undefined): Record<string, number | string> | undefined {
  if (!parameters || !Object.keys(parameters).length) return undefined;
  return Object.fromEntries(Object.entries(parameters).sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Includes every server-affecting input so a changed cost assumption or
 * Strategy Studio parameter invalidates the previous result and cancels an
 * in-flight request. Parameter ordering is normalized for stable identity.
 */
export function buildBacktestConfigKey(request: BacktestConfigIdentity): string {
  return JSON.stringify({
    strategyId: request.strategyId,
    symbol: request.symbol,
    direction: request.direction,
    interval: request.interval,
    bars: request.bars,
    maxHoldBars: request.maxHoldBars,
    commissionPct: request.commissionPct,
    slippagePct: request.slippagePct,
    fundingPct: request.fundingPct,
    parameters: orderedParameters(request.parameters),
  });
}

export function buildBacktestQuery(request: BacktestRunRequest): URLSearchParams {
  const query = new URLSearchParams({
    strategy: request.strategyId,
    symbol: request.symbol,
    direction: request.direction,
    interval: request.interval,
    bars: String(request.bars),
    maxBars: String(request.maxHoldBars),
    commissionPct: String(request.commissionPct),
    slippagePct: String(request.slippagePct),
    fundingPct: String(request.fundingPct),
  });
  const parameters = orderedParameters(request.parameters);
  if (parameters) {
    query.set('parameters', JSON.stringify(parameters));
  }
  return query;
}

export function isBacktestAbortError(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'name' in value && value.name === 'AbortError');
}

/**
 * Ensures only the most recently started request may commit a result. Aborting
 * the transport is not sufficient because a response can settle after abort.
 */
export class LatestRequestGate {
  private currentRequestId = 0;
  private currentConfigKey: string | null = null;

  begin(configKey?: string): number {
    this.currentRequestId += 1;
    this.currentConfigKey = configKey ?? null;
    return this.currentRequestId;
  }

  invalidate(): void {
    this.currentRequestId += 1;
    this.currentConfigKey = null;
  }

  isCurrent(requestId: number, activeConfigKey?: string): boolean {
    return requestId === this.currentRequestId
      && (activeConfigKey === undefined || this.currentConfigKey === activeConfigKey);
  }
}
