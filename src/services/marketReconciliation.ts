import type { SymbolTicker } from '../types';

export const MARKET_RECONCILIATION_VERSION = 'market_reconciliation_v1';

export interface ReconciliationDiagnostic {
  instrument: string;
  observations: number;
  venues: string[];
  freshestObservedAt: number | null;
  priceDeviationBps: number | null;
  turnoverRatio: number | null;
  status: 'CONSISTENT' | 'PRICE_DIVERGENCE' | 'SINGLE_SOURCE' | 'UNKNOWN_TIME';
}

function instrument(row: SymbolTicker): string {
  return row.observationMetadata?.canonicalInstrumentId || row.symbol.toUpperCase().replace(/[-_/]/g, '');
}

export function reconcileTickerObservations(groups: SymbolTicker[][], maxPriceDeviationBps = 75): ReconciliationDiagnostic[] {
  const byInstrument = new Map<string, SymbolTicker[]>();
  for (const row of groups.flat()) {
    const key = instrument(row);
    byInstrument.set(key, [...(byInstrument.get(key) || []), row]);
  }
  return [...byInstrument.entries()].map(([key, rows]) => {
    const prices = rows.map((row) => Number(row.lastPrice)).filter((value) => Number.isFinite(value) && value > 0);
    const turnovers = rows.map((row) => Number(row.turnover24h)).filter((value) => Number.isFinite(value) && value > 0);
    const observed = rows.map((row) => row.observationMetadata?.sourceObservedAt ?? null).filter((value): value is number => Number.isFinite(value));
    const midpoint = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : 0;
    const priceDeviationBps = prices.length >= 2 && midpoint > 0 ? (Math.max(...prices) - Math.min(...prices)) / midpoint * 10_000 : null;
    const turnoverRatio = turnovers.length >= 2 ? Math.max(...turnovers) / Math.max(Number.EPSILON, Math.min(...turnovers)) : null;
    const venues = [...new Set(rows.map((row) => row.observationMetadata?.venue || row.observationMetadata?.provider || 'UNKNOWN'))];
    const status: ReconciliationDiagnostic['status'] = rows.length < 2
      ? 'SINGLE_SOURCE'
      : observed.length < rows.length
        ? 'UNKNOWN_TIME'
        : priceDeviationBps !== null && priceDeviationBps > maxPriceDeviationBps
          ? 'PRICE_DIVERGENCE'
          : 'CONSISTENT';
    return {
      instrument: key,
      observations: rows.length,
      venues,
      freshestObservedAt: observed.length ? Math.max(...observed) : null,
      priceDeviationBps: priceDeviationBps === null ? null : Number(priceDeviationBps.toFixed(3)),
      turnoverRatio: turnoverRatio === null ? null : Number(turnoverRatio.toFixed(3)),
      status,
    };
  }).sort((left, right) => left.instrument.localeCompare(right.instrument));
}
