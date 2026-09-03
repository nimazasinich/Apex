import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ParliamentPromotionStore,
  PARLIAMENT_DEMOTION_CONFIRMATION,
  PARLIAMENT_SIGNAL_CONFIRMATION,
} from '../services/parliamentPromotionStore';
import { resolveParliamentScannerMode, type ParliamentScannerMode } from '../services/parliamentScannerContributor';
import type { ParliamentValidationEvidence } from '../services/parliamentPromotionGate';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
function store(): ParliamentPromotionStore {
  const dir = mkdtempSync(join(tmpdir(), 'apex-parliament-store-'));
  dirs.push(dir);
  return new ParliamentPromotionStore(join(dir, 'state.json'));
}
function evidence(overrides: Partial<ParliamentValidationEvidence> = {}): ParliamentValidationEvidence {
  const base: ParliamentValidationEvidence = {
    resolvedSamples: 320,
    paperForwardSamples: 140,
    walkForwardFolds: 6,
    profitableWalkForwardFolds: 5,
    walkForwardResults: [
      { label: 'wf1', trades: 44, netReturnPct: 1.1, profitFactor: 1.12, maxDrawdownPct: 8 },
      { label: 'wf2', trades: 47, netReturnPct: 1.4, profitFactor: 1.18, maxDrawdownPct: 9 },
      { label: 'wf3', trades: 42, netReturnPct: 0.8, profitFactor: 1.08, maxDrawdownPct: 7 },
      { label: 'wf4', trades: 50, netReturnPct: 1.3, profitFactor: 1.15, maxDrawdownPct: 10 },
      { label: 'wf5', trades: 45, netReturnPct: 1.0, profitFactor: 1.09, maxDrawdownPct: 9 },
      { label: 'wf6', trades: 43, netReturnPct: -0.2, profitFactor: 0.98, maxDrawdownPct: 11 },
    ],
    regimes: {
      TREND_UP: { samples: 70, netReturnPct: 2, profitFactor: 1.2, maxDrawdownPct: 8 },
      TREND_DOWN: { samples: 75, netReturnPct: 3, profitFactor: 1.3, maxDrawdownPct: 9 },
      RANGE: { samples: 65, netReturnPct: 1, profitFactor: 1.1, maxDrawdownPct: 7 },
      HIGH_VOLATILITY: { samples: 55, netReturnPct: 1.5, profitFactor: 1.15, maxDrawdownPct: 12 },
    },
    netReturnPct: 6,
    profitFactor: 1.18,
    maxDrawdownPct: 12,
    costStressPassed: true,
    sealedHoldoutUsesForCandidate: 1,
    materialVetoCount: 0,
  };
  return {
    ...base,
    ...overrides,
    walkForwardResults: overrides.walkForwardResults ?? base.walkForwardResults,
    regimes: overrides.regimes ?? base.regimes,
  };
}

describe('ParliamentPromotionStore', () => {
  it('starts shadow-only and auto-promotes only to paper-forward after evidence gates pass', () => {
    const subject = store();
    expect(subject.scannerMode()).toBe('SHADOW');
    const next = subject.evaluateEvidence(evidence());
    expect(next.stage).toBe('PAPER_FORWARD');
    expect(next.signalDeliveryOptIn).toBe(false);
    expect(next.autonomousLiveExecutionEnabled).toBe(false);
    expect(subject.scannerMode()).toBe('PAPER_PROMOTED');
  });

  it('requires paper-forward evidence then an exact human confirmation before signal authority', () => {
    const subject = store();
    subject.evaluateEvidence(evidence());
    const ready = subject.evaluateEvidence(evidence());
    expect(ready.signalPromotionReady).toBe(true);
    expect(() => subject.approveSignalPromotion({ confirmation: 'yes', signalDeliveryOptIn: true })).toThrow('parliament_signal_confirmation_mismatch');
    expect(() => subject.approveSignalPromotion({ confirmation: PARLIAMENT_SIGNAL_CONFIRMATION, signalDeliveryOptIn: false })).toThrow('parliament_signal_delivery_opt_in_required');
    const promoted = subject.approveSignalPromotion({ confirmation: PARLIAMENT_SIGNAL_CONFIRMATION, signalDeliveryOptIn: true });
    expect(promoted.stage).toBe('SIGNAL_ELIGIBLE');
    expect(subject.scannerMode()).toBe('SIGNAL_PROMOTED');
    expect(promoted.autonomousLiveExecutionEnabled).toBe(false);
  });

  it('fails closed when evidence violates the sealed-holdout or drawdown policy', () => {
    const subject = store();
    const state = subject.evaluateEvidence(evidence({ sealedHoldoutUsesForCandidate: 2, maxDrawdownPct: 18 }));
    expect(state.stage).toBe('SHADOW');
    expect(state.lastBlockers).toContain('sealed_holdout_reuse');
    expect(state.lastBlockers).toContain('drawdown_cap');
  });

  it('demotion immediately removes signal authority', () => {
    const subject = store();
    subject.evaluateEvidence(evidence());
    subject.evaluateEvidence(evidence());
    subject.approveSignalPromotion({ confirmation: PARLIAMENT_SIGNAL_CONFIRMATION, signalDeliveryOptIn: true });
    expect(subject.scannerMode()).toBe('SIGNAL_PROMOTED');
    subject.demoteToShadow({ confirmation: PARLIAMENT_DEMOTION_CONFIRMATION });
    expect(subject.scannerMode()).toBe('SHADOW');
  });

  it('does not accept SIGNAL_PROMOTED as an environment bypass', () => {
    const mode: ParliamentScannerMode = resolveParliamentScannerMode({ APEX_PARLIAMENT_SCANNER_MODE: 'SIGNAL_PROMOTED' } as NodeJS.ProcessEnv);
    expect(mode).toBe('SHADOW');
  });
});
