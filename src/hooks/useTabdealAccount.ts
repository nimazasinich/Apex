import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildWorkspaceInsights, type WorkspaceInsights } from '../services/workspaceInsights';
import { getTabdealConnection, getTabdealSnapshot, type TabdealConnectionState } from '../services/tabdealConnectionClient';
import type { AccountSnapshot } from '../services/accountTypes';

const DISCONNECTED: TabdealConnectionState = {
  connected: false, apiKeyHint: null, createdAt: null, expiresAt: null, executionStage: 'READ_ONLY', status: 'DISCONNECTED',
  signal: { credentialsPresent: false, lastPublicPingOk: null, lastAccountReadOk: null },
  safety: { readOnly: true, automaticVenueFailoverEnabled: false, autonomousLiveExecutionEnabled: false },
};

export interface TabdealAccountViewState {
  connection: TabdealConnectionState;
  snapshot: AccountSnapshot | null;
  insights: WorkspaceInsights | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  refresh: () => Promise<void>;
}

export function useTabdealAccount(symbol?: string): TabdealAccountViewState {
  const [connection, setConnection] = useState<TabdealConnectionState>(DISCONNECTED);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const state = await getTabdealConnection();
      setConnection(state.connection);
      if (!state.connection.connected) {
        setSnapshot(null); setError(null); setStale(false); return;
      }
      try {
        const next = await getTabdealSnapshot(symbol);
        setConnection(next.connection);
        if (!next.snapshot) throw new Error('tabdeal_snapshot_missing');
        setSnapshot(next.snapshot);
        setError(null);
        setStale(false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'tabdeal_snapshot_failed');
        setSnapshot((current) => { if (current) setStale(true); return current; });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'tabdeal_connection_failed');
      setSnapshot((current) => { if (current) setStale(true); return current; });
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { void refresh(); }, [refresh]);
  const insights = useMemo(() => snapshot ? buildWorkspaceInsights(snapshot) : null, [snapshot]);
  return { connection, snapshot, insights, loading, error, stale, refresh };
}
