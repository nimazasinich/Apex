import React, { useEffect, useState } from 'react';
import { Activity, Layers3 } from 'lucide-react';
import type { CandidateScore, DerivedLevels, TradeDirection } from '../../types';
import type { TradePlan } from '../../services/tradePlan';
import { LevelLadderPanel } from './LevelLadderPanel';
import { ExecutionCorridorPanel } from './ExecutionCorridorPanel';
import './ExecutionIntelligence.css';

export interface ExecutionIntelligenceProps {
  direction: TradeDirection;
  levels: DerivedLevels | null;
  plan: TradePlan | null;
  candidate: CandidateScore | null;
  currentPrice?: number | null;
}

type Tab = 'levels' | 'corridor';

export function ExecutionIntelligence({ direction, levels, plan, candidate, currentPrice = null }: ExecutionIntelligenceProps) {
  const [tab, setTab] = useState<Tab>('levels');
  useEffect(() => setTab('levels'), [direction, plan?.id]);

  return <section className="apex-execution-intelligence" aria-label={`${direction} execution intelligence`}>
    <div className="apex-execution-tabs" role="tablist" aria-label="Execution intelligence views">
      <button type="button" role="tab" aria-selected={tab === 'levels'} className={tab === 'levels' ? 'active' : ''} onClick={() => setTab('levels')}><Layers3 size={13} /> Level ladder</button>
      <button type="button" role="tab" aria-selected={tab === 'corridor'} className={tab === 'corridor' ? 'active' : ''} onClick={() => setTab('corridor')}><Activity size={13} /> Execution corridor</button>
      <span>{direction}</span>
    </div>
    <div className="apex-execution-tab-body">
      {tab === 'levels'
        ? levels ? <LevelLadderPanel levels={levels} direction={direction} currentPrice={currentPrice} /> : <div className="apex-execution-empty"><Layers3 size={18} /><span><strong>No verified levels</strong><small>Level geometry is unavailable for this market.</small></span></div>
        : <ExecutionCorridorPanel plan={plan} candidate={candidate} currentPrice={currentPrice} />}
    </div>
  </section>;
}
