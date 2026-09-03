/** Low-level Tabdeal FAPI REST client. Trading policy belongs in the execution adapter. */
import { buildPublicRequest, buildSignedRequest, type TabdealCredentials } from './tabdealAuth';
import { buildTabdealCapabilities, requireVerified, type TabdealCapabilities } from './tabdealCapabilities';

export const TABDEAL_FAPI_READ_BASE_URL = 'https://api1.tabdeal.org/r/fapi';
export const TABDEAL_FAPI_WRITE_BASE_URL = 'https://api1.tabdeal.org/fapi';
export type TabdealHttpMethod = 'GET' | 'POST' | 'DELETE' | 'PUT';
export type TabdealRequestChannel = 'READ' | 'WRITE';

export interface TabdealHttpRequest {
  method: TabdealHttpMethod;
  path: string;
  queryString: string;
  headers: Record<string, string>;
  channel: TabdealRequestChannel;
}
export interface TabdealHttpResponse { status: number; body: unknown; }
export interface TabdealHttpTransport { send(request: TabdealHttpRequest): Promise<TabdealHttpResponse>; }

export class TabdealApiError extends Error {
  readonly code: number | null;
  readonly status: number;
  readonly raw: unknown;
  constructor(message: string, status: number, code: number | null, raw: unknown) {
    super(message); this.name = 'TabdealApiError'; this.status = status; this.code = code; this.raw = raw;
  }
}

export class FetchTabdealHttpTransport implements TabdealHttpTransport {
  async send(request: TabdealHttpRequest): Promise<TabdealHttpResponse> {
    const base = request.channel === 'WRITE' ? TABDEAL_FAPI_WRITE_BASE_URL : TABDEAL_FAPI_READ_BASE_URL;
    const url = `${base}${request.path}${request.queryString ? `?${request.queryString}` : ''}`;
    const response = await fetch(url, { method: request.method, headers: request.headers });
    let body: unknown = null;
    try { body = await response.json(); } catch { body = null; }
    return { status: response.status, body };
  }
}

export interface TabdealFapiClientOptions {
  transport?: TabdealHttpTransport;
  credentials?: TabdealCredentials;
  capabilities?: TabdealCapabilities;
  recvWindowMs?: number;
}

function isErrorBody(body: unknown): body is { code: number; msg: string } {
  return Boolean(body) && typeof body === 'object' && 'code' in (body as Record<string, unknown>) && 'msg' in (body as Record<string, unknown>);
}

export class TabdealFapiClient {
  private readonly transport: TabdealHttpTransport;
  private readonly credentials: TabdealCredentials | null;
  private readonly capabilities: TabdealCapabilities;
  private readonly recvWindowMs: number;

  constructor(options: TabdealFapiClientOptions = {}) {
    this.transport = options.transport ?? new FetchTabdealHttpTransport();
    this.credentials = options.credentials ?? null;
    this.capabilities = options.capabilities ?? buildTabdealCapabilities('SHADOW');
    this.recvWindowMs = options.recvWindowMs ?? 10_000;
  }

  private requireCredentials(): TabdealCredentials {
    if (!this.credentials) throw new Error('tabdeal_missing_credentials');
    return this.credentials;
  }
  private async execute(request: TabdealHttpRequest): Promise<unknown> {
    const response = await this.transport.send(request);
    if (isErrorBody(response.body)) throw new TabdealApiError(response.body.msg || 'tabdeal_api_error', response.status, response.body.code, response.body);
    if (response.status < 200 || response.status >= 300) throw new TabdealApiError(`tabdeal_http_${response.status}`, response.status, null, response.body);
    return response.body;
  }
  private async runPublic(path: string, params: Record<string, string | number | boolean | null | undefined> = {}): Promise<unknown> {
    const { queryString, headers } = buildPublicRequest(params);
    return this.execute({ method: 'GET', path, queryString, headers, channel: 'READ' });
  }
  private async runSigned(method: TabdealHttpMethod, channel: TabdealRequestChannel, path: string, params: Record<string, string | number | boolean | null | undefined> = {}): Promise<unknown> {
    const { queryString, headers } = buildSignedRequest(params, this.requireCredentials(), { recvWindowMs: this.recvWindowMs });
    return this.execute({ method, channel, path, queryString, headers });
  }

  async ping(): Promise<unknown> { requireVerified(this.capabilities.publicMarketData.ping, 'ping'); return this.runPublic('/v1/ping'); }
  async serverTime(): Promise<unknown> { requireVerified(this.capabilities.publicMarketData.serverTime, 'serverTime'); return this.runPublic('/v1/time'); }
  async exchangeInfo(params: { symbol?: string; symbols?: string } = {}): Promise<unknown> { requireVerified(this.capabilities.publicMarketData.exchangeInfo, 'exchangeInfo'); return this.runPublic('/v1/exchangeInfo', params); }
  async depth(params: { symbol: string; limit?: number }): Promise<unknown> { requireVerified(this.capabilities.publicMarketData.orderBookDepth, 'depth'); return this.runPublic('/v1/depth', params); }
  async aggDepth(params: { symbol: string; aggregationPrecision: number; limitRows?: number }): Promise<unknown> { requireVerified(this.capabilities.publicMarketData.aggregatedDepth, 'aggDepth'); return this.runPublic('/v1/aggDepth', params); }

