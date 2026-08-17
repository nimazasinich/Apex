import React from 'react';
import type { WorkspacePage } from '../workspace/WorkspaceShell';

function Block({ className = '' }: { className?: string }) {
  return <span className={`apex-skeleton-block ${className}`} aria-hidden="true" />;
}

export function RouteSkeleton({ page }: { page: WorkspacePage }) {
  if (page === 'trading') {
    return <div className="apex-route-skeleton trading" role="status" aria-live="polite" aria-label="Loading Trading workspace">
      <Block className="strip" /><Block className="facts" />
      <div className="primary"><Block className="chart" /><div><Block className="depth" /><Block className="ticket" /></div></div>
      <Block className="activity" />
    </div>;
  }
  if (page === 'backtesting') {
    return <div className="apex-route-skeleton backtesting" role="status" aria-live="polite" aria-label="Loading Backtesting workspace">
      <Block className="builder" /><div><Block className="header" /><Block className="metrics" /><Block className="chart" /><Block className="evidence" /></div>
    </div>;
  }
  if (page === 'strategies') {
    return <div className="apex-route-skeleton strategies" role="status" aria-live="polite" aria-label="Loading Strategy Studio">
      <Block className="library" /><Block className="model" /><Block className="evidence" />
    </div>;
  }
  return <div className="apex-route-skeleton generic" role="status" aria-live="polite" aria-label={`Loading ${page} workspace`}><Block className="header" /><Block className="body" /></div>;
}
