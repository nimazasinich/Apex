import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BacktestCandle } from '../services/backtesting';
import { applyStrategyOptimizationScannerDeltas, optimizeStrategy, type StrategyOptimizationReport } from '../services/strategyOptimization';
import { StrategyOptimizationStore } from '../services/strategyOptimizationStore';
import type { ScannerConfig, StrategyDefinition } from '../types';

const scannerConfig: ScannerConfig = {
  intervalMs: 6005,
  obiThreshold: -0.15,
  volumeThreshold: 0,
  qStructThreshold: -0.30,
  fundingThreshold: 0.0001,
  oiExpansionThresholdPct: 0.30,
  atrExpansionThreshold: 0.005,
  maxSqueezeRisk: 0.46,
  minEvidenceAgreement: 0.64,
  minSmartMoneyScore: 0.52,
  smcHardRejectThreshold: 0.22,
  thresholdMode: 'ADAPTIVE_GUARDRAILS',
  scorePreset: 'CUSTOM',
  adaptiveLearningRate: 0.04,
  adaptiveMinSamples: 24,
  scoreWeights: { obi: 0.12, volume: 0.11, qStruct: 0.14, funding: 0.10, openInterest: 0.10, atr: 0.08, microstructure: 0.12, liquidity: 0.13, smc: 0.10 },
  minConfidence: 0.78,
  directionBias: 'BOTH',
  topRankSkip: 10,
  minVolume24hUsd: 5_000_000,
};

const definition: StrategyDefinition = {
  strategyId: 'optimizer-fixture-v1', version: 1, name: 'Optimizer Fixture', summary: 'Fixture',
  evidenceTier: ['B'], wave: 'wave1-mvp', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['1h'],
  dataRequirements: ['candles'], engine: 'bespoke', runFn: 'fixture', regimeRules: [], setupRules: [], triggerRules: [],
  riskRules: [], exitRules: [], noTradeRules: [], sourceReferences: [], knownFailureModes: [], categories: [], componentCount: 1,
  parameters: [{ key: 'threshold', label: 'Threshold', default: 0.2, min: 0, max: 1, step: 0.05, reason: 'fixture' }],
};

function candles(count = 1500): BacktestCandle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: new Date(Date.UTC(2025, 0, 1, index)).toISOString(),
    open: 100 + index * 0.01,
    high: 101 + index * 0.01,
    low: 99 + index * 0.01,
    close: 100.5 + index * 0.01,
    volume: 1000 + index,
  }));
}

