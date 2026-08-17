/**
 * Data provenance presenter (GAP UI-02).
 *
 * Cards across the terminal render a bare `DataState` badge: the operator sees
 * "LIVE FEED" with no indication of which provider produced the number or how
 * old it is. `PriceChart` already does this correctly (state + source + age via
 * `ChartFeedStatus`), but that logic is inline and unreachable from other cards.
 *
 * This module lifts the same idea into the pre-existing `UiDataMeta` shape —
 * which until now had zero consumers — so no new status vocabulary is
 * introduced. It is pure, so it is testable under the repo's `environment:
 * 'node'` vitest setup.
 *
 * Truthfulness rules encoded here:
 *   - an unreported source is shown as unreported, never as PRIMARY/LIVE;
 *   - a stale payload keeps its source visible but loses its live claim;
 *   - an unavailable payload can never render as sourced live data.
 */
import type { DataState, UiDataMeta, UiDataState } from '../types';

/**
 * Default staleness cut-off. Call sites should pass a value derived from their
 * own poll cadence — a threshold below the refresh interval would flap between
 * live and stale on every cycle.
 */
export const DEFAULT_PROVENANCE_STALE_AFTER_MS = 120_000;

export interface ProvenanceInput {
  /** Feed state as reported by the producer. */
  dataState?: DataState | null;
  /** Epoch ms the payload was observed. */
  timestamp?: number | null;
  /** Provider identifier, when the producer reports one. */
  source?: string | null;
  loading?: boolean;
  error?: string | null;
  staleAfterMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: number;
}

/** Rendered when the producer does not report a provider. */
export const UNREPORTED_SOURCE_LABEL = 'source unreported';

function formatAge(ageMs: number): string {
  if (ageMs < 1_000) return 'now';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  return `${Math.floor(ageMs / 3_600_000)}h ago`;
}

/** `binance_futures` -> `binance futures`, matching the PriceChart convention. */
function normalizeSource(source: string | null | undefined): string | undefined {
  if (typeof source !== 'string') return undefined;
  const trimmed = source.trim();
  if (!trimmed) return undefined;
  return trimmed.replaceAll('_', ' ');
}

/** Base state label, before any staleness override. */
function baseLabel(state: DataState): string {
  if (state === 'live') return 'Live';
  if (state === 'degraded') return 'Fallback';
  if (state === 'not_configured') return 'Not configured';
  return 'Offline';
}

function baseUiState(state: DataState): UiDataState {
  if (state === 'live') return 'live';
  // Degraded means the feed answered, but not at full fidelity.
  if (state === 'degraded') return 'partial';
  return 'unavailable';
}

/**
 * Describe where a payload came from and how much it can be trusted.
 *
 * Returns the existing `UiDataMeta` shape so consumers share one vocabulary.
 * `source` is left undefined rather than guessed when the producer is silent.
 */
export function describeProvenance(input: ProvenanceInput): UiDataMeta {
  const now = input.now ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_PROVENANCE_STALE_AFTER_MS;
  const source = normalizeSource(input.source);

  if (input.loading) {
    return { state: 'loading', label: 'Loading', source, retryable: false };
  }

  if (input.error) {
    return {
      state: 'error',
      label: 'Error',
      source,
      reason: input.error,
      retryable: true,
    };
  }

  const dataState: DataState = input.dataState ?? 'unavailable';
  const uiState = baseUiState(dataState);

  // A usable age requires a finite, non-future timestamp. Anything else is an
  // unverifiable age and must not prop up a live claim.
  const ts = input.timestamp;
  const hasUsableTs = typeof ts === 'number' && Number.isFinite(ts) && ts > 0 && now - ts >= -1_000;
  const ageMs = hasUsableTs ? Math.max(0, now - (ts as number)) : undefined;
  const observedAt = hasUsableTs ? new Date(ts as number).toISOString() : undefined;

  // Staleness only downgrades states that still claim usable data.
  const claimsData = uiState === 'live' || uiState === 'partial';
  if (claimsData && ageMs !== undefined && ageMs >= staleAfterMs) {
    return {
      state: 'stale',
      label: `Cached · ${formatAge(ageMs)}`,
      source,
      observedAt,
      ageMs,
      reason: 'Older than the expected refresh interval.',
      retryable: true,
    };
  }

  // A live claim with no verifiable age is not a live claim.
  if (claimsData && ageMs === undefined) {
    return {
      state: uiState === 'live' ? 'stale' : uiState,
      label: uiState === 'live' ? 'Age unknown' : baseLabel(dataState),
      source,
      reason: 'Producer reported no usable timestamp.',
      retryable: true,
    };
  }

  const label = ageMs !== undefined && claimsData
    ? `${baseLabel(dataState)} · ${formatAge(ageMs)}`
    : baseLabel(dataState);

  return {
    state: uiState,
    label,
    source,
    observedAt,
    ageMs,
    reason: dataState === 'not_configured' ? 'Provider is not configured.' : undefined,
    retryable: uiState === 'unavailable',
  };
}

/** True when the payload may be presented as current, sourced truth. */
export function isProvenanceLive(meta: UiDataMeta): boolean {
  return meta.state === 'live';
}

/** Source text safe to render directly: never implies a provider that was not reported. */
export function provenanceSourceLabel(meta: UiDataMeta): string {
  return meta.source ?? UNREPORTED_SOURCE_LABEL;
}
