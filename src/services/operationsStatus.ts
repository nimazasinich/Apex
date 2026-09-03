import type { ProviderHealth, ProviderHealthReasonCode } from './providers/supplementalTypes';
import type { LiquidityHunterOperationsSnapshot } from './liquidityHunter/foundationRuntime';

/** Shared operations-status contract schema version. */
export const OPERATIONS_STATUS_SCHEMA_VERSION = 7;

/**
 * Frontend stale threshold: if `generatedAt` is older than this many milliseconds,
 * the UI marks the last response as STALE while still showing last-known values.
 */
export const OPERATIONS_STATUS_STALE_MS = 45_000;

export type ServiceAvailabilityStatus = 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'STALE';
export type ProviderRowStatus = 'HEALTHY' | 'UNHEALTHY' | 'NOT_CONFIGURED' | 'DISABLED' | 'RATE_LIMITED';
export type DecisionMemorySyncStatus = 'SYNC_ENABLED' | 'LOCAL_ONLY' | 'UNAVAILABLE';
export type DatasetBackupOpsStatus = 'SKIPPED' | 'SYNCED' | 'ERROR' | 'EMPTY' | 'UNAVAILABLE';
export type ShadowMlTrainingStatus =
  | 'TRAINED'
  | 'INSUFFICIENT_DATA'
  | 'UNAVAILABLE'
  | 'MALFORMED_REPORT';
export type ShadowMlComparisonStatus =
  | 'COMPARED'
  | 'NO_MODEL'
  | 'INSUFFICIENT_DATA'
  | 'UNAVAILABLE'
  | 'MALFORMED_REPORT';
export type AdaptiveAuditStatus = 'AUDITED' | 'WAITING' | 'UNAVAILABLE';
export type AdaptiveStressStatus = 'PASSED' | 'FAILED' | 'UNAVAILABLE' | 'MALFORMED_REPORT';
export type ProviderRoutingStressStatus = 'PASSED' | 'FAILED' | 'UNAVAILABLE' | 'MALFORMED_REPORT';
export type LoadMatrixStressStatus = 'PASSED' | 'FAILED' | 'UNAVAILABLE' | 'MALFORMED_REPORT';
export type ProviderRoutingOpsState =
  | 'READY'
  | 'DEGRADED'
  | 'RATE_LIMITED'
  | 'GEO_BLOCKED'
  | 'UNSUPPORTED'
  | 'UNAVAILABLE'
  | 'STALE';

export interface OperationsProviderRow {
  name: string;
  category: string;
  status: ProviderRowStatus;
  isConfigured: boolean;
  isHealthy: boolean;
  failureCount: number;
  lastCheckTime: number | null;
  lastSuccessTime: number | null;
  rateLimitedUntil: number | null;
  reason: string | null;
  reasonCode: ProviderHealthReasonCode;
  latencyMs?: number | null;
}

export interface OperationsProviderSummary {
  configuredProviders: number;
  configuredHealthyProviders: number;
  configuredUnhealthyProviders: number;
  unconfiguredProviders: number;
  rateLimitedProviders: string[];
  unhealthyProviders: string[];
}

export interface DecisionMemoryMirrorStats {
  total: number;
  accepted: number;
  rejected: number;
  resolved: number;
  indexed?: {
    ticker: number;
    decision: number;
    reasonCode: number;
    outcome: number;
    timestamp: number;
  };
}

export interface OperationsDecisionMemorySection {
  status: DecisionMemorySyncStatus;
  reason: string | null;
  stats: DecisionMemoryMirrorStats | null;
}

export interface OperationsDatasetSyncSection {
  status: DatasetBackupOpsStatus;
  reason: string | null;
  lastSyncAt: string | null;
  lastRestoreStatus: string | null;
  lastRestoreAt: string | null;
  rowCount: number | null;
}

export interface OperationsAdaptiveAuditSection {
  status: AdaptiveAuditStatus;
  source: 'SERVER_DURABLE';
  reason: string | null;
  activeRevision: number | null;
  revisionCount: number | null;
  proposalCount: number | null;
  pendingProposalCount: number | null;
}

export interface OperationsAdaptiveStressSection {
  status: AdaptiveStressStatus;
  reason: string | null;
  reportGeneratedAt: string | null;
  seed: number | null;
  cycles: number | null;
  totalCandidates: number | null;
  acceptanceRate: number | null;
  passedChecks: number | null;
  totalChecks: number | null;
}

export interface OperationsProviderRoutingStressSection {
  status: ProviderRoutingStressStatus;
  reason: string | null;
  reportGeneratedAt: string | null;
  seed: number | null;
  scenarioCount: number | null;
  passedChecks: number | null;
  totalChecks: number | null;
  observedOpsStates: ProviderRoutingOpsState[];
}

export interface OperationsLoadMatrixReportSection {
  status: LoadMatrixStressStatus;
  reason: string | null;
  reportGeneratedAt: string | null;
  phaseCount: number | null;
  allPass: boolean | null;
  totalRuns: number | null;
  totalCandidates: number | null;
  weightedWinRate: number | null;
}

