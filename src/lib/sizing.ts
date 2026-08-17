/**
 * APEX-NEXT Position Sizing & Risk Math Module (REQ-040 through REQ-046)
 * Pure, unit-tested module that live-recalculates position size, USD notional,
 * R-multiple, liquidation distance, and plain-language summary.
 * Never sends an order to an exchange.
 */

import { SizingConfig, SizingResult } from '../types';

/**
 * Calculates position size, USD risk, R-multiple, liquidation price, and plain-language summary.
 * Implements REQ-040, REQ-041, REQ-042, REQ-043, REQ-044, REQ-045, REQ-046.
 */
export function calculatePositionSizing(config: SizingConfig): SizingResult {
  const {
    accountBalanceUsd,
    riskMode,
    riskValue,
    leverage,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    direction,
  } = config;

  // 1. Compute USD Risk amount (REQ-040)
  let riskUsd = 0;
  if (riskMode === 'USD') {
    riskUsd = Math.max(0, riskValue);
  } else {
    // PCT mode
    riskUsd = Math.max(0, (accountBalanceUsd * riskValue) / 100);
  }

  // Avoid divide-by-zero or negative prices
  const cleanEntry = Math.max(0.000001, entryPrice);
  const cleanStop = Math.max(0.000001, stopLossPrice);
  const cleanTake = Math.max(0.000001, takeProfitPrice);

  // 2. Stop-loss distance per unit in USD
  const stopDistancePerUnit = Math.abs(cleanEntry - cleanStop);
  const rewardDistancePerUnit = Math.abs(cleanTake - cleanEntry);

  // 3. Expected R-Multiple (REQ-044)
  let expectedRMultiple = 1.0;
  if (stopDistancePerUnit > 0) {
    expectedRMultiple = Number((rewardDistancePerUnit / stopDistancePerUnit).toFixed(2));
  }

  // 4. Position Size in Base Units and USD Notional (REQ-044)
  // Position size = RiskUSD / stopDistancePerUnit
  let positionSizeBase = 0;
  let positionSizeUsd = 0;

  if (stopDistancePerUnit > 0) {
    positionSizeBase = riskUsd / stopDistancePerUnit;
    positionSizeUsd = positionSizeBase * cleanEntry;
  }

  // Cap position size to max allowed by account balance and leverage
  const maxAllowableNotional = accountBalanceUsd * Math.max(1, leverage);
  if (positionSizeUsd > maxAllowableNotional && cleanEntry > 0) {
    positionSizeUsd = maxAllowableNotional;
    positionSizeBase = positionSizeUsd / cleanEntry;
    // Risk USD effectively scales down if capped
    riskUsd = positionSizeBase * stopDistancePerUnit;
  }

  positionSizeBase = Number(positionSizeBase.toFixed(4));
  positionSizeUsd = Number(positionSizeUsd.toFixed(2));
  riskUsd = Number(riskUsd.toFixed(2));

  // 5. Estimated Liquidation Price (REQ-041)
  // For futures: maint margin + lev impact. Approximate standard formula:
  // Long Liq = Entry * (1 - 1/leverage + 0.005)
  // Short Liq = Entry * (1 + 1/leverage - 0.005)
  let liquidationPrice = 0;
  const lev = Math.max(1, leverage);
  if (direction === 'LONG') {
    liquidationPrice = Math.max(0, cleanEntry * (1 - 1 / lev + 0.005));
  } else {
    liquidationPrice = cleanEntry * (1 + 1 / lev - 0.005);
  }
  liquidationPrice = Number(liquidationPrice.toPrecision(6));

  // 6. Plain-language summary (REQ-044)
  const pctAccount = accountBalanceUsd > 0 ? ((riskUsd / accountBalanceUsd) * 100).toFixed(1) : '0.0';
  const summaryText = `Risking $${riskUsd} (${pctAccount}% of account) at ${lev}x leverage for a 1:${expectedRMultiple} R ${direction.toLowerCase()} setup.`;

  return {
    positionSizeBase,
    positionSizeUsd,
    riskUsd,
    expectedRMultiple,
    liquidationPrice,
    summaryText,
  };
}
