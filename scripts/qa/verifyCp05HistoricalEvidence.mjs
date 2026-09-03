import { finalizeHistoricalEvidenceDataset, evidenceAvailableAsOf, requireHistoricalEvidenceCoverage } from '../../src/services/research/historicalEvidenceStore.ts';
import fs from 'node:fs';
const failures=[]; const t=(n,o)=>{console.log(`${o?'PASS':'FAIL'} ${n}`);if(!o)failures.push(n)};
const mk=(id,kind,time,payload={v:id})=>({id,kind,provider:'fixture',venue:'kucoin',instrument:'BTC-USDT',sourceObservedAt:time,receivedAt:time+1,schemaVersion:'1',adapterVersion:'v1',lineageId:`l:${id}`,parentLineageIds:[],payload});
const d=finalizeHistoricalEvidenceDataset([mk('c','CLOSED_CANDLE',1000),mk('future','NEWS',3000)]);
t('future evidence excluded from historical as-of read', evidenceAvailableAsOf(d,2000).every(r=>r.sourceObservedAt<=2000) && !evidenceAvailableAsOf(d,2000).some(r=>r.id==='future'));
t('dataset manifest is content-addressed SHA-256', /^[0-9a-f]{64}$/.test(d.manifest.sha256));
const d2=finalizeHistoricalEvidenceDataset([mk('c','CLOSED_CANDLE',1000,{v:'changed'}),mk('future','NEWS',3000)]);
t('dataset fingerprint changes when content changes', d.manifest.sha256!==d2.manifest.sha256);
const coverage=requireHistoricalEvidenceCoverage(d,['CLOSED_CANDLE','FUNDING']);
t('missing required modality blocks FULL_STRATEGY', coverage.ok===false && coverage.state==='BLOCKED' && coverage.missing.includes('FUNDING'));
const log=fs.readFileSync('src/services/realtime/appendOnlyEventLog.ts','utf8');
t('rolling operational log archives before deletion', log.includes("digest + '.jsonl'") && log.includes('fs.unlinkSync(stale)'));
t('archive is content addressed before prune', log.indexOf("crypto.createHash('sha256')") < log.indexOf('fs.unlinkSync(stale)'));
if(failures.length){console.error(`CP05 historical-evidence acceptance: FAIL (${failures.length})`);process.exit(1)}
console.log('CP05 historical-evidence acceptance: PASS');