export interface OperationsLoadMatrixStressSection {
  status: LoadMatrixStressStatus;
  reason: string | null;
  hundredSeed: OperationsLoadMatrixReportSection;
  fastMinute: OperationsLoadMatrixReportSection;
}

export interface OperationsShadowMlTrainingSection {
  status: ShadowMlTrainingStatus;
  reason: string | null;
  datasetGateStatus: string | null;
  completeRows: number | null;
  minorityClassRows: number | null;
  reportGeneratedAt: string | null;
}

export interface OperationsShadowMlComparisonSection {
  status: ShadowMlComparisonStatus;
  reason: string | null;
  modelPresent: boolean;
  rowsScored: number | null;
  disagreementCount: number | null;
  avgConfidenceOnDisagreements: number | null;
  reportGeneratedAt: string | null;
}

export interface OperationsShadowMlSection {
  auditOnly: true;
  training: OperationsShadowMlTrainingSection;
  comparison: OperationsShadowMlComparisonSection;
}

export interface OperationsServiceSection {
  status: ServiceAvailabilityStatus;
  reason: string | null;
}

export type OperationsLiquidityHunterSection = LiquidityHunterOperationsSnapshot;

export interface OperationsMarketDataFallbackSection {
  lastStartedAt: number | null;
  lastCompletedAt: number | null;
  lastDurationMs: number | null;
  requestedRows: number;
  returnedRows: number;
  maxConcurrency: number;
  cacheTtlMs: number;
  cadence: 'DEGRADED_FALLBACK';
  lastError: string | null;
}

export interface OperationsStatusContract {
  schemaVersion: number;
  generatedAt: string;
  service: OperationsServiceSection;
  providers: {
    summary: OperationsProviderSummary;
    items: OperationsProviderRow[];
  };
  decisionMemory: OperationsDecisionMemorySection;
  datasetSync: OperationsDatasetSyncSection;
  marketDataFallback: OperationsMarketDataFallbackSection;
  adaptiveThresholdAudit: OperationsAdaptiveAuditSection;
  adaptiveStress: OperationsAdaptiveStressSection;
  providerRoutingStress: OperationsProviderRoutingStressSection;
  loadMatrixStress: OperationsLoadMatrixStressSection;
  shadowMl: OperationsShadowMlSection;
  liquidityHunter: OperationsLiquidityHunterSection;
}

export interface BuildOperationsStatusInput {
  generatedAt?: string;
  providerHealth: ProviderHealth[];
  decisionMemoryMirrorEnabled: boolean;
  decisionMemoryStats: DecisionMemoryMirrorStats | null;
  datasetSync?: OperationsDatasetSyncSection | null;
  mlShadowDir: string;
  adaptiveStressDir: string;
  providerRoutingDir: string;
  loadMatrix100Dir: string;
  loadMatrixFastDir: string;
  readFile: (filePath: string) => string | null;
  fileExists: (filePath: string) => boolean;
  liquidityHunter?: OperationsLiquidityHunterSection;
  marketDataFallback?: OperationsMarketDataFallbackSection;
  adaptiveThresholdGovernance?: {
    activeRevision: number;
    revisionCount: number;
    proposalCount: number;
    pendingProposalCount: number;
  };
}

export interface BuildOperationsStatusResult {
  ok: true;
  status: OperationsStatusContract;
}

export interface BuildOperationsStatusFailure {
  ok: false;
  status: OperationsStatusContract;
  error: string;
}

const SECRET_FIELD_PATTERN = /(api[_-]?key|secret|token|password|credential|authorization|private[_-]?key)/i;

export function isSecretLikeField(fieldName: string): boolean {
  return SECRET_FIELD_PATTERN.test(fieldName);
}

export function assertNoSecretFields(value: unknown, path = 'root'): string[] {
  const violations: string[] = [];
  if (value === null || value === undefined || typeof value !== 'object') {
    return violations;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      violations.push(...assertNoSecretFields(entry, `${path}[${index}]`));
    });
    return violations;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretLikeField(key)) {
      violations.push(`${path}.${key}`);
    }
    violations.push(...assertNoSecretFields(nested, `${path}.${key}`));
  }
  return violations;
}

export function classifyProviderHealthReason(
  item: ProviderHealth,
  now = Date.now(),
): ProviderHealthReasonCode {
  if (item.isEnabled === false) return 'DISABLED';
  if (!item.isConfigured) return 'NOT_CONFIGURED';
  if (item.rateLimitedUntil && now < item.rateLimitedUntil) return 'RATE_LIMITED';
  if (item.reasonCode) return item.reasonCode;
  if (item.isHealthy) return 'HEALTHY';
  if (item.isConfigured && !item.lastSuccessTime && item.failureCount === 0) return 'NEVER_PROBED';

  const reason = String(item.reason || '').toLowerCase();
  if (/circuit.*open|breaker.*open/.test(reason)) return 'CIRCUIT_OPEN';
  if (/stale|expired|freshness/.test(reason)) return 'STALE';
  if (/schema|invalid[_ -]?(payload|response|contract)|parse/.test(reason)) return 'SCHEMA_INVALID';
  if (/dns|enotfound|eai_again|network|timeout|timed out|unreachable|connection|econn/.test(reason)) return 'DNS_NETWORK_UNAVAILABLE';
  if (/http|forbidden|unauthori|reject|status[_ -]?[45]\d\d/.test(reason)) return 'HTTP_REJECTED';
  return 'PROVIDER_FAILURE';
}

