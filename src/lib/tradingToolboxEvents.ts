export type TradingToolRequestKey =
  | 'order'
  | 'orders'
  | 'positions'
  | 'depth'
  | 'trades'
  | 'strategy'
  | 'signals'
  | 'settings';

export const TRADING_TOOLBOX_REQUEST_EVENT = 'apex:trading-toolbox-request';

export function requestTradingTool(key: TradingToolRequestKey) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TradingToolRequestKey>(TRADING_TOOLBOX_REQUEST_EVENT, { detail: key }));
}