describe('strategy optimization', () => {
  it('applies optimizer deltas on top of the latest adaptive scanner state', () => {
    const promotedBase = applyStrategyOptimizationScannerDeltas(scannerConfig, { minConfidence: 0.04, obiThreshold: -0.02 });
    const laterAdaptiveState = { ...scannerConfig, minConfidence: 0.80, obiThreshold: -0.18, scoreWeights: { ...scannerConfig.scoreWeights } };
    const reapplied = applyStrategyOptimizationScannerDeltas(laterAdaptiveState, { minConfidence: 0.04, obiThreshold: -0.02 });
    expect(promotedBase.minConfidence).toBe(0.82);
    expect(reapplied.minConfidence).toBe(0.84);
    expect(reapplied.obiThreshold).toBe(-0.20);
    expect(reapplied.scoreWeights).not.toBe(laterAdaptiveState.scoreWeights);
  });
  it('finds a bounded stable improvement and marks it eligible', async () => {
    const all = candles();
    const holdoutStart = Date.parse(all[Math.floor(all.length * 0.8)].time);
    let sealedHoldoutEvaluations = 0;
    const report = await optimizeStrategy({
      definition,
      candles: all,
      baseScannerConfig: scannerConfig,
      baseParameters: { threshold: 0.2 },
      symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', transactionCostPct: 0.18,
      autoPromote: true,
      budget: { coarseCandidates: 20, finalists: 6, refinementCandidates: 8, minTradesPerEvaluation: 8, maxConcurrent: 3 },
      evaluator: ({ parameters, transactionCostPct, candles: rows }) => {
        if (Date.parse(rows[0].time) >= holdoutStart) sealedHoldoutEvaluations += 1;
        const value = Number(parameters.threshold);
        const quality = Math.max(0, 1 - Math.abs(value - 0.65) * 2.2);
        return {
          totalPnlPct: quality * 12 - transactionCostPct * 2,
          maxDrawdownPct: 5 + (1 - quality) * 4,
          profitFactor: 1.05 + quality * 1.2,
          tradeCount: 24,
          winRatePct: 48 + quality * 18,
          avgPnlPct: 0.1 + quality * 0.7,
        };
      },
    });
    expect(report.winner.values.threshold).toBeGreaterThan(0.45);
    expect(report.promotion.eligible).toBe(true);
    expect(report.promotion.automaticallyPromoted).toBe(false);
    expect(report.warnings).toEqual(expect.arrayContaining([
      'Automatic promotion was requested, but optimization alone can only nominate a candidate for separate FULL_STRATEGY final validation.',
    ]));
    expect(report.validationIsolation.purgeBars).toBeGreaterThan(0);
    expect(report.validationIsolation.embargoBars).toBeGreaterThan(0);
    expect(report.promotion.developmentValidationImprovement).toBeGreaterThan(0);
    expect(sealedHoldoutEvaluations).toBe(0);
    expect(report.finalHoldoutStatus).toBe('SEALED_NOT_OPENED_DURING_OPTIMIZATION');
  });

  it('never exposes the final sealed partition to optimizer evaluators', async () => {
    const all = candles();
    const holdoutStart = Date.parse(all[Math.floor(all.length * 0.8)].time);
    let sealedHoldoutEvaluations = 0;
    const report = await optimizeStrategy({
      definition,
      candles: all,
      baseScannerConfig: scannerConfig,
      baseParameters: { threshold: 0.2 },
      symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', transactionCostPct: 0.18,
      budget: { coarseCandidates: 20, finalists: 6, refinementCandidates: 6, minTradesPerEvaluation: 8 },
      evaluator: ({ parameters, candles: rows }) => {
        if (Date.parse(rows[0].time) >= holdoutStart) {
          sealedHoldoutEvaluations += 1;
          throw new Error('optimizer_must_not_see_final_holdout');
        }
        const value = Number(parameters.threshold);
        const quality = Math.max(0, 1 - Math.abs(value - 0.7) * 2.5);
        return { totalPnlPct: quality * 10, maxDrawdownPct: 7, profitFactor: 1 + quality, tradeCount: 22, winRatePct: 50 + quality * 15, avgPnlPct: quality * 0.6 };
      },
    });
    expect(sealedHoldoutEvaluations).toBe(0);
    expect(report.finalHoldoutStatus).toBe('SEALED_NOT_OPENED_DURING_OPTIMIZATION');
    expect(report.promotion.evidenceScope).toBe('DEVELOPMENT_ONLY');
  });

  it('persists exact-context profiles and supports rollback', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'apex-optimizer-'));
    try {
      const store = new StrategyOptimizationStore(join(directory, 'store.json'));
      const report = await optimizeStrategy({
        definition,
        candles: candles(),
        baseScannerConfig: scannerConfig,
        baseParameters: { threshold: 0.2 },
        symbol: 'ETH-USDT', interval: '1h', direction: 'SHORT', transactionCostPct: 0.1,
        budget: { coarseCandidates: 16, finalists: 5, refinementCandidates: 4, minTradesPerEvaluation: 6 },
        evaluator: ({ parameters }) => {
          const quality = Math.max(0, 1 - Math.abs(Number(parameters.threshold) - 0.6) * 2);
          return { totalPnlPct: quality * 10, maxDrawdownPct: 5, profitFactor: 1.1 + quality, tradeCount: 20, winRatePct: 52 + quality * 12, avgPnlPct: 0.2 + quality * 0.5 };
        },
      });
      expect(report.promotion.eligible).toBe(true);
      const context = { strategyId: definition.strategyId, symbol: 'ETH-USDT', interval: '1h', direction: 'SHORT' as const };
      const first = store.promote(report, 'AUTOMATIC_PROMOTION');
      store.saveReport(report);
      expect(first.source).toBe('AUTOMATIC_PROMOTION');
      expect(store.getActive(context)?.revision).toBe(first.revision);
      expect(store.getActive({ strategyId: definition.strategyId, symbol: 'BTC-USDT', interval: '1h', direction: 'SHORT' })).toBeNull();

      const secondReport = structuredClone(report);
      secondReport.generatedAt += 1;
      secondReport.generatedAtIso = new Date(secondReport.generatedAt).toISOString();
      secondReport.winner.parameters.threshold = 0.75;
      secondReport.winner.values.threshold = 0.75;
      const second = store.promote(secondReport);
      expect(second.previousRevision).toBe(first.revision);
      const rollback = store.rollback(context);
      expect(rollback?.source).toBe('ROLLBACK');
      expect(rollback?.restoredRevision).toBe(first.revision);
      expect(rollback?.previousRevision).toBe(second.revision);
      expect(rollback?.revision).toBeGreaterThan(second.revision);
      expect(store.getActive(context)?.parameters.threshold).toBe(first.parameters.threshold);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('surfaces store corruption instead of silently destroying promoted profiles', () => {
    const directory = mkdtempSync(join(tmpdir(), 'apex-optimizer-corrupt-'));
    const filePath = join(directory, 'store.json');
    try {
      // Truncated JSON is the realistic corruption shape here: an interrupted or
      // partially flushed write, not random bytes.
      const corruptBytes = '{"version":1,"updatedAt":"2026-08-16T00:00:00.000Z","profiles":[{"strategyId":"momentum';
      writeFileSync(filePath, corruptBytes, 'utf8');

      const store = new StrategyOptimizationStore(filePath);
      const corruption = store.corruptionState();
      expect(corruption).not.toBeNull();
      expect(corruption?.reason).toContain('durable_json_corrupt');
      // The flag travels out through snapshot() into an API response, so it must
      // not carry the store's filesystem path.
      expect(JSON.stringify(corruption)).not.toContain('store.json');

      // Reads stay empty so a corrupt optimization file cannot brick startup...
      expect(store.listActive()).toEqual([]);
      expect(store.getActive({ strategyId: definition.strategyId, symbol: 'ETH-USDT', interval: '1h', direction: 'SHORT' })).toBeNull();
      // ...but the emptiness is explicitly labelled as unknown, not as absent.
      expect(store.snapshot().corruption).not.toBeNull();

      // A write must fail closed. The report body is irrelevant: persist()
      // refuses before the state is ever serialized.
      expect(() => store.saveReport({ strategyId: definition.strategyId } as unknown as StrategyOptimizationReport))
        .toThrowError('strategy_optimization_store_corrupt');

      // The decisive assertion. Previously the corrupt read returned empty state,
      // indistinguishable from a fresh install, and this write replaced the file
      // — permanently destroying every promoted profile it held, with no backup.
      expect(readFileSync(filePath, 'utf8')).toBe(corruptBytes);
      // No .bak, no .tmp, no orphaned .lock left behind by the refused write.
      expect(readdirSync(directory)).toEqual(['store.json']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
