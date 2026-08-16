#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('src/App.tsx');const shell=read('src/components/workspace/WorkspaceShell.tsx');const strategy=read('src/pages/strategies/StrategyPage.tsx');const model=read('src/pages/strategies/StrategyModelWorkspace.tsx');const evidence=read('src/pages/strategies/StrategyEvidenceRail.tsx');const backtest=read('src/pages/backtesting/BacktestingPage.tsx');const runBuilder=read('src/pages/backtesting/BacktestRunBuilder.tsx');
const checks={
 routeTypeRegistered:shell.includes("| 'strategies'"),sidebarMenuRegistered:shell.includes("id: 'strategies'")&&shell.includes("label: 'Strategies'"),sidebarMenuNavigates:shell.includes('onClick={() => onNavigate(item.id)}'),activeMenuState:shell.includes("page === item.id ? 'active' : ''"),
 routeWhitelisted:app.includes("'backtesting', 'strategies', 'settings'"),routeRendered:app.includes("case 'strategies': content = <StrategyPage"),strategyComponentImported:app.includes("import('./pages/strategies/StrategyPage')"),
 globalSearchIncludesPages:shell.includes('const pageResults = pageLabels')&&shell.includes('onNavigate(result.id)'),strategySearchable:shell.includes("{ id: 'strategies', label: 'Strategies'"),
 hashDeepLinkSupported:app.includes("window.location.hash.replace(/^#\\/?/, '')"),hashUpdatedOnNavigate:app.includes('`#/${nextPage}`'),
 realStrategyRegistryConsumed:strategy.includes("from '../../services/strategyRegistry'"),realStrategyApiConsumed:strategy.includes("fetch('/api/strategies'"),
 manualBacktestHandoff:strategy.includes('writeWorkspaceContext')&&strategy.includes("navigateWorkspace('backtesting')")&&backtest.includes('/api/market/backtest'),
 validationUsesSharedMutation:strategy.includes('apiMutate(`/api/strategies/')&&strategy.includes("method: 'POST'"),
 explicitDirectionSelector:model.includes('<DirectionSelector')&&runBuilder.includes('<DirectionSelector'),
 staleRequestGuard:strategy.includes('validationRequestRef')&&strategy.includes('optimizationRequestRef')&&strategy.includes('liquidityHunterRequestRef')&&strategy.includes('AbortController'),
 evidenceHonesty:evidence.includes('Evidence pending')&&evidence.includes('not presented as verified performance'),
 researchMatrixIntegrated:backtest.includes('MultiStrategyResearchPanel')&&backtest.includes('Research Matrix'),
};
const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);console.log(JSON.stringify({generatedAt:new Date().toISOString(),targetViewport:'responsive split workspace',page:'Strategy Studio',route:'#/strategies',checks,passed:failed.length===0,failed},null,2));if(failed.length)process.exit(1);
