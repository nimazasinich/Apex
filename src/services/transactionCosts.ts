export const TRANSACTION_COST_MODEL_VERSION = 'transaction_cost_model_v4_funding_coverage';

export type FundingPolicy = 'REALIZED_SIGNED' | 'CONSERVATIVE_NO_CREDIT';
export type FundingAccountingMode = 'NONE' | 'REALIZED_EVENT_TIME' | 'CONSERVATIVE_EXPECTED';
export type FundingCoverageState = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_REQUIRED';

export interface FundingEvent {
  timestamp: number;
  /** Decimal fraction paid by longs when positive. */
  rate: number;
  provider?: string;
  provenance?: string;
}

export interface FundingCoverage {
  state: FundingCoverageState;
  coveredFrom: number | null;
  coveredTo: number | null;
  provider: string | null;
  provenance: string | null;
  fingerprint: string | null;
}

export interface TransactionCostModel {
  feePct: number;
  spreadPct: number;
  /** Decimal funding rate per settlement event when using CONSERVATIVE_EXPECTED. */
  fundingRate: number;
  /** Compatibility-only; never used to infer a funding settlement. */
  fundingIntervalBars?: number;
  feeMultiplier?: number;
  spreadMultiplier?: number;
  slippageMultiplier?: number;
  fundingMultiplier?: number;
  profileVersion?: string;
  venue?: string;
  commissionMode?: 'ROUND_TRIP' | 'PER_SIDE';
  spreadModel?: string;
  slippageModel?: string;
  fundingPolicy?: FundingPolicy;
  fundingAccountingMode?: FundingAccountingMode;
  fundingScheduleUtcHours?: number[];
  /** Provider-recorded funding observations; never synthesized for realized accounting. */
  fundingEvents?: FundingEvent[];
  fundingCoverage?: FundingCoverage;
}

export interface TransactionCostInputs {
  entryPrice: number;
  holdingBars?: number;
  feePct?: number;
  spread?: number;
  spreadPct?: number;
  fundingRate?: number;
  fundingIntervalBars?: number;
  feeMultiplier?: number;
  spreadMultiplier?: number;
  slippageMultiplier?: number;
  fundingMultiplier?: number;
  entryAt?: number;
  exitAt?: number;
  direction?: 'LONG' | 'SHORT';
  fundingEvents?: FundingEvent[];
  fundingCoverage?: FundingCoverage;
  fundingPolicy?: FundingPolicy;
  fundingAccountingMode?: FundingAccountingMode;
  fundingScheduleUtcHours?: number[];
}

export interface FundingCostResult {
  pct: number;
  accountingMode: FundingAccountingMode;
  coverageState: FundingCoverageState;
  eventsCrossed: number;
  source: 'NONE' | 'OBSERVED_EVENTS' | 'EXPECTED_SCHEDULE';
  decisionEligibleAsRealized: boolean;
}

export interface PerSideCostAssumptions {
  commissionPctPerSide: number;
  slippagePctPerSide: number;
  /** Percentage points per expected funding settlement, not realized accounting. */
  fundingPctEstimate: number;
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : fallback;
}

function normalizedSchedule(hours: readonly number[] | undefined): number[] {
  return [...new Set((hours ?? [0, 8, 16])
    .map((value) => Math.floor(Number(value)))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 23))]
    .sort((left, right) => left - right);
}

function temporalWindow(inputs: Pick<TransactionCostInputs, 'entryAt' | 'exitAt' | 'direction'>): { entryAt: number; exitAt: number; direction: 'LONG' | 'SHORT' } {
  const entryAt = Number(inputs.entryAt);
  const exitAt = Number(inputs.exitAt);
  if (!Number.isFinite(entryAt) || !Number.isFinite(exitAt) || exitAt < entryAt) throw new Error('funding_temporal_window_required');
  if (inputs.direction !== 'LONG' && inputs.direction !== 'SHORT') throw new Error('funding_direction_required');
  return { entryAt, exitAt, direction: inputs.direction };
}

function coverageCovers(coverage: FundingCoverage | undefined, entryAt: number, exitAt: number): boolean {
  return Boolean(
    coverage?.state === 'COMPLETE'
    && Number.isFinite(coverage.coveredFrom)
    && Number.isFinite(coverage.coveredTo)
    && Number(coverage.coveredFrom) <= entryAt
    && Number(coverage.coveredTo) >= exitAt,
  );
}

