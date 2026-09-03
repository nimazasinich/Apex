import { describe, expect, it } from 'vitest';
import { loadRiskGovernorPolicy, type RiskGovernorInput } from '../services/riskGovernor';
import { TabdealFapiClient, type TabdealHttpRequest, type TabdealHttpResponse, type TabdealHttpTransport } from '../services/exchanges/tabdeal/tabdealFapiClient';
import { buildTabdealCapabilities } from '../services/exchanges/tabdeal/tabdealCapabilities';
import { buildDeterministicClientOrderId, TabdealExecutionAdapter, TabdealReduceOnlyUnsupportedError, type TabdealPaperExecutionSink } from '../services/exchanges/tabdeal/tabdealExecutionAdapter';
import { evaluateReconciliation, canResubmit } from '../services/exchanges/tabdeal/tabdealReconciliation';
import { TabdealPublicWebsocket, type TabdealWebsocketLike } from '../services/exchanges/tabdeal/tabdealWebsocket';

class RecordingTransport implements TabdealHttpTransport {
  calls: TabdealHttpRequest[] = [];
  constructor(private readonly response: TabdealHttpResponse = { status: 200, body: {} }) {}
  async send(request: TabdealHttpRequest): Promise<TabdealHttpResponse> { this.calls.push(request); return this.response; }
}
class RecordingPaperSink implements TabdealPaperExecutionSink {
  orders: unknown[] = []; closes: unknown[] = []; protections: unknown[] = [];
  async recordOrder(input: unknown) { this.orders.push(input); return null; }
  async recordClose(input: unknown) { this.closes.push(input); return null; }
  async recordProtection(input: unknown) { this.protections.push(input); }
}
function riskInputWithout(overrides: Partial<Omit<RiskGovernorInput, 'order'>> = {}): Omit<RiskGovernorInput, 'order'> {
  const policy = overrides.policy ?? loadRiskGovernorPolicy({});
  return { account: { equityUsd: 100_000, availableMarginUsd: 90_000, timestamp: Date.now() }, portfolio: { openPositionCount: 0 }, market: { dataState: 'live', ageMs: 100, exchangeDegraded: false, reconciliationHealthy: true }, executionMode: 'MANUAL', policy, now: Date.now(), ...overrides };
}
function paperAdapter() { const sink = new RecordingPaperSink(); return { sink, adapter: new TabdealExecutionAdapter(buildTabdealCapabilities('PAPER'), sink) }; }

describe('Tabdeal execution safety', () => {
  it('REJECTED and DEFERRED never reach the paper sink', async () => {
    const { adapter, sink } = paperAdapter();
    const policy = loadRiskGovernorPolicy({}); policy.killSwitches.allTrading = true;
    const rejected = await adapter.submitOrderIntent({ intentId:'r1', symbol:'BTCUSDT', side:'BUY', type:'MARKET', quantity:.01, price:60000, reduceOnly:false }, riskInputWithout({ policy }));
    const deferred = await adapter.submitOrderIntent({ intentId:'r2', symbol:'BTCUSDT', side:'BUY', type:'MARKET', quantity:.01, price:60000, reduceOnly:false }, riskInputWithout({ market:{ dataState:'unavailable' } }));
    expect(rejected.submitted).toBe(false); expect(deferred.submitted).toBe(false); expect(sink.orders).toHaveLength(0);
  });
  it('approved PAPER intent records exactly once and never claims venue submission', async () => {
    const { adapter, sink } = paperAdapter();
    const result = await adapter.submitOrderIntent({ intentId:'p1', symbol:'BTCUSDT', side:'SELL', type:'MARKET', quantity:.01, price:60000, reduceOnly:false }, riskInputWithout());
    expect(result.submitted).toBe(true); expect(result.venueSubmitted).toBe(false); expect(sink.orders).toHaveLength(1);
  });
  it('same intent has stable clientOrderId', () => { expect(buildDeterministicClientOrderId('same')).toBe(buildDeterministicClientOrderId('same')); });
  it('reduceOnly fails closed', async () => {
    const { adapter, sink } = paperAdapter();
    await expect(adapter.submitOrderIntent({ intentId:'ro', symbol:'BTCUSDT', side:'SELL', type:'MARKET', quantity:.01, reduceOnly:true }, riskInputWithout())).rejects.toBeInstanceOf(TabdealReduceOnlyUnsupportedError);
    expect(sink.orders).toHaveLength(0);
  });
  it('SHADOW/READ_ONLY/LIVE_DISABLED cannot record or submit', async () => {
    for (const stage of ['SHADOW','READ_ONLY','LIVE_DISABLED'] as const) {
      const sink = new RecordingPaperSink(); const adapter = new TabdealExecutionAdapter(buildTabdealCapabilities(stage), sink);
      const result = await adapter.submitOrderIntent({ intentId:stage, symbol:'BTCUSDT', side:'BUY', type:'MARKET', quantity:.01, price:60000, reduceOnly:false }, riskInputWithout());
      expect(result.submitted).toBe(false); expect(result.venueSubmitted).toBe(false); expect(sink.orders).toHaveLength(0);
    }
  });
  it('close/protection use paper recording paths and protection requires positionId', async () => {
    const { adapter, sink } = paperAdapter();
    const close = await adapter.closePosition('c1','BTCUSDT',riskInputWithout()); expect(close.submitted).toBe(true); expect(sink.closes).toHaveLength(1);
    const bad = await adapter.setProtection({ positionId:0, symbol:'BTCUSDT', stopLossPrice:58000 }); expect(bad.applied).toBe(false);
    const ok = await adapter.setProtection({ positionId:7001, symbol:'BTCUSDT', stopLossPrice:58000, takeProfitPrice:65000, workingType:'MARK_PRICE' }); expect(ok.applied).toBe(true); expect(sink.protections).toHaveLength(1);
  });
});

