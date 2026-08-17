import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROVIDER_ROUTING_STRESS_REPORT_VERSION,
  runProviderRoutingStress,
  type ProviderRoutingStressResult,
} from '../../src/services/providerRoutingStress';

const root = process.cwd();
const outDir = resolve(root, 'Doc/automation/provider_routing');
const jsonPath = resolve(outDir, `PROVIDER_ROUTING_STRESS_v${PROVIDER_ROUTING_STRESS_REPORT_VERSION}.json`);
const markdownPath = resolve(outDir, `PROVIDER_ROUTING_STRESS_v${PROVIDER_ROUTING_STRESS_REPORT_VERSION}.md`);

function markdownReport(result: ProviderRoutingStressResult): string {
  const checkRows = result.checks
    .map((check) => `| ${check.id} | ${check.pass ? 'PASS' : 'FAIL'} | ${check.opsState} | ${String(check.actual)} | ${check.expected} |`)
    .join('\n');
  const scenarioRows = result.scenarios
    .map((scenario) => `| ${scenario.id} | ${scenario.failureMode} | ${scenario.opsState} | ${scenario.envelopeStatus} | ${scenario.reason ?? '—'} | ${scenario.valueIsNull ? 'yes' : 'no'} | ${scenario.fabricated ? 'YES' : 'no'} |`)
    .join('\n');

  return `# Provider Routing Stress Report v${PROVIDER_ROUTING_STRESS_REPORT_VERSION}

- Generated: ${result.generatedAt}
- Verdict: **${result.verdict}**
- Seed: ${result.run.seed}
- Scenarios: ${result.run.scenarioCount}
- Checks: ${result.run.passedChecks}/${result.run.totalChecks}

## Failure-mode table

| Scenario | Failure mode | Ops state | Envelope | Reason | Value null | Fabricated |
|---|---|---|---|---|---|---|
${scenarioRows}

## Safety checks

| Check | Verdict | Ops state | Actual | Expected |
|---|---|---|---|---|
${checkRows}

## Safety boundary

Deterministic synthetic provider-routing evidence only. Does not train shadow ML,
create Decision Memory exports, enable live trading, or alter scanner/execution
behavior. Unavailable data remains unavailable — never a fabricated neutral.
`;
}

const result = await runProviderRoutingStress({
  seed: Number(process.env.APEX_STRESS_SEED ?? 42),
  generatedAt: new Date().toISOString(),
});

mkdirSync(outDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, markdownReport(result), 'utf8');
console.log(JSON.stringify({
  verdict: result.verdict,
  passedChecks: result.run.passedChecks,
  totalChecks: result.run.totalChecks,
  scenarioCount: result.run.scenarioCount,
}, null, 2));
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);

if (result.verdict !== 'PASS') {
  process.exitCode = 1;
}
