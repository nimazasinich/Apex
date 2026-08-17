import { describe, expect, it } from 'vitest';
import { lifecycleTelegramEvent, loadTelegramPrefs } from '../services/telegram';

describe('Telegram lifecycle mapping', () => {
  it('maps confirmed and terminal outcomes to explicit event channels', () => {
    expect(lifecycleTelegramEvent('CANDIDATE', 'CONFIRMED', null)).toBe('confirmed');
    expect(lifecycleTelegramEvent('ACTIVE', 'EXPIRED', 'WIN')).toBe('tpHit');
    expect(lifecycleTelegramEvent('ACTIVE', 'INVALIDATED', 'LOSS')).toBe('slHit');
    expect(lifecycleTelegramEvent('ACTIVE', 'EXPIRED', null)).toBe('expired');
  });

  it('returns safe defaults when browser storage is unavailable', () => {
    expect(loadTelegramPrefs()).toEqual(expect.objectContaining({
      candidate: false,
      confirmed: true,
      tpHit: true,
      slHit: true,
    }));
  });
});
