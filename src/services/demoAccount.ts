import crypto from 'node:crypto';
import type { AccountSnapshot, LiveOrderDraft } from './connectedExchange';
import { toKuCoinFuturesSymbol } from './providers/publicExchangeClient';
import { assertTradePlanSubmittable, type TradePlan } from './tradePlan';
import { evaluateRiskGovernor, loadRiskGovernorPolicy, type RiskGovernorResult } from './riskGovernor';

export const DEMO_ORDER_CONFIRMATION = 'CONFIRM DEMO ORDER';

export interface DemoMarketQuote {
  symbol: string;
  price: number;
  multiplier: number;
  lotSize: number;
  tickSize: number;
  maxLeverage: number;
  status: string;
}

export interface DemoMarketGateway {
  quote(symbol: string): Promise<DemoMarketQuote>;
}

interface DemoPosition {
  symbol: string;
  currentQty: number;
  avgEntryPrice: number;
  markPrice: number;
  multiplier: number;
  leverage: number;
  marginMode: 'ISOLATED' | 'CROSS';
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  openedAt: number;
}

interface DemoOrder {
  id: string;
  clientOid: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  size: number;
  price: number;
  leverage: number;
  marginMode: 'ISOLATED' | 'CROSS';
  timeInForce: 'GTC' | 'IOC' | 'FOK';
  reduceOnly: boolean;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  status: 'open' | 'filled' | 'cancelled';
  dealSize: number;
  createdAt: number;
  updatedAt: number;
  multiplier: number;
}

export interface DemoOrderPreview {
  id: string;
  environment: 'DEMO';
  mode: 'demo';
  confirmationPhrase: typeof DEMO_ORDER_CONFIRMATION;
  createdAt: string;
  expiresAt: string;
  order: LiveOrderDraft & { clientOid: string; symbol: string };
  markPrice: number;
  estimatedNotionalUsd: number;
  estimatedInitialMarginUsd: number;
  availableMarginUsd: number;
  warnings: string[];
  tradePlan: TradePlan | null;
  riskDecision: RiskGovernorResult;
  used: boolean;
  quote: DemoMarketQuote;
}

export interface DemoSession {
  id: string;
  profile: { id: string; name: string; accountType: 'DEMO' };
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  startingBalanceUsd: number;
  cashBalanceUsd: number;
  maxOrderNotionalUsd: number;
  positions: Map<string, DemoPosition>;
  openOrders: Map<string, DemoOrder>;
  recentOrders: DemoOrder[];
  recentTrades: Array<Record<string, unknown>>;
  positionHistory: Array<Record<string, unknown>>;
  previews: Map<string, DemoOrderPreview>;
}

const finite = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const positive = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const aligned = (value: number, step: number): boolean => {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return false;
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-8;
};

function normalizeDraft(raw: Partial<LiveOrderDraft>): LiveOrderDraft & { symbol: string } {
  const side = raw.side === 'sell' ? 'sell' : raw.side === 'buy' ? 'buy' : null;
  const type = raw.type === 'market' ? 'market' : raw.type === 'limit' ? 'limit' : null;
  const marginMode = raw.marginMode === 'CROSS' ? 'CROSS' : raw.marginMode === 'ISOLATED' ? 'ISOLATED' : null;
  const timeInForce = ['GTC', 'IOC', 'FOK'].includes(String(raw.timeInForce)) ? raw.timeInForce as 'GTC' | 'IOC' | 'FOK' : null;
  if (!raw.symbol || !side || !type || !marginMode || !timeInForce) throw new Error('invalid_order_request');
  const quantity = finite(raw.quantity);
  const leverage = Math.floor(finite(raw.leverage));
  const price = raw.price == null ? null : finite(raw.price);
  const takeProfitPrice = raw.takeProfitPrice == null ? null : finite(raw.takeProfitPrice);
  const stopLossPrice = raw.stopLossPrice == null ? null : finite(raw.stopLossPrice);
  if (quantity <= 0 || leverage < 1 || leverage > 100) throw new Error('invalid_order_quantity_or_leverage');
  if (type === 'limit' && (!price || price <= 0)) throw new Error('limit_price_required');
  return {
    symbol: toKuCoinFuturesSymbol(String(raw.symbol)), side, type, quantity, price, leverage,
    marginMode, timeInForce, reduceOnly: raw.reduceOnly === true, takeProfitPrice, stopLossPrice,
  };
}

