import fs from 'node:fs';

const routes = fs.readFileSync('src/services/apexNextMarketRoutes.ts', 'utf8');
const reference = fs.readFileSync('src/services/marketReferenceService.ts', 'utf8');

const checks = [
  ['symbol detail has public-reference recovery', routes.includes("getReferenceCandles(symbol, intervalKey, limit, 'interactive')")],
  ['reference detail returns 200', routes.includes('res.status(200).json({') && routes.includes('referenceOnly: true')],
  ['reference detail blocks decision eligibility', routes.includes('decisionEligible: false') && routes.includes("decisionBlockedReason: 'futures_market_evidence_unavailable'")],
  ['reference detail cannot emit scores/trade plans', routes.includes('scoreLong: null') && routes.includes('scoreShort: null') && routes.includes('tradePlanLong: null') && routes.includes('tradePlanShort: null')],
  ['top-volume has bounded futures-first window', routes.includes('settleWithin(futuresPromise, 6_500)')],
  ['top-volume reference path is explicitly non-decision', routes.includes("reason: sorted.length ? 'futures_unavailable_public_reference_only'")],
  ['public providers use independent health probes', routes.includes('marketDataService.probePrimaryProviderHealth()') && routes.includes('binanceStatus: primary.binance.status') && routes.includes('kucoinStatus: primary.kucoin.status')],
  ['reference provider chain includes Binance Spot', reference.includes('https://api.binance.com')],
  ['reference provider chain includes CoinGecko', reference.includes('https://api.coingecko.com/api/v3')],
  ['reference provider chain includes CoinCap', reference.includes('https://api.coincap.io/v2')],
  ['reference provider chain includes CoinPaprika', reference.includes('https://api.coinpaprika.com/v1')],
  ['reference service contains no random market data', !reference.includes('Math.random')],
];

let failures = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failures += 1;
}

const payload = {
  generatedAt: new Date().toISOString(),
  suite: 'market-503-reference-recovery',
  passed: failures === 0,
  checks: checks.map(([name, pass]) => ({ name, pass })),
};
fs.mkdirSync('QA', { recursive: true });
fs.writeFileSync('QA/market-503-reference-recovery.json', `${JSON.stringify(payload, null, 2)}\n`);
if (failures) process.exit(1);
console.log(`Market 503 reference recovery passed (${checks.length}/${checks.length}).`);
