import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const checks = [];
const check = (name, condition, detail) => checks.push({ name, passed: Boolean(condition), detail });

const server = read('server.ts');
const orchestrator = read('src/services/supplementalOrchestrator.ts');
const regression = read('src/tests/supplementalEnvWiring.test.ts');

check(
  'server reads dedicated BSCSCAN_KEY',
  server.includes('bscScanKey: process.env.BSCSCAN_KEY || DEFAULT_SUPPLEMENTAL_KEYS.bscScanKey'),
  'The operator BscScan credential enters the runtime key store.',
);
check(
  'server propagates BscScan key to orchestrator',
  server.includes('bscScanKey: supplementalKeys.bscScanKey'),
  'Settings/runtime rebuild passes the dedicated key into the provider orchestrator.',
);
check(
  'orchestrator prefers dedicated BscScan key',
  orchestrator.includes('const effectiveBscKeys = bscScanKeys.length ? bscScanKeys : etherscanKeys') &&
    orchestrator.includes('new BscScanProvider({ apiKey, timeout })'),
  'BscScan uses dedicated primary/reserve keys first and falls back to the Etherscan V2 key rotation only when BSC keys are absent.',
);
check(
  'environment bootstrap propagates BSCSCAN_KEY',
  orchestrator.includes('bscScanKey: process.env.BSCSCAN_KEY'),
  'Non-Settings bootstrap reaches the same provider path.',
);
check(
  'regression covers precedence and fallback',
  regression.includes('prefers BSCSCAN_KEY over ETHERSCAN_KEY') &&
    regression.includes('deliberately falls back to ETHERSCAN_KEY when BSCSCAN_KEY is absent'),
  'Vitest coverage locks both the dedicated-key and deliberate fallback contracts.',
);

const failed = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name} — ${item.detail}`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
