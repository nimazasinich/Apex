import type { LiquidityHunterTradePlanAuthorization } from './decisionBridge';

const MAX_RECORDS = 200;

export class LiquidityHunterManualCanaryRegistry {
  private readonly records = new Map<string, LiquidityHunterTradePlanAuthorization>();

  put(record: LiquidityHunterTradePlanAuthorization): void {
    const setupId = record.liquidityHunter.setupId;
    if (!setupId || !record.tradePlan) return;
    this.records.set(setupId, structuredClone(record));
    while (this.records.size > MAX_RECORDS) this.records.delete(this.records.keys().next().value!);
  }

  get(setupId: string): LiquidityHunterTradePlanAuthorization | null {
    const value = this.records.get(setupId);
    return value ? structuredClone(value) : null;
  }

  list(): LiquidityHunterTradePlanAuthorization[] {
    return [...this.records.values()].map((value) => structuredClone(value));
  }
}

export const liquidityHunterManualCanaryRegistry = new LiquidityHunterManualCanaryRegistry();
