import { isOpportunityThesis, type OpportunityThesis } from '../../contracts/commander/commanderContext';
import { validateCommanderEvidence, type CommanderEvidenceV1 } from '../../contracts/commander/commanderEvidence';
import { governedEvidenceTrust, QUALITY_TRUST_MULTIPLIER, type GovernedEvidenceTrust } from './evidenceCompetence';

export const INTELLIGENCE_CONSENSUS_VERSION = 'commander_intelligence_consensus_v1' as const;
export const INITIAL_PARLIAMENT_EXPERTS = [
  'apex.momentum',
  'apex.direction_divergence',
  'apex.price_action',
  'apex.smart_money',
  'apex.liquidity',
  'apex.volatility',
  'apex.funding_oi',
  'apex.news',
  'apex.sentiment',
  'apex.whale',
  'apex.fibonacci',
  'apex.elliott',
  'apex.harmonic',
] as const;

export type ParliamentVetoCode =
  | 'EVIDENCE_IDENTITY_MISMATCH'
  | 'INVALID_EVIDENCE'
  | 'STALE_EVIDENCE'
  | 'LIQUIDITY_DEGRADATION'
  | 'EVENT_RISK'
  | 'CROSS_FAMILY_DIRECTION_CONFLICT';

export interface ParliamentDissentV1 {
  score: number;
  directionalDisagreement: number;
  scoreDispersion: number;
  confidenceWeightedDisagreement: number;
  materialVetoPenalty: number;
  crossTimeframeConflict: number;
  crossFamilyConflict: number;
}

export interface IntelligenceConsensusV1 {
  version: typeof INTELLIGENCE_CONSENSUS_VERSION;
  symbol: string;
  timestamp: string;
  shadowOnly: true;
  directionConsensus: { LONG: number; SHORT: number; NEUTRAL: number };
  thesisConsensus: Record<OpportunityThesis | 'UNCERTAIN', number>;
  leadingDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  leadingThesis: OpportunityThesis | 'UNCERTAIN';
  consensus: number;
  dissent: ParliamentDissentV1;
  materialVetoes: ParliamentVetoCode[];
  evidenceCompleteness: number;
  evidenceQuality: number;
  contextualTrust: number;
  trust: GovernedEvidenceTrust[];
  evidenceIds: string[];
  reasons: string[];
  fingerprint: string;
}

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number) => Number(clamp(value).toFixed(6));

