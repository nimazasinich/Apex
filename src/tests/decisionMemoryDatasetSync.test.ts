import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DecisionMemoryMirror } from '../services/decisionMemoryMirror';
import { restoreDecisionMemoryFromDataset, syncDecisionMemoryToDataset, type DatasetHubClient } from '../services/decisionMemoryDatasetSync';
import { buildDecisionMemoryExportPayload } from '../utils/decisionMemoryExport';
import type { SignalDecisionLog } from '../types';

function row(id = 'row-1'): SignalDecisionLog {
  const timestamp = Date.now() - 1_000;
  return {
    id, cycleId: `cycle-${id}`, timestamp, isoTime: new Date(timestamp).toISOString(), ticker: 'BTC-USDT', direction: 'SHORT',
    decision: 'ACCEPTED', reasonCode: 'ACCEPTED_BEST_CANDIDATE', reasonText: 'test row', laterOutcome: 'WIN',
  } as SignalDecisionLog;
}

const oldToken = process.env.HF_TOKEN;
const oldRepo = process.env.HF_DECISION_MEMORY_REPO;

beforeEach(() => {
  process.env.HF_TOKEN = 'hf_dummy_sync_token';
  process.env.HF_DECISION_MEMORY_REPO = 'owner/apex-test-dataset';
});

afterEach(() => {
  if (oldToken === undefined) delete process.env.HF_TOKEN; else process.env.HF_TOKEN = oldToken;
  if (oldRepo === undefined) delete process.env.HF_DECISION_MEMORY_REPO; else process.env.HF_DECISION_MEMORY_REPO = oldRepo;
});

describe('DecisionMemory dataset mirror hardening', () => {
  it('retries transient upload failures then persists checksum idempotency across a new sync call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-dataset-sync-'));
    const mirror = new DecisionMemoryMirror(join(dir, 'memory.json'));
    mirror.putMany([row()]);
    let uploads = 0;
    const client: DatasetHubClient = {
      uploadFile: async () => {
        uploads += 1;
        if (uploads < 3) throw new Error('transient network failure hf_dummy_sync_token');
      },
      downloadFile: async () => null,
    };
    const statePath = join(dir, 'sync-state.json');
    const first = await syncDecisionMemoryToDataset(mirror, { client, statePath, retryAttempts: 3, retryBaseDelayMs: 1 });
    expect(first.status).toBe('SYNCED');
    expect(uploads).toBe(3);
    const second = await syncDecisionMemoryToDataset(mirror, { client, statePath, retryAttempts: 1, retryBaseDelayMs: 1 });
    expect(second).toMatchObject({ status: 'SKIPPED', reason: 'unchanged_content_checksum', rowCount: 1 });
    expect(uploads).toBe(3);
  });

  it('validates checksum before restoring remote rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-dataset-restore-'));
    const mirror = new DecisionMemoryMirror(join(dir, 'memory.json'));
    const payload = buildDecisionMemoryExportPayload([row('remote')], 'test');
    const goodClient: DatasetHubClient = {
      uploadFile: async () => undefined,
      downloadFile: async () => new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    };
    expect(await restoreDecisionMemoryFromDataset(mirror, { client: goodClient, retryAttempts: 1 })).toMatchObject({ status: 'RESTORED', rowCount: 1 });
    expect(mirror.exportAll()[0].id).toBe('remote');

    const corrupted = { ...payload, rows: [{ ...payload.rows[0], ticker: 'ETH-USDT' }] };
    const badClient: DatasetHubClient = {
      uploadFile: async () => undefined,
      downloadFile: async () => new Blob([JSON.stringify(corrupted)], { type: 'application/json' }),
    };
    const other = new DecisionMemoryMirror(join(dir, 'other.json'));
    const result = await restoreDecisionMemoryFromDataset(other, { client: badClient, retryAttempts: 1 });
    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') expect(result.message).toContain('payload_checksum_mismatch');
    expect(other.exportAll()).toHaveLength(0);
  });

  it('redacts configured token from terminal error status', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-dataset-redact-'));
    const mirror = new DecisionMemoryMirror(join(dir, 'memory.json'));
    mirror.putMany([row()]);
    const client: DatasetHubClient = {
      uploadFile: async () => { throw new Error(`failed token=${process.env.HF_TOKEN}`); },
      downloadFile: async () => null,
    };
    const result = await syncDecisionMemoryToDataset(mirror, { client, statePath: join(dir, 'state.json'), retryAttempts: 1 });
    expect(result.status).toBe('ERROR');
    if (result.status === 'ERROR') {
      expect(result.message).not.toContain('hf_dummy_sync_token');
      expect(result.message).toContain('[REDACTED]');
    }
  });

  it('accepts HUGGING_FACE_TOKEN as a supported token alias without exposing it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-dataset-alias-'));
    const mirror = new DecisionMemoryMirror(join(dir, 'memory.json'));
    mirror.putMany([row('alias')]);
    const priorShort = process.env.HF_TOKEN;
    const priorLong = process.env.HUGGING_FACE_TOKEN;
    try {
      delete process.env.HF_TOKEN;
      process.env.HUGGING_FACE_TOKEN = 'dummy-hf-token-alias';
      process.env.HF_DECISION_MEMORY_REPO = 'owner/apex-test-dataset';
      const client: DatasetHubClient = {
        uploadFile: async () => undefined,
        downloadFile: async () => null,
      };
      const result = await syncDecisionMemoryToDataset(mirror, { client, statePath: join(dir, 'state.json'), retryAttempts: 1 });
      expect(result.status).toBe('SYNCED');
      expect(JSON.stringify(result)).not.toContain('dummy-hf-token-alias');
    } finally {
      if (priorShort === undefined) delete process.env.HF_TOKEN; else process.env.HF_TOKEN = priorShort;
      if (priorLong === undefined) delete process.env.HUGGING_FACE_TOKEN; else process.env.HUGGING_FACE_TOKEN = priorLong;
    }
  });

});
