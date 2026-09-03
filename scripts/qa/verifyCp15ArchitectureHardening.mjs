import fs from 'node:fs';
import assert from 'node:assert/strict';

const route = fs.readFileSync('src/services/apexNextMarketRoutes.ts', 'utf8');
const health = fs.readFileSync('src/services/systemHealthTelemetry.ts', 'utf8');
const recoveryCss = fs.readFileSync('src/styles/page-recovery.css', 'utf8');

assert.match(route, /buildSystemHealthPayload/);
assert.match(route, /recordMarketCacheLookup/);
assert.match(route, /recordCandidateScanTelemetry/);
assert.doesNotMatch(route, /let marketCacheQueries\s*=/);
assert.doesNotMatch(route, /let marketCacheHits\s*=/);
assert.doesNotMatch(route, /let lastCandidateScanTelemetry\s*:/);
assert.match(health, /buildRuntimeProviderCapabilityHealth/);
assert.match(health, /cacheHitRatePct: marketCacheQueries > 0 \?/);
assert.match(health, /activeCandidateCount: scan\?\.activeCandidateCount \?\? null/);
assert.match(health, /lastScanTimestamp: scan\?\.scanTimestamp \?\? null/);
assert.match(health, /sentimentStatus: supplementalConfigured \? 'degraded' : 'not_configured'/);
assert.ok(recoveryCss.length > 0, 'existing recovery stylesheet must remain intact');
console.log('CP15 architecture hardening acceptance: PASS');
