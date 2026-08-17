import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarketEvent } from '../contracts/realtime/marketEvent';
import { getLiquidityHunterOperationsSnapshot, getLiquidityHunterRuntime, initializeLiquidityHunterFoundation, shutdownLiquidityHunterFoundation } from '../services/liquidityHunter/foundationRuntime';

function event(type: MarketEvent['type'], sequence: number, payload: unknown): MarketEvent {
  const now = Date.now();
  return {
    eventId: `capture-${type.toLowerCase()}-${sequence}`,
    type,
    source: 'binance-usdm',
    symbol: 'BTC-USDT',
    exchangeTimestamp: now - 10,
    receivedAt: now,
    sequence,
    schemaVersion: 1,
    ingestionKind: 'LIVE',
    payload,
  };
}

afterEach(async () => {
  await shutdownLiquidityHunterFoundation();
});

describe('historical microstructure live capture', () => {
  it('records canonical L2/trade events from the internal event bus only when explicitly enabled', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-micro-capture-'));
    try {
      initializeLiquidityHunterFoundation({
        APEX_HISTORICAL_MICROSTRUCTURE_CAPTURE_ENABLED: 'true',
        APEX_HISTORICAL_MICROSTRUCTURE_PATH: join(dir, 'micro.jsonl'),
        APEX_LIQUIDITY_HUNTER_EDGE_THRESHOLD_PATH: join(dir, 'edge-thresholds.json'),
      });
      const runtime = getLiquidityHunterRuntime();
      expect(runtime?.historicalMicrostructure).not.toBeNull();
      await runtime!.bus.publish(event('ORDERBOOK_SNAPSHOT', 1, { bids: [[100, 2]], asks: [[101, 3]] }));
      await runtime!.bus.publish(event('ORDERBOOK_DELTA', 2, { updates: [{ side: 'BID', price: 100, size: 4 }] }));
      await runtime!.bus.publish(event('TRADE', 3, { price: 100.5, size: 1.2, aggressorSide: 'BUY' }));
      await runtime!.bus.drainAll();
      await runtime!.historicalMicrostructure!.flush();

      const snapshot = getLiquidityHunterOperationsSnapshot();
      expect(snapshot.realtime.historicalMicrostructurePath).toContain('micro.jsonl');
      expect(snapshot.realtime.historicalMicrostructure).toMatchObject({ events: 3, l2Snapshots: 1, l2Deltas: 1, trades: 1, corruptLines: 0 });
    } finally {
      await shutdownLiquidityHunterFoundation();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