  async account(): Promise<unknown> { requireVerified(this.capabilities.accountRead.account, 'account'); return this.runSigned('GET', 'READ', '/v3/account'); }
  async balance(): Promise<unknown> { requireVerified(this.capabilities.accountRead.balance, 'balance'); return this.runSigned('GET', 'READ', '/v3/balance'); }
  async positionRisk(params: { symbol?: string } = {}): Promise<unknown> { requireVerified(this.capabilities.accountRead.positionRisk, 'positionRisk'); return this.runSigned('GET', 'READ', '/v3/positionRisk', params); }
  async getLeverage(params: { symbol: string }): Promise<unknown> { requireVerified(this.capabilities.accountRead.leverage, 'leverage(read)'); return this.runSigned('GET', 'READ', '/v1/leverage', params); }
  async setLeverage(params: { symbol: string; leverage: number }): Promise<unknown> { requireVerified(this.capabilities.accountRead.leverage, 'leverage(write)'); return this.runSigned('POST', 'WRITE', '/v1/leverage', params); }
  async openOrders(params: { symbol?: string; limit?: number } = {}): Promise<unknown> { requireVerified(this.capabilities.accountRead.openOrders, 'openOrders'); return this.runSigned('GET', 'READ', '/v1/openOrders', params); }
  async allOrders(params: { symbol: string; startTime?: number; endTime?: number; limit?: number }): Promise<unknown> { requireVerified(this.capabilities.accountRead.allOrders, 'allOrders'); return this.runSigned('GET', 'READ', '/v1/allOrders', params); }
  async userTrades(params: { symbol: string; startTime?: number; endTime?: number; limit?: number }): Promise<unknown> { requireVerified(this.capabilities.accountRead.userTrades, 'userTrades'); return this.runSigned('GET', 'READ', '/v1/userTrades', params); }
  async income(params: { symbol?: string; incomeType?: string; startTime?: number; endTime?: number; limit?: number } = {}): Promise<unknown> { requireVerified(this.capabilities.accountRead.income, 'income'); return this.runSigned('GET', 'READ', '/v1/income', params); }
  async positionHistory(params: { symbol?: string; isActive?: 0 | 1; startTime?: number; endTime?: number; limit?: number } = {}): Promise<unknown> {
    requireVerified(this.capabilities.accountRead.positionHistory, 'positionHistory');
    const { isActive, ...rest } = params;
    return this.runSigned('GET', 'READ', '/v1/position', { ...rest, is_active: isActive });
  }
  async getOrder(params: { symbol: string; orderId?: number; origClientOrderId?: string }): Promise<unknown> { requireVerified(this.capabilities.accountRead.openOrders, 'getOrder'); return this.runSigned('GET', 'READ', '/v1/order', params); }

  /** Raw venue-write methods. Production code must only reach these through an explicitly promoted manual live adapter. */
  async submitOrder(params: { symbol: string; side: 'BUY' | 'SELL'; type: 'MARKET' | 'LIMIT'; quantity: string; price?: string; timeInForce?: 'GTC' | 'IOC' | 'FOK'; newClientOrderId: string }): Promise<unknown> {
    requireVerified(params.type === 'MARKET' ? this.capabilities.execution.marketOrders : this.capabilities.execution.limitOrders, `submitOrder(${params.type})`);
    if ('reduceOnly' in params) throw new Error('tabdeal_reduce_only_unsupported');
    return this.runSigned('POST', 'WRITE', '/v1/order', params);
  }
  async cancelOrder(params: { symbol: string; orderId?: number; origClientOrderId?: string }): Promise<unknown> { return this.runSigned('DELETE', 'WRITE', '/v1/order', params); }
  async closePosition(params: { symbol: string }): Promise<unknown> { requireVerified(this.capabilities.execution.closePosition, 'closePosition'); return this.runSigned('DELETE', 'WRITE', '/v1/position', params); }
  async setPositionSlTp(params: { positionId: number; symbol?: string; slPrice?: string; tpPrice?: string; workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE' }): Promise<unknown> {
    requireVerified(this.capabilities.execution.positionSlTp, 'setPositionSlTp');
    if (!params.slPrice && !params.tpPrice) throw new Error('tabdeal_position_sltp_requires_sl_or_tp');
    return this.runSigned('POST', 'WRITE', '/v1/positionSlTp', params);
  }
}
