/**
 * GAP UI-01 consumer wiring tests.
 *
 * These exercise the shared derivation that every account view now renders
 * through, so they prove consumer behavior rather than matching source strings.
 * The repo runs vitest with `environment: 'node'` and ships no jsdom or
 * testing-library, so a DOM render test is not available here; this asserts the
 * exact props the chip renders from.
 */
import { describe, expect, it } from 'vitest';
import { deriveAccountSnapshotStatus } from '../lib/accountSnapshotStatus';
import { SNAPSHOT_STALE_AFTER_MS } from '../lib/snapshotFreshness';

const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const demo = { mode: 'demo', status: 'demo', exchange: 'kucoin' };
const liveConnected = { mode: 'live', status: 'connected', exchange: 'kucoin' };

const base = { loading: false, error: null, connection: demo, now: NOW };

describe('deriveAccountSnapshotStatus — GAP UI-01 consumer wiring', () => {
  describe('1. fresh snapshot renders as live with a truthful label', () => {
    it('reports live and does not mark itself degraded', () => {
      const s = deriveAccountSnapshotStatus({ ...base, snapshot: { syncedAt: at(2_000) } });
      expect(s.state).toBe('live');
      expect(s.variant).toBe('ready');
      expect(s.isLive).toBe(true);
      expect(s.isDegraded).toBe(false);
      expect(s.label).toBe('Snapshot ready · 2s ago');
      expect(s.ageMs).toBe(2_000);
    });

    it('is live when connected in live mode', () => {
      const s = deriveAccountSnapshotStatus({
        ...base, connection: liveConnected, snapshot: { syncedAt: at(1_000) },
      });
      expect(s.isLive).toBe(true);
      expect(s.state).toBe('live');
    });
  });

  describe('2. stale snapshot is marked cached, stays visible, is not live', () => {
    const stale = deriveAccountSnapshotStatus({ ...base, snapshot: { syncedAt: at(40 * 60_000) } });

    it('surfaces a cached/stale indicator', () => {
      expect(stale.state).toBe('stale');
      expect(stale.variant).toBe('stale');
      expect(stale.label).toBe('Cached · 40m ago');
      expect(stale.label.toLowerCase()).toContain('cached');
    });

    it('is never presented as live', () => {
      expect(stale.isLive).toBe(false);
      expect(stale.isDegraded).toBe(true);
    });

    // The core UX rule: degrade the labelling, never the content.
    it('does not hide usable cached data', () => {
      expect(stale.hidesContent).toBe(false);
    });

    it('treats the 60s threshold as inclusive', () => {
      const justUnder = deriveAccountSnapshotStatus({ ...base, snapshot: { syncedAt: at(SNAPSHOT_STALE_AFTER_MS - 1) } });
      const exactly = deriveAccountSnapshotStatus({ ...base, snapshot: { syncedAt: at(SNAPSHOT_STALE_AFTER_MS) } });
      expect(justUnder.isLive).toBe(true);
      expect(exactly.isLive).toBe(false);
      expect(exactly.state).toBe('stale');
    });
  });

  describe('3. missing or malformed syncedAt is unavailable, never live', () => {
    for (const bad of [undefined, null, '', '   ', 'not-a-date']) {
      it(`rejects ${JSON.stringify(bad)}`, () => {
        const s = deriveAccountSnapshotStatus({ ...base, snapshot: { syncedAt: bad as string | null } });
        expect(s.state).toBe('unavailable');
        expect(s.variant).toBe('unknown');
        expect(s.isLive).toBe(false);
        expect(s.isDegraded).toBe(true);
        expect(s.label).toBe('Snapshot age unknown');
        expect(s.hidesContent).toBe(false);
      });
    }

    it('treats a wholly absent snapshot as unavailable', () => {
      const s = deriveAccountSnapshotStatus({ ...base, snapshot: null });
      expect(s.state).toBe('unavailable');
      expect(s.isLive).toBe(false);
    });
  });

  describe('4. material future timestamp is unavailable, never live', () => {
    it('flags clock skew', () => {
      const s = deriveAccountSnapshotStatus({
        ...base, snapshot: { syncedAt: new Date(NOW + 10 * 60_000).toISOString() },
      });
      expect(s.state).toBe('unavailable');
      expect(s.label).toBe('Snapshot clock skew');
      expect(s.isLive).toBe(false);
      expect(s.hidesContent).toBe(false);
    });

    it('still accepts sub-second jitter as live', () => {
      const s = deriveAccountSnapshotStatus({
        ...base, snapshot: { syncedAt: new Date(NOW + 200).toISOString() },
      });
      expect(s.isLive).toBe(true);
    });
  });

  describe('precedence: transport conditions outrank freshness, none hide content', () => {
    const fresh = { syncedAt: at(1_000) };

    it('loading outranks a fresh snapshot', () => {
      const s = deriveAccountSnapshotStatus({ ...base, loading: true, snapshot: fresh });
      expect(s.state).toBe('loading');
      expect(s.isLive).toBe(false);
    });

    it('error outranks a fresh snapshot', () => {
      const s = deriveAccountSnapshotStatus({ ...base, error: 'sync_failed', snapshot: fresh });
      expect(s.state).toBe('error');
      expect(s.isLive).toBe(false);
    });

    it('live-locked is never reported as live even with a fresh snapshot', () => {
      const s = deriveAccountSnapshotStatus({
        ...base, connection: { mode: 'live', status: 'not_connected' }, snapshot: fresh,
      });
      expect(s.state).toBe('locked');
      expect(s.label).toBe('Live locked');
      expect(s.isLive).toBe(false);
    });

    it('no derivable state ever hides content', () => {
      const cases = [
        { ...base, loading: true, snapshot: fresh },
        { ...base, error: 'x', snapshot: fresh },
        { ...base, connection: { mode: 'live', status: 'not_connected' }, snapshot: fresh },
        { ...base, snapshot: { syncedAt: at(3 * 3_600_000) } },
        { ...base, snapshot: null },
      ];
      for (const input of cases) {
        expect(deriveAccountSnapshotStatus(input).hidesContent).toBe(false);
      }
    });

    it('only the live state ever sets isLive', () => {
      const cases = [
        { ...base, loading: true, snapshot: fresh },
        { ...base, error: 'x', snapshot: fresh },
        { ...base, connection: { mode: 'live', status: 'not_connected' }, snapshot: fresh },
        { ...base, snapshot: { syncedAt: at(90_000) } },
        { ...base, snapshot: { syncedAt: 'garbage' } },
      ];
      for (const input of cases) {
        const s = deriveAccountSnapshotStatus(input);
        expect(s.isLive).toBe(false);
        expect(s.state).not.toBe('live');
      }
    });
  });

  // GAP UI-02: the chip already said HOW FRESH; it must also say WHERE FROM.
  describe('provenance: source is truthful or explicitly unreported', () => {
    const fresh = { syncedAt: at(1_000) };

    it('attributes a connected live session to the exchange', () => {
      const s = deriveAccountSnapshotStatus({ ...base, connection: liveConnected, snapshot: fresh });
      expect(s.source).toBe('kucoin');
      expect(s.isLive).toBe(true);
    });

    it('qualifies a demo session so it never reads as live exchange state', () => {
      const s = deriveAccountSnapshotStatus({ ...base, connection: demo, snapshot: fresh });
      expect(s.source).toBe('kucoin demo');
      expect(s.source).not.toBe('kucoin');
    });

    it('qualifies an unconnected live session rather than naming the venue bare', () => {
      const s = deriveAccountSnapshotStatus({
        ...base, connection: { mode: 'live', status: 'not_connected', exchange: 'kucoin' }, snapshot: fresh,
      });
      expect(s.source).toBe('kucoin (not connected)');
      expect(s.isLive).toBe(false);
      expect(s.state).toBe('locked');
    });

    it('leaves the source unreported when no exchange is known', () => {
      for (const connection of [null, {}, { mode: 'live', status: 'not_connected' }]) {
        const s = deriveAccountSnapshotStatus({ ...base, connection, snapshot: fresh });
        expect(s.source).toBeUndefined();
      }
    });

    it('keeps the source visible on a stale snapshot', () => {
      const s = deriveAccountSnapshotStatus({
        ...base, connection: liveConnected, snapshot: { syncedAt: at(40 * 60_000) },
      });
      expect(s.state).toBe('stale');
      expect(s.source).toBe('kucoin');
      expect(s.isLive).toBe(false);
      expect(s.hidesContent).toBe(false);
    });

    it('never invents a provider for an unavailable snapshot', () => {
      const s = deriveAccountSnapshotStatus({ ...base, connection: null, snapshot: null });
      expect(s.state).toBe('unavailable');
      expect(s.source).toBeUndefined();
      expect(s.isLive).toBe(false);
    });
  });
});