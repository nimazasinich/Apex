import express, { type Express } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { registerApexNextMarketRoutes } from '../services/apexNextMarketRoutes';
import { validateProductionReplayRequest } from '../services/apiValidation';

const servers: Array<ReturnType<Express['listen']>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => error ? reject(error) : resolve());
  })));
});

function candle(index: number) {
  const open = 100 + index;
  return {
    time: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
    open,
    high: open + 2,
    low: open - 2,
    close: open + 1,
    volume: 1_000 + index,
  };
}

function productionInput(index: number) {
  return {
    timestamp: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
    bidDepthUsd: 1_000_000,
    askDepthUsd: 900_000,
    imbalancePct: 5,
    obi: 0.05,
    signedVolumeDelta: 12_000,
    spread: 0.5,
    microPrice: 100 + index,
    fundingRate: 0.0001,
  };
}

async function startApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  registerApexNextMarketRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener.');
  return `http://127.0.0.1:${address.port}`;
}

describe('production-input replay validation', () => {
  it('rejects unsupported and non-finite execution settings before replay', () => {
    const result = validateProductionReplayRequest({
      candles: Array.from({ length: 80 }, (_, index) => candle(index)),
      inputs: [productionInput(0)],
      symbol: 'file:///etc/passwd',
      direction: 'SIDEWAYS',
      interval: '2m',
      maxBars: 'Infinity',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['symbol', 'direction', 'interval', 'maxBars']));
    }
  });

  it('rejects malformed candle and production-input rows', () => {
    const candles = Array.from({ length: 80 }, (_, index) => candle(index));
    candles[4] = { ...candles[4], high: Number.NaN };
    const inputs = [productionInput(0)];
    inputs[0] = { ...inputs[0], spread: -1 };

    const result = validateProductionReplayRequest({ candles, inputs });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'candles[4].high' }),
        expect.objectContaining({ field: 'inputs[0].spread' }),
      ]));
    }
  });

  it('returns structured 422 and 413 responses from the live Express route', async () => {
    const origin = await startApp();

    const invalid = await fetch(`${origin}/api/market/backtest/production-input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candles: [], inputs: [] }),
    });
    expect(invalid.status).toBe(422);
    const invalidBody = await invalid.json() as { error?: { code?: string; issues?: Array<{ field: string }> } };
    expect(invalidBody.error?.code).toBe('invalid_request');
    expect(invalidBody.error?.issues?.map((issue) => issue.field)).toEqual(expect.arrayContaining(['candles', 'inputs']));

    const excessive = await fetch(`${origin}/api/market/backtest/production-input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candles: Array.from({ length: 5_001 }, (_, index) => candle(index)),
        inputs: [productionInput(0)],
      }),
    });
    expect(excessive.status).toBe(413);
    const excessiveBody = await excessive.json() as { error?: string; maxRows?: number };
    expect(excessiveBody).toMatchObject({ error: 'production_replay_dataset_too_large', maxRows: 5_000 });
  });
});
