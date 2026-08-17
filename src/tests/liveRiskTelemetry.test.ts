import { describe, expect, it } from 'vitest';
import { deriveLiveRiskTelemetry } from '../services/liveRiskTelemetry';

describe('live risk telemetry', () => {
  it('derives measured open risk and realized loss metrics from complete history', () => {
    const now = Date.UTC(2026, 7, 8, 12, 0, 0);
    const result = deriveLiveRiskTelemetry({
      account: { accountEquity: 10_000 },
      positions: [
        { symbol: 'XBTUSDTM', currentQty: 1, multiplier: 0.001, avgEntryPrice: 60_000, markPrice: 59_000, liquidationPrice: 50_000 },
        { symbol: 'ETHUSDTM', currentQty: 2, multiplier: 0.01, avgEntryPrice: 3_000, markPrice: 2_900, leverage: 5 },
      ],
      positionHistory: [
        { closeTime: now - 2 * 60 * 60 * 1000, realizedPnl: -25 },
        { closeTime: now - 4 * 60 * 60 * 1000, realisedPnl: -15 },
        { closeTime: now - 2 * 24 * 60 * 60 * 1000, pnl: 40 },
      ],
      historyAvailable: true,
      now,
    });

    expect(result.totalOpenRiskUsd).toBeCloseTo(21.6, 8);
    expect(result.dailyPnlUsd).toBe(-40);
    expect(result.weeklyPnlUsd).toBe(0);
    expect(result.consecutiveLosses).toBe(2);
    expect(result.drawdownPct).toBeNull();
  });

  it('fails honest when exchange history is unavailable or truncated', () => {
    const unavailable = deriveLiveRiskTelemetry({
      account: { accountEquity: 10_000 },
      positions: [],
      positionHistory: [],
      historyAvailable: false,
      now: 1_700_000_000_000,
    });
    expect(unavailable.dailyPnlUsd).toBeNull();
    expect(unavailable.weeklyPnlUsd).toBeNull();
    expect(unavailable.consecutiveLosses).toBeNull();

    const truncated = deriveLiveRiskTelemetry({
      account: { accountEquity: 10_000 },
      positions: [],
      positionHistory: [{ closeTime: 1_700_000_000_000, realizedPnl: 5 }],
      historyAvailable: true,
      historyTruncated: true,
      now: 1_700_000_000_000,
    });
    expect(truncated.dailyPnlUsd).toBeNull();
    expect(truncated.weeklyPnlUsd).toBeNull();
    expect(truncated.consecutiveLosses).toBeNull();
  });

  it('uses an exchange-supplied drawdown field but never invents one', () => {
    const measured = deriveLiveRiskTelemetry({
      account: { accountEquity: 10_000, currentDrawdownPct: 4.25 },
      positions: [],
      positionHistory: [],
      historyAvailable: true,
    });
    expect(measured.drawdownPct).toBe(4.25);
  });
});
