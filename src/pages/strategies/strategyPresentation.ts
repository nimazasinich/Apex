import type { BacktestInterval, StrategyDefinition, TradeDirection } from '../../types';

export type StrategyDataTier = 'Standard' | 'Funding' | 'Level 2' | 'Cross-venue' | 'Alternative data';
export type StrategyDisplayStatus = 'Verified' | 'Candidate' | 'Research Preview' | 'Blocked' | 'Evidence Pending';

export function strategyDataTier(strategy: StrategyDefinition): StrategyDataTier {
  const requirements = strategy.dataRequirements.join(' ').toLowerCase();
  if (/alternative data|on-chain|social|sentiment/.test(requirements)) return 'Alternative data';
  if (/level\s*2|order book|l2|trade prints/.test(requirements)) return 'Level 2';
  if (/multi-exchange|cross-exchange|two live exchanges|spot.*perp|perp.*spot/.test(requirements)) return 'Cross-venue';
  if (/funding|basis|open interest|taker flow/.test(requirements)) return 'Funding';
  return 'Standard';
}

export function hasBoundEvidence(strategy: StrategyDefinition): boolean {
  const snapshot = strategy.latestSnapshot;
  return Boolean(
    snapshot
      && snapshot.source
      && snapshot.symbol
      && snapshot.interval
      && snapshot.direction
      && snapshot.lastBacktestAt
      && Number.isFinite(snapshot.lastBacktestAt)
      && typeof snapshot.dateFrom === 'number'
      && Number.isFinite(snapshot.dateFrom)
      && typeof snapshot.dateTo === 'number'
      && Number.isFinite(snapshot.dateTo)
      && typeof snapshot.commissionPctPerSide === 'number'
      && Number.isFinite(snapshot.commissionPctPerSide)
      && typeof snapshot.slippagePctPerSide === 'number'
      && Number.isFinite(snapshot.slippagePctPerSide)
      && typeof snapshot.fundingPctEstimate === 'number'
      && Number.isFinite(snapshot.fundingPctEstimate)
      && typeof snapshot.sampleSize === 'number'
      && Number.isFinite(snapshot.sampleSize)
      && snapshot.sampleSize > 0
      && snapshot.engine
      && snapshot.runId
      && snapshot.validationMethod,
  );
}

export function strategyDisplayStatus(strategy: StrategyDefinition): StrategyDisplayStatus {
  if (strategy.status === 'blocked') return 'Blocked';
  const boundEvidence = hasBoundEvidence(strategy);
  if (strategy.status === 'validated' && boundEvidence && strategy.latestSnapshot?.dataState === 'live') return 'Verified';
  // A complete snapshot sourced from degraded/non-live data is evidence, but it
  // must never be presented as an ordinary candidate state that can be mistaken
  // for verification-ready evidence. Keep it explicitly pending until live data
  // backs the snapshot.
  if (boundEvidence && strategy.latestSnapshot?.dataState && strategy.latestSnapshot.dataState !== 'live') return 'Evidence Pending';
  if (strategy.status === 'validated') return 'Evidence Pending';
  if (strategy.wave !== 'wave1-mvp') return 'Research Preview';
  return 'Candidate';
}

export function supportedDirections(strategy: StrategyDefinition): TradeDirection[] {
  return strategy.longShort === 'BOTH' ? ['LONG', 'SHORT'] : [strategy.longShort];
}

export function formatEvidenceDate(timestamp?: number): string {
  return timestamp ? new Date(timestamp).toLocaleString() : 'No bound evidence';
}

export function evidenceWarnings(strategy: StrategyDefinition): string[] {
  const snapshot = strategy.latestSnapshot;
  if (!snapshot) return ['No server evidence snapshot is bound to this model.'];
  const warnings = [...(snapshot.warnings ?? [])];
  if (!hasBoundEvidence(strategy)) warnings.unshift('Snapshot metrics are incomplete and are not presented as verified evidence.');
  if (snapshot.dataState && snapshot.dataState !== 'live') warnings.push(`Data state: ${snapshot.dataState.replaceAll('_', ' ')}.`);
  if (snapshot.costStressPassed === false) warnings.push('Cost-stress gate did not pass.');
  return Array.from(new Set(warnings));
}

export function evidenceComparable(strategies: StrategyDefinition[]): { comparable: boolean; reason: string } {
  if (strategies.length < 2) return { comparable: false, reason: 'Select at least two models.' };
  if (strategies.some((strategy) => !hasBoundEvidence(strategy))) {
    return { comparable: false, reason: 'Every selected model needs bound evidence provenance.' };
  }
  const snapshots = strategies.map((strategy) => strategy.latestSnapshot!);
  const first = snapshots[0];
  const same = snapshots.every((snapshot) => snapshot.symbol === first.symbol
    && snapshot.interval === first.interval
    && snapshot.direction === first.direction
    && snapshot.source === first.source
    && snapshot.dateFrom === first.dateFrom
    && snapshot.dateTo === first.dateTo
    && snapshot.sampleSize === first.sampleSize
    && snapshot.validationMethod === first.validationMethod
    && snapshot.dataState === first.dataState
    && snapshot.commissionPctPerSide === first.commissionPctPerSide
    && snapshot.slippagePctPerSide === first.slippagePctPerSide
    && snapshot.fundingPctEstimate === first.fundingPctEstimate);
  return same
    ? { comparable: true, reason: 'Dataset context, validation method, and cost assumptions match.' }
    : { comparable: false, reason: 'Dataset, market, timeframe, direction, validation method, or cost assumptions differ.' };
}

export function intervalLabel(interval?: BacktestInterval): string {
  return interval ?? '—';
}
