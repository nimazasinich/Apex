import type { SmartMoneyContext } from '../../types';
import type { LiquidityHunterDynamicFusionEngine } from './dynamicFusionEngine';
import type { LiquidityHunterPaperCanary } from './paperCanary';

export interface LiquidityHunterShadowContext {
  smartMoneyContext?: SmartMoneyContext | null;
  currentPrice?: number | null;
}

export type LiquidityHunterShadowContextProvider = (symbol: string) => Promise<LiquidityHunterShadowContext>;

export interface LiquidityHunterShadowEvaluationSchedulerSnapshot {
  enabled: boolean;
  running: boolean;
  executionDependency: false;
  orderSubmissionAllowed: false;
  symbols: string[];
  intervalMs: number;
  evaluations: number;
  captures: number;
  failures: number;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
}

export interface LiquidityHunterShadowEvaluationSchedulerOptions {
  enabled: boolean;
  symbols: string[];
  intervalMs?: number;
  maxConcurrency?: number;
  engine: LiquidityHunterDynamicFusionEngine;
  paperCanary: LiquidityHunterPaperCanary;
  contextProvider: LiquidityHunterShadowContextProvider;
  now?: () => number;
}

function normalizeSymbols(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(value)))].slice(0, 20);
}

/**
 * Periodic research-only evaluator used by Paper Canary. It performs the same
 * shadow evaluation repeatedly without any order, TradePlan, promotion, or risk
 * mutation. The only side effect is recording an eligible Paper Canary setup.
 */
export class LiquidityHunterShadowEvaluationScheduler {
  private readonly enabled: boolean;
  private readonly symbols: string[];
  private readonly intervalMs: number;
  private readonly maxConcurrency: number;
  private readonly engine: LiquidityHunterDynamicFusionEngine;
  private readonly paperCanary: LiquidityHunterPaperCanary;
  private readonly contextProvider: LiquidityHunterShadowContextProvider;
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  private running = false;
  private evaluations = 0;
  private captures = 0;
  private failures = 0;
  private lastRunAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;

  constructor(options: LiquidityHunterShadowEvaluationSchedulerOptions) {
    this.enabled = options.enabled;
    this.symbols = normalizeSymbols(options.symbols);
    this.intervalMs = Math.max(10_000, Math.min(10 * 60_000, Math.floor(options.intervalMs ?? 30_000)));
    this.maxConcurrency = Math.max(1, Math.min(4, Math.floor(options.maxConcurrency ?? 2)));
    this.engine = options.engine;
    this.paperCanary = options.paperCanary;
    this.contextProvider = options.contextProvider;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (!this.enabled || !this.symbols.length || this.stopping || this.running || this.timer) return;
    this.stopping = false;
    void this.runOnce();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  snapshot(): LiquidityHunterShadowEvaluationSchedulerSnapshot {
    return {
      enabled: this.enabled,
      running: this.running,
      executionDependency: false,
      orderSubmissionAllowed: false,
      symbols: [...this.symbols],
      intervalMs: this.intervalMs,
      evaluations: this.evaluations,
      captures: this.captures,
      failures: this.failures,
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
    };
  }

  async runOnce(): Promise<void> {
    if (!this.enabled || !this.symbols.length || this.running || this.stopping) return;
    this.running = true;
    this.lastRunAt = this.now();
    const errors: string[] = [];
    let next = 0;
    const workers = Array.from({ length: Math.min(this.maxConcurrency, this.symbols.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= this.symbols.length) return;
        const symbol = this.symbols[index];
        try {
          const context = await this.contextProvider(symbol);
          const evaluation = await this.engine.evaluate({
            symbol,
            smartMoneyContext: context.smartMoneyContext ?? undefined,
            currentPrice: context.currentPrice ?? null,
          });
          this.evaluations += 1;
          const price = context.currentPrice;
          if (price !== null && price !== undefined && Number.isFinite(price) && price > 0) {
            const alreadyTracked = this.paperCanary.hasSetup(evaluation.setupId);
            const record = this.paperCanary.capture(evaluation, price, this.now());
            if (record && !alreadyTracked) this.captures += 1;
          }
        } catch (error) {
          this.failures += 1;
          errors.push(`${symbol}:${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });
    await Promise.all(workers);
    this.lastError = errors.length ? errors.join('|') : null;
    if (!errors.length) this.lastSuccessAt = this.now();
    this.running = false;
    this.schedule();
  }

  private schedule(): void {
    if (this.stopping || !this.enabled || !this.symbols.length) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runOnce();
    }, this.intervalMs);
    this.timer.unref?.();
  }
}
