import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Network, Play, ShieldCheck, UsersRound, WalletCards, X } from 'lucide-react';
import type { SymbolTicker, TradeDirection } from '../../types';
import { apiMutate } from '../../services/apiMutate';
import type { BacktestInterval, BacktestStrategyPreset } from './backtestingTypes';
import { useDialogA11y } from '../../lib/useDialogA11y';

interface MultiStrategyReport {
  version: 'multi_strategy_research_v2';
  jobs: Array<{ id: string; strategyId: string; symbol: string; interval: string; direction: 'LONG' | 'SHORT'; status: string; utility: number | null; error: string | null; metrics: { totalPnlPct: number; maxDrawdownPct: number; profitFactor: number | null; tradeCount: number; requestedBars: number; candlesUsed: number; dataSource: string; dataState: string; historyComplete: boolean } | null }>;
  ranking: Array<{ id: string; utility: number; rank: number }>;
  paperPortfolio: Array<{ id: string; strategyId: string; symbol: string; direction: 'LONG' | 'SHORT'; weight: number }>;
  conflicts: Array<{ symbol: string; longJobs: string[]; shortJobs: string[] }>;
  runtime: { jobs: number; completed: number; failed: number; cancelled: number; concurrency: number; elapsedMs: number };
  researchOnly: true;
  executionAuthorized: false;
  automaticOrderSubmission: false;
}

interface MultiAgentCouncilReport {
  version: 'multi_agent_research_council_v2';
  consensus: Array<{ id: string; strategyId: string; symbol: string; direction: 'LONG' | 'SHORT'; consensusScore: number; supports: number; cautions: number; vetoes: number; approvedForPaperPlan: boolean; reasons: string[] }>;
  paperTradePlan: Array<{ id: string; strategyId: string; symbol: string; direction: 'LONG' | 'SHORT'; consensusScore: number; allocationWeight: number; notionalBudgetUsd: number; maxLossBudgetUsd: number; riskPctOfCapital: number; orderSubmissionAllowed: false; requiresManualConfirmation: true }>;
  portfolio: { capitalUsd: number; configuredRiskPct: number; riskBudgetUsd: number; allocatedRiskUsd: number; allocatedNotionalUsd: number; allocatedWeight: number; cashReserveWeight: number; longWeight: number; shortWeight: number; maxSymbolWeight: number; maxDirectionalWeight: number; maxSlots: number };
  council: { agents: string[]; quorum: number; approvedJobs: number; vetoedJobs: number };
  safety: { researchOnly: true; paperOnly: true; authoritative: false; executionAuthorized: false; automaticOrderSubmission: false; autonomousLiveExecutionEnabled: false; riskGovernorBypassAllowed: false; manualConfirmationRequired: true };
  paperTradePlanFingerprint: string;
  deterministicFingerprint: string;
}

interface PaperSizingReport {
  positions: Array<{ id: string; symbol: string; direction: 'LONG' | 'SHORT'; quantity: number; notionalUsedUsd: number; maxLossUsedUsd: number; limitingConstraint: 'NOTIONAL' | 'RISK' }>;
  rejected: Array<{ id: string; reason: string }>;
  totals: { positions: number; notionalUsedUsd: number; maxLossUsedUsd: number };
  deterministicFingerprint: string;
}

function preferredDirection(strategy: BacktestStrategyPreset, requested: TradeDirection): TradeDirection {
  return strategy.allowedDirections.includes(requested) ? requested : strategy.allowedDirections[0];
}

