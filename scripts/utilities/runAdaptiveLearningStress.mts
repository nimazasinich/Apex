import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ADAPTIVE_STRESS_REPORT_VERSION,
  runAdaptiveLearningStress,
  type AdaptiveStressResult,
} from '../../src/services/adaptiveLearningStress';

const root = process.cwd();
const outDir = resolve(root, 'Doc/automation/adaptive_learning');
const jsonPath = resolve(outDir, `ADAPTIVE_LEARNING_STRESS_v${ADAPTIVE_STRESS_REPORT_VERSION}.json`);
const markdownPath = resolve(outDir, `ADAPTIVE_LEARNING_STRESS_v${ADAPTIVE_STRESS_REPORT_VERSION}.md`);

function markdownReport(result: AdaptiveStressResult): string {
  const checkRows = result.checks
    .map((check) => `| ${check.id} | ${check.pass ? 'PASS' : 'FAIL'} | ${String(check.actual)} | ${check.expected} |`)
    .join('\n');

  return `# Adaptive Learning Stress Report v${ADAPTIVE_STRESS_REPORT_VERSION}

- Generated: ${result.generatedAt}
- Verdict: **${result.verdict}**
- Seed: ${result.run.seed}
- Cycles: ${result.run.cycles}
- Candidates per cycle: ${result.run.candidatesPerCycle}
- Total candidates: ${result.run.totalCandidates}
- Accepted: ${result.run.accepted}
- Rejected: ${result.run.rejected}
- Acceptance rate: ${(result.run.acceptanceRate * 100).toFixed(3)}%
- Synthetic P&L: ${result.run.pnl}R

## Safety checks

| Check | Verdict | Actual | Expected |
|---|---|---:|---|
${checkRows}

## Adaptive profile

- Sample size: ${result.profile.sampleSize}
- Market regime: ${result.profile.marketRegime}
- Win rate: ${result.profile.winRate ?? 'n/a'}
- Average P&L: ${result.profile.avgPnl ?? 'n/a'}
- Missed winners: ${result.profile.missedWinners}
- Saved losses: ${result.profile.savedLosses}
- Adjustment confidence: ${result.profile.adjustmentConfidence}

## Safety boundary

This is deterministic synthetic stress evidence for adaptive guardrails only. It
does not train shadow ML, create Decision Memory export data, enable live
trading, or alter scanner/execution behavior.
`;
}

const result = runAdaptiveLearningStress({
  seed: Number(process.env.APEX_STRESS_SEED ?? 42),
  cycles: Number(process.env.CYCLES ?? 900),
  candidatesPerCycle: Number(process.env.CANDIDATES_PER_CYCLE ?? 6),
  generatedAt: new Date().toISOString(),
});

mkdirSync(outDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, markdownReport(result), 'utf8');
console.log(JSON.stringify(result, null, 2));
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);

if (result.verdict !== 'PASS') {
  process.exitCode = 1;
}
