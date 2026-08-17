import { describe, expect, it } from 'vitest';
import {
  assertMutationAllowed,
  assertPrivateReadAllowed,
  assertSafeOutboundUrlShape,
  buildSecurityHeaders,
  hostMatchesAllowlist,
  isBlockedIpLiteral,
  isComputeHeavyRoute,
  isPrivateReadRoute,
  MutationRateLimiter,
  resolveDeploymentProfile,
} from '../services/serverSecurity';

describe('server outbound URL safety', () => {
  it('blocks loopback, mapped IPv4, link-local, private and multicast literals', () => {
    for (const address of [
      '127.0.0.1',
      '::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '0:0:0:0:0:0:0:1',
      '64:ff9b::127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.1.1',
      'fc00::1',
      'fd12::1',
      'fe80::1%eth0',
      'ff02::1',
      '100::1',
      '2001:db8::1',
      '2002:7f00:1::',
      '198.18.0.1',
      '198.51.100.42',
      '203.0.113.9',
    ]) expect(isBlockedIpLiteral(address)).toBe(true);
  });

  it('accepts public IP literals and normalizes allowlist host syntax', () => {
    expect(isBlockedIpLiteral('8.8.8.8')).toBe(false);
    expect(isBlockedIpLiteral('192.0.8.1')).toBe(false);
    expect(isBlockedIpLiteral('198.51.99.42')).toBe(false);
    expect(isBlockedIpLiteral('2606:4700:4700::1111')).toBe(false);
    expect(hostMatchesAllowlist('[::1]', ['::1'])).toBe(true);
    expect(hostMatchesAllowlist('EXAMPLE.COM.', ['example.com'])).toBe(true);
  });

  it('rejects credentials, unsupported protocols and private literals before DNS', () => {
    expect(assertSafeOutboundUrlShape('ftp://example.com').reason).toBe('protocol_not_allowed');
    expect(assertSafeOutboundUrlShape('https://user:pass@example.com').reason).toBe('credentials_in_url');
    expect(assertSafeOutboundUrlShape('http://[::ffff:127.0.0.1]/').reason).toBe('blocked_ip');
    expect(assertSafeOutboundUrlShape('http://[::ffff:7f00:1]/').reason).toBe('blocked_ip');
  });
});

