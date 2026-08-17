import type { MarketEvent } from '../../../contracts/realtime/marketEvent';
import { buildEdgeEvidence, clamp01, weightedDirection, type LiquidityHunterEdgeContext } from '../edgeRuntime';
import { deriveWalletGrade, WALLET_GRADING_VERSION, type WalletGrade } from '../walletGrading';


function optionalFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface FWalletRow {
  event: MarketEvent;
  wallet: string;
  grade: WalletGrade;
  direction: 'LONG' | 'SHORT';
  closedTrades: number;
  leverage: number;
}

function parse(event: MarketEvent): FWalletRow | null {
  if (!event.payload || typeof event.payload !== 'object') return null;
  const row = event.payload as Record<string, unknown>;
  const wallet = String(row.wallet || '');
  const direction = String(row.direction || '').toUpperCase();
  if (!wallet || (direction !== 'LONG' && direction !== 'SHORT')) return null;
  const closedTrades = optionalFinite(row.closedTrades);
  const netPnlPct = optionalFinite(row.netPnlPct);
  const maxDrawdownPct = optionalFinite(row.maxDrawdownPct);
  const declared = String(row.grade || '').toUpperCase() as WalletGrade;
  const observationOnly = row.observationOnly === true || row.gradingReady === false;
  const internallyGraded = event.source === 'hyperliquid-wallet-history-grader'
    && row.methodology === 'HYPERLIQUID_PUBLIC_FILLS_PLUS_FUNDING_REALIZED_HISTORY'
    && row.gradingVersion === WALLET_GRADING_VERSION
    && row.gradingReady === true;
  const derived = deriveWalletGrade({
    closedTrades,
    netPnlPct,
    maxDrawdownPct,
  });
  const grade: WalletGrade = observationOnly
    ? 'UNRATED'
    : internallyGraded && declared === 'F' && closedTrades !== null && closedTrades >= 60 ? 'F' : derived;
  const leverage = Number(row.leverage);
  return { event, wallet, grade, direction, closedTrades: closedTrades ?? 0, leverage: Number.isFinite(leverage) ? Math.max(1, Math.min(50, leverage)) : 1 };
}

export function evaluateContrarianWalletEdge(context: LiquidityHunterEdgeContext) {
  const events = context.seriesStore.query({ symbol: context.symbol, type: 'WALLET_POSITION', since: context.now - 5 * 60_000, limit: 5_000 });
  const rows = events.map(parse).filter((row): row is FWalletRow => Boolean(row));
  const latest = new Map<string, FWalletRow>();
  for (const row of rows) latest.set(row.wallet, row);
  const fRows = [...latest.values()].filter((row) => row.grade === 'F' && row.closedTrades >= 30);
  if (fRows.length < 5) {
    return buildEdgeEvidence({
      edgeId: 'CONTRARIAN_WALLETS',
      status: events.length ? 'UNKNOWN' : 'NOT_CONFIGURED',
      dataQuality: clamp01(fRows.length / 5 * 0.6),
      observedAt: rows.at(-1)?.event.exchangeTimestamp ?? context.now,
      expiresAt: context.now,
      conflictingReasons: [events.length ? 'insufficient_f_grade_wallet_cohort' : 'long_duration_wallet_grading_not_configured'],
      rawEventIds: rows.map((row) => row.event.eventId),
    }, context.now);
  }

  let fLong = 0;
  let fShort = 0;
  for (const row of fRows) {
    const weight = Math.min(3, 1 + (row.leverage - 1) / 20) * Math.min(2, row.closedTrades / 60);
    if (row.direction === 'LONG') fLong += weight;
    else fShort += weight;
  }
  // Fade the F-grade cohort: their LONG concentration is SHORT evidence and
  // their SHORT concentration is LONG evidence.
  const direction = weightedDirection(fShort, fLong, 0.18);
  const total = fLong + fShort;
  const concentration = total > 0 ? Math.abs(fLong - fShort) / total : 0;
  const score = clamp01(concentration * 0.75 + Math.min(fRows.length / 20, 1) * 0.25);
  const observedAt = Math.max(...fRows.map((row) => row.event.exchangeTimestamp));

  return buildEdgeEvidence({
    edgeId: 'CONTRARIAN_WALLETS',
    status: direction && direction !== 'NEUTRAL' ? 'PASS' : 'FAIL',
    direction,
    score,
    dataQuality: clamp01(0.68 + Math.min(fRows.length / 20, 1) * 0.32),
    observedAt,
    expiresAt: observedAt + 60_000,
    supportingReasons: [`f_grade_wallets:${fRows.length}`, `contrarian_concentration:${concentration.toFixed(3)}`],
    conflictingReasons: direction === 'NEUTRAL' ? ['f_grade_cohort_not_directionally_concentrated'] : [],
    rawEventIds: fRows.map((row) => row.event.eventId),
    metadata: { fGradeLongWeight: fLong, fGradeShortWeight: fShort, fGradeWallets: fRows.length },
  }, context.now);
}