function expectedScheduleEvents(entryAt: number, exitAt: number, scheduleUtcHours: readonly number[], rate: number): FundingEvent[] {
  if (exitAt <= entryAt || !Number.isFinite(rate)) return [];
  const events: FundingEvent[] = [];
  const firstDay = new Date(entryAt);
  firstDay.setUTCHours(0, 0, 0, 0);
  for (let day = firstDay.getTime(); day <= exitAt; day += 24 * 60 * 60 * 1000) {
    for (const hour of scheduleUtcHours) {
      const timestamp = day + hour * 60 * 60 * 1000;
      if (entryAt < timestamp && timestamp <= exitAt) {
        events.push({ timestamp, rate, provider: 'MODEL_EXPECTATION', provenance: 'expected_schedule_not_observed' });
      }
    }
  }
  return events;
}

/**
 * Funding cost in percentage points. Negative values are realized/expected credits.
 * REALIZED_EVENT_TIME requires explicit COMPLETE coverage over the whole holding
 * window. An empty event set is a legitimate zero only under that complete coverage.
 */
export function computeFundingCost(inputs: Pick<TransactionCostInputs,
  'entryAt' | 'exitAt' | 'direction' | 'fundingEvents' | 'fundingCoverage' | 'fundingMultiplier' |
  'fundingPolicy' | 'fundingAccountingMode' | 'fundingScheduleUtcHours' | 'fundingRate'>): FundingCostResult {
  const mode = inputs.fundingAccountingMode ?? (
    inputs.fundingCoverage || (inputs.fundingEvents?.length ?? 0) > 0
      ? 'REALIZED_EVENT_TIME'
      : Number.isFinite(inputs.fundingRate)
        ? 'CONSERVATIVE_EXPECTED'
        : 'NONE'
  );
  if (mode === 'NONE') {
    return { pct: 0, accountingMode: 'NONE', coverageState: 'NOT_REQUIRED', eventsCrossed: 0, source: 'NONE', decisionEligibleAsRealized: false };
  }

  const { entryAt, exitAt, direction } = temporalWindow(inputs);
  const multiplier = finiteNonNegative(inputs.fundingMultiplier, 1);
  let events: FundingEvent[];
  let coverageState: FundingCoverageState;
  let source: FundingCostResult['source'];
  let decisionEligibleAsRealized = false;

  if (mode === 'REALIZED_EVENT_TIME') {
    if (!coverageCovers(inputs.fundingCoverage, entryAt, exitAt)) throw new Error('funding_coverage_incomplete');
    events = (inputs.fundingEvents ?? [])
      .filter((event) => Number.isFinite(event.timestamp) && Number.isFinite(event.rate))
      .filter((event) => entryAt < event.timestamp && event.timestamp <= exitAt)
      .sort((left, right) => left.timestamp - right.timestamp);
    coverageState = 'COMPLETE';
    source = 'OBSERVED_EVENTS';
    decisionEligibleAsRealized = true;
  } else {
    const rate = Number(inputs.fundingRate);
    if (!Number.isFinite(rate)) throw new Error('funding_expected_rate_required');
    events = expectedScheduleEvents(entryAt, exitAt, normalizedSchedule(inputs.fundingScheduleUtcHours), rate);
    coverageState = 'NOT_REQUIRED';
    source = 'EXPECTED_SCHEDULE';
  }

  const signed = events.reduce((sum, event) => sum + (direction === 'LONG' ? event.rate : -event.rate) * 100 * multiplier, 0);
  const pct = inputs.fundingPolicy === 'CONSERVATIVE_NO_CREDIT' ? Math.max(0, signed) : signed;
  return { pct, accountingMode: mode, coverageState, eventsCrossed: events.length, source, decisionEligibleAsRealized };
}

/** Funding cost in percentage points. Kept as the narrow numeric compatibility API. */
export function computeEventTimeFundingPct(inputs: Pick<TransactionCostInputs,
  'entryAt' | 'exitAt' | 'direction' | 'fundingEvents' | 'fundingCoverage' | 'fundingMultiplier' |
  'fundingPolicy' | 'fundingAccountingMode' | 'fundingScheduleUtcHours' | 'fundingRate'>): number {
  return computeFundingCost(inputs).pct;
}

/** Shared cost formula. Bar counts never imply a funding event. */
export function computeTransactionCostPct(inputs: TransactionCostInputs): number {
  const entryPrice = finiteNonNegative(inputs.entryPrice, 0);
  const explicitSpreadPct = finiteNonNegative(inputs.spreadPct, Number.NaN);
  const spreadPct = Number.isFinite(explicitSpreadPct)
    ? explicitSpreadPct
    : entryPrice > 0
      ? (finiteNonNegative(inputs.spread, 0) / entryPrice) * 100
      : 0;
  const feePct = finiteNonNegative(inputs.feePct, 0.12) * finiteNonNegative(inputs.feeMultiplier, 1);
  const spreadCostPct = spreadPct * finiteNonNegative(inputs.spreadMultiplier, 1);
  const slippagePct = spreadPct * finiteNonNegative(inputs.slippageMultiplier, 1);
  const fundingPct = computeFundingCost(inputs).pct;
  return feePct + spreadCostPct + slippagePct + fundingPct;
}

