import type { TradeDirection } from '../types';

export interface MarkDelta {
  label: string;
  tone: 'favor' | 'against' | 'flat';
}

/**
 * Computes the signed mark-to-entry move for a live position, plus which way
 * that move favors the trade's direction.
 *
 * - `label` is the raw signed percentage move of price (entry -> mark), not
 *   direction-adjusted. A short shows "+1.00%" when the mark rose 1%, even
 *   though that's adverse for the short.
 * - `tone` reflects whether the move is favorable or adverse *for the given
 *   direction*: a falling mark favors a SHORT and is adverse for a LONG, and
 *   vice versa for a rising mark.
 * - Renders a dash (never a fabricated 0.00%) when either leg is missing or
 *   non-finite, since a missing price is not the same thing as no movement.
 */
export function markDeltaFor(entryPrice: number, markPrice: number, direction: TradeDirection): MarkDelta {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(markPrice) || entryPrice === 0) {
    return { label: '—', tone: 'flat' };
  }

  const pctMove = ((markPrice - entryPrice) / entryPrice) * 100;
  const sign = pctMove > 0 ? '+' : pctMove < 0 ? '-' : '';
  const label = `${sign}${Math.abs(pctMove).toFixed(2)}%`;

  if (pctMove === 0) return { label, tone: 'flat' };

  const directionalMove = direction === 'SHORT' ? -pctMove : pctMove;
  const tone: MarkDelta['tone'] = directionalMove > 0 ? 'favor' : 'against';

  return { label, tone };
}
