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
 */

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
  private readonly maxEntries: number;

  constructor(options: IconProxyOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 4_000;
    this.maxBytes = options.maxBytes ?? 262_144;
    this.hitTtlMs = options.hitTtlMs ?? 24 * 60 * 60 * 1000;
    this.missTtlMs = options.missTtlMs ?? 10 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 512;
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
    for (const url of buildIconUpstreamUrls(asset)) {
      const fetched = await this.tryFetch(url);
      if (fetched) {
        this.store(asset, {
          status: 'hit',
          contentType: fetched.contentType,
          body: fetched.body,
          expiresAt: this.now() + this.hitTtlMs,
        });
        return { ok: true, status: 200, contentType: fetched.contentType, body: fetched.body, cached: false };
      }
    }
    this.store(asset, { status: 'miss', expiresAt: this.now() + this.missTtlMs });
    return { ok: false, status: 404, cached: false };
  }

  private async tryFetch(url: string): Promise<{ contentType: string; body: Buffer } | null> {
    try {
      const res = await this.fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'image/*' },
      });
      if (!res.ok) return null;
      const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!contentType.startsWith('image/')) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > this.maxBytes) return null;
      return { contentType, body: buffer };
    } catch {
      return null;
    }
  }
}

export const iconProxy = new IconProxy();
