#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();
const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-optimizer-safety-'));
function walk(dir, files = []) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const f=path.join(dir,e.name); if(e.isDirectory()) walk(f,files); else if(e.isFile()&&f.endsWith('.ts')&&!f.endsWith('.test.ts')) files.push(f); } return files; }
for(const abs of walk(path.join(root,'src'))){ const rel=path.relative(root,abs); const out=ts.transpileModule(fs.readFileSync(abs,'utf8'),{fileName:rel,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,esModuleInterop:true}}); const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); if(errs.length) throw new Error(`transpile_failed:${rel}`); const dst=path.join(temp,rel.replace(/\.ts$/,'.js')); fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.writeFileSync(dst,out.outputText); }
const { optimizeStrategy } = require(path.join(temp,'src/services/strategyOptimization.js'));
const scannerConfig={intervalMs:6005,obiThreshold:-.15,volumeThreshold:0,qStructThreshold:-.30,fundingThreshold:.0001,oiExpansionThresholdPct:.30,atrExpansionThreshold:.005,maxSqueezeRisk:.46,minEvidenceAgreement:.64,minSmartMoneyScore:.52,smcHardRejectThreshold:.22,thresholdMode:'ADAPTIVE_GUARDRAILS',scorePreset:'CUSTOM',adaptiveLearningRate:.04,adaptiveMinSamples:24,scoreWeights:{obi:.12,volume:.11,qStruct:.14,funding:.10,openInterest:.10,atr:.08,microstructure:.12,liquidity:.13,smc:.10},minConfidence:.78,directionBias:'BOTH',topRankSkip:10,minVolume24hUsd:5_000_000};
const definition={strategyId:'optimizer-fixture-v1',version:1,name:'Optimizer Fixture',summary:'Fixture',evidenceTier:['B'],wave:'wave1-mvp',status:'candidate',longShort:'BOTH',supportedIntervals:['1h'],dataRequirements:['candles'],engine:'bespoke',runFn:'fixture',regimeRules:[],setupRules:[],triggerRules:[],riskRules:[],exitRules:[],noTradeRules:[],sourceReferences:[],knownFailureModes:[],categories:[],componentCount:1,parameters:[{key:'threshold',label:'Threshold',default:.2,min:0,max:1,step:.05,reason:'fixture'}]};
const candles=Array.from({length:1500},(_,i)=>({time:new Date(Date.UTC(2025,0,1,i)).toISOString(),open:100+i*.01,high:101+i*.01,low:99+i*.01,close:100.5+i*.01,volume:1000+i}));
const checks=[]; const check=(l,c)=>{checks.push({label:l,passed:!!c}); console.log(`${c?'PASS':'FAIL'} ${l}`)};
try{
 const report=await optimizeStrategy({definition,candles,baseScannerConfig:scannerConfig,baseParameters:{threshold:.2},symbol:'BTC-USDT',interval:'1h',direction:'LONG',transactionCostPct:.18,autoPromote:true,budget:{coarseCandidates:20,finalists:6,refinementCandidates:8,minTradesPerEvaluation:8,maxConcurrent:3,purgeBars:24,embargoBars:24},evaluator:({parameters,transactionCostPct})=>{const v=Number(parameters.threshold); const q=Math.max(0,1-Math.abs(v-.65)*2.2); return {totalPnlPct:q*12-transactionCostPct*2,maxDrawdownPct:5+(1-q)*4,profitFactor:1.05+q*1.2,tradeCount:24,winRatePct:48+q*18,avgPnlPct:.1+q*.7};}});
 check('optimizer finds bounded candidate', Number(report.winner.values.threshold)>.45 && Number(report.winner.values.threshold)<=1);
 check('optimizer marks eligibility but leaves persistence to guarded final validation', report.promotion.automaticallyPromoted===false && report.promotion.evidenceScope==='DEVELOPMENT_ONLY' && report.warnings.includes('Automatic promotion was requested, but optimization alone can only nominate a candidate for separate FULL_STRATEGY final validation.'));
 check('purge isolation is recorded', report.validationIsolation.purgeBars===24);
 check('embargo isolation is recorded', report.validationIsolation.embargoBars===24);
 check('final sealed holdout remains unopened', report.finalHoldoutStatus==='SEALED_NOT_OPENED_DURING_OPTIMIZATION' && typeof report.finalHoldoutDatasetFingerprint==='string');
 check('cost stress remains development-only evaluated', report.developmentValidation.costStress.label==='development-cost-stress');
 check('neighbor stability remains development-only evaluated', report.developmentValidation.neighbors.length>0);
 const failures=checks.filter(x=>!x.passed); const artifact={generatedAt:new Date().toISOString(),checks,summary:{winner:report.winner.values,eligible:report.promotion.eligible,automaticallyPromoted:report.promotion.automaticallyPromoted,evidenceScope:report.promotion.evidenceScope,finalHoldoutStatus:report.finalHoldoutStatus,finalHoldoutDatasetFingerprint:report.finalHoldoutDatasetFingerprint,developmentBaseline:report.developmentValidation.baseline.metrics,developmentCandidate:report.developmentValidation.candidate.metrics,costStress:report.developmentValidation.costStress.metrics,developmentValidationImprovement:report.promotion.developmentValidationImprovement,neighborPassRate:report.promotion.neighborPassRate,blockers:report.promotion.blockers,validationIsolation:report.validationIsolation,completedEvaluations:report.completedEvaluations,durationMs:report.durationMs}}; fs.writeFileSync(path.join(root,`QA/strategy-optimizer-safety-v${packageVersion}.json`),JSON.stringify(artifact,null,2)+'\n'); console.log(`\nStrategy optimizer safety runtime: ${checks.length-failures.length}/${checks.length} PASS`); process.exitCode=failures.length?1:0;
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
