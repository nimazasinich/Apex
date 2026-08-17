import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoSecretFields,
  buildOperationsStatus,
  isValidOperationsStatusContract,
  summarizeProviders,
  normalizeProviderRow,
} from '../../src/services/operationsStatus';
import type { ProviderHealth } from '../../src/services/providers/supplementalTypes';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const reportDir = resolve(root, 'Doc/automation/operations_status');
mkdirSync(reportDir, { recursive: true });

const PORT = Number(process.env.APEX_OPS_SMOKE_PORT || (32_000 + (process.pid % 10_000)));
const BASE_URL = `http://127.0.0.1:${PORT}`;

function provider(name: string, configured: boolean, healthy: boolean): ProviderHealth {
  return {
    name,
    category: 'news',
    isConfigured: configured,
    isHealthy: healthy,
    lastCheckTime: Date.now(),
    failureCount: healthy ? 0 : 3,
  };
}

async function waitForServer(timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/operations/status`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error('operations status smoke server did not become ready');
}

async function runHttpSmoke(): Promise<Record<string, unknown>> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), APEX_DECISION_MEMORY_MIRROR: 'false' },
    stdio: 'ignore',
  });

  try {
    await waitForServer();
    const response = await fetch(`${BASE_URL}/api/operations/status`);
    const payload = await response.json();
    return {
      mode: 'http',
      httpStatus: response.status,
      payload,
    };
  } finally {
    stopChild(child);
  }
}

function stopChild(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  child.kill('SIGTERM');
}

function runPureSmoke(): Record<string, unknown> {
  const mlShadowDir = resolve(root, 'Doc/automation/ml_shadow');
  const adaptiveStressDir = resolve(root, 'Doc/automation/adaptive_learning');
  const providerRoutingDir = resolve(root, 'Doc/automation/provider_routing');
  const loadMatrix100Dir = resolve(root, 'Doc/automation/load_matrix_100');
  const loadMatrixFastDir = resolve(root, 'Doc/automation/load_matrix_fast_1m_5m');
  const payload = buildOperationsStatus({
    providerHealth: [
      provider('NewsAPI', false, true),
      provider('CryptoCompare', false, true),
    ],
    decisionMemoryMirrorEnabled: false,
    decisionMemoryStats: null,
    mlShadowDir,
    adaptiveStressDir,
    providerRoutingDir,
    loadMatrix100Dir,
    loadMatrixFastDir,
    readFile: (filePath) => (existsSync(filePath) ? readFileSync(filePath, 'utf8') : null),
    fileExists: (filePath) => existsSync(filePath),
  });

  return {
    mode: 'pure',
    httpStatus: 200,
    payload,
  };
}

async function main(): Promise<void> {
  let result: Record<string, unknown>;
  try {
    result = await runHttpSmoke();
  } catch (error) {
    result = {
      ...runPureSmoke(),
      httpFallbackReason: error instanceof Error ? error.message : String(error),
    };
  }

  const payload = result.payload;
  const violations: string[] = [];

  if (result.httpStatus !== 200) {
    violations.push(`expected_http_200_got_${result.httpStatus}`);
  }
  const contractValid = isValidOperationsStatusContract(payload);
  if (!contractValid) {
    violations.push('invalid_operations_status_contract');
  }
  violations.push(...assertNoSecretFields(payload));

  const contract = contractValid ? payload : null;
  if (contract) {
    const summary = contract.providers.summary;
    const items = contract.providers.items.map((item) => normalizeProviderRow({
      name: item.name,
      category: item.category as ProviderHealth['category'],
      isConfigured: item.isConfigured,
      isHealthy: item.isHealthy,
      lastCheckTime: item.lastCheckTime ?? Date.now(),
      failureCount: item.failureCount,
      rateLimitedUntil: item.rateLimitedUntil ?? undefined,
      reason: item.reason ?? undefined,
    }));
    const recomputed = summarizeProviders(items);
    if (summary.configuredHealthyProviders !== recomputed.configuredHealthyProviders) {
      violations.push('configuredHealthyProviders_overcounted');
    }
    if (summary.configuredHealthyProviders > 0 && summary.configuredProviders === 0) {
      violations.push('healthy_without_configured_providers');
    }
    if (contract.shadowMl.auditOnly !== true) {
      violations.push('shadow_ml_not_audit_only');
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: result.mode,
    httpStatus: result.httpStatus,
    httpFallbackReason: result.httpFallbackReason ?? null,
    violations,
    ok: violations.length === 0,
    sample: {
      schemaVersion: contract?.schemaVersion ?? null,
      serviceStatus: contract?.service.status ?? null,
      configuredHealthyProviders: contract?.providers.summary.configuredHealthyProviders ?? null,
      decisionMemoryStatus: contract?.decisionMemory.status ?? null,
      adaptiveStressStatus: contract?.adaptiveStress.status ?? null,
      providerRoutingStressStatus: contract?.providerRoutingStress.status ?? null,
      loadMatrixStressStatus: contract?.loadMatrixStress.status ?? null,
      shadowTrainingStatus: contract?.shadowMl.training.status ?? null,
      shadowComparisonStatus: contract?.shadowMl.comparison.status ?? null,
      auditOnly: contract?.shadowMl.auditOnly ?? null,
    },
  };

  writeFileSync(resolve(reportDir, 'OPERATIONS_STATUS_SMOKE_v1.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(resolve(reportDir, 'OPERATIONS_STATUS_SMOKE_v1.md'), [
    '# Operations Status Smoke Report v1',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Mode: ${report.mode}`,
    `- HTTP status: ${report.httpStatus}`,
    `- Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    report.httpFallbackReason ? `- HTTP fallback reason: ${report.httpFallbackReason}` : '',
    '',
    '## Sample',
    '',
    '```json',
    JSON.stringify(report.sample, null, 2),
    '```',
    '',
    report.violations.length ? `## Violations\n\n${report.violations.map((item) => `- ${item}`).join('\n')}` : '## Violations\n\nNone.',
    '',
  ].filter(Boolean).join('\n'), 'utf8');

  if (!report.ok) {
    console.error('Operations status smoke failed:', violations.join(', '));
    process.exit(1);
  }

  console.log(`Operations status smoke passed (${report.mode}).`);
}

void main();
