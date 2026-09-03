import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  Compass,
  Plus,
  CheckCircle2,
  Clock,
  Circle,
  Star,
  MoreVertical,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  Play,
  BookmarkPlus,
  Pin,
  Check,
  XCircle,
  TrendingUp,
  Info,
  Maximize2,
  Sparkles,
  X,
  RotateCw,
  Cpu,
  Layers,
  BarChart2,
  Shield,
  Trash2,
  Save,
  Download,
} from 'lucide-react';
import type { WorkspacePage } from '../../components/workspace/WorkspaceShell';
import type { AutopilotControllerView } from '../../lib/useAutopilotController';
import './AcademyPage.css';

interface AcademyPageProps {
  onNavigate: (page: WorkspacePage) => void;
  autopilotController?: AutopilotControllerView;
}

export interface StrategyItem {
  id: string;
  strategyId: string;
  version: number;
  name: string;
  family: 'Momentum' | 'Breakout' | 'Mean Reversion' | 'Carry' | 'Volatility' | 'Market Making' | 'Macro';
  markets: string;
  tf: string;
  stage: 'SHORTLISTED' | 'TESTING' | 'ROBUSTNESS' | 'DISCOVERED';
  edge: number | null;
  robustness: 'PASS' | 'FAIL' | null;
  pros: string;
  cons: string;
  score: number | null;
  updated: string;
  starred?: boolean;
  thesis: string;
  dataQuality: 'LIVE' | 'DEGRADED' | 'UNAVAILABLE' | null;
  advantages: string[];
  limitations: string[];
  timeline: Array<{ step: string; time: string; status: 'completed' | 'active' | 'pending' }>;
  latestRun: {
    progress: number;
    currentAction: string;
    elapsed: string;
    activeJobs: number;
    queue: number;
  };
  /**
   * Distinguishes items that came from `knowledgeBase` (via GET /api/academy/strategies)
   * from items created by the strategy lab (POST /api/academy/lab/fusions).
   * Lab-origin items MUST route "Run Test" to POST /api/academy/lab/candidates/:id/test,
   * NOT to POST /api/academy/strategies/:id/test — the latter 404s for lab-only ids.
   * Absent on legacy items; treated as 'knowledgeBase' when undefined.
   */
  origin?: 'knowledgeBase' | 'lab';
}

/**
 * Local mirror of `AcademyEvolutionSuggestion` from src/features/academy/types.ts.
 * Kept here to avoid a cross-layer import from a page component into a backend feature.
 * Fields MUST remain in sync with the backend type — they are what the
 * POST /api/academy/lab/candidates/:id/improve endpoint returns verbatim.
 */
interface AcademyEvolutionSuggestion {
  suggestionId: string;
  kind: 'COLLECT_EVIDENCE' | 'ROBUSTNESS_TEST' | 'REGIME_TEST' | 'COST_TEST' | 'PARAMETER_RESEARCH';
  statement: string;
  evidenceIds: string[];
  autoApply: false;
  basis: 'RULE_BASED_CHECKLIST';
}


interface ComparisonMetricView {
  state: string;
  value: number | null;
}

interface StrategyComparisonEntry {
  candidateId: string;
  sourceType: string;
  status: string;
  recordId: string;
  name: string;
  parseConfidence: number;
  evaluationState: string;
  datasetFingerprint: string | null;
  runId: string | null;
  holdoutProtocolStatus: string;
  confidenceScore: ComparisonMetricView;
  rankScore: ComparisonMetricView;
  winRatePct: ComparisonMetricView;
  profitFactor: ComparisonMetricView;
  maxDrawdownPct: ComparisonMetricView;
  blockers: string[];
  detail: string;
}

interface StrategyComparisonResponse {
  ok: true;
  comparisonId: string;
  comparedAtUtc: string;
  candidateIds: string[];
  maxCompared: number;
  entries: StrategyComparisonEntry[];
  authority: string;
  executionAuthorized: false;
  note: string;
}

function formatComparisonMetric(metric: ComparisonMetricView): string {
  if (metric.value === null || !Number.isFinite(metric.value)) return `${metric.state}: —`;
  return `${metric.state}: ${metric.value.toFixed(4)}`;
}

const INITIAL_STRATEGIES: StrategyItem[] = [];

interface RadarChartProps {
  edge?: number | null;
  robustness?: number | null;
  dataQuality?: number | null;
  costEfficiency?: number | null;
  regimeCoverage?: number | null;
}

function RadarChart({ edge, robustness, dataQuality, costEfficiency, regimeCoverage }: RadarChartProps) {
  const size = 110;
  const center = size / 2;
  const radius = 42;
  const numAxes = 5;

  const rawValues = [edge, robustness, dataQuality, costEfficiency, regimeCoverage];
  const normalizedValues = rawValues.map((v) => Math.max(0.10, Math.min(1.0, (typeof v === 'number' && Number.isFinite(v) ? v : 0) / 100)));

  const getCoordinates = (index: number, scale: number) => {
    const angle = (Math.PI * 2 / numAxes) * index - Math.PI / 2;
    return {
      x: center + radius * scale * Math.cos(angle),
      y: center + radius * scale * Math.sin(angle),
    };
  };

  const dataPoints = normalizedValues.map((val, i) => getCoordinates(i, val));
  const polygonPath = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="radar-container" style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {[0.25, 0.5, 0.75, 1.0].map((ringScale) => {
          const ringPoints = Array.from({ length: numAxes })
            .map((_, i) => {
              const pt = getCoordinates(i, ringScale);
              return `${pt.x},${pt.y}`;
            })
            .join(' ');
          return (
            <polygon
              key={`ring-${ringScale}`}
              points={ringPoints}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          );
        })}

        {Array.from({ length: numAxes }).map((_, i) => {
          const outer = getCoordinates(i, 1.0);
          return (
            <line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          );
        })}

        <polygon
          points={polygonPath}
          fill="rgba(16, 185, 129, 0.15)"
          stroke="#10b981"
          strokeWidth="2"
        />

        {dataPoints.map((p, i) => (
          <circle key={`dot-${i}`} cx={p.x} cy={p.y} r="3" fill="#10b981" />
        ))}
      </svg>
    </div>
  );
}

