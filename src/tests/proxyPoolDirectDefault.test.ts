import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression cover for the clean-clone proxy default.
 *
 * `parseProxyPool()` used to auto-inject socks5://127.0.0.1:10808 and
 * http://127.0.0.1:10808 unless APEX_AUTO_LOCAL_PROXY was explicitly set to
 * 'false'. Smart routing now keeps the configured pool separate from lazy
 * loopback discovery and PROXY_MODE=auto is direct-first: a healthy direct
 * route returns before any proxy connection is attempted. Lazy loopback
 * discovery is only eligible after a retryable direct failure.
 *
 * The first case below is the one that would have caught that bug: with no
 * proxy configuration at all the pool must be empty, which makes 'direct' the
 * only attempt route.
 */

const PROXY_ENV_KEYS = [
  'PROXY_MODE',
  'PROXY_POOL_URLS',
  'APEX_LOCAL_PROXY',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'ALL_PROXY',
  'SOCKS5_PROXY',
  'SOCKS_PROXY_URL',
  'SOCKS_PROXY',
  'APEX_SOCKS_HTTP_FALLBACK',
  'APEX_LOCAL_PROXY_PORT',
  'LOCAL_PROXY_PORT',
  'APEX_AUTO_LOCAL_PROXY',
  'APEX_AUTO_LOCAL_PROXY_PORT',
  'APEX_AUTO_LOCAL_PROXY_SCHEME',
] as const;

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  saved.clear();
  for (const key of PROXY_ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const key of PROXY_ENV_KEYS) {
    const previous = saved.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
  vi.resetModules();
});

async function loadPoolInfo() {
  // PROXY_POOL is resolved at module load, so each case needs a fresh import.
  const module = await import('../services/proxyFetch');
  return module.getProxyPoolInfo();
}

describe('proxyFetch default proxy pool', () => {
  it('injects no proxy route when nothing is configured', async () => {
    const info = await loadPoolInfo();
    expect(info.poolSize).toBe(0);
    expect(info.mode).toBe('auto');
  });

  it('still injects both loopback schemes when explicitly opted in', async () => {
    process.env.APEX_AUTO_LOCAL_PROXY = 'true';
    const info = await loadPoolInfo();
    expect(info.poolSize).toBe(2);
  });

  it('honours the scheme selector on opt-in', async () => {
    process.env.APEX_AUTO_LOCAL_PROXY = 'true';
    process.env.APEX_AUTO_LOCAL_PROXY_SCHEME = 'socks5';
    const info = await loadPoolInfo();
    expect(info.poolSize).toBe(1);
  });

  it('does not treat the opt-in flag as a reason to ignore an explicit proxy', async () => {
    process.env.PROXY_POOL_URLS = 'http://127.0.0.1:3128';
    const info = await loadPoolInfo();
    expect(info.poolSize).toBe(1);
  });
});
