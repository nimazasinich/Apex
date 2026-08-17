import { describe, expect, it } from 'vitest';
import { allocateSignalId, resetSignalIdSerialForTests } from '../utils/signalId';

describe('allocateSignalId', () => {
  it('returns unique readable ids for the same ticker and direction', () => {
    resetSignalIdSerialForTests();
    const a = allocateSignalId('BTC-USDT', 'LONG');
    const b = allocateSignalId('BTC-USDT', 'LONG');
    expect(a).not.toBe(b);
    expect(a).toContain('BTCUSDT-L');
    expect(b).toContain('BTCUSDT-L');
  });

  it('keeps direction visible for audit trails', () => {
    const longId = allocateSignalId('ETH-USDT', 'LONG');
    const shortId = allocateSignalId('ETH-USDT', 'SHORT');
    expect(longId.endsWith('-L')).toBe(true);
    expect(shortId.endsWith('-S')).toBe(true);
  });
});