export function normalizeProviderRow(item: ProviderHealth, now = Date.now()): OperationsProviderRow {
  const reasonCode = classifyProviderHealthReason(item, now);
  let status: ProviderRowStatus;
  if (reasonCode === 'DISABLED') status = 'DISABLED';
  else if (reasonCode === 'NOT_CONFIGURED') status = 'NOT_CONFIGURED';
  else if (reasonCode === 'RATE_LIMITED') status = 'RATE_LIMITED';
  else if (reasonCode === 'HEALTHY') status = 'HEALTHY';
  else status = 'UNHEALTHY';

  return {
    name: item.name,
    category: item.category,
    status,
    isConfigured: item.isConfigured,
    isHealthy: reasonCode === 'HEALTHY',
    failureCount: item.failureCount,
    lastCheckTime: item.lastCheckTime ?? null,
    lastSuccessTime: item.lastSuccessTime ?? null,
    rateLimitedUntil: item.rateLimitedUntil ?? null,
    reason: item.reason ?? null,
    reasonCode,
    latencyMs: item.latencyMs ?? null,
  };
}

export function summarizeProviders(items: OperationsProviderRow[]): OperationsProviderSummary {
  const configured = items.filter((item) => item.isConfigured);
  const configuredHealthy = configured.filter((item) => item.isHealthy);
  const configuredUnhealthy = configured.filter((item) => !item.isHealthy);
  const rateLimitedProviders = items
    .filter((item) => item.status === 'RATE_LIMITED')
    .map((item) => item.name);
  const unhealthyProviders = configuredUnhealthy
    .filter((item) => item.status !== 'RATE_LIMITED')
    .map((item) => item.name);

  return {
    configuredProviders: configured.length,
    configuredHealthyProviders: configuredHealthy.length,
    configuredUnhealthyProviders: configuredUnhealthy.length,
    unconfiguredProviders: items.filter((item) => !item.isConfigured).length,
    rateLimitedProviders,
    unhealthyProviders,
  };
}

