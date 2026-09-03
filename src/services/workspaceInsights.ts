import type { DataState } from '../contracts/observedValue';
import type { AccountSnapshot } from './accountTypes';

export interface WorkspacePosition {
  id: string;
  venue: 'kucoin' | 'tabdeal' | 'demo' | 'unknown';
  symbol: string | null;
  asset: string | null;
  side: 'LONG' | 'SHORT' | 'UNKNOWN';
  size: number | null;
  valueUsd: number | null;
  entryPrice: number | null;
  markPrice: number | null;
  unrealizedPnlUsd: number | null;
  pnlPct: number | null;
  marginUsd: number | null;
  marginRatioPct: number | null;
  leverage: number | null;
  liquidationPrice: number | null;
  dataState: Record<string, DataState>;
}

export interface WorkspaceOrder {
  id: string;
  venue: 'kucoin' | 'tabdeal' | 'demo' | 'unknown';
  symbol: string | null;
  side: 'buy' | 'sell' | 'unknown';
  type: string;
  size: number | null;
  filled: number | null;
  fillPct: number | null;
  price: number | null;
  averageFillPrice: number | null;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'unknown';
  createdAt: number | null;
  updatedAt: number | null;
  dataState: Record<string, DataState>;
}

export interface WorkspaceActivity {
  id: string;
  venue: 'kucoin' | 'tabdeal' | 'demo' | 'unknown';
  timestamp: number | null;
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
  dataState: Record<string, DataState>;
}

export interface WorkspaceAnalytics {
  totalPnlUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
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
  /** Projection time only. It is never an exchange observation timestamp. */
  generatedAt: string;
  account: {
    currency: string | null;
    equityUsd: number | null;
    availableBalanceUsd: number | null;
    unrealizedPnlUsd: number | null;
    realizedPnlUsd: number | null;
    marginUsedUsd: number | null;
    marginRatioPct: number | null;
    buyingPowerUsd: number | null;
    riskScore: number | null;
    riskLabel: 'Low' | 'Medium' | 'High' | null;
    dataState: Record<string, DataState>;
  };
  positions: WorkspacePosition[];
  orders: WorkspaceOrder[];
  activities: WorkspaceActivity[];
  analytics: WorkspaceAnalytics;
}

const stateOf = (value: unknown): DataState => value === null || value === undefined ? 'MISSING' : 'VALID';

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

const stringKeys = (record: Record<string, unknown> | undefined, keys: string[]): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
};

const timestampKeys = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const cleanSymbol = (raw: string | null): string | null => {
  if (!raw) return null;
  const cleaned = raw
    .replace('XBTUSDTM', 'BTC-USDT')
    .replace(/USDTM$/, '-USDT')
    .replace(/_/g, '-')
    .toUpperCase()
    .trim();
  return cleaned || null;
};

const assetFromSymbol = (symbol: string | null): string | null => symbol ? (cleanSymbol(symbol)?.split('-')[0] || null) : null;

