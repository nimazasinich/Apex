import type { MarketEvent } from '../../contracts/realtime/marketEvent';

export type SequenceDecisionStatus =
  | 'ACCEPTED'
  | 'UNSEQUENCED'
  | 'DUPLICATE'
  | 'OUT_OF_ORDER'
  | 'GAP';

export interface SequenceDecision {
  status: SequenceDecisionStatus;
  key: string;
  previousSequence: number | null;
  currentSequence: number | null;
  expectedSequence: number | null;
  reason: string | null;
}

interface SequenceState {
  lastSequence: number;
  gapped: boolean;
}

export function sequenceKey(event: Pick<MarketEvent, 'source' | 'symbol' | 'type'>): string {
  const family = event.type === 'ORDERBOOK_SNAPSHOT' || event.type === 'ORDERBOOK_DELTA' ? 'ORDERBOOK' : event.type;
  return `${event.source}:${event.symbol}:${family}`;
}

/**
 * Validates either a single monotonically contiguous sequence or an exchange
 * range sequence (`sequenceStart..sequence`) with an optional exact
 * `previousSequence` linkage. Authoritative order-book snapshots are explicit
 * reseed points and therefore recover a previously gapped book.
 */
export class SequenceGuard {
  private readonly states = new Map<string, SequenceState>();

  inspect(event: MarketEvent): SequenceDecision {
    const key = sequenceKey(event);
    if (event.sequence === undefined) {
      return {
        status: 'UNSEQUENCED',
        key,
        previousSequence: this.states.get(key)?.lastSequence ?? null,
        currentSequence: null,
        expectedSequence: null,
        reason: null,
      };
    }

    const current = event.sequence;
    const start = event.sequenceStart ?? current;
    const linkedPrevious = event.previousSequence;
    const state = this.states.get(key);

    // A full book snapshot is a provider-authoritative reseed. This also
    // handles Bybit-style snapshot refreshes that may repeat an update id.
    if (event.type === 'ORDERBOOK_SNAPSHOT') {
      const previous = state?.lastSequence ?? null;
      this.states.set(key, { lastSequence: current, gapped: false });
      return {
        status: 'ACCEPTED',
        key,
        previousSequence: previous,
        currentSequence: current,
        expectedSequence: current,
        reason: state?.gapped ? 'snapshot_reseed_after_gap' : null,
      };
    }

    if (!state) {
      this.states.set(key, { lastSequence: current, gapped: false });
      return {
        status: 'ACCEPTED',
        key,
        previousSequence: null,
        currentSequence: current,
        expectedSequence: current,
        reason: null,
      };
    }

    const expected = state.lastSequence + 1;
    if (state.gapped) {
      return {
        status: 'GAP',
        key,
        previousSequence: state.lastSequence,
        currentSequence: current,
        expectedSequence: expected,
        reason: 'sequence_reseed_required',
      };
    }

    if (current === state.lastSequence && start === current) {
      return {
        status: 'DUPLICATE',
        key,
        previousSequence: state.lastSequence,
        currentSequence: current,
        expectedSequence: expected,
        reason: 'duplicate_sequence',
      };
    }

    if (current < state.lastSequence || current < expected) {
      return {
        status: 'OUT_OF_ORDER',
        key,
        previousSequence: state.lastSequence,
        currentSequence: current,
        expectedSequence: expected,
        reason: 'out_of_order_sequence',
      };
    }

    if (linkedPrevious !== undefined && linkedPrevious !== state.lastSequence) {
      state.gapped = true;
      return {
        status: 'GAP',
        key,
        previousSequence: state.lastSequence,
        currentSequence: current,
        expectedSequence: expected,
        reason: `previous_sequence_mismatch:${linkedPrevious}`,
      };
    }

    const rangeCoversExpected = start <= expected && current >= expected;
    if (!rangeCoversExpected) {
      state.gapped = true;
      return {
        status: 'GAP',
        key,
        previousSequence: state.lastSequence,
        currentSequence: current,
        expectedSequence: expected,
        reason: 'sequence_gap_detected',
      };
    }

    const previous = state.lastSequence;
    state.lastSequence = current;
    return {
      status: 'ACCEPTED',
      key,
      previousSequence: previous,
      currentSequence: current,
      expectedSequence: expected,
      reason: null,
    };
  }

  seed(key: string, sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('invalid_sequence_seed');
    this.states.set(key, { lastSequence: sequence, gapped: false });
  }

  reset(key?: string): void {
    if (key) this.states.delete(key);
    else this.states.clear();
  }

  snapshot(): Record<string, { lastSequence: number; gapped: boolean }> {
    return Object.fromEntries([...this.states.entries()].map(([key, value]) => [key, { ...value }]));
  }
}
