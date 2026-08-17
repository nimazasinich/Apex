import type { CommanderMarketRegime, OpportunityThesis, TrendRelation } from './commanderContext';

export const COMMANDER_IDENTITY_VERSION = 'commander_identity_v1' as const;

export interface StrategyCommanderIdentityV1 {
  version: typeof COMMANDER_IDENTITY_VERSION;
  commanderVersion: string;
  commanderStateRevision: string;
  symbol: string;
  time: string;
  universe: string[];
  regime: CommanderMarketRegime;
  thesis: OpportunityThesis | null;
  direction: 'LONG' | 'SHORT' | null;
  trendRelation: TrendRelation;
  evidenceIds: string[];
  expertVersions: Record<string, string>;
  strategyIds: string[];
  strategyVersions: Record<string, string>;
  parameterProfiles: Record<string, string>;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function canonicalizeCommanderIdentity(identity: StrategyCommanderIdentityV1): StrategyCommanderIdentityV1 {
  return {
    ...identity,
    universe: sorted(identity.universe),
    evidenceIds: sorted(identity.evidenceIds),
    strategyIds: sorted(identity.strategyIds),
    expertVersions: Object.fromEntries(Object.entries(identity.expertVersions).sort(([left], [right]) => left.localeCompare(right))),
    strategyVersions: Object.fromEntries(Object.entries(identity.strategyVersions).sort(([left], [right]) => left.localeCompare(right))),
    parameterProfiles: Object.fromEntries(Object.entries(identity.parameterProfiles).sort(([left], [right]) => left.localeCompare(right))),
  };
}

export function commanderIdentityFingerprint(identity: StrategyCommanderIdentityV1): string {
  return fnv1a64(stableSerialize(canonicalizeCommanderIdentity(identity)));
}

export function validateCommanderIdentity(identity: StrategyCommanderIdentityV1): string[] {
  const reasons: string[] = [];
  for (const [field, value] of Object.entries({
    commanderVersion: identity.commanderVersion,
    commanderStateRevision: identity.commanderStateRevision,
    symbol: identity.symbol,
    time: identity.time,
  })) {
    if (typeof value !== 'string' || !value.trim()) reasons.push(`${field}_required`);
  }
  if (identity.version !== COMMANDER_IDENTITY_VERSION) reasons.push('invalid_version');
  if (!Array.isArray(identity.universe) || identity.universe.some((symbol) => typeof symbol !== 'string' || !symbol.trim())) reasons.push('invalid_universe');
  if (!Array.isArray(identity.evidenceIds) || identity.evidenceIds.some((id) => typeof id !== 'string' || !id.trim())) reasons.push('invalid_evidence_ids');
  if (!Array.isArray(identity.strategyIds) || identity.strategyIds.some((id) => typeof id !== 'string' || !id.trim())) reasons.push('invalid_strategy_ids');
  for (const [name, versions] of Object.entries({ expertVersions: identity.expertVersions, strategyVersions: identity.strategyVersions, parameterProfiles: identity.parameterProfiles })) {
    if (!versions || typeof versions !== 'object' || Object.entries(versions).some(([key, value]) => !key.trim() || typeof value !== 'string' || !value.trim())) reasons.push(`invalid_${name}`);
  }
  return reasons;
}