const normalizeStatus = (raw: string | null, filled: number | null, size: number | null): WorkspaceOrder['status'] => {
  const status = (raw || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (/cancel/.test(status)) return 'cancelled';
  if (/reject|fail/.test(status)) return 'rejected';
  if (/partial/.test(status) || (size !== null && filled !== null && size > 0 && filled > 0 && filled < size)) return 'partially_filled';
  if (/fill|done|closed|complete/.test(status) || (size !== null && filled !== null && size > 0 && filled >= size)) return 'filled';
  if (/open|active|new/.test(status)) return 'open';
  return 'unknown';
};


function snapshotVenue(snapshot: AccountSnapshot): 'kucoin' | 'tabdeal' | 'demo' | 'unknown' {
  return snapshot.venue === 'kucoin' || snapshot.venue === 'tabdeal' || snapshot.venue === 'demo' ? snapshot.venue : 'unknown';
}

function normalizePositions(snapshot: AccountSnapshot): WorkspacePosition[] {
  return (snapshot.positions || []).map((row, index) => {
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract', 'instrument']));
    const sizeSigned = optionalNumberKeys(row, ['currentQty', 'currentQuantity', 'qty', 'size', 'positionQty']);
    const size = sizeSigned === null ? null : Math.abs(sizeSigned);
    const sideText = (stringKeys(row, ['side', 'direction']) || '').toLowerCase();
    const side: WorkspacePosition['side'] = sideText === 'short' || sideText === 'sell'
      ? 'SHORT'
      : sideText === 'long' || sideText === 'buy'
        ? 'LONG'
        : sizeSigned !== null && sizeSigned < 0
          ? 'SHORT'
          : sizeSigned !== null && sizeSigned > 0
            ? 'LONG'
            : 'UNKNOWN';
    const entryPrice = optionalNumberKeys(row, ['avgEntryPrice', 'averageEntryPrice', 'entryPrice', 'avgEntry']);
    const markPrice = optionalNumberKeys(row, ['markPrice', 'currentPrice', 'lastPrice', 'price']);
    const unrealizedPnlUsd = optionalNumberKeys(row, ['unrealisedPnl', 'unrealizedPnl', 'unrealisedPNL', 'unrealizedPNL', 'pnl']);
    const marginRaw = optionalNumberKeys(row, ['positionMargin', 'margin', 'posMargin', 'initialMargin']);
    const marginUsd = marginRaw === null ? null : Math.abs(marginRaw);
    const leverageRaw = optionalNumberKeys(row, ['realLeverage', 'leverage']);
    const leverage = leverageRaw === null ? null : Math.abs(leverageRaw);
    const multiplier = optionalNumberKeys(row, ['multiplier', 'contractMultiplier']);
    const directValue = optionalNumberKeys(row, ['positionValue', 'value', 'notional']);
    const derivedValue = size !== null && markPrice !== null
      ? size * markPrice * (multiplier === null ? 1 : Math.abs(multiplier))
      : null;
    const valueUsd = directValue === null ? (derivedValue === null ? null : Math.abs(derivedValue)) : Math.abs(directValue);
    const pnlPct = valueUsd !== null && valueUsd > 0 && unrealizedPnlUsd !== null ? (unrealizedPnlUsd / valueUsd) * 100 : null;
    const accountEquity = optionalNumberKeys(snapshot.account, ['accountEquity', 'equity', 'marginBalance']);
    const marginRatioPct = accountEquity !== null && accountEquity > 0 && marginUsd !== null ? (marginUsd / accountEquity) * 100 : null;
    const liq = optionalNumberKeys(row, ['liquidationPrice', 'liqPrice', 'bankruptPrice']);
    const sideState: DataState = side === 'UNKNOWN' ? 'MISSING' : 'VALID';
    return {
      id: stringKeys(row, ['id', 'positionId']) || `position-unidentified-${index}`,
      venue: snapshotVenue(snapshot),
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
      liquidationPrice: liq !== null && liq > 0 ? liq : null,
      dataState: {
        symbol: stateOf(symbol), side: sideState, size: stateOf(size), valueUsd: stateOf(valueUsd),
        entryPrice: stateOf(entryPrice), markPrice: stateOf(markPrice), unrealizedPnlUsd: stateOf(unrealizedPnlUsd), marginUsd: stateOf(marginUsd), leverage: stateOf(leverage),
      },
    };
  }).filter((position) => position.size === null || position.size > 0 || (position.valueUsd !== null && Math.abs(position.valueUsd) > 0.0001));
}

function normalizeOrders(snapshot: AccountSnapshot): WorkspaceOrder[] {
  const source = [...(snapshot.openOrders || []), ...(snapshot.recentOrders || [])];
  const seen = new Set<string>();
  const result: WorkspaceOrder[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const row = source[index];
    const id = stringKeys(row, ['id', 'orderId', 'orderOid', 'clientOid']) || `order-unidentified-${index}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract', 'instrument']));
    const sizeRaw = optionalNumberKeys(row, ['size', 'quantity', 'qty', 'orderQty']);
    const filledRaw = optionalNumberKeys(row, ['dealSize', 'filledSize', 'filledQty', 'executedQty']);
    const size = sizeRaw === null ? null : Math.abs(sizeRaw);
    const filled = filledRaw === null ? null : Math.abs(filledRaw);
    const rawStatus = stringKeys(row, ['status', 'state', 'orderStatus']) || (snapshot.openOrders.includes(row) ? 'open' : null);
    const sideText = (stringKeys(row, ['side']) || '').toLowerCase();
    const side: WorkspaceOrder['side'] = sideText === 'sell' ? 'sell' : sideText === 'buy' ? 'buy' : 'unknown';
    const type = stringKeys(row, ['type', 'orderType']) || 'UNKNOWN';
    const price = optionalNumberKeys(row, ['price', 'orderPrice']);
    const averageFillPrice = optionalNumberKeys(row, ['avgFillPrice', 'averageFillPrice', 'dealPrice']);
    result.push({
      id,
      venue: snapshotVenue(snapshot),
      symbol,
      side,
      type,
      size,
      filled,
      fillPct: size !== null && filled !== null && size > 0 ? Math.min(100, Math.max(0, filled / size * 100)) : null,
      price: price !== null && price > 0 ? price : null,
      averageFillPrice: averageFillPrice !== null && averageFillPrice > 0 ? averageFillPrice : null,
      status: normalizeStatus(rawStatus, filled, size),
      createdAt: timestampKeys(row, ['createdAt', 'createdTime', 'orderTime', 'ts']),
      updatedAt: timestampKeys(row, ['updatedAt', 'updatedTime', 'lastUpdateTime']),
      dataState: { symbol: stateOf(symbol), side: side === 'unknown' ? 'MISSING' : 'VALID', size: stateOf(size), filled: stateOf(filled), price: stateOf(price) },
    });
  }
  return result.sort((a, b) => (b.createdAt ?? Number.NEGATIVE_INFINITY) - (a.createdAt ?? Number.NEGATIVE_INFINITY)).slice(0, 200);
}

function activityStatus(raw: string | null): WorkspaceActivity['status'] {
  const status = (raw || '').toLowerCase();
  if (/complete|filled|closed|done/.test(status)) return 'completed';
  if (/success/.test(status)) return 'success';
  if (/pending|open|new/.test(status)) return 'pending';
  if (/cancel/.test(status)) return 'cancelled';
  return 'unknown';
}

function multiplyObserved(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left * right;
}

function normalizeActivities(snapshot: AccountSnapshot): WorkspaceActivity[] {
  const activities: WorkspaceActivity[] = [];
  (snapshot.recentTrades || []).forEach((row, index) => {
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract']));
    const side = (stringKeys(row, ['side']) || '').toLowerCase();
    const sizeRaw = optionalNumberKeys(row, ['size', 'dealSize', 'quantity', 'qty']);
    const size = sizeRaw === null ? null : Math.abs(sizeRaw);
    const price = optionalNumberKeys(row, ['price', 'tradePrice', 'dealPrice']);
    const pnl = optionalNumberKeys(row, ['realizedPnl', 'realisedPnl', 'realisedPNL', 'pnl']);
    const timestamp = timestampKeys(row, ['tradeTime', 'createdAt', 'time', 'ts']);
    activities.push({
      id: stringKeys(row, ['id', 'tradeId', 'orderId']) || `trade-unidentified-${index}`,
      venue: snapshotVenue(snapshot),
      timestamp,
      type: 'trade',
      title: 'Trade Executed',
      subtitle: `${symbol || 'Unknown symbol'} · ${side === 'sell' ? 'Sell' : side === 'buy' ? 'Buy' : 'Unknown side'}`,
      symbol,
      amount: size,
      currency: assetFromSymbol(symbol),
      usdValue: multiplyObserved(size, price),
      realizedPnlUsd: pnl,
      status: 'completed',
      reference: stringKeys(row, ['tradeId', 'orderId', 'id']),
      direction: pnl !== null ? (pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral') : 'neutral',
      dataState: { timestamp: stateOf(timestamp), symbol: stateOf(symbol), amount: stateOf(size), usdValue: stateOf(multiplyObserved(size, price)), realizedPnlUsd: stateOf(pnl) },
    });
  });

  (snapshot.recentOrders || []).forEach((row, index) => {
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract']));
    const sizeRaw = optionalNumberKeys(row, ['size', 'quantity', 'qty']);
    const size = sizeRaw === null ? null : Math.abs(sizeRaw);
    const price = optionalNumberKeys(row, ['price', 'dealPrice']);
    const rawStatus = stringKeys(row, ['status', 'state']);
    const timestamp = timestampKeys(row, ['updatedAt', 'createdAt', 'time']);
    const side = (stringKeys(row, ['side']) || '').toLowerCase();
    activities.push({
      id: `order-${stringKeys(row, ['id', 'orderId']) || `unidentified-${index}`}`,
      venue: snapshotVenue(snapshot),
      timestamp,
      type: 'order',
      title: /cancel/i.test(rawStatus || '') ? 'Order Cancelled' : 'Order Updated',
      subtitle: `${symbol || 'Unknown symbol'} · ${stringKeys(row, ['type']) || 'Unknown order type'}`,
      symbol,
      amount: size,
      currency: assetFromSymbol(symbol),
      usdValue: multiplyObserved(size, price),
      realizedPnlUsd: null,
      status: activityStatus(rawStatus),
      reference: stringKeys(row, ['id', 'orderId']),
      direction: /cancel/i.test(rawStatus || '') || side === 'sell' ? 'negative' : 'neutral',
      dataState: { timestamp: stateOf(timestamp), symbol: stateOf(symbol), amount: stateOf(size), usdValue: stateOf(multiplyObserved(size, price)), realizedPnlUsd: 'MISSING' },
    });
  });

  (snapshot.positionHistory || []).forEach((row, index) => {
    const symbol = cleanSymbol(stringKeys(row, ['symbol', 'contract']));
    const pnl = optionalNumberKeys(row, ['realizedPnl', 'realisedPnl', 'realisedPNL', 'pnl']);
    const timestamp = timestampKeys(row, ['createdAt', 'closeTime', 'time']);
    const sizeRaw = optionalNumberKeys(row, ['size', 'quantity', 'qty']);
    const amount = sizeRaw === null ? null : Math.abs(sizeRaw);
    activities.push({
      id: `position-${stringKeys(row, ['id', 'positionId']) || `unidentified-${index}`}`,
      venue: snapshotVenue(snapshot),
      timestamp,
      type: 'position',
      title: 'Position Closed',
      subtitle: `${symbol || 'Unknown symbol'} · ${stringKeys(row, ['type', 'side']) || 'Unknown position'}`,
      symbol,
      amount,
      currency: assetFromSymbol(symbol),
      usdValue: pnl,
      realizedPnlUsd: pnl,
      status: 'completed',
      reference: stringKeys(row, ['id', 'positionId']),
      direction: pnl !== null ? (pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral') : 'neutral',
      dataState: { timestamp: stateOf(timestamp), symbol: stateOf(symbol), amount: stateOf(amount), usdValue: stateOf(pnl), realizedPnlUsd: stateOf(pnl) },
    });
  });

  const dedupe = new Set<string>();
  return activities
    .sort((a, b) => (b.timestamp ?? Number.NEGATIVE_INFINITY) - (a.timestamp ?? Number.NEGATIVE_INFINITY))
    .filter((activity) => {
      const key = `${activity.type}:${activity.reference || activity.id}:${activity.timestamp ?? 'MISSING_TIME'}`;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    })
    .slice(0, 250);
}

function sumIfComplete(values: Array<number | null>): number | null {
  return values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value as number), 0);
}

function buildAnalytics(snapshot: AccountSnapshot, positions: WorkspacePosition[]): WorkspaceAnalytics {
  const realizedRows = snapshot.positionHistory || [];
  const tradePnls = realizedRows.map((row) => ({
    timestamp: timestampKeys(row, ['createdAt', 'closeTime', 'time']),
    pnl: optionalNumberKeys(row, ['realizedPnl', 'realisedPnl', 'realisedPNL', 'pnl']),
    symbol: cleanSymbol(stringKeys(row, ['symbol', 'contract'])),
  }));
  const accountRealized = optionalNumberKeys(snapshot.account, ['realizedPnl', 'realisedPnl', 'realisedPNL']);
  const realizedPnlUsd = accountRealized ?? sumIfComplete(tradePnls.map((row) => row.pnl));
  const unrealizedPnlUsd = sumIfComplete(positions.map((position) => position.unrealizedPnlUsd));
  const totalPnlUsd = realizedPnlUsd === null || unrealizedPnlUsd === null ? null : realizedPnlUsd + unrealizedPnlUsd;
  const observedPnls = tradePnls.filter((row): row is { timestamp: number | null; pnl: number; symbol: string | null } => row.pnl !== null);
  const wins = observedPnls.filter((row) => row.pnl > 0);
  const losses = observedPnls.filter((row) => row.pnl < 0);
  const grossProfit = wins.reduce((sum, row) => sum + row.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, row) => sum + row.pnl, 0));
  const mean = observedPnls.length ? observedPnls.reduce((sum, row) => sum + row.pnl, 0) / observedPnls.length : null;
  const variance = mean !== null && observedPnls.length > 1 ? observedPnls.reduce((sum, row) => sum + (row.pnl - mean) ** 2, 0) / (observedPnls.length - 1) : null;
  const std = variance === null ? null : Math.sqrt(variance);
  let cumulative = 0;
  const cumulativePnl = tradePnls
    .filter((row): row is { timestamp: number; pnl: number; symbol: string | null } => row.timestamp !== null && row.pnl !== null)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((row) => ({ timestamp: row.timestamp, value: (cumulative += row.pnl) }));

  const monthMap = new Map<string, number>();
  const heatMap = new Map<string, number>();
  const assetMap = new Map<string, number>();
  for (const row of tradePnls) {
    if (row.timestamp === null || row.pnl === null) continue;
    const date = new Date(row.timestamp);
    const month = date.toLocaleString('en-US', { month: 'short' });
    monthMap.set(month, (monthMap.get(month) || 0) + row.pnl);
    const weekday = (date.getUTCDay() + 6) % 7;
    const bucket = Math.min(5, Math.floor(date.getUTCHours() / 4));
    const heatKey = `${weekday}:${bucket}`;
    heatMap.set(heatKey, (heatMap.get(heatKey) || 0) + row.pnl);
    const asset = assetFromSymbol(row.symbol);
    if (asset) assetMap.set(asset, (assetMap.get(asset) || 0) + row.pnl);
  }
  for (const position of positions) {
    if (position.asset && position.unrealizedPnlUsd !== null) assetMap.set(position.asset, (assetMap.get(position.asset) || 0) + position.unrealizedPnlUsd);
  }
  const assetTotal = [...assetMap.values()].reduce((sum, value) => sum + Math.abs(value), 0);

  return {
    totalPnlUsd,
    realizedPnlUsd,
    unrealizedPnlUsd,
    winRatePct: observedPnls.length === tradePnls.length && observedPnls.length ? wins.length / observedPnls.length * 100 : null,
    profitFactor: observedPnls.length === tradePnls.length && observedPnls.length ? (grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : null) : null,
    sharpeRatio: mean !== null && std !== null && observedPnls.length === tradePnls.length && observedPnls.length > 1 && std > 0 ? mean / std * Math.sqrt(observedPnls.length) : null,
    totalTrades: Math.max(realizedRows.length, (snapshot.recentTrades || []).length),
    cumulativePnl,
    monthlyPnl: [...monthMap.entries()].map(([month, value]) => ({ month, value })),
    heatmap: [...heatMap.entries()].map(([key, value]) => {
      const [weekday, bucket] = key.split(':').map(Number);
      return { weekday, bucket, value };
    }),
    topAssets: [...assetMap.entries()]
      .map(([symbol, pnlUsd]) => ({ symbol, pnlUsd, pct: assetTotal > 0 ? Math.abs(pnlUsd) / assetTotal * 100 : 0 }))
      .sort((a, b) => b.pnlUsd - a.pnlUsd)
      .slice(0, 8),
  };
}

export function buildWorkspaceInsights(snapshot: AccountSnapshot): WorkspaceInsights {
  const positions = normalizePositions(snapshot);
  const orders = normalizeOrders(snapshot);
  const activities = normalizeActivities(snapshot);
  const account = snapshot.account || {};
  const equityUsd = optionalNumberKeys(account, ['accountEquity', 'equity', 'marginBalance', 'totalEquity']);
  const availableBalanceUsd = optionalNumberKeys(account, ['availableBalance', 'availableMargin', 'availableFunds']);
  const accountUnrealized = optionalNumberKeys(account, ['unrealisedPNL', 'unrealizedPNL', 'unrealisedPnl', 'unrealizedPnl']);
  const unrealizedPnlUsd = accountUnrealized ?? sumIfComplete(positions.map((item) => item.unrealizedPnlUsd));
  const realizedPnlUsd = optionalNumberKeys(account, ['realizedPnl', 'realisedPnl', 'realisedPNL']);
  const directMarginUsed = optionalNumberKeys(account, ['positionMargin', 'marginUsed']);
  const orderMargin = optionalNumberKeys(account, ['orderMargin', 'frozenFunds']);
  const positionMargin = sumIfComplete(positions.map((item) => item.marginUsd));
  const baseMarginUsed = directMarginUsed ?? positionMargin;
  const marginUsedUsd = baseMarginUsed === null ? null : (orderMargin === null ? baseMarginUsed : baseMarginUsed + orderMargin);
  const marginRatioPct = equityUsd !== null && equityUsd > 0 && marginUsedUsd !== null ? Math.max(0, Math.min(100, marginUsedUsd / equityUsd * 100)) : null;
  const liquidationRisks = positions.map((position) => {
    if (position.liquidationPrice === null || position.markPrice === null || position.markPrice <= 0) return null;
    const distancePct = Math.abs(position.markPrice - position.liquidationPrice) / position.markPrice;
    return Math.max(0, Math.min(1, (0.15 - distancePct) / 0.15));
  });
  const liquidationRisk = positions.length === 0 ? 0 : liquidationRisks.some((value) => value === null) ? null : Math.max(...liquidationRisks as number[]);
  const riskScore = marginRatioPct === null || liquidationRisk === null ? null : Math.round(Math.max(0, Math.min(100, marginRatioPct * 1.2 + liquidationRisk * 35)));
  const riskLabel: 'Low' | 'Medium' | 'High' | null = riskScore === null ? null : riskScore < 35 ? 'Low' : riskScore < 70 ? 'Medium' : 'High';
  const currency = stringKeys(account, ['currency']);
  const analytics = buildAnalytics(snapshot, positions);

  return {
    generatedAt: new Date().toISOString(),
    account: {
      currency,
      equityUsd,
      availableBalanceUsd,
      unrealizedPnlUsd,
      realizedPnlUsd,
      marginUsedUsd,
      marginRatioPct,
      buyingPowerUsd: availableBalanceUsd === null ? null : Math.max(0, availableBalanceUsd),
      riskScore,
      riskLabel,
      dataState: {
        currency: stateOf(currency), equityUsd: stateOf(equityUsd), availableBalanceUsd: stateOf(availableBalanceUsd),
        unrealizedPnlUsd: stateOf(unrealizedPnlUsd), realizedPnlUsd: stateOf(realizedPnlUsd), marginUsedUsd: stateOf(marginUsedUsd),
        marginRatioPct: stateOf(marginRatioPct), riskScore: stateOf(riskScore),
      },
    },
    positions,
    orders,
    activities,
    analytics,
  };
}