function preferredInterval(strategy: BacktestStrategyPreset, requested: BacktestInterval): BacktestInterval {
  return strategy.supportedIntervals.includes(requested) ? requested : (strategy.supportedIntervals[0] ?? requested);
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function MultiStrategyResearchPanel({
  strategies,
  markets,
  initialStrategyId,
  initialSymbol,
  interval,
  direction,
  bars,
  maxHoldBars,
  transactionCostPct,
  onClose,
}: {
  strategies: BacktestStrategyPreset[];
  markets: SymbolTicker[];
  initialStrategyId: string;
  initialSymbol: string;
  interval: BacktestInterval;
  direction: TradeDirection;
  bars: number;
  maxHoldBars: number;
  transactionCostPct: number;
  onClose: () => void;
}) {
  const executable = useMemo(() => strategies.filter((row) => !row.disabled), [strategies]);
  const marketSymbols = useMemo(() => [...new Set([initialSymbol, ...markets.map((row) => row.symbol)])].filter(Boolean).slice(0, 20), [initialSymbol, markets]);
  const defaultStrategies = useMemo(() => {
    const ordered = [initialStrategyId, ...executable.map((row) => row.id)];
    return new Set([...new Set(ordered)].slice(0, Math.min(3, executable.length)));
  }, [executable, initialStrategyId]);
  const defaultMarkets = useMemo(() => new Set(marketSymbols.slice(0, Math.min(2, marketSymbols.length))), [marketSymbols]);
  const [strategyIds, setStrategyIds] = useState(defaultStrategies);
  const [symbols, setSymbols] = useState(defaultMarkets);
  const [concurrency, setConcurrency] = useState(3);
  const [maxPortfolioSlots, setMaxPortfolioSlots] = useState(4);
  const [paperCapitalUsd, setPaperCapitalUsd] = useState(100_000);
  const [portfolioRiskPct, setPortfolioRiskPct] = useState(1);
  const [maxDirectionalWeightPct, setMaxDirectionalWeightPct] = useState(70);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MultiStrategyReport | null>(null);
  const [multiAgent, setMultiAgent] = useState<MultiAgentCouncilReport | null>(null);
  const [paperSizingInputs, setPaperSizingInputs] = useState<Record<string, { entry: string; stop: string }>>({});
  const [paperSizingReport, setPaperSizingReport] = useState<PaperSizingReport | null>(null);
  const [paperSizingError, setPaperSizingError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const requestClose = useCallback(() => { if (!running) onClose(); }, [onClose, running]);
  const dialogRef = useDialogA11y<HTMLElement>({ isOpen: true, onClose: requestClose, initialFocusRef: closeButtonRef });

  const jobs = useMemo(() => {
    const selectedStrategies = executable.filter((row) => strategyIds.has(row.id));
    const selectedSymbols = marketSymbols.filter((row) => symbols.has(row));
    return selectedStrategies.flatMap((strategy) => selectedSymbols.map((symbol, index) => ({
      id: `${strategy.id}:${symbol}:${index}`,
      strategyId: strategy.id,
      symbol,
      interval: preferredInterval(strategy, interval),
      direction: preferredDirection(strategy, direction),
      requestedBars: bars,
      maxHoldBars,
      transactionCostPct,
    })));
  }, [bars, direction, executable, interval, marketSymbols, maxHoldBars, strategyIds, symbols, transactionCostPct]);

  const toggleStrategy = (id: string) => {
    setStrategyIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };
  const toggleSymbol = (symbol: string) => {
    setSymbols((current) => {
      const next = new Set(current);
      if (next.has(symbol)) next.delete(symbol);
      else if (next.size < 4) next.add(symbol);
      return next;
    });
  };

  async function runMatrix() {
    if (!jobs.length || jobs.length > 16) {
      setError('Select a matrix between 1 and 16 jobs.');
      return;
    }
    setRunning(true);
    setError(null);
    setMultiAgent(null);
    setPaperSizingReport(null);
    setPaperSizingError(null);
    try {
      const response = await apiMutate('/api/strategies/multi-backtest', {
        body: JSON.stringify({
          jobs,
          concurrency,
          maxPortfolioSlots,
          timeoutMs: 45_000,
          paperCapitalUsd,
          portfolioRiskPct,
          maxSymbolWeight: 0.4,
          maxDirectionalWeight: maxDirectionalWeightPct / 100,
          agentMaxDrawdownPct: 20,
          agentMinProfitFactor: 1,
          agentMinTrades: 8,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { report?: MultiStrategyReport; multiAgent?: MultiAgentCouncilReport; message?: string; error?: string };
      if (!response.ok || !payload.report || !payload.multiAgent) throw new Error(payload.message || payload.error || `Multi-strategy research failed (${response.status}).`);
      setReport(payload.report);
      setMultiAgent(payload.multiAgent);
      setPaperSizingInputs(Object.fromEntries(payload.multiAgent.paperTradePlan.map((row) => [row.id, { entry: '', stop: '' }])));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Multi-strategy research failed.');
    } finally {
      setRunning(false);
    }
  }

  const jobById = useMemo(() => new Map(report?.jobs.map((row) => [row.id, row]) ?? []), [report]);

  async function sizePaperTrades() {
    if (!multiAgent?.paperTradePlan.length) return;
    setPaperSizingError(null);
    setPaperSizingReport(null);
    try {
      const entries = multiAgent.paperTradePlan.flatMap((row) => {
        const input = paperSizingInputs[row.id];
        const entryPrice = Number(input?.entry);
        const stopPrice = Number(input?.stop);
        return Number.isFinite(entryPrice) && entryPrice > 0 && Number.isFinite(stopPrice) && stopPrice > 0 ? [{ id: row.id, entryPrice, stopPrice }] : [];
      });
      const response = await apiMutate('/api/strategies/paper-multi-trade/size', {
        body: JSON.stringify({ sourceCouncilFingerprint: multiAgent.deterministicFingerprint, plans: multiAgent.paperTradePlan, entries }),
      });
      const payload = await response.json().catch(() => ({})) as { report?: PaperSizingReport; message?: string; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.message || payload.error || `Paper sizing failed (${response.status}).`);
      setPaperSizingReport(payload.report);
    } catch (failure) {
      setPaperSizingError(failure instanceof Error ? failure.message : 'Paper sizing failed.');
    }
  }

  return (
    <div className="apex-bt-multi-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} className="apex-bt-multi-dialog" role="dialog" aria-modal="true" aria-labelledby="apex-bt-multi-title">
        <header>
          <div><Network size={18} /><span><strong id="apex-bt-multi-title">Multi-Strategy + Multi-Agent Research</strong><small>Bounded multi-symbol backtests, deterministic agent council, and paper-risk budgeting</small></span></div>
          <button ref={closeButtonRef} type="button" aria-label="Close multi-strategy research" onClick={requestClose} disabled={running}><X size={16} /></button>
        </header>
        <div className="apex-bt-multi-safety"><ShieldCheck size={15} /><span><strong>Research / paper only.</strong> Five deterministic agents may veto candidates, but cannot submit orders, enable autonomous live execution, or bypass Risk Governor and manual confirmation.</span></div>

        <div className="apex-bt-multi-config">
          <section>
            <h3>Strategies <em>{strategyIds.size}/4</em></h3>
            <div className="apex-bt-multi-choice-list">
              {executable.slice(0, 12).map((row) => <label key={row.id}><input type="checkbox" checked={strategyIds.has(row.id)} onChange={() => toggleStrategy(row.id)} /><span>{row.name}<small>{row.dataTier} · {row.allowedDirections.join('/')}</small></span></label>)}
            </div>
          </section>
          <section>
            <h3>Markets <em>{symbols.size}/4</em></h3>
            <div className="apex-bt-multi-market-grid">
              {marketSymbols.slice(0, 12).map((market) => <label key={market}><input type="checkbox" checked={symbols.has(market)} onChange={() => toggleSymbol(market)} /><span>{market}</span></label>)}
            </div>
            <div className="apex-bt-multi-numeric">
              <label><span>Concurrency</span><input aria-label="Multi-strategy concurrency" type="number" min={1} max={4} value={concurrency} onChange={(event) => setConcurrency(Math.max(1, Math.min(4, Number(event.target.value) || 1)))} /></label>
              <label><span>Paper slots</span><input aria-label="Maximum paper portfolio slots" type="number" min={1} max={8} value={maxPortfolioSlots} onChange={(event) => setMaxPortfolioSlots(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /></label>
              <label><span>Paper capital</span><input aria-label="Paper capital in US dollars" type="number" min={100} max={1_000_000_000} step={1000} value={paperCapitalUsd} onChange={(event) => setPaperCapitalUsd(Math.max(100, Math.min(1_000_000_000, Number(event.target.value) || 100)))} /></label>
              <label><span>Total risk %</span><input aria-label="Total paper portfolio risk percent" type="number" min={0.05} max={10} step={0.05} value={portfolioRiskPct} onChange={(event) => setPortfolioRiskPct(Math.max(0.05, Math.min(10, Number(event.target.value) || 0.05)))} /></label>
              <label className="wide"><span>Max one-side exposure %</span><input aria-label="Maximum directional portfolio weight percent" type="number" min={10} max={100} step={5} value={maxDirectionalWeightPct} onChange={(event) => setMaxDirectionalWeightPct(Math.max(10, Math.min(100, Number(event.target.value) || 10)))} /></label>
            </div>
            <dl className="apex-bt-multi-summary"><div><dt>Jobs</dt><dd>{jobs.length}</dd></div><div><dt>Bars/job</dt><dd>{bars.toLocaleString()}</dd></div><div><dt>Paper capital</dt><dd>{money(paperCapitalUsd)}</dd></div><div><dt>Risk budget</dt><dd>{money(paperCapitalUsd * portfolioRiskPct / 100)}</dd></div></dl>
            <button type="button" className="apex-bt-multi-run" onClick={() => void runMatrix()} disabled={running || jobs.length < 1 || jobs.length > 16}><Play size={15} />{running ? 'Running matrix + council…' : `Run ${jobs.length} research jobs`}</button>
            {jobs.length > 16 && <p className="apex-bt-multi-error"><AlertTriangle size={13} />Reduce selections to 16 jobs or fewer.</p>}
            {error && <p className="apex-bt-multi-error"><AlertTriangle size={13} />{error}</p>}
          </section>
        </div>

        {report && <section className="apex-bt-multi-results" aria-live="polite">
          <header><div><strong>Research result</strong><small>{report.runtime.completed}/{report.runtime.jobs} completed · {report.runtime.elapsedMs.toFixed(0)} ms orchestration time</small></div><span>EXECUTION DISABLED</span></header>
          <div className="apex-bt-multi-results-grid">
            <section><h3>Ranking</h3><ol>{report.ranking.slice(0, 10).map((rank) => { const row = jobById.get(rank.id); return <li key={rank.id}><b>#{rank.rank}</b><span>{row?.strategyId}<small>{row?.symbol} · {row?.direction}{row?.metrics ? ` · ${row.metrics.candlesUsed}/${row.metrics.requestedBars} bars · ${row.metrics.dataSource}` : ''}</small></span><strong>{rank.utility.toFixed(3)}</strong></li>; })}</ol></section>
            <section><h3>Research portfolio</h3>{report.paperPortfolio.length ? <ol>{report.paperPortfolio.map((row) => <li key={row.id}><span>{row.symbol}<small>{row.strategyId} · {row.direction}</small></span><strong>{(row.weight * 100).toFixed(1)}%</strong></li>)}</ol> : <p>No positive-utility research slots were selected.</p>}</section>
            <section><h3>Conflicts</h3>{report.conflicts.length ? <ul>{report.conflicts.map((row) => <li key={row.symbol}><AlertTriangle size={12} /><span>{row.symbol}<small>{row.longJobs.length} long / {row.shortJobs.length} short jobs</small></span></li>)}</ul> : <p>No same-symbol long/short conflict in completed jobs.</p>}</section>
          </div>
        </section>}

        {multiAgent && <section className="apex-bt-agent-results" aria-live="polite">
          <header>
            <div><UsersRound size={16} /><span><strong>Deterministic Agent Council</strong><small>{multiAgent.council.agents.length} agents · quorum {multiAgent.council.quorum} · {multiAgent.council.vetoedJobs} vetoed</small></span></div>
            <b>{multiAgent.council.approvedJobs} PAPER CANDIDATE{multiAgent.council.approvedJobs === 1 ? '' : 'S'}</b>
          </header>
          <div className="apex-bt-agent-summary">
            <div><Bot size={15} /><span><small>Agents</small><strong>{multiAgent.council.agents.join(' · ')}</strong></span></div>
            <div><WalletCards size={15} /><span><small>Allocated notional</small><strong>{money(multiAgent.portfolio.allocatedNotionalUsd)}</strong></span></div>
            <div><ShieldCheck size={15} /><span><small>Max-loss budget</small><strong>{money(multiAgent.portfolio.allocatedRiskUsd)} / {money(multiAgent.portfolio.riskBudgetUsd)}</strong></span></div>
            <div><Network size={15} /><span><small>Exposure / reserve</small><strong>L {(multiAgent.portfolio.longWeight * 100).toFixed(0)}% · S {(multiAgent.portfolio.shortWeight * 100).toFixed(0)}% · Cash {(multiAgent.portfolio.cashReserveWeight * 100).toFixed(0)}%</strong></span></div>
          </div>
          <div className="apex-bt-agent-grid">
            <section>
              <h3>Consensus</h3>
              <ol>{multiAgent.consensus.slice(0, 10).map((row) => <li key={row.id} className={row.vetoes ? 'vetoed' : row.approvedForPaperPlan ? 'approved' : ''}><span><strong>{row.symbol} · {row.direction}</strong><small>{row.strategyId}</small></span><em>{(row.consensusScore * 100).toFixed(0)}</em><b>{row.vetoes ? `VETO ×${row.vetoes}` : row.approvedForPaperPlan ? 'APPROVED' : 'WATCH'}</b></li>)}</ol>
            </section>
            <section>
              <h3>Multi-trade paper budget</h3>
              {multiAgent.paperTradePlan.length ? <ol>{multiAgent.paperTradePlan.map((row) => <li key={row.id}><span><strong>{row.symbol} · {row.direction}</strong><small>{row.strategyId} · manual confirmation required</small></span><em>{(row.allocationWeight * 100).toFixed(1)}%</em><b>{money(row.notionalBudgetUsd)}<small>risk {money(row.maxLossBudgetUsd)}</small></b></li>)}</ol> : <p>No candidate survived the council veto and portfolio constraints.</p>}
            </section>
          </div>
          {multiAgent.paperTradePlan.length > 0 && <section className="apex-bt-paper-sizing">
            <header><span><strong>Paper Position Sizer</strong><small>Explicit entry + stop required; quantity is capped by notional and max-loss budgets.</small></span><b>NO EXCHANGE CLIENT</b></header>
            <div className="apex-bt-paper-sizing-grid">
              {multiAgent.paperTradePlan.map((row) => {
                const input = paperSizingInputs[row.id] ?? { entry: '', stop: '' };
                const sized = paperSizingReport?.positions.find((item) => item.id === row.id);
                const rejected = paperSizingReport?.rejected.find((item) => item.id === row.id);
                return <div className="apex-bt-paper-sizing-row" key={row.id}>
                  <span><strong>{row.symbol} · {row.direction}</strong><small>{money(row.notionalBudgetUsd)} notional · {money(row.maxLossBudgetUsd)} max loss</small></span>
                  <label><small>Entry</small><input aria-label={`${row.symbol} paper entry price`} inputMode="decimal" value={input.entry} onChange={(event) => setPaperSizingInputs((current) => ({ ...current, [row.id]: { ...input, entry: event.target.value } }))} placeholder="0.00" /></label>
                  <label><small>Stop</small><input aria-label={`${row.symbol} paper stop price`} inputMode="decimal" value={input.stop} onChange={(event) => setPaperSizingInputs((current) => ({ ...current, [row.id]: { ...input, stop: event.target.value } }))} placeholder="0.00" /></label>
                  <em>{sized ? `${sized.quantity.toLocaleString(undefined, { maximumFractionDigits: 8 })} qty` : rejected ? rejected.reason.replaceAll('_', ' ') : 'Awaiting prices'}</em>
                  {sized && <b>{money(sized.notionalUsedUsd)}<small>{sized.limitingConstraint.toLowerCase()} cap · risk {money(sized.maxLossUsedUsd)}</small></b>}
                </div>;
              })}
            </div>
            <button type="button" className="apex-bt-paper-size-button" onClick={() => void sizePaperTrades()}><WalletCards size={14} />Calculate paper quantities</button>
            {paperSizingReport && <p className="apex-bt-paper-size-summary">Sized {paperSizingReport.totals.positions} position{paperSizingReport.totals.positions === 1 ? '' : 's'} · {money(paperSizingReport.totals.notionalUsedUsd)} notional · {money(paperSizingReport.totals.maxLossUsedUsd)} modeled max loss.</p>}
            {paperSizingError && <p className="apex-bt-multi-error"><AlertTriangle size={13} />{paperSizingError}</p>}
          </section>}
          <footer><ShieldCheck size={13} /><span>Paper sizing only. No exchange order, leverage, or protection order is created here. Final routing still requires verified market context, Risk Governor approval, protection planning, and explicit manual confirmation.</span></footer>
        </section>}
      </section>
    </div>
  );
}
