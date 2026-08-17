import { describe, expect, it } from 'vitest';
import {
  KuCoinL2SequenceBook,
  KuCoinPublicStreamClient,
  parseStreamingFlag,
} from '../services/kucoinStreaming';

describe('KuCoin sequence-validated streaming utilities', () => {
  it('applies contiguous deltas and rejects duplicates', () => {
    const book = new KuCoinL2SequenceBook(10);
    book.seed({
      symbol: 'BTC-USDT',
      sequence: 100,
      bids: [[100, 2], [99, 3]],
      asks: [[101, 2], [102, 3]],
      updatedAt: 1,
    });
    const applied = book.apply({ change: '100,buy,4', sequence: 101, timestamp: 2 });
    expect(applied.status).toBe('APPLIED');
    expect(applied.snapshot?.sequence).toBe(101);
    expect(applied.snapshot?.book.bids[0].volume).toBe(4);
    expect(book.apply({ change: '100,buy,5', sequence: 101 }).status).toBe('DUPLICATE');
  });

  it('accepts a sequence range that covers the expected next sequence', () => {
    const book = new KuCoinL2SequenceBook();
    book.seed({ symbol: 'ETH-USDT', sequence: 10, bids: [[10, 1]], asks: [[11, 1]] });
    const result = book.apply({ change: '10,buy,2', sequenceStart: 9, sequenceEnd: 12 });
    expect(result.status).toBe('APPLIED');
    expect(result.nextSequence).toBe(12);
  });

  it('fails closed on a sequence gap and requests a REST reseed', () => {
    const book = new KuCoinL2SequenceBook();
    book.seed({ symbol: 'SOL-USDT', sequence: 20, bids: [[20, 1]], asks: [[21, 1]] });
    const result = book.apply({ change: '20,buy,2', sequenceStart: 23, sequenceEnd: 23 });
    expect(result.status).toBe('GAP');
    expect(result.snapshot?.needsReseed).toBe(true);
    expect(result.snapshot?.degraded).toBe(true);
    expect(result.snapshot?.book.dataSource).toBe('degraded');
  });

  it('does not connect when streaming is disabled', async () => {
    let created = 0;
    const client = new KuCoinPublicStreamClient({
      enabled: false,
      websocketFactory: () => {
        created += 1;
        throw new Error('should_not_connect');
      },
    });
    const unsubscribe = await client.subscribe('/contractMarket/level2:XBTUSDTM', () => undefined);
    expect(client.state).toBe('DISABLED');
    expect(created).toBe(0);
    unsubscribe();
  });

  it('parses explicit opt-in flags only', () => {
    expect(parseStreamingFlag('true')).toBe(true);
    expect(parseStreamingFlag('enabled')).toBe(true);
    expect(parseStreamingFlag('false')).toBe(false);
    expect(parseStreamingFlag(undefined)).toBe(false);
  });
});
