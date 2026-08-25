/**
 * Server-side crypto-icon proxy.
 *
 * The terminal renders coin icons from a small set of public CDNs. Fetching
 * those CDNs directly from the browser violates the page CSP (`img-src 'self'
 * data:`) and leaks the visited-symbol list to third parties via the image
 * request. This module fetches the bytes server-side from a *closed* host
 * allowlist and lets the server hand them back same-origin, so the strict
 * production CSP is preserved and no per-symbol request reaches a CDN from the
 * user's browser.
 *
 * The only caller-supplied value is the asset symbol, constrained by
 * ICON_ASSET_PATTERN and interpolated into fixed URL templates whose hosts are
 * pinned to ICON_UPSTREAM_HOSTS. There is therefore no attacker-controlled URL
 * and no SSRF surface: the fetch target set is finite and fully known at build
 * time. Node-only (uses global fetch / Buffer); imported by server.ts.
 *
 * Scope note: this is the LONG-TAIL fallback, not the primary path. Artwork for
 * the top 300 assets ships in `public/crypto-icons/` and is served from disk by
 * `localIconAssets.ts` ahead of this module, so a normal render never gets here.
 * Egress therefore only happens for symbols outside that set.
 *
 * Egress on the Windows target is partly filtered: cdn.jsdelivr.net answers
 * directly, but assets.coincap.io and static.coinstats.app both time out and are
 * only reachable through the local HTTP CONNECT tunnel. Each upstream is
 * therefore attempted directly first and retried through the proxy only when the
 * direct attempt fails at the transport layer — jsdelivr keeps its fast direct
 * path and never pays for the tunnel, while the other two stop being dead ends.
 */

import { createRequire } from 'node:module';

/** Same seam proxyFetch.ts uses: resolve optional deps without a static import. */
const optionalRequire = createRequire(`${process.cwd()}/package.json`);

export const ICON_ASSET_PATTERN = /^[a-z0-9-]{1,40}$/;

export const ICON_UPSTREAM_HOSTS = [
  'cdn.jsdelivr.net',
  'assets.coincap.io',
  'static.coinstats.app',
] as const;

export function isValidIconAsset(asset: string): boolean {
  return ICON_ASSET_PATTERN.test(asset);
}

/**
 * Fixed upstream templates, tried in order until one yields an image. Hosts
 * must all be members of ICON_UPSTREAM_HOSTS (asserted by buildIconUpstreamUrls).
 */
export function buildIconUpstreamUrls(asset: string): string[] {
  if (!isValidIconAsset(asset)) return [];
  const urls = [
    `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${asset}.svg`,
    `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${asset}.png`,
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${asset}.png`,
    `https://assets.coincap.io/assets/icons/${asset}@2x.png`,
    `https://static.coinstats.app/coins/${asset}.png`,
  ];
  // Defence in depth: never emit a URL whose host drifts off the allowlist,
  // even if a future edit fat-fingers a template.
  return urls.filter((raw) => {
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' && (ICON_UPSTREAM_HOSTS as readonly string[]).includes(url.hostname);
    } catch {
      return false;
    }
  });
}

/**
 * Lazily-built undici dispatcher for the local HTTP CONNECT tunnel.
 *
 * CONNECT only, on purpose. A SOCKS5 route cannot work here: `socks-proxy-agent`
 * returns a Node `http.Agent`, which is not an undici `Dispatcher`, so global
 * fetch rejects it with "agent.dispatch is not a function". The same local
 * endpoint speaks HTTP CONNECT, which undici's ProxyAgent does implement, so
 * that is the route this module uses.
 *
 * Env precedence mirrors `proxyFetch.ts` so both egress layers agree about where
 * the tunnel is: explicit config wins, otherwise the documented local default.
 * `PROXY_MODE=off` or `APEX_AUTO_LOCAL_PROXY=false` disables the auto-default.
 */
