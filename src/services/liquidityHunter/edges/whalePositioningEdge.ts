import type { MarketEvent } from '../../../contracts/realtime/marketEvent';
import { buildEdgeEvidence, clamp01, weightedDirection, type LiquidityHunterEdgeContext } from '../edgeRuntime';
import { deriveWalletGrade, WALLET_GRADING_VERSION, type WalletGrade } from '../walletGrading';


function optionalFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface WalletRow {
  event: MarketEvent;
  wallet: string;
  grade: WalletGrade;
  direction: 'LONG' | 'SHORT';
  closedTrades: number;
  leverage: number;
}

function parse(event: MarketEvent): WalletRow | null {
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
    : internallyGraded && ['S', 'A', 'B', 'C', 'D', 'F'].includes(declared) && (closedTrades !== null ? closedTrades >= 60 : false)
      ? declared
      : derived;
  const leverage = Number(row.leverage);
  return {
    event,
    wallet,
    grade,
    direction,
    closedTrades: closedTrades !== null ? Math.max(0, closedTrades) : 0,
    leverage: Number.isFinite(leverage) ? Math.max(1, Math.min(50, leverage)) : 1,
  };
}

export function evaluateWhalePositioningEdge(context: LiquidityHunterEdgeContext) {
  const events = context.seriesStore.query({ symbol: context.symbol, type: 'WALLET_POSITION', since: context.now - 5 * 60_000, limit: 5_000 });
  const rows = events.map(parse).filter((row): row is WalletRow => Boolean(row));
  const latestByWallet = new Map<string, WalletRow>();
  for (const row of rows) latestByWallet.set(row.wallet, row);
  const graded = [...latestByWallet.values()].filter((row) => row.grade === 'S' || row.grade === 'A');
  if (graded.length < 3) {
    return buildEdgeEvidence({
      edgeId: 'WHALE_POSITIONING',
      status: events.length ? 'UNKNOWN' : 'NOT_CONFIGURED',
      dataQuality: clamp01(graded.length / 3 * 0.7),
      observedAt: rows.at(-1)?.event.exchangeTimestamp ?? context.now,
      expiresAt: context.now,
      conflictingReasons: [events.length ? 'insufficient_high_grade_wallet_cohort' : 'hyperliquid_wallet_history_not_configured'],
      rawEventIds: rows.map((row) => row.event.eventId),
      metadata: { gradedWallets: graded.length },
    }, context.now);
  }

  let longWeight = 0;
  let shortWeight = 0;
  for (const row of graded) {
    const gradeWeight = row.grade === 'S' ? 1.25 : 1;
    const sampleWeight = Math.min(2, Math.max(0.5, row.closedTrades / 100));
    const weight = gradeWeight * sampleWeight;
    if (row.direction === 'LONG') longWeight += weight;
    else shortWeight += weight;
  }
  const direction = weightedDirection(longWeight, shortWeight, 0.15);
  const total = longWeight + shortWeight;
  const imbalance = total > 0 ? Math.abs(longWeight - shortWeight) / total : 0;
  const score = clamp01(imbalance * 0.75 + Math.min(graded.length / 10, 1) * 0.25);
  const observedAt = Math.max(...graded.map((row) => row.event.exchangeTimestamp));

  return buildEdgeEvidence({
    edgeId: 'WHALE_POSITIONING',
    status: direction && direction !== 'NEUTRAL' ? 'PASS' : 'FAIL',
    direction,
    score,
    dataQuality: clamp01(0.70 + Math.min(graded.length / 10, 1) * 0.30),
    observedAt,
    expiresAt: observedAt + 60_000,
    supportingReasons: [`s_a_wallets:${graded.length}`, `directional_imbalance:${imbalance.toFixed(3)}`],
    conflictingReasons: direction === 'NEUTRAL' ? ['high_grade_wallets_directionally_split'] : [],
    rawEventIds: graded.map((row) => row.event.eventId),
    metadata: { longWeight, shortWeight, gradedWallets: graded.length },
  }, context.now);
}
