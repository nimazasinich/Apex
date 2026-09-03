/**
 * Shared account snapshot status presenter (GAP UI-01 consumer wiring).
 *
 * `describeSnapshotFreshness` answers "how old is this snapshot". Account views
 * additionally have loading / error / live-locked conditions that outrank
 * freshness. Every account page previously re-derived that precedence inline and
 * ignored `syncedAt` entirely, so cached snapshots rendered as live truth.
 *
 * This module centralizes the precedence so all account surfaces agree, and is a
 * pure function so it is testable under the repo's `environment: 'node'` vitest
 * setup (there is no jsdom/testing-library in this project).
 *
 * Invariant: this NEVER reports a content-hiding state. Stale and unavailable
 * snapshots keep their cached rows visible and are labelled instead.
 */
import { describeSnapshotFreshness, type SnapshotFreshnessState } from './snapshotFreshness';

export type AccountSnapshotStatusState = 'loading' | 'error' | 'locked' | 'partial' | SnapshotFreshnessState;

/** Visual variant, matching the existing `.v20-live-state` CSS vocabulary. */
export type AccountSnapshotStatusVariant = 'loading' | 'error' | 'ready' | 'stale' | 'unknown';

export interface AccountSnapshotStatusInput {
  loading?: boolean;
  error?: string | null;
  connection?: { mode?: string | null; status?: string | null; exchange?: string | null } | null;
  snapshot?: { syncedAt?: string | null; quality?: { state?: 'complete' | 'partial'; failures?: string[] } } | null;
  /** Injectable clock for deterministic tests. */
  now?: number;
}

export interface AccountSnapshotStatus {
  state: AccountSnapshotStatusState;
  variant: AccountSnapshotStatusVariant;
  /** Operator-facing label, safe to render directly. */
  label: string;
  /** Full ISO timestamp for a tooltip, or null when unusable. */
  title: string | null;
  /** True only when the data is verifiably current. */
  isLive: boolean;
  /** True when the snapshot must not be read as live truth. */
  isDegraded: boolean;
  /**
   * Always false. Encoded explicitly so a regression that hides cached rows on
   * staleness is caught by a test rather than by a user.
   */
  hidesContent: false;
  ageMs: number | null;
  syncedAt: string | null;
  /**
   * Provider that produced the snapshot, when the connection reports one (GAP
   * UI-02). Undefined when unreported — callers render
   * `UNREPORTED_SOURCE_LABEL` rather than guessing a venue.
   */
  source?: string;
}

/**
 * Derive a truthful provider label from the connection descriptor (GAP UI-02).
 *
 * A demo session executes virtually against real market data, so naming the
 * venue alone would imply live exchange state. Only a genuinely connected live
 * session is attributed to the exchange itself; anything else is either
 * qualified or left unreported.
 */
function deriveSource(connection: AccountSnapshotStatusInput['connection']): string | undefined {
  const exchange = typeof connection?.exchange === 'string' ? connection.exchange.trim() : '';
  const mode = connection?.mode;

  if (mode === 'demo') return exchange ? `${exchange} demo` : 'demo session';
  if (mode === 'live' && connection?.status === 'connected') return exchange || undefined;
  if (mode === 'live' && exchange) return `${exchange} (not connected)`;
  return undefined;
}

export function deriveAccountSnapshotStatus(input: AccountSnapshotStatusInput): AccountSnapshotStatus {
  const freshness = describeSnapshotFreshness(input.snapshot?.syncedAt, input.now ?? Date.now());
  const base = {
    title: freshness.syncedAt,
    ageMs: freshness.ageMs,
    syncedAt: freshness.syncedAt,
    hidesContent: false as const,
    source: deriveSource(input.connection),
  };

  if (input.loading) {
    return { ...base, state: 'loading', variant: 'loading', label: 'Synchronizing', isLive: false, isDegraded: true };
  }

  if (input.error) {
    return { ...base, state: 'error', variant: 'error', label: 'Sync issue', isLive: false, isDegraded: true };
  }

  // Live mode without a connected session cannot be presented as live truth.
  if (input.connection?.mode === 'live' && input.connection?.status !== 'connected') {
    return { ...base, state: 'locked', variant: 'stale', label: 'Live locked', isLive: false, isDegraded: true };
  }

  if (input.snapshot?.quality?.state === 'partial') {
    return { ...base, state: 'partial', variant: 'stale', label: 'Partial snapshot', isLive: false, isDegraded: true };
  }

  if (freshness.state === 'live') {
    return { ...base, state: 'live', variant: 'ready', label: freshness.label, isLive: true, isDegraded: false };
  }

  return {
    ...base,
    state: freshness.state,
    variant: freshness.state === 'stale' ? 'stale' : 'unknown',
    label: freshness.label,
    isLive: false,
    isDegraded: true,
  };
}