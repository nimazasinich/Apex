/**
 * Exchange-agnostic live-risk telemetry derivation.
 *
 * This module deliberately has no exchange client, network, session, or order
 * dependencies. It derives only metrics supported by snapshots supplied by the
 * caller and leaves incomplete evidence as null/UNKNOWN.
 */

function finite(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalFiniteFrom(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function timestampMs(record: Record<string, unknown>): number | null {
  const raw = optionalFiniteFrom(record, ['closeTime', 'closedAt', 'updatedAt', 'createdAt', 'timestamp', 'time']);
  if (raw == null || raw <= 0) return null;
  return raw < 10_000_000_000 ? raw * 1000 : raw;
}

function realizedPnlUsd(record: Record<string, unknown>): number | null {
  return optionalFiniteFrom(record, [
    'realizedPnl', 'realisedPnl', 'realisedPNL', 'realizedPnlUsd', 'realisedPnlUsd',
    'pnl', 'closedPnl', 'closedPnlUsd',
  ]);
}

function positionQuantity(position: Record<string, unknown>): number {
  return finite(position.currentQty || position.qty || position.size);
}

function positionNotional(position: Record<string, unknown>): number {
  const quantity = Math.abs(positionQuantity(position));
  const multiplier = finite(position.multiplier || position.contractMultiplier) || 1;
  const mark = finite(position.markPrice || position.currentPrice || position.avgEntryPrice);
  return quantity * multiplier * mark;
}

function positionRiskUsd(position: Record<string, unknown>): number | null {
  const quantity = Math.abs(positionQuantity(position));
  if (quantity <= 0) return 0;
  const multiplier = optionalFiniteFrom(position, ['multiplier', 'contractMultiplier']) ?? 1;
  const entry = optionalFiniteFrom(position, ['avgEntryPrice', 'avgEntry', 'entryPrice']);
  const liquidation = optionalFiniteFrom(position, ['liquidationPrice', 'liquidationPriceMark', 'liqPrice']);
  const notional = positionNotional(position);
  if (entry != null && entry > 0 && liquidation != null && liquidation > 0 && multiplier > 0) {
    return Math.min(notional || Number.POSITIVE_INFINITY, quantity * multiplier * Math.abs(entry - liquidation));
  }
  const explicitMargin = optionalFiniteFrom(position, ['positionMargin', 'posMargin', 'initialMargin', 'posInit']);
  if (explicitMargin != null && explicitMargin >= 0) return explicitMargin;
  const leverage = optionalFiniteFrom(position, ['realLeverage', 'leverage']);
  if (notional > 0 && leverage != null && leverage > 0) return notional / leverage;
  return null;
}

export interface LiveRiskTelemetry {
  totalOpenRiskUsd: number | null;
  dailyPnlUsd: number | null;
  weeklyPnlUsd: number | null;
  drawdownPct: number | null;
  consecutiveLosses: number | null;
  historyAvailable: boolean;
  historyTruncated: boolean;
}

export function deriveLiveRiskTelemetry(input: {
  account: Record<string, unknown>;
  positions: Array<Record<string, unknown>>;
  positionHistory: Array<Record<string, unknown>>;
  historyAvailable: boolean;
  historyTruncated?: boolean;
  now?: number;
}): LiveRiskTelemetry {
  const now = input.now ?? Date.now();
  const open = input.positions.filter((position) => Math.abs(positionQuantity(position)) > 0);
  const riskRows = open.map(positionRiskUsd);
  // Fail honest: if any leg's risk is unknown, the total is unknown rather
  // than a smaller-looking number. The cast is safe because the guard above
  // has already excluded every null.
  const totalOpenRiskUsd = riskRows.some((value) => value == null)
    ? null
    : (riskRows as number[]).reduce((sum, value) => sum + value, 0);

  const historyTruncated = input.historyTruncated === true;
  const historyRows = input.positionHistory
    .map((row) => ({ timestamp: timestampMs(row), pnl: realizedPnlUsd(row) }))
    .filter((row) => row.pnl != null);
  const temporalIncomplete = historyRows.some((row) => row.timestamp == null);
  const historyUsable = input.historyAvailable && !historyTruncated && !temporalIncomplete;
  let dailyPnlUsd: number | null = null;
  let weeklyPnlUsd: number | null = null;
  let consecutiveLosses: number | null = null;
  if (historyUsable) {
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    dailyPnlUsd = historyRows.filter((row) => (row.timestamp ?? 0) >= dayAgo).reduce((sum, row) => sum + (row.pnl ?? 0), 0);
    weeklyPnlUsd = historyRows.filter((row) => (row.timestamp ?? 0) >= weekAgo).reduce((sum, row) => sum + (row.pnl ?? 0), 0);
    consecutiveLosses = 0;
    for (const row of [...historyRows].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))) {
      if ((row.pnl ?? 0) < 0) consecutiveLosses += 1;
      else break;
    }
  }

  // Only an exchange/account supplied drawdown measure is accepted. Seven-day
  // realized PnL is not equivalent to account peak-to-trough drawdown.
  const drawdownPct = optionalFiniteFrom(input.account, ['drawdownPct', 'currentDrawdownPct', 'maxDrawdownPct']);
  return {
    totalOpenRiskUsd,
    dailyPnlUsd,
    weeklyPnlUsd,
    drawdownPct: drawdownPct == null ? null : Math.max(0, drawdownPct),
    consecutiveLosses,
    historyAvailable: input.historyAvailable,
    historyTruncated,
  };
}
