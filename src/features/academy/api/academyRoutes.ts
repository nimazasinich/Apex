import { createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { buildAcademyConsumerIntelligence } from './strategyIntelligence.ts';
import { findSimilarStrategies } from '../ml/similarityEngine.ts';
import { EVOLUTION_SUGGESTION_BASIS, EVOLUTION_SUGGESTION_METHOD_NOTE } from '../ml/evolutionEngine.ts';
import type { AcademyEngine } from '../engine/academyEngine.ts';
import type { StrategyKnowledgeBase } from '../knowledge/strategyKnowledgeBase.ts';
import type {
  AcademyConsumer,
  AcademyEvidenceKind,
  AcademyRegime,
  AcademySourceKind,
  DiscoveredAcademyStrategy,
} from '../types.ts';

import type { AcademyIntelligenceProvider } from '../services/academyIntelligenceProvider.ts';
import type { StrategyLabService } from '../lab/strategyLabService.ts';
import { STRATEGY_LAB_MAX_COMPARED, STRATEGY_LAB_MAX_FUSION_PARENTS } from '../lab/strategyLabService.ts';
import { STRATEGY_FUSION_METHODS, type StrategyFusionMethod } from '../lab/strategyLabTypes.ts';

export interface AcademySubsystem {
  engine: AcademyEngine;
  knowledgeBase: StrategyKnowledgeBase;
  provider?: AcademyIntelligenceProvider;
  /**
   * Research strategy lab, resolved lazily so the SQLite file is only opened
   * when a lab route is actually used. Absent on subsystems assembled without
   * a lab, in which case the lab routes answer 503 instead of pretending.
   */
  lab?: () => StrategyLabService;
}

const IMPORT_SOURCE_KINDS: AcademySourceKind[] = ['USER_CREATED', 'RESEARCH_MODULE', 'HISTORICAL_PATTERN', 'EXTERNAL_RESEARCH'];
const EVIDENCE_KINDS: AcademyEvidenceKind[] = ['DISCOVERY', 'BACKTEST', 'VALIDATION', 'PAPER_FORWARD', 'LIVE_OUTCOME', 'RESEARCH'];
const CONSUMERS: AcademyConsumer[] = ['SCANNER', 'TRADE_PLAN', 'RISK_GOVERNOR'];
const REGIMES: AcademyRegime[] = ['TRENDING', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'LIQUIDITY_EVENT', 'NEWS_DRIVEN'];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 100) : [];
}

function parseImportedStrategy(body: unknown, now = Date.now()): DiscoveredAcademyStrategy {
  if (!body || typeof body !== 'object') throw new Error('academy_import_body_required');
  const input = body as Record<string, unknown>;
  const strategyId = typeof input.strategyId === 'string' ? input.strategyId.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const version = Number(input.version);
  const sourceKind = input.sourceKind as AcademySourceKind;
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/i.test(strategyId)) throw new Error('academy_import_strategy_id_invalid');
  if (!name || name.length > 200) throw new Error('academy_import_name_invalid');
  if (!Number.isInteger(version) || version < 1 || version > 1_000_000) throw new Error('academy_import_version_invalid');
  if (!IMPORT_SOURCE_KINDS.includes(sourceKind)) throw new Error('academy_import_source_kind_invalid');
  const evidenceInput = Array.isArray(input.evidence) ? input.evidence : [];
  if (!evidenceInput.length) throw new Error('academy_import_evidence_required');

  const evidenceHistory = evidenceInput.slice(0, 100).map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`academy_import_evidence_invalid:${index}`);
    const item = entry as Record<string, unknown>;
    const source = typeof item.source === 'string' ? item.source.trim() : '';
    const kind = item.kind as AcademyEvidenceKind;
    const fingerprint = typeof item.fingerprint === 'string' ? item.fingerprint.trim() : '';
    if (!source || !EVIDENCE_KINDS.includes(kind) || !/^[a-f0-9]{16,128}$/i.test(fingerprint)) throw new Error(`academy_import_evidence_invalid:${index}`);
    const dataState: 'live' | 'degraded' | 'unavailable' | 'not_applicable' = item.dataState === 'live'
      || item.dataState === 'degraded'
      || item.dataState === 'unavailable'
      ? item.dataState
      : 'not_applicable';
    return {
      evidenceId: `academy-external-${createHash('sha256').update(`${strategyId}|${version}|${fingerprint}`).digest('hex').slice(0, 24)}`,
      kind,
      source,
      sourceKind,
      verification: 'UNVERIFIED' as const,
      observedAt: typeof item.observedAt === 'number' && Number.isFinite(item.observedAt) && item.observedAt >= 0 ? item.observedAt : null,
      ingestedAt: now,
      fingerprint: fingerprint.toLowerCase(),
      dataState,
      datasetFingerprint: typeof item.datasetFingerprint === 'string' && item.datasetFingerprint.trim() ? item.datasetFingerprint.trim() : null,
      runId: typeof item.runId === 'string' && item.runId.trim() ? item.runId.trim() : null,
      notes: asStringArray(item.notes),
    };
  });
  const rules = input.rules && typeof input.rules === 'object' ? input.rules as Record<string, unknown> : {};
  return {
    recordId: `${strategyId}@${version}`,
    strategyId,
    version,
    name,
    sourceKind,
    source: typeof input.source === 'string' && input.source.trim() ? input.source.trim() : sourceKind,
    metadata: {},
    logic: {
      summary: typeof input.summary === 'string' ? input.summary.slice(0, 4_000) : '',
      setupRules: asStringArray(rules.setup),
      triggerRules: asStringArray(rules.trigger),
      riskRules: asStringArray(rules.risk),
      exitRules: asStringArray(rules.exit),
      noTradeRules: asStringArray(rules.noTrade),
    },
    indicators: { state: 'INSUFFICIENT_DATA', values: asStringArray(input.indicators), detail: 'Imported indicator metadata is unverified until an internal validation adapter records evidence.' },
    parameters: [],
    marketConditions: asStringArray(input.marketConditions),
    sourceReferences: asStringArray(input.sourceReferences),
    knownFailureModes: asStringArray(input.knownFailureModes),
    categories: asStringArray(input.categories),
    evidenceHistory,
    latestSnapshot: null,
    performanceEvidenceTrusted: false,
    registryStatus: 'external',
  };
}

