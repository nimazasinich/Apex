/**
 * Numerically stable, bounded online statistics for shadow market analysis.
 *
 * These utilities are intentionally independent from order execution. They are
 * used to smooth observability/lifecycle inputs and to build diagnostics without
 * changing scanner gates or financial calculations.
 */

import type { OITrendDirection } from '../types';

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${label}_must_be_finite`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface EWMASnapshot {
  alpha: number;
  samples: number;
  value: number | null;
}

export class EWMATracker {
  private currentValue: number | null = null;
  private sampleCount = 0;

  constructor(readonly alpha: number) {
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
      throw new RangeError('ewma_alpha_out_of_range');
    }
  }

  update(value: number): number {
    assertFinite(value, 'ewma_value');
    this.currentValue = this.currentValue === null
      ? value
      : this.alpha * value + (1 - this.alpha) * this.currentValue;
    this.sampleCount += 1;
    return this.currentValue;
  }

  get current(): number | null {
    return this.currentValue;
  }

  get samples(): number {
    return this.sampleCount;
  }

  snapshot(): EWMASnapshot {
    return { alpha: this.alpha, samples: this.sampleCount, value: this.currentValue };
  }

  reset(): void {
    this.currentValue = null;
    this.sampleCount = 0;
  }
}

export interface WelfordSnapshot {
  samples: number;
  mean: number;
  sampleVariance: number;
  populationVariance: number;
  standardDeviation: number;
}

export class WelfordNormalizer {
  private sampleCount = 0;
  private runningMean = 0;
  private m2 = 0;

  update(value: number): WelfordSnapshot {
    assertFinite(value, 'welford_value');
    this.sampleCount += 1;
    const delta = value - this.runningMean;
    this.runningMean += delta / this.sampleCount;
    const delta2 = value - this.runningMean;
    this.m2 += delta * delta2;
    return this.snapshot();
  }

  get samples(): number {
    return this.sampleCount;
  }

  get mean(): number {
    return this.runningMean;
  }

  get sampleVariance(): number {
    return this.sampleCount > 1 ? this.m2 / (this.sampleCount - 1) : 0;
  }

  get populationVariance(): number {
    return this.sampleCount > 0 ? this.m2 / this.sampleCount : 0;
  }

  get standardDeviation(): number {
    return Math.sqrt(Math.max(0, this.sampleVariance));
  }

  zScore(value: number): number {
    assertFinite(value, 'welford_zscore_value');
    const deviation = this.standardDeviation;
    return deviation > 0 ? (value - this.runningMean) / deviation : 0;
  }

  snapshot(): WelfordSnapshot {
    return {
      samples: this.sampleCount,
      mean: this.runningMean,
      sampleVariance: this.sampleVariance,
      populationVariance: this.populationVariance,
      standardDeviation: this.standardDeviation,
    };
  }

  reset(): void {
    this.sampleCount = 0;
    this.runningMean = 0;
    this.m2 = 0;
  }
}

export interface OITrendSnapshot {
  timestamp: number;
  openInterest: number;
}

export interface OITrendState {
  symbol: string;
  snapshots: OITrendSnapshot[];
  trend: OITrendDirection;
  changeFraction: number;
  changePercent: number;
  updatedAt: number;
}

export interface OITrendTrackerOptions {
  windowSize?: number;
  expandThresholdFraction?: number;
  contractThresholdFraction?: number;
}

export class OITrendTracker {
  private readonly states = new Map<string, OITrendState>();
  private readonly windowSize: number;
  private readonly expandThreshold: number;
  private readonly contractThreshold: number;

  constructor(options: OITrendTrackerOptions = {}) {
    this.windowSize = Math.max(2, Math.floor(options.windowSize ?? 20));
    this.expandThreshold = Math.max(0, options.expandThresholdFraction ?? 0.003);
    this.contractThreshold = Math.min(0, options.contractThresholdFraction ?? -0.003);
  }

  record(symbol: string, openInterest: number, timestamp = Date.now()): OITrendState {
    const key = symbol.trim().toUpperCase();
    if (!key) throw new TypeError('oi_symbol_required');
    assertFinite(openInterest, 'open_interest');
    assertFinite(timestamp, 'oi_timestamp');
    if (openInterest < 0) throw new RangeError('open_interest_must_be_non_negative');

    const existing = this.states.get(key)?.snapshots ?? [];
    const snapshots = [...existing, { timestamp, openInterest }]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-this.windowSize);
    const oldest = snapshots[0]?.openInterest ?? openInterest;
    const newest = snapshots.at(-1)?.openInterest ?? openInterest;
    const changeFraction = oldest > 0 ? (newest - oldest) / oldest : 0;
    const trend: OITrendDirection = changeFraction >= this.expandThreshold
      ? 'EXPANDING'
      : changeFraction <= this.contractThreshold
        ? 'CONTRACTING'
        : 'NEUTRAL';
    const state: OITrendState = {
      symbol: key,
      snapshots,
      trend,
      changeFraction,
      changePercent: changeFraction * 100,
      updatedAt: timestamp,
    };
    this.states.set(key, state);
    return this.clone(state);
  }

  get(symbol: string): OITrendState | null {
    const state = this.states.get(symbol.trim().toUpperCase());
    return state ? this.clone(state) : null;
  }

  clear(symbol: string): void {
    this.states.delete(symbol.trim().toUpperCase());
  }

  clearAll(): void {
    this.states.clear();
  }

  private clone(state: OITrendState): OITrendState {
    return { ...state, snapshots: state.snapshots.map((snapshot) => ({ ...snapshot })) };
  }
}

export type SmoothedMetric = 'obi' | 'volumeDelta' | 'atr';

export interface SymbolStatisticsSnapshot {
  symbol: string;
  obi: EWMASnapshot | null;
  volumeDelta: EWMASnapshot | null;
  atr: EWMASnapshot | null;
  obiDistribution: WelfordSnapshot | null;
}

export interface TrackedSymbolStatisticsSnapshot extends SymbolStatisticsSnapshot {
  lastTouchedAt: number;
}

interface SymbolTrackers {
  obi?: EWMATracker;
  volumeDelta?: EWMATracker;
  atr?: EWMATracker;
  obiDistribution?: WelfordNormalizer;
  lastTouchedAt: number;
  lastTouchedOrder: number;
}

/**
 * Per-symbol smoothing registry with a hard symbol cap to avoid unbounded
 * browser memory growth. Eviction is least-recently-used and affects only
 * shadow statistics.
 */
export class SymbolStatisticsRegistry {
  private readonly trackers = new Map<string, SymbolTrackers>();
  private touchOrder = 0;

  constructor(private readonly maxSymbols = 200) {
    if (!Number.isFinite(maxSymbols) || maxSymbols < 1) throw new RangeError('max_symbols_out_of_range');
  }

  smoothOBI(symbol: string, raw: number): number {
    const row = this.row(symbol);
    row.obi ??= new EWMATracker(0.30);
    row.obiDistribution ??= new WelfordNormalizer();
    row.obiDistribution.update(raw);
    return clamp(row.obi.update(raw), -1, 1);
  }

  smoothVolumeDelta(symbol: string, raw: number): number {
    const row = this.row(symbol);
    row.volumeDelta ??= new EWMATracker(0.30);
    return row.volumeDelta.update(raw);
  }

  smoothATR(symbol: string, raw: number): number {
    const row = this.row(symbol);
    row.atr ??= new EWMATracker(0.15);
    return Math.max(0, row.atr.update(raw));
  }

  obiZScore(symbol: string, value: number): number {
    const row = this.row(symbol);
    row.obiDistribution ??= new WelfordNormalizer();
    return row.obiDistribution.zScore(value);
  }

  snapshot(symbol: string): SymbolStatisticsSnapshot {
    const key = this.key(symbol);
    const row = this.trackers.get(key);
    return {
      symbol: key,
      obi: row?.obi?.snapshot() ?? null,
      volumeDelta: row?.volumeDelta?.snapshot() ?? null,
      atr: row?.atr?.snapshot() ?? null,
      obiDistribution: row?.obiDistribution?.snapshot() ?? null,
    };
  }

  listSnapshots(limit = 20): TrackedSymbolStatisticsSnapshot[] {
    const boundedLimit = Math.max(1, Math.min(this.maxSymbols, Math.floor(Number.isFinite(limit) ? limit : 20)));
    return [...this.trackers.entries()]
      .sort((a, b) => b[1].lastTouchedOrder - a[1].lastTouchedOrder)
      .slice(0, boundedLimit)
      .map(([symbol, row]) => ({
        symbol,
        lastTouchedAt: row.lastTouchedAt,
        obi: row.obi?.snapshot() ?? null,
        volumeDelta: row.volumeDelta?.snapshot() ?? null,
        atr: row.atr?.snapshot() ?? null,
        obiDistribution: row.obiDistribution?.snapshot() ?? null,
      }));
  }

  resetSymbol(symbol: string): void {
    this.trackers.delete(this.key(symbol));
  }

  resetAll(): void {
    this.trackers.clear();
  }

  get symbolCount(): number {
    return this.trackers.size;
  }

  private key(symbol: string): string {
    const key = symbol.trim().toUpperCase();
    if (!key) throw new TypeError('statistics_symbol_required');
    return key;
  }

  private row(symbol: string): SymbolTrackers {
    const key = this.key(symbol);
    let row = this.trackers.get(key);
    if (!row) {
      if (this.trackers.size >= this.maxSymbols) {
        let oldestKey: string | null = null;
        let oldestOrder = Number.POSITIVE_INFINITY;
        for (const [candidate, value] of this.trackers) {
          if (value.lastTouchedOrder < oldestOrder) {
            oldestKey = candidate;
            oldestOrder = value.lastTouchedOrder;
          }
        }
        if (oldestKey) this.trackers.delete(oldestKey);
      }
      row = { lastTouchedAt: Date.now(), lastTouchedOrder: ++this.touchOrder };
      this.trackers.set(key, row);
    }
    row.lastTouchedAt = Date.now();
    row.lastTouchedOrder = ++this.touchOrder;
    return row;
  }
}

export const marketStatistics = new SymbolStatisticsRegistry();
export const openInterestTrends = new OITrendTracker();
