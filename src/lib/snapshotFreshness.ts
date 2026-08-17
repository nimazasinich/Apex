/**
 * Account snapshot freshness derivation (GAP UI-01).
 *
 * `AccountSnapshot.syncedAt` is produced by connectedExchange/demoAccount but was
 * never consumed by any view, so a 3-second-old snapshot and a 40-minute-old
 * snapshot rendered identically as live truth. This module converts that
 * timestamp into an explicit, renderable state so cached/stale data is never
 * presented as live.
 */

/** Snapshots older than this are cached reads, not live truth. */
export const SNAPSHOT_STALE_AFTER_MS = 60_000;

/** Subset of UI data states this helper can produce. */
export type SnapshotFreshnessState = 'live' | 'stale' | 'unavailable';

export interface SnapshotFreshness {
  state: SnapshotFreshnessState;
  /** Short operator-facing label, safe to render directly. */
  label: string;
  /** Age in ms, or null when no usable timestamp was reported. */
  ageMs: number | null;
  /** Normalized ISO timestamp, or null when unusable. */
  syncedAt: string | null;
}

function formatAge(ageMs: number): string {
  if (ageMs < 1_000) return 'now';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  return `${Math.floor(ageMs / 3_600_000)}h ago`;
}

/**
 * Describe how fresh an account snapshot is.
 *
 * Returns `unavailable` (never `live`) when the timestamp is missing, malformed,
 * or materially in the future — an unverifiable age must not be presented as
 * live truth. Sub-second clock jitter is tolerated.
 */
export function describeSnapshotFreshness(
  syncedAt: string | null | undefined,
  now: number = Date.now(),
  staleAfterMs: number = SNAPSHOT_STALE_AFTER_MS,
): SnapshotFreshness {
  if (typeof syncedAt !== 'string' || !syncedAt.trim()) {
    return {
      state: 'unavailable',
      label: 'Snapshot age unknown',
      ageMs: null,
      syncedAt: null,
    };
  }

  const parsed = Date.parse(syncedAt);
  if (!Number.isFinite(parsed)) {
    return {
      state: 'unavailable',
      label: 'Snapshot age unknown',
      ageMs: null,
      syncedAt: null,
    };
  }

  const iso = new Date(parsed).toISOString();
  const ageMs = now - parsed;

  if (ageMs < -1_000) {
    return {
      state: 'unavailable',
      label: 'Snapshot clock skew',
      ageMs: null,
      syncedAt: iso,
    };
  }

  const safeAge = Math.max(0, ageMs);

  if (safeAge >= staleAfterMs) {
    return {
      state: 'stale',
      label: `Cached · ${formatAge(safeAge)}`,
      ageMs: safeAge,
      syncedAt: iso,
    };
  }

  return {
    state: 'live',
    label: `Snapshot ready · ${formatAge(safeAge)}`,
    ageMs: safeAge,
    syncedAt: iso,
  };
}

/** True when the snapshot must not be presented as live truth. */
export function isSnapshotDegraded(freshness: SnapshotFreshness): boolean {
  return freshness.state !== 'live';
}
