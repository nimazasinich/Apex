import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HistoricalMicrostructureRepository } from '../services/research/historicalMicrostructure';

function path(): string { return join(mkdtempSync(join(tmpdir(), 'apex-micro-')), 'history.jsonl'); }

describe('historical microstructure repository', () => {
  it('persists real L1 bid/ask geometry and detects cadence gaps without candle substitution', async () => {
    const repo = new HistoricalMicrostructureRepository({ filePath: path(), fsync: false });
    const now = Date.now() - 10_000;
    await repo.appendL1({ symbol: 'BTCUSDT', venue: 'binance', timestamp: now, bid: 100, ask: 100.1, bidSize: 2, askSize: 3 });
    await repo.appendL1({ symbol: 'BTC-USDT', venue: 'binance', timestamp: now + 1_000, bid: 100.2, ask: 100.3, bidSize: 2.1, askSize: 2.9 });
    await repo.flush();
    const valid = repo.l1Series('BTC-USDT', { venue: 'binance', expectedCadenceMs: 1_000 });
    expect(valid.status).toBe('VALID');
    expect(valid.quotes[0]?.venue).toBe('binance');
    expect(valid.quotes[0]?.spread).toBeCloseTo(0.1, 12);
    await repo.appendL1({ symbol: 'BTC-USDT', venue: 'binance', timestamp: now + 10_000, bid: 100.4, ask: 100.5 });
    await repo.flush();
    expect(repo.l1Series('BTC-USDT', { venue: 'binance', expectedCadenceMs: 1_000 }).status).toBe('GAPPED');
    await repo.close();
  });

  it('normalizes contract-count L2 sizes only with a verified multiplier and reconstructs a contiguous book', async () => {
    const repo = new HistoricalMicrostructureRepository({ filePath: path(), fsync: false });
    const now = Date.now() - 10_000;
    await expect(repo.appendL2Snapshot({ symbol: 'ETH-USDT', venue: 'kucoin', timestamp: now, sequence: 10, bids: [[100, 2]], asks: [[101, 3]], unit: 'CONTRACTS' })).rejects.toThrow('historical_l2_contract_multiplier_required');
    await repo.appendL2Snapshot({ symbol: 'ETH-USDT', venue: 'kucoin', timestamp: now, sequence: 10, bids: [[100, 2]], asks: [[101, 3]], unit: 'CONTRACTS', contractMultiplier: 0.1 });
    await repo.appendL2Delta({ symbol: 'ETH-USDT', venue: 'kucoin', timestamp: now + 100, sequence: 11, previousSequence: 10, updates: [{ side: 'BID', price: 100, size: 4 }], unit: 'CONTRACTS', contractMultiplier: 0.1 });
    await repo.flush();
    const result = repo.l2Series('ETH-USDT', { venue: 'kucoin' });
    expect(result.status).toBe('VALID');
    expect(result.finalBook?.bids[0]).toEqual({ price: 100, size: 0.4 });
    expect((result.events[0].payload as any).sourceUnit).toBe('CONTRACTS');
    expect((result.events[0].payload as any).normalizedUnit).toBe('BASE_ASSET');
    await repo.close();
  });

  it('fails closed on sequence gaps and delta-before-snapshot histories', async () => {
    const repo = new HistoricalMicrostructureRepository({ filePath: path(), fsync: false });
    const now = Date.now() - 10_000;
    await repo.appendL2Snapshot({ symbol: 'SOL-USDT', venue: 'binance', timestamp: now, sequence: 100, bids: [[10, 1]], asks: [[11, 1]], unit: 'BASE_ASSET' });
    await expect(repo.appendL2Delta({ symbol: 'SOL-USDT', venue: 'binance', timestamp: now + 100, sequence: 102, previousSequence: 100, updates: [{ side: 'BID', price: 10, size: 2 }], unit: 'BASE_ASSET' })).rejects.toThrow(/historical_l2_sequence_gap/);
    await repo.close();
  });
});