type DemoOrderRequest = Partial<LiveOrderDraft> & { tradePlan?: TradePlan | null };

function extractTradePlan(raw: DemoOrderRequest): TradePlan | null {
  return raw.tradePlan && typeof raw.tradePlan === 'object' ? raw.tradePlan as TradePlan : null;
}

function alignDown(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  return Number((Math.floor((value + 1e-12) / step) * step).toPrecision(12));
}

function validateProtectionGeometry(draft: LiveOrderDraft, referencePrice: number): void {
  if (draft.reduceOnly && (draft.takeProfitPrice || draft.stopLossPrice)) throw new Error('reduce_only_protection_not_allowed');
  if (draft.side === 'buy') {
    if (draft.takeProfitPrice && draft.takeProfitPrice <= referencePrice) throw new Error('long_take_profit_must_be_above_entry');
    if (draft.stopLossPrice && draft.stopLossPrice >= referencePrice) throw new Error('long_stop_loss_must_be_below_entry');
  } else {
    if (draft.takeProfitPrice && draft.takeProfitPrice >= referencePrice) throw new Error('short_take_profit_must_be_below_entry');
    if (draft.stopLossPrice && draft.stopLossPrice <= referencePrice) throw new Error('short_stop_loss_must_be_above_entry');
  }
}

function cloneOrder(order: DemoOrder): Record<string, unknown> {
  return { ...order };
}

function positionPnl(position: DemoPosition): number {
  return position.currentQty * position.multiplier * (position.markPrice - position.avgEntryPrice);
}

export class DemoAccountManager {
  private readonly sessions = new Map<string, DemoSession>();
  private readonly ttlMs: number;
  private readonly defaultBalanceUsd: number;
  private readonly serverNotionalCeiling: number;

  constructor(private readonly market: DemoMarketGateway, env = process.env) {
    this.ttlMs = Math.min(90 * 24 * 60 * 60 * 1000, positive(env.APEX_DEMO_SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000));
    this.defaultBalanceUsd = positive(env.APEX_DEMO_STARTING_BALANCE_USD, 100_000);
    this.serverNotionalCeiling = positive(env.APEX_DEMO_MAX_ORDER_NOTIONAL_USD, 100_000);
  }

