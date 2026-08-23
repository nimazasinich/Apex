import type { AccountSnapshot } from './accountTypes';

export interface WorkspacePosition {
  id: string;
  symbol: string;
  asset: string;
  side: 'LONG' | 'SHORT';
  size: number;
  valueUsd: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnlUsd: number;
  pnlPct: number;
  marginUsd: number;
  marginRatioPct: number;
  leverage: number;
  liquidationPrice: number | null;
}

export interface WorkspaceOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  size: number;
  filled: number;
  fillPct: number;
  price: number | null;
  averageFillPrice: number | null;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'unknown';
  createdAt: number | null;
  updatedAt: number | null;
}

export interface WorkspaceActivity {
  id: string;
  timestamp: number;
  type: 'trade' | 'order' | 'position' | 'deposit' | 'withdrawal' | 'transfer' | 'funding' | 'login' | 'other';
  title: string;
  subtitle: string;
  symbol: string | null;
  amount: number | null;
  currency: string | null;
  usdValue: number | null;
  /** Realized result attributable to this event; null when the exchange did not expose it. */
  realizedPnlUsd: number | null;
  status: 'completed' | 'pending' | 'cancelled' | 'success' | 'unknown';
  reference: string | null;
  direction: 'positive' | 'negative' | 'neutral';
}

export interface WorkspaceAnalytics {
  totalPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  winRatePct: number | null;
  profitFactor: number | null;
  sharpeRatio: number | null;
  totalTrades: number;
  cumulativePnl: Array<{ timestamp: number; value: number }>;
  monthlyPnl: Array<{ month: string; value: number }>;
  heatmap: Array<{ weekday: number; bucket: number; value: number }>;
  topAssets: Array<{ symbol: string; pnlUsd: number; pct: number }>;
}

export interface WorkspaceInsights {
  generatedAt: string;
  account: {
    currency: string;
    equityUsd: number;
    availableBalanceUsd: number;
    unrealizedPnlUsd: number;
    realizedPnlUsd: number;
    marginUsedUsd: number;
    marginRatioPct: number;
    buyingPowerUsd: number;
    riskScore: number;
    riskLabel: 'Low' | 'Medium' | 'High';
  };
  positions: WorkspacePosition[];
  orders: WorkspaceOrder[];
  activities: WorkspaceActivity[];
  analytics: WorkspaceAnalytics;
}

