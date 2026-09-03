import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const failures = [];
const pass = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const importTs = async (p) => import(pathToFileURL(path.join(root, p)).href);

const obs = await importTs('src/contracts/evidence/observationMetadata.ts');
const meta = obs.canonicalObservationMetadata({
  sourceObservedAt: 1_000,
  providerReadAt: 2_000,
  receivedAt: 2_100,
  cacheStoredAt: null,
  provider: 'test-provider',
  venue: 'test-venue',
  canonicalInstrumentId: 'BTC-USDT',
  providerInstrumentId: 'BTCUSDT',
  adapterVersion: 'test',
  qualityState: 'VALID',
  staleReason: null,
  lineageId: 'lineage:test',
  dependencyFamily: 'PRICE_CANDLES',
  parentLineageIds: [],
  decisionEligible: true,
});
const cached = obs.withCacheStoredAt({ metadata: meta }, 9_000);
pass('cache write preserves source observation time', cached.metadata.sourceObservedAt === 1_000);
pass('cache write records storage time separately', cached.metadata.cacheStoredAt === 9_000);
pass('age derives from source event time', obs.observationAgeMs(meta, 11_000) === 10_000);

const health = await importTs('src/contracts/providerCapabilityHealth.ts');
const capabilities = health.buildRuntimeProviderCapabilityHealth({
  checkedAt: 1234,
  kucoin: { status: 'live', reason: null },
  binance: { status: 'live', reason: null },
  supplementalConfigured: true,
});
const kucoin = capabilities.find((row) => row.provider === 'kucoin');
const tabdeal = capabilities.find((row) => row.provider === 'tabdeal');
const supplemental = capabilities.find((row) => row.provider === 'supplemental');
pass('connectivity probe can be OK', kucoin?.capabilities.connectivity.state === 'OK');
pass('ping does not imply candle health', kucoin?.capabilities.candles.state === 'NEVER_PROBED');
pass('ping does not imply funding health', kucoin?.capabilities.funding.state === 'NEVER_PROBED');
pass('Tabdeal unsupported klines stay unsupported', tabdeal?.capabilities.historicalKlines.state === 'NOT_SUPPORTED');
pass('configured supplemental provider is not called healthy without probe', supplemental?.capabilities.sentiment.state === 'NEVER_PROBED');

const market = read('src/services/marketDataService.ts');
pass('verified candle LKG only replaces on newer source time', /sourceObservedAt > existing\.sourceObservedAt/.test(market));
pass('stale candle age uses stored source observation time', /now - entry\.sourceObservedAt/.test(market));
pass('stale candle becomes decision-ineligible', /staleReason: 'last_known_good_replay'[\s\S]{0,120}decisionEligible: false/.test(market));

const route = read('src/services/apexNextMarketRoutes.ts');
const systemHealth = read('src/services/systemHealthTelemetry.ts');
pass('ticker LKG does not rejuvenate old rows', /incomingObservedAt > existingObservedAt/.test(route));
pass('system cache telemetry is measured, not hardcoded zero', /marketCacheQueries \+= 1/.test(systemHealth) && /marketCacheHits \+= 1/.test(systemHealth));
pass('unknown candidate telemetry remains null', /activeCandidateCount: scan\?\.activeCandidateCount \?\? null/.test(systemHealth));
pass('capability-specific health is returned', /buildRuntimeProviderCapabilityHealth/.test(systemHealth) && /providerCapabilities/.test(systemHealth));
const prefetchPos = route.indexOf('prefetchShortlist(');
const enrichmentPos = route.indexOf('const marketInputs = await mapWithConcurrency', prefetchPos);
pass('supplemental shortlist is prefetched before evidence scoring', prefetchPos >= 0 && enrichmentPos > prefetchPos);

const supplementalSource = read('src/services/supplementalOrchestrator.ts');
pass('scanner enrichment is bounded top-N', /prefetchShortlist[\s\S]{0,900}Math\.min\(options\.limit \?\? 6, unique\.length\)/.test(supplementalSource));
pass('sentiment source age inherits article timestamps', /result\.sourceArticleRefs\?\.length[\s\S]{0,180}oldestSourceObservation\(result\.sourceArticleRefs/.test(supplementalSource));
pass('sentiment preserves parent lineage', /parentLineageIds = result\.category === 'sentiment'/.test(supplementalSource));

const providerHealth = read('src/services/providerHealth.ts');
pass('dead NewsSentiment health registration removed', !providerHealth.includes("_initializeProvider('NewsSentiment'"));

if (failures.length) {
  console.error(`CP02 data/provenance acceptance: FAIL (${failures.length})`);
  process.exit(1);
}
console.log('CP02 data/provenance acceptance: PASS');
