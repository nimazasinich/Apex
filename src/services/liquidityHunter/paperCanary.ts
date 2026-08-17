import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { LiquidityHunterEvaluation } from '../../contracts/realtime/liquidityHunterState';

export type LiquidityHunterPaperCanaryStatus = 'OPEN' | 'INVALIDATED' | 'HIT_2R' | 'EXPIRED';

export interface LiquidityHunterPaperCanaryRecord {
  id: string;
  setupId: string;
  evaluationId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  signalAt: number;
  expiresAt: number;
  entryPrice: number;
  invalidationPrice: number;
  oneRPrice: number;
  twoRPrice: number;
  fusionScore: number;
  status: LiquidityHunterPaperCanaryStatus;
  oneRHitAt: number | null;
  resolvedAt: number | null;
  lastPrice: number;
  mfePct: number;
  maePct: number;
  reason: string | null;
}

export interface LiquidityHunterPaperCanarySnapshot {
  enabled: boolean;
  executionDependency: false;
  orderSubmissionAllowed: false;
  open: number;
  resolved: number;
  records: LiquidityHunterPaperCanaryRecord[];
  lastPersistenceError: string | null;
}

export interface LiquidityHunterPaperCanaryOptions {
  enabled: boolean;
  storePath?: string | null;
  horizonMs?: number;
  maxRecords?: number;
  now?: () => number;
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function priceFromEvent(event: MarketEvent): number | null {
  if (!event.payload || typeof event.payload !== 'object') return null;
  const row = event.payload as Record<string, unknown>;
  if (event.type === 'TRADE') return finitePositive(row.price);
  if (event.type === 'QUOTE') {
    const bid = finitePositive(row.bid);
    const ask = finitePositive(row.ask);
    return bid !== null && ask !== null && ask >= bid ? (bid + ask) / 2 : null;
  }
  return null;
}

function isRecord(value: unknown): value is LiquidityHunterPaperCanaryRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as LiquidityHunterPaperCanaryRecord;
  return typeof row.id === 'string'
    && typeof row.setupId === 'string'
    && typeof row.evaluationId === 'string'
    && typeof row.symbol === 'string'
    && (row.direction === 'LONG' || row.direction === 'SHORT')
    && Number.isFinite(row.signalAt)
    && Number.isFinite(row.expiresAt)
    && Number.isFinite(row.entryPrice)
    && Number.isFinite(row.invalidationPrice)
    && Number.isFinite(row.oneRPrice)
    && Number.isFinite(row.twoRPrice)
    && ['OPEN', 'INVALIDATED', 'HIT_2R', 'EXPIRED'].includes(row.status);
}

/**
 * Research-only paper canary. It never talks to an exchange, never creates a
 * TradePlan, and never authorizes execution. It records the signal-time price
 * of a manually-confirmable Liquidity Hunter setup and tracks deterministic
 * invalidation / 1R / 2R touch behavior from subsequent public market events.
 */
export class LiquidityHunterPaperCanary {
  private readonly enabled: boolean;
  private readonly storePath: string | null;
  private readonly horizonMs: number;
  private readonly maxRecords: number;
  private readonly now: () => number;
  private readonly records = new Map<string, LiquidityHunterPaperCanaryRecord>();
  private persistChain: Promise<void> = Promise.resolve();
  private lastPersistenceError: string | null = null;
  private loaded = false;

