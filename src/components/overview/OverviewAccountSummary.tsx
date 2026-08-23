import React from 'react';
import type { AccountSnapshot, ConnectionState } from '../../services/accountClient';
import type { WorkspaceInsights } from '../../services/workspaceInsights';
import { numberFrom, rows } from '../workspace/AccountViews';
import { dailyPnlFromInsights, openRiskUsd } from './overviewModel';

function money(value: number | null): string {
  return value == null ? '—' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`;
}

function signedMoney(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`;
}

function signedClass(value: number | null): string {
  return value == null || value === 0 ? '' : value > 0 ? 'positive' : 'negative';
}

export function OverviewAccountSummary({
  connection,
  snapshot,
  insights,
  onNavigate,
}: {
  connection: ConnectionState;
  snapshot: AccountSnapshot | null;
  insights: WorkspaceInsights | null;
  onNavigate: (page: 'portfolio' | 'positions' | 'orders') => void;
}) {
  const connected = connection.mode === 'demo' || connection.status === 'connected';
  const account = insights?.account ?? null;
  const equity = account ? account.equityUsd : connected ? numberFrom(snapshot?.account, 'accountEquity', 'equity') : null;
  const available = account ? account.availableBalanceUsd : connected ? numberFrom(snapshot?.account, 'availableBalance', 'availableMargin') : null;
  const unrealized = account ? account.unrealizedPnlUsd : connected ? numberFrom(snapshot?.account, 'unrealizedPnl', 'unrealisedPnl') : null;
  const positionCount = insights ? insights.positions.length : connected ? rows(snapshot, 'positions').filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true).length : null;
  const orderCount = insights ? insights.orders.length : connected ? rows(snapshot, 'openOrders').length : null;
  const buyingPower = account ? account.buyingPowerUsd : null;
  const marginRatio = account ? account.marginRatioPct : null;
  const grossExposure = insights ? insights.positions.reduce((sum, position) => sum + Math.abs(position.valueUsd), 0) : null;
  const exposurePct = grossExposure != null && equity && equity > 0 ? (grossExposure / equity) * 100 : null;
  const daily = dailyPnlFromInsights(insights);
  const risk = openRiskUsd(insights);
  const riskPct = risk != null && equity && equity > 0 ? (risk / equity) * 100 : null;
  const unrealizedPct = unrealized != null && equity && equity > 0 ? (unrealized / equity) * 100 : null;

  const rowsData = [
    [
      { label: 'Account Equity', value: money(equity), cls: '', page: 'portfolio' as const },
      { label: 'Available Balance', value: money(available), cls: '', page: 'portfolio' as const },
      { label: 'Daily PnL', value: daily.usd == null ? '—' : signedMoney(daily.usd), sub: daily.pct == null ? null : `${daily.pct >= 0 ? '+' : ''}${daily.pct.toFixed(2)}%`, cls: signedClass(daily.usd), page: 'portfolio' as const },
    ],
    [
      { label: 'Open Positions', value: positionCount == null ? '—' : String(positionCount), sub: unrealizedPct == null ? null : `${unrealizedPct >= 0 ? '+' : ''}${unrealizedPct.toFixed(2)}% unrealized`, cls: '', page: 'positions' as const },
      { label: 'Open Orders', value: orderCount == null ? '—' : String(orderCount), sub: null, cls: '', page: 'orders' as const },
      { label: 'Current Exposure', value: money(grossExposure), sub: exposurePct == null ? null : `${exposurePct.toFixed(2)}%`, cls: '', page: 'positions' as const },
    ],
    [
      { label: 'Open Risk', value: money(risk), sub: riskPct == null ? null : `${riskPct.toFixed(2)}%`, cls: '', page: 'portfolio' as const },
      { label: 'Buying Power', value: money(buyingPower), sub: null, cls: '', page: 'portfolio' as const },
      { label: 'Margin Utilization', value: marginRatio == null ? '—' : `${marginRatio.toFixed(2)}%`, sub: null, cls: '', page: 'portfolio' as const, bar: marginRatio },
    ],
  ];

  return (
    <section className="apex-overview-account apex-panel" aria-labelledby="overview-account-title">
      <header className="apex-overview-section-head">
        <span className="apex-overview-section-num">1</span>
        <h2 id="overview-account-title">Account / Portfolio Summary</h2>
      </header>
      <div className="apex-overview-account-rows">
        {rowsData.map((row, rowIndex) => (
          <div className="apex-overview-account-row" key={`row-${rowIndex}`}>
            {row.map((cell) => (
              <button type="button" key={cell.label} className="apex-overview-account-cell" onClick={() => onNavigate(cell.page)}>
                <span>{cell.label}</span>
                <strong className={cell.cls}>{cell.value}</strong>
                {cell.sub ? <small className={cell.cls}>{cell.sub}</small> : null}
                {'bar' in cell && cell.bar != null ? (
                  <div className="apex-overview-margin-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, cell.bar))}%` }} /></div>
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