describe('security response headers', () => {
  it('sets baseline hardening headers', () => {
    const headers = buildSecurityHeaders('/api/market/backtest');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
  });

  it('locks API routes down and keeps SPA assets same-origin', () => {
    expect(buildSecurityHeaders('/api/account/portfolio', { dev: false })['Content-Security-Policy'])
      .toBe("default-src 'none'; frame-ancestors 'none'");
    const csp = buildSecurityHeaders('/trading', { dev: false })['Content-Security-Policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('http://');
    expect(csp).not.toContain('https://');
  });

  it('never allows inline scripts or websockets in production', () => {
    const csp = buildSecurityHeaders('/trading', { dev: false })['Content-Security-Policy'];
    const scriptDirective = csp.split(';').map((directive) => directive.trim()).find((directive) => directive.startsWith('script-src'));
    expect(scriptDirective).toBe("script-src 'self'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('ws:');
    expect(csp).not.toContain('wss:');
  });

  it('relaxes only inline scripts and websockets for the dev middleware server', () => {
    const csp = buildSecurityHeaders('/trading', { dev: true })['Content-Security-Policy'];
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    // The dev relaxation must not widen anything else.
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('http://');
    expect(csp).not.toContain('https://');
  });

  it('keeps the API policy locked down even in dev', () => {
    expect(buildSecurityHeaders('/api/account/portfolio', { dev: true })['Content-Security-Policy'])
      .toBe("default-src 'none'; frame-ancestors 'none'");
  });
});

describe('deployment profile resolution (GAP EXE-05)', () => {
  it('defaults to local for unset/unrecognized values, preserving prior behavior', () => {
    expect(resolveDeploymentProfile(undefined)).toBe('local');
    expect(resolveDeploymentProfile('')).toBe('local');
    expect(resolveDeploymentProfile('nonsense')).toBe('local');
  });

  it('recognizes lan and production aliases', () => {
    expect(resolveDeploymentProfile('lan')).toBe('lan');
    expect(resolveDeploymentProfile('trusted-lan')).toBe('lan');
    expect(resolveDeploymentProfile('production')).toBe('production');
    expect(resolveDeploymentProfile('PROD')).toBe('production');
  });
});

describe('mutation auth under deployment profiles (GAP EXE-05)', () => {
  const baseLoopback = {
    method: 'POST',
    path: '/api/orders',
    origin: null,
    referer: null,
    operatorTokenHeader: null,
    csrfHeader: null,
    remoteAddress: '127.0.0.1',
    configuredOperatorToken: '',
    allowedOrigins: [],
  };

  it('local profile with no token configured behaves exactly as before (loopback allowed)', () => {
    const result = assertMutationAllowed({ ...baseLoopback, deploymentProfile: 'local' });
    expect(result.ok).toBe(true);
  });

  it('production profile fails closed (503) when no operator token is configured, even from loopback', () => {
    const result = assertMutationAllowed({ ...baseLoopback, deploymentProfile: 'production' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.error).toBe('operator_token_not_configured_for_production');
  });

  it('production profile fails closed (403) over plaintext even with a correct operator token', () => {
    const result = assertMutationAllowed({
      ...baseLoopback,
      deploymentProfile: 'production',
      configuredOperatorToken: 'secret-token',
      operatorTokenHeader: 'secret-token',
      requestIsSecure: false,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe('tls_required_in_production');
  });

  it('production profile succeeds with a matching token over TLS', () => {
    const result = assertMutationAllowed({
      ...baseLoopback,
      deploymentProfile: 'production',
      configuredOperatorToken: 'secret-token',
      operatorTokenHeader: 'secret-token',
      requestIsSecure: true,
    });
    expect(result.ok).toBe(true);
  });

  it('production profile still rejects a wrong token over TLS', () => {
    const result = assertMutationAllowed({
      ...baseLoopback,
      deploymentProfile: 'production',
      configuredOperatorToken: 'secret-token',
      operatorTokenHeader: 'wrong',
      requestIsSecure: true,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe('operator_token_required');
  });
});

describe('private read plane classification', () => {
  it('classifies every private account/execution/decision-memory/operations read', () => {
    // Real paths taken from the current route table, not invented examples.
    for (const pathname of [
      '/api/account/connection',
      '/api/account/portfolio',
      '/api/account/workspace',
      '/api/execution/readiness',
      '/api/execution/validation/readiness',
      '/api/execution/validation/history',
      '/api/execution/testnet/account',
      '/api/execution/testnet/orders',
      '/api/decision-memory',
      '/api/decision-memory/status',
      '/api/decision-memory/export',
      '/api/operations/status',
      '/api/operations/trading-modules',
      '/api/operations/adaptive-thresholds',
      '/api/operations/adaptive-thresholds/fast-shadow',
      '/api/operations/market-streaming',
      '/api/operations/liquidity-hunter',
      '/api/operations/market-statistics',
      '/api/operations/ml-governance',
    ]) expect(isPrivateReadRoute(pathname)).toBe(true);
  });

  it('leaves the public market-data plane and the security bootstrap open', () => {
    for (const pathname of [
      '/api/market/top-volume',
      '/api/market/gainers-losers',
      '/api/market/correlation',
      '/api/market/sentiment',
      '/api/market/candidates',
      '/api/market/majors',
      '/api/market/symbol/BTC-USDT',
      '/api/market/backtest',
      '/api/binance/ticker',
      '/api/hf-space/health',
      '/api/supplemental/news',
      '/api/intelligence/feeds',
      '/api/system/health',
      '/api/readiness',
      '/api/icon/btc',
      '/api/strategies',
      // The discovery endpoint the UI reads to learn whether a token is
      // required. Guarding it behind that token would deadlock the Settings
      // security panel, so it must stay classified public.
      '/api/security/bootstrap',
    ]) expect(isPrivateReadRoute(pathname)).toBe(false);
  });

  it('keeps the family boundary on a path segment', () => {
    // A bare startsWith('/api/operations') would capture these.
    expect(isPrivateReadRoute('/api/operations-public')).toBe(false);
    expect(isPrivateReadRoute('/api/accounts-summary')).toBe(false);
    expect(isPrivateReadRoute('/api/decision-memory-lite')).toBe(false);
    // The bare family path itself is still private if it ever gets registered.
    expect(isPrivateReadRoute('/api/operations')).toBe(true);
  });
});

describe('private read auth', () => {
  const baseRead = {
    method: 'GET',
    origin: null,
    referer: null,
    operatorTokenHeader: null,
    remoteAddress: '127.0.0.1',
    configuredOperatorToken: '',
    allowedOrigins: ['http://127.0.0.1:3000'],
  };

  it('leaves mutating verbs to assertMutationAllowed instead of double-guarding them', () => {
    for (const method of ['POST', 'DELETE', 'PUT', 'PATCH']) {
      expect(assertPrivateReadAllowed({ ...baseRead, method, remoteAddress: '203.0.113.9', deploymentProfile: 'production' }).ok).toBe(true);
    }
  });

  it('lets the local UI read exactly as before: loopback, no Origin header, no token', () => {
    // Same-origin browser GETs send no Origin and Referrer-Policy: no-referrer
    // suppresses Referer, so this is what the real UI looks like on the wire.
    expect(assertPrivateReadAllowed({ ...baseRead, deploymentProfile: 'local' }).ok).toBe(true);
  });

  it('still lets the local UI read when the operator has configured a token', () => {
    // trustedLocalUi: a browser bundle cannot hold a shared secret, so outside
    // production a provably-local request stays exempt — same rule as mutations.
    const result = assertPrivateReadAllowed({
      ...baseRead,
      deploymentProfile: 'local',
      origin: 'http://127.0.0.1:3000',
      configuredOperatorToken: 'secret-token',
    });
    expect(result.ok).toBe(true);
  });

  it('closes the gap: an off-box reader cannot pull account state in the default profile', () => {
    const result = assertPrivateReadAllowed({ ...baseRead, remoteAddress: '192.168.1.50', deploymentProfile: 'local' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe('local_client_required');
  });

  it('rejects a cross-origin read outright', () => {
    const result = assertPrivateReadAllowed({ ...baseRead, origin: 'https://evil.example', deploymentProfile: 'local' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe('origin_not_allowed');
  });

  it('production fails closed (503) when no operator token is configured, even from loopback', () => {
    const result = assertPrivateReadAllowed({ ...baseRead, deploymentProfile: 'production' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.error).toBe('operator_token_not_configured_for_production');
  });

  it('production fails closed (403) over plaintext even with a correct token', () => {
    const result = assertPrivateReadAllowed({
      ...baseRead,
      deploymentProfile: 'production',
      configuredOperatorToken: 'secret-token',
      operatorTokenHeader: 'secret-token',
      requestIsSecure: false,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe('tls_required_in_production');
  });

  it('production requires the token even from loopback (no trustedLocalUi exemption)', () => {
    const result = assertPrivateReadAllowed({
      ...baseRead,
      deploymentProfile: 'production',
      configuredOperatorToken: 'secret-token',
      operatorTokenHeader: null,
      requestIsSecure: true,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe('operator_token_required');
  });

  it('production rejects a wrong token and accepts a matching one over TLS', () => {
    const wrong = assertPrivateReadAllowed({
      ...baseRead,
      deploymentProfile: 'production',
      configuredOperatorToken: 'secret-token',
      operatorTokenHeader: 'wrong',
      requestIsSecure: true,
    });
    expect(wrong.ok).toBe(false);
    expect(wrong.status).toBe(401);
    const right = assertPrivateReadAllowed({
      ...baseRead,
      deploymentProfile: 'production',
      configuredOperatorToken: 'secret-token',
      operatorTokenHeader: 'secret-token',
      requestIsSecure: true,
    });
    expect(right.ok).toBe(true);
  });

  it('lan requires the token from a non-loopback client once one is configured', () => {
    const withoutToken = assertPrivateReadAllowed({
      ...baseRead,
      remoteAddress: '192.168.1.50',
      deploymentProfile: 'lan',
      configuredOperatorToken: 'secret-token',
    });
    expect(withoutToken.ok).toBe(false);
    expect(withoutToken.status).toBe(401);
    const withToken = assertPrivateReadAllowed({
      ...baseRead,
      remoteAddress: '192.168.1.50',
      deploymentProfile: 'lan',
      configuredOperatorToken: 'secret-token',
      operatorTokenHeader: 'secret-token',
    });
    expect(withToken.ok).toBe(true);
  });

  it('lan without a configured token still defers to the operator allow-list', () => {
    // Inherited from assertMutationAllowed, not invented here: `lan` is an
    // explicit opt-in network exposure, so a tokenless lan deployment keeps the
    // historical trust model. Asserted so the behavior is documented rather
    // than accidental.
    expect(assertPrivateReadAllowed({ ...baseRead, remoteAddress: '192.168.1.50', deploymentProfile: 'lan' }).ok).toBe(true);
  });
});

describe('compute-heavy route limiting', () => {
  it('classifies replay and validation routes only', () => {
    expect(isComputeHeavyRoute('/api/market/backtest')).toBe(true);
    expect(isComputeHeavyRoute('/api/market/backtest/production-input')).toBe(true);
    expect(isComputeHeavyRoute('/api/strategies/momentum-v2/validate')).toBe(true);
    expect(isComputeHeavyRoute('/api/strategies/momentum-v2/optimize')).toBe(true);
    expect(isComputeHeavyRoute('/api/strategies/momentum-v2/fusion-preview')).toBe(true);
    expect(isComputeHeavyRoute('/api/strategies')).toBe(false);
    expect(isComputeHeavyRoute('/api/market/ticker')).toBe(false);
  });

  it('enforces independent bounded windows', () => {
    let now = 0;
    const limiter = new MutationRateLimiter(2, 1_000, () => now);
    expect(limiter.allow('ip|backtest')).toBe(true);
    expect(limiter.allow('ip|backtest')).toBe(true);
    expect(limiter.allow('ip|backtest')).toBe(false);
    expect(limiter.allow('ip|validate')).toBe(true);
    now = 1_001;
    expect(limiter.allow('ip|backtest')).toBe(true);
  });
});