export function parliamentFingerprint(value: unknown): string {
  const serialize = (entry: unknown): string => {
    if (entry === null || typeof entry !== 'object') return JSON.stringify(entry) ?? 'null';
    if (Array.isArray(entry)) return `[${entry.map(serialize).join(',')}]`;
    const record = entry as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`).join(',')}}`;
  };
  const text = serialize(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `parliament-fnv1a64-${hash.toString(16).padStart(16, '0')}`;
}

function normalize<T extends string>(weights: Record<T, number>, fallback: T): Record<T, number> {
  const total = Object.values<number>(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Object.fromEntries(Object.keys(weights).map((key) => [key, key === fallback ? 1 : 0])) as Record<T, number>;
  return Object.fromEntries(Object.entries<number>(weights).map(([key, value]) => [key, round(value / total)])) as Record<T, number>;
}

function directionFor(evidence: CommanderEvidenceV1): 'LONG' | 'SHORT' | 'NEUTRAL' | null {
  if (evidence.direction === 'LONG' || evidence.direction === 'SHORT' || evidence.direction === 'NEUTRAL') return evidence.direction;
  return null;
}

function leadingKey<T extends string>(weights: Record<T, number>): T {
  return (Object.entries<number>(weights).sort(([leftKey, left], [rightKey, right]) => right - left || leftKey.localeCompare(rightKey))[0]?.[0] ?? Object.keys(weights)[0]) as T;
}

function crossTimeframeConflict(evidence: readonly CommanderEvidenceV1[], included: Set<string>): number {
  const byFamily = new Map<string, Set<string>>();
  for (const row of evidence) {
    if (!included.has(row.evidenceId) || (row.direction !== 'LONG' && row.direction !== 'SHORT')) continue;
    const directions = byFamily.get(row.family) ?? new Set<string>();
    directions.add(row.direction);
    byFamily.set(row.family, directions);
  }
  const directionalFamilies = [...byFamily.values()];
  return directionalFamilies.length ? directionalFamilies.filter((directions) => directions.size > 1).length / directionalFamilies.length : 0;
}

function crossFamilyConflict(evidence: readonly CommanderEvidenceV1[], included: Set<string>): number {
  const familyDirections = new Map<string, Set<string>>();
  for (const row of evidence) {
    if (!included.has(row.evidenceId) || (row.direction !== 'LONG' && row.direction !== 'SHORT')) continue;
    const directions = familyDirections.get(row.family) ?? new Set<string>();
    directions.add(row.direction);
    familyDirections.set(row.family, directions);
  }
  const directional = [...familyDirections.values()].map((directions) => directions.has('LONG') && directions.has('SHORT') ? 'MIXED' : [...directions][0]);
  if (directional.length < 2) return 0;
  let conflicts = 0;
  let pairs = 0;
  for (let left = 0; left < directional.length; left += 1) {
    for (let right = left + 1; right < directional.length; right += 1) {
      pairs += 1;
      if (directional[left] === 'MIXED' || directional[right] === 'MIXED' || directional[left] !== directional[right]) conflicts += 1;
    }
  }
  return pairs ? conflicts / pairs : 0;
}

export function buildIntelligenceConsensus(input: {
  symbol: string;
  timestamp: string;
  evidence: readonly CommanderEvidenceV1[];
  expectedExpertIds?: readonly string[];
}): IntelligenceConsensusV1 {
  const evidenceSnapshot = input.evidence.map((row) => ({ ...row, thesisTags: [...row.thesisTags], supportingReasons: [...row.supportingReasons], conflictingReasons: [...row.conflictingReasons], rawEvidenceIds: [...row.rawEvidenceIds] }));
  const expectedExperts = [...new Set(input.expectedExpertIds ?? INITIAL_PARLIAMENT_EXPERTS)];
  const vetoes = new Set<ParliamentVetoCode>();
  const evidenceIdCounts = evidenceSnapshot.reduce((counts, row) => counts.set(row.evidenceId, (counts.get(row.evidenceId) ?? 0) + 1), new Map<string, number>());
  const trust = evidenceSnapshot.map((row) => {
    if ((evidenceIdCounts.get(row.evidenceId) ?? 0) > 1) {
      vetoes.add('INVALID_EVIDENCE');
      return { ...governedEvidenceTrust({ ...row, valueQuality: 'INVALID' }, input.timestamp), included: false, exclusionReason: 'duplicate_evidence_id', effectiveTrust: 0 };
    }
    const validation = validateCommanderEvidence(row);
    if (!validation.ok) {
      vetoes.add('INVALID_EVIDENCE');
      return { ...governedEvidenceTrust({ ...row, valueQuality: 'INVALID' }, input.timestamp), included: false, exclusionReason: `invalid_evidence:${validation.reasons.join('|')}`, effectiveTrust: 0 };
    }
    if (row.symbol !== input.symbol) {
      vetoes.add('EVIDENCE_IDENTITY_MISMATCH');
      return { ...governedEvidenceTrust(row, input.timestamp), included: false, exclusionReason: 'symbol_identity_mismatch', effectiveTrust: 0 };
    }
    if (row.valueQuality === 'STALE') vetoes.add('STALE_EVIDENCE');
    return governedEvidenceTrust(row, input.timestamp);
  });
  const trustByEvidence = new Map(trust.map((entry) => [entry.evidenceId, entry]));
  if (trust.some((entry) => entry.freshnessMultiplier < 1 && entry.exclusionReason !== 'invalid_or_future_observation_time')) vetoes.add('STALE_EVIDENCE');
  const included = new Set(trust.filter((entry) => entry.included).map((entry) => entry.evidenceId));
  const directionWeights = { LONG: 0, SHORT: 0, NEUTRAL: 0 };
  const thesisWeights: Record<OpportunityThesis | 'UNCERTAIN', number> = {
    TREND_CONTINUATION: 0, BREAKOUT: 0, PULLBACK: 0, REVERSAL: 0, MEAN_REVERSION: 0, EXHAUSTION: 0, CARRY: 0, UNCERTAIN: 0,
  };
  let weightedScore = 0;
  let totalTrust = 0;
  let totalBaseTrust = 0;
  for (const row of evidenceSnapshot) {
    const rowTrust = trustByEvidence.get(row.evidenceId)!;
    totalBaseTrust += rowTrust.baseTrust;
    if (!rowTrust.included) continue;
    const influence = rowTrust.effectiveTrust * (0.25 + 0.75 * Math.abs(row.score));
    const direction = directionFor(row);
    if (direction !== null) directionWeights[direction] += influence;
    const tags = row.thesisTags.filter(isOpportunityThesis);
    if (tags.length) for (const tag of tags) thesisWeights[tag] += influence / tags.length;
    weightedScore += row.score * rowTrust.effectiveTrust;
    totalTrust += rowTrust.effectiveTrust;
  }
  const directionConsensus = normalize<'LONG' | 'SHORT' | 'NEUTRAL'>(directionWeights, 'NEUTRAL');
  const thesisConsensus = normalize<OpportunityThesis | 'UNCERTAIN'>(thesisWeights, 'UNCERTAIN');
  const leadingDirection = leadingKey(directionConsensus);
  const leadingThesis = leadingKey(thesisConsensus);
  const consensus = directionConsensus[leadingDirection];

  const liquidityRows = evidenceSnapshot.filter((row) => row.family === 'LIQUIDITY' && included.has(row.evidenceId));
  if (liquidityRows.some((row) => row.score < 0.25)) vetoes.add('LIQUIDITY_DEGRADATION');
  const newsRows = evidenceSnapshot.filter((row) => row.family === 'NEWS' && included.has(row.evidenceId));
  if (newsRows.some((row) => [...row.supportingReasons, ...row.conflictingReasons].includes('event_risk_material'))) vetoes.add('EVENT_RISK');
  const familyConflict = crossFamilyConflict(evidenceSnapshot, included);
  const timeframeConflict = crossTimeframeConflict(evidenceSnapshot, included);
  if (familyConflict >= 0.5) vetoes.add('CROSS_FAMILY_DIRECTION_CONFLICT');

  const includedRows = evidenceSnapshot.filter((row) => included.has(row.evidenceId));
  const meanScore = totalTrust > 0 ? weightedScore / totalTrust : 0;
  const dispersion = totalTrust > 0
    ? Math.sqrt(includedRows.reduce((sum, row) => {
      const rowTrust = trustByEvidence.get(row.evidenceId)!.effectiveTrust;
      return sum + rowTrust * (row.score - meanScore) ** 2;
    }, 0) / totalTrust) / 2
    : 0;
  const opposition = includedRows.reduce((sum, row) => {
    const direction = directionFor(row);
    if (direction === null || direction === 'NEUTRAL' || direction === leadingDirection) return sum;
    return sum + trustByEvidence.get(row.evidenceId)!.effectiveTrust;
  }, 0);
  const confidenceDisagreement = totalTrust > 0 ? opposition / totalTrust : 0;
  const vetoPenalty = Math.min(1, vetoes.size * 0.25);
  const directionalDisagreement = 1 - consensus;
  const dissentScore = directionalDisagreement * 0.25
    + clamp(dispersion) * 0.2
    + confidenceDisagreement * 0.2
    + vetoPenalty * 0.15
    + timeframeConflict * 0.1
    + familyConflict * 0.1;
  const presentExperts = new Set(evidenceSnapshot.filter((row) => row.symbol === input.symbol
    && evidenceIdCounts.get(row.evidenceId) === 1
    && validateCommanderEvidence(row).ok
    && QUALITY_TRUST_MULTIPLIER[row.valueQuality] > 0).map((row) => row.expertId));
  const evidenceCompleteness = expectedExperts.length ? expectedExperts.filter((expert) => presentExperts.has(expert)).length / expectedExperts.length : 1;
  const evidenceQuality = expectedExperts.length
    ? expectedExperts.reduce((sum, expert) => {
      const rows = evidenceSnapshot.filter((row) => row.expertId === expert && row.symbol === input.symbol
        && evidenceIdCounts.get(row.evidenceId) === 1 && validateCommanderEvidence(row).ok);
      return sum + (rows.length ? Math.max(...rows.map((row) => QUALITY_TRUST_MULTIPLIER[row.valueQuality])) : 0);
    }, 0) / expectedExperts.length
    : 1;
  const contextualTrust = totalBaseTrust > 0 ? totalTrust / totalBaseTrust : 0;
  const materialVetoes = [...vetoes].sort();
  const reasons = [
    `leading_direction:${leadingDirection}`,
    `leading_thesis:${leadingThesis}`,
    `included_evidence:${included.size}/${evidenceSnapshot.length}`,
    `adaptive_trust:false`,
  ];
  const unsigned = {
    version: INTELLIGENCE_CONSENSUS_VERSION,
    symbol: input.symbol,
    timestamp: input.timestamp,
    shadowOnly: true as const,
    directionConsensus,
    thesisConsensus,
    leadingDirection,
    leadingThesis,
    consensus: round(consensus),
    dissent: {
      score: round(dissentScore),
      directionalDisagreement: round(directionalDisagreement),
      scoreDispersion: round(dispersion),
      confidenceWeightedDisagreement: round(confidenceDisagreement),
      materialVetoPenalty: round(vetoPenalty),
      crossTimeframeConflict: round(timeframeConflict),
      crossFamilyConflict: round(familyConflict),
    },
    materialVetoes,
    evidenceCompleteness: round(evidenceCompleteness),
    evidenceQuality: round(evidenceQuality),
    contextualTrust: round(contextualTrust),
    trust,
    evidenceIds: evidenceSnapshot.map((row) => row.evidenceId).sort(),
    reasons,
  };
  return { ...unsigned, fingerprint: parliamentFingerprint(unsigned) };
}
