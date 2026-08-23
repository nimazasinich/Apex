import { useCallback, useEffect, useState } from 'react';
import {
  fetchOperationsDiagnostics,
  mergeOperationsDiagnostics,
  type OperationsDiagnosticsSnapshot,
} from '../services/operationsDiagnostics';

const POLL_MS = 45_000;

export function useOverviewDiagnostics(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<OperationsDiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const incoming = await fetchOperationsDiagnostics(signal);
      if (signal?.aborted) return;
      setSnapshot((prev) => mergeOperationsDiagnostics(prev, incoming));
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'diagnostics_failed');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(controller.signal), POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);

  return { snapshot, loading, error, refresh };
}
