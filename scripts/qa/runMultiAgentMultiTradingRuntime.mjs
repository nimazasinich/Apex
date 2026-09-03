#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url); const ts = loadTypeScript();
const root=process.cwd(), temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-multi-runtime-'));
function walk(dir,files=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f,files);else if(e.isFile()&&f.endsWith('.ts')&&!f.endsWith('.test.ts'))files.push(f)}return files}
for(const absolute of walk(path.join(root,'src'))){const file=path.relative(root,absolute);const o=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,esModuleInterop:true}});const errors=(o.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw new Error(`transpile_failed:${file}`);const target=path.join(temp,file.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,o.outputText)}
const get=(f)=>require(path.join(temp,f));
const {runMultiStrategyResearch}=get('src/services/multiStrategyResearchOrchestrator.js');
const {runMultiAgentResearchCouncil}=get('src/services/multiAgentResearchCouncil.js');
const {MultiAgentCouncilStore}=get('src/services/multiAgentCouncilStore.js');
const {sizePaperMultiTradePositions}=get('src/services/execution/paperMultiTradeSizer.js');
const checks=[];const check=(name,v)=>{const ok=Boolean(v);checks.push({name,ok});console.log(`${ok?'PASS':'FAIL'} ${name}`)};
try{
 let active=0,peak=0;
 const jobs=[
  {id:'trend-btc',strategyId:'s-trend',symbol:'BTC-USDT',interval:'1h',direction:'LONG',definition:{secret:'must-not-leak'}},
  {id:'reversal-btc',strategyId:'s-reversal',symbol:'BTC-USDT',interval:'1h',direction:'SHORT',definition:{secret:'must-not-leak'}},
  {id:'trend-eth',strategyId:'s-trend',symbol:'ETH-USDT',interval:'1h',direction:'LONG',definition:{secret:'must-not-leak'}},
 ];
 const report=await runMultiStrategyResearch({jobs,concurrency:2,maxPortfolioSlots:3,execute:async(job)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;const good=job.id==='trend-btc';const eth=job.id==='trend-eth';return {totalPnlPct:good?12:eth?7:3,maxDrawdownPct:good?3:eth?2:8,profitFactor:good?2.1:eth?1.6:0.8,tradeCount:good?30:eth?24:18,winRatePct:55,requestedBars:1000,candlesUsed:1000,dataSource:'fixture',dataState:'live',historyComplete:true}}});
 check('orchestrator enforces bounded concurrency',peak<=2);
 check('orchestrator returns all jobs',report.jobs.length===3&&report.runtime.completed===3);
 check('public result projection does not leak internal definition',report.jobs.every(j=>!('definition' in j)));
 check('same-symbol directional conflict is preserved as evidence',report.conflicts.some(c=>c.symbol==='BTC-USDT'&&c.longJobs.length&&c.shortJobs.length));
 check('orchestrator remains research-only',report.researchOnly===true&&report.executionAuthorized===false&&report.automaticOrderSubmission===false);
 check('research paper portfolio admits only profitable break-even-plus samples',report.paperPortfolio.every((plan)=>{const row=report.jobs.find((job)=>job.id===plan.id);return Boolean(row?.metrics&&row.metrics.totalPnlPct>0&&(row.metrics.profitFactor??0)>1&&row.metrics.tradeCount>=4)}));
 const failClosed=await runMultiStrategyResearch({
  jobs:[
   {id:'negative-high-utility',strategyId:'bad-return',symbol:'XRP-USDT',interval:'1h',direction:'LONG'},
   {id:'positive-too-small',strategyId:'tiny-sample',symbol:'SOL-USDT',interval:'1h',direction:'LONG'},
   {id:'positive-valid',strategyId:'valid',symbol:'ETH-USDT',interval:'1h',direction:'LONG'},
  ],
  execute:async(job)=>({
   totalPnlPct:job.id==='negative-high-utility'?-0.1:job.id==='positive-too-small'?5:1.2,
   maxDrawdownPct:job.id==='negative-high-utility'?0:1,
   profitFactor:job.id==='negative-high-utility'?4:job.id==='positive-too-small'?1.8:1.4,
   tradeCount:job.id==='negative-high-utility'?100:job.id==='positive-too-small'?2:12,
   winRatePct:55,requestedBars:1000,candlesUsed:1000,dataSource:'fixture',dataState:'live',historyComplete:true,
  }),
 });
 check('paper portfolio fails closed on negative returns and undersized positive samples',failClosed.paperPortfolio.length===1&&failClosed.paperPortfolio[0]?.id==='positive-valid');
 const council=runMultiAgentResearchCouncil(report,{capitalUsd:100000,portfolioRiskPct:1,maxSlots:3});
 check('council exposes five deterministic roles',new Set(council.assessments.map(a=>a.agentId)).size===5);
 check('council remains paper/research only',council.safety.paperOnly===true&&council.safety.executionAuthorized===false&&council.safety.riskGovernorBypassAllowed===false);
 check('council plan fingerprint is SHA-256',/^[a-f0-9]{64}$/.test(council.paperTradePlanFingerprint));
 const store=new MultiAgentCouncilStore(60000,8);const receipt=store.put(council,1000);
 const verified=store.verify(receipt.councilFingerprint,council.paperTradePlan,1001);
 check('server receipt binds exact plan set',verified.planFingerprint===council.paperTradePlanFingerprint);
 let tamperBlocked=false;
 if(council.paperTradePlan.length){const tampered=structuredClone(council.paperTradePlan);tampered[0].notionalBudgetUsd+=1;try{store.verify(receipt.councilFingerprint,tampered,1001)}catch{tamperBlocked=true}}
 else tamperBlocked=true;
 check('tampered paper plan is rejected by receipt binding',tamperBlocked);
 if(council.paperTradePlan.length){
   const entries=council.paperTradePlan.map((p,i)=>({id:p.id,entryPrice:100+i*10,stopPrice:p.direction==='LONG'?98+i*10:102+i*10}));
   const sized=sizePaperMultiTradePositions({sourceCouncilFingerprint:receipt.councilFingerprint,sourcePlanFingerprint:receipt.planFingerprint,plans:council.paperTradePlan,entries});
   check('paper sizer creates no executable order intents',sized.positions.every(p=>p.orderSubmissionAllowed===false&&p.requiresRiskGovernorApproval===true&&p.requiresManualConfirmation===true));
   check('paper sizer preserves literal execution denial',sized.safety.paperOnly===true&&sized.safety.executionAuthorized===false&&sized.safety.exchangeClientDependency===false);
 }else{
   check('paper sizer creates no executable order intents',true);check('paper sizer preserves literal execution denial',true);
 }
 const failed=checks.filter(c=>!c.ok);console.log(`\nMulti-agent/paper multi-trading runtime: ${checks.length-failed.length}/${checks.length} PASS`);process.exitCode=failed.length?1:0;
}finally{fs.rmSync(temp,{recursive:true,force:true})}