  constructor(options: LiquidityHunterPaperCanaryOptions) {
    this.enabled = options.enabled;
    this.storePath = options.storePath ? path.resolve(options.storePath) : null;
    this.horizonMs = Math.max(60_000, Math.min(24 * 60 * 60_000, Math.floor(options.horizonMs ?? 60 * 60_000)));
    this.maxRecords = Math.max(10, Math.min(10_000, Math.floor(options.maxRecords ?? 1_000)));
    this.now = options.now ?? Date.now;
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.enabled || !this.storePath) return;
    try {
      const parsed = JSON.parse(await readFile(this.storePath, 'utf8')) as unknown;
      if (!Array.isArray(parsed)) throw new Error('paper_canary_store_invalid');
      for (const value of parsed) if (isRecord(value)) this.records.set(value.setupId, structuredClone(value));
      this.prune();
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
      this.lastPersistenceError = error instanceof Error ? error.message : String(error);
    }
  }

  hasSetup(setupId: string | null | undefined): boolean {
    return Boolean(setupId && this.records.has(setupId));
  }

  capture(evaluation: LiquidityHunterEvaluation, signalPrice: number, now = this.now()): LiquidityHunterPaperCanaryRecord | null {
    if (!this.enabled || !evaluation.eligibleForManualConfirmation || !evaluation.setupId || !evaluation.trigger.direction) return null;
    if (this.records.has(evaluation.setupId)) return structuredClone(this.records.get(evaluation.setupId)!);
    if (!Number.isFinite(signalPrice) || signalPrice <= 0) return null;
    const invalidationPrice = evaluation.trigger.invalidationPrice;
    if (invalidationPrice === null || !Number.isFinite(invalidationPrice) || invalidationPrice <= 0) return null;
    const direction = evaluation.trigger.direction;
    if ((direction === 'LONG' && invalidationPrice >= signalPrice) || (direction === 'SHORT' && invalidationPrice <= signalPrice)) return null;
    const risk = Math.abs(signalPrice - invalidationPrice);
    if (!(risk > 0)) return null;
    const record: LiquidityHunterPaperCanaryRecord = {
      id: `lh-paper:${evaluation.setupId}`,
      setupId: evaluation.setupId,
      evaluationId: evaluation.evaluationId,
      symbol: evaluation.symbol,
      direction,
      signalAt: now,
      expiresAt: now + this.horizonMs,
      entryPrice: signalPrice,
      invalidationPrice,
      oneRPrice: direction === 'LONG' ? signalPrice + risk : signalPrice - risk,
      twoRPrice: direction === 'LONG' ? signalPrice + risk * 2 : signalPrice - risk * 2,
      fusionScore: evaluation.fusionScore,
      status: 'OPEN',
      oneRHitAt: null,
      resolvedAt: null,
      lastPrice: signalPrice,
      mfePct: 0,
      maePct: 0,
      reason: null,
    };
    this.records.set(record.setupId, record);
    this.prune();
    this.schedulePersist();
    return structuredClone(record);
  }

  onMarketEvent(event: MarketEvent): void {
    if (!this.enabled || (event.type !== 'TRADE' && event.type !== 'QUOTE')) return;
    const price = priceFromEvent(event);
    if (price === null) return;
    const now = event.exchangeTimestamp;
    let changed = false;
    for (const record of this.records.values()) {
      if (record.status !== 'OPEN' || record.symbol !== event.symbol || now < record.signalAt) continue;
      record.lastPrice = price;
      const signedMovePct = (record.direction === 'LONG' ? 1 : -1) * (price - record.entryPrice) / record.entryPrice * 100;
      record.mfePct = Math.max(record.mfePct, signedMovePct);
      record.maePct = Math.min(record.maePct, signedMovePct);
      const invalidated = record.direction === 'LONG' ? price <= record.invalidationPrice : price >= record.invalidationPrice;
      const hitOneR = record.direction === 'LONG' ? price >= record.oneRPrice : price <= record.oneRPrice;
      const hitTwoR = record.direction === 'LONG' ? price >= record.twoRPrice : price <= record.twoRPrice;
      if (invalidated) {
        record.status = 'INVALIDATED';
        record.resolvedAt = now;
        record.reason = 'deterministic_invalidation_touched';
      } else if (hitTwoR) {
        if (record.oneRHitAt === null) record.oneRHitAt = now;
        record.status = 'HIT_2R';
        record.resolvedAt = now;
        record.reason = 'two_r_touched_before_invalidation';
      } else if (hitOneR && record.oneRHitAt === null) {
        record.oneRHitAt = now;
      } else if (now >= record.expiresAt) {
        record.status = 'EXPIRED';
        record.resolvedAt = now;
        record.reason = 'paper_canary_horizon_expired';
      }
      changed = true;
    }
    if (changed) this.schedulePersist();
  }

  expire(now = this.now()): void {
    let changed = false;
    for (const record of this.records.values()) {
      if (record.status !== 'OPEN' || now < record.expiresAt) continue;
      record.status = 'EXPIRED';
      record.resolvedAt = now;
      record.reason = 'paper_canary_horizon_expired';
      changed = true;
    }
    if (changed) this.schedulePersist();
  }

  snapshot(limit = 200): LiquidityHunterPaperCanarySnapshot {
    this.expire();
    const records = [...this.records.values()]
      .sort((a, b) => b.signalAt - a.signalAt)
      .slice(0, Math.max(1, Math.min(this.maxRecords, Math.floor(limit))))
      .map((record) => structuredClone(record));
    return {
      enabled: this.enabled,
      executionDependency: false,
      orderSubmissionAllowed: false,
      open: [...this.records.values()].filter((record) => record.status === 'OPEN').length,
      resolved: [...this.records.values()].filter((record) => record.status !== 'OPEN').length,
      records,
      lastPersistenceError: this.lastPersistenceError,
    };
  }

  async flush(): Promise<void> {
    await this.persistChain;
  }

  private prune(): void {
    if (this.records.size <= this.maxRecords) return;
    const sorted = [...this.records.values()].sort((a, b) => b.signalAt - a.signalAt);
    this.records.clear();
    for (const record of sorted.slice(0, this.maxRecords)) this.records.set(record.setupId, record);
  }

  private schedulePersist(): void {
    if (!this.enabled || !this.storePath) return;
    const snapshot = [...this.records.values()].sort((a, b) => b.signalAt - a.signalAt);
    this.persistChain = this.persistChain.then(async () => {
      try {
        await mkdir(path.dirname(this.storePath!), { recursive: true, mode: 0o700 });
        const temp = `${this.storePath}.tmp-${process.pid}`;
        await writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await rename(temp, this.storePath!);
        this.lastPersistenceError = null;
      } catch (error) {
        this.lastPersistenceError = error instanceof Error ? error.message : String(error);
      }
    });
  }
}