describe('Tabdeal official FAPI REST mapping', () => {
  it('uses documented read and write channels/paths', async () => {
    const transport = new RecordingTransport(); const caps = buildTabdealCapabilities('SHADOW');
    const client = new TabdealFapiClient({ transport, credentials:{apiKey:'k',apiSecret:'s'}, capabilities:caps });
    await client.serverTime(); await client.aggDepth({symbol:'BTCUSDT',aggregationPrecision:100,limitRows:20}); await client.balance(); await client.getLeverage({symbol:'BTCUSDT'}); await client.positionHistory({symbol:'BTCUSDT'}); await client.closePosition({symbol:'BTCUSDT'}); await client.setPositionSlTp({positionId:7001,symbol:'BTCUSDT',slPrice:'39000'});
    expect(transport.calls.map(c=>[c.channel,c.method,c.path])).toEqual([
      ['READ','GET','/v1/time'],['READ','GET','/v1/aggDepth'],['READ','GET','/v3/balance'],['READ','GET','/v1/leverage'],['READ','GET','/v1/position'],['WRITE','DELETE','/v1/position'],['WRITE','POST','/v1/positionSlTp'],
    ]);
  });
});

describe('Tabdeal reconciliation', () => {
  const local={clientOrderId:'apex-td-x',symbol:'BTCUSDT',side:'BUY' as const,quantity:.01};
  it('UNKNOWN never resubmits',()=>{ const r=evaluateReconciliation(local,{found:null}); expect(r.state).toBe('UNKNOWN'); expect(canResubmit(r)).toBe(false); });
  it('only confirmed absence permits retry',()=>{ expect(canResubmit(evaluateReconciliation(local,{found:false}))).toBe(true); });
  it('mismatch and confirmed placement do not retry',()=>{
    expect(canResubmit(evaluateReconciliation(local,{found:true,order:{clientOrderId:'apex-td-x',symbol:'ETHUSDT',side:'BUY',quantity:.01,status:'NEW'}}))).toBe(false);
    expect(canResubmit(evaluateReconciliation(local,{found:true,order:{clientOrderId:'apex-td-x',symbol:'BTCUSDT',side:'BUY',quantity:.01,status:'NEW'}}))).toBe(false);
  });
});

describe('Tabdeal public websocket safety', () => {
  function fake(): TabdealWebsocketLike & { emitOpen():void; emitClose():void } { const s:any={readyState:0,onopen:null,onclose:null,onerror:null,onmessage:null,send:()=>{},close:()=>s.emitClose(),emitOpen:()=>s.onopen?.(null),emitClose:()=>s.onclose?.(null)}; return s; }
  it('unexpected disconnect reconnects but exposes no execution methods', async()=>{
    const sockets:ReturnType<typeof fake>[]=[]; const ws=new TabdealPublicWebsocket({factory:()=>{const s=fake();sockets.push(s);return s;},onMessage:()=>{},baseBackoffMs:1,maxBackoffMs:2});
    expect(Object.getOwnPropertyNames(TabdealPublicWebsocket.prototype)).not.toEqual(expect.arrayContaining(['submitOrder','closePosition','setPositionSlTp']));
    ws.connect(); sockets[0].emitOpen(); sockets[0].emitClose(); expect(ws.state).toBe('RECONNECTING'); await new Promise(r=>setTimeout(r,20)); expect(sockets.length).toBeGreaterThan(1); ws.disconnect();
  });
});

describe('Tabdeal capability truthfulness',()=>{
  it('keeps unsupported/unsafe features fail-closed',()=>{ const c=buildTabdealCapabilities(); expect(c.autonomousLiveExecutionEnabled).toBe(false); expect(c.automaticVenueFailoverEnabled).toBe(false); expect(c.execution.reduceOnly.supported).toBe(false); expect(c.unsupported.historicalKlines.supported).toBe(false); expect(c.unsupported.fundingRateFeed.supported).toBe(false); expect(c.unsupported.privateWebsocketUserData.supported).toBe(false); expect(c.unsupported.testnetSandbox.supported).toBe(false); });
});

describe('Tabdeal normalization truthfulness', () => {
  it('does not turn absent numeric fields into zero or absent direction into LONG', async () => {
    const { normalizeOrder, normalizePosition, normalizeTrade } = await import('../services/exchanges/tabdeal/tabdealNormalizer');
    expect(normalizeOrder({ orderId: 'o' })).toMatchObject({ side: 'UNKNOWN', quantity: null, executedQuantity: null, price: null, avgPrice: null });
    expect(normalizePosition({ symbol: 'BTCUSDT' })).toMatchObject({ direction: 'UNKNOWN', quantity: null, entryPrice: null, markPrice: null, unrealizedPnlUsd: null });
    expect(normalizeTrade({ id: 't' })).toMatchObject({ price: null, quantity: null, quoteQuantity: null, timestampMs: null });
  });
});
