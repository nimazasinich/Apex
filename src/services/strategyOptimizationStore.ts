import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDurableJsonFileSync, writeDurableJsonFileSync } from './durableJsonFile';
import type { ScannerConfig } from '../types';
import { STRATEGY_OPTIMIZER_VERSION, type StrategyOptimizationReport } from './strategyOptimization';
import type { AuthorityStage } from '../contracts/evidence/evidenceGraph';

export const STRATEGY_OPTIMIZATION_STORE_VERSION = 'strategy_optimization_store_v1';

/**
 * Set when the on-disk store could not be read. Deliberately carries no file
 * path: this travels out through `snapshot()`, and a filesystem path is not
 * something an API response should disclose.
 */
export interface StrategyOptimizationStoreCorruption {
  /** The underlying durableJsonFile failure, e.g. `durable_json_corrupt`. */
  reason: string;
  detectedAtIso: string;
}

export interface StrategyOptimizationContext {
  strategyId: string;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
}

export interface StrategyOptimizationProfile extends StrategyOptimizationContext {
  revision: number;
  promotedAt: number;
  promotedAtIso: string;
  sourceReportAt: number;
  parameters: Record<string, number | string>;
  scannerConfig: ScannerConfig;
  scannerConfigDeltas: Record<string, number>;
  previousRevision?: number;
  restoredRevision?: number;
  source: 'MANUAL_PROMOTION' | 'AUTOMATIC_PROMOTION' | 'LEGACY_AUTOMATIC_OPTIMIZER' | 'ROLLBACK';
  active: boolean;
  authorityStage?: AuthorityStage;
}

interface StrategyOptimizationState {
  version: 1;
  updatedAt: string;
  profiles: StrategyOptimizationProfile[];
  reports: StrategyOptimizationReport[];
}

function cloneScannerConfig(config: ScannerConfig): ScannerConfig {
  return { ...config, scoreWeights: { ...config.scoreWeights } };
}

function contextKey(context: StrategyOptimizationContext): string {
  return `${context.strategyId}|${context.symbol.toUpperCase()}|${context.interval}|${context.direction}`;
}

function cloneProfile(profile: StrategyOptimizationProfile): StrategyOptimizationProfile {
  return {
    ...profile,
    source: profile.source === 'ROLLBACK'
      ? 'ROLLBACK'
      : profile.source === 'MANUAL_PROMOTION'
        ? 'MANUAL_PROMOTION'
        : profile.source === 'AUTOMATIC_PROMOTION'
          ? 'AUTOMATIC_PROMOTION'
          : 'LEGACY_AUTOMATIC_OPTIMIZER',
    parameters: { ...profile.parameters },
    scannerConfig: cloneScannerConfig(profile.scannerConfig),
    scannerConfigDeltas: { ...(profile.scannerConfigDeltas || {}) },
    authorityStage: profile.authorityStage ?? (
      profile.source === 'LEGACY_AUTOMATIC_OPTIMIZER' ? 'RESEARCH' : 'LIVE_CONFIG_APPROVED'
    ),
  };
}

function cleanState(value: unknown): StrategyOptimizationState {
  const fallback: StrategyOptimizationState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    profiles: [],
    reports: [],
  };
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<StrategyOptimizationState>;
  const profiles = Array.isArray(raw.profiles)
    ? raw.profiles.filter((profile): profile is StrategyOptimizationProfile => Boolean(
      profile &&
      typeof profile === 'object' &&
      typeof (profile as StrategyOptimizationProfile).strategyId === 'string' &&
      typeof (profile as StrategyOptimizationProfile).symbol === 'string' &&
      typeof (profile as StrategyOptimizationProfile).interval === 'string' &&
      ['LONG', 'SHORT'].includes((profile as StrategyOptimizationProfile).direction) &&
      Number.isFinite((profile as StrategyOptimizationProfile).revision) &&
      (profile as StrategyOptimizationProfile).scannerConfig,
    )).map(cloneProfile)
    : [];
  const reports = Array.isArray(raw.reports)
    ? raw.reports.filter((report): report is StrategyOptimizationReport => Boolean(
      report && typeof report === 'object'
      && (report as StrategyOptimizationReport).version === STRATEGY_OPTIMIZER_VERSION
      && typeof (report as StrategyOptimizationReport).strategyId === 'string'
      && Boolean((report as StrategyOptimizationReport).developmentValidation)
      && (report as StrategyOptimizationReport).finalHoldoutStatus === 'SEALED_NOT_OPENED_DURING_OPTIMIZATION',
    ))
    : [];
  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
    profiles: profiles.sort((left, right) => left.revision - right.revision).slice(-300),
    reports: reports.sort((left, right) => right.generatedAt - left.generatedAt).slice(0, 100),
  };
}

