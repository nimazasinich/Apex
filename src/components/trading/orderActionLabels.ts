export type OrderActionSide = 'buy' | 'sell';
export type OrderActionMode = 'demo' | 'live';

export function orderSideLabel(side: OrderActionSide): 'BUY' | 'SELL' {
  return side === 'buy' ? 'BUY' : 'SELL';
}

export function reviewOrderActionLabel(side: OrderActionSide, mode: OrderActionMode): string {
  return `Review ${orderSideLabel(side)} ${mode} order`;
}

export function submitOrderActionLabel(side: OrderActionSide, mode: OrderActionMode): string {
  return mode === 'demo'
    ? `Execute demo ${orderSideLabel(side)} order`
    : `Submit live ${orderSideLabel(side)} order`;
}
