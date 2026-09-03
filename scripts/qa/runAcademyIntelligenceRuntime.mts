import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StrategyDefinition } from '../../src/types.ts';
import { StrategyCollector, InternalStrategySourceAdapter } from '../../src/features/academy/discovery/strategyCollector.ts';
import { AutomatedEvaluationPipeline } from '../../src/features/academy/evaluation/evaluationPipeline.ts';
import { AcademyStore } from '../../src/features/academy/storage/academyStore.ts';
import { StrategyKnowledgeBase } from '../../src/features/academy/knowledge/strategyKnowledgeBase.ts';
import { AcademyEngine } from '../../src/features/academy/engine/academyEngine.ts';
import {
  academyRiskGate,
  academyScannerGate,
  academyTradePlanErrors,
  buildAcademyConsumerIntelligence,
} from '../../src/features/academy/api/strategyIntelligence.ts';

const root = mkdtempSync(join(tmpdir(), 'apex-academy-runtime-'));

function strategy(status: StrategyDefinition['status'] = 'candidate'): StrategyDefinition {
  return {
    strategyId: 'academy-runtime-strategy', version: 1, name: 'Academy Runtime Strategy',
    summary: 'Recorded trend breakout research strategy.', evidenceTier: ['A'], wave: 'wave1-mvp', status,
    longShort: 'BOTH', supportedIntervals: ['1h'], dataRequirements: ['Verified candles'], engine: 'scanner-preset',
    regimeRules: ['Measure trending and range regimes.'], setupRules: ['Trend alignment.'], triggerRules: ['Verified breakout.'],
    riskRules: ['Canonical governor.'], exitRules: ['Stop or target.'], noTradeRules: ['Reject stale data.'],
    parameters: [], sourceReferences: ['runtime-qa'], knownFailureModes: ['Whipsaw.'], categories: ['Trending'], componentCount: 1,
    latestSnapshot: {
      score: 80, winRatePct: 56, netReturnPct: 10, maxDrawdownPct: 9, profitFactor: 1.5,
      lastBacktestAt: 1_000, source: 'validation', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', sampleSize: 1_500,
      runId: 'academy-runtime-run', validationMethod: 'walk-forward-sealed-holdout', validationScope: 'FULL_STRATEGY',
      fullStrategyValidated: true, dataState: 'live', passedAllGates: true,
      gates: { data: true, sample: true, outOfSample: true, drawdown: true, stability: true, costResilience: true, regime: true, reproducibility: true, statisticalEvidence: true },
      regimesMeasured: ['TRENDING', 'RANGE'], regimesProfitable: ['TRENDING'], datasetFingerprint: 'b'.repeat(64), holdoutProtocolStatus: 'PASSED',
    },
  };
}

try {
  const collector = new StrategyCollector();
  collector.register(new InternalStrategySourceAdapter(() => [strategy()], () => 2_000));
  const knowledge = new StrategyKnowledgeBase(new AcademyStore(join(root, 'academy.json'), 60_000));
  const engine = new AcademyEngine(collector, new AutomatedEvaluationPipeline(), knowledge, () => 2_000);
  const cycle = engine.start();
  assert.equal(cycle.evaluated, 1);
  assert.equal(engine.status().phase, 'IDLE');
  assert.equal(engine.status().safety.executionAuthorized, false);
  const stored = knowledge.get('academy-runtime-strategy');
  assert.ok(stored);
  assert.equal(stored.lifecycle, 'SHADOW');
  assert.equal(stored.latestEvaluation.metrics.riskReward.state, 'NOT_EVALUATED');
  assert.equal(stored.latestEvaluation.metrics.riskReward.value, null);
  assert.equal(stored.regimeCompatibility.find((entry) => entry.regime === 'TRENDING')?.state, 'SUPPORTED');
  engine.stop();
  assert.equal(engine.status().phase, 'OFF');

  const reloaded = new StrategyKnowledgeBase(new AcademyStore(join(root, 'academy.json'), 60_000)).get('academy-runtime-strategy');
  assert.equal(reloaded?.evidenceHistory.length, stored.evidenceHistory.length);

  const retired = new AutomatedEvaluationPipeline().evaluate(
    new InternalStrategySourceAdapter(() => [strategy('blocked')], () => 2_000).collect()[0],
    undefined,
    2_000,
  );
  assert.equal(retired.lifecycle, 'RETIRED');
  const scannerIntelligence = buildAcademyConsumerIntelligence(retired, 'SCANNER', null, 2_000);
  assert.equal(academyScannerGate(scannerIntelligence).allowed, false);
  assert.ok(academyTradePlanErrors(buildAcademyConsumerIntelligence(retired, 'TRADE_PLAN', null, 2_000))[0].includes('Academy'));
  assert.equal(academyRiskGate(buildAcademyConsumerIntelligence(retired, 'RISK_GOVERNOR', null, 2_000), false)?.status, 'FAIL');
  assert.equal(academyRiskGate(buildAcademyConsumerIntelligence(retired, 'RISK_GOVERNOR', null, 2_000), true)?.status, 'WARN');

  console.log('Academy Intelligence runtime QA passed: ingestion, evaluation, persistence, lifecycle, and downstream consumer gates.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
