/**
 * Tabdeal Professional Leverage (FAPI) capability matrix.
 * Official source: https://docs.tabdeal.org/ — FAPI section (v0.9.0).
 *
 * KuCoin remains primary/default. Tabdeal is explicit opt-in only; there is no
 * automatic cross-venue failover and autonomous live execution stays disabled.
 */
export const TABDEAL_ADAPTER_VERSION = 'tabdeal_fapi_adapter_v2';
export const TABDEAL_EXCHANGE_ID = 'tabdeal' as const;

export type TabdealExecutionStage = 'SHADOW' | 'READ_ONLY' | 'PAPER' | 'LIVE_DISABLED';
export type TabdealConnectionStatus = 'DISCONNECTED' | 'CONNECTED' | 'READ_ONLY' | 'PAPER_READY' | 'LIVE_DISABLED' | 'DEGRADED';

export interface TabdealCapabilityEntry {
  supported: boolean;
  verified: boolean;
  notes: string;
}

export interface TabdealCapabilities {
  version: typeof TABDEAL_ADAPTER_VERSION;
  exchangeId: typeof TABDEAL_EXCHANGE_ID;
  displayName: 'Tabdeal FAPI';
  autonomousLiveExecutionEnabled: false;
  automaticVenueFailoverEnabled: false;
  executionStage: TabdealExecutionStage;
  publicMarketData: {
    ping: TabdealCapabilityEntry;
    exchangeInfo: TabdealCapabilityEntry;
    orderBookDepth: TabdealCapabilityEntry;
    aggregatedDepth: TabdealCapabilityEntry;
    serverTime: TabdealCapabilityEntry;
    publicDepthWebsocket: TabdealCapabilityEntry;
    publicTradeWebsocket: TabdealCapabilityEntry;
  };
  accountRead: {
    account: TabdealCapabilityEntry;
    balance: TabdealCapabilityEntry;
    positionRisk: TabdealCapabilityEntry;
    leverage: TabdealCapabilityEntry;
    openOrders: TabdealCapabilityEntry;
    allOrders: TabdealCapabilityEntry;
    userTrades: TabdealCapabilityEntry;
    income: TabdealCapabilityEntry;
    positionHistory: TabdealCapabilityEntry;
  };
  execution: {
    marketOrders: TabdealCapabilityEntry;
    limitOrders: TabdealCapabilityEntry;
    reduceOnly: TabdealCapabilityEntry;
    closePosition: TabdealCapabilityEntry;
    positionSlTp: TabdealCapabilityEntry;
  };
  unsupported: {
    historicalKlines: TabdealCapabilityEntry;
    fundingRateFeed: TabdealCapabilityEntry;
    privateWebsocketUserData: TabdealCapabilityEntry;
    testnetSandbox: TabdealCapabilityEntry;
  };
}

function entry(supported: boolean, verified: boolean, notes: string): TabdealCapabilityEntry {
  return { supported, verified, notes };
}

export function buildTabdealCapabilities(executionStage: TabdealExecutionStage = 'SHADOW'): TabdealCapabilities {
  return {
    version: TABDEAL_ADAPTER_VERSION,
    exchangeId: TABDEAL_EXCHANGE_ID,
    displayName: 'Tabdeal FAPI',
    autonomousLiveExecutionEnabled: false,
    automaticVenueFailoverEnabled: false,
    executionStage,
    publicMarketData: {
      ping: entry(true, true, 'GET /r/fapi/v1/ping documented by Tabdeal.'),
      exchangeInfo: entry(true, true, 'GET /r/fapi/v1/exchangeInfo documented by Tabdeal.'),
      orderBookDepth: entry(true, true, 'GET /r/fapi/v1/depth documented by Tabdeal.'),
      aggregatedDepth: entry(true, true, 'GET /r/fapi/v1/aggDepth documented with aggregationPrecision/limitRows.'),
      serverTime: entry(true, true, 'GET /r/fapi/v1/time documented by Tabdeal.'),
      publicDepthWebsocket: entry(true, true, 'wss://api1.tabdeal.org/special_margin/stream/ with special_margin@SYMBOL@depth@PERIOD.'),
      publicTradeWebsocket: entry(true, true, 'wss://api1.tabdeal.org/special_margin/broadcast/ with plain-text BASE_QUOTE subscription.'),
    },
    accountRead: {
      account: entry(true, true, 'GET /r/fapi/v3/account documented by Tabdeal.'),
      balance: entry(true, true, 'GET /r/fapi/v3/balance documented by Tabdeal.'),
      positionRisk: entry(true, true, 'GET /r/fapi/v3/positionRisk documented by Tabdeal.'),
      leverage: entry(true, true, 'GET /r/fapi/v1/leverage and POST /fapi/v1/leverage documented by Tabdeal.'),
      openOrders: entry(true, true, 'GET /r/fapi/v1/openOrders documented by Tabdeal.'),
      allOrders: entry(true, true, 'GET /r/fapi/v1/allOrders documented by Tabdeal.'),
      userTrades: entry(true, true, 'GET /r/fapi/v1/userTrades documented by Tabdeal.'),
      income: entry(true, true, 'GET /r/fapi/v1/income documented by Tabdeal.'),
      positionHistory: entry(true, true, 'GET /r/fapi/v1/position documented by Tabdeal.'),
    },
    execution: {
      marketOrders: entry(true, true, 'POST /fapi/v1/order supports MARKET.'),
      limitOrders: entry(true, true, 'POST /fapi/v1/order supports LIMIT.'),
      reduceOnly: entry(false, false, 'APEX policy: reduceOnly is not relied on for Tabdeal; use the dedicated close-position endpoint.'),
      closePosition: entry(true, true, 'DELETE /fapi/v1/position closes the full open position for a symbol.'),
      positionSlTp: entry(true, true, 'POST /fapi/v1/positionSlTp documented; positionId is mandatory.'),
    },
    unsupported: {
      historicalKlines: entry(false, false, 'No FAPI historical-kline endpoint documented in the current official FAPI section.'),
      fundingRateFeed: entry(false, false, 'No FAPI funding-rate endpoint documented in the current official FAPI section.'),
      privateWebsocketUserData: entry(false, false, 'No private FAPI user-data websocket documented; reconciliation stays REST-based.'),
      testnetSandbox: entry(false, false, 'No official FAPI testnet/sandbox documented.'),
    },
  };
}

export function deriveConnectionStatus(
  capabilities: TabdealCapabilities,
  signal: { credentialsPresent: boolean; lastPublicPingOk: boolean | null; lastAccountReadOk: boolean | null },
): TabdealConnectionStatus {
  if (!signal.credentialsPresent) return 'DISCONNECTED';
  if (signal.lastPublicPingOk === false || signal.lastAccountReadOk === false) return 'DEGRADED';
  if (capabilities.executionStage === 'LIVE_DISABLED') return 'LIVE_DISABLED';
  if (capabilities.executionStage === 'PAPER') return 'PAPER_READY';
  if (capabilities.executionStage === 'READ_ONLY') return 'READ_ONLY';
  return signal.lastAccountReadOk ? 'CONNECTED' : 'DISCONNECTED';
}

export function requireVerified(entryValue: TabdealCapabilityEntry, label: string): void {
  if (!entryValue.supported) throw new Error(`tabdeal_capability_unsupported: ${label} — ${entryValue.notes}`);
  if (!entryValue.verified) throw new Error(`tabdeal_capability_unverified: ${label} — ${entryValue.notes}`);
}
