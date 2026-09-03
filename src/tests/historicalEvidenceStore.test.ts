import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  evidenceAvailableAsOf,
  finalizeHistoricalEvidenceDataset,
  loadHistoricalEvidenceDataset,
  persistHistoricalEvidenceDataset,
  requireHistoricalEvidenceCoverage,
  type HistoricalEvidenceRecord,
} from '../services/research/historicalEvidenceStore';

const row = (id: string, kind: HistoricalEvidenceRecord['kind'], t: number, payload: unknown = { value: id }): HistoricalEvidenceRecord => ({
  id, kind, provider: 'fixture', venue: 'kucoin', instrument: 'BTC-USDT', sourceObservedAt: t, receivedAt: t + 10,
  schemaVersion: '1', adapterVersion: 'fixture-v1', lineageId: `lineage:${id}`, parentLineageIds: [], payload,
});

describe('immutable historical evidence store', () => {
  it('never exposes future evidence to an as-of replay', () => {
    const dataset = finalizeHistoricalEvidenceDataset([row('old','NEWS',1_000), row('future','NEWS',3_000)]);
    expect(evidenceAvailableAsOf(dataset, 2_000).map((x) => x.id)).toEqual(['old']);
  });

  it('changes the content fingerprint when data bytes/semantics change', () => {
    const a = finalizeHistoricalEvidenceDataset([row('a','CLOSED_CANDLE',1_000,{ close: 100 })]);
    const b = finalizeHistoricalEvidenceDataset([row('a','CLOSED_CANDLE',1_000,{ close: 101 })]);
    expect(a.manifest.sha256).not.toBe(b.manifest.sha256);
  });

  it('blocks full-strategy coverage when a required modality is absent', () => {
    const dataset = finalizeHistoricalEvidenceDataset([row('a','CLOSED_CANDLE',1_000)]);
    expect(requireHistoricalEvidenceCoverage(dataset, ['CLOSED_CANDLE','FUNDING'])).toEqual({ ok: false, state: 'BLOCKED', reason: 'REQUIRED_DATASET_NOT_PRESENT', missing: ['FUNDING'] });
  });

  it('detects tampering after content-addressed persistence', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'apex-evidence-'));
    const dataset = finalizeHistoricalEvidenceDataset([row('a','EXECUTED_TRADE',1_000)]);
    const paths = persistHistoricalEvidenceDataset(dir, dataset);
    const records = JSON.parse(readFileSync(paths.dataPath,'utf8'));
    records[0].payload = { changed: true };
    writeFileSync(paths.dataPath, JSON.stringify(records));
    expect(() => loadHistoricalEvidenceDataset(paths.dataPath, paths.manifestPath)).toThrow('historical_evidence_dataset_tampered');
  });
});
