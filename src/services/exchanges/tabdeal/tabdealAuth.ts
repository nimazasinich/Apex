import crypto from 'node:crypto';

export interface TabdealCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface BuildSignedRequestOptions {
  nowMs?: number;
  recvWindowMs?: number;
}

type Params = Record<string, string | number | boolean | null | undefined>;

function encodeParams(params: Params): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

export function buildPublicRequest(params: Params = {}): { queryString: string; headers: Record<string, string> } {
  return { queryString: encodeParams(params), headers: {} };
}

export function buildSignedRequest(
  params: Params,
  credentials: TabdealCredentials,
  options: BuildSignedRequestOptions = {},
): { queryString: string; headers: Record<string, string> } {
  const timestamp = Math.floor(options.nowMs ?? Date.now());
  const withAuth: Params = {
    ...params,
    ...(options.recvWindowMs ? { recvWindow: Math.floor(options.recvWindowMs) } : {}),
    timestamp,
  };
  const unsigned = encodeParams(withAuth);
  const signature = crypto.createHmac('sha256', credentials.apiSecret).update(unsigned).digest('hex');
  return {
    queryString: `${unsigned}&signature=${signature}`,
    headers: { 'X-MBX-APIKEY': credentials.apiKey },
  };
}
