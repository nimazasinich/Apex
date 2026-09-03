/**
 * Safety boundary for Tabdeal execution intents.
 *
 * This adapter intentionally has NO live-venue submission path. PAPER means a
 * recording sink, not a real HTTP write. Raw write methods remain isolated in
 * TabdealFapiClient for future explicitly-reviewed manual-live promotion.
 */
import crypto from 'node:crypto';
import { evaluateRiskGovernor, type RiskGovernorInput, type RiskGovernorResult } from '../../riskGovernor';
import type { NormalizedTabdealOrder } from './tabdealNormalizer';
import { TABDEAL_EXCHANGE_ID, type TabdealCapabilities } from './tabdealCapabilities';

const CLIENT_ORDER_ID_PREFIX = 'apex-td-';
export function buildDeterministicClientOrderId(intentId: string): string {
  const hash = crypto.createHash('sha256').update(intentId).digest('hex').slice(0, 28);
  return `${CLIENT_ORDER_ID_PREFIX}${hash}`;
}

export interface TabdealOrderIntent {
  intentId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number | null;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly: boolean;
}

export interface TabdealExecutionResult {
  clientOrderId: string;
  riskDecision: RiskGovernorResult;
  /** true only when a PAPER recording sink accepted the intent. */
  submitted: boolean;
  /** Hard invariant for this adapter version. */
  venueSubmitted: false;
  order: NormalizedTabdealOrder | null;
  blockedReason: string | null;
}

export interface TabdealPaperExecutionSink {
  recordOrder(input: { clientOrderId: string; intent: TabdealOrderIntent; approvedQuantity: number }): Promise<NormalizedTabdealOrder | null>;
  recordClose(input: { clientOrderId: string; symbol: string }): Promise<NormalizedTabdealOrder | null>;
  recordProtection(input: { positionId: number; symbol?: string; stopLossPrice?: number; takeProfitPrice?: number; workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE' }): Promise<void>;
}

export class TabdealReduceOnlyUnsupportedError extends Error {
  constructor() { super('tabdeal_reduce_only_unsupported: use closePosition() for a risk-reducing exit.'); this.name = 'TabdealReduceOnlyUnsupportedError'; }
}

export class TabdealExecutionAdapter {
  constructor(
    private readonly capabilities: TabdealCapabilities,
    private readonly paperSink?: TabdealPaperExecutionSink,
  ) {}

  private paperReady(): boolean { return this.capabilities.executionStage === 'PAPER' && this.capabilities.autonomousLiveExecutionEnabled === false; }

  async submitOrderIntent(intent: TabdealOrderIntent, riskInputWithoutOrder: Omit<RiskGovernorInput, 'order'>): Promise<TabdealExecutionResult> {
    if (intent.reduceOnly) throw new TabdealReduceOnlyUnsupportedError();
    const clientOrderId = buildDeterministicClientOrderId(intent.intentId);
    const riskDecision = evaluateRiskGovernor({
      ...riskInputWithoutOrder,
      order: {
        symbol: intent.symbol,
        direction: intent.side === 'BUY' ? 'LONG' : 'SHORT',
        quantity: intent.quantity,
        entryPrice: riskInputWithoutOrder.plan?.entryPrice ?? intent.price ?? 0,
        notionalUsd: riskInputWithoutOrder.plan ? riskInputWithoutOrder.plan.sizing.positionSizeUsd : intent.quantity * (intent.price ?? 0),
        leverage: riskInputWithoutOrder.plan?.leverage ?? 1,
        reduceOnly: false,
        exchange: TABDEAL_EXCHANGE_ID,
      },
    });
    if (riskDecision.decision === 'REJECTED' || riskDecision.decision === 'DEFERRED') {
      return { clientOrderId, riskDecision, submitted: false, venueSubmitted: false, order: null, blockedReason: `risk_governor_${riskDecision.decision.toLowerCase()}` };
    }
    if (!this.paperReady()) return { clientOrderId, riskDecision, submitted: false, venueSubmitted: false, order: null, blockedReason: `execution_stage_${this.capabilities.executionStage.toLowerCase()}` };
    if (!this.paperSink) return { clientOrderId, riskDecision, submitted: false, venueSubmitted: false, order: null, blockedReason: 'paper_sink_missing' };
    const approvedQuantity = riskDecision.decision === 'APPROVED_REDUCED' ? riskDecision.approvedQuantity : intent.quantity;
    const order = await this.paperSink.recordOrder({ clientOrderId, intent, approvedQuantity });
    return { clientOrderId, riskDecision, submitted: true, venueSubmitted: false, order, blockedReason: null };
  }

  async closePosition(intentId: string, symbol: string, riskInputWithoutOrder: Omit<RiskGovernorInput, 'order'>): Promise<TabdealExecutionResult> {
    const clientOrderId = buildDeterministicClientOrderId(intentId);
    const riskDecision = evaluateRiskGovernor({
      ...riskInputWithoutOrder,
      order: { symbol, direction: 'LONG', quantity: 1, entryPrice: 1, notionalUsd: 1, leverage: 1, reduceOnly: true, exchange: TABDEAL_EXCHANGE_ID },
    });
    if (riskDecision.decision === 'REJECTED' || riskDecision.decision === 'DEFERRED') return { clientOrderId, riskDecision, submitted: false, venueSubmitted: false, order: null, blockedReason: `risk_governor_${riskDecision.decision.toLowerCase()}` };
    if (!this.paperReady()) return { clientOrderId, riskDecision, submitted: false, venueSubmitted: false, order: null, blockedReason: `execution_stage_${this.capabilities.executionStage.toLowerCase()}` };
    if (!this.paperSink) return { clientOrderId, riskDecision, submitted: false, venueSubmitted: false, order: null, blockedReason: 'paper_sink_missing' };
    const order = await this.paperSink.recordClose({ clientOrderId, symbol });
    return { clientOrderId, riskDecision, submitted: true, venueSubmitted: false, order, blockedReason: null };
  }

  async setProtection(protection: { positionId: number; symbol?: string; stopLossPrice?: number; takeProfitPrice?: number; workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE' }): Promise<{ applied: boolean; venueSubmitted: false; blockedReason: string | null }> {
    if (!Number.isFinite(protection.positionId) || protection.positionId <= 0) return { applied: false, venueSubmitted: false, blockedReason: 'position_id_required' };
    if (protection.stopLossPrice == null && protection.takeProfitPrice == null) return { applied: false, venueSubmitted: false, blockedReason: 'sl_or_tp_required' };
    if (!this.paperReady()) return { applied: false, venueSubmitted: false, blockedReason: `execution_stage_${this.capabilities.executionStage.toLowerCase()}` };
    if (!this.paperSink) return { applied: false, venueSubmitted: false, blockedReason: 'paper_sink_missing' };
    await this.paperSink.recordProtection(protection);
    return { applied: true, venueSubmitted: false, blockedReason: null };
  }
}