export class StrategyOptimizationStore {
  private readonly filePath: string;
  private state: StrategyOptimizationState;
  private corruption: StrategyOptimizationStoreCorruption | null = null;

  constructor(filePath?: string) {
    this.filePath = resolve(filePath || process.env.APEX_STRATEGY_OPTIMIZATION_STORE_PATH || '.apex-data/strategy-optimization.json');
    this.state = this.load();
  }

  private load(): StrategyOptimizationState {
    if (!existsSync(this.filePath)) return cleanState(null);
    try {
      return cleanState(readDurableJsonFileSync(this.filePath));
    } catch (error) {
      // A corrupt or oversized store must never look like a fresh install. This
      // previously returned empty state, which was indistinguishable from "no
      // file yet" — and because the very next write then replaced the unreadable
      // file, every promoted profile in it was destroyed silently, with no
      // backup to recover from. Promoted profiles feed live scanning through
      // `getActive`, so a false-empty read also means the terminal quietly
      // reverts to baseline config while the operator believes their
      // optimizations are active.
      //
      // Record it instead, keep reads empty so the process still boots, and let
      // `persist` refuse to overwrite data it was unable to read.
      this.corruption = {
        reason: error instanceof Error ? error.message : String(error),
        detectedAtIso: new Date().toISOString(),
      };
      console.warn(
        `strategy_optimization_store_corrupt: ${this.corruption.reason}. Reads are empty and writes are refused; `
        + 'restore the .bak beside the store file (it holds the generation before the last commit) '
        + 'or move the file aside to start fresh.',
      );
      return cleanState(null);
    }
  }

  private persist(): void {
    // Fail closed. Writing here would replace an unreadable-but-present file
    // with state that is missing every profile that file contained.
    if (this.corruption) throw new Error('strategy_optimization_store_corrupt');
    this.state.updatedAt = new Date().toISOString();
    // Durable commit: exclusive lock, fsync of both the data file and its
    // directory, a .bak kept for explicit operator rollback, and 0o600 on the
    // committed file. The previous plain tmp+rename left no backup at all.
    writeDurableJsonFileSync(this.filePath, this.state);
  }

  /**
   * Non-null when the on-disk store could not be read. Callers must treat an
   * empty profile list as unknown rather than absent while this is set.
   */
  corruptionState(): StrategyOptimizationStoreCorruption | null {
    return this.corruption ? { ...this.corruption } : null;
  }

  getActive(context: StrategyOptimizationContext): StrategyOptimizationProfile | null {
    const key = contextKey(context);
    const profile = [...this.state.profiles]
      .reverse()
      .find((row) => row.active && contextKey(row) === key);
    return profile ? cloneProfile(profile) : null;
  }

  listActive(): StrategyOptimizationProfile[] {
    const byContext = new Map<string, StrategyOptimizationProfile>();
    for (const profile of this.state.profiles) {
      if (!profile.active) continue;
      byContext.set(contextKey(profile), profile);
    }
    return [...byContext.values()].map(cloneProfile);
  }

  latestReport(context?: Partial<StrategyOptimizationContext>): StrategyOptimizationReport | null {
    const report = this.state.reports.find((row) => (
      (!context?.strategyId || row.strategyId === context.strategyId) &&
      (!context?.symbol || row.symbol.toUpperCase() === context.symbol.toUpperCase()) &&
      (!context?.interval || row.interval === context.interval) &&
      (!context?.direction || row.direction === context.direction)
    ));
    return report ? structuredClone(report) : null;
  }

  saveReport(report: StrategyOptimizationReport): StrategyOptimizationReport {
    this.state.reports = [structuredClone(report), ...this.state.reports].slice(0, 100);
    this.persist();
    return structuredClone(report);
  }

