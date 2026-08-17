/**
 * Account snapshot freshness chip (GAP UI-01, provenance added by GAP UI-02).
 *
 * Renders the existing `.v20-live-state` chip from a shared, truthful status
 * derivation instead of each page re-deriving it and ignoring `syncedAt`.
 * Deliberately renders only metadata: it never gates or hides page content, so
 * cached rows stay usable while being unmistakably marked as cached.
 *
 * UI-02 adds the data source beside the freshness label, using the same
 * "unreported" vocabulary as `ProvenanceChip` rather than a second one.
 */
import React from 'react';
import {
  deriveAccountSnapshotStatus,
  type AccountSnapshotStatusInput,
} from '../../lib/accountSnapshotStatus';
import { UNREPORTED_SOURCE_LABEL } from '../../lib/dataProvenance';

export interface AccountFreshnessChipProps extends AccountSnapshotStatusInput {
  className?: string;
  /** Hide the source segment where a venue is already labelled adjacently. */
  showSource?: boolean;
}

export function AccountFreshnessChip({ className, showSource = true, ...input }: AccountFreshnessChipProps) {
  const status = deriveAccountSnapshotStatus(input);
  return (
    <span
      className={`v20-live-state ${status.variant}${className ? ` ${className}` : ''}`}
      data-snapshot-state={status.state}
      data-snapshot-live={status.isLive ? 'true' : 'false'}
      data-snapshot-source={status.source ?? 'unreported'}
      title={status.title ? `Snapshot synced at ${status.title}` : 'Snapshot sync time unavailable'}
    >
      <i />
      {status.label}
      {showSource && (
        <span className="v20-live-state-source">{status.source ?? UNREPORTED_SOURCE_LABEL}</span>
      )}
    </span>
  );
}