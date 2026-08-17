import React, { useEffect, useState } from 'react';
import { Radar, X } from 'lucide-react';

interface Props { onClose: () => void }

type SetupSnapshot = { setupId?: string | null; state?: string; transitions?: Array<{ nextState?: string }> };
type ReplayDataset = { manifest?: { datasetId?: string; eventCount?: number; checksumSha256?: string; startAt?: number; endAt?: number } };

function formatReplayDate(value?: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toLocaleString() : 'Not recorded';
}

export function LiquidityHunterReplayPanel({ onClose }: Props) {
  const [state, setState] = useState<{ setups: SetupSnapshot[]; datasets: ReplayDataset[]; error: string | null }>({ setups: [], datasets: [], error: null });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/liquidity-hunter/setups').then(async (response) => ({ response, payload: await response.json().catch(() => ({})) })),
      fetch('/api/liquidity-hunter/replay-datasets').then(async (response) => ({ response, payload: await response.json().catch(() => ({})) })),
    ]).then(([setups, datasets]) => {
      if (cancelled) return;
      if (!setups.response.ok || !datasets.response.ok) throw new Error('Liquidity Hunter replay evidence is unavailable.');
      setState({ setups: Array.isArray(setups.payload.setups) ? setups.payload.setups as SetupSnapshot[] : [], datasets: Array.isArray(datasets.payload.datasets) ? datasets.payload.datasets as ReplayDataset[] : [], error: null });
    }).catch((error) => { if (!cancelled) setState({ setups: [], datasets: [], error: error instanceof Error ? error.message : 'Replay evidence unavailable.' }); });
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="apex-lh-replay-backdrop" role="presentation">
      <section className="apex-lh-replay-panel" role="dialog" aria-modal="true" aria-label="Liquidity Hunter replay evidence">
        <header><div><Radar size={16} /><span><strong>Liquidity Hunter Replay Evidence</strong><small>Durable setup transitions and recorded event manifests</small></span></div><button type="button" onClick={onClose} aria-label="Close Liquidity Hunter replay evidence"><X size={16} /></button></header>
        {state.error ? <p className="error">{state.error}</p> : <>
          <article><h3>Setups</h3>{state.setups.length ? <div className="apex-lh-replay-list">{state.setups.map((setup, index) => {
            const transitions = Array.isArray(setup.transitions) ? setup.transitions : [];
            const latestStates = transitions.slice(-2).map((transition) => transition.nextState || 'UNKNOWN').join(' → ');
            return <article key={setup.setupId ?? index}><header><strong>{setup.setupId || 'Setup ID unavailable'}</strong><span>{setup.state?.replaceAll('_', ' ') || 'UNKNOWN'}</span></header><dl><div><dt>Transitions</dt><dd>{transitions.length} recorded</dd></div><div><dt>Latest</dt><dd>{latestStates || 'No transition recorded'}</dd></div></dl></article>;
          })}</div> : <p>No durable setups are recorded.</p>}</article>
          <article><h3>Replay datasets</h3>{state.datasets.length ? <div className="apex-lh-replay-list">{state.datasets.map((dataset, index) => {
            const manifest = dataset.manifest;
            return <article key={manifest?.datasetId ?? index}><header><strong>{manifest?.datasetId || 'Dataset ID unavailable'}</strong><span>{manifest?.eventCount ?? 0} events</span></header><dl><div><dt>Checksum</dt><dd>{manifest?.checksumSha256?.slice(0, 12) || 'Not recorded'}</dd></div><div><dt>Time range</dt><dd>{manifest?.startAt || manifest?.endAt ? `${formatReplayDate(manifest?.startAt)} – ${formatReplayDate(manifest?.endAt)}` : 'Not recorded'}</dd></div></dl></article>;
          })}</div> : <p>Realtime event recording is disabled or no dataset exists.</p>}</article>
        </>}
        <footer>Research only · no order authority.</footer>
      </section>
    </div>
  );
}