  promote(report: StrategyOptimizationReport, source: 'MANUAL_PROMOTION' | 'AUTOMATIC_PROMOTION' = 'MANUAL_PROMOTION'): StrategyOptimizationProfile {
    if (!report.promotion.eligible) {
      throw new Error(`strategy_optimization_not_eligible:${report.promotion.blockers.join(',')}`);
    }
    const context: StrategyOptimizationContext = {
      strategyId: report.strategyId,
      symbol: report.symbol,
      interval: report.interval,
      direction: report.direction,
    };
    const current = this.getActive(context);
    for (const profile of this.state.profiles) {
      if (contextKey(profile) === contextKey(context) && profile.active) profile.active = false;
    }
    const revision = Math.max(0, ...this.state.profiles.map((row) => row.revision)) + 1;
    const now = Date.now();
    const profile: StrategyOptimizationProfile = {
      ...context,
      revision,
      promotedAt: now,
      promotedAtIso: new Date(now).toISOString(),
      sourceReportAt: report.generatedAt,
      parameters: { ...report.winner.parameters },
      scannerConfig: cloneScannerConfig(report.winner.scannerConfig),
      // Keep recurrent Autopilot improvements cumulative while still layering
      // them over the live adaptive scanner state at execution time. Each new
      // optimizer run starts from the previous absolute winner, so the movement
      // in this report is incremental. Add it to the previous active offset
      // instead of replacing the full offset with only the latest tiny step.
      scannerConfigDeltas: {
        ...(current?.scannerConfigDeltas || {}),
        ...Object.fromEntries(report.fields
          .filter((field) => field.target === 'SCANNER_CONFIG')
          .map((field) => {
            const previousDelta = Number(current?.scannerConfigDeltas?.[field.key] ?? 0);
            const incrementalDelta = Number(report.winner.values[field.key] ?? field.base) - field.base;
            return [field.key, Number((previousDelta + incrementalDelta).toFixed(10))];
          })),
      },
      previousRevision: current?.revision,
      source,
      active: true,
      authorityStage: 'LIVE_CONFIG_APPROVED',
    };
    this.state.profiles.push(profile);
    this.state.profiles = this.state.profiles.slice(-300);
    this.persist();
    return cloneProfile(profile);
  }

  rollback(context: StrategyOptimizationContext, targetRevision?: number): StrategyOptimizationProfile | null {
    const matching = this.state.profiles
      .filter((row) => contextKey(row) === contextKey(context))
      .sort((left, right) => left.revision - right.revision);
    const current = matching.find((row) => row.active);
    const target = targetRevision === undefined
      ? (current?.previousRevision
          ? matching.find((row) => row.revision === current.previousRevision)
          : [...matching].reverse().find((row) => !current || row.revision < current.revision))
      : matching.find((row) => row.revision === targetRevision);
    if (!target || (current && target.revision === current.revision)) return null;

    for (const profile of this.state.profiles) {
      if (contextKey(profile) === contextKey(context) && profile.active) profile.active = false;
    }
    const revision = Math.max(0, ...this.state.profiles.map((row) => row.revision)) + 1;
    const now = Date.now();
    const rollbackProfile: StrategyOptimizationProfile = {
      ...context,
      revision,
      promotedAt: now,
      promotedAtIso: new Date(now).toISOString(),
      sourceReportAt: target.sourceReportAt,
      parameters: { ...target.parameters },
      scannerConfig: cloneScannerConfig(target.scannerConfig),
      scannerConfigDeltas: { ...target.scannerConfigDeltas },
      previousRevision: current?.revision,
      restoredRevision: target.revision,
      source: 'ROLLBACK',
      active: true,
      authorityStage: 'LIVE_CONFIG_APPROVED',
    };
    this.state.profiles.push(rollbackProfile);
    this.state.profiles = this.state.profiles.slice(-300);
    this.persist();
    return cloneProfile(rollbackProfile);
  }

  snapshot(): {
    version: string;
    active: StrategyOptimizationProfile[];
    reports: StrategyOptimizationReport[];
    corruption: StrategyOptimizationStoreCorruption | null;
  } {
    return {
      version: STRATEGY_OPTIMIZATION_STORE_VERSION,
      active: this.listActive(),
      reports: this.state.reports.slice(0, 20).map((report) => structuredClone(report)),
      // An empty `active` list means two very different things depending on this
      // field, so it travels with the data rather than being inferable from it.
      corruption: this.corruptionState(),
    };
  }
}