function resolveProxyConnectUrl(): string {
  const explicit = [
    process.env.APEX_LOCAL_PROXY,
    process.env.HTTPS_PROXY,
    process.env.HTTP_PROXY,
    process.env.ALL_PROXY,
  ]
    .map((raw) => (raw || '').trim())
    .find((raw) => raw.length > 0);

  if (explicit) {
    // A socks5:// value is not usable as a CONNECT route, but the local tunnels
    // this project targets expose both schemes on one port, so reuse host:port.
    const hostPort = explicit.replace(/^\w+:\/\//, '');
    if (/^socks5h?:\/\//i.test(explicit)) return hostPort ? `http://${hostPort}` : '';
    if (/^https?:\/\//i.test(explicit)) return explicit;
    return /^[\w.-]+:\d+$/.test(explicit) ? `http://${explicit}` : '';
  }

  if ((process.env.PROXY_MODE || 'auto').trim().toLowerCase() === 'off') return '';
  if (process.env.APEX_AUTO_LOCAL_PROXY === 'false') return '';
  const port = (process.env.APEX_AUTO_LOCAL_PROXY_PORT || '10808').trim();
  return /^\d+$/.test(port) ? `http://127.0.0.1:${port}` : '';
}

let cachedProxyDispatcher: unknown | undefined;

function loadProxyDispatcher(): unknown {
  if (cachedProxyDispatcher !== undefined) return cachedProxyDispatcher;
  cachedProxyDispatcher = null;
  const route = resolveProxyConnectUrl();
  if (route) {
    try {
      // Deliberately late and guarded: a missing tunnel or a missing undici must
      // degrade to direct-only, never take down icon serving.
      const undici = optionalRequire('undici') as { ProxyAgent?: new (url: string) => unknown };
      if (undici?.ProxyAgent) cachedProxyDispatcher = new undici.ProxyAgent(route);
    } catch {
      cachedProxyDispatcher = null;
    }
  }
  return cachedProxyDispatcher;
}

/** Why a single upstream attempt produced no image. */
type AttemptFailure =
  /** Upstream answered definitively (non-2xx, non-image, empty, oversized). */
  | 'declined'
  /** Never got an answer: DNS, connect, reset, or the abort timeout fired. */
  | 'transport';

type Attempt = { ok: true; contentType: string; body: Buffer } | { ok: false; failure: AttemptFailure };

export interface IconResult {
  ok: boolean;
  status: number;
  contentType?: string;
  body?: Buffer;
  cached: boolean;
}

interface CacheEntry {
  status: 'hit' | 'miss';
  contentType?: string;
  body?: Buffer;
  expiresAt: number;
}

export interface IconProxyOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  maxBytes?: number;
  hitTtlMs?: number;
  missTtlMs?: number;
  /**
   * TTL for a lookup that failed only at the transport layer. Deliberately much
   * shorter than missTtlMs: "every upstream refused to answer" is not evidence
   * that the icon does not exist, so caching it like a confirmed 404 blanks a
   * valid icon for ten minutes over a transient network fault.
   */
  transportFailTtlMs?: number;
  maxEntries?: number;
}

export class IconProxy {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<IconResult>>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly hitTtlMs: number;
  private readonly missTtlMs: number;
  private readonly transportFailTtlMs: number;
  private readonly maxEntries: number;
  /** Only the real global fetch accepts undici's non-standard dispatcher option. */
  private readonly canUseProxyDispatcher: boolean;

  constructor(options: IconProxyOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 4_000;
    this.maxBytes = options.maxBytes ?? 262_144;
    this.hitTtlMs = options.hitTtlMs ?? 24 * 60 * 60 * 1000;
    this.missTtlMs = options.missTtlMs ?? 10 * 60 * 1000;
    this.transportFailTtlMs = options.transportFailTtlMs ?? 30 * 1000;
    this.maxEntries = options.maxEntries ?? 512;
    this.canUseProxyDispatcher = options.fetchImpl === undefined;
  }

  async get(asset: string): Promise<IconResult> {
    if (!isValidIconAsset(asset)) {
      return { ok: false, status: 400, cached: false };
    }
    const cached = this.readCache(asset);
    if (cached) return cached;
    const existing = this.inFlight.get(asset);
    if (existing) return existing;
    const pending = this.resolve(asset).finally(() => this.inFlight.delete(asset));
    this.inFlight.set(asset, pending);
    return pending;
  }

  private readCache(asset: string): IconResult | null {
    const entry = this.cache.get(asset);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(asset);
      return null;
    }
    // Refresh LRU recency.
    this.cache.delete(asset);
    this.cache.set(asset, entry);
    if (entry.status === 'miss') return { ok: false, status: 404, cached: true };
    return { ok: true, status: 200, contentType: entry.contentType, body: entry.body, cached: true };
  }

  private store(asset: string, entry: CacheEntry): void {
    this.cache.set(asset, entry);
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private async resolve(asset: string): Promise<IconResult> {
    let sawTransportFailure = false;

    for (const url of buildIconUpstreamUrls(asset)) {
      let attempt = await this.tryFetch(url);

      // A transport failure means the upstream never answered, so retrying the
      // same URL through the tunnel is a genuinely different attempt rather than
      // a blind repeat. A 'declined' answer is final and is never retried.
      if (!attempt.ok && attempt.failure === 'transport' && this.canUseProxyDispatcher) {
        const dispatcher = loadProxyDispatcher();
        if (dispatcher) attempt = await this.tryFetch(url, dispatcher);
      }

      if (attempt.ok) {
        this.store(asset, {
          status: 'hit',
          contentType: attempt.contentType,
          body: attempt.body,
          expiresAt: this.now() + this.hitTtlMs,
        });
        return { ok: true, status: 200, contentType: attempt.contentType, body: attempt.body, cached: false };
      }
      if (attempt.failure === 'transport') sawTransportFailure = true;
    }

    // Only a clean sweep of definitive refusals earns the long negative TTL.
    const ttl = sawTransportFailure ? this.transportFailTtlMs : this.missTtlMs;
    this.store(asset, { status: 'miss', expiresAt: this.now() + ttl });
    return { ok: false, status: 404, cached: false };
  }

  private async tryFetch(url: string, dispatcher?: unknown): Promise<Attempt> {
    try {
      const init: RequestInit & { dispatcher?: unknown } = {
        redirect: 'follow',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'image/*' },
      };
      // Non-standard undici option; only set when actually tunnelling, so the
      // default direct path keeps byte-identical request options.
      if (dispatcher) init.dispatcher = dispatcher;

      const res = await this.fetchImpl(url, init);
      if (!res.ok) return { ok: false, failure: 'declined' };
      const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!contentType.startsWith('image/')) return { ok: false, failure: 'declined' };
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > this.maxBytes) {
        return { ok: false, failure: 'declined' };
      }
      return { ok: true, contentType, body: buffer };
    } catch {
      // Reaching here means no HTTP answer at all: connect refused/reset, DNS,
      // or the AbortSignal timeout. Distinct from an upstream saying "no".
      return { ok: false, failure: 'transport' };
    }
  }
}

export const iconProxy = new IconProxy();
