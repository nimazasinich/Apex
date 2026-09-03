#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = loadTypeScript();
const root=process.cwd(); const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-exec-state-'));
for (const file of ['src/contracts/realtime/executionPositionState.ts','src/services/execution/executionPositionStateMachine.ts']) {
  const out=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,esModuleInterop:true}});
  const target=path.join(temp,file.replace(/\.ts$/,'.js')); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,out.outputText);
}
const {ExecutionPositionStateMachine}=require(path.join(temp,'src/services/execution/executionPositionStateMachine.js'));
const checks=[]; const check=(label,v)=>{const p=Boolean(v);checks.push({label,passed:p});console.log(`${p?'PASS':'FAIL'} ${label}`)};
let n=0; const ids=()=>`exec-${String(++n).padStart(6,'0')}`; const sm=new ExecutionPositionStateMachine(ids); const T=1000;
try {
  let row=sm.create({executionId:'qa-order',now:T,expiresAt:T+10000,clientOrderId:'client-1'});
  check('lifecycle starts CREATED',row.state==='CREATED');
  let skipped=false; try{sm.transition({executionId:'qa-order',nextState:'SUBMITTING',reason:'skip',now:T+1})}catch(e){skipped=String(e).includes('not_allowed')||String(e).includes('manual_confirmation')}
  check('submission cannot skip risk/manual confirmation',skipped);
  row=sm.transition({executionId:'qa-order',nextState:'RISK_AUTHORIZED',reason:'risk_passed',now:T+2});
  row=sm.transition({executionId:'qa-order',nextState:'AWAITING_MANUAL_CONFIRMATION',reason:'await_operator',now:T+3});
  row=sm.transition({executionId:'qa-order',nextState:'SUBMITTING',reason:'explicit_manual_confirmation',now:T+4});
  row=sm.transition({executionId:'qa-order',nextState:'ACKNOWLEDGED',reason:'exchange_ack',now:T+5,exchangeOrderId:'ex-1'});
  row=sm.transition({executionId:'qa-order',nextState:'PARTIALLY_FILLED',reason:'partial_fill',now:T+6});
  row=sm.transition({executionId:'qa-order',nextState:'FILLED',reason:'full_fill',now:T+7});
  row=sm.transition({executionId:'qa-order',nextState:'PROTECTING',reason:'attach_protection',now:T+8});
  row=sm.transition({executionId:'qa-order',nextState:'PROTECTED',reason:'protection_ack',now:T+9});
  row=sm.transition({executionId:'qa-order',nextState:'CLOSING',reason:'exit',now:T+10});
  row=sm.transition({executionId:'qa-order',nextState:'CLOSED',reason:'closed',now:T+11});
  check('partial fill → protection → close lifecycle is explicit',row.state==='CLOSED'&&row.transitions.length===10);

  let unknown=sm.create({executionId:'qa-unknown',now:T,expiresAt:T+10000});
  unknown=sm.transition({executionId:'qa-unknown',nextState:'RISK_AUTHORIZED',reason:'risk',now:T+1});
  unknown=sm.transition({executionId:'qa-unknown',nextState:'AWAITING_MANUAL_CONFIRMATION',reason:'manual',now:T+2});
  unknown=sm.transition({executionId:'qa-unknown',nextState:'SUBMITTING',reason:'submit',now:T+3});
  unknown=sm.transition({executionId:'qa-unknown',nextState:'UNKNOWN',reason:'timeout',now:T+4});
  check('uncertain submission enters UNKNOWN',unknown.state==='UNKNOWN');
  unknown=sm.transition({executionId:'qa-unknown',nextState:'RECONCILING',reason:'query_exchange',now:T+5});
  unknown=sm.transition({executionId:'qa-unknown',nextState:'FILLED',reason:'reconciled_fill',now:T+6});
  check('UNKNOWN requires reconciliation before resolved fill',unknown.state==='FILLED');

  let exp=sm.create({executionId:'qa-expire',now:T,expiresAt:T+5});
  exp=sm.transition({executionId:'qa-expire',nextState:'RISK_AUTHORIZED',reason:'risk',now:T+1});
  exp=sm.transition({executionId:'qa-expire',nextState:'AWAITING_MANUAL_CONFIRMATION',reason:'manual',now:T+2});
  exp=sm.transition({executionId:'qa-expire',nextState:'SUBMITTING',reason:'too_late',now:T+6});
  check('expired manual candidate fails closed before submit',exp.state==='EXPIRED');

  const failures=checks.filter(c=>!c.passed); console.log(`\nExecution position state machine runtime: ${checks.length-failures.length}/${checks.length} PASS`); process.exitCode=failures.length?1:0;
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
