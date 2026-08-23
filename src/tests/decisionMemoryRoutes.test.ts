import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { DecisionMemoryMirror } from '../services/decisionMemoryMirror';
import { registerDecisionMemoryRoutes } from '../services/routes/decisionMemoryRoutes';

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

async function start(mirror: DecisionMemoryMirror | null): Promise<string> {
  const app = express();
  app.use(express.json());
  registerDecisionMemoryRoutes(app, mirror);
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('Decision Memory route extraction', () => {
  it('preserves disabled status and unavailable data responses', async () => {
    const base = await start(null);
    expect(await fetch(`${base}/api/decision-memory/status`).then((row) => row.json()))
      .toMatchObject({ ok: true, enabled: false, stats: null, persistence: null });
    expect((await fetch(`${base}/api/decision-memory`)).status).toBe(503);
    expect((await fetch(`${base}/api/decision-memory/export`)).status).toBe(503);
  });

  it('preserves batch limits, filtered queries, status, and export', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'apex-decision-routes-'));
    const mirror = new DecisionMemoryMirror(join(directory, 'decision-memory.json'));
    const base = await start(mirror);
    const oversized = await fetch(`${base}/api/decision-memory/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows: Array.from({ length: 501 }, (_, id) => ({ id })) }),
    });
    expect(oversized.status).toBe(413);

    const row = { id: 'route-row', timestamp: Date.now(), ticker: 'BTC-USDT', decision: 'ACCEPTED', reasonCode: 'VALID_SIGNAL' };
    const inserted = await fetch(`${base}/api/decision-memory/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows: [row] }),
    });
    expect(inserted.status).toBe(200);

    const query = await fetch(`${base}/api/decision-memory?ticker=BTC-USDT&limit=1`).then((response) => response.json());
    expect(query).toMatchObject({ ok: true, rows: [{ id: 'route-row' }] });
    const status = await fetch(`${base}/api/decision-memory/status`).then((response) => response.json());
    expect(status).toMatchObject({ ok: true, enabled: true, stats: { total: 1 }, persistence: { writable: true } });
    const exported = await fetch(`${base}/api/decision-memory/export`).then((response) => response.json());
    expect(exported).toMatchObject({ ok: true, rows: [{ id: 'route-row' }], stats: { total: 1 } });
  });
});
