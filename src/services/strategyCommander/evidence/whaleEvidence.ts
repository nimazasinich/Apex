import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import type { SupplementalBundle } from '../../providers/supplementalTypes';
import { directionFromSignedScore, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';
import { exactSupplementalSymbol, supplementalExpiry, supplementalObservedAt, supplementalQuality } from './supplementalEvidenceUtils';

export interface WhaleEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  supplementalBundle?: SupplementalBundle;
}

export function buildWhaleEvidence(input: WhaleEvidenceInput): CommanderEvidenceV1 {
  const onchain = input.supplementalBundle?.onchain;
  if (!onchain) return unavailableCommanderEvidence(input, 'WHALE', 'whale_cache_missing');
  if (!exactSupplementalSymbol(input.symbol, onchain.symbol)) return unavailableCommanderEvidence(input, 'WHALE', 'whale_symbol_identity_mismatch', 'INVALID');
  const quality = supplementalQuality(onchain, input.receivedAt);
  if (quality === 'INVALID') return unavailableCommanderEvidence(input, 'WHALE', 'whale_timestamp_or_source_invalid', 'INVALID');
  if (quality === 'NOT_CONFIGURED' || quality === 'MISSING') {
    return unavailableCommanderEvidence(input, 'WHALE', onchain.reason ?? `whale_${onchain.source}`, quality);
  }
  const eligible = onchain.data.filter((signal) => (signal.type === 'exchange_deposit' || signal.type === 'exchange_withdrawal')
    && Number.isFinite(signal.amountUSD) && Number(signal.amountUSD) > 0);
  if (!eligible.length) return unavailableCommanderEvidence(input, 'WHALE', 'whale_direction_or_usd_notional_missing');
  const total = eligible.reduce((sum, signal) => sum + Number(signal.amountUSD), 0);
  if (!(total > 0) || !Number.isFinite(total)) return unavailableCommanderEvidence(input, 'WHALE', 'whale_usd_notional_invalid', 'INVALID');
  const signed = eligible.reduce((sum, signal) => sum + (signal.type === 'exchange_withdrawal' ? 1 : -1) * Number(signal.amountUSD), 0);
  const score = signed / total;
  const confidence = Math.min(0.8, eligible.length / 5);
  return makeCommanderEvidence({
    ...input,
    observedAt: supplementalObservedAt(onchain)!,
    expiresAt: supplementalExpiry(onchain),
    source: onchain.provider,
  }, 'WHALE', {
    direction: directionFromSignedScore(score),
    score,
    confidence,
    valueQuality: quality,
    supportingReasons: [`eligible_exchange_flows:${eligible.length}`, `directional_usd_share:${score.toFixed(4)}`],
    conflictingReasons: score === 0 ? ['exchange_deposits_and_withdrawals_balanced'] : [],
    rawEvidenceIds: eligible.map((signal) => signal.transactionHash).filter(Boolean),
  });
}
