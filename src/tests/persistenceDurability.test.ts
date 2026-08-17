import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScannerConfig } from '../types';
import { AdaptiveThresholdGovernanceStore } from '../services/adaptiveThresholdGovernance';
import { DecisionMemoryMirror } from '../services/decisionMemoryMirror';
import { EdgeThresholdGovernanceStore } from '../services/liquidityHunter/edgeThresholdRegistry';
import { LiveExecutionIntentStore } from '../services/liveExecutionIntentStore';
import { TestnetOrderStore, type TestnetOrderRecord } from '../services/testnetExecution';


const BASELINE: ScannerConfig = {
  intervalMs: 5000, obiThreshold: 0.1, volumeThreshold: 1, qStructThreshold: 0.1, fundingThreshold: 0.001,
  oiExpansionThresholdPct: 1, atrExpansionThreshold: 1, maxSqueezeRisk: 80, minEvidenceAgreement: 0.5,
  minSmartMoneyScore: 0.5, smcHardRejectThreshold: 0.2, thresholdMode: 'MANUAL', adaptiveLearningRate: 0.05,
  adaptiveMinSamples: 100, scoreWeights: { obi: 0.1, qStruct: 0.1, volume: 0.1, funding: 0.1, openInterest: 0.1, atr: 0.1, microstructure: 0.1, liquidity: 0.1, smc: 0.2 },
  minConfidence: 0.5, directionBias: 'BOTH', topRankSkip: 0, minVolume24hUsd: 0,
};

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
function root() { const value = mkdtempSync(join(tmpdir(), 'apex-persistence-')); roots.push(value); return value; }

describe('critical persistence durability', () => {
  it('fails closed on corrupt decision/governance state', () => {
    const dir = root();
    const decision = join(dir, 'decision.json');
    const adaptive = join(dir, 'adaptive.json');
    const edge = join(dir, 'edge.json');
    for (const file of [decision, adaptive, edge]) writeFileSync(file, '{broken', 'utf8');
    expect(() => new DecisionMemoryMirror(decision)).toThrow('decision_memory_mirror_corrupt');
    expect(() => new AdaptiveThresholdGovernanceStore(BASELINE, adaptive)).toThrow('adaptive_governance_store_corrupt');
    expect(() => new EdgeThresholdGovernanceStore(edge)).toThrow('edge_threshold_governance_store_corrupt');
  });

  it('migrates legacy live intent arrays to a versioned envelope and never trusts legacy ACTIVE protection', () => {
    const dir = root();
    const file = join(dir, 'live.json');
    const now = new Date().toISOString();
    writeFileSync(file, JSON.stringify([{
      id: 'live-1', apiKeyHint: 'hint', clientOid: 'oid', tradePlanId: null, riskPolicyVersion: 'risk_v1', riskDecision: 'APPROVED',
      status: 'ACKNOWLEDGED', exchangeOrderId: 'order-1', executedQuantity: 0, averageFillPrice: null, fills: [],
      protectiveOrderStatus: 'ACTIVE', exchangeResponse: null, lastError: null, createdAt: now, updatedAt: now,
      order: { clientOid: 'oid', symbol: 'XBTUSDTM', side: 'buy', type: 'limit', quantity: 1, price: 100, leverage: 1, marginMode: 'ISOLATED', timeInForce: 'GTC', reduceOnly: false, stopLossPrice: 98 },
    }]), 'utf8');
    const store = new LiveExecutionIntentStore(file);
    expect(store.all()[0].protectiveOrderStatus).toBe('ATTACHED_UNVERIFIED');
    store.update('live-1', { lastError: 'qa' });
    const persisted = JSON.parse(readFileSync(file, 'utf8')) as { schemaVersion: number; rows: unknown[] };
    expect(persisted.schemaVersion).toBe(1);
    expect(Array.isArray(persisted.rows)).toBe(true);
  });

  it('writes Testnet order state as versioned durable storage with rollback backup', () => {
    const dir = root();
    const file = join(dir, 'testnet.json');
    const now = new Date().toISOString();
    const record: TestnetOrderRecord = {
      id: 'testnet-1', environment: 'TESTNET', symbol: 'XBTUSDTM', side: 'buy', intent: 'LONG', type: 'limit', quantity: 1, price: 100,
      clientOid: 'oid-1', exchangeOrderId: null, status: 'VALIDATING', submittedAt: null, createdAt: now, updatedAt: now,
      lastReconciledAt: null, riskDecision: 'PENDING', reason: null, exchangeResponse: null,
    };
    const store = new TestnetOrderStore(file);
    store.create(record);
    store.update(record.id, { status: 'SUBMITTING' });
    const persisted = JSON.parse(readFileSync(file, 'utf8')) as { schemaVersion: number; rows: unknown[] };
    expect(persisted.schemaVersion).toBe(1);
    expect(persisted.rows).toHaveLength(1);
    expect(existsSync(`${file}.bak`)).toBe(true);
  });
});
