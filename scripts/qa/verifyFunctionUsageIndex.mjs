#!/usr/bin/env node
import fs from 'node:fs';

const indexPath = 'Doc/FUNCTION_INDEX.json';
const checks = [];
const check = (name, condition, detail = '') => {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const atlas = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const usage = atlas.fileUsage ?? {};
const values = Object.values(usage);
const referenceAnalytics = ['src/pages/analytics', 'AnalyticsPage.tsx'].join('/');
const referenceBacktestHero = ['src/pages/backtesting', 'BacktestEvidenceHero.tsx'].join('/');
const srcOrphans = values.filter((entry) => entry.file?.startsWith('src/') && entry.usageStatus === 'unreferenced-static');
const serviceOrphans = srcOrphans.filter((entry) => entry.file.startsWith('src/services/'));

check('function atlas exposes file usage graph', values.length > 0 && values.every((entry) => Array.isArray(entry.importedBy) && Array.isArray(entry.sourceContractReferencedBy)));
check('src has no unresolved static orphan candidates', srcOrphans.length === 0, srcOrphans.map((entry) => entry.file).join(', '));
check('services have no unresolved static orphan candidates', serviceOrphans.length === 0, serviceOrphans.map((entry) => entry.file).join(', '));
check('active correlation matrix is production reachable', usage['src/pages/analytics/components/CorrelationMatrix.tsx']?.usageStatus === 'production-runtime');
check('active provenance chip is production reachable', usage['src/components/ui/ProvenanceChip.tsx']?.usageStatus === 'production-runtime');
check('reference analytics page is explicitly source-contract-only', usage[referenceAnalytics]?.usageStatus === 'source-contract-only' && usage[referenceAnalytics]?.sourceContractReferencedBy?.length > 0);
check('reference backtest hero is explicitly source-contract-only', usage[referenceBacktestHero]?.usageStatus === 'source-contract-only' && usage[referenceBacktestHero]?.sourceContractReferencedBy?.length > 0);

const failed = checks.filter((entry) => !entry.ok);
console.log(`\nFunction usage index contract: ${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length ? 1 : 0);
