import { createHash } from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { LiquidityHunterFeatureFlags } from '../liquidityHunter/featureFlags';
import { runLiquidityHunterEventReplay, type EventReplayRunnerResult } from './eventReplayRunner';
import {
  runLiquidityHunterMicrostructureValidation,
  type LiquidityHunterEntrySimulationPolicy,
  type LiquidityHunterMicrostructureValidationReport,
} from './liquidityHunterMicrostructureValidation';
import type { ReplayDatasetManifest } from './replayDatasetManifest';

export interface AuthoritativeReplayInput {
  events: MarketEvent[];
  symbol: string;
  flags: LiquidityHunterFeatureFlags;
  manifest?: ReplayDatasetManifest;
  executionSource?: string;
  entryPolicy?: LiquidityHunterEntrySimulationPolicy;
  evaluateEveryEvents?: number;
  maxCandidates?: number;
  concurrency?: number;
  latencyMs?: number;
  makerFeeBps?: number;
  takerFeeBps?: number;
  marketSlippageBps?: number;
  queueAheadFraction?: number;
}

export interface AuthoritativeReplayResult {
  version: 'lh_authoritative_replay_v1';
  tier: 'AUTHORITATIVE_MICROSTRUCTURE_RESEARCH';
  symbol: string;
  replay: EventReplayRunnerResult;
  microstructure: LiquidityHunterMicrostructureValidationReport | null;
  eligibility: {
    fullEventSequence: boolean;
    executionSource: string | null;
    hasTrades: boolean;
    hasQuotes: boolean;
    hasBookSnapshot: boolean;
    hasBookDeltas: boolean;
    blockers: string[];
  };
  deterministicFingerprint: string;
  matchingEngineAuthoritative: false;
  executionAuthorized: false;
  shadowOnly: true;
  caveats: string[];
}

function sourceCapabilities(events: readonly MarketEvent[], symbol: string) {
  const map = new Map<string, { trades: boolean; quotes: boolean; snapshot: boolean; deltas: boolean }>();
  for (const event of events) {
    if (event.symbol !== symbol) continue;
    const row = map.get(event.source) ?? { trades: false, quotes: false, snapshot: false, deltas: false };
    if (event.type === 'TRADE') row.trades = true;
    if (event.type === 'QUOTE') row.quotes = true;
    if (event.type === 'ORDERBOOK_SNAPSHOT') row.snapshot = true;
    if (event.type === 'ORDERBOOK_DELTA') row.deltas = true;
    map.set(event.source, row);
  }
  return map;
}

export async function runLiquidityHunterAuthoritativeReplay(input: AuthoritativeReplayInput): Promise<AuthoritativeReplayResult> {
  const symbol = input.symbol.toUpperCase();
  const events = input.events.filter((event) => event.symbol === symbol);
  if (!events.length) throw new Error('authoritative_replay_symbol_has_no_events');
  const capabilities = sourceCapabilities(events, symbol);
  const requestedSource = String(input.executionSource ?? '').trim();
  const eligibleSources = [...capabilities.entries()]
    .filter(([, row]) => row.trades && row.quotes && row.snapshot && row.deltas)
    .map(([source]) => source)
    .sort();
  const executionSource = requestedSource
    ? (eligibleSources.includes(requestedSource) ? requestedSource : null)
    : eligibleSources.includes('binance-usdm-ws') ? 'binance-usdm-ws' : eligibleSources.length === 1 ? eligibleSources[0] : null;
  const sourceState = executionSource ? capabilities.get(executionSource)! : null;
  const blockers: string[] = [];
  if (!executionSource) blockers.push('single_sequence_complete_execution_source_required');
  if (!sourceState?.trades) blockers.push('trade_events_required');
  if (!sourceState?.quotes) blockers.push('quote_events_required');
  if (!sourceState?.snapshot) blockers.push('orderbook_snapshot_required');
  if (!sourceState?.deltas) blockers.push('orderbook_deltas_required');

  const replay = await runLiquidityHunterEventReplay({
    events,
    symbol,
    flags: input.flags,
    manifest: input.manifest,
    evaluateEveryEvents: input.evaluateEveryEvents ?? 25,
  });
  const fullEventSequence = blockers.length === 0;
  const microstructure = fullEventSequence
    ? await runLiquidityHunterMicrostructureValidation({
        events,
        evaluations: replay.evaluations,
        symbol,
        executionSource: executionSource!,
        entryPolicy: input.entryPolicy ?? 'MARKET_AT_CONFIRMATION',
        maxCandidates: input.maxCandidates ?? 500,
        concurrency: input.concurrency ?? 2,
        latencyMs: input.latencyMs,
        makerFeeBps: input.makerFeeBps,
        takerFeeBps: input.takerFeeBps,
        marketSlippageBps: input.marketSlippageBps,
        queueAheadFraction: input.queueAheadFraction,
      })
    : null;
  const deterministicFingerprint = createHash('sha256')
    .update(replay.deterministicFingerprint)
    .update(':')
    .update(microstructure?.fingerprintSha256 ?? blockers.join('|'))
    .digest('hex');

  return {
    version: 'lh_authoritative_replay_v1',
    tier: 'AUTHORITATIVE_MICROSTRUCTURE_RESEARCH',
    symbol,
    replay,
    microstructure,
    eligibility: {
      fullEventSequence,
      executionSource,
      hasTrades: Boolean(sourceState?.trades),
      hasQuotes: Boolean(sourceState?.quotes),
      hasBookSnapshot: Boolean(sourceState?.snapshot),
      hasBookDeltas: Boolean(sourceState?.deltas),
      blockers,
    },
    deterministicFingerprint,
    matchingEngineAuthoritative: false,
    executionAuthorized: false,
    shadowOnly: true,
    caveats: [
      'This is the highest-fidelity APEX research replay tier, but private exchange queue priority remains unknowable.',
      'A complete single-venue trade/quote/snapshot/delta sequence is required before microstructure simulation runs.',
      'Microstructure results remain deterministic research evidence and cannot authorize execution.',
    ],
  };
}
