/** Browser-safe shared proxy configuration and address normalization. */
export type ProxyMode = 'auto' | 'manual' | 'off';
export interface ProxyConfig { mode: ProxyMode; type: 'socks5' | 'http'; address: string; }
export const DEFAULT_PROXY_CONFIG: ProxyConfig = { mode: 'auto', type: 'socks5', address: '' };

/** HTTP(S) CONNECT proxy URL for undici ProxyAgent. */
export function normalizeProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^socks5h?:\/\//i.test(trimmed)) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // host:port shorthand — e.g. 127.0.0.1:10808
  if (/^[\w.-]+:\d+$/.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

/** SOCKS5 proxy URL for socks-proxy-agent (NewsAPI and geo-blocked providers). */
export function normalizeSocksProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Use remote DNS for SOCKS5 by default. A locally-resolved socks5:// route
  // fails exactly like direct access when the host resolver cannot resolve (or
  // intentionally blocks) an exchange domain. socks5h:// sends the hostname to
  // the proxy and keeps TLS/SNI on the original host.
  if (/^socks5h:\/\//i.test(trimmed)) return trimmed;
  if (/^socks5?:\/\//i.test(trimmed)) return trimmed.replace(/^socks5?:/i, 'socks5h:');
  if (/^[\w.-]+:\d+$/.test(trimmed)) return `socks5h://${trimmed}`;
  return trimmed;
}


export function normalizeProxyConfig(value: unknown): ProxyConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid proxy configuration.');
  const input = value as Record<string, unknown>;
  const mode = input.mode === 'direct_only' ? 'off' : input.mode;
  if (mode !== 'auto' && mode !== 'manual' && mode !== 'off') throw new Error('Choose Auto, Manual, or Off.');
  if (input.type !== 'socks5' && input.type !== 'http') throw new Error('Choose SOCKS5 or HTTP(S).');
  if (typeof input.address !== 'string' || input.address.length > 2048) throw new Error('Enter a valid proxy address.');
  let address = input.address.trim();
  if (!address && mode === 'manual') throw new Error('Manual mode requires a proxy address.');
  if (address) {
    address = input.type === 'socks5' ? normalizeSocksProxyUrl(address) : normalizeProxyUrl(address);
    let url: URL;
    try { url = new URL(address); } catch { throw new Error('Use host:port or a proxy URL.'); }
    const protocols = input.type === 'socks5' ? ['socks5:', 'socks5h:'] : ['http:', 'https:'];
    if (!protocols.includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/') || (!url.port && !['http:', 'https:'].includes(url.protocol)) || (url.port && (Number(url.port) < 1 || Number(url.port) > 65535))) {
      throw new Error('Use a proxy host and port without credentials, paths, or query parameters.');
    }
    address = `${url.protocol}//${url.host}`;
  }
  return { mode, type: input.type, address };
}