  create(startingBalanceUsd?: number, maxOrderNotionalUsd?: number): DemoSession {
    const now = Date.now();
    const balance = Math.min(100_000_000, Math.max(100, positive(startingBalanceUsd, this.defaultBalanceUsd)));
    const session: DemoSession = {
      id: crypto.randomBytes(32).toString('base64url'),
      profile: { id: `demo_${crypto.randomBytes(6).toString('hex')}`, name: 'APEX Demo Trader', accountType: 'DEMO' },
      createdAt: now, lastUsedAt: now, expiresAt: now + this.ttlMs,
      startingBalanceUsd: balance, cashBalanceUsd: balance,
      maxOrderNotionalUsd: Math.min(positive(maxOrderNotionalUsd, this.serverNotionalCeiling), this.serverNotionalCeiling),
      positions: new Map(), openOrders: new Map(), recentOrders: [], recentTrades: [], positionHistory: [], previews: new Map(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string | null | undefined): DemoSession | null {
    this.prune();
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= Date.now()) return null;
    session.lastUsedAt = Date.now();
    return session;
  }

  reset(id: string | null | undefined, startingBalanceUsd?: number, maxOrderNotionalUsd?: number): DemoSession {
    if (id) this.sessions.delete(id);
    return this.create(startingBalanceUsd, maxOrderNotionalUsd);
  }

  publicState(session: DemoSession, liveSession: { apiKeyHint: string; expiresAt: number; executionArmed: boolean; maxOrderNotionalUsd: number } | null = null) {
    return {
      status: 'demo' as const,
      mode: 'demo' as const,
      environment: 'DEMO' as const,
      exchange: 'kucoin' as const,
      profile: session.profile,
      connectedAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      portfolioState: 'available' as const,
      executionState: 'unlocked' as const,
      requiresOrderPreview: true,
      requiresExplicitConfirmation: true,
      maxOrderNotionalUsd: session.maxOrderNotionalUsd,
      startingBalanceUsd: session.startingBalanceUsd,
      liveAvailable: Boolean(liveSession),
      liveApiKeyHint: liveSession?.apiKeyHint,
      liveExpiresAt: liveSession ? new Date(liveSession.expiresAt).toISOString() : undefined,
      liveExecutionState: liveSession ? (liveSession.executionArmed ? 'unlocked' as const : 'read_only' as const) : undefined,
      liveMaxOrderNotionalUsd: liveSession?.maxOrderNotionalUsd,
    };
  }

  async snapshot(session: DemoSession): Promise<AccountSnapshot> {
    await this.refreshMarketState(session);
    const positions = [...session.positions.values()].map((position) => ({
      id: `demo-position-${position.symbol}`,
      symbol: position.symbol,
      currentQty: position.currentQty,
      avgEntryPrice: position.avgEntryPrice,
      markPrice: position.markPrice,
      unrealisedPnl: positionPnl(position),
      realLeverage: position.leverage,
      liquidationPrice: this.liquidationPrice(position),
      positionMargin: Math.abs(position.currentQty) * position.multiplier * position.markPrice / position.leverage,
      marginMode: position.marginMode,
      isOpen: true,
      takeProfitPrice: position.takeProfitPrice,
      stopLossPrice: position.stopLossPrice,
      openedAt: position.openedAt,
    }));
    const unrealisedPnl = [...session.positions.values()].reduce((sum, position) => sum + positionPnl(position), 0);
    const positionMargin = positions.reduce((sum, position) => sum + finite(position.positionMargin), 0);
    const orderMargin = [...session.openOrders.values()].reduce(
      (sum, order) => sum + (order.size * order.multiplier * order.price / order.leverage), 0,
    );
    const accountEquity = session.cashBalanceUsd + unrealisedPnl;
    const availableBalance = Math.max(0, accountEquity - positionMargin - orderMargin);
    return {
      account: {
        currency: 'USDT', accountEquity, equity: accountEquity, availableBalance, availableMargin: availableBalance,
        unrealisedPNL: unrealisedPnl, positionMargin, orderMargin, frozenFunds: orderMargin,
        realizedPnl: session.cashBalanceUsd - session.startingBalanceUsd, startingBalance: session.startingBalanceUsd,
        profile: session.profile, environment: 'DEMO', dataSource: 'REAL_MARKET_VIRTUAL_EXECUTION',
      },
      positions,
      openOrders: [...session.openOrders.values()].map(cloneOrder),
      recentOrders: session.recentOrders.slice(0, 100).map(cloneOrder),
      recentTrades: session.recentTrades.slice(0, 100),
      positionHistory: session.positionHistory.slice(0, 100),
      serverTime: Date.now(),
      syncedAt: new Date().toISOString(),
      venue: 'demo',
      observationMetadata: { sourceObservedAt: Date.now(), providerReadAt: Date.now(), provenance: 'demo_execution_state' },
    };
  }

  async preview(session: DemoSession, rawDraft: DemoOrderRequest): Promise<DemoOrderPreview> {
    let draft = normalizeDraft(rawDraft);
    const tradePlan = extractTradePlan(rawDraft);
    const quote = await this.market.quote(draft.symbol);
    if (quote.status && quote.status !== 'Open') throw new Error('contract_not_open');
    if (!aligned(draft.quantity, quote.lotSize || 1)) throw new Error('invalid_quantity_step');
    if (draft.leverage > (quote.maxLeverage || 100)) throw new Error('leverage_exceeds_contract_max');
    if (draft.type === 'limit' && quote.tickSize > 0 && !aligned(draft.price || 0, quote.tickSize)) throw new Error('invalid_price_tick');
    for (const protectedPrice of [draft.takeProfitPrice, draft.stopLossPrice]) {
      if (protectedPrice && quote.tickSize > 0 && !aligned(protectedPrice, quote.tickSize)) throw new Error('invalid_protection_price_tick');
    }
    const referencePrice = draft.type === 'limit' ? draft.price || 0 : quote.price;
    if (referencePrice <= 0 || quote.multiplier <= 0) throw new Error('market_reference_unavailable');
    validateProtectionGeometry(draft, referencePrice);
    let notional = draft.quantity * quote.multiplier * referencePrice;
    if (notional > session.maxOrderNotionalUsd) throw new Error('session_notional_limit_exceeded');
    const snapshot = await this.snapshot(session);
    if (draft.reduceOnly) {
      const exposure = session.positions.get(draft.symbol)?.currentQty || 0;
      const delta = draft.side === 'buy' ? draft.quantity : -draft.quantity;
      if (!exposure || Math.sign(exposure) === Math.sign(delta)) throw new Error('reduce_only_has_no_exposure');
    }
    const available = finite(snapshot.account.availableBalance);
    const equity = finite(snapshot.account.accountEquity || snapshot.account.equity);
    const currentPositions = [...session.positions.values()];
    const symbolExposureUsd = currentPositions
      .filter((position) => position.symbol === draft.symbol)
      .reduce((sum, position) => sum + Math.abs(position.currentQty) * position.multiplier * position.markPrice, 0);
    const totalExposureUsd = currentPositions
      .reduce((sum, position) => sum + Math.abs(position.currentQty) * position.multiplier * position.markPrice, 0);
    const risks = currentPositions.map((position) => position.stopLossPrice == null
      ? null
      : Math.abs(position.currentQty) * position.multiplier * Math.abs(position.avgEntryPrice - position.stopLossPrice));
    const totalOpenRiskUsd = risks.every((risk) => risk != null) ? risks.reduce((sum, risk) => sum + (risk || 0), 0) : null;
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const realized = (from: number) => session.recentTrades
      .filter((trade) => finite(trade.timestamp || trade.createdAt) >= from)
      .reduce((sum, trade) => sum + finite(trade.realizedPnl || trade.pnl), 0);
    let consecutiveLosses = 0;
    for (const trade of session.recentTrades) {
      const pnl = finite(trade.realizedPnl || trade.pnl);
      if (pnl < 0) consecutiveLosses += 1;
      else if (pnl > 0) break;
    }
    let riskDecision = evaluateRiskGovernor({
      order: {
        symbol: draft.symbol,
        direction: draft.side === 'buy' ? 'LONG' : 'SHORT',
        quantity: draft.quantity,
        entryPrice: referencePrice,
        notionalUsd: notional,
        contractMultiplier: quote.multiplier,
        leverage: draft.leverage,
        reduceOnly: draft.reduceOnly,
        exchange: 'demo-kucoin',
        strategyId: tradePlan?.strategyId ?? null,
        strategyVersion: tradePlan?.strategyVersion ?? null,
        strategy: tradePlan?.strategyId ?? null,
      },
      account: { equityUsd: equity, availableMarginUsd: available, timestamp: now },
      portfolio: {
        openPositionCount: currentPositions.length,
        totalOpenRiskUsd,
        symbolExposureUsd,
        correlatedExposureUsd: totalExposureUsd,
        dailyPnlUsd: realized(dayAgo),
        weeklyPnlUsd: realized(weekAgo),
        drawdownPct: session.startingBalanceUsd > 0 ? Math.max(0, (session.startingBalanceUsd - equity) / session.startingBalanceUsd * 100) : null,
        consecutiveLosses,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'MANUAL',
      plan: tradePlan,
      academyIntelligence: tradePlan?.academyIntelligence ?? null,
      policy: loadRiskGovernorPolicy(),
      now,
    });
    if (riskDecision.decision === 'REJECTED') throw new Error('risk_governor_rejected');
    if (riskDecision.decision === 'DEFERRED') throw new Error('risk_governor_deferred');
    if (riskDecision.decision === 'APPROVED_REDUCED') {
      const reducedQuantity = alignDown(riskDecision.approvedQuantity, quote.lotSize || 1);
      if (reducedQuantity <= 0) throw new Error('risk_governor_reduced_below_minimum');
      draft = { ...draft, quantity: reducedQuantity };
      notional = draft.quantity * quote.multiplier * referencePrice;
      riskDecision = evaluateRiskGovernor({
        order: {
          symbol: draft.symbol, direction: draft.side === 'buy' ? 'LONG' : 'SHORT', quantity: draft.quantity,
          entryPrice: referencePrice, notionalUsd: notional, contractMultiplier: quote.multiplier, leverage: draft.leverage, reduceOnly: draft.reduceOnly,
          exchange: 'demo-kucoin',
          strategyId: tradePlan?.strategyId ?? null,
          strategyVersion: tradePlan?.strategyVersion ?? null,
          strategy: tradePlan?.strategyId ?? null,
        },
        account: { equityUsd: equity, availableMarginUsd: available, timestamp: now },
        portfolio: { openPositionCount: currentPositions.length, totalOpenRiskUsd, symbolExposureUsd, correlatedExposureUsd: totalExposureUsd, dailyPnlUsd: realized(dayAgo), weeklyPnlUsd: realized(weekAgo), drawdownPct: session.startingBalanceUsd > 0 ? Math.max(0, (session.startingBalanceUsd - equity) / session.startingBalanceUsd * 100) : null, consecutiveLosses },
        market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
        executionMode: 'MANUAL', plan: tradePlan, academyIntelligence: tradePlan?.academyIntelligence ?? null, policy: loadRiskGovernorPolicy(), now,
      });
      if (riskDecision.decision === 'REJECTED' || riskDecision.decision === 'DEFERRED') throw new Error('risk_governor_recheck_failed');
    }
    const margin = notional / draft.leverage;
    if (!draft.reduceOnly && margin > available) throw new Error('insufficient_available_margin');
    if (session.openOrders.size >= 100) throw new Error('exchange_open_order_limit_reached');
    const preview: DemoOrderPreview = {
      id: crypto.randomBytes(24).toString('base64url'), environment: 'DEMO', mode: 'demo',
      confirmationPhrase: DEMO_ORDER_CONFIRMATION,
      createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString(),
      order: { ...draft, clientOid: crypto.randomUUID() }, quote,
      markPrice: quote.price, estimatedNotionalUsd: notional, estimatedInitialMarginUsd: margin,
      availableMarginUsd: available,
      warnings: [...new Set([
        'Virtual funds only. No order will be sent to KuCoin.',
        'Prices and contract rules are sourced from the live market.',
        ...(riskDecision.decision === 'APPROVED_REDUCED' ? [`Risk Governor reduced quantity to ${draft.quantity}.`] : []),
        ...riskDecision.reasons,
      ])],
      tradePlan,
      riskDecision,
      used: false,
    };
    session.previews.set(preview.id, preview);
    return preview;
  }

  async submit(session: DemoSession, previewId: string, confirmation: string) {
    if (confirmation !== DEMO_ORDER_CONFIRMATION) throw new Error('explicit_demo_confirmation_required');
    const preview = session.previews.get(previewId);
    if (!preview || preview.used || Date.parse(preview.expiresAt) <= Date.now()) throw new Error('order_preview_expired');
    if (preview.tradePlan) {
      const planCheck = assertTradePlanSubmittable(preview.tradePlan);
      if (!planCheck.ok) throw new Error(`trade_plan_invalid:${planCheck.errors.join('|')}`);
    }
    if (preview.riskDecision.decision !== 'APPROVED' && preview.riskDecision.decision !== 'APPROVED_REDUCED') {
      throw new Error('risk_changed_repreview_required');
    }
    preview.used = true;
    session.previews.delete(preview.id);
    const now = Date.now();
    const order: DemoOrder = {
      id: `demo_${crypto.randomBytes(12).toString('hex')}`,
      clientOid: preview.order.clientOid,
      symbol: preview.order.symbol,
      side: preview.order.side,
      type: preview.order.type,
      size: preview.order.quantity,
      price: preview.order.type === 'market' ? preview.markPrice : preview.order.price || preview.markPrice,
      leverage: preview.order.leverage,
      marginMode: preview.order.marginMode,
      timeInForce: preview.order.timeInForce,
      reduceOnly: preview.order.reduceOnly,
      takeProfitPrice: preview.order.takeProfitPrice ?? null,
      stopLossPrice: preview.order.stopLossPrice ?? null,
      status: preview.order.type === 'market' ? 'filled' : 'open',
      dealSize: preview.order.type === 'market' ? preview.order.quantity : 0,
      createdAt: now, updatedAt: now, multiplier: preview.quote.multiplier,
    };
    if (order.type === 'market') this.fill(session, order, preview.markPrice, 'MARKET');
    else session.openOrders.set(order.id, order);
    session.recentOrders.unshift({ ...order });
    return {
      ok: true as const, environment: 'DEMO' as const, mode: 'demo' as const,
      submittedAt: new Date().toISOString(), clientOid: order.clientOid,
      demoOrder: cloneOrder(order), order: preview.order, riskDecision: preview.riskDecision,
    };
  }

  cancel(session: DemoSession, orderId: string) {
    const order = session.openOrders.get(orderId);
    if (!order) throw new Error('demo_order_not_found');
    session.openOrders.delete(orderId);
    order.status = 'cancelled'; order.updatedAt = Date.now();
    session.recentOrders.unshift({ ...order });
    return { ok: true as const, environment: 'DEMO' as const, mode: 'demo' as const, orderId, demoOrder: cloneOrder(order) };
  }

  private async refreshMarketState(session: DemoSession) {
    const symbols = new Set<string>([
      ...session.positions.keys(),
      ...[...session.openOrders.values()].map((order) => order.symbol),
    ]);
    const quotes = new Map<string, DemoMarketQuote>();
    await Promise.all([...symbols].map(async (symbol) => {
      try { quotes.set(symbol, await this.market.quote(symbol)); } catch { /* preserve last mark when a public feed is temporarily degraded */ }
    }));
    for (const [symbol, position] of session.positions) {
      const quote = quotes.get(symbol);
      if (quote?.price) position.markPrice = quote.price;
      const exitReason = this.protectionExit(position);
      if (exitReason) {
        const side = position.currentQty > 0 ? 'sell' : 'buy';
        const exitOrder: DemoOrder = {
          id: `demo_${crypto.randomBytes(12).toString('hex')}`, clientOid: crypto.randomUUID(), symbol,
          side, type: 'market', size: Math.abs(position.currentQty), price: position.markPrice,
          leverage: position.leverage, marginMode: position.marginMode, timeInForce: 'GTC', reduceOnly: true,
          takeProfitPrice: null, stopLossPrice: null, status: 'filled', dealSize: Math.abs(position.currentQty),
          createdAt: Date.now(), updatedAt: Date.now(), multiplier: position.multiplier,
        };
        this.fill(session, exitOrder, position.markPrice, exitReason);
        session.recentOrders.unshift(exitOrder);
      }
    }
    for (const order of [...session.openOrders.values()]) {
      const quote = quotes.get(order.symbol);
      if (!quote?.price) continue;
      const crossed = order.side === 'buy' ? quote.price <= order.price : quote.price >= order.price;
      if (!crossed) continue;
      session.openOrders.delete(order.id);
      order.status = 'filled'; order.dealSize = order.size; order.updatedAt = Date.now();
      this.fill(session, order, order.price, 'LIMIT');
      session.recentOrders.unshift({ ...order });
    }
  }

  private fill(session: DemoSession, order: DemoOrder, fillPrice: number, source: string) {
    const existing = session.positions.get(order.symbol);
    let delta = (order.side === 'buy' ? 1 : -1) * order.size;
    if (order.reduceOnly) {
      if (!existing || Math.sign(existing.currentQty) === Math.sign(delta)) throw new Error('reduce_only_has_no_exposure');
      delta = Math.sign(delta) * Math.min(Math.abs(delta), Math.abs(existing.currentQty));
    }
    let realizedPnl = 0;
    if (!existing || existing.currentQty === 0 || Math.sign(existing.currentQty) === Math.sign(delta)) {
      const previousQty = existing?.currentQty || 0;
      const nextQty = previousQty + delta;
      const avgEntryPrice = previousQty === 0
        ? fillPrice
        : ((Math.abs(previousQty) * (existing?.avgEntryPrice || fillPrice)) + (Math.abs(delta) * fillPrice)) / Math.abs(nextQty);
      session.positions.set(order.symbol, {
        symbol: order.symbol, currentQty: nextQty, avgEntryPrice, markPrice: fillPrice,
        multiplier: order.multiplier, leverage: order.leverage, marginMode: order.marginMode,
        takeProfitPrice: order.takeProfitPrice, stopLossPrice: order.stopLossPrice,
        openedAt: existing?.openedAt || Date.now(),
      });
    } else {
      const closingQty = Math.min(Math.abs(existing.currentQty), Math.abs(delta));
      realizedPnl = closingQty * existing.multiplier * (fillPrice - existing.avgEntryPrice) * Math.sign(existing.currentQty);
      session.cashBalanceUsd += realizedPnl;
      const nextQty = existing.currentQty + delta;
      if (Math.abs(nextQty) < 1e-10) {
        session.positions.delete(order.symbol);
      } else if (Math.sign(nextQty) === Math.sign(existing.currentQty)) {
        existing.currentQty = nextQty; existing.markPrice = fillPrice;
      } else {
        session.positions.set(order.symbol, {
          symbol: order.symbol, currentQty: nextQty, avgEntryPrice: fillPrice, markPrice: fillPrice,
          multiplier: order.multiplier, leverage: order.leverage, marginMode: order.marginMode,
          takeProfitPrice: order.takeProfitPrice, stopLossPrice: order.stopLossPrice, openedAt: Date.now(),
        });
      }
      session.positionHistory.unshift({
        id: `demo-history-${crypto.randomBytes(8).toString('hex')}`, symbol: order.symbol,
        side: existing.currentQty > 0 ? 'sell' : 'buy', type: source, size: closingQty,
        price: fillPrice, realisedPnl: realizedPnl, createdAt: Date.now(), status: 'closed',
      });
    }
    session.recentTrades.unshift({
      id: `demo-trade-${crypto.randomBytes(8).toString('hex')}`, orderId: order.id, tradeId: crypto.randomUUID(),
      symbol: order.symbol, side: order.side, type: source, size: Math.abs(delta), dealSize: Math.abs(delta),
      price: fillPrice, realizedPnl, tradeTime: Date.now(), createdAt: Date.now(), environment: 'DEMO',
    });
  }

  private protectionExit(position: DemoPosition): 'TAKE_PROFIT' | 'STOP_LOSS' | null {
    if (position.currentQty > 0) {
      if (position.takeProfitPrice && position.markPrice >= position.takeProfitPrice) return 'TAKE_PROFIT';
      if (position.stopLossPrice && position.markPrice <= position.stopLossPrice) return 'STOP_LOSS';
    } else {
      if (position.takeProfitPrice && position.markPrice <= position.takeProfitPrice) return 'TAKE_PROFIT';
      if (position.stopLossPrice && position.markPrice >= position.stopLossPrice) return 'STOP_LOSS';
    }
    return null;
  }

  private liquidationPrice(position: DemoPosition): number {
    const distance = position.avgEntryPrice / Math.max(1, position.leverage);
    return position.currentQty > 0
      ? Math.max(0, position.avgEntryPrice - distance * 0.9)
      : position.avgEntryPrice + distance * 0.9;
  }

  private prune() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) { this.sessions.delete(id); continue; }
      for (const [previewId, preview] of session.previews) {
        if (Date.parse(preview.expiresAt) <= now || preview.used) session.previews.delete(previewId);
      }
    }
  }
}

export function toPublicDemoPreview(preview: DemoOrderPreview) {
  const { used: _used, quote: _quote, ...safe } = preview;
  return safe;
}
