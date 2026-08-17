import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AdaptiveThresholdGovernanceStore } from '../src/services/adaptiveThresholdGovernance';
import { DEFAULT_SCANNER_CONFIG } from '../src/services/apexNextMarketRoutes';
import type { SignalDecisionLog } from '../src/types';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function weakOutcomeLogs(count = 160): SignalDecisionLog[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `log-${index}`,
    cycleId: `cycle-${Math.floor(index / 4)}`,
    timestamp: 1_700_000_000_000 + index * 60_000,
    isoTime: new Date(1_700_000_000_000 + index * 60_000).toISOString(),
    ticker: 'BTC-USDT',
    direction: 'SHORT',
    decision: index % 4 === 0 ? 'REJECTED' : 'ACCEPTED',
    reasonCode: index % 4 === 0 ? 'LOW_CONFIDENCE' : 'ACCEPTED_BEST_CANDIDATE',
    reasonText: 'test evidence',
    confidence: 0.7,
    squeezeRiskScore: 0.62,
    evidenceAgreementScore: 0.42,
    liquidityQualityScore: 0.5,
    qStructDirectional: -0.32,
    laterOutcome: index % 5 === 0 ? 'WIN' : 'LOSS',
    laterPnl: index % 5 === 0 ? 0.5 : -1.2,
  }));
}

describe('adaptive threshold governance', () => {
  it('never promotes a proposal automatically and persists manual revisions', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'apex-adaptive-'));
    tempDirs.push(dir);
    const store = new AdaptiveThresholdGovernanceStore(
      DEFAULT_SCANNER_CONFIG,
      path.join(dir, 'governance.json'),
      { minSamples: 50, minResolvedOutcomes: 40, minAdjustmentConfidence: 0.4, maxRelativeFieldChange: 1, requireGuardrailsMode: true },
    );
    const initialRevision = store.getActiveRevision().revision;
    const proposal = store.propose(weakOutcomeLogs());
    expect(store.getActiveRevision().revision).toBe(initialRevision);
    expect(store.snapshot().automaticPromotionEnabled).toBe(false);
    expect(proposal.status).toBe('PENDING_REVIEW');
    expect(proposal.eligibleForReview).toBe(true);

    const approved = store.approve(proposal.id);
    expect(approved.revision).toBeGreaterThan(initialRevision);
    expect(store.getActiveRevision().revision).toBe(approved.revision);

    const rollback = store.rollback(initialRevision);
    expect(rollback.source).toBe('ROLLBACK');
    expect(store.getActiveConfig().qStructThreshold).toBe(DEFAULT_SCANNER_CONFIG.qStructThreshold);
  });
});
