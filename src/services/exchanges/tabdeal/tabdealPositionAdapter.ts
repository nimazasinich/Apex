/** Authenticated READ-ONLY Tabdeal account/position surface. */
import { TabdealFapiClient } from './tabdealFapiClient';
import { normalizeAccountSnapshot, normalizeOrder, normalizePosition, normalizeTrade, type NormalizedTabdealOrder, type NormalizedTabdealPosition, type NormalizedTabdealTrade } from './tabdealNormalizer';
import type { AccountSnapshot } from '../../connectedExchange';

function asArray(payload: unknown): unknown[] { return Array.isArray(payload) ? payload : []; }

export class TabdealPositionAdapter {
  constructor(private readonly client: TabdealFapiClient) {}
  async getPositions(symbol?: string): Promise<NormalizedTabdealPosition[]> { return asArray(await this.client.positionRisk(symbol ? { symbol } : {})).map(normalizePosition); }
  async getOpenOrders(symbol?: string): Promise<NormalizedTabdealOrder[]> { return asArray(await this.client.openOrders(symbol ? { symbol } : {})).map(normalizeOrder); }
  async getAllOrders(symbol: string, range?: { startTime?: number; endTime?: number; limit?: number }): Promise<NormalizedTabdealOrder[]> { return asArray(await this.client.allOrders({ symbol, ...range })).map(normalizeOrder); }
  async getUserTrades(symbol: string, range?: { startTime?: number; endTime?: number; limit?: number }): Promise<NormalizedTabdealTrade[]> { return asArray(await this.client.userTrades({ symbol, ...range })).map(normalizeTrade); }
  async getIncome(range?: { symbol?: string; incomeType?: string; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> { return asArray(await this.client.income(range)); }
  async getPositionHistory(range?: { symbol?: string; isActive?: 0 | 1; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> { return asArray(await this.client.positionHistory(range)); }

  async getAccountSnapshot(primarySymbol?: string): Promise<AccountSnapshot> {
    const unavailable: string[] = [];
    const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
      try { return await fn(); } catch { unavailable.push(label); return undefined; }
    };
    const [account, positions, openOrders, allOrders, userTrades, positionHistory, serverTime] = await Promise.all([
      safe('account', () => this.client.account()),
      safe('positionRisk', () => this.client.positionRisk(primarySymbol ? { symbol: primarySymbol } : {})),
      safe('openOrders', () => this.client.openOrders(primarySymbol ? { symbol: primarySymbol } : {})),
      primarySymbol ? safe('allOrders', () => this.client.allOrders({ symbol: primarySymbol })) : undefined,
      primarySymbol ? safe('userTrades', () => this.client.userTrades({ symbol: primarySymbol })) : undefined,
      safe('positionHistory', () => this.client.positionHistory(primarySymbol ? { symbol: primarySymbol } : {})),
      safe('serverTime', () => this.client.serverTime()),
    ]);
    let allOrderRows = asArray(allOrders);
    let userTradeRows = asArray(userTrades);
    if (!primarySymbol) {
      const discoveredSymbols = [...new Set([
        ...asArray(positions).map((row) => normalizePosition(row).symbol),
        ...asArray(openOrders).map((row) => normalizeOrder(row).symbol),
      ].filter(Boolean))].slice(0, 3);
      if (discoveredSymbols.length) {
        const historyReads = await Promise.all(discoveredSymbols.map(async (symbol) => {
          const [orders, trades] = await Promise.all([
            safe(`allOrders:${symbol}`, () => this.client.allOrders({ symbol })),
            safe(`userTrades:${symbol}`, () => this.client.userTrades({ symbol })),
          ]);
          return { orders: asArray(orders), trades: asArray(trades) };
        }));
        allOrderRows = historyReads.flatMap((row) => row.orders);
        userTradeRows = historyReads.flatMap((row) => row.trades);
      }
    }
    const snapshot = normalizeAccountSnapshot({ account, positions: asArray(positions), openOrders: asArray(openOrders), allOrders: allOrderRows, userTrades: userTradeRows, positionHistory: asArray(positionHistory), serverTime });
    return { ...snapshot, quality: { state: unavailable.length > 0 ? 'partial' : 'complete', failures: unavailable } };
  }
}
