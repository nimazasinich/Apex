import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const seed = JSON.parse(read('.apex-private-seed/api-provider-seed.json'));
const server = read('server.ts');
const orchestrator = read('src/services/supplementalOrchestrator.ts');
const settings = read('src/components/IntelligenceSourcesSettingsPanel.tsx');
const clientSettings = read('src/services/supplementalSettings.ts');
const defaults = read('src/config/completedApiDefaults.ts');
const newsRequest = read('src/services/providers/newsApiRequest.ts');

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });
const unique = (rows) => [...new Set((rows || []).filter(Boolean))];

check('private seed schema', seed.schemaVersion === 1, 'Private attached API pack uses schemaVersion 1.');
check('Newsdata default present', unique(seed.supplemental?.newsApiKeys).length >= 1, 'At least one Newsdata key is available.');
check('Newsdata endpoint matches attached configuration', newsRequest.includes("https://newsdata.io/api/1/latest"), 'Smart news requests use the attached /api/1/latest endpoint.');
check('CoinMarketCap rotation present', unique(seed.supplemental?.coinMarketCapKeys).length >= 2, 'Primary + reserve CoinMarketCap keys are available.');
check('Hugging Face rotation present', unique(seed.supplemental?.huggingFaceTokens).length >= 3, 'Three supplied HF tokens are available for bounded rotation.');
check('Explorer credentials present', unique(seed.supplemental?.etherscanKeys).length >= 1 && unique(seed.supplemental?.tronScanKeys).length >= 1 && unique(seed.supplemental?.bscScanKeys).length >= 1, 'Ethereum/TRON/BSC keys are present.');
check('server loads seed only on backend', server.includes('loadBundledPrivateApiSeed()') && server.includes('primarySeedKeys(bundledPrivateApiSeed)'), 'Server owns private-seed loading.');
check('server persists reserve keys privately', server.includes('reserveKeys: supplementalReserveKeys') && server.includes('writePrivateJsonFileSync(SUPPLEMENTAL_CONFIG_PATH, payload)'), 'Reserve keys persist through the private config store.');
check('settings exposes counts not secrets', server.includes('keyCounts') && settings.includes('Primary + reserve keys'), 'Settings gets configuration/count state only.');
check('Settings live probe follows Smart key-family fallback', server.includes('probeSupplementalKeyFamily') && server.includes('supplementalReserveKeys[key]') && server.includes('Promise.all(targetKeys.map'), 'Live verification uses bounded primary-to-reserve family probes and parallelizes provider families.');
check('browser service has no supplied secrets', !/hf_[A-Za-z0-9]{20,}|[a-f0-9]{8}-[a-f0-9-]{20,}/i.test(clientSettings), 'No attached secrets are embedded in the browser settings service.');
check('smart news key rotation wired', orchestrator.includes('newsKeys.forEach') && orchestrator.includes('NewsAPI Reserve'), 'News provider rotation is active.');
check('smart HF token rotation wired', orchestrator.includes('hfTokens.forEach') && orchestrator.includes('HuggingFace Reserve'), 'HF token rotation is active.');
check('smart explorer rotation wired', orchestrator.includes('etherscanKeys.forEach') && orchestrator.includes('tronScanKeys.forEach') && orchestrator.includes('effectiveBscKeys.forEach'), 'Explorer rotation is active.');
check('Alternative.me smart fallback wired', orchestrator.includes('new AlternativeMeSentimentProvider'), 'Public sentiment fallback is active.');
check('ClankApp smart fallback wired', orchestrator.includes('new ClankAppProvider'), 'Public whale fallback is active.');
check('public attached profiles visible in Settings', defaults.includes('default-coingecko-market') && defaults.includes('default-alternative-me-sentiment') && defaults.includes('default-clankapp-whales'), 'Keyless attached profiles are seeded into Custom API profiles.');
check('private CryptoCompare profile seeded safely', unique(seed.additionalSecrets?.cryptoCompareKeys).length >= 1 && server.includes('default-cryptocompare-market') && server.includes("enabled: false"), 'Supplied CryptoCompare key is represented as a disabled private Settings profile.');
check('raw RPC profiles default disabled', defaults.includes("id: 'default-ethereum-public-rpc'") && defaults.includes("id: 'default-bsc-public-rpc'") && defaults.match(/default-ethereum-public-rpc'[\s\S]{0,80}enabled: false/) && defaults.match(/default-bsc-public-rpc'[\s\S]{0,80}enabled: false/), 'JSON-RPC references are visible but not falsely marked active without a request body.');
check('restore API pack action exists', settings.includes('Restore API pack') && settings.includes('applySupplementalDefaults()') && settings.includes('applyExternalApiDefaults()'), 'Settings can restore the attached pack.');

for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name} — ${item.detail}`);
const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
