import {
  CanonicalCandle,
  CanonicalEnvelope,
  CanonicalFearGreed,
  CanonicalFundingRate,
  CanonicalNewsEvent,
  CanonicalOpenInterest,
  CanonicalShortHunterSnapshot,
  CanonicalWhaleFlow,
} from '../../contracts/datasource/hfDatasourceTypes';
import { Space4Adapter } from './space4Adapter';
import { Space2Adapter } from './space2Adapter';

export class CanonicalDatasourceGateway {
  private space4 = new Space4Adapter();
  private space2 = new Space2Adapter();

  async probeHealth(): Promise<{
    space4: { ok: boolean; latencyMs: number; status: number };
    space2: { ok: boolean; latencyMs: number; status: number };
  }> {
    const [s4, s2] = await Promise.all([this.space4.probe(), this.space2.probe()]);
    return {
      space4: { ok: s4.ok, latencyMs: s4.latencyMs, status: s4.status },
      space2: { ok: s2.ok, latencyMs: s2.latencyMs, status: s2.status },
    };
  }

  async getHistoricalOHLCV(
    symbol: string,
    interval = '1h',
    limit = 100,
    startMs?: number,
    endMs?: number,
  ): Promise<CanonicalEnvelope<CanonicalCandle[]>> {
    // 1. Try Space 4 (preferred canonical historical path)
    const s4Res = await this.space4.getHistory(symbol, interval, limit, startMs, endMs);
    if (s4Res.success && s4Res.data.length > 0) {
      return s4Res;
    }

    // 2. Fallback to Space 2
    const s2Res = await this.space2.getOHLCV(symbol, interval, limit, startMs, endMs);
    if (s2Res.success && s2Res.data.length > 0) {
      return s2Res;
    }

    return s4Res;
  }

  async getFearGreed(limit = 0): Promise<CanonicalEnvelope<CanonicalFearGreed[]>> {
    const s4Res = await this.space4.getFearGreed(limit);
    if (s4Res.success && s4Res.data.length > 0) return s4Res;

    const s2Res = await this.space2.getFearGreed(limit);
    if (s2Res.success && s2Res.data.length > 0) return s2Res;

    return s4Res;
  }

  async getFunding(symbol: string, limit = 500): Promise<CanonicalEnvelope<CanonicalFundingRate[]>> {
    const s4Res = await this.space4.getFunding(symbol, limit);
    if (s4Res.success && s4Res.data.length > 0) return s4Res;

    const s2Res = await this.space2.getFunding(symbol, limit);
    if (s2Res.success && s2Res.data.length > 0) return s2Res;

    return s4Res;
  }

  async getOpenInterest(symbol: string, period = '1h', limit = 500): Promise<CanonicalEnvelope<CanonicalOpenInterest[]>> {
    return this.space4.getOpenInterest(symbol, period, limit);
  }

  async getNews(limit = 100): Promise<CanonicalEnvelope<CanonicalNewsEvent[]>> {
    return this.space4.getNews(limit);
  }

  async getWhaleFlow(limit = 100): Promise<CanonicalEnvelope<CanonicalWhaleFlow[]>> {
    return this.space4.getWhaleFlow(limit);
  }

  async getShortHunter(symbol: string, interval = '1h', limit = 120): Promise<CanonicalEnvelope<CanonicalShortHunterSnapshot>> {
    return this.space4.getShortHunter(symbol, interval, limit);
  }

  async getTradingPairs(): Promise<string[]> {
    return this.space4.getTradingPairs();
  }
}

let gatewayInstance: CanonicalDatasourceGateway | null = null;
export function getCanonicalDatasourceGateway(): CanonicalDatasourceGateway {
  if (!gatewayInstance) {
    gatewayInstance = new CanonicalDatasourceGateway();
  }
  return gatewayInstance;
}
