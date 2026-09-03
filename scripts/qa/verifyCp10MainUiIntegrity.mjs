import { readFileSync } from 'node:fs';
import { loadTypeScript } from './lib/loadTypeScript.mjs';

const ts = loadTypeScript();
const files={
 analytics:'src/pages/analytics/AnalyticsCommandPage.tsx', overview:'src/components/overview/OverviewMarketSummary.tsx',
 portfolio:'src/pages/portfolio/PortfolioPage.tsx', toolbox:'src/components/workspace/ToolboxDrawers.tsx',
 positions:'src/pages/positions/PositionsPage.tsx', trading:'src/components/workspace/AccountViews.tsx', orders:'src/pages/orders/OrdersPage.tsx'
};
const src=Object.fromEntries(Object.entries(files).map(([k,f])=>[k,readFileSync(f,'utf8')]));
const failures=[]; const check=(n,o)=>{console.log(`${o?'PASS':'FAIL'} ${n}`); if(!o) failures.push(n)};
check('Analytics does not label abs(priceChange)*constant as volatility',!src.analytics.includes('Math.abs(selected.priceChange24hPct) * 10')&&src.analytics.includes('24h Absolute Price Change'));
check('Analytics does not label turnover proxy as depth',src.analytics.includes('24h Turnover')&&!src.analytics.includes('Liquidity (Depth)'));
check('Analytics does not infer OI rising from nonzero OI',src.analytics.includes('Open Interest')&&!src.analytics.includes('Open Interest Dir.'));
check('Analytics does not expose fake 24H/7D/30D selector',!src.analytics.includes("setWindow(window === '24H'"));
check('Overview market breadth is not sentiment-adjusted',src.overview.includes('buildMarketBreadth(tickers)')&&!src.overview.includes('sentimentBreadthOverlay('));
check('Portfolio 1D uses timestamp filtering, not last 24 samples',src.portfolio.includes('Date.now() - 24 * 60 * 60 * 1000')&&!src.portfolio.includes('slice(-24)'));
check('Portfolio labels binary connectivity as connection status',src.portfolio.includes('Connection Status')&&!src.portfolio.includes('Session Health'));
check('Toolbox does not synthesize Neutral 50 sentiment',!src.toolbox.includes('sentiment?.score ?? 50')&&src.toolbox.includes('Sentiment unavailable'));
check('Toolbox does not synthesize 50/50 signal direction',!src.toolbox.includes('longPct = totalSignals ?')&&src.toolbox.includes('No signal-direction split available'));
check('Toolbox source update uses observation/source timestamp',src.toolbox.includes('sourceObservedAt')&&src.toolbox.includes('Source Time'));
check('Toolbox does not claim LIVE for current-only evidence',!src.toolbox.includes('>LIVE<'));
check('Positions missing account values do not become zero',!src.positions.includes('realizedPnlUsd ?? 0')&&!src.positions.includes('marginUsedUsd ?? 0')&&!src.positions.includes('availableBalanceUsd ?? 0'));
check('Positions UNKNOWN side is not styled as SHORT',src.positions.includes("position.side === 'SHORT' ? 'danger' : ''"));
check('Trading order draft has no BTC fallback symbol',src.trading.includes("symbol: selectedTicker?.symbol || '', side: 'buy'")&&!src.trading.includes("symbol: selectedTicker?.symbol || 'BTC-USDT', side"));
check('Trading no-score/tie remains unknown rather than LONG/SHORT',src.trading.includes("const intelligenceDirection: 'LONG' | 'SHORT' | null")&&src.trading.includes(': null;'));
check('Trading workspace context has no BTC fallback',!src.trading.includes("systemContext?.symbol || 'BTC-USDT'"));
check('Trading no-market chart is unavailable rather than price zero',src.trading.includes('Select a verified market to load a chart.')&&!src.trading.includes('lastPrice={selectedTicker?.lastPrice || 0}'));
check('Trading missing margin/equity does not render zero risk capacity',src.trading.includes('Margin utilization unavailable — required account values are missing.'));
check('Orders success notification follows awaited authoritative cancel',src.orders.indexOf('await cancelLiveOrder(selected.id)')>=0&&src.orders.indexOf("title: 'Order cancelled'")>src.orders.indexOf('await cancelLiveOrder(selected.id)'));
for(const [k,f] of Object.entries(files)){ const o=ts.transpileModule(src[k],{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:f,reportDiagnostics:true}); check(`${k} TypeScript/JSX syntax transpiles`,(o.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length===0); }
if(failures.length){console.error(`CP10 acceptance: FAIL (${failures.length})`); process.exit(1)}
console.log('CP10 Main UI acceptance: PASS');
