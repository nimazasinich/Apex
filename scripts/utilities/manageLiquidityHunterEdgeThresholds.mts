import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EdgeThresholdGovernanceStore } from '../../src/services/liquidityHunter/edgeThresholdRegistry';
import type { EdgeThresholdOptimizationReport } from '../../src/services/liquidityHunter/edgeThresholdOptimizer';
import type { EdgeSymbolClass } from '../../src/contracts/realtime/edgeThreshold';
import type { EdgeThresholdPromotionEvidence } from '../../src/services/liquidityHunter/edgeThresholdRegistry';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const value = process.argv.find((item: string) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

const command = process.argv[2] || 'snapshot';
const store = new EdgeThresholdGovernanceStore(arg('store') || undefined);
const EDGE_SYMBOL_CLASSES = new Set<EdgeSymbolClass>(['BTC', 'ETH', 'LARGE_CAP', 'MID_CAP', 'LOW_LIQUIDITY']);

function parseSymbolClass(value: string | null): EdgeSymbolClass {
  const resolved = String(value || 'BTC').toUpperCase() as EdgeSymbolClass;
  if (!EDGE_SYMBOL_CLASSES.has(resolved)) throw new Error(`invalid_symbol_class:${resolved}`);
  return resolved;
}

if (command === 'snapshot') {
  console.log(JSON.stringify(store.snapshot(), null, 2));
} else if (command === 'stage') {
  const reportPath = arg('report');
  if (!reportPath) throw new Error('stage_requires_--report');
  const report = JSON.parse(await readFile(path.resolve(reportPath), 'utf8')) as EdgeThresholdOptimizationReport;
  const symbolClass = parseSymbolClass(arg('symbol-class'));
  const timeframe = String(arg('timeframe') || 'REALTIME');
  const regime = String(arg('regime') || 'ANY');
  console.log(JSON.stringify(store.stage(report, { symbolClass, timeframe, regime }), null, 2));
} else if (command === 'paper-canary') {
  const proposal = arg('proposal');
  const evidencePath = arg('evidence');
  if (!proposal || !evidencePath) throw new Error('paper-canary_requires_--proposal_and_--evidence');
  const evidence = JSON.parse(await readFile(path.resolve(evidencePath), 'utf8')) as EdgeThresholdPromotionEvidence;
  console.log(JSON.stringify(store.markPaperCanaryReady(proposal, evidence), null, 2));
} else if (command === 'approve') {
  const proposal = arg('proposal');
  const approver = arg('approver');
  if (!proposal || !approver) throw new Error('approve_requires_--proposal_and_--approver');
  console.log(JSON.stringify(store.approve(proposal, approver), null, 2));
} else if (command === 'reject') {
  const proposal = arg('proposal');
  if (!proposal) throw new Error('reject_requires_--proposal');
  console.log(JSON.stringify(store.reject(proposal, arg('reason') || 'operator_rejected'), null, 2));
} else if (command === 'rollback') {
  const revision = Number(arg('revision'));
  const approver = arg('approver');
  if (!Number.isSafeInteger(revision) || !approver) throw new Error('rollback_requires_--revision_and_--approver');
  console.log(JSON.stringify(store.rollback(revision, approver), null, 2));
} else {
  throw new Error(`unknown_command:${command}`);
}
