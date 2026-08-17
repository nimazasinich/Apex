/**
 * Data provenance chip (GAP UI-02).
 *
 * Renders state + source + age for a card's payload, so an operator can tell a
 * live Binance read from a two-minute-old cached one at a glance. Reuses the
 * existing `StatusBadge` for the state dot rather than inventing a second badge
 * vocabulary; this chip only adds the provenance text beside it.
 *
 * Renders metadata only — it never gates or hides card content.
 */
import React from 'react';
import type { DataState, UiDataMeta } from '../../types';
import { provenanceSourceLabel } from '../../lib/dataProvenance';
import { StatusBadge } from '../primitives';

export interface ProvenanceChipProps {
  meta: UiDataMeta;
  /** Show the underlying StatusBadge dot. Off where a badge already exists. */
  showBadge?: boolean;
  className?: string;
}

/** Map the richer UiDataState back onto the 4-value DataState the badge takes. */
function badgeState(meta: UiDataMeta): DataState {
  if (meta.state === 'live') return 'live';
  if (meta.state === 'unavailable' || meta.state === 'error') return 'unavailable';
  if (meta.state === 'blocked') return 'not_configured';
  return 'degraded';
}

export function ProvenanceChip({ meta, showBadge = false, className = '' }: ProvenanceChipProps) {
  const source = provenanceSourceLabel(meta);
  const isLive = meta.state === 'live';
  return (
    <span
      className={`apex-provenance-chip ${meta.state}${className ? ` ${className}` : ''}`}
      data-provenance-state={meta.state}
      data-provenance-live={isLive ? 'true' : 'false'}
      data-provenance-source={meta.source ?? 'unreported'}
      title={meta.observedAt ? `Observed at ${meta.observedAt}` : 'No observation time reported'}
    >
      {showBadge && <StatusBadge state={badgeState(meta)} showLabel={false} />}
      <span className="apex-provenance-label">{meta.label}</span>
      <span className="apex-provenance-source">{source}</span>
    </span>
  );
}
