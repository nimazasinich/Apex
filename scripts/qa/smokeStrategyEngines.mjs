#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
}
const root = process.cwd();
const sourceDir = path.join(root, 'src/services/strategyEngine');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-strategy-smoke-'));
const transactionCostSource = fs.readFileSync(path.join(root, 'src/services/transactionCosts.ts'), 'utf8');
fs.writeFileSync(path.join(temp, 'transactionCosts.js'), ts.transpileModule(transactionCostSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
for (const file of ['replayHarness.ts','orbVwapBreakout.ts','volatilitySqueezeExpansion.ts','vwapPullbackReacceleration.ts','adaptiveTrendPortfolio.ts','regimeRoutedComposite.ts','index.ts']) {
  const source = fs.readFileSync(path.join(sourceDir, file), 'utf8');
  const out = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText.replace("require(\"../transactionCosts\")", "require(\"./transactionCosts\")");
  fs.writeFileSync(path.join(temp, file.replace(/\.ts$/, '.js')), out);
}
const { bespokeStrategyRunners } = require(path.join(temp, 'index.js'));

function makeCandles(symbolSeed = 0) {
  const rows=[]; let close=100+symbolSeed;
  for(let i=0;i<900;i++){
    const dayWave=Math.sin(i/24)*0.65;
    const trend=(i%180<130?0.16:-0.08) + symbolSeed*0.001;
    const open=close;
    close=Math.max(5, close+trend+dayWave*0.08+Math.sin(i/7)*0.09);
    const high=Math.max(open,close)+0.45+(i%17===0?1.2:0);
    const low=Math.min(open,close)-0.42-(i%29===0?0.8:0);
    const volume=1000+(i%24)*35+(i%31===0?1800:0);
    rows.push({time:new Date(Date.UTC(2026,0,1)+i*15*60_000).toISOString(),open,high,low,close,volume});
  }
  return rows;
}
const base=makeCandles();
const context={symbol:'BTC-USDT',interval:'15m',direction:'BOTH',maxBars:24,candles:base,transactionCostModel:{feePct:0.08,spreadPct:0.045,fundingRate:0.0001,fundingIntervalBars:8},universeCandles:{'BTC-USDT':base,'ETH-USDT':makeCandles(8),'SOL-USDT':makeCandles(16)}};
const results={};
for(const [key, run] of Object.entries(bespokeStrategyRunners)){
  const first=run(context); const second=run(context);
  const deterministic=JSON.stringify(first)===JSON.stringify(second);
  const shape=Array.isArray(first.trades)&&Array.isArray(first.equityCurve)&&typeof first.summary?.trades==='number';
  results[key]={deterministic,shape,trades:first.summary.trades,totalPnlPct:first.summary.totalPnlPct};
}
const passed=Object.values(results).every(r=>r.deterministic&&r.shape);
console.log(JSON.stringify({passed,results},null,2));
fs.rmSync(temp,{recursive:true,force:true});
process.exit(passed?0:1);
