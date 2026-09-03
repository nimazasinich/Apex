import { readFileSync } from 'node:fs';
import { loadTypeScript } from './lib/loadTypeScript.mjs';

const ts = loadTypeScript();
const files=['src/services/exchanges/tabdeal/tabdealCapabilities.ts','src/services/exchanges/tabdeal/tabdealNormalizer.ts','src/services/exchanges/tabdeal/tabdealPositionAdapter.ts','src/services/tabdealConnectionClient.ts','src/hooks/useTabdealAccount.ts','src/components/account/TabdealAccountSurface.tsx','src/config/exchangeConnections.ts','src/components/workspace/AccountViews.tsx','src/pages/positions/PositionsPage.tsx','src/pages/orders/OrdersPage.tsx','src/pages/settings/SettingsPage.tsx','src/services/workspaceInsights.ts','server.ts'];
const s=Object.fromEntries(files.map(f=>[f,readFileSync(f,'utf8')])); const fails=[];const c=(n,o)=>{console.log(`${o?'PASS':'FAIL'} ${n}`);if(!o)fails.push(n)};
const caps=s[files[0]], norm=s[files[1]], adapter=s[files[2]], client=s[files[3]], hook=s[files[4]], surface=s[files[5]], registry=s[files[6]], account=s[files[7]], positions=s[files[8]], orders=s[files[9]], settings=s[files[10]], insights=s[files[11]], server=s[files[12]];
c('KuCoin remains primary/default and Tabdeal secondary',registry.includes("id: 'kucoin'")&&registry.includes('isDefault: true')&&registry.includes('isDefault: false')&&registry.includes('describeKuCoinConnection(input.kuCoinConnected),\n    describeTabdealConnection(input.tabdealExecutionStage, input.tabdealSignal)'));
c('Tabdeal autonomous execution and automatic failover remain hard-false',caps.includes('autonomousLiveExecutionEnabled: false')&&caps.includes('automaticVenueFailoverEnabled: false'));
c('unsupported Tabdeal klines/funding remain unsupported',caps.includes("historicalKlines: entry(false, false")&&caps.includes("fundingRateFeed: entry(false, false"));
c('Tabdeal snapshot is explicitly venue-attributed',norm.includes("venue: TABDEAL_EXCHANGE_ID")&&norm.includes("exchange: TABDEAL_EXCHANGE_ID"));
c('Tabdeal normalizer preserves null/UNKNOWN rather than zero/direction defaults',norm.includes("positionAmt === null ? 'UNKNOWN'")&&norm.includes('quantity: positionAmt === null ? null'));
c('Tabdeal history is bounded and uses only discovered authoritative symbols',adapter.includes('].filter(Boolean))].slice(0, 3)')&&adapter.includes('allOrders:${symbol}')&&adapter.includes('userTrades:${symbol}'));
c('frontend Tabdeal response parsing is typed without unknown-as response cast',!client.includes('as unknown as')&&!client.includes(': any')&&client.includes('parseSnapshot')&&client.includes("row.venue !== 'tabdeal'"));
c('stale Tabdeal snapshot is retained without rewriting source timestamp',hook.includes('if (current) setStale(true); return current;')&&surface.includes('original source timestamp was not refreshed'));
c('connected Tabdeal balance/account visibility renders outside Settings',surface.includes('Equity')&&surface.includes('Available')&&surface.includes('Tabdeal FAPI · Secondary venue'));
c('Tabdeal positions render with venue attribution',surface.includes('Tabdeal positions')&&surface.includes('<th>Venue</th>')&&positions.includes('TabdealAccountSurface mode="positions"'));
c('Tabdeal orders render with venue attribution',surface.includes('Tabdeal orders')&&orders.includes('TabdealAccountSurface mode="orders"'));
c('disconnected/degraded/stale states are explicit',surface.includes("'DISCONNECTED'")&&surface.includes("'DEGRADED'")&&surface.includes("'STALE'"));
c('unsupported capabilities render NOT_SUPPORTED_BY_VENUE',surface.split('NOT_SUPPORTED_BY_VENUE').length>=3);
c('workspace objects retain venue identity end-to-end',insights.includes("venue: 'kucoin' | 'tabdeal' | 'demo' | 'unknown'")&&insights.includes('venue: snapshotVenue(snapshot)'));
c('Settings and AccountViews consume the same server Tabdeal connection truth',settings.includes('getTabdealConnection')&&account.includes('useTabdealAccount'));
c('AccountViews exposes Tabdeal secondary status without making it execution fallback',account.includes('<dt>Tabdeal secondary</dt>')&&!account.includes('automaticVenueFailoverEnabled = true'));
c('server exposes read-only connection and snapshot routes only',server.includes("app.get('/api/exchanges/tabdeal/snapshot'")&&server.includes('authenticated READ_ONLY')&&!server.includes("app.post('/api/exchanges/tabdeal/order'"));
for(const f of files){const out=ts.transpileModule(s[f],{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:f,reportDiagnostics:true});c(`syntax ${f}`,(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length===0)}
if(fails.length){console.error(`CP12 acceptance: FAIL (${fails.length})`);process.exit(1)}console.log('CP12 Tabdeal full-stack acceptance: PASS');