function readJsonReport(
  readFile: (filePath: string) => string | null,
  filePath: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: 'missing' | 'malformed' } {
  const raw = readFile(filePath);
  if (raw === null) return { ok: false, reason: 'missing' };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'malformed' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseAdaptiveStress(
  readFile: (filePath: string) => string | null,
  reportPath: string,
): OperationsAdaptiveStressSection {
  const report = readJsonReport(readFile, reportPath);
  if (report.ok === false) {
    return {
      status: report.reason === 'malformed' ? 'MALFORMED_REPORT' : 'UNAVAILABLE',
      reason: report.reason === 'malformed' ? 'adaptive_stress_report_malformed' : 'adaptive_stress_report_missing',
      reportGeneratedAt: null,
      seed: null,
      cycles: null,
      totalCandidates: null,
      acceptanceRate: null,
      passedChecks: null,
      totalChecks: null,
    };
  }

  const verdict = asString(report.value.verdict);
  const run = report.value.run && typeof report.value.run === 'object'
    ? report.value.run as Record<string, unknown>
    : null;
  const checks = Array.isArray(report.value.checks)
    ? report.value.checks.filter((check): check is Record<string, unknown> =>
        Boolean(check) && typeof check === 'object' && !Array.isArray(check))
    : [];
  const passedChecks = checks.filter((check) => check.pass === true).length;
  const totalChecks = checks.length;

  if (verdict !== 'PASS' && verdict !== 'FAIL') {
    return {
      status: 'MALFORMED_REPORT',
      reason: 'adaptive_stress_verdict_missing_or_invalid',
      reportGeneratedAt: asString(report.value.generatedAt),
      seed: asNumber(run?.seed),
      cycles: asNumber(run?.cycles),
      totalCandidates: asNumber(run?.totalCandidates),
      acceptanceRate: asNumber(run?.acceptanceRate),
      passedChecks,
      totalChecks,
    };
  }

  return {
    status: verdict === 'PASS' ? 'PASSED' : 'FAILED',
    reason: verdict === 'PASS' ? null : 'adaptive_stress_safety_check_failed',
    reportGeneratedAt: asString(report.value.generatedAt),
    seed: asNumber(run?.seed),
    cycles: asNumber(run?.cycles),
    totalCandidates: asNumber(run?.totalCandidates),
    acceptanceRate: asNumber(run?.acceptanceRate),
    passedChecks,
    totalChecks,
  };
}

function parseProviderRoutingStress(
  readFile: (filePath: string) => string | null,
  reportPath: string,
): OperationsProviderRoutingStressSection {
  const report = readJsonReport(readFile, reportPath);
  if (report.ok === false) {
    return {
      status: report.reason === 'malformed' ? 'MALFORMED_REPORT' : 'UNAVAILABLE',
      reason: report.reason === 'malformed'
        ? 'provider_routing_stress_report_malformed'
        : 'provider_routing_stress_report_missing',
      reportGeneratedAt: null,
      seed: null,
      scenarioCount: null,
      passedChecks: null,
      totalChecks: null,
      observedOpsStates: [],
    };
  }

  const verdict = asString(report.value.verdict);
  const run = report.value.run && typeof report.value.run === 'object'
    ? report.value.run as Record<string, unknown>
    : null;
  const checks = Array.isArray(report.value.checks)
    ? report.value.checks.filter((check): check is Record<string, unknown> =>
        Boolean(check) && typeof check === 'object' && !Array.isArray(check))
    : [];
  const scenarios = Array.isArray(report.value.scenarios)
    ? report.value.scenarios.filter((scenario): scenario is Record<string, unknown> =>
        Boolean(scenario) && typeof scenario === 'object' && !Array.isArray(scenario))
    : [];
  const passedChecks = checks.filter((check) => check.pass === true).length;
  const totalChecks = checks.length;
  const allowedStates = new Set<ProviderRoutingOpsState>([
    'READY',
    'DEGRADED',
    'RATE_LIMITED',
    'GEO_BLOCKED',
    'UNSUPPORTED',
    'UNAVAILABLE',
    'STALE',
  ]);
  const observedOpsStates = [...new Set(
    scenarios
      .map((scenario) => asString(scenario.opsState))
      .filter((state): state is ProviderRoutingOpsState =>
        Boolean(state) && allowedStates.has(state as ProviderRoutingOpsState)),
  )].sort();

  if (verdict !== 'PASS' && verdict !== 'FAIL') {
    return {
      status: 'MALFORMED_REPORT',
      reason: 'provider_routing_stress_verdict_missing_or_invalid',
      reportGeneratedAt: asString(report.value.generatedAt),
      seed: asNumber(run?.seed),
      scenarioCount: asNumber(run?.scenarioCount),
      passedChecks,
      totalChecks,
      observedOpsStates,
    };
  }

  return {
    status: verdict === 'PASS' ? 'PASSED' : 'FAILED',
    reason: verdict === 'PASS' ? null : 'provider_routing_stress_safety_check_failed',
    reportGeneratedAt: asString(report.value.generatedAt),
    seed: asNumber(run?.seed),
    scenarioCount: asNumber(run?.scenarioCount),
    passedChecks,
    totalChecks,
    observedOpsStates,
  };
}

function emptyLoadMatrixReport(
  status: LoadMatrixStressStatus,
  reason: string,
): OperationsLoadMatrixReportSection {
  return {
    status,
    reason,
    reportGeneratedAt: null,
    phaseCount: null,
    allPass: null,
    totalRuns: null,
    totalCandidates: null,
    weightedWinRate: null,
  };
}

function parseLoadMatrixSummary(
  readFile: (filePath: string) => string | null,
  reportPath: string,
  reportKind: 'load_matrix_100' | 'load_matrix_fast',
): OperationsLoadMatrixReportSection {
  const report = readJsonReport(readFile, reportPath);
  if (report.ok === false) {
    return emptyLoadMatrixReport(
      report.reason === 'malformed' ? 'MALFORMED_REPORT' : 'UNAVAILABLE',
      report.reason === 'malformed' ? `${reportKind}_report_malformed` : `${reportKind}_report_missing`,
    );
  }

  const overall = report.value.overall && typeof report.value.overall === 'object'
    ? report.value.overall as Record<string, unknown>
    : null;
  const allPass = overall?.allPass;

  if (typeof allPass !== 'boolean') {
    return {
      status: 'MALFORMED_REPORT',
      reason: `${reportKind}_overall_missing_or_invalid`,
      reportGeneratedAt: asString(report.value.generatedAt),
      phaseCount: asNumber(overall?.phaseCount),
      allPass: null,
      totalRuns: asNumber(overall?.totalRuns),
      totalCandidates: asNumber(overall?.totalCandidates),
      weightedWinRate: asNumber(overall?.weightedWinRate),
    };
  }

  return {
    status: allPass ? 'PASSED' : 'FAILED',
    reason: allPass ? null : `${reportKind}_phase_failure`,
    reportGeneratedAt: asString(report.value.generatedAt),
    phaseCount: asNumber(overall?.phaseCount),
    allPass,
    totalRuns: asNumber(overall?.totalRuns),
    totalCandidates: asNumber(overall?.totalCandidates),
    weightedWinRate: asNumber(overall?.weightedWinRate),
  };
}

function aggregateLoadMatrixStatus(
  hundredSeed: OperationsLoadMatrixReportSection,
  fastMinute: OperationsLoadMatrixReportSection,
): { status: LoadMatrixStressStatus; reason: string | null } {
  if (hundredSeed.status === 'FAILED' || fastMinute.status === 'FAILED') {
    return { status: 'FAILED', reason: 'load_matrix_phase_failure' };
  }
  if (hundredSeed.status === 'MALFORMED_REPORT' || fastMinute.status === 'MALFORMED_REPORT') {
    return { status: 'MALFORMED_REPORT', reason: 'load_matrix_report_malformed' };
  }
  if (hundredSeed.status === 'PASSED' && fastMinute.status === 'PASSED') {
    return { status: 'PASSED', reason: null };
  }
  if (hundredSeed.status === 'UNAVAILABLE' && fastMinute.status === 'UNAVAILABLE') {
    return { status: 'UNAVAILABLE', reason: 'load_matrix_reports_missing' };
  }
  return { status: 'UNAVAILABLE', reason: 'load_matrix_reports_partial' };
}

function parseShadowMlTraining(
  readFile: (filePath: string) => string | null,
  trainingPath: string,
): OperationsShadowMlTrainingSection {
  const report = readJsonReport(readFile, trainingPath);
  if (report.ok === false) {
    const reason = report.reason === 'malformed' ? 'training_report_malformed' : 'training_report_missing';
    return {
      status: report.reason === 'malformed' ? 'MALFORMED_REPORT' : 'UNAVAILABLE',
      reason,
      datasetGateStatus: null,
      completeRows: null,
      minorityClassRows: null,
      reportGeneratedAt: null,
    };
  }

  const gate = (report.value.gate && typeof report.value.gate === 'object')
    ? report.value.gate as Record<string, unknown>
    : null;
  const gateStatus = asString(gate?.status);
  const datasetGateStatus = asString(gate?.datasetGateStatus) ?? gateStatus;

  if (gateStatus === 'INSUFFICIENT_DATA' || datasetGateStatus === 'INSUFFICIENT_DATA') {
    return {
      status: 'INSUFFICIENT_DATA',
      reason: 'training_data_gate_not_met',
      datasetGateStatus,
      completeRows: asNumber(gate?.completeRows),
      minorityClassRows: asNumber(gate?.minorityClassRows),
      reportGeneratedAt: asString(report.value.generatedAt),
    };
  }

  if (gateStatus === 'TRAINED') {
    return {
      status: 'TRAINED',
      reason: null,
      datasetGateStatus,
      completeRows: asNumber(gate?.completeRows),
      minorityClassRows: asNumber(gate?.minorityClassRows),
      reportGeneratedAt: asString(report.value.generatedAt),
    };
  }

  return {
    status: 'UNAVAILABLE',
    reason: gateStatus ? `unexpected_training_gate_status:${gateStatus}` : 'training_gate_missing',
    datasetGateStatus,
    completeRows: asNumber(gate?.completeRows),
    minorityClassRows: asNumber(gate?.minorityClassRows),
    reportGeneratedAt: asString(report.value.generatedAt),
  };
}

function parseShadowMlComparison(
  readFile: (filePath: string) => string | null,
  comparisonPath: string,
  modelPresent: boolean,
): OperationsShadowMlComparisonSection {
  const report = readJsonReport(readFile, comparisonPath);
  if (report.ok === false) {
    const reason = report.reason === 'malformed' ? 'comparison_report_malformed' : 'comparison_report_missing';
    return {
      status: report.reason === 'malformed' ? 'MALFORMED_REPORT' : 'UNAVAILABLE',
      reason,
      modelPresent,
      rowsScored: null,
      disagreementCount: null,
      avgConfidenceOnDisagreements: null,
      reportGeneratedAt: null,
    };
  }

  const gate = (report.value.gate && typeof report.value.gate === 'object')
    ? report.value.gate as Record<string, unknown>
    : null;
  const summary = (report.value.summary && typeof report.value.summary === 'object')
    ? report.value.summary as Record<string, unknown>
    : null;
  const gateStatus = asString(gate?.status);

  if (gateStatus === 'NO_MODEL' || !modelPresent) {
    return {
      status: 'NO_MODEL',
      reason: 'shadow_model_not_available',
      modelPresent,
      rowsScored: asNumber(summary?.rowsScored),
      disagreementCount: asNumber(summary?.disagreementCount),
      avgConfidenceOnDisagreements: asNumber(summary?.avgConfidenceOnDisagreements),
      reportGeneratedAt: asString(report.value.generatedAt),
    };
  }

  if (gateStatus === 'INSUFFICIENT_DATA') {
    return {
      status: 'INSUFFICIENT_DATA',
      reason: 'comparison_data_gate_not_met',
      modelPresent,
      rowsScored: asNumber(summary?.rowsScored),
      disagreementCount: asNumber(summary?.disagreementCount),
      avgConfidenceOnDisagreements: asNumber(summary?.avgConfidenceOnDisagreements),
      reportGeneratedAt: asString(report.value.generatedAt),
    };
  }

  if (gateStatus === 'COMPARED') {
    return {
      status: 'COMPARED',
      reason: null,
      modelPresent,
      rowsScored: asNumber(summary?.rowsScored),
      disagreementCount: asNumber(summary?.disagreementCount),
      avgConfidenceOnDisagreements: asNumber(summary?.avgConfidenceOnDisagreements),
      reportGeneratedAt: asString(report.value.generatedAt),
    };
  }

  return {
    status: 'UNAVAILABLE',
    reason: gateStatus ? `unexpected_comparison_gate_status:${gateStatus}` : 'comparison_gate_missing',
    modelPresent,
    rowsScored: asNumber(summary?.rowsScored),
    disagreementCount: asNumber(summary?.disagreementCount),
    avgConfidenceOnDisagreements: asNumber(summary?.avgConfidenceOnDisagreements),
    reportGeneratedAt: asString(report.value.generatedAt),
  };
}

export function deriveServiceStatus(input: {
  providerSummary: OperationsProviderSummary;
  decisionMemoryStatus: DecisionMemorySyncStatus;
  adaptiveStressStatus?: AdaptiveStressStatus;
  providerRoutingStressStatus?: ProviderRoutingStressStatus;
  loadMatrixStressStatus?: LoadMatrixStressStatus;
  shadowTrainingStatus: ShadowMlTrainingStatus;
  shadowComparisonStatus: ShadowMlComparisonStatus;
}): OperationsServiceSection {
  const reasons: string[] = [];

  if (input.decisionMemoryStatus === 'LOCAL_ONLY') {
    reasons.push('decision_memory_mirror_disabled');
  }
  if (input.providerSummary.configuredUnhealthyProviders > 0) {
    reasons.push('configured_providers_unhealthy');
  }
  if (input.providerSummary.configuredProviders === 0) {
    reasons.push('no_configured_providers');
  }
  if (input.shadowTrainingStatus === 'INSUFFICIENT_DATA') {
    reasons.push('shadow_ml_training_insufficient_data');
  }
  if (input.shadowComparisonStatus === 'NO_MODEL') {
    reasons.push('shadow_ml_model_missing');
  }
  if (input.shadowTrainingStatus === 'MALFORMED_REPORT' || input.shadowComparisonStatus === 'MALFORMED_REPORT') {
    reasons.push('shadow_ml_report_malformed');
  }
  if (input.shadowTrainingStatus === 'UNAVAILABLE' || input.shadowComparisonStatus === 'UNAVAILABLE') {
    reasons.push('shadow_ml_report_unavailable');
  }
  if (input.adaptiveStressStatus === 'FAILED') {
    reasons.push('adaptive_stress_failed');
  }
  if (input.adaptiveStressStatus === 'MALFORMED_REPORT') {
    reasons.push('adaptive_stress_report_malformed');
  }
  if (input.adaptiveStressStatus === 'UNAVAILABLE') {
    reasons.push('adaptive_stress_report_unavailable');
  }
  if (input.providerRoutingStressStatus === 'FAILED') {
    reasons.push('provider_routing_stress_failed');
  }
  if (input.providerRoutingStressStatus === 'MALFORMED_REPORT') {
    reasons.push('provider_routing_stress_report_malformed');
  }
  if (input.providerRoutingStressStatus === 'UNAVAILABLE') {
    reasons.push('provider_routing_stress_report_unavailable');
  }
  if (input.loadMatrixStressStatus === 'FAILED') {
    reasons.push('load_matrix_stress_failed');
  }
  if (input.loadMatrixStressStatus === 'MALFORMED_REPORT') {
    reasons.push('load_matrix_stress_report_malformed');
  }
  if (input.loadMatrixStressStatus === 'UNAVAILABLE') {
    reasons.push('load_matrix_stress_report_unavailable');
  }

  if (reasons.length === 0) {
    return { status: 'READY', reason: null };
  }

  return {
    status: 'DEGRADED',
    reason: reasons.join(';'),
  };
}

function defaultLiquidityHunterOperationsSection(): OperationsLiquidityHunterSection {
  return {
    status: 'DISABLED',
    shadowOnly: true,
    executionDependency: false,
    autonomousLiveExecutionEnabled: false,
    flags: {
      liquidityHunterEnabled: false,
      shadowOnly: true,
      realtimeEventRecordingEnabled: false,
      publicFeedsEnabled: false,
      binancePublicFeedEnabled: false,
      kucoinPublicFeedEnabled: false,
      bybitPublicFeedEnabled: false,
      realtimeL2Enabled: false,
      optionsGexEnabled: false,
      deribitOptionsPublicEnabled: false,
      hyblockLiquidationTopologyEnabled: false,
      walletGradingEnabled: false, hyperliquidWalletObserverEnabled: false,
      hyperliquidWalletHistoryGradingEnabled: false,
      sentimentVelocityEnabled: false,
      metaModelEnabled: false,
      websocketEnabled: false,
      paperCanaryEnabled: false,
      testnetCanaryEnabled: false,
      autonomousLiveExecutionEnabled: false,
    },
    edgeCatalog: {
      total: 10,
      DIAGNOSTIC_AVAILABLE: 2,
      SHADOW_ONLY: 4,
      BLOCKED_BY_L2: 0,
      BLOCKED_BY_REALTIME_FEEDS: 0,
      NOT_CONFIGURED: 4,
    },
    realtime: {
      status: 'DISABLED',
      generatedAt: Date.now(),
      acceptedEvents: 0,
      duplicateEvents: 0,
      gapEvents: 0,
      outOfOrderEvents: 0,
      invalidEvents: 0,
      persistedEvents: 0,
      persistenceFailures: 0,
      lastEventAt: null,
      lastError: null,
      queue: {
        published: 0, delivered: 0, sampled: 0, rejected: 0, handlerFailures: 0, queued: 0,
      },
      worldStateEntries: 0,
      seriesKeys: 0,
      seriesEvents: 0,
      orderBooksTracked: 0,
      recordingPath: null,
      setupRecordingPath: null,
      historicalMicrostructurePath: null,
      historicalMicrostructure: null,
      publicFeeds: { enabled: false, symbols: [], feeds: [] },
      evidenceProviders: { providers: [] },
      paperCanary: {
        enabled: false,
        executionDependency: false,
        orderSubmissionAllowed: false,
        open: 0,
        resolved: 0,
        records: [],
        lastPersistenceError: null,
      },
      shadowEvaluation: {
        enabled: false,
        running: false,
        executionDependency: false,
        orderSubmissionAllowed: false,
        symbols: [],
        intervalMs: 30_000,
        evaluations: 0,
        captures: 0,
        failures: 0,
        lastRunAt: null,
        lastSuccessAt: null,
        lastError: null,
      },
    },
    thresholdGovernance: {
      version: 'lh_edge_threshold_governance_v1',
      activeRevision: 1,
      activeProfiles: [],
      proposals: [],
      history: [],
      automaticPromotionEnabled: false,
    },
    policy: {
      version: 'liquidity-hunter-core-policy-v2',
      automaticPromotionEnabled: false,
      majorityVoteAllowed: false,
      layer4MayRescueDeterministicFailure: false,
    },
    reasons: ['liquidity_hunter_core_disabled_by_default'],
  };
}

export function buildOperationsStatus(input: BuildOperationsStatusInput): OperationsStatusContract {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const providerItems = input.providerHealth.map((item) => normalizeProviderRow(item));
  const providerSummary = summarizeProviders(providerItems);

  const decisionMemory: OperationsDecisionMemorySection = input.decisionMemoryMirrorEnabled
    ? {
        status: 'SYNC_ENABLED',
        reason: null,
        stats: input.decisionMemoryStats,
      }
    : {
        status: 'LOCAL_ONLY',
        reason: 'mirror_disabled_by_configuration',
        stats: null,
      };

  const datasetSync: OperationsDatasetSyncSection = input.datasetSync ?? {
    status: 'UNAVAILABLE',
    reason: 'dataset_sync_status_not_reported',
    lastSyncAt: null,
    lastRestoreStatus: null,
    lastRestoreAt: null,
    rowCount: null,
  };

  const trainingPath = `${input.mlShadowDir}/SHADOW_ML_TRAINING_REPORT_v1.json`;
  const comparisonPath = `${input.mlShadowDir}/SHADOW_ML_COMPARISON_REPORT_v1.json`;
  const modelPath = `${input.mlShadowDir}/model_v1.json`;
  const modelPresent = input.fileExists(modelPath);

  const training = parseShadowMlTraining(input.readFile, trainingPath);
  const comparison = parseShadowMlComparison(input.readFile, comparisonPath, modelPresent);
  const adaptiveStress = parseAdaptiveStress(
    input.readFile,
    `${input.adaptiveStressDir}/ADAPTIVE_LEARNING_STRESS_v1.json`,
  );
  const providerRoutingStress = parseProviderRoutingStress(
    input.readFile,
    `${input.providerRoutingDir}/PROVIDER_ROUTING_STRESS_v1.json`,
  );
  const hundredSeed = parseLoadMatrixSummary(
    input.readFile,
    `${input.loadMatrix100Dir}/LOAD_MATRIX_100_SUMMARY.json`,
    'load_matrix_100',
  );
  const fastMinute = parseLoadMatrixSummary(
    input.readFile,
    `${input.loadMatrixFastDir}/FAST_MINUTE_MATRIX_SUMMARY.json`,
    'load_matrix_fast',
  );
  const loadMatrixAggregate = aggregateLoadMatrixStatus(hundredSeed, fastMinute);
  const loadMatrixStress: OperationsLoadMatrixStressSection = {
    status: loadMatrixAggregate.status,
    reason: loadMatrixAggregate.reason,
    hundredSeed,
    fastMinute,
  };

  const service = deriveServiceStatus({
    providerSummary,
    decisionMemoryStatus: decisionMemory.status,
    adaptiveStressStatus: adaptiveStress.status,
    providerRoutingStressStatus: providerRoutingStress.status,
    loadMatrixStressStatus: loadMatrixStress.status,
    shadowTrainingStatus: training.status,
    shadowComparisonStatus: comparison.status,
  });

  return {
    schemaVersion: OPERATIONS_STATUS_SCHEMA_VERSION,
    generatedAt,
    service,
    providers: {
      summary: providerSummary,
      items: providerItems,
    },
    decisionMemory,
    datasetSync,
    marketDataFallback: input.marketDataFallback ?? {
      lastStartedAt: null, lastCompletedAt: null, lastDurationMs: null, requestedRows: 0, returnedRows: 0,
      maxConcurrency: 4, cacheTtlMs: 30_000, cadence: 'DEGRADED_FALLBACK', lastError: null,
    },
    adaptiveThresholdAudit: input.adaptiveThresholdGovernance
      ? {
          status: 'AUDITED',
          source: 'SERVER_DURABLE',
          reason: null,
          activeRevision: input.adaptiveThresholdGovernance.activeRevision,
          revisionCount: input.adaptiveThresholdGovernance.revisionCount,
          proposalCount: input.adaptiveThresholdGovernance.proposalCount,
          pendingProposalCount: input.adaptiveThresholdGovernance.pendingProposalCount,
        }
      : {
          status: 'WAITING',
          source: 'SERVER_DURABLE',
          reason: 'adaptive_governance_snapshot_unavailable',
          activeRevision: null,
          revisionCount: null,
          proposalCount: null,
          pendingProposalCount: null,
        },
    adaptiveStress,
    providerRoutingStress,
    loadMatrixStress,
    shadowMl: {
      auditOnly: true,
      training,
      comparison,
    },
    liquidityHunter: input.liquidityHunter ?? defaultLiquidityHunterOperationsSection(),
  };
}

export function createUnavailableOperationsStatus(
  reason: string,
  generatedAt = new Date().toISOString(),
): OperationsStatusContract {
  return {
    schemaVersion: OPERATIONS_STATUS_SCHEMA_VERSION,
    generatedAt,
    service: {
      status: 'UNAVAILABLE',
      reason,
    },
    providers: {
      summary: {
        configuredProviders: 0,
        configuredHealthyProviders: 0,
        configuredUnhealthyProviders: 0,
        unconfiguredProviders: 0,
        rateLimitedProviders: [],
        unhealthyProviders: [],
      },
      items: [],
    },
    decisionMemory: {
      status: 'UNAVAILABLE',
      reason,
      stats: null,
    },
    datasetSync: {
      status: 'UNAVAILABLE',
      reason,
      lastSyncAt: null,
      lastRestoreStatus: null,
      lastRestoreAt: null,
      rowCount: null,
    },
    marketDataFallback: {
      lastStartedAt: null, lastCompletedAt: null, lastDurationMs: null, requestedRows: 0, returnedRows: 0,
      maxConcurrency: 4, cacheTtlMs: 30_000, cadence: 'DEGRADED_FALLBACK', lastError: reason,
    },
    adaptiveThresholdAudit: {
      status: 'UNAVAILABLE',
      source: 'SERVER_DURABLE',
      reason,
      activeRevision: null,
      revisionCount: null,
      proposalCount: null,
      pendingProposalCount: null,
    },
    adaptiveStress: {
      status: 'UNAVAILABLE',
      reason,
      reportGeneratedAt: null,
      seed: null,
      cycles: null,
      totalCandidates: null,
      acceptanceRate: null,
      passedChecks: null,
      totalChecks: null,
    },
    providerRoutingStress: {
      status: 'UNAVAILABLE',
      reason,
      reportGeneratedAt: null,
      seed: null,
      scenarioCount: null,
      passedChecks: null,
      totalChecks: null,
      observedOpsStates: [],
    },
    loadMatrixStress: {
      status: 'UNAVAILABLE',
      reason,
      hundredSeed: emptyLoadMatrixReport('UNAVAILABLE', reason),
      fastMinute: emptyLoadMatrixReport('UNAVAILABLE', reason),
    },
    shadowMl: {
      auditOnly: true,
      training: {
        status: 'UNAVAILABLE',
        reason,
        datasetGateStatus: null,
        completeRows: null,
        minorityClassRows: null,
        reportGeneratedAt: null,
      },
      comparison: {
        status: 'UNAVAILABLE',
        reason,
        modelPresent: false,
        rowsScored: null,
        disagreementCount: null,
        avgConfidenceOnDisagreements: null,
        reportGeneratedAt: null,
      },
    },
    liquidityHunter: {
      ...defaultLiquidityHunterOperationsSection(),
      status: 'DEGRADED',
      reasons: [reason],
    },
  };
}

export function isOperationsStatusStale(
  generatedAt: string,
  now = Date.now(),
  staleMs = OPERATIONS_STATUS_STALE_MS,
): boolean {
  const parsed = Date.parse(generatedAt);
  if (!Number.isFinite(parsed)) return true;
  return now - parsed > staleMs;
}

export function withClientStaleState(
  status: OperationsStatusContract,
  now = Date.now(),
): OperationsStatusContract {
  if (!isOperationsStatusStale(status.generatedAt, now)) {
    return status;
  }
  return {
    ...status,
    service: {
      status: 'STALE',
      reason: status.service.reason
        ? `${status.service.reason};client_response_stale`
        : 'client_response_stale',
    },
  };
}

export function isValidOperationsStatusContract(value: unknown): value is OperationsStatusContract {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as OperationsStatusContract;
  return candidate.schemaVersion === OPERATIONS_STATUS_SCHEMA_VERSION
    && typeof candidate.generatedAt === 'string'
    && candidate.shadowMl?.auditOnly === true
    && typeof candidate.service?.status === 'string'
    && typeof candidate.datasetSync?.status === 'string'
    && typeof candidate.adaptiveStress?.status === 'string'
    && typeof candidate.providerRoutingStress?.status === 'string'
    && typeof candidate.loadMatrixStress?.status === 'string'
    && typeof candidate.liquidityHunter?.status === 'string'
    && candidate.liquidityHunter?.shadowOnly === true
    && candidate.liquidityHunter?.autonomousLiveExecutionEnabled === false
    && Array.isArray(candidate.providers?.items);
}