export function transactionCostInputsFromModel(
  model: TransactionCostModel,
  entryPrice: number,
  holdingBarsOrTemporal?: number | { entryAt: number; exitAt: number; direction: 'LONG' | 'SHORT'; fundingEvents?: FundingEvent[]; fundingCoverage?: FundingCoverage },
): TransactionCostInputs {
  const temporal = typeof holdingBarsOrTemporal === 'object' ? holdingBarsOrTemporal : undefined;
  return {
    entryPrice,
    ...(typeof holdingBarsOrTemporal === 'number' ? { holdingBars: holdingBarsOrTemporal } : {}),
    feePct: model.feePct,
    spreadPct: model.spreadPct,
    fundingRate: model.fundingRate,
    fundingIntervalBars: model.fundingIntervalBars,
    feeMultiplier: model.feeMultiplier,
    spreadMultiplier: model.spreadMultiplier,
    slippageMultiplier: model.slippageMultiplier,
    fundingMultiplier: model.fundingMultiplier,
    fundingPolicy: model.fundingPolicy ?? 'CONSERVATIVE_NO_CREDIT',
    fundingAccountingMode: temporal ? (model.fundingAccountingMode ?? 'NONE') : 'NONE',
    fundingScheduleUtcHours: model.fundingScheduleUtcHours,
    ...(temporal ?? {}),
    fundingEvents: temporal?.fundingEvents ?? model.fundingEvents ?? [],
    fundingCoverage: temporal?.fundingCoverage ?? model.fundingCoverage,
  };
}

export function transactionCostProfileFingerprint(model: TransactionCostModel): string {
  const canonical = JSON.stringify({
    modelVersion: TRANSACTION_COST_MODEL_VERSION,
    profileVersion: model.profileVersion ?? 'unspecified',
    venue: model.venue ?? 'unspecified',
    feePct: model.feePct,
    spreadPct: model.spreadPct,
    fundingRate: model.fundingRate,
    feeMultiplier: model.feeMultiplier ?? 1,
    spreadMultiplier: model.spreadMultiplier ?? 1,
    slippageMultiplier: model.slippageMultiplier ?? 1,
    fundingMultiplier: model.fundingMultiplier ?? 1,
    commissionMode: model.commissionMode ?? 'ROUND_TRIP',
    spreadModel: model.spreadModel ?? 'fixed_pct',
    slippageModel: model.slippageModel ?? 'spread_multiple',
    fundingPolicy: model.fundingPolicy ?? 'CONSERVATIVE_NO_CREDIT',
    fundingAccountingMode: model.fundingAccountingMode ?? 'NONE',
    fundingScheduleUtcHours: normalizedSchedule(model.fundingScheduleUtcHours),
    fundingCoverageFingerprint: model.fundingCoverage?.fingerprint ?? null,
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) hash = Math.imul(hash ^ canonical.charCodeAt(index), 16777619);
  return `cost-profile:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function transactionCostModelFromPerSideAssumptions(
  assumptions: PerSideCostAssumptions,
  stress: Pick<TransactionCostModel, 'feeMultiplier' | 'spreadMultiplier' | 'slippageMultiplier' | 'fundingMultiplier'> = {},
): TransactionCostModel {
  return {
    feePct: finiteNonNegative(assumptions.commissionPctPerSide, 0) * 2,
    spreadPct: finiteNonNegative(assumptions.slippagePctPerSide, 0),
    fundingRate: finiteNonNegative(assumptions.fundingPctEstimate, 0) / 100,
    profileVersion: 'api_per_side_v2_expected_funding', venue: 'operator_configured', commissionMode: 'PER_SIDE',
    spreadModel: 'fixed_pct', slippageModel: 'fixed_pct', fundingPolicy: 'CONSERVATIVE_NO_CREDIT',
    fundingAccountingMode: 'CONSERVATIVE_EXPECTED',
    fundingScheduleUtcHours: [0, 8, 16],
    ...stress,
  };
}

export function transactionCostModelFromRoundTripPct(transactionCostPct: number): TransactionCostModel {
  return {
    feePct: finiteNonNegative(transactionCostPct, 0),
    spreadPct: 0,
    fundingRate: 0,
    profileVersion: 'round_trip_compat_v2_no_funding', venue: 'unspecified', commissionMode: 'ROUND_TRIP',
    spreadModel: 'none', slippageModel: 'none', fundingPolicy: 'CONSERVATIVE_NO_CREDIT',
    fundingAccountingMode: 'NONE',
    fundingScheduleUtcHours: [0, 8, 16],
  };
}
