#!/usr/bin/env node
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-unified-safety-'));
function walk(d,a=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f,a);else if(e.isFile()&&f.endsWith('.ts')&&!f.endsWith('.test.ts'))a.push(f)}return a}
for(const absolute of walk(path.join(root,'src'))){const file=path.relative(root,absolute),o=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,esModuleInterop:true}});const errs=(o.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(`transpile_failed:${file}`);const target=path.join(temp,file.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,o.outputText)}
const get=f=>require(path.join(temp,f));const {deriveLiveRiskTelemetry}=get('src/services/liveRiskTelemetry.js');const {PROVIDER_PRIORITY,PROVIDER_CAPABILITIES,assertProviderPriorityIntegrity}=get('src/services/providerRouter.js');const {PositionProtectionCoordinator}=get('src/services/execution/positionProtectionCoordinator.js');const {EdgeThresholdGovernanceStore,createBaselineEdgeThresholdProfile}=get('src/services/liquidityHunter/edgeThresholdRegistry.js');const {optimizeEdgeThreshold}=get('src/services/liquidityHunter/edgeThresholdOptimizer.js');
const checks=[];const check=(n,v)=>{const ok=Boolean(v);checks.push({n,ok});console.log(`${ok?'PASS':'FAIL'} ${n}`)};
try{
 const now=Date.UTC(2026,7,8,10,0,0);const history=[
  {closeTime:now-1*3600_000,realizedPnl:-40},{closeTime:now-2*3600_000,realizedPnl:-20},{closeTime:now-3*3600_000,realizedPnl:60},{closeTime:now-2*86400_000,realizedPnl:100},
 ];
 const telemetry=deriveLiveRiskTelemetry({account:{drawdownPct:2.5},positions:[{currentQty:2,avgEntryPrice:100,liquidationPrice:80,multiplier:1}],positionHistory:history,historyAvailable:true,historyTruncated:false,now});
 check('live telemetry derives measured open risk',telemetry.totalOpenRiskUsd===40);
 check('live telemetry derives daily realized PnL',telemetry.dailyPnlUsd===0);
 check('live telemetry derives weekly realized PnL',telemetry.weeklyPnlUsd===100);
 check('live telemetry derives consecutive losses from newest history',telemetry.consecutiveLosses===2);
 check('live telemetry uses explicit drawdown only',telemetry.drawdownPct===2.5);
 const unknown=deriveLiveRiskTelemetry({account:{},positions:[{currentQty:1,avgEntryPrice:100}],positionHistory:history,historyAvailable:true,historyTruncated:true,now});
 check('truncated history fails honest to UNKNOWN',unknown.dailyPnlUsd===null&&unknown.weeklyPnlUsd===null&&unknown.consecutiveLosses===null);

 assertProviderPriorityIntegrity();
 check('provider registry marks Bitget and OKX planned, not executable',PROVIDER_CAPABILITIES.bitget.registered===false&&PROVIDER_CAPABILITIES.okx.registered===false);
 check('generic provider priorities contain only executable REST-capable routes',Object.values(PROVIDER_PRIORITY).flat().every(p=>PROVIDER_CAPABILITIES[p].registered&&PROVIDER_CAPABILITIES[p].transport.includes('REST')));

 const coordinator=new PositionProtectionCoordinator();const protection=coordinator.create({executionId:'qa-fill',symbol:'BTC-USDT',direction:'LONG',filledQuantity:1,averageFillPrice:100,stopLoss:98,targets:[102,104,106]});
 check('restored protection plan is non-executing and reduce-only',protection.executionAuthorized===false&&protection.legs.every(l=>l.reduceOnly===true));

 const storePath=path.join(temp,'edge-governance.json');const store=new EdgeThresholdGovernanceStore(storePath);const scope={edgeId:'FUNDING_OI',symbolClass:'BTC',timeframe:'1h',regime:'ANY'};const profile=createBaselineEdgeThresholdProfile(scope);
 const observations=Array.from({length:180},(_,i)=>({edgeId:'FUNDING_OI',role:i<135?'DEVELOPMENT':'HOLDOUT',timestamp:now+i,score:i%3===0?0.45:0.72,netReturnPct:i%3===0?-0.3:0.6,dataQuality:0.95,regime:i%2?'TREND':'RANGE',sourceVersion:'qa-v1'}));
 const report=optimizeEdgeThreshold({profile,observations,validationContext:{sourceSet:['qa'],featureVersion:'qa-v1',validationProtocol:'PURGED_WALK_FORWARD_HOLDOUT',datasetFingerprintSha256:'a'.repeat(64)},now});const proposal=store.stage(report,{symbolClass:'BTC',timeframe:'1h',regime:'ANY'});
 check('threshold optimization remains shadow/manual',report.automaticPromotionEnabled===false&&report.shadowOnly===true&&store.snapshot().automaticPromotionEnabled===false);
 let directApproveBlocked=false;try{store.approve(proposal.id,'qa-operator')}catch{directApproveBlocked=true}
 check('threshold direct approval is blocked before paper-canary evidence',directApproveBlocked);
 const failed=checks.filter(c=>!c.ok);console.log(`\nUnified safety runtime: ${checks.length-failed.length}/${checks.length} PASS`);process.exitCode=failed.length?1:0;
}finally{fs.rmSync(temp,{recursive:true,force:true})}
