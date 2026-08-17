import type { LiquidityHunterEvaluation } from '../../contracts/realtime/liquidityHunterState';
import type { LiquidityHunterOperationsSnapshot } from '../liquidityHunter/foundationRuntime';

export interface LiquidityHunterViewModel {
  version: 'liquidity_hunter_view_v1';
  symbol: string;
  generatedAt: number;
  state: LiquidityHunterEvaluation['setupState'] | 'NO_EVALUATION';
  fusionScore: number | null;
  eligibleForManualConfirmation: boolean;
  layers: LiquidityHunterEvaluation['layers'];
  evidence: Array<{
    edgeId: string;
    status: string;
    direction: string | null;
    score: number | null;
    dataQuality: number;
    ageMs: number;
    expiresInMs: number;
    supportingReasons: string[];
    conflictingReasons: string[];
  }>;
  supporting: string[];
  conflicting: string[];
  missing: string[];
  operations: {
    status: LiquidityHunterOperationsSnapshot['status'];
    worldStateEntries: number;
    seriesEvents: number;
    orderBooksTracked: number;
    providerCount: number;
  };
  safety: {
    shadowOnly: true;
    authoritative: false;
    executionAuthorized: false;
    autonomousLiveExecutionEnabled: false;
  };
}

export function buildLiquidityHunterViewModel(input: {
  symbol: string;
  evaluation: LiquidityHunterEvaluation | null;
  operations: LiquidityHunterOperationsSnapshot;
  now?: number;
}): LiquidityHunterViewModel {
  const now = input.now ?? Date.now();
  const evaluation = input.evaluation;
  const evidence = (evaluation?.evidence ?? []).map((row) => ({
    edgeId: row.edgeId,
    status: row.status,
    direction: row.direction,
    score: row.score,
    dataQuality: row.dataQuality,
    ageMs: Math.max(0, now - row.observedAt),
    expiresInMs: row.expiresAt > now ? row.expiresAt - now : 0,
    supportingReasons: [...row.supportingReasons],
    conflictingReasons: [...row.conflictingReasons],
  }));
  return {
    version: 'liquidity_hunter_view_v1',
    symbol: input.symbol.toUpperCase(),
    generatedAt: now,
    state: evaluation?.setupState ?? 'NO_EVALUATION',
    fusionScore: evaluation?.fusionScore ?? null,
    eligibleForManualConfirmation: evaluation?.eligibleForManualConfirmation ?? false,
    layers: evaluation?.layers.map((row) => structuredClone(row)) ?? [],
    evidence,
    supporting: evidence.filter((row) => row.status === 'PASS').map((row) => row.edgeId),
    conflicting: evidence.filter((row) => row.status === 'FAIL').map((row) => row.edgeId),
    missing: evidence.filter((row) => ['UNKNOWN', 'STALE', 'NOT_CONFIGURED'].includes(row.status)).map((row) => row.edgeId),
    operations: {
      status: input.operations.status,
      worldStateEntries: input.operations.realtime.worldStateEntries,
      seriesEvents: input.operations.realtime.seriesEvents,
      orderBooksTracked: input.operations.realtime.orderBooksTracked,
      providerCount: input.operations.realtime.evidenceProviders.providers.length,
    },
    safety: { shadowOnly: true, authoritative: false, executionAuthorized: false, autonomousLiveExecutionEnabled: false },
  };
}
