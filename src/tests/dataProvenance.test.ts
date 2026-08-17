/**
 * GAP UI-02 provenance tests.
 *
 * The repo runs vitest with `environment: 'node'` and ships no jsdom or
 * testing-library, so these exercise the pure presenter that ProvenanceChip
 * renders from — proving behavior rather than matching source strings.
 */
import { describe, expect, it } from 'vitest';
import {
  describeProvenance,
  isProvenanceLive,
  provenanceSourceLabel,
  UNREPORTED_SOURCE_LABEL,
} from '../lib/dataProvenance';

const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const ago = (ms: number) => NOW - ms;
const STALE_AFTER = 120_000;
const base = { staleAfterMs: STALE_AFTER, now: NOW };

describe('describeProvenance — GAP UI-02', () => {
  describe('1. live payload with a known source', () => {
    const meta = describeProvenance({
      ...base, dataState: 'live', timestamp: ago(5_000), source: 'binance_futures',
    });

    it('reports live', () => {
      expect(meta.state).toBe('live');
      expect(isProvenanceLive(meta)).toBe(true);
    });

    it('shows the provider, normalized for display', () => {
      expect(meta.source).toBe('binance futures');
      expect(provenanceSourceLabel(meta)).toBe('binance futures');
    });

    it('reports a truthful age', () => {
      expect(meta.ageMs).toBe(5_000);
      expect(meta.label).toBe('Live · 5s ago');
      expect(meta.observedAt).toBe(new Date(ago(5_000)).toISOString());
    });
  });

  describe('2. stale payload keeps its source but loses the live claim', () => {
    const meta = describeProvenance({
      ...base, dataState: 'live', timestamp: ago(10 * 60_000), source: 'kucoin_futures',
    });

    it('is marked cached, never live', () => {
      expect(meta.state).toBe('stale');
      expect(isProvenanceLive(meta)).toBe(false);
      expect(meta.label).toBe('Cached · 10m ago');
    });

    it('still shows where the cached data came from', () => {
      expect(meta.source).toBe('kucoin futures');
    });

    it('treats the threshold as inclusive', () => {
      const under = describeProvenance({ ...base, dataState: 'live', timestamp: ago(STALE_AFTER - 1) });
      const at = describeProvenance({ ...base, dataState: 'live', timestamp: ago(STALE_AFTER) });
      expect(under.state).toBe('live');
      expect(at.state).toBe('stale');
    });
  });

  describe('3. a missing source is reported as unreported, never as live truth', () => {
    for (const missing of [undefined, null, '', '   ']) {
      it(`does not invent a provider for ${JSON.stringify(missing)}`, () => {
        const meta = describeProvenance({
          ...base, dataState: 'live', timestamp: ago(1_000), source: missing as string | null,
        });
        expect(meta.source).toBeUndefined();
        expect(provenanceSourceLabel(meta)).toBe(UNREPORTED_SOURCE_LABEL);
      });
    }

    it('never implies a PRIMARY or LIVE provider in the source label', () => {
      const meta = describeProvenance({ ...base, dataState: 'live', timestamp: ago(1_000) });
      const label = provenanceSourceLabel(meta).toUpperCase();
      expect(label).not.toContain('PRIMARY');
      expect(label).not.toContain('LIVE');
    });
  });

  describe('4. unavailable never renders as sourced live data', () => {
    it('stays unavailable even when a source is known', () => {
      const meta = describeProvenance({
        ...base, dataState: 'unavailable', timestamp: ago(1_000), source: 'binance_futures',
      });
      expect(meta.state).toBe('unavailable');
      expect(isProvenanceLive(meta)).toBe(false);
      expect(meta.label).toBe('Offline');
    });

    it('does not attach a freshness claim to an offline payload', () => {
      const meta = describeProvenance({ ...base, dataState: 'unavailable', timestamp: ago(1_000) });
      expect(meta.label).not.toContain('ago');
    });

    it('reports not_configured distinctly and never as live', () => {
      const meta = describeProvenance({ ...base, dataState: 'not_configured', timestamp: ago(1_000) });
      expect(meta.state).toBe('unavailable');
      expect(meta.label).toBe('Not configured');
      expect(isProvenanceLive(meta)).toBe(false);
    });
  });

  describe('5. unverifiable timestamps cannot support a live claim', () => {
    for (const bad of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      it(`refuses to report live for timestamp ${String(bad)}`, () => {
        const meta = describeProvenance({
          ...base, dataState: 'live', timestamp: bad as number | null, source: 'binance_futures',
        });
        expect(isProvenanceLive(meta)).toBe(false);
        expect(meta.state).toBe('stale');
        expect(meta.label).toBe('Age unknown');
        expect(meta.ageMs).toBeUndefined();
      });
    }

    it('rejects a materially future timestamp', () => {
      const meta = describeProvenance({ ...base, dataState: 'live', timestamp: NOW + 10 * 60_000 });
      expect(isProvenanceLive(meta)).toBe(false);
      expect(meta.label).toBe('Age unknown');
    });

    it('tolerates sub-second clock jitter', () => {
      const meta = describeProvenance({ ...base, dataState: 'live', timestamp: NOW + 200 });
      expect(meta.state).toBe('live');
      expect(meta.ageMs).toBe(0);
    });
  });

  describe('6. degraded and transport states', () => {
    it('maps degraded to partial with a Fallback label, not live', () => {
      const meta = describeProvenance({
        ...base, dataState: 'degraded', timestamp: ago(2_000), source: 'binance_futures',
      });
      expect(meta.state).toBe('partial');
      expect(meta.label).toBe('Fallback · 2s ago');
      expect(isProvenanceLive(meta)).toBe(false);
      expect(meta.source).toBe('binance futures');
    });

    it('downgrades a long-cached degraded payload to stale', () => {
      const meta = describeProvenance({ ...base, dataState: 'degraded', timestamp: ago(10 * 60_000) });
      expect(meta.state).toBe('stale');
    });

    it('loading outranks the payload state', () => {
      const meta = describeProvenance({ ...base, loading: true, dataState: 'live', timestamp: ago(1_000) });
      expect(meta.state).toBe('loading');
      expect(isProvenanceLive(meta)).toBe(false);
    });

    it('error outranks the payload state and keeps the reason', () => {
      const meta = describeProvenance({
        ...base, error: 'matrix fetch failed', dataState: 'live', timestamp: ago(1_000),
      });
      expect(meta.state).toBe('error');
      expect(meta.reason).toBe('matrix fetch failed');
      expect(isProvenanceLive(meta)).toBe(false);
    });
  });

  it('only the live state is ever treated as live', () => {
    const cases = [
      { ...base, dataState: 'live' as const, timestamp: ago(10 * 60_000) },
      { ...base, dataState: 'degraded' as const, timestamp: ago(1_000) },
      { ...base, dataState: 'unavailable' as const, timestamp: ago(1_000) },
      { ...base, dataState: 'not_configured' as const, timestamp: ago(1_000) },
      { ...base, loading: true },
      { ...base, error: 'x' },
      { ...base, dataState: 'live' as const, timestamp: null },
    ];
    for (const input of cases) {
      expect(isProvenanceLive(describeProvenance(input))).toBe(false);
    }
  });
});