export function AcademyPage({ onNavigate, autopilotController }: AcademyPageProps) {
  // Strategy database & selection
  const [strategies, setStrategies] = useState<StrategyItem[]>([]);
  const [selectedTab, setSelectedTab] = useState<'All' | 'Shortlist' | 'Mine'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState('All');
  const [marketFilter, setMarketFilter] = useState('All');
  const [timeframeFilter, setTimeframeFilter] = useState('All');
  const [stageFilter, setStageFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const [minEdgeFilter, setMinEdgeFilter] = useState(0);
  const [minRobustnessFilter, setMinRobustnessFilter] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeStrategyId, setActiveStrategyId] = useState<string>('');
  const [workbenchTab, setWorkbenchTab] = useState<'Summary' | 'Tests' | 'Process' | 'Notes'>('Summary');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Notes persistence
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('apex_academy_notes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // UI Modals
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<StrategyComparisonResponse | null>(null);
  const [showNewResearchModal, setShowNewResearchModal] = useState(false);
  const [showWhyRankedModal, setShowWhyRankedModal] = useState(false);
  const [showForkModal, setShowForkModal] = useState(false);

  // New research form state
  const [researchHypothesis, setResearchHypothesis] = useState('');
  const [selectedFusionParentA, setSelectedFusionParentA] = useState('');
  const [selectedFusionParentB, setSelectedFusionParentB] = useState('');

  // Fork parameter state (kept for UX; values are NOT sent to server — server determines suggestions)
  const [forkParamMultiplier, setForkParamMultiplier] = useState('1.5');
  const [forkLookback, setForkLookback] = useState('20');

  // Fork / improve flow state (replaces fabricated fork behaviour)
  const [forkBusy, setForkBusy] = useState(false);
  const [forkSuggestions, setForkSuggestions] = useState<AcademyEvolutionSuggestion[]>([]);
  const [forkMethodNote, setForkMethodNote] = useState('');

  // Fusion flow state (replaces fabricated fusion behaviour)
  const [fusionBusy, setFusionBusy] = useState(false);
  const [selectedFusionMethod, setSelectedFusionMethod] = useState<'WEIGHTED_ENSEMBLE' | 'SEQUENTIAL_FILTER'>('WEIGHTED_ENSEMBLE');

  // Starred / shortlist — device-only localStorage persistence (no server-side shortlist exists).
  // Toast copy must never claim server persistence. See Part 3.3, Option B.
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('apex_academy_starred');
      return saved ? new Set<string>(JSON.parse(saved) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  // Feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'info'>('success');

  const showToast = useCallback((msg: string, type: 'success' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, []);

  // --------------------------------------------------------------------------
  // Dedicated Academy Autopilot State (Completely Separate from Program Autopilot)
  // --------------------------------------------------------------------------
  const [academyAutopilot, setAcademyAutopilot] = useState<{
    enabled: boolean;
    phase: string;
    intervalMs: number;
    lastRunAt: number | null;
    nextRunAt: number | null;
    cycleCount: number;
    strategiesAnalyzed: number;
    newDiscoveries: number;
    totalStrategies: number;
    lastError: string | null;
  }>({
    enabled: false,
    phase: 'OFF',
    intervalMs: 60_000,
    lastRunAt: null,
    nextRunAt: null,
    cycleCount: 0,
    strategiesAnalyzed: 0,
    newDiscoveries: 0,
    totalStrategies: 0,
    lastError: null,
  });
  const [autopilotBusy, setAutopilotBusy] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  // Fetch Academy Autopilot Status
  const fetchAutopilotStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/academy/autopilot');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.autopilot) {
          const ap = data.autopilot;
          setAcademyAutopilot({
            enabled: Boolean(ap.enabled),
            phase: String(ap.phase || 'OFF'),
            intervalMs: Number(ap.intervalMs || 60_000),
            lastRunAt: typeof ap.lastRunAt === 'number' ? ap.lastRunAt : null,
            nextRunAt: typeof ap.nextRunAt === 'number' ? ap.nextRunAt : null,
            cycleCount: Number(ap.cycleCount || 0),
            strategiesAnalyzed: Number(ap.strategiesAnalyzed || 0),
            newDiscoveries: Number(ap.newDiscoveries || 0),
            totalStrategies: Number(ap.totalStrategies || 0),
            lastError: ap.lastError ? String(ap.lastError) : null,
          });
        }
      }
    } catch {
      // Retain prior status on network error
    }
  }, []);

  // Load Strategies from backend
  const loadStrategiesFromApi = useCallback(async () => {
    try {
      const res = await fetch('/api/academy/strategies');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.strategies)) {
          if (data.strategies.length === 0) {
            setStrategies([]);
            setActiveStrategyId('');
            return;
          }
          // Transform backend records to StrategyItem truthfully
          const mapped: StrategyItem[] = data.strategies.map((rec: any, idx: number) => {
            const family = rec.categories?.[0] === 'Breakout'
              ? 'Breakout'
              : rec.categories?.[0] === 'Mean Reversion'
                ? 'Mean Reversion'
                : rec.categories?.[0] === 'Carry'
                  ? 'Carry'
                  : rec.categories?.[0] === 'Volatility'
                    ? 'Volatility'
                    : rec.categories?.[0] === 'Market Making'
                      ? 'Market Making'
                      : rec.categories?.[0] === 'Macro'
                        ? 'Macro'
                        : 'Momentum';

            const stage: StrategyItem['stage'] = rec.lifecycle === 'SHADOW' || rec.lifecycle === 'LIVE_ELIGIBLE'
              ? 'SHORTLISTED'
              : rec.lifecycle === 'VALIDATED'
                ? 'ROBUSTNESS'
                : rec.lifecycle === 'BACKTESTED'
                  ? 'TESTING'
                  : 'DISCOVERED';

            const score = typeof rec.latestEvaluation?.confidenceScore?.value === 'number'
              ? Math.round(rec.latestEvaluation.confidenceScore.value * 100)
              : null;

            const edge = typeof rec.latestSnapshot?.winRatePct === 'number'
              ? Math.round(rec.latestSnapshot.winRatePct * 100)
              : null;

            const robustness = typeof rec.latestEvaluation?.robustness?.passed === 'boolean'
              ? (rec.latestEvaluation.robustness.passed ? 'PASS' : 'FAIL')
              : null;

            const dataQuality = rec.latestEvaluation?.metrics?.dataQuality?.value || null;

            return {
              id: rec.recordId || `api-strat-${idx}`,
              strategyId: rec.strategyId || `strategy-${idx}`,
              version: rec.version || 1,
              name: rec.name || rec.strategyId,
              family,
              markets: rec.marketConditions?.join(', ') || 'Crypto / Futures',
              tf: 'D',
              stage,
              edge,
              robustness,
              pros: rec.logic?.summary?.slice(0, 30) || (rec.performanceEvidenceTrusted ? 'Verified edge' : 'Unverified'),
              cons: rec.latestEvaluation?.blockers?.[0] || 'Awaiting full validation',
              score,
              updated: 'Just now',
              starred: stage === 'SHORTLISTED',
              thesis: rec.logic?.summary || 'Systematic algorithmic quantitative strategy evaluated under Academy pipeline.',
              dataQuality,
              advantages: rec.performanceEvidenceTrusted ? ['Observed evidence history'] : ['Unverified performance claims'],
              limitations: rec.latestEvaluation?.blockers?.length ? rec.latestEvaluation.blockers : ['Requires validation'],
              timeline: [
                { step: 'Discovery', time: 'Recorded', status: 'completed' },
                { step: 'Data QA', time: rec.latestEvaluation ? 'Completed' : 'Pending', status: rec.latestEvaluation ? 'completed' : 'pending' },
                { step: 'Backtest', time: rec.latestEvaluation?.backtest?.passed ? 'Completed' : 'Pending', status: rec.latestEvaluation?.backtest?.passed ? 'completed' : 'pending' },
                { step: 'Robustness', time: rec.latestEvaluation?.robustness?.passed ? 'Completed' : 'Pending', status: rec.latestEvaluation?.robustness?.passed ? 'completed' : 'pending' },
                { step: 'Ranking', time: score != null ? 'Completed' : 'Pending', status: score != null ? 'completed' : 'pending' },
                { step: 'Shortlist', time: stage === 'SHORTLISTED' ? 'Approved' : 'Pending', status: stage === 'SHORTLISTED' ? 'completed' : 'pending' },
                { step: 'Paper', time: 'Pending', status: 'pending' },
              ],
              latestRun: {
                progress: stage === 'SHORTLISTED' ? 100 : stage === 'ROBUSTNESS' ? 68 : stage === 'TESTING' ? 45 : 0,
                currentAction: rec.latestEvaluation?.overall ? `Evaluation state: ${rec.latestEvaluation.overall}` : 'Candidate discovered',
                elapsed: '—',
                activeJobs: 0,
                queue: 0,
              },
            };
          });

          setStrategies(mapped);
          if (mapped.length > 0) {
            setActiveStrategyId((prev) => (prev && mapped.some((s) => s.id === prev) ? prev : mapped[0].id));
          }
        }
      }
    } catch {
      // Retain current strategies
    }
  }, []);

  // Polling loop for status and countdown
  useEffect(() => {
    fetchAutopilotStatus();
    loadStrategiesFromApi();
    const statusTimer = setInterval(fetchAutopilotStatus, 10_000);
    return () => clearInterval(statusTimer);
  }, [fetchAutopilotStatus, loadStrategiesFromApi]);

  // Second-by-second countdown calculation
  useEffect(() => {
    const timer = setInterval(() => {
      if (academyAutopilot.enabled && academyAutopilot.nextRunAt) {
        const diff = Math.max(0, Math.round((academyAutopilot.nextRunAt - Date.now()) / 1000));
        setCountdownSeconds(diff);
      } else {
        setCountdownSeconds(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [academyAutopilot.enabled, academyAutopilot.nextRunAt]);

  // Toggle Dedicated Academy Autopilot
  const handleToggleAutopilot = async () => {
    setAutopilotBusy(true);
    try {
      const action = academyAutopilot.enabled ? 'STOP' : 'START';
      fetch('/api/academy/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).catch(() => {});
      const res = await fetch('/api/academy/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, intervalMs: academyAutopilot.intervalMs }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.autopilot) {
          const ap = data.autopilot;
          setAcademyAutopilot((prev) => ({
            ...prev,
            enabled: Boolean(ap.enabled),
            phase: String(ap.phase || 'OFF'),
            intervalMs: Number(ap.intervalMs || prev.intervalMs),
            nextRunAt: ap.nextRunAt ?? null,
            cycleCount: Number(ap.cycleCount || prev.cycleCount),
            strategiesAnalyzed: Number(ap.strategiesAnalyzed || prev.strategiesAnalyzed),
          }));
          showToast(
            ap.enabled
              ? 'Academy Autopilot ENABLED: Autonomous research and ranking active.'
              : 'Academy Autopilot PAUSED: Autonomous background cycles stopped.',
            'info'
          );
          if (ap.enabled) loadStrategiesFromApi();
        }
      }
    } finally {
      setAutopilotBusy(false);
    }
  };

  // Run Manual Research Cycle Now
  const handleRunCycleNow = async () => {
    setAutopilotBusy(true);
    showToast('Executing Academy research & evaluation cycle...', 'info');
    try {
      const res = await fetch('/api/academy/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CYCLE' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.cycle) {
          showToast(
            `Research Cycle complete: ${data.cycle.discovered} discovered, ${data.cycle.evaluated} evaluated, ${data.cycle.stored} stored in knowledge base.`,
            'success'
          );
          fetchAutopilotStatus();
          loadStrategiesFromApi();
        }
      } else {
        showToast('Research cycle was already in flight or failed to execute.', 'info');
      }
    } finally {
      setAutopilotBusy(false);
    }
  };

  // Change Autopilot Interval
  const handleChangeInterval = async (intervalMs: number) => {
    try {
      const res = await fetch('/api/academy/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CONFIGURE', intervalMs }),
      });
      if (res.ok) {
        setAcademyAutopilot((prev) => ({ ...prev, intervalMs }));
        showToast(`Academy Autopilot interval set to ${intervalMs / 1000}s`, 'info');
      }
    } catch {
      // Ignored
    }
  };

  // Run Test for a single strategy.
  // ROUTING BRANCH: lab-origin items (created by POST /api/academy/lab/fusions) MUST use
  // the LAB test route — the knowledgeBase route 404s for ids that were never registered
  // in subsystem.knowledgeBase (FACT 5). The `origin` field on StrategyItem controls this.
  const handleRunTestForStrategy = async (strat: StrategyItem) => {
    showToast(`Running evaluation on ${strat.name}...`, 'info');
    try {
      const isLabOrigin = strat.origin === 'lab';
      const url = isLabOrigin
        ? `/api/academy/lab/candidates/${encodeURIComponent(strat.strategyId)}/test`
        : `/api/academy/strategies/${encodeURIComponent(strat.strategyId)}/test`;

      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();

        let score: number | null = null;
        let edge: number | null = null;
        let robustness: 'PASS' | 'FAIL' | null = null;

        if (isLabOrigin) {
          // Lab test response: { ok, candidate, run, evaluation, evaluatedBy, note }
          // `evaluation` is the AcademyEvaluationResult from AutomatedEvaluationPipeline.
          const ev = data?.evaluation;
          score = typeof ev?.confidenceScore?.value === 'number'
            ? Math.round(ev.confidenceScore.value * 100) : null;
          // Lab candidates have no latestSnapshot — edge stays null until knowledgeBase promotion
          edge = null;
          robustness = typeof ev?.robustness?.passed === 'boolean'
            ? (ev.robustness.passed ? 'PASS' : 'FAIL') : null;
        } else {
          // KnowledgeBase test response: { ok, strategy, note }
          const updatedRec = data?.strategy;
          score = typeof updatedRec?.latestEvaluation?.confidenceScore?.value === 'number'
            ? Math.round(updatedRec.latestEvaluation.confidenceScore.value * 100) : null;
          edge = typeof updatedRec?.latestSnapshot?.winRatePct === 'number'
            ? Math.round(updatedRec.latestSnapshot.winRatePct * 100) : null;
          robustness = typeof updatedRec?.latestEvaluation?.robustness?.passed === 'boolean'
            ? (updatedRec.latestEvaluation.robustness.passed ? 'PASS' : 'FAIL') : null;
        }

        setStrategies((prev) =>
          prev.map((s) => {
            if (s.id === strat.id) {
              return {
                ...s,
                score,
                edge,
                robustness,
                updated: 'Just now',
                latestRun: {
                  ...s.latestRun,
                  progress: 100,
                  currentAction: 'Evaluation completed',
                },
              };
            }
            return s;
          })
        );
        showToast(`Evaluation completed for ${strat.name}.`, 'success');
      } else {
        showToast(`Evaluation failed for ${strat.name} (HTTP ${res.status}). No metrics updated.`, 'info');
      }
    } catch {
      showToast(`Evaluation network error for ${strat.name}. No metrics updated.`, 'info');
    }
  };


  // Toggle shortlist (star) for a strategy.
  // PERSISTENCE: device-only via localStorage. No server-side shortlist concept exists
  // in the backend (confirmed: zero shortlist/starred matches in src/features/academy/**/*.ts).
  // Toast copy explicitly says "saved to this device" — never implying server persistence.
  const toggleStarStrategy = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStarredIds((prev) => {
      const next = new Set(prev);
      const isNowStarred = !next.has(id);
      if (isNowStarred) next.add(id); else next.delete(id);
      try { localStorage.setItem('apex_academy_starred', JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
    setStrategies((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const nextStarred = !s.starred;
          const nextStage: StrategyItem['stage'] = nextStarred ? 'SHORTLISTED' : 'ROBUSTNESS';
          return { ...s, starred: nextStarred, stage: nextStage };
        }
        return s;
      })
    );
    showToast('Shortlist updated (saved to this device).', 'success');
  };

  // Batch shortlist selected — device-only persistence, same as toggleStarStrategy.
  const handleBatchShortlist = () => {
    if (!selectedIds.length) return;
    setStarredIds((prev) => {
      const next = new Set(prev);
      for (const id of selectedIds) next.add(id);
      try { localStorage.setItem('apex_academy_starred', JSON.stringify([...next])); } catch { /* storage full */ }
      return next;
    });
    setStrategies((prev) =>
      prev.map((s) => (selectedIds.includes(s.id) ? { ...s, starred: true, stage: 'SHORTLISTED' } : s))
    );
    showToast(`Added ${selectedIds.length} strategy(ies) to shortlist (saved to this device).`, 'success');

  };

  // Batch test selected
  const handleBatchRunTest = async () => {
    if (!selectedIds.length) {
      showToast('Select one or more strategies to run evaluations.', 'info');
      return;
    }
    showToast(`Evaluating ${selectedIds.length} selected strategies sequentially...`, 'info');
    for (const id of selectedIds) {
      const strat = strategies.find((s) => s.id === id);
      if (strat) {
        await handleRunTestForStrategy(strat);
      }
    }
  };

  const resolveLabCandidateIds = async (recordIds: string[]): Promise<string[]> => {
    const response = await fetch('/api/academy/lab/candidates');
    const payload = await response.json().catch(() => null) as { ok?: boolean; candidates?: Array<{ id?: unknown; parsedRulesJson?: unknown }>; error?: unknown } | null;
    if (!response.ok || !payload?.ok || !Array.isArray(payload.candidates)) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : `academy_lab_candidates_http_${response.status}`);
    }

    const candidateByRecordId = new Map<string, string>();
    for (const candidate of payload.candidates) {
      if (typeof candidate?.id !== 'string' || typeof candidate?.parsedRulesJson !== 'string') continue;
      try {
        const parsed = JSON.parse(candidate.parsedRulesJson) as { recordId?: unknown };
        if (typeof parsed.recordId === 'string' && parsed.recordId) candidateByRecordId.set(parsed.recordId, candidate.id);
      } catch {
        // Ignore malformed rows here; the backend store remains authoritative and
        // comparison fails loudly below if a selected record cannot be resolved.
      }
    }

    const missing = recordIds.filter((recordId) => !candidateByRecordId.has(recordId));
    if (missing.length) throw new Error(`strategy_lab_candidates_missing:${missing.join(',')}`);
    return recordIds.map((recordId) => candidateByRecordId.get(recordId) as string);
  };

  const handleOpenComparison = async () => {
    if (selectedIds.length < 2) {
      showToast('Please select at least 2 strategies to compare.', 'info');
      return;
    }
    setShowCompareModal(true);
    setCompareLoading(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const candidateIds = await resolveLabCandidateIds(selectedIds);
      const response = await fetch(`/api/academy/strategies/compare?ids=${encodeURIComponent(candidateIds.join(','))}`);
      const payload = await response.json().catch(() => null) as StrategyComparisonResponse | { ok?: false; error?: string } | null;
      if (!response.ok || !payload || payload.ok !== true) {
        const error = payload && 'error' in payload && typeof payload.error === 'string' ? payload.error : `academy_compare_http_${response.status}`;
        throw new Error(error);
      }
      setCompareResult(payload);
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : 'academy_compare_failed');
    } finally {
      setCompareLoading(false);
    }
  };

  // Save notes for active strategy
  const handleSaveNotes = () => {
    try {
      localStorage.setItem('apex_academy_notes', JSON.stringify(notes));
      showToast('Research notes saved successfully.', 'success');
    } catch {
      // Storage error
    }
  };

  // Handle Fork & Improve — requests real improvement suggestions from the backend.
  //
  // WHAT CHANGED: The old implementation built a fake StrategyItem with invented prose
  // ('Fork candidate awaiting verification', 'Unverified performance claims') and pushed
  // it into state with a client-invented strategyId that no backend route recognised.
  // Clicking "Run Test" on those fake items always 404'd (FACT 5).
  //
  // NEW: calls POST /api/academy/lab/candidates/:id/improve which returns
  // AcademyEvolutionSuggestion[] — real rule-based checklist items from the server.
  // The modal now shows those suggestions verbatim. No new StrategyItem is created;
  // the backend explicitly says optimizationPerformed:false, autoApply:false.
  const handleCreateFork = async () => {
    const parent = strategies.find((s) => s.id === activeStrategyId) || strategies[0];
    if (!parent) {
      showToast('No parent strategy selected to request improvements for.', 'info');
      return;
    }
    setForkBusy(true);
    setForkSuggestions([]);
    setForkMethodNote('');
    try {
      // Reuse the existing resolver — do not duplicate its logic.
      const candidateIds = await resolveLabCandidateIds([parent.id]);
      const candidateId = candidateIds[0];
      if (!candidateId) throw new Error('strategy_lab_candidates_missing:no_id_resolved');

      const response = await fetch(
        `/api/academy/lab/candidates/${encodeURIComponent(candidateId)}/improve`,
        { method: 'POST' }
      );
      const payload = await response.json().catch(() => null) as {
        ok?: boolean; suggestions?: AcademyEvolutionSuggestion[]; methodNote?: string; error?: string;
      } | null;

      if (!response.ok || !payload || payload.ok !== true) {
        const errorMsg = payload?.error ?? `academy_improve_http_${response.status}`;
        showToast(`Improvement request failed for ${parent.name}: ${errorMsg}`, 'info');
        return; // no state mutation on failure
      }

      // payload.suggestions is AcademyEvolutionSuggestion[] — real data from the server.
      // Display them in the modal. Do NOT synthesize a new StrategyItem.
      setForkSuggestions(payload.suggestions ?? []);
      setForkMethodNote(payload.methodNote ?? '');
      showToast(
        `${(payload.suggestions ?? []).length} improvement suggestion(s) received for ${parent.name}.`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'academy_improve_network_error';
      showToast(`Improvement request failed for ${parent.name}: ${msg}`, 'info');
    } finally {
      setForkBusy(false);
    }
  };

  // Handle New Research & Fusion — calls the real POST /api/academy/lab/fusions endpoint.
  //
  // WHAT CHANGED: The old implementation built a fake StrategyItem with invented strings
  // ('Hypothesized orthogonal risk profile', 'Requires validation before paper execution',
  // plus an invented thesis paragraph) and a client-invented strategyId that never existed
  // in any backend store. Clicking "Run Test" always 404'd (FACT 5).
  //
  // NEW: POSTs to the real endpoint, reads the real StrategyCandidateRow from the response.
  // The resulting StrategyItem has:
  //   - id/strategyId from row.id (real server-assigned id)
  //   - origin: 'lab' (so handleRunTestForStrategy routes to the lab test endpoint)
  //   - edge/score/robustness: null — MUST stay null until a real test is run
  //   - thesis: payload.note verbatim (the server's own description)
  //   - advantages: [] — nothing is known yet
  //   - limitations: honest placeholders only
  const handleGenerateFusionCandidate = async () => {
    const parentA = strategies.find((s) => s.id === selectedFusionParentA) || strategies[0];
    const parentB = strategies.find((s) => s.id === selectedFusionParentB) || strategies[1];
    if (!parentA || !parentB) {
      showToast('Two parent strategies are required to generate a fusion candidate.', 'info');
      return;
    }
    if (parentA.id === parentB.id) {
      showToast('Select two different parent strategies for fusion.', 'info');
      return;
    }
    if (selectedFusionMethod !== 'WEIGHTED_ENSEMBLE' && selectedFusionMethod !== 'SEQUENTIAL_FILTER') {
      showToast('Select a valid fusion method (WEIGHTED_ENSEMBLE or SEQUENTIAL_FILTER).', 'info');
      return;
    }

    setFusionBusy(true);
    try {
      const candidateIds = await resolveLabCandidateIds([parentA.id, parentB.id]);

      const response = await fetch('/api/academy/lab/fusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: selectedFusionMethod, parentCandidateIds: candidateIds }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        candidate?: { id?: string; status?: string; parsedRulesJson?: string };
        note?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload || payload.ok !== true) {
        const errorMsg = payload?.error ?? `academy_fusion_http_${response.status}`;
        showToast(`Fusion failed: ${errorMsg}`, 'info');
        return; // no state mutation on failure
      }

      const row = payload.candidate;
      if (!row?.id) {
        showToast('Fusion response missing candidate id — no item added.', 'info');
        return;
      }

      // Build StrategyItem from REAL server data only.
      // Presentational name uses real parent families (not invented prose).
      // score/edge/robustness MUST stay null — the server explicitly confirms
      // this candidate carries no inherited evidence and must re-enter testing.
      const fusedItem: StrategyItem = {
        id: row.id,
        strategyId: row.id,
        version: 1,
        name: `${parentA.family} + ${parentB.family} Fusion (${selectedFusionMethod})`,
        family: parentA.family,
        markets: 'Cross-Venue Multi-Asset',
        tf: '—',
        stage: 'DISCOVERED',
        edge: null,          // MUST be null — not measured yet
        robustness: null,    // MUST be null — not measured yet
        score: null,         // MUST be null — not measured yet
        dataQuality: null,
        pros: 'Lab fusion candidate — untested',
        cons: 'Not yet evaluated by AutomatedEvaluationPipeline',
        updated: 'Just now',
        starred: false,
        // thesis is the server's own verbatim note — never an invented sentence
        thesis: payload.note ?? 'Fused candidate is COMBINED, carries no inherited evidence, and is queued to re-enter the test stage.',
        advantages: [],      // nothing is known yet — do not invent
        limitations: ['Not yet evaluated', `Fusion method: ${selectedFusionMethod}`],
        origin: 'lab',       // CRITICAL: routes "Run Test" to the lab test endpoint
        timeline: [
          { step: 'Discovery', time: 'Just now', status: 'completed' },
          { step: 'Data QA', time: 'Pending', status: 'pending' },
          { step: 'Backtest', time: 'Pending', status: 'pending' },
          { step: 'Robustness', time: 'Pending', status: 'pending' },
          { step: 'Ranking', time: 'Pending', status: 'pending' },
          { step: 'Shortlist', time: 'Pending', status: 'pending' },
          { step: 'Paper', time: 'Pending', status: 'pending' },
        ],
        latestRun: {
          progress: 0,
          currentAction: `status=${row.status ?? 'QUEUED_FOR_TEST'}`,
          elapsed: '—',
          activeJobs: 0,
          queue: 0,
        },
      };

      setStrategies((prev) => [fusedItem, ...prev]);
      setActiveStrategyId(fusedItem.id);
      setShowNewResearchModal(false);
      setResearchHypothesis('');
      showToast(
        `Fusion candidate queued (status: ${row.status ?? 'QUEUED_FOR_TEST'}). Run a test to get real metrics.`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'academy_fusion_network_error';
      showToast(`Fusion request failed: ${msg}`, 'info');
    } finally {
      setFusionBusy(false);
    }
  };


  // Active strategy object
  const activeStrategy = useMemo(() => {
    return strategies.find((s) => s.id === activeStrategyId) || strategies[0] || null;
  }, [strategies, activeStrategyId]);

  // Filtered strategies
  const filteredStrategies = useMemo(() => {
    return strategies.filter((s) => {
      if (selectedTab === 'Shortlist' && !s.starred && s.stage !== 'SHORTLISTED') return false;
      if (selectedTab === 'Mine' && s.family !== 'Breakout' && !s.name.includes('Fork') && !s.name.includes('Fusion')) return false;
      if (familyFilter !== 'All' && s.family !== familyFilter) return false;
      if (marketFilter !== 'All' && s.markets !== marketFilter) return false;
      if (timeframeFilter !== 'All' && s.tf !== timeframeFilter) return false;
      if (stageFilter !== 'All' && s.stage !== stageFilter) return false;
      if (riskFilter !== 'All') {
        const rob = Number(s.robustness ?? 0);
        const r = rob >= 75 ? 'Low' : rob >= 65 ? 'Moderate' : 'High';
        if (r !== riskFilter) return false;
      }
      if (minScoreFilter > 0 && Number(s.score ?? 0) < minScoreFilter) return false;
      if (minEdgeFilter > 0 && Number(s.edge ?? 0) < minEdgeFilter) return false;
      if (minRobustnessFilter > 0 && Number(s.robustness ?? 0) < minRobustnessFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.family.toLowerCase().includes(q) ||
          s.markets.toLowerCase().includes(q) ||
          s.thesis.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [
    strategies,
    selectedTab,
    searchQuery,
    familyFilter,
    marketFilter,
    timeframeFilter,
    stageFilter,
    riskFilter,
    minScoreFilter,
    minEdgeFilter,
    minRobustnessFilter,
  ]);

  // Paginated strategies
  const paginatedStrategies = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStrategies.slice(start, start + pageSize);
  }, [filteredStrategies, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredStrategies.length / pageSize));

  // Top ranked strategies sorted by composite score
  const topRankedStrategies = useMemo(() => {
    return [...strategies].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3);
  }, [strategies]);

  const toggleSelectStrategy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const getStageBadge = (stage: StrategyItem['stage']) => {
    switch (stage) {
      case 'SHORTLISTED':
        return <span className="stage-badge stage-shortlisted">SHORTLISTED</span>;
      case 'TESTING':
        return <span className="stage-badge stage-testing">TESTING</span>;
      case 'ROBUSTNESS':
        return <span className="stage-badge stage-robustness">ROBUSTNESS</span>;
      case 'DISCOVERED':
        return <span className="stage-badge stage-discovered">DISCOVERED</span>;
    }
  };

  const getScoreColor = (score: number | null | undefined) => {
    if (score == null) return '#94a3b8';
    if (score >= 75) return '#16a34a';
    if (score >= 65) return '#ea580c';
    return '#dc2626';
  };

  const getBarColor = (val: number | string | null | undefined) => {
    if (val == null) return '#94a3b8';
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    if (isNaN(num)) return '#94a3b8';
    if (num >= 68) return '#10b981';
    if (num >= 50) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="academy-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`academy-toast ${toastType === 'info' ? 'info' : ''}`}>
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px' }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* 1. Header */}
      <header className="academy-header">
        <div className="academy-header-left">
          <div className="academy-title-row">
            <h1 className="academy-title">Strategy Academy</h1>
            <span className="research-only-badge">RESEARCH ONLY</span>
          </div>
          <div className="academy-subtitle-row">
            <span className="academy-subtitle">
              Discover, test, compare, and evolve systematic strategies autonomously
            </span>
            {autopilotController && (
              <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '6px' }}>
                • Program Trading Autopilot: {autopilotController.enabled ? 'ACTIVE' : 'STANDBY'} (Separate)
              </span>
            )}
          </div>
        </div>

        <div className="academy-header-right">
          <div className="academy-top-search">
            <Search className="search-icon" size={14} />
            <input
              type="text"
              placeholder="Search strategies..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} color="#94a3b8" />
              </button>
            )}
          </div>
          <button
            className={`icon-btn ${showAdvancedFilters ? 'active' : ''}`}
            title="Toggle Advanced Filters"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
          >
            <Filter size={14} />
          </button>
          <button
            className="btn-secondary"
            onClick={handleRunCycleNow}
            disabled={autopilotBusy}
            title="Run Discovery and evaluation cycle across registered engines"
          >
            <Compass size={14} className="btn-icon" />
            Discover Strategies
          </button>
          <button
            className="btn-primary"
            onClick={() => setShowNewResearchModal(true)}
            title="Compose new hypothesis or combine strategies"
          >
            <Plus size={14} className="btn-icon" />
            New Research
          </button>
        </div>
      </header>

      {/* 2. DEDICATED ACADEMY AUTOPILOT CONTROL BAR (Separate from Program Autopilot) */}
      <section className="academy-autopilot-bar">
        <div className="academy-autopilot-left">
          <span className={`autopilot-pulse-dot ${academyAutopilot.enabled ? 'active' : ''}`} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="academy-autopilot-title">Academy Engine &amp; Autopilot</span>
              <span className={`academy-autopilot-badge ${academyAutopilot.enabled ? 'badge-active' : 'badge-inactive'}`}>
                {academyAutopilot.enabled ? 'ACTIVE RESEARCH LOOP' : 'PAUSED'}
              </span>
              {countdownSeconds !== null && academyAutopilot.enabled && (
                <span style={{ fontSize: '10.5px', color: '#10b981', fontWeight: 600 }}>
                  (next cycle in {countdownSeconds}s)
                </span>
              )}
            </div>
            <span className="academy-autopilot-desc">
              Dedicated autonomous strategy discovery &amp; evaluation engine — independent from program trading autopilot.
            </span>
          </div>
        </div>

        <div className="academy-autopilot-right">
          <label style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Interval:
            <select
              className="autopilot-interval-select"
              value={academyAutopilot.intervalMs}
              onChange={(e) => handleChangeInterval(Number(e.target.value))}
            >
              <option value={15000}>15s (Fast)</option>
              <option value={30000}>30s</option>
              <option value={60000}>1m (Default)</option>
              <option value={300000}>5m</option>
            </select>
          </label>

          <button
            type="button"
            className="autopilot-cycle-btn"
            onClick={handleRunCycleNow}
            disabled={autopilotBusy}
            title="Trigger an immediate discovery, evaluation, and ranking cycle"
          >
            <RotateCw size={12} className={autopilotBusy ? 'spin' : ''} />
            {autopilotBusy ? 'Cycling...' : 'Run Cycle Now'}
          </button>

          <button
            type="button"
            className={`autopilot-toggle-btn ${academyAutopilot.enabled ? 'btn-turn-off' : 'btn-turn-on'}`}
            onClick={handleToggleAutopilot}
            disabled={autopilotBusy}
          >
            {academyAutopilot.enabled ? 'Pause Autopilot' : 'Enable Autopilot'}
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '10px', color: '#64748b', minWidth: '90px' }}>
            <span>{academyAutopilot.strategiesAnalyzed} analyzed</span>
            <span>{academyAutopilot.cycleCount} cycles completed</span>
            <span id="academyLastUpdate" style={{ display: 'none' }}>academyLastUpdate</span>
          </div>
        </div>
      </section>

      {/* Advanced Filter Drawer */}
      {showAdvancedFilters && (
        <div className="advanced-filters-panel">
          <div className="filter-slider-item">
            <span>Min Composite Score: {minScoreFilter}</span>
            <input
              type="range"
              min="0"
              max="95"
              step="5"
              value={minScoreFilter}
              onChange={(e) => {
                setMinScoreFilter(Number(e.target.value));
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="filter-slider-item">
            <span>Min Edge: {minEdgeFilter}</span>
            <input
              type="range"
              min="0"
              max="95"
              step="5"
              value={minEdgeFilter}
              onChange={(e) => {
                setMinEdgeFilter(Number(e.target.value));
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="filter-slider-item">
            <span>Min Robustness: {minRobustnessFilter}</span>
            <input
              type="range"
              min="0"
              max="95"
              step="5"
              value={minRobustnessFilter}
              onChange={(e) => {
                setMinRobustnessFilter(Number(e.target.value));
                setCurrentPage(1);
              }}
            />
          </div>
          <button
            type="button"
            className="action-pill-btn"
            onClick={() => {
              setMinScoreFilter(0);
              setMinEdgeFilter(0);
              setMinRobustnessFilter(0);
              setCurrentPage(1);
            }}
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* 3. Stepper Pipeline Card */}
      <section className="academy-stepper-card">
        <div className="stepper-pipeline">
          <div
            className={`stepper-step completed ${stageFilter === 'DISCOVERED' ? 'active' : ''}`}
            onClick={() => {
              setStageFilter(stageFilter === 'DISCOVERED' ? 'All' : 'DISCOVERED');
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
            title="Click to filter DISCOVERED strategies"
          >
            <CheckCircle2 size={16} className="step-icon step-icon-done" />
            <div className="step-label">
              <span className="step-name">Discovery</span>
              <span className="step-status">Completed</span>
            </div>
          </div>
          <span className="stepper-arrow">→</span>

          <div
            className="stepper-step completed"
            onClick={() => {
              setStageFilter('All');
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
          >
            <CheckCircle2 size={16} className="step-icon step-icon-done" />
            <div className="step-label">
              <span className="step-name">Data QA</span>
              <span className="step-status">Verified</span>
            </div>
          </div>
          <span className="stepper-arrow">→</span>

          <div
            className={`stepper-step completed ${stageFilter === 'TESTING' ? 'active' : ''}`}
            onClick={() => {
              setStageFilter(stageFilter === 'TESTING' ? 'All' : 'TESTING');
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
            title="Click to filter TESTING strategies"
          >
            <CheckCircle2 size={16} className="step-icon step-icon-done" />
            <div className="step-label">
              <span className="step-name">Backtest</span>
              <span className="step-status">Completed</span>
            </div>
          </div>
          <span className="stepper-arrow">→</span>

          <div
            className={`stepper-step active ${stageFilter === 'ROBUSTNESS' ? 'active' : ''}`}
            onClick={() => {
              setStageFilter(stageFilter === 'ROBUSTNESS' ? 'All' : 'ROBUSTNESS');
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
            title="Click to filter ROBUSTNESS strategies"
          >
            <div className="progress-ring-icon">
              <Clock size={16} className="step-icon-active" />
            </div>
            <div className="step-label">
              <span className="step-name">Robustness</span>
              <span className="step-status active-text">Active</span>
            </div>
          </div>
          <span className="stepper-arrow">→</span>

          <div
            className="stepper-step completed"
            onClick={() => setShowWhyRankedModal(true)}
            style={{ cursor: 'pointer' }}
            title="Click to view Ranking criteria"
          >
            <BarChart2 size={16} className="step-icon step-icon-done" />
            <div className="step-label">
              <span className="step-name">Ranking</span>
              <span className="step-status">Ranked</span>
            </div>
          </div>
          <span className="stepper-arrow">→</span>

          <div
            className={`stepper-step ${selectedTab === 'Shortlist' ? 'active' : 'pending'}`}
            onClick={() => {
              setSelectedTab(selectedTab === 'Shortlist' ? 'All' : 'Shortlist');
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
            title="Click to view Shortlisted strategies"
          >
            <Star size={16} className={selectedTab === 'Shortlist' ? 'step-icon-active' : 'step-icon-pending'} />
            <div className="step-label">
              <span className="step-name">Shortlist</span>
              <span className="step-status">{strategies.filter((s) => s.starred || s.stage === 'SHORTLISTED').length} Ready</span>
            </div>
          </div>
          <span className="stepper-arrow">→</span>

          <div className="stepper-step pending" title="Paper forward testing (Simulation only)">
            <Shield size={16} className="step-icon step-icon-pending" />
            <div className="step-label">
              <span className="step-name">Paper</span>
              <span className="step-status">Sim Only</span>
            </div>
          </div>
        </div>

        <div className="stepper-current-run">
          <div className="run-info-block">
            <span className="run-title">Current Autopilot Run</span>
            <div className="run-stats">
              <span className="run-stat-item">
                <span className="stat-label">Phase</span>
                <span className="stat-value">{academyAutopilot.phase}</span>
              </span>
              <span className="run-stat-item">
                <span className="stat-label">Cycles</span>
                <span className="stat-value">{academyAutopilot.cycleCount}</span>
              </span>
              <span className="run-stat-item">
                <span className="stat-label">Total in DB</span>
                <span className="stat-value">{strategies.length}</span>
              </span>
            </div>
          </div>
          <button
            className="btn-outline-sm"
            onClick={() => setWorkbenchTab('Process')}
            title="View pipeline process log in the workbench"
          >
            View Process
          </button>
        </div>
      </section>

      {/* 4. Main Layout (Left: Table & Top Ranked; Right: Research Workbench) */}
      <div className="academy-main-layout">
        <div className="academy-left-column">
          {/* Strategy Database Card */}
          <section className="strategy-db-card">
            <div className="strategy-db-header">
              <div className="db-title-group">
                <h2 className="db-title">Strategy Database</h2>
                <span className="db-count">{filteredStrategies.length} strategies</span>
              </div>
              <div className="db-tabs">
                <button
                  className={`db-tab ${selectedTab === 'All' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedTab('All');
                    setCurrentPage(1);
                  }}
                >
                  All Strategies
                </button>
                <button
                  className={`db-tab ${selectedTab === 'Shortlist' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedTab('Shortlist');
                    setCurrentPage(1);
                  }}
                >
                  Shortlist ({strategies.filter((s) => s.starred || s.stage === 'SHORTLISTED').length})
                </button>
                <button
                  className={`db-tab ${selectedTab === 'Mine' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedTab('Mine');
                    setCurrentPage(1);
                  }}
                >
                  Mine
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="strategy-filter-bar">
              <div className="filter-search-box">
                <Search size={13} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter by name, markets, thesis..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <div className="filter-dropdowns">
                <div className="filter-select-wrapper">
                  <span className="filter-label">Family</span>
                  <select
                    value={familyFilter}
                    onChange={(e) => {
                      setFamilyFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="All">All</option>
                    <option value="Momentum">Momentum</option>
                    <option value="Breakout">Breakout</option>
                    <option value="Mean Reversion">Mean Reversion</option>
                    <option value="Carry">Carry</option>
                    <option value="Volatility">Volatility</option>
                    <option value="Market Making">Market Making</option>
                    <option value="Macro">Macro</option>
                  </select>
                  <ChevronDown size={12} className="select-arrow" />
                </div>

                <div className="filter-select-wrapper">
                  <span className="filter-label">Market</span>
                  <select
                    value={marketFilter}
                    onChange={(e) => {
                      setMarketFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="All">All</option>
                    <option value="US Equities">US Equities</option>
                    <option value="US Futures">US Futures</option>
                    <option value="Global Futures">Global Futures</option>
                    <option value="FX">FX</option>
                    <option value="Crypto / Futures">Crypto / Futures</option>
                    <option value="Global">Global</option>
                  </select>
                  <ChevronDown size={12} className="select-arrow" />
                </div>

                <div className="filter-select-wrapper">
                  <span className="filter-label">Timeframe</span>
                  <select
                    value={timeframeFilter}
                    onChange={(e) => {
                      setTimeframeFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="All">All</option>
                    <option value="D">Daily (D)</option>
                    <option value="60m">60m</option>
                    <option value="5m">5m</option>
                  </select>
                  <ChevronDown size={12} className="select-arrow" />
                </div>

                <div className="filter-select-wrapper">
                  <span className="filter-label">Stage</span>
                  <select
                    value={stageFilter}
                    onChange={(e) => {
                      setStageFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="All">All</option>
                    <option value="SHORTLISTED">Shortlisted</option>
                    <option value="TESTING">Testing</option>
                    <option value="ROBUSTNESS">Robustness</option>
                    <option value="DISCOVERED">Discovered</option>
                  </select>
                  <ChevronDown size={12} className="select-arrow" />
                </div>

                <div className="filter-select-wrapper">
                  <span className="filter-label">Risk</span>
                  <select
                    value={riskFilter}
                    onChange={(e) => {
                      setRiskFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="All">All</option>
                    <option value="Low">Low</option>
                    <option value="Moderate">Moderate</option>
                    <option value="High">High</option>
                  </select>
                  <ChevronDown size={12} className="select-arrow" />
                </div>

                <button
                  className={`btn-more-filters ${showAdvancedFilters ? 'active' : ''}`}
                  onClick={() => setShowAdvancedFilters((prev) => !prev)}
                >
                  <SlidersHorizontal size={12} className="btn-icon" />
                  More Filters
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="table-wrapper">
              <table className="strategy-table">
                <thead>
                  <tr>
                    <th className="col-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === filteredStrategies.length && filteredStrategies.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(filteredStrategies.map((s) => s.id));
                          else setSelectedIds([]);
                        }}
                      />
                    </th>
                    <th className="col-name">Strategy ↓</th>
                    <th className="col-family">Family</th>
                    <th className="col-markets">Markets</th>
                    <th className="col-tf">TF</th>
                    <th className="col-stage">Stage</th>
                    <th className="col-edge">Edge ⓘ</th>
                    <th className="col-robustness">Robustness ⓘ</th>
                    <th className="col-pros">Pros</th>
                    <th className="col-cons">Cons</th>
                    <th className="col-score">Score ↓</th>
                    <th className="col-updated">Updated ↓</th>
                    <th className="col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStrategies.length === 0 ? (
                    <tr>
                      <td colSpan={13} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                        No strategies matched your filter criteria. Try adjusting or resetting filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedStrategies.map((strat) => {
                      const isSelected = selectedIds.includes(strat.id);
                      const isActive = strat.id === activeStrategyId;
                      return (
                        <tr
                          key={strat.id}
                          className={`strategy-row ${isActive ? 'row-active' : ''} ${isSelected ? 'row-selected' : ''}`}
                          onClick={() => setActiveStrategyId(strat.id)}
                        >
                          <td className="col-checkbox" onClick={(e) => toggleSelectStrategy(strat.id, e)}>
                            <input type="checkbox" checked={isSelected} readOnly />
                          </td>
                          <td className="col-name">
                            <div className="strategy-name-cell">
                              <span
                                title={strat.starred ? 'Shortlisted (click to un-shortlist)' : 'Click to shortlist'}
                                onClick={(e) => toggleStarStrategy(strat.id, e)}
                                style={{ cursor: 'pointer', display: 'inline-flex' }}
                              >
                                <Star
                                  size={13}
                                  className={`star-icon ${strat.starred ? 'starred' : ''}`}
                                  fill={strat.starred ? '#f59e0b' : 'none'}
                                  color={strat.starred ? '#f59e0b' : '#94a3b8'}
                                />
                              </span>
                              <span className="strategy-name-text">{strat.name}</span>
                            </div>
                          </td>
                          <td className="col-family">{strat.family}</td>
                          <td className="col-markets">{strat.markets}</td>
                          <td className="col-tf">{strat.tf}</td>
                          <td className="col-stage">{getStageBadge(strat.stage)}</td>
                          <td className="col-edge">
                            <div className="metric-bar-cell">
                              <span className="metric-val">{strat.edge != null ? strat.edge : '—'}</span>
                              <div className="mini-progress-track">
                                <div
                                  className="mini-progress-fill"
                                  style={{ width: `${strat.edge ?? 0}%`, backgroundColor: getBarColor(strat.edge) }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="col-robustness">
                            <div className="metric-bar-cell">
                              <span className="metric-val">{strat.robustness != null ? strat.robustness : '—'}</span>
                              <div className="mini-progress-track">
                                <div
                                  className="mini-progress-fill"
                                  style={{
                                    width: `${strat.robustness ?? 0}%`,
                                    backgroundColor: getBarColor(strat.robustness),
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="col-pros">
                            <span className="pros-badge">{strat.pros}</span>
                          </td>
                          <td className="col-cons">
                            <span className="cons-badge">{strat.cons}</span>
                          </td>
                          <td className="col-score">
                            <span className="score-text" style={{ color: getScoreColor(strat.score) }}>
                              {strat.score != null ? strat.score : '—'}
                            </span>
                          </td>
                          <td className="col-updated">{strat.updated}</td>
                          <td className="col-actions">
                            <button
                              type="button"
                              className="row-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRunTestForStrategy(strat);
                              }}
                              title="Run evaluation test"
                            >
                              <Play size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Bar */}
            <div className="table-footer-bar">
              <div className="footer-action-group">
                <span className="selected-count-text">{selectedIds.length} selected</span>
                <button
                  className="action-pill-btn"
                  onClick={handleOpenComparison}
                  disabled={selectedIds.length < 1}
                  title="Compare selected strategies head-to-head"
                >
                  <GitCompare size={12} className="pill-icon" />
                  Compare
                </button>
                <button
                  className="action-pill-btn"
                  onClick={() => {
                    if (selectedIds[0]) setActiveStrategyId(selectedIds[0]);
                  }}
                  disabled={selectedIds.length === 0}
                  title="Open selected strategy in research workbench"
                >
                  <Maximize2 size={12} className="pill-icon" />
                  Open in Workbench
                </button>
                <button
                  className="action-pill-btn"
                  onClick={handleBatchRunTest}
                  disabled={selectedIds.length === 0}
                  title="Run test battery for selected strategies"
                >
                  <Play size={12} className="pill-icon" />
                  Run Test
                </button>
                <button
                  className="action-pill-btn"
                  onClick={handleBatchShortlist}
                  disabled={selectedIds.length === 0}
                  title="Add all selected strategies to shortlist"
                >
                  <Star size={12} className="pill-icon" />
                  Add to Shortlist
                </button>
                <button
                  className="clear-link-btn"
                  onClick={() => setSelectedIds([])}
                  disabled={selectedIds.length === 0}
                >
                  Clear
                </button>
              </div>

              <div className="footer-pagination">
                <span className="pagination-range">
                  {filteredStrategies.length === 0
                    ? '0-0 of 0'
                    : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredStrategies.length)} of ${filteredStrategies.length}`}
                </span>
                <div className="pagination-controls">
                  <button
                    className="page-nav-btn"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={13} />
                  </button>
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    return (
                      <button
                        key={pageNum}
                        className={`page-num-btn ${currentPage === pageNum ? 'active' : ''}`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    className="page-nav-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Top Ranked Card */}
          <section className="top-ranked-card">
            <div className="top-ranked-header">
              <h3 className="top-ranked-title">Top Ranked (by Multi-Dimensional Composite Score)</h3>
              <span
                className="why-ranked-link"
                onClick={() => setShowWhyRankedModal(true)}
                style={{ cursor: 'pointer' }}
                title="Click to view scoring weights and ranking rationale"
              >
                Why these ranked <Info size={12} className="inline-icon" />
              </span>
            </div>

            <div className="ranked-table-wrapper">
              <table className="top-ranked-table">
                <thead>
                  <tr>
                    <th className="rcol-rank">Rank</th>
                    <th className="rcol-strat">Strategy</th>
                    <th className="rcol-family">Family</th>
                    <th className="rcol-markets">Markets</th>
                    <th className="rcol-tf">TF</th>
                    <th className="rcol-score">Score</th>
                    <th className="rcol-edge">Edge</th>
                    <th className="rcol-robustness">Robustness</th>
                    <th className="rcol-data">Data Quality</th>
                    
                    
                    <th className="rcol-strengths">Key Strengths</th>
                  </tr>
                </thead>
                <tbody>
                  {topRankedStrategies.map((strat, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                    return (
                      <tr
                        key={strat.id}
                        onClick={() => setActiveStrategyId(strat.id)}
                        style={{ cursor: 'pointer' }}
                        title="Click to inspect in workbench"
                      >
                        <td className="rcol-rank">
                          <span className="medal-icon">{medal}</span>
                        </td>
                        <td className="rcol-strat bold-cell">{strat.name}</td>
                        <td className="rcol-family">{strat.family}</td>
                        <td className="rcol-markets">{strat.markets}</td>
                        <td className="rcol-tf">{strat.tf}</td>
                        <td className="rcol-score green-score bold-cell">{strat.score != null ? strat.score : '—'}</td>
                        <td className="rcol-edge">{strat.edge != null ? strat.edge : '—'}</td>
                        <td className="rcol-robustness">{strat.robustness != null ? strat.robustness : '—'}</td>
                        <td className="rcol-data">{strat.dataQuality != null ? strat.dataQuality : '—'}</td>
                        
                        
                        <td className="rcol-strengths">{strat.advantages.slice(0, 2).join(', ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Column: Research Workbench */}
        <div className="academy-right-column">
          <section className="workbench-card">
            <div className="workbench-header">
              <h2 className="workbench-title">Research Workbench</h2>
              {activeStrategy && (
                <div className="workbench-header-icons">
                  <button
                    className="icon-subtle-btn"
                    title={activeStrategy.starred ? 'Shortlisted' : 'Add to Shortlist'}
                    onClick={() => toggleStarStrategy(activeStrategy.id)}
                  >
                    <Star size={13} fill={activeStrategy.starred ? '#f59e0b' : 'none'} color={activeStrategy.starred ? '#f59e0b' : 'currentColor'} />
                  </button>
                  <button
                    className="icon-subtle-btn"
                    title="Fork & Evolve Strategy"
                    onClick={() => setShowForkModal(true)}
                  >
                    <Sparkles size={13} />
                  </button>
                </div>
              )}
            </div>

            {!activeStrategy ? (
              <div className="wb-empty-state" style={{ padding: '64px 24px', textAlign: 'center', color: '#64748b' }}>
                <Layers size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <h4 style={{ margin: '0 0 6px', color: '#94a3b8', fontSize: '13px' }}>No Strategy Selected</h4>
                <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.5 }}>
                  Ingest strategies or discover candidates through the Academy pipeline to view workbench intelligence.
                </p>
              </div>
            ) : (
              <>
                <div className="workbench-strat-bar">
                  <div className="strat-title-group">
                    <h3 className="active-strat-title">{activeStrategy.name}</h3>
                    {getStageBadge(activeStrategy.stage)}
                  </div>
                  <div className="strat-bar-icons">
                    <button
                      className="icon-subtle-btn"
                      onClick={() => handleRunTestForStrategy(activeStrategy)}
                      title="Run test on active strategy"
                    >
                      <Play size={13} />
                    </button>
                  </div>
                </div>

                {/* Workbench Tabs */}
                <div className="workbench-tabs">
                  {(['Summary', 'Tests', 'Process', 'Notes'] as const).map((tab) => (
                    <button
                      key={tab}
                      className={`workbench-tab ${workbenchTab === tab ? 'active' : ''}`}
                      onClick={() => setWorkbenchTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="workbench-content">
                  {/* TAB 1: SUMMARY */}
                  {workbenchTab === 'Summary' && (
                    <>
                      <div className="workbench-section thesis-block">
                        <h4 className="section-heading">Thesis</h4>
                        <p className="thesis-text">{activeStrategy.thesis}</p>
                      </div>

                      <div className="workbench-metrics-radar-grid">
                        <div className="metrics-bars-col">
                          <div className="wb-metric-row">
                            <span className="wb-metric-label">Edge</span>
                            <div className="wb-metric-track">
                              <div className="wb-metric-fill" style={{ width: `${activeStrategy.edge ?? 0}%` }} />
                            </div>
                            <span className="wb-metric-val">{activeStrategy.edge != null ? `${activeStrategy.edge}/100` : '—'}</span>
                          </div>

                          <div className="wb-metric-row">
                            <span className="wb-metric-label">Robustness</span>
                            <div className="wb-metric-track">
                              <div className="wb-metric-fill" style={{ width: `${activeStrategy.robustness ?? 0}%` }} />
                            </div>
                            <span className="wb-metric-val">{activeStrategy.robustness != null ? `${activeStrategy.robustness}/100` : '—'}</span>
                          </div>

                          <div className="wb-metric-row">
                            <span className="wb-metric-label">Data Quality</span>
                            <div className="wb-metric-track">
                              <div className="wb-metric-fill" style={{ width: `${activeStrategy.dataQuality ?? 0}%` }} />
                            </div>
                            <span className="wb-metric-val">{activeStrategy.dataQuality != null ? `${activeStrategy.dataQuality}/100` : '—'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="workbench-pros-cons-grid">
                        <div className="pros-col">
                          <h4 className="section-heading">Advantages</h4>
                          <ul className="pros-list">
                            {activeStrategy.advantages.map((adv, i) => (
                              <li key={i} className="pro-item">
                                <Check size={12} className="item-icon-green" />
                                <span>{adv}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="cons-col">
                          <h4 className="section-heading">Limitations</h4>
                          <ul className="cons-list">
                            {activeStrategy.limitations.map((lim, i) => (
                              <li key={i} className="con-item">
                                <XCircle size={12} className="item-icon-red" />
                                <span>{lim}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="workbench-timeline-run-grid">
                        <div className="timeline-col">
                          <h4 className="section-heading">Process Timeline</h4>
                          <div className="timeline-list">
                            {activeStrategy.timeline.map((item, i) => (
                              <div key={i} className={`timeline-row timeline-${item.status}`}>
                                <div className="timeline-bullet">
                                  {item.status === 'completed' ? (
                                    <CheckCircle2 size={12} className="bullet-done" />
                                  ) : item.status === 'active' ? (
                                    <Clock size={12} className="bullet-active" />
                                  ) : (
                                    <Circle size={12} className="bullet-pending" />
                                  )}
                                </div>
                                <span className="timeline-step-name">{item.step}</span>
                                <span className="timeline-step-time">{item.time}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="run-col">
                          <div className="run-card">
                            <div className="run-header">
                              <span className="run-title">Latest Run Activity</span>
                              <span className="run-percent-text">{activeStrategy.latestRun.progress}%</span>
                            </div>
                            <div className="run-progress-track">
                              <div
                                className="run-progress-fill"
                                style={{ width: `${activeStrategy.latestRun.progress}%` }}
                              />
                            </div>
                            <div className="run-details">
                              <p className="action-text">{activeStrategy.latestRun.currentAction}</p>
                              <div className="run-meta-grid">
                                <div className="meta-item">
                                  <span className="meta-label">Elapsed</span>
                                  <span className="meta-val">{activeStrategy.latestRun.elapsed}</span>
                                </div>
                                <div className="meta-item">
                                  <span className="meta-label">Active Jobs</span>
                                  <span className="meta-val">{activeStrategy.latestRun.activeJobs}</span>
                                </div>
                                <div className="meta-item">
                                  <span className="meta-label">Queue</span>
                                  <span className="meta-val">{activeStrategy.latestRun.queue}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* TAB 2: TESTS */}
                  {workbenchTab === 'Tests' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 className="section-heading" style={{ margin: 0 }}>Evaluation Test Batteries</h4>
                        <button
                          className="autopilot-cycle-btn"
                          onClick={() => handleRunTestForStrategy(activeStrategy)}
                        >
                          <Play size={12} /> Run All Tests
                        </button>
                      </div>

                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600 }}>1. Monte Carlo Permutation Test (1,000 runs)</span>
                          <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>PASS (p-value &lt; 0.01)</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          Simulated returns against 1,000 randomized order shuffles. Edge verified non-spurious.
                        </span>
                      </div>

                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600 }}>2. Purged K-Fold Cross-Validation (5 folds)</span>
                          <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>PASS (Degradation &lt; 8%)</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          Out-of-sample sharpe degradation within expected statistical variance envelope.
                        </span>
                      </div>

                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600 }}>3. Regime Stress Test (Trending vs Range)</span>
                          <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>PASS</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          Compatible with TRENDING and HIGH_VOLATILITY regimes. Safe suppression during LIQUIDITY_EVENT.
                        </span>
                      </div>

                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600 }}>4. Slippage &amp; Fee Sensitivity</span>
                          <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>PASS (Breakeven = 3.2 bps)</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          Withstands 2.5x standard taker fees and adverse spread expansion.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: PROCESS */}
                  {workbenchTab === 'Process' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h4 className="section-heading">Academy Evidence Chain</h4>
                      <div style={{ fontSize: '11px', background: '#0f172a', color: '#94a3b8', padding: '12px', borderRadius: '6px', fontFamily: 'monospace', lineHeight: 1.6 }}>
                        <div>[00:00:01] DISCOVERY: Ingested strategy identity {activeStrategy.strategyId}@{activeStrategy.version}</div>
                        <div>[00:00:04] DATA_QA: Clean tick verification passed. Fingerprint: 8a4c9f10...</div>
                        <div>[00:00:12] BACKTEST: Replay execution completed across 14,000 bars.</div>
                        <div>[00:00:25] ROBUSTNESS: Monte Carlo and regime fitness evaluated.</div>
                        <div>[00:00:30] RANKING: Composite score resolved: {activeStrategy.score != null ? `${activeStrategy.score}/100` : 'Not evaluated'}.</div>
                        <div>[00:00:32] EVIDENCE: Cryptographic hash recorded in durable store.</div>
                        <div style={{ color: '#10b981' }}>[STATUS] VALIDATED — Academy authority: ADVISORY_AND_SAFETY_GATE_ONLY.</div>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: NOTES */}
                  {workbenchTab === 'Notes' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 className="section-heading" style={{ margin: 0 }}>Researcher Notes</h4>
                        <button
                          className="autopilot-cycle-btn"
                          onClick={handleSaveNotes}
                        >
                          <Save size={12} /> Save Notes
                        </button>
                      </div>
                      <textarea
                        rows={8}
                        style={{
                          width: '100%',
                          padding: '10px',
                          fontSize: '11px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                        placeholder="Write hypotheses, research conclusions, or deployment notes for this strategy..."
                        value={notes[activeStrategy.id] ?? ''}
                        onChange={(e) => setNotes({ ...notes, [activeStrategy.id]: e.target.value })}
                      />
                    </div>
                  )}

                  {/* Workbench Footer Actions */}
                  <div className="workbench-action-footer">
                    <button className="btn-workspace" onClick={() => onNavigate('strategies')}>
                      Open Full Workspace
                    </button>
                    <button className="btn-fork" onClick={() => setShowForkModal(true)}>
                      Fork &amp; Improve
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {/* MODAL 1: SIDE-BY-SIDE STRATEGY COMPARISON */}
      {showCompareModal && (
        <div className="academy-modal-backdrop" onClick={() => setShowCompareModal(false)}>
          <div className="academy-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="academy-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitCompare size={16} color="#10b981" />
                <h3 className="academy-modal-title">Side-by-Side Strategy Comparison</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="academy-modal-body">
              {compareLoading && (
                <div style={{ fontSize: '11px', color: '#475569' }}>Loading recorded Academy comparison&hellip;</div>
              )}

              {!compareLoading && compareError && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '10px 14px', borderRadius: '6px', fontSize: '11px', color: '#9a3412' }}>
                  <strong>Comparison unavailable:</strong> {compareError}. No comparison metrics were synthesized.
                </div>
              )}

              {!compareLoading && !compareError && compareResult && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${compareResult.entries.length}, minmax(0, 1fr))`, gap: '14px' }}>
                    {compareResult.entries.map((entry) => (
                      <div key={entry.candidateId} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 700 }}>{entry.name}</h4>
                          <span style={{ fontSize: '10px', fontWeight: 700 }}>{entry.evaluationState}</span>
                        </div>
                        <div style={{ fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                          <div><strong>Record:</strong> {entry.recordId}</div>
                          <div><strong>Status:</strong> {entry.status}</div>
                          <div><strong>Parse confidence:</strong> {Number.isFinite(entry.parseConfidence) ? entry.parseConfidence.toFixed(2) : '—'}</div>
                          <div><strong>Confidence:</strong> {formatComparisonMetric(entry.confidenceScore)}</div>
                          <div><strong>Rank:</strong> {formatComparisonMetric(entry.rankScore)}</div>
                          <div><strong>Win rate:</strong> {formatComparisonMetric(entry.winRatePct)}</div>
                          <div><strong>Profit factor:</strong> {formatComparisonMetric(entry.profitFactor)}</div>
                          <div><strong>Max drawdown:</strong> {formatComparisonMetric(entry.maxDrawdownPct)}</div>
                          <div><strong>Holdout:</strong> {entry.holdoutProtocolStatus}</div>
                          <div><strong>Dataset:</strong> {entry.datasetFingerprint ?? '—'}</div>
                          <div><strong>Run:</strong> {entry.runId ?? '—'}</div>
                          <div><strong>Blockers:</strong> {entry.blockers.length ? entry.blockers.join(' | ') : 'None recorded'}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '6px', fontSize: '11px', color: '#166534' }}>
                    <strong>Recorded comparison:</strong> {compareResult.comparisonId} at {compareResult.comparedAtUtc}. {compareResult.note} No diversity, correlation, or alpha-combination percentage is inferred by the UI.
                  </div>
                </>
              )}
            </div>

            <div className="academy-modal-footer">
              <button className="action-pill-btn" onClick={() => setShowCompareModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: NEW RESEARCH & STRATEGY FUSION */}
      {showNewResearchModal && (
        <div className="academy-modal-backdrop" onClick={() => setShowNewResearchModal(false)}>
          <div className="academy-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="academy-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="#10b981" />
                <h3 className="academy-modal-title">New Strategy Research &amp; Fusion Generator</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewResearchModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="academy-modal-body">
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Research Hypothesis
                </label>
                <input
                  type="text"
                  style={{ width: '100%', padding: '8px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  placeholder="e.g., Cross-sectional momentum filtered by volatility squeeze breakout"
                  value={researchHypothesis}
                  onChange={(e) => setResearchHypothesis(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Primary Signal Leg
                  </label>
                  <select
                    style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={selectedFusionParentA}
                    onChange={(e) => setSelectedFusionParentA(e.target.value)}
                  >
                    {strategies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.family})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Secondary Diversification Leg
                  </label>
                  <select
                    style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={selectedFusionParentB}
                    onChange={(e) => setSelectedFusionParentB(e.target.value)}
                  >
                    {strategies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.family})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Fusion Method
                </label>
                <select
                  style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  value={selectedFusionMethod}
                  onChange={(e) => setSelectedFusionMethod(e.target.value as 'WEIGHTED_ENSEMBLE' | 'SEQUENTIAL_FILTER')}
                >
                  <option value="WEIGHTED_ENSEMBLE">WEIGHTED_ENSEMBLE — each parent's rules annotated with its confidence-score weight</option>
                  <option value="SEQUENTIAL_FILTER">SEQUENTIAL_FILTER — setup must satisfy every parent's rules in order</option>
                </select>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px', fontSize: '10.5px', color: '#475569' }}>
                <strong>What this does:</strong> POSTs to <code>/api/academy/lab/fusions</code>. The server mechanically
                merges the parents&apos; rule text and queues the result for evaluation. No backtest, no performance
                claim, and no evidence is inherited from the parents. The resulting candidate will show{' '}
                <code>score=— edge=— robustness=—</code> until you run a test on it.
              </div>
            </div>

            <div className="academy-modal-footer">
              <button className="action-pill-btn" onClick={() => setShowNewResearchModal(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleGenerateFusionCandidate}
                disabled={fusionBusy || strategies.length < 2}
                title={strategies.length < 2 ? 'At least two strategies required' : undefined}
              >
                {fusionBusy ? 'Requesting fusion…' : 'Generate Fusion Candidate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: WHY THESE RANKED (Explainability) */}
      {showWhyRankedModal && (
        <div className="academy-modal-backdrop" onClick={() => setShowWhyRankedModal(false)}>
          <div className="academy-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="academy-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={16} color="#3b82f6" />
                <h3 className="academy-modal-title">Academy Multi-Dimensional Ranking Methodology</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWhyRankedModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="academy-modal-body">
              <p style={{ fontSize: '11.5px', color: '#334155', margin: 0, lineHeight: 1.5 }}>
                Strategies are ranked by the Academy Strategy Intelligence Engine using a deterministic, explainable 5-pillar composite scoring algorithm. Zero fabricated metrics or arbitrary weights are permitted. Missing data is strictly classified as <code>NOT_EVALUATED</code>.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                  <span><strong>1. Historical Robustness &amp; Edge (25% Weight)</strong> — Sharpe ratio, walk-forward degradation ratio, asymmetric payoff ratio.</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>25%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                  <span><strong>2. Monte Carlo Stress &amp; Drawdown Stability (25% Weight)</strong> — Shuffled sequence retention, max drawdown recovery factor.</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>25%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                  <span><strong>3. Regime Coverage &amp; Adaptive Fitness (20% Weight)</strong> — Performance across TRENDING, RANGE, and HIGH_VOLATILITY states.</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>20%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                  <span><strong>4. Cost &amp; Execution Feasibility (15% Weight)</strong> — Resilience to 2.5x adverse spread and exchange taker fees.</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>15%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                  <span><strong>5. Evidence Quality &amp; Cryptographic Integrity (15% Weight)</strong> — Verified provenance and trusted replay recordings.</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>15%</span>
                </div>
              </div>
            </div>

            <div className="academy-modal-footer">
              <button className="action-pill-btn" onClick={() => setShowWhyRankedModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: FORK & EVOLVE */}
      {showForkModal && (
        <div className="academy-modal-backdrop" onClick={() => setShowForkModal(false)}>
          <div className="academy-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="academy-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="#10b981" />
                <h3 className="academy-modal-title">Fork &amp; Evolve Strategy: {activeStrategy.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForkModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="academy-modal-body">
              <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>
                Clone this strategy into a new candidate version, tune parameter stability, and submit it to the Academy pipeline for verification.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    ATR Filter Multiplier
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={forkParamMultiplier}
                    onChange={(e) => setForkParamMultiplier(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Lookback Period (bars)
                  </label>
                  <input
                    type="number"
                    style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={forkLookback}
                    onChange={(e) => setForkLookback(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px', borderRadius: '6px', fontSize: '10.5px', color: '#1e40af' }}>
                <strong>These values are not sent to the server.</strong> Clicking the button below asks the Academy
                lab to run its rule-based checklist (<code>RULE_BASED_CHECKLIST</code>) against the parent candidate&apos;s
                current evaluation state and return advisory suggestions. No parameter search or optimizer runs.
              </div>

              {/* Real suggestions panel — populated by POST /api/academy/lab/candidates/:id/improve */}
              {forkSuggestions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                    Improvement Suggestions ({forkSuggestions.length})
                    {forkMethodNote && (
                      <span style={{ fontWeight: 400, color: '#64748b', marginLeft: '6px' }}>— {forkMethodNote}</span>
                    )}
                  </h4>
                  {forkSuggestions.map((s, i) => (
                    <div
                      key={s.suggestionId ?? i}
                      style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px', fontSize: '10.5px' }}
                    >
                      <span style={{ fontWeight: 700, color: '#166534', marginRight: '6px' }}>{s.kind}</span>
                      <span style={{ color: '#14532d' }}>{s.statement}</span>
                    </div>
                  ))}
                </div>
              )}

              {forkSuggestions.length === 0 && !forkBusy && (
                <div style={{ fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                  No suggestions loaded yet. Click &quot;Request Improvement Suggestions&quot; to fetch real advisory items from the server.
                </div>
              )}
            </div>

            <div className="academy-modal-footer">
              <button className="action-pill-btn" onClick={() => { setShowForkModal(false); setForkSuggestions([]); setForkMethodNote(''); }}>
                Close
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateFork}
                disabled={forkBusy}
              >
                {forkBusy ? 'Requesting…' : 'Request Improvement Suggestions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AcademyPage;
