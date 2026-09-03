import { readFileSync } from 'node:fs';
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import { computeFundingCost, computeTransactionCostPct, transactionCostProfileFingerprint } from '../../src/services/transactionCosts.ts';

const ts = loadTypeScript();

const failures=[];
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failures.push(name)};
const throws=(fn,needle)=>{try{fn();return false}catch(error){return String(error?.message||error).includes(needle)}};
const entry=Date.UTC(2026,0,1,1); const exit=Date.UTC(2026,0,1,17);
const coverage={state:'COMPLETE',coveredFrom:Date.UTC(2026,0,1,0),coveredTo:Date.UTC(2026,0,2,0),provider:'KUCOIN',provenance:'funding-history',fingerprint:'funding:test'};
const events=[{timestamp:Date.UTC(2026,0,1,8),rate:0.001,provider:'KUCOIN'},{timestamp:Date.UTC(2026,0,1,16),rate:-0.0005,provider:'KUCOIN'}];

const zero=computeFundingCost({entryAt:entry,exitAt:Date.UTC(2026,0,1,7),direction:'LONG',fundingEvents:[],fundingCoverage:coverage,fundingAccountingMode:'REALIZED_EVENT_TIME',fundingPolicy:'REALIZED_SIGNED'});
check('no crossed funding event is zero only with COMPLETE coverage',zero.pct===0&&zero.eventsCrossed===0&&zero.decisionEligibleAsRealized===true);
check('missing funding coverage blocks instead of returning zero',throws(()=>computeFundingCost({entryAt:entry,exitAt:Date.UTC(2026,0,1,7),direction:'LONG',fundingEvents:[],fundingCoverage:{...coverage,state:'PARTIAL'},fundingAccountingMode:'REALIZED_EVENT_TIME'}),'funding_coverage_incomplete'));
const long=computeFundingCost({entryAt:entry,exitAt:exit,direction:'LONG',fundingEvents:events,fundingCoverage:coverage,fundingAccountingMode:'REALIZED_EVENT_TIME',fundingPolicy:'REALIZED_SIGNED'});
const short=computeFundingCost({entryAt:entry,exitAt:exit,direction:'SHORT',fundingEvents:events,fundingCoverage:coverage,fundingAccountingMode:'REALIZED_EVENT_TIME',fundingPolicy:'REALIZED_SIGNED'});
check('LONG and SHORT realized funding signs are direction-correct',Math.abs(long.pct-0.05)<1e-12&&Math.abs(short.pct+0.05)<1e-12);
check('multiple crossed funding events are accumulated',long.eventsCrossed===2);
const conservative=computeFundingCost({entryAt:entry,exitAt:exit,direction:'SHORT',fundingRate:0.001,fundingAccountingMode:'CONSERVATIVE_EXPECTED',fundingScheduleUtcHours:[0,8,16],fundingPolicy:'CONSERVATIVE_NO_CREDIT'});
check('conservative expected funding is distinct from realized accounting',conservative.accountingMode==='CONSERVATIVE_EXPECTED'&&conservative.source==='EXPECTED_SCHEDULE'&&conservative.decisionEligibleAsRealized===false&&conservative.pct===0);
check('bar-count-only cost does not synthesize funding',computeTransactionCostPct({entryPrice:100,holdingBars:100,fundingRate:0.001,fundingIntervalBars:1,fundingAccountingMode:'NONE',feePct:0,spreadPct:0})===0);
const baseFp=transactionCostProfileFingerprint({feePct:.1,spreadPct:.02,fundingRate:.001,fundingAccountingMode:'NONE'});
const realizedFp=transactionCostProfileFingerprint({feePct:.1,spreadPct:.02,fundingRate:.001,fundingAccountingMode:'REALIZED_EVENT_TIME',fundingCoverage:coverage});
check('cost-policy fingerprint changes with funding accounting/coverage policy',baseFp!==realizedFp);

const liveStore=readFileSync('src/services/liveExecutionIntentStore.ts','utf8');
const connected=readFileSync('src/services/connectedExchange.ts','utf8');
const routes=readFileSync('src/services/apexNextMarketRoutes.ts','utf8');
const validation=readFileSync('src/services/apiValidation.ts','utf8');
check('execution recorder persists required timing/price/slippage fields', ['decisionAt','orderSubmittedAt','ackAt','firstFillAt','completedAt','midAtDecision','expectedEntry','actualVWAP','slippageBps','spreadAtDecisionBps','depthAtDecisionUsd','partialFillObserved'].every(k=>liveStore.includes(k)));
check('execution calibration reports insufficient evidence until minimum real samples exist',liveStore.includes("status: calibrated ? 'CALIBRATED' : 'INSUFFICIENT_EVIDENCE'")&&liveStore.includes('minimumSamples = 30'));
check('live submission seeds decision and submission/ack telemetry from real lifecycle points',connected.includes('telemetrySeed: {')&&connected.includes('const orderSubmittedAt = Date.now()')&&connected.includes('const ackAt = Date.now()'));
check('unavailable depth is recorded as unavailable rather than fabricated',connected.includes('depthAtDecisionUsd: null')&&connected.includes('depth=unavailable_not_fabricated'));
check('production replay requires explicit funding coverage',validation.includes('fundingCoverage is required for production-input replay')&&routes.includes('funding_coverage_incomplete'));
check('development optimization no longer charges scalar funding as a fabricated settlement',!routes.includes('commissionPctPerSide * 2 + args.slippagePctPerSide * 2 + args.fundingPctEstimate'));

for (const path of ['src/services/transactionCosts.ts','src/services/liveExecutionIntentStore.ts','src/services/connectedExchange.ts','src/services/apiValidation.ts','src/services/backtesting.ts','src/services/canonicalCandidateDecision.ts']) {
  const out=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true,fileName:path});
  const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  check(`TypeScript syntax transpiles: ${path}`,errors.length===0);
}

if(failures.length){console.error(`CP08 cost/execution acceptance: FAIL (${failures.length})`);process.exit(1)}
console.log('CP08 cost/execution acceptance: PASS');
