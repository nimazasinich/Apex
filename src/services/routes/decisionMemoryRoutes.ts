import type { Application } from 'express';
import type { DecisionMemoryMirror } from '../decisionMemoryMirror';
import { buildDecisionMemoryExportPayload } from '../../utils/decisionMemoryExport';

/** Register the unchanged Decision Memory HTTP surface against an injected mirror. */
export function registerDecisionMemoryRoutes(
  app: Application,
  decisionMemoryMirror: DecisionMemoryMirror | null,
): void {
  app.post('/api/decision-memory/batch', (req, res) => {
    if (!decisionMemoryMirror) {
      return res.status(503).json({ ok: false, error: 'mirror_disabled' });
    }
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length > 500) {
      return res.status(413).json({ ok: false, error: 'batch_too_large', maxRows: 500 });
    }
    try {
      const result = decisionMemoryMirror.putMany(rows);
      return res.json({ ok: true, ...result, persistence: decisionMemoryMirror.persistenceStatus() });
    } catch (error) {
      console.error('[decision-memory] API batch persistence failed', error instanceof Error ? error.message : 'unknown_error');
      return res.status(507).json({
        ok: false,
        error: 'decision_memory_persist_failed',
        retryable: true,
        persistence: decisionMemoryMirror.persistenceStatus(),
      });
    }
  });

  app.get('/api/decision-memory', (req, res) => {
    if (!decisionMemoryMirror) {
      return res.status(503).json({ ok: false, error: 'mirror_disabled' });
    }
    const parseNumber = (value: unknown): number | undefined => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const result = decisionMemoryMirror.query({
      limit: parseNumber(req.query.limit),
      ticker: typeof req.query.ticker === 'string' ? req.query.ticker : undefined,
      decision: typeof req.query.decision === 'string' ? req.query.decision as never : undefined,
      reasonCode: typeof req.query.reasonCode === 'string' ? req.query.reasonCode as never : undefined,
      laterOutcome: typeof req.query.laterOutcome === 'string' ? req.query.laterOutcome as never : undefined,
      since: parseNumber(req.query.since),
      until: parseNumber(req.query.until),
    });
    return res.json({ ok: true, rows: result, stats: decisionMemoryMirror.stats() });
  });

  app.get('/api/decision-memory/status', (_req, res) => {
    return res.json({
      ok: true,
      enabled: Boolean(decisionMemoryMirror),
      stats: decisionMemoryMirror?.stats() ?? null,
      persistence: decisionMemoryMirror?.persistenceStatus() ?? null,
    });
  });

  app.get('/api/decision-memory/export', (_req, res) => {
    if (!decisionMemoryMirror) {
      return res.status(503).json({ ok: false, error: 'mirror_disabled' });
    }
    const rows = decisionMemoryMirror.exportAll();
    return res.json({
      ok: true,
      ...buildDecisionMemoryExportPayload(rows, 'APEX DecisionMemoryMirror server export'),
      stats: decisionMemoryMirror.stats(),
    });
  });
}