const numberKeys = (record: Record<string, unknown> | undefined, keys: string[], fallback = 0): number => {
  if (!record) return fallback;
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const optionalNumberKeys = (record: Record<string, unknown> | undefined, keys: string[]): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const stringKeys = (record: Record<string, unknown> | undefined, keys: string[], fallback = ''): string => {
  if (!record) return fallback;
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return fallback;
};

const timestampKeys = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 10_000_000_000 ? value * 1000 : value;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const cleanSymbol = (raw: string): string => raw
  .replace('XBTUSDTM', 'BTC-USDT')
  .replace(/USDTM$/, '-USDT')
  .replace(/_/g, '-')
  .toUpperCase();

const assetFromSymbol = (symbol: string): string => cleanSymbol(symbol).split('-')[0] || cleanSymbol(symbol);

const normalizeStatus = (raw: string, filled: number, size: number): WorkspaceOrder['status'] => {
  const status = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (/cancel/.test(status)) return 'cancelled';
  if (/reject|fail/.test(status)) return 'rejected';
  if (/partial/.test(status) || (size > 0 && filled > 0 && filled < size)) return 'partially_filled';
  if (/fill|done|closed|complete/.test(status) || (size > 0 && filled >= size)) return 'filled';
  if (/open|active|new/.test(status)) return 'open';
  return 'unknown';
};

function normalizePositions(snapshot: AccountSnapshot): WorkspacePosition[] {
  return (snapshot.positions || []).map((row, index) => {
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract', 'instrument'], `POSITION-${index + 1}`));
    const sizeSigned = numberKeys(row, ['currentQty', 'currentQuantity', 'qty', 'size', 'positionQty']);
    const size = Math.abs(sizeSigned);
    const sideText = stringKeys(row, ['side', 'direction']).toLowerCase();
    const side: 'LONG' | 'SHORT' = sideText === 'short' || sideText === 'sell' || sizeSigned < 0 ? 'SHORT' : 'LONG';
    const entryPrice = numberKeys(row, ['avgEntryPrice', 'averageEntryPrice', 'entryPrice', 'avgEntry']);
    const markPrice = numberKeys(row, ['markPrice', 'currentPrice', 'lastPrice', 'price'], entryPrice);
    const unrealizedPnlUsd = numberKeys(row, ['unrealisedPnl', 'unrealizedPnl', 'unrealisedPNL', 'unrealizedPNL', 'pnl']);
    const marginUsd = Math.abs(numberKeys(row, ['positionMargin', 'margin', 'posMargin', 'initialMargin']));
    const leverage = Math.max(1, Math.abs(numberKeys(row, ['realLeverage', 'leverage'], 1)));
    const multiplier = Math.abs(numberKeys(row, ['multiplier', 'contractMultiplier'], 1));
    const valueUsd = Math.abs(numberKeys(row, ['positionValue', 'value', 'notional'], size * markPrice * multiplier));
    const pnlPct = valueUsd > 0 ? (unrealizedPnlUsd / valueUsd) * 100 : 0;
    const accountEquity = numberKeys(snapshot.account, ['accountEquity', 'equity', 'marginBalance']);
    const marginRatioPct = accountEquity > 0 ? (marginUsd / accountEquity) * 100 : 0;
    const liq = numberKeys(row, ['liquidationPrice', 'liqPrice', 'bankruptPrice'], Number.NaN);
    return {
      id: stringKeys(row, ['id', 'positionId'], `position-${symbol}-${index}`),
      symbol,
      asset: assetFromSymbol(symbol),
      side,
      size,
      valueUsd,
      entryPrice,
      markPrice,
      unrealizedPnlUsd,
      pnlPct,
      marginUsd,
      marginRatioPct,
      leverage,
      liquidationPrice: Number.isFinite(liq) && liq > 0 ? liq : null,
    };
  }).filter((position) => position.size > 0 || Math.abs(position.valueUsd) > 0.0001);
}

function normalizeOrders(snapshot: AccountSnapshot): WorkspaceOrder[] {
  const source = [...(snapshot.openOrders || []), ...(snapshot.recentOrders || [])];
  const seen = new Set<string>();
  const result: WorkspaceOrder[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const row = source[index];
    const id = stringKeys(row, ['id', 'orderId', 'orderOid', 'clientOid'], `order-${index}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract', 'instrument'], 'UNKNOWN-USDT'));
    const size = Math.abs(numberKeys(row, ['size', 'quantity', 'qty', 'orderQty']));
    const filled = Math.abs(numberKeys(row, ['dealSize', 'filledSize', 'filledQty', 'executedQty']));
    const rawStatus = stringKeys(row, ['status', 'state', 'orderStatus'], snapshot.openOrders.includes(row) ? 'open' : 'unknown');
    result.push({
      id,
      symbol,
      side: stringKeys(row, ['side'], 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy',
      type: stringKeys(row, ['type', 'orderType'], 'limit'),
      size,
      filled,
      fillPct: size > 0 ? Math.min(100, Math.max(0, filled / size * 100)) : 0,
      price: (() => { const value = numberKeys(row, ['price', 'orderPrice'], Number.NaN); return Number.isFinite(value) && value > 0 ? value : null; })(),
      averageFillPrice: (() => { const value = numberKeys(row, ['avgFillPrice', 'averageFillPrice', 'dealPrice'], Number.NaN); return Number.isFinite(value) && value > 0 ? value : null; })(),
      status: normalizeStatus(rawStatus, filled, size),
      createdAt: timestampKeys(row, ['createdAt', 'createdTime', 'orderTime', 'ts']),
      updatedAt: timestampKeys(row, ['updatedAt', 'updatedTime', 'lastUpdateTime']),
    });
  }
  return result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 200);
}

function activityStatus(raw: string): WorkspaceActivity['status'] {
  const status = raw.toLowerCase();
  if (/complete|filled|closed|done/.test(status)) return 'completed';
  if (/success/.test(status)) return 'success';
  if (/pending|open|new/.test(status)) return 'pending';
  if (/cancel/.test(status)) return 'cancelled';
  return 'unknown';
}

function normalizeActivities(snapshot: AccountSnapshot): WorkspaceActivity[] {
  const activities: WorkspaceActivity[] = [];
  const pushTrade = (row: Record<string, unknown>, index: number) => {
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract'], 'UNKNOWN-USDT'));
    const side = stringKeys(row, ['side'], '').toLowerCase();
    const size = Math.abs(numberKeys(row, ['size', 'dealSize', 'quantity', 'qty']));
    const price = numberKeys(row, ['price', 'tradePrice', 'dealPrice']);
    const pnl = optionalNumberKeys(row, ['realizedPnl', 'realisedPnl', 'realisedPNL', 'pnl']);
    const timestamp = timestampKeys(row, ['tradeTime', 'createdAt', 'time', 'ts']) || Date.now() - index;
    activities.push({
      id: stringKeys(row, ['id', 'tradeId', 'orderId'], `trade-${index}`), timestamp, type: 'trade',
      title: 'Trade Executed', subtitle: `${symbol} · ${side === 'sell' ? 'Sell' : 'Buy'}`,
      symbol, amount: size, currency: assetFromSymbol(symbol), usdValue: size * price, realizedPnlUsd: pnl,
      status: 'completed', reference: stringKeys(row, ['tradeId', 'orderId', 'id'], '') || null,
      direction: (pnl ?? 0) > 0 ? 'positive' : (pnl ?? 0) < 0 ? 'negative' : side === 'sell' ? 'negative' : 'positive',
    });
  };
  (snapshot.recentTrades || []).forEach(pushTrade);

  (snapshot.recentOrders || []).forEach((row, index) => {
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract'], 'UNKNOWN-USDT'));
    const size = Math.abs(numberKeys(row, ['size', 'quantity', 'qty']));
    const price = numberKeys(row, ['price', 'dealPrice']);
    const rawStatus = stringKeys(row, ['status', 'state'], 'unknown');
    const timestamp = timestampKeys(row, ['updatedAt', 'createdAt', 'time']) || Date.now() - 10_000 - index;
    activities.push({
      id: `order-${stringKeys(row, ['id', 'orderId'], String(index))}`, timestamp, type: 'order',
      title: /cancel/i.test(rawStatus) ? 'Order Cancelled' : 'Order Updated',
      subtitle: `${symbol} · ${stringKeys(row, ['type'], 'Order')}`,
      symbol, amount: size, currency: assetFromSymbol(symbol), usdValue: size * price, realizedPnlUsd: null,
      status: activityStatus(rawStatus), reference: stringKeys(row, ['id', 'orderId'], '') || null,
      direction: /cancel|sell/i.test(`${rawStatus} ${stringKeys(row, ['side'])}`) ? 'negative' : 'neutral',
    });
  });

  (snapshot.positionHistory || []).forEach((row, index) => {
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract'], 'UNKNOWN-USDT'));
    const pnl = optionalNumberKeys(row, ['realizedPnl', 'realisedPnl', 'realisedPNL', 'pnl']);
    const timestamp = timestampKeys(row, ['createdAt', 'closeTime', 'time']) || Date.now() - 20_000 - index;
    activities.push({
      id: `position-${stringKeys(row, ['id', 'positionId'], String(index))}`, timestamp, type: 'position',
      title: 'Position Closed', subtitle: `${symbol} · ${stringKeys(row, ['type', 'side'], 'Position')}`,
      symbol, amount: Math.abs(numberKeys(row, ['size', 'quantity', 'qty'])), currency: assetFromSymbol(symbol),
      usdValue: pnl, realizedPnlUsd: pnl, status: 'completed', reference: stringKeys(row, ['id', 'positionId'], '') || null,
      direction: (pnl ?? 0) > 0 ? 'positive' : (pnl ?? 0) < 0 ? 'negative' : 'neutral',
    });
  });

  const dedupe = new Set<string>();
  return activities
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((activity) => {
      const key = `${activity.type}:${activity.reference || activity.id}:${activity.timestamp}`;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    })
    .slice(0, 250);
}

function buildAnalytics(snapshot: AccountSnapshot, positions: WorkspacePosition[], activities: WorkspaceActivity[]): WorkspaceAnalytics {
  const realizedRows = snapshot.positionHistory || [];
  const tradePnls = realizedRows
    .map((row) => ({
      timestamp: timestampKeys(row, ['createdAt', 'closeTime', 'time']) || Date.now(),
      pnl: numberKeys(row, ['realizedPnl', 'realisedPnl', 'realisedPNL', 'pnl']),
      symbol: cleanSymbol(stringKeys(row, ['symbol', 'contract'], 'UNKNOWN-USDT')),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const realizedPnlUsd = numberKeys(snapshot.account, ['realizedPnl', 'realisedPnl', 'realisedPNL'], tradePnls.reduce((sum, row) => sum + row.pnl, 0));
  const unrealizedPnlUsd = positions.reduce((sum, position) => sum + position.unrealizedPnlUsd, 0);
  const totalPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const wins = tradePnls.filter((row) => row.pnl > 0);
  const losses = tradePnls.filter((row) => row.pnl < 0);
  const grossProfit = wins.reduce((sum, row) => sum + row.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, row) => sum + row.pnl, 0));
  const mean = tradePnls.length ? tradePnls.reduce((sum, row) => sum + row.pnl, 0) / tradePnls.length : 0;
  const variance = tradePnls.length > 1 ? tradePnls.reduce((sum, row) => sum + (row.pnl - mean) ** 2, 0) / (tradePnls.length - 1) : 0;
  const std = Math.sqrt(variance);
  let cumulative = 0;
  const cumulativePnl = tradePnls.map((row) => ({ timestamp: row.timestamp, value: (cumulative += row.pnl) }));
  if (!cumulativePnl.length) cumulativePnl.push({ timestamp: Date.now(), value: totalPnlUsd });

  const monthMap = new Map<string, number>();
  const heatMap = new Map<string, number>();
  const assetMap = new Map<string, number>();
  for (const row of tradePnls) {
    const date = new Date(row.timestamp);
    const month = date.toLocaleString('en-US', { month: 'short' });
    monthMap.set(month, (monthMap.get(month) || 0) + row.pnl);
    const weekday = (date.getUTCDay() + 6) % 7;
    const bucket = Math.min(5, Math.floor(date.getUTCHours() / 4));
    const heatKey = `${weekday}:${bucket}`;
    heatMap.set(heatKey, (heatMap.get(heatKey) || 0) + row.pnl);
    assetMap.set(assetFromSymbol(row.symbol), (assetMap.get(assetFromSymbol(row.symbol)) || 0) + row.pnl);
  }
  for (const position of positions) assetMap.set(position.asset, (assetMap.get(position.asset) || 0) + position.unrealizedPnlUsd);
  const assetTotal = [...assetMap.values()].reduce((sum, value) => sum + Math.abs(value), 0) || 1;

  return {
    totalPnlUsd,
    realizedPnlUsd,
    unrealizedPnlUsd,
    winRatePct: tradePnls.length ? wins.length / tradePnls.length * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : null,
    sharpeRatio: tradePnls.length > 1 && std > 0 ? mean / std * Math.sqrt(tradePnls.length) : null,
    totalTrades: Math.max(tradePnls.length, (snapshot.recentTrades || []).length),
    cumulativePnl,
    monthlyPnl: [...monthMap.entries()].map(([month, value]) => ({ month, value })),
    heatmap: [...heatMap.entries()].map(([key, value]) => {
      const [weekday, bucket] = key.split(':').map(Number);
      return { weekday, bucket, value };
    }),
    topAssets: [...assetMap.entries()]
      .map(([symbol, pnlUsd]) => ({ symbol, pnlUsd, pct: Math.abs(pnlUsd) / assetTotal * 100 }))
      .sort((a, b) => b.pnlUsd - a.pnlUsd)
      .slice(0, 8),
  };
}

export function buildWorkspaceInsights(snapshot: AccountSnapshot): WorkspaceInsights {
  const positions = normalizePositions(snapshot);
  const orders = normalizeOrders(snapshot);
  const activities = normalizeActivities(snapshot);
  const account = snapshot.account || {};
  const equityUsd = numberKeys(account, ['accountEquity', 'equity', 'marginBalance', 'totalEquity']);
  const availableBalanceUsd = numberKeys(account, ['availableBalance', 'availableMargin', 'availableFunds']);
  const unrealizedPnlUsd = numberKeys(account, ['unrealisedPNL', 'unrealizedPNL', 'unrealisedPnl', 'unrealizedPnl'], positions.reduce((sum, item) => sum + item.unrealizedPnlUsd, 0));
  const realizedPnlUsd = numberKeys(account, ['realizedPnl', 'realisedPnl', 'realisedPNL']);
  const marginUsedUsd = numberKeys(account, ['positionMargin', 'marginUsed'], positions.reduce((sum, item) => sum + item.marginUsd, 0)) + numberKeys(account, ['orderMargin', 'frozenFunds']);
  const marginRatioPct = equityUsd > 0 ? Math.max(0, Math.min(100, marginUsedUsd / equityUsd * 100)) : 0;
  const liquidationRisk = positions.length
    ? Math.max(...positions.map((position) => {
      if (!position.liquidationPrice || !position.markPrice) return 0;
      const distancePct = Math.abs(position.markPrice - position.liquidationPrice) / position.markPrice;
      return Math.max(0, Math.min(1, (0.15 - distancePct) / 0.15));
    }))
    : 0;
  const riskScore = Math.round(Math.max(0, Math.min(100, marginRatioPct * 1.2 + liquidationRisk * 35)));
  const riskLabel: 'Low' | 'Medium' | 'High' = riskScore < 35 ? 'Low' : riskScore < 70 ? 'Medium' : 'High';
  const analytics = buildAnalytics(snapshot, positions, activities);

  return {
    generatedAt: new Date().toISOString(),
    account: {
      currency: stringKeys(account, ['currency'], 'USDT'),
      equityUsd,
      availableBalanceUsd,
      unrealizedPnlUsd,
      realizedPnlUsd,
      marginUsedUsd,
      marginRatioPct,
      buyingPowerUsd: Math.max(0, availableBalanceUsd),
      riskScore,
      riskLabel,
    },
    positions,
    orders,
    activities,
    analytics,
  };
}