function routeError(res: Response, error: unknown): Response {
  const message = error instanceof Error ? error.message : 'academy_request_failed';
  const clientError = /required|invalid|already_enabled|cycle_in_flight/.test(message);
  return res.status(clientError ? 422 : 500).json({ ok: false, error: message });
}

/**
 * Status mapping for the research-lab routes. This is additive: it does not
 * change `routeError`'s behaviour for any existing route.
 */
function labRouteError(res: Response, error: unknown): Response {
  const message = error instanceof Error ? error.message : 'academy_lab_request_failed';
  if (/_unavailable$/.test(message)) return res.status(503).json({ ok: false, error: message });
  if (/_not_found/.test(message) || /_unknown_table/.test(message)) return res.status(404).json({ ok: false, error: message });
  if (/_requires_|_invalid|_untested|_unsupported|_limit_/.test(message)) return res.status(422).json({ ok: false, error: message });
  return res.status(500).json({ ok: false, error: message });
}

/** Resolves the lab or fails loudly; never silently degrades to a stub. */
function requireLab(subsystem: AcademySubsystem): StrategyLabService {
  const lab = subsystem.lab?.();
  if (!lab) throw new Error('academy_lab_unavailable');
  return lab;
}

function parseIdsQuery(value: unknown): string[] {
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

export function registerAcademyRoutes(app: Express, subsystem: AcademySubsystem): void {
  app.get('/api/academy/status', (_req: Request, res: Response) => {
    res.json({ ok: true, status: subsystem.engine.status() });
  });

  app.get('/api/academy/strategies', (_req: Request, res: Response) => {
    const strategies = subsystem.knowledgeBase.all();
    res.json({ ok: true, strategies, count: strategies.length, timestamp: Date.now() });
  });

  // ROUTE ORDER IS LOAD-BEARING: this must stay registered BEFORE
  // '/api/academy/strategies/:strategyId', or Express matches 'compare' as a
  // strategyId and answers 404 instead of comparing anything.
  app.get('/api/academy/strategies/compare', (req: Request, res: Response) => {
    try {
      const ids = parseIdsQuery(req.query.ids);
      const result = requireLab(subsystem).compareCandidates(ids);
      return res.json({
        ok: true,
        comparisonId: result.comparison.id,
        comparedAtUtc: result.comparison.createdAtUtc,
        candidateIds: result.comparison.candidateIds,
        maxCompared: STRATEGY_LAB_MAX_COMPARED,
        entries: result.entries,
        authority: 'ADVISORY_AND_SAFETY_GATE_ONLY',
        executionAuthorized: false,
        note: 'Research comparison of lab candidates. Absent metrics are reported as absent and are never defaulted to zero.',
      });
    } catch (error) {
      return labRouteError(res, error);
    }
  });

  app.get('/api/academy/strategies/:strategyId', (req: Request, res: Response) => {
    const strategy = subsystem.knowledgeBase.get(String(req.params.strategyId || ''));
    if (!strategy) return res.status(404).json({ ok: false, error: 'academy_strategy_not_found' });
    return res.json({ ok: true, strategy });
  });

  // Exact-identity production safety intelligence endpoint (mandatory version)
  app.get('/api/academy/intelligence/:consumer/:strategyId/:strategyVersion', (req: Request, res: Response) => {
    const consumer = String(req.params.consumer || '').toUpperCase().replaceAll('-', '_') as AcademyConsumer;
    const regimeRaw = typeof req.query.regime === 'string' ? req.query.regime.toUpperCase() as AcademyRegime : null;
    const strategyId = String(req.params.strategyId || '').trim();
    const strategyVersion = Number(req.params.strategyVersion);

    if (!CONSUMERS.includes(consumer)) return res.status(422).json({ ok: false, error: 'academy_consumer_invalid' });
    if (regimeRaw && !REGIMES.includes(regimeRaw)) return res.status(422).json({ ok: false, error: 'academy_regime_invalid' });
    if (!Number.isInteger(strategyVersion) || strategyVersion < 1) {
      return res.status(422).json({ ok: false, error: 'academy_strategy_version_invalid', detail: 'strategyVersion must be a positive integer.' });
    }

    const strategy = subsystem.knowledgeBase.getExact(strategyId, strategyVersion);
    if (!strategy) {
      return res.status(404).json({
        ok: false,
        error: 'academy_strategy_not_found',
        detail: `Strategy '${strategyId}' at exact version ${strategyVersion} not found in knowledge base.`,
      });
    }

    return res.json({
      ok: true,
      strategyId,
      strategyVersion,
      recordId: strategy.recordId,
      intelligence: buildAcademyConsumerIntelligence(strategy, consumer, regimeRaw),
    });
  });

  // Non-authoritative latest-record lookup for UI/browsing preview only
  app.get('/api/academy/intelligence/:consumer/:strategyId', (req: Request, res: Response) => {
    const consumer = String(req.params.consumer || '').toUpperCase().replaceAll('-', '_') as AcademyConsumer;
    const regimeRaw = typeof req.query.regime === 'string' ? req.query.regime.toUpperCase() as AcademyRegime : null;
    if (!CONSUMERS.includes(consumer)) return res.status(422).json({ ok: false, error: 'academy_consumer_invalid' });
    if (regimeRaw && !REGIMES.includes(regimeRaw)) return res.status(422).json({ ok: false, error: 'academy_regime_invalid' });
    const strategy = subsystem.knowledgeBase.get(String(req.params.strategyId || ''));
    if (!strategy) return res.status(404).json({ ok: false, error: 'academy_strategy_not_found' });
    res.setHeader('x-apex-academy-lookup', 'LATEST_CONVENIENCE_UI_ONLY');
    return res.json({
      ok: true,
      lookupMode: 'LATEST_RECORD_CONVENIENCE_UI_ONLY',
      intelligence: buildAcademyConsumerIntelligence(strategy, consumer, regimeRaw),
    });
  });

  app.get('/api/academy/similarity/:strategyId', (req: Request, res: Response) => {
    const strategy = subsystem.knowledgeBase.get(String(req.params.strategyId || ''));
    if (!strategy) return res.status(404).json({ ok: false, error: 'academy_strategy_not_found' });
    const candidates = subsystem.knowledgeBase.all().filter((candidate) => candidate.recordId !== strategy.recordId);
    return res.json({ ok: true, strategyId: strategy.strategyId, similar: findSimilarStrategies(strategy, candidates, 10) });
  });

  app.get('/api/academy/evolution/:strategyId', (req: Request, res: Response) => {
    const strategy = subsystem.knowledgeBase.get(String(req.params.strategyId || ''));
    if (!strategy) return res.status(404).json({ ok: false, error: 'academy_strategy_not_found' });
    // Truth-in-labelling (CP28 Task 1 step 5, fork (b)): these are rule-based
    // checklist suggestions, not optimizer or evolutionary-search output. The
    // method fields are part of the response contract so no consumer can
    // present them as "optimization" without contradicting the payload.
    return res.json({
      ok: true,
      strategyId: strategy.strategyId,
      suggestions: strategy.evolutionSuggestions,
      autoApply: false,
      method: EVOLUTION_SUGGESTION_BASIS,
      optimizationPerformed: false,
      methodNote: EVOLUTION_SUGGESTION_METHOD_NOTE,
    });
  });

  app.post('/api/academy/control', (req: Request, res: Response) => {
    try {
      const action = typeof req.body?.action === 'string' ? req.body.action.toUpperCase() : '';
      if (action === 'ON' || action === 'START') {
        const cycle = subsystem.engine.start();
        return res.json({ ok: true, status: subsystem.engine.status(), cycle });
      }
      if (action === 'OFF' || action === 'STOP') return res.json({ ok: true, status: subsystem.engine.stop() });
      return res.status(422).json({ ok: false, error: 'academy_control_action_invalid' });
    } catch (error) {
      return routeError(res, error);
    }
  });

  app.post('/api/academy/cycle', (_req: Request, res: Response) => {
    try {
      const cycle = subsystem.engine.runOnce();
      return res.json({ ok: true, cycle, status: subsystem.engine.status() });
    } catch (error) {
      return routeError(res, error);
    }
  });

  app.get('/api/academy/autopilot', (_req: Request, res: Response) => {
    return res.json({ ok: true, autopilot: subsystem.engine.autopilotStatus() });
  });

  app.post('/api/academy/autopilot', (req: Request, res: Response) => {
    try {
      const action = typeof req.body?.action === 'string' ? req.body.action.toUpperCase() : '';
      const intervalMs = typeof req.body?.intervalMs === 'number' && req.body.intervalMs > 0 ? req.body.intervalMs : undefined;

      if (action === 'ON' || action === 'START') {
        const cycle = subsystem.engine.start(intervalMs);
        return res.json({ ok: true, autopilot: subsystem.engine.autopilotStatus(), cycle });
      }
      if (action === 'OFF' || action === 'STOP') {
        subsystem.engine.stop();
        return res.json({ ok: true, autopilot: subsystem.engine.autopilotStatus() });
      }
      if (action === 'CYCLE' || action === 'RUN_NOW') {
        const cycle = subsystem.engine.runOnce();
        return res.json({ ok: true, autopilot: subsystem.engine.autopilotStatus(), cycle });
      }
      if (action === 'CONFIGURE') {
        if (intervalMs) subsystem.engine.setIntervalMs(intervalMs);
        return res.json({ ok: true, autopilot: subsystem.engine.autopilotStatus() });
      }
      return res.status(422).json({ ok: false, error: 'academy_autopilot_action_invalid' });
    } catch (error) {
      return routeError(res, error);
    }
  });

  app.post('/api/academy/strategies/:strategyId/test', (req: Request, res: Response) => {
    try {
      const strategyId = String(req.params.strategyId || '');
      const strategy = subsystem.knowledgeBase.get(strategyId);
      if (!strategy) return res.status(404).json({ ok: false, error: 'academy_strategy_not_found' });
      const updated = subsystem.engine.ingest(strategy);
      return res.json({ ok: true, strategy: updated, note: 'Strategy evaluated and refreshed.' });
    } catch (error) {
      return routeError(res, error);
    }
  });

  app.post('/api/academy/strategies/import', (req: Request, res: Response) => {
    try {
      const parsed = parseImportedStrategy(req.body);
      const strategy = subsystem.engine.ingest(parsed);

      // Stage 2 of the research lab: the SAME parsed object the knowledge base
      // just ingested is recorded as a lab candidate. A lab failure is reported
      // in the payload rather than swallowed, but it does not fail the ingest,
      // which genuinely succeeded above.
      let lab: { recorded: boolean; candidateId: string | null; created: boolean | null; error: string | null };
      try {
        const recorded = requireLab(subsystem).recordImportedCandidate(parsed);
        lab = { recorded: true, candidateId: recorded.candidate.id, created: recorded.created, error: null };
      } catch (labError) {
        lab = {
          recorded: false,
          candidateId: null,
          created: null,
          error: labError instanceof Error ? labError.message : 'academy_lab_record_failed',
        };
      }

      return res.status(201).json({
        ok: true,
        strategy,
        lab,
        note: 'Imported performance claims remain UNVERIFIED and cannot advance lifecycle validation.',
      });
    } catch (error) {
      return routeError(res, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Research strategy lab (Task 1 stages 2 and 4-7).
  //
  // Stage 1 (external internet discovery) is deliberately absent: there is no
  // outbound fetch here and no provider. Candidates enter only through
  // POST /api/academy/strategies/import above.
  //
  // Every route below is research-only. None of them promotes a strategy,
  // authorizes execution, or touches order routing.
  // ---------------------------------------------------------------------------
  app.get('/api/academy/lab/candidates', (_req: Request, res: Response) => {
    try {
      const lab = requireLab(subsystem);
      const candidates = lab.listCandidates();
      return res.json({
        ok: true,
        candidates,
        count: candidates.length,
        databasePath: lab.databasePath,
        authority: 'ADVISORY_AND_SAFETY_GATE_ONLY',
        executionAuthorized: false,
      });
    } catch (error) {
      return labRouteError(res, error);
    }
  });

  app.get('/api/academy/lab/candidates/:candidateId', (req: Request, res: Response) => {
    try {
      const lab = requireLab(subsystem);
      const candidateId = String(req.params.candidateId || '');
      const candidate = lab.getCandidate(candidateId);
      if (!candidate) return res.status(404).json({ ok: false, error: `strategy_lab_candidate_not_found:${candidateId}` });
      return res.json({ ok: true, candidate, evaluationRuns: lab.evaluationRuns(candidateId) });
    } catch (error) {
      return labRouteError(res, error);
    }
  });

  app.post('/api/academy/lab/candidates/:candidateId/test', (req: Request, res: Response) => {
    try {
      const result = requireLab(subsystem).testCandidate(String(req.params.candidateId || ''));
      return res.json({
        ok: true,
        candidate: result.candidate,
        run: result.run,
        evaluation: result.record.latestEvaluation,
        evaluatedBy: 'AutomatedEvaluationPipeline',
        note: 'Evaluated through the same pipeline instance used for house strategies. Blockers are reported verbatim.',
      });
    } catch (error) {
      return labRouteError(res, error);
    }
  });

  app.post('/api/academy/lab/candidates/:candidateId/improve', (req: Request, res: Response) => {
    try {
      const result = requireLab(subsystem).improveCandidate(String(req.params.candidateId || ''));
      return res.json({
        ok: true,
        candidate: result.candidate,
        run: result.run,
        suggestions: result.suggestions,
        autoApply: false,
        method: result.basis,
        optimizationPerformed: false,
        methodNote: result.methodNote,
      });
    } catch (error) {
      return labRouteError(res, error);
    }
  });

  app.get('/api/academy/lab/fusions', (_req: Request, res: Response) => {
    try {
      const fusions = requireLab(subsystem).listFusions();
      return res.json({ ok: true, fusions, count: fusions.length, methods: STRATEGY_FUSION_METHODS });
    } catch (error) {
      return labRouteError(res, error);
    }
  });

  app.post('/api/academy/lab/fusions', (req: Request, res: Response) => {
    try {
      const method = String(req.body?.method || '').toUpperCase() as StrategyFusionMethod;
      if (!STRATEGY_FUSION_METHODS.includes(method)) {
        return res.status(422).json({ ok: false, error: 'strategy_lab_fusion_method_invalid', allowed: STRATEGY_FUSION_METHODS });
      }
      const parents = parseIdsQuery(req.body?.parentCandidateIds);
      const result = requireLab(subsystem).fuseCandidates(parents, method);
      return res.status(201).json({
        ok: true,
        fusion: result.fusion,
        candidate: result.candidate,
        weights: result.weights,
        maxParents: STRATEGY_LAB_MAX_FUSION_PARENTS,
        note: 'Fused candidate is COMBINED, carries no inherited evidence, and is queued to re-enter the test stage.',
      });
    } catch (error) {
      return labRouteError(res, error);
    }
  });

  app.get('/api/academy/lab/comparisons', (_req: Request, res: Response) => {
    try {
      const comparisons = requireLab(subsystem).listComparisons();
      return res.json({ ok: true, comparisons, count: comparisons.length });
    } catch (error) {
      return labRouteError(res, error);
    }
  });

  // Schema-proof endpoint: reports the real table list and row counts straight
  // out of sqlite_master, so persistence can be checked without trusting a
  // hand-written claim about it.
  app.get('/api/academy/lab/schema', (_req: Request, res: Response) => {
    try {
      const lab = requireLab(subsystem);
      const tables = lab.tableNames();
      return res.json({
        ok: true,
        databasePath: lab.databasePath,
        tables,
        rowCounts: Object.fromEntries(tables.map((table) => [table, lab.dumpTable(table).length])),
      });
    } catch (error) {
      return labRouteError(res, error);
    }
  });
}
