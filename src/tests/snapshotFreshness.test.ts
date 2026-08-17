import { describe, expect, it } from 'vitest';

import {
  SNAPSHOT_STALE_AFTER_MS,
  describeSnapshotFreshness,
  isSnapshotDegraded,
} from '../lib/snapshotFreshness';

const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('describeSnapshotFreshness (GAP UI-01)', () => {
  it('reports a just-synced snapshot as live', () => {
    const result = describeSnapshotFreshness(at(500), NOW);

    expect(result.state).toBe('live');
    expect(result.label).toBe('Snapshot ready · now');
    expect(result.ageMs).toBe(500);
    expect(isSnapshotDegraded(result)).toBe(false);
  });

  it('reports a recent snapshot as live with a seconds age', () => {
    const result = describeSnapshotFreshness(at(3_000), NOW);

    expect(result.state).toBe('live');
    expect(result.label).toBe('Snapshot ready · 3s ago');
  });

  it('reports an old snapshot as stale, not live', () => {
    const result = describeSnapshotFreshness(at(40 * 60_000), NOW);

    expect(result.state).toBe('stale');
    expect(result.label).toBe('Cached · 40m ago');
    expect(isSnapshotDegraded(result)).toBe(true);
  });

  it('formats hour-scale ages', () => {
    const result = describeSnapshotFreshness(at(3 * 3_600_000), NOW);

    expect(result.state).toBe('stale');
    expect(result.label).toBe('Cached · 3h ago');
  });

  it('treats the stale threshold as inclusive', () => {
    expect(
      describeSnapshotFreshness(at(SNAPSHOT_STALE_AFTER_MS - 1), NOW).state,
    ).toBe('live');

    expect(
      describeSnapshotFreshness(at(SNAPSHOT_STALE_AFTER_MS), NOW).state,
    ).toBe('stale');
  });

  it('never reports an unverifiable age as live', () => {
    for (const input of [null, undefined, '', '   ', 'not-a-date']) {
      const result = describeSnapshotFreshness(input, NOW);

      expect(result.state).toBe('unavailable');
      expect(result.label).toBe('Snapshot age unknown');
      expect(result.ageMs).toBeNull();
      expect(isSnapshotDegraded(result)).toBe(true);
    }
  });

  it('rejects a future timestamp as clock skew rather than live', () => {
    const result = describeSnapshotFreshness(
      new Date(NOW + 120_000).toISOString(),
      NOW,
    );

    expect(result.state).toBe('unavailable');
    expect(result.label).toBe('Snapshot clock skew');
    expect(isSnapshotDegraded(result)).toBe(true);
  });

  it('tolerates sub-second clock jitter as live', () => {
    expect(
      describeSnapshotFreshness(new Date(NOW + 200).toISOString(), NOW).state,
    ).toBe('live');
  });

  it('normalizes the reported timestamp to ISO', () => {
    expect(
      describeSnapshotFreshness('2026-08-10T11:59:30Z', NOW).syncedAt,
    ).toBe('2026-08-10T11:59:30.000Z');
  });
});
