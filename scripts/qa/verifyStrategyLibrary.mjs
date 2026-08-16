#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const registry=read('src/services/strategyRegistry.ts');const routes=read('src/services/apexNextMarketRoutes.ts');const backtesting=read('src/pages/backtesting/BacktestingPage.tsx');const runBuilder=read('src/pages/backtesting/BacktestRunBuilder.tsx');const strategyPage=read('src/pages/strategies/StrategyPage.tsx');const model=read('src/pages/strategies/StrategyModelWorkspace.tsx');const shell=read('src/components/workspace/WorkspaceShell.tsx');
const ids=[...registry.matchAll(/strategyId:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);const researchIds=ids.filter(id=>id!=='apex-composite-scanner-v1');
const checks={
  fourteenResearchStrategies:researchIds.length===14,
  uniqueStrategyIds:new Set(ids).size===ids.length,
  baselinePreserved:registry.includes("DEFAULT_STRATEGY_ID = 'apex-composite-scanner-v1'"),
  corePortfolioPresent:registry.includes('coreRank: 10')&&registry.includes('isCore: true'),
  blockedInfrastructureExplicit:registry.includes('dynamic-cointegration-basket-v1')&&registry.includes('cross-exchange-market-making-v1')&&registry.includes('status: \'blocked\''),
  listRoute:routes.includes("'/api/strategies'"),detailRoute:routes.includes("'/api/strategies/:strategyId'"),validationRoute:routes.includes("'/api/strategies/:strategyId/validate'"),
  multiResearchRoute:routes.includes("'/api/strategies/multi-backtest'"),paperSizingRoute:routes.includes("'/api/strategies/paper-multi-trade/size'"),
  backtestStrategySelection:backtesting.includes('strategyId')&&backtesting.includes('BacktestRunBuilder'),
  strategyNavPresent:shell.includes("id: 'strategies'"),
  manualBacktestHandoffOnly:strategyPage.includes('writeWorkspaceContext')&&strategyPage.includes("navigateWorkspace('backtesting')")&&!strategyPage.includes("fetch(`/api/market/backtest"),
  explicitDirectionSelection:model.includes('<DirectionSelector')&&runBuilder.includes('<DirectionSelector'),
  validationMutationProtected:strategyPage.includes('apiMutate(`/api/strategies/'),
  validationAndRankingModules:fs.existsSync(path.join(root,'src/services/strategyValidation.ts'))&&fs.existsSync(path.join(root,'src/services/strategyRanking.ts')),
};
const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);console.log(JSON.stringify({strategyIds:researchIds,researchStrategyCount:researchIds.length,checks,passed:failed.length===0,failed},null,2));if(failed.length)process.exit(1);
