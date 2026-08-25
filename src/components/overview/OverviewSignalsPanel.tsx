import React from 'react';
import { Radar } from 'lucide-react';
import type { CandidateScore, DataState } from '../../types';
import { CoinIcon } from '../CoinIcon';
import { buildSignalFunnel, type ScanMeta } from './overviewModel';

function evidenceLine(candidate: CandidateScore): string {
  if (!candidate.guardPass) return candidate.guardReasons[0] ?? 'Rejected by scanner guards';
  if (candidate.dataState !== 'live') return `Inputs ${candidate.dataState.replace(/_/g, ' ')}`;
  return candidate.readinessTier;
}

export function OverviewSignalsPanel({
  candidates,
  marketState,
  loading,
  scanMeta,
  onOpenSymbol,
  onNavigateStrategies,
}: {
  candidates: CandidateScore[];
  marketState: DataState;
  loading: boolean;
  scanMeta: ScanMeta | null;
  onOpenSymbol: (symbol: string) => void;
  onNavigateStrategies: () => void;
}) {
  const funnel = buildSignalFunnel(candidates, scanMeta);
  const top = funnel.highest;
  const confidence = top?.canonicalDecision?.calibratedProbability ?? (top ? top.score / 100 : null);

  return (
    <section className="apex-overview-signals apex-panel" aria-labelledby="overview-signals-title">
      <header className="apex-overview-section-head">
        <span className="apex-overview-section-num">3</span>
        <h2 id="overview-signals-title">Signal / Opportunity Summary</h2>
        <button type="button" className="apex-overview-head-link" onClick={onNavigateStrategies}>View scanner</button>
      </header>

      <div className="apex-overview-funnel">
        <div><span>Evaluated</span><strong>{funnel.evaluated}</strong></div>
        <div><span>Qualified</span><strong>{funnel.qualified}</strong></div>
        <div><span>Confirmed</span><strong className="tone-ok">{funnel.confirmed}</strong></div>
        <div><span>Rejected</span><strong className="tone-warn">{funnel.rejected}</strong></div>
      </div>

      <div className="apex-overview-signal-highlight">
        <div>
          <span>Current Candidates</span>
          <strong>{funnel.qualified}</strong>
        </div>
        {top ? (
          <div className="apex-overview-signal-top">
            <span>Highest Confidence</span>
            <button type="button" onClick={() => onOpenSymbol(top.symbol)}>
              <CoinIcon symbol={top.symbol} size={18} />
              <strong>{top.symbol} {top.direction}</strong>
              <em>{confidence == null ? `${Math.round(top.score)} score` : confidence.toFixed(2)}</em>
              <b>VIEW</b>
            </button>
          </div>
        ) : (
          <div className="apex-overview-calm-compact"><Radar size={14} /><strong>{loading ? 'Scanning the market universe…' : marketState !== 'live' ? `Market data ${marketState.replace(/_/g, ' ')}` : 'No ranked candidates'}</strong></div>
        )}
      </div>

      <div className="apex-overview-rejection-block">
        <span>Top Rejection Reason</span>
        <p className="apex-overview-rejection" title={funnel.topRejection ?? undefined}>{funnel.topRejection ?? '—'}</p>
      </div>
    </section>
  );
}
