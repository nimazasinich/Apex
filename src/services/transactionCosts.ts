export interface TransactionCostModel {
  /** Round-trip exchange fee, expressed in percentage points. */
  feePct: number;
  /** One-way bid/ask spread estimate, expressed in percentage points. */
  spreadPct: number;
  /** Funding rate as a decimal fraction per funding interval (0.0001 = 0.01%). */
  fundingRate: number;
  fundingIntervalBars?: number;
  feeMultiplier?: number;
  spreadMultiplier?: number;
  slippageMultiplier?: number;
  fundingMultiplier?: number;
}

export interface TransactionCostInputs {
  entryPrice: number;
  holdingBars: number;
  feePct?: number;
  spread?: number;
  spreadPct?: number;
  fundingRate?: number;
  fundingIntervalBars?: number;
  feeMultiplier?: number;
  spreadMultiplier?: number;
  slippageMultiplier?: number;
  fundingMultiplier?: number;
}

export interface PerSideCostAssumptions {
  commissionPctPerSide: number;
  slippagePctPerSide: number;
  fundingPctEstimate: number;
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : fallback;
}

/**
 * Shared replay transaction-cost formula. Percentages are percentage points;
 * fundingRate is a decimal fraction and is converted to percentage points.
 */
export function computeTransactionCostPct(inputs: TransactionCostInputs): number {
  const entryPrice = finiteNonNegative(inputs.entryPrice, 0);
  const explicitSpreadPct = finiteNonNegative(inputs.spreadPct, Number.NaN);
  const spreadPct = Number.isFinite(explicitSpreadPct)
    ? explicitSpreadPct
    : entryPrice > 0
      ? (finiteNonNegative(inputs.spread, 0) / entryPrice) * 100
      : 0;
  const holdingBars = Math.max(1, Math.floor(finiteNonNegative(inputs.holdingBars, 1)));
  const fundingIntervalBars = Math.max(1, Math.floor(finiteNonNegative(inputs.fundingIntervalBars, 8)));
  const fundingPeriods = Math.max(1, Math.ceil(holdingBars / fundingIntervalBars));
  const feePct = finiteNonNegative(inputs.feePct, 0.12) * finiteNonNegative(inputs.feeMultiplier, 1);
  const spreadCostPct = spreadPct * finiteNonNegative(inputs.spreadMultiplier, 1);
  const slippagePct = spreadPct * finiteNonNegative(inputs.slippageMultiplier, 1);
  const fundingPct = Math.abs(Number.isFinite(inputs.fundingRate) ? Number(inputs.fundingRate) : 0)
    * fundingPeriods
    * 100
    * finiteNonNegative(inputs.fundingMultiplier, 1);
  return feePct + spreadCostPct + slippagePct + fundingPct;
}

export function transactionCostInputsFromModel(
  model: TransactionCostModel,
  entryPrice: number,
  holdingBars: number,
): TransactionCostInputs {
  return {
    entryPrice,
    holdingBars,
    feePct: model.feePct,
    spreadPct: model.spreadPct,
    fundingRate: model.fundingRate,
    fundingIntervalBars: model.fundingIntervalBars,
    feeMultiplier: model.feeMultiplier,
    spreadMultiplier: model.spreadMultiplier,
    slippageMultiplier: model.slippageMultiplier,
    fundingMultiplier: model.fundingMultiplier,
  };
}

/** Converts API per-side assumptions into the canonical fee + spread + slippage + funding inputs. */
export function transactionCostModelFromPerSideAssumptions(
  assumptions: PerSideCostAssumptions,
  stress: Pick<TransactionCostModel, 'feeMultiplier' | 'spreadMultiplier' | 'slippageMultiplier' | 'fundingMultiplier'> = {},
): TransactionCostModel {
  return {
    feePct: finiteNonNegative(assumptions.commissionPctPerSide, 0) * 2,
    spreadPct: finiteNonNegative(assumptions.slippagePctPerSide, 0),
    fundingRate: finiteNonNegative(assumptions.fundingPctEstimate, 0) / 100,
    fundingIntervalBars: 8,
    ...stress,
  };
}

/** Compatibility bridge for research jobs that currently provide only a total round-trip cost. */
export function transactionCostModelFromRoundTripPct(transactionCostPct: number): TransactionCostModel {
  return {
    feePct: finiteNonNegative(transactionCostPct, 0),
    spreadPct: 0,
    fundingRate: 0,
    fundingIntervalBars: 8,
  };
}
